-- =============================================================================
-- Migration 042: Supabase Security & Performance Advisor Remediation
-- =============================================================================
-- Resolves all reported Supabase Security Advisor and Performance Advisor lints:
--   1. Security Definer Views (6 ERROR)       -> security_invoker = true
--   2. Function Search Path Mutable (6 WARN)  -> SET search_path = pg_catalog, public
--   3. RLS Enabled No Policy (50 INFO)        -> explicit deny-all policies
--   4. Auth RLS InitPlan (6 WARN)             -> wrap auth.uid() & current_setting() in (select ...)
--   5. Multiple Permissive Policies (12 WARN) -> split & consolidate per (role, action)
--   6. Unindexed Foreign Keys (22 INFO)       -> add covering B-tree indexes
--   7. Unused Redundant/Zero-Scan Indexes     -> drop 70 non-FK unused/duplicate indexes
--                                                (retaining the 12 sole-FK-covering indexes)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Security Definer Views -> Security Invoker (6 ERROR)
-- ---------------------------------------------------------------------------
ALTER VIEW public.public_geological_sites SET (security_invoker = true);
ALTER VIEW public.site_timeline SET (security_invoker = true);
ALTER VIEW public.public_expert_reviews SET (security_invoker = true);
ALTER VIEW public.public_category_counts SET (security_invoker = true);
ALTER VIEW public.public_observation_media SET (security_invoker = true);
ALTER VIEW public.public_observations SET (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 2. Function Search Path Mutable -> Fixed search_path (6 WARN)
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.generate_passport_id()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.generate_site_code()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.public_reviewer_label(text, boolean)
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.enforce_subcategory_belongs_to_category()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.enforce_observation_media_type()
  SET search_path = pg_catalog, public;

ALTER FUNCTION public.generate_public_user_id()
  SET search_path = pg_catalog, public;

-- ---------------------------------------------------------------------------
-- 3. Auth RLS InitPlan & Multiple Permissive Policies (18 WARN)
-- ---------------------------------------------------------------------------

-- 3a. public.observation_attachments
DROP POLICY IF EXISTS "attachments_owner_all" ON public.observation_attachments;
DROP POLICY IF EXISTS "attachments_public_read" ON public.observation_attachments;
DROP POLICY IF EXISTS "attachments_select_policy" ON public.observation_attachments;
DROP POLICY IF EXISTS "attachments_owner_insert" ON public.observation_attachments;
DROP POLICY IF EXISTS "attachments_owner_update" ON public.observation_attachments;
DROP POLICY IF EXISTS "attachments_owner_delete" ON public.observation_attachments;

CREATE POLICY "attachments_select_policy"
  ON public.observation_attachments
  FOR SELECT
  TO public
  USING (
    is_public = true
    OR uploader_user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.observations o
      WHERE o.id = observation_attachments.observation_id
        AND o.owner_user_id = (select auth.uid())
    )
  );

CREATE POLICY "attachments_owner_insert"
  ON public.observation_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploader_user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.observations o
      WHERE o.id = observation_attachments.observation_id
        AND o.owner_user_id = (select auth.uid())
    )
  );

CREATE POLICY "attachments_owner_update"
  ON public.observation_attachments
  FOR UPDATE
  TO authenticated
  USING (
    uploader_user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.observations o
      WHERE o.id = observation_attachments.observation_id
        AND o.owner_user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    uploader_user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.observations o
      WHERE o.id = observation_attachments.observation_id
        AND o.owner_user_id = (select auth.uid())
    )
  );

CREATE POLICY "attachments_owner_delete"
  ON public.observation_attachments
  FOR DELETE
  TO authenticated
  USING (
    uploader_user_id = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.observations o
      WHERE o.id = observation_attachments.observation_id
        AND o.owner_user_id = (select auth.uid())
    )
  );

-- 3b. public.staff
DROP POLICY IF EXISTS "Owners can manage staff" ON public.staff;
DROP POLICY IF EXISTS "Staff can see own profile" ON public.staff;
DROP POLICY IF EXISTS "Staff can read own or owner manage" ON public.staff;
DROP POLICY IF EXISTS "Owners can insert staff" ON public.staff;
DROP POLICY IF EXISTS "Owners can update staff" ON public.staff;
DROP POLICY IF EXISTS "Owners can delete staff" ON public.staff;

CREATE POLICY "Staff can read own or owner manage"
  ON public.staff
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_sessions s
      WHERE s.staff_id = staff.id
        AND s.token_hash = ((select current_setting('request.jwt.claims'::text, true))::json ->> 'token_hash'::text)
        AND s.expires_at > now()
        AND s.revoked_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.staff_sessions s
      JOIN public.staff m ON s.staff_id = m.id
      WHERE s.token_hash = ((select current_setting('request.jwt.claims'::text, true))::json ->> 'token_hash'::text)
        AND m.role = 'owner'::staff_role
        AND m.is_active = true
        AND s.expires_at > now()
        AND s.revoked_at IS NULL
    )
  );

CREATE POLICY "Owners can insert staff"
  ON public.staff
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.staff_sessions s
      JOIN public.staff m ON s.staff_id = m.id
      WHERE s.token_hash = ((select current_setting('request.jwt.claims'::text, true))::json ->> 'token_hash'::text)
        AND m.role = 'owner'::staff_role
        AND m.is_active = true
        AND s.expires_at > now()
        AND s.revoked_at IS NULL
    )
  );

CREATE POLICY "Owners can update staff"
  ON public.staff
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_sessions s
      JOIN public.staff m ON s.staff_id = m.id
      WHERE s.token_hash = ((select current_setting('request.jwt.claims'::text, true))::json ->> 'token_hash'::text)
        AND m.role = 'owner'::staff_role
        AND m.is_active = true
        AND s.expires_at > now()
        AND s.revoked_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.staff_sessions s
      JOIN public.staff m ON s.staff_id = m.id
      WHERE s.token_hash = ((select current_setting('request.jwt.claims'::text, true))::json ->> 'token_hash'::text)
        AND m.role = 'owner'::staff_role
        AND m.is_active = true
        AND s.expires_at > now()
        AND s.revoked_at IS NULL
    )
  );

CREATE POLICY "Owners can delete staff"
  ON public.staff
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_sessions s
      JOIN public.staff m ON s.staff_id = m.id
      WHERE s.token_hash = ((select current_setting('request.jwt.claims'::text, true))::json ->> 'token_hash'::text)
        AND m.role = 'owner'::staff_role
        AND m.is_active = true
        AND s.expires_at > now()
        AND s.revoked_at IS NULL
    )
  );

-- 3c. public.profiles
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO public
  USING (
    (id = (select auth.uid()))
    OR ((select auth.uid()) IS NOT NULL)
  );

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO public
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO public
  USING (id = (select auth.uid()))
  WITH CHECK (
    (id = (select auth.uid()))
    AND (email = email)
  );

-- ---------------------------------------------------------------------------
-- 4. RLS Enabled No Policy -> Explicit Service-Role-Only Deny Policies (50 INFO)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'accredited_laboratories',
    'admin_audit_log',
    'admin_sessions',
    'app_releases',
    'auth_sessions',
    'auth_verification_codes',
    'cms_page_revisions',
    'cms_pages',
    'community_abuse_reports',
    'community_answers',
    'community_evidence',
    'community_investigation_checks',
    'community_investigations',
    'community_questions',
    'community_reputation',
    'community_visits',
    'community_votes',
    'compliance_audit_logs',
    'contributor_sessions',
    'email_verification_codes',
    'expert_sessions',
    'expert_verifications',
    'geological_sites',
    'gis_layers',
    'observation_comments',
    'observation_data_quality',
    'observation_locations',
    'observation_media',
    'observation_privacy_audit',
    'observation_questions',
    'observations',
    'platform_settings',
    'processing_events',
    'rate_limit_buckets',
    'research_dataset_versions',
    'staff_sessions',
    'system_audit_logs',
    'user_avatars',
    'user_whatsapp_identities',
    'users',
    'validation_ai_predictions',
    'validation_ai_runs',
    'validation_datasets',
    'validation_errors',
    'validation_images',
    'validation_reference_labels',
    'validation_samples',
    'verification_audit_logs',
    'webhook_jobs',
    'webhook_message_claims'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "No client direct access" ON public.%I;', tbl);
    EXECUTE format('CREATE POLICY "No client direct access" ON public.%I FOR ALL USING (false) WITH CHECK (false);', tbl);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Unindexed Foreign Keys -> Covering Indexes (22 INFO)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_community_abuse_reports_evidence_id
  ON public.community_abuse_reports (evidence_id);
CREATE INDEX IF NOT EXISTS idx_community_abuse_reports_investigation_id
  ON public.community_abuse_reports (investigation_id);
CREATE INDEX IF NOT EXISTS idx_community_abuse_reports_media_id
  ON public.community_abuse_reports (media_id);
CREATE INDEX IF NOT EXISTS idx_community_abuse_reports_question_id
  ON public.community_abuse_reports (question_id);
CREATE INDEX IF NOT EXISTS idx_community_abuse_reports_site_id
  ON public.community_abuse_reports (site_id);

CREATE INDEX IF NOT EXISTS idx_community_answers_evidence_id
  ON public.community_answers (evidence_id);

CREATE INDEX IF NOT EXISTS idx_community_evidence_media_id
  ON public.community_evidence (media_id);
CREATE INDEX IF NOT EXISTS idx_community_evidence_observation_id
  ON public.community_evidence (observation_id);

CREATE INDEX IF NOT EXISTS idx_community_media_observation_media_id
  ON public.community_media (observation_media_id);

CREATE INDEX IF NOT EXISTS idx_community_questions_investigation_id
  ON public.community_questions (investigation_id);
CREATE INDEX IF NOT EXISTS idx_community_questions_observation_id
  ON public.community_questions (observation_id);

CREATE INDEX IF NOT EXISTS idx_community_visits_media_id
  ON public.community_visits (media_id);

CREATE INDEX IF NOT EXISTS idx_observation_attachments_uploader_user_id
  ON public.observation_attachments (uploader_user_id);

CREATE INDEX IF NOT EXISTS idx_observation_media_observation_category
  ON public.observation_media (observation_category);
CREATE INDEX IF NOT EXISTS idx_observation_media_media_category
  ON public.observation_media (media_category);
CREATE INDEX IF NOT EXISTS idx_observation_media_site_id
  ON public.observation_media (site_id);
CREATE INDEX IF NOT EXISTS idx_observation_media_stored_by_user_id
  ON public.observation_media (stored_by_user_id);

CREATE INDEX IF NOT EXISTS idx_observation_privacy_audit_actor_user_id
  ON public.observation_privacy_audit (actor_user_id);

CREATE INDEX IF NOT EXISTS idx_observation_questions_answered_by_user_id
  ON public.observation_questions (answered_by_user_id);

CREATE INDEX IF NOT EXISTS idx_validation_ai_predictions_image_id
  ON public.validation_ai_predictions (image_id);
CREATE INDEX IF NOT EXISTS idx_validation_ai_predictions_sample_id
  ON public.validation_ai_predictions (sample_id);

CREATE INDEX IF NOT EXISTS idx_validation_errors_sample_id
  ON public.validation_errors (sample_id);

-- ---------------------------------------------------------------------------
-- 6. Drop Unused Non-FK & Redundant Indexes (70 of 82)
-- ---------------------------------------------------------------------------
-- Note: The 12 unused indexes that are the sole covering index for an active
-- foreign key constraint are intentionally retained so unindexed_foreign_keys
-- remains clean:
--   idx_community_answers_question, idx_community_evidence_investigation,
--   idx_community_media_investigation, idx_geoscience_subcategories_category,
--   idx_observations_observation_category, idx_observations_observation_subcategory,
--   idx_staff_sessions_staff, idx_system_audit_logs_staff,
--   idx_val_ai_runs_dataset, idx_val_errors_run,
--   idx_val_images_sample, idx_val_samples_dataset.
DROP INDEX IF EXISTS public.idx_admin_audit_log_action;
DROP INDEX IF EXISTS public.idx_admin_audit_log_occurred_at;
DROP INDEX IF EXISTS public.idx_admin_audit_log_target;
DROP INDEX IF EXISTS public.idx_admin_sessions_active;
DROP INDEX IF EXISTS public.idx_admin_sessions_token_hash;
DROP INDEX IF EXISTS public.idx_app_releases_uploaded_at;
DROP INDEX IF EXISTS public.idx_auth_sessions_expiry;
DROP INDEX IF EXISTS public.idx_auth_verification_codes_expiry;
DROP INDEX IF EXISTS public.idx_auth_verification_codes_phone;
DROP INDEX IF EXISTS public.idx_cms_page_revisions_slug_saved;
DROP INDEX IF EXISTS public.idx_community_abuse_reports_observation_passport;
DROP INDEX IF EXISTS public.idx_community_abuse_reports_open;
DROP INDEX IF EXISTS public.idx_community_abuse_reports_status;
DROP INDEX IF EXISTS public.idx_community_answers_expert;
DROP INDEX IF EXISTS public.idx_community_evidence_contributor;
DROP INDEX IF EXISTS public.idx_community_investigation_checks_contributor;
DROP INDEX IF EXISTS public.idx_community_investigations_survey;
DROP INDEX IF EXISTS public.idx_community_media_moderation;
DROP INDEX IF EXISTS public.idx_community_questions_requested_expert;
DROP INDEX IF EXISTS public.idx_community_questions_status;
DROP INDEX IF EXISTS public.idx_community_visits_contributor;
DROP INDEX IF EXISTS public.idx_community_votes_contributor;
DROP INDEX IF EXISTS public.idx_compliance_audit_actor_id;
DROP INDEX IF EXISTS public.idx_compliance_audit_created_at;
DROP INDEX IF EXISTS public.idx_compliance_audit_event_type;
DROP INDEX IF EXISTS public.idx_contributor_sessions_active;
DROP INDEX IF EXISTS public.idx_contributor_sessions_contributor;
DROP INDEX IF EXISTS public.idx_expert_sessions_token_hash;
DROP INDEX IF EXISTS public.idx_expert_sessions_user_active;
DROP INDEX IF EXISTS public.idx_expert_verifications_created_at;
DROP INDEX IF EXISTS public.idx_expert_verifications_reviewer_id;
DROP INDEX IF EXISTS public.idx_geological_sites_district;
DROP INDEX IF EXISTS public.idx_geological_sites_geom;
DROP INDEX IF EXISTS public.idx_geological_sites_research_opportunity;
DROP INDEX IF EXISTS public.observation_attachments_kind_idx;
DROP INDEX IF EXISTS public.idx_observation_comments_moderation;
DROP INDEX IF EXISTS public.idx_obs_quality_image_sha256;
DROP INDEX IF EXISTS public.idx_obs_quality_overall_score;
DROP INDEX IF EXISTS public.idx_obs_quality_passport_id;
DROP INDEX IF EXISTS public.idx_observation_locations_district;
DROP INDEX IF EXISTS public.idx_observation_locations_geom;
DROP INDEX IF EXISTS public.idx_observation_locations_is_public;
DROP INDEX IF EXISTS public.idx_observation_media_observation;
DROP INDEX IF EXISTS public.idx_observation_media_visibility;
DROP INDEX IF EXISTS public.idx_observations_category_public;
DROP INDEX IF EXISTS public.idx_observations_community_status;
DROP INDEX IF EXISTS public.idx_observations_confidence;
DROP INDEX IF EXISTS public.idx_observations_evidence_state;
DROP INDEX IF EXISTS public.idx_observations_evidence_state_rejected;
DROP INDEX IF EXISTS public.idx_observations_location_status;
DROP INDEX IF EXISTS public.idx_observations_primary_classification;
DROP INDEX IF EXISTS public.idx_observations_publication_status;
DROP INDEX IF EXISTS public.idx_observations_published_at;
DROP INDEX IF EXISTS public.idx_observations_source_message_id;
DROP INDEX IF EXISTS public.idx_observations_source_user_hash;
DROP INDEX IF EXISTS public.idx_observations_verification_status;
DROP INDEX IF EXISTS public.idx_profiles_updated;
DROP INDEX IF EXISTS public.idx_research_versions_tag;
DROP INDEX IF EXISTS public.idx_staff_sessions_expiry;
DROP INDEX IF EXISTS public.idx_system_audit_logs_created_at;
DROP INDEX IF EXISTS public.idx_user_trusted_devices_user;
DROP INDEX IF EXISTS public.idx_val_ai_preds_run;
DROP INDEX IF EXISTS public.idx_val_images_hash;
DROP INDEX IF EXISTS public.idx_val_labels_sample;
DROP INDEX IF EXISTS public.idx_val_samples_partition;
DROP INDEX IF EXISTS public.idx_verification_audit_logs_created_at;
DROP INDEX IF EXISTS public.idx_verification_audit_logs_passport_id;
DROP INDEX IF EXISTS public.idx_verif_challenges_email;
DROP INDEX IF EXISTS public.idx_webhook_jobs_due;
DROP INDEX IF EXISTS public.idx_webhook_jobs_locked;

COMMIT;
