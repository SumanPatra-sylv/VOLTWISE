"""
VoltWise — Admin API Router
============================
Admin-only endpoints for the admin dashboard.
All endpoints use service_role key (bypasses RLS) via get_supabase().

Endpoints:
  GET /api/admin/dashboard         — Executive dashboard KPIs (Module 1)
  GET /api/admin/consumers         — Consumer list with filters (Module 2)
  GET /api/admin/consumers/{id}    — Consumer deep-dive profile (Module 2)
  GET /api/admin/consumers/{id}/risk-score  — Risk detection (Module 2)
  GET /api/admin/reports/revenue   — Revenue analytics (Module 3)
  GET /api/admin/reports/meter-health       — Meter health stats (Module 7)
  GET /api/admin/reports/complaints         — Complaint & SLA analytics (Module 8)
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from app.database import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])

IST = timezone(timedelta(hours=5, minutes=30))


# ═══════════════════════════════════════════════════════════════════
# MODULE 1: EXECUTIVE DASHBOARD
# ═══════════════════════════════════════════════════════════════════

@router.get("/dashboard")
async def get_dashboard_stats():
    """Return all Module 1 KPIs. Uses the RPC function for atomicity."""
    sb = get_supabase()
    try:
        result = sb.rpc("get_admin_dashboard_stats").execute()
        return result.data
    except Exception as e:
        logger.error(f"Dashboard stats RPC failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# MODULE 2: CONSUMER MANAGEMENT
# ═══════════════════════════════════════════════════════════════════

@router.get("/consumers")
async def get_consumers(
    search: Optional[str] = Query(None, description="Search by name/phone/consumer#"),
    area: Optional[str] = Query(None),
    balance_status: Optional[str] = Query(None, description="critical/low/normal"),
    sort_by: Optional[str] = Query("created_at", description="Sort field"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Consumer list with server-side filtering. Uses get_admin_users() RPC."""
    sb = get_supabase()
    try:
        result = sb.rpc("get_admin_users").execute()
        users = result.data or []

        # Apply filters
        if search:
            q = search.lower()
            users = [u for u in users if
                     q in (u.get("name", "") or "").lower() or
                     q in (u.get("email", "") or "").lower() or
                     q in (u.get("phone", "") or "").lower() or
                     q in (u.get("consumer_number", "") or "").lower()]

        if area:
            users = [u for u in users if (u.get("area", "") or "").lower() == area.lower()]

        if balance_status:
            if balance_status == "critical":
                users = [u for u in users if (u.get("balance", 0) or 0) < 50]
            elif balance_status == "low":
                users = [u for u in users if 50 <= (u.get("balance", 0) or 0) < 200]
            elif balance_status == "normal":
                users = [u for u in users if (u.get("balance", 0) or 0) >= 200]

        total = len(users)
        users = users[offset:offset + limit]

        return {"total": total, "consumers": users}
    except Exception as e:
        logger.error(f"Consumer list failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/consumers/{user_id}")
async def get_consumer_profile(user_id: str):
    """Full consumer deep-dive via RPC."""
    sb = get_supabase()
    try:
        result = sb.rpc("get_consumer_profile", {"p_user_id": user_id}).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Consumer not found")
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Consumer profile failed for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/consumers/{user_id}/risk-score")
async def get_consumer_risk_score(user_id: str):
    """Calculate risk score for a consumer (Module 2 - Risk Detection)."""
    sb = get_supabase()
    flags = []

    try:
        # Get meter data
        home = sb.table("homes").select("id").eq("user_id", user_id).eq("is_primary", True).limit(1).execute()
        if not home.data:
            return {"risk_score": 0, "flags": [], "user_id": user_id}

        home_id = home.data[0]["id"]

        meter = sb.table("meters").select(
            "balance_amount, last_recharge_date, last_reading_at, is_active"
        ).eq("home_id", home_id).eq("is_active", True).limit(1).execute()

        if not meter.data:
            return {"risk_score": 0, "flags": [], "user_id": user_id}

        m = meter.data[0]
        balance = float(m.get("balance_amount", 0) or 0)
        now = datetime.now(IST)

        # ── Balance risk ──
        if balance < 50:
            flags.append({
                "type": "critical_balance", "severity": "critical",
                "value": balance,
                "label": f"Balance ₹{balance:.0f} — disconnection imminent"
            })
        elif balance < 200:
            flags.append({
                "type": "low_balance", "severity": "high",
                "value": balance,
                "label": f"Balance ₹{balance:.0f} — recharge needed soon"
            })

        # ── Recharge inactivity ──
        if m.get("last_recharge_date"):
            last_recharge = datetime.fromisoformat(m["last_recharge_date"].replace("Z", "+00:00"))
            days_since = (now - last_recharge).days
            if days_since > 45:
                flags.append({
                    "type": "non_recharging", "severity": "high",
                    "days": days_since,
                    "label": f"No recharge in {days_since} days"
                })
            elif days_since > 30:
                flags.append({
                    "type": "recharge_overdue", "severity": "medium",
                    "days": days_since,
                    "label": f"No recharge in {days_since} days"
                })

        # ── Meter offline ──
        if m.get("last_reading_at"):
            last_reading = datetime.fromisoformat(m["last_reading_at"].replace("Z", "+00:00"))
            hours_since = (now - last_reading).total_seconds() / 3600
            if hours_since > 24:
                flags.append({
                    "type": "meter_offline", "severity": "high",
                    "hours": round(hours_since),
                    "label": f"No meter reading in {round(hours_since)} hours"
                })

        # ── Usage anomalies ──
        # Last 7 days vs last 90 days
        try:
            recent = sb.table("daily_aggregates").select("total_kwh").eq(
                "home_id", home_id
            ).gte("date", (now - timedelta(days=7)).strftime("%Y-%m-%d")).execute()

            historical = sb.table("daily_aggregates").select("total_kwh").eq(
                "home_id", home_id
            ).gte("date", (now - timedelta(days=90)).strftime("%Y-%m-%d")).execute()

            recent_kwh = [float(r["total_kwh"]) for r in (recent.data or []) if r.get("total_kwh")]
            hist_kwh = [float(r["total_kwh"]) for r in (historical.data or []) if r.get("total_kwh")]

            if recent_kwh and hist_kwh:
                avg_recent = sum(recent_kwh) / len(recent_kwh)
                avg_hist = sum(hist_kwh) / len(hist_kwh)

                if avg_hist > 0 and avg_recent > avg_hist * 2:
                    ratio = round(avg_recent / avg_hist, 1)
                    flags.append({
                        "type": "usage_spike", "severity": "high",
                        "ratio": ratio,
                        "label": f"Usage {ratio}× above 90-day average"
                    })

                if avg_hist > 0 and avg_recent < avg_hist * 0.3:
                    ratio = round(avg_recent / avg_hist, 1)
                    flags.append({
                        "type": "usage_drop", "severity": "critical",
                        "ratio": ratio,
                        "label": f"Usage dropped to {ratio:.0%} of normal"
                    })
        except Exception:
            pass  # Usage anomalies are non-critical

        # ── Calculate score ──
        severity_weights = {"critical": 40, "high": 25, "medium": 15}
        score = min(sum(severity_weights.get(f["severity"], 10) for f in flags), 100)

        return {"risk_score": score, "flags": flags, "user_id": user_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Risk score failed for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# MODULE 3: REVENUE & RECHARGE ANALYTICS
# ═══════════════════════════════════════════════════════════════════

@router.get("/reports/revenue")
async def get_revenue_report(
    period: str = Query("month", description="day/month/year"),
    date: Optional[str] = Query(None, description="Target date (YYYY-MM-DD)"),
):
    """Revenue analytics via RPC."""
    sb = get_supabase()
    try:
        params = {"p_period": period}
        if date:
            params["p_target_date"] = date
        result = sb.rpc("get_revenue_stats", params).execute()
        return result.data
    except Exception as e:
        logger.error(f"Revenue report failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/balance-health")
async def get_balance_health():
    """Balance health report — critical, low, and non-recharging users."""
    sb = get_supabase()
    try:
        # Critical (<₹50)
        critical = sb.table("meters").select(
            "id, meter_number, balance_amount, last_recharge_date, home_id"
        ).lt("balance_amount", 50).eq("is_active", True).order(
            "balance_amount"
        ).execute()

        # Low (₹50–₹200)
        low = sb.table("meters").select(
            "id, meter_number, balance_amount, last_recharge_date, home_id"
        ).gte("balance_amount", 50).lt("balance_amount", 200).eq(
            "is_active", True
        ).order("balance_amount").execute()

        return {
            "critical_users": critical.data or [],
            "low_balance_users": low.data or [],
            "critical_count": len(critical.data or []),
            "low_count": len(low.data or []),
        }
    except Exception as e:
        logger.error(f"Balance health failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# MODULE 7: METER HEALTH & INFRASTRUCTURE
# ═══════════════════════════════════════════════════════════════════

@router.get("/reports/meter-health")
async def get_meter_health():
    """Meter health via RPC."""
    sb = get_supabase()
    try:
        result = sb.rpc("get_meter_health_stats").execute()
        return result.data
    except Exception as e:
        logger.error(f"Meter health failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# MODULE 8: COMPLAINTS & SLA
# ═══════════════════════════════════════════════════════════════════

@router.get("/reports/complaints")
async def get_complaint_report(
    period: str = Query("month", description="week/month/quarter"),
):
    """Complaint & SLA analytics via RPC."""
    sb = get_supabase()
    try:
        result = sb.rpc("get_complaint_stats", {"p_period": period}).execute()
        return result.data
    except Exception as e:
        logger.error(f"Complaint report failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# MODULE 4: LOAD & CONSUMPTION ANALYTICS
# ═══════════════════════════════════════════════════════════════════

@router.get("/reports/consumption")
async def get_consumption_report():
    """Load & consumption analytics from daily_aggregates and meter_readings."""
    sb = get_supabase()
    try:
        now = datetime.now(IST)

        # 24-hour load curve (avg power per hour today)
        today_str = now.strftime("%Y-%m-%d")
        readings = sb.table("meter_readings").select(
            "power_kw, timestamp"
        ).gte("timestamp", f"{today_str}T00:00:00").execute()

        hourly_load = {}
        for r in (readings.data or []):
            try:
                hour = datetime.fromisoformat(
                    r["timestamp"].replace("Z", "+00:00")
                ).hour
                hourly_load.setdefault(hour, []).append(float(r.get("power_kw", 0) or 0))
            except Exception:
                pass

        load_curve = [
            {"hour": h, "avg_kw": round(sum(vals) / len(vals), 2)}
            for h, vals in sorted(hourly_load.items())
        ]

        # Monthly consumption trend (last 6 months)
        six_months_ago = (now - timedelta(days=180)).strftime("%Y-%m-%d")
        monthly = sb.table("daily_aggregates").select(
            "date, total_kwh"
        ).gte("date", six_months_ago).execute()

        month_totals = {}
        for d in (monthly.data or []):
            month_key = d["date"][:7]
            month_totals[month_key] = month_totals.get(month_key, 0) + float(d.get("total_kwh", 0) or 0)

        monthly_trend = [
            {"month": k, "kwh": round(v, 1)}
            for k, v in sorted(month_totals.items())
        ]

        # Peak demand
        peak_hour = max(load_curve, key=lambda x: x["avg_kw"]) if load_curve else {"hour": 0, "avg_kw": 0}

        return {
            "load_curve": load_curve,
            "monthly_trend": monthly_trend,
            "peak_hour": peak_hour,
            "readings_today": len(readings.data or []),
        }
    except Exception as e:
        logger.error(f"Consumption report failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# MODULE 5: OPTIMIZATION IMPACT
# ═══════════════════════════════════════════════════════════════════

@router.get("/reports/optimization")
async def get_optimization_report():
    """Optimization impact metrics from bills, schedules, recommendations, carbon_stats."""
    sb = get_supabase()
    try:
        # Total savings from bills
        bills = sb.table("bills").select("savings_amount, home_id").execute()
        total_savings = sum(float(b.get("savings_amount", 0) or 0) for b in (bills.data or []))
        homes_with_savings = len(set(b["home_id"] for b in (bills.data or []) if b.get("savings_amount")))
        avg_savings = total_savings / max(homes_with_savings, 1)

        # Schedule adoption
        total_homes = sb.table("homes").select("id", count="exact").execute()
        active_schedules = sb.table("schedules").select(
            "home_id", count="exact"
        ).eq("is_active", True).execute()
        schedule_adoption = round(
            (active_schedules.count or 0) / max(total_homes.count or 1, 1) * 100, 1
        )

        # Recommendation adoption
        recs = sb.table("recommendations").select("is_acted_on").execute()
        total_recs = len(recs.data or [])
        acted_recs = sum(1 for r in (recs.data or []) if r.get("is_acted_on"))
        rec_adoption = round(acted_recs / max(total_recs, 1) * 100, 1)

        # CO2 reduction
        carbon = sb.table("carbon_stats").select("co2_saved_kg").execute()
        co2_total = sum(float(c.get("co2_saved_kg", 0) or 0) for c in (carbon.data or []))

        return {
            "total_savings": round(total_savings, 2),
            "avg_savings_per_household": round(avg_savings, 2),
            "scheduling_adoption_percent": schedule_adoption,
            "recommendation_adoption_percent": rec_adoption,
            "co2_reduction_kg": round(co2_total, 1),
            "total_recommendations": total_recs,
            "acted_recommendations": acted_recs,
        }
    except Exception as e:
        logger.error(f"Optimization report failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# MODULE 6: APPLIANCE ANALYTICS
# ═══════════════════════════════════════════════════════════════════

@router.get("/reports/appliances")
async def get_appliance_report():
    """Appliance distribution and usage analytics."""
    sb = get_supabase()
    try:
        appliances = sb.table("appliances").select(
            "id, name, category, rated_power_w, status, home_id"
        ).eq("is_active", True).execute()

        items = appliances.data or []
        total = len(items)
        unique_homes = len(set(a["home_id"] for a in items))
        avg_per_home = round(total / max(unique_homes, 1), 1)

        # Category distribution
        cat_counts = {}
        for a in items:
            cat = a.get("category", "other") or "other"
            cat_counts[cat] = cat_counts.get(cat, 0) + 1
        categories = [{"category": k, "count": v} for k, v in sorted(cat_counts.items(), key=lambda x: -x[1])]

        # Name distribution (top 10)
        name_counts = {}
        for a in items:
            n = a.get("name", "Unknown") or "Unknown"
            name_counts[n] = name_counts.get(n, 0) + 1
        top_appliances = [
            {"name": k, "count": v}
            for k, v in sorted(name_counts.items(), key=lambda x: -x[1])[:10]
        ]

        # Status breakdown
        on_count = sum(1 for a in items if a.get("status") == "on")
        off_count = sum(1 for a in items if a.get("status") == "off")

        return {
            "total_appliances": total,
            "unique_homes": unique_homes,
            "avg_per_home": avg_per_home,
            "categories": categories,
            "top_appliances": top_appliances,
            "on_count": on_count,
            "off_count": off_count,
        }
    except Exception as e:
        logger.error(f"Appliance report failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# MODULE 9: APP ADOPTION & USER METRICS
# ═══════════════════════════════════════════════════════════════════

@router.get("/reports/adoption")
async def get_adoption_report():
    """App adoption metrics derived from existing tables."""
    sb = get_supabase()
    try:
        # Total signups
        profiles = sb.table("profiles").select(
            "id, onboarding_done, created_at", count="exact"
        ).execute()
        total_signups = profiles.count or 0
        onboarded = sum(1 for p in (profiles.data or []) if p.get("onboarding_done"))
        onboarding_rate = round(onboarded / max(total_signups, 1) * 100, 1)

        # Homes with meters
        homes = sb.table("homes").select("id", count="exact").execute()
        meters = sb.table("meters").select("home_id", count="exact").eq("is_active", True).execute()

        # Homes with appliances
        app_homes = sb.table("appliances").select("home_id").eq("is_active", True).execute()
        unique_app_homes = len(set(a["home_id"] for a in (app_homes.data or [])))
        appliance_rate = round(unique_app_homes / max(homes.count or 1, 1) * 100, 1)

        # Signup trend (last 6 months)
        signup_trend = {}
        for p in (profiles.data or []):
            month = (p.get("created_at", "") or "")[:7]
            if month:
                signup_trend[month] = signup_trend.get(month, 0) + 1
        trend = [{"month": k, "signups": v} for k, v in sorted(signup_trend.items())]

        return {
            "total_signups": total_signups,
            "onboarded_users": onboarded,
            "onboarding_rate": onboarding_rate,
            "total_homes": homes.count or 0,
            "metered_homes": meters.count or 0,
            "appliance_onboarding_rate": appliance_rate,
            "signup_trend": trend,
        }
    except Exception as e:
        logger.error(f"Adoption report failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# ═══════════════════════════════════════════════════════════════════
# MODULE 8b: COMPLAINT MANAGEMENT — INDIVIDUAL COMPLAINT WORKFLOW
# ═══════════════════════════════════════════════════════════════════

SLA_CONFIG = {
    "outage": 4,
    "meter_error": 24,
    "billing": 48,
    "payment": 24,
    "service": 72,
    "other": 72,
}


@router.get("/complaints")
async def list_complaints(
    status: Optional[str] = None,
    type: Optional[str] = None,
    priority: Optional[int] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List complaints with optional filters."""
    sb = get_supabase()
    try:
        q = sb.table("complaints").select(
            "*, profiles!complaints_user_id_fkey(name, email, phone, consumer_number)"
        ).order("created_at", desc=True)
        if status:
            q = q.eq("status", status)
        if type:
            q = q.eq("type", type)
        if priority:
            q = q.eq("priority", priority)
        q = q.range(offset, offset + limit - 1)
        result = q.execute()

        # Total count
        count_q = sb.table("complaints").select("id", count="exact")
        if status:
            count_q = count_q.eq("status", status)
        if type:
            count_q = count_q.eq("type", type)
        if priority:
            count_q = count_q.eq("priority", priority)
        total = count_q.execute()

        # Enrich with SLA status
        complaints = []
        for c in (result.data or []):
            sla_hours = SLA_CONFIG.get(c.get("type", "other"), 72)
            created = c.get("created_at", "")
            elapsed_hours = 0
            breached = False
            if created:
                try:
                    ct = datetime.fromisoformat(created.replace("Z", "+00:00"))
                    if c.get("resolved_at"):
                        rt = datetime.fromisoformat(c["resolved_at"].replace("Z", "+00:00"))
                        elapsed_hours = round((rt - ct).total_seconds() / 3600, 1)
                    else:
                        elapsed_hours = round((datetime.now(timezone.utc) - ct).total_seconds() / 3600, 1)
                    breached = elapsed_hours > sla_hours
                except Exception:
                    pass
            c["sla_hours"] = sla_hours
            c["elapsed_hours"] = elapsed_hours
            c["sla_breached"] = breached
            complaints.append(c)

        return {"total": total.count or 0, "complaints": complaints}
    except Exception as e:
        logger.error(f"Complaint list failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/complaints/{complaint_id}")
async def get_complaint_detail(complaint_id: str):
    """Full complaint detail with timeline updates and consumer info."""
    sb = get_supabase()
    try:
        # Get complaint
        complaint = sb.table("complaints").select(
            "*, profiles!complaints_user_id_fkey(name, email, phone, consumer_number)"
        ).eq("id", complaint_id).single().execute()
        if not complaint.data:
            raise HTTPException(status_code=404, detail="Complaint not found")

        c = complaint.data

        # SLA info
        sla_hours = SLA_CONFIG.get(c.get("type", "other"), 72)
        created = c.get("created_at", "")
        elapsed_hours = 0
        breached = False
        if created:
            try:
                ct = datetime.fromisoformat(created.replace("Z", "+00:00"))
                if c.get("resolved_at"):
                    rt = datetime.fromisoformat(c["resolved_at"].replace("Z", "+00:00"))
                    elapsed_hours = round((rt - ct).total_seconds() / 3600, 1)
                else:
                    elapsed_hours = round((datetime.now(timezone.utc) - ct).total_seconds() / 3600, 1)
                breached = elapsed_hours > sla_hours
            except Exception:
                pass

        c["sla_hours"] = sla_hours
        c["elapsed_hours"] = elapsed_hours
        c["sla_breached"] = breached

        # Get update timeline
        updates = sb.table("complaint_updates").select(
            "*, profiles!complaint_updates_updated_by_fkey(name)"
        ).eq("complaint_id", complaint_id).order("created_at", desc=False).execute()

        # Get consumer's home/meter info
        home_info = None
        if c.get("home_id"):
            home = sb.table("homes").select("name, area, feeder_id, city, state").eq(
                "id", c["home_id"]
            ).single().execute()
            home_info = home.data

        return {
            "complaint": c,
            "updates": updates.data or [],
            "home": home_info,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Complaint detail failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ComplaintStatusUpdate(BaseModel):
    status: str
    note: Optional[str] = None
    assigned_to: Optional[str] = None
    resolution_note: Optional[str] = None


@router.patch("/complaints/{complaint_id}/status")
async def update_complaint_status(complaint_id: str, body: ComplaintStatusUpdate):
    """Update complaint status, optionally assign, and log to complaint_updates."""
    sb = get_supabase()
    try:
        update_data: dict = {"status": body.status, "updated_at": datetime.now(IST).isoformat()}

        if body.assigned_to is not None:
            update_data["assigned_to"] = body.assigned_to

        if body.status in ("resolved", "closed"):
            update_data["resolved_at"] = datetime.now(IST).isoformat()
            if body.resolution_note:
                update_data["resolution_note"] = body.resolution_note

        # Update complaint
        result = sb.table("complaints").update(update_data).eq("id", complaint_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Complaint not found")

        # Insert timeline entry
        sb.table("complaint_updates").insert({
            "complaint_id": complaint_id,
            "status": body.status,
            "note": body.note or f"Status changed to {body.status}",
        }).execute()

        # Log to audit
        try:
            sb.table("admin_audit_logs").insert({
                "action_type": "complaint_status_update",
                "target_table": "complaints",
                "target_id": complaint_id,
                "new_value": update_data,
            }).execute()
        except Exception:
            pass

        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Complaint status update failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ComplaintNoteAdd(BaseModel):
    note: str


@router.post("/complaints/{complaint_id}/notes")
async def add_complaint_note(complaint_id: str, body: ComplaintNoteAdd):
    """Add an internal note to a complaint timeline without changing status."""
    sb = get_supabase()
    try:
        # Get current status
        complaint = sb.table("complaints").select("status").eq(
            "id", complaint_id
        ).single().execute()
        if not complaint.data:
            raise HTTPException(status_code=404, detail="Complaint not found")

        sb.table("complaint_updates").insert({
            "complaint_id": complaint_id,
            "status": complaint.data["status"],
            "note": body.note,
        }).execute()

        # Update complaint updated_at
        sb.table("complaints").update({
            "updated_at": datetime.now(IST).isoformat()
        }).eq("id", complaint_id).execute()

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Add complaint note failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# LOGIN AS CONSUMER (Impersonation)
# ═══════════════════════════════════════════════════════════════════

@router.post("/consumers/{user_id}/impersonate")
async def impersonate_consumer(user_id: str):
    """Generate a magic link for admin to login as a consumer.
    Uses Supabase admin API to generate a passwordless link."""
    sb = get_supabase()
    try:
        # Get consumer's email
        profile = sb.table("profiles").select("email, name, role").eq(
            "id", user_id
        ).single().execute()
        if not profile.data:
            raise HTTPException(status_code=404, detail="User not found")

        email = profile.data.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="User has no email")

        # Generate magic link using admin API
        result = sb.auth.admin.generate_link({
            "type": "magiclink",
            "email": email,
        })

        # The result contains the link properties
        link_data = result
        # Depending on supabase-py version, the action_link may be nested
        action_link = None
        if hasattr(link_data, 'properties'):
            action_link = getattr(link_data.properties, 'action_link', None)
        elif isinstance(link_data, dict):
            props = link_data.get('properties', link_data)
            action_link = props.get('action_link')
        else:
            # Try accessing as object
            try:
                action_link = link_data.properties.action_link
            except Exception:
                try:
                    action_link = link_data.data.properties.action_link
                except Exception:
                    pass

        if not action_link:
            # Fallback: use the full response
            raise HTTPException(status_code=500, detail="Could not generate impersonation link")

        # Log to audit
        try:
            sb.table("admin_audit_logs").insert({
                "action_type": "impersonate_consumer",
                "target_table": "profiles",
                "target_id": user_id,
                "new_value": {"email": email, "name": profile.data.get("name")},
            }).execute()
        except Exception:
            pass

        return {
            "magic_link": action_link,
            "consumer_name": profile.data.get("name"),
            "consumer_email": email,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Impersonation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# MODULE 10: AUDIT LOGS
# ═══════════════════════════════════════════════════════════════════

@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Paginated audit logs with admin name."""
    sb = get_supabase()
    try:
        result = sb.table("admin_audit_logs").select(
            "id, admin_id, action_type, target_table, target_id, "
            "previous_value, new_value, created_at"
        ).order("created_at", desc=True).range(offset, offset + limit - 1).execute()

        logs = result.data or []

        # Enrich with admin names
        admin_ids = list(set(l["admin_id"] for l in logs if l.get("admin_id")))
        name_map = {}
        if admin_ids:
            profiles = sb.table("profiles").select("id, name").in_(
                "id", admin_ids
            ).execute()
            name_map = {p["id"]: p["name"] for p in (profiles.data or [])}

        for log in logs:
            log["admin_name"] = name_map.get(log.get("admin_id"), "Unknown")

        # Total count
        total = sb.table("admin_audit_logs").select(
            "id", count="exact"
        ).execute()

        return {"total": total.count or 0, "logs": logs}
    except Exception as e:
        logger.error(f"Audit logs failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# MODULE 11: TARIFF & DISCOM MANAGEMENT
# ═══════════════════════════════════════════════════════════════════

@router.get("/discoms")
async def get_discoms():
    """List all DISCOMs with their tariff plans."""
    sb = get_supabase()
    try:
        discoms = sb.table("discoms").select("*").order("state").execute()
        plans = sb.table("tariff_plans").select(
            "*, tariff_slabs(*), tariff_slots(*)"
        ).order("effective_from", desc=True).execute()

        # Group plans by discom_id
        plan_map: dict = {}
        for p in (plans.data or []):
            did = p.get("discom_id")
            plan_map.setdefault(did, []).append(p)

        items = []
        for d in (discoms.data or []):
            d["tariff_plans"] = plan_map.get(d["id"], [])
            items.append(d)

        return {"discoms": items, "total": len(items)}
    except Exception as e:
        logger.error(f"DISCOMs failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════
# MODULE 12: OUTAGE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════

@router.get("/outages")
async def get_outages(
    active_only: bool = Query(True, description="Show only active outages"),
):
    """List outage notices."""
    sb = get_supabase()
    try:
        q = sb.table("outage_notices").select("*").order("start_time", desc=True)
        if active_only:
            q = q.eq("is_resolved", False)
        result = q.execute()
        return {"outages": result.data or [], "total": len(result.data or [])}
    except Exception as e:
        logger.error(f"Outages list failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))




class OutageCreate(BaseModel):
    area: str
    feeder_id: Optional[str] = None
    reason: str
    start_time: str
    estimated_end: str


@router.post("/outages")
async def create_outage(body: OutageCreate):
    """Create a new outage notice and notify affected consumers."""
    sb = get_supabase()
    try:
        outage = sb.table("outage_notices").insert({
            "area": body.area,
            "feeder_id": body.feeder_id,
            "reason": body.reason,
            "start_time": body.start_time,
            "estimated_end": body.estimated_end,
            "is_resolved": False,
        }).execute()

        # Notify affected consumers
        if body.area:
            homes = sb.table("homes").select("user_id").eq(
                "area", body.area
            ).execute()
            for home in (homes.data or []):
                try:
                    sb.table("notifications").insert({
                        "user_id": home["user_id"],
                        "type": "outage",
                        "title": "Power Outage in Your Area",
                        "message": f"{body.reason}. Estimated restoration: {body.estimated_end}",
                        "icon": "alert-triangle",
                        "color": "text-red-500",
                        "bg_color": "bg-red-50",
                    }).execute()
                except Exception:
                    pass  # Non-critical

        return outage.data[0] if outage.data else {}
    except Exception as e:
        logger.error(f"Outage create failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/outages/{outage_id}/resolve")
async def resolve_outage(outage_id: str):
    """Resolve an outage — sets is_resolved=True and actual_end=now()."""
    sb = get_supabase()
    try:
        result = sb.table("outage_notices").update({
            "is_resolved": True,
            "actual_end": datetime.now(IST).isoformat(),
        }).eq("id", outage_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Outage not found")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Outage resolve failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

