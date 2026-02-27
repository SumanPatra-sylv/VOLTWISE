-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  12_autopilot_migration.sql                                     ║
-- ║  Adds autopilot_enabled column to homes table                   ║
-- ║  Run this in Supabase SQL Editor                                ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- Add autopilot toggle column to homes
ALTER TABLE homes ADD COLUMN IF NOT EXISTS autopilot_enabled BOOLEAN DEFAULT FALSE;

-- Grant service_role access (should already exist from 10_grant_service_role.sql)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
