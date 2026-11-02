-- 035_security_hardening_and_transactional_ops.sql
-- Production security hardening, transactional administrative operations,
-- distributed rate limiting, and RPC access control.

-- 1. SECURE get_operational_summary()
-- Revoke execution from untrusted roles and grant only to service_role
REVOKE ALL ON FUNCTION public.get_operational_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_operational_summary() TO service_role;

CREATE OR REPLACE FUNCTION public.get_operational_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
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
  WHERE is_demo = false
    AND verification_status = 'expert_verified';

  SELECT count(*) INTO v_ai_analyses_count
  FROM public.observations
  WHERE is_demo = false
    AND status = 'completed';

  result := jsonb_build_object(
    'total_users', v_total_users,
    'total_observations', v_total_observations,
    'pending_webhooks', v_pending_webhooks,
    'failed_webhooks', v_failed_webhooks,
    'expert_verified_count', v_expert_verified_count,
    'ai_analyses_count', v_ai_analyses_count,
    'system_status', 'online',
    'last_updated', now()
  );

  RETURN result;
END;
$$;

-- 2. BOOTSTRAP SUPER ADMIN IDEMPOTENT PROVISIONING
CREATE OR REPLACE FUNCTION public.bootstrap_super_admin(
  p_email text,
  p_password_hash text,
  p_full_name text DEFAULT 'Super Admin'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_staff_id uuid;
  v_clean_email text;
BEGIN
  v_clean_email := lower(trim(p_email));
  
  -- Upsert super admin record
  INSERT INTO public.staff (email, password_hash, role, full_name, is_active)
  VALUES (v_clean_email, p_password_hash, 'owner', p_full_name, true)
  ON CONFLICT (email) DO UPDATE
    SET role = 'owner',
        is_active = true,
        password_hash = CASE WHEN p_password_hash <> '' THEN p_password_hash ELSE public.staff.password_hash END,
        updated_at = now()
  RETURNING id INTO v_staff_id;

  RETURN v_staff_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_super_admin(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_super_admin(text, text, text) TO service_role;

-- 3. DISTRIBUTED RATE LIMITING
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 1,
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_buckets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_buckets TO service_role;

CREATE OR REPLACE FUNCTION public.check_distributed_rate_limit(
  p_key text,
  p_max_requests integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_bucket record;
BEGIN
  -- Cleanup expired bucket entries opportunistically
  IF random() < 0.05 THEN
    DELETE FROM public.rate_limit_buckets WHERE reset_at < (v_now - interval '1 hour');
  END IF;

  SELECT count, reset_at INTO v_bucket
  FROM public.rate_limit_buckets
  WHERE key = p_key
  FOR UPDATE;

  IF NOT FOUND OR v_bucket.reset_at <= v_now THEN
    INSERT INTO public.rate_limit_buckets (key, count, reset_at, updated_at)
    VALUES (p_key, 1, v_now + (p_window_seconds || ' seconds')::interval, v_now)
    ON CONFLICT (key) DO UPDATE
      SET count = 1,
          reset_at = v_now + (p_window_seconds || ' seconds')::interval,
          updated_at = v_now;
    RETURN true;
  END IF;

  IF v_bucket.count < p_max_requests THEN
    UPDATE public.rate_limit_buckets
    SET count = count + 1,
        updated_at = v_now
    WHERE key = p_key;
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_distributed_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_distributed_rate_limit(text, integer, integer) TO service_role;

-- 4. TRANSACTIONAL ADMINISTRATIVE MUTATIONS WITH ATOMIC AUDIT LOGGING

-- Staff Creation Transactional
CREATE OR REPLACE FUNCTION public.create_staff_transactional(
  p_email text,
  p_password_hash text,
  p_role public.staff_role,
  p_full_name text,
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
  v_new_staff public.staff%ROWTYPE;
BEGIN
  INSERT INTO public.staff (
    email,
    password_hash,
    role,
    full_name,
    is_active
  )
  VALUES (
    lower(trim(p_email)),
    p_password_hash,
    p_role,
    p_full_name,
    true
  )
  RETURNING * INTO v_new_staff;

  -- Atomic audit log creation
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
    'staff.create',
    'staff',
    v_new_staff.id,
    jsonb_build_object(
      'email', v_new_staff.email,
      'role', v_new_staff.role,
      'full_name', v_new_staff.full_name,
      'actor_role', p_actor_role
    ),
    p_ip_hash
  );

  RETURN to_jsonb(v_new_staff);
END;
$$;

-- Staff Update Transactional
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
      password_hash = CASE WHEN p_password_hash IS NOT NULL AND p_password_hash <> '' THEN p_password_hash ELSE password_hash END,
      updated_at = now()
  WHERE id = p_staff_id
  RETURNING * INTO v_after;

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
      'before', jsonb_build_object('role', v_before.role, 'is_active', v_before.is_active, 'full_name', v_before.full_name),
      'after', jsonb_build_object('role', v_after.role, 'is_active', v_after.is_active, 'full_name', v_after.full_name)
    ),
    p_ip_hash
  );

  RETURN to_jsonb(v_after);
END;
$$;

-- Observation Evidence State Update Transactional
CREATE OR REPLACE FUNCTION public.update_evidence_state_transactional(
  p_observation_id uuid,
  p_evidence_state text,
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

  UPDATE public.observations
  SET evidence_state = p_evidence_state,
      evidence_state_reason = p_reason,
      evidence_state_changed_at = v_now,
      evidence_state_changed_by = p_actor,
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
    jsonb_build_object('before_state', v_before.evidence_state, 'after_state', p_evidence_state)
  );

  RETURN to_jsonb(v_after);
END;
$$;

-- Observation Publication Status Update Transactional
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
  SELECT * INTO v_before
  FROM public.observations
  WHERE id = p_observation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Observation % not found', p_observation_id;
  END IF;

  UPDATE public.observations
  SET publication_status = p_publication_status,
      published_at = CASE WHEN p_publication_status = 'public' THEN v_now ELSE published_at END,
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
    'observation.publication_changed',
    'observation',
    p_observation_id::text,
    p_reason,
    jsonb_build_object('before_status', v_before.publication_status, 'after_status', p_publication_status)
  );

  RETURN to_jsonb(v_after);
END;
$$;

-- Media Moderation Update Transactional
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
  SELECT * INTO v_before
  FROM public.observation_media
  WHERE id = p_media_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Observation media % not found', p_media_id;
  END IF;

  UPDATE public.observation_media
  SET moderation_status = p_moderation_status,
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

-- Media Visibility Update Transactional
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
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_before
  FROM public.observation_media
  WHERE id = p_media_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Observation media % not found', p_media_id;
  END IF;

  UPDATE public.observation_media
  SET visibility = p_visibility,
      is_public = (p_visibility = 'public'),
      updated_at = v_now
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

-- Community Media Moderation Transactional
CREATE OR REPLACE FUNCTION public.moderate_community_media_transactional(
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
  v_before public.community_media%ROWTYPE;
  v_after public.community_media%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_before
  FROM public.community_media
  WHERE id = p_media_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.community_media
  SET moderation_status = p_moderation_status,
      is_public = (p_moderation_status = 'visible'),
      moderated_by = p_actor,
      moderated_at = v_now,
      moderation_reason = p_reason
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
    'community_media.moderated',
    'community_media',
    p_media_id::text,
    COALESCE(p_reason, 'Moderation status updated'),
    jsonb_build_object('before_status', v_before.moderation_status, 'after_status', p_moderation_status)
  );

  RETURN to_jsonb(v_after);
END;
$$;

-- Comment Moderation Transactional
CREATE OR REPLACE FUNCTION public.moderate_comment_transactional(
  p_comment_id uuid,
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
  v_before public.observation_comments%ROWTYPE;
  v_after public.observation_comments%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_before
  FROM public.observation_comments
  WHERE id = p_comment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.observation_comments
  SET moderation_status = p_moderation_status,
      moderation_reason = p_reason,
      moderated_by = p_actor,
      moderated_at = v_now,
      updated_at = v_now
  WHERE id = p_comment_id
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
    'comment.moderated',
    'comment',
    p_comment_id::text,
    p_reason,
    jsonb_build_object(
      'passport_id', v_after.passport_id,
      'before_status', v_before.moderation_status,
      'after_status', p_moderation_status
    )
  );

  RETURN to_jsonb(v_after);
END;
$$;

-- Abuse Report Resolution Transactional
CREATE OR REPLACE FUNCTION public.resolve_abuse_report_transactional(
  p_public_id text,
  p_status text,
  p_resolution_note text,
  p_actor text,
  p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_before public.community_abuse_reports%ROWTYPE;
  v_after public.community_abuse_reports%ROWTYPE;
  v_now timestamptz := now();
  v_terminal boolean := (p_status IN ('actioned', 'dismissed'));
BEGIN
  SELECT * INTO v_before
  FROM public.community_abuse_reports
  WHERE public_id = p_public_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.community_abuse_reports
  SET status = p_status,
      resolution_note = p_resolution_note,
      resolved_by = CASE WHEN p_status = 'open' THEN NULL ELSE p_actor END,
      resolved_at = CASE WHEN v_terminal THEN v_now ELSE NULL END
  WHERE public_id = p_public_id
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
    'abuse_report.resolved',
    'abuse_report',
    p_public_id,
    COALESCE(p_resolution_note, 'Status updated to ' || p_status),
    jsonb_build_object('before_status', v_before.status, 'after_status', p_status)
  );

  RETURN to_jsonb(v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_transactional(text, text, public.staff_role, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_staff_transactional(text, text, public.staff_role, text, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.update_staff_transactional(uuid, public.staff_role, boolean, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_staff_transactional(uuid, public.staff_role, boolean, text, text, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.update_evidence_state_transactional(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_evidence_state_transactional(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.update_publication_status_transactional(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_publication_status_transactional(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.update_media_moderation_transactional(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_media_moderation_transactional(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.update_media_visibility_transactional(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_media_visibility_transactional(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.moderate_community_media_transactional(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_community_media_transactional(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.moderate_comment_transactional(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_comment_transactional(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_abuse_report_transactional(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_abuse_report_transactional(text, text, text, text, text) TO service_role;

-- 5. RLS HARDENING ON ADMINISTRATIVE & INTERNAL TABLES
REVOKE ALL ON TABLE public.staff FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.staff TO service_role;

REVOKE ALL ON TABLE public.staff_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.staff_sessions TO service_role;

REVOKE ALL ON TABLE public.system_audit_logs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.system_audit_logs TO service_role;

REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_audit_log TO service_role;

REVOKE ALL ON TABLE public.webhook_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.webhook_jobs TO service_role;
