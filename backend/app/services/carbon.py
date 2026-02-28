"""
Carbon Intensity Service — Reads hourly gCO₂/kWh from the database.

Data source: `carbon_intensity_schedule` table, seeded with CEA-derived
time-of-day heuristic values per Indian grid region.

Architecture note: This currently reads from a static schedule table.
To integrate a live API (Electricity Maps, WattTime, CEA real-time),
replace `get_current_carbon_intensity()` with an API call and
fall back to the DB schedule on failure.
"""

from __future__ import annotations
from datetime import datetime
from typing import Optional
import logging

from app.config import get_settings
from app.database import get_supabase

logger = logging.getLogger("voltwise.carbon")

# Region code mapping: DISCOM state_code → carbon region
_STATE_TO_REGION: dict[str, str] = {
    "BR": "IN-BR",  # Bihar
    "GJ": "IN-GJ",  # Gujarat
}

# Fallback: Indian grid weighted average (CEA 2023-24)
INDIA_AVG_GCO2 = 680.0


def _get_region_for_home(home_id: str) -> str:
    """Resolve home → DISCOM → region_code."""
    db = get_supabase()
    try:
        result = db.table("homes").select(
            "tariff_plan_id, tariff_plans(discom_id, discoms(state_code))"
        ).eq("id", home_id).limit(1).execute()

        if result.data and result.data[0].get("tariff_plans"):
            plan = result.data[0]["tariff_plans"]
            if plan.get("discoms"):
                state_code = plan["discoms"]["state_code"]
                return _STATE_TO_REGION.get(state_code, "IN-BR")
    except Exception as e:
        logger.warning(f"[Carbon] Failed to resolve region for home {home_id}: {e}")

    return "IN-BR"  # Default fallback


def get_current_carbon_intensity(region_code: str) -> float:
    """
    Get the carbon intensity (gCO₂/kWh) for the current hour in a region.
    """
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo

    tz = ZoneInfo(get_settings().timezone)
    current_hour = datetime.now(tz).hour

    db = get_supabase()
    result = db.table("carbon_intensity_schedule").select("gco2_per_kwh").eq(
        "region_code", region_code
    ).eq("hour", current_hour).eq("is_active", True).order(
        "effective_from", desc=True
    ).limit(1).execute()

    if result.data:
        return float(result.data[0]["gco2_per_kwh"])

    logger.warning(f"[Carbon] No data for {region_code} hour {current_hour}, using India avg")
    return INDIA_AVG_GCO2


def get_carbon_for_hour(region_code: str, hour: int) -> float:
    """Get carbon intensity for a specific hour."""
    db = get_supabase()
    result = db.table("carbon_intensity_schedule").select("gco2_per_kwh").eq(
        "region_code", region_code
    ).eq("hour", hour).eq("is_active", True).order(
        "effective_from", desc=True
    ).limit(1).execute()

    if result.data:
        return float(result.data[0]["gco2_per_kwh"])
    return INDIA_AVG_GCO2


def get_daily_carbon_profile(region_code: str) -> list[dict]:
    """
    Get the full 24-hour carbon intensity profile for a region.
    Returns: [{"hour": 0, "gco2_per_kwh": 740}, ...]
    """
    db = get_supabase()
    result = db.table("carbon_intensity_schedule").select(
        "hour, gco2_per_kwh"
    ).eq("region_code", region_code).eq("is_active", True).order("hour").execute()

    if not result.data:
        logger.warning(f"[Carbon] No profile for {region_code}, generating defaults")
        return [{"hour": h, "gco2_per_kwh": INDIA_AVG_GCO2} for h in range(24)]

    # Deduplicate: take the latest effective_from for each hour
    seen: dict[int, dict] = {}
    for row in result.data:
        h = row["hour"]
        if h not in seen:
            seen[h] = {"hour": h, "gco2_per_kwh": float(row["gco2_per_kwh"])}

    return [seen.get(h, {"hour": h, "gco2_per_kwh": INDIA_AVG_GCO2}) for h in range(24)]


def get_daily_mean_carbon(region_code: str) -> float:
    """Calculate the daily mean gCO₂/kWh for a region."""
    profile = get_daily_carbon_profile(region_code)
    if not profile:
        return INDIA_AVG_GCO2
    return sum(p["gco2_per_kwh"] for p in profile) / len(profile)


def is_clean_energy_window(region_code: str) -> bool:
    """
    Returns True if current carbon intensity is below the daily mean.
    Analogous to 'off-peak' for cost — this is the 'off-peak' for carbon.
    """
    current = get_current_carbon_intensity(region_code)
    mean = get_daily_mean_carbon(region_code)
    return current < mean


def get_cleanest_hours(region_code: str, count: int = 4) -> list[int]:
    """
    Get the N hours with lowest carbon intensity.
    Useful for suggesting optimal run windows.
    """
    profile = get_daily_carbon_profile(region_code)
    sorted_hours = sorted(profile, key=lambda p: p["gco2_per_kwh"])
    return [p["hour"] for p in sorted_hours[:count]]


def get_carbon_status(home_id: str) -> dict:
    """
    Get comprehensive carbon status for a home.
    Returns current intensity, daily mean, whether it's clean, cleanest hours.
    """
    region = _get_region_for_home(home_id)
    current = get_current_carbon_intensity(region)
    mean = get_daily_mean_carbon(region)
    is_clean = current < mean
    cleanest = get_cleanest_hours(region, 4)
    profile = get_daily_carbon_profile(region)

    return {
        "region_code": region,
        "current_gco2": current,
        "daily_mean_gco2": round(mean, 1),
        "is_clean_window": is_clean,
        "cleanest_hours": cleanest,
        "profile": profile,
        "label": "Low Carbon" if is_clean else "High Carbon",
        "color": "emerald" if is_clean else "amber",
    }
