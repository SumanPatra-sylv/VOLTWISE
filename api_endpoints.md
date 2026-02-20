# VoltWise — API Endpoints Contract

> **⚠️ TEAM REFERENCE — DO NOT EDIT CASUALLY**
> This is the single source of truth for all API endpoints.
> Frontend calls these. Backend implements these. Any changes HERE must be synced.
> Last updated: 2026-02-20 v2

---

## Architecture Split

| Layer | Handles | Base URL |
|-------|---------|----------|
| **Supabase REST** | All CRUD, auth, realtime, file storage (~70%) | `https://<project>.supabase.co` |
| **Supabase RPC** | Dashboard stats, consumption breakdown, daily trends (~10%) | Same — via `supabase.rpc()` |
| **FastAPI** | Tuya control, NILM, tariff optimization, billing sim, carbon calc, scheduler, payments (~20%) | `http://localhost:8000/api` |

```
Frontend ──→ Supabase JS SDK (supabase.from('table')...) for CRUD + Auth + Realtime
Frontend ──→ Supabase RPC (supabase.rpc('fn_name', {})) for aggregated queries
Frontend ──→ Axios → FastAPI for smart plug control, NILM, optimization, payments
```

> [!IMPORTANT]
> The frontend `services/api.ts` currently points everything at `VITE_API_BASE_URL`.
> After migration, most calls will go through `@supabase/supabase-js` directly.
> Only Tuya/NILM/optimization/payment calls will hit FastAPI via Axios.

---

## Auth (Supabase Auth)

All auth is handled by Supabase Auth SDK — **no custom endpoints needed**.

| Action | Frontend Code | Notes |
|--------|---------------|-------|
| Signup | `supabase.auth.signUp({ email, password, options: { data: { name, phone, consumer_number } } })` | Triggers DB function to create `profiles` row with all metadata |
| Login (email) | `supabase.auth.signInWithPassword({ email, password })` | Returns JWT |
| Login (OTP) | `supabase.auth.signInWithOtp({ phone })` | SMS OTP via Supabase |
| Logout | `supabase.auth.signOut()` | Clears session |
| Get session | `supabase.auth.getSession()` | Returns current user + JWT |
| Listen auth changes | `supabase.auth.onAuthStateChange(callback)` | For Zustand sync |

> [!NOTE]
> On signup, a DB trigger creates the profile row with **all metadata fields**:
> ```sql
> -- See database_schema.md §1 for full trigger code
> -- Extracts: name, phone, consumer_number from raw_user_meta_data
> ```

---

## Consumer Endpoints

### Dashboard

#### `RPC` Dashboard Stats
**Source:** Supabase RPC (avoids slow multi-table joins on every load)
```typescript
const { data } = await supabase.rpc('get_dashboard_stats', { p_home_id: homeId })
```

**Response** — maps to `DASHBOARD_STATS` in frontend:
```json
{
  "balance": 550,
  "lastRechargeAmount": 2000,
  "lastRechargeDate": "03 March, 2026",
  "balancePercent": 75,
  "dailyAvgUsage": 61.63,
  "currentTariff": 6.50,
  "yearAverage": 22500,
  "currentLoad": 1.8,
  "todayCost": 78.50,
  "todayKwh": 12.5,
  "monthBill": 892,
  "monthSavings": 267,
  "activeDevices": 5,
  "currentSlotType": "peak",
  "currentSlotRate": 9.00,
  "nextSlotChange": "22:00",
  "nextSlotType": "off-peak",
  "nextSlotRate": 4.00
}
```

> [!IMPORTANT]
> The `currentSlotType`, `currentSlotRate`, `nextSlotChange`, `nextSlotType`, `nextSlotRate`
> fields are essential for showing "Peak Hour!" or "Off-Peak" badges on the dashboard.
> The RPC function looks up the current hour in `tariff_slots` for the home's plan.

**DB queries inside RPC:**
- `meters` → balance, lastRecharge*
- `meter_readings` (latest single row) → currentLoad, currentTariff
- `daily_aggregates` (today, fallback to meter_readings) → todayCost, todayKwh
- `daily_aggregates` (current month sum) → monthBill, dailyAvgUsage
- `appliances` (count where status='ON') → activeDevices
- `tariff_slots` (current hour match) → currentSlot*, nextSlot*

---

### Appliances

#### `GET` List Appliances
**Source:** Supabase REST
```typescript
supabase.from('appliances').select('*').eq('home_id', homeId).order('sort_order')
```

**Response** — maps to `Appliance[]` in frontend:
```json
[
  {
    "id": "uuid",
    "name": "AC - Living Room",
    "icon": "wind",
    "status": "ON",
    "current_power_w": 1200,
    "cost_per_hour": 10.80,
    "runtime_today": "2h 15m",
    "schedule_time": null,
    "message": "Peak Hour! +₹3.20/hr extra",
    "saving_potential": 32
  }
]
```

> [!IMPORTANT]
> **Frontend field mapping** (camelCase ↔ snake_case):
> | Frontend (`types.ts`) | DB Column |
> |---|---|
> | `power` | `current_power_w` |
> | `costPerHour` | `cost_per_hour` |
> | `runtime` | `runtime_today` |
> | `scheduleTime` | `schedule_time` |
> | `savingPotential` | `saving_potential` |
>
> Use a transformer/adapter in the frontend service layer.

#### `POST` Toggle Appliance
**Source:** FastAPI (calls Tuya API for plug-connected, updates DB for all)
```
POST /api/appliances/{appliance_id}/toggle
```
**Request:**
```json
{ "state": true }
```
**Response (success):**
```json
{
  "success": true,
  "appliance_id": "uuid",
  "new_status": "ON",
  "response_time_ms": 245
}
```
**Response (no plug — NOT_CONTROLLABLE):**
```json
{
  "error": {
    "code": "NOT_CONTROLLABLE",
    "message": "This appliance has no smart plug connected. Only NILM-detected or manually-added appliances cannot be toggled remotely."
  }
}
```

> [!WARNING]
> The toggle endpoint MUST check `appliances.smart_plug_id IS NOT NULL` before calling Tuya.
> If `smart_plug_id` is NULL (NILM-only or manual appliance), return the NOT_CONTROLLABLE error.
> Every toggle attempt (success or failure) is logged in `control_logs`.

#### `POST` Schedule Appliance
**Source:** FastAPI (creates schedule + sets up job)
```
POST /api/appliances/{appliance_id}/schedule
```
**Request:**
```json
{
  "start_time": "23:00",
  "end_time": "06:00",
  "repeat": "daily"
}
```
**Response:**
```json
{ "success": true, "schedule_id": "uuid" }
```

#### `POST` Add Appliance (Manual)
**Source:** Supabase REST
```typescript
supabase.from('appliances').insert({ home_id, name, icon, rated_power_w, source: 'manual' })
```

#### `DELETE` Remove Appliance
**Source:** Supabase REST
```typescript
supabase.from('appliances').delete().eq('id', applianceId)
```

---

### Smart Plugs

#### `POST` Pair Smart Plug
**Source:** FastAPI (Tuya pairing flow)
```
POST /api/plugs/pair
```
**Request:**
```json
{
  "home_id": "uuid",
  "tuya_device_id": "eb1234...",
  "name": "Living Room Plug",
  "wifi_ssid": "MyWiFi"
}
```
**Response:**
```json
{ "success": true, "plug_id": "uuid", "status": "online" }
```

#### `GET` Plug Status
**Source:** FastAPI (queries Tuya Cloud)
```
GET /api/plugs/{plug_id}/status
```
**Response:**
```json
{
  "plug_id": "uuid",
  "is_on": true,
  "power_w": 1250,
  "voltage": 228.5,
  "current_ma": 5480,
  "signal_strength": -42,
  "last_seen": "2026-02-20T04:30:00Z"
}
```

#### `POST` Calibrate Plug
**Source:** FastAPI
```
POST /api/plugs/{plug_id}/calibrate
```

#### `POST` Sync All Plugs
**Source:** FastAPI (batch Tuya sync)
```
POST /api/tuya/sync
```
**Request:**
```json
{ "home_id": "uuid" }
```
**Logic:** For each `smart_plug` in home, call Tuya status API, update `plug_status`, `last_seen_at`, and linked `appliances.current_power_w` + `appliances.status`.
**Response:**
```json
{
  "synced": 3,
  "failed": 0,
  "timestamp": "2026-02-20T04:30:00Z",
  "details": [
    { "plug_id": "uuid", "name": "Living Room", "status": "online", "power_w": 1250 },
    { "plug_id": "uuid", "name": "Bedroom", "status": "online", "power_w": 0 }
  ]
}
```

---

### Insights

#### `RPC` Consumption Breakdown
**Source:** Supabase RPC (NILM + plug data aggregation)
```typescript
const { data } = await supabase.rpc('get_consumption_breakdown', { p_home_id: homeId, p_days: 30 })
```
**Response** — maps to `CHART_DATA_DONUT`:
```json
[
  { "name": "AC", "value": 45, "fill": "#0ea5e9" },
  { "name": "Geyser", "value": 22, "fill": "#f59e0b" },
  { "name": "Fridge", "value": 15, "fill": "#10b981" },
  { "name": "Washing", "value": 8, "fill": "#a855f7" },
  { "name": "Others", "value": 10, "fill": "#64748b" }
]
```
> Fill colors are added by the frontend based on appliance name/icon mapping.

#### `RPC` Daily Trends
**Source:** Supabase RPC (from `daily_aggregates`)
```typescript
const { data } = await supabase.rpc('get_daily_trend', { p_home_id: homeId, p_days: 30 })
```
**Response** — maps to `CHART_DATA_TRENDS`:
```json
[
  { "day": "1", "kwh": 12 },
  { "day": "5", "kwh": 15 },
  { "day": "10", "kwh": 8 }
]
```

#### `GET` Sparkline Data
**Source:** Supabase REST (last 7 daily aggregates)
```typescript
supabase.from('daily_aggregates')
  .select('total_kwh')
  .eq('home_id', homeId)
  .is('appliance_id', null)
  .order('date', { ascending: false })
  .limit(7)
```
**Response** — maps to `SPARKLINE_DATA`:
```json
[
  { "value": 10 }, { "value": 15 }, { "value": 12 },
  { "value": 20 }, { "value": 18 }, { "value": 25 }, { "value": 22 }
]
```

#### `GET` Active Devices Preview
**Source:** Supabase REST
```typescript
supabase.from('appliances').select('icon').eq('home_id', homeId).eq('status', 'ON')
```
**Response** — maps to `ACTIVE_DEVICES_PREVIEW`:
```json
[
  { "icon": "wind", "color": "text-cyan-500", "bg": "bg-cyan-50" },
  { "icon": "thermometer", "color": "text-rose-500", "bg": "bg-rose-50" }
]
```
> Color/bg mapping is done on frontend based on icon name.

---

### Tariff

#### `GET` Tariff Rates (ToD)
**Source:** Supabase REST
```typescript
supabase.from('tariff_slots').select('*').eq('plan_id', planId).order('start_hour')
```
**Response** — maps to `TARIFF_RATES`:
```json
[
  { "hour": "12AM", "rate": 4, "type": "off-peak" },
  { "hour": "2AM", "rate": 4, "type": "off-peak" },
  { "hour": "8AM", "rate": 9, "type": "peak" }
]
```

#### `GET` Tariff Slabs (Consumption)
**Source:** Supabase REST
```typescript
supabase.from('tariff_slabs').select('*').eq('plan_id', planId).order('display_order')
```
**Response:**
```json
[
  { "from_kwh": 0, "to_kwh": 100, "rate_per_kwh": 3.75, "fixed_charge_per_kw": 0 },
  { "from_kwh": 101, "to_kwh": 200, "rate_per_kwh": 5.20, "fixed_charge_per_kw": 0 },
  { "from_kwh": 201, "to_kwh": 500, "rate_per_kwh": 7.10, "fixed_charge_per_kw": 0 },
  { "from_kwh": 501, "to_kwh": null, "rate_per_kwh": 8.50, "fixed_charge_per_kw": 0 }
]
```

#### `GET` Tariff Recommendations
**Source:** Supabase REST (from persisted `recommendations` table)
```typescript
supabase.from('recommendations')
  .select('*, appliance:appliances(name, icon)')
  .eq('home_id', homeId)
  .eq('is_dismissed', false)
  .order('savings_per_month', { ascending: false })
```
**Response:**
```json
{
  "potentialDailySavings": 150,
  "recommendations": [
    {
      "id": "uuid",
      "appliance": "Washing Machine",
      "type": "schedule_shift",
      "title": "Washing Machine",
      "description": "Run washing machine after 10 PM to save ₹22",
      "savings_per_use": 22,
      "savings_per_month": 440,
      "suggested_time": "22:00",
      "is_dismissed": false,
      "is_acted_on": false
    }
  ]
}
```

#### `PATCH` Dismiss Recommendation
**Source:** Supabase REST
```typescript
supabase.from('recommendations').update({ is_dismissed: true }).eq('id', recId)
```

#### `PATCH` Mark Recommendation Acted On
**Source:** Supabase REST
```typescript
supabase.from('recommendations').update({ is_acted_on: true }).eq('id', recId)
```

---

### Rewards & Gamification

#### `GET` Achievements
**Source:** Supabase REST (join)
```typescript
supabase.from('user_achievements')
  .select('*, achievement:achievements(*)')
  .eq('user_id', userId)
```
**Response** — maps to `Achievement[]` in frontend:
```json
[
  {
    "id": "uuid",
    "title": "Peak Saver",
    "description": "No heavy usage 6-10 PM",
    "icon": "zap",
    "unlocked": true,
    "progress": 100,
    "total": 100
  }
]
```

#### `GET` Challenges
**Source:** Supabase REST (join)
```typescript
supabase.from('user_challenges')
  .select('*, challenge:challenges(*)')
  .eq('user_id', userId)
```
**Response** — maps to `Challenge[]` in frontend:
```json
[
  {
    "id": "uuid",
    "title": "Peak Hour Hero",
    "daysLeft": 2,
    "progress": 5,
    "total": 7,
    "reward": 1000
  }
]
```

#### `GET` Carbon Stats
**Source:** FastAPI (calculation engine)
```
GET /api/carbon/stats?home_id={uuid}&month=2026-02
```
**Response** — maps to `CARBON_STATS`:
```json
{
  "user": 145,
  "neighbors": 180,
  "national": 250,
  "trees": 12,
  "co2Saved": 67
}
```

#### `GET` Carbon Comparison
**Source:** FastAPI
```
GET /api/carbon/comparison?home_id={uuid}
```
**Response** — maps to `CARBON_COMPARISON_DATA`:
```json
[
  { "name": "You", "value": 145, "fill": "#10b981" },
  { "name": "Neighbors", "value": 180, "fill": "#f59e0b" },
  { "name": "National", "value": 250, "fill": "#64748b" }
]
```

---

### Billing

#### `GET` Bill History
**Source:** Supabase REST
```typescript
supabase.from('bills').select('*')
  .eq('home_id', homeId)
  .gte('bill_month', '2026-01-01').lte('bill_month', '2026-12-31')
  .order('bill_month')
```
**Response:**
```json
[
  {
    "id": "uuid",
    "bill_month": "2026-01-01",
    "total_kwh": 320,
    "base_amount": 1920,
    "tax_amount": 192,
    "surcharge_amount": 48,
    "total_amount": 2160,
    "savings_amount": 130,
    "change_percent": -5.2,
    "pdf_url": "/storage/bills/2026-01.pdf",
    "status": "paid"
  }
]
```

#### `GET` Download Bill PDF
**Source:** Supabase Storage
```typescript
supabase.storage.from('bills').download(path)
```

#### `GET` Billing Simulation
**Source:** FastAPI (projection engine using tariff slabs + ToD rates)
```
GET /api/billing/simulate?home_id={uuid}
```
**Logic:**
1. Get month-to-date kWh from `daily_aggregates`
2. Project remaining days at daily avg rate
3. Apply telescopic `tariff_slabs` to total projected kWh → base charge
4. Apply ToD multipliers from `tariff_slots` based on hourly consumption patterns
5. Add fixed charges, taxes, surcharges

**Response:**
```json
{
  "projectedMonthly": 2400,
  "projectedWithOptimization": 2040,
  "potentialSavings": 360,
  "savingsPercent": 15,
  "breakdown": {
    "energy": 1920,
    "tax": 192,
    "surcharge": 48,
    "fixedCharges": 240
  },
  "slabBreakdown": [
    { "slab": "0-100 kWh", "rate": 3.75, "kwh": 100, "amount": 375 },
    { "slab": "101-200 kWh", "rate": 5.20, "kwh": 100, "amount": 520 },
    { "slab": "201-320 kWh", "rate": 7.10, "kwh": 120, "amount": 852 }
  ]
}
```

---

### Payments (Razorpay Integration)

#### `POST` Create Payment Order (Bill Payment)
**Source:** FastAPI (Razorpay order creation)
```
POST /api/payments/create-order
```
**Request:**
```json
{
  "bill_id": "uuid",
  "amount": 2400
}
```
**Logic:**
1. Create Razorpay order via `razorpay.Order.create()`
2. Insert into `payments` with `status='pending'`, `razorpay_order_id`
3. Return order details to frontend for checkout
**Response:**
```json
{
  "order_id": "order_xxx",
  "payment_id": "uuid",
  "amount": 240000,
  "currency": "INR",
  "key": "rzp_xxx"
}
```
> Amount in paise (₹2400 = 240000 paise) for Razorpay.

#### `POST` Verify Payment
**Source:** FastAPI (Razorpay signature verification)
```
POST /api/payments/verify
```
**Request:**
```json
{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "sig_xxx"
}
```
**Logic:**
1. Verify HMAC signature using Razorpay secret
2. Update `payments.status = 'success'`, store `razorpay_payment_id`, `razorpay_signature`
3. Update `bills.status = 'paid'`, `bills.paid_at = now()`
4. Create notification: "Payment of ₹2400 received"
**Response:**
```json
{ "success": true, "payment_id": "uuid", "bill_status": "paid" }
```

---

### Recharge (Prepaid — also through Razorpay)

#### `POST` Create Recharge Order
**Source:** FastAPI
```
POST /api/recharge/create-order
```
**Request:**
```json
{
  "meter_id": "uuid",
  "amount": 2000
}
```
**Logic:**
1. Create Razorpay order
2. Insert into `recharges` with `status='pending'`
**Response:**
```json
{
  "order_id": "order_xxx",
  "recharge_id": "uuid",
  "amount": 200000,
  "currency": "INR",
  "key": "rzp_xxx"
}
```

#### `POST` Verify Recharge
**Source:** FastAPI
```
POST /api/recharge/verify
```
**Request:**
```json
{
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "sig_xxx"
}
```
**Logic:**
1. Verify Razorpay signature
2. Update `recharges.status = 'success'`, store Razorpay IDs
3. Calculate `units_credited` = amount / current avg tariff rate
4. Update `meters.balance_amount += recharges.amount`
5. Update `meters.last_recharge_amount`, `meters.last_recharge_date`
6. Set `recharges.balance_after = meters.balance_amount`
7. Create notification: "Recharge of ₹2000 successful"
**Response:**
```json
{
  "success": true,
  "recharge_id": "uuid",
  "balance_after": 2550,
  "units_credited": 307.69,
  "transaction_id": "TXN_12345"
}
```

#### `GET` Recharge History
**Source:** Supabase REST
```typescript
supabase.from('recharges').select('*').eq('user_id', userId).order('created_at', { ascending: false })
```

---

### Notifications

#### `GET` List Notifications
**Source:** Supabase REST
```typescript
supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).range(0, 49)
```

#### `PATCH` Mark as Read
```typescript
supabase.from('notifications').update({ is_read: true }).eq('id', notifId)
```

#### `PATCH` Mark All Read
```typescript
supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false)
```

#### `DELETE` Delete Notification
```typescript
supabase.from('notifications').delete().eq('id', notifId)
```

#### Realtime Subscription
```typescript
supabase.channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    // Show toast, update badge count
  })
  .subscribe()
```

---

### Complaints

#### `POST` File Complaint
```typescript
supabase.from('complaints').insert({
  user_id, home_id, meter_id, type, subject, description, attachments
})
```

#### `GET` My Complaints
```typescript
supabase.from('complaints').select('*, updates:complaint_updates(*)').eq('user_id', userId).order('created_at', { ascending: false })
```

#### `POST` Upload Attachment
```typescript
supabase.storage.from('complaints').upload(path, file)
```

---

### User Profile

#### `GET` Profile
```typescript
supabase.from('profiles').select('*, homes(*, meters(*), tariff:tariff_plans(name))').eq('id', userId).single()
```
**Transformed response** — maps to frontend `getUserProfile()`:
```json
{
  "name": "Rohit Sharma",
  "location": "Bangalore, KA",
  "kwhSaved": 1284,
  "treesPlanted": 145
}
```
> `kwhSaved` and `treesPlanted` come from aggregated `carbon_stats`.

#### `PUT` Update Profile
```typescript
supabase.from('profiles').update({ name, phone, location, household_members }).eq('id', userId)
```

---

### NILM (Non-Intrusive Load Monitoring)

#### `POST` Run NILM Disaggregation
**Source:** FastAPI (ML inference)
```
POST /api/nilm/disaggregate
```
**Request:**
```json
{ "meter_id": "uuid" }
```
**Logic:**
1. Fetch recent `meter_readings` for the given meter (last N minutes of power data)
2. Run NILM ML model inference (TensorFlow/PyTorch)
3. Store results in `nilm_results` table
4. Update `appliances` where `source='nilm'` with estimated power values
5. Create/update appliance entries for newly detected devices
**Response:**
```json
{
  "results": [
    { "appliance_name": "AC", "estimated_power_w": 1400, "confidence": 0.92 },
    { "appliance_name": "Fridge", "estimated_power_w": 150, "confidence": 0.88 },
    { "appliance_name": "Geyser", "estimated_power_w": 2000, "confidence": 0.75 },
    { "appliance_name": "Washing Machine", "estimated_power_w": 450, "confidence": 0.62 }
  ],
  "window_start": "2026-02-20T04:00:00Z",
  "window_end": "2026-02-20T04:30:00Z",
  "total_meter_power_w": 4200,
  "disaggregated_power_w": 4000,
  "unidentified_power_w": 200
}
```

---

### Scheduler (Internal)

#### `POST` Execute Pending Schedules
**Source:** FastAPI (called by cron job every 60 seconds — **not exposed to frontend**)
```
POST /api/scheduler/execute
```
**Auth:** Internal service key only (not user-facing)
**Logic:**
1. Query `schedules` where `is_active = TRUE` and `start_time` matches current minute and day matches repeat pattern
2. For each matching schedule:
   - Look up `appliances.smart_plug_id`
   - Call Tuya API to toggle ON/OFF
   - Log result in `schedule_logs` (success, failed, device_offline)
   - Update `schedules.last_executed`
   - Create notification for user
3. If toggle fails, retry up to 3 times with 10s delay. Log each attempt.
**Response:**
```json
{
  "executed": 3,
  "success": 2,
  "failed": 1,
  "logs": [
    { "schedule_id": "uuid", "appliance": "AC", "action": "OFF", "result": "success" },
    { "schedule_id": "uuid", "appliance": "Geyser", "action": "ON", "result": "success" },
    { "schedule_id": "uuid", "appliance": "Washing", "action": "ON", "result": "device_offline", "error": "Tuya device eb5678 unreachable" }
  ]
}
```

#### `POST` Refresh Daily Aggregates
**Source:** FastAPI (called by nightly cron at 00:30 IST — **not exposed to frontend**)
```
POST /api/scheduler/aggregate
```
**Logic:**
1. For each active `home`:
   - Aggregate yesterday's `meter_readings` → insert into `daily_aggregates` (home total)
   - Aggregate `plug_readings` per appliance → insert into `daily_aggregates` (per appliance)
   - Calculate carbon using emission factor → update `daily_aggregates.carbon_kg`
2. Refresh `carbon_stats` monthly roll-up if last day of month

#### `POST` Refresh Recommendations
**Source:** FastAPI (called after daily aggregation — **not exposed to frontend**)
```
POST /api/scheduler/refresh-recommendations
```
**Logic:**
1. For each active home, run tariff optimization logic
2. Identify appliances with savings potential based on usage patterns vs ToD rates
3. Upsert into `recommendations` table (avoid duplicating existing active ones)

---

### Realtime (WebSocket)

Uses Supabase Realtime — **no FastAPI needed**.

| Channel | Table | Event | Purpose |
|---------|-------|-------|---------|
| `meter-live` | `meter_readings` | INSERT | Live load, cost, kWh on dashboard |
| `appliance-status` | `appliances` | UPDATE | Status changes (ON→OFF) |
| `notifications` | `notifications` | INSERT | New alert badges |
| `plug-live` | `plug_readings` | INSERT | Live plug power readings |

---

## Admin Endpoints

> All admin endpoints require `role = 'admin'` or `'super_admin'` in the JWT claims.

### User Management

#### `GET` List All Users (paginated)
**Source:** Supabase REST
```typescript
supabase.from('profiles')
  .select('*, homes(*, meters(*), tariff:tariff_plans(name))', { count: 'exact' })
  .range(offset, offset + limit)
  .order('created_at', { ascending: false })
```
**Filters:** `?search=`, `?area=`, `?tariff_category=`, `?meter_type=`

#### `GET` Single User Detail
```typescript
supabase.from('profiles')
  .select('*, homes(*, meters(*), appliances(*), bills(*), tariff:tariff_plans(*)))')
  .eq('id', userId)
  .single()
```

---

### Admin Reports

All reports served by **FastAPI** (complex aggregations).

#### `GET` Revenue Report
```
GET /api/admin/reports/revenue?period=month&date=2026-02&group_by=area
```
**Response:**
```json
{
  "totalRevenue": 15420000,
  "periodLabel": "February 2026",
  "byArea": [
    { "area": "Koramangala", "revenue": 2340000, "consumers": 4500 },
    { "area": "Whitefield", "revenue": 1890000, "consumers": 3200 }
  ],
  "byCategory": [
    { "category": "residential", "revenue": 9200000 },
    { "category": "commercial", "revenue": 4800000 },
    { "category": "industrial", "revenue": 1420000 }
  ],
  "prepaidVsPostpaid": { "prepaid": 8900000, "postpaid": 6520000 },
  "topConsumers": [
    { "consumer_number": "BLR-001234", "name": "...", "amount": 45000 }
  ]
}
```

#### `GET` Consumption Analytics
```
GET /api/admin/reports/consumption?period=month&date=2026-02
```
**Response:**
```json
{
  "avgMonthlyKwh": 320,
  "peakDemandTime": "10:00-12:00",
  "peakDemandKw": 4500,
  "areaHeatmap": [
    { "area": "Koramangala", "avgKwh": 380, "consumers": 4500, "lat": 12.93, "lng": 77.62 }
  ],
  "seasonalTrend": [
    { "month": "Jan", "avgKwh": 290 },
    { "month": "Feb", "avgKwh": 310 }
  ],
  "abnormalUsage": [
    { "consumer_number": "BLR-005678", "currentKwh": 890, "avgKwh": 320, "flagType": "spike" }
  ]
}
```

#### `GET` Defaulter / Risk Report
```
GET /api/admin/reports/defaulters
```
**Response:**
```json
{
  "lowBalanceFrequent": [
    { "consumer_number": "...", "lowBalanceCount": 5, "avgBalance": 120 }
  ],
  "lateRechargers": [
    { "consumer_number": "...", "avgDaysLate": 12 }
  ],
  "suddenDrops": [
    { "consumer_number": "...", "previousKwh": 320, "currentKwh": 45, "dropPercent": 86 }
  ],
  "suddenSpikes": [
    { "consumer_number": "...", "previousKwh": 320, "currentKwh": 890, "spikePercent": 178 }
  ]
}
```

#### `GET` Complaint Analytics
```
GET /api/admin/reports/complaints?period=month
```
**Response:**
```json
{
  "total": 456,
  "byStatus": { "received": 120, "in_progress": 85, "assigned": 67, "resolved": 150, "closed": 34 },
  "byType": { "billing": 180, "outage": 120, "meter_error": 89, "payment": 40, "other": 27 },
  "avgResolutionHours": 48.5,
  "byArea": [
    { "area": "Koramangala", "count": 45, "avgResolutionHours": 36 }
  ],
  "pending": [
    { "id": "uuid", "consumer_number": "...", "type": "billing", "daysOpen": 5 }
  ]
}
```

---

### Admin Tariff Management

#### `GET` List Tariff Plans (with slots + slabs)
```typescript
supabase.from('tariff_plans').select('*, slots:tariff_slots(*), slabs:tariff_slabs(*)')
```

#### `POST` Create Tariff Plan
```typescript
supabase.from('tariff_plans').insert({ name, discom, category, effective_from })
```

#### `PUT` Update Tariff Plan
```typescript
supabase.from('tariff_plans').update({ ... }).eq('id', planId)
```

#### `POST` Add Tariff Slots (ToD)
```typescript
supabase.from('tariff_slots').insert([
  { plan_id, hour_label: '12AM', start_hour: 0, end_hour: 2, rate: 4, slot_type: 'off-peak' },
  ...
])
```

#### `POST` Add Tariff Slabs (Consumption)
```typescript
supabase.from('tariff_slabs').insert([
  { plan_id, from_kwh: 0, to_kwh: 100, rate_per_kwh: 3.75, display_order: 1 },
  { plan_id, from_kwh: 101, to_kwh: 200, rate_per_kwh: 5.20, display_order: 2 },
  { plan_id, from_kwh: 201, to_kwh: 500, rate_per_kwh: 7.10, display_order: 3 },
  { plan_id, from_kwh: 501, to_kwh: null, rate_per_kwh: 8.50, display_order: 4 }
])
```

---

### Admin Complaint Management

#### `PATCH` Update Complaint Status
```typescript
supabase.from('complaints').update({ status, assigned_to }).eq('id', complaintId)
```
Also insert into `complaint_updates`:
```typescript
supabase.from('complaint_updates').insert({ complaint_id, status, note, updated_by: adminId })
```

---

### Admin Outage Management

#### `POST` Create Outage Notice
```typescript
supabase.from('outage_notices').insert({ area, feeder_id, reason, start_time, estimated_end, created_by: adminId })
```
> This triggers a notification to all users in the affected area (via DB function or FastAPI webhook).

#### `PATCH` Resolve Outage
```typescript
supabase.from('outage_notices').update({ is_resolved: true, actual_end: now() }).eq('id', outageId)
```

---

### Admin CSV Export

#### `GET` Export Data
**Source:** FastAPI
```
GET /api/admin/export?type=revenue&period=month&date=2026-02&format=csv
```
Types: `revenue`, `consumption`, `defaulters`, `complaints`, `users`

---

## FastAPI Endpoints Summary

All FastAPI routes are prefixed with `/api`.

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| `POST` | `/appliances/{id}/toggle` | Toggle via Tuya (with NOT_CONTROLLABLE check) | User JWT |
| `POST` | `/appliances/{id}/schedule` | Create schedule | User JWT |
| `POST` | `/plugs/pair` | Tuya plug pairing | User JWT |
| `GET` | `/plugs/{id}/status` | Live plug status from Tuya | User JWT |
| `POST` | `/plugs/{id}/calibrate` | Calibrate plug | User JWT |
| `POST` | `/tuya/sync` | Batch sync all plugs in home | User JWT |
| `POST` | `/nilm/disaggregate` | Run NILM inference | Service key |
| `GET` | `/carbon/stats` | Carbon calculation | User JWT |
| `GET` | `/carbon/comparison` | Carbon comparison | User JWT |
| `GET` | `/billing/simulate` | Bill projection (with slab + ToD) | User JWT |
| `POST` | `/payments/create-order` | Create Razorpay order for bill | User JWT |
| `POST` | `/payments/verify` | Verify Razorpay signature | User JWT |
| `POST` | `/recharge/create-order` | Create Razorpay order for recharge | User JWT |
| `POST` | `/recharge/verify` | Verify Razorpay recharge | User JWT |
| `POST` | `/scheduler/execute` | Execute pending schedules (cron) | Service key |
| `POST` | `/scheduler/aggregate` | Nightly daily_aggregates refresh | Service key |
| `POST` | `/scheduler/refresh-recommendations` | Refresh tariff recommendations | Service key |
| `GET` | `/admin/reports/revenue` | Revenue report | Admin JWT |
| `GET` | `/admin/reports/consumption` | Consumption analytics | Admin JWT |
| `GET` | `/admin/reports/defaulters` | Risk report | Admin JWT |
| `GET` | `/admin/reports/complaints` | Complaint analytics | Admin JWT |
| `GET` | `/admin/export` | CSV export | Admin JWT |

---

## Supabase Direct Queries Summary

These are called via `@supabase/supabase-js` — **no HTTP endpoint needed**.

| Operation | Table | Method |
|-----------|-------|--------|
| List appliances | `appliances` | `select` |
| Add appliance | `appliances` | `insert` |
| Delete appliance | `appliances` | `delete` |
| Get tariff slots | `tariff_slots` | `select` |
| Get tariff slabs | `tariff_slabs` | `select` |
| List notifications | `notifications` | `select` |
| Mark notification read | `notifications` | `update` |
| Delete notification | `notifications` | `delete` |
| Get bill history | `bills` | `select` |
| Get profile | `profiles` | `select` |
| Update profile | `profiles` | `update` |
| List achievements | `user_achievements` join `achievements` | `select` |
| List challenges | `user_challenges` join `challenges` | `select` |
| List recommendations | `recommendations` | `select` |
| Dismiss recommendation | `recommendations` | `update` |
| File complaint | `complaints` | `insert` |
| List complaints | `complaints` join `complaint_updates` | `select` |
| Upload attachment | Storage bucket `complaints` | `upload` |
| Download bill PDF | Storage bucket `bills` | `download` |
| Get recharge history | `recharges` | `select` |
| Sparkline data | `daily_aggregates` | `select` |
| Active devices | `appliances` | `select` |
| Admin: list users | `profiles` | `select` |
| Admin: manage tariffs | `tariff_plans`, `tariff_slots`, `tariff_slabs` | CRUD |
| Admin: update complaint | `complaints`, `complaint_updates` | `update`, `insert` |
| Admin: outage notices | `outage_notices` | CRUD |

## Supabase RPC Functions Summary

| Function | Called By | Purpose |
|----------|-----------|---------|
| `get_dashboard_stats(home_id)` | Dashboard screen | Aggregated stats (avoids N+1 queries) |
| `get_consumption_breakdown(home_id, days)` | Insights screen | NILM + plug breakdown |
| `get_daily_trend(home_id, days)` | Insights screen | Daily kWh series from aggregates |

## Realtime Channels Summary

| Channel | Table | Event | Purpose |
|---------|-------|-------|---------|
| `meter-live` | `meter_readings` | INSERT | Live load, cost, kWh on dashboard |
| `appliance-status` | `appliances` | UPDATE | Status changes (ON→OFF) |
| `notifications` | `notifications` | INSERT | New alert badges |
| `plug-live` | `plug_readings` | INSERT | Live plug power readings |

---

## Error Response Format

All endpoints return errors in this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Home ID is required",
    "details": {}
  }
}
```

**Standard error codes:**
| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Missing/invalid parameter |
| `UNAUTHENTICATED` | 401 | No valid JWT |
| `FORBIDDEN` | 403 | RLS denied / wrong role |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `NOT_CONTROLLABLE` | 422 | Appliance has no smart plug |
| `PAYMENT_FAILED` | 422 | Razorpay verification failed |
| `DEVICE_OFFLINE` | 503 | Tuya device unreachable |
| `INTERNAL_ERROR` | 500 | Server error |
