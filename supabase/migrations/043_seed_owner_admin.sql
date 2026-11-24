-- =============================================================================
-- Migration 043: Seed Owner / Super Admin Staff Accounts (No Default Password)
-- =============================================================================
-- Provisions idempotent placeholder owner records without committing any
-- default password or reusable scrypt hash in source control.
-- Runtime provisioning sets a salted scrypt hash via SUPER_ADMIN_PASSWORD_HASH
-- (or dev-only SUPER_ADMIN_PASSWORD) through bootstrap_super_admin.
-- =============================================================================

BEGIN;

INSERT INTO public.staff (email, password_hash, role, full_name, is_active)
VALUES
  (
    'agrovetconnect@gmail.com',
    '',
    'owner',
    'Super Admin (Agrovet Connect)',
    true
  ),
  (
    'owner@earthtalk.local',
    '',
    'owner',
    'Super Admin (Local)',
    true
  )
ON CONFLICT (email) DO NOTHING;

COMMIT;
