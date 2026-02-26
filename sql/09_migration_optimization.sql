-- ============================================================
-- VOLTWISE — MIGRATION: Add optimization tier + eco mode
-- ============================================================
-- Non-destructive. Safe to re-run. Adds columns for the
-- tariff optimization engine without touching existing data.
-- ============================================================

-- Step 1: Create the optimization_tier enum (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'optimization_tier') THEN
        CREATE TYPE optimization_tier AS ENUM ('tier_1_shiftable', 'tier_2_prep_needed', 'tier_3_comfort', 'tier_4_essential');
    END IF;
END
$$;

-- Step 2: Add columns to appliances table
ALTER TABLE appliances ADD COLUMN IF NOT EXISTS optimization_tier optimization_tier DEFAULT 'tier_4_essential';
ALTER TABLE appliances ADD COLUMN IF NOT EXISTS eco_mode_enabled  BOOLEAN DEFAULT FALSE;

-- Step 3: Auto-populate tiers from existing category values
UPDATE appliances SET optimization_tier = 'tier_3_comfort'      WHERE category = 'ac';
UPDATE appliances SET optimization_tier = 'tier_1_shiftable'    WHERE category = 'geyser';
UPDATE appliances SET optimization_tier = 'tier_4_essential'    WHERE category = 'refrigerator';
UPDATE appliances SET optimization_tier = 'tier_2_prep_needed'  WHERE category = 'washing_machine';
UPDATE appliances SET optimization_tier = 'tier_4_essential'    WHERE category = 'fan';
UPDATE appliances SET optimization_tier = 'tier_4_essential'    WHERE category = 'tv';
UPDATE appliances SET optimization_tier = 'tier_4_essential'    WHERE category = 'lighting';
UPDATE appliances SET optimization_tier = 'tier_4_essential'    WHERE category = 'other';
