-- ============================================================
-- Migration 15: Wipro 16A Smart Plug Enhancements
-- ============================================================
-- Adds columns needed for real Tuya LAN communication and
-- fast power snapshot queries. Also indexes plug_readings
-- for efficient time-series access and enables Realtime.
-- ============================================================

-- 1. Add local_key for LAN communication (avoids cloud dependency)
ALTER TABLE smart_plugs ADD COLUMN IF NOT EXISTS local_key TEXT;

-- 2. Add device_type to distinguish plug models
ALTER TABLE smart_plugs ADD COLUMN IF NOT EXISTS device_type TEXT DEFAULT 'wipro_16a';

-- 3. Add latest power snapshot columns for fast queries
--    (avoids joining plug_readings for simple status checks)
ALTER TABLE smart_plugs ADD COLUMN IF NOT EXISTS last_power_w NUMERIC(8,2) DEFAULT 0;
ALTER TABLE smart_plugs ADD COLUMN IF NOT EXISTS last_voltage NUMERIC(6,2) DEFAULT 0;
ALTER TABLE smart_plugs ADD COLUMN IF NOT EXISTS last_current_ma NUMERIC(8,2) DEFAULT 0;

-- 4. Index for fast time-series queries on plug_readings
--    (the poller inserts every 10s; the frontend queries by plug + time range)
CREATE INDEX IF NOT EXISTS idx_plug_readings_plug_time
  ON plug_readings(plug_id, timestamp DESC);

-- 5. Index for fast appliance → plug lookups during polling
CREATE INDEX IF NOT EXISTS idx_appliances_smart_plug_id
  ON appliances(smart_plug_id)
  WHERE smart_plug_id IS NOT NULL;

-- 6. Enable Supabase Realtime on plug_readings for live dashboard updates
--    This allows the frontend to subscribe to INSERT events via WebSocket
ALTER PUBLICATION supabase_realtime ADD TABLE plug_readings;

-- 7. RLS policy for plug_readings (users can read their own home's data)
ALTER TABLE plug_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_plug_readings" ON plug_readings FOR SELECT
  USING (
    plug_id IN (
      SELECT sp.id FROM smart_plugs sp
      JOIN homes h ON sp.home_id = h.id
      WHERE h.user_id = auth.uid()
    )
  );

-- 8. Grant service_role full access to new columns (for backend poller)
GRANT ALL ON plug_readings TO service_role;
GRANT ALL ON smart_plugs TO service_role;
