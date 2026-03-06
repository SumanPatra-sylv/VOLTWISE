"""
Power Analytics Router — Real-time per-appliance power via Smart Plug + NILM.

Endpoints:
  GET /api/power-analytics/snapshot   — Live aggregate + per-appliance watts
  GET /api/power-analytics/timeline   — Time-series for area chart
  GET /api/power-analytics/breakdown  — Donut-chart-ready breakdown
  GET /api/power-analytics/sources    — Which appliances use smart plug vs NILM
"""

from __future__ import annotations
from fastapi import APIRouter, Query
from app.services.nilm_service import get_power_analytics_service

router = APIRouter(prefix="/api/power-analytics", tags=["power-analytics"])


@router.get("/snapshot")
async def get_snapshot(home_id: str = Query(..., description="Home ID")):
    """Live aggregate + per-appliance power snapshot."""
    svc = get_power_analytics_service()
    return svc.get_live_snapshot(home_id)


@router.get("/timeline")
async def get_timeline(
    home_id: str = Query(..., description="Home ID"),
    hours: int = Query(24, ge=1, le=168, description="Hours of history"),
):
    """Time-series power data for area chart (5-min intervals)."""
    svc = get_power_analytics_service()
    data = svc.get_power_timeline(home_id, hours)
    return {"home_id": home_id, "hours": hours, "data": data}


@router.get("/breakdown")
async def get_breakdown(home_id: str = Query(..., description="Home ID")):
    """Per-appliance breakdown with percentages (donut chart)."""
    svc = get_power_analytics_service()
    return svc.get_appliance_breakdown(home_id)


@router.get("/sources")
async def get_sources(home_id: str = Query(..., description="Home ID")):
    """Which appliances use smart plug vs NILM."""
    svc = get_power_analytics_service()
    return svc.get_sources(home_id)
