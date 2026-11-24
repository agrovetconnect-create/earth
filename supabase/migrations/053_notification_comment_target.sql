-- =============================================================================
-- Migration 053: Deep-link target comment_id on user notifications
-- =============================================================================
-- Stores the specific comment/reply ID on comment/reply notifications so clicking
-- a notification jumps straight to that message in the observation's Passport
-- and opens the reply composer.
-- =============================================================================

BEGIN;

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS comment_id text NULL;

COMMENT ON COLUMN public.user_notifications.comment_id IS
  'Optional discussion comment/reply id for deep-linking straight to the message inside a Passport.';

COMMIT;
