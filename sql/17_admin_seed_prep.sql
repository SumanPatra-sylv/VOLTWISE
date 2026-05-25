-- ============================================================
-- VOLTWISE — STEP 17: ADMIN SEED PREPARATION
-- ============================================================
-- Run BEFORE the seed_admin_data.py script.
-- Adds source columns for seed tracking, fixes bugs, adds
-- missing indexes required by adminside.md.
--
-- Safe to re-run (all statements are idempotent).
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- PART A: Add 'source' columns for seed data tracking
-- ════════════════════════════════════════════════════════════════
-- adminside.md requires seed rows to be tagged with source = 'seed'
-- so they can be filtered or cleaned later.

ALTER TABLE recharges       ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'app';
ALTER TABLE meter_readings  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'meter';
ALTER TABLE daily_aggregates ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'system';
ALTER TABLE complaints      ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'user';
ALTER TABLE bills           ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'system';
ALTER TABLE carbon_stats    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'system';


-- ════════════════════════════════════════════════════════════════
-- PART B: Fix get_admin_users() RPC — status bug
-- ════════════════════════════════════════════════════════════════
-- BUG: Original filters WHERE status = 'completed' but payment_status
-- enum only has: 'success', 'failed', 'pending', 'refunded'
-- This causes recharge_count and recharge_total to always return 0.

CREATE OR REPLACE FUNCTION get_admin_users()
RETURNS TABLE (
    id UUID,
    name TEXT,
    email TEXT,
    phone TEXT,
    consumer_number TEXT,
    role user_role,
    onboarding_done BOOLEAN,
    created_at TIMESTAMPTZ,
    home_name TEXT,
    meter_number TEXT,
    balance NUMERIC,
    total_recharges BIGINT,
    total_recharge_amount NUMERIC
) AS $$
BEGIN
    -- Only allow admins
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.name,
        COALESCE(p.email, u.email) AS email,
        p.phone,
        p.consumer_number,
        p.role,
        p.onboarding_done,
        p.created_at,
        h.name AS home_name,
        m.meter_number,
        COALESCE(m.balance_amount, 0) AS balance,
        COALESCE(r.recharge_count, 0) AS total_recharges,
        COALESCE(r.recharge_total, 0) AS total_recharge_amount
    FROM profiles p
    LEFT JOIN auth.users u ON p.id = u.id
    LEFT JOIN homes h ON h.user_id = p.id AND h.is_primary = true
    LEFT JOIN meters m ON m.home_id = h.id AND m.is_active = true
    LEFT JOIN (
        SELECT
            user_id,
            COUNT(*) AS recharge_count,
            SUM(amount) AS recharge_total
        FROM recharges
        WHERE status = 'success'   -- ← FIXED: was 'completed'
        GROUP BY user_id
    ) r ON r.user_id = p.id
    ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ════════════════════════════════════════════════════════════════
-- PART C: Add recharge performance indexes (from adminside.md)
-- ════════════════════════════════════════════════════════════════
-- These are defined in 16_add_recharge_index.sql but may not have
-- been applied. Re-creating with IF NOT EXISTS for safety.

CREATE INDEX IF NOT EXISTS idx_recharges_user_paid_at
    ON recharges(user_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_recharges_paid_at_status
    ON recharges(paid_at DESC, status);

-- Index for source-based cleanup
CREATE INDEX IF NOT EXISTS idx_profiles_location
    ON profiles(location);


-- ════════════════════════════════════════════════════════════════
-- PART D: Grant permissions (ensure service_role access)
-- ════════════════════════════════════════════════════════════════
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

GRANT EXECUTE ON FUNCTION get_admin_users() TO authenticated;


-- ════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════
-- Check source columns exist:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'recharges' AND column_name = 'source';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'meter_readings' AND column_name = 'source';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'complaints' AND column_name = 'source';
--
-- Verify fixed RPC:
-- SELECT prosrc FROM pg_proc WHERE proname = 'get_admin_users';
-- Should contain "status = 'success'" not "status = 'completed'"
