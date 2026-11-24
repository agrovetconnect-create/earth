-- =============================================================================
-- Migration 044: Comment Media Attachment & Heart / Sprout Reactions
-- =============================================================================
-- Adds optional image attachment URL on observation_comments and creates
-- observation_comment_reactions to persist ❤️ heart and 🌱 sprout reactions
-- across both community observation discussions and demo posts.
-- =============================================================================

BEGIN;

ALTER TABLE public.observation_comments
  ADD COLUMN IF NOT EXISTS image_url text NULL;

CREATE TABLE IF NOT EXISTS public.observation_comment_reactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id   text NOT NULL,
  comment_id    text NOT NULL,
  reactor_key   text NOT NULL,
  reaction_type text NOT NULL CHECK (reaction_type IN ('heart', 'sprout')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT observation_comment_reactions_unique
    UNIQUE (comment_id, reactor_key, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_observation_comment_reactions_passport
  ON public.observation_comment_reactions (passport_id, comment_id);

ALTER TABLE public.observation_comment_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No client direct access" ON public.observation_comment_reactions;
CREATE POLICY "No client direct access"
  ON public.observation_comment_reactions
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMIT;
