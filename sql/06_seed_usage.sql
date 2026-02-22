-- ============================================================
-- VOLTWISE — STEP 6: SEED DEMO USAGE DATA
-- ============================================================
-- Run AFTER 05_consumer_master.sql
-- Seeds: meter balance, daily_aggregates (30 days), appliances
-- for the FIRST user who completed onboarding.
-- ============================================================


-- ============================================================
-- PART A: Update meter with realistic balance for demo
-- ============================================================
-- Sets a realistic prepaid balance for all meters created during onboarding
-- (they start at 0 because onboarding sets balance_amount = 0)

UPDATE meters SET
  balance_amount = 550,
  last_recharge_amount = 2000,
  last_recharge_date = CURRENT_DATE - INTERVAL '19 days',
  last_reading_at = now()
WHERE is_active = TRUE;


-- ============================================================
-- PART B: Seed 30 days of daily_aggregates
-- ============================================================
-- Only seeds for homes that have meters (i.e., completed onboarding)
-- Each day has realistic kWh (8–18) and cost based on tariff rate
-- Weekends get slightly higher usage

INSERT INTO daily_aggregates (home_id, meter_id, appliance_id, date, total_kwh, total_cost, peak_power_kw, avg_power_kw, on_hours, carbon_kg)
SELECT
  h.id AS home_id,
  m.id AS meter_id,
  NULL AS appliance_id,  -- NULL = whole-home aggregate
  d.date,
  -- Realistic daily kWh: 8-18, higher on weekends
  ROUND((
    CASE WHEN EXTRACT(DOW FROM d.date) IN (0, 6) THEN 14 ELSE 11 END  -- base
    + (random() * 4 - 2)  -- ±2 kWh variance
  )::NUMERIC, 2) AS total_kwh,
  -- Cost = kWh × average rate (≈7.50 for SBPDCL, ≈4.00 for MGVCL)
  ROUND((
    CASE WHEN EXTRACT(DOW FROM d.date) IN (0, 6) THEN 14 ELSE 11 END
    + (random() * 4 - 2)
  ) * COALESCE(
    (SELECT ts.rate_per_kwh FROM tariff_slabs ts WHERE ts.plan_id = h.tariff_plan_id AND ts.display_order = 1),
    7.00
  ), 2) AS total_cost,
  -- Peak power: 2-5 kW
  ROUND((2.5 + random() * 2.5)::NUMERIC, 2) AS peak_power_kw,
  -- Average power: 0.8-1.8 kW
  ROUND((0.8 + random() * 1.0)::NUMERIC, 2) AS avg_power_kw,
  -- On hours: 10-18
  ROUND((10 + random() * 8)::NUMERIC, 1) AS on_hours,
  -- Carbon: 0.82 kg CO2 per kWh (India grid average)
  ROUND((
    CASE WHEN EXTRACT(DOW FROM d.date) IN (0, 6) THEN 14 ELSE 11 END
    + (random() * 4 - 2)
  ) * 0.82, 3) AS carbon_kg
FROM homes h
JOIN meters m ON m.home_id = h.id AND m.is_active = TRUE
CROSS JOIN generate_series(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, INTERVAL '1 day') AS d(date)
ON CONFLICT DO NOTHING;


-- ============================================================
-- PART C: Seed demo appliances
-- ============================================================
-- Creates realistic appliances for all onboarded homes

INSERT INTO appliances (home_id, name, icon, rated_power_w, status, category, is_controllable, message, saving_potential)
SELECT
  h.id,
  a.name, a.icon, a.rated_power, a.status::appliance_status, a.cat::appliance_category, a.ctrl, a.msg, a.saving
FROM homes h
CROSS JOIN (VALUES
  ('AC - Living Room',   'wind',        1500, 'ON',      'ac',              true,  'Peak Hour! +₹3.20/hr extra', 32),
  ('Geyser',             'thermometer', 2000, 'WARNING', 'geyser',          true,  'Expensive! Shift to 6 AM',   14),
  ('Refrigerator',       'zap',          200, 'ON',      'refrigerator',    false, 'Running efficiently',          0),
  ('TV - Bedroom',       'tv',           120, 'OFF',     'tv',              true,  NULL,                           0),
  ('Washing Machine',    'zap',          500, 'OFF',     'washing_machine', true,  NULL,                           8),
  ('Ceiling Fan',        'wind',          75, 'ON',      'fan',             true,  'Low consumption',              0)
) AS a(name, icon, rated_power, status, cat, ctrl, msg, saving)
ON CONFLICT DO NOTHING;


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT count(*) FROM daily_aggregates;    -- Expected: ~31 per home
-- SELECT count(*) FROM appliances;          -- Expected: 6 per home
-- SELECT balance_amount, last_recharge_amount, last_recharge_date FROM meters WHERE is_active;
