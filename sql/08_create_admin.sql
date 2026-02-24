-- ═══════════════════════════════════════════════════════════════════════════
-- VOLTWISE: Create Admin User
-- ═══════════════════════════════════════════════════════════════════════════
-- Run this in Supabase SQL Editor to promote an existing user to admin role.
-- 
-- IMPORTANT: Replace 'user@example.com' with the email of the user you want 
-- to make an admin. The user must already have a Supabase auth account.
-- ═══════════════════════════════════════════════════════════════════════════

-- Option 1: Promote user by email (recommended)
-- Replace 'admin@voltwise.com' with the actual email
UPDATE profiles
SET 
  role = 'admin',
  onboarding_done = true  -- Admins bypass consumer linking
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'admin@voltwise.com'
);

-- Verify the update
SELECT 
  p.id,
  p.name,
  p.role,
  p.onboarding_done,
  u.email
FROM profiles p
JOIN auth.users u ON p.id = u.id
WHERE p.role IN ('admin', 'super_admin');

-- ═══════════════════════════════════════════════════════════════════════════
-- Alternative: Promote user by profile ID
-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE profiles
-- SET role = 'admin', onboarding_done = true
-- WHERE id = 'your-uuid-here';

-- ═══════════════════════════════════════════════════════════════════════════
-- To create a Super Admin (full access):
-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE profiles
-- SET role = 'super_admin', onboarding_done = true
-- WHERE id IN (
--   SELECT id FROM auth.users WHERE email = 'superadmin@voltwise.com'
-- );
