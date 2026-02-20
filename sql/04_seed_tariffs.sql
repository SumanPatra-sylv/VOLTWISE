-- ============================================================
-- VOLTWISE — STEP 4: SEED TARIFF DATA
-- ============================================================
-- Run AFTER 02_setup.sql
-- Seeds DISCOMs + real 2025-26 tariff rates + ToD simulation.
-- PoC scope: SBPDCL (Bihar South) + MGVCL (Gujarat Central)
-- ============================================================


-- ========================
-- FIXED UUIDs (for cross-referencing in later seed scripts)
-- ========================
-- SBPDCL DISCOM:  d1000000-0000-0000-0000-000000000001
-- MGVCL DISCOM:   d1000000-0000-0000-0000-000000000002
-- SBPDCL Plan:    p1000000-0000-0000-0000-000000000001
-- MGVCL Plan:     p1000000-0000-0000-0000-000000000002


-- ============================================================
-- PART A: DISCOMs
-- ============================================================

INSERT INTO discoms (id, code, name, state, state_code, consumer_number_length, consumer_number_hint) VALUES
  ('d1000000-0000-0000-0000-000000000001',
   'SBPDCL',
   'South Bihar Power Distribution Company Ltd.',
   'Bihar', 'BR',
   12,
   'Enter your 12-digit SBPDCL consumer number'),

  ('d1000000-0000-0000-0000-000000000002',
   'MGVCL',
   'Madhya Gujarat Vij Company Ltd.',
   'Gujarat', 'GJ',
   11,
   'Enter your 11-digit MGVCL service number');


-- ============================================================
-- PART B: TARIFF PLANS (one per DISCOM, residential prepaid)
-- ============================================================

-- SBPDCL Residential Prepaid 2025-26
-- Source: Bihar Electricity Regulatory Commission (BERC)
-- Fixed charge: ₹50/kW/month → daily deduction = (50 × sanctioned_kw) / 30
INSERT INTO tariff_plans (id, discom_id, name, state, category, fixed_charge_per_kw, is_active, effective_from) VALUES
  ('p1000000-0000-0000-0000-000000000001',
   'd1000000-0000-0000-0000-000000000001',
   'SBPDCL Domestic DS-I 2025-26',
   'Bihar',
   'residential',
   50.00,
   true,
   '2025-04-01');

-- MGVCL Residential Prepaid 2025-26
-- Source: Gujarat Electricity Regulatory Commission (GERC)
-- Fixed charge: ₹0/kW (Gujarat doesn't charge fixed for residential prepaid)
INSERT INTO tariff_plans (id, discom_id, name, state, category, fixed_charge_per_kw, is_active, effective_from) VALUES
  ('p1000000-0000-0000-0000-000000000002',
   'd1000000-0000-0000-0000-000000000002',
   'MGVCL RGP Prepaid 2025-26',
   'Gujarat',
   'residential',
   0.00,
   true,
   '2025-04-01');


-- ============================================================
-- PART C: TARIFF SLABS
-- ============================================================
-- Rules: from_kwh is INCLUSIVE, to_kwh is EXCLUSIVE, NULL = infinity.
-- Engine logic: find slab where from_kwh <= monthly_cumulative < to_kwh

-- SBPDCL slabs (Bihar — 2 tiers)
INSERT INTO tariff_slabs (plan_id, from_kwh, to_kwh, rate_per_kwh, display_order) VALUES
  ('p1000000-0000-0000-0000-000000000001', 0,   100,  7.42, 1),
  ('p1000000-0000-0000-0000-000000000001', 100, NULL,  7.96, 2);

-- MGVCL slabs (Gujarat — 3 tiers, prepaid rates)
INSERT INTO tariff_slabs (plan_id, from_kwh, to_kwh, rate_per_kwh, display_order) VALUES
  ('p1000000-0000-0000-0000-000000000002', 0,   100,  3.20, 1),
  ('p1000000-0000-0000-0000-000000000002', 100, 250,  4.07, 2),
  ('p1000000-0000-0000-0000-000000000002', 250, NULL, 5.10, 3);


-- ============================================================
-- PART D: ToD SLOTS (VoltWise simulation — NOT actual billing)
-- ============================================================
-- Rates derived from each plan's slab rates:
--   Off-peak = lowest_slab_rate × 0.85
--   Normal   = lowest_slab_rate × 1.00
--   Peak     = highest_slab_rate × 1.20
-- These drive the optimization engine and dashboard slot display.

-- SBPDCL ToD (simulation)
-- lowest = 7.42, highest = 7.96
-- off-peak = 7.42 × 0.85 = 6.31, normal = 7.42, peak = 7.96 × 1.20 = 9.55
INSERT INTO tariff_slots (plan_id, hour_label, start_hour, end_hour, rate, slot_type) VALUES
  ('p1000000-0000-0000-0000-000000000001', 'Off-Peak (10 PM – 6 AM)', 22, 6,  6.31, 'off-peak'),
  ('p1000000-0000-0000-0000-000000000001', 'Normal (6 AM – 6 PM)',     6, 18, 7.42, 'normal'),
  ('p1000000-0000-0000-0000-000000000001', 'Peak (6 PM – 10 PM)',     18, 22, 9.55, 'peak');

-- MGVCL ToD (simulation)
-- lowest = 3.20, highest = 5.10
-- off-peak = 3.20 × 0.85 = 2.72, normal = 3.20, peak = 5.10 × 1.20 = 6.12
INSERT INTO tariff_slots (plan_id, hour_label, start_hour, end_hour, rate, slot_type) VALUES
  ('p1000000-0000-0000-0000-000000000002', 'Off-Peak (10 PM – 6 AM)', 22, 6,  2.72, 'off-peak'),
  ('p1000000-0000-0000-0000-000000000002', 'Normal (6 AM – 6 PM)',     6, 18, 3.20, 'normal'),
  ('p1000000-0000-0000-0000-000000000002', 'Peak (6 PM – 10 PM)',     18, 22, 6.12, 'peak');


-- ============================================================
-- VERIFICATION QUERIES (run these after seeding)
-- ============================================================
-- SELECT count(*) FROM discoms;          -- Expected: 2
-- SELECT count(*) FROM tariff_plans;     -- Expected: 2
-- SELECT count(*) FROM tariff_slabs;     -- Expected: 5 (2 + 3)
-- SELECT count(*) FROM tariff_slots;     -- Expected: 6 (3 + 3)
--
-- -- Check SBPDCL plan with slabs:
-- SELECT tp.name, ts.from_kwh, ts.to_kwh, ts.rate_per_kwh
-- FROM tariff_plans tp
-- JOIN tariff_slabs ts ON ts.plan_id = tp.id
-- WHERE tp.state = 'Bihar'
-- ORDER BY ts.display_order;
--
-- -- Check MGVCL ToD slots:
-- SELECT tp.name, tsl.slot_type, tsl.rate
-- FROM tariff_plans tp
-- JOIN tariff_slots tsl ON tsl.plan_id = tp.id
-- WHERE tp.state = 'Gujarat'
-- ORDER BY tsl.start_hour;
-- ============================================================
