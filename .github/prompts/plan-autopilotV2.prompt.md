# Plan: Autopilot V2 — Multi-Goal AI with Carbon Awareness

## TL;DR

Replace the current `AutopilotPanel` in `screens/Control.tsx` (lines 586–800) with a new multi-goal autopilot UI matching the screenshot: **Grid Protection toggle** at top, **3 Daily Strategy modes** (Balanced / Max Savings / Eco Mode), and **Delegated Devices** with per-device AI action preferences + protected time windows. Add a `carbon_intensity_schedule` table to the database with realistic hourly gCO₂/kWh values per region. Extend the backend `tariff_watcher` to also detect carbon intensity transitions and fire "clean energy" notifications. Implement a **multi-objective penalty scoring engine** in the backend for Balanced mode. Respect **physical override** by treating any user-initiated ON (app or physical) as highest priority. Add clean energy notifications on the Optimizer page alongside existing peak/off-peak ones.

---

## Phase 1: Database — Carbon Intensity Table + Schema Changes

### 1. Create `sql/13_autopilot_v2_migration.sql`

- New enum `autopilot_strategy` — `'balanced'`, `'max_savings'`, `'eco_mode'`
- New table `carbon_intensity_schedule` — hourly carbon intensity by region:
  - `id`, `region_code TEXT` (e.g. `'IN-BR'` for Bihar, `'IN-GJ'` for Gujarat), `hour INT (0-23)`, `gco2_per_kwh NUMERIC(6,2)`, `source TEXT` (e.g. `'CEA-2024'`), `effective_from DATE`, `is_active BOOLEAN`
- Seed with real CEA-based time-of-day heuristic data:
  - Early morning (0–6): ~650 gCO₂ (more thermal baseload)
  - Daytime (6–16): ~550 gCO₂ (solar kicks in)
  - Evening peak (16–22): ~750 gCO₂ (gas peakers)
  - Late night (22–24): ~680 gCO₂
  - Values vary per region
- Add columns to `homes`:
  - `autopilot_strategy TEXT DEFAULT 'balanced'`
  - `grid_protection_enabled BOOLEAN DEFAULT FALSE`
- New table `device_autopilot_config` — per-device autopilot preferences:
  - `id UUID`, `appliance_id UUID FK`, `home_id UUID FK`
  - `preferred_action TEXT` (turn_off / eco_mode / delay_start / limit_power)
  - `protected_window_enabled BOOLEAN DEFAULT FALSE`
  - `protected_window_start TIME`, `protected_window_end TIME`
  - `is_delegated BOOLEAN DEFAULT TRUE`
  - `override_active BOOLEAN DEFAULT FALSE`, `override_until TIMESTAMPTZ`
  - `created_at`, `updated_at`
- Add `notification_type` enum value: `'carbon'` (or use `'tip'` type with metadata `{"subtype": "clean_energy"}` to distinguish)
- New table `grid_events` — future DISCOM integration architecture:
  - `id UUID`, `discom_id UUID FK`
  - `event_type TEXT` (peak_alert / frequency_drop / voltage_anomaly / load_shedding)
  - `severity TEXT` (info / warning / critical)
  - `message TEXT`, `start_time TIMESTAMPTZ`, `end_time TIMESTAMPTZ`
  - `affected_areas TEXT[]`, `raw_data JSONB`, `created_at`

### 2. Grant realtime on new tables

- `device_autopilot_config`, `carbon_intensity_schedule`, `grid_events`

---

## Phase 2: Backend — Carbon & Penalty Engine

### 3. New service `backend/app/services/carbon.py` — Carbon intensity engine

- `get_current_carbon_intensity(region_code: str) -> float` — looks up `carbon_intensity_schedule` for current hour
- `get_daily_carbon_profile(region_code: str) -> list[dict]` — returns all 24 hours for a region
- `is_clean_energy_window(region_code: str) -> bool` — returns `True` if current gCO₂ is below the daily mean (analogous to off-peak for cost)
- `get_cleanest_hours(region_code: str, count: int) -> list[int]` — returns the N cleanest hours

### 4. New service `backend/app/services/penalty_engine.py` — Multi-objective optimization

- `calculate_hourly_penalty(hour, tariff_slots, carbon_profile, strategy) -> float`:
  - If `strategy == 'max_savings'`: penalty = normalized cost only (w1=1.0, w2=0.0)
  - If `strategy == 'eco_mode'`: penalty = normalized carbon only (w1=0.0, w2=1.0)
  - If `strategy == 'balanced'`: penalty = (0.7 × normalized_cost) + (0.3 × normalized_carbon)
  - Formula: `Total Penalty = (w1 × Normalized Cost) + (w2 × Normalized Carbon)`
    - `Normalized Cost = Current Tariff / Max Daily Tariff` (scales 0.0 to 1.0)
    - `Normalized Carbon = Current gCO₂ / Max Daily gCO₂` (scales 0.0 to 1.0)
- `should_delay_appliance(appliance_config, current_penalty, threshold=0.6) -> bool`:
  1. Check protected window first → if inside, return `False` (never touch)
  2. Check `override_active` → if `True`, return `False`
  3. If penalty > threshold → return `True` (delay/pause)
- `find_optimal_run_window(tariff_slots, carbon_profile, strategy, duration_hours) -> dict` — finds the best time window for a given appliance run duration
- `get_penalty_timeline(tariff_slots, carbon_profile, strategy) -> list[dict]` — returns 24-hour penalty scores for UI visualization

### 5. Extend `backend/app/services/autopilot.py`

- Refactor `execute_peak_entry` → `execute_strategy_action(home_id, user_id, trigger: str)`:
  - Reads the home's `autopilot_strategy`
  - For each delegated device, reads `device_autopilot_config`
  - Checks protected windows (skip if inside window)
  - Checks `override_active` (skip if `True`)
  - Executes the device's `preferred_action` (not one-size-fits-all rule anymore)
  - Physical override: if an appliance is ON and the user turned it on (check `control_logs` for source = `'user'` or `'physical'`), set `override_active = True`, `override_until = end of current penalty window`
- Refactor `execute_peak_exit` → `execute_strategy_restore(home_id, user_id)`
- **Move `_pre_peak_state` to database** — new column or table to survive restarts

### 6. Extend `backend/app/services/tariff_watcher.py` → rename to `transition_watcher.py`

- Add carbon transition detection alongside tariff transitions
- On carbon becoming "clean" (below daily mean): create notification type `tip` with metadata `{"subtype": "clean_energy"}`:
  - Title: "🌿 Clean Energy Window"
  - Message: "Grid carbon intensity is low right now. Run [appliance names] now to save the environment!"
- On combined off-peak + clean energy: special notification:
  - Title: "💚 Best Time to Run Appliances"
  - Message: "It's both cheapest AND cleanest right now — save money and reduce your carbon footprint!"
- Keep existing peak/off-peak notifications as-is
- For autopilot-enabled homes, call `execute_strategy_action` when penalty score crosses threshold (not just at peak boundary)

### 7. New service `backend/app/services/grid_protection.py` — Grid protection (mock + future-ready)

- `check_grid_status(discom_id) -> dict` — currently returns mock `{"status": "normal", "frequency": 50.0, "voltage": 230}`
- `handle_grid_event(event) -> list[dict]` — processes a `grid_events` row and executes emergency turn-off for all delegated devices (overrides strategy and protected windows)
- Architecture: define an abstract `GridDataSource` interface with:
  - `MockGridSource` — current implementation
  - `DiscomAPISource` — placeholder for future NRLDC/DISCOM API integration

### 8. Extend autopilot router `backend/app/routers/autopilot.py` — new endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `PUT` | `/api/autopilot/strategy` | Set home's strategy (balanced/max_savings/eco_mode) |
| `PUT` | `/api/autopilot/grid-protection` | Toggle grid protection for a home |
| `GET` | `/api/autopilot/penalty-timeline` | Returns 24-hour penalty scores for current strategy |
| `GET` | `/api/autopilot/carbon-now` | Current carbon intensity + clean/dirty status |
| `POST` | `/api/autopilot/device-config` | Create/update per-device autopilot config |
| `GET` | `/api/autopilot/device-config` | List all device configs for a home |
| `POST` | `/api/autopilot/override` | Manually flag a device as overridden |
| `GET` | `/api/autopilot/grid-status` | Get current grid health (mock for now) |

---

## Phase 3: Frontend — Backend Service Layer

### 9. Extend `services/backend.ts` — add API functions

- `apiSetAutopilotStrategy(homeId, strategy)`
- `apiToggleGridProtection(homeId, enabled)`
- `apiGetPenaltyTimeline(homeId)`
- `apiGetCarbonNow(homeId)`
- `apiSetDeviceAutopilotConfig(config)`
- `apiGetDeviceAutopilotConfigs(homeId)`
- `apiSetDeviceOverride(applianceId, override)`
- `apiGetGridStatus(homeId)`

---

## Phase 4: Frontend — New Autopilot UI

### 10. Rewrite `AutopilotPanel` in `screens/Control.tsx`

New UI matching the screenshot with three sections:

**Section A: Grid Protection** (top card, red accent)
- Toggle with shield icon
- Description: "Overrides all rules during DISCOM peak alerts to prevent neighborhood blackouts"
- When ON, fetches grid status from `/api/autopilot/grid-status`
- If `grid_event` is active, show alert with event details

**Section B: Daily Strategy** (3 pill selector)
- **Balanced** (default, highlighted) — "AI delays or limits power only if both Tariff and Carbon Intensity are exceptionally high"
- **Max Savings** — "AI aggressively shifts loads to cheapest hours. Comfort may be impacted."
- **Eco Mode** — "AI prioritizes lowest carbon intensity hours. May run during slightly costlier slots."
- Tapping a mode calls `apiSetAutopilotStrategy()` and updates home's strategy
- Show a description card below explaining the active mode's behavior

**Section C: Delegated Devices** (list of appliance cards)
- Each card shows: appliance icon + name, current AI action, toggle to delegate/un-delegate
- Expanded view (on tap) shows:
  - **Preferred AI Action** chips: "Switch to Eco Mode", "Delay Start until Off-Peak", "Turn Off", "Limit Power %"
  - **Protected Window** toggle + time picker: "Do not touch between [start] and [end]"
  - **OVERRIDE** badge if user physically overrode (pink badge, "AI temporarily paused")
- Data backed by `device_autopilot_config` table

### 11. Add types to `types/database.ts`

- `DBDeviceAutopilotConfig`
- `DBCarbonIntensitySchedule`
- `DBGridEvent`
- `AutopilotStrategy` type: `'balanced' | 'max_savings' | 'eco_mode'`

---

## Phase 5: Notifications — Clean Energy + Combined

### 12. Extend `screens/Optimizer.tsx` — add clean energy mode

- New mode: When `is_clean_window === true`, show a green/leaf banner: "🌿 Clean Energy Window — Low Carbon Grid"
- Show suggestions: heavy appliances currently OFF with "Run Now for Lower Footprint" button
- When BOTH off-peak AND clean energy: combined banner — "💚 Save Money & Planet — Cheapest + Cleanest rate right now"
- Fetch carbon status from `/api/autopilot/carbon-now` on mount

### 13. Extend notification rendering in `screens/Notifications.tsx`

- Render carbon/clean-energy notifications with leaf icon and green theme

---

## Phase 6: Physical Override Logic

### 14. Override detection in `backend/app/adapters/device.py`

- In `TuyaAdapter`: when polling device state, if relay is ON but DB says OFF → mark as physical override in `device_autopilot_config.override_active = True`
- In `VirtualAdapter`: when any toggle is received with source `'user'` during an active autopilot penalty window → set `override_active = True`, `override_until` = end of current penalty period
- The autopilot engine checks `override_active` before every action and **skips** that device
- Override auto-clears when penalty window ends (via `execute_strategy_restore`)

### 15. Override hierarchy (highest → lowest priority)

1. **Physical switch / user app toggle** → always respected, pauses AI for that device
2. **Protected window** → AI never touches the device during this time
3. **Grid protection (critical)** → overrides everything except physical
4. **Strategy-based actions** → normal autopilot behavior

---

## Verification Checklist

- [ ] Run `13_autopilot_v2_migration.sql` in Supabase SQL Editor, verify tables created
- [ ] Start backend: `cd backend && uvicorn main:app --reload`
- [ ] Test endpoints: `GET /api/autopilot/carbon-now`, `GET /api/autopilot/penalty-timeline`, `PUT /api/autopilot/strategy`
- [ ] Test penalty engine: call `POST /api/autopilot/simulate` with different strategies, verify penalty scores differ
- [ ] Verify notifications: wait for carbon transition (or mock time), confirm clean energy notification appears
- [ ] UI: switch between Balanced/Max Savings/Eco Mode, verify strategy persists and description updates
- [ ] UI: delegate a device, set preferred action + protected window, verify config saved
- [ ] Override test: turn on an appliance via app during high-penalty window, confirm AI pauses for that device

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Carbon data source | Time-of-day heuristic table seeded with CEA-derived regional values | Not API-dependent, works offline, easy to update |
| Override detection | Smart plug power monitoring (where available) + DB source-based detection for app toggles | True hardware-level physical switch detection requires smart plug polling (Tuya API) — architecture ready, actual Tuya polling is TODO |
| Grid protection | Mocked with `MockGridSource` adapter | `GridDataSource` interface and `grid_events` table ready for real DISCOM API integration |
| Pre-peak state | Moved to database | Eliminates the existing in-memory `_pre_peak_state` crash vulnerability |
| Old `automation_rules` | Kept for backward compatibility | New `device_autopilot_config` + penalty engine is the primary path. Old rules still work if `autopilot_strategy` is not set |
