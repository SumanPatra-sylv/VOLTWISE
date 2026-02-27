# VoltWise — Full Codebase Audit

> **Generated:** 2026-02-27  
> **Branch:** `backend`  
> **Purpose:** Map every execution path, identify fragility, plan backend migration.

---

## 1. Appliance Status Updates — Execution Authority Map

### A. Supabase Direct Updates (Frontend → DB)

Every single appliance status mutation happens via **direct `.update()` from React components**. No RPC, no backend endpoint.

| # | File | Line | Status Set To | Trigger Source | Context |
|---|------|------|---------------|----------------|---------|
| 1 | `screens/Control.tsx` | L171 | `ON` / `OFF` | `manual` | Main toggle button in Control Center |
| 2 | `screens/Control.tsx` | L442 | `ON` | `manual_override` | InterceptorModal → "Ignore & Run Now" |
| 3 | `screens/Control.tsx` | L457 | `ON` + `eco_mode_enabled: true` | `optimizer` | InterceptorModal → "Eco Mode" |
| 4 | `screens/Control.tsx` | L594 | `OFF` (initial) | — | Add/edit appliance form (insert/update) |
| 5 | `screens/Control.tsx` | L749 | `SCHEDULED` | — | ScheduleModal sets status after creating schedule row |
| 6 | `screens/Home.tsx` | L211–214 | `ON` / `OFF` | `manual` | Quick toggle from Home dashboard cards |
| 7 | `screens/Optimizer.tsx` | L128 | `OFF` | `optimizer` | "Turn Off" single appliance during peak |
| 8 | `screens/Optimizer.tsx` | L154 | `OFF` | `optimizer_batch` | "Turn Off All" heavy appliances during peak |
| 9 | `screens/Optimizer.tsx` | L180 | `eco_mode_enabled: true` | `optimizer` | Enable eco mode from optimizer |

### B. RPC Calls for Status

| Result |
|--------|
| **None.** Zero RPC functions update appliance status. All mutations are direct frontend `.update()`. |

### C. React State Mutations (Optimistic UI)

| # | File | Line | What |
|---|------|------|------|
| 1 | `screens/Control.tsx` | L188–190 | `setAppliances(prev => prev.map(...))` after toggle |
| 2 | `screens/Control.tsx` | L444 | Same after "Run Now" |
| 3 | `screens/Optimizer.tsx` | L63 | `setAppliances` (refetched via realtime) |

### D. Realtime Listeners (Read-Only Sync)

| # | File | Line | Purpose |
|---|------|------|---------|
| 1 | `screens/Control.tsx` | L119–136 | Re-fetches appliances on any `postgres_changes` event |
| 2 | `screens/Home.tsx` | L184–200 | Syncs Home toggles with Control Center |
| 3 | `screens/Optimizer.tsx` | L103–112 | Syncs optimizer view |

**Conclusion:** All 9 status mutations are frontend Supabase `.update()` calls. Zero server-side execution authority.

---

## 2. Time-Based Execution Logic

### `setInterval`

| File | Line | Logic |
|------|------|-------|
| `screens/SmartPlugSetup.tsx` | L41 | **UI-only:** simulates plug discovery progress bar |

### `setTimeout`

| File | Line | Logic |
|------|------|-------|
| `screens/SmartPlugSetup.tsx` | L25, L32 | UI step transition delays |
| `contexts/AppContext.tsx` | L73 | Request timeout wrapper (10s) |
| `contexts/AppContext.tsx` | L216 | Auth safety timeout — releases splash after 10s |

### `new Date()` / `currentHour` (Tariff Detection)

| File | Line | Logic |
|------|------|-------|
| `screens/Control.tsx` | L148 | Gets `currentHour` for InterceptorModal decision |
| `screens/Control.tsx` | L533 | Schedule time display formatting |
| `screens/Optimizer.tsx` | L75 | Gets `currentHour` for optimization alerts |
| `screens/Home.tsx` | L28 | Greeting ("Good Morning/Evening") |
| `screens/Home.tsx` | L174 | Optimization alert banner |
| `utils/tariffOptimizer.ts` | All functions | Receives `currentHour` as parameter — pure math |

### Cron / Scheduled Execution

| Result |
|--------|
| **None.** Zero cron jobs, zero schedulers, zero background task runners exist anywhere in the codebase. |

**Conclusion:** No time-based execution. `currentHour` is read once on render. No polling. No timers that trigger appliance actions. No schedule executor.

---

## 3. Cost / kWh Calculations

### Frontend Computed (Pure TypeScript)

| File | Function | What |
|------|----------|------|
| `utils/tariffOptimizer.ts` L127–147 | `calculateCostForTime()` | Core: kW × rate × hours, handles multi-slot spans with minute precision |
| `utils/tariffOptimizer.ts` L155–225 | `calculateScheduleOptions()` | Computes runNow / nextCheaper / cheapest for InterceptorModal |
| `utils/tariffOptimizer.ts` L263–310 | `calculateOptimizationAlert()` | Total savings/hr for all heavy appliances during peak |
| `screens/Control.tsx` L209 | `getCostPerHour()` | `ratedPowerW / 1000 × currentSlotRate` |
| `screens/Control.tsx` L695–710 | ScheduleModal cost vars | `costNow`, `cheapestCost`, `savings` inline |

### Hardcoded Constants

| File | Lines | Constant | Value |
|------|-------|----------|-------|
| `services/api.ts` | L151–157 | `EMISSION_FACTORS` | peak: 0.90, normal: 0.82, offPeak: 0.75 kg CO₂/kWh |
| `services/api.ts` | L160–164 | `SBPDCL_RATES` | peak: 9.55, normal: 7.42, offPeak: 6.31 ₹/kWh |
| `services/api.ts` | L146–148 | `REGIONAL_AVERAGE_KWH`, `CARBON_EMISSION_FACTOR`, `CO2_PER_TREE_PER_MONTH` | 250, 0.85, 1.75 |
| `utils/tariffOptimizer.ts` | L83 | `ECO_MODE_REDUCTION` | 0.15 (15%) |

### Supabase RPC (Server-Side Aggregation)

| File | Function | What |
|------|----------|------|
| `sql/02_setup.sql` L636–740 | `get_dashboard_stats()` | todayCost, todayKwh, monthBill, activeDevices, slot info |
| `sql/02_setup.sql` L741–770 | `get_consumption_breakdown()` | Per-appliance kWh from NILM |
| `sql/02_setup.sql` L768–800 | `get_daily_trend()` | Daily kWh for bar chart |

**Conclusion:** Aggregation is server-side (RPCs). All optimization math is frontend-only.

---

## 4. Schedule Lifecycle — Full Trace

### Where Created

| Step | File | Line | Action |
|------|------|------|--------|
| 1 | `screens/Control.tsx` | L419 | User clicks clock icon → opens ScheduleModal |
| 2 | `screens/Control.tsx` | L726–750 | `handleSave()`: deletes existing → inserts new schedule → sets appliance status to `SCHEDULED` |

### Where Stored

| Table | Schema (02_setup.sql) | Key Fields |
|-------|----------------------|------------|
| `schedules` | L272–286 | `appliance_id`, `home_id`, `start_time`, `end_time`, `repeat_type`, `is_active`, `created_by` |
| `schedule_logs` | L288–298 | `schedule_id`, `executed_at`, `action`, `result` — **never populated** |

### Where Triggered / Executed

```
❌ Backend scheduler     → Does not exist
❌ Cron job              → None
❌ FastAPI endpoint      → Not implemented
❌ Frontend executor     → None
```

### Call Flow Diagram

```
User → [ScheduleModal] → supabase.from('schedules').insert({...})
                       → supabase.from('appliances').update({ status: 'SCHEDULED', schedule_time })
                       → ❌ NO EXECUTOR EXISTS
                       → Schedule sits in DB forever
                       → Appliance shows "Scheduled" badge
                       → Nothing ever turns it ON at the scheduled time
```

**CRITICAL GAP: Schedules are cosmetic only.**

---

## 5. Frontend-Dependent Logic (Fragility)

| Logic | File | Breaks If Browser Closed? |
|-------|------|---------------------------|
| Appliance toggle | `Control.tsx`, `Home.tsx` | ✅ Yes |
| Schedule creation | `Control.tsx` L726 | ✅ Yes |
| Schedule execution | N/A | Already broken — no executor |
| Tariff interception | `Control.tsx` L148–163 | ✅ Yes |
| Optimization alerts | `Optimizer.tsx` L117 | ✅ Yes |
| Realtime sync | Control, Home, Optimizer | ✅ Yes (channels disconnect) |
| Carbon dashboard | `api.ts` L180–275 | ✅ Yes |
| Notification generation | userside.md mentions 15-min scheduler | ✅ Backend doesn't exist |

**If browser closes: 100% of automation, scheduling, optimization, and control logic stops.**

---

## 6. Tariff Transition Handling

### Logic Path

```
1. On page load: fetchUserTariffSlots(homeId)
   → homes.tariff_plan_id → tariff_slots.plan_id
   → Returns [{ start_hour, end_hour, rate, slot_type }]

2. currentHour = new Date().getHours()  // read ONCE

3. getSlotForHour(currentHour, slots)
   → Handles midnight crossing (e.g. 22→6)
   → Returns current slot

4. shouldIntercept(appliance, slots, currentHour)
   → tier 1-3 AND slot_type === 'peak' → show InterceptorModal

5. ❌ No dynamic transition detection
   ❌ No polling for slot changes
   ❌ No event firing on boundary crossing
```

**Tariff detection is static, computed once on mount. If user opens app at 9:59 PM (peak) and peak ends at 10:00 PM, UI stays in "peak" mode until page refresh.**

---

## 7. Supabase RPC Functions (Complete List)

| # | Function | File | What It Computes | Server-Side? |
|---|----------|------|------------------|--------------|
| 1 | `get_dashboard_stats(p_home_id)` | `sql/02_setup.sql` L636 | Balance, todayKwh, todayCost, monthBill, activeDevices, slot info | ✅ |
| 2 | `get_consumption_breakdown(p_home_id, p_days)` | `sql/02_setup.sql` L741 | Per-appliance kWh from NILM (donut chart) | ✅ |
| 3 | `get_daily_trend(p_home_id, p_days)` | `sql/02_setup.sql` L768 | Daily kWh (bar chart) | ✅ |
| 4 | `is_admin()` | `sql/02_setup.sql` L628 | Boolean admin check | ✅ |
| 5 | `handle_new_user()` | `sql/02_setup.sql` L53 | Trigger: auto-create profile on signup | ✅ |
| 6 | `update_updated_at()` | `sql/02_setup.sql` L601 | Trigger: set `updated_at = now()` | ✅ |

### Server vs Frontend Split

| Concern | Server (RPC) | Frontend |
|---------|-------------|----------|
| Dashboard aggregation | `get_dashboard_stats` | Display only |
| NILM breakdown | `get_consumption_breakdown` | Display only |
| Daily trends | `get_daily_trend` | Display only |
| **Cost optimization** | ❌ None | **All in `tariffOptimizer.ts`** |
| **Schedule execution** | ❌ None | ❌ None (broken) |
| **Appliance control** | ❌ None | Direct `.update()` |
| **Carbon calculations** | ❌ None | `api.ts getCarbonDashboard` |
| **Notifications** | ❌ None | ❌ None |

---

## 8. Known Bugs Found During Audit

### Bug: AC Shows "Fix" in Optimizer Even With Eco Mode On

**Root cause:** `calculateOptimizationAlert()` in `tariffOptimizer.ts` filters appliances by `status === 'ON'` and tier 1-3. Eco mode only reduces effective power by 15% — it doesn't exclude the appliance from the "needs fixing" list.

**Expected behavior:** If a tier_3_comfort appliance already has `eco_mode_enabled = true`, it should show as "Already Optimized" in the optimizer, not prompt the user to fix it again.

**Fix location:** `tariffOptimizer.ts` → `calculateOptimizationAlert()` and `Optimizer.tsx` action sheet.

### Bug: Eco Mode Button Shows Even When Already Enabled

**Root cause:** In `Optimizer.tsx` L387, the eco mode button checks `optimization_tier === 'tier_3_comfort'` but doesn't check `eco_mode_enabled`.

---

## 9. Risk Assessment: Moving to Backend

### What Breaks If Frontend Execution Is Removed

| Component | Breaks? | Migration Target |
|-----------|---------|------------------|
| `toggleAppliance()` | Yes | `POST /api/appliances/{id}/toggle` |
| `ScheduleModal.handleSave()` | Yes | `POST /api/appliances/{id}/schedule` + APScheduler job |
| **Schedule execution** | Already broken | APScheduler one-shot job at exact time |
| `shouldIntercept()` | Partial | Backend validation before toggle |
| `calculateOptimizationAlert()` | Keep in frontend | For instant UI; backend has its own copy for autopilot |
| Optimizer batch turn-off | Yes | `POST /api/optimizer/execute` |
| Carbon calculations | Yes | Nightly APScheduler cron |
| Notification generation | Already missing | 15-min APScheduler cron |

### What STAYS in Frontend

| Logic | Why |
|-------|-----|
| `getSlotForHour()` | UI display — instant feedback |
| `calculateCostForTime()` | Cost preview in ScheduleModal |
| `calculateScheduleOptions()` | InterceptorModal previews |
| `calculateOptimizationAlert()` | Optimizer page display |
| Supabase Realtime listeners | Read-only sync |
| Greeting, tariff display, schedule picker UI | Pure UI |

### What MOVES to Backend (Actions Only)

| Logic | Backend Endpoint |
|-------|-----------------|
| `toggleAppliance()` | `POST /api/appliances/{id}/toggle` → Tuya API for smart plugs, virtual status for others |
| Schedule execution | APScheduler job at exact trigger time |
| Autopilot peak enforcement | Tariff transition watcher (1-min cron) |
| CO₂ aggregation | Nightly cron |
| Notification generation | 15-min cron |
| Batch optimizer actions | `POST /api/optimizer/execute` |
