-- =============================================================================
-- Migration 050: Control Center system settings
-- =============================================================================
-- Server-owned key/value settings used by Control Center features such as the
-- maintenance banner. Browser clients never read or write this table directly.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.system_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text NULL
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No client direct access" ON public.system_settings;
CREATE POLICY "No client direct access"
  ON public.system_settings
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMIT;
