-- ============================================================================
-- 039_google_conditional_verification.sql
-- Earth Talk — Google OAuth Conditional Email Verification & Verification Challenges
-- ============================================================================

-- 1. Extend public.profiles with verification and activity timestamps
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_successful_login_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_successful_activity_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_step_up_verification_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.email_verified_at IS
  'Timestamp when the user verified their Google account email address.';
COMMENT ON COLUMN public.profiles.last_successful_login_at IS
  'Timestamp of the most recent successful login (including OAuth and step-up verification).';
COMMENT ON COLUMN public.profiles.last_successful_activity_at IS
  'Timestamp of the most recent authenticated user activity.';
COMMENT ON COLUMN public.profiles.last_step_up_verification_at IS
  'Timestamp of the most recent step-up email OTP verification.';

-- 2. Create verification_challenges table for step-up OTP security
CREATE TABLE IF NOT EXISTS public.verification_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text NOT NULL,
  otp_hash     text NOT NULL,
  purpose      text NOT NULL CHECK (purpose IN ('first_login', 'inactivity_reauth', 'security_step_up')),
  attempts     integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at   timestamptz NOT NULL,
  consumed     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.verification_challenges IS
  'Secure server-side verification challenges for Google OAuth conditional email OTP verification.';

-- Indexes for performance and cleanups
CREATE INDEX IF NOT EXISTS idx_verif_challenges_email ON public.verification_challenges(email);
CREATE INDEX IF NOT EXISTS idx_verif_challenges_user ON public.verification_challenges(user_id);
CREATE INDEX IF NOT EXISTS idx_verif_challenges_active ON public.verification_challenges(email, consumed, expires_at DESC);

-- 3. Row Level Security (RLS) on verification_challenges
ALTER TABLE public.verification_challenges ENABLE ROW LEVEL SECURITY;

-- Strict least-privilege policy: clients cannot select or mutate verification_challenges directly.
-- Verification challenges are managed strictly server-side via trusted backend operations.
DROP POLICY IF EXISTS "No client direct access to verification challenges" ON public.verification_challenges;
CREATE POLICY "No client direct access to verification challenges" ON public.verification_challenges
  FOR ALL
  USING (false);
