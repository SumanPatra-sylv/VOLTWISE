"""
Device Adapter — Abstract base + Tuya + Virtual implementations.

Every appliance goes through the same pipeline.
The adapter factory checks smart_plug_id:
  - Non-null → TuyaAdapter (hardware control)
  - Null     → VirtualAdapter (DB-only, same logging)
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional
import logging

from app.database import get_supabase

logger = logging.getLogger("voltwise.adapters")


@dataclass
class ControlResult:
    success: bool
    source: str          # "tuya" | "virtual"
    message: str = ""
    response_time_ms: int = 0


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


class TuyaAdapter(DeviceAdapter):
    """
    For appliances connected to a Tuya smart plug.
    Calls Tuya Cloud API, then updates DB.
    Falls back to VirtualAdapter if Tuya fails gracefully.
    """

    def __init__(self):
        self._virtual = VirtualAdapter()

    async def _get_plug(self, appliance_id: str) -> Optional[dict]:
        """Resolve appliance → smart_plug → tuya_device_id."""
        db = get_supabase()
        result = db.table("appliances").select(
            "smart_plug_id, smart_plugs(tuya_device_id)"
        ).eq("id", appliance_id).limit(1).execute()
        if not result.data:
            return None
        row = result.data[0]
        return row if row.get("smart_plug_id") else None

    async def _send_tuya_command(self, device_id: str, switch_on: bool) -> bool:
        """
        Send command to Tuya Cloud API.
        TODO: Replace with real tinytuya / tuya-connector call.
        For PoC, this logs the intent and returns True.
        """
        logger.info(f"[Tuya] Sending {'ON' if switch_on else 'OFF'} to device {device_id}")
        # ── Real implementation would be: ──
        # import tinytuya
        # d = tinytuya.OutletDevice(device_id, ip, local_key)
        # d.turn_on() / d.turn_off()
        # ── Or cloud API: ──
        # from tuya_connector import TuyaOpenAPI
        # api.post(f'/v1.0/devices/{device_id}/commands', {'commands': [{'code': 'switch_1', 'value': switch_on}]})
        return True

    async def turn_on(self, appliance_id: str) -> ControlResult:
        import time
        start = time.monotonic()
        plug = await self._get_plug(appliance_id)
        if not plug:
            return await self._virtual.turn_on(appliance_id)

        device_id = plug["smart_plugs"]["tuya_device_id"]
        success = await self._send_tuya_command(device_id, True)
        elapsed = int((time.monotonic() - start) * 1000)

        if success:
            # Update DB after hardware confirms
            db = get_supabase()
            db.table("appliances").update({
                "status": "ON",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", appliance_id).execute()
            return ControlResult(success=True, source="tuya", response_time_ms=elapsed)
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
        success = await self._send_tuya_command(device_id, False)
        elapsed = int((time.monotonic() - start) * 1000)

        if success:
            db = get_supabase()
            db.table("appliances").update({
                "status": "OFF",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", appliance_id).execute()
            return ControlResult(success=True, source="tuya", response_time_ms=elapsed)
        else:
            logger.warning(f"[Tuya] Failed to turn OFF {device_id}, falling back to virtual")
            return await self._virtual.turn_off(appliance_id)

    async def set_eco_mode(self, appliance_id: str, enabled: bool) -> ControlResult:
        # Eco mode is a DB-level setting — Tuya plugs don't have this concept
        return await self._virtual.set_eco_mode(appliance_id, enabled)


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

    # 3. For smart plug devices: check power draw
    # If the plug reports >5W power draw but status is OFF, user turned it on physically
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
    Query smart plug for current power draw.
    TODO: Replace with real Tuya status query.
    For PoC, returns None (no power data available).
    """
    # Real implementation:
    # db = get_supabase()
    # plug = db.table("appliances").select("smart_plugs(tuya_device_id)").eq("id", appliance_id).execute()
    # if plug.data:
    #     device_id = plug.data[0]["smart_plugs"]["tuya_device_id"]
    #     # Query Tuya for status: d.status() → {'cur_power': 1234}  (unit: 0.1W)
    #     return power_w
    return None
