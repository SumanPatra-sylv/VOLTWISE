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
