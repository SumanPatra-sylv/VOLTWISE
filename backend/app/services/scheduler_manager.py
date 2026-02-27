"""
Scheduler Manager — Bridges APScheduler with schedule execution.

Converts schedule DB records into APScheduler trigger jobs.
On startup, re-registers all active schedules from DB.
"""

from __future__ import annotations
from datetime import datetime, date, time as dt_time
from typing import Optional
import logging
import asyncio

logger = logging.getLogger("voltwise.scheduler_manager")

# Global reference — set by main.py on startup
_scheduler = None


def set_scheduler(scheduler) -> None:
    """Called once by main.py to inject the APScheduler instance."""
    global _scheduler
    _scheduler = scheduler


def get_scheduler():
    """Get the global APScheduler instance."""
    return _scheduler


async def register_schedule_jobs(
    schedule_id: str,
    appliance_id: str,
    home_id: str,
    user_id: str,
    start_time: str,       # "HH:MM"
    end_time: Optional[str],   # "HH:MM" or None
    repeat_type: str = "once",
    custom_days: Optional[list[int]] = None,
) -> None:
    """
    Register APScheduler jobs for a schedule.

    For 'once': DateTrigger at next occurrence of start_time.
    For 'daily': CronTrigger every day at start_time.
    For 'weekdays': CronTrigger Mon-Fri.
    For 'weekends': CronTrigger Sat-Sun.
    For 'custom': CronTrigger on specified day_of_week.
    """
    if _scheduler is None:
        logger.error("[SchedulerManager] APScheduler not initialized")
        return

    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo

    from app.config import get_settings
    tz = ZoneInfo(get_settings().timezone)

    parts = start_time.split(":")
    h, m = int(parts[0]), int(parts[1])  # handles both HH:MM and HH:MM:SS
    job_id_on = f"sched_{schedule_id}_on"
    job_id_off = f"sched_{schedule_id}_off"

    # Remove existing jobs for this schedule (idempotent re-registration)
    for jid in [job_id_on, job_id_off]:
        try:
            _scheduler.remove_job(jid)
        except Exception:
            pass

    # Build trigger kwargs based on repeat_type
    if repeat_type == "once":
        # Next occurrence of HH:MM in local timezone
        now = datetime.now(tz)
        run_date = datetime.combine(
            now.date() if (now.hour < h or (now.hour == h and now.minute < m)) else date.today(),
            dt_time(h, m),
            tzinfo=tz,
        )
        # If the time has already passed today, schedule for tomorrow
        if run_date <= now:
            from datetime import timedelta
            run_date += timedelta(days=1)

        _scheduler.add_job(
            _run_schedule_action,
            trigger="date",
            run_date=run_date,
            id=job_id_on,
            args=[schedule_id, appliance_id, "turn_on", home_id, user_id],
            replace_existing=True,
            misfire_grace_time=300,
        )
        logger.info(f"[SchedulerManager] Registered once turn_on at {run_date}")

        # End time (turn_off) if specified
        if end_time:
            eparts = end_time.split(":")
            eh, em = int(eparts[0]), int(eparts[1])
            end_date = datetime.combine(run_date.date(), dt_time(eh, em), tzinfo=tz)
            if end_date <= run_date:
                from datetime import timedelta
                end_date += timedelta(days=1)

            _scheduler.add_job(
                _run_schedule_action,
                trigger="date",
                run_date=end_date,
                id=job_id_off,
                args=[schedule_id, appliance_id, "turn_off", home_id, user_id],
                replace_existing=True,
                misfire_grace_time=300,
            )
            logger.info(f"[SchedulerManager] Registered once turn_off at {end_date}")

    else:
        # Recurring: use CronTrigger
        day_of_week_map = {
            "daily": "*",
            "weekdays": "mon-fri",
            "weekends": "sat,sun",
            "custom": None,
        }
        dow = day_of_week_map.get(repeat_type, "*")
        if repeat_type == "custom" and custom_days:
            day_names = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
            dow = ",".join(day_names[d] for d in custom_days if 0 <= d < 7)
        if not dow:
            dow = "*"

        _scheduler.add_job(
            _run_schedule_action,
            trigger="cron",
            hour=h,
            minute=m,
            day_of_week=dow,
            timezone=tz,
            id=job_id_on,
            args=[schedule_id, appliance_id, "turn_on", home_id, user_id],
            replace_existing=True,
            misfire_grace_time=300,
        )
        logger.info(f"[SchedulerManager] Registered cron turn_on at {h:02d}:{m:02d} (dow={dow})")

        if end_time:
            eparts = end_time.split(":")
            eh, em = int(eparts[0]), int(eparts[1])
            _scheduler.add_job(
                _run_schedule_action,
                trigger="cron",
                hour=eh,
                minute=em,
                day_of_week=dow,
                timezone=tz,
                id=job_id_off,
                args=[schedule_id, appliance_id, "turn_off", home_id, user_id],
                replace_existing=True,
                misfire_grace_time=300,
            )
            logger.info(f"[SchedulerManager] Registered cron turn_off at {eh:02d}:{em:02d}")


async def _run_schedule_action(schedule_id, appliance_id, action, home_id, user_id):
    """Async wrapper — AsyncIOScheduler runs this directly in the event loop."""
    from app.services.scheduler import execute_schedule_action
    await execute_schedule_action(schedule_id, appliance_id, action, home_id, user_id)


async def restore_active_schedules() -> None:
    """
    On startup: re-register APScheduler jobs for all active schedules.
    This ensures schedules survive server restarts.
    """
    from app.database import get_supabase
    db = get_supabase()

    result = db.table("schedules").select(
        "id, appliance_id, home_id, start_time, end_time, repeat_type, custom_days, "
        "appliances(home_id, homes(user_id))"
    ).eq("is_active", True).execute()

    if not result.data:
        logger.info("[SchedulerManager] No active schedules to restore")
        return

    count = 0
    for sched in result.data:
        try:
            # Extract user_id from the nested join
            user_id = None
            if sched.get("appliances") and sched["appliances"].get("homes"):
                user_id = sched["appliances"]["homes"].get("user_id")

            # start_time from DB may be "HH:MM:SS" — pass as-is, parser handles it
            await register_schedule_jobs(
                schedule_id=sched["id"],
                appliance_id=sched["appliance_id"],
                home_id=sched["home_id"],
                user_id=user_id or "",
                start_time=str(sched["start_time"]),
                end_time=str(sched["end_time"]) if sched.get("end_time") else None,
                repeat_type=sched.get("repeat_type", "once"),
                custom_days=sched.get("custom_days"),
            )
            count += 1
        except Exception as e:
            logger.error(f"[SchedulerManager] Failed to restore schedule {sched['id']}: {e}")

    logger.info(f"[SchedulerManager] Restored {count} active schedules")
