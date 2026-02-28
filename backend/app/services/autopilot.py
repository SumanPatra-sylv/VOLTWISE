"""
Autopilot Service V2 — Strategy-based optimization engine.

Three strategy modes:
  1. Balanced    — Delays appliances when BOTH tariff AND carbon are high
  2. Max Savings — Aggressively shifts to cheapest hours (cost only)
  3. Eco Mode    — Prioritizes lowest carbon-intensity hours

Per-device configuration via `device_autopilot_config` table:
  - preferred_action: turn_off | eco_mode | delay_start | limit_power
  - protected_window: time range where AI never touches the device
  - override: physical/user override pauses AI for that device

Pre-peak state now stored in `autopilot_saved_state` table (survives restarts).

Called by transition_watcher when penalty threshold is crossed.
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Literal
import logging

from app.database import get_supabase
from app.adapters import get_adapter
from app.services.penalty_engine import (
    calculate_hourly_penalty,
    should_delay_appliance,
    get_penalty_timeline,
    get_current_penalty,
    DEFAULT_PENALTY_THRESHOLD,
)
from app.services.carbon import get_daily_carbon_profile, _get_region_for_home

logger = logging.getLogger("voltwise.autopilot")


async def execute_strategy_action(
    home_id: str,
    user_id: str | None,
    trigger: str = "penalty_threshold",
) -> dict:
    """
    Execute autopilot actions based on the home's strategy and per-device config.

    Called when:
    - Penalty score crosses threshold (tariff/carbon transition)
    - Peak tariff starts
    - Carbon intensity changes significantly

    Args:
        home_id: The home to process
        user_id: For notifications and logging
        trigger: What caused this execution (peak_tariff | high_carbon | penalty_threshold)

    Returns summary of actions taken.
    """
    db = get_supabase()
    actions_taken = []

    # 1. Get home strategy
    home_result = db.table("homes").select(
        "autopilot_strategy, autopilot_enabled, tariff_plan_id"
    ).eq("id", home_id).limit(1).execute()

    if not home_result.data:
        return {"actions": [], "message": "Home not found"}

    home = home_result.data[0]
    if not home.get("autopilot_enabled"):
        return {"actions": [], "message": "Autopilot disabled"}

    strategy = home.get("autopilot_strategy", "balanced")

    # 2. Get tariff slots for this home's plan
    plan_id = home.get("tariff_plan_id")
    tariff_slots = []
    if plan_id:
        slots_result = db.table("tariff_slots").select("*").eq("plan_id", plan_id).execute()
        tariff_slots = slots_result.data or []

    # 3. Get carbon profile for this home's region
    region_code = _get_region_for_home(home_id)
    carbon_profile = get_daily_carbon_profile(region_code)

    # 4. Calculate current penalty
    current_penalty_data = get_current_penalty(tariff_slots, carbon_profile, strategy)
    current_penalty = current_penalty_data["penalty"]

    if not current_penalty_data["above_threshold"]:
        logger.info(
            f"[Autopilot] Penalty {current_penalty:.3f} below threshold for home {home_id}, no action"
        )
        return {"actions": [], "message": f"Penalty {current_penalty:.3f} below threshold"}

    # 5. Fetch all device configs for this home
    configs_result = db.table("device_autopilot_config").select("*").eq(
        "home_id", home_id
    ).eq("is_delegated", True).execute()

    configs = configs_result.data or []
    if not configs:
        # Fallback: check legacy automation_rules
        return await _execute_legacy_rules(home_id, user_id, db)

    # 6. Fetch all appliances in one query
    appliance_ids = [c["appliance_id"] for c in configs]
    app_result = db.table("appliances").select("*").eq(
        "home_id", home_id
    ).eq("is_active", True).eq("is_controllable", True).execute()

    appliances = {a["id"]: a for a in (app_result.data or [])}

    # 7. Get current time for protected window checks
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo

    from app.config import get_settings
    tz = ZoneInfo(get_settings().timezone)
    now = datetime.now(tz)

    # 8. Process each delegated device
    for config in configs:
        aid = config["appliance_id"]
        if aid not in appliances:
            continue

        appliance = appliances[aid]

        # Check if we should delay this appliance
        if not should_delay_appliance(config, current_penalty, DEFAULT_PENALTY_THRESHOLD, now):
            continue

        # Skip if already OFF
        if appliance["status"] == "OFF":
            continue

        # Check for physical override: if user recently turned it ON during high penalty
        if await _is_user_override(db, aid, now):
            # Mark override in config
            _set_override(db, config["id"], aid, tariff_slots, carbon_profile, strategy, now)
            logger.info(f"[Autopilot] Physical override detected for {appliance['name']}, skipping")
            continue

        # Save state before acting
        _save_state(db, home_id, aid, appliance["status"], appliance.get("eco_mode_enabled", False), trigger)

        # Execute the device's preferred action
        preferred_action = config.get("preferred_action", "delay_start")

        # Eco mode only supported on certain appliance categories
        eco_supported = ("ac", "washing_machine", "refrigerator")
        if preferred_action in ("eco_mode", "limit_power") and appliance.get("category") not in eco_supported:
            preferred_action = "turn_off"  # Fallback for unsupported devices
            logger.info(
                f"[Autopilot] eco_mode not supported for {appliance.get('category')} "
                f"({appliance.get('name')}), falling back to turn_off"
            )

        try:
            adapter = get_adapter(appliance)

            if preferred_action == "turn_off":
                if appliance["status"] in ("ON", "WARNING"):
                    result = await adapter.turn_off(aid)
                    _log_action(db, aid, user_id, "turn_off", f"autopilot_{trigger}", result.success)
                    actions_taken.append({
                        "appliance_id": aid,
                        "name": appliance.get("name"),
                        "action": "turn_off",
                        "success": result.success,
                    })

            elif preferred_action == "eco_mode":
                if not appliance.get("eco_mode_enabled"):
                    result = await adapter.set_eco_mode(aid, True)
                    _log_action(db, aid, user_id, "eco_mode_on", f"autopilot_{trigger}", result.success)
                    actions_taken.append({
                        "appliance_id": aid,
                        "name": appliance.get("name"),
                        "action": "eco_mode",
                        "success": result.success,
                    })

            elif preferred_action == "delay_start":
                # For delay_start: turn off now, will be restored when penalty drops
                if appliance["status"] in ("ON", "WARNING"):
                    result = await adapter.turn_off(aid)
                    _log_action(db, aid, user_id, "delay_start_off", f"autopilot_{trigger}", result.success)
                    actions_taken.append({
                        "appliance_id": aid,
                        "name": appliance.get("name"),
                        "action": "delay_start",
                        "success": result.success,
                    })

            elif preferred_action == "limit_power":
                # For limit_power: set eco mode as a proxy for power reduction
                if not appliance.get("eco_mode_enabled"):
                    result = await adapter.set_eco_mode(aid, True)
                    _log_action(db, aid, user_id, "limit_power", f"autopilot_{trigger}", result.success)
                    actions_taken.append({
                        "appliance_id": aid,
                        "name": appliance.get("name"),
                        "action": "limit_power",
                        "success": result.success,
                    })

            logger.info(
                f"[Autopilot] {preferred_action} on {appliance.get('name')} "
                f"(strategy={strategy}, penalty={current_penalty:.3f}, trigger={trigger})"
            )

        except Exception as e:
            logger.error(f"[Autopilot] Failed action on {aid}: {e}")
            actions_taken.append({
                "appliance_id": aid,
                "name": appliance.get("name"),
                "action": preferred_action,
                "success": False,
                "error": str(e),
            })

    # Also mark any legacy automation_rules as triggered
    db.table("automation_rules").update({
        "is_triggered": True,
        "last_triggered": datetime.now(timezone.utc).isoformat(),
    }).eq("home_id", home_id).eq("is_active", True).eq(
        "condition_type", "peak_tariff"
    ).execute()

    # Create notification
    if actions_taken and user_id:
        count = len([a for a in actions_taken if a["success"]])
        strategy_labels = {
            "balanced": "Balanced",
            "max_savings": "Max Savings",
            "eco_mode": "Eco Mode",
        }
        strategy_label = strategy_labels.get(strategy, strategy)

        trigger_labels = {
            "peak_tariff": "Peak tariff detected",
            "high_carbon": "High carbon intensity",
            "penalty_threshold": "High penalty score",
        }
        trigger_label = trigger_labels.get(trigger, trigger)

        db.table("notifications").insert({
            "user_id": user_id,
            "type": "autopilot",
            "title": f"🤖 Autopilot: {strategy_label} Mode Active",
            "message": f"{trigger_label} — managed {count} appliance(s).",
            "icon": "bot",
            "color": "text-indigo-600",
            "bg_color": "bg-indigo-50",
            "metadata": {
                "trigger": trigger,
                "strategy": strategy,
                "penalty": current_penalty,
                "actions_count": count,
            },
        }).execute()

    return {
        "actions": actions_taken,
        "strategy": strategy,
        "penalty": current_penalty,
        "message": f"Executed {len(actions_taken)} actions (strategy={strategy}, penalty={current_penalty:.3f})",
    }


async def execute_strategy_restore(home_id: str, user_id: str | None) -> dict:
    """
    Penalty dropped below threshold — restore saved states.
    Called when penalty score drops back to acceptable levels.
    """
    db = get_supabase()
    actions_taken = []

    # Get all un-restored saved states for this home (excluding grid events)
    saved_result = db.table("autopilot_saved_state").select(
        "*, appliances(id, name, status, is_controllable)"
    ).eq("home_id", home_id).is_(
        "restored_at", "null"
    ).neq("trigger_type", "grid_event").execute()

    saved_states = saved_result.data or []
    if not saved_states:
        logger.info(f"[Autopilot] No saved state to restore for home {home_id}")
        return {"actions": [], "message": "No state to restore"}

    for entry in saved_states:
        aid = entry["appliance_id"]
        prev_status = entry["prev_status"]
        prev_eco = entry.get("prev_eco_mode", False)
        appliance = entry.get("appliances")

        if not appliance:
            continue

        # Only restore if was ON before
        if prev_status not in ("ON", "WARNING"):
            # Just mark as restored
            db.table("autopilot_saved_state").update({
                "restored_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", entry["id"]).execute()
            continue

        # Skip if user already turned it ON manually (physical override respected)
        if appliance["status"] == "ON":
            db.table("autopilot_saved_state").update({
                "restored_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", entry["id"]).execute()
            continue

        try:
            adapter = get_adapter(appliance)
            result = await adapter.turn_on(aid)
            _log_action(db, aid, user_id, "turn_on", "autopilot_restore", result.success)

            # Restore eco mode state
            if not prev_eco and appliance.get("eco_mode_enabled"):
                await adapter.set_eco_mode(aid, False)

            db.table("autopilot_saved_state").update({
                "restored_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", entry["id"]).execute()

            actions_taken.append({
                "appliance_id": aid,
                "name": appliance.get("name"),
                "action": "restore_on",
                "success": result.success,
            })
            logger.info(f"[Autopilot] Restored {appliance.get('name')} after penalty drop")

        except Exception as e:
            logger.error(f"[Autopilot] Failed to restore {aid}: {e}")

    # Clear override flags for this home's devices
    db.table("device_autopilot_config").update({
        "override_active": False,
        "override_until": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("home_id", home_id).eq("override_active", True).execute()

    # Reset triggered flags on legacy rules
    db.table("automation_rules").update({
        "is_triggered": False,
    }).eq("home_id", home_id).eq("is_triggered", True).execute()

    if actions_taken and user_id:
        count = len([a for a in actions_taken if a["success"]])
        db.table("notifications").insert({
            "user_id": user_id,
            "type": "autopilot",
            "title": "✅ Autopilot: Conditions Improved — Restored",
            "message": f"Restored {count} appliance(s) to normal operation.",
            "icon": "check-circle",
            "color": "text-emerald-600",
            "bg_color": "bg-emerald-50",
        }).execute()

    return {"actions": actions_taken, "message": f"Restored {len(actions_taken)} appliances"}


# ── Legacy rule execution (backward compat) ─────────────────────────

async def _execute_legacy_rules(home_id: str, user_id: str | None, db) -> dict:
    """Fallback: execute old-style automation_rules if no device_autopilot_config exists."""
    actions_taken = []

    rules_result = db.table("automation_rules").select("*").eq(
        "home_id", home_id
    ).eq("is_active", True).execute()

    rules = rules_result.data or []
    if not rules:
        return {"actions": [], "message": "No rules or device configs"}

    app_result = db.table("appliances").select("*").eq(
        "home_id", home_id
    ).eq("is_active", True).eq("is_controllable", True).execute()

    appliances = {a["id"]: a for a in (app_result.data or [])}

    for rule in rules:
        if rule["condition_type"] != "peak_tariff":
            continue

        target_ids = rule.get("target_appliance_ids") or []
        action = rule["action"]

        for aid in target_ids:
            if aid not in appliances:
                continue
            appliance = appliances[aid]

            # Save state
            _save_state(db, home_id, aid, appliance["status"], appliance.get("eco_mode_enabled", False), "peak_tariff")

            try:
                adapter = get_adapter(appliance)
                if action == "turn_off" and appliance["status"] in ("ON", "WARNING"):
                    result = await adapter.turn_off(aid)
                    _log_action(db, aid, user_id, "turn_off", "autopilot_peak", result.success)
                    actions_taken.append({"appliance_id": aid, "name": appliance.get("name"), "action": "turn_off", "success": result.success})
                elif action == "eco_mode":
                    result = await adapter.set_eco_mode(aid, True)
                    _log_action(db, aid, user_id, "eco_mode_on", "autopilot_peak", result.success)
                    actions_taken.append({"appliance_id": aid, "name": appliance.get("name"), "action": "eco_mode", "success": result.success})
            except Exception as e:
                logger.error(f"[Autopilot] Legacy rule failed on {aid}: {e}")

        db.table("automation_rules").update({
            "is_triggered": True,
            "last_triggered": datetime.now(timezone.utc).isoformat(),
        }).eq("id", rule["id"]).execute()

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

    return {"actions": actions_taken, "message": f"Legacy: {len(actions_taken)} actions"}


# ── Helper functions ────────────────────────────────────────────────

async def _is_user_override(db, appliance_id: str, now: datetime) -> bool:
    """
    Check if the user recently (last 5 min) toggled this appliance ON manually.
    This indicates a physical or user-app override.
    """
    from datetime import timedelta
    five_min_ago = (now - timedelta(minutes=5)).isoformat()

    logs_result = db.table("control_logs").select("id, trigger_source, action").eq(
        "appliance_id", appliance_id
    ).gte("created_at", five_min_ago).order("created_at", desc=True).limit(1).execute()

    if logs_result.data:
        last_log = logs_result.data[0]
        # If the last action was a user-initiated turn_on, it's an override
        if last_log["action"] in ("turn_on",) and last_log["trigger_source"] in ("user", "physical", "manual"):
            return True

    return False


def _set_override(db, config_id: str, appliance_id: str, tariff_slots, carbon_profile, strategy, now):
    """Mark a device as user-overridden. Override expires when penalty drops."""
    # Find when penalty drops below threshold next
    timeline = get_penalty_timeline(tariff_slots, carbon_profile, strategy)
    current_hour = now.hour

    override_until = None
    for offset in range(1, 25):
        future_hour = (current_hour + offset) % 24
        if timeline[future_hour]["penalty"] < DEFAULT_PENALTY_THRESHOLD:
            # Override until this hour
            override_dt = now.replace(hour=future_hour, minute=0, second=0, microsecond=0)
            if future_hour <= current_hour:
                from datetime import timedelta
                override_dt += timedelta(days=1)
            override_until = override_dt.isoformat()
            break

    db.table("device_autopilot_config").update({
        "override_active": True,
        "override_until": override_until,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", config_id).execute()


def _save_state(db, home_id: str, appliance_id: str, status: str, eco_mode: bool, trigger: str):
    """Save appliance state to DB (replaces in-memory _pre_peak_state)."""
    try:
        db.table("autopilot_saved_state").upsert({
            "home_id": home_id,
            "appliance_id": appliance_id,
            "prev_status": status,
            "prev_eco_mode": eco_mode,
            "trigger_type": trigger,
            "saved_at": datetime.now(timezone.utc).isoformat(),
            "restored_at": None,
        }, on_conflict="home_id,appliance_id,trigger_type").execute()
    except Exception as e:
        logger.warning(f"[Autopilot] Failed to save state for {appliance_id}: {e}")


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
