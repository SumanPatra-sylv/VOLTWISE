# 🔧 Appliance Module — Handoff Guide

> **For**: Teammate working on the Appliances UI/feature
> **Branch**: `main` (latest as of 22 Feb 2026)
> **Last updated by**: Suman

---

## 📋 Current Schema (Source of Truth: `sql/02_setup.sql`)

```sql
CREATE TABLE appliances (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id             UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    icon                TEXT NOT NULL DEFAULT 'zap',
    source              appliance_source DEFAULT 'manual',  -- 'nilm' | 'smart_plug' | 'manual'
    category            appliance_category DEFAULT 'other', -- NEW: enum below
    is_controllable     BOOLEAN DEFAULT TRUE,                -- NEW: false for fridge etc.
    rated_power_w       INT,
    current_power_w     NUMERIC(8,2) DEFAULT 0,
    status              appliance_status DEFAULT 'OFF',     -- 'ON' | 'OFF' | 'SCHEDULED' | 'WARNING'
    cost_per_hour       NUMERIC(8,2) DEFAULT 0,             -- ⚠️ Treat as CACHE (see note)
    runtime_today       TEXT,
    schedule_time       TEXT,
    message             TEXT,
    saving_potential     NUMERIC(6,2),
    smart_plug_id       UUID REFERENCES smart_plugs(id),
    is_active           BOOLEAN DEFAULT TRUE,
    sort_order          INT DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);
```

### Enums to know:
```sql
CREATE TYPE appliance_category AS ENUM (
  'ac', 'geyser', 'refrigerator', 'washing_machine', 'fan', 'tv', 'lighting', 'other'
);
CREATE TYPE appliance_status AS ENUM ('ON', 'OFF', 'SCHEDULED', 'WARNING');
CREATE TYPE appliance_source AS ENUM ('nilm', 'smart_plug', 'manual');
```

### TypeScript types: `types/database.ts`
```typescript
type ApplianceCategory = 'ac' | 'geyser' | 'refrigerator' | 'washing_machine' | 'fan' | 'tv' | 'lighting' | 'other';
interface DBAppliance { /* see types/database.ts for full type */ }
```

---

## ⚠️ Important Rules — DO NOT Break These

### 1. `cost_per_hour` is a CACHE, not a source of truth
Tariff changes throughout the day (ToD). **Never hardcode cost_per_hour**.
Compute dynamically in the UI:
```typescript
const costPerHour = (appliance.rated_power_w / 1000) * currentSlotRate;
```
You can optionally update the DB column via a backend scheduler, but the UI should always compute.

### 2. `is_controllable` controls toggle visibility
- `false` → Hide ON/OFF toggle, schedule button. Show as "Always On".
- Currently: **Refrigerator** = `false`, everything else = `true`.
- Respect this in all UI. Don't show toggle for non-controllable devices.

### 3. Use `category` for logic, NOT `name`
```typescript
// ✅ GOOD
if (appliance.category === 'ac') { /* optimize */ }

// ❌ BAD — fragile, breaks if user renames
if (appliance.name.includes('AC')) { /* optimize */ }
```

### 4. Adding new appliance categories
If you need a new category (e.g. `microwave`):
1. Run on Supabase: `ALTER TYPE appliance_category ADD VALUE 'microwave';`
2. Update `types/database.ts` → add `'microwave'` to `ApplianceCategory`
3. Update `02_setup.sql` (source of truth) to include it

---

## 📁 Files You'll Work In

| File | What to do |
|---|---|
| `screens/Control.tsx` | Main appliances screen — wire to Supabase instead of `MOCK_APPLIANCES` |
| `components/ApplianceCard.tsx` | Already built. Add `is_controllable` toggle logic |
| `services/api.ts` | `getAppliances()` currently returns mock. Replace with Supabase query |
| `constants.tsx` | Has `MOCK_APPLIANCES` — can remove once real data is wired |
| `types/database.ts` | `DBAppliance` type is already complete |

---

## 🚫 Files You Should NOT Touch

| File | Why |
|---|---|
| `sql/02_setup.sql` | Schema source of truth — only Suman modifies |
| `screens/Home.tsx` | Dashboard already wired to real data |
| `services/supabase.ts` | Supabase client — shared |
| `contexts/AppContext.tsx` | Auth + onboarding — shared |
| `sql/06_seed_usage.sql` | Seed data — already has 6 demo appliances |

---

## 🔌 How to Query Appliances from Supabase

```typescript
import { supabase } from '../services/supabase';

// Fetch all active appliances for a home
const { data, error } = await supabase
  .from('appliances')
  .select('*')
  .eq('home_id', homeId)
  .eq('is_active', true)
  .order('sort_order');
```

### Toggle appliance:
```typescript
await supabase
  .from('appliances')
  .update({ status: newStatus })
  .eq('id', applianceId);
```

---

## 🎯 What to Implement

1. **Replace `MOCK_APPLIANCES`** in `Control.tsx` with real Supabase query
2. **Respect `is_controllable`** — hide toggle for always-on devices
3. **Compute `cost_per_hour` dynamically** — `rated_power_w / 1000 × currentSlotRate`
4. **Use `category`** for any scheduling/optimization logic
5. **Add/remove appliance** flow (manual source)

---

## 🧪 Seed Data Already in DB (after running 06_seed_usage.sql)

| Name | Category | Controllable | Power |
|---|---|---|---|
| AC - Living Room | ac | ✅ | 1500W |
| Geyser | geyser | ✅ | 2000W |
| Refrigerator | refrigerator | ❌ | 200W |
| TV - Bedroom | tv | ✅ | 120W |
| Washing Machine | washing_machine | ✅ | 500W |
| Ceiling Fan | fan | ✅ | 75W |

---

## 🤝 Coordination

- **Push to a feature branch** (`feature/appliances`) — do NOT push directly to `main`
- We'll merge after review
- If you need to change the `appliances` schema, **tell me first** so I can update `02_setup.sql`
- TypeScript build must pass: `npx tsc --noEmit`
