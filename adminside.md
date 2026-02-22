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
| Today's Revenue | `payments` + `recharges` | `SUM(amount) WHERE status = 'success' AND paid_at >= CURRENT_DATE` |
| Monthly Revenue | `payments` + `recharges` | `SUM(amount) WHERE status = 'success' AND paid_at >= date_trunc('month', now())` |
| Collection Efficiency % | `bills` | `COUNT(status='paid') / COUNT(*) * 100` for current month |
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

**Source:** Supabase REST with joins
```typescript
supabase.from('profiles')
  .select('*, homes(*, meters(*), tariff:tariff_plans(name))', { count: 'exact' })
  .eq('role', 'consumer')
  .range(offset, offset + limit)
  .order('created_at', { ascending: false })
```

**Filters:**
| Filter | Column | Notes |
|--------|--------|-------|
| Search | `name`, `consumer_number`, `phone` | `ILIKE '%query%'` |
| Area | `homes.area` | Dropdown from distinct areas |
| Tariff Category | `homes.tariff_category` | `residential`, `commercial`, `industrial`, `agricultural` |
| Meter Type | `meters.meter_type` | `prepaid` / `postpaid` |
| Status | `meters.is_active` | Active / Disconnected |
| Feeder | `homes.feeder_id` | DISCOM feeder reference |

### Consumer Detail View

**Source:** Supabase REST with deep join
```typescript
supabase.from('profiles')
  .select(`
    *,
    homes(*, 
      meters(*), 
      appliances(*), 
      tariff:tariff_plans(*),
      bills(*, order:bill_month.desc),
      daily_aggregates(total_kwh, total_cost, date)
    )
  `)
  .eq('id', userId)
  .single()
```

**Consumer Insights (per consumer):**

| Insight | Source | Logic |
|---------|--------|-------|
| Monthly consumption trend | `daily_aggregates` | `SUM(total_kwh) GROUP BY date_trunc('month', date)` for last 12 months |
| Avg monthly spending | `bills` | `AVG(total_amount)` over last 6 months |
| Recharge history | `recharges` | All records `WHERE user_id = X ORDER BY created_at DESC` |
| Complaint history | `complaints` + `complaint_updates` | Join with updates for full timeline |
| Appliance count | `appliances` | `COUNT(*) WHERE home_id = X` |
| Risk flags | Computed | See Risk Detection Logic below |

### Risk Detection Logic

```python
# FastAPI — /api/admin/consumer/{id}/risk-score
def calculate_risk(user_id):
    flags = []
    
    # Low balance frequency (prepaid)
    low_balance_days = count_days_where(balance < 100, last_90_days)
    if low_balance_days > 15:
        flags.append({"type": "low_balance", "severity": "high", "value": low_balance_days})
    
    # Abnormal spike detection
    recent_kwh = avg_daily_kwh(last_7_days)
    historical_kwh = avg_daily_kwh(last_90_days)
    if recent_kwh > historical_kwh * 2:
        flags.append({"type": "usage_spike", "severity": "high", "ratio": recent_kwh/historical_kwh})
    
    # Sudden drop (possible theft/meter fault)
    if recent_kwh < historical_kwh * 0.3:
        flags.append({"type": "usage_drop", "severity": "critical", "ratio": recent_kwh/historical_kwh})
    
    # Non-recharging (prepaid) — no recharge in 45+ days
    days_since_recharge = (now() - last_recharge_date).days
    if days_since_recharge > 45:
        flags.append({"type": "non_recharging", "severity": "medium", "days": days_since_recharge})
    
    return {"risk_score": len(flags) * 25, "flags": flags}  # 0-100 score
```

---

## Module 3: Revenue & Finance Analytics

**Purpose:** Revenue tracking, defaulter identification, financial reporting.

### Revenue Reports

**Endpoint:** `GET /api/admin/reports/revenue?period=month&date=2026-02&group_by=area`

| Report | Query Logic |
|--------|-------------|
| Daily revenue | `SUM(amount) FROM payments+recharges WHERE paid_at::date = target_date GROUP BY paid_at::date` |
| Monthly revenue | Same, grouped by `date_trunc('month', paid_at)` |
| Revenue by area | Join `payments → profiles → homes` and `GROUP BY homes.area` |
| Revenue by tariff | Join through `homes.tariff_category` and `GROUP BY` |
| Prepaid vs Postpaid | Join through `meters.meter_type` and `GROUP BY` |
| Top 10 consumers | `ORDER BY SUM(amount) DESC LIMIT 10` |

### Defaulter Reports

**Endpoint:** `GET /api/admin/reports/defaulters`

| Report | Logic |
|--------|-------|
| Outstanding dues | `bills WHERE status IN ('generated', 'overdue') → SUM(total_amount)` per consumer |
| Low-balance frequency | `COUNT(days WHERE meters.balance_amount < 100)` over last 90 days |
| Non-recharging users | `recharges WHERE created_at < now() - interval '45 days'` — last recharge > 45 days ago |
| Risk score ranking | Composite score from risk detection logic (Module 2) sorted DESC |

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
| Zero consumption | `meters WHERE id NOT IN (SELECT meter_id FROM meter_readings WHERE timestamp > now() - interval '24h')` |
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
| Revenue CSV | `GET /api/admin/export?type=revenue&format=csv` | CSV | `pandas.DataFrame.to_csv()` |
| Consumption CSV | `GET /api/admin/export?type=consumption&format=csv` | CSV | Same |
| Defaulter CSV | `GET /api/admin/export?type=defaulters&format=csv` | CSV | Same |
| Complaint CSV | `GET /api/admin/export?type=complaints&format=csv` | CSV | Same |
| User list CSV | `GET /api/admin/export?type=users&format=csv` | CSV | Same |
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
| `profiles` (with role) | ✅ Exists | User/admin identity |
| `complaints` + `complaint_updates` | ✅ Exists | Complaint workflow |
| `discoms` | ✅ Exists (02_setup.sql update pending) | DISCOM registry |
| `tariff_plans` + `tariff_slots` + `tariff_slabs` | ✅ Exists | Tariff management |
| `outage_notices` | ✅ Exists | Outage CRUD |
| `admin_audit_logs` | ✅ Exists | Audit trail |

---

## PoC Implementation Notes

> [!IMPORTANT]
> For the PoC/demo, every module must be **functional with realistic data**, even if the dataset is small.

| Aspect | Approach |
|--------|----------|
| Data volume | Seed 50 consumers, 6 months of daily aggregates, 200+ complaints |
| Real logic | All calculations use actual SQL queries, not hardcoded values |
| Seeded modules | Modules 4, 5, 7, 9 use seeded data (clearly marked in UI and SQL) |
| Realistic metrics | Use Indian DISCOM benchmarks (avg 300 kWh/month residential, ₹6-9/kWh tariff) |
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
| Seeded consumers show in admin lists | Yes, intentionally — admin should see all consumers. Seeded profiles can be tagged with `location = 'SEED_DATA'` for easy filtering |
| Dashboard stats include seeded data | Yes — this is the point. The admin dashboard should show realistic numbers |
| A real user recharges | Only their `meter.balance_amount` changes — seeded meters are unaffected |
| Tariff engine | Reads from `tariff_plans` + `tariff_slabs` dynamically — seeded tariff data IS the real config (actual SBPDCL/MGVCL rates) |
| Notifications | Each notification has a `user_id` — seeded notifications only go to seeded users |
| Cleanup | Run `DELETE FROM profiles WHERE location = 'SEED_DATA'` to remove all seeded data (cascades to homes, meters, etc.) |

**The only risk:** If someone runs the seed script twice, you get duplicate consumers. Solution: seed script uses `ON CONFLICT DO NOTHING` on unique fields like `consumer_number`.
