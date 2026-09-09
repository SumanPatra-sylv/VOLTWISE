"""
VoltWise Billing Engine — Telescopic Slabs + ToD Modifiers

Calculates electricity bills by processing interval_readings (15-min smart
meter data) chronologically, tracking monthly cumulative kWh to determine
the active telescopic slab, and applying absolute ToD modifiers based on
IST hour.

Key rules:
  1. PRIMARY data source: interval_readings (per-user, TIMESTAMPTZ UTC)
  2. All timestamps converted to Asia/Kolkata (IST) before ToD checks
  3. ToD modifiers are absolute INR differences (not percentages)
  4. Slab crossings within a single interval are split precisely
  5. Effective rate floored at ₹0.00
  6. FALLBACK: if 0 rows in interval_readings → daily_aggregates + 30/50/20

Does NOT touch autopilot, penalty_engine, or tariff optimizer.
"""

from __future__ import annotations

import calendar
import logging
from datetime import datetime, date, timedelta
from typing import Any

from app.database import get_supabase

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo  # type: ignore

logger = logging.getLogger("voltwise.billing")

IST = ZoneInfo("Asia/Kolkata")
UTC = ZoneInfo("UTC")

# Tax defaults (can be made per-plan configurable later)
ELECTRICITY_DUTY_RATE = 0.06   # 6%
FAC_PER_KWH = 0.10            # ₹0.10/kWh


# ═══════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════

def _utc_to_ist(ts_str: str | datetime) -> datetime:
    """Parse a UTC/TIMESTAMPTZ string and convert to IST."""
    if isinstance(ts_str, datetime):
        dt = ts_str
    else:
        dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(IST)


def _get_slot_type_for_hour(hour: int, slots: list[dict]) -> str:
    """Determine slot_type (peak/normal/off-peak) for a given IST hour."""
    for s in slots:
        start = s["start_hour"]
        end = s["end_hour"]
        if start < end:
            if start <= hour < end:
                return s["slot_type"]
        else:  # wraps midnight (e.g. 22→6)
            if hour >= start or hour < end:
                return s["slot_type"]
    return "normal"


def _compute_tod_modifiers(slots: list[dict]) -> dict[str, float]:
    """
    Compute absolute ToD modifiers from tariff_slots rates.

    Normal (06:00–17:59 IST):   modifier = 0
    Peak   (18:00–21:59 IST):   modifier = Peak_Rate - Normal_Rate
    Off-Peak (22:00–05:59 IST): modifier = -(Normal_Rate - Off_Peak_Rate)
    """
    rates: dict[str, float] = {}
    for s in slots:
        rates[s["slot_type"]] = float(s["rate"])

    normal_rate = rates.get("normal", 0.0)
    peak_rate = rates.get("peak", normal_rate)
    off_peak_rate = rates.get("off-peak", normal_rate)

    return {
        "normal": 0.0,
        "peak": round(peak_rate - normal_rate, 4),
        "off-peak": round(-(normal_rate - off_peak_rate), 4),
    }


def _get_slab_for_cumulative(cumulative_kwh: float, slabs: list[dict]) -> dict:
    """Find the slab that contains the current cumulative kWh."""
    for slab in slabs:
        from_kwh = float(slab["from_kwh"])
        to_kwh = float(slab["to_kwh"]) if slab["to_kwh"] is not None else float("inf")
        if from_kwh <= cumulative_kwh < to_kwh:
            return slab
    # If beyond all slabs, return the last one
    return slabs[-1]


def _slab_remaining(cumulative_kwh: float, slab: dict) -> float:
    """How many kWh can fit in the current slab before crossing."""
    to_kwh = float(slab["to_kwh"]) if slab["to_kwh"] is not None else float("inf")
    return max(0.0, to_kwh - cumulative_kwh)


def _month_boundaries_ist(year: int, month: int) -> tuple[str, str]:
    """
    Return (start_iso, end_iso) in ISO-8601 with IST offset for Supabase queries.
    Start: first day of month at 00:00 IST
    End:   first day of next month at 00:00 IST
    """
    start = datetime(year, month, 1, 0, 0, 0, tzinfo=IST)
    if month == 12:
        end = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=IST)
    else:
        end = datetime(year, month + 1, 1, 0, 0, 0, tzinfo=IST)
    return start.isoformat(), end.isoformat()


# ═══════════════════════════════════════════════════════════════════
# CORE: Fetch tariff context for a home
# ═══════════════════════════════════════════════════════════════════

def _fetch_billing_context(home_id: str) -> dict[str, Any]:
    """
    Fetch everything needed for billing: home, plan, slabs, slots, profile.
    Returns a dict with all billing context.
    """
    db = get_supabase()

    # Home → user_id, tariff_plan_id, sanctioned_load_kw
    home_res = db.table("homes").select(
        "id, user_id, tariff_plan_id, sanctioned_load_kw"
    ).eq("id", home_id).limit(1).execute()
    home_data = home_res.data
    if not home_data:
        raise ValueError(f"Home {home_id} not found")
    home = home_data[0]

    if not home.get("tariff_plan_id"):
        raise ValueError(f"Home {home_id} has no tariff_plan_id")

    plan_id = home["tariff_plan_id"]
    user_id = home["user_id"]

    # Tariff plan → name, fixed_charge_per_kw, discom_id
    plan_res = db.table("tariff_plans").select(
        "id, name, fixed_charge_per_kw, discom_id"
    ).eq("id", plan_id).limit(1).execute()
    if not plan_res.data:
        raise ValueError(f"Tariff plan {plan_id} not found")
    plan = plan_res.data[0]

    # DISCOM → name, code
    discom_res = db.table("discoms").select(
        "name, code"
    ).eq("id", plan["discom_id"]).limit(1).execute()
    discom = discom_res.data[0] if discom_res.data else {"name": "Unknown", "code": "—"}

    # Profile → name, consumer_number, phone
    profile_res = db.table("profiles").select(
        "name, consumer_number, phone"
    ).eq("id", user_id).limit(1).execute()
    profile = profile_res.data[0] if profile_res.data else {"name": "—", "consumer_number": "—", "phone": "—"}

    # Meter (may not exist)
    meter_res = db.table("meters").select(
        "meter_number, meter_type"
    ).eq("home_id", home_id).eq("is_active", True).limit(1).execute()
    meter = meter_res.data[0] if meter_res.data else None

    # Tariff slabs (ordered by display_order)
    slabs_res = db.table("tariff_slabs").select("*").eq(
        "plan_id", plan_id
    ).order("display_order").execute()
    slabs = slabs_res.data or []

    if not slabs:
        raise ValueError(f"No tariff slabs found for plan {plan_id}")

    # Tariff slots (ToD)
    slots_res = db.table("tariff_slots").select("*").eq(
        "plan_id", plan_id
    ).execute()
    slots = slots_res.data or []

    # Compute ToD modifiers
    tod_modifiers = _compute_tod_modifiers(slots) if slots else {"normal": 0.0, "peak": 0.0, "off-peak": 0.0}

    return {
        "home": home,
        "user_id": user_id,
        "plan": plan,
        "plan_id": plan_id,
        "discom": discom,
        "profile": profile,
        "meter": meter,
        "slabs": slabs,
        "slots": slots,
        "tod_modifiers": tod_modifiers,
        "fixed_charge_per_kw": float(plan.get("fixed_charge_per_kw") or 0),
        "sanctioned_load_kw": float(home.get("sanctioned_load_kw") or 5),
    }


# ═══════════════════════════════════════════════════════════════════
# CORE: Process intervals for one month
# ═══════════════════════════════════════════════════════════════════

def _process_intervals(
    readings: list[dict],
    slabs: list[dict],
    slots: list[dict],
    tod_modifiers: dict[str, float],
) -> dict[str, Any]:
    """
    Process a chronological list of interval_readings for a single billing month.
    Returns: cumulative_kwh, total_energy_cost, slab_breakdown, hourly_audit, daily_audit.
    """
    cumulative_kwh = 0.0
    total_energy_cost = 0.0

    # Slab breakdown: {slab_display_order: {from_kwh, to_kwh, rate, kwh_billed, cost}}
    slab_usage: dict[int, dict] = {}
    for slab in slabs:
        order = slab["display_order"]
        slab_usage[order] = {
            "from_kwh": int(slab["from_kwh"]),
            "to_kwh": int(slab["to_kwh"]) if slab["to_kwh"] is not None else None,
            "rate_per_kwh": float(slab["rate_per_kwh"]),
            "kwh_billed": 0.0,
            "cost": 0.0,
        }

    # ToD breakdown: {slot_type: {kwh, tod_adjustment}}
    tod_usage: dict[str, dict] = {
        "off-peak": {"kwh": 0.0, "adjustment": 0.0},
        "normal":   {"kwh": 0.0, "adjustment": 0.0},
        "peak":     {"kwh": 0.0, "adjustment": 0.0},
    }

    # Daily audit: {date_str: {kwh, cost}}
    daily_audit: dict[str, dict] = {}

    for reading in readings:
        ist_dt = _utc_to_ist(reading["reading_timestamp"])
        ist_hour = ist_dt.hour
        date_str = ist_dt.strftime("%Y-%m-%d")

        slot_type = _get_slot_type_for_hour(ist_hour, slots)
        modifier = tod_modifiers.get(slot_type, 0.0)
        interval_kwh = float(reading["kwh"])

        # ── Bill this interval (may cross slab boundaries) ──────────
        remaining_kwh = interval_kwh
        interval_cost = 0.0

        while remaining_kwh > 1e-8:  # float precision guard
            current_slab = _get_slab_for_cumulative(cumulative_kwh, slabs)
            slab_room = _slab_remaining(cumulative_kwh, current_slab)
            order = current_slab["display_order"]
            base_rate = float(current_slab["rate_per_kwh"])
            effective_rate = max(0.0, base_rate + modifier)

            if remaining_kwh <= slab_room:
                # Entire remainder fits in current slab
                cost = remaining_kwh * effective_rate
                cumulative_kwh += remaining_kwh
                interval_cost += cost
                tod_adjustment = remaining_kwh * modifier

                slab_usage[order]["kwh_billed"] += remaining_kwh
                slab_usage[order]["cost"] += remaining_kwh * base_rate
                tod_usage[slot_type]["kwh"] += remaining_kwh
                tod_usage[slot_type]["adjustment"] += tod_adjustment

                remaining_kwh = 0.0
            else:
                # Slab crossing: bill what fits, then loop to next slab
                cost = slab_room * effective_rate
                cumulative_kwh += slab_room
                interval_cost += cost
                tod_adjustment = slab_room * modifier

                slab_usage[order]["kwh_billed"] += slab_room
                slab_usage[order]["cost"] += slab_room * base_rate
                tod_usage[slot_type]["kwh"] += slab_room
                tod_usage[slot_type]["adjustment"] += tod_adjustment

                remaining_kwh -= slab_room

        total_energy_cost += interval_cost

        # Track daily audit
        if date_str not in daily_audit:
            daily_audit[date_str] = {"kwh": 0.0, "cost": 0.0}
        daily_audit[date_str]["kwh"] += interval_kwh
        daily_audit[date_str]["cost"] += interval_cost

    # Round everything
    for order, usage in slab_usage.items():
        usage["kwh_billed"] = round(usage["kwh_billed"], 4)
        usage["cost"] = round(usage["cost"], 2)

    for st, usage in tod_usage.items():
        usage["kwh"] = round(usage["kwh"], 4)
        usage["adjustment"] = round(usage["adjustment"], 2)

    for d, usage in daily_audit.items():
        usage["kwh"] = round(usage["kwh"], 4)
        usage["cost"] = round(usage["cost"], 2)

    return {
        "cumulative_kwh": round(cumulative_kwh, 4),
        "total_energy_cost": round(total_energy_cost, 2),
        "slab_breakdown": slab_usage,
        "tod_breakdown": tod_usage,
        "daily_audit": daily_audit,
    }


# ═══════════════════════════════════════════════════════════════════
# FALLBACK: daily_aggregates with estimated 30/50/20 ToD split
# ═══════════════════════════════════════════════════════════════════

def _process_daily_fallback(
    daily_rows: list[dict],
    slabs: list[dict],
    slots: list[dict],
    tod_modifiers: dict[str, float],
) -> dict[str, Any]:
    """
    Fallback when interval_readings has 0 rows.
    Uses daily_aggregates kWh totals with an estimated ToD split:
      30% off-peak, 50% normal, 20% peak
    """
    TOD_SPLIT = {"off-peak": 0.30, "normal": 0.50, "peak": 0.20}

    # Convert daily totals into synthetic interval-like readings
    synthetic_readings = []
    for row in daily_rows:
        total_kwh = float(row.get("total_kwh") or 0)
        row_date = row.get("date", "")

        for slot_type, fraction in TOD_SPLIT.items():
            kwh_portion = total_kwh * fraction
            # Pick a representative hour for this slot type
            rep_hours = {"off-peak": 2, "normal": 12, "peak": 20}
            hour = rep_hours[slot_type]

            # Create a synthetic timestamp in IST
            ts_str = f"{row_date}T{hour:02d}:00:00+05:30"
            synthetic_readings.append({
                "reading_timestamp": ts_str,
                "kwh": kwh_portion,
            })

    # Sort by timestamp
    synthetic_readings.sort(key=lambda r: r["reading_timestamp"])

    return _process_intervals(synthetic_readings, slabs, slots, tod_modifiers)


# ═══════════════════════════════════════════════════════════════════
# INTERNAL: Paginated fetch for interval_readings
# ═══════════════════════════════════════════════════════════════════

def _fetch_all_intervals(
    db,
    user_id: str,
    start_iso: str,
    end_iso: str,
    page_size: int = 1000,
) -> list[dict]:
    """
    Fetch ALL interval_readings for a user within a time range.
    Supabase/PostgREST caps at 1000 rows per request, so we paginate
    using .range() until we get all rows.
    """
    all_readings: list[dict] = []
    offset = 0

    while True:
        res = db.table("interval_readings").select(
            "reading_timestamp, kwh"
        ).eq("user_id", user_id).gte(
            "reading_timestamp", start_iso
        ).lt(
            "reading_timestamp", end_iso
        ).order("reading_timestamp").range(
            offset, offset + page_size - 1
        ).execute()

        batch = res.data or []
        all_readings.extend(batch)

        if len(batch) < page_size:
            break  # Last page
        offset += page_size

    return all_readings


# ═══════════════════════════════════════════════════════════════════
# INTERNAL: Calculate bill for a single month (with pre-fetched ctx)
# ═══════════════════════════════════════════════════════════════════

def _calculate_month_with_ctx(
    ctx: dict[str, Any],
    home_id: str,
    year: int,
    month: int,
) -> dict[str, Any]:
    """
    Calculate a detailed electricity bill for a single month.
    Uses a pre-fetched billing context to avoid redundant DB calls.
    """
    db = get_supabase()

    start_iso, end_iso = _month_boundaries_ist(year, month)

    # ── Fetch ALL interval_readings (paginated) ─────────────────
    readings = _fetch_all_intervals(db, ctx["user_id"], start_iso, end_iso)
    data_source = "interval_readings"

    if len(readings) > 0:
        result = _process_intervals(
            readings, ctx["slabs"], ctx["slots"], ctx["tod_modifiers"]
        )
    else:
        # ── Fallback: daily_aggregates ──────────────────────────
        data_source = "daily_aggregates"
        start_date = f"{year}-{month:02d}-01"
        days_in_month = calendar.monthrange(year, month)[1]
        end_date = f"{year}-{month:02d}-{days_in_month}"

        daily_res = db.table("daily_aggregates").select(
            "date, total_kwh"
        ).eq("home_id", home_id).is_(
            "appliance_id", "null"
        ).gte("date", start_date).lte("date", end_date).order("date").execute()

        daily_rows = daily_res.data or []

        if not daily_rows:
            # No data at all for this month
            return _empty_month_result(year, month)

        result = _process_daily_fallback(
            daily_rows, ctx["slabs"], ctx["slots"], ctx["tod_modifiers"]
        )

    # ── Compute charges ─────────────────────────────────────────
    energy_charge = result["total_energy_cost"]
    total_kwh = result["cumulative_kwh"]

    # Sum of ToD adjustments (can be negative for off-peak rebates)
    tod_adjustment = sum(v["adjustment"] for v in result["tod_breakdown"].values())
    tod_adjustment = round(tod_adjustment, 2)

    fixed_charge = round(ctx["fixed_charge_per_kw"] * ctx["sanctioned_load_kw"], 2)
    electricity_duty = round(energy_charge * ELECTRICITY_DUTY_RATE, 2)
    fac = round(total_kwh * FAC_PER_KWH, 2)
    total_amount = round(energy_charge + fixed_charge + electricity_duty + fac, 2)

    # Slab breakdown as a list
    slab_list = []
    for order in sorted(result["slab_breakdown"].keys()):
        s = result["slab_breakdown"][order]
        if s["kwh_billed"] > 0:
            slab_list.append(s)

    # Daily audit as a sorted list
    daily_list = [
        {"date": d, **v}
        for d, v in sorted(result["daily_audit"].items())
    ]

    month_name = calendar.month_name[month]

    return {
        "year": year,
        "month": month,
        "month_name": month_name,
        "total_kwh": round(total_kwh, 2),
        "energy_charge": energy_charge,
        "fixed_charge": fixed_charge,
        "tod_adjustment": tod_adjustment,
        "electricity_duty": electricity_duty,
        "fac": fac,
        "total_amount": total_amount,
        "slab_breakdown": slab_list,
        "tod_breakdown": result["tod_breakdown"],
        "daily_audit": daily_list,
        "data_source": data_source,
        "interval_count": len(readings),
    }


def _empty_month_result(year: int, month: int) -> dict[str, Any]:
    """Return a zero-value bill result for months with no data."""
    return {
        "year": year,
        "month": month,
        "month_name": calendar.month_name[month],
        "total_kwh": 0.0,
        "energy_charge": 0.0,
        "fixed_charge": 0.0,
        "tod_adjustment": 0.0,
        "electricity_duty": 0.0,
        "fac": 0.0,
        "total_amount": 0.0,
        "slab_breakdown": [],
        "tod_breakdown": {
            "off-peak": {"kwh": 0.0, "adjustment": 0.0},
            "normal": {"kwh": 0.0, "adjustment": 0.0},
            "peak": {"kwh": 0.0, "adjustment": 0.0},
        },
        "daily_audit": [],
        "data_source": "none",
        "interval_count": 0,
    }


# ═══════════════════════════════════════════════════════════════════
# PUBLIC: Calculate bill for a single month
# ═══════════════════════════════════════════════════════════════════

def calculate_monthly_bill(home_id: str, year: int, month: int) -> dict[str, Any]:
    """
    Calculate a detailed electricity bill for a single month.
    Fetches billing context internally — use calculate_yearly_summary
    for multi-month queries (it reuses context).
    """
    ctx = _fetch_billing_context(home_id)
    return _calculate_month_with_ctx(ctx, home_id, year, month)


# ═══════════════════════════════════════════════════════════════════
# PUBLIC: Monthly summary for an entire year (12 months)
# ═══════════════════════════════════════════════════════════════════

def calculate_yearly_summary(home_id: str, year: int) -> dict[str, Any]:
    """
    Calculate bill summaries for all 12 months of a given year.
    Fetches billing context ONCE and reuses across all months.
    Pre-checks data availability to skip months with zero data instantly.
    """
    db = get_supabase()
    ctx = _fetch_billing_context(home_id)

    months_data = []
    annual_kwh = 0.0
    annual_total = 0.0
    lowest = None
    highest = None

    # Determine which months to calculate (don't go past current month)
    now_ist = datetime.now(IST)
    max_month = 12 if year < now_ist.year else min(now_ist.month, 12)

    # ── Pre-flight: find earliest data month to skip empty months ──
    year_start_iso = datetime(year, 1, 1, 0, 0, 0, tzinfo=IST).isoformat()
    year_end_iso = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=IST).isoformat()

    earliest_data_month = max_month + 1  # default: no data at all

    # Check interval_readings for earliest timestamp this year
    ir_res = db.table("interval_readings").select(
        "reading_timestamp"
    ).eq("user_id", ctx["user_id"]).gte(
        "reading_timestamp", year_start_iso
    ).lt(
        "reading_timestamp", year_end_iso
    ).order("reading_timestamp").limit(1).execute()

    if ir_res.data:
        earliest_ir = _utc_to_ist(ir_res.data[0]["reading_timestamp"])
        earliest_data_month = min(earliest_data_month, earliest_ir.month)

    # Check daily_aggregates for earliest date this year
    da_res = db.table("daily_aggregates").select(
        "date"
    ).eq("home_id", home_id).is_(
        "appliance_id", "null"
    ).gte("date", f"{year}-01-01").lte(
        "date", f"{year}-12-31"
    ).order("date").limit(1).execute()

    if da_res.data:
        earliest_da_month = int(da_res.data[0]["date"].split("-")[1])
        earliest_data_month = min(earliest_data_month, earliest_da_month)

    logger.info(f"[BillingEngine] Year {year}: earliest data month = {earliest_data_month}, max_month = {max_month}")

    for m in range(1, 13):
        if m > max_month and year >= now_ist.year:
            # Future month — no data
            months_data.append({
                "month": m,
                "month_name": calendar.month_name[m],
                "month_short": calendar.month_abbr[m],
                "total_kwh": 0,
                "total_amount": 0,
                "energy_charge": 0,
                "status": "future",
                "due_date": None,
            })
            continue

        if m < earliest_data_month:
            # Month is before any available data — skip DB queries entirely
            months_data.append({
                "month": m,
                "month_name": calendar.month_name[m],
                "month_short": calendar.month_abbr[m],
                "total_kwh": 0,
                "total_amount": 0,
                "energy_charge": 0,
                "status": "paid",
                "due_date": None,
            })
            continue

        try:
            bill = _calculate_month_with_ctx(ctx, home_id, year, m)
            amount = bill["total_amount"]
            kwh = bill["total_kwh"]

            # Determine bill status
            status = "paid"
            if year == now_ist.year and m == now_ist.month:
                status = "current"
            elif year == now_ist.year and m == now_ist.month - 1:
                status = "pending"

            # Due date: 15th of the following month
            if m == 12:
                due = date(year + 1, 1, 15)
            else:
                due = date(year, m + 1, 15)

            entry = {
                "month": m,
                "month_name": calendar.month_name[m],
                "month_short": calendar.month_abbr[m],
                "total_kwh": kwh,
                "total_amount": amount,
                "energy_charge": bill["energy_charge"],
                "status": status,
                "due_date": due.strftime("%b %d, %Y"),
            }
            months_data.append(entry)

            annual_kwh += kwh
            annual_total += amount

            if amount > 0:
                if lowest is None or amount < lowest["total_amount"]:
                    lowest = entry
                if highest is None or amount > highest["total_amount"]:
                    highest = entry

        except Exception as e:
            logger.warning(f"[BillingEngine] Failed for {year}-{m:02d}: {e}")
            months_data.append({
                "month": m,
                "month_name": calendar.month_name[m],
                "month_short": calendar.month_abbr[m],
                "total_kwh": 0,
                "total_amount": 0,
                "energy_charge": 0,
                "status": "error",
                "due_date": None,
            })

    months_with_data = [m for m in months_data if m["total_amount"] > 0]
    avg_monthly = round(annual_total / len(months_with_data), 2) if months_with_data else 0

    return {
        "year": year,
        "home_id": home_id,
        "months": months_data,
        "annual_total": round(annual_total, 2),
        "annual_kwh": round(annual_kwh, 2),
        "avg_monthly": avg_monthly,
        "lowest_month": lowest,
        "highest_month": highest,
    }


# ═══════════════════════════════════════════════════════════════════
# PUBLIC: Effective rates for frontend display
# ═══════════════════════════════════════════════════════════════════

def get_effective_rates(home_id: str) -> dict[str, Any]:
    """
    Return the current effective rates (base slab + ToD modifier) for display.
    """
    ctx = _fetch_billing_context(home_id)

    slabs_display = []
    for slab in ctx["slabs"]:
        slabs_display.append({
            "from_kwh": int(slab["from_kwh"]),
            "to_kwh": int(slab["to_kwh"]) if slab["to_kwh"] is not None else None,
            "rate_per_kwh": float(slab["rate_per_kwh"]),
        })

    # Build effective rates for each slot type using the FIRST slab as base
    first_slab_rate = float(ctx["slabs"][0]["rate_per_kwh"]) if ctx["slabs"] else 0
    mods = ctx["tod_modifiers"]

    effective_rates = {}
    for slot_type in ["off-peak", "normal", "peak"]:
        modifier = mods.get(slot_type, 0)
        effective_rates[slot_type] = {
            "base_rate": first_slab_rate,
            "modifier": modifier,
            "effective": round(max(0.0, first_slab_rate + modifier), 2),
        }

    return {
        "plan_name": ctx["plan"]["name"],
        "discom_name": ctx["discom"]["name"],
        "discom_code": ctx["discom"]["code"],
        "slabs": slabs_display,
        "effective_rates": effective_rates,
        "fixed_charge_per_kw": ctx["fixed_charge_per_kw"],
        "sanctioned_load_kw": ctx["sanctioned_load_kw"],
    }


# ═══════════════════════════════════════════════════════════════════
# PUBLIC: Full bill data for PDF generation
# ═══════════════════════════════════════════════════════════════════

def get_bill_pdf_data(home_id: str, year: int, month: int) -> dict[str, Any]:
    """
    Return all data needed to render a professional PDF bill.
    Combines billing calculation with consumer/DISCOM/meter details.
    Fetches context once and reuses it.
    """
    ctx = _fetch_billing_context(home_id)
    bill = _calculate_month_with_ctx(ctx, home_id, year, month)

    # Build effective rates inline (avoid extra context fetch)
    first_slab_rate = float(ctx["slabs"][0]["rate_per_kwh"]) if ctx["slabs"] else 0
    mods = ctx["tod_modifiers"]
    effective_rates = {}
    for slot_type in ["off-peak", "normal", "peak"]:
        modifier = mods.get(slot_type, 0)
        effective_rates[slot_type] = {
            "base_rate": first_slab_rate,
            "modifier": modifier,
            "effective": round(max(0.0, first_slab_rate + modifier), 2),
        }

    slabs_display = []
    for slab in ctx["slabs"]:
        slabs_display.append({
            "from_kwh": int(slab["from_kwh"]),
            "to_kwh": int(slab["to_kwh"]) if slab["to_kwh"] is not None else None,
            "rate_per_kwh": float(slab["rate_per_kwh"]),
        })

    return {
        # Consumer details
        "consumer_name": ctx["profile"].get("name", "—"),
        "consumer_number": ctx["profile"].get("consumer_number", "—"),
        "consumer_phone": ctx["profile"].get("phone", "—"),

        # DISCOM
        "discom_name": ctx["discom"]["name"],
        "discom_code": ctx["discom"]["code"],
        "plan_name": ctx["plan"]["name"],

        # Meter
        "meter_number": ctx["meter"].get("meter_number", "—") if ctx["meter"] else "—",
        "meter_type": ctx["meter"].get("meter_type", "prepaid") if ctx["meter"] else "prepaid",
        "sanctioned_load_kw": ctx["sanctioned_load_kw"],

        # Bill calculation
        **bill,

        # Effective rates
        "effective_rates": effective_rates,
        "slabs": slabs_display,
    }
