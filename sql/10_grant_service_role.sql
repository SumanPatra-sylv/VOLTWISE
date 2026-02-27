-- ============================================================
-- VOLTWISE — STEP 10: GRANT SERVICE_ROLE ACCESS
-- ============================================================
-- REQUIRED for the FastAPI backend to work.
--
-- WHY: The backend uses the Supabase service_role key, which
--   connects as the PostgreSQL `service_role` role.
--   service_role has BYPASSRLS (ignores row-level policies),
--   BUT it still needs table-level GRANT permissions.
--   00_disable_rls.sql only granted to `authenticated` and `anon`.
--
-- Run this ONCE in the Supabase SQL Editor.
-- ============================================================

-- Grant full CRUD on all existing tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- Grant sequence usage (needed for inserts with serial/generated IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Grant execute on all functions/RPCs
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Ensure FUTURE tables/sequences also get the grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- Verify: should show service_role with permissions
SELECT grantee, table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'service_role' AND table_schema = 'public'
ORDER BY table_name, privilege_type
LIMIT 20;
