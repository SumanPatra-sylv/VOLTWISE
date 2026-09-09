# VoltWise — Full Hackathon Audit Report

> **Generated:** 2025-07-16  
> **Branch:** `fix/audit-bugfixes`  
> **Auditor:** Automated codebase audit (strict judge perspective)  
> **Context:** Smart Metering Super App — Hackathon submission  

---

## Table of Contents

1. [Real vs Mock Matrix](#1-real-vs-mock-matrix)
2. [Bugs Found & Fixed](#2-bugs-found--fixed)
3. [Hardcoded Data Inventory](#3-hardcoded-data-inventory)
4. [Scalability Assessment](#4-scalability-assessment)
5. [DISCOM / OEM Integration Readiness](#5-discom--oem-integration-readiness)
6. [NILM Pipeline Assessment](#6-nilm-pipeline-assessment)
7. [Architecture Strengths](#7-architecture-strengths)
8. [Hackathon Scoring](#8-hackathon-scoring)
9. [What's Missing for Production](#9-whats-missing-for-production)
10. [Recommendations](#10-recommendations)

---

## 1. Real vs Mock Matrix

### Frontend Screens

| Screen | Data Source | Real? | Notes |
|--------|-----------|-------|-------|
| **Home.tsx** | Supabase `appliances`, `consumer_master`, realtime | ✅ Real | Progress bar was hardcoded 65% — **FIXED** |
| **Control.tsx** | Supabase `appliances`, `schedules`, `tariff_slots`, backend API | ✅ Real | `currentSlotRate` was hardcoded 7.42 — **FIXED** |
| **Optimizer.tsx** | Supabase `appliances`, `tariff_slots`, backend carbon API | ✅ Real | Fully functional peak optimizer |
| **Insights.tsx** | Supabase `consumer_master`, `appliances` | ⚠️ Partial | Active devices were mock `ACTIVE_DEVICES_PREVIEW` — **FIXED**. "On Track" badge was hardcoded — **FIXED** |
| **Profile.tsx** | Supabase `profiles`, `notifications` | ✅ Real | Notification count was hardcoded "3 New" — **FIXED** |
| **Notifications.tsx** | Was 100% hardcoded mock data | ❌→✅ | **FIXED** — Now fetches from Supabase `notifications` table with realtime subscription |
| **AdminDashboard.tsx** | Supabase `profiles`, `consumer_master` | ⚠️ Partial | Used `auth.admin.getUserById()` (requires service_role) — **FIXED** to use profile data |
| **BillHistory.tsx** | Supabase `bills` table | ✅ Real | Bill generation itself deferred |
| **Onboarding.tsx** | Supabase auth + `profiles` | ✅ Real | Full auth flow working |
| **SmartPlugSetup.tsx** | UI only (plug purchase deferred) | ⚠️ UI Only | Expected — plug integration later |
| **Rewards.tsx** | Supabase `rewards`, `challenges` | ⚠️ Partial | Data structure exists, seeding minimal |
| **TariffOptimizer.tsx** | Local calculation engine | ✅ Real | `utils/tariffOptimizer.ts` does real ToD optimization |

### Backend Services

| Service | Implementation | Real? | Notes |
|---------|---------------|-------|-------|
| **autopilot.py** | Full penalty engine + scheduler | ✅ Real | Was missing `await` on `check_grid_status` — **FIXED** |
| **penalty_engine.py** | Multi-factor scoring (tariff, carbon, comfort, grid) | ✅ Real | Core differentiator |
| **scheduler.py** | APScheduler-based execution | ✅ Real | Bridges schedules to adapter layer |
| **scheduler_manager.py** | Startup schedule restoration | ✅ Real | Had naive datetime — **FIXED** to UTC |
| **transition_watcher.py** | 1-min cron for tariff/carbon transitions | ✅ Real | Had `NameError` risk — **FIXED** |
| **carbon.py** | Carbon intensity from DB | ✅ Real | Dedup logic was wrong — **FIXED** |
| **tariff_watcher.py** | Tariff slot monitoring | ✅ Real | Reads from `tariff_slots` table |
| **grid_protection.py** | Grid stability checks | ⚠️ Stub | Returns simulated status (no real DISCOM API yet) |
| **device.py (adapter)** | VirtualAdapter + TuyaAdapter | ⚠️ Partial | TuyaAdapter exists but no physical plug yet |

### API Layer (services/api.ts)

| Function | Status | Notes |
|----------|--------|-------|
| `toggleAppliance()` | ❌ Mock stub | Real implementation in `backend.ts` — **DEPRECATED** |
| `scheduleAppliance()` | ❌ Mock stub | Real implementation via ScheduleModal — **DEPRECATED** |
| `getNotifications()` | ❌ Mock stub | Now fetched directly in Notifications.tsx — **DEPRECATED** |
| `markNotificationRead()` | ❌ Mock stub | Now via direct Supabase in Notifications.tsx — **DEPRECATED** |
| `getBillHistory()` | ❌ Mock stub | BillHistory.tsx reads from Supabase directly — **DEPRECATED** |
| `getTariffRates()` | ✅ Real | Returns actual tariff structure |
| `getDailySummary()` | ✅ Real | From `consumer_master` table |
| `getMonthlyTrend()` | ✅ Real | From `consumer_master` table |

---

## 2. Bugs Found & Fixed

### Critical Bugs (Fixed)

| # | File | Bug | Impact | Fix |
|---|------|-----|--------|-----|
| 1 | `routers/autopilot.py` | Missing `await` on `check_grid_status()` | Grid protection endpoint returns coroutine object instead of data | Added `await` |
| 2 | `services/transition_watcher.py` | `region_code` used before assignment if carbon block throws | `NameError` crashes entire watcher cron | Moved default declaration before try-blocks |
| 3 | `services/supabase.ts` | Silent placeholder fallback on missing env vars | App connects to invalid URL in production, fails silently | Throws error in production mode |

### High Bugs (Fixed)

| # | File | Bug | Impact | Fix |
|---|------|-----|--------|-----|
| 4 | `routers/autopilot.py` | `simulate_peak` uses hardcoded `3.24` as peak rate | Wrong savings calculation for any non-default tariff | Fetches actual peak rate from `tariff_slots` table |
| 5 | `services/carbon.py` | Dedup logic keeps first entry per hour instead of latest | Stale carbon data used when multiple entries exist | Changed to "last wins" (latest `effective_from`) |
| 6 | `services/scheduler_manager.py` | `datetime.now()` produces naive timestamp | Timezone mismatch with Supabase (expects UTC) | `datetime.now(timezone.utc)` |
| 7 | `screens/AdminDashboard.tsx` | Uses `auth.admin.getUserById()` (needs service_role key) | Admin panel crashes — anon key can't call admin API | Replaced with profile-based email fallback |
| 8 | `components/InterceptorModal.tsx` | Hard-deletes ALL active schedules on dismiss | Destroys schedule history, loses audit trail | Changed to soft-deactivate (`is_active: false`) |

### Medium Bugs (Fixed)

| # | File | Bug | Impact | Fix |
|---|------|-----|--------|-----|
| 9 | `screens/Control.tsx` | `currentSlotRate` hardcoded to `7.42` | Wrong tariff rate shown to user | Computed from real `tariff_slots` data |
| 10 | `screens/Control.tsx` | 5-second polling interval | Battery drain, excessive DB queries | Reduced to 30 seconds |
| 11 | `screens/Home.tsx` | Progress bar hardcoded `w-[65%]` | Misleading visual — never reflects real usage | Computed from `monthBill / yearAverage` |
| 12 | `screens/Home.tsx` | 5-second polling | Same as Control.tsx | Reduced to 30 seconds |
| 13 | `screens/Insights.tsx` | Imports mock `ACTIVE_DEVICES_PREVIEW` | Shows fake device list instead of real ON appliances | Fetches real appliance state |
| 14 | `screens/Insights.tsx` | "On Track" badge always shows "On Track" | Never warns user they're over budget | Computed from `monthBill / (dailyAvgUsage * 30)` |
| 15 | `screens/Profile.tsx` | "3 New" notification badge hardcoded | User sees stale count | Queries real unread count from `notifications` table |
| 16 | `screens/Notifications.tsx` | Entire screen is 100% mock data | 10 hardcoded notifications, no DB connection | Rewrote with Supabase fetch, CRUD, realtime subscription |
| 17 | `App.tsx` | `as any` type casts on `handleNavigate` | Bypasses type safety | Removed casts |
| 18 | `services/api.ts` | Mock stubs misleadingly named as real API | Developers might import wrong toggle function | Added `@deprecated` warnings |

### Known Issues (Not Fixed — By Design)

| Issue | Reason |
|-------|--------|
| No JWT verification on backend | Development phase — will add before production |
| Razorpay is simulated | Intentional simulation for hackathon |
| RLS disabled | Development convenience — schema ready for RLS |
| No Celery/Redis for async tasks | Overkill for hackathon scope |
| Smart plug not connected | Physical plug not purchased yet — TuyaAdapter ready |
| Bill generation not implemented | Deferred — API structure exists |
| Smart meter data hardcoded | Utility hasn't provided real meter data yet |

---

## 3. Hardcoded Data Inventory

### What's Hardcoded & What Can Be Done

| Data Point | Location | Current Value | Strategy |
|------------|----------|---------------|----------|
| **Tariff rates** | `constants.tsx` `TARIFF_RATES` | Bihar ToD rates | ✅ Already DB-backed via `tariff_slots`. Constants used as fallback only |
| **Carbon intensity** | `constants.tsx` `HOURLY_CARBON` | 24-hour gCO₂/kWh profile | ✅ DB-backed via `carbon_hourly`. Seeded from Indian grid averages |
| **DISCOM list** | `constants.tsx` | BSPHCL only | Add to `discoms` table when multi-DISCOM needed |
| **Appliance defaults** | `constants.tsx` `APPLIANCE_DEFAULTS` | 8 appliance types + wattage | Move to `appliance_templates` table for admin control |
| **Daily usage** | `consumer_master` table | Seeded values | Replace with real meter data via `/api/meter/push` endpoint |
| **Monthly trends** | `consumer_master` | Seeded 12-month history | Will auto-populate once real meter data flows |
| **Region code** | `transition_watcher.py` | `"IN-BR"` (Bihar) | Pull from `consumer_master.discom_id` → `discoms.region_code` |
| **Grid status** | `grid_protection.py` | Simulated stable/unstable | Replace with DISCOM grid API when available |
| **Peak threshold** | `penalty_engine.py` | Config-driven | ✅ Already configurable via `autopilot_config` |

### Advice: Don't Change Hardcoded Data Now

For the hackathon demo, hardcoded seed data is **perfectly fine**. The architecture is the proof:
- Every hardcoded constant has a DB table ready to replace it
- The adapter pattern means swapping data sources requires zero UI changes
- Focus demo narrative on: "This works with seeded data today. When DISCOM provides API, we flip one config."

---

## 4. Scalability Assessment

### Current Architecture Limitations

| Concern | Risk Level | Details |
|---------|-----------|---------|
| **Frontend → Supabase direct** | Medium | 9 status mutations bypass backend. Fine for demo, not for production multi-tenancy |
| **APScheduler in-process** | Medium | All schedules in single Python process. Lost on restart (mitigated by `_restore_active_schedules()`) |
| **No rate limiting** | Low (demo) | Backend has no request throttling |
| **Single-region carbon data** | Low | Only IN-BR region supported. Table schema supports multi-region |
| **No caching layer** | Low | Every tariff lookup hits DB. Add Redis for production |

### What Scales Well

| Feature | Why |
|---------|-----|
| Penalty engine | Pure function — stateless, horizontally scalable |
| Tariff slot system | DB-driven, multi-DISCOM ready (keyed by `discom_id`) |
| Adapter pattern | `VirtualAdapter` / `TuyaAdapter` — add new OEMs without core changes |
| Realtime subscriptions | Supabase handles websocket scaling |
| NILM pipeline | Offline training → edge inference model. Scales per-device |

---

## 5. DISCOM / OEM Integration Readiness

### Architecture for Future Meter Data

```
Smart Meter → DISCOM API → /api/meter/push → consumer_master + appliance_usage
                                            ↓
                                    transition_watcher detects changes
                                            ↓
                                    penalty_engine recalculates
                                            ↓
                                    autopilot acts (if enabled)
```

**What exists:**
- `consumer_master` table with `daily_units`, `month_bill`, `year_average`
- `tariff_slots` table keyed by `discom_id`
- `discoms` reference table
- Backend `/api/meter/push` endpoint structure (needs implementation)
- Adapter pattern for device control (VirtualAdapter → TuyaAdapter → future OEM adapters)

**What's needed:**
1. `/api/meter/push` endpoint to receive DLMS/COSEM or MDMS data
2. Data normalization layer (meter reading → kWh → cost)
3. DISCOM authentication (API key / OAuth depending on provider)
4. Webhook receiver for real-time meter events

### OEM Integration Path

```
Physical Plug → Tuya Cloud API → TuyaAdapter → scheduler.py → appliance status
                                              ↘ transition_watcher monitors
```

- `TuyaAdapter` class exists with `turn_on()`, `turn_off()`, `get_status()` 
- Needs: Tuya developer credentials + physical device ID
- For other OEMs: Create `SonoffAdapter`, `ShellyAdapter` implementing same interface

---

## 6. NILM Pipeline Assessment

| Aspect | Status |
|--------|--------|
| **Architecture** | XGBoost regressors on spectral features (STD, P25, P75, RMS, ZCR, spectral centroid) |
| **Dataset** | iAWE (Indian Academic house dataset) |
| **Appliances** | 5 target: Fridge, AC, Washing Machine, Laptop, TV |
| **Edge Deployment** | Models converted to ONNX (5-50KB each) for ESP32/RPi |
| **Seq2Point** | Cloud CNN model also available for higher accuracy |
| **Integration** | NOT yet connected to main app — standalone pipeline |
| **Quality** | Well-structured preprocessing with oversampling fix for TV class |

**Recommendation:** For hackathon, show NILM as a separate demo + architecture diagram showing integration path. Don't try to wire it in last-minute.

---

## 7. Architecture Strengths

These are genuinely impressive for a hackathon project:

1. **Penalty Engine** — Multi-factor optimization (tariff cost + carbon + comfort + grid stability) with configurable weights. This is the core differentiator.

2. **ToD Tariff System** — Real Bihar BSPHCL tariff slots stored in DB, with transition detection that auto-triggers autopilot actions.

3. **Autopilot V2** — Three modes (Savings, Balanced, Comfort) with different penalty thresholds. Real scheduling via APScheduler.

4. **Adapter Pattern** — Clean abstraction between virtual devices and physical smart plugs. Adding a new OEM is one file.

5. **30+ SQL Tables** — Comprehensive schema covering profiles, appliances, schedules, tariffs, carbon data, notifications, rewards, bills, consumer master data.

6. **Realtime Subscriptions** — Supabase realtime for instant UI updates on appliance state changes.

7. **Interceptor Modal** — When user tries to turn on a device during peak hours, the app intercepts and suggests: defer, eco mode, or override with explicit cost warning.

---

## 8. Hackathon Scoring

### Scoring Breakdown (out of 100)

| Category | Weight | Score | Notes |
|----------|--------|-------|-------|
| **Problem Understanding** | 15% | 12/15 | Clear understanding of ToD tariff optimization, consumer pain |
| **Technical Implementation** | 25% | 18/25 | Penalty engine is excellent. Some mock screens, no real meter data |
| **Innovation** | 20% | 15/20 | Multi-factor penalty engine + carbon awareness is novel. NILM adds edge-AI angle |
| **Scalability & Architecture** | 15% | 11/15 | Good DB schema, adapter pattern. Frontend-direct mutations need backend migration |
| **Demo & UX** | 15% | 12/15 | Beautiful Tailwind UI, smooth animations, dark admin panel. Some screens still mock |
| **Business Viability** | 10% | 7/10 | Clear B2B2C model (DISCOM → consumer). Rewards/gamification planned |
| **TOTAL** | 100% | **75/100** | After bugfixes. Was ~68 before |

### Strengths That Score High
- Real penalty-based optimization (not just simple timers)
- Carbon-aware scheduling (unique differentiator)
- Beautiful, production-quality UI
- Comprehensive DB schema showing production thinking
- NILM pipeline showing edge-AI capability

### Areas That Lose Points
- No real smart meter data flowing through
- NILM not integrated into main app
- No live DISCOM API connection
- Some screens still had mock/hardcoded data (now fixed)
- No billing generation

---

## 9. What's Missing for Production

| Priority | Feature | Effort |
|----------|---------|--------|
| P0 | JWT verification on all backend routes | 1 day |
| P0 | RLS policies enabled | 1 day |
| P0 | Move 9 frontend status mutations to backend API | 2-3 days |
| P1 | Real meter data ingestion endpoint | 2 days |
| P1 | DISCOM API integration (BSPHCL) | 3-5 days (depends on API availability) |
| P1 | Bill generation from usage data | 2 days |
| P1 | Razorpay live integration | 1 day |
| P2 | Smart plug physical setup + Tuya credentials | 1 day |
| P2 | NILM integration (ONNX model → real appliance detection) | 3 days |
| P2 | Celery/Redis for async scheduling | 2 days |
| P3 | Multi-DISCOM support | 2 days (schema ready) |
| P3 | Admin panel: tariff management, user management | 3 days |

---

## 10. Recommendations

### For Hackathon Demo (Do Now)
1. ✅ All medium/high bugs fixed (this audit)
2. Prepare a clear demo narrative: "Seed data today → Real meter data tomorrow"
3. Show penalty engine in action: toggle an appliance during peak, watch the interceptor
4. Show autopilot: enable balanced mode, watch it defer a geyser
5. Show admin dashboard with multi-consumer view

### For Post-Hackathon (Next Week)
1. Implement `/api/meter/push` endpoint
2. Move frontend mutations to backend API calls
3. Enable RLS policies
4. Add JWT verification middleware
5. Connect Tuya smart plug

### For Production (1-2 Months)
1. DISCOM API integration
2. NILM model integration
3. Real billing with Razorpay
4. Celery + Redis for task queue
5. Multi-region deployment
6. Load testing with 1000+ consumers

---

## Files Changed in This Audit

| File | Changes |
|------|---------|
| `backend/app/routers/autopilot.py` | Added `await` on grid check, real peak tariff lookup |
| `backend/app/services/transition_watcher.py` | Fixed `region_code` NameError risk |
| `backend/app/services/scheduler_manager.py` | Fixed naive datetime to UTC |
| `backend/app/services/carbon.py` | Fixed dedup logic (last wins) |
| `services/supabase.ts` | Production-mode throw on missing env vars |
| `screens/Control.tsx` | Real tariff slot rate, 30s polling |
| `screens/Insights.tsx` | Real active devices, computed "On Track" badge |
| `screens/Profile.tsx` | Real unread notification count |
| `screens/Home.tsx` | Computed progress bar, 30s polling |
| `screens/Notifications.tsx` | Full Supabase integration with realtime |
| `screens/AdminDashboard.tsx` | Removed admin-only API call |
| `components/InterceptorModal.tsx` | Soft-deactivate schedules instead of hard-delete |
| `App.tsx` | Removed `as any` type casts |
| `services/api.ts` | Deprecated mock stubs with warnings |
