# VoltWise — Quick Navigation Index

## 🚀 Getting Started

**New to the codebase?** Start here:
1. Read: `CODEBASE_COMPLETE_OVERVIEW.md` (this folder) — 30 min overview
2. Read: `README.md` — Project mission
3. Read: `BACKEND_PLAN.md` — Architecture philosophy
4. Explore: `/screens/Home.tsx` — Start with the dashboard

---

## 📂 Finding Code by Feature

### 💰 Balance & Recharge
- **Frontend Display:** `screens/Home.tsx` (LiquidGauge component)
- **Database:** `sql/02_setup.sql` → `meters` table, `get_dashboard_stats()` RPC
- **Payment:** `components/RechargeModal.tsx` (Razorpay integration)

### 🔌 Appliance Control
- **Main Hub:** `screens/Control.tsx` (1215 lines — most complex screen)
- **Backend API:** `backend/app/routers/appliances.py` (toggle, schedule, eco-mode)
- **Device Adapters:** `backend/app/adapters/device.py` (Tuya + Virtual)
- **Database:** `sql/02_setup.sql` → `appliances` table
- **Interceptor Modal:** `components/InterceptorModal.tsx` (tariff decision UI)

### 📅 Scheduling
- **UI Picker:** `components/ScheduleModal.tsx`
- **Scheduler Backend:** `backend/app/services/scheduler.py` + `scheduler_manager.py`
- **Database:** `sql/02_setup.sql` → `schedules` table
- **Executor:** **[NEEDS IMPLEMENTATION]** — APScheduler callback at trigger time
- **Logging:** `sql/02_setup.sql` → `schedule_logs` table

### ⚡ Cost Optimization
- **UI & Alerts:** `screens/Optimizer.tsx`
- **Cost Math:** `utils/tariffOptimizer.ts` (core calculation engine)
- **Tariff Detection:** `utils/tariffOptimizer.ts` → `getSlotForHour()`
- **Database:** `sql/02_setup.sql` → `tariff_slots`, `tariff_plans`, `daily_aggregates`
- **Backend:** `backend/app/services/tariff_watcher.py` (1-min transition detector)

### 🌍 Carbon & Sustainability
- **Dashboard:** `screens/LivePower.tsx` (Insights tab)
- **Calculations:** `services/api.ts` → `fetchCarbonIntensities()`, `getCarbonDashboard()`
- **Database:** `sql/02_setup.sql` → `carbon_intensity_schedule` table
- **Emission Factors:** Hardcoded in `services/api.ts` L151-157 or in `carbon_intensity_schedule` table
- **Aggregation:** `backend/app/services/carbon.py` + nightly cron

### 🎮 Gamification
- **Achievements & Challenges:** `screens/Rewards.tsx`
- **Database:** `sql/02_setup.sql` → `achievements`, `challenges` tables
- **Backend:** Missing — needs cron to update progress

### 🤖 Autopilot (V1 & V2)
- **V1 (Rule-Based):** `backend/app/services/autopilot.py` (match_rules, apply_rule)
- **V2 (Penalty-Aware):** `backend/app/services/penalty_engine.py` + device configs
- **UI:** `screens/Control.tsx` → AutopilotPanel section
- **Database:** `sql/02_setup.sql` → `autopilot_rules`, `device_autopilot_configs`
- **Executor:** **[NEEDS IMPLEMENTATION]** — Integration with tariff_watcher

### 🔐 Authentication & Onboarding
- **Auth Flow:** `contexts/AppContext.tsx` (609 lines)
- **Onboarding Screen:** `screens/Onboarding.tsx` (consumer number lookup)
- **Database:** `sql/02_setup.sql` → `profiles`, `homes`, `meters`, `consumer_master`
- **JWT Handling:** `backend/app/routers/appliances.py` → `get_current_user()` dependency

### 👥 Admin Dashboard
- **Admin Panel:** `screens/AdminDashboard.tsx` (12 tabs)
- **User Management:** Tab 1 (view, edit, deactivate users)
- **Analytics:** Tab 2-8 (consumption trends, payment status, etc)
- **Database:** `sql/02_setup.sql` → `profiles` with role='admin' filter

### 🧠 AI Agents (NEW - Phase 1)
- **Architecture:** `AI_AGENTS_ARCHITECTURE.md` (600+ line design doc)
- **Agent Base Class:** `backend/app/agents/__init__.py` (500 lines)
- **Event Bus:** `backend/app/agents/message_bus.py` (280 lines)
- **HomeOrchestrator:** `backend/app/agents/home_orchestrator.py` (350 lines)
- **Manager:** `backend/app/agents/manager.py` (200 lines)
- **REST API:** `backend/app/routers/agents.py` (380 lines)
- **Database:** `sql/16_agents_setup.sql` (250 lines)
- **Examples:** `AGENTS_EXAMPLES.md` (5 runnable code samples)
- **Phase 2 Plan:** `AGENTS_IMPLEMENTATION_STATUS.md`

---

## 🗂️ Understanding the Tech Stack

### React Components
```
App.tsx (Router, View Mode)
├── Onboarding.tsx (First-time setup)
├── AdminDashboard.tsx (Admin-only)
└── Routes:
    ├── Home.tsx
    │   ├── LiquidGauge.tsx (Balance animation)
    │   ├── RechargeModal.tsx (Payment)
    │   └── ApplianceCard.tsx × N
    ├── LivePower.tsx (Insights - consumption)
    ├── Rewards.tsx (Gamification)
    ├── Control.tsx (Appliance hub)
    │   ├── InterceptorModal.tsx (Tariff intercept)
    │   ├── ScheduleModal.tsx (Time picker)
    │   └── AutopilotPanel (Rules & V2)
    ├── Optimizer.tsx (Cost saving)
    └── [Other screens...]
```

### Python Routers (REST API)
```
FastAPI App (main.py)
├── /api/appliances/* (routers/appliances.py)
│   ├── POST /toggle
│   ├── POST /schedule
│   ├── POST /eco-mode
│   └── DELETE /schedules/{id}
├── /api/autopilot/* (routers/autopilot.py)
│   ├── GET /status
│   ├── GET /rules
│   ├── POST /rules
│   └── POST /v2/simulate
├── /api/power-analytics/* (routers/power_analytics.py)
│   ├── GET /consumption
│   └── GET /trends
└── /api/agents/* (routers/agents.py)
    ├── GET /agents/home/{id}/status
    ├── POST /agents/home/{id}/trigger/{agent}
    ├── GET /agents/decisions
    └── PUT /agents/config
```

### Database Tables
```
auth.users (Supabase Auth)
├── profiles (user profile, role, consumer_number)
├── homes (home address, tariff_plan_id, autopilot settings)
├── meters (balance, recharge date, meter_number)
├── appliances (name, status, power, smart_plug_id, tier)
├── schedules (start_time, end_time, repeat_type, is_active)
├── tariff_plans (DISCOM, category, rates)
├── tariff_slots (hourly slots with rates & peak/normal/offpeak)
├── daily_aggregates (daily kWh, cost, carbon)
├── control_logs (action, source, device_source, timestamp)
├── autopilot_rules (condition, action, is_active)
├── device_autopilot_configs (autonomy_level, override_rate)
├── agent_decisions (decision, reasoning, confidence, executed)
├── agent_learning_profiles (acceptance_rate, flexibility)
├── discoms (DISCOM master list: SBPDCL, MGVCL, etc)
└── consumer_master (consumer_number lookup from DISCOM)
```

---

## 🔍 How to Find Something

### "I need to understand how toggles work"
1. Frontend toggle click → `screens/Control.tsx` line 171
2. InterceptorModal decision → `components/InterceptorModal.tsx`
3. Backend endpoint → `backend/app/routers/appliances.py` line 94
4. Adapter execution → `backend/app/adapters/device.py`
5. Database update → `sql/02_setup.sql` (appliances table)
6. Realtime sync → `screens/Home.tsx` line 184 (subscription)

### "I need to add a new tariff slot type"
1. Define ENUM → `sql/02_setup.sql` line ~93
2. Update TypeScript type → `types/database.ts` line ~94
3. Update seed data → `sql/04_seed_tariffs.sql`
4. Test in UI → `utils/tariffOptimizer.ts` (getSlotForHour)
5. Frontend display → `screens/Control.tsx` or `screens/Home.tsx`

### "I need to fix the schedule executor"
1. Create APScheduler job → `backend/app/services/scheduler.py`
2. Register callback → `backend/app/services/scheduler_manager.py`
3. Execute at trigger time → `backend/app/services/scheduler.py`
4. Update control_logs → Reference `backend/app/routers/appliances.py` for pattern
5. Test with manual trigger → Use `curl` or Postman to call `POST /api/appliances/{id}/toggle`

### "I need to integrate with Claude AI"
1. See architecture → `AI_AGENTS_ARCHITECTURE.md` (Phase 2 section)
2. Create LLM provider → `backend/app/agents/llm_provider.py` (template provided in docs)
3. Update HomeOrchestrator → `backend/app/agents/home_orchestrator.py` (swap heuristic for LLM call)
4. Deploy with API key → Set `ANTHROPIC_API_KEY` in `.env`
5. Test end-to-end → See `AGENTS_EXAMPLES.md` for manual test scenarios

---

## 📊 Data Flow Examples

### Example 1: User Toggles AC During Peak Tariff

```
User taps AC toggle in Control.tsx
  ↓
React state: setAppliances(...toggle AC status)
  ↓
Check: shouldIntercept() [peak + tier 1-2 = YES]
  ↓
Show InterceptorModal with 3 options:
  • "Run Now" (with warning)
  • "Eco Mode" (15% less power)
  • "Schedule for Cheaper" (suggest 6 AM slot)
  ↓
User chooses "Eco Mode"
  ↓
Frontend: POST /api/appliances/{ac_id}/toggle?eco=true
  ↓
Backend:
  1. Auth: Decode JWT
  2. Adapter: TuyaAdapter (has smart_plug_id)
  3. Call: adapter.turn_on() → Tuya Cloud API
  4. Update: appliances SET eco_mode_enabled=true
  5. Log: control_logs (action='eco_mode_on', source='manual')
  ↓
Supabase Realtime fires
  ↓
Home.tsx & Optimizer.tsx subscriptions re-fetch
  ↓
UI updates: AC shows "Eco Mode" badge, cost estimates recalculate
```

### Example 2: Autopilot Triggers During Peak (Future)

```
User enables autopilot with rule: "Turn off AC if peak hour + kWh > 15"
  ↓
Rule stored: autopilot_rules table
  ↓
APScheduler tariff_watcher fires (every 60 seconds)
  ↓
Check: current hour in peak (18-22)?
Check: total_kwh today > 15?
  ↓
YES → Fetch rule → Calculate action
  ↓
Post event to message bus: TARIFF_PEAK_DETECTED
  ↓
HomeOrchestrator subscribes → analyze()
  ↓
Score AC: flexibility=0.9, power_share=0.6, suggests "eco_mode"
  ↓
Create AgentDecision: { action: 'eco_mode', confidence: 0.85 }
  ↓
If confidence > 0.80 → Auto-execute
  Else → Show notification "AI recommends eco mode"
  ↓
If executed: control_logs entry (source='autopilot', agent='HomeOrchestrator')
```

### Example 3: Schedule Execution (Needs Implementation)

```
User schedules AC for 10 PM in ScheduleModal
  ↓
Frontend: ScheduleModal.handleSave()
  POST /api/appliances/{id}/schedule
    body: { start_time: "22:00", end_time: null, repeat_type: "once" }
  ↓
Backend:
  1. Insert: schedules table
  2. Create: APScheduler job (one-shot at 2024-MM-DD 22:00:00 IST)
  3. Return: { schedule_id, message }
  ↓
At 10 PM: APScheduler fires
  ↓
Callback: execute_schedule(schedule_id)
  1. Fetch schedule row
  2. Fetch appliance
  3. Check: Is appliance controllable?
  4. Call: adapter.turn_on()
  5. Update: appliances SET status='ON'
  6. Insert: schedule_logs (schedule_id, executed_at, action, result)
  ↓
Supabase Realtime fires
  ↓
Home.tsx subscription re-fetches
  ↓
UI updates: AC shows "ON" + runtime
  ↓
User sees it happened automatically ✓
```

---

## 🐛 Debugging Checklist

### Appliance not toggling?
- [ ] Check `appliances.is_controllable = true`
- [ ] Check JWT in Authorization header is valid (AppContext auth flow)
- [ ] Check `smart_plug_id` is set (Tuya) or NULL (virtual)
- [ ] Check Tuya API key in backend `.env`
- [ ] Check control_logs table for error message
- [ ] Verify Supabase Realtime subscription is connected (check browser console)

### Tariff slot not detecting?
- [ ] Verify tariff_slots exist: `SELECT * FROM tariff_slots WHERE plan_id = '...'`
- [ ] Check home.tariff_plan_id is set
- [ ] Test `getSlotForHour()` manually in browser console
- [ ] Verify slot boundary times (start_hour, end_hour) handle midnight correctly

### Schedule not firing?
- [ ] Check APScheduler is running (backend logs)
- [ ] Verify schedule row exists: `SELECT * FROM schedules WHERE id = '...'`
- [ ] Check APScheduler job store (if using DB) is writable
- [ ] Check schedule_logs for execution record
- [ ] Manually test with: `curl -X POST http://localhost:8000/api/appliances/{id}/toggle`

### Auth failing?
- [ ] Check `.env` SUPABASE_URL, SUPABASE_ANON_KEY (frontend), SUPABASE_SERVICE_ROLE_KEY (backend)
- [ ] Verify user exists: `SELECT * FROM auth.users WHERE email = '...'`
- [ ] Check profile created: `SELECT * FROM profiles WHERE id = '...'`
- [ ] Verify RLS policies: `SELECT * FROM information_schema.role_table_grants WHERE role_name = 'authenticated'`
- [ ] Check AppContext auth listener (browser console logs)

### Carbon calculation wrong?
- [ ] Verify carbon_intensity_schedule rows exist
- [ ] Check emission_factors in `services/api.ts` L151-157
- [ ] Test calculation: `daily_kwh × factor[slot_type] = daily_carbon`
- [ ] Verify daily_aggregates is populated (nightly cron)

---

## 📚 Documentation Map

| Document | Purpose | Read Time |
|----------|---------|-----------|
| `README.md` | Project mission, features, tech stack | 5 min |
| `CODEBASE_COMPLETE_OVERVIEW.md` | This folder — full code walkthrough | 30 min |
| `AUDIT.md` | Critical execution gaps analysis | 20 min |
| `BACKEND_PLAN.md` | Architecture philosophy & migration plan | 15 min |
| `AI_AGENTS_ARCHITECTURE.md` | AI orchestration design (Phase 1 complete, Phase 2 LLM) | 25 min |
| `AGENTS_QUICK_START.md` | Deploy agents in 5 steps | 10 min |
| `AGENTS_EXAMPLES.md` | 5 runnable agent code samples | 15 min |
| `AGENTS_VISUAL_GUIDE.md` | ASCII diagrams, data flows, scoring algorithm | 20 min |
| `database_schema.md` | Database structure summary | 10 min |
| `database_setup.md` | How to run migrations | 5 min |
| `api_endpoints.md` | REST API reference | 10 min |

---

## 🎯 Next Steps (Priority Order)

### 🔴 Critical (Blocks Demo)
1. **Implement Schedule Executor** (4-6 hours)
   - APScheduler callback in `backend/app/services/scheduler.py`
   - Hook into transition_watcher or standalone cron
   - Test with manual schedule creation

2. **Wire Tariff Transition Detection** (2-3 hours)
   - Enhance `transition_watcher()` to detect slot boundaries
   - Trigger autopilot rules or agent on transition
   - Test with manual time adjustment

3. **Implement Real Tuya Control** (3-4 hours)
   - Replace TuyaAdapter stub with real API calls
   - Test with demo smart plug
   - Add error handling & retry logic

### 🟡 High (Pre-Demo Polish)
4. **Wire Autopilot Execution** (3-4 hours)
   - Connect V1 rules to transition_watcher
   - Connect V2 configs to penalty engine
   - Test with various scenarios

5. **Add Notifications** (2-3 hours)
   - 15-min cron in APScheduler
   - Check: low balance, spike alert, peak warning
   - Create notifications table entries

6. **Integrate AI Agents** (1-2 weeks)
   - Implement `llm_provider.py` (Claude or Ollama)
   - Update HomeOrchestrator to call LLM
   - Create frontend AgentExplanation component
   - Test end-to-end

### 🟢 Medium (Post-Demo)
7. **Add Error Boundaries** (1-2 hours)
   - Wrap all screens with ErrorBoundary
   - Improve error messages

8. **Implement Offline Mode** (3-4 hours)
   - ServiceWorker or IndexedDB cache
   - Sync on reconnect

9. **Build Admin Monitoring** (4-6 hours)
   - Add agent decision dashboard
   - Show learning profiles
   - Monitor agent health

---

## 🚀 Quick Commands

### Frontend
```bash
cd /Users/apple/VOLTWISE
npm install
npm run dev          # Start dev server at http://localhost:5173
npm run build        # Build for production
npm run preview      # Preview production build
```

### Backend
```bash
cd /Users/apple/VOLTWISE/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000  # Start backend
```

### Database
```bash
# Run migration
psql $SUPABASE_DB_URL < sql/02_setup.sql

# Check tables
psql $SUPABASE_DB_URL -c "SELECT * FROM appliances LIMIT 5;"

# View RLS policies
psql $SUPABASE_DB_URL -c "SELECT * FROM pg_policies WHERE tablename = 'appliances';"
```

---

**Last Updated:** May 26, 2026  
**Created By:** Development Assistant  
**Purpose:** Complete codebase reference for onboarding & development
