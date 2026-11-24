-- =============================================================================
-- Migration 052: Enterprise Security, Performance & Schema Hardening
-- =============================================================================
-- 1. Neutralizes any historical default seed hash in public.staff.
-- 2. Restores critical runtime spatial, queue, observation, auth, and audit
--    indexes dropped during advisor remediation (042).
-- 3. Widens webhook_jobs.job_type CHECK constraint to include 'audio'.
-- 4. Restricts public.profiles SELECT policy so authenticated users only read
--    their own profile row.
-- 5. Adds public.app_distribution_config with RLS deny-all client access.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Neutralize legacy committed default owner hash if previously applied
-- ---------------------------------------------------------------------------
UPDATE public.staff
SET
  password_hash = '',
  updated_at = now()
WHERE password_hash = 'scrypt$1a68c703925deadfe65daac005040b22$25b44d3dca4c4d29a6fe670134dd10cfffb905487b8e5b00cc1eff93b7fe61c297a46a5529a1cef067819ce987dcbafd45681a9bf1829709b43acf8221cb1329';

-- ---------------------------------------------------------------------------
-- 2. Restore essential runtime indexes dropped in migration 042
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_geological_sites_geom
  ON public.geological_sites USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_geological_sites_district
  ON public.geological_sites (district);

CREATE INDEX IF NOT EXISTS idx_observation_locations_geom
  ON public.observation_locations USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_observation_locations_district
  ON public.observation_locations (district);
CREATE INDEX IF NOT EXISTS idx_observation_locations_is_public
  ON public.observation_locations (is_public);

CREATE INDEX IF NOT EXISTS idx_webhook_jobs_due
  ON public.webhook_jobs (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_locked
  ON public.webhook_jobs (status, locked_at);

CREATE INDEX IF NOT EXISTS idx_observations_publication_status
  ON public.observations (publication_status);
CREATE INDEX IF NOT EXISTS idx_observations_published_at
  ON public.observations (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_observations_source_message_id
  ON public.observations (source_message_id);
CREATE INDEX IF NOT EXISTS idx_observations_source_user_hash
  ON public.observations (source_user_hash);
CREATE INDEX IF NOT EXISTS idx_observations_evidence_state
  ON public.observations (evidence_state);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry
  ON public.auth_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expiry
  ON public.staff_sessions (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_verif_challenges_email
  ON public.verification_challenges (email);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_occurred_at
  ON public.admin_audit_log (occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Widen webhook_jobs.job_type CHECK constraint to support 'audio'
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  c name;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.webhook_jobs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%job_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.webhook_jobs DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.webhook_jobs
  ADD CONSTRAINT webhook_jobs_job_type_check
  CHECK (job_type IN ('media', 'audio', 'location', 'text', 'unsupported'));

-- ---------------------------------------------------------------------------
-- 4. Tighten public.profiles SELECT RLS policy (own row only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO public
  USING (id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. Durable app_distribution_config table (server-side control-plane state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_distribution_config (
  id text PRIMARY KEY DEFAULT 'default',
  mode text NOT NULL DEFAULT 'apk' CHECK (mode IN ('apk', 'play_store', 'both')),
  is_play_store_active boolean NOT NULL DEFAULT false,
  is_get_app_sidebar_visible boolean NOT NULL DEFAULT false,
  is_whatsapp_sidebar_visible boolean NOT NULL DEFAULT false,
  whatsapp_number text NOT NULL DEFAULT '',
  play_store_url text NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=org.earthtalk.mobile',
  version_name text NOT NULL DEFAULT 'v1.0.0',
  version_code integer NOT NULL DEFAULT 1,
  package_name text NOT NULL DEFAULT 'org.earthtalk.mobile',
  min_android text NOT NULL DEFAULT 'Android 8.0 (API 26)+',
  apk_filename text NOT NULL DEFAULT 'earthtalk.apk',
  release_notes text NOT NULL DEFAULT '',
  download_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT 'Super Admin'
);

ALTER TABLE public.app_distribution_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No client direct access" ON public.app_distribution_config;
CREATE POLICY "No client direct access"
  ON public.app_distribution_config
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMIT;
