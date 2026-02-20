-- ============================================================
-- VOLTWISE — STEP 3: ROW LEVEL SECURITY (OPTIONAL)
-- ============================================================
-- DO NOT run this during development.
-- Run this ONLY before demo / deployment / when real users exist.
--
-- What RLS does: ensures users can only see their OWN data.
-- Without RLS: any logged-in user can read everyone's data.
-- ============================================================


-- ========================
-- HELPER FUNCTION
-- ========================
-- is_admin() should already exist from 02_setup.sql
-- This is just a safety CREATE OR REPLACE
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$ LANGUAGE sql SECURITY DEFINER;


-- ========================
-- PROFILES
-- ========================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_profile" ON profiles FOR SELECT
  USING (id = auth.uid() OR is_admin());
CREATE POLICY "users_update_own_profile" ON profiles FOR UPDATE
  USING (id = auth.uid());


-- ========================
-- DISCOMS + TARIFF (public read)
-- ========================
ALTER TABLE discoms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_discoms" ON discoms FOR SELECT USING (TRUE);
CREATE POLICY "admin_manage_discoms" ON discoms FOR ALL USING (is_admin());

ALTER TABLE tariff_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_tariffs" ON tariff_plans FOR SELECT USING (TRUE);

ALTER TABLE tariff_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_slots" ON tariff_slots FOR SELECT USING (TRUE);

ALTER TABLE tariff_slabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_slabs" ON tariff_slabs FOR SELECT USING (TRUE);


-- ========================
-- HOMES
-- ========================
ALTER TABLE homes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_homes" ON homes FOR SELECT
  USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "insert_own_home" ON homes FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "update_own_home" ON homes FOR UPDATE
  USING (user_id = auth.uid());


-- ========================
-- METERS
-- ========================
ALTER TABLE meters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_meters" ON meters FOR SELECT
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());


-- ========================
-- SMART PLUGS
-- ========================
ALTER TABLE smart_plugs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_plugs" ON smart_plugs FOR SELECT
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());


-- ========================
-- APPLIANCES
-- ========================
ALTER TABLE appliances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_appliances" ON appliances FOR ALL
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());


-- ========================
-- METER READINGS
-- ========================
ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_readings" ON meter_readings FOR SELECT
  USING (
    meter_id IN (
      SELECT m.id FROM meters m JOIN homes h ON m.home_id = h.id WHERE h.user_id = auth.uid()
    ) OR is_admin()
  );


-- ========================
-- PLUG READINGS
-- ========================
ALTER TABLE plug_readings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_plug_readings" ON plug_readings FOR SELECT
  USING (
    plug_id IN (
      SELECT sp.id FROM smart_plugs sp JOIN homes h ON sp.home_id = h.id WHERE h.user_id = auth.uid()
    ) OR is_admin()
  );


-- ========================
-- NILM RESULTS
-- ========================
ALTER TABLE nilm_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_nilm" ON nilm_results FOR SELECT
  USING (
    meter_id IN (
      SELECT m.id FROM meters m JOIN homes h ON m.home_id = h.id WHERE h.user_id = auth.uid()
    ) OR is_admin()
  );


-- ========================
-- DAILY AGGREGATES
-- ========================
ALTER TABLE daily_aggregates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_aggregates" ON daily_aggregates FOR SELECT
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());


-- ========================
-- SCHEDULES
-- ========================
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_schedules" ON schedules FOR ALL
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());


-- ========================
-- SCHEDULE LOGS
-- ========================
ALTER TABLE schedule_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_schedule_logs" ON schedule_logs FOR SELECT
  USING (
    appliance_id IN (
      SELECT a.id FROM appliances a JOIN homes h ON a.home_id = h.id WHERE h.user_id = auth.uid()
    ) OR is_admin()
  );


-- ========================
-- CONTROL LOGS
-- ========================
ALTER TABLE control_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_control_logs" ON control_logs FOR SELECT
  USING (user_id = auth.uid() OR is_admin());


-- ========================
-- AUTOMATION RULES
-- ========================
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_rules" ON automation_rules FOR ALL
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());


-- ========================
-- RECOMMENDATIONS
-- ========================
ALTER TABLE recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_recommendations" ON recommendations FOR SELECT
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());
CREATE POLICY "dismiss_own_recommendations" ON recommendations FOR UPDATE
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()));


-- ========================
-- BILLS
-- ========================
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_bills" ON bills FOR SELECT
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());


-- ========================
-- PAYMENTS
-- ========================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_payments" ON payments FOR SELECT
  USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "insert_own_payment" ON payments FOR INSERT
  WITH CHECK (user_id = auth.uid());


-- ========================
-- RECHARGES
-- ========================
ALTER TABLE recharges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_recharges" ON recharges FOR SELECT
  USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "insert_own_recharge" ON recharges FOR INSERT
  WITH CHECK (user_id = auth.uid());


-- ========================
-- NOTIFICATIONS
-- ========================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_notifications" ON notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "mark_own_read" ON notifications FOR UPDATE
  USING (user_id = auth.uid());


-- ========================
-- COMPLAINTS
-- ========================
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_complaints" ON complaints FOR SELECT
  USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "insert_own_complaint" ON complaints FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "update_own_complaint" ON complaints FOR UPDATE
  USING (user_id = auth.uid() OR is_admin());


-- ========================
-- COMPLAINT UPDATES
-- ========================
ALTER TABLE complaint_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_complaint_updates" ON complaint_updates FOR SELECT
  USING (
    complaint_id IN (SELECT id FROM complaints WHERE user_id = auth.uid()) OR is_admin()
  );
CREATE POLICY "admin_insert_updates" ON complaint_updates FOR INSERT
  WITH CHECK (is_admin());


-- ========================
-- GAMIFICATION
-- ========================
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_achievements" ON achievements FOR SELECT USING (TRUE);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_user_achievements" ON user_achievements FOR SELECT
  USING (user_id = auth.uid() OR is_admin());

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_challenges" ON challenges FOR SELECT USING (TRUE);

ALTER TABLE user_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_user_challenges" ON user_challenges FOR SELECT
  USING (user_id = auth.uid() OR is_admin());


-- ========================
-- CARBON + OUTAGE + ADMIN
-- ========================
ALTER TABLE carbon_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_carbon" ON carbon_stats FOR SELECT
  USING (home_id IN (SELECT id FROM homes WHERE user_id = auth.uid()) OR is_admin());

ALTER TABLE outage_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_read_outages" ON outage_notices FOR SELECT USING (TRUE);
CREATE POLICY "admin_manage_outages" ON outage_notices FOR ALL USING (is_admin());

ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_audit" ON admin_audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'));


-- ============================================================
-- DONE! All tables now show "RLS Enabled" in Supabase.
-- ============================================================
