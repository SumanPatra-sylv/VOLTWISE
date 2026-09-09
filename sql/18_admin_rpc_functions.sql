-- ============================================================
-- VOLTWISE — STEP 18: ADMIN RPC FUNCTIONS
-- ============================================================
-- Run AFTER seed_admin_data.py has populated the database.
-- Creates RPC functions used by the admin dashboard and
-- consumer profile pages.
--
-- Functions:
--   1. get_admin_dashboard_stats()  — Module 1 Executive Dashboard KPIs
--   2. get_consumer_profile(UUID)   — Module 2 Consumer deep-dive
--   3. get_revenue_stats(TEXT,DATE)  — Module 3 Revenue analytics
--   4. get_meter_health_stats()     — Module 7 Meter health
--
-- Safe to re-run (uses CREATE OR REPLACE).
-- ============================================================


-- ════════════════════════════════════════════════════════════════
-- FUNCTION 1: get_admin_dashboard_stats()
-- ════════════════════════════════════════════════════════════════
-- Returns all Module 1 KPIs in a single JSON object.
-- Called by: GET /api/admin/dashboard (FastAPI) and
--            supabase.rpc('get_admin_dashboard_stats') (frontend)

CREATE OR REPLACE FUNCTION get_admin_dashboard_stats()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    IF NOT is_admin() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT json_build_object(
        -- Consumer counts
        'total_consumers',         (SELECT COUNT(*) FROM profiles WHERE role = 'consumer'),
        'total_app_users',         (SELECT COUNT(*) FROM profiles WHERE onboarding_done = TRUE),

        -- Meter counts
        'active_meters',           (SELECT COUNT(*) FROM meters WHERE is_active = TRUE),
        'offline_meters',          (SELECT COUNT(*) FROM meters WHERE is_active = TRUE
                                     AND last_reading_at < now() - INTERVAL '24 hours'),
        'stale_meters',            (SELECT COUNT(*) FROM meters WHERE is_active = TRUE
                                     AND last_reading_at < now() - INTERVAL '6 hours'
                                     AND last_reading_at >= now() - INTERVAL '24 hours'),

        -- Appliance count
        'total_linked_appliances', (SELECT COUNT(*) FROM appliances WHERE is_active = TRUE),

        -- Revenue (prepaid recharges only)
        'today_revenue',           (SELECT COALESCE(SUM(amount), 0) FROM recharges
                                     WHERE status = 'success' AND paid_at >= CURRENT_DATE),
        'monthly_revenue',         (SELECT COALESCE(SUM(amount), 0) FROM recharges
                                     WHERE status = 'success'
                                     AND paid_at >= date_trunc('month', now())),
        'active_rechargers_7d',    (SELECT COUNT(DISTINCT user_id) FROM recharges
                                     WHERE status = 'success'
                                     AND paid_at > now() - INTERVAL '7 days'),

        -- Balance health
        'critical_balance_users',  (SELECT COUNT(*) FROM meters
                                     WHERE balance_amount < 50 AND is_active = TRUE),
        'low_balance_users',       (SELECT COUNT(*) FROM meters
                                     WHERE balance_amount >= 50 AND balance_amount < 200
                                     AND is_active = TRUE),
        'avg_balance',             (SELECT COALESCE(ROUND(AVG(balance_amount)::NUMERIC, 2), 0)
                                     FROM meters WHERE is_active = TRUE),

        -- Load (today)
        'peak_load_today',         (SELECT COALESCE(MAX(power_kw), 0) FROM meter_readings
                                     WHERE timestamp >= CURRENT_DATE),

        -- Tariff (current hour)
        'current_tariff_slot',     (SELECT slot_type::TEXT FROM tariff_slots ts
                                     JOIN tariff_plans tp ON ts.plan_id = tp.id
                                     WHERE tp.is_active = TRUE
                                     AND (
                                       CASE WHEN ts.start_hour < ts.end_hour
                                         THEN EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Kolkata') >= ts.start_hour
                                              AND EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Kolkata') < ts.end_hour
                                         ELSE EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Kolkata') >= ts.start_hour
                                              OR EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Kolkata') < ts.end_hour
                                       END
                                     )
                                     LIMIT 1),

        -- Complaints
        'pending_complaints',      (SELECT COUNT(*) FROM complaints
                                     WHERE status NOT IN ('resolved', 'closed')),
        'avg_resolution_hours',    (SELECT COALESCE(
                                     ROUND(EXTRACT(EPOCH FROM AVG(resolved_at - created_at)) / 3600, 1), 0)
                                     FROM complaints WHERE resolved_at IS NOT NULL),

        -- Savings (from bills.savings_amount)
        'total_savings',           (SELECT COALESCE(SUM(savings_amount), 0) FROM bills),

        -- Carbon (current month)
        'co2_saved_this_month',    (SELECT COALESCE(SUM(co2_saved_kg), 0) FROM carbon_stats
                                     WHERE month >= date_trunc('month', CURRENT_DATE)),

        -- Non-recharging users
        'non_recharging_30d',      (SELECT COUNT(*) FROM meters
                                     WHERE is_active = TRUE
                                     AND last_recharge_date < now() - INTERVAL '30 days'),
        'non_recharging_45d',      (SELECT COUNT(*) FROM meters
                                     WHERE is_active = TRUE
                                     AND last_recharge_date < now() - INTERVAL '45 days')
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ════════════════════════════════════════════════════════════════
-- FUNCTION 2: get_consumer_profile(p_user_id UUID)
-- ════════════════════════════════════════════════════════════════
-- Returns complete consumer profile for admin deep-dive view.
-- Single round-trip returning profile, home, meter, tariff,
-- appliances, recharge stats, recent recharges, complaints,
-- 30-day usage, and 6-month trends.

CREATE OR REPLACE FUNCTION get_consumer_profile(p_user_id UUID)
RETURNS JSON AS $$
DECLARE result JSON;
BEGIN
    IF NOT is_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;

    SELECT json_build_object(
        'profile',          (SELECT row_to_json(p) FROM (
                                SELECT id, name, email, phone, consumer_number,
                                       avatar_url, location, household_members,
                                       onboarding_done, role, created_at
                                FROM profiles WHERE id = p_user_id) p),

        'home',             (SELECT row_to_json(h) FROM (
                                SELECT id, name, address, city, state, pincode, area,
                                       feeder_id, tariff_category, tariff_plan_id,
                                       sanctioned_load_kw, autopilot_enabled,
                                       autopilot_strategy, grid_protection_enabled, is_primary, created_at
                                FROM homes WHERE user_id = p_user_id AND is_primary = TRUE LIMIT 1) h),

        'meter',            (SELECT row_to_json(m) FROM (
                                SELECT me.id, me.meter_number, me.meter_type, me.is_active,
                                       me.balance_amount, me.last_recharge_amount,
                                       me.last_recharge_date, me.last_reading_at,
                                       me.manufacturer, me.installation_date
                                FROM meters me
                                JOIN homes hm ON me.home_id = hm.id
                                WHERE hm.user_id = p_user_id AND me.is_active = TRUE LIMIT 1) m),

        'tariff',           (SELECT row_to_json(t) FROM (
                                SELECT tp.name, tp.category, tp.fixed_charge_per_kw,
                                       d.name AS discom_name, d.code AS discom_code, d.state
                                FROM tariff_plans tp
                                JOIN discoms d ON d.id = tp.discom_id
                                JOIN homes hm ON hm.tariff_plan_id = tp.id
                                WHERE hm.user_id = p_user_id AND hm.is_primary = TRUE LIMIT 1) t),

        'appliances',       (SELECT json_agg(a ORDER BY a.sort_order) FROM (
                                SELECT ap.id, ap.name, ap.icon, ap.category, ap.status,
                                       ap.rated_power_w, ap.current_power_w, ap.is_active,
                                       ap.optimization_tier, ap.source, ap.eco_mode_enabled,
                                       ap.sort_order
                                FROM appliances ap
                                JOIN homes hm ON ap.home_id = hm.id
                                WHERE hm.user_id = p_user_id AND ap.is_active = TRUE) a),

        'recharge_stats',   (SELECT row_to_json(rs) FROM (
                                SELECT COUNT(*)                       AS total_count,
                                       COALESCE(SUM(amount),   0)    AS total_amount,
                                       COALESCE(AVG(amount),   0)    AS avg_amount,
                                       MAX(paid_at)                  AS last_recharge_at,
                                       MIN(paid_at)                  AS first_recharge_at
                                FROM recharges
                                WHERE user_id = p_user_id AND status = 'success') rs),

        'recent_recharges', (SELECT json_agg(r) FROM (
                                SELECT id, amount, method, units_credited,
                                       balance_after, paid_at
                                FROM recharges
                                WHERE user_id = p_user_id AND status = 'success'
                                ORDER BY paid_at DESC LIMIT 5) r),

        'open_complaints',  (SELECT json_agg(c) FROM (
                                SELECT id, type, subject, status, priority,
                                       assigned_to, created_at
                                FROM complaints
                                WHERE user_id = p_user_id
                                  AND status NOT IN ('resolved', 'closed')
                                ORDER BY created_at DESC) c),

        'usage_30d',        (SELECT json_agg(da) FROM (
                                SELECT date, total_kwh, total_cost, peak_power_kw
                                FROM daily_aggregates da
                                JOIN homes hm ON da.home_id = hm.id
                                WHERE hm.user_id = p_user_id
                                  AND da.appliance_id IS NULL
                                  AND date >= CURRENT_DATE - INTERVAL '30 days'
                                ORDER BY date DESC) da),

        'monthly_usage',    (SELECT json_agg(mu) FROM (
                                SELECT date_trunc('month', date)::date AS month,
                                       SUM(total_kwh) AS kwh,
                                       SUM(total_cost) AS cost
                                FROM daily_aggregates da
                                JOIN homes hm ON da.home_id = hm.id
                                WHERE hm.user_id = p_user_id
                                  AND da.appliance_id IS NULL
                                  AND date >= CURRENT_DATE - INTERVAL '6 months'
                                GROUP BY 1 ORDER BY 1 DESC) mu)
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ════════════════════════════════════════════════════════════════
-- FUNCTION 3: get_revenue_stats(period, target_date)
-- ════════════════════════════════════════════════════════════════
-- Module 3 revenue analytics. Supports daily/monthly/yearly.

CREATE OR REPLACE FUNCTION get_revenue_stats(
    p_period TEXT DEFAULT 'month',
    p_target_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON AS $$
DECLARE result JSON;
    v_start_date DATE;
    v_end_date DATE;
BEGIN
    IF NOT is_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;

    -- Determine date range
    IF p_period = 'day' THEN
        v_start_date := p_target_date;
        v_end_date := p_target_date + 1;
    ELSIF p_period = 'month' THEN
        v_start_date := date_trunc('month', p_target_date)::DATE;
        v_end_date := (date_trunc('month', p_target_date) + INTERVAL '1 month')::DATE;
    ELSIF p_period = 'year' THEN
        v_start_date := date_trunc('year', p_target_date)::DATE;
        v_end_date := (date_trunc('year', p_target_date) + INTERVAL '1 year')::DATE;
    ELSE
        v_start_date := date_trunc('month', p_target_date)::DATE;
        v_end_date := (date_trunc('month', p_target_date) + INTERVAL '1 month')::DATE;
    END IF;

    SELECT json_build_object(
        'period', p_period,
        'start_date', v_start_date,
        'end_date', v_end_date,

        'total_revenue', (SELECT COALESCE(SUM(amount), 0) FROM recharges
                           WHERE status = 'success'
                           AND paid_at >= v_start_date AND paid_at < v_end_date),

        'total_recharges', (SELECT COUNT(*) FROM recharges
                             WHERE status = 'success'
                             AND paid_at >= v_start_date AND paid_at < v_end_date),

        'avg_recharge_amount', (SELECT COALESCE(ROUND(AVG(amount)::NUMERIC, 2), 0)
                                 FROM recharges
                                 WHERE status = 'success'
                                 AND paid_at >= v_start_date AND paid_at < v_end_date),

        'unique_rechargers', (SELECT COUNT(DISTINCT user_id) FROM recharges
                               WHERE status = 'success'
                               AND paid_at >= v_start_date AND paid_at < v_end_date),

        'daily_breakdown', (SELECT json_agg(d ORDER BY d.day) FROM (
            SELECT paid_at::DATE AS day,
                   SUM(amount) AS revenue,
                   COUNT(*) AS count
            FROM recharges
            WHERE status = 'success'
              AND paid_at >= v_start_date AND paid_at < v_end_date
            GROUP BY paid_at::DATE) d),

        'revenue_by_area', (SELECT json_agg(a) FROM (
            SELECT h.area,
                   SUM(r.amount) AS revenue,
                   COUNT(*) AS count
            FROM recharges r
            JOIN profiles p ON r.user_id = p.id
            JOIN homes h ON h.user_id = p.id AND h.is_primary = TRUE
            WHERE r.status = 'success'
              AND r.paid_at >= v_start_date AND r.paid_at < v_end_date
            GROUP BY h.area ORDER BY revenue DESC) a),

        'revenue_by_method', (SELECT json_agg(m) FROM (
            SELECT method::TEXT,
                   SUM(amount) AS revenue,
                   COUNT(*) AS count
            FROM recharges
            WHERE status = 'success'
              AND paid_at >= v_start_date AND paid_at < v_end_date
            GROUP BY method ORDER BY revenue DESC) m),

        'top_10_consumers', (SELECT json_agg(t) FROM (
            SELECT r.user_id, p.name, p.consumer_number,
                   SUM(r.amount) AS total_recharged,
                   COUNT(*) AS recharge_count
            FROM recharges r
            JOIN profiles p ON r.user_id = p.id
            WHERE r.status = 'success'
              AND r.paid_at >= v_start_date AND r.paid_at < v_end_date
            GROUP BY r.user_id, p.name, p.consumer_number
            ORDER BY total_recharged DESC LIMIT 10) t)
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ════════════════════════════════════════════════════════════════
-- FUNCTION 4: get_meter_health_stats()
-- ════════════════════════════════════════════════════════════════
-- Module 7 meter health monitoring.

CREATE OR REPLACE FUNCTION get_meter_health_stats()
RETURNS JSON AS $$
DECLARE result JSON;
BEGIN
    IF NOT is_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;

    SELECT json_build_object(
        'total_meters',    (SELECT COUNT(*) FROM meters WHERE is_active = TRUE),

        'online_meters',   (SELECT COUNT(*) FROM meters
                             WHERE is_active = TRUE
                             AND last_reading_at >= now() - INTERVAL '1 hour'),

        'stale_meters',    (SELECT COUNT(*) FROM meters
                             WHERE is_active = TRUE
                             AND last_reading_at < now() - INTERVAL '6 hours'
                             AND last_reading_at >= now() - INTERVAL '24 hours'),

        'offline_meters',  (SELECT COUNT(*) FROM meters
                             WHERE is_active = TRUE
                             AND last_reading_at < now() - INTERVAL '24 hours'),

        'avg_balance',     (SELECT COALESCE(ROUND(AVG(balance_amount)::NUMERIC, 2), 0)
                             FROM meters WHERE is_active = TRUE),

        'manufacturer_distribution', (SELECT json_agg(m) FROM (
            SELECT manufacturer, COUNT(*) AS count
            FROM meters WHERE is_active = TRUE
            GROUP BY manufacturer ORDER BY count DESC) m),

        'installation_timeline', (SELECT json_agg(t) FROM (
            SELECT date_trunc('month', installation_date)::DATE AS month,
                   COUNT(*) AS count
            FROM meters WHERE installation_date IS NOT NULL
            GROUP BY 1 ORDER BY 1 DESC) t),

        'offline_meter_details', (SELECT json_agg(d) FROM (
            SELECT me.id, me.meter_number, me.last_reading_at,
                   me.balance_amount, me.manufacturer,
                   h.area, h.feeder_id,
                   p.name AS consumer_name, p.phone
            FROM meters me
            JOIN homes h ON me.home_id = h.id
            JOIN profiles p ON h.user_id = p.id
            WHERE me.is_active = TRUE
              AND me.last_reading_at < now() - INTERVAL '24 hours'
            ORDER BY me.last_reading_at ASC) d),

        'smart_plug_status', (SELECT json_agg(s) FROM (
            SELECT plug_status::TEXT AS status, COUNT(*) AS count
            FROM smart_plugs
            GROUP BY plug_status) s),

        'firmware_distribution', (SELECT json_agg(f) FROM (
            SELECT firmware_version, COUNT(*) AS count
            FROM smart_plugs WHERE firmware_version IS NOT NULL
            GROUP BY firmware_version ORDER BY count DESC) f)
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ════════════════════════════════════════════════════════════════
-- FUNCTION 5: get_complaint_stats(period)
-- ════════════════════════════════════════════════════════════════
-- Module 8 complaint & SLA analytics.

CREATE OR REPLACE FUNCTION get_complaint_stats(p_period TEXT DEFAULT 'month')
RETURNS JSON AS $$
DECLARE
    result JSON;
    v_start_date TIMESTAMPTZ;
BEGIN
    IF NOT is_admin() THEN RAISE EXCEPTION 'Access denied'; END IF;

    IF p_period = 'week' THEN
        v_start_date := now() - INTERVAL '7 days';
    ELSIF p_period = 'month' THEN
        v_start_date := date_trunc('month', now());
    ELSIF p_period = 'quarter' THEN
        v_start_date := date_trunc('quarter', now());
    ELSE
        v_start_date := date_trunc('month', now());
    END IF;

    SELECT json_build_object(
        'total_complaints',    (SELECT COUNT(*) FROM complaints
                                 WHERE created_at >= v_start_date),

        'pending_complaints',  (SELECT COUNT(*) FROM complaints
                                 WHERE status NOT IN ('resolved', 'closed')
                                 AND created_at >= v_start_date),

        'resolved_complaints', (SELECT COUNT(*) FROM complaints
                                 WHERE status IN ('resolved', 'closed')
                                 AND created_at >= v_start_date),

        'avg_resolution_hours', (SELECT COALESCE(
                                   ROUND(EXTRACT(EPOCH FROM AVG(resolved_at - created_at)) / 3600, 1), 0)
                                   FROM complaints
                                   WHERE resolved_at IS NOT NULL AND created_at >= v_start_date),

        'type_distribution', (SELECT json_agg(t) FROM (
            SELECT type::TEXT, COUNT(*) AS count
            FROM complaints WHERE created_at >= v_start_date
            GROUP BY type ORDER BY count DESC) t),

        'status_distribution', (SELECT json_agg(s) FROM (
            SELECT status::TEXT, COUNT(*) AS count
            FROM complaints WHERE created_at >= v_start_date
            GROUP BY status ORDER BY count DESC) s),

        'priority_distribution', (SELECT json_agg(pr) FROM (
            SELECT priority, COUNT(*) AS count
            FROM complaints WHERE created_at >= v_start_date
            GROUP BY priority ORDER BY priority) pr),

        'region_distribution', (SELECT json_agg(r) FROM (
            SELECT h.area, COUNT(*) AS count
            FROM complaints c
            JOIN homes h ON c.home_id = h.id
            WHERE c.created_at >= v_start_date
            GROUP BY h.area ORDER BY count DESC) r),

        'engineer_performance', (SELECT json_agg(e) FROM (
            SELECT assigned_to,
                   COUNT(*) AS total_assigned,
                   COUNT(*) FILTER (WHERE status IN ('resolved', 'closed')) AS resolved,
                   COALESCE(ROUND(EXTRACT(EPOCH FROM AVG(
                     resolved_at - created_at) FILTER (WHERE resolved_at IS NOT NULL)) / 3600, 1), 0)
                     AS avg_resolution_hours
            FROM complaints
            WHERE assigned_to IS NOT NULL AND created_at >= v_start_date
            GROUP BY assigned_to ORDER BY resolved DESC) e),

        'sla_breach_count',    (SELECT COUNT(*) FROM complaints
                                 WHERE resolved_at IS NOT NULL
                                 AND created_at >= v_start_date
                                 AND EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600 >
                                   CASE type
                                     WHEN 'outage' THEN 4
                                     WHEN 'meter_error' THEN 24
                                     WHEN 'billing' THEN 48
                                     WHEN 'payment' THEN 24
                                     ELSE 72
                                   END)
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ════════════════════════════════════════════════════════════════
-- GRANTS
-- ════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION get_admin_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_admin_dashboard_stats() TO service_role;
GRANT EXECUTE ON FUNCTION get_consumer_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_consumer_profile(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION get_revenue_stats(TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_revenue_stats(TEXT, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION get_meter_health_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION get_meter_health_stats() TO service_role;
GRANT EXECUTE ON FUNCTION get_complaint_stats(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_complaint_stats(TEXT) TO service_role;


-- ════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════
-- Test these after running (must be logged in as admin):
--
-- SELECT get_admin_dashboard_stats();
-- SELECT get_consumer_profile('paste-any-user-uuid-here');
-- SELECT get_revenue_stats('month', CURRENT_DATE);
-- SELECT get_meter_health_stats();
-- SELECT get_complaint_stats('month');
