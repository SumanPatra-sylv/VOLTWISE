-- ============================================================
-- VOLTWISE — STEP 7: SCHEMA MIGRATION (NON-DESTRUCTIVE)
-- ============================================================
-- Run on existing database. Does NOT drop or reset any tables.
-- Safe to re-run (all statements are idempotent).
-- ============================================================


-- ============================================================
-- FIX 1: Add category + is_controllable to appliances
-- ============================================================
-- category: structured enum instead of relying on name-matching
-- is_controllable: prevents showing toggle for always-on devices

-- Create the enum (DO drops first to make re-runnable)
DO $$ BEGIN
  CREATE TYPE appliance_category AS ENUM (
    'ac', 'geyser', 'refrigerator', 'washing_machine',
    'fan', 'tv', 'lighting', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE appliances ADD COLUMN IF NOT EXISTS category appliance_category DEFAULT 'other';
ALTER TABLE appliances ADD COLUMN IF NOT EXISTS is_controllable BOOLEAN DEFAULT TRUE;


-- ============================================================
-- FIX 2: Midnight-crossing tariff slot bug
-- ============================================================
-- The original RPC checks: start_hour <= current_hour AND end_hour > current_hour
-- This FAILS for off-peak slots like 22:00–06:00 (crosses midnight).
--
-- Fix: For normal slots (start < end), use the standard range check.
--       For wrap-around slots (start > end), check current_hour >= start OR current_hour < end.

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

  -- Today's usage from daily_aggregates
  SELECT COALESCE(SUM(total_kwh), 0), COALESCE(SUM(total_cost), 0)
  INTO v_today_kwh, v_today_cost
  FROM daily_aggregates
  WHERE home_id = p_home_id AND appliance_id IS NULL AND date = CURRENT_DATE;

  -- Fallback: sum meter_readings if no aggregate yet
  IF v_today_kwh = 0 THEN
    SELECT COALESCE(SUM(kwh_delta), 0), COALESCE(SUM(cost_delta), 0)
    INTO v_today_kwh, v_today_cost
    FROM meter_readings
    WHERE meter_id = v_meter.id AND timestamp >= CURRENT_DATE;
  END IF;

  -- Latest reading for current load
  SELECT power_kw, tariff_rate INTO v_current_load, v_current_rate
  FROM meter_readings WHERE meter_id = v_meter.id ORDER BY timestamp DESC LIMIT 1;

  -- Active devices count
  SELECT COUNT(*) INTO v_active_devices
  FROM appliances WHERE home_id = p_home_id AND status = 'ON';

  -- Month-to-date total
  SELECT COALESCE(SUM(total_cost), 0) INTO v_month_total
  FROM daily_aggregates
  WHERE home_id = p_home_id AND appliance_id IS NULL
    AND date >= date_trunc('month', CURRENT_DATE);

  v_daily_avg := CASE WHEN v_month_total > 0
    THEN v_month_total / GREATEST(EXTRACT(DAY FROM CURRENT_DATE), 1)
    ELSE 0 END;

  -- Tariff plan and current IST hour
  SELECT tariff_plan_id INTO v_plan_id FROM homes WHERE id = p_home_id;
  v_current_hour := EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Kolkata');

  -- ═══ FIX: Midnight-aware slot matching ═══
  -- Normal slot (e.g. 6→18): start_hour <= hour < end_hour
  -- Wrap slot   (e.g. 22→6): hour >= start_hour OR hour < end_hour
  SELECT slot_type, rate INTO v_current_slot
  FROM tariff_slots
  WHERE plan_id = v_plan_id
    AND (
      CASE WHEN start_hour < end_hour
        THEN v_current_hour >= start_hour AND v_current_hour < end_hour
        ELSE v_current_hour >= start_hour OR  v_current_hour < end_hour
      END
    )
  LIMIT 1;

  -- Next slot: first slot starting after current hour
  SELECT slot_type, rate, start_hour INTO v_next_slot
  FROM tariff_slots
  WHERE plan_id = v_plan_id AND start_hour > v_current_hour
  ORDER BY start_hour LIMIT 1;

  -- Wrap-around: if nothing after current hour, grab earliest slot
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


-- ============================================================
-- NOTE: cost_per_hour column stays in the table but should be
-- treated as a CACHE, not a source of truth.
-- The frontend computes: rated_power_w / 1000 × currentSlotRate
-- cost_per_hour in DB is only updated by the backend scheduler.
-- ============================================================
