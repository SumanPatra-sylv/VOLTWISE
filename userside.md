# VoltWise — Consumer (User Side) Modules

> **⚠️ TEAM REFERENCE — DO NOT EDIT CASUALLY**
> Single source of truth for all consumer-facing functionality.
> Maps to `database_schema.md` tables and `api_endpoints.md` endpoints.
> Last updated: 2026-02-21 v2

---

## Architecture Overview

```
Consumer Frontend (React + Vite PWA)
  │
  ├── Supabase JS SDK ──→ Auth, CRUD (appliances, bills, notifications, profile)
  ├── Supabase RPC     ──→ Dashboard stats, consumption breakdown, daily trends
  ├── Supabase Realtime ──→ Live meter readings, appliance status, notifications
  └── Axios            ──→ FastAPI (Tuya toggle, scheduling, recharge, billing sim)

Auth: Supabase Auth (OTP / password) → JWT with role='consumer'
RLS:  All queries auto-filtered to logged-in user's data via auth.uid()
```

---

## Module 1: Account & Authentication

**Purpose:** Secure onboarding, multi-meter support, household management.

### Features & Backend

| Feature | Implementation | DB Table |
|---------|---------------|----------|
| Register / Login via OTP | `supabase.auth.signInWithOtp({ phone })` | `auth.users` → triggers `profiles` insert |
| Register via email + password | `supabase.auth.signUp({ email, password, options: { data: { name, phone, consumer_number } } })` | Same |
| Consumer number linking | Stored in `profiles.consumer_number`, linked to `homes` on first login | `profiles`, `homes` |
| Link multiple meters | Each meter belongs to a `home`, user can have multiple `homes` | `homes`, `meters` |
| Profile management | `supabase.from('profiles').update({ name, phone, location, household_members })` | `profiles` |
| Change mobile / email | `supabase.auth.updateUser({ email, phone })` | `auth.users` |
| Secure JWT session | Auto-handled by Supabase SDK — 1h expiry + refresh tokens | `auth.sessions` |

### Optional: Household Members

```typescript
// Future: Allow adding family members with limited access
// Requires new table: household_members (user_id, home_id, role: 'owner'|'member', permissions JSONB)
// Members get read-only dashboard, owners get full control
```

### Onboarding Flow

```
Signup → Enter name, phone, password
  → OTP verification (Supabase Auth)
  → Auto-create profile (DB trigger: handle_new_user)
  → Select State (dropdown) → Select DISCOM (filtered from `discoms` table)
  → Enter consumer number (length-validated per DISCOM's `consumer_number_length`)
  → Backend finds active tariff_plan for that discom_id + residential
  → Creates home with tariff_plan_id → Creates meter → Done
  → profiles.onboarding_done = TRUE
```

> [!IMPORTANT]
> Onboarding MUST use the `discoms` table for state/DISCOM selection.
> Consumer number validation uses `discoms.consumer_number_length` — no regex.

---

## Module 2: Unified Dashboard (Main Screen)

**Purpose:** Single-glance view of everything that matters. This is the **Super App identity** — no existing DISCOM app has this.

### Dashboard Elements & Sources

| Element | Source | DB Query |
|---------|--------|----------|
| Current total load (kW) | `meter_readings` | Latest `power_kw` from `ORDER BY timestamp DESC LIMIT 1` |
| Today's consumption (kWh) | `daily_aggregates` / `meter_readings` | `SUM(kwh_delta) WHERE timestamp >= CURRENT_DATE` |
| Today's cost (₹) | `daily_aggregates` / `meter_readings` | `SUM(cost_delta) WHERE timestamp >= CURRENT_DATE` |
| Current tariff band | `tariff_slots` | Match current hour to `start_hour`/`end_hour` → `slot_type` |
| Monthly projected bill | `daily_aggregates` | `(month_to_date_cost / days_elapsed) × days_in_month` |
| Prepaid balance | `meters` | `balance_amount` from active meter |
| Balance % | Computed | `(balance_amount / last_recharge_amount) × 100` |
| Active devices count | `appliances` | `COUNT(*) WHERE status = 'ON'` |
| Optimization suggestion | `recommendations` | Latest non-dismissed recommendation |
| Quick control toggles | `appliances` | Top 3 by `sort_order` with smart plug connected |

### Backend: Single RPC Call

All dashboard data fetched via **one** Supabase RPC call to avoid N+1 queries:
```typescript
const { data } = await supabase.rpc('get_dashboard_stats', { p_home_id: homeId })
```
See `database_schema.md` §RPC Functions for full implementation.

### Realtime Updates

```typescript
// Live meter readings → updates load, cost, kWh in real-time
supabase.channel('meter-live')
  .on('postgres_changes', { event: 'INSERT', table: 'meter_readings', 
    filter: `meter_id=eq.${meterId}` }, handleNewReading)
  .subscribe()
```

---

## Module 3: Consumption & Meter Data

**Purpose:** Detailed usage analytics with intelligent alerting. Goes beyond basic meter reading display.

### Features & Sources

| Feature | Source | Logic |
|---------|--------|-------|
| Daily consumption | `daily_aggregates` | `total_kwh WHERE date = target_date` |
| Weekly / Monthly usage | `daily_aggregates` | `SUM(total_kwh) GROUP BY week/month` |
| Graphical trends | `daily_aggregates` | Bar/line chart from RPC `get_daily_trend(home_id, days)` |
| Month-to-month comparison | `daily_aggregates` | Current month vs previous month totals |
| Real-time updates | `meter_readings` Realtime | Subscribe to INSERT events |
| Time-of-Day breakdown | `meter_readings` | `SUM(kwh_delta) GROUP BY EXTRACT(HOUR FROM timestamp)` |
| Peak usage hours | Same | Hour with `MAX(SUM(kwh_delta))` |
| NILM breakdown (by appliance) | `nilm_results` | RPC `get_consumption_breakdown(home_id, days)` |

### Intelligent Alerts

| Alert | Detection Logic | Notification Type |
|-------|-----------------|-------------------|
| Abnormal spike | `today_kwh > 2 × avg_daily_kwh(last_30_days)` | `notif_type = 'budget'` |
| Zero consumption | No `meter_readings` for 6+ hours during day | `notif_type = 'system'` |
| Peak hour entering | Current time approaching `tariff_slots.start_hour` where `slot_type = 'peak'` | `notif_type = 'peak'` |
| Budget threshold | `month_to_date_cost > 80% of last_month_total` | `notif_type = 'budget'` |

**Backend:** FastAPI scheduler checks these conditions every 15 minutes and inserts into `notifications`.

---

## Module 4: Billing & Payments

**Purpose:** Complete billing transparency with detailed breakdowns.

### Features & Sources

| Feature | Source | Implementation |
|---------|--------|---------------|
| View current bill | `bills` | `supabase.from('bills').select('*').eq('home_id', X).order('bill_month', { ascending: false }).limit(1)` |
| View previous bills | `bills` | Full history with pagination |
| Download PDF | Supabase Storage | `supabase.storage.from('bills').download(pdf_url)` |
| Detailed breakdown | `bills` | `base_amount` (energy from slabs) + `tax_amount` + `surcharge_amount` = `total_amount` |
| Bill due date reminder | `bills.due_date` | Notification 3 days before due |
| Payment history | `payments` | `WHERE user_id = X ORDER BY created_at DESC` |

### PDF Bill Generation

> [!NOTE]
> Bills are *generated* by FastAPI (not just stored). The flow:

```
1. FastAPI generates bill → renders HTML template with slab breakdown
2. Converts to PDF (using weasyprint or reportlab)
3. Uploads to Supabase Storage: `bills/{user_id}/{bill_month}.pdf`
4. Stores URL in `bills.pdf_url`
5. Consumer downloads via: supabase.storage.from('bills').download(pdf_url)
```

**Endpoint:** `GET /api/bills/{id}/pdf` — returns presigned download URL.

### Prepaid-Specific

| Feature | Source |
|---------|--------|
| Balance remaining | `meters.balance_amount` |
| Recharge history | `recharges WHERE user_id = X` |
| Low balance alert | Triggered when `balance_amount < 15% of last_recharge_amount` |

### Postpaid-Specific

| Feature | Source |
|---------|--------|
| Outstanding dues | `bills WHERE status IN ('generated', 'overdue')` |
| Partial payment | `payments.amount < bills.total_amount` → `bills.status = 'partial'` |

---

## Module 5: Recharge & Smart Payment

**Purpose:** Intelligent prepaid recharge with Razorpay integration.

### Payment Flow

```
User clicks "Recharge"
  → Frontend calls POST /api/recharge/create-order { meter_id, amount }
  → FastAPI creates Razorpay order, inserts recharges row (status=pending)
  → Returns razorpay_order_id to frontend
  → Frontend opens Razorpay checkout widget
  → User completes payment
  → Razorpay callback → Frontend calls POST /api/recharge/verify
  → FastAPI verifies signature, updates:
      - recharges.status = 'success'
      - meters.balance_amount += amount
      - meters.last_recharge_amount = amount
      - meters.last_recharge_date = now()
  → Creates notification: "Recharge of ₹{amount} successful"
```

### Smart Recharge Suggestion

```python
# Backend logic — GET /api/recharge/suggest?meter_id=X
def suggest_recharge(meter_id):
    avg_monthly = avg(daily_aggregates.total_cost, last_3_months)
    current_balance = meters.balance_amount
    daily_burn_rate = avg_monthly / 30
    days_remaining = current_balance / daily_burn_rate
    
    return {
        "avg_monthly_cost": avg_monthly,       # ₹2400
        "suggested_amount": round_up(avg_monthly, 100),  # ₹2500
        "days_remaining": days_remaining,       # 7 days
        "message": f"You usually consume ₹{avg_monthly}/month. Recommended recharge: ₹{suggested}."
    }
```

### Auto-Recharge (Future)

```python
# Scheduler checks balance daily
# If balance < threshold AND auto_recharge enabled:
#   Create Razorpay recurring payment via saved card/UPI mandate
```

---

## Module 6: Appliance Management

**Purpose:** What differentiates VoltWise from every other DISCOM app. Per-appliance visibility and control.

### Features & Sources

| Feature | Implementation | DB |
|---------|---------------|-----|
| Add appliance | `supabase.from('appliances').insert({ home_id, name, icon, rated_power_w, source: 'manual' })` | `appliances` |
| Appliance type selection | Frontend dropdown with Lucide icons (wind→AC, thermometer→Geyser, etc.) | `appliances.icon` |
| Rated power entry | User inputs wattage on manual add | `appliances.rated_power_w` |
| ON/OFF control | `POST /api/appliances/{id}/toggle` → calls Tuya API if smart plug connected | `appliances`, `smart_plugs`, `control_logs` |
| Scheduling | `POST /api/appliances/{id}/schedule` → creates schedule + cron job | `schedules` |
| Automation rules | `supabase.from('automation_rules').insert(...)` | `automation_rules` |
| Runtime tracking | Computed from `plug_readings` or estimated from status changes | `appliances.runtime_today` |
| Estimated consumption | `current_power_w × runtime_hours` | Computed |
| Cost impact | `estimated_kwh × current_tariff_rate` | Computed |

### Appliance Data Source Distinction

> [!IMPORTANT]
> The app must clearly distinguish between data sources:
>
> | Source | Accuracy | How |
> |--------|----------|-----|
> | **Smart Plug** (`source = 'smart_plug'`) | Real measured watts | Live `plug_readings.power_w` |
> | **NILM** (`source = 'nilm'`) | ML-estimated | `nilm_results.estimated_power_w` + confidence score |
> | **Manual** (`source = 'manual'`) | User-entered rated power | `appliances.rated_power_w` (static estimate) |
>
> Show confidence badges: "Measured" (plug), "Estimated" (NILM), "Rated" (manual).

### "Run at Cheapest Time" (Advanced)

```python
# Backend — POST /api/appliances/{id}/optimize
def find_cheapest_slot(appliance_id):
    # Get appliance's estimated runtime
    runtime_hours = estimated_runtime(appliance_id)  # e.g., washing machine = 1.5h
    
    # Get today's remaining tariff slots
    slots = get_remaining_tariff_slots(home.tariff_plan_id)
    
    # Find cheapest contiguous block that fits runtime
    cheapest = min(slots, key=lambda s: s.rate)
    
    # Create schedule at that time
    create_schedule(appliance_id, start_time=cheapest.start_hour)
    
    return {
        "scheduled_at": cheapest.start_hour,
        "rate": cheapest.rate,
        "savings_vs_now": (current_rate - cheapest.rate) * runtime_hours * rated_power_kw
    }
```

---

## Module 7: Tariff Optimization & Savings

**Purpose:** Core innovation layer. Converts raw tariff data into actionable savings.

### Features & Sources

| Feature | Source | Logic |
|---------|--------|-------|
| Current tariff band display | `tariff_slots` | Match current IST hour → `slot_type` + `rate` |
| Cost comparison (Now vs Later) | `tariff_slots` | `current_rate vs min(upcoming_slots.rate)` |
| Smart scheduling suggestions | `recommendations` | Persisted by optimizer → `WHERE is_dismissed = FALSE ORDER BY savings_per_month DESC` |
| Monthly savings summary | `bills.savings_amount` | Current month's savings vs average |
| % load shifted to off-peak | `meter_readings` + `tariff_slots` | `off_peak_kwh / total_kwh × 100` |
| CO₂ footprint reduction | `carbon_stats` | `co2_saved_kg` for current month |

### Recommendation Engine (FastAPI)

```python
# Runs nightly via POST /api/scheduler/refresh-recommendations
def generate_recommendations(home_id):
    appliances = get_active_appliances(home_id)
    tariff_slots = get_tariff_slots(home.tariff_plan_id)
    usage_patterns = get_hourly_usage_patterns(home_id, last_30_days)
    
    for appliance in appliances:
        current_avg_rate = weighted_avg_rate(appliance, usage_patterns, tariff_slots)
        cheapest_rate = min(tariff_slots, key=lambda s: s.rate).rate
        
        if current_avg_rate > cheapest_rate * 1.3:  # 30%+ savings possible
            savings_per_use = (current_avg_rate - cheapest_rate) * appliance.avg_kwh_per_use
            upsert_recommendation(
                home_id=home_id,
                appliance_id=appliance.id,
                type='schedule_shift',
                title=appliance.name,
                description=f"Run {appliance.name} after {cheapest_slot.start_hour}:00 to save ₹{savings_per_use}",
                savings_per_use=savings_per_use,
                savings_per_month=savings_per_use * appliance.avg_uses_per_month,
                suggested_time=cheapest_slot.start_hour
            )
```

### User Interaction

```typescript
// User taps "Schedule Now" on a recommendation
await supabase.from('recommendations').update({ is_acted_on: true }).eq('id', recId)
// Then create the schedule via FastAPI
await axios.post(`/api/appliances/${applianceId}/schedule`, { 
  start_time: recommendation.suggested_time 
})
```

---

## Module 8: Complaints & Support

**Purpose:** Structured complaint system with SLA tracking and full audit trail.

### Complaint Categories (Maps to `complaint_type` enum)

| Category | DB Value | Example |
|----------|----------|---------|
| Billing | `billing` | Wrong amount, duplicate charge |
| Meter fault | `meter_error` | Dead meter, wrong reading |
| Power outage | `outage` | Area blackout, scheduled maintenance |
| Payment issue | `payment` | Failed transaction, refund needed |
| Load issue | `service` | Voltage fluctuation, overload |
| Others | `other` | General inquiry |

### Status Flow (Maps to `complaint_status` enum)

```
Registered → Assigned → In Progress → Resolved → Closed
   │              │            │            │
   └── Consumer   └── Admin    └── Field    └── Consumer
       creates        assigns      team         can rate
                                   updates      (optional)
```

### Implementation

```typescript
// File complaint
await supabase.from('complaints').insert({
  user_id, home_id, meter_id,
  type: 'billing',
  subject: 'Incorrect bill amount',
  description: 'My February bill shows ₹5000 but my actual usage...',
  attachments: ['/storage/complaints/screenshot.jpg']
})

// Upload attachment first
await supabase.storage.from('complaints').upload(`${userId}/${filename}`, file)

// Track status (with updates timeline)
const { data } = await supabase.from('complaints')
  .select('*, updates:complaint_updates(*)')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
```

### SLA Tracking (Consumer View)

```typescript
// Show SLA status on complaint detail
const slaHours = SLA_CONFIG[complaint.type]  // e.g., billing = 48h
const elapsed = (now - complaint.created_at).hours
const slaStatus = elapsed > slaHours ? 'BREACHED' : 'WITHIN SLA'
const remainingHours = Math.max(0, slaHours - elapsed)
// Display: "Expected resolution within 24 hours" or "SLA exceeded by 6 hours"
```

---

## Module 9: Notifications System

**Purpose:** Proactive, intelligent alerts — not just passive notifications.

### Notification Types & Triggers

| Alert | Trigger Logic | `notif_type` | Priority |
|-------|---------------|-------------|----------|
| Consumption spike | `today_kwh > 2 × 30day_avg` | `budget` | High |
| Low balance | `balance < 15% of last_recharge` | `recharge` | High |
| Bill due reminder | `bills.due_date - 3 days` | `payment` | Medium |
| Outage update | Admin creates `outage_notices` for user's area | `outage` | High |
| Tariff change alert | `tariff_plans.effective_from = tomorrow` | `system` | Medium |
| Peak hour warning | 30 min before `tariff_slots` where `slot_type = 'peak'` | `peak` | Medium |
| Optimization reminder | New `recommendation` generated | `tip` | Low |
| Recharge success | After `recharges.status = 'success'` | `recharge` | Low |
| Payment success | After `payments.status = 'success'` | `payment` | Low |
| Schedule executed | After `schedule_logs` insert with `result = 'success'` | `schedule` | Low |
| Schedule failed | After `schedule_logs` insert with `result = 'failed'` | `schedule` | High |

### Realtime Delivery

```typescript
// Push notifications to consumer in real-time
supabase.channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'notifications',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    showToast(payload.new.title, payload.new.message)
    incrementBadgeCount()
  })
  .subscribe()
```

### Outage View (Consumer Side)

Consumers see active outages affecting their area:

```typescript
// Fetch outages for user's area/feeder
const { data: outages } = await supabase.from('outage_notices')
  .select('*')
  .or(`area.eq.${home.area},feeder_id.eq.${home.feeder_id}`)
  .eq('is_resolved', false)
  .order('start_time', { ascending: false })

// Subscribe to new outage notices in real-time
supabase.channel('outages')
  .on('postgres_changes', { event: 'INSERT', table: 'outage_notices' },
    (payload) => {
      if (payload.new.area === home.area || payload.new.feeder_id === home.feeder_id) {
        showToast('⚡ Power outage reported in your area')
      }
    })
  .subscribe()
```

### Backend Generation (FastAPI Scheduler)

```python
# Runs every 15 minutes
def check_and_notify():
    # Low balance check
    low_balance_meters = query("""
        SELECT m.*, h.user_id FROM meters m 
        JOIN homes h ON m.home_id = h.id
        WHERE m.balance_amount < m.last_recharge_amount * 0.15
        AND m.balance_amount > 0
    """)
    for meter in low_balance_meters:
        if not already_notified_today(meter.user_id, 'recharge'):
            insert_notification(
                user_id=meter.user_id, type='recharge',
                title='Low Balance Alert',
                message=f'Your balance is ₹{meter.balance_amount}. Recharge soon to avoid disconnection.',
                icon='alert-triangle', color='text-amber-500'
            )
    
    # Peak hour warning (30 min before)
    upcoming_peak = get_upcoming_peak_slot(minutes=30)
    if upcoming_peak:
        notify_all_users_in_plan(
            plan_id=upcoming_peak.plan_id, type='peak',
            title='Peak Tariff Starting Soon',
            message=f'Peak tariff (₹{upcoming_peak.rate}/kWh) starts in 30 minutes. Consider shifting heavy loads.'
        )
```

---

## Module 10: Carbon & Sustainability

**Purpose:** Gamified green metrics. Strong differentiator for utility reporting and user engagement.

### Features & Sources

| Feature | Source | Logic |
|---------|--------|-------|
| CO₂ footprint this month | `carbon_stats` | `user_kg_co2` for current month |
| CO₂ reduced via optimization | `carbon_stats` | `co2_saved_kg` — calculated from kWh shifted to off-peak |
| Trees planted equivalent | `carbon_stats` | `trees_equivalent` — `co2_saved_kg / 21` (1 tree ≈ 21 kg CO₂/year) |
| Green score | Computed | `100 - (user_kg_co2 / national_avg * 100)` — lower is greener |
| Neighbor comparison | `carbon_stats` | `neighbor_avg` from users in same area |
| National comparison | `carbon_stats` | `national_avg` from all users |

### Carbon Calculation (FastAPI)

```python
# Called during nightly aggregation
EMISSION_FACTOR = 0.82  # kg CO₂ per kWh (India grid average)

def calculate_carbon(home_id, month):
    total_kwh = sum_monthly_kwh(home_id, month)
    off_peak_kwh = sum_off_peak_kwh(home_id, month)
    
    user_co2 = total_kwh * EMISSION_FACTOR
    # Savings = kWh that was shifted to off-peak (cleaner grid at night)
    co2_saved = off_peak_kwh * EMISSION_FACTOR * 0.15  # 15% cleaner during off-peak
    
    upsert_carbon_stats(
        home_id=home_id, month=month,
        user_kg_co2=user_co2,
        co2_saved_kg=co2_saved,
        trees_equivalent=co2_saved / 21,
        neighbor_avg=avg_carbon_for_area(home.area, month),
        national_avg=avg_carbon_all(month)
    )
```

---

## Supabase Client Setup (Required)

> [!IMPORTANT]
> The current `services/api.ts` uses a generic `fetchApi()` helper pointing at `http://localhost:8000/api`.
> When we connect to Supabase, **~80% of calls** will go through the Supabase JS SDK directly — not through FastAPI.
> We need a Supabase client file that the entire app imports.

### What needs to happen:

**1. Install Supabase SDK:**
```bash
npm install @supabase/supabase-js
```

**2. Create `services/supabase.ts`:**
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**3. Update `.env.local`:**
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=http://localhost:8000/api   # Only for FastAPI calls
```

**4. Refactor `services/api.ts`:**
- Replace mock returns with `supabase.from('table').select(...)` calls
- Keep `fetchApi()` only for FastAPI-routed endpoints (Tuya, NILM, payments, scheduler)
- Add response transformers for snake_case → camelCase mapping

This is the **first step** of backend integration (Phase 1 in the roadmap).
