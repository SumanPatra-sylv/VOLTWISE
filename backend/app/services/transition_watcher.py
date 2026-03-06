"""
Transition Watcher — Detects tariff AND carbon intensity transitions.

Runs every minute via APScheduler. At slot boundaries:
  1. Tariff transitions (peak ↔ non-peak) — existing logic
  2. Carbon transitions (clean ↔ dirty) — new V2 logic
  3. Combined notifications when both conditions align
  4. Penalty-based autopilot triggers for strategy-mode homes

Replaces the original tariff_watcher.py with expanded scope.
"""

from __future__ import annotations
from datetime import datetime
import logging

from app.config import get_settings
from app.database import get_supabase

logger = logging.getLogger("voltwise.transition_watcher")

# Cache: last known states per home
_last_slot_cache: dict[str, str] = {}        # home_id → slot_type
_last_carbon_cache: dict[str, bool] = {}     # home_id → was_clean
_last_penalty_cache: dict[str, bool] = {}    # home_id → was_above_threshold


def _get_slot_for_hour(hour: int, slots: list[dict]) -> dict | None:
    """Python port of frontend getSlotForHour (handles midnight crossing)."""
    for s in slots:
        start_h = s["start_hour"]
        end_h = s["end_hour"]
        if start_h < end_h:
            if start_h <= hour < end_h:
                return s
        else:
            if hour >= start_h or hour < end_h:
                return s
    return None


def _get_heavy_appliance_names(db, home_id: str) -> list[str]:
    """Get names of heavy (tier 1-3) appliances that are currently OFF."""
    result = db.table("appliances").select("name, optimization_tier, status").eq(
        "home_id", home_id
    ).eq("is_active", True).eq("status", "OFF").execute()

    heavy_tiers = ("tier_1_shiftable", "tier_2_prep_needed", "tier_3_comfort")
    names = [a["name"] for a in (result.data or []) if a.get("optimization_tier") in heavy_tiers]
    return names[:5]  # Limit to 5 for notification readability


def _get_heavy_on_appliance_names(db, home_id: str) -> list[str]:
    """Get names of heavy (tier 1-3) appliances that are currently ON."""
    result = db.table("appliances").select("name, optimization_tier, status, rated_power_w").eq(
        "home_id", home_id
    ).eq("is_active", True).execute()

    heavy_tiers = ("tier_1_shiftable", "tier_2_prep_needed", "tier_3_comfort")
    names = [
        a["name"] for a in (result.data or [])
        if a.get("optimization_tier") in heavy_tiers
        and a.get("status") in ("ON", "WARNING")
        and a.get("rated_power_w", 0) >= 500
    ]
    return names[:5]


def _send_peak_savings_notification(
    db,
    home_id: str,
    home: dict,
    user_id: str,
    current_slot: dict,
    slots: list[dict],
) -> None:
    """
    During peak tariff, find high-wattage appliances that are ON but NOT
    managed by autopilot. Calculate savings and send an actionable notification.
    """
    peak_rate = float(current_slot["rate"])

    # Find cheapest slot rate (off-peak)
    off_peak_rate = peak_rate
    for s in slots:
        if float(s["rate"]) < off_peak_rate:
            off_peak_rate = float(s["rate"])
    rate_diff = peak_rate - off_peak_rate

    if rate_diff <= 0:
        return

    # Get IDs of appliances delegated to autopilot
    delegated_ids: set[str] = set()
    if home.get("autopilot_enabled"):
        dac_result = db.table("device_autopilot_config").select("appliance_id").eq(
            "home_id", home_id
        ).eq("is_delegated", True).execute()
        delegated_ids = {r["appliance_id"] for r in (dac_result.data or [])}

    # Get all ON heavy appliances NOT managed by autopilot
    app_result = db.table("appliances").select(
        "id, name, rated_power_w, category, optimization_tier"
    ).eq("home_id", home_id).eq("is_active", True).in_(
        "status", ["ON", "WARNING"]
    ).execute()

    heavy_tiers = ("tier_1_shiftable", "tier_2_prep_needed", "tier_3_comfort")
    # Category-based fallback for tier
    category_tier_map = {
        "ac": "tier_3_comfort",
        "geyser": "tier_1_shiftable",
        "washing_machine": "tier_2_prep_needed",
    }

    unmanaged_heavy = []
    for a in (app_result.data or []):
        aid = a["id"]
        # Skip if managed by autopilot
        if aid in delegated_ids:
            continue
        tier = a.get("optimization_tier") or category_tier_map.get(a.get("category", ""), "tier_4_essential")
        wattage = a.get("rated_power_w", 0)
        # Include if tier 1-3 OR wattage >= 500W
        if tier in heavy_tiers or wattage >= 500:
            unmanaged_heavy.append(a)

    if not unmanaged_heavy:
        return

    # Calculate total savings per hour
    total_savings_per_hour = sum(
        (a["rated_power_w"] / 1000) * rate_diff for a in unmanaged_heavy
    )
    total_savings_per_hour = round(total_savings_per_hour, 2)

    # Peak window duration (hours)
    start_h = current_slot.get("start_hour", 18)
    end_h = current_slot.get("end_hour", 22)
    peak_duration = end_h - start_h if end_h > start_h else (24 - start_h + end_h)
    total_potential_savings = round(total_savings_per_hour * peak_duration, 2)

    names = [a["name"] for a in unmanaged_heavy[:4]]
    names_str = ", ".join(names)
    if len(unmanaged_heavy) > 4:
        names_str += f" +{len(unmanaged_heavy) - 4} more"

    db.table("notifications").insert({
        "user_id": user_id,
        "type": "peak",
        "title": f"💰 {len(unmanaged_heavy)} appliance{'s' if len(unmanaged_heavy) > 1 else ''} running during peak tariff",
        "message": (
            f"{names_str} running during high tariff period (₹{peak_rate}/kWh). "
            f"Tap to save up to ₹{total_potential_savings:.0f} this peak window."
        ),
        "icon": "alert-triangle",
        "color": "text-amber-600",
        "bg_color": "bg-amber-50",
        "metadata": {
            "subtype": "peak_savings_alert",
            "action": "navigate_optimizer",
            "appliance_ids": [a["id"] for a in unmanaged_heavy],
            "appliance_names": [a["name"] for a in unmanaged_heavy],
            "savings_per_hour": total_savings_per_hour,
            "total_potential_savings": total_potential_savings,
            "peak_rate": peak_rate,
            "off_peak_rate": off_peak_rate,
        },
    }).execute()

    logger.info(
        f"[TransitionWatcher] Peak savings notification for {home_id}: "
        f"{len(unmanaged_heavy)} unmanaged appliances, ₹{total_potential_savings}/window"
    )


async def tariff_transition_watcher() -> None:
    """
    Runs every 1 minute via APScheduler.
    Detects tariff slot transitions + carbon intensity transitions.
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
            "id, user_id, tariff_plan_id, autopilot_enabled, autopilot_strategy, grid_protection_enabled"
        ).not_.is_("tariff_plan_id", "null").execute()

        if not homes_result.data:
            return

        # Cache tariff slots by plan
        plan_slots_cache: dict[str, list[dict]] = {}

        for home in homes_result.data:
            plan_id = home["tariff_plan_id"]
            home_id = home["id"]
            user_id = home["user_id"]

            # Fetch tariff slots (cached per plan)
            if plan_id not in plan_slots_cache:
                slots_result = db.table("tariff_slots").select("*").eq("plan_id", plan_id).execute()
                plan_slots_cache[plan_id] = slots_result.data or []

            slots = plan_slots_cache[plan_id]
            current_slot = _get_slot_for_hour(current_hour, slots)
            prev_slot = _get_slot_for_hour((current_hour - 1) % 24, slots)

            if not current_slot or not prev_slot:
                continue

            current_type = current_slot["slot_type"]
            prev_type = prev_slot["slot_type"]

            # ── Tariff Transition Detection ──
            tariff_changed = current_type != prev_type
            if tariff_changed:
                logger.info(
                    f"[TransitionWatcher] Home {home_id}: {prev_type} → {current_type} (hour {current_hour})"
                )

                if current_type == "peak":
                    db.table("notifications").insert({
                        "user_id": user_id,
                        "type": "peak",
                        "title": "⚡ Peak Tariff Started",
                        "message": f"Electricity rate is now ₹{current_slot['rate']}/kWh. Consider turning off heavy appliances.",
                        "icon": "zap",
                        "color": "text-rose-600",
                        "bg_color": "bg-rose-50",
                    }).execute()

                    # ── Smart Peak Alert: Identify non-autopilot heavy appliances ──
                    try:
                        _send_peak_savings_notification(
                            db, home_id, home, user_id, current_slot, slots
                        )
                    except Exception as e:
                        logger.error(f"[TransitionWatcher] Peak savings notif failed for {home_id}: {e}")

                elif prev_type == "peak":
                    db.table("notifications").insert({
                        "user_id": user_id,
                        "type": "peak",
                        "title": "✅ Peak Tariff Ended",
                        "message": f"Rate dropped to ₹{current_slot['rate']}/kWh ({current_type}). Safe to run heavy appliances now.",
                        "icon": "check-circle",
                        "color": "text-emerald-600",
                        "bg_color": "bg-emerald-50",
                    }).execute()

            # ── Carbon Intensity Transition Detection ──
            # Resolve region_code BEFORE try-block so it's available in penalty block too
            region_code = "IN-BR"  # default fallback
            try:
                from app.services.carbon import (
                    is_clean_energy_window,
                    _get_region_for_home,
                    get_current_carbon_intensity,
                )

                region_code = _get_region_for_home(home_id)
                is_clean_now = is_clean_energy_window(region_code)
                was_clean = _last_carbon_cache.get(home_id)
                _last_carbon_cache[home_id] = is_clean_now

                carbon_changed = was_clean is not None and is_clean_now != was_clean

                if carbon_changed:
                    current_gco2 = get_current_carbon_intensity(region_code)

                    if is_clean_now:
                        # Check if also off-peak for combined notification
                        if current_type == "off-peak":
                            # Combined: cheapest + cleanest
                            appliance_names = _get_heavy_appliance_names(db, home_id)
                            names_str = ", ".join(appliance_names) if appliance_names else "your heavy appliances"

                            db.table("notifications").insert({
                                "user_id": user_id,
                                "type": "tip",
                                "title": "💚 Best Time to Run Appliances",
                                "message": (
                                    f"It's both cheapest (₹{current_slot['rate']}/kWh) AND cleanest "
                                    f"({current_gco2:.0f} gCO₂/kWh) right now — run {names_str} to "
                                    f"save money and reduce your carbon footprint!"
                                ),
                                "icon": "heart",
                                "color": "text-emerald-600",
                                "bg_color": "bg-emerald-50",
                                "metadata": {
                                    "subtype": "clean_energy_offpeak",
                                    "gco2": current_gco2,
                                    "rate": float(current_slot["rate"]),
                                },
                            }).execute()
                        else:
                            # Clean energy only
                            appliance_names = _get_heavy_appliance_names(db, home_id)
                            names_str = ", ".join(appliance_names) if appliance_names else "your heavy appliances"

                            db.table("notifications").insert({
                                "user_id": user_id,
                                "type": "tip",
                                "title": "🌿 Clean Energy Window",
                                "message": (
                                    f"Grid carbon intensity is low ({current_gco2:.0f} gCO₂/kWh). "
                                    f"Run {names_str} now for a lower carbon footprint!"
                                ),
                                "icon": "leaf",
                                "color": "text-emerald-600",
                                "bg_color": "bg-green-50",
                                "metadata": {"subtype": "clean_energy", "gco2": current_gco2},
                            }).execute()

                    else:
                        # Carbon went high — warn about high-watt appliances
                        heavy_on_names = _get_heavy_on_appliance_names(db, home_id)
                        if heavy_on_names:
                            names_str = ", ".join(heavy_on_names)
                            db.table("notifications").insert({
                                "user_id": user_id,
                                "type": "tip",
                                "title": "⚠️ High Carbon Intensity",
                                "message": (
                                    f"Grid carbon intensity is now high ({current_gco2:.0f} gCO₂/kWh). "
                                    f"Consider pausing heavy appliances: {names_str}."
                                ),
                                "icon": "alert-triangle",
                                "color": "text-amber-600",
                                "bg_color": "bg-amber-50",
                                "metadata": {"subtype": "high_carbon_warning", "gco2": current_gco2},
                            }).execute()

                    logger.info(
                        f"[TransitionWatcher] Carbon transition for home {home_id}: "
                        f"{'clean → dirty' if not is_clean_now else 'dirty → clean'}"
                    )

            except Exception as e:
                logger.error(f"[TransitionWatcher] Carbon check failed for {home_id}: {e}")

            # ── Penalty-Based Autopilot Trigger ──
            if home.get("autopilot_enabled"):
                try:
                    from app.services.penalty_engine import (
                        get_current_penalty,
                        DEFAULT_PENALTY_THRESHOLD,
                    )
                    from app.services.carbon import get_daily_carbon_profile

                    strategy = home.get("autopilot_strategy", "balanced")
                    carbon_profile = get_daily_carbon_profile(region_code)
                    penalty_data = get_current_penalty(slots, carbon_profile, strategy)
                    is_above_threshold = penalty_data["above_threshold"]
                    was_above = _last_penalty_cache.get(home_id)
                    _last_penalty_cache[home_id] = is_above_threshold

                    if was_above is not None and is_above_threshold != was_above:
                        if is_above_threshold:
                            # Penalty crossed threshold — execute strategy
                            trigger = "peak_tariff" if current_type == "peak" else "penalty_threshold"
                            from app.services.autopilot import execute_strategy_action
                            result = await execute_strategy_action(home_id, user_id, trigger)
                            logger.info(f"[TransitionWatcher] Autopilot triggered: {result}")
                        else:
                            # Penalty dropped below threshold — restore
                            from app.services.autopilot import execute_strategy_restore
                            result = await execute_strategy_restore(home_id, user_id)
                            logger.info(f"[TransitionWatcher] Autopilot restore: {result}")

                except Exception as e:
                    logger.error(f"[TransitionWatcher] Penalty check failed for {home_id}: {e}", exc_info=True)

    except Exception as e:
        logger.error(f"[TransitionWatcher] Error: {e}", exc_info=True)
