"""
Smart Plug Poller — Periodic power data collection.

Runs every 10 seconds via APScheduler. For each registered smart plug:
  1. Reads real-time power data via TuyaDeviceManager (LAN → Cloud)
  2. Inserts a row into `plug_readings` for time-series history
  3. Updates `appliances.current_power_w` for instant UI display
  4. Updates `smart_plugs.last_power_w` + `last_seen_at` for health tracking
  5. Detects offline plugs (no response → mark offline)

The poller is designed to be non-blocking and fault-tolerant:
  - Each plug is polled independently
  - A failed poll doesn't affect other plugs
  - Offline plugs are retried on the next cycle
"""

from __future__ import annotations
from datetime import datetime, timezone
import logging
import asyncio

from app.database import get_supabase
from app.adapters.device import TuyaDeviceManager, PowerReading

logger = logging.getLogger("voltwise.plug_poller")

# Throttle: don't log every single poll — only log transitions and errors
_last_status: dict[str, bool] = {}  # plug_id → was_online


async def poll_all_plugs() -> None:
    """
    Poll all registered smart plugs for real-time power data.
    Called every 10 seconds by APScheduler.
    """
    db = get_supabase()

    # Fetch all active smart plugs (only those linked to appliances)
    result = db.table("smart_plugs").select(
        "id, tuya_device_id, home_id, plug_status"
    ).execute()

    plugs = result.data or []
    if not plugs:
        return

    manager = TuyaDeviceManager.get_instance()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # Poll all plugs concurrently (with per-plug error isolation)
    tasks = [_poll_single_plug(manager, db, plug, now_iso) for plug in plugs]
    await asyncio.gather(*tasks, return_exceptions=True)


async def _poll_single_plug(
    manager: TuyaDeviceManager,
    db,
    plug: dict,
    now_iso: str,
) -> None:
    """Poll a single smart plug and persist the reading."""
    plug_id = plug["id"]
    device_id = plug["tuya_device_id"]

    try:
        reading = await manager.read_status(device_id)

        if reading.source == "unavailable":
            # Mark plug offline if it was previously online
            was_online = _last_status.get(plug_id, True)
            if was_online:
                db.table("smart_plugs").update({
                    "plug_status": "offline",
                    "updated_at": now_iso,
                }).eq("id", plug_id).execute()
                logger.warning(f"[PlugPoller] Plug {device_id} went offline")
            _last_status[plug_id] = False
            return

        # ── Plug is responsive ──

        # 1. Insert plug_readings row
        # Find the linked appliance (if any)
        appliance_result = db.table("appliances").select("id").eq(
            "smart_plug_id", plug_id
        ).limit(1).execute()
        appliance_id = appliance_result.data[0]["id"] if appliance_result.data else None

        db.table("plug_readings").insert({
            "plug_id": plug_id,
            "appliance_id": appliance_id,
            "timestamp": now_iso,
            "power_w": reading.power_w,
            "voltage": reading.voltage,
            "current_ma": reading.current_ma,
            "energy_kwh": reading.energy_kwh,
            "is_on": reading.is_on,
        }).execute()

        # 2. Update smart_plugs health data
        db.table("smart_plugs").update({
            "plug_status": "online",
            "last_power_w": reading.power_w,
            "last_voltage": reading.voltage,
            "last_current_ma": reading.current_ma,
            "last_seen_at": now_iso,
            "updated_at": now_iso,
        }).eq("id", plug_id).execute()

        # 3. Update the linked appliance's current_power_w + status
        if appliance_id:
            new_status = "ON" if reading.is_on else "OFF"
            db.table("appliances").update({
                "current_power_w": reading.power_w,
                "status": new_status,
                "updated_at": now_iso,
            }).eq("id", appliance_id).execute()

        # Log transitions only
        was_online = _last_status.get(plug_id, False)
        if not was_online:
            logger.info(
                f"[PlugPoller] Plug {device_id} is online — "
                f"{reading.power_w}W, {reading.voltage}V, {reading.current_ma}mA"
            )
        _last_status[plug_id] = True

    except Exception as e:
        logger.error(f"[PlugPoller] Error polling plug {device_id}: {e}")


async def poll_single_plug_by_id(plug_id: str) -> PowerReading | None:
    """
    Poll a specific plug on-demand (e.g., for the status API endpoint).
    Returns the reading without persisting it.
    """
    db = get_supabase()
    result = db.table("smart_plugs").select("tuya_device_id").eq("id", plug_id).limit(1).execute()
    if not result.data:
        return None

    device_id = result.data[0]["tuya_device_id"]
    manager = TuyaDeviceManager.get_instance()
    return await manager.read_status(device_id)
