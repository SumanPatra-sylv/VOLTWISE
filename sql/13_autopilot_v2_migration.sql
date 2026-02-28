-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  13_autopilot_v2_migration.sql                                  ║
-- ║  Autopilot V2 — Multi-Goal AI + Carbon Awareness                ║
-- ║  Run this in Supabase SQL Editor AFTER 12_autopilot_migration   ║
-- ╚══════════════════════════════════════════════════════════════════╝


-- ════════════════════════════════════════════════════════════════════
-- PART A: Extend homes table with strategy + grid protection
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE homes ADD COLUMN IF NOT EXISTS autopilot_strategy TEXT DEFAULT 'balanced';
ALTER TABLE homes ADD COLUMN IF NOT EXISTS grid_protection_enabled BOOLEAN DEFAULT FALSE;


-- ════════════════════════════════════════════════════════════════════
-- PART B: Carbon Intensity Schedule — hourly gCO₂/kWh by region
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS carbon_intensity_schedule (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_code     TEXT NOT NULL,           -- e.g. 'IN-BR' (Bihar), 'IN-GJ' (Gujarat)
    hour            INT NOT NULL CHECK (hour >= 0 AND hour <= 23),
    gco2_per_kwh    NUMERIC(6,2) NOT NULL,   -- grams CO₂ per kWh
    source          TEXT DEFAULT 'CEA-2024',  -- data provenance
    effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(region_code, hour, effective_from)
);

-- Index for fast hourly lookups
CREATE INDEX IF NOT EXISTS idx_carbon_schedule_lookup
    ON carbon_intensity_schedule(region_code, hour, is_active);


-- ════════════════════════════════════════════════════════════════════
-- PART C: Seed CEA-derived carbon intensity data
-- ════════════════════════════════════════════════════════════════════
-- Source: CEA CO₂ Baseline Database (2023-24), adjusted for
-- time-of-day grid mix patterns per region.
--
-- Bihar (IN-BR): Higher thermal dependency (DVC, NTPC Kahalgaon)
--   - Night/early morning: thermal baseload dominates → 720-760 gCO₂
--   - Daytime: solar+wind injection → 520-580 gCO₂
--   - Evening peak: gas peakers + high coal ramp → 780-820 gCO₂
--
-- Gujarat (IN-GJ): Better renewable mix (Charanka solar, Kutch wind)
--   - Night: ~620-660 gCO₂
--   - Daytime: strong solar → 420-480 gCO₂ (among lowest in India)
--   - Evening peak: ~700-740 gCO₂

-- Bihar (IN-BR)
INSERT INTO carbon_intensity_schedule (region_code, hour, gco2_per_kwh, source, effective_from) VALUES
    ('IN-BR', 0,  740, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 1,  735, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 2,  730, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 3,  725, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 4,  720, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 5,  715, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 6,  680, 'CEA-2024', '2025-04-01'),  -- sunrise, solar ramp
    ('IN-BR', 7,  620, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 8,  570, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 9,  540, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 10, 520, 'CEA-2024', '2025-04-01'),  -- peak solar
    ('IN-BR', 11, 510, 'CEA-2024', '2025-04-01'),  -- lowest carbon
    ('IN-BR', 12, 520, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 13, 530, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 14, 550, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 15, 580, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 16, 640, 'CEA-2024', '2025-04-01'),  -- solar decline
    ('IN-BR', 17, 720, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 18, 790, 'CEA-2024', '2025-04-01'),  -- evening peak starts
    ('IN-BR', 19, 810, 'CEA-2024', '2025-04-01'),  -- highest carbon
    ('IN-BR', 20, 800, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 21, 780, 'CEA-2024', '2025-04-01'),
    ('IN-BR', 22, 760, 'CEA-2024', '2025-04-01'),  -- peak ends
    ('IN-BR', 23, 750, 'CEA-2024', '2025-04-01');

-- Gujarat (IN-GJ)
INSERT INTO carbon_intensity_schedule (region_code, hour, gco2_per_kwh, source, effective_from) VALUES
    ('IN-GJ', 0,  650, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 1,  645, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 2,  640, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 3,  635, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 4,  630, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 5,  625, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 6,  580, 'CEA-2024', '2025-04-01'),  -- sunrise
    ('IN-GJ', 7,  510, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 8,  460, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 9,  430, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 10, 420, 'CEA-2024', '2025-04-01'),  -- peak solar + wind
    ('IN-GJ', 11, 410, 'CEA-2024', '2025-04-01'),  -- lowest carbon
    ('IN-GJ', 12, 420, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 13, 435, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 14, 460, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 15, 500, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 16, 560, 'CEA-2024', '2025-04-01'),  -- solar decline
    ('IN-GJ', 17, 630, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 18, 700, 'CEA-2024', '2025-04-01'),  -- evening peak
    ('IN-GJ', 19, 730, 'CEA-2024', '2025-04-01'),  -- highest carbon
    ('IN-GJ', 20, 720, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 21, 700, 'CEA-2024', '2025-04-01'),
    ('IN-GJ', 22, 670, 'CEA-2024', '2025-04-01'),  -- peak ends
    ('IN-GJ', 23, 660, 'CEA-2024', '2025-04-01');


-- ════════════════════════════════════════════════════════════════════
-- PART D: Device Autopilot Config — per-device AI preferences
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS device_autopilot_config (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appliance_id            UUID NOT NULL REFERENCES appliances(id) ON DELETE CASCADE,
    home_id                 UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    preferred_action        TEXT NOT NULL DEFAULT 'delay_start',   -- turn_off | eco_mode | delay_start | limit_power
    protected_window_enabled BOOLEAN DEFAULT FALSE,
    protected_window_start  TIME,
    protected_window_end    TIME,
    is_delegated            BOOLEAN DEFAULT TRUE,
    override_active         BOOLEAN DEFAULT FALSE,
    override_until          TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT now(),
    updated_at              TIMESTAMPTZ DEFAULT now(),
    UNIQUE(appliance_id)
);

CREATE INDEX IF NOT EXISTS idx_device_config_home
    ON device_autopilot_config(home_id);
CREATE INDEX IF NOT EXISTS idx_device_config_appliance
    ON device_autopilot_config(appliance_id);


-- ════════════════════════════════════════════════════════════════════
-- PART E: Grid Events — future DISCOM integration architecture
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS grid_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discom_id       UUID REFERENCES discoms(id),
    event_type      TEXT NOT NULL,  -- peak_alert | frequency_drop | voltage_anomaly | load_shedding
    severity        TEXT NOT NULL DEFAULT 'info',  -- info | warning | critical
    message         TEXT,
    start_time      TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_time        TIMESTAMPTZ,
    affected_areas  TEXT[],
    raw_data        JSONB,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grid_events_active
    ON grid_events(discom_id, is_active, start_time);


-- ════════════════════════════════════════════════════════════════════
-- PART F: Pre-peak state table (replaces in-memory dict)
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS autopilot_saved_state (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id         UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    appliance_id    UUID NOT NULL REFERENCES appliances(id) ON DELETE CASCADE,
    prev_status     TEXT NOT NULL,       -- 'ON' | 'OFF' etc.
    prev_eco_mode   BOOLEAN DEFAULT FALSE,
    trigger_type    TEXT NOT NULL,       -- 'peak_tariff' | 'high_carbon' | 'grid_event' | 'penalty_threshold'
    saved_at        TIMESTAMPTZ DEFAULT now(),
    restored_at     TIMESTAMPTZ,
    UNIQUE(home_id, appliance_id, trigger_type)
);

CREATE INDEX IF NOT EXISTS idx_saved_state_home
    ON autopilot_saved_state(home_id, restored_at);


-- ════════════════════════════════════════════════════════════════════
-- PART G: Add 'autopilot' to notif_type enum (if not already there)
-- ════════════════════════════════════════════════════════════════════
-- The autopilot.py service already inserts type='autopilot' notifications.
-- We need to add this to the enum so it doesn't fail on strict DB.
-- Using DO block for idempotency.

DO $$
BEGIN
    -- Add 'autopilot' value if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'autopilot'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notif_type')
    ) THEN
        ALTER TYPE notif_type ADD VALUE 'autopilot';
    END IF;
    -- Add 'carbon' value if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'carbon'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notif_type')
    ) THEN
        ALTER TYPE notif_type ADD VALUE 'carbon';
    END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════
-- PART H: Enable Realtime for new tables
-- ════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE device_autopilot_config;
ALTER PUBLICATION supabase_realtime ADD TABLE grid_events;


-- ════════════════════════════════════════════════════════════════════
-- PART I: Grant service_role access
-- ════════════════════════════════════════════════════════════════════

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;


-- ════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES
-- ════════════════════════════════════════════════════════════════════
-- SELECT count(*) FROM carbon_intensity_schedule;  -- Expected: 48 (24 × 2 regions)
-- SELECT * FROM carbon_intensity_schedule WHERE region_code = 'IN-BR' ORDER BY hour;
-- SELECT * FROM information_schema.columns WHERE table_name = 'homes' AND column_name IN ('autopilot_strategy', 'grid_protection_enabled');
-- SELECT * FROM information_schema.columns WHERE table_name = 'device_autopilot_config';
-- SELECT * FROM information_schema.columns WHERE table_name = 'grid_events';
-- SELECT * FROM information_schema.columns WHERE table_name = 'autopilot_saved_state';
