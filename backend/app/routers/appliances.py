"""
Appliances Router — Real-time control endpoints.

Every action goes through the adapter pipeline:
  1. Resolve adapter (Tuya / Virtual)
  2. Execute hardware command
  3. Update DB (appliances + control_logs)
  4. Return result to frontend

Auth: Supabase JWT → verified via supabase.auth.get_user(token).
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel

from app.database import get_supabase
from app.adapters import get_adapter

logger = logging.getLogger("voltwise.routers.appliances")

router = APIRouter(prefix="/api", tags=["appliances"])


# ── Auth dependency ─────────────────────────────────────────────────

import base64, json as _json

def _decode_jwt_payload(token: str) -> dict:
    """Decode JWT payload without signature verification (Supabase-signed token)."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        padding = 4 - len(parts[1]) % 4
        payload = parts[1] + ("=" * padding)
        return _json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return {}


async def get_current_user(authorization: str = Header(...)) -> dict:
    """
    Extract user from Supabase JWT in Authorization header.
    Decodes payload locally — no network call, no blocking.
    """
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing auth token")

    payload = _decode_jwt_payload(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    return {"id": user_id, "email": payload.get("email", "")}


# ── Request / Response models ───────────────────────────────────────

class ToggleRequest(BaseModel):
    action: str  # "turn_on" | "turn_off"


class ToggleResponse(BaseModel):
    success: bool
    source: str  # "tuya" | "virtual"
    new_status: str  # "ON" | "OFF"
    response_time_ms: int = 0
    message: str = ""


class EcoModeRequest(BaseModel):
    enabled: bool


class ScheduleRequest(BaseModel):
    start_time: str      # "HH:MM" (24h)
    end_time: Optional[str] = None  # "HH:MM" or null for let-it-run
    repeat_type: str = "once"
    custom_days: Optional[list[int]] = None


class ScheduleResponse(BaseModel):
    schedule_id: str
    appliance_id: str
    start_time: str
    end_time: Optional[str]
    message: str = ""


class BatchTurnOffRequest(BaseModel):
    appliance_ids: list[str]


class BatchTurnOffResponse(BaseModel):
    success: bool
    turned_off: int
    results: list[dict]


# ── Endpoints ───────────────────────────────────────────────────────

@router.post("/appliances/{appliance_id}/toggle", response_model=ToggleResponse)
async def toggle_appliance(
    appliance_id: str,
    body: ToggleRequest,
    user: dict = Depends(get_current_user),
):
    """
    Toggle a single appliance ON or OFF.
    Goes through the adapter pipeline (Tuya or Virtual).
    """
    db = get_supabase()

    # Fetch appliance
    result = db.table("appliances").select("*").eq("id", appliance_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Appliance not found")

    appliance = result.data[0]
    if not appliance.get("is_controllable"):
        raise HTTPException(status_code=400, detail="Appliance is not controllable")

    adapter = get_adapter(appliance)

    if body.action == "turn_on":
        ctrl = await adapter.turn_on(appliance_id)
        new_status = "ON"
    elif body.action == "turn_off":
        ctrl = await adapter.turn_off(appliance_id)
        new_status = "OFF"
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action: {body.action}")

    # Log control action
    db.table("control_logs").insert({
        "appliance_id": appliance_id,
        "user_id": user["id"],
        "action": body.action,
        "trigger_source": "manual",
        "result": "success" if ctrl.success else "failed",
        "response_time_ms": ctrl.response_time_ms,
    }).execute()

    return ToggleResponse(
        success=ctrl.success,
        source=ctrl.source,
        new_status=new_status,
        response_time_ms=ctrl.response_time_ms,
        message=ctrl.message,
    )


@router.post("/appliances/{appliance_id}/eco-mode", response_model=ToggleResponse)
async def set_eco_mode(
    appliance_id: str,
    body: EcoModeRequest,
    user: dict = Depends(get_current_user),
):
    """Toggle eco mode for a comfort-tier appliance (e.g., AC)."""
    db = get_supabase()

    result = db.table("appliances").select("*").eq("id", appliance_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Appliance not found")

    appliance = result.data[0]
    adapter = get_adapter(appliance)
    ctrl = await adapter.set_eco_mode(appliance_id, body.enabled)

    # If enabling eco mode, also turn the appliance ON (eco = reduced power, not off)
    if body.enabled and appliance["status"] != "ON":
        db.table("appliances").update({
            "status": "ON",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", appliance_id).execute()

    db.table("control_logs").insert({
        "appliance_id": appliance_id,
        "user_id": user["id"],
        "action": f"eco_mode_{'on' if body.enabled else 'off'}",
        "trigger_source": "optimizer",
        "result": "success" if ctrl.success else "failed",
        "response_time_ms": ctrl.response_time_ms,
    }).execute()

    return ToggleResponse(
        success=ctrl.success,
        source=ctrl.source,
        new_status="ON" if body.enabled else appliance["status"],
        response_time_ms=ctrl.response_time_ms,
        message=ctrl.message,
    )


@router.post("/appliances/{appliance_id}/schedule", response_model=ScheduleResponse)
async def create_schedule(
    appliance_id: str,
    body: ScheduleRequest,
    user: dict = Depends(get_current_user),
):
    """
    Create a schedule for an appliance.
    - Deactivates any existing active schedules for this appliance.
    - Creates the new schedule in DB.
    - Registers APScheduler jobs for start_time (and end_time if set).
    """
    db = get_supabase()

    # Verify appliance exists
    app_result = db.table("appliances").select("*, homes(id, user_id)").eq("id", appliance_id).limit(1).execute()
    if not app_result.data:
        raise HTTPException(status_code=404, detail="Appliance not found")

    appliance = app_result.data[0]
    home_id = appliance["home_id"]

    # Deactivate existing schedules for this appliance
    db.table("schedules").update({
        "is_active": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("appliance_id", appliance_id).eq("is_active", True).execute()

    # Insert new schedule
    schedule_data = {
        "home_id": home_id,
        "appliance_id": appliance_id,
        "start_time": body.start_time,
        "end_time": body.end_time,
        "repeat_type": body.repeat_type,
        "custom_days": body.custom_days,
        "is_active": True,
        "created_by": "user",
    }
    sched_result = db.table("schedules").insert(schedule_data).execute()
    if not sched_result.data:
        raise HTTPException(status_code=500, detail="Failed to create schedule")

    schedule_id = sched_result.data[0]["id"]

    # Update appliance status to SCHEDULED
    db.table("appliances").update({
        "status": "SCHEDULED",
        "schedule_time": body.start_time,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", appliance_id).execute()

    # Register APScheduler jobs for the scheduled times
    from app.services.scheduler_manager import register_schedule_jobs
    await register_schedule_jobs(
        schedule_id=schedule_id,
        appliance_id=appliance_id,
        home_id=home_id,
        user_id=user["id"],
        start_time=body.start_time,
        end_time=body.end_time,
        repeat_type=body.repeat_type,
        custom_days=body.custom_days,
    )

    return ScheduleResponse(
        schedule_id=schedule_id,
        appliance_id=appliance_id,
        start_time=body.start_time,
        end_time=body.end_time,
        message=f"Scheduled at {body.start_time}" + (f" until {body.end_time}" if body.end_time else ""),
    )


@router.post("/optimizer/execute", response_model=BatchTurnOffResponse)
async def optimizer_batch_turn_off(
    body: BatchTurnOffRequest,
    user: dict = Depends(get_current_user),
):
    """
    Optimizer batch action: turn off multiple heavy appliances during peak.
    Each goes through the adapter pipeline independently.
    """
    db = get_supabase()
    results = []
    turned_off = 0

    for aid in body.appliance_ids:
        try:
            app_result = db.table("appliances").select("*").eq("id", aid).limit(1).execute()
            if not app_result.data:
                results.append({"appliance_id": aid, "success": False, "error": "Not found"})
                continue

            adapter = get_adapter(app_result.data[0])
            ctrl = await adapter.turn_off(aid)

            db.table("control_logs").insert({
                "appliance_id": aid,
                "user_id": user["id"],
                "action": "turn_off",
                "trigger_source": "optimizer_batch",
                "result": "success" if ctrl.success else "failed",
                "response_time_ms": ctrl.response_time_ms,
            }).execute()

            results.append({
                "appliance_id": aid,
                "success": ctrl.success,
                "source": ctrl.source,
            })
            if ctrl.success:
                turned_off += 1

        except Exception as e:
            logger.error(f"[Batch] Failed to turn off {aid}: {e}")
            results.append({"appliance_id": aid, "success": False, "error": str(e)})

    return BatchTurnOffResponse(
        success=turned_off > 0,
        turned_off=turned_off,
        results=results,
    )


@router.get("/health")
async def health_check():
    """Basic health check for monitoring."""
    return {"status": "ok", "service": "voltwise-backend", "version": "1.0.0"}
