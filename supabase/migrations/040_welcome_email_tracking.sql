-- ============================================================================
-- 040_welcome_email_tracking.sql
-- Earth Talk — Track welcome email delivery per user
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS welcome_email_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz NULL;

COMMENT ON COLUMN public.users.welcome_email_sent IS
  'True after the welcome email has been accepted for delivery to this user.';

COMMENT ON COLUMN public.users.welcome_email_sent_at IS
  'When the welcome email was accepted for delivery.';

CREATE INDEX IF NOT EXISTS idx_users_welcome_email_sent
  ON public.users (welcome_email_sent)
  WHERE welcome_email_sent = false;
