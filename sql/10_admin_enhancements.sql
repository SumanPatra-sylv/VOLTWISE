-- ============================================================
-- VOLTWISE — STEP 10: ADMIN DASHBOARD ENHANCEMENTS
-- ============================================================
-- Run in Supabase SQL Editor
-- Adds email to profiles and creates admin view function
-- ============================================================

-- ========================
-- Add email to profiles
-- ========================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Update existing profiles with email from auth.users
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- ========================
-- Update trigger to capture email on signup
-- ========================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, phone, consumer_number, role, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'consumerNumber',
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'consumer'),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================
-- RPC: Get all users for admin (includes email safely)
-- ========================
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
        WHERE status = 'completed'
        GROUP BY user_id
    ) r ON r.user_id = p.id
    ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================
-- RPC: Get admin dashboard stats
-- ========================
CREATE OR REPLACE FUNCTION get_admin_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
    total_recharge_amt NUMERIC;
    total_balance NUMERIC;
BEGIN
    -- Only allow admins
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Calculate recharge stats (fallback to sum of balances if no recharges)
    SELECT COALESCE(SUM(amount), 0) INTO total_recharge_amt FROM recharges;
    SELECT COALESCE(SUM(balance_amount), 0) INTO total_balance FROM meters WHERE is_active = true;
    
    -- Use balance total as fallback if no recharge records
    IF total_recharge_amt = 0 THEN
        total_recharge_amt := total_balance;
    END IF;

    SELECT json_build_object(
        'totalUsers', (SELECT COUNT(*) FROM profiles),
        'activeUsers', (SELECT COUNT(*) FROM profiles WHERE onboarding_done = true),
        'totalHomes', (SELECT COUNT(*) FROM homes),
        'totalRechargeAmount', total_recharge_amt,
        'avgBalance', COALESCE((SELECT AVG(balance_amount) FROM meters WHERE is_active = true), 0),
        'totalBalance', total_balance
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================
-- Grant execute permissions
-- ========================
GRANT EXECUTE ON FUNCTION get_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_stats() TO authenticated;
