# VoltWise — Database Setup Guide (Supabase)

> **Run these SQL queries in your Supabase SQL Editor, step by step, in the exact order below.**
> Go to: Supabase Dashboard → SQL Editor → New Query → Paste & Run each step.

---

## Pre-Setup: Create Your Supabase Project

1. Go to [supabase.com](https://supabase.com) → Sign in
2. Click **New Project**
3. Choose org, set project name: `voltwise`
4. Set a strong database password (save it somewhere safe)
5. Choose region: **South Asia (Mumbai)** for lowest latency
6. Click **Create new project** → Wait ~2 minutes

Once ready, grab these from **Settings → API**:
- `Project URL` → this is your `VITE_SUPABASE_URL`
- `anon public` key → this is your `VITE_SUPABASE_ANON_KEY`
- `service_role` key → this is for FastAPI backend only (never expose to frontend)

---

## Step 1: Create Enums

```sql
-- All custom types used across tables
-- Run this FIRST before any table creation

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
```

---

## Step 2: Create `profiles` Table + Signup Trigger

```sql
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

-- Auto-create profile when user signs up
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
```

---

## Step 3: Create `tariff_plans`, `tariff_slots`, `tariff_slabs`

```sql
-- Tariff plans (must exist before homes, since homes references it)
CREATE TABLE tariff_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    discom          TEXT,
    category        tariff_category DEFAULT 'residential',
    is_active       BOOLEAN DEFAULT TRUE,
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Time-of-Day rate slots
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

-- Consumption slabs (telescopic billing)
CREATE TABLE tariff_slabs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             UUID NOT NULL REFERENCES tariff_plans(id) ON DELETE CASCADE,
    from_kwh            INT NOT NULL,
    to_kwh              INT,
    rate_per_kwh        NUMERIC(6,2) NOT NULL,
    fixed_charge_per_kw NUMERIC(6,2) DEFAULT 0,
    display_order       INT DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now()
);
```

---

## Step 4: Create `homes` and `meters`

```sql
CREATE TABLE homes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name            TEXT NOT NULL DEFAULT 'My Home',
    address         TEXT,
    city            TEXT,
    state           TEXT,
    pincode         TEXT,
    feeder_id       TEXT,
    area            TEXT,
    tariff_category tariff_category DEFAULT 'residential',
    tariff_plan_id  UUID REFERENCES tariff_plans(id),
    sanctioned_load_kw NUMERIC(5,2) DEFAULT 5.0,
    is_primary      BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE meters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id         UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    meter_number    TEXT NOT NULL UNIQUE,
    meter_type      meter_type DEFAULT 'prepaid',
    manufacturer    TEXT,
    installation_date DATE,
    is_active       BOOLEAN DEFAULT TRUE,
    last_reading_at TIMESTAMPTZ,
    balance_amount  NUMERIC(10,2) DEFAULT 0,
    last_recharge_amount NUMERIC(10,2) DEFAULT 0,
    last_recharge_date   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## Step 5: Create `smart_plugs` and `appliances`

```sql
-- Smart plugs MUST be created before appliances (FK dependency)
CREATE TABLE smart_plugs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id         UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    tuya_device_id  TEXT NOT NULL UNIQUE,
    name            TEXT,
    plug_status     plug_status DEFAULT 'offline',
    ip_address      TEXT,
    firmware_version TEXT,
    wifi_ssid       TEXT,
    signal_strength INT,
    last_seen_at    TIMESTAMPTZ,
    calibration_done BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE appliances (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id         UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    icon            TEXT NOT NULL DEFAULT 'zap',
    source          appliance_source DEFAULT 'manual',
    rated_power_w   INT,
    current_power_w NUMERIC(8,2) DEFAULT 0,
    status          appliance_status DEFAULT 'OFF',
    cost_per_hour   NUMERIC(8,2) DEFAULT 0,
    runtime_today   TEXT,
    schedule_time   TEXT,
    message         TEXT,
    saving_potential NUMERIC(6,2),
    smart_plug_id   UUID REFERENCES smart_plugs(id),
    is_active       BOOLEAN DEFAULT TRUE,
    sort_order      INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## Step 6: Create Time-Series Tables

```sql
-- Meter readings (high volume)
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

-- Smart plug readings
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

-- NILM disaggregation results
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

-- Daily aggregates (pre-computed for fast dashboard)
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
```

---

## Step 7: Create Scheduling & Control Tables

```sql
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

CREATE TABLE automation_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id         UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    condition_type  TEXT NOT NULL,
    condition_value JSONB NOT NULL,
    target_appliance_ids UUID[],
    action          TEXT NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    is_triggered    BOOLEAN DEFAULT FALSE,
    last_triggered  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE recommendations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id         UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
    appliance_id    UUID REFERENCES appliances(id),
    type            recommendation_type NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL,
    savings_per_use NUMERIC(6,2) DEFAULT 0,
    savings_per_month NUMERIC(8,2) DEFAULT 0,
    suggested_time  TIME,
    is_dismissed    BOOLEAN DEFAULT FALSE,
    is_acted_on     BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## Step 8: Create Billing & Payment Tables

```sql
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

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id),
    bill_id         UUID REFERENCES bills(id),
    amount          NUMERIC(10,2) NOT NULL,
    method          payment_method NOT NULL,
    status          payment_status DEFAULT 'pending',
    transaction_id  TEXT,
    razorpay_order_id   TEXT,
    razorpay_payment_id TEXT,
    razorpay_signature  TEXT,
    gateway_response JSONB,
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE recharges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id),
    meter_id        UUID NOT NULL REFERENCES meters(id),
    amount          NUMERIC(10,2) NOT NULL,
    method          payment_method NOT NULL,
    status          payment_status DEFAULT 'pending',
    transaction_id  TEXT,
    razorpay_order_id   TEXT,
    razorpay_payment_id TEXT,
    razorpay_signature  TEXT,
    units_credited  NUMERIC(10,2),
    balance_after   NUMERIC(10,2),
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## Step 9: Create Notification & Complaint Tables

```sql
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type            notif_type NOT NULL,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    icon            TEXT DEFAULT 'bell',
    color           TEXT DEFAULT 'text-slate-500',
    bg_color        TEXT DEFAULT 'bg-slate-50',
    is_read         BOOLEAN DEFAULT FALSE,
    action_url      TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT now()
);

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

CREATE TABLE complaint_updates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id    UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    status          complaint_status NOT NULL,
    note            TEXT,
    updated_by      UUID REFERENCES profiles(id),
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## Step 10: Create Gamification & Carbon Tables

```sql
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

CREATE TABLE admin_audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    admin_id        UUID NOT NULL REFERENCES profiles(id),
    action_type     TEXT NOT NULL,
    target_table    TEXT,
    target_id       UUID,
    previous_value  JSONB,
    new_value       JSONB,
    ip_address      TEXT,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## Step 11: Create Indexes

```sql
-- Time-series performance
CREATE INDEX idx_meter_readings_meter_ts  ON meter_readings(meter_id, timestamp DESC);
CREATE INDEX idx_meter_readings_ts        ON meter_readings(timestamp DESC);
CREATE INDEX idx_plug_readings_plug_ts    ON plug_readings(plug_id, timestamp DESC);

-- Daily aggregates (unique + lookup)
CREATE UNIQUE INDEX idx_daily_agg_unique
  ON daily_aggregates(home_id, COALESCE(appliance_id, '00000000-0000-0000-0000-000000000000'::uuid), date);
CREATE INDEX idx_daily_agg_home_date      ON daily_aggregates(home_id, date DESC);

-- Dashboard & insights
CREATE INDEX idx_appliances_home_status   ON appliances(home_id, status);
CREATE INDEX idx_bills_home_month         ON bills(home_id, bill_month DESC);
CREATE INDEX idx_notifications_user_read  ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_recommendations_home     ON recommendations(home_id, is_dismissed, created_at DESC);

-- Scheduling & control logs
CREATE INDEX idx_schedule_logs_schedule   ON schedule_logs(schedule_id, executed_at DESC);
CREATE INDEX idx_control_logs_appliance   ON control_logs(appliance_id, created_at DESC);

-- Admin queries
CREATE INDEX idx_complaints_status        ON complaints(status, created_at DESC);
CREATE INDEX idx_profiles_role            ON profiles(role);
CREATE INDEX idx_homes_area               ON homes(area);
CREATE INDEX idx_homes_tariff_cat         ON homes(tariff_category);

-- Audit logs
CREATE INDEX idx_audit_admin              ON admin_audit_logs(admin_id, created_at DESC);
CREATE INDEX idx_audit_target             ON admin_audit_logs(target_table, target_id);
```

---

## Step 12: Create `updated_at` Auto-Trigger

```sql
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
CREATE TRIGGER set_updated_at BEFORE UPDATE ON complaints FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON outage_notices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## Step 13: Enable RLS + Create Helper Function

```sql
-- Admin check helper
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

---

## Step 14: RLS Policies — User-Owned Tables

```sql
-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_profile" ON profiles FOR ALL
  USING (id = auth.uid() OR is_admin());

-- payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_payments" ON payments FOR ALL
  USING (user_id = auth.uid() OR is_admin());

-- recharges
ALTER TABLE recharges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_recharges" ON recharges FOR ALL
  USING (user_id = auth.uid() OR is_admin());

-- notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_notifications" ON notifications FOR ALL
  USING (user_id = auth.uid() OR is_admin());

-- complaints
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_complaints" ON complaints FOR ALL
  USING (user_id = auth.uid() OR is_admin());

-- user_achievements
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_achievements" ON user_achievements FOR ALL
  USING (user_id = auth.uid() OR is_admin());

-- user_challenges
ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_challenges" ON user_challenges FOR ALL
  USING (user_id = auth.uid() OR is_admin());
```

---

## Step 15: RLS Policies — Home-Owned Tables

```sql
-- homes
ALTER TABLE homes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_homes" ON homes FOR ALL
  USING (user_id = auth.uid() OR is_admin());

-- meters
ALTER TABLE meters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_meters" ON meters FOR ALL
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());

-- appliances
ALTER TABLE appliances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_appliances" ON appliances FOR ALL
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());

-- smart_plugs
ALTER TABLE smart_plugs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_plugs" ON smart_plugs FOR ALL
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());

-- schedules
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_schedules" ON schedules FOR ALL
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());

-- automation_rules
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_rules" ON automation_rules FOR ALL
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());

-- daily_aggregates
ALTER TABLE daily_aggregates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_aggregates" ON daily_aggregates FOR ALL
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());

-- bills
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_bills" ON bills FOR ALL
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());

-- carbon_stats
ALTER TABLE carbon_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_carbon" ON carbon_stats FOR ALL
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());

-- recommendations
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_recommendations" ON recommendations FOR ALL
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());
```

---

## Step 16: RLS Policies — Deep-Nested Tables

```sql
-- meter_readings (through meters → homes)
ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_readings" ON meter_readings FOR ALL
  USING (
    meter_id IN (
      SELECT m.id FROM meters m JOIN homes h ON m.home_id = h.id WHERE h.user_id = auth.uid()
    ) OR is_admin()
  );

-- plug_readings (through smart_plugs → homes)
ALTER TABLE plug_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_plug_readings" ON plug_readings FOR ALL
  USING (
    plug_id IN (
      SELECT sp.id FROM smart_plugs sp JOIN homes h ON sp.home_id = h.id WHERE h.user_id = auth.uid()
    ) OR is_admin()
  );

-- nilm_results (through meters → homes)
ALTER TABLE nilm_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_nilm" ON nilm_results FOR ALL
  USING (
    meter_id IN (
      SELECT m.id FROM meters m JOIN homes h ON m.home_id = h.id WHERE h.user_id = auth.uid()
    ) OR is_admin()
  );
```

---

## Step 17: RLS Policies — Public-Read + Admin-Write Tables

```sql
-- tariff_plans
ALTER TABLE tariff_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_tariff_plans" ON tariff_plans FOR SELECT USING (true);
CREATE POLICY "admin_write_tariff_plans" ON tariff_plans FOR ALL USING (is_admin());

-- tariff_slots
ALTER TABLE tariff_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_tariff_slots" ON tariff_slots FOR SELECT USING (true);
CREATE POLICY "admin_write_tariff_slots" ON tariff_slots FOR ALL USING (is_admin());

-- tariff_slabs
ALTER TABLE tariff_slabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_tariff_slabs" ON tariff_slabs FOR SELECT USING (true);
CREATE POLICY "admin_write_tariff_slabs" ON tariff_slabs FOR ALL USING (is_admin());

-- achievements
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_achievements" ON achievements FOR SELECT USING (true);
CREATE POLICY "admin_write_achievements" ON achievements FOR ALL USING (is_admin());

-- challenges
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_challenges" ON challenges FOR SELECT USING (true);
CREATE POLICY "admin_write_challenges" ON challenges FOR ALL USING (is_admin());

-- outage_notices
ALTER TABLE outage_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_outages" ON outage_notices FOR SELECT USING (true);
CREATE POLICY "admin_write_outages" ON outage_notices FOR ALL USING (is_admin());
```

---

## Step 18: RLS Policies — Audit & Log Tables

```sql
-- schedule_logs (read by owner, written by FastAPI service key)
ALTER TABLE schedule_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_schedule_logs" ON schedule_logs FOR SELECT
  USING (
    appliance_id IN (
      SELECT a.id FROM appliances a JOIN homes h ON a.home_id = h.id WHERE h.user_id = auth.uid()
    ) OR is_admin()
  );

-- control_logs
ALTER TABLE control_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_control_logs" ON control_logs FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

-- complaint_updates
ALTER TABLE complaint_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_complaint_updates" ON complaint_updates FOR SELECT
  USING (
    complaint_id IN (SELECT id FROM complaints WHERE user_id = auth.uid()) OR is_admin()
  );
CREATE POLICY "admin_insert_updates" ON complaint_updates FOR INSERT
  USING (is_admin());

-- admin_audit_logs (super_admin read only, FastAPI writes via service key)
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_audit" ON admin_audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));
```

---

## Step 19: Create RPC Functions

```sql
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
```

---

## Step 20: Create Storage Buckets

Run these in the Supabase SQL Editor:

```sql
-- Create storage buckets for file uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('bills', 'bills', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('complaints', 'complaints', false);

-- Storage RLS: Users can upload to their own folder
CREATE POLICY "user_upload_complaints" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'complaints' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "user_read_own_complaints" ON storage.objects FOR SELECT
  USING (bucket_id = 'complaints' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "user_read_own_bills" ON storage.objects FOR SELECT
  USING (bucket_id = 'bills' AND auth.uid()::text = (storage.foldername(name))[1]);
```

---

## ✅ Verification

After running all steps, go to **Supabase Dashboard → Table Editor** and verify you can see all 30 tables:

1. `profiles`
2. `tariff_plans`
3. `tariff_slots`
4. `tariff_slabs`
5. `homes`
6. `meters`
7. `smart_plugs`
8. `appliances`
9. `meter_readings`
10. `plug_readings`
11. `nilm_results`
12. `daily_aggregates`
13. `schedules`
14. `schedule_logs`
15. `control_logs`
16. `automation_rules`
17. `recommendations`
18. `bills`
19. `payments`
20. `recharges`
21. `notifications`
22. `complaints`
23. `complaint_updates`
24. `achievements`
25. `user_achievements`
26. `challenges`
27. `user_challenges`
28. `carbon_stats`
29. `outage_notices`
30. `admin_audit_logs`

Also check **Authentication → Policies** to confirm RLS is enabled on all tables.

---

## Next: Connect Frontend

After the database is set up, update your `.env.local`:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_API_BASE_URL=http://localhost:8000/api
```

Then install the Supabase SDK and create the client file — see `userside.md` → "Supabase Client Setup" section for details.
