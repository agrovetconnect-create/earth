-- 029_staff_and_rbac.sql
-- Unified Staff Management, RBAC, and Email Identity

-- 1. STAFF ROLES AND PERMISSIONS
CREATE TYPE public.staff_role AS ENUM (
  'owner',     -- Full system access, staff management
  'security',  -- Cybersecurity monitoring, audit logs, session revocation
  'ops',       -- Operational monitoring, system settings, webhook management
  'support',   -- Customer care, account troubleshooting, moderation
  'science'    -- Scientific review, observation administration
);

CREATE TABLE IF NOT EXISTS public.staff (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          public.staff_role NOT NULL DEFAULT 'science',
  full_name     text NOT NULL,
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. STAFF SESSIONS (Dedicated table for staff security)
CREATE TABLE IF NOT EXISTS public.staff_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz NULL,
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  ip_hash       text NULL,
  user_agent_hash text NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_sessions_staff ON public.staff_sessions(staff_id);
CREATE INDEX idx_staff_sessions_expiry ON public.staff_sessions(expires_at) WHERE revoked_at IS NULL;

-- 3. ENHANCED USER IDENTITY (Email support)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email text UNIQUE,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz NULL;

-- 4. EMAIL VERIFICATION CODES
CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  code_hash     text NOT NULL,
  purpose       text NOT NULL CHECK (purpose IN ('registration', 'account_linking', 'password_reset')),
  expires_at    timestamptz NOT NULL,
  attempts      integer NOT NULL DEFAULT 0,
  max_attempts  integer NOT NULL DEFAULT 5,
  consumed_at   timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verification_codes_email ON public.email_verification_codes(email, created_at DESC);

-- 5. SYSTEM AUDIT LOGS (Cross-platform audit trail)
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NULL REFERENCES public.staff(id) ON DELETE SET NULL,
  action        text NOT NULL, -- e.g., 'staff.create', 'observation.delete', 'user.ban'
  target_type   text NOT NULL, -- e.g., 'staff', 'observation', 'user'
  target_id     uuid NULL,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash       text NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_audit_logs_created_at ON public.system_audit_logs(created_at DESC);
CREATE INDEX idx_system_audit_logs_staff ON public.system_audit_logs(staff_id);

-- 6. RLS POLICIES (Preliminary - Staff table is highly sensitive)
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only owners can see or manage staff
CREATE POLICY "Owners can manage staff" ON public.staff
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_sessions s
      JOIN public.staff m ON s.staff_id = m.id
      WHERE s.token_hash = current_setting('request.jwt.claims', true)::json->>'token_hash'
      AND m.role = 'owner'
      AND m.is_active = true
      AND s.expires_at > now()
      AND s.revoked_at IS NULL
    )
  );

-- Staff can see their own profile
CREATE POLICY "Staff can see own profile" ON public.staff
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_sessions s
      WHERE s.staff_id = public.staff.id
      AND s.token_hash = current_setting('request.jwt.claims', true)::json->>'token_hash'
      AND s.expires_at > now()
      AND s.revoked_at IS NULL
    )
  );
