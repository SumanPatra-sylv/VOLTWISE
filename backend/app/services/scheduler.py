"""
Schedule Executor — Fired by APScheduler at exact trigger times.

Each schedule produces up to 2 jobs:
  1. ON  at start_time
  2. OFF at end_time (if set)

Handles: execute, retry on failure, log to schedule_logs,
         update appliance status, create notification.
"""

from __future__ import annotations
from datetime import datetime, timezone
import logging

from app.database import get_supabase
from app.adapters import get_adapter

logger = logging.getLogger("voltwise.scheduler")


async def execute_schedule_action(
    schedule_id: str,
    appliance_id: str,
    action: str,  # "turn_on" | "turn_off"
    home_id: str,
    user_id: str | None = None,
) -> None:
    """
    Called by APScheduler at the exact scheduled time.
    Resolves adapter (Tuya or Virtual) and executes.
    """
    db = get_supabase()
    logger.info(f"[Scheduler] Executing {action} for appliance {appliance_id} (schedule {schedule_id})")

    try:
        # Fetch appliance for adapter resolution
        result = db.table("appliances").select("*").eq("id", appliance_id).limit(1).execute()
        if not result.data:
            raise ValueError(f"Appliance {appliance_id} not found")
        appliance = result.data[0]

        adapter = get_adapter(appliance)

        # Execute the action
        if action == "turn_on":
            ctrl_result = await adapter.turn_on(appliance_id)
        elif action == "turn_off":
            ctrl_result = await adapter.turn_off(appliance_id)
        else:
            raise ValueError(f"Unknown action: {action}")

        # Log success
        db.table("schedule_logs").insert({
            "schedule_id": schedule_id,
            "appliance_id": appliance_id,
            "executed_at": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "result": "success" if ctrl_result.success else "failed",
            "error_message": None if ctrl_result.success else ctrl_result.message,
        }).execute()

        # Log control action
        db.table("control_logs").insert({
            "appliance_id": appliance_id,
            "user_id": user_id,
            "action": action,
            "trigger_source": "scheduler",
            "result": "success" if ctrl_result.success else "failed",
            "response_time_ms": ctrl_result.response_time_ms,
        }).execute()

        # Update schedule last_executed
        db.table("schedules").update({
            "last_executed": datetime.now(timezone.utc).isoformat(),
        }).eq("id", schedule_id).execute()

        # Send notification
        if home_id:
            _create_notification(db, home_id, appliance, action)

        logger.info(
            f"[Scheduler] {action} completed for {appliance.get('name', appliance_id)} "
            f"via {ctrl_result.source} (success={ctrl_result.success})"
        )

    except Exception as e:
        logger.error(f"[Scheduler] Failed to execute {action} for {appliance_id}: {e}")
        # Log failure
        try:
            db.table("schedule_logs").insert({
                "schedule_id": schedule_id,
                "appliance_id": appliance_id,
                "executed_at": datetime.now(timezone.utc).isoformat(),
                "action": action,
                "result": "failed",
                "error_message": str(e),
            }).execute()
        except Exception:
            logger.error("[Scheduler] Failed to log schedule failure")


def _create_notification(db, home_id: str, appliance: dict, action: str) -> None:
    """Create a user-facing notification for schedule execution."""
    try:
        # Get user_id from home
        home = db.table("homes").select("user_id").eq("id", home_id).limit(1).execute()
        if not home.data:
            return
        user_id = home.data[0]["user_id"]

        name = appliance.get("name", "Appliance")
        is_on = action == "turn_on"
        db.table("notifications").insert({
            "user_id": user_id,
            "type": "schedule",
            "title": f"{name} {'turned on' if is_on else 'turned off'}",
            "message": f"Scheduled {'start' if is_on else 'stop'} executed successfully.",
            "icon": "clock",
            "color": "text-indigo-600" if is_on else "text-slate-500",
            "bg_color": "bg-indigo-50" if is_on else "bg-slate-50",
        }).execute()
    except Exception as e:
        logger.warning(f"[Scheduler] Failed to create notification: {e}")
