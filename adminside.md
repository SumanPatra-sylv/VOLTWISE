# VoltWise — Admin Panel Modules

> **⚠️ TEAM REFERENCE — DO NOT EDIT CASUALLY**
> Single source of truth for all admin-side functionality.
> Maps to `database_schema.md` tables and `api_endpoints.md` endpoints.
> Last updated: 2026-02-21 v2

> [!CAUTION]
> **PoC uses seeded (simulated) data** for Modules 4, 5, 7, and 9.
> All query logic is production-ready — only the underlying data is synthetic.
> When real meters/users are onboarded, these modules work automatically with no code changes.
> Seeded data is clearly marked with `source = 'seed'` or `created_by = 'seed_script'` where applicable.

> [!IMPORTANT]
> **Prepaid-first design.** All meters default to `meter_type = 'prepaid'`. Revenue is tracked through `recharges`, not bill payments. Postpaid (`bills`, `payments`) tables exist in the schema for future use but are **not the primary flow** — they can be ignored in all admin UI, reports, and calculations unless explicitly needed for a commercial/industrial consumer.

---

## Architecture Overview

```
Admin Frontend (React/Next.js)
  │
  ├── Supabase JS SDK ──→ Direct CRUD (users, complaints, tariffs, outages)
  ├── Supabase RPC     ──→ Aggregated dashboard stats
  └── Axios            ──→ FastAPI (reports, exports, analytics)

Auth: Supabase Auth + JWT with role claim (admin / super_admin)
RLS:  is_admin() helper function grants full read/write across all tables
```

> [!IMPORTANT]
> Every admin endpoint checks `role IN ('admin', 'super_admin')` via JWT claims.
> Role-based module visibility is enforced on the frontend via route guards.

---

## Module 1: Executive Dashboard

**Purpose:** High-level KPIs for management. First screen after admin login. Must load in < 2 seconds.

### KPIs & Data Sources

| KPI | Source Table | Query Logic |
|-----|-------------|-------------|
| Total Consumers | `profiles` | `COUNT(*) WHERE role = 'consumer'` |
| Active Smart Meters | `meters` | `COUNT(*) WHERE is_active = TRUE` |
| Offline Meters | `smart_plugs` | `COUNT(*) WHERE plug_status = 'offline'` + meters with no reading in 24h |
| Total App Users | `profiles` | `COUNT(*) WHERE onboarding_done = TRUE` |
| Total Linked Appliances | `appliances` | `COUNT(*) WHERE is_active = TRUE` |
| Today's Revenue | `recharges` | `SUM(amount) WHERE status = 'success' AND paid_at >= CURRENT_DATE` (prepaid recharges) |
| Monthly Revenue | `recharges` | `SUM(amount) WHERE status = 'success' AND paid_at >= date_trunc('month', now())` |
| Active Rechargers (7d) | `recharges` | `COUNT(DISTINCT user_id) WHERE paid_at > now() - interval '7 days' AND status = 'success'` |
| Critical Balance Users | `meters` | `COUNT(*) WHERE balance_amount < 50 AND is_active = TRUE` — users at risk of disconnection |
| Peak Load (Today) | `meter_readings` | `MAX(power_kw) WHERE timestamp >= CURRENT_DATE` |
| Current Tariff Band | `tariff_slots` | Current hour matched against `start_hour`/`end_hour` → `slot_type` |
| Pending Complaints | `complaints` | `COUNT(*) WHERE status NOT IN ('resolved', 'closed')` |
| Avg Resolution Time | `complaints` | `AVG(resolved_at - created_at) WHERE resolved_at IS NOT NULL` |
| Total User Savings (₹) | `bills` | `SUM(savings_amount)` across all homes |
| CO₂ Reduction | `carbon_stats` | `SUM(co2_saved_kg)` across all homes for current month |

### Backend Implementation

- **RPC Function:** `get_admin_dashboard_stats()` — single function returning all KPIs as JSON
- **Caching:** Redis/in-memory cache with 60s TTL (stats don't need real-time)
- **Endpoint:** `GET /api/admin/dashboard` (FastAPI, aggregates from multiple tables)

---

## Module 2: Consumer Management

**Purpose:** Search, filter, and deep-dive into any consumer's profile, usage, and risk flags.

### Consumer List View

**Source:** Supabase RPC `get_admin_users()` (already defined in `10_admin_enhancements.sql`) — single call, server-side joins, admin-only enforced.

```typescript
// Returns: id, name, email, phone, consumer_number, role, onboarding_done,
//          created_at, home_name, meter_number, balance, total_recharges, total_recharge_amount
const { data } = await supabase.rpc('get_admin_users')
```

**Client-side filters** (applied on the RPC result or passed as params if needed):

| Filter | Column | Notes |
|--------|--------|-------|
| Search | `name`, `consumer_number`, `phone`, `email` | Case-insensitive substring match |
| Area | `homes.area` | Dropdown from distinct areas |
| Tariff Category | `homes.tariff_category` | `residential`, `commercial`, `industrial`, `agricultural` |
| Balance Status | `meters.balance_amount` | Critical (< ₹50) / Low (₹50–₹200) / Normal (> ₹200) |
| Onboarding | `profiles.onboarding_done` | Completed / Incomplete |
| Feeder | `homes.feeder_id` | DISCOM feeder reference |
| Last Recharge | `meters.last_recharge_date` | > 30 days ago / > 45 days ago |

> [!NOTE]
> Meter type filter removed — all meters are prepaid by default. If a commercial/industrial postpaid meter exists in future, add the filter back at that point.

### Consumer Profile Page (Full Deep-Dive)

**Access:** Admin clicks any row in the consumer list → opens dedicated profile page.

**Data strategy:** One RPC call loads everything needed for the initial render. Heavy history (full recharge list, full complaint timeline, raw meter readings) is lazy-loaded per tab so the page opens instantly.

#### RPC: `get_consumer_profile(p_user_id UUID)`

Single round-trip returning all profile data as JSON. Add to Supabase SQL editor:

```sql
CREATE OR REPLACE FUNCTION get_consumer_profile(p_user_id UUID)
RETURNS JSON AS $$
DECLARE result JSON;
BEGIN
    IF NOT is_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;

    SELECT json_build_object(
        'profile',          (SELECT row_to_json(p) FROM (
                                SELECT id, name, email, phone, consumer_number,
                                       avatar_url, location, household_members,
                                       onboarding_done, role, created_at
                                FROM profiles WHERE id = p_user_id) p),

        'home',             (SELECT row_to_json(h) FROM (
                                SELECT id, name, address, city, state, pincode, area,
                                       feeder_id, tariff_category, tariff_plan_id,
                                       sanctioned_load_kw, autopilot_enabled,
                                       autopilot_strategy, grid_protection_enabled, is_primary, created_at
                                FROM homes WHERE user_id = p_user_id AND is_primary = TRUE LIMIT 1) h),

        'meter',            (SELECT row_to_json(m) FROM (
                                SELECT me.id, me.meter_number, me.meter_type, me.is_active,
                                       me.balance_amount, me.last_recharge_amount,
                                       me.last_recharge_date, me.last_reading_at,
                                       me.manufacturer, me.installation_date
                                FROM meters me
                                JOIN homes hm ON me.home_id = hm.id
                                WHERE hm.user_id = p_user_id AND me.is_active = TRUE LIMIT 1) m),

        'tariff',           (SELECT row_to_json(t) FROM (
                                SELECT tp.name, tp.category, tp.fixed_charge_per_kw,
                                       d.name AS discom_name, d.code AS discom_code, d.state
                                FROM tariff_plans tp
                                JOIN discoms d ON d.id = tp.discom_id
                                JOIN homes hm ON hm.tariff_plan_id = tp.id
                                WHERE hm.user_id = p_user_id AND hm.is_primary = TRUE LIMIT 1) t),

        'appliances',       (SELECT json_agg(a ORDER BY a.sort_order) FROM (
                                SELECT ap.id, ap.name, ap.icon, ap.category, ap.status,
                                       ap.rated_power_w, ap.current_power_w, ap.is_active,
                                       ap.optimization_tier, ap.source, ap.eco_mode_enabled
                                FROM appliances ap
                                JOIN homes hm ON ap.home_id = hm.id
                                WHERE hm.user_id = p_user_id AND ap.is_active = TRUE) a),

        'recharge_stats',   (SELECT row_to_json(rs) FROM (
                                SELECT COUNT(*)                       AS total_count,
                                       COALESCE(SUM(amount),   0)    AS total_amount,
                                       COALESCE(AVG(amount),   0)    AS avg_amount,
                                       MAX(paid_at)                  AS last_recharge_at,
                                       MIN(paid_at)                  AS first_recharge_at
                                FROM recharges
                                WHERE user_id = p_user_id AND status = 'success') rs),

        'recent_recharges', (SELECT json_agg(r) FROM (
                                SELECT id, amount, method, units_credited,
                                       balance_after, paid_at
                                FROM recharges
                                WHERE user_id = p_user_id AND status = 'success'
                                ORDER BY created_at DESC LIMIT 5) r),

        'open_complaints',  (SELECT json_agg(c) FROM (
                                SELECT id, type, subject, status, priority,
                                       assigned_to, created_at
                                FROM complaints
                                WHERE user_id = p_user_id
                                  AND status NOT IN ('resolved', 'closed')
                                ORDER BY created_at DESC) c),

        'usage_30d',        (SELECT json_agg(da) FROM (
                                SELECT date, total_kwh, total_cost, peak_power_kw
                                FROM daily_aggregates da
                                JOIN homes hm ON da.home_id = hm.id
                                WHERE hm.user_id = p_user_id
                                  AND da.appliance_id IS NULL
                                  AND date >= CURRENT_DATE - INTERVAL '30 days'
                                ORDER BY date DESC) da),

        'monthly_usage',    (SELECT json_agg(mu) FROM (
                                SELECT date_trunc('month', date)::date AS month,
                                       SUM(total_kwh) AS kwh,
                                       SUM(total_cost) AS cost
                                FROM daily_aggregates da
                                JOIN homes hm ON da.home_id = hm.id
                                WHERE hm.user_id = p_user_id
                                  AND da.appliance_id IS NULL
                                  AND date >= CURRENT_DATE - INTERVAL '6 months'
                                GROUP BY 1 ORDER BY 1 DESC) mu)
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_consumer_profile(UUID) TO authenticated;
```

**Frontend call:**
```typescript
const { data: profile } = await supabase.rpc('get_consumer_profile', { p_user_id: userId })
```

#### Profile Page — Header Cards (always visible)

| Card | Value | Alert Condition |
|------|-------|----------------|
| Balance | `meter.balance_amount` in ₹ | 🔴 Critical (< ₹50) · 🟡 Low (₹50–₹200) · 🟢 Normal |
| Last Recharge | Amount + relative date | 🟠 Flag if > 30 days ago; 🔴 Flag if > 45 days ago |
| This Month Usage | Sum of `usage_30d.total_kwh` for current month | Compare to 3-month avg from `monthly_usage` |
| Open Complaints | Count of `open_complaints` | 🔴 if any item has `priority >= 4` |

#### Profile Page — Tabs

| Tab | Content | Data Source |
|-----|---------|-------------|
| **Overview** | Name, email, phone, consumer #, area, DISCOM, tariff plan, sanctioned load, household members, onboarding status, account created date | `profile` + `home` + `tariff` from RPC |
| **Meter & Balance** | Meter number, type, manufacturer, install date, current balance (big card), last recharge details, last reading timestamp, 30-day daily usage bar chart | `meter` + `usage_30d` from RPC |
| **Appliances** | Cards per appliance — name, icon, status badge (ON/OFF/SCHEDULED), rated wattage, optimization tier, source (manual/NILM/smart plug), eco mode | `appliances` from RPC |
| **Recharge History** | Timeline: amount, method, units credited, balance after; first 5 from RPC, load more via paginated endpoint | `recent_recharges` from RPC → then lazy `GET /api/admin/consumers/{id}/recharges` |
| **Complaints** | All complaints (open + resolved), status chips, priority, assigned engineer; click row to see update timeline | `open_complaints` from RPC → then lazy `GET /api/admin/consumers/{id}/complaints` |
| **Activity** | 6-month consumption trend (bar chart), autopilot on/off, autopilot strategy, active schedules count, recommendation adoption %, carbon this month | `monthly_usage` + `home.autopilot_*` from RPC |

#### Admin Actions (per profile page)

| Action | Endpoint / Query | Who Can |
|--------|-----------------|---------|
| Manual Top-Up | `UPDATE meters SET balance_amount = balance_amount + :amount` + insert `recharges` row with `method = 'manual'`, `status = 'success'` | `super_admin` |
| Send Notification | `INSERT INTO notifications (user_id, type, title, message, ...)` | `admin` + |
| Disconnect Meter | `UPDATE meters SET is_active = FALSE WHERE id = :meter_id` | `super_admin` |
| Reconnect Meter | `UPDATE meters SET is_active = TRUE WHERE id = :meter_id` | `super_admin` |
| Assign Complaint | `UPDATE complaints SET assigned_to = :name, status = 'assigned'` | `admin` + |
| Promote to Admin | `UPDATE profiles SET role = 'admin' WHERE id = :user_id` | `super_admin` |
| Export Profile PDF | `GET /api/admin/consumers/{id}/export?format=pdf` | `admin` + |

> [!NOTE]
> Every admin action must insert a row into `admin_audit_logs` (action_type, target_table, target_id, previous_value, new_value). Manual top-up should also insert a `recharges` record with `transaction_id = 'ADMIN-MANUAL-{timestamp}'` to keep the recharge history complete.

#### Lazy-Loaded Endpoints (per-tab, on-demand)

```
GET /api/admin/consumers/{id}/recharges?page=1&limit=20
GET /api/admin/consumers/{id}/complaints?status=all&page=1
GET /api/admin/consumers/{id}/meter-readings?range=7d
GET /api/admin/consumers/{id}/risk-score
```

**Consumer Insights (summary row below header cards):**

| Insight | Source | Logic |
|---------|--------|-------|
| Monthly consumption trend | `monthly_usage` (RPC) | Bar chart, last 6 months |
| Avg monthly recharge | `recharge_stats.avg_amount` (RPC) | Over lifetime |
| Total recharged (lifetime) | `recharge_stats.total_amount` (RPC) | ₹ lifetime value |
| Recharge frequency | `recharge_stats.total_count` / months since joining | Recharges/month |
| Appliance count | `appliances.length` (RPC) | Active appliances |
| Risk flags | `GET /api/admin/consumers/{id}/risk-score` (lazy) | See Risk Detection below |

### Risk Detection Logic

```python
# FastAPI — GET /api/admin/consumers/{id}/risk-score
# All checks are prepaid-oriented. No bill/payment defaulter logic.
def calculate_risk(user_id):
    flags = []

    # --- BALANCE RISK (most critical for prepaid) ---
    balance = get_meter_balance(user_id)
    if balance < 50:
        flags.append({"type": "critical_balance", "severity": "critical",
                      "value": balance, "label": f"Balance ₹{balance:.0f} — disconnection imminent"})
    elif balance < 200:
        flags.append({"type": "low_balance", "severity": "high",
                      "value": balance, "label": f"Balance ₹{balance:.0f} — recharge needed soon"})

    # --- RECHARGE INACTIVITY ---
    days_since_recharge = (now() - last_recharge_date(user_id)).days
    if days_since_recharge > 45:
        flags.append({"type": "non_recharging", "severity": "high",
                      "days": days_since_recharge, "label": f"No recharge in {days_since_recharge} days"})
    elif days_since_recharge > 30:
        flags.append({"type": "recharge_overdue", "severity": "medium",
                      "days": days_since_recharge, "label": f"No recharge in {days_since_recharge} days"})

    # --- USAGE ANOMALIES ---
    recent_kwh     = avg_daily_kwh(user_id, last_7_days)
    historical_kwh = avg_daily_kwh(user_id, last_90_days)

    if historical_kwh > 0 and recent_kwh > historical_kwh * 2:
        flags.append({"type": "usage_spike", "severity": "high",
                      "ratio": round(recent_kwh / historical_kwh, 1),
                      "label": f"Usage {recent_kwh/historical_kwh:.1f}× above 90-day average"})

    # Sudden drop — possible meter fault, tampering, or vacant home
    if historical_kwh > 0 and recent_kwh < historical_kwh * 0.3:
        flags.append({"type": "usage_drop", "severity": "critical",
                      "ratio": round(recent_kwh / historical_kwh, 1),
                      "label": f"Usage dropped to {recent_kwh/historical_kwh:.0%} of normal"})

    # --- METER OFFLINE ---
    hours_since_reading = hours_since_last_reading(user_id)
    if hours_since_reading > 24:
        flags.append({"type": "meter_offline", "severity": "high",
                      "hours": hours_since_reading,
                      "label": f"No meter reading in {hours_since_reading:.0f} hours"})

    # Risk score: 0–100 (capped)
    severity_weights = {"critical": 40, "high": 25, "medium": 15}
    score = min(sum(severity_weights.get(f["severity"], 10) for f in flags), 100)

    return {"risk_score": score, "flags": flags, "user_id": user_id}
```

---

## Module 3: Revenue & Recharge Analytics

**Purpose:** Revenue tracking from recharges, balance health monitoring, and financial reporting. Postpaid bills/payments are intentionally excluded from primary reports.

### Revenue Reports

**Endpoint:** `GET /api/admin/reports/revenue?period=month&date=2026-02&group_by=area`

| Report | Query Logic |
|--------|-------------|
| Daily revenue | `SUM(amount) FROM recharges WHERE status = 'success' AND paid_at::date = target_date GROUP BY paid_at::date` |
| Monthly revenue | Same, grouped by `date_trunc('month', paid_at)` |
| Revenue by area | Join `recharges → profiles → homes` and `GROUP BY homes.area` |
| Revenue by tariff category | Join through `homes.tariff_category` and `GROUP BY` |
| Top 10 consumers (by recharge) | `SELECT user_id, SUM(amount) FROM recharges WHERE status = 'success' GROUP BY user_id ORDER BY SUM DESC LIMIT 10` |
| Avg recharge amount | `AVG(amount) FROM recharges WHERE status = 'success' GROUP BY date_trunc('month', paid_at)` |

### Balance Health Reports

**Endpoint:** `GET /api/admin/reports/balance-health`

| Report | Logic |
|--------|-------|
| Critical balance users (< ₹50) | `SELECT m.*, p.name, p.phone FROM meters m JOIN homes h ON m.home_id = h.id JOIN profiles p ON h.user_id = p.id WHERE m.balance_amount < 50 AND m.is_active = TRUE ORDER BY balance_amount ASC` |
| Low balance users (₹50–₹200) | Same with `balance_amount BETWEEN 50 AND 200` |
| Non-recharging users (30+ days) | `SELECT user_id FROM meters m JOIN homes h ON m.home_id = h.id WHERE m.last_recharge_date < now() - interval '30 days' AND m.is_active = TRUE` |
| Non-recharging users (45+ days) | Same with `interval '45 days'` — escalated risk |
| Avg balance across all meters | `AVG(balance_amount) FROM meters WHERE is_active = TRUE` |

> [!NOTE]
> "Defaulter" in a prepaid context means **non-recharging + critically low balance**, not unpaid bills. These two columns from `meters` table (`balance_amount`, `last_recharge_date`) are the primary risk indicators.

### Export

- **Endpoint:** `GET /api/admin/export?type=revenue&period=month&date=2026-02&format=csv`
- **Backend:** FastAPI generates CSV/PDF using `pandas` + `reportlab`
- **Formats:** CSV (instant), PDF (monthly summary with charts via `matplotlib`)

---

## Module 4: Load & Consumption Analytics

**Purpose:** Grid-level intelligence for DISCOM operations and planning.

> [!NOTE]
> **PoC: Uses seeded time-series data.** We seed ~2,880 meter_readings per meter (30 days × 96 readings/day at 15-min intervals) with realistic Indian residential load curves (0.3–3.5 kW). All queries below work identically on seeded vs real data.

### Load Metrics

| Metric | Source | Logic |
|--------|--------|-------|
| 24-hour load curve | `meter_readings` | `AVG(power_kw) GROUP BY EXTRACT(HOUR FROM timestamp)` for today |
| Peak demand time | `meter_readings` | `MAX(SUM(power_kw))` grouped by hour across all meters |
| Area-wise load | `meter_readings` join `meters → homes` | `SUM(power_kw) GROUP BY homes.area` |
| Seasonal comparison | `daily_aggregates` | Monthly `AVG(total_kwh)` over last 12 months |
| High-consumption clusters | `daily_aggregates` | Areas where `AVG(total_kwh) > 1.5 * global_avg` |

### Anomaly Detection

**Endpoint:** `GET /api/admin/reports/consumption`

| Anomaly | Detection Logic |
|---------|-----------------|
| Zero consumption | `SELECT m.* FROM meters m LEFT JOIN meter_readings mr ON mr.meter_id = m.id AND mr.timestamp > now() - interval '24h' WHERE mr.id IS NULL AND m.is_active = TRUE` — LEFT JOIN scales far better than NOT IN on large tables |
| Sudden spike | Consumer's `last_7_day_avg > 2 × last_90_day_avg` |
| Sudden drop | Consumer's `last_7_day_avg < 0.3 × last_90_day_avg` |
| High-risk meters | Composite: zero consumption + spike + drop + offline status |

**Backend:** FastAPI runs these queries nightly and stores results in a `risk_flags` materialized view or cache for fast admin access.

---

## Module 5: Optimization Impact Dashboard

**Purpose:** Proves the Super App's value — savings, load shifting, scheduling adoption. Critical for stakeholder demos and pilot evaluation.

> [!NOTE]
> **PoC: Uses seeded data to show "3-month pilot results".** We seed `bills.savings_amount`, `schedules`, `recommendations` (with `is_acted_on = true`), and `carbon_stats` for 50 demo consumers to simulate what the dashboard looks like after a real 3-month pilot. All query logic is production-ready.

### Metrics & Sources

| Metric | Source | Logic |
|--------|--------|-------|
| Total ₹ savings | `bills.savings_amount` | `SUM(savings_amount)` across all bills |
| Avg savings per household | Same | `AVG(savings_amount)` grouped by home |
| % load shifted to off-peak | `meter_readings` + `tariff_slots` | Compare kWh consumed during off-peak before vs after optimization adoption |
| Scheduling adoption rate | `schedules` | `COUNT(DISTINCT home_id WHERE schedules.is_active) / COUNT(DISTINCT homes.id) * 100` |
| Top optimized appliances | `recommendations` | `COUNT(*) WHERE is_acted_on = TRUE GROUP BY appliance_id ORDER BY count DESC` |
| CO₂ reduction (aggregated) | `carbon_stats` | `SUM(co2_saved_kg)` across all homes |

### Backend

```python
# FastAPI — GET /api/admin/reports/optimization
def optimization_impact():
    return {
        "total_savings": sum_bills_savings(),
        "avg_savings_per_household": avg_bills_savings_per_home(),
        "off_peak_shift_percent": calculate_load_shift(),  # Compare hour-wise consumption patterns
        "scheduling_adoption": active_schedules_homes() / total_homes() * 100,
        "top_appliances": top_optimized_appliances(limit=10),
        "co2_reduction_kg": sum_carbon_saved(),
        "recommendation_adoption_rate": acted_recommendations() / total_recommendations() * 100
    }
```

---

## Module 6: Appliance Analytics

**Purpose:** Understand appliance distribution, usage patterns, and scheduling behavior across the user base.

### Metrics & Sources

| Metric | Source | Logic |
|--------|--------|-------|
| Total appliances linked | `appliances` | `COUNT(*) WHERE is_active = TRUE` |
| Avg appliances per user | `appliances` join `homes` | `COUNT(*) / COUNT(DISTINCT home_id)` |
| Most used appliance type | `appliances` | `GROUP BY name/icon ORDER BY COUNT(*) DESC` |
| Appliance runtime distribution | `appliances.runtime_today` or `daily_aggregates` | `AVG(on_hours) GROUP BY appliance name` |
| Peak-hour appliance usage | `plug_readings` + `tariff_slots` | kWh consumed by appliance type during peak hours |
| Scheduling adoption rate | `schedules` | `COUNT(DISTINCT appliance_id WITH active schedule) / COUNT(DISTINCT appliance_id) * 100` |

### Backend

- **Endpoint:** `GET /api/admin/reports/appliances`
- **Aggregation:** FastAPI queries `appliances`, `plug_readings`, `daily_aggregates`, `schedules`
- **For PoC:** Can use mock aggregates seeded from `MOCK_APPLIANCES` constants

---

## Module 7: Meter Health & Infrastructure Monitoring

**Purpose:** Utility-grade operational monitoring. Essential for field operations.

> [!NOTE]
> **PoC: 50 seeded meters with varied `last_reading_at` timestamps.** ~40 online (reading within 1 hour), ~7 stale (6-24 hours ago), ~3 offline (>24 hours ago). This gives the dashboard realistic health distributions to display.

### Health Metrics & Sources

| Metric | Source | Logic |
|--------|--------|-------|
| Offline meters | `meters` + `meter_readings` | Meters with no reading in last 24 hours |
| Meters not reporting (24h) | `meters` | `WHERE last_reading_at < now() - interval '24 hours'` |
| Communication failure rate | `meter_readings` | `(expected_readings - actual_readings) / expected_readings * 100` per meter |
| Smart plug status | `smart_plugs` | `GROUP BY plug_status` → online/offline/pairing counts |
| Firmware version distribution | `smart_plugs` | `GROUP BY firmware_version` |
| Installation progress | `meters` | `COUNT(*) GROUP BY installation_date::month` for rollout tracking |

### Backend

- **Endpoint:** `GET /api/admin/reports/meter-health`
- **Alerting logic (FastAPI scheduler):**
  ```python
  # Runs every 15 minutes via cron
  def check_meter_health():
      offline_meters = query("SELECT * FROM meters WHERE last_reading_at < now() - interval '2 hours'")
      for meter in offline_meters:
          # Create admin notification
          insert_notification(type='system', title='Meter Offline', 
                            message=f'Meter {meter.meter_number} in {meter.home.area} not reporting')
  ```

---

## Module 8: Complaint & SLA Management

**Purpose:** Not just a list — full analytics, assignment workflow, and SLA tracking.

### Analytics

**Endpoint:** `GET /api/admin/reports/complaints?period=month`

| Metric | Source | Logic |
|--------|--------|-------|
| Complaint type distribution | `complaints` | `COUNT(*) GROUP BY type` |
| Avg resolution time | `complaints` | `AVG(resolved_at - created_at) WHERE resolved_at IS NOT NULL` in hours |
| SLA breach % | `complaints` | `COUNT(WHERE resolved_at - created_at > sla_threshold) / total * 100` |
| Region-wise density | `complaints` join `homes` | `COUNT(*) GROUP BY homes.area` |
| Engineer performance | `complaints` | `AVG(resolution_time) GROUP BY assigned_to` |

### Workflow Actions (Supabase REST)

| Action | Implementation |
|--------|---------------|
| Assign complaint | `supabase.from('complaints').update({ assigned_to, status: 'assigned' }).eq('id', id)` |
| Update status | `supabase.from('complaints').update({ status }).eq('id', id)` + insert `complaint_updates` |
| Close complaint | `update({ status: 'closed', resolved_at: now(), resolution_note })` |
| View history | `supabase.from('complaint_updates').select('*').eq('complaint_id', id).order('created_at')` |

### SLA Configuration

```python
# SLA thresholds by complaint type (in hours)
SLA_CONFIG = {
    "outage": 4,        # Must resolve within 4 hours
    "meter_error": 24,  # 24 hours
    "billing": 48,      # 2 business days
    "payment": 24,      # 24 hours
    "service": 72,      # 3 business days
    "other": 72         
}
```

---

## Module 9: App Adoption & User Metrics

**Purpose:** Track pilot success metrics. Critical for evaluation and scaling decisions.

> [!NOTE]
> **PoC: Derived from seeded `profiles`, `homes`, `meters`, `appliances` tables.** No external analytics SDK needed. All metrics come from simple `COUNT(*)` and `AVG()` queries against existing tables. For production: integrate PostHog or Mixpanel for screen-level usage tracking.

### Metrics & Sources

| Metric | Source | Logic |
|--------|--------|-------|
| Total app signups | `profiles` | `COUNT(*)` |
| Active monthly users | `profiles` + activity tracking | Users with any API call in last 30 days (via `updated_at` or separate analytics) |
| Onboarding completion rate | `profiles` | `COUNT(onboarding_done = TRUE) / COUNT(*) * 100` |
| Avg time to complete onboarding | `profiles` | `AVG(onboarding_completed_at - created_at)` (needs column addition) |
| Appliance onboarding rate | `appliances` | `COUNT(DISTINCT home_id with appliances) / COUNT(DISTINCT homes) * 100` |
| Avg time to link meter | `meters` | `AVG(meters.created_at - profiles.created_at)` |
| Smart plug adoption | `smart_plugs` | `COUNT(DISTINCT home_id with plugs) / COUNT(DISTINCT homes) * 100` |
| Feature usage breakdown | Analytics/logs | Track which screens are visited most (future: PostHog/Mixpanel) |

### Backend

- **Endpoint:** `GET /api/admin/reports/adoption`
- **For PoC:** Derive from existing table timestamps. For production, integrate analytics SDK (PostHog/Mixpanel).

---

## Module 10: Audit Logs & Role-Based Access Control

**Purpose:** Every admin action is logged. Non-negotiable for enterprise/utility compliance.

### Audit Log Schema

> `admin_audit_logs` table already exists in `02_setup.sql` (Table 30).

```sql
-- Already created in 02_setup.sql
CREATE TABLE admin_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    admin_id        UUID NOT NULL REFERENCES profiles(id),
    action_type     TEXT NOT NULL,
    target_table    TEXT,
    target_id       UUID,
    previous_value  JSONB,
    new_value       JSONB,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Role-Based Access (PoC)

> [!IMPORTANT]
> **PoC uses only 2 roles: `admin` and `super_admin`** (already in `user_role` enum).
> The 5-role matrix (billing_officer, support_staff, field_engineer) is v2 — requires new enum values and per-module permission logic.

| Module | Super Admin | Admin |
|--------|:-----------:|:-----:|
| Executive Dashboard | ✅ Full | ✅ Full |
| Consumer Management | ✅ Full | ✅ Full |
| Revenue & Finance | ✅ Full | ✅ Full |
| Load & Consumption | ✅ Full | ✅ Full |
| Optimization Impact | ✅ Full | ✅ Read-only |
| Appliance Analytics | ✅ Full | ✅ Read-only |
| Meter Health | ✅ Full | ✅ Full |
| Complaint & SLA | ✅ Full | ✅ Full |
| App Adoption | ✅ Full | ✅ Read-only |
| Tariff/DISCOM Mgmt | ✅ Full | ✅ Read-only |
| Outage Management | ✅ Full | ✅ Full |
| Audit Logs | ✅ Full | ❌ |

### PoC Implementation

```python
# FastAPI middleware — PoC role check (2 roles only)
ROLE_PERMISSIONS = {
    "super_admin": ["*"],
    "admin": ["dashboard", "consumers", "revenue", "load", "optimization:read",
              "appliances:read", "meter_health", "complaints", "adoption:read",
              "tariffs:read", "outages"]
}

# v2: Add billing_officer, support_staff, field_engineer with granular per-module permissions
```

### First Admin Setup

> [!WARNING]
> **There is no admin signup flow.** The first super_admin must be created manually:

```sql
-- After a user signs up normally via the consumer onboarding:
-- 1. Find their UUID in Supabase Auth → Users tab
-- 2. Run this in SQL Editor:
UPDATE profiles SET role = 'super_admin' WHERE id = 'paste-user-uuid-here';
```

For subsequent admins, the super_admin can promote users from the admin panel:
```typescript
await supabase.from('profiles').update({ role: 'admin' }).eq('id', targetUserId)
```

---

## Security Layer

| Requirement | Implementation |
|-------------|---------------|
| JWT Authentication | Supabase Auth — JWT with `role` in app_metadata |
| Role-based Authorization | FastAPI middleware + frontend route guards |
| Activity Logging | `admin_audit_logs` table — every write action logged |
| Rate Limiting | FastAPI `slowapi` — 100 req/min for reports, 30 req/min for exports |
| Encrypted APIs | HTTPS everywhere. Supabase enforces TLS. FastAPI behind Nginx with TLS |
| Session Management | Supabase handles JWT expiry (1h) + refresh tokens |

---

## Data Export & Reporting

| Feature | Endpoint | Format | Backend |
|---------|----------|--------|---------|
| Revenue / Recharge CSV | `GET /api/admin/export?type=revenue&format=csv` | CSV | `pandas.DataFrame.to_csv()` |
| Consumption CSV | `GET /api/admin/export?type=consumption&format=csv` | CSV | Same |
| Low Balance / Non-Recharging CSV | `GET /api/admin/export?type=balance-health&format=csv` | CSV | Same |
| Complaint CSV | `GET /api/admin/export?type=complaints&format=csv` | CSV | Same |
| User list CSV | `GET /api/admin/export?type=users&format=csv` | CSV | Same |
| Consumer Profile PDF | `GET /api/admin/consumers/{id}/export?format=pdf` | PDF | `reportlab` — full profile summary |
| Monthly summary PDF | `GET /api/admin/export?type=monthly_summary&format=pdf` | PDF | `reportlab` + `matplotlib` charts |

---

## Module 11: Tariff & DISCOM Management

**Purpose:** Admin CRUD for DISCOMs, tariff plans, slabs, and ToD slots. This is how VoltWise becomes multi-state without code changes.

### DISCOM Management

| Action | Implementation | Notes |
|--------|---------------|-------|
| List DISCOMs | `supabase.from('discoms').select('*').order('state')` | Show state, code, consumer # length |
| Add DISCOM | `supabase.from('discoms').insert({ code, name, state, state_code, consumer_number_length })` | Super admin only |
| Edit DISCOM | `supabase.from('discoms').update({ ... }).eq('id', id)` | Changing `consumer_number_length` doesn't affect existing users |
| Deactivate | `supabase.from('discoms').update({ is_active: false }).eq('id', id)` | Soft delete — existing consumers keep their plan |

### Tariff Plan Management

| Action | Implementation |
|--------|---------------|
| List plans | `supabase.from('tariff_plans').select('*, discom:discoms(name, code), slabs:tariff_slabs(*), slots:tariff_slots(*)').order('effective_from', { ascending: false })` |
| Create plan | Insert `tariff_plans` → then insert `tariff_slabs` + `tariff_slots` for the new plan |
| Edit slabs | `supabase.from('tariff_slabs').update({ rate_per_kwh }).eq('id', slabId)` |
| New version | Create new plan with `effective_from = future_date`, deactivate old plan on that date |
| Preview impact | Show: "This change affects X consumers. Avg bill impact: +₹Y/month" |

### Important Design Rule

> [!CAUTION]
> **Never edit an active tariff plan in-place.** Always create a new version with a future `effective_from` date. This preserves billing history integrity.

---

## Module 12: Outage Management

**Purpose:** Create, broadcast, and resolve planned/unplanned outage notices. Consumers in affected areas get real-time notifications.

### CRUD Operations

| Action | Implementation |
|--------|---------------|
| Create outage | `supabase.from('outage_notices').insert({ area, feeder_id, reason, start_time, estimated_end, created_by: adminId })` |
| List active | `supabase.from('outage_notices').select('*').eq('is_resolved', false).order('start_time', { ascending: false })` |
| Resolve outage | `supabase.from('outage_notices').update({ is_resolved: true, actual_end: now() }).eq('id', id)` |
| Edit ETA | `supabase.from('outage_notices').update({ estimated_end: newTime }).eq('id', id)` |

### Auto-Notification on Outage Creation

```python
# FastAPI — triggered after admin creates outage notice
def notify_affected_consumers(outage):
    # Find all consumers in the affected area/feeder
    affected_homes = query("""
        SELECT h.user_id FROM homes h
        WHERE h.area = :area OR h.feeder_id = :feeder_id
    """, area=outage.area, feeder_id=outage.feeder_id)
    
    for home in affected_homes:
        insert_notification(
            user_id=home.user_id, type='outage',
            title='Power Outage in Your Area',
            message=f'{outage.reason}. Estimated restoration: {outage.estimated_end}',
            icon='alert-triangle', color='text-red-500', bg_color='bg-red-50'
        )
```

### Consumer View (Cross-reference with `userside.md`)

Consumers see active outages for their area:
```typescript
const { data } = await supabase.from('outage_notices')
  .select('*')
  .or(`area.eq.${home.area},feeder_id.eq.${home.feeder_id}`)
  .eq('is_resolved', false)
  .order('start_time', { ascending: false })
```

---

## DB Tables Required (Admin-Specific)

| Table | Status | Purpose |
|-------|--------|---------|
| `profiles` (with role, email) | ✅ Exists | User/admin identity — email added in `10_admin_enhancements.sql` |
| `homes` (with autopilot columns) | ✅ Exists | Home config — autopilot columns added in migrations 12 & 13 |
| `meters` (balance, last_recharge_date) | ✅ Exists | Prepaid balance + recharge tracking |
| `recharges` | ✅ Exists | Primary revenue source |
| `daily_aggregates` | ✅ Exists | Consumption history for profile charts |
| `appliances` (with optimization_tier) | ✅ Exists | Appliance list on consumer profile |
| `complaints` + `complaint_updates` | ✅ Exists | Complaint workflow |
| `discoms` | ✅ Exists | DISCOM registry |
| `tariff_plans` + `tariff_slots` + `tariff_slabs` | ✅ Exists | Tariff management |
| `outage_notices` | ✅ Exists | Outage CRUD |
| `admin_audit_logs` | ✅ Exists | Audit trail |

---

## Performance Indexes

> [!IMPORTANT]
> The indexes below are **required before running any admin analytics queries**. Most already exist from `02_setup.sql`. Only `idx_recharges_user_paid_at` is new — add it via a migration.

| Index | Table | Columns | Status | Purpose |
|-------|-------|---------|--------|---------|
| `idx_meter_readings_meter_ts` | `meter_readings` | `(meter_id, timestamp DESC)` | ✅ Exists (`02_setup.sql`) | Per-meter time-range reads — used by load curve, offline detection, profile tabs |
| `idx_daily_agg_home_date` | `daily_aggregates` | `(home_id, date DESC)` | ✅ Exists (`02_setup.sql`) | Consumer profile 30-day + 6-month usage queries |
| `idx_complaints_status` | `complaints` | `(status, created_at DESC)` | ✅ Exists (`02_setup.sql`) | Pending complaints count, SLA queries |
| `idx_profiles_role` | `profiles` | `(role)` | ✅ Exists (`02_setup.sql`) | Consumer list filter |
| `idx_homes_area` | `homes` | `(area)` | ✅ Exists (`02_setup.sql`) | Area-wise load grouping |
| `idx_recharges_user_paid_at` | `recharges` | `(user_id, paid_at DESC)` | ⚠️ **Add via migration** | Per-user recharge history, revenue by user, active recharger KPI |

```sql
-- 16_add_recharge_index.sql  (new migration — run in Supabase SQL Editor)
CREATE INDEX IF NOT EXISTS idx_recharges_user_paid_at
    ON recharges(user_id, paid_at DESC);

-- Also useful for revenue reports grouped by time
CREATE INDEX IF NOT EXISTS idx_recharges_paid_at_status
    ON recharges(paid_at DESC, status);
```

> [!NOTE]
> The LEFT JOIN offline detection (Module 4) relies on `idx_meter_readings_meter_ts` being present — without it the join degrades to a full table scan. Confirm the index exists before running the meter health report.

---

## PoC Implementation Notes

> [!IMPORTANT]
> For the PoC/demo, every module must be **functional with realistic data**, even if the dataset is small.

| Aspect | Approach |
|--------|----------|
| Data volume | Seed 50 consumers, 6 months of daily aggregates, 200+ complaints |
| Real logic | All calculations use actual SQL queries, not hardcoded values |
| Seeded modules | Modules 4, 5, 7, 9 use seeded data (clearly marked in UI and SQL) |
| Realistic metrics | Use Indian DISCOM benchmarks (avg 300 kWh/month residential, ₹6–9/kWh tariff, prepaid recharge avg ₹500–₹800/month) |
| Charting | Use Recharts (already in project) for all admin visualizations |
| RBAC scope | 2 roles only (`admin`, `super_admin`) — 5-role matrix is v2 |
| DISCOMs | 2 seeded: SBPDCL (Bihar) + MGVCL (Gujarat) with real published rates |

---

## Seeded Data & Interference

> [!IMPORTANT]
> **Will seeded data interfere with real operations?** No — by design:

| Concern | Why It's Safe |
|---------|---------------|
| Real user signs up | Gets their own `profile`, `home`, `meter` — completely isolated by RLS |
| Seeded consumers show in admin lists | Yes, intentionally — admin should see all consumers. Seeded profiles tagged with `location = 'SEED_DATA'` **and** `source = 'seed'` (on meters, recharges, daily_aggregates, meter_readings) for easy filtering |
| Dashboard stats include seeded data | Yes — this is the point. The admin dashboard should show realistic numbers |
| A real user recharges | Only their `meter.balance_amount` changes — seeded meters are unaffected |
| Tariff engine | Reads from `tariff_plans` + `tariff_slabs` dynamically — seeded tariff data IS the real config (actual SBPDCL/MGVCL rates) |
| Notifications | Each notification has a `user_id` — seeded notifications only go to seeded users |
| Cleanup | Run `DELETE FROM profiles WHERE location = 'SEED_DATA'` to remove all seeded data (cascades to homes, meters, etc. via FK). Cross-table seed rows also identifiable via `source = 'seed'` on `recharges`, `daily_aggregates`, `meter_readings` |

**The only risk:** If someone runs the seed script twice, you get duplicate consumers. Solution: seed script uses `ON CONFLICT DO NOTHING` on unique fields like `consumer_number`.
