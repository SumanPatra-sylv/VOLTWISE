"""
VoltWise Admin AI Chat — Natural language → Database queries → Human answers.

Two modes:
  1. **AI mode** — Gemini interprets the question and builds queries dynamically.
  2. **Fallback mode** — If Gemini is unavailable/over-quota, a keyword-based
     matcher handles ~20 common admin questions directly (no AI needed).

Security:
- Only SELECT queries are allowed (no INSERT/UPDATE/DELETE)
- Admin role is verified via Supabase auth token
- Query results are capped to prevent huge payloads
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel

from app.config import get_settings
from app.database import get_supabase

logger = logging.getLogger("voltwise.admin_chat")

router = APIRouter(prefix="/api/admin", tags=["admin-chat"])

# ── Schema context for the LLM ─────────────────────────────────────

DB_SCHEMA = """
Tables in the VoltWise Supabase database (PostgreSQL):

1. profiles (id UUID PK, role TEXT ['consumer','admin','technician'], name TEXT, phone TEXT, email TEXT, consumer_number TEXT, location TEXT, household_members INT, onboarding_done BOOLEAN, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
2. homes (id UUID PK, user_id UUID FK→profiles, name TEXT, address TEXT, city TEXT, state TEXT, pincode TEXT, tariff_category TEXT, tariff_plan_id UUID FK→tariff_plans, discom_id TEXT FK→discoms, sanctioned_load_kw NUMERIC, autopilot_enabled BOOLEAN, autopilot_strategy TEXT, grid_protection_enabled BOOLEAN, is_primary BOOLEAN, created_at TIMESTAMPTZ)
3. meters (id UUID PK, home_id UUID FK→homes, meter_number TEXT, meter_type TEXT ['prepaid','postpaid'], is_active BOOLEAN, balance_amount NUMERIC, last_recharge_amount NUMERIC, last_recharge_date TIMESTAMPTZ, created_at TIMESTAMPTZ)
4. appliances (id UUID PK, home_id UUID FK→homes, name TEXT, category TEXT ['ac','geyser','refrigerator','washing_machine','fan','tv','lighting','other'], rated_power_w INT, status TEXT ['ON','OFF','SCHEDULED','WARNING'], is_active BOOLEAN, source TEXT ['nilm','smart_plug','manual'], created_at TIMESTAMPTZ)
5. recharges (id UUID PK, user_id UUID FK→profiles, meter_id UUID FK→meters, amount NUMERIC, status TEXT ['pending','completed','failed'], payment_method TEXT, transaction_id TEXT, created_at TIMESTAMPTZ)
6. bills (id UUID PK, home_id UUID FK→homes, bill_month DATE, total_kwh NUMERIC, total_amount NUMERIC, status TEXT, due_date DATE, paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ)
7. daily_aggregates (id UUID PK, home_id UUID FK→homes, appliance_id UUID nullable, date DATE, total_kwh NUMERIC, total_cost NUMERIC, peak_power_kw NUMERIC, avg_power_kw NUMERIC, on_hours NUMERIC, carbon_kg NUMERIC)
8. notifications (id UUID PK, user_id UUID FK→profiles, type TEXT, title TEXT, message TEXT, is_read BOOLEAN, icon TEXT, color TEXT, bg_color TEXT, metadata JSONB, created_at TIMESTAMPTZ)
9. complaints (id UUID PK, user_id UUID FK→profiles, home_id UUID FK→homes, type TEXT ['billing','outage','meter_error','voltage','other'], subject TEXT, description TEXT, status TEXT ['open','in_progress','resolved','closed'], priority TEXT, assigned_to UUID, created_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ)
10. schedules (id UUID PK, appliance_id UUID FK→appliances, home_id UUID FK→homes, start_time TEXT, end_time TEXT, repeat_type TEXT, is_active BOOLEAN, created_at TIMESTAMPTZ)
11. control_logs (id UUID PK, appliance_id UUID FK→appliances, action TEXT, trigger_source TEXT, created_at TIMESTAMPTZ)
12. discoms (id TEXT PK, code TEXT, name TEXT, state TEXT, state_code TEXT, is_active BOOLEAN)
13. tariff_plans (id UUID PK, discom_id TEXT FK→discoms, name TEXT, state TEXT, category TEXT, is_active BOOLEAN, effective_from DATE)
14. tariff_slots (id UUID PK, plan_id UUID FK→tariff_plans, hour_label TEXT, start_hour INT, end_hour INT, rate NUMERIC, slot_type TEXT ['off-peak','normal','peak'])
15. consumer_master (id UUID PK, consumer_number TEXT, discom_id TEXT, state TEXT, meter_number TEXT, tariff_category TEXT, connection_type TEXT, sanctioned_load_kw NUMERIC, is_active BOOLEAN)
16. carbon_intensity_schedule (id UUID PK, region_code TEXT, hour INT, gco2_per_kwh NUMERIC, effective_from DATE)
17. grid_events (id UUID PK, discom_id TEXT, event_type TEXT, severity TEXT, message TEXT, start_time TIMESTAMPTZ, end_time TIMESTAMPTZ)
18. technicians (id UUID PK, name TEXT, phone TEXT, specialty TEXT, rating NUMERIC, city TEXT, state TEXT, is_available BOOLEAN, is_verified BOOLEAN)
19. meter_readings (id UUID PK, meter_id UUID FK→meters, timestamp TIMESTAMPTZ, kwh_reading NUMERIC, power_kw NUMERIC, voltage NUMERIC, cost_delta NUMERIC, tariff_rate NUMERIC)

Key relationships:
- profiles.id → homes.user_id (one user has multiple homes)
- homes.id → meters.home_id, appliances.home_id
- meters.id → recharges.meter_id
- profiles.id → recharges.user_id
- homes.tariff_plan_id → tariff_plans.id → tariff_slots.plan_id

Current timestamp function: now()
Date math: INTERVAL '30 days', CURRENT_DATE, etc.
"""

SYSTEM_PROMPT = f"""You are VoltWise Admin AI — an assistant for electricity utility administrators.
You answer questions about users, billing, recharges, outages, energy consumption, and system health
by querying the VoltWise database.

{DB_SCHEMA}

RULES:
1. You MUST generate a JSON response with this exact format:
   {{"queries": [<list of query objects>], "answer_template": "<template with {{{{q0}}}}, {{{{q1}}}} etc placeholders>"}}

2. Each query object: {{"table": "table_name", "select": "columns", "filters": [...], "order": "col.desc", "limit": N}}
   - filters are arrays: ["column", "operator", "value"]
   - operators: "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"
   - For NULL checks: ["column", "is", null]
   - For IN: ["column", "in", ["val1","val2"]]
   - For date math: use ISO date strings. Today is CURRENT_DATE.

3. answer_template uses {{{{q0}}}}, {{{{q1}}}} etc to reference query results.
   Include clear formatting: bullet points, counts, tables where appropriate.

4. ONLY generate READ queries (SELECT). Never INSERT, UPDATE, DELETE.
5. Limit results to 50 rows max unless the question asks for a count.
6. For counts, use select("*", count="exact", head=True) — indicate with: {{"table": "...", "select": "*", "count": true, "filters": [...]}}
7. When the user asks about "outage" or "areas with outage", check the complaints table with type='outage' and/or grid_events table.
8. When asked about users who haven't recharged, join logic: find users where their latest recharge date is older than the threshold, or they have no recharges at all.
9. For "how many" questions, prefer count queries.
10. Include the actual data values in the answer, don't just say "see results".

Example question: "How many users haven't recharged in 30 days?"
Example response:
{{"queries": [{{"table": "profiles", "select": "id, name, phone, consumer_number", "count": true, "filters": [["onboarding_done", "eq", true]]  }}, {{"table": "recharges", "select": "user_id, amount, created_at", "filters": [["created_at", "gte", "CURRENT_DATE_MINUS_30"]], "order": "created_at.desc"}}], "answer_template": "Based on the data:\\n\\n**Total active users:** {{{{q0_count}}}}\\n**Users who recharged in last 30 days:** {{{{q1_count}}}} unique users\\n\\nSo approximately {{{{q0_count}}}} - {{{{q1_count}}}} users haven't recharged in the last 30 days."}}

RESPOND ONLY WITH VALID JSON. No markdown fences, no explanation outside the JSON.
"""


# ── Request / Response models ───────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    conversation_history: list[dict[str, str]] = []


class ChatResponse(BaseModel):
    reply: str
    query_results: list[dict[str, Any]] | None = None
    error: str | None = None


# ── AUTH ────────────────────────────────────────────────────────────

async def _verify_admin(authorization: str | None) -> str:
    """Verify the request comes from an authenticated admin user."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    db = get_supabase()

    try:
        user_response = db.auth.get_user(token)
        user_id = user_response.user.id
    except Exception as e:
        logger.warning(f"Auth verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    result = db.table("profiles").select("role").eq("id", user_id).single().execute()
    if not result.data or result.data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    return user_id


# ── FALLBACK PATTERN MATCHER (no AI needed) ────────────────────────

def _match_days(text: str) -> int:
    """Extract number of days from text like '30 days', '2 weeks', '3 months'."""
    m = re.search(r"(\d+)\s*day", text)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*week", text)
    if m:
        return int(m.group(1)) * 7
    m = re.search(r"(\d+)\s*month", text)
    if m:
        return int(m.group(1)) * 30
    return 30  # default


def _match_amount(text: str) -> float:
    """Extract an amount like ₹100, 200, etc."""
    m = re.search(r"[₹]?\s*(\d+(?:\.\d+)?)", text)
    return float(m.group(1)) if m else 100.0


def _fallback_answer(message: str) -> dict | None:
    """
    Try to match the admin question to a known pattern and return
    a query plan dict (same format the Gemini path produces).
    Returns None if no pattern matches.
    """
    msg = message.lower().strip()
    now = datetime.now(timezone.utc)

    # ── Pattern: users who haven't recharged ──
    if re.search(r"(haven.t|not|no)\s*(recharg|top.?up|paid)", msg):
        days = _match_days(msg)
        cutoff = (now - timedelta(days=days)).isoformat()
        return {
            "queries": [
                {"table": "profiles", "select": "id, name, phone, consumer_number", "count": True,
                 "filters": [["onboarding_done", "eq", True]]},
                {"table": "recharges", "select": "user_id, amount, created_at",
                 "filters": [["created_at", "gte", cutoff]], "order": "created_at.desc", "limit": 100},
            ],
            "mode": "smart",
            "post_process": "recharge_gap",
            "days": days,
        }

    # ── Pattern: outage / areas with outage ──
    if re.search(r"outage|power.?cut|blackout|grid.?event", msg):
        return {
            "queries": [
                {"table": "complaints", "select": "id, subject, description, status, created_at, homes(city, state, area)",
                 "filters": [["type", "eq", "outage"]], "order": "created_at.desc", "limit": 20},
                {"table": "grid_events", "select": "discom_id, event_type, severity, message, start_time, end_time",
                 "order": "start_time.desc", "limit": 20},
            ],
            "mode": "direct",
            "answer_prefix": "**Outage Information:**\n\n",
        }

    # ── Pattern: low balance ──
    if re.search(r"low\s*balance|balance.*(below|under|less)", msg):
        threshold = _match_amount(msg)
        return {
            "queries": [
                {"table": "meters", "select": "id, meter_number, balance_amount, homes(name, user_id, state, city)",
                 "filters": [["is_active", "eq", True], ["balance_amount", "lt", threshold]],
                 "order": "balance_amount.asc", "limit": 30},
            ],
            "mode": "direct",
            "answer_prefix": f"**Meters with balance below ₹{threshold}:**\n\n",
        }

    # ── Pattern: total users / how many users ──
    if re.search(r"(how many|total|count).*(user|consumer|customer)", msg):
        return {
            "queries": [
                {"table": "profiles", "select": "*", "count": True, "filters": []},
                {"table": "profiles", "select": "*", "count": True,
                 "filters": [["onboarding_done", "eq", True]]},
            ],
            "mode": "count_pair",
            "labels": ["Total registered users", "Active (onboarded) users"],
        }

    # ── Pattern: prepaid vs postpaid ──
    if re.search(r"prepaid|postpaid|connection.?type|meter.?type", msg):
        return {
            "queries": [
                {"table": "meters", "select": "*", "count": True,
                 "filters": [["meter_type", "eq", "prepaid"], ["is_active", "eq", True]]},
                {"table": "meters", "select": "*", "count": True,
                 "filters": [["meter_type", "eq", "postpaid"], ["is_active", "eq", True]]},
            ],
            "mode": "count_pair",
            "labels": ["Prepaid meters", "Postpaid meters"],
        }

    # ── Pattern: highest consumption / energy usage ──
    if re.search(r"(highest|most|top).*(consumption|usage|energy|kwh)", msg):
        first_of_month = now.replace(day=1).date().isoformat()
        return {
            "queries": [
                {"table": "daily_aggregates", "select": "home_id, total_kwh, date, homes(name, user_id, state)",
                 "filters": [["date", "gte", first_of_month], ["appliance_id", "is", None]],
                 "order": "total_kwh.desc", "limit": 10},
            ],
            "mode": "direct",
            "answer_prefix": "**Top energy consumers this month:**\n\n",
        }

    # ── Pattern: common appliance / popular appliance ──
    if re.search(r"(common|popular|most).*(appliance|device)", msg):
        return {
            "queries": [
                {"table": "appliances", "select": "category",
                 "filters": [["is_active", "eq", True]], "limit": 100},
            ],
            "mode": "smart",
            "post_process": "category_count",
        }

    # ── Pattern: autopilot / how many using autopilot ──
    if re.search(r"autopilot|auto.?pilot", msg):
        return {
            "queries": [
                {"table": "homes", "select": "*", "count": True,
                 "filters": [["autopilot_enabled", "eq", True]]},
                {"table": "homes", "select": "*", "count": True, "filters": []},
            ],
            "mode": "count_pair",
            "labels": ["Homes with autopilot enabled", "Total homes"],
        }

    # ── Pattern: complaints ──
    if re.search(r"complaint|issue|ticket", msg):
        status = "open"
        if "resolv" in msg:
            status = "resolved"
        elif "progress" in msg:
            status = "in_progress"
        return {
            "queries": [
                {"table": "complaints", "select": "id, type, subject, status, priority, created_at",
                 "filters": [["status", "eq", status]] if status != "all" else [],
                 "order": "created_at.desc", "limit": 20},
                {"table": "complaints", "select": "*", "count": True,
                 "filters": [["status", "eq", "open"]]},
            ],
            "mode": "direct",
            "answer_prefix": f"**Complaints ({status}):**\n\n",
        }

    # ── Pattern: average balance ──
    if re.search(r"average.*(balance|meter)|balance.*average", msg):
        return {
            "queries": [
                {"table": "meters", "select": "balance_amount",
                 "filters": [["is_active", "eq", True]], "limit": 100},
            ],
            "mode": "smart",
            "post_process": "average_balance",
        }

    # ── Pattern: recent recharges ──
    if re.search(r"recent.*(recharg|payment)|last.*(recharg|payment)", msg):
        return {
            "queries": [
                {"table": "recharges", "select": "user_id, amount, status, payment_method, created_at, profiles(name, phone)",
                 "order": "created_at.desc", "limit": 15},
            ],
            "mode": "direct",
            "answer_prefix": "**Recent recharges:**\n\n",
        }

    # ── Pattern: DISCOM / state distribution ──
    if re.search(r"discom|state.*(distribut|breakdown)|which.*(state|area)", msg):
        return {
            "queries": [
                {"table": "homes", "select": "state, discom_id",
                 "filters": [], "limit": 100},
            ],
            "mode": "smart",
            "post_process": "state_distribution",
        }

    # ── Pattern: technicians ──
    if re.search(r"technician|repair|service.?person", msg):
        return {
            "queries": [
                {"table": "technicians", "select": "name, phone, specialty, rating, city, is_available",
                 "order": "rating.desc", "limit": 20},
            ],
            "mode": "direct",
            "answer_prefix": "**Technicians:**\n\n",
        }

    # ── Pattern: pending onboarding ──
    if re.search(r"pending|not.*(onboard|complet|active)|inactive", msg):
        return {
            "queries": [
                {"table": "profiles", "select": "id, name, email, phone, created_at",
                 "filters": [["onboarding_done", "eq", False]],
                 "order": "created_at.desc", "limit": 30},
            ],
            "mode": "direct",
            "answer_prefix": "**Users with pending onboarding:**\n\n",
        }

    return None  # No pattern matched


def _execute_query(query_spec: dict) -> dict[str, Any]:
    """Execute a single Supabase query from the spec."""
    db = get_supabase()
    table = query_spec.get("table", "")
    select_cols = query_spec.get("select", "*")
    filters = query_spec.get("filters", [])
    order = query_spec.get("order")
    limit = min(query_spec.get("limit", 50), 100)
    is_count = query_spec.get("count", False)

    if not re.match(r"^[a-z_][a-z0-9_]*$", table):
        return {"error": f"Invalid table name: {table}", "data": [], "count": 0}

    if re.search(r"(;|--|drop\s|delete\s|insert\s|update\s|alter\s|create\s|grant\s)", select_cols, re.IGNORECASE):
        return {"error": "Rejected: suspicious column spec", "data": [], "count": 0}

    try:
        if is_count:
            q = db.table(table).select(select_cols, count="exact")
        else:
            q = db.table(table).select(select_cols)

        for f in filters:
            if len(f) < 3:
                continue
            col, op, val = f[0], f[1], f[2]
            if not re.match(r"^[a-z_][a-z0-9_.]*$", col):
                continue

            # Sanitize date placeholders
            if isinstance(val, str):
                val = _sanitize_date_placeholders(val)

            if op == "eq":     q = q.eq(col, val)
            elif op == "neq":  q = q.neq(col, val)
            elif op == "gt":   q = q.gt(col, val)
            elif op == "gte":  q = q.gte(col, val)
            elif op == "lt":   q = q.lt(col, val)
            elif op == "lte":  q = q.lte(col, val)
            elif op == "like": q = q.like(col, val)
            elif op == "ilike":q = q.ilike(col, f"%{val}%")
            elif op == "in" and isinstance(val, list): q = q.in_(col, val)
            elif op == "is":   q = q.is_(col, val)

        if order:
            parts = order.split(".")
            col_name = parts[0]
            desc = len(parts) > 1 and parts[1] == "desc"
            if re.match(r"^[a-z_][a-z0-9_]*$", col_name):
                q = q.order(col_name, desc=desc)

        if not is_count:
            q = q.limit(limit)

        result = q.execute()
        return {
            "data": result.data if not is_count else [],
            "count": getattr(result, "count", None) or len(result.data or []),
        }
    except Exception as e:
        logger.error(f"Query execution error on table '{table}': {e}")
        return {"error": str(e)[:200], "data": [], "count": 0}


def _sanitize_date_placeholders(value: str) -> str:
    now = datetime.now(timezone.utc)
    match = re.match(r"CURRENT_DATE_MINUS_(\d+)", value)
    if match:
        return (now - timedelta(days=int(match.group(1)))).isoformat()
    if value == "CURRENT_DATE":
        return now.date().isoformat()
    match = re.match(r"CURRENT_DATE_PLUS_(\d+)", value)
    if match:
        return (now + timedelta(days=int(match.group(1)))).isoformat()
    return value


# ── Smart post-processors ──────────────────────────────────────────

def _post_process(post_type: str, results: list[dict], plan: dict) -> str:
    """Run smart aggregation on query results."""
    if post_type == "recharge_gap":
        days = plan.get("days", 30)
        total_active = results[0].get("count", 0) if results else 0
        recent_recharges = results[1].get("data", []) if len(results) > 1 else []
        recent_user_ids = set(r.get("user_id") for r in recent_recharges if r.get("user_id"))
        recharged_count = len(recent_user_ids)
        not_recharged = max(0, total_active - recharged_count)

        answer = (
            f"**Recharge Analysis (last {days} days):**\n\n"
            f"- **Total active users:** {total_active}\n"
            f"- **Users who recharged:** {recharged_count}\n"
            f"- **Users who haven't recharged:** {not_recharged}\n"
        )
        if not_recharged > 0:
            pct = round((not_recharged / max(total_active, 1)) * 100, 1)
            answer += f"\n⚠️ {pct}% of active users haven't recharged in {days} days."
        return answer

    if post_type == "category_count":
        data = results[0].get("data", []) if results else []
        counts: dict[str, int] = {}
        for row in data:
            cat = row.get("category", "other")
            counts[cat] = counts.get(cat, 0) + 1
        sorted_cats = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        lines = [f"- **{cat}**: {n} appliances" for cat, n in sorted_cats]
        return "**Appliance Categories (active):**\n\n" + "\n".join(lines)

    if post_type == "average_balance":
        data = results[0].get("data", []) if results else []
        if not data:
            return "No active meters found."
        balances = [float(r.get("balance_amount", 0)) for r in data]
        avg = sum(balances) / len(balances)
        mn = min(balances)
        mx = max(balances)
        return (
            f"**Meter Balance Stats ({len(balances)} active meters):**\n\n"
            f"- **Average balance:** ₹{avg:.2f}\n"
            f"- **Lowest:** ₹{mn:.2f}\n"
            f"- **Highest:** ₹{mx:.2f}"
        )

    if post_type == "state_distribution":
        data = results[0].get("data", []) if results else []
        states: dict[str, int] = {}
        discoms: dict[str, int] = {}
        for row in data:
            s = row.get("state", "Unknown")
            d = row.get("discom_id", "Unknown")
            states[s] = states.get(s, 0) + 1
            discoms[d] = discoms.get(d, 0) + 1
        s_lines = [f"- **{s}**: {n} homes" for s, n in sorted(states.items(), key=lambda x: x[1], reverse=True)]
        d_lines = [f"- **{d}**: {n} homes" for d, n in sorted(discoms.items(), key=lambda x: x[1], reverse=True)]
        return "**State Distribution:**\n" + "\n".join(s_lines) + "\n\n**DISCOM Distribution:**\n" + "\n".join(d_lines)

    return "Results processed."


def _format_data_rows(data: list[dict], limit: int = 15) -> str:
    """Format data rows into readable bullet points."""
    if not data:
        return "No data found."
    lines = []
    for row in data[:limit]:
        parts = []
        for k, v in row.items():
            if v is None or k == "id":
                continue
            if isinstance(v, dict):
                # Nested join data
                inner = ", ".join(f"{ik}: {iv}" for ik, iv in v.items() if iv)
                parts.append(f"**{k}**: ({inner})")
            else:
                parts.append(f"**{k}**: {v}")
        lines.append("- " + ", ".join(parts))
    text = "\n".join(lines)
    if len(data) > limit:
        text += f"\n\n... and {len(data) - limit} more rows."
    return text


def _build_fallback_response(plan: dict) -> ChatResponse:
    """Execute fallback plan and build response."""
    queries = plan.get("queries", [])
    results = [_execute_query(q) for q in queries[:5]]

    mode = plan.get("mode", "direct")
    query_summaries = [
        {"query_index": i, "table": q.get("table", "?"), "count": r.get("count", 0), "error": r.get("error")}
        for i, (q, r) in enumerate(zip(queries, results))
    ]

    # Smart post-processing
    if mode == "smart" and plan.get("post_process"):
        answer = _post_process(plan["post_process"], results, plan)
        return ChatResponse(reply=answer, query_results=query_summaries)

    # Count pair mode (e.g., "prepaid vs postpaid")
    if mode == "count_pair":
        labels = plan.get("labels", [])
        lines = []
        for i, r in enumerate(results):
            label = labels[i] if i < len(labels) else f"Query {i}"
            lines.append(f"- **{label}:** {r.get('count', 0)}")
        return ChatResponse(reply="\n".join(lines), query_results=query_summaries)

    # Direct mode — just format data
    prefix = plan.get("answer_prefix", "")
    all_data = []
    for r in results:
        if r.get("data"):
            all_data.extend(r["data"])

    if all_data:
        answer = prefix + _format_data_rows(all_data)
    else:
        counts = [r.get("count", 0) for r in results]
        if any(c > 0 for c in counts):
            answer = prefix + f"Found {sum(counts)} total records."
        else:
            answer = prefix + "No matching data found."

    return ChatResponse(reply=answer, query_results=query_summaries)


# ── Gemini AI pathway ──────────────────────────────────────────────

async def _call_gemini(prompt: str, history: list[dict[str, str]]) -> str | None:
    """Call Google Gemini API. Returns None if unavailable (quota/key issues)."""
    import httpx

    settings = get_settings()
    api_key = settings.gemini_api_key
    if not api_key:
        return None

    contents = []
    for msg in history[-6:]:
        contents.append({
            "role": "user" if msg["role"] == "user" else "model",
            "parts": [{"text": msg["content"]}]
        })
    contents.append({"role": "user", "parts": [{"text": prompt}]})

    # Try multiple models in order of preference
    models = ["gemini-2.0-flash", "gemini-2.0-flash-lite"]

    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                response = await client.post(url, json={
                    "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
                    "contents": contents,
                    "generationConfig": {
                        "temperature": 0.1,
                        "maxOutputTokens": 2048,
                        "responseMimeType": "application/json",
                    }
                })

            if response.status_code == 200:
                result = response.json()
                text = result["candidates"][0]["content"]["parts"][0]["text"]
                return text.strip()

            if response.status_code == 429:
                logger.warning(f"Gemini {model} rate-limited, trying next model...")
                continue

            logger.error(f"Gemini {model} error {response.status_code}: {response.text[:300]}")
            continue
        except Exception as e:
            logger.error(f"Gemini {model} call failed: {e}")
            continue

    return None  # All models failed


def _format_answer(template: str, results: list[dict[str, Any]]) -> str:
    """Replace {q0}, {q1}, {q0_count} etc. in the answer template."""
    for i, result in enumerate(results):
        count = result.get("count", 0)
        data = result.get("data", [])

        template = template.replace(f"{{{{q{i}_count}}}}", str(count))
        template = template.replace(f"{{q{i}_count}}", str(count))

        if data:
            data_str = _format_data_rows(data)
        else:
            data_str = f"({count} results)" if count else "No data found"

        template = template.replace(f"{{{{q{i}}}}}", data_str)
        template = template.replace(f"{{q{i}}}", data_str)

    return template


# ── Main endpoint ───────────────────────────────────────────────────

@router.post("/chat", response_model=ChatResponse)
async def admin_chat(
    body: ChatRequest,
    authorization: str | None = Header(default=None),
):
    """
    Admin AI Chat — ask questions about the VoltWise system in plain English.
    Requires admin role.
    """
    await _verify_admin(authorization)

    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(message) > 1000:
        raise HTTPException(status_code=400, detail="Message too long (max 1000 chars)")

    try:
        # Try Gemini first
        ai_response = await _call_gemini(message, body.conversation_history)

        if ai_response:
            # AI mode — parse and execute the generated plan
            try:
                plan = json.loads(ai_response)
            except json.JSONDecodeError:
                json_match = re.search(r"\{.*\}", ai_response, re.DOTALL)
                plan = json.loads(json_match.group()) if json_match else None

            if plan and plan.get("queries"):
                queries = plan["queries"]
                answer_template = plan.get("answer_template", "Here are the results: {q0}")
                results = [_execute_query(q) for q in queries[:5]]
                answer = _format_answer(answer_template, results)
                summaries = [
                    {"query_index": i, "table": q.get("table", "?"),
                     "count": r.get("count", 0), "error": r.get("error")}
                    for i, (q, r) in enumerate(zip(queries[:5], results))
                ]
                return ChatResponse(reply=answer, query_results=summaries)
            elif plan:
                return ChatResponse(reply=plan.get("answer_template", "I couldn't find relevant data."))

        # Gemini unavailable or failed — use fallback pattern matcher
        logger.info("Gemini unavailable, using fallback pattern matcher")
        fallback_plan = _fallback_answer(message)

        if fallback_plan:
            return _build_fallback_response(fallback_plan)

        # No pattern matched AND no AI
        return ChatResponse(
            reply=(
                "I can answer questions about:\n\n"
                "- **Users** — counts, who hasn't recharged, pending onboarding\n"
                "- **Billing** — low balances, average balance, recent recharges\n"
                "- **Energy** — top consumers, appliance categories, autopilot usage\n"
                "- **Issues** — outages, complaints, grid events\n"
                "- **System** — prepaid vs postpaid, state/DISCOM distribution, technicians\n\n"
                "Try asking something specific like:\n"
                "\"How many users haven't recharged in 30 days?\"\n"
                "\"Show me areas with outage complaints\"\n"
                "\"What's the average meter balance?\""
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin chat error: {e}", exc_info=True)
        return ChatResponse(
            reply="Sorry, I encountered an error processing your question. Please try again.",
            error=str(e)[:200],
        )
