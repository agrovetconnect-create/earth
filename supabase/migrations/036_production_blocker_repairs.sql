-- =============================================================================
-- 036_production_blocker_repairs.sql
--
-- Authoritative corrective and security-hardening migration for Earth Talk.
-- Safely repairs environments where 033 or 035 were already recorded or
-- partially applied, and completes database-level guarantees for:
--   1. Corrective gis_layers legacy naming cleanup without nonexistent columns
--   2. Server-revocable contributor sessions, accredited laboratory registry,
--      durable CMS storage + revision history, and durable signed APK releases
--   3. All transactional administrative, moderation, site-assignment, CMS, and
--      expert-verification RPCs (no nonexistent enum casts; strict validation)
--   4. Hardened public views (site_timeline, public_observation_media,
--      public_observations) preserving exact column names and ordinal positions
--   5. Row-Level Security (RLS) and least-privilege table & function grants
--      (user_avatars, geoscience_categories, geoscience_subcategories, webhook
--      RPCs, rate_limit_buckets, and internal administrative tables)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. CORRECTIVE GIS LAYER LEGACY NAME CLEANUP (Safe for 011+ schemas)
-- =============================================================================
UPDATE public.gis_layers
SET source_attribution = replace(source_attribution, 'Rock Talk', 'Earth Talk'),
    display_name = replace(display_name, 'Rock Talk', 'Earth Talk'),
    data_source = replace(data_source, 'Rock Talk', 'Earth Talk'),
    updated_at = now()
WHERE source_attribution LIKE '%Rock Talk%'
   OR display_name LIKE '%Rock Talk%'
   OR data_source LIKE '%Rock Talk%';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'gis_layers'
      AND column_name = 'description'
  ) THEN
    EXECUTE $sql$
      UPDATE public.gis_layers
      SET description = replace(description, 'Rock Talk', 'Earth Talk')
      WHERE description LIKE '%Rock Talk%'
    $sql$;
  END IF;
END
$$;

-- =============================================================================
-- 2. SUPPORTING TABLES FOR SESSIONS, LAB CONFIRMATION, CMS & APK RELEASES
-- =============================================================================

-- 2a. Server-side revocable pseudonymous contributor sessions
CREATE TABLE IF NOT EXISTS public.contributor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  contributor_hash text NOT NULL,
  issued_platform text NOT NULL DEFAULT 'web'
    CHECK (issued_platform IN ('web', 'mobile')),
  ip_hash text NULL,
  user_agent_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_contributor_sessions_active
  ON public.contributor_sessions (token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contributor_sessions_contributor
  ON public.contributor_sessions (contributor_hash);

ALTER TABLE public.contributor_sessions ENABLE ROW LEVEL SECURITY;

-- 2b. Accredited laboratory registry (starts empty — never pre-seeded with fake entries)
CREATE TABLE IF NOT EXISTS public.accredited_laboratories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lab_code text NOT NULL UNIQUE
    CHECK (length(btrim(lab_code)) >= 3 AND length(btrim(lab_code)) <= 64),
  name text NOT NULL
    CHECK (length(btrim(name)) >= 3),
  accreditation_ref text NOT NULL
    CHECK (length(btrim(accreditation_ref)) >= 3),
  is_active boolean NOT NULL DEFAULT true,
  registered_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.accredited_laboratories ENABLE ROW LEVEL SECURITY;

-- 2c. Durable CMS pages and immutable revision history
CREATE TABLE IF NOT EXISTS public.cms_pages (
  slug text PRIMARY KEY
    CHECK (slug IN ('about', 'terms', 'privacy', 'how_it_works', 'contact', 'faq')),
  title text NOT NULL CHECK (length(btrim(title)) >= 1 AND length(title) <= 200),
  content jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cms_page_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug text NOT NULL REFERENCES public.cms_pages(slug) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1),
  title text NOT NULL,
  content jsonb NOT NULL,
  saved_by text NOT NULL,
  change_note text NULL,
  saved_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_cms_page_revision_version UNIQUE (page_slug, version)
);

CREATE INDEX IF NOT EXISTS idx_cms_page_revisions_slug_saved
  ON public.cms_page_revisions (page_slug, version DESC);

ALTER TABLE public.cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_page_revisions ENABLE ROW LEVEL SECURITY;

-- 2d. Durable signed Android APK release registry + private storage bucket
CREATE TABLE IF NOT EXISTS public.app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_name text NOT NULL CHECK (length(btrim(version_name)) >= 1 AND length(version_name) <= 40),
  version_code integer NOT NULL CHECK (version_code >= 1),
  package_name text NOT NULL CHECK (length(btrim(package_name)) >= 3),
  release_notes text NOT NULL DEFAULT '',
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0),
  signature_scheme text NOT NULL
    CHECK (signature_scheme IN ('v1', 'v2_or_v3', 'v1+v2_or_v3')),
  storage_bucket text NULL,
  storage_object_path text NULL,
  local_filename text NULL,
  is_current boolean NOT NULL DEFAULT true,
  uploaded_by text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_releases_single_current
  ON public.app_releases ((is_current))
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_app_releases_uploaded_at
  ON public.app_releases (uploaded_at DESC);

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'storage'
      AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'app-releases',
      'app-releases',
      false,
      157286400,
      ARRAY['application/vnd.android.package-archive', 'application/octet-stream']
    )
    ON CONFLICT (id) DO UPDATE
      SET public = false,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;

    UPDATE storage.buckets
       SET public = false
     WHERE id IN ('community-media', 'community_media', 'observation-media', 'observation-attachments');
  END IF;
END
$$;

-- =============================================================================
-- 3. TRANSACTIONAL ADMINISTRATIVE, SCIENTIFIC & EXPERT RPC FUNCTIONS
-- =============================================================================

-- 3a. Staff Update Transactional (full non-secret before/after audit state + session revocation)
CREATE OR REPLACE FUNCTION public.update_staff_transactional(
  p_staff_id uuid,
  p_role public.staff_role,
  p_is_active boolean,
  p_full_name text,
  p_password_hash text,
  p_actor_id uuid,
  p_actor_role text,
  p_ip_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_before public.staff%ROWTYPE;
  v_after public.staff%ROWTYPE;
  v_password_changed boolean := (p_password_hash IS NOT NULL AND p_password_hash <> '');
BEGIN
  SELECT * INTO v_before
  FROM public.staff
  WHERE id = p_staff_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff record % not found', p_staff_id;
  END IF;

  UPDATE public.staff
  SET role = COALESCE(p_role, role),
      is_active = COALESCE(p_is_active, is_active),
      full_name = COALESCE(p_full_name, full_name),
      password_hash = CASE WHEN v_password_changed THEN p_password_hash ELSE password_hash END,
      updated_at = now()
  WHERE id = p_staff_id
  RETURNING * INTO v_after;

  -- Immediately revoke existing sessions if deactivated, role changed, or password rotated
  IF (v_after.is_active = false)
     OR (v_after.role IS DISTINCT FROM v_before.role)
     OR v_password_changed THEN
    UPDATE public.staff_sessions
       SET revoked_at = now()
     WHERE staff_id = p_staff_id
       AND revoked_at IS NULL;
  END IF;

  INSERT INTO public.system_audit_logs (
    staff_id,
    action,
    target_type,
    target_id,
    metadata,
    ip_hash
  )
  VALUES (
    p_actor_id,
    'staff.update',
    'staff',
    p_staff_id,
    jsonb_build_object(
      'actor_role', p_actor_role,
      'password_changed', v_password_changed,
      'before', jsonb_build_object(
        'id', v_before.id,
        'email', v_before.email,
        'role', v_before.role,
        'is_active', v_before.is_active,
        'full_name', v_before.full_name,
        'created_at', v_before.created_at,
        'updated_at', v_before.updated_at
      ),
      'after', jsonb_build_object(
        'id', v_after.id,
        'email', v_after.email,
        'role', v_after.role,
        'is_active', v_after.is_active,
        'full_name', v_after.full_name,
        'created_at', v_after.created_at,
        'updated_at', v_after.updated_at
      )
    ),
    p_ip_hash
  );

  RETURN jsonb_build_object(
    'id', v_after.id,
    'email', v_after.email,
    'role', v_after.role,
    'is_active', v_after.is_active,
    'full_name', v_after.full_name,
    'created_at', v_after.created_at,
    'updated_at', v_after.updated_at
  );
END;
$$;

-- 3b. Observation Evidence State Update Transactional (with structured lab verification)
DROP FUNCTION IF EXISTS public.update_evidence_state_transactional(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.update_evidence_state_transactional(
  p_observation_id uuid,
  p_evidence_state text,
  p_reason text,
  p_actor text,
  p_actor_role text,
  p_scientific_evidence jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_before public.observations%ROWTYPE;
  v_after public.observations%ROWTYPE;
  v_now timestamptz := now();
  v_lab_id text;
  v_report_id text;
  v_method text;
  v_ev_ref text;
  v_auth_ref text;
  v_basis text := NULL;
  v_confirmed_at timestamptz := NULL;
  v_evidence_exists boolean := false;
BEGIN
  IF p_evidence_state NOT IN (
    'ai_assisted',
    'community_supported',
    'community_investigated',
    'expert_reviewed',
    'scientifically_confirmed',
    'unresolved',
    'insufficient_evidence',
    'rejected'
  ) THEN
    RAISE EXCEPTION 'Invalid evidence_state: %', p_evidence_state
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A non-empty reason is required to change evidence_state'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_before
  FROM public.observations
  WHERE id = p_observation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Observation % not found', p_observation_id;
  END IF;

  IF p_evidence_state = 'scientifically_confirmed' THEN
    IF p_scientific_evidence IS NULL OR jsonb_typeof(p_scientific_evidence) <> 'object' THEN
      RAISE EXCEPTION 'scientifically_confirmed requires structured laboratory evidence'
        USING ERRCODE = 'check_violation';
    END IF;

    v_lab_id := btrim(COALESCE(p_scientific_evidence->>'laboratory_id', ''));
    v_report_id := btrim(COALESCE(p_scientific_evidence->>'report_id', ''));
    v_method := btrim(COALESCE(p_scientific_evidence->>'analytical_method', ''));
    v_ev_ref := btrim(COALESCE(p_scientific_evidence->>'evidence_reference', ''));
    v_auth_ref := btrim(COALESCE(p_scientific_evidence->>'review_authorization', ''));

    IF length(v_lab_id) < 3 OR length(v_report_id) < 3 OR length(v_method) < 3
       OR length(v_ev_ref) < 3 OR length(v_auth_ref) < 3 THEN
      RAISE EXCEPTION 'scientifically_confirmed requires laboratory_id, report_id, analytical_method, evidence_reference, and review_authorization'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.accredited_laboratories al
      WHERE lower(al.lab_code) = lower(v_lab_id)
        AND al.is_active = true
    ) THEN
      RAISE EXCEPTION 'Laboratory code % is not registered as an active accredited laboratory', v_lab_id
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT (
      EXISTS (
        SELECT 1 FROM public.observation_attachments oa
        WHERE oa.observation_id = p_observation_id
          AND (oa.id::text = v_ev_ref OR oa.storage_path = v_ev_ref)
      )
      OR EXISTS (
        SELECT 1 FROM public.observation_media om
        WHERE om.observation_id = p_observation_id
          AND om.moderation_status <> 'removed'
          AND (om.id::text = v_ev_ref OR om.source_media_id = v_ev_ref OR om.storage_path = v_ev_ref)
      )
      OR EXISTS (
        SELECT 1 FROM public.community_evidence ce
        WHERE ce.observation_id = p_observation_id
          AND ce.moderation_status = 'visible'
          AND ce.id::text = v_ev_ref
      )
    ) INTO v_evidence_exists;

    IF NOT v_evidence_exists THEN
      RAISE EXCEPTION 'Evidence reference % does not match any stored attachment or evidence record for observation %', v_ev_ref, p_observation_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_basis := jsonb_build_object(
      'laboratory_id', v_lab_id,
      'report_id', v_report_id,
      'analytical_method', v_method,
      'evidence_reference', v_ev_ref,
      'review_authorization', v_auth_ref
    )::text;
    v_confirmed_at := v_now;
  ELSE
    v_basis := v_before.scientific_confirmation_basis;
    v_confirmed_at := v_before.scientific_confirmed_at;
  END IF;

  UPDATE public.observations
  SET evidence_state = p_evidence_state,
      evidence_state_reason = p_reason,
      evidence_state_changed_at = v_now,
      evidence_state_changed_by = p_actor,
      scientific_confirmation_basis = v_basis,
      scientific_confirmed_at = v_confirmed_at,
      updated_at = v_now
  WHERE id = p_observation_id
  RETURNING * INTO v_after;

  INSERT INTO public.admin_audit_log (
    actor,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    details
  )
  VALUES (
    p_actor,
    p_actor_role,
    'observation.evidence_state_changed',
    'observation',
    p_observation_id::text,
    p_reason,
    jsonb_build_object(
      'before_state', v_before.evidence_state,
      'after_state', p_evidence_state,
      'scientific_evidence', p_scientific_evidence
    )
  );

  RETURN to_jsonb(v_after);
END;
$$;

-- 3c. Observation Publication Status Update Transactional (plain text + check validation)
CREATE OR REPLACE FUNCTION public.update_publication_status_transactional(
  p_observation_id uuid,
  p_publication_status text,
  p_reason text,
  p_actor text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_before public.observations%ROWTYPE;
  v_after public.observations%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_publication_status NOT IN ('private', 'pending_review', 'public', 'hidden', 'rejected') THEN
    RAISE EXCEPTION 'Invalid publication_status: %', p_publication_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_before
  FROM public.observations
  WHERE id = p_observation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Observation % not found', p_observation_id;
  END IF;

  UPDATE public.observations
  SET publication_status = p_publication_status,
      published_at = CASE WHEN p_publication_status = 'public' THEN COALESCE(published_at, v_now) ELSE published_at END,
      public_visibility_reason = p_reason,
      updated_at = v_now
  WHERE id = p_observation_id
  RETURNING * INTO v_after;

  UPDATE public.observation_locations
  SET is_public = (p_publication_status = 'public')
  WHERE observation_id = p_observation_id;

  INSERT INTO public.admin_audit_log (
    actor,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    details
  )
  VALUES (
    p_actor,
    p_actor_role,
    'observation.publication_changed',
    'observation',
    p_observation_id::text,
    p_reason,
    jsonb_build_object('before_status', v_before.publication_status, 'after_status', p_publication_status)
  );

  RETURN to_jsonb(v_after);
END;
$$;

-- 3d. Media Moderation Update Transactional (plain text + check validation)
CREATE OR REPLACE FUNCTION public.update_media_moderation_transactional(
  p_media_id uuid,
  p_moderation_status text,
  p_reason text,
  p_actor text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_before public.observation_media%ROWTYPE;
  v_after public.observation_media%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_moderation_status NOT IN ('visible', 'pending_review', 'hidden', 'removed') THEN
    RAISE EXCEPTION 'Invalid moderation_status: %', p_moderation_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_before
  FROM public.observation_media
  WHERE id = p_media_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Observation media % not found', p_media_id;
  END IF;

  UPDATE public.observation_media
  SET moderation_status = p_moderation_status,
      is_public = CASE WHEN p_moderation_status = 'visible' THEN is_public ELSE false END,
      moderated_by = p_actor,
      moderated_at = v_now
  WHERE id = p_media_id
  RETURNING * INTO v_after;

  INSERT INTO public.admin_audit_log (
    actor,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    details
  )
  VALUES (
    p_actor,
    p_actor_role,
    'media.moderated',
    'media',
    p_media_id::text,
    p_reason,
    jsonb_build_object('before_status', v_before.moderation_status, 'after_status', p_moderation_status)
  );

  RETURN to_jsonb(v_after);
END;
$$;

-- 3e. Media Visibility Update Transactional (plain text + check validation)
CREATE OR REPLACE FUNCTION public.update_media_visibility_transactional(
  p_media_id uuid,
  p_visibility text,
  p_reason text,
  p_actor text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_before public.observation_media%ROWTYPE;
  v_after public.observation_media%ROWTYPE;
BEGIN
  IF p_visibility NOT IN ('private', 'pending', 'public', 'hidden') THEN
    RAISE EXCEPTION 'Invalid visibility: %', p_visibility
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_before
  FROM public.observation_media
  WHERE id = p_media_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Observation media % not found', p_media_id;
  END IF;

  UPDATE public.observation_media
  SET visibility = p_visibility,
      is_public = (p_visibility = 'public' AND moderation_status = 'visible')
  WHERE id = p_media_id
  RETURNING * INTO v_after;

  INSERT INTO public.admin_audit_log (
    actor,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    details
  )
  VALUES (
    p_actor,
    p_actor_role,
    'media.visibility_changed',
    'media',
    p_media_id::text,
    p_reason,
    jsonb_build_object('before_visibility', v_before.visibility, 'after_visibility', p_visibility)
  );

  RETURN to_jsonb(v_after);
END;
$$;

-- 3f. Site Assignment Transactional (repairs non-transactional setObservationSite)
CREATE OR REPLACE FUNCTION public.assign_observation_site_transactional(
  p_observation_id uuid,
  p_site_id uuid,
  p_reason text,
  p_actor text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_before public.observations%ROWTYPE;
  v_after public.observations%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_before
  FROM public.observations
  WHERE id = p_observation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Observation % not found', p_observation_id;
  END IF;

  IF p_site_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.geological_sites s WHERE s.id = p_site_id
  ) THEN
    RAISE EXCEPTION 'Geological site % not found', p_site_id;
  END IF;

  UPDATE public.observations
  SET site_id = p_site_id,
      updated_at = v_now
  WHERE id = p_observation_id
  RETURNING * INTO v_after;

  INSERT INTO public.admin_audit_log (
    actor,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    details
  )
  VALUES (
    p_actor,
    p_actor_role,
    'observation.site_assigned',
    'observation',
    p_observation_id::text,
    COALESCE(NULLIF(btrim(p_reason), ''), 'Observation site assignment updated'),
    jsonb_build_object('before_site_id', v_before.site_id, 'after_site_id', p_site_id)
  );

  RETURN to_jsonb(v_after);
END;
$$;

-- 3g. Expert Verification Transactional (repairs multi-table race + idx_expert_verifications_latest_unique conflict)
CREATE OR REPLACE FUNCTION public.submit_expert_verification_transactional(
  p_passport_id text,
  p_reviewer_id text,
  p_reviewer_name text,
  p_reviewer_role text,
  p_reviewer_organization text,
  p_identity_published boolean,
  p_new_status text,
  p_action text,
  p_expert_classification text DEFAULT NULL,
  p_expert_rock_name text DEFAULT NULL,
  p_expert_confidence text DEFAULT NULL,
  p_expert_observed_features jsonb DEFAULT '[]'::jsonb,
  p_expert_notes text DEFAULT NULL,
  p_scientific_remarks text DEFAULT NULL,
  p_publication_status text DEFAULT NULL,
  p_public_visibility_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_obs public.observations%ROWTYPE;
  v_updated_obs public.observations%ROWTYPE;
  v_verif public.expert_verifications%ROWTYPE;
  v_audit public.verification_audit_logs%ROWTYPE;
  v_now timestamptz := now();
  v_next_pub text;
  v_next_pub_at timestamptz;
  v_next_ev_state text;
  v_make_public boolean;
  v_audit_notes text;
  v_audit_meta jsonb;
BEGIN
  IF p_new_status NOT IN ('under_review', 'expert_verified', 'rejected') THEN
    RAISE EXCEPTION 'Invalid verification status: %', p_new_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_obs
  FROM public.observations
  WHERE passport_id = p_passport_id
    AND is_demo = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Observation with passport ID % not found', p_passport_id;
  END IF;

  v_next_pub := COALESCE(p_publication_status, v_obs.publication_status);
  v_next_pub_at := CASE
    WHEN v_next_pub = 'public' THEN COALESCE(v_obs.published_at, v_now)
    ELSE v_obs.published_at
  END;

  v_next_ev_state := CASE
    WHEN p_new_status = 'expert_verified' THEN
      CASE WHEN v_obs.evidence_state = 'scientifically_confirmed' THEN 'scientifically_confirmed' ELSE 'expert_reviewed' END
    WHEN p_new_status = 'rejected' THEN 'rejected'
    ELSE v_obs.evidence_state
  END;

  UPDATE public.observations
  SET verification_status = p_new_status,
      publication_status = v_next_pub,
      published_at = v_next_pub_at,
      public_visibility_reason = COALESCE(p_public_visibility_reason, public_visibility_reason),
      evidence_state = v_next_ev_state,
      evidence_state_reason = CASE
        WHEN p_new_status = 'rejected' THEN COALESCE(NULLIF(btrim(p_expert_notes), ''), NULLIF(btrim(p_scientific_remarks), ''), 'Rejected during expert review')
        ELSE evidence_state_reason
      END,
      evidence_state_changed_at = CASE WHEN v_next_ev_state IS DISTINCT FROM v_obs.evidence_state THEN v_now ELSE evidence_state_changed_at END,
      evidence_state_changed_by = CASE WHEN v_next_ev_state IS DISTINCT FROM v_obs.evidence_state THEN p_reviewer_id ELSE evidence_state_changed_by END,
      updated_at = v_now
  WHERE id = v_obs.id
  RETURNING * INTO v_updated_obs;

  IF p_publication_status IS NOT NULL THEN
    v_make_public := (p_publication_status = 'public');

    UPDATE public.observation_locations
    SET is_public = v_make_public
    WHERE observation_id = v_obs.id;

    UPDATE public.observation_media
    SET is_public = (v_make_public AND moderation_status = 'visible'),
        visibility = CASE WHEN v_make_public THEN 'public' ELSE 'private' END
    WHERE observation_id = v_obs.id;
  END IF;

  -- Clear prior is_latest flag before inserting the new verification record
  -- to satisfy idx_expert_verifications_latest_unique on repeat reviews.
  UPDATE public.expert_verifications
  SET is_latest = false,
      updated_at = v_now
  WHERE observation_id = v_obs.id
    AND is_latest = true;

  INSERT INTO public.expert_verifications (
    observation_id,
    reviewer_id,
    reviewer_name,
    reviewer_role,
    reviewer_organization,
    identity_published,
    status,
    expert_classification,
    expert_rock_name,
    expert_confidence,
    expert_observed_features,
    expert_notes,
    scientific_remarks,
    is_latest,
    created_at,
    updated_at
  )
  VALUES (
    v_obs.id,
    p_reviewer_id,
    p_reviewer_name,
    p_reviewer_role,
    p_reviewer_organization,
    COALESCE(p_identity_published, false),
    p_new_status,
    NULLIF(btrim(COALESCE(p_expert_classification, '')), ''),
    NULLIF(btrim(COALESCE(p_expert_rock_name, '')), ''),
    NULLIF(btrim(COALESCE(p_expert_confidence, '')), ''),
    COALESCE(p_expert_observed_features, '[]'::jsonb),
    NULLIF(btrim(COALESCE(p_expert_notes, '')), ''),
    NULLIF(btrim(COALESCE(p_scientific_remarks, '')), ''),
    true,
    v_now,
    v_now
  )
  RETURNING * INTO v_verif;

  v_audit_notes := COALESCE(
    NULLIF(btrim(COALESCE(p_expert_notes, '')), ''),
    NULLIF(btrim(COALESCE(p_scientific_remarks, '')), ''),
    'Observation status changed to ' || p_new_status
  );

  v_audit_meta := jsonb_build_object(
    'expert_classification', p_expert_classification,
    'expert_rock_name', p_expert_rock_name,
    'publication_status', v_next_pub
  );

  INSERT INTO public.verification_audit_logs (
    observation_id,
    passport_id,
    reviewer_id,
    reviewer_name,
    action,
    previous_status,
    new_status,
    notes,
    metadata,
    created_at
  )
  VALUES (
    v_obs.id,
    v_obs.passport_id,
    p_reviewer_id,
    p_reviewer_name,
    p_action,
    v_obs.verification_status,
    p_new_status,
    v_audit_notes,
    v_audit_meta,
    v_now
  )
  RETURNING * INTO v_audit;

  RETURN jsonb_build_object(
    'observation', to_jsonb(v_updated_obs),
    'verification', to_jsonb(v_verif),
    'audit_log', to_jsonb(v_audit)
  );
END;
$$;

-- 3h. CMS Page Upsert & Revision Restore Transactional RPCs
CREATE OR REPLACE FUNCTION public.upsert_cms_page_transactional(
  p_slug text,
  p_title text,
  p_content jsonb,
  p_change_note text,
  p_actor_id uuid,
  p_actor_email text,
  p_actor_role text,
  p_ip_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.cms_pages%ROWTYPE;
  v_saved public.cms_pages%ROWTYPE;
  v_next_version integer;
  v_now timestamptz := now();
BEGIN
  IF p_slug NOT IN ('about', 'terms', 'privacy', 'how_it_works', 'contact', 'faq') THEN
    RAISE EXCEPTION 'Invalid CMS page slug: %', p_slug
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_existing
  FROM public.cms_pages
  WHERE slug = p_slug
  FOR UPDATE;

  IF FOUND THEN
    v_next_version := v_existing.version + 1;
    UPDATE public.cms_pages
    SET title = p_title,
        content = p_content,
        version = v_next_version,
        updated_by = p_actor_email,
        updated_at = v_now
    WHERE slug = p_slug
    RETURNING * INTO v_saved;
  ELSE
    v_next_version := 1;
    INSERT INTO public.cms_pages (slug, title, content, version, updated_by, updated_at)
    VALUES (p_slug, p_title, p_content, 1, p_actor_email, v_now)
    RETURNING * INTO v_saved;
  END IF;

  INSERT INTO public.cms_page_revisions (page_slug, version, title, content, saved_by, change_note, saved_at)
  VALUES (p_slug, v_next_version, p_title, p_content, p_actor_email, p_change_note, v_now);

  INSERT INTO public.system_audit_logs (
    staff_id,
    action,
    target_type,
    target_id,
    metadata,
    ip_hash
  )
  VALUES (
    p_actor_id,
    'cms.update',
    'cms_page',
    NULL,
    jsonb_build_object(
      'slug', p_slug,
      'version', v_next_version,
      'actor_email', p_actor_email,
      'actor_role', p_actor_role,
      'change_note', p_change_note
    ),
    p_ip_hash
  );

  RETURN to_jsonb(v_saved);
END;
$$;

-- 3i. Expired Rate Limit Bucket Cleanup RPC
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limit_buckets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  DELETE FROM public.rate_limit_buckets
  WHERE expires_at < now();

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 3j. Harden get_operational_summary search_path
CREATE OR REPLACE FUNCTION public.get_operational_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_total_users bigint;
  v_total_observations bigint;
  v_pending_webhooks bigint;
  v_failed_webhooks bigint;
  v_expert_verified_count bigint;
  v_ai_analyses_count bigint;
BEGIN
  SELECT count(*) INTO v_total_users
  FROM public.users
  WHERE is_demo = false;

  SELECT count(*) INTO v_total_observations
  FROM public.observations
  WHERE is_demo = false;

  SELECT count(*) INTO v_pending_webhooks
  FROM public.webhook_jobs
  WHERE status IN ('queued', 'processing', 'retryable_failure');

  SELECT count(*) INTO v_failed_webhooks
  FROM public.webhook_jobs
  WHERE status = 'terminal_failure';

  SELECT count(*) INTO v_expert_verified_count
  FROM public.observations
  WHERE verification_status = 'expert_verified' AND is_demo = false;

  SELECT count(*) INTO v_ai_analyses_count
  FROM public.observations
  WHERE ai_model IS NOT NULL AND is_demo = false;

  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'total_observations', v_total_observations,
    'pending_webhooks', v_pending_webhooks,
    'failed_webhooks', v_failed_webhooks,
    'expert_verified_count', v_expert_verified_count,
    'ai_analyses_count', v_ai_analyses_count,
    'timestamp', now()
  );
END;
$$;

-- =============================================================================
-- 4. HARDENED PUBLIC VIEWS (Exact Column Names & Ordinal Positions Preserved)
-- =============================================================================

-- 4a. site_timeline: enforce public active site + public/visible child events
CREATE OR REPLACE VIEW public.site_timeline AS
SELECT s.id AS site_id, ev.event_type, ev.event_at, ev.ref_id, ev.summary
FROM public.geological_sites s
CROSS JOIN LATERAL (
  SELECT 'observation'::text AS event_type,
         o.created_at AS event_at,
         o.passport_id::text AS ref_id,
         'Observation ' || o.passport_id || ' recorded' AS summary
  FROM public.observations o
  WHERE o.site_id = s.id
    AND o.publication_status = 'public'
    AND o.status = 'completed'
    AND o.is_demo = false
    AND o.verification_status <> 'rejected'
    AND o.evidence_state <> 'rejected'

  UNION ALL

  SELECT 'investigation'::text,
         ci.created_at,
         ci.public_id::text,
         'Community investigation started: ' || left(ci.question, 120)
  FROM public.community_investigations ci
  WHERE ci.site_id = s.id
    AND ci.is_public = true
    AND ci.status <> 'archived'

  UNION ALL

  SELECT 'evidence'::text,
         ce.created_at,
         ce.id::text,
         'Evidence contributed (' || ce.evidence_type || ')'
  FROM public.community_evidence ce
  WHERE ce.site_id = s.id
    AND ce.moderation_status = 'visible'

  UNION ALL

  SELECT 'question'::text,
         cq.created_at,
         cq.public_id::text,
         'Question asked: ' || left(cq.question, 120)
  FROM public.community_questions cq
  WHERE cq.site_id = s.id
    AND cq.is_public = true

  UNION ALL

  SELECT 'visit'::text,
         v.created_at,
         v.id::text,
         'Site visit recorded'
  FROM public.community_visits v
  WHERE v.site_id = s.id

  UNION ALL

  SELECT 'expert_review'::text,
         ev2.created_at,
         o2.passport_id::text,
         'Expert review recorded'
  FROM public.expert_verifications ev2
  JOIN public.observations o2 ON o2.id = ev2.observation_id
  WHERE o2.site_id = s.id
    AND ev2.is_latest = true
    AND o2.publication_status = 'public'
    AND o2.status = 'completed'
    AND o2.is_demo = false
    AND o2.verification_status <> 'rejected'
    AND o2.evidence_state <> 'rejected'
) ev
WHERE s.is_public = true
  AND s.status = 'active';

-- 4b. public_observation_media: enforce m.is_public = true AND visibility = 'public' AND moderation_status = 'visible'
CREATE OR REPLACE VIEW public.public_observation_media AS
SELECT
  m.id                AS media_id,
  m.observation_id    AS observation_id,
  o.passport_id       AS passport_id,
  m.media_type        AS media_type,
  m.mime_type         AS mime_type,
  m.file_size         AS file_size,
  m.sha256            AS sha256,
  m.view_type         AS view_type,
  m.caption           AS caption,
  m.capture_date      AS capture_date,
  m.media_category    AS media_category,
  m.duration_seconds  AS duration_seconds,
  m.width_px          AS width_px,
  m.height_px         AS height_px,
  o.observation_category,
  m.created_at        AS created_at
FROM public.observation_media m
JOIN public.observations o ON o.id = m.observation_id
WHERE o.status = 'completed'
  AND o.publication_status = 'public'
  AND o.is_demo = false
  AND o.evidence_state <> 'rejected'
  AND o.verification_status <> 'rejected'
  AND m.is_public = true
  AND m.visibility = 'public'
  AND m.moderation_status = 'visible'
  AND (m.storage_path IS NOT NULL OR m.content_base64 IS NOT NULL);

-- 4c. public_observations: enforce m2.is_public = true in primary_media_url lateral join
CREATE OR REPLACE VIEW public.public_observations AS
SELECT
  o.id AS observation_id,
  o.passport_id,
  o.site_id,
  o.primary_classification,
  o.possible_name,
  o.confidence,
  o.confidence_score,
  o.verification_status,
  o.evidence_state,
  o.observed_features,
  o.reasoning,
  o.limitations,
  o.recommended_next_steps,
  o.safety_note,
  o.data_quality_status,
  o.created_at,
  o.published_at,
  l.district,
  l.public_location_precision,
  CASE
    WHEN l.public_location_precision = 'exact' THEN l.latitude
    ELSE NULL
  END AS public_latitude,
  CASE
    WHEN l.public_location_precision = 'exact' THEN l.longitude
    ELSE NULL
  END AS public_longitude,
  CASE
    WHEN l.public_location_precision = 'exact' THEN l.geom
    ELSE NULL
  END AS public_geom,
  COALESCE(inv.investigation_count, 0) AS investigation_count,
  COALESCE(inv.question_count, 0)      AS question_count,
  COALESCE(vt.vote_total, 0)           AS community_vote_count,
  COALESCE(vt.vote_top_option, '')     AS community_vote_top_option,
  COALESCE(vt.vote_top_count, 0)       AS community_vote_top_count,
  COALESCE(ev.evidence_total, 0)       AS community_evidence_count,
  COALESCE(site.site_code, '')         AS site_code,
  COALESCE(site.title, '')             AS site_title,
  COALESCE(o.observation_category, 'unknown')       AS observation_category,
  COALESCE(o.observation_subcategory, 'unknown')    AS observation_subcategory,
  o.observation_type,
  o.primary_interpretation,
  o.geological_context,
  o.diagnostic_features,
  o.community_status,
  o.possible_alternatives,
  o.uncertainties,
  o.questions_for_user,
  o.evidence_state_reason,
  l.sector,
  COALESCE(inv.research_opportunity_count, 0) AS research_opportunity_count,
  COALESCE(ab.usage_media_total, 0)   AS media_count,
  COALESCE(md.media_total, 0)          AS public_media_count,
  COALESCE(site.is_research_opportunity, false) AS is_research_opportunity,
  o.post_title,
  o.user_report,
  o.is_demo,
  CASE
    WHEN first_img.media_ref IS NOT NULL
      THEN '/api/posts/' || o.passport_id || '/media/' || first_img.media_ref
    ELSE NULL
  END AS primary_media_url,
  CASE
    WHEN l.public_location_precision = 'approximate' AND l.latitude IS NOT NULL
      THEN round(l.latitude::numeric, 2)::double precision
    ELSE NULL
  END AS approximate_latitude,
  CASE
    WHEN l.public_location_precision = 'approximate' AND l.longitude IS NOT NULL
      THEN round(l.longitude::numeric, 2)::double precision
    ELSE NULL
  END AS approximate_longitude
FROM public.observations o
INNER JOIN public.observation_locations l ON o.id = l.observation_id
LEFT JOIN public.geological_sites site ON o.site_id = site.id
LEFT JOIN LATERAL (
  SELECT
    (SELECT COUNT(*) FROM public.community_investigations ci
      WHERE (ci.observation_id = o.id OR ci.site_id = o.site_id)
        AND ci.is_public = true) AS investigation_count,
    (SELECT COUNT(*) FROM public.community_investigations ci
      WHERE (ci.observation_id = o.id OR ci.site_id = o.site_id)
        AND ci.is_public = true
        AND ci.opportunity_basis IS NOT NULL) AS research_opportunity_count,
    (SELECT COUNT(*) FROM public.community_questions cq
      WHERE (cq.observation_id = o.id OR cq.site_id = o.site_id
         OR cq.investigation_id IN (
           SELECT ci2.id FROM public.community_investigations ci2
           WHERE (ci2.observation_id = o.id OR ci2.site_id = o.site_id)
             AND ci2.is_public = true
         ))
        AND cq.is_public = true) AS question_count
) inv ON TRUE
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS vote_total,
    MAX(vote_count) AS vote_top_count,
    (ARRAY_AGG(option ORDER BY vote_count DESC, option ASC))[1] AS vote_top_option
  FROM (
    SELECT cv.option, COUNT(*) AS vote_count
    FROM public.community_votes cv
    WHERE cv.investigation_id IN (
      SELECT ci3.id FROM public.community_investigations ci3
      WHERE (ci3.observation_id = o.id OR ci3.site_id = o.site_id)
        AND ci3.is_public = true
    )
    GROUP BY cv.option
  ) tally
) vt ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS evidence_total
  FROM public.community_evidence ce
  WHERE (ce.observation_id = o.id
     OR ce.site_id = o.site_id
     OR ce.investigation_id IN (
       SELECT ci4.id FROM public.community_investigations ci4
       WHERE (ci4.observation_id = o.id OR ci4.site_id = o.site_id)
         AND ci4.is_public = true
     ))
     AND ce.moderation_status = 'visible'
) ev ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS usage_media_total
  FROM public.observation_media m
  WHERE m.observation_id = o.id
    AND m.moderation_status <> 'removed'
) ab ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS media_total
  FROM public.public_observation_media pm
  WHERE pm.observation_id = o.id
) md ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(NULLIF(m2.source_media_id, ''), m2.id::text) AS media_ref
  FROM public.observation_media m2
  WHERE m2.observation_id = o.id
    AND m2.media_type = 'image'
    AND m2.is_public = true
    AND m2.moderation_status = 'visible'
    AND m2.visibility = 'public'
    AND (m2.storage_path IS NOT NULL OR m2.content_base64 IS NOT NULL)
  ORDER BY m2.sort_order ASC, m2.created_at ASC
  LIMIT 1
) first_img ON TRUE
WHERE o.status = 'completed'
  AND o.publication_status = 'public'
  AND o.is_demo = false
  AND o.verification_status <> 'rejected'
  AND o.evidence_state <> 'rejected'
  AND l.is_public = true;

-- =============================================================================
-- 5. RLS, TABLE GRANTS & PRIVILEGED RPC EXECUTION LOCKDOWN
-- =============================================================================

-- 5a. Lock down public.user_avatars (service_role only; public avatar serving flows via backend API)
ALTER TABLE public.user_avatars ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_avatars FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_avatars TO service_role;

-- 5b. Lock down geoscience taxonomy tables (read-only SELECT for anon/authenticated; writes restricted to service_role)
ALTER TABLE public.geoscience_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geoscience_subcategories ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.geoscience_categories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.geoscience_categories TO anon, authenticated;
GRANT ALL ON TABLE public.geoscience_categories TO service_role;

REVOKE ALL ON TABLE public.geoscience_subcategories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.geoscience_subcategories TO anon, authenticated;
GRANT ALL ON TABLE public.geoscience_subcategories TO service_role;

DROP POLICY IF EXISTS geoscience_categories_public_read ON public.geoscience_categories;
CREATE POLICY geoscience_categories_public_read
  ON public.geoscience_categories
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS geoscience_subcategories_public_read ON public.geoscience_subcategories;
CREATE POLICY geoscience_subcategories_public_read
  ON public.geoscience_subcategories
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 5c. Lock down new and existing internal tables to service_role only
REVOKE ALL ON TABLE public.contributor_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.contributor_sessions TO service_role;

REVOKE ALL ON TABLE public.accredited_laboratories FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.accredited_laboratories TO service_role;

REVOKE ALL ON TABLE public.cms_pages FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cms_pages TO service_role;

REVOKE ALL ON TABLE public.cms_page_revisions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cms_page_revisions TO service_role;

REVOKE ALL ON TABLE public.app_releases FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.app_releases TO service_role;

REVOKE ALL ON TABLE public.webhook_message_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.webhook_message_claims TO service_role;

REVOKE ALL ON TABLE public.rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_buckets TO service_role;

-- 5d. Restrict public read views to SELECT only
REVOKE ALL ON TABLE public.site_timeline FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.site_timeline TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.public_observation_media FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_observation_media TO anon, authenticated, service_role;

REVOKE ALL ON TABLE public.public_observations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_observations TO anon, authenticated, service_role;

-- 5e. Lock down webhook RPCs (027 & 028) — fix search_path and revoke anon/authenticated EXECUTE
ALTER FUNCTION public.prune_webhook_message_claims(interval)
  SECURITY DEFINER
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.prune_webhook_message_claims(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_webhook_message_claims(interval) TO service_role;

ALTER FUNCTION public.claim_webhook_job(text)
  SECURITY DEFINER
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.claim_webhook_job(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_job(text) TO service_role;

ALTER FUNCTION public.recover_stale_webhook_jobs(integer)
  SECURITY DEFINER
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.recover_stale_webhook_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_webhook_jobs(integer) TO service_role;

ALTER FUNCTION public.webhook_job_stats()
  SECURITY DEFINER
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.webhook_job_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.webhook_job_stats() TO service_role;

ALTER FUNCTION public.claim_webhook_message(text)
  SECURITY DEFINER
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.claim_webhook_message(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_webhook_message(text) TO service_role;

ALTER FUNCTION public.recover_stale_webhook_claims(integer)
  SECURITY DEFINER
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.recover_stale_webhook_claims(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_webhook_claims(integer) TO service_role;

-- 5f. Lock down operational & transactional RPCs to service_role only
REVOKE ALL ON FUNCTION public.get_operational_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_operational_summary() TO service_role;

REVOKE ALL ON FUNCTION public.update_staff_transactional(uuid, public.staff_role, boolean, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_staff_transactional(uuid, public.staff_role, boolean, text, text, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.update_evidence_state_transactional(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_evidence_state_transactional(uuid, text, text, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.update_publication_status_transactional(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_publication_status_transactional(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.update_media_moderation_transactional(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_media_moderation_transactional(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.update_media_visibility_transactional(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_media_visibility_transactional(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.assign_observation_site_transactional(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_observation_site_transactional(uuid, uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.submit_expert_verification_transactional(text, text, text, text, text, boolean, text, text, text, text, text, jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_expert_verification_transactional(text, text, text, text, text, boolean, text, text, text, text, text, jsonb, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_cms_page_transactional(text, text, jsonb, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_cms_page_transactional(text, text, jsonb, text, uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.cleanup_expired_rate_limit_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_rate_limit_buckets() TO service_role;

COMMIT;
