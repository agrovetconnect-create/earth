-- =============================================================================
-- Migration 049: Announcement notification type
-- =============================================================================

BEGIN;

ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_type_check;

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_type_check
  CHECK (type IN ('reply', 'vote', 'verification', 'visit', 'announcement'));

COMMIT;
