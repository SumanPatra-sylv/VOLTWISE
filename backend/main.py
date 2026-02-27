"""
VoltWise Backend — FastAPI + APScheduler Entry Point

Lifecycle:
  startup  → init APScheduler, restore active schedules, start tariff watcher
  shutdown → graceful APScheduler shutdown

Run:
  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations
from contextlib import asynccontextmanager
import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import get_settings
from app.routers.appliances import router as appliances_router
from app.routers.autopilot import router as autopilot_router
from app.services.scheduler_manager import set_scheduler, restore_active_schedules
from app.services.tariff_watcher import tariff_transition_watcher

# ── Logging ─────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-28s │ %(levelname)-5s │ %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger("voltwise")


# ── APScheduler ─────────────────────────────────────────────────────

scheduler = AsyncIOScheduler(
    job_defaults={
        "coalesce": True,           # Merge missed executions into one
        "max_instances": 3,
        "misfire_grace_time": 300,  # 5 min grace for misfired jobs
    }
)


# ── Lifespan ────────────────────────────────────────────────────────

def _verify_db_access():
    """Fail-fast check: confirm the service_role has table-level GRANTs."""
    from app.database import get_supabase
    db = get_supabase()
    try:
        # Simple SELECT on a core table — if this fails, the backend cannot operate
        db.table("appliances").select("id").limit(1).execute()
        logger.info("DB connectivity check PASSED (service_role has table access)")
    except Exception as exc:
        logger.critical(
            "DB connectivity check FAILED: %s\n"
            "→ Run sql/10_grant_service_role.sql in Supabase SQL Editor to fix.\n"
            "  The service_role needs GRANT ALL ON ALL TABLES IN SCHEMA public.",
            exc,
        )
        raise SystemExit(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup & shutdown logic."""
    logger.info("═══ VoltWise Backend starting ═══")

    # Verify DB access before anything else
    _verify_db_access()

    # Inject scheduler into manager
    set_scheduler(scheduler)

    # Add tariff watcher cron (every 60 seconds)
    scheduler.add_job(
        tariff_transition_watcher,
        trigger=IntervalTrigger(seconds=60),
        id="tariff_watcher",
        replace_existing=True,
        name="Tariff Transition Watcher",
    )

    # Start scheduler
    scheduler.start()
    logger.info(f"APScheduler started with {len(scheduler.get_jobs())} jobs")

    # Restore active schedules from DB
    try:
        await restore_active_schedules()
    except Exception as e:
        logger.error(f"Failed to restore schedules: {e}")
        # Non-fatal — server still starts

    logger.info(f"APScheduler now has {len(scheduler.get_jobs())} jobs (after restore)")
    logger.info("═══ VoltWise Backend ready ═══")

    yield  # ── App is running ──

    # Shutdown
    logger.info("═══ VoltWise Backend shutting down ═══")
    scheduler.shutdown(wait=False)
    logger.info("APScheduler stopped")


# ── FastAPI App ─────────────────────────────────────────────────────

app = FastAPI(
    title="VoltWise Backend",
    description="Smart energy management — schedule execution, device control, tariff optimization",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server and production origins
settings = get_settings()
origins = [origin.strip() for origin in settings.cors_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(appliances_router)
app.include_router(autopilot_router)


# ── Root ────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "service": "voltwise-backend",
        "version": "1.0.0",
        "docs": "/docs",
    }
