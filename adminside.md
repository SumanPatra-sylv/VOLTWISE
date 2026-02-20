# VoltWise — Admin Panel Modules

> **⚠️ TEAM REFERENCE — DO NOT EDIT CASUALLY**
> Single source of truth for all admin-side functionality.
> Maps to `database_schema.md` tables and `api_endpoints.md` endpoints.
> Last updated: 2026-02-20 v1

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

> This requires a **new table** `admin_audit_logs` (not yet in `database_schema.md`):

```sql
CREATE TABLE admin_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    admin_id        UUID NOT NULL REFERENCES profiles(id),
    action_type     TEXT NOT NULL,        -- 'update_complaint', 'change_tariff', 'export_data', etc.
    target_table    TEXT,                 -- 'complaints', 'tariff_plans', etc.
    target_id       UUID,                -- ID of the affected row
    previous_value  JSONB,               -- Snapshot before change
    new_value       JSONB,               -- Snapshot after change
    ip_address      TEXT,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_admin ON admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_audit_target ON admin_audit_logs(target_table, target_id);

-- RLS: Only super_admins can read audit logs
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_only" ON admin_audit_logs FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
```

### Role-Based Access Matrix

| Module | Super Admin | Regional Admin | Billing Officer | Support Staff | Field Engineer |
|--------|:-----------:|:--------------:|:---------------:|:-------------:|:--------------:|
| Executive Dashboard | ✅ Full | ✅ Own region | ✅ Revenue only | ❌ | ❌ |
| Consumer Management | ✅ Full | ✅ Own region | ✅ Read-only | ✅ Read-only | ❌ |
| Revenue & Finance | ✅ Full | ✅ Own region | ✅ Full | ❌ | ❌ |
| Load & Consumption | ✅ Full | ✅ Own region | ❌ | ❌ | ✅ Own area |
| Optimization Impact | ✅ Full | ✅ Read-only | ❌ | ❌ | ❌ |
| Appliance Analytics | ✅ Full | ✅ Read-only | ❌ | ❌ | ✅ Own area |
| Meter Health | ✅ Full | ✅ Own region | ❌ | ❌ | ✅ Full |
| Complaint & SLA | ✅ Full | ✅ Own region | ✅ Billing only | ✅ Full | ✅ Assigned |
| App Adoption | ✅ Full | ✅ Read-only | ❌ | ❌ | ❌ |
| Audit Logs | ✅ Full | ❌ | ❌ | ❌ | ❌ |

### Implementation

```python
# FastAPI middleware — role check
ROLE_PERMISSIONS = {
    "super_admin": ["*"],
    "admin": ["dashboard", "consumers", "revenue", "load", "optimization", 
              "appliances", "meter_health", "complaints", "adoption"],
    "billing_officer": ["dashboard:revenue", "consumers:read", "revenue", "complaints:billing"],
    "support_staff": ["consumers:read", "complaints"],
    "field_engineer": ["load:own_area", "appliances:own_area", "meter_health", "complaints:assigned"]
}

# Middleware checks JWT role claim against module being accessed
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

## DB Tables Required (Admin-Specific)

| Table | Status | Purpose |
|-------|--------|---------|
| `profiles` (with role) | ✅ Exists | User/admin identity |
| `complaints` + `complaint_updates` | ✅ Exists | Complaint workflow |
| `tariff_plans` + `tariff_slots` + `tariff_slabs` | ✅ Exists | Tariff management |
| `outage_notices` | ✅ Exists | Outage CRUD |
| `admin_audit_logs` | ⚠️ **NEW — needs creation** | Audit trail |

---

## PoC Implementation Notes

> [!IMPORTANT]
> For the PoC/demo, every module must be **functional with realistic data**, even if the dataset is small.

| Aspect | Approach |
|--------|----------|
| Data volume | Seed 50-100 consumers, 6 months of daily aggregates, 200+ complaints |
| Real logic | All calculations use actual SQL queries, not hardcoded values |
| Consistency | Mock data in `constants.tsx` must match what the admin panel shows |
| Realistic metrics | Use Indian DISCOM benchmarks (avg 300 kWh/month residential, ₹6-9/kWh tariff) |
| Charting | Use Recharts (already in project) for all admin visualizations |
