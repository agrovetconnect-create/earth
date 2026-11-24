-- 030_operational_metrics_rpc.sql
-- Provides efficient aggregated metrics for the Control Center dashboard.

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
  -- Count users
  SELECT count(*) INTO v_total_users FROM public.users;
  
  -- Count observations
  SELECT count(*) INTO v_total_observations FROM public.observations;
  
  -- Count webhooks
  SELECT count(*) INTO v_pending_webhooks FROM public.webhook_queue WHERE status = 'pending';
  SELECT count(*) INTO v_failed_webhooks FROM public.webhook_queue WHERE status = 'failed';
  
  -- Count expert verified
  SELECT count(*) INTO v_expert_verified_count FROM public.observations WHERE verification_status = 'expert_verified';
  
  -- Count AI analyses
  SELECT count(*) INTO v_ai_analyses_count FROM public.observations WHERE ai_analysis IS NOT NULL;

  result = jsonb_build_object(
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
