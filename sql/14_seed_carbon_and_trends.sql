-- ============================================================
-- VOLTWISE — STEP 14: SEED CARBON STATS, TRENDS & OPTIMIZATION DATA
-- ============================================================
-- Run AFTER 13_autopilot_v2_migration.sql
-- Seeds:
--   1. Last month's daily_aggregates (for vs-last-month comparison)
--   2. carbon_stats table (neighbor_avg, national_avg, co2_saved)
--   3. control_logs with optimizer/autopilot actions (for CO₂ savings calc)
--   4. Update profiles with household_members if missing (column is on profiles, not homes)
-- ============================================================


-- ============================================================
-- PART A: Seed LAST MONTH's daily_aggregates
-- ============================================================
-- The existing seed (06_seed_usage.sql) only seeds current 30 days.
-- We need last month data for the "vs last month %" comparison on Rewards.

INSERT INTO daily_aggregates (home_id, meter_id, appliance_id, date, total_kwh, total_cost, peak_power_kw, avg_power_kw, on_hours, carbon_kg)
SELECT
  h.id AS home_id,
  m.id AS meter_id,
  NULL AS appliance_id,
  d.date,
  -- Last month: slightly higher usage (to show improvement trend)
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
  -- Carbon: slightly higher last month (0.84 factor vs 0.82 current)
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
-- PART B: Seed carbon_stats table
-- ============================================================
-- carbon_stats was created in 02_setup.sql with columns:
--   user_kg_co2, neighbor_avg, national_avg, trees_equivalent, co2_saved_kg
-- We add kwh_shifted if it doesn't exist yet, then seed 3 months of data.

ALTER TABLE carbon_stats ADD COLUMN IF NOT EXISTS kwh_shifted NUMERIC(10,2) DEFAULT 0;

-- Seed last 3 months of carbon_stats
-- Column mapping (02_setup.sql schema):
--   user_kg_co2     = total household CO2 this month
--   neighbor_avg    = avg neighborhood emission
--   national_avg    = national average
--   co2_saved_kg    = CO2 saved via optimization
--   trees_equivalent = co2_saved / 1.75 kg per tree per month
--   kwh_shifted     = kWh shifted from peak to off-peak
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
  -- 2 months ago: higher usage, less optimization
  (DATE_TRUNC('month', CURRENT_DATE - INTERVAL '2 months')::DATE,
   320.0::NUMERIC, 285.0::NUMERIC, 250.0::NUMERIC, 4.2::NUMERIC, 28.0::NUMERIC),
  -- Last month: moderate, some optimization started
  (DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')::DATE,
   295.0::NUMERIC, 280.0::NUMERIC, 250.0::NUMERIC, 8.5::NUMERIC, 56.7::NUMERIC),
  -- This month (partial): improving
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
-- PART C: Seed control_logs for optimization tracking
-- ============================================================
-- These logs allow getCarbonDashboard() to calculate real CO₂ savings
-- by counting optimizer_batch and autopilot turn_off actions

INSERT INTO control_logs (appliance_id, user_id, action, trigger_source, result, response_time_ms, created_at)
SELECT
  a.id AS appliance_id,
  h.user_id,
  'turn_off' AS action,
  src.trigger AS trigger_source,
  'success' AS result,
  ROUND((50 + random() * 150))::INT AS response_time_ms,
  -- Spread over current month
  DATE_TRUNC('month', CURRENT_DATE) + (random() * (CURRENT_DATE - DATE_TRUNC('month', CURRENT_DATE)::DATE)) * INTERVAL '1 day'
    + (random() * 24) * INTERVAL '1 hour'
FROM homes h
JOIN appliances a ON a.home_id = h.id AND a.is_active = TRUE AND a.rated_power_w >= 500
CROSS JOIN (VALUES
  ('optimizer_batch'),
  ('optimizer_batch'),
  ('autopilot'),
  ('autopilot'),
  ('scheduler')
) AS src(trigger)
WHERE a.category IN ('ac', 'geyser', 'washing_machine');


-- ============================================================
-- PART D: Ensure household_members is set
-- household_members lives on the profiles table (see 02_setup.sql line 46), NOT homes
-- ============================================================
UPDATE profiles SET household_members = 4
WHERE household_members IS NULL OR household_members = 0;


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT home_id, month, user_kg_co2, co2_saved_kg, trees_equivalent FROM carbon_stats ORDER BY month;
-- SELECT trigger_source, COUNT(*) FROM control_logs WHERE trigger_source IN ('optimizer_batch', 'autopilot', 'scheduler') GROUP BY trigger_source;
-- SELECT COUNT(*) FROM daily_aggregates WHERE date < DATE_TRUNC('month', CURRENT_DATE);
