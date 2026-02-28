"""
Penalty Engine — Multi-objective optimization for Autopilot V2.

Computes a penalty score (0.0 – 1.0) for every hour of the day,
combining tariff cost and carbon intensity based on the user's strategy.

Formula:
  Total Penalty = (w1 × Normalized Cost) + (w2 × Normalized Carbon)

Where:
  Normalized Cost   = slot_rate / max_daily_rate     (0.0 → 1.0)
  Normalized Carbon = gCO₂_per_kwh / max_daily_gCO₂  (0.0 → 1.0)

Strategy weights:
  balanced    → w1=0.7, w2=0.3
  max_savings → w1=1.0, w2=0.0
  eco_mode    → w1=0.0, w2=1.0
"""

from __future__ import annotations
from datetime import datetime, time as dt_time
from typing import Literal, Optional
import logging

logger = logging.getLogger("voltwise.penalty_engine")

# Strategy weight presets
STRATEGY_WEIGHTS: dict[str, tuple[float, float]] = {
    "balanced":    (0.7, 0.3),
    "max_savings": (1.0, 0.0),
    "eco_mode":    (0.0, 1.0),
}

# Penalty threshold above which the AI should intervene
DEFAULT_PENALTY_THRESHOLD = 0.6


def _get_slot_for_hour(hour: int, tariff_slots: list[dict]) -> dict | None:
    """Find the tariff slot for a given hour (handles midnight crossing)."""
    for s in tariff_slots:
        start_h = s["start_hour"]
        end_h = s["end_hour"]
        if start_h < end_h:
            if start_h <= hour < end_h:
                return s
        else:
            if hour >= start_h or hour < end_h:
                return s
    return None


def calculate_hourly_penalty(
    hour: int,
    tariff_slots: list[dict],
    carbon_profile: list[dict],
    strategy: str = "balanced",
) -> float:
    """
    Compute penalty score for a single hour.
    Returns a float between 0.0 (best) and 1.0 (worst).
    """
    w1, w2 = STRATEGY_WEIGHTS.get(strategy, STRATEGY_WEIGHTS["balanced"])

    # ── Normalize cost ──
    slot = _get_slot_for_hour(hour, tariff_slots)
    if not slot:
        norm_cost = 0.5  # fallback
    else:
        all_rates = [s["rate"] for s in tariff_slots]
        max_rate = max(all_rates) if all_rates else 1
        min_rate = min(all_rates) if all_rates else 0
        rate_range = max_rate - min_rate
        if rate_range > 0:
            norm_cost = (float(slot["rate"]) - min_rate) / rate_range
        else:
            norm_cost = 0.5

    # ── Normalize carbon ──
    carbon_map = {p["hour"]: float(p["gco2_per_kwh"]) for p in carbon_profile}
    current_carbon = carbon_map.get(hour, 680)
    all_carbon = list(carbon_map.values()) if carbon_map else [680]
    max_carbon = max(all_carbon)
    min_carbon = min(all_carbon)
    carbon_range = max_carbon - min_carbon
    if carbon_range > 0:
        norm_carbon = (current_carbon - min_carbon) / carbon_range
    else:
        norm_carbon = 0.5

    penalty = (w1 * norm_cost) + (w2 * norm_carbon)
    return round(min(max(penalty, 0.0), 1.0), 4)


def get_penalty_timeline(
    tariff_slots: list[dict],
    carbon_profile: list[dict],
    strategy: str = "balanced",
) -> list[dict]:
    """
    Compute 24-hour penalty timeline.
    Returns: [{"hour": 0, "penalty": 0.42, "rate": 6.31, "gco2": 740, "label": "Low"}, ...]
    """
    carbon_map = {p["hour"]: float(p["gco2_per_kwh"]) for p in carbon_profile}
    timeline = []

    for h in range(24):
        penalty = calculate_hourly_penalty(h, tariff_slots, carbon_profile, strategy)
        slot = _get_slot_for_hour(h, tariff_slots)
        rate = float(slot["rate"]) if slot else 0
        gco2 = carbon_map.get(h, 680)
        slot_type = slot["slot_type"] if slot else "normal"

        # Label
        if penalty < 0.3:
            label = "Excellent"
        elif penalty < 0.5:
            label = "Good"
        elif penalty < DEFAULT_PENALTY_THRESHOLD:
            label = "Fair"
        elif penalty < 0.8:
            label = "High"
        else:
            label = "Critical"

        timeline.append({
            "hour": h,
            "penalty": penalty,
            "rate": rate,
            "gco2": gco2,
            "slot_type": slot_type,
            "label": label,
        })

    return timeline


def should_delay_appliance(
    device_config: dict,
    current_penalty: float,
    threshold: float = DEFAULT_PENALTY_THRESHOLD,
    current_time: datetime | None = None,
) -> bool:
    """
    Decide whether the AI should delay/pause this appliance right now.

    Priority order:
    1. Protected window → never touch (return False)
    2. Override active → skip (return False)
    3. Not delegated → skip (return False)
    4. Penalty > threshold → delay (return True)
    """
    # Not delegated to AI
    if not device_config.get("is_delegated", True):
        return False

    # Override active (user/physical switch took control)
    if device_config.get("override_active", False):
        override_until = device_config.get("override_until")
        if override_until:
            # Check if override has expired
            if current_time and isinstance(override_until, str):
                from datetime import timezone
                try:
                    until = datetime.fromisoformat(override_until.replace("Z", "+00:00"))
                    if current_time > until:
                        pass  # Override expired, continue to penalty check
                    else:
                        return False
                except (ValueError, TypeError):
                    return False
            else:
                return False
        else:
            return False

    # Protected window check
    if device_config.get("protected_window_enabled", False):
        start_str = device_config.get("protected_window_start")
        end_str = device_config.get("protected_window_end")
        if start_str and end_str and current_time:
            try:
                from zoneinfo import ZoneInfo
            except ImportError:
                from backports.zoneinfo import ZoneInfo

            from app.config import get_settings
            tz = ZoneInfo(get_settings().timezone)
            now_local = current_time.astimezone(tz) if current_time.tzinfo else current_time

            # Parse time strings "HH:MM" or "HH:MM:SS"
            parts_start = start_str.split(":")
            parts_end = end_str.split(":")
            window_start = dt_time(int(parts_start[0]), int(parts_start[1]))
            window_end = dt_time(int(parts_end[0]), int(parts_end[1]))
            current_t = now_local.time()

            # Handle midnight-crossing windows (e.g., 22:00 → 06:00)
            if window_start <= window_end:
                if window_start <= current_t <= window_end:
                    return False  # Inside protected window
            else:
                if current_t >= window_start or current_t <= window_end:
                    return False  # Inside protected window
        elif start_str and end_str:
            # No current_time provided, check against system time
            try:
                from zoneinfo import ZoneInfo
            except ImportError:
                from backports.zoneinfo import ZoneInfo

            from app.config import get_settings
            tz = ZoneInfo(get_settings().timezone)
            now_local = datetime.now(tz)
            parts_start = start_str.split(":")
            parts_end = end_str.split(":")
            window_start = dt_time(int(parts_start[0]), int(parts_start[1]))
            window_end = dt_time(int(parts_end[0]), int(parts_end[1]))
            current_t = now_local.time()

            if window_start <= window_end:
                if window_start <= current_t <= window_end:
                    return False
            else:
                if current_t >= window_start or current_t <= window_end:
                    return False

    # Penalty check
    return current_penalty > threshold


def find_optimal_run_window(
    tariff_slots: list[dict],
    carbon_profile: list[dict],
    strategy: str = "balanced",
    duration_hours: int = 1,
) -> dict:
    """
    Find the best contiguous window of `duration_hours` to run an appliance.
    Returns: {"start_hour": 10, "end_hour": 12, "avg_penalty": 0.25, "avg_rate": 7.42, "avg_gco2": 520}
    """
    timeline = get_penalty_timeline(tariff_slots, carbon_profile, strategy)

    if duration_hours >= 24:
        avg_p = sum(t["penalty"] for t in timeline) / 24
        return {"start_hour": 0, "end_hour": 0, "avg_penalty": avg_p, "avg_rate": 0, "avg_gco2": 0}

    best_start = 0
    best_avg = float("inf")

    for start in range(24):
        hours = [(start + i) % 24 for i in range(duration_hours)]
        avg = sum(timeline[h]["penalty"] for h in hours) / duration_hours
        if avg < best_avg:
            best_avg = avg
            best_start = start

    end_hour = (best_start + duration_hours) % 24
    hours = [(best_start + i) % 24 for i in range(duration_hours)]
    avg_rate = sum(timeline[h]["rate"] for h in hours) / duration_hours
    avg_gco2 = sum(timeline[h]["gco2"] for h in hours) / duration_hours

    return {
        "start_hour": best_start,
        "end_hour": end_hour,
        "avg_penalty": round(best_avg, 4),
        "avg_rate": round(avg_rate, 2),
        "avg_gco2": round(avg_gco2, 1),
    }


def get_current_penalty(
    tariff_slots: list[dict],
    carbon_profile: list[dict],
    strategy: str = "balanced",
) -> dict:
    """Get penalty score for the current hour."""
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo

    from app.config import get_settings
    tz = ZoneInfo(get_settings().timezone)
    current_hour = datetime.now(tz).hour

    penalty = calculate_hourly_penalty(current_hour, tariff_slots, carbon_profile, strategy)
    slot = _get_slot_for_hour(current_hour, tariff_slots)
    carbon_map = {p["hour"]: float(p["gco2_per_kwh"]) for p in carbon_profile}

    return {
        "hour": current_hour,
        "penalty": penalty,
        "rate": float(slot["rate"]) if slot else 0,
        "gco2": carbon_map.get(current_hour, 680),
        "slot_type": slot["slot_type"] if slot else "normal",
        "above_threshold": penalty > DEFAULT_PENALTY_THRESHOLD,
        "threshold": DEFAULT_PENALTY_THRESHOLD,
    }
