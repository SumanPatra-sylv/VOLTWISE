"""
Smart Plugs Router — Registration, status, readings, and control endpoints.

Endpoints:
  POST   /api/plugs/register           — Register a new Wipro/Tuya plug
  GET    /api/plugs/{plug_id}/status    — Get real-time power/voltage/current
  GET    /api/plugs/{plug_id}/readings  — Historical readings (last 24h/7d/30d)
  POST   /api/plugs/{plug_id}/link      — Link a plug to an appliance
  POST   /api/plugs/{plug_id}/control   — Turn on/off directly
  GET    /api/plugs                     — List all plugs for the user's home
  DELETE /api/plugs/{plug_id}           — Unregister a plug

Auth: Supabase JWT via get_current_user dependency.
"""

from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.database import get_supabase
from app.routers.appliances import get_current_user
from app.adapters.device import TuyaDeviceManager

logger = logging.getLogger("voltwise.routers.plugs")

router = APIRouter(prefix="/api/plugs", tags=["smart-plugs"])


# ── Request / Response models ───────────────────────────────────────

class RegisterPlugRequest(BaseModel):
    home_id: str
    tuya_device_id: str
    name: Optional[str] = None
    local_key: Optional[str] = None
    ip_address: Optional[str] = None
    device_type: str = "wipro_16a"


class RegisterPlugResponse(BaseModel):
    plug_id: str
    tuya_device_id: str
    name: str
    status: str
    message: str


class PlugStatusResponse(BaseModel):
    plug_id: str
    tuya_device_id: str
    is_online: bool
    is_on: bool
    power_w: float
    voltage: float
    current_ma: float
    energy_kwh: float
    source: str
    last_seen_at: Optional[str] = None


class LinkPlugRequest(BaseModel):
    appliance_id: str


class ControlPlugRequest(BaseModel):
    action: str  # "turn_on" | "turn_off"


class PlugReadingsResponse(BaseModel):
    plug_id: str
    period: str
    count: int
    readings: list[dict]
    summary: dict


class PlugSummary(BaseModel):
    id: str
    tuya_device_id: str
    name: Optional[str]
    plug_status: str
    device_type: Optional[str]
    last_power_w: Optional[float]
    last_voltage: Optional[float]
    last_seen_at: Optional[str]
    linked_appliance: Optional[str] = None


# ── Endpoints ───────────────────────────────────────────────────────

@router.post("/register", response_model=RegisterPlugResponse)
async def register_plug(
    body: RegisterPlugRequest,
    user: dict = Depends(get_current_user),
):
    """
    Register a new smart plug (Wipro 16A / Tuya-based).
    Optionally provides local_key for LAN communication.
    """
    db = get_supabase()

    # Verify the home belongs to this user
    home = db.table("homes").select("id").eq("id", body.home_id).eq(
        "user_id", user["id"]
    ).limit(1).execute()
    if not home.data:
        raise HTTPException(status_code=403, detail="Home not found or not yours")

    # Check for duplicate tuya_device_id
    existing = db.table("smart_plugs").select("id").eq(
        "tuya_device_id", body.tuya_device_id
    ).limit(1).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="This device is already registered")

    # Insert the plug
    plug_name = body.name or f"Wipro 16A Plug ({body.tuya_device_id[-6:]})"
    plug_data = {
        "home_id": body.home_id,
        "tuya_device_id": body.tuya_device_id,
        "name": plug_name,
        "plug_status": "offline",  # Will become online after first poll
        "device_type": body.device_type,
    }
    if body.local_key:
        plug_data["local_key"] = body.local_key
    if body.ip_address:
        plug_data["ip_address"] = body.ip_address

    result = db.table("smart_plugs").insert(plug_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to register plug")

    plug = result.data[0]
    logger.info(f"[Plugs] Registered new plug: {plug['id']} ({body.tuya_device_id})")

    # Try an initial status check to verify connectivity
    manager = TuyaDeviceManager.get_instance()
    try:
        reading = await manager.read_status(body.tuya_device_id)
        if reading.source != "unavailable":
            db.table("smart_plugs").update({
                "plug_status": "online",
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
                "last_power_w": reading.power_w,
            }).eq("id", plug["id"]).execute()
            status = "online"
        else:
            status = "offline"
    except Exception:
        status = "offline"

    return RegisterPlugResponse(
        plug_id=plug["id"],
        tuya_device_id=body.tuya_device_id,
        name=plug_name,
        status=status,
        message=f"Plug registered successfully. Status: {status}",
    )


@router.get("/{plug_id}/status", response_model=PlugStatusResponse)
async def get_plug_status(
    plug_id: str,
    user: dict = Depends(get_current_user),
):
    """Get real-time power status from a smart plug (live Tuya query)."""
    db = get_supabase()

    plug = db.table("smart_plugs").select(
        "id, tuya_device_id, last_seen_at"
    ).eq("id", plug_id).limit(1).execute()
    if not plug.data:
        raise HTTPException(status_code=404, detail="Plug not found")

    plug_data = plug.data[0]
    device_id = plug_data["tuya_device_id"]

    # Live query
    manager = TuyaDeviceManager.get_instance()
    reading = await manager.read_status(device_id)

    is_online = reading.source != "unavailable"

    if is_online:
        # Update last_seen
        db.table("smart_plugs").update({
            "plug_status": "online",
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", plug_id).execute()

    return PlugStatusResponse(
        plug_id=plug_id,
        tuya_device_id=device_id,
        is_online=is_online,
        is_on=reading.is_on,
        power_w=reading.power_w,
        voltage=reading.voltage,
        current_ma=reading.current_ma,
        energy_kwh=reading.energy_kwh,
        source=reading.source,
        last_seen_at=plug_data.get("last_seen_at"),
    )


@router.get("/{plug_id}/readings", response_model=PlugReadingsResponse)
async def get_plug_readings(
    plug_id: str,
    period: str = Query("24h", pattern="^(1h|6h|24h|7d|30d)$"),
    user: dict = Depends(get_current_user),
):
    """
    Get historical power readings for a plug.

    Periods: 1h, 6h, 24h, 7d, 30d
    Returns raw readings + summary (avg, max, min, total_kwh).
    """
    db = get_supabase()

    # Verify plug exists
    plug = db.table("smart_plugs").select("id").eq("id", plug_id).limit(1).execute()
    if not plug.data:
        raise HTTPException(status_code=404, detail="Plug not found")

    # Calculate time range
    now = datetime.now(timezone.utc)
    period_map = {
        "1h": timedelta(hours=1),
        "6h": timedelta(hours=6),
        "24h": timedelta(hours=24),
        "7d": timedelta(days=7),
        "30d": timedelta(days=30),
    }
    since = (now - period_map[period]).isoformat()

    # Fetch readings
    readings_result = db.table("plug_readings").select(
        "timestamp, power_w, voltage, current_ma, energy_kwh, is_on"
    ).eq("plug_id", plug_id).gte("timestamp", since).order(
        "timestamp", desc=False
    ).limit(2000).execute()

    readings = readings_result.data or []

    # Calculate summary
    if readings:
        powers = [float(r.get("power_w", 0) or 0) for r in readings]
        energies = [float(r.get("energy_kwh", 0) or 0) for r in readings]
        summary = {
            "avg_power_w": round(sum(powers) / len(powers), 1),
            "max_power_w": round(max(powers), 1),
            "min_power_w": round(min(powers), 1),
            "total_energy_kwh": round(max(energies) - min(energies), 4) if energies else 0,
            "reading_count": len(readings),
            "uptime_percent": round(
                sum(1 for r in readings if r.get("is_on")) / len(readings) * 100, 1
            ),
        }
    else:
        summary = {
            "avg_power_w": 0,
            "max_power_w": 0,
            "min_power_w": 0,
            "total_energy_kwh": 0,
            "reading_count": 0,
            "uptime_percent": 0,
        }

    return PlugReadingsResponse(
        plug_id=plug_id,
        period=period,
        count=len(readings),
        readings=readings,
        summary=summary,
    )


@router.post("/{plug_id}/link")
async def link_plug_to_appliance(
    plug_id: str,
    body: LinkPlugRequest,
    user: dict = Depends(get_current_user),
):
    """Link a smart plug to an appliance for power monitoring."""
    db = get_supabase()

    # Verify plug exists
    plug = db.table("smart_plugs").select("id, home_id").eq("id", plug_id).limit(1).execute()
    if not plug.data:
        raise HTTPException(status_code=404, detail="Plug not found")

    # Verify appliance exists and is in the same home
    appliance = db.table("appliances").select("id, home_id, name").eq(
        "id", body.appliance_id
    ).limit(1).execute()
    if not appliance.data:
        raise HTTPException(status_code=404, detail="Appliance not found")

    if plug.data[0]["home_id"] != appliance.data[0]["home_id"]:
        raise HTTPException(status_code=400, detail="Plug and appliance must be in the same home")

    # Unlink any existing plug from this appliance
    db.table("appliances").update({
        "smart_plug_id": None,
    }).eq("smart_plug_id", plug_id).execute()

    # Link the plug
    db.table("appliances").update({
        "smart_plug_id": plug_id,
        "source": "smart_plug",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", body.appliance_id).execute()

    logger.info(f"[Plugs] Linked plug {plug_id} to appliance {body.appliance_id}")

    return {
        "success": True,
        "plug_id": plug_id,
        "appliance_id": body.appliance_id,
        "appliance_name": appliance.data[0]["name"],
        "message": f"Plug linked to {appliance.data[0]['name']}",
    }


@router.post("/{plug_id}/control")
async def control_plug(
    plug_id: str,
    body: ControlPlugRequest,
    user: dict = Depends(get_current_user),
):
    """Turn a smart plug on or off directly."""
    db = get_supabase()

    plug = db.table("smart_plugs").select(
        "id, tuya_device_id"
    ).eq("id", plug_id).limit(1).execute()
    if not plug.data:
        raise HTTPException(status_code=404, detail="Plug not found")

    device_id = plug.data[0]["tuya_device_id"]
    switch_on = body.action == "turn_on"

    manager = TuyaDeviceManager.get_instance()

    import time
    start = time.monotonic()
    success, source = await manager.send_command(device_id, switch_on)
    elapsed = int((time.monotonic() - start) * 1000)

    if success:
        now_iso = datetime.now(timezone.utc).isoformat()
        db.table("smart_plugs").update({
            "plug_status": "online",
            "last_seen_at": now_iso,
        }).eq("id", plug_id).execute()

        # Also update linked appliance
        db.table("appliances").update({
            "status": "ON" if switch_on else "OFF",
            "current_power_w": 0 if not switch_on else None,
            "updated_at": now_iso,
        }).eq("smart_plug_id", plug_id).execute()

        return {
            "success": True,
            "action": body.action,
            "source": source,
            "response_time_ms": elapsed,
            "message": f"Plug {'turned on' if switch_on else 'turned off'} via {source}",
        }
    else:
        raise HTTPException(
            status_code=502,
            detail="Failed to communicate with the smart plug. Check if it's powered on and on your network.",
        )


@router.get("", response_model=list[PlugSummary])
async def list_plugs(
    home_id: str = Query(...),
    user: dict = Depends(get_current_user),
):
    """List all smart plugs for a home."""
    db = get_supabase()

    plugs = db.table("smart_plugs").select(
        "id, tuya_device_id, name, plug_status, device_type, "
        "last_power_w, last_voltage, last_seen_at"
    ).eq("home_id", home_id).order("created_at", desc=False).execute()

    result = []
    for p in (plugs.data or []):
        # Check if linked to an appliance
        link = db.table("appliances").select("name").eq(
            "smart_plug_id", p["id"]
        ).limit(1).execute()
        linked = link.data[0]["name"] if link.data else None

        result.append(PlugSummary(
            id=p["id"],
            tuya_device_id=p["tuya_device_id"],
            name=p.get("name"),
            plug_status=p.get("plug_status", "offline"),
            device_type=p.get("device_type"),
            last_power_w=p.get("last_power_w"),
            last_voltage=p.get("last_voltage"),
            last_seen_at=p.get("last_seen_at"),
            linked_appliance=linked,
        ))

    return result


@router.delete("/{plug_id}")
async def unregister_plug(
    plug_id: str,
    user: dict = Depends(get_current_user),
):
    """Unregister a smart plug — unlinks from appliances and deletes."""
    db = get_supabase()

    # Unlink from any appliances first
    db.table("appliances").update({
        "smart_plug_id": None,
        "source": "manual",
    }).eq("smart_plug_id", plug_id).execute()

    # Delete the plug (cascade deletes plug_readings)
    db.table("smart_plugs").delete().eq("id", plug_id).execute()

    # Clear from TuyaDeviceManager cache
    TuyaDeviceManager.get_instance().invalidate_cache(plug_id)

    logger.info(f"[Plugs] Unregistered plug {plug_id}")

    return {"success": True, "message": "Plug unregistered and readings deleted"}
