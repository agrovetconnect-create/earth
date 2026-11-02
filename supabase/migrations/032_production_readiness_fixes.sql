-- =============================================================================
-- 032_production_readiness_fixes.sql
--
-- Additive production-readiness and schema-consistency fixes:
--   1. Align `users.created_via` and `auth_verification_codes.purpose` CHECK
--      constraints with email registration, mobile submissions, and WhatsApp
--      account linking.
--   2. Ensure `observation_locations` maintains at most one row per observation
--      so location updates/pins never duplicate public view rows.
--   3. Fix `public.get_operational_summary()` RPC to read `public.webhook_jobs`
--      (created in 028) instead of non-existent `public.webhook_queue`, remove
--      reference to non-existent `observations.ai_analysis`, and exclude
--      `is_demo = true` rows from operational counts.
--   4. Exclude `is_demo = true` rows from `public_category_counts`,
--      `public_observation_media`, `public_observations`, and
--      `public_geological_sites`, and expose Stage 12 post fields + stored
--      inline media (`content_base64`) on the public views while preserving
--      every existing column's exact name, type, and ordinal position.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Align authentication CHECK constraints
-- -----------------------------------------------------------------------------

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_created_via_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_created_via_check
    CHECK (created_via IN ('web', 'whatsapp', 'email', 'mobile'));

ALTER TABLE public.auth_verification_codes
  DROP CONSTRAINT IF EXISTS auth_verification_codes_purpose_check;

ALTER TABLE public.auth_verification_codes
  ADD CONSTRAINT auth_verification_codes_purpose_check
    CHECK (purpose IN ('whatsapp_login', 'account_linking'));

-- -----------------------------------------------------------------------------
-- 2. Enforce one canonical location row per observation
-- -----------------------------------------------------------------------------

DELETE FROM public.observation_locations a
USING public.observation_locations b
WHERE a.observation_id = b.observation_id
  AND (
    a.created_at < b.created_at
    OR (a.created_at = b.created_at AND a.id < b.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_observation_locations_unique_observation
  ON public.observation_locations (observation_id);

-- -----------------------------------------------------------------------------
-- 3. Fix operational metrics RPC (`webhook_jobs` + `is_demo = false`)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_operational_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

-- -----------------------------------------------------------------------------
-- 4. Update public views for demo-data separation and inline gallery support
--    NOTE: Existing column names, types, and ordinal positions from migration
--    013 are preserved verbatim; new columns are appended strictly at the end.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.public_category_counts AS
SELECT
  c.id AS category,
  c.label AS category_label,
  c.sort_order,
  COALESCE(agg.observation_count, 0) AS observation_count,
  COALESCE(site_counts.site_count, 0) AS site_count,
  COALESCE(opp.research_opportunity_site_count, 0) AS research_opportunity_site_count
FROM public.geoscience_categories c
LEFT JOIN (
  SELECT o.observation_category AS category, COUNT(*) AS observation_count
  FROM public.observations o
  WHERE o.publication_status = 'public'
    AND o.status = 'completed'
    AND o.is_demo = false
    AND o.verification_status <> 'rejected'
    AND o.evidence_state <> 'rejected'
  GROUP BY o.observation_category
) agg ON agg.category = c.id
LEFT JOIN (
  SELECT category, COUNT(DISTINCT site_id) AS site_count
  FROM (
    SELECT gs.id AS site_id, o.observation_category AS category
    FROM public.geological_sites gs
    JOIN public.observations o ON o.site_id = gs.id
    WHERE o.publication_status = 'public'
      AND o.status = 'completed'
      AND o.is_demo = false
      AND o.evidence_state <> 'rejected'
  ) s
  GROUP BY s.category
) site_counts ON site_counts.category = c.id
LEFT JOIN (
  SELECT o.observation_category AS category,
         COUNT(DISTINCT gs.id) AS research_opportunity_site_count
  FROM public.geological_sites gs
  JOIN public.observations o ON o.site_id = gs.id
  WHERE gs.is_research_opportunity = true
    AND gs.is_public = true
    AND gs.status = 'active'
    AND o.is_demo = false
  GROUP BY o.observation_category
) opp ON opp.category = c.id;

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
  AND m.visibility = 'public'
  AND m.moderation_status = 'visible'
  AND (m.storage_path IS NOT NULL OR m.content_base64 IS NOT NULL);

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
  -- Appended columns (migration 032):
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
      WHERE ci.observation_id = o.id OR ci.site_id = o.site_id) AS investigation_count,
    (SELECT COUNT(*) FROM public.community_investigations ci
      WHERE (ci.observation_id = o.id OR ci.site_id = o.site_id)
        AND ci.opportunity_basis IS NOT NULL) AS research_opportunity_count,
    (SELECT COUNT(*) FROM public.community_questions cq
      WHERE cq.observation_id = o.id OR cq.site_id = o.site_id
         OR cq.investigation_id IN (
           SELECT ci2.id FROM public.community_investigations ci2
           WHERE ci2.observation_id = o.id OR ci2.site_id = o.site_id
         )) AS question_count
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
      WHERE ci3.observation_id = o.id OR ci3.site_id = o.site_id
    )
    GROUP BY cv.option
  ) tally
) vt ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS evidence_total
  FROM public.community_evidence ce
  WHERE ce.observation_id = o.id
     OR ce.site_id = o.site_id
     OR ce.investigation_id IN (
       SELECT ci4.id FROM public.community_investigations ci4
       WHERE ci4.observation_id = o.id OR ci4.site_id = o.site_id
     )
) ev ON TRUE
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS usage_media_total
  FROM public.observation_media m
  WHERE m.observation_id = o.id
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
    AND m2.moderation_status = 'visible'
    AND m2.visibility = 'public'
    AND m2.content_base64 IS NOT NULL
  ORDER BY m2.sort_order ASC, m2.created_at ASC
  LIMIT 1
) first_img ON TRUE
WHERE o.status = 'completed'
  AND o.publication_status = 'public'
  AND o.is_demo = false
  AND o.verification_status <> 'rejected'
  AND o.evidence_state <> 'rejected'
  AND l.is_public = true;

CREATE OR REPLACE VIEW public.public_geological_sites AS
SELECT
  s.id AS site_id,
  s.site_code,
  s.title,
  s.description,
  s.grouping_basis,
  s.district,
  s.sector,
  s.public_location_precision,
  CASE
    WHEN s.public_location_precision = 'exact' THEN s.latitude
    ELSE NULL
  END AS public_latitude,
  CASE
    WHEN s.public_location_precision = 'exact' THEN s.longitude
    ELSE NULL
  END AS public_longitude,
  CASE
    WHEN s.public_location_precision = 'exact' THEN s.geom
    ELSE NULL
  END AS public_geom,
  COALESCE(agg.observation_count, 0)    AS observation_count,
  COALESCE(agg.visit_count, 0)          AS visit_count,
  COALESCE(agg.investigation_count, 0) AS investigation_count,
  COALESCE(agg.question_count, 0)       AS question_count,
  COALESCE(agg.evidence_count, 0)       AS evidence_count,
  agg.highest_evidence_state,
  agg.observed_classifications,
  agg.districts_covered,
  s.created_at,
  s.updated_at,
  s.grouping_evidence,
  s.status,
  s.is_research_opportunity,
  agg.primary_category,
  COALESCE(agg.research_opportunity_count, 0) AS research_opportunity_count,
  CASE
    WHEN s.public_location_precision = 'approximate'
      THEN round(s.latitude::numeric, 2)::double precision
    ELSE NULL
  END AS approximate_latitude,
  CASE
    WHEN s.public_location_precision = 'approximate'
      THEN round(s.longitude::numeric, 2)::double precision
    ELSE NULL
  END AS approximate_longitude
FROM public.geological_sites s
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS observation_count,
    (
      SELECT o2.evidence_state
      FROM public.observations o2
      WHERE o2.site_id = s.id
        AND o2.publication_status = 'public'
        AND o2.is_demo = false
        AND o2.evidence_state <> 'rejected'
      ORDER BY CASE o2.evidence_state
        WHEN 'rejected' THEN 8
        WHEN 'unresolved' THEN 7
        WHEN 'scientifically_confirmed' THEN 6
        WHEN 'expert_reviewed' THEN 5
        WHEN 'community_investigated' THEN 4
        WHEN 'community_supported' THEN 3
        WHEN 'ai_assisted' THEN 2
        WHEN 'insufficient_evidence' THEN 1
        ELSE 0
      END DESC
      LIMIT 1
    ) AS highest_evidence_state,
    (
      SELECT o3.observation_category
      FROM public.observations o3
      WHERE o3.site_id = s.id
        AND o3.publication_status = 'public'
        AND o3.is_demo = false
        AND o3.evidence_state <> 'rejected'
      GROUP BY o3.observation_category
      ORDER BY COUNT(*) DESC, o3.observation_category ASC
      LIMIT 1
    ) AS primary_category,
    (SELECT COUNT(*) FROM public.community_investigations ci
      WHERE ci.site_id = s.id AND ci.is_public = true) AS investigation_count,
    (SELECT COUNT(*) FROM public.community_questions cq
      WHERE cq.site_id = s.id AND cq.is_public = true) AS question_count,
    (SELECT COUNT(*) FROM public.community_evidence ce
      WHERE ce.site_id = s.id AND ce.moderation_status = 'visible') AS evidence_count,
    (SELECT COUNT(*) FROM public.community_visits cv WHERE cv.site_id = s.id) AS visit_count,
    (SELECT COUNT(*) FROM public.community_investigations ci
      WHERE ci.site_id = s.id AND ci.opportunity_basis IS NOT NULL) AS research_opportunity_count,
    ARRAY(
      SELECT DISTINCT o4.primary_classification
      FROM public.observations o4
      WHERE o4.site_id = s.id
        AND o4.publication_status = 'public'
        AND o4.is_demo = false
        AND o4.primary_classification IS NOT NULL
      ORDER BY o4.primary_classification
    ) AS observed_classifications,
    ARRAY(
      SELECT DISTINCT l5.district
      FROM public.observations o5
      JOIN public.observation_locations l5 ON l5.observation_id = o5.id
      WHERE o5.site_id = s.id
        AND o5.publication_status = 'public'
        AND o5.is_demo = false
        AND l5.district IS NOT NULL
      ORDER BY l5.district
    ) AS districts_covered
  FROM public.observations o
  WHERE o.site_id = s.id
    AND o.publication_status = 'public'
    AND o.is_demo = false
    AND o.evidence_state <> 'rejected'
) agg ON TRUE
WHERE s.is_public = true
  AND s.status = 'active';
