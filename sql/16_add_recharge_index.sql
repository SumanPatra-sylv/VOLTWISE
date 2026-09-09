-- ============================================================
-- VOLTWISE — MIGRATION 16: Add recharge performance indexes
-- ============================================================
-- Run in Supabase SQL Editor AFTER 02_setup.sql
-- Safe to re-run (uses IF NOT EXISTS)
-- ============================================================

-- Per-user recharge history (consumer profile recharge tab, active recharger KPI)
CREATE INDEX IF NOT EXISTS idx_recharges_user_paid_at
    ON recharges(user_id, paid_at DESC);

-- Revenue reports grouped by time + status (Module 3 revenue queries)
CREATE INDEX IF NOT EXISTS idx_recharges_paid_at_status
    ON recharges(paid_at DESC, status);
