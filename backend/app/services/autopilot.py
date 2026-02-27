"""
Autopilot Service — Real peak optimization engine.

Two modes:
  1. Peak Optimization — On peak tariff entry, execute per-appliance actions
     (turn off shiftable, eco-mode comfort, leave essentials). On peak exit, restore.
  2. Grid Protection (future) — React to grid frequency / voltage anomalies.

Called by tariff_watcher when a slot transition is detected for a home
that has autopilot enabled.
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Literal
import logging

from app.database import get_supabase
from app.adapters import get_adapter

logger = logging.getLogger("voltwise.autopilot")

# Tracks pre-peak state so we can restore on peak exit
# Key: home_id, Value: list of {appliance_id, prev_status}
_pre_peak_state: dict[str, list[dict]] = {}


async def execute_peak_entry(home_id: str, user_id: str | None) -> dict:
    """
    Peak tariff just started — execute autopilot rules for this home.
    Returns summary of actions taken.
    """
    db = get_supabase()
    actions_taken = []

    # 1. Fetch active automation rules for this home
    rules_result = db.table("automation_rules").select("*").eq(
        "home_id", home_id
    ).eq("is_active", True).execute()

    rules = rules_result.data or []
    if not rules:
        logger.info(f"[Autopilot] No active rules for home {home_id}")
        return {"actions": [], "message": "No active rules"}

    # 2. Fetch all controllable appliances for this home
    app_result = db.table("appliances").select("*").eq(
        "home_id", home_id
    ).eq("is_active", True).eq("is_controllable", True).execute()

    appliances = {a["id"]: a for a in (app_result.data or [])}

    # Save pre-peak state for later restoration
    _pre_peak_state[home_id] = [
        {"appliance_id": a["id"], "prev_status": a["status"]}
        for a in appliances.values()
    ]

    # 3. Process each rule
    for rule in rules:
        if rule["condition_type"] != "peak_tariff":
            continue

        target_ids = rule.get("target_appliance_ids") or []
        action = rule["action"]  # "turn_off" | "eco_mode" | "reduce_power"
        rule_config = rule.get("condition_value", {})

        for aid in target_ids:
            if aid not in appliances:
                continue
            appliance = appliances[aid]

            try:
                adapter = get_adapter(appliance)

                if action == "turn_off":
                    if appliance["status"] == "ON" or appliance["status"] == "WARNING":
                        result = await adapter.turn_off(aid)
                        _log_action(db, aid, user_id, "turn_off", "autopilot_peak", result.success)
                        actions_taken.append({
                            "appliance_id": aid,
                            "name": appliance.get("name"),
                            "action": "turn_off",
                            "success": result.success,
                        })
                        logger.info(f"[Autopilot] Turned off {appliance.get('name')} (peak entry)")

                elif action == "eco_mode":
                    result = await adapter.set_eco_mode(aid, True)
                    _log_action(db, aid, user_id, "eco_mode_on", "autopilot_peak", result.success)
                    actions_taken.append({
                        "appliance_id": aid,
                        "name": appliance.get("name"),
                        "action": "eco_mode",
                        "success": result.success,
                    })
                    logger.info(f"[Autopilot] Set eco mode on {appliance.get('name')} (peak entry)")

            except Exception as e:
                logger.error(f"[Autopilot] Failed action on {aid}: {e}")
                actions_taken.append({
                    "appliance_id": aid,
                    "name": appliance.get("name"),
                    "action": action,
                    "success": False,
                    "error": str(e),
                })

        # Mark rule as triggered
        db.table("automation_rules").update({
            "is_triggered": True,
            "last_triggered": datetime.now(timezone.utc).isoformat(),
        }).eq("id", rule["id"]).execute()

    # Create notification summarizing actions
    if actions_taken and user_id:
        count = len([a for a in actions_taken if a["success"]])
        db.table("notifications").insert({
            "user_id": user_id,
            "type": "autopilot",
            "title": "🤖 Autopilot: Peak Protection Active",
            "message": f"Managed {count} appliance(s) to reduce peak costs.",
            "icon": "bot",
            "color": "text-indigo-600",
            "bg_color": "bg-indigo-50",
        }).execute()

    return {"actions": actions_taken, "message": f"Executed {len(actions_taken)} actions"}


async def execute_peak_exit(home_id: str, user_id: str | None) -> dict:
    """
    Peak tariff ended — restore pre-peak state for appliances.
    """
    db = get_supabase()
    actions_taken = []

    saved_state = _pre_peak_state.pop(home_id, [])
    if not saved_state:
        logger.info(f"[Autopilot] No saved pre-peak state for home {home_id}")
        return {"actions": [], "message": "No state to restore"}

    for entry in saved_state:
        aid = entry["appliance_id"]
        prev_status = entry["prev_status"]

        # Only restore if device was ON before peak
        if prev_status not in ("ON", "WARNING"):
            continue

        try:
            app_result = db.table("appliances").select("*").eq("id", aid).limit(1).execute()
            if not app_result.data:
                continue
            appliance = app_result.data[0]

            # Skip if user already turned it on manually during peak
            if appliance["status"] == "ON":
                continue

            adapter = get_adapter(appliance)
            result = await adapter.turn_on(aid)
            _log_action(db, aid, user_id, "turn_on", "autopilot_restore", result.success)
            actions_taken.append({
                "appliance_id": aid,
                "name": appliance.get("name"),
                "action": "restore_on",
                "success": result.success,
            })
            logger.info(f"[Autopilot] Restored {appliance.get('name')} after peak exit")

        except Exception as e:
            logger.error(f"[Autopilot] Failed to restore {aid}: {e}")

    # Reset triggered flags on rules
    db.table("automation_rules").update({
        "is_triggered": False,
    }).eq("home_id", home_id).eq("is_triggered", True).execute()

    if actions_taken and user_id:
        count = len([a for a in actions_taken if a["success"]])
        db.table("notifications").insert({
            "user_id": user_id,
            "type": "autopilot",
            "title": "✅ Autopilot: Peak Ended — Restored",
            "message": f"Restored {count} appliance(s) to normal operation.",
            "icon": "check-circle",
            "color": "text-emerald-600",
            "bg_color": "bg-emerald-50",
        }).execute()

    return {"actions": actions_taken, "message": f"Restored {len(actions_taken)} appliances"}


def _log_action(db, appliance_id: str, user_id: str | None, action: str, source: str, success: bool):
    """Log to control_logs."""
    try:
        db.table("control_logs").insert({
            "appliance_id": appliance_id,
            "user_id": user_id,
            "action": action,
            "trigger_source": source,
            "result": "success" if success else "failed",
            "response_time_ms": 0,
        }).execute()
    except Exception:
        pass
