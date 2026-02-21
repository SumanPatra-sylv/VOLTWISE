-- ============================================================
-- VOLTWISE — STEP 2: FULL DATABASE SETUP
-- ============================================================
-- Run this AFTER 01_reset.sql
-- This creates EVERYTHING: enums, 30 tables, indexes,
-- triggers, RPC functions, storage buckets.
-- Copy the ENTIRE file → paste into SQL Editor → Run.
-- ============================================================


-- ========================
-- PART A: ENUMS
-- ========================
CREATE TYPE user_role        AS ENUM ('consumer', 'admin', 'super_admin');
CREATE TYPE meter_type       AS ENUM ('prepaid', 'postpaid');
CREATE TYPE tariff_category  AS ENUM ('residential', 'commercial', 'industrial', 'agricultural');
CREATE TYPE appliance_status AS ENUM ('ON', 'OFF', 'SCHEDULED', 'WARNING');
CREATE TYPE appliance_source AS ENUM ('nilm', 'smart_plug', 'manual');
CREATE TYPE plug_status      AS ENUM ('online', 'offline', 'pairing');
CREATE TYPE schedule_repeat  AS ENUM ('once', 'daily', 'weekdays', 'weekends', 'custom');
CREATE TYPE bill_status      AS ENUM ('generated', 'paid', 'overdue', 'partial');
CREATE TYPE payment_method   AS ENUM ('upi', 'debit_card', 'credit_card', 'net_banking', 'wallet');
CREATE TYPE payment_status   AS ENUM ('success', 'failed', 'pending', 'refunded');
CREATE TYPE notif_type       AS ENUM ('peak', 'budget', 'schedule', 'tip', 'system', 'outage', 'payment', 'recharge', 'complaint');
CREATE TYPE complaint_type   AS ENUM ('billing', 'outage', 'meter_error', 'payment', 'service', 'other');
CREATE TYPE complaint_status AS ENUM ('received', 'in_progress', 'assigned', 'resolved', 'closed');
CREATE TYPE slot_type        AS ENUM ('off-peak', 'normal', 'peak');
CREATE TYPE recommendation_type AS ENUM ('schedule_shift', 'usage_reduction', 'general_tip');


-- ========================
-- PART B: CORE TABLES
-- ========================

-- TABLE 1: profiles
CREATE TABLE profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role            user_role       NOT NULL DEFAULT 'consumer',
    name            TEXT            NOT NULL,
    phone           TEXT,
    consumer_number TEXT            UNIQUE,
    avatar_url      TEXT,
    location        TEXT,
    household_members INT          DEFAULT 1,
    onboarding_done BOOLEAN        DEFAULT FALSE,
    created_at      TIMESTAMPTZ    DEFAULT now(),
    updated_at      TIMESTAMPTZ    DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, phone, consumer_number, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'consumer_number',
    'consumer'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- TABLE 2: discoms (DISCOM registry — MUST be before tariff_plans)
CREATE TABLE discoms (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                   TEXT NOT NULL UNIQUE,
    name                   TEXT NOT NULL,
    state                  TEXT NOT NULL,
    state_code             TEXT NOT NULL,
    consumer_number_length INT DEFAULT 12,
    consumer_number_hint   TEXT,
    is_active              BOOLEAN DEFAULT TRUE,
    created_at             TIMESTAMPTZ DEFAULT now(),
    updated_at             TIMESTAMPTZ DEFAULT now()
);

-- TABLE 3: tariff_plans (MUST be before homes because homes references it)
CREATE TABLE tariff_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discom_id           UUID NOT NULL REFERENCES discoms(id),
    name                TEXT NOT NULL,
    state               TEXT NOT NULL,
    category            tariff_category DEFAULT 'residential',
    fixed_charge_per_kw NUMERIC(6,2) DEFAULT 0,
    is_active           BOOLEAN DEFAULT TRUE,
    effective_from      DATE NOT NULL,
    effective_to        DATE,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- TABLE 4: tariff_slots (ToD simulation — drives optimization, not billing)
CREATE TABLE tariff_slots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID NOT NULL REFERENCES tariff_plans(id) ON DELETE CASCADE,
    hour_label      TEXT NOT NULL,
    start_hour      INT NOT NULL,
    end_hour        INT NOT NULL,
    rate            NUMERIC(6,2) NOT NULL,
    slot_type       slot_type NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 5: tariff_slabs (from_kwh inclusive, to_kwh exclusive, NULL = infinity)
CREATE TABLE tariff_slabs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id         UUID NOT NULL REFERENCES tariff_plans(id) ON DELETE CASCADE,
    from_kwh        INT NOT NULL,
    to_kwh          INT,
    rate_per_kwh    NUMERIC(6,2) NOT NULL,
    display_order   INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 6: homes
CREATE TABLE homes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name                TEXT NOT NULL DEFAULT 'My Home',
    address             TEXT,
    city                TEXT,
    state               TEXT,
    pincode             TEXT,
    feeder_id           TEXT,
    area                TEXT,
    tariff_category     tariff_category DEFAULT 'residential',
    tariff_plan_id      UUID REFERENCES tariff_plans(id),
    sanctioned_load_kw  NUMERIC(5,2) DEFAULT 5.0,
    is_primary          BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- TABLE 7: meters
CREATE TABLE meters (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id             UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    meter_number        TEXT NOT NULL UNIQUE,
    meter_type          meter_type DEFAULT 'prepaid',
    manufacturer        TEXT,
    installation_date   DATE,
    is_active           BOOLEAN DEFAULT TRUE,
    last_reading_at     TIMESTAMPTZ,
    balance_amount      NUMERIC(10,2) DEFAULT 0,
    last_recharge_amount NUMERIC(10,2) DEFAULT 0,
    last_recharge_date  TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- TABLE 8: smart_plugs
CREATE TABLE smart_plugs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id             UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    tuya_device_id      TEXT NOT NULL UNIQUE,
    name                TEXT,
    plug_status         plug_status DEFAULT 'offline',
    ip_address          TEXT,
    firmware_version    TEXT,
    wifi_ssid           TEXT,
    signal_strength     INT,
    last_seen_at        TIMESTAMPTZ,
    calibration_done    BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- TABLE 9: appliances
CREATE TABLE appliances (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id             UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    icon                TEXT NOT NULL DEFAULT 'zap',
    source              appliance_source DEFAULT 'manual',
    rated_power_w       INT,
    current_power_w     NUMERIC(8,2) DEFAULT 0,
    status              appliance_status DEFAULT 'OFF',
    cost_per_hour       NUMERIC(8,2) DEFAULT 0,
    runtime_today       TEXT,
    schedule_time       TEXT,
    message             TEXT,
    saving_potential     NUMERIC(6,2),
    smart_plug_id       UUID REFERENCES smart_plugs(id),
    is_active           BOOLEAN DEFAULT TRUE,
    sort_order          INT DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);


-- ========================
-- PART C: TIME-SERIES TABLES
-- ========================

-- TABLE 10: meter_readings
CREATE TABLE meter_readings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_id        UUID NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    kwh_reading     NUMERIC(12,4),
    kwh_delta       NUMERIC(10,4),
    power_kw        NUMERIC(8,3),
    voltage         NUMERIC(6,2),
    current_amps    NUMERIC(6,2),
    power_factor    NUMERIC(4,3),
    cost_delta      NUMERIC(10,2),
    tariff_rate     NUMERIC(6,2),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 11: plug_readings
CREATE TABLE plug_readings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plug_id         UUID NOT NULL REFERENCES smart_plugs(id) ON DELETE CASCADE,
    appliance_id    UUID REFERENCES appliances(id),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
    power_w         NUMERIC(8,2),
    voltage         NUMERIC(6,2),
    current_ma      NUMERIC(8,2),
    energy_kwh      NUMERIC(10,4),
    is_on           BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 12: nilm_results
CREATE TABLE nilm_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meter_id        UUID NOT NULL REFERENCES meters(id) ON DELETE CASCADE,
    window_start    TIMESTAMPTZ NOT NULL,
    window_end      TIMESTAMPTZ NOT NULL,
    appliance_name  TEXT NOT NULL,
    estimated_kwh   NUMERIC(10,4),
    estimated_power_w NUMERIC(8,2),
    confidence      NUMERIC(4,3),
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 13: daily_aggregates
CREATE TABLE daily_aggregates (
    id              BIGSERIAL PRIMARY KEY,
    home_id         UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    meter_id        UUID REFERENCES meters(id),
    appliance_id    UUID REFERENCES appliances(id),
    date            DATE NOT NULL,
    total_kwh       NUMERIC(10,4) NOT NULL,
    total_cost      NUMERIC(10,2) NOT NULL,
    peak_power_kw   NUMERIC(8,3),
    avg_power_kw    NUMERIC(8,3),
    on_hours        NUMERIC(5,2),
    carbon_kg       NUMERIC(8,3)
);


-- ========================
-- PART D: SCHEDULING & AUTOMATION
-- ========================

-- TABLE 14: schedules
CREATE TABLE schedules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appliance_id    UUID NOT NULL REFERENCES appliances(id) ON DELETE CASCADE,
    home_id         UUID NOT NULL REFERENCES homes(id),
    start_time      TIME NOT NULL,
    end_time        TIME,
    repeat_type     schedule_repeat DEFAULT 'once',
    custom_days     INT[],
    is_active       BOOLEAN DEFAULT TRUE,
    last_executed   TIMESTAMPTZ,
    created_by      TEXT DEFAULT 'user',
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 15: schedule_logs
CREATE TABLE schedule_logs (
    id              BIGSERIAL PRIMARY KEY,
    schedule_id     UUID REFERENCES schedules(id) ON DELETE SET NULL,
    appliance_id    UUID REFERENCES appliances(id),
    executed_at     TIMESTAMPTZ NOT NULL,
    action          TEXT NOT NULL,
    result          TEXT NOT NULL,
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 16: control_logs
CREATE TABLE control_logs (
    id              BIGSERIAL PRIMARY KEY,
    appliance_id    UUID REFERENCES appliances(id),
    user_id         UUID REFERENCES profiles(id),
    action          TEXT NOT NULL,
    trigger_source  TEXT NOT NULL,
    result          TEXT NOT NULL,
    response_time_ms INT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 17: automation_rules
CREATE TABLE automation_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id             UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    description         TEXT,
    condition_type      TEXT NOT NULL,
    condition_value     JSONB NOT NULL,
    target_appliance_ids UUID[],
    action              TEXT NOT NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    is_triggered        BOOLEAN DEFAULT FALSE,
    last_triggered      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- TABLE 18: recommendations
CREATE TABLE recommendations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id             UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    appliance_id        UUID REFERENCES appliances(id),
    type                recommendation_type NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT NOT NULL,
    savings_per_use     NUMERIC(6,2) DEFAULT 0,
    savings_per_month   NUMERIC(8,2) DEFAULT 0,
    suggested_time      TIME,
    is_dismissed        BOOLEAN DEFAULT FALSE,
    is_acted_on         BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT now()
);


-- ========================
-- PART E: BILLING & PAYMENTS
-- ========================

-- TABLE 19: bills
CREATE TABLE bills (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id         UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    meter_id        UUID REFERENCES meters(id),
    bill_month      DATE NOT NULL,
    total_kwh       NUMERIC(10,2),
    base_amount     NUMERIC(10,2),
    tax_amount      NUMERIC(10,2),
    surcharge_amount NUMERIC(10,2),
    total_amount    NUMERIC(10,2) NOT NULL,
    savings_amount  NUMERIC(10,2) DEFAULT 0,
    previous_amount NUMERIC(10,2),
    change_percent  NUMERIC(5,2),
    pdf_url         TEXT,
    status          bill_status DEFAULT 'generated',
    due_date        DATE,
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 20: payments (with Razorpay columns)
CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES profiles(id),
    bill_id             UUID REFERENCES bills(id),
    amount              NUMERIC(10,2) NOT NULL,
    method              payment_method NOT NULL,
    status              payment_status DEFAULT 'pending',
    transaction_id      TEXT,
    razorpay_order_id   TEXT,
    razorpay_payment_id TEXT,
    razorpay_signature  TEXT,
    gateway_response    JSONB,
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now()
);

-- TABLE 21: recharges (with Razorpay columns)
CREATE TABLE recharges (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES profiles(id),
    meter_id            UUID NOT NULL REFERENCES meters(id),
    amount              NUMERIC(10,2) NOT NULL,
    method              payment_method NOT NULL,
    status              payment_status DEFAULT 'pending',
    transaction_id      TEXT,
    razorpay_order_id   TEXT,
    razorpay_payment_id TEXT,
    razorpay_signature  TEXT,
    units_credited      NUMERIC(10,2),
    balance_after       NUMERIC(10,2),
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now()
);


-- ========================
-- PART F: NOTIFICATIONS & COMPLAINTS
-- ========================

-- TABLE 22: notifications (with full UI columns)
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type            notif_type NOT NULL,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    icon            TEXT DEFAULT 'bell',
    color           TEXT DEFAULT 'text-slate-500',
    bg_color        TEXT DEFAULT 'bg-slate-50',
    action_url      TEXT,
    metadata        JSONB,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 23: complaints (with resolution columns)
CREATE TABLE complaints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id),
    home_id         UUID REFERENCES homes(id),
    meter_id        UUID REFERENCES meters(id),
    type            complaint_type NOT NULL,
    subject         TEXT NOT NULL,
    description     TEXT NOT NULL,
    status          complaint_status DEFAULT 'received',
    priority        INT DEFAULT 3,
    assigned_to     TEXT,
    attachments     TEXT[],
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 24: complaint_updates
CREATE TABLE complaint_updates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id    UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    status          complaint_status NOT NULL,
    note            TEXT,
    updated_by      UUID REFERENCES profiles(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);


-- ========================
-- PART G: GAMIFICATION
-- ========================

-- TABLE 25: achievements
CREATE TABLE achievements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    icon            TEXT NOT NULL DEFAULT 'zap',
    target_value    INT DEFAULT 1,
    points          INT DEFAULT 100,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 26: user_achievements
CREATE TABLE user_achievements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    achievement_id  UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    progress        INT DEFAULT 0,
    unlocked        BOOLEAN DEFAULT FALSE,
    unlocked_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, achievement_id)
);

-- TABLE 27: challenges
CREATE TABLE challenges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    description     TEXT,
    target_value    INT NOT NULL,
    reward_points   INT NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 28: user_challenges
CREATE TABLE user_challenges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    challenge_id    UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    progress        INT DEFAULT 0,
    completed       BOOLEAN DEFAULT FALSE,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, challenge_id)
);


-- ========================
-- PART H: CARBON, OUTAGE, ADMIN
-- ========================

-- TABLE 29: carbon_stats
CREATE TABLE carbon_stats (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id         UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    month           DATE NOT NULL,
    user_kg_co2     NUMERIC(10,2),
    neighbor_avg    NUMERIC(10,2),
    national_avg    NUMERIC(10,2),
    trees_equivalent NUMERIC(8,2),
    co2_saved_kg    NUMERIC(10,2),
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(home_id, month)
);

-- TABLE 30: outage_notices
CREATE TABLE outage_notices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area            TEXT,
    feeder_id       TEXT,
    reason          TEXT,
    start_time      TIMESTAMPTZ NOT NULL,
    estimated_end   TIMESTAMPTZ,
    actual_end      TIMESTAMPTZ,
    is_resolved     BOOLEAN DEFAULT FALSE,
    created_by      UUID REFERENCES profiles(id),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- TABLE 31: admin_audit_logs
CREATE TABLE admin_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    admin_id        UUID NOT NULL REFERENCES profiles(id),
    action_type     TEXT NOT NULL,
    target_table    TEXT,
    target_id       UUID,
    previous_value  JSONB,
    new_value       JSONB,
    created_at      TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- PART I: INDEXES
-- ============================================================

-- Time-series (most critical for performance)
CREATE INDEX idx_meter_readings_meter_ts   ON meter_readings(meter_id, timestamp DESC);
CREATE INDEX idx_meter_readings_ts         ON meter_readings(timestamp DESC);
CREATE INDEX idx_plug_readings_plug_ts     ON plug_readings(plug_id, timestamp DESC);

-- Dashboard queries
CREATE INDEX idx_appliances_home_status    ON appliances(home_id, status);
CREATE INDEX idx_bills_home_month          ON bills(home_id, bill_month DESC);
CREATE INDEX idx_daily_agg_home_date       ON daily_aggregates(home_id, date DESC);
CREATE INDEX idx_notifications_user_read   ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_recommendations_home      ON recommendations(home_id, is_dismissed, created_at DESC);

-- Audit logs
CREATE INDEX idx_schedule_logs_schedule    ON schedule_logs(schedule_id, executed_at DESC);
CREATE INDEX idx_control_logs_appliance    ON control_logs(appliance_id, created_at DESC);

-- Admin queries
CREATE INDEX idx_complaints_status         ON complaints(status, created_at DESC);
CREATE INDEX idx_profiles_role             ON profiles(role);
CREATE INDEX idx_homes_area                ON homes(area);
CREATE INDEX idx_homes_tariff_cat          ON homes(tariff_category);
CREATE INDEX idx_audit_admin               ON admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_audit_target              ON admin_audit_logs(target_table, target_id);

-- Tariff lookups
CREATE INDEX idx_discoms_state             ON discoms(state_code);
CREATE INDEX idx_tariff_plans_discom       ON tariff_plans(discom_id, is_active);
CREATE INDEX idx_tariff_plans_state        ON tariff_plans(state, is_active);

-- Functional unique index for daily_aggregates (handles NULL appliance_id)
CREATE UNIQUE INDEX idx_daily_agg_unique
  ON daily_aggregates(home_id, COALESCE(appliance_id, '00000000-0000-0000-0000-000000000000'::uuid), date);


-- ============================================================
-- PART J: TRIGGERS
-- ============================================================

-- Generic updated_at function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at column
CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON homes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON meters FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON appliances FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON smart_plugs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON automation_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tariff_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON discoms FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON complaints FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON outage_notices FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- PART K: RPC FUNCTIONS
-- ============================================================

-- Admin check helper
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;


-- Dashboard stats (single call for entire dashboard)
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_home_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
  v_meter RECORD;
  v_today_kwh NUMERIC;
  v_today_cost NUMERIC;
  v_current_load NUMERIC;
  v_current_rate NUMERIC;
  v_active_devices INT;
  v_month_total NUMERIC;
  v_month_savings NUMERIC;
  v_daily_avg NUMERIC;
  v_plan_id UUID;
  v_current_hour INT;
  v_current_slot RECORD;
  v_next_slot RECORD;
BEGIN
  SELECT * INTO v_meter FROM meters WHERE home_id = p_home_id AND is_active = TRUE LIMIT 1;

  SELECT COALESCE(SUM(total_kwh), 0), COALESCE(SUM(total_cost), 0)
  INTO v_today_kwh, v_today_cost
  FROM daily_aggregates
  WHERE home_id = p_home_id AND appliance_id IS NULL AND date = CURRENT_DATE;

  IF v_today_kwh = 0 THEN
    SELECT COALESCE(SUM(kwh_delta), 0), COALESCE(SUM(cost_delta), 0)
    INTO v_today_kwh, v_today_cost
    FROM meter_readings
    WHERE meter_id = v_meter.id AND timestamp >= CURRENT_DATE;
  END IF;

  SELECT power_kw, tariff_rate INTO v_current_load, v_current_rate
  FROM meter_readings WHERE meter_id = v_meter.id ORDER BY timestamp DESC LIMIT 1;

  SELECT COUNT(*) INTO v_active_devices
  FROM appliances WHERE home_id = p_home_id AND status = 'ON';

  SELECT COALESCE(SUM(total_cost), 0) INTO v_month_total
  FROM daily_aggregates
  WHERE home_id = p_home_id AND appliance_id IS NULL
    AND date >= date_trunc('month', CURRENT_DATE);

  v_daily_avg := CASE WHEN v_month_total > 0
    THEN v_month_total / GREATEST(EXTRACT(DAY FROM CURRENT_DATE), 1)
    ELSE 0 END;

  SELECT tariff_plan_id INTO v_plan_id FROM homes WHERE id = p_home_id;
  v_current_hour := EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Kolkata');

  SELECT slot_type, rate INTO v_current_slot
  FROM tariff_slots
  WHERE plan_id = v_plan_id AND start_hour <= v_current_hour AND end_hour > v_current_hour
  LIMIT 1;

  SELECT slot_type, rate, start_hour INTO v_next_slot
  FROM tariff_slots
  WHERE plan_id = v_plan_id AND start_hour > v_current_hour
  ORDER BY start_hour LIMIT 1;

  IF v_next_slot IS NULL THEN
    SELECT slot_type, rate, start_hour INTO v_next_slot
    FROM tariff_slots
    WHERE plan_id = v_plan_id
    ORDER BY start_hour LIMIT 1;
  END IF;

  result := json_build_object(
    'balance', v_meter.balance_amount,
    'lastRechargeAmount', v_meter.last_recharge_amount,
    'lastRechargeDate', to_char(v_meter.last_recharge_date, 'DD Month, YYYY'),
    'balancePercent', CASE WHEN v_meter.last_recharge_amount > 0
      THEN ROUND((v_meter.balance_amount / v_meter.last_recharge_amount) * 100)
      ELSE 0 END,
    'dailyAvgUsage', ROUND(v_daily_avg, 2),
    'currentTariff', COALESCE(v_current_rate, 0),
    'yearAverage', 0,
    'currentLoad', COALESCE(v_current_load, 0),
    'todayCost', ROUND(v_today_cost, 2),
    'todayKwh', ROUND(v_today_kwh, 2),
    'monthBill', ROUND(v_month_total, 0),
    'monthSavings', 0,
    'activeDevices', v_active_devices,
    'currentSlotType', COALESCE(v_current_slot.slot_type::TEXT, 'normal'),
    'currentSlotRate', COALESCE(v_current_slot.rate, v_current_rate),
    'nextSlotChange', LPAD(COALESCE(v_next_slot.start_hour, 0)::TEXT, 2, '0') || ':00',
    'nextSlotType', COALESCE(v_next_slot.slot_type::TEXT, 'normal'),
    'nextSlotRate', COALESCE(v_next_slot.rate, 0)
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Consumption breakdown (NILM data for donut chart)
CREATE OR REPLACE FUNCTION get_consumption_breakdown(p_home_id UUID, p_days INT DEFAULT 30)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM (
    SELECT
      COALESCE(a.name, nr.appliance_name) AS name,
      ROUND(SUM(nr.estimated_kwh)::NUMERIC, 2) AS value
    FROM nilm_results nr
    JOIN meters m ON nr.meter_id = m.id
    JOIN homes h ON m.home_id = h.id
    LEFT JOIN appliances a ON a.home_id = h.id AND a.name ILIKE '%' || nr.appliance_name || '%'
    WHERE h.id = p_home_id
      AND nr.window_start >= CURRENT_DATE - p_days
    GROUP BY COALESCE(a.name, nr.appliance_name)
    ORDER BY value DESC
  ) t;

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Daily trend (bar chart data)
CREATE OR REPLACE FUNCTION get_daily_trend(p_home_id UUID, p_days INT DEFAULT 30)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(row_to_json(t))
  INTO result
  FROM (
    SELECT
      EXTRACT(DAY FROM date)::TEXT AS day,
      ROUND(total_kwh::NUMERIC, 1) AS kwh
    FROM daily_aggregates
    WHERE home_id = p_home_id
      AND appliance_id IS NULL
      AND date >= CURRENT_DATE - p_days
    ORDER BY date
  ) t;

  RETURN COALESCE(result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- PART L: STORAGE BUCKETS (idempotent — safe to re-run)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('bills', 'bills', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('complaints', 'complaints', false)
ON CONFLICT (id) DO NOTHING;

-- Storage access policies (DROP first to avoid "already exists" errors)
DROP POLICY IF EXISTS "user_upload_complaints" ON storage.objects;
CREATE POLICY "user_upload_complaints" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'complaints' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "user_read_own_complaints" ON storage.objects;
CREATE POLICY "user_read_own_complaints" ON storage.objects FOR SELECT
  USING (bucket_id = 'complaints' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "user_read_own_bills" ON storage.objects;
CREATE POLICY "user_read_own_bills" ON storage.objects FOR SELECT
  USING (bucket_id = 'bills' AND auth.uid()::text = (storage.foldername(name))[1]);


-- ============================================================
-- DONE! You should now see 31 tables in the Table Editor.
-- (30 original + discoms)
-- ============================================================
