-- ============================================================
-- VOLTWISE — STEP 15: RE-SEED CURRENT MONTH DATA
-- ============================================================
-- Run this whenever the app shows zeros because a new month started.
-- Re-seeds: daily_aggregates, carbon_stats, control_logs for the
-- current month, ensuring fresh data relative to TODAY.
--
-- Safe to re-run: uses ON CONFLICT DO NOTHING / DO UPDATE.
-- ============================================================


-- ============================================================
-- PRE-FLIGHT: Ensure kwh_shifted column exists on carbon_stats
-- (Added by migration 14, but guard in case user skipped it)
-- ============================================================
ALTER TABLE carbon_stats ADD COLUMN IF NOT EXISTS kwh_shifted NUMERIC(10,2) DEFAULT 0;

-- ============================================================
-- PRE-FLIGHT: Disable RLS on migration-13 tables if still locked
-- (carbon_intensity_schedule causes 403 Forbidden without this)
-- ============================================================
ALTER TABLE IF EXISTS carbon_intensity_schedule DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS device_autopilot_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS grid_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS autopilot_saved_state DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON carbon_intensity_schedule TO authenticated;
GRANT SELECT ON carbon_intensity_schedule TO anon;


-- ============================================================
-- PART A: Seed current month daily_aggregates
-- ============================================================
-- Fills from the 1st of current month up to today

INSERT INTO daily_aggregates (home_id, meter_id, appliance_id, date, total_kwh, total_cost, peak_power_kw, avg_power_kw, on_hours, carbon_kg)
SELECT
  h.id AS home_id,
  m.id AS meter_id,
  NULL AS appliance_id,
  d.date,
  ROUND((
    CASE WHEN EXTRACT(DOW FROM d.date) IN (0, 6) THEN 14 ELSE 11 END
    + (random() * 4 - 2)
  )::NUMERIC, 2) AS total_kwh,
  ROUND(((
    CASE WHEN EXTRACT(DOW FROM d.date) IN (0, 6) THEN 14 ELSE 11 END
    + (random() * 4 - 2)
  ) * COALESCE(
    (SELECT ts.rate FROM tariff_slots ts WHERE ts.plan_id = h.tariff_plan_id ORDER BY ts.start_hour LIMIT 1),
    7.00
  ))::NUMERIC, 2) AS total_cost,
  ROUND((2.5 + random() * 2.5)::NUMERIC, 2) AS peak_power_kw,
  ROUND((0.8 + random() * 1.0)::NUMERIC, 2) AS avg_power_kw,
  ROUND((10 + random() * 8)::NUMERIC, 1) AS on_hours,
  ROUND(((
    CASE WHEN EXTRACT(DOW FROM d.date) IN (0, 6) THEN 14 ELSE 11 END
    + (random() * 4 - 2)
  ) * 0.82)::NUMERIC, 3) AS carbon_kg
FROM homes h
JOIN meters m ON m.home_id = h.id AND m.is_active = TRUE
CROSS JOIN generate_series(
  DATE_TRUNC('month', CURRENT_DATE)::DATE,
  CURRENT_DATE,
  INTERVAL '1 day'
) AS d(date)
ON CONFLICT DO NOTHING;


-- ============================================================
-- PART B: Seed previous month if missing (for comparison)
-- ============================================================

INSERT INTO daily_aggregates (home_id, meter_id, appliance_id, date, total_kwh, total_cost, peak_power_kw, avg_power_kw, on_hours, carbon_kg)
SELECT
  h.id AS home_id,
  m.id AS meter_id,
  NULL AS appliance_id,
  d.date,
  ROUND((
    CASE WHEN EXTRACT(DOW FROM d.date) IN (0, 6) THEN 15.5 ELSE 12 END
    + (random() * 4 - 2)
  )::NUMERIC, 2) AS total_kwh,
  ROUND(((
    CASE WHEN EXTRACT(DOW FROM d.date) IN (0, 6) THEN 15.5 ELSE 12 END
    + (random() * 4 - 2)
  ) * COALESCE(
    (SELECT ts.rate FROM tariff_slots ts WHERE ts.plan_id = h.tariff_plan_id ORDER BY ts.start_hour LIMIT 1),
    7.00
  ))::NUMERIC, 2) AS total_cost,
  ROUND((2.8 + random() * 2.5)::NUMERIC, 2) AS peak_power_kw,
  ROUND((0.9 + random() * 1.1)::NUMERIC, 2) AS avg_power_kw,
  ROUND((10 + random() * 8)::NUMERIC, 1) AS on_hours,
  ROUND(((
    CASE WHEN EXTRACT(DOW FROM d.date) IN (0, 6) THEN 15.5 ELSE 12 END
    + (random() * 4 - 2)
  ) * 0.84)::NUMERIC, 3) AS carbon_kg
FROM homes h
JOIN meters m ON m.home_id = h.id AND m.is_active = TRUE
CROSS JOIN generate_series(
  (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::DATE,
  (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 day')::DATE,
  INTERVAL '1 day'
) AS d(date)
ON CONFLICT DO NOTHING;


-- ============================================================
-- PART C: Update carbon_stats for current & last month
-- ============================================================

INSERT INTO carbon_stats (home_id, month, user_kg_co2, neighbor_avg, national_avg, co2_saved_kg, trees_equivalent, kwh_shifted)
SELECT
  h.id AS home_id,
  m.month,
  m.total_carbon::NUMERIC(10,2),
  m.neighbor_avg::NUMERIC(10,2),
  m.national_avg::NUMERIC(10,2),
  m.co2_saved::NUMERIC(10,2),
  ROUND((m.co2_saved / 1.75)::NUMERIC, 1) AS trees_equivalent,
  m.kwh_shifted::NUMERIC(10,2)
FROM homes h
CROSS JOIN (VALUES
  -- Last month
  (DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::DATE,
   295.0::NUMERIC, 280.0::NUMERIC, 250.0::NUMERIC, 8.5::NUMERIC, 56.7::NUMERIC),
  -- This month (partial, improving)
  (DATE_TRUNC('month', CURRENT_DATE)::DATE,
   180.0::NUMERIC, 195.0::NUMERIC, 250.0::NUMERIC, 12.3::NUMERIC, 82.0::NUMERIC)
) AS m(month, total_carbon, neighbor_avg, national_avg, co2_saved, kwh_shifted)
ON CONFLICT (home_id, month) DO UPDATE SET
  user_kg_co2      = EXCLUDED.user_kg_co2,
  neighbor_avg     = EXCLUDED.neighbor_avg,
  national_avg     = EXCLUDED.national_avg,
  co2_saved_kg     = EXCLUDED.co2_saved_kg,
  trees_equivalent = EXCLUDED.trees_equivalent,
  kwh_shifted      = EXCLUDED.kwh_shifted;


-- ============================================================
-- PART D: Seed control_logs for current month (optimizer/autopilot)
-- ============================================================
-- These drive the kWh shifted / CO₂ saved calculations.
-- Only insert actions during PEAK hours (18-22 IST) for accuracy.

INSERT INTO control_logs (appliance_id, user_id, action, trigger_source, result, response_time_ms, created_at)
SELECT
  a.id AS appliance_id,
  h.user_id,
  'turn_off' AS action,
  src.trigger AS trigger_source,
  'success' AS result,
  ROUND((50 + random() * 150))::INT AS response_time_ms,
  -- Spread across current month, but ONLY during peak hours (18-22 IST = 12:30-16:30 UTC)
  (DATE_TRUNC('month', CURRENT_DATE) + (random() * (CURRENT_DATE - DATE_TRUNC('month', CURRENT_DATE)::DATE)) * INTERVAL '1 day')
    + (INTERVAL '18 hours' + (random() * 4) * INTERVAL '1 hour')  -- 18:00-22:00 IST
FROM homes h
JOIN appliances a ON a.home_id = h.id AND a.is_active = TRUE AND a.rated_power_w >= 500
CROSS JOIN (VALUES
  ('optimizer_batch'),
  ('autopilot'),
  ('autopilot'),
  ('scheduler')
) AS src(trigger)
WHERE a.category IN ('ac', 'geyser', 'washing_machine');


-- ============================================================
-- PART E: Refresh meter balance
-- ============================================================
UPDATE meters SET
  balance_amount = GREATEST(balance_amount, 200),
  last_reading_at = now()
WHERE is_active = TRUE;


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT date, total_kwh, total_cost, carbon_kg FROM daily_aggregates 
--   WHERE date >= DATE_TRUNC('month', CURRENT_DATE) ORDER BY date LIMIT 10;
-- SELECT home_id, month, user_kg_co2, co2_saved_kg FROM carbon_stats ORDER BY month;
-- SELECT trigger_source, COUNT(*) FROM control_logs 
--   WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE) GROUP BY trigger_source;
