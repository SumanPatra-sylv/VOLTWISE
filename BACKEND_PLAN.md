# VoltWise — Backend Architecture Plan

> **Generated:** 2026-02-27  
> **Purpose:** Define what moves to backend, what stays in frontend, and the execution architecture.

---

## Core Principle: Actions Move, Previews Stay

```
Frontend (React)          →  Keeps all UI math (instant feedback)
Backend (FastAPI)         →  Owns all execution authority (reliable)
```

Your frontend math (tariffOptimizer.ts) stays untouched. It's **preview logic** — instant cost calculations, slot detection for display, schedule picker UX. The backend **validates and executes** — turns on smart plugs, fires schedules, enforces autopilot.

---

## What STAYS in Frontend (No Changes)

| Module | Why |
|--------|-----|
| `getSlotForHour()` | Instant UI display — shows current tariff band without API call |
| `calculateCostForTime()` | Real-time cost preview as user picks schedule times |
| `calculateScheduleOptions()` | InterceptorModal shows run-now vs cheapest vs next-cheaper |
| `calculateOptimizationAlert()` | Optimizer page display — which appliances need action |
| `shouldIntercept()` | Instant decision whether to show InterceptorModal |
| InterceptorModal UI | All 3 options (Run Now, Schedule, Eco Mode) stay as UI |
| ScheduleModal picker | AM/PM picker, duration selector, cost comparison — all stays |
| Supabase Realtime listeners | Read-only sync for appliance status changes |
| Tariff display, greeting, all UI | Pure presentation |

**Your `tariffOptimizer.ts` math is safe. Not a single function changes.**

---

## What MOVES to Backend (Actions Only)

| Current Frontend Code | New Backend Endpoint | What It Does |
|----------------------|---------------------|--------------|
| `supabase.from('appliances').update({ status })` in Control/Home/Optimizer | `POST /api/appliances/{id}/toggle` | Updates DB + calls Tuya API for smart plugs |
| `supabase.from('schedules').insert()` in ScheduleModal | `POST /api/appliances/{id}/schedule` | Creates schedule row + registers APScheduler job |
| **[MISSING] Schedule executor** | APScheduler job at exact trigger time | Fires at 10:00 PM, calls Tuya/updates status |
| "Turn Off All" in Optimizer | `POST /api/optimizer/execute` | Batch turn-off with Tuya calls |
| Eco mode toggle | `POST /api/appliances/{id}/eco-mode` | Updates DB, adjusts Tuya settings if applicable |
| Carbon calculations | Nightly APScheduler cron (00:30 IST) | Aggregates from daily_aggregates |
| Notification generation | 15-min APScheduler cron | Low balance, spike, peak warning |

---

## Execution Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend                              │
│                                                                  │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────────┐  │
│  │ REST API     │  │ APScheduler     │  │ Device Adapters   │  │
│  │              │  │                 │  │                   │  │
│  │ /toggle      │──│ Schedule jobs   │──│ TuyaAdapter       │  │
│  │ /schedule    │  │ (exact time)    │  │   → Tuya Cloud    │  │
│  │ /optimizer   │  │                 │  │                   │  │
│  │ /eco-mode    │  │ Tariff watcher  │  │ VirtualAdapter    │  │
│  │              │  │ (1-min cron)    │  │   → DB status     │  │
│  │              │  │                 │  │   → Analytics     │  │
│  │              │  │ Nightly cron    │  │   → Logs          │  │
│  │              │  │ (CO₂, notifs)   │  │                   │  │
│  └──────┬───────┘  └────────┬────────┘  └────────┬──────────┘  │
│         │                   │                     │             │
│         └───────────────────┼─────────────────────┘             │
│                             │                                    │
│                    ┌────────▼────────┐                           │
│                    │ Supabase Admin  │                           │
│                    │ (service_role)  │                           │
│                    │                 │                           │
│                    │ • appliances    │                           │
│                    │ • schedules     │                           │
│                    │ • schedule_logs │                           │
│                    │ • control_logs  │                           │
│                    │ • notifications │                           │
│                    └─────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Smart Plug vs Virtual Appliance Architecture

### The Adapter Pattern

Every appliance goes through the **same execution pipeline** — the only difference is what happens at the device layer.

```python
class DeviceAdapter(ABC):
    @abstractmethod
    async def turn_on(self, appliance_id: str) -> ControlResult: ...
    
    @abstractmethod
    async def turn_off(self, appliance_id: str) -> ControlResult: ...
    
    @abstractmethod
    async def set_eco_mode(self, appliance_id: str, enabled: bool) -> ControlResult: ...


class TuyaAdapter(DeviceAdapter):
    """For appliances connected to Tuya smart plugs."""
    
    async def turn_on(self, appliance_id: str) -> ControlResult:
        plug = await get_smart_plug(appliance_id)
        # Call Tuya Cloud API
        result = await tuya_client.send_command(plug.device_id, {"switch": True})
        # Update DB
        await supabase.from('appliances').update({'status': 'ON'}).eq('id', appliance_id)
        await log_control(appliance_id, 'turn_on', 'smart_plug', result)
        return result


class VirtualAdapter(DeviceAdapter):
    """For appliances WITHOUT smart plugs — same pipeline, no hardware."""
    
    async def turn_on(self, appliance_id: str) -> ControlResult:
        # No hardware call — just update DB status
        await supabase.from('appliances').update({'status': 'ON'}).eq('id', appliance_id)
        await log_control(appliance_id, 'turn_on', 'virtual', 'success')
        # Still tracks analytics, logs, notifications — identical to real plug
        return ControlResult(success=True, source='virtual')


def get_adapter(appliance: DBAppliance) -> DeviceAdapter:
    """Factory: returns Tuya or Virtual based on smart_plug_id."""
    if appliance.smart_plug_id:
        return TuyaAdapter()
    return VirtualAdapter()
```

### Why This Matters

Both smart plug AND virtual appliances:
- ✅ Go through same API endpoint (`POST /api/appliances/{id}/toggle`)
- ✅ Get logged in `control_logs`
- ✅ Update `appliances.status` in DB
- ✅ Trigger Supabase Realtime → frontend updates instantly
- ✅ Work with schedules (APScheduler fires, adapter executes)
- ✅ Work with autopilot (tariff watcher uses adapter)
- ✅ Track analytics (runtime, cost, carbon)

The only difference: TuyaAdapter calls a hardware API. VirtualAdapter doesn't.

---

## APScheduler + FastAPI — How It Works

### Setup

```python
# main.py
from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

app = FastAPI()

# Jobs persisted in PostgreSQL — survives server restarts
scheduler = AsyncIOScheduler(
    jobstores={
        'default': SQLAlchemyJobStore(url=SUPABASE_DB_URL)
    }
)

@app.on_event("startup")
async def startup():
    # Cron: tariff transition watcher (every 1 minute)
    scheduler.add_job(
        tariff_transition_watcher,
        'interval', minutes=1,
        id='tariff_watcher', replace_existing=True
    )
    # Cron: notification generator (every 15 minutes)  
    scheduler.add_job(
        notification_generator,
        'interval', minutes=15,
        id='notif_generator', replace_existing=True
    )
    # Cron: nightly aggregator (00:30 IST daily)
    scheduler.add_job(
        nightly_aggregator,
        'cron', hour=0, minute=30, timezone='Asia/Kolkata',
        id='nightly_agg', replace_existing=True
    )
    scheduler.start()
```

### Schedule Execution (Event-Driven, Not Polling)

When user creates a schedule at 10:00 PM:

```python
# POST /api/appliances/{id}/schedule
@app.post("/api/appliances/{appliance_id}/schedule")
async def create_schedule(appliance_id: str, body: ScheduleRequest):
    # 1. Save to Supabase schedules table
    schedule = await supabase.from('schedules').insert({...}).execute()
    
    # 2. Calculate exact trigger datetime
    trigger_time = calculate_next_trigger(body.start_time, body.repeat_type)
    
    # 3. Register one-shot APScheduler job at EXACT time
    scheduler.add_job(
        execute_schedule,
        'date',  # one-shot trigger
        run_date=trigger_time,
        args=[schedule.id, appliance_id, 'turn_on'],
        id=f'schedule_{schedule.id}_on',
    )
    
    # 4. If end_time exists, register auto-off job
    if body.end_time:
        off_time = calculate_next_trigger(body.end_time, body.repeat_type)
        scheduler.add_job(
            execute_schedule,
            'date',
            run_date=off_time,
            args=[schedule.id, appliance_id, 'turn_off'],
            id=f'schedule_{schedule.id}_off',
        )
    
    # 5. Update appliance status to SCHEDULED
    await supabase.from('appliances').update({
        'status': 'SCHEDULED', 'schedule_time': body.start_time
    }).eq('id', appliance_id)
    
    return {"success": True, "trigger_at": trigger_time.isoformat()}


async def execute_schedule(schedule_id: str, appliance_id: str, action: str):
    """Fired by APScheduler at the exact scheduled time."""
    appliance = await get_appliance(appliance_id)
    adapter = get_adapter(appliance)
    
    try:
        if action == 'turn_on':
            result = await adapter.turn_on(appliance_id)
        else:
            result = await adapter.turn_off(appliance_id)
        
        # Log execution
        await supabase.from('schedule_logs').insert({
            'schedule_id': schedule_id,
            'appliance_id': appliance_id,
            'executed_at': datetime.now().isoformat(),
            'action': action,
            'result': 'success',
        })
        
        # Send notification
        await create_notification(
            appliance.home_id,
            f'{appliance.name} turned {"on" if action == "turn_on" else "off"} (scheduled)',
            'schedule'
        )
    except Exception as e:
        await supabase.from('schedule_logs').insert({
            'schedule_id': schedule_id,
            'appliance_id': appliance_id,
            'executed_at': datetime.now().isoformat(),
            'action': action,
            'result': 'failed',
            'error_message': str(e),
        })
```

**No polling.** APScheduler calculates the exact trigger time internally.  
At 10:00:00 PM → job fires instantly. No "check every minute" loop.

### Tariff Transition Watcher (1-min lightweight cron)

```python
async def tariff_transition_watcher():
    """Runs every 1 minute. Detects tariff slot boundary crossings."""
    current_hour = datetime.now(IST).hour
    current_minute = datetime.now(IST).minute
    
    # Only act on exact slot boundaries (e.g., XX:00)
    # Check if we just crossed into a new slot
    for home in await get_all_active_homes():
        slots = await get_tariff_slots(home.tariff_plan_id)
        current_slot = get_slot_for_hour(current_hour, slots)
        prev_slot = get_slot_for_hour((current_hour - 1) % 24, slots)
        
        # Transition detected!
        if current_minute == 0 and current_slot != prev_slot:
            if current_slot.slot_type == 'peak':
                # ENTERING PEAK → auto-off tier_1 shiftable appliances
                await autopilot_peak_entry(home.id, slots)
            elif prev_slot.slot_type == 'peak':
                # LEAVING PEAK → notify user, resume scheduled appliances
                await autopilot_peak_exit(home.id, slots)
```

---

## Frontend Changes Required

### Minimal — Just Replace Direct Supabase Calls with API Calls

```typescript
// BEFORE (current — direct Supabase update):
await supabase.from('appliances')
    .update({ status: 'ON', updated_at: new Date().toISOString() })
    .eq('id', appliance.id);

// AFTER (calls backend which handles Tuya + DB):
await axios.post(`/api/appliances/${appliance.id}/toggle`, { 
    action: 'turn_on' 
});
```

```typescript
// BEFORE (current — schedule + no executor):
await supabase.from('schedules').insert({...});
await supabase.from('appliances').update({ status: 'SCHEDULED' });

// AFTER (backend creates schedule + registers APScheduler job):
await axios.post(`/api/appliances/${appliance.id}/schedule`, {
    start_time: '22:00',
    end_time: '22:30',
    repeat_type: 'once',
});
```

**Your ScheduleModal UI, InterceptorModal, cost calculations — all untouched.**  
Only the `handleSave()` / `toggleAppliance()` functions swap from `supabase.update()` to `axios.post()`.

---

## Tuya Smart Plug Integration

### SDK

```bash
pip install tinytuya  # Local control
# OR
pip install tuya-connector-python  # Cloud API (recommended for server)
```

### Cloud API Flow

```
1. User adds smart plug via app (SmartPlugSetup.tsx)
2. Frontend sends device_id to backend
3. Backend stores in smart_plugs table (already exists in schema)
4. Backend uses Tuya Cloud API to control:

   POST https://openapi.tuyaus.com/v1.0/devices/{device_id}/commands
   Body: {"commands": [{"code": "switch_1", "value": true}]}
```

### Tuya Setup Required

1. Create Tuya IoT Platform account → get `access_id` + `access_secret`
2. Link Tuya Smart Life app devices to IoT platform
3. Store credentials in FastAPI `.env`
4. `TuyaAdapter` uses `tuya-connector-python` SDK

---

## Database Changes Required

**None for the adapter pattern.** The existing schema already has:
- `smart_plugs` table with `device_id`, `platform: 'tuya'`
- `appliances.smart_plug_id` FK (nullable — NULL = virtual)
- `control_logs` for all actions
- `schedule_logs` for execution tracking
- `appliances.source` enum: `'smart_plug' | 'nilm' | 'manual'`

The adapter checks `appliance.smart_plug_id`:
- Not null → TuyaAdapter
- Null → VirtualAdapter

---

## Deployment

### Option 1: Railway / Render (Recommended for PoC)

```bash
# Single container: FastAPI + APScheduler
docker build -t voltwise-backend .
# Deploy to Railway with SUPABASE_URL, TUYA_ACCESS_ID, etc.
```

### Option 2: Local Development

```bash
cd backend/
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Scaling Path (Future)

| PoC (Now) | Production (Later) |
|-----------|--------------------|
| APScheduler in-process | Celery + Redis |
| Single FastAPI instance | Multiple workers behind load balancer |
| SQLAlchemy jobstore | Redis jobstore |
| 100 homes | 1M+ homes |

---

## Summary: What Changes vs What Doesn't

### ✅ Doesn't Change (Your UI Investment Is Safe)
- `tariffOptimizer.ts` — all math functions
- `InterceptorModal` — all 3 options (Run Now, Schedule, Eco)
- `ScheduleModal` — picker, duration, cost comparison
- `Optimizer.tsx` — display logic, alert cards
- `Control.tsx` — tile layout, add/edit appliance, action sheet
- `Home.tsx` — dashboard, quick toggles
- Supabase Realtime listeners
- All CSS/animations

### 🔄 Changes (Small — Just Swap Function Calls)
- `toggleAppliance()` → calls `POST /api/appliances/{id}/toggle` instead of direct Supabase
- `ScheduleModal.handleSave()` → calls `POST /api/appliances/{id}/schedule`
- `handleTurnOff/handleTurnOffAll` in Optimizer → calls `POST /api/optimizer/execute`
- `handleEcoMode` → calls `POST /api/appliances/{id}/eco-mode`

**~20 lines of code change in the frontend. Everything else stays.**
