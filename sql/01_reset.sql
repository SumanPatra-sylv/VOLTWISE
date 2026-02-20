-- ============================================================
-- VOLTWISE — STEP 1: NUCLEAR RESET
-- ============================================================
-- Drops ALL tables, enums, functions, triggers, storage.
-- Run this FIRST to get a clean slate.
-- After running: Table Editor sidebar should be EMPTY.
-- ============================================================

-- Drop all tables (reverse dependency order)
DROP TABLE IF EXISTS admin_audit_logs CASCADE;
DROP TABLE IF EXISTS complaint_updates CASCADE;
DROP TABLE IF EXISTS complaints CASCADE;
DROP TABLE IF EXISTS outage_notices CASCADE;
DROP TABLE IF EXISTS carbon_stats CASCADE;
DROP TABLE IF EXISTS user_challenges CASCADE;
DROP TABLE IF EXISTS challenges CASCADE;
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS achievements CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS recharges CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS bills CASCADE;
DROP TABLE IF EXISTS recommendations CASCADE;
DROP TABLE IF EXISTS automation_rules CASCADE;
DROP TABLE IF EXISTS control_logs CASCADE;
DROP TABLE IF EXISTS schedule_logs CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS daily_aggregates CASCADE;
DROP TABLE IF EXISTS nilm_results CASCADE;
DROP TABLE IF EXISTS plug_readings CASCADE;
DROP TABLE IF EXISTS meter_readings CASCADE;
DROP TABLE IF EXISTS appliances CASCADE;
DROP TABLE IF EXISTS smart_plugs CASCADE;
DROP TABLE IF EXISTS meters CASCADE;
DROP TABLE IF EXISTS homes CASCADE;
DROP TABLE IF EXISTS tariff_slabs CASCADE;
DROP TABLE IF EXISTS tariff_slots CASCADE;
DROP TABLE IF EXISTS tariff_plans CASCADE;
DROP TABLE IF EXISTS discoms CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Drop all enums
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS meter_type CASCADE;
DROP TYPE IF EXISTS tariff_category CASCADE;
DROP TYPE IF EXISTS appliance_status CASCADE;
DROP TYPE IF EXISTS appliance_source CASCADE;
DROP TYPE IF EXISTS plug_status CASCADE;
DROP TYPE IF EXISTS schedule_repeat CASCADE;
DROP TYPE IF EXISTS bill_status CASCADE;
DROP TYPE IF EXISTS payment_method CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS notif_type CASCADE;
DROP TYPE IF EXISTS complaint_type CASCADE;
DROP TYPE IF EXISTS complaint_status CASCADE;
DROP TYPE IF EXISTS slot_type CASCADE;
DROP TYPE IF EXISTS recommendation_type CASCADE;

-- Drop all custom functions
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;
DROP FUNCTION IF EXISTS get_dashboard_stats(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_consumption_breakdown(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS get_daily_trend(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS is_admin() CASCADE;
DROP FUNCTION IF EXISTS test_func() CASCADE;

-- Drop storage buckets
DELETE FROM storage.objects WHERE bucket_id IN ('bills', 'complaints');
DELETE FROM storage.buckets WHERE id IN ('bills', 'complaints');
