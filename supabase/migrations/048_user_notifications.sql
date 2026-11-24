-- =============================================================================
-- Migration 048: Per-user notification inbox
-- =============================================================================
-- Notifications belong to exactly one Earth Talk account. The server writes
-- them with service privileges after a real event (a reply to your post, an
-- expert verification decision, ...). Browser clients have no direct access:
-- they read and mutate their own inbox only through /api/me/notifications.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type              text NOT NULL CHECK (type IN ('reply', 'vote', 'verification', 'visit')),
  title             text NOT NULL,
  body              text NOT NULL,
  passport_id       text NULL,
  site_id           text NULL,
  read_at           timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_recipient_created
  ON public.user_notifications (recipient_user_id, created_at DESC);

COMMENT ON TABLE public.user_notifications IS
  'One account''s notification inbox. Never seeded; rows only follow real events.';
COMMENT ON COLUMN public.user_notifications.recipient_user_id IS
  'The account that receives this notification. Every read is scoped to it.';

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No client direct access" ON public.user_notifications;
CREATE POLICY "No client direct access"
  ON public.user_notifications
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMIT;
