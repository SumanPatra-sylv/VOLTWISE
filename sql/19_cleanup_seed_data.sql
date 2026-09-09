-- ============================================================
-- VOLTWISE — CLEANUP SEED DATA
-- ============================================================
-- Run this to remove ALL seeded data from the admin seed script.
-- Uses the source='seed' and location='SEED_DATA' markers.
--
-- WARNING: This is destructive. It will remove seed data permanently.
-- Real user data is NOT affected (it has different markers).
-- ============================================================

-- Delete in reverse-dependency order to avoid FK violations

-- Time-series first (no FK dependencies on them)
DELETE FROM meter_readings  WHERE source = 'seed';
DELETE FROM daily_aggregates WHERE source = 'seed';

-- Billing & payments
DELETE FROM recharges WHERE source = 'seed';
DELETE FROM bills WHERE source = 'seed';

-- Carbon
DELETE FROM carbon_stats WHERE source = 'seed';

-- Complaints (updates first due to FK)
DELETE FROM complaint_updates WHERE complaint_id IN (
    SELECT id FROM complaints WHERE source = 'seed'
);
DELETE FROM complaints WHERE source = 'seed';

-- Schedules and recommendations (depend on appliances/homes)
DELETE FROM schedules WHERE home_id IN (
    SELECT h.id FROM homes h
    JOIN profiles p ON h.user_id = p.id
    WHERE p.location = 'SEED_DATA'
);
DELETE FROM recommendations WHERE home_id IN (
    SELECT h.id FROM homes h
    JOIN profiles p ON h.user_id = p.id
    WHERE p.location = 'SEED_DATA'
);
DELETE FROM control_logs WHERE user_id IN (
    SELECT id FROM profiles WHERE location = 'SEED_DATA'
);

-- Appliances (depend on homes)
DELETE FROM appliances WHERE home_id IN (
    SELECT h.id FROM homes h
    JOIN profiles p ON h.user_id = p.id
    WHERE p.location = 'SEED_DATA'
);

-- Meters (depend on homes)
DELETE FROM meters WHERE home_id IN (
    SELECT h.id FROM homes h
    JOIN profiles p ON h.user_id = p.id
    WHERE p.location = 'SEED_DATA'
);

-- Homes (depend on profiles)
DELETE FROM homes WHERE user_id IN (
    SELECT id FROM profiles WHERE location = 'SEED_DATA'
);

-- Profiles (will cascade from auth.users)
-- Note: We don't delete from auth.users here -- do that from Supabase dashboard if needed
DELETE FROM profiles WHERE location = 'SEED_DATA';


-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT COUNT(*) FROM profiles WHERE location = 'SEED_DATA';  -- Should be 0
-- SELECT COUNT(*) FROM recharges WHERE source = 'seed';  -- Should be 0
-- SELECT COUNT(*) FROM meter_readings WHERE source = 'seed';  -- Should be 0
-- SELECT COUNT(*) FROM complaints WHERE source = 'seed';  -- Should be 0
