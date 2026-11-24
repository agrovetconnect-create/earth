-- 034_fix_community_evidence_count.sql
-- Fix community_evidence_count SQL aggregate: The public_observations view 
-- incorrectly aggregates all community_evidence instead of filtering by 
-- moderation_status = 'visible'.

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
  WHERE (ce.observation_id = o.id
     OR ce.site_id = o.site_id
     OR ce.investigation_id IN (
       SELECT ci4.id FROM public.community_investigations ci4
       WHERE ci4.observation_id = o.id OR ci4.site_id = o.site_id
     ))
     AND ce.moderation_status = 'visible'
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

-- Hardening get_operational_summary to prevent search path hijacking
CREATE OR REPLACE FUNCTION public.get_operational_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
