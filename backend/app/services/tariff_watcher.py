"""
Tariff Watcher — Cron job that detects tariff slot transitions.

Runs every minute. At slot boundaries (e.g., 6 PM sharp → peak starts),
it can auto-execute autopilot actions for enrolled homes.
"""

from __future__ import annotations
from datetime import datetime
import logging

from app.config import get_settings
from app.database import get_supabase

logger = logging.getLogger("voltwise.tariff_watcher")

# Cache: last known slot per home to detect transitions
_last_slot_cache: dict[str, str] = {}


def _get_slot_for_hour(hour: int, slots: list[dict]) -> dict | None:
    """Python port of frontend getSlotForHour (handles midnight crossing)."""
    for s in slots:
        start_h = s["start_hour"]
        end_h = s["end_hour"]
        if start_h < end_h:
            if start_h <= hour < end_h:
                return s
        else:
            # Midnight crossing (e.g., 22→6)
            if hour >= start_h or hour < end_h:
                return s
    return None


async def tariff_transition_watcher() -> None:
    """
    Runs every 1 minute via APScheduler.
    Detects when a home crosses a tariff slot boundary.
    """
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo

    try:
        tz = ZoneInfo(get_settings().timezone)
        now = datetime.now(tz)
        current_hour = now.hour
        current_minute = now.minute

        # Only act on the first minute of each hour (slot boundaries)
        if current_minute != 0:
            return

        db = get_supabase()

        # Get all active homes with tariff plans
        homes_result = db.table("homes").select(
            "id, user_id, tariff_plan_id"
        ).not_.is_("tariff_plan_id", "null").execute()

        if not homes_result.data:
            return

        # Group by tariff plan to avoid re-fetching slots
        plan_slots_cache: dict[str, list[dict]] = {}

        for home in homes_result.data:
            plan_id = home["tariff_plan_id"]
            home_id = home["id"]

            # Fetch slots for this plan (cached)
            if plan_id not in plan_slots_cache:
                slots_result = db.table("tariff_slots").select(
                    "*"
                ).eq("plan_id", plan_id).execute()
                plan_slots_cache[plan_id] = slots_result.data or []

            slots = plan_slots_cache[plan_id]
            current_slot = _get_slot_for_hour(current_hour, slots)
            prev_slot = _get_slot_for_hour((current_hour - 1) % 24, slots)

            if not current_slot or not prev_slot:
                continue

            current_type = current_slot["slot_type"]
            prev_type = prev_slot["slot_type"]

            # No transition → skip
            if current_type == prev_type:
                continue

            logger.info(
                f"[TariffWatcher] Home {home_id}: {prev_type} → {current_type} "
                f"(hour {current_hour})"
            )

            # Transition detected — create notification
            user_id = home["user_id"]
            if current_type == "peak":
                db.table("notifications").insert({
                    "user_id": user_id,
                    "type": "peak",
                    "title": "⚡ Peak Tariff Started",
                    "message": f"Electricity rate is now ₹{current_slot['rate']}/kWh. "
                               f"Consider turning off heavy appliances.",
                    "icon": "zap",
                    "color": "text-rose-600",
                    "bg_color": "bg-rose-50",
                }).execute()

                # Execute autopilot peak entry if enabled
                await _run_autopilot_if_enabled(db, home_id, user_id, "peak_entry")

            elif prev_type == "peak":
                db.table("notifications").insert({
                    "user_id": user_id,
                    "type": "peak",
                    "title": "✅ Peak Tariff Ended",
                    "message": f"Rate dropped to ₹{current_slot['rate']}/kWh ({current_type}). "
                               f"Safe to run heavy appliances now.",
                    "icon": "check-circle",
                    "color": "text-emerald-600",
                    "bg_color": "bg-emerald-50",
                }).execute()

                # Execute autopilot peak exit — restore appliances
                await _run_autopilot_if_enabled(db, home_id, user_id, "peak_exit")

    except Exception as e:
        logger.error(f"[TariffWatcher] Error: {e}", exc_info=True)


async def _run_autopilot_if_enabled(db, home_id: str, user_id: str, event: str) -> None:
    """Check if autopilot is enabled for home and execute."""
    try:
        home_result = db.table("homes").select("autopilot_enabled").eq(
            "id", home_id
        ).limit(1).execute()

        if not home_result.data:
            return

        if not home_result.data[0].get("autopilot_enabled"):
            return

        from app.services.autopilot import execute_peak_entry, execute_peak_exit

        if event == "peak_entry":
            result = await execute_peak_entry(home_id, user_id)
            logger.info(f"[TariffWatcher] Autopilot peak_entry: {result}")
        elif event == "peak_exit":
            result = await execute_peak_exit(home_id, user_id)
            logger.info(f"[TariffWatcher] Autopilot peak_exit: {result}")

    except Exception as e:
        logger.error(f"[TariffWatcher] Autopilot execution failed: {e}", exc_info=True)
