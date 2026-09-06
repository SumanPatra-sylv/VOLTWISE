"""
Device Adapter — Abstract base + Tuya + Virtual implementations.

Every appliance goes through the same pipeline.
The adapter factory checks smart_plug_id:
  - Non-null → TuyaAdapter (hardware control)
  - Null     → VirtualAdapter (DB-only, same logging)

Tuya integration uses a LAN-first approach (tinytuya) with cloud fallback
(tuya-connector-python) for Wipro 16A and other Tuya-based smart plugs.
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
import logging
import asyncio

from app.database import get_supabase
from app.config import get_settings

logger = logging.getLogger("voltwise.adapters")


# ══════════════════════════════════════════════════════════════════════
#  Data Types
# ══════════════════════════════════════════════════════════════════════

@dataclass
class ControlResult:
    success: bool
    source: str          # "tuya" | "virtual"
    message: str = ""
    response_time_ms: int = 0


@dataclass
class PowerReading:
    """Real-time power data from a smart plug."""
    is_on: bool = False
    power_w: float = 0.0
    voltage: float = 0.0
    current_ma: float = 0.0
    energy_kwh: float = 0.0
    source: str = "unknown"   # "lan" | "cloud" | "cached"
    timestamp: str = ""


# ══════════════════════════════════════════════════════════════════════
#  Abstract Base
# ══════════════════════════════════════════════════════════════════════

class DeviceAdapter(ABC):
    """Abstract adapter — every concrete adapter implements these."""

    @abstractmethod
    async def turn_on(self, appliance_id: str) -> ControlResult:
        ...

    @abstractmethod
    async def turn_off(self, appliance_id: str) -> ControlResult:
        ...

    @abstractmethod
    async def set_eco_mode(self, appliance_id: str, enabled: bool) -> ControlResult:
        ...


# ══════════════════════════════════════════════════════════════════════
#  Virtual Adapter (no hardware)
# ══════════════════════════════════════════════════════════════════════

class VirtualAdapter(DeviceAdapter):
    """
    For appliances WITHOUT smart plugs.
    Updates DB status, logs everything — identical pipeline, no hardware call.
    """

    async def turn_on(self, appliance_id: str) -> ControlResult:
        db = get_supabase()
        db.table("appliances").update({
            "status": "ON",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", appliance_id).execute()
        logger.info(f"[Virtual] Turned ON appliance {appliance_id}")
        return ControlResult(success=True, source="virtual", message="Status set to ON")

    async def turn_off(self, appliance_id: str) -> ControlResult:
        db = get_supabase()
        db.table("appliances").update({
            "status": "OFF",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", appliance_id).execute()
        logger.info(f"[Virtual] Turned OFF appliance {appliance_id}")
        return ControlResult(success=True, source="virtual", message="Status set to OFF")

    async def set_eco_mode(self, appliance_id: str, enabled: bool) -> ControlResult:
        db = get_supabase()
        db.table("appliances").update({
            "eco_mode_enabled": enabled,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", appliance_id).execute()
        logger.info(f"[Virtual] Eco mode {'ON' if enabled else 'OFF'} for {appliance_id}")
        return ControlResult(success=True, source="virtual", message=f"Eco mode {'enabled' if enabled else 'disabled'}")


# ══════════════════════════════════════════════════════════════════════
#  Tuya Device Manager (singleton)
# ══════════════════════════════════════════════════════════════════════

class TuyaDeviceManager:
    """
    Manages Tuya device connections. Handles:
    - LAN discovery (tinytuya scanner)
    - Cloud API fallback (tuya-connector)
    - Connection caching for fast repeat access
    """

    _instance: Optional["TuyaDeviceManager"] = None
    _cloud_api = None
    _device_cache: dict[str, dict] = {}  # device_id → {ip, local_key, version}

    @classmethod
    def get_instance(cls) -> "TuyaDeviceManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self._settings = get_settings()
        self._cloud_initialized = False

    def _init_cloud(self):
        """Lazy-init cloud API connection."""
        if self._cloud_initialized:
            return
        if not self._settings.tuya_access_id or not self._settings.tuya_access_secret:
            logger.warning("[TuyaManager] No Tuya credentials configured — cloud API disabled")
            self._cloud_initialized = True
            return
        try:
            from tuya_connector import TuyaOpenAPI
            self._cloud_api = TuyaOpenAPI(
                self._settings.tuya_api_endpoint,
                self._settings.tuya_access_id,
                self._settings.tuya_access_secret,
            )
            self._cloud_api.connect()
            self._cloud_initialized = True
            logger.info("[TuyaManager] Cloud API connected successfully")
        except Exception as e:
            logger.error(f"[TuyaManager] Cloud API init failed: {e}")
            self._cloud_initialized = True

    def _get_device_info(self, device_id: str) -> dict:
        """Get device connection info (IP, local_key) from cache or DB."""
        if device_id in self._device_cache:
            return self._device_cache[device_id]

        # Fetch from DB
        db = get_supabase()
        result = db.table("smart_plugs").select(
            "tuya_device_id, ip_address, local_key, firmware_version"
        ).eq("tuya_device_id", device_id).limit(1).execute()

        if result.data:
            info = {
                "ip": result.data[0].get("ip_address"),
                "local_key": result.data[0].get("local_key", ""),
                "version": 3.3,  # Wipro 16A uses protocol 3.3
            }
            self._device_cache[device_id] = info
            return info

        return {"ip": None, "local_key": "", "version": 3.3}

    async def send_command(self, device_id: str, switch_on: bool) -> tuple[bool, str]:
        """
        Send on/off command to a Tuya device.
        Strategy: LAN first → Cloud fallback.

        Returns: (success, source) where source is "lan" or "cloud".
        """
        # ── Try LAN first ──
        info = self._get_device_info(device_id)
        if info.get("local_key"):
            try:
                success = await self._lan_command(device_id, info, switch_on)
                if success:
                    return True, "lan"
            except Exception as e:
                logger.warning(f"[TuyaManager] LAN command failed for {device_id}: {e}")

        # ── Fall back to Cloud ──
        self._init_cloud()
        if self._cloud_api:
            try:
                success = await self._cloud_command(device_id, switch_on)
                if success:
                    return True, "cloud"
            except Exception as e:
                logger.error(f"[TuyaManager] Cloud command also failed for {device_id}: {e}")

        return False, "none"

    async def read_status(self, device_id: str) -> PowerReading:
        """
        Read real-time power data from a Tuya smart plug.
        Strategy: LAN first → Cloud fallback.

        Wipro 16A DP codes:
          DP 1:  switch_1 (bool)
          DP 17: add_ele — cumulative energy (kWh × 100)
          DP 18: cur_current (mA)
          DP 19: cur_power (W × 10)
          DP 20: cur_voltage (V × 10)
        """
        info = self._get_device_info(device_id)
        now = datetime.now(timezone.utc).isoformat()

        # ── Try LAN ──
        if info.get("local_key"):
            try:
                reading = await self._lan_read(device_id, info)
                reading.timestamp = now
                reading.source = "lan"
                return reading
            except Exception as e:
                logger.warning(f"[TuyaManager] LAN read failed for {device_id}: {e}")

        # ── Fall back to Cloud ──
        self._init_cloud()
        if self._cloud_api:
            try:
                reading = await self._cloud_read(device_id)
                reading.timestamp = now
                reading.source = "cloud"
                return reading
            except Exception as e:
                logger.error(f"[TuyaManager] Cloud read also failed for {device_id}: {e}")

        return PowerReading(timestamp=now, source="unavailable")

    async def _lan_command(self, device_id: str, info: dict, switch_on: bool) -> bool:
        """Send command via LAN using tinytuya."""
        import tinytuya

        def _do():
            d = tinytuya.OutletDevice(device_id, info.get("ip", "Auto"), info["local_key"])
            d.set_version(info.get("version", 3.3))
            d.set_socketTimeout(3)
            if switch_on:
                result = d.turn_on()
            else:
                result = d.turn_off()
            if isinstance(result, dict) and result.get("Error"):
                raise RuntimeError(result["Error"])
            return True

        return await asyncio.to_thread(_do)

    async def _cloud_command(self, device_id: str, switch_on: bool) -> bool:
        """Send command via Tuya Cloud API."""
        def _do():
            response = self._cloud_api.post(
                f"/v1.0/iot-03/devices/{device_id}/commands",
                {"commands": [{"code": "switch_1", "value": switch_on}]},
            )
            return response.get("success", False)

        return await asyncio.to_thread(_do)

    async def _lan_read(self, device_id: str, info: dict) -> PowerReading:
        """Read status via LAN using tinytuya."""
        import tinytuya

        def _do():
            d = tinytuya.OutletDevice(device_id, info.get("ip", "Auto"), info["local_key"])
            d.set_version(info.get("version", 3.3))
            d.set_socketTimeout(3)
            status = d.status()
            if isinstance(status, dict) and status.get("Error"):
                raise RuntimeError(status["Error"])
            dps = status.get("dps", {})
            return PowerReading(
                is_on=bool(dps.get("1", False)),
                power_w=float(dps.get("19", 0)) / 10.0,
                voltage=float(dps.get("20", 0)) / 10.0,
                current_ma=float(dps.get("18", 0)),
                energy_kwh=float(dps.get("17", 0)) / 100.0,
            )

        return await asyncio.to_thread(_do)

    async def _cloud_read(self, device_id: str) -> PowerReading:
        """Read status via Tuya Cloud API."""
        def _do():
            response = self._cloud_api.get(f"/v1.0/iot-03/devices/{device_id}/status")
            if not response.get("success"):
                raise RuntimeError(f"Cloud status failed: {response.get('msg', 'unknown')}")

            status_list = response.get("result", [])
            dps = {}
            for item in status_list:
                code = item.get("code", "")
                value = item.get("value")
                if code == "switch_1":
                    dps["is_on"] = bool(value)
                elif code == "cur_power":
                    dps["power_w"] = float(value) / 10.0
                elif code == "cur_voltage":
                    dps["voltage"] = float(value) / 10.0
                elif code == "cur_current":
                    dps["current_ma"] = float(value)
                elif code == "add_ele":
                    dps["energy_kwh"] = float(value) / 100.0

            return PowerReading(
                is_on=dps.get("is_on", False),
                power_w=dps.get("power_w", 0.0),
                voltage=dps.get("voltage", 0.0),
                current_ma=dps.get("current_ma", 0.0),
                energy_kwh=dps.get("energy_kwh", 0.0),
            )

        return await asyncio.to_thread(_do)

    def invalidate_cache(self, device_id: str):
        """Remove a device from the connection cache (e.g., after IP change)."""
        self._device_cache.pop(device_id, None)


# ══════════════════════════════════════════════════════════════════════
#  Tuya Adapter
# ══════════════════════════════════════════════════════════════════════

class TuyaAdapter(DeviceAdapter):
    """
    For appliances connected to a Tuya smart plug (e.g., Wipro 16A).
    Uses TuyaDeviceManager for LAN-first communication with cloud fallback.
    Falls back to VirtualAdapter if all Tuya paths fail.
    """

    def __init__(self):
        self._virtual = VirtualAdapter()
        self._manager = TuyaDeviceManager.get_instance()

    async def _get_plug(self, appliance_id: str) -> Optional[dict]:
        """Resolve appliance → smart_plug → tuya_device_id."""
        db = get_supabase()
        result = db.table("appliances").select(
            "smart_plug_id, smart_plugs(tuya_device_id, local_key, ip_address)"
        ).eq("id", appliance_id).limit(1).execute()
        if not result.data:
            return None
        row = result.data[0]
        return row if row.get("smart_plug_id") else None

    async def turn_on(self, appliance_id: str) -> ControlResult:
        import time
        start = time.monotonic()
        plug = await self._get_plug(appliance_id)
        if not plug:
            return await self._virtual.turn_on(appliance_id)

        device_id = plug["smart_plugs"]["tuya_device_id"]
        success, source = await self._manager.send_command(device_id, True)
        elapsed = int((time.monotonic() - start) * 1000)

        if success:
            # Update DB after hardware confirms
            db = get_supabase()
            db.table("appliances").update({
                "status": "ON",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", appliance_id).execute()

            # Update plug last_seen
            db.table("smart_plugs").update({
                "plug_status": "online",
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
            }).eq("tuya_device_id", device_id).execute()

            logger.info(f"[Tuya] Turned ON {appliance_id} via {source} ({elapsed}ms)")
            return ControlResult(success=True, source="tuya", response_time_ms=elapsed,
                                 message=f"Turned ON via {source}")
        else:
            logger.warning(f"[Tuya] Failed to turn ON {device_id}, falling back to virtual")
            return await self._virtual.turn_on(appliance_id)

    async def turn_off(self, appliance_id: str) -> ControlResult:
        import time
        start = time.monotonic()
        plug = await self._get_plug(appliance_id)
        if not plug:
            return await self._virtual.turn_off(appliance_id)

        device_id = plug["smart_plugs"]["tuya_device_id"]
        success, source = await self._manager.send_command(device_id, False)
        elapsed = int((time.monotonic() - start) * 1000)

        if success:
            db = get_supabase()
            db.table("appliances").update({
                "status": "OFF",
                "current_power_w": 0,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", appliance_id).execute()

            db.table("smart_plugs").update({
                "plug_status": "online",
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
            }).eq("tuya_device_id", device_id).execute()

            logger.info(f"[Tuya] Turned OFF {appliance_id} via {source} ({elapsed}ms)")
            return ControlResult(success=True, source="tuya", response_time_ms=elapsed,
                                 message=f"Turned OFF via {source}")
        else:
            logger.warning(f"[Tuya] Failed to turn OFF {device_id}, falling back to virtual")
            return await self._virtual.turn_off(appliance_id)

    async def set_eco_mode(self, appliance_id: str, enabled: bool) -> ControlResult:
        # Eco mode is a DB-level setting — Tuya plugs don't have this concept
        return await self._virtual.set_eco_mode(appliance_id, enabled)

    async def read_power(self, appliance_id: str) -> Optional[PowerReading]:
        """Read real-time power data for an appliance via its smart plug."""
        plug = await self._get_plug(appliance_id)
        if not plug:
            return None
        device_id = plug["smart_plugs"]["tuya_device_id"]
        return await self._manager.read_status(device_id)


def get_adapter(appliance: dict) -> DeviceAdapter:
    """
    Factory: returns TuyaAdapter if appliance has smart_plug_id, else VirtualAdapter.
    """
    if appliance.get("smart_plug_id"):
        return TuyaAdapter()
    return VirtualAdapter()


# ══════════════════════════════════════════════════════════════════════
#  Physical Override Detection
# ══════════════════════════════════════════════════════════════════════

async def detect_physical_override(appliance_id: str) -> bool:
    """
    Detect whether the user physically overrode an autopilot action.

    Logic:
      1. Check if `device_autopilot_config` exists for this appliance and
         autopilot had turned it off (autopilot_saved_state row with restored=False).
      2. Check current power draw from smart plug (Tuya status query) or
         check if the DB status changed to ON via a non-backend source.
      3. If the appliance is ON but autopilot turned it OFF, user overrode it.

    Returns True if override detected, False otherwise.
    """
    db = get_supabase()

    # 1. Check if there's an un-restored autopilot saved state
    saved = db.table("autopilot_saved_state").select("id, pre_action_status").eq(
        "appliance_id", appliance_id
    ).eq("restored", False).order("saved_at", desc=True).limit(1).execute()

    if not saved.data:
        return False  # No pending autopilot action → no override possible

    # 2. Check current appliance status
    appliance_result = db.table("appliances").select("status, smart_plug_id").eq(
        "id", appliance_id
    ).limit(1).execute()

    if not appliance_result.data:
        return False

    appliance = appliance_result.data[0]

    # If autopilot turned it off but it's now ON, override detected
    if appliance["status"] == "ON":
        logger.info(f"[OverrideDetect] Physical override detected for {appliance_id}: "
                    f"autopilot turned OFF but device is ON")
        # Record the override
        _record_override(db, appliance_id)
        return True

    # 3. For smart plug devices: check power draw via real Tuya query
    if appliance.get("smart_plug_id"):
        power_w = await _check_smart_plug_power(appliance_id)
        if power_w is not None and power_w > 5.0:
            logger.info(f"[OverrideDetect] Smart plug power override for {appliance_id}: "
                       f"{power_w}W detected while status=OFF")
            # Update status to ON (reflect reality)
            db.table("appliances").update({
                "status": "ON",
                "current_power_w": power_w,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", appliance_id).execute()
            _record_override(db, appliance_id)
            return True

    return False


def _record_override(db, appliance_id: str) -> None:
    """Record the override in device_autopilot_config."""
    now = datetime.now(timezone.utc).isoformat()

    existing = db.table("device_autopilot_config").select("id").eq(
        "appliance_id", appliance_id
    ).limit(1).execute()

    if existing.data:
        db.table("device_autopilot_config").update({
            "user_override_active": True,
            "last_override_at": now,
            "updated_at": now,
        }).eq("id", existing.data[0]["id"]).execute()
    else:
        # Create config with override flag
        # We need home_id — get it from the appliance
        app_result = db.table("appliances").select("home_id").eq(
            "id", appliance_id
        ).limit(1).execute()
        if app_result.data:
            db.table("device_autopilot_config").insert({
                "home_id": app_result.data[0]["home_id"],
                "appliance_id": appliance_id,
                "is_delegated": True,
                "user_override_active": True,
                "last_override_at": now,
            }).execute()


async def _check_smart_plug_power(appliance_id: str) -> Optional[float]:
    """
    Query smart plug for current power draw via TuyaDeviceManager.
    Returns power in watts, or None if unavailable.
    """
    try:
        adapter = TuyaAdapter()
        reading = await adapter.read_power(appliance_id)
        if reading and reading.source != "unavailable":
            return reading.power_w
    except Exception as e:
        logger.warning(f"[OverrideDetect] Smart plug power check failed for {appliance_id}: {e}")
    return None
