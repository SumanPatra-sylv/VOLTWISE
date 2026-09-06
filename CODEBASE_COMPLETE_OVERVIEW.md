# VoltWise — Complete Codebase Overview

**Generated:** May 26, 2026  
**Project Status:** Smart energy management system with AI-powered optimization (Pre-Demo)  
**Tech Stack:** React 19 + TypeScript + Vite (Frontend) | Python FastAPI + Supabase (Backend)

---

## Table of Contents

1. [Project Architecture](#project-architecture)
2. [Frontend Structure](#frontend-structure)
3. [Backend Structure](#backend-structure)
4. [Database Schema](#database-schema)
5. [Key Services & Features](#key-services--features)
6. [File Inventory](#file-inventory)
7. [Critical Implementation Details](#critical-implementation-details)
8. [Known Issues & Gaps](#known-issues--gaps)

---

## Project Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    VoltWise Application                          │
│                                                                  │
│  ┌─────────────────────────┐      ┌──────────────────────────┐  │
│  │   FRONTEND (React)      │      │  BACKEND (FastAPI)       │  │
│  │                         │      │                          │  │
│  │  • Dashboard (Home)     │◄────►│  • REST API             │  │
│  │  • Control Center       │      │  • APScheduler          │  │
│  │  • Optimizer            │      │  • Device Adapters      │  │
│  │  • Rewards & Analytics  │      │  • Tariff Watcher       │  │
│  │  • Admin Dashboard      │      │  • Carbon Calculator    │  │
│  │                         │      │                          │  │
│  └────────────┬────────────┘      └────────────┬─────────────┘  │
│               │                                │                 │
│               └────────────────┬───────────────┘                 │
│                                │                                 │
│                    ┌───────────▼────────────┐                    │
│                    │  Supabase (PostgreSQL) │                    │
│                    │                        │                    │
│                    │  • appliances          │                    │
│                    │  • schedules           │                    │
│                    │  • tariff_plans        │                    │
│                    │  • profiles & homes    │                    │
│                    │  • daily_aggregates    │                    │
│                    │  • control_logs        │                    │
│                    │                        │                    │
│                    └────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Framer Motion, Recharts, Lucide Icons |
| **Backend** | Python 3.11, FastAPI, APScheduler, Supabase (async), Pydantic |
| **Database** | PostgreSQL (Supabase), Row-Level Security (RLS) enabled |
| **IoT/Hardware** | Tuya Smart Plug API (optional), Virtual adapter pattern |
| **ML/Analytics** | XGBoost NILM models, Carbon intensity calculations |
| **DevOps** | Netlify (frontend), Python runtime (backend) |

---

## Frontend Structure

### Directory Layout

```
frontend/
├── App.tsx                 # Main router, view mode switcher, bottom nav
├── index.tsx               # React entry point
├── index.html              # HTML template with Razorpay checkout
├── index.css               # Global styles
├── App.tsx
├── constants.tsx           # Dashboard stats, mock data, tariff rates
├── types.ts                # Global TypeScript types (Tab, Appliance, etc)
├── contexts/
│   └── AppContext.tsx      # Auth state, view mode, user data
├── components/
│   ├── ApplianceCard.tsx   # Reusable appliance display card
│   ├── ErrorBoundary.tsx   # React error catcher
│   ├── InterceptorModal.tsx # Tariff intercept overlay (Run Now / Eco Mode / Schedule)
│   ├── LiquidGauge.tsx     # Circular balance gauge animation
│   ├── RechargeModal.tsx   # Recharge modal (Razorpay integration)
│   ├── ScheduleModal.tsx   # Time picker for scheduling appliances
│   └── VoiceAssistant.tsx  # Voice input interface
├── screens/
│   ├── Home.tsx            # Dashboard, balance, quick toggle, alerts
│   ├── LivePower.tsx       # (Insights) Consumption breakdown & trends
│   ├── Rewards.tsx         # Gamification, achievements, challenges
│   ├── Control.tsx         # Central appliance control hub (1215 lines)
│   ├── Profile.tsx         # User profile, settings, navigation
│   ├── Optimizer.tsx       # Peak tariff cost optimization recommendations
│   ├── SmartPlugSetup.tsx  # Tuya plug discovery & onboarding
│   ├── BillHistory.tsx     # Bill visualization & trends
│   ├── Notifications.tsx   # Alert center
│   ├── Onboarding.tsx      # Consumer number lookup, first-time setup
│   ├── AdminDashboard.tsx  # Admin-only stats & monitoring (12 tabs)
│   └── TariffOptimizer.tsx # (Deprecated)
├── services/
│   ├── api.ts              # Dashboard RPC calls, carbon calculations
│   ├── backend.ts          # Backend API client (appliances, autopilot, etc)
│   └── supabase.ts         # Supabase client initialization
├── hooks/
│   └── useApi.ts           # Generic useApi + useMutation hooks
├── utils/
│   └── tariffOptimizer.ts  # Core: cost calculation, slot detection, optimization
├── types/
│   └── database.ts         # Database row types (DBProfile, DBHome, etc)
├── sql/                    # Database migrations
│   ├── 00-14_*.sql         # Schema, setup, RLS policies
│   ├── 15_*.sql            # (Future) Additional migrations
│   └── README.md
├── public/                 # Static assets (favicons, images)
├── tailwind.config.js      # Tailwind CSS configuration
├── postcss.config.js       # PostCSS (Autoprefixer)
├── tsconfig.json           # TypeScript configuration
├── vite.config.ts          # Vite bundler config
├── package.json            # Dependencies & build scripts
└── README.md
```

### Key Component Flow

```
App
├── AuthCheck (redirect if not onboarded)
├── BottomNav (5 main tabs)
└── Routes:
    ├── / → Home (dashboard)
    │   ├── LiquidGauge (balance)
    │   ├── RechargeModal (payment)
    │   └── ApplianceCard × N
    ├── /insights → LivePower (trends & breakdown)
    ├── /rewards → Rewards (gamification)
    ├── /control → Control (appliance hub)
    │   ├── InterceptorModal (tariff intercept)
    │   ├── ScheduleModal (time picker)
    │   └── AutopilotPanel (V2 engine)
    ├── /profile → Profile (settings)
    ├── /optimizer → Optimizer (cost saving)
    └── [Other routes...]
```

### State Management

**AppContext.tsx** — Centralized global state:
- `user` — Supabase Auth session
- `profile` — User profile (role, name, phone, onboarding_done)
- `home` — Primary home record
- `meter` — Active meter (balance, recharge date)
- `viewMode` — Desktop preview mode (mobile/tablet/web)

**Component-Level State:**
- Screen components use `useState` for local UI state
- Data fetching via `useApi()` hook with loading/error states
- Supabase Realtime subscriptions for live sync

---

## Backend Structure

### Directory Layout

```
backend/
├── main.py                    # FastAPI entry point, APScheduler setup
├── requirements.txt           # Python dependencies
├── .env                       # Secrets (Supabase keys, Tuya credentials)
└── app/
    ├── __init__.py
    ├── config.py              # Pydantic settings (env vars)
    ├── database.py            # Supabase client initialization
    ├── adapters/
    │   ├── __init__.py
    │   └── device.py          # Abstract adapter, TuyaAdapter, VirtualAdapter
    ├── routers/
    │   ├── __init__.py
    │   ├── appliances.py      # POST /toggle, /schedule, /eco-mode
    │   ├── autopilot.py       # Autopilot V1 & V2 endpoints
    │   ├── power_analytics.py # Analytics queries
    │   └── agents.py          # (NEW) AI agent orchestration endpoints
    ├── services/
    │   ├── __init__.py
    │   ├── autopilot.py       # Autopilot core logic (rule matching, simulation)
    │   ├── carbon.py          # Carbon intensity, emission calculations
    │   ├── grid_protection.py # Grid stress detection & enforcement
    │   ├── nilm_service.py    # NILM model inference (power prediction)
    │   ├── penalty_engine.py  # ToU penalty calculation
    │   ├── scheduler.py       # APScheduler job creation
    │   ├── scheduler_manager.py # APScheduler singleton
    │   ├── tariff_watcher.py  # Tariff transition watcher (1-min cron)
    │   ├── transition_watcher.py # Primary cron (tariff + carbon + grid)
    │   └── llm_provider.py    # (Phase 2) Claude/Ollama integration
    └── agents/                # (NEW) AI orchestration system
        ├── __init__.py        # Agent base class, AgentDecision
        ├── message_bus.py     # Event pub/sub system (16+ event types)
        ├── home_orchestrator.py # HomeOrchestrator agent (primary)
        ├── manager.py         # AgentManager singleton
        └── [future agents]
```

### Core Files

#### main.py (150 lines)
- **Purpose:** FastAPI application entry point
- **Key Functions:**
  - `lifespan()` — Startup/shutdown lifecycle
  - `_verify_db_access()` — DB permission check
  - APScheduler initialization with 3 jobs:
    - Tariff transition watcher (60s interval)
    - (Other jobs to be added)
- **Middleware:** CORS enabled for frontend dev + production

#### config.py (40 lines)
- **Settings class:** Loads .env variables
- **Key vars:** Supabase URL/key, Tuya API credentials, port, CORS origins, timezone
- **Validation:** JWT role check to prevent anon key in backend

#### database.py (60 lines)
- **Supabase client:** Creates admin client using SERVICE_ROLE_KEY
- **JWT validation:** Ensures service_role (not anon)
- **Error handling:** Detailed error messages if credentials are wrong

#### adapters/device.py (200 lines)
- **DeviceAdapter ABC:** Base class with `turn_on()`, `turn_off()`, `set_eco_mode()`
- **TuyaAdapter:** Calls Tuya Cloud API, updates DB, logs control
- **VirtualAdapter:** No hardware call, just DB + logging (for demo appliances)
- **Factory function:** `get_adapter()` chooses based on `smart_plug_id`

#### routers/appliances.py (384 lines)
- **Endpoints:**
  - `POST /api/appliances/{id}/toggle` — Turn on/off via adapter
  - `POST /api/appliances/{id}/schedule` — Create schedule + register APScheduler job
  - `POST /api/appliances/{id}/eco-mode` — Enable/disable eco mode
  - `DELETE /api/schedules/{id}` — Cancel schedule
  - `POST /api/optimizer/execute` — Batch turn-off during peak
- **Auth:** JWT extraction from Authorization header
- **Logging:** All actions logged to `control_logs` table

#### routers/autopilot.py (Variable lines)
- **Autopilot V1 endpoints:**
  - `GET /autopilot/status` — Current autopilot state
  - `GET /autopilot/rules` — All rules for home
  - `POST /autopilot/rules` — Create new rule
  - `PUT /autopilot/rules/{id}` — Update rule
  - `DELETE /autopilot/rules/{id}` — Delete rule
- **Autopilot V2 endpoints:**
  - `POST /autopilot/v2/simulate` — Dry-run recommendation
  - `POST /autopilot/v2/device-configs` — Per-device settings
  - `GET /autopilot/v2/penalty-timeline` — Predicted penalties

#### services/tariff_watcher.py
- **Function:** `tariff_transition_watcher()`
- **Trigger:** Every 60 seconds (APScheduler)
- **Logic:**
  1. Fetch active homes with autopilot enabled
  2. Check current tariff slot (via `getSlotForHour()` logic)
  3. Detect transitions (peak start, off-peak start)
  4. If transition detected, publish `TARIFF_PEAK_DETECTED` event
  5. Trigger HomeOrchestrator agent to analyze
- **Failure mode:** Logs error, continues polling

#### services/autopilot.py
- **Core logic:** Rule matching, appliance scoring, simulation
- **Functions:**
  - `match_rules()` — Find applicable rules for time + conditions
  - `score_appliance()` — Calculate flexibility score (0-1)
  - `simulate_action()` — Dry-run an appliance action, predict outcome
  - `calculate_penalty()` — ToU penalty if action taken

#### agents/ (NEW - Phase 1)
- **__init__.py:** Agent base class, AgentDecision model, audit trail
- **message_bus.py:** EventType enum, MessageBus pub/sub, event history
- **home_orchestrator.py:** Primary agent, appliance scoring, heuristic → LLM-ready
- **manager.py:** AgentManager singleton for per-home instance management
- See **AI_AGENTS_ARCHITECTURE.md** for full details

---

## Database Schema

### Core Tables

#### profiles
```sql
id: UUID PRIMARY KEY (from auth.users)
role: ENUM ('consumer', 'admin', 'super_admin')
name: TEXT
phone: TEXT
consumer_number: TEXT UNIQUE (from DISCOM master)
avatar_url: TEXT
location: TEXT
household_members: INT
onboarding_done: BOOLEAN
created_at: TIMESTAMP
updated_at: TIMESTAMP
```

#### homes
```sql
id: UUID PRIMARY KEY
user_id: UUID FK → profiles.id
name: TEXT ('My Home')
address, city, state, pincode: TEXT
feeder_id, area: TEXT
tariff_category: ENUM ('residential', 'commercial', 'industrial', 'agricultural')
tariff_plan_id: UUID FK → tariff_plans.id
discom_id: UUID FK → discoms.id
sanctioned_load_kw: DECIMAL
autopilot_enabled: BOOLEAN
autopilot_strategy: ENUM ('economic', 'comfort', 'balanced', 'eco')
grid_protection_enabled: BOOLEAN
is_primary: BOOLEAN
created_at, updated_at: TIMESTAMP
```

#### appliances
```sql
id: UUID PRIMARY KEY
home_id: UUID FK → homes.id
name: TEXT ('AC - Living Room')
category: ENUM ('ac', 'geyser', 'refrigerator', 'washing_machine', 'fan', 'tv', 'lighting', 'other')
status: ENUM ('ON', 'OFF', 'SCHEDULED', 'WARNING')
rated_power_w: INT (1200 for AC, 2000 for geyser)
smart_plug_id: TEXT (Tuya device ID, NULL for virtual)
is_controllable: BOOLEAN (true if smart plug or virtual)
is_active: BOOLEAN
eco_mode_enabled: BOOLEAN
optimization_tier: ENUM ('tier_1_critical', 'tier_2_heavy', 'tier_3_comfort')
sort_order: INT
created_at, updated_at: TIMESTAMP
```

#### schedules
```sql
id: UUID PRIMARY KEY
appliance_id: UUID FK → appliances.id
home_id: UUID FK → homes.id
start_time: TIME ('22:00' for 10 PM)
end_time: TIME (NULL = let-it-run)
repeat_type: ENUM ('once', 'daily', 'weekdays', 'weekends', 'custom')
custom_days: INT[] (for repeat_type='custom')
is_active: BOOLEAN
created_by: TEXT ('manual' or 'autopilot')
created_at, updated_at: TIMESTAMP
```

#### tariff_plans
```sql
id: UUID PRIMARY KEY
discom_id: UUID FK → discoms.id
name: TEXT ('SBPDCL Residential 2024')
state: TEXT
category: ENUM ('residential', ...)
fixed_charge_per_kw: DECIMAL
is_active: BOOLEAN
effective_from, effective_to: DATE
created_at, updated_at: TIMESTAMP
```

#### tariff_slots
```sql
id: UUID PRIMARY KEY
plan_id: UUID FK → tariff_plans.id
hour_label: TEXT ('10 PM - 6 AM')
start_hour: INT (22)
end_hour: INT (6, wraps midnight)
rate: DECIMAL (6.31 ₹/kWh)
slot_type: ENUM ('off-peak', 'normal', 'peak')
```

#### daily_aggregates
```sql
id: UUID PRIMARY KEY
home_id: UUID FK → homes.id
date: DATE
total_kwh: DECIMAL
peak_kwh, normal_kwh, offpeak_kwh: DECIMAL
carbon_kg: DECIMAL
cost: DECIMAL
```

#### control_logs
```sql
id: UUID PRIMARY KEY
appliance_id: UUID FK → appliances.id
home_id: UUID FK → homes.id
action: TEXT ('turn_on', 'turn_off', 'eco_mode_on')
source: ENUM ('manual', 'schedule', 'autopilot', 'optimizer')
source_name: TEXT ('HomeOrchestrator', 'User')
device_source: ENUM ('tuya', 'virtual')
new_status: TEXT
result: JSON ({ success: bool, message: string })
cost_delta: DECIMAL
created_by: TEXT (user_id or 'system')
created_at: TIMESTAMP
```

#### autopilot_rules (V1)
```sql
id: UUID PRIMARY KEY
home_id: UUID FK → homes.id
name: TEXT ('Turn off AC during peak')
condition: JSON ({ hour_range, peak_only, kwh_threshold })
action: JSON ({ appliance_ids, action, eco_mode })
is_active: BOOLEAN
created_at, updated_at: TIMESTAMP
```

#### device_autopilot_configs (V2)
```sql
id: UUID PRIMARY KEY
home_id: UUID FK → homes.id
appliance_id: UUID FK → appliances.id
autonomy_level: ENUM ('manual', 'suggest', 'enforce')
override_rate: DECIMAL (user acceptance rate for suggestions)
preferred_run_window: TEXT ('6-10 AM')
created_at, updated_at: TIMESTAMP
```

#### agent_decisions (NEW - Phase 1)
```sql
id: UUID PRIMARY KEY
home_id: UUID FK → homes.id
agent_name: TEXT ('HomeOrchestrator')
decision: JSON ({ action, appliances, reasoning })
confidence: DECIMAL (0.0-1.0)
executed: BOOLEAN
user_accepted: BOOLEAN (NULL = not shown, true/false = feedback)
feedback_reason: TEXT
created_at: TIMESTAMP
```

#### agent_learning_profiles (NEW - Phase 1)
```sql
id: UUID PRIMARY KEY
home_id: UUID FK → homes.id
agent_name: TEXT
acceptance_rate: DECIMAL (user feedback positive rate)
appliance_flexibility: JSON ({ appliance_id: flexibility_score })
autonomy_level: ENUM ('low', 'medium', 'high')
created_at, updated_at: TIMESTAMP
```

---

## Key Services & Features

### 1. **Dashboard & Real-Time Metrics** (Home.tsx)

**What it shows:**
- Balance gauge (liquid fill animation)
- Today's cost, kWh, current load
- Month forecast & savings
- Current tariff rate (ToD slot)
- Active appliances quick toggle
- Optimization alert (if peak + heavy appliances on)

**Data Flow:**
1. `Home.tsx` calls `getDashboardStats(home.id)` (RPC)
2. Backend RPC aggregates: balance, daily cost, activeDevices count
3. Appliances fetched from `appliances` table
4. Realtime subscription syncs appliance status from Control
5. UI updates optimistically on toggle

**Cost Calculation:**
- Base: (rated_power_W / 1000) × current_slot_rate × hours
- Multi-slot: breaks time span into slots, calculates per slot
- Eco mode: reduces effective power by 15%

### 2. **Appliance Control Hub** (Control.tsx)

**Core functionality:**
- Add/edit/delete appliances
- Toggle ON/OFF with Tariff Interceptor
- Schedule future runs
- Eco mode toggle
- Autopilot V1 (rule-based) & V2 (penalty tracking)

**Tariff Interceptor Flow:**
```
User clicks toggle button
  ↓
shouldIntercept() checks:
  • Is current hour peak?
  • Is appliance tier 1-2 (heavy)?
  ↓
YES → Show InterceptorModal:
  • Run Now (with warning)
  • Eco Mode (-15% power)
  • Schedule for Cheaper Slot
  ↓
User chooses → Execute action
```

**Appliance Tiers:**
- `tier_1_critical` — AC, geyser (>1000W)
- `tier_2_heavy` — Washing machine, heater (500-1000W)
- `tier_3_comfort` — Fan, lights (<500W)

### 3. **Tariff Optimizer** (Optimizer.tsx)

**Shows:**
- Which appliances are running during peak
- Estimated hourly savings if turned off/delayed/eco
- Batch "Turn Off All" button
- NextCheaper slot recommendation

**Calculation:**
```
For each ON appliance in peak:
  hourly_cost_now = (W / 1000) × peak_rate × hours
  hourly_cost_cheaper = (W / 1000) × offpeak_rate × hours
  savings = hourly_cost_now - hourly_cost_cheaper
  ↓
Total savings = SUM all appliances
```

### 4. **Schedule Execution** (APScheduler + Backend)

**Flow:**
1. User opens ScheduleModal, picks time (e.g., 10 PM)
2. Frontend calculates: cost at 10 PM, next cheaper, etc.
3. User confirms → `POST /api/appliances/{id}/schedule`
4. Backend:
   - Creates `schedules` row
   - Registers APScheduler job (one-shot at exact time)
   - Returns confirmation
5. At 10 PM: APScheduler fires job → calls adapter → updates DB → realtime sync

**Important:** Currently the schedule executor doesn't exist in frontend. It's pure backend async.

### 5. **Autopilot** (V1 & V2)

#### V1 (Rule-Based)
```
Condition: { hour_range: '18-22', peak_only: true, kwh_threshold: 15 }
Action: { appliance_ids: ['ac-1'], action: 'turn_off', eco_mode: false }
  ↓
If current hour in [18-22] AND total kWh today > 15 → Auto turn off AC
```

#### V2 (Penalty Tracking)
```dont 
For each appliance: Calculate penalty if turned off during peak
Example: ToU contract penalizes 2 rupees if AC off during 6-10 PM
  ↓
Agent weighs: Cost saved vs penalty incurred
  ↓
Suggestion: "Wait 1 hour for penalty reset, then turn off AC"
```

### 6. **Carbon Dashboard** (Insights.tsx)

**Shows:**
- Monthly CO₂ emitted (kg)
- Per capita (kg / household_members)
- CO₂ avoided via optimization
- Neighbor comparison
- Tree equivalents

**Calculation:**
```
daily_kwh × emission_factor[slot_type] = daily_carbon
  where emission_factor:
    peak: 0.90 kg CO₂/kWh (more thermal)
    normal: 0.82 kg CO₂/kWh
    offpeak: 0.75 kg CO₂/kWh (more renewables)

monthly_carbon = SUM daily_carbon
per_capita = monthly_carbon / household_members
trees_saved = co2_kg / 21 (1 tree absorbs ~21 kg CO₂/year)
```

### 7. **AI Agent Orchestration** (NEW - Phase 1)

**Purpose:** Intelligent appliance control with user feedback learning

**HomeOrchestrator Agent Flow:**
1. Receives context: current tariff slot, appliances, home configuration
2. Analyzes: Scores appliances by flexibility + power share
3. Generates reasoning: "AC using 60% of peak hours power, flexible to eco mode"
4. Returns AgentDecision: { action, appliances[], confidence, reasoning }
5. If confidence > threshold: Auto-execute → else: Show to user for confirmation
6. Records: feedback (accepted/rejected) → updates learning profile

**Key Files:**
- `backend/app/agents/__init__.py` — Agent base class (500 lines)
- `backend/app/agents/message_bus.py` — Event pub/sub (280 lines)
- `backend/app/agents/home_orchestrator.py` — Orchestrator implementation (350 lines)
- `backend/app/agents/manager.py` — Agent lifecycle (200 lines)
- `backend/app/routers/agents.py` — REST API (380 lines)
- `sql/16_agents_setup.sql` — Database schema (250 lines)

**Phase 2 Upgrade (Planned):**
- Replace heuristic scoring with Claude/GPT-4 LLM
- Create additional agents: TariffStrategy, CarbonOptimizer, GridProtection
- Frontend AgentExplanation component for decision transparency

---

## File Inventory

### Frontend Files (56 files)

**Root Config:**
- `package.json` — Dependencies (React 19, Tailwind, Recharts, Framer Motion)
- `tsconfig.json` — TypeScript strict mode
- `vite.config.ts` — Vite bundler setup
- `tailwind.config.js`, `postcss.config.js` — CSS pipeline
- `index.html` — HTML template with Razorpay script

**Source Code:**
- `App.tsx` (241 lines) — Main router, view mode switcher, bottom nav
- `index.tsx` (15 lines) — React entry, AppProvider wrapper
- `constants.tsx` (137 lines) — Dashboard stats, mock data fallbacks
- `types.ts` (47 lines) — Global type definitions
- `index.css` — Global styles, animations

**Contexts:**
- `contexts/AppContext.tsx` (609 lines) — Auth state, user data, device loading

**Components:**
- `components/ApplianceCard.tsx` — Appliance display card
- `components/ErrorBoundary.tsx` — React error catcher
- `components/InterceptorModal.tsx` — Tariff intercept overlay
- `components/LiquidGauge.tsx` — Balance gauge animation
- `components/RechargeModal.tsx` — Payment modal (Razorpay)
- `components/ScheduleModal.tsx` — Time picker UI
- `components/VoiceAssistant.tsx` — Voice input interface

**Screens (10 main screens):**
- `screens/Home.tsx` (490 lines) — Dashboard
- `screens/Control.tsx` (1215 lines) — Appliance hub
- `screens/Optimizer.tsx` — Peak cost optimization
- `screens/LivePower.tsx` (Insights) — Consumption breakdown
- `screens/Rewards.tsx` — Gamification
- `screens/Profile.tsx` — User settings
- `screens/SmartPlugSetup.tsx` — Tuya onboarding
- `screens/BillHistory.tsx` — Bill visualization
- `screens/Notifications.tsx` — Alert center
- `screens/AdminDashboard.tsx` — Admin panel (12 tabs)
- `screens/Onboarding.tsx` — First-time setup

**Services:**
- `services/api.ts` (473 lines) — RPC calls, carbon calculations
- `services/backend.ts` — Backend API client
- `services/supabase.ts` (20 lines) — Supabase client init

**Utilities:**
- `utils/tariffOptimizer.ts` (400+ lines) — Core cost calculation
- `hooks/useApi.ts` (50 lines) — Generic API hooks
- `types/database.ts` (267 lines) — Database row types

### Backend Files (20 files)

**Root:**
- `main.py` (150 lines) — FastAPI entry, APScheduler
- `requirements.txt` — Python dependencies

**Config:**
- `app/config.py` (40 lines) — Pydantic settings
- `app/database.py` (60 lines) — Supabase client
- `app/__init__.py` — Package marker

**Adapters:**
- `app/adapters/device.py` (200 lines) — TuyaAdapter, VirtualAdapter
- `app/adapters/__init__.py` — Factory function

**Routers (API Endpoints):**
- `app/routers/appliances.py` (384 lines) — /toggle, /schedule, /eco-mode
- `app/routers/autopilot.py` (400+ lines) — /status, /rules, /simulate
- `app/routers/power_analytics.py` — /consumption, /trends
- `app/routers/agents.py` (380 lines) — Agent control endpoints

**Services:**
- `app/services/autopilot.py` — Rule matching, simulation
- `app/services/carbon.py` — Carbon intensity, emission factors
- `app/services/grid_protection.py` — Grid stress enforcement
- `app/services/nilm_service.py` — NILM model inference
- `app/services/penalty_engine.py` — ToU penalty calculation
- `app/services/scheduler.py` — APScheduler job creation
- `app/services/scheduler_manager.py` — APScheduler singleton
- `app/services/tariff_watcher.py` — 1-min tariff transition cron
- `app/services/transition_watcher.py` — Primary cron entry point

**Agents (NEW):**
- `app/agents/__init__.py` (500 lines) — Agent base class, AgentDecision
- `app/agents/message_bus.py` (280 lines) — Event pub/sub
- `app/agents/home_orchestrator.py` (350 lines) — Orchestrator agent
- `app/agents/manager.py` (200 lines) — Agent lifecycle mgmt

### Database Migrations (16 files)

- `sql/00_disable_rls.sql` — Disable RLS (dev setup)
- `sql/01_reset.sql` — Drop all tables
- `sql/02_setup.sql` (2000+ lines) — Complete schema + RPC functions
- `sql/03_rls.sql` — Enable RLS policies
- `sql/04_seed_tariffs.sql` — Insert SBPDCL/MGVCL tariff data
- `sql/05_consumer_master.sql` — Consumer master data
- `sql/06_seed_usage.sql` — Mock usage data
- `sql/07_migration.sql` — Schema updates
- `sql/08_create_admin.sql` — Admin user setup
- `sql/09_migration_optimization.sql` — Index creation
- `sql/09_technicians.sql` — Technician user role
- `sql/10_admin_enhancements.sql` — Admin panel features
- `sql/10_grant_service_role.sql` — SERVICE_ROLE_KEY permissions
- `sql/11_enable_realtime.sql` — Supabase Realtime subscriptions
- `sql/12_autopilot_migration.sql` — Autopilot V1 schema
- `sql/13_autopilot_v2_migration.sql` — Autopilot V2 schema
- `sql/14_seed_carbon_and_trends.sql` — Carbon intensity data
- `sql/16_agents_setup.sql` (250 lines) — Agent tables (NEW)

### Documentation (10 files)

- `README.md` — Project overview
- `AUDIT.md` (600+ lines) — Full codebase audit findings
- `BACKEND_PLAN.md` (430 lines) — Backend architecture proposal
- `APPLIANCE_HANDOFF.md` — Appliance data structure
- `TEAM_SETUP.md` — Team environment setup
- `adminside.md` — Admin features
- `userside.md` — User features
- `database_schema.md` — Database structure
- `database_setup.md` — Setup instructions
- `api_endpoints.md` — API documentation

**AI Agents Documentation (NEW):**
- `AI_AGENTS_ARCHITECTURE.md` (600+ lines) — Design spec
- `AGENTS_QUICK_START.md` (350 lines) — Deployment guide
- `AGENTS_EXAMPLES.md` (400 lines) — Code examples
- `AGENTS_IMPLEMENTATION_STATUS.md` (300 lines) — Roadmap
- `AGENTS_VISUAL_GUIDE.md` (500+ lines) — Diagrams & flows
- `AGENTS_SUMMARY.md` (400 lines) — Executive summary

### ML/NILM Files

- `nilm-project/README.md` — NILM project overview
- `nilm-project/scripts/` — Data processing, model training
- `nilm-project/models/edge/` — XGBoost edge models
- `nilm-project/seq2point_cloud/` — Seq2Point cloud training

---

## Critical Implementation Details

### 1. **Authentication Flow**

```
User enters email + password
  ↓
Supabase.auth.signUp() / signIn()
  ↓
Session stored in localStorage (Supabase SDK auto-handles)
  ↓
AppContext.useEffect listens for auth state changes
  ↓
On login:
  • Fetch profile from profiles table
  • If onboarded: fetch home + meter
  • If not onboarded: show Onboarding screen
  ↓
Frontend sends JWT in Authorization header to backend
Backend decodes JWT locally (no network call) to extract user_id
```

### 2. **Tariff Slot Detection**

```
Frontend (React):
  • Fetch tariff_slots for home's tariff_plan
  • getSlotForHour(new Date().getHours(), slots)
  • Handles midnight crossing (22→6)
  • Returns: { start_hour, end_hour, rate, slot_type }
  • Used for: UI display, InterceptorModal decision

Backend (APScheduler):
  • tariff_transition_watcher() runs every 60 seconds
  • Detects when hour boundary crossed into different slot
  • Publishes TARIFF_PEAK_DETECTED event to message bus
  • HomeOrchestrator subscribes → analyzes
```

### 3. **Appliance Control Pipeline**

```
Frontend: User clicks toggle
  ↓
Check interceptor condition:
  shouldIntercept(appliance, tariff_slots, current_hour)
  ↓
If intercept needed:
  • Show modal (Run Now / Eco / Schedule)
  • Wait for user choice
  ↓
If no intercept or user chose "Run Now":
  POST /api/appliances/{id}/toggle
    ↓
Backend:
  • Auth: Decode JWT → extract user_id
  • Adapter: TuyaAdapter or VirtualAdapter
  • Execute: adapter.turn_on() / turn_off()
    ├─ TuyaAdapter: Call Tuya Cloud API
    └─ VirtualAdapter: DB status only
  • Update: appliances.status in DB
  • Log: control_logs row
  • Return: result to frontend
    ↓
Frontend:
  • Supabase Realtime fires → appliance updated
  • UI syncs automatically
```

### 4. **Schedule Execution**

**Missing today — needs to be built:**

```
User creates schedule for 10 PM
  ↓
Frontend: ScheduleModal.handleSave()
  POST /api/appliances/{id}/schedule
    ↓
Backend:
  • Insert schedules row
  • Create APScheduler one-shot job at 2024-MM-DD 22:00:00 IST
  • Job registers as callable: execute_schedule(schedule_id)
    ↓
At 10 PM: APScheduler fires job
  • Fetch schedule row
  • Fetch appliance
  • Call adapter (TuyaAdapter / VirtualAdapter)
  • Update DB status
  • Log action
  ↓
Frontend:
  • Realtime fires → appliance ON
  • User sees it happened
```

### 5. **Cost Calculation (Multi-Slot Spans)**

```
User schedules AC for 3 PM - 9 PM
Tariff slots:
  • 3-6 PM: normal (₹7.42/kWh)
  • 6-9 PM: peak (₹9.55/kWh)

calculateCostForTime(15, 21, slots, 1200) [15 = 3 PM, 21 = 9 PM]:
  ↓
Split into slots:
  • Slot 1: 3-6 PM = 3 hours × ₹7.42 = ₹22.26
  • Slot 2: 6-9 PM = 3 hours × ₹9.55 = ₹28.65
  ↓
Total cost = (1.2 kW × 22.26) + (1.2 kW × 28.65) = ₹61.09
```

### 6. **Realtime Sync**

```
Frontend Control.tsx:
  supabase.channel('control-appliances')
    .on('postgres_changes', { table: 'appliances', ... }, () => {
      refetch appliances
    })

Frontend Home.tsx:
  Same subscription → Auto-syncs when user toggles in Control
  ↓
This is why: Toggle in Home → Control auto-updates (no page refresh needed)
```

---

## Known Issues & Gaps

### Critical Gaps (Demo Blockers)

| Issue | Current State | Impact | Fix |
|-------|---------------|--------|-----|
| **Schedule Executor** | Doesn't exist | Schedules are created but never fire | Implement APScheduler callback in backend |
| **Tariff Transition Detection** | UI-only, checks once on mount | If tariff slot changes (e.g., peak ends), UI stays stale | Implement transition_watcher cron |
| **Autopilot Execution** | V1 rules are cosmetic | Users create rules but they don't auto-execute | Implement rule trigger in transition_watcher |
| **Hardware Control** | TuyaAdapter returns true without API call | Plugs aren't actually toggled | Implement real Tuya API calls |
| **NILM Data** | Using synthetic random values | Consumption breakdown is mock | Wire real NILM model inference |
| **Voice Assistant** | VoiceAssistant.tsx exists but disconnected | Voice input doesn't execute commands | Implement backend endpoint for voice → action |

### Medium Issues

| Issue | Location | Workaround |
|-------|----------|-----------|
| Eco mode button shows even when enabled | `Optimizer.tsx` L387 | Check `eco_mode_enabled` before rendering button |
| AC shows "Fix" in optimizer with eco mode on | `tariffOptimizer.ts` | Update filter to exclude already-optimized appliances |
| No error boundaries on individual screens | `screens/*.tsx` | Wrap screens with `<ErrorBoundary>` |
| Offline handling missing | `services/api.ts` | Add ServiceWorker or cache layer |
| No notifications | Backend missing | Build 15-min cron to generate + send notifications |

### Minor Issues

- Mock data still in `constants.tsx` (can deprecate after API integration)
- No pagination on history screens (Control logs, bill history)
- No dark mode support (Tailwind configured but no toggle)
- Mobile testing limited (desktop view mode only)

---

## Summary: What This Codebase Does

**VoltWise** is a smart energy management system that helps users:

1. **Monitor** electricity usage in real-time with a balance gauge, daily cost breakdown, and consumption trends
2. **Control** individual appliances with instant ON/OFF toggles and smart intercepts during peak tariff hours
3. **Optimize** energy costs by:
   - Showing cost savings if appliances are delayed/shifted to cheaper slots
   - Providing eco mode to reduce power consumption
   - Offering automated recommendations via AI agents
4. **Schedule** appliance runs for specific times or recurring patterns (backend executor in development)
5. **Track carbon impact** with per-capita emissions, CO₂ saved via optimization, and tree equivalents
6. **Earn rewards** through gamification (achievements, challenges, leaderboards)
7. **Use voice commands** to control appliances hands-free (partial implementation)
8. **Configure autopilot** with rule-based (V1) or penalty-aware (V2) strategies

**Tech Highlights:**
- Real-time Supabase subscriptions for instant sync across screens
- Event-driven architecture with APScheduler background jobs
- Device adapter pattern: same pipeline for Tuya smart plugs & virtual appliances
- AI agent framework (Phase 1) ready for LLM integration (Phase 2)
- Comprehensive cost calculations handling multi-slot tariff spans
- Carbon intensity data for region-specific emissions

**Deployment:**
- Frontend: Netlify (React SPA)
- Backend: Python FastAPI on any runtime
- Database: Supabase PostgreSQL with RLS
- Real-time: Supabase Realtime (WebSocket)

---

## Quick Reference: Most Important Files

| Use Case | File | Key Function |
|----------|------|--------------|
| **Add new feature to Home page** | `screens/Home.tsx` | Uses AppContext + useApi for data |
| **Create new appliance toggle** | `screens/Control.tsx` | InterceptorModal flow, then POST /toggle |
| **Modify cost calculation** | `utils/tariffOptimizer.ts` | calculateCostForTime(), calculateOptimizationAlert() |
| **Add backend endpoint** | `backend/app/routers/*.py` | Depends (appliances, autopilot, analytics) |
| **Wire schedule execution** | `backend/app/services/scheduler.py` | APScheduler job callback |
| **Update database schema** | `sql/XX_*.sql` | Create new migration, preserve old ones |
| **Debug auth issues** | `contexts/AppContext.tsx` | Check auth listener, JWT decode, fetch profile chain |
| **Add new tariff slot type** | `sql/02_setup.sql` + `types/database.ts` | Update ENUM, add seed data |
| **Implement AI agent** | `backend/app/agents/` | See AI_AGENTS_ARCHITECTURE.md |
| **Check appliance control logs** | Supabase Studio → control_logs table | Filter by appliance_id, source, timestamp |

---

**Last Updated:** May 26, 2026  
**Version:** 1.0.0 (Pre-Demo)  
**Maintained By:** Development Team
