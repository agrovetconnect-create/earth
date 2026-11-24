-- Repair webhook queue RPC privileges after partial security-hardening runs.
--
-- `036_production_blocker_repairs.sql` revokes PUBLIC/anon/authenticated access
-- before granting the queue functions to `service_role`. If the grant step was
-- skipped or overwritten, the worker still sees the functions in PostgREST but
-- every claim fails with "permission denied for function claim_webhook_job".
-- Reapply the security properties and grants idempotently.

DO $$
BEGIN
  IF to_regprocedure('public.prune_webhook_message_claims(interval)') IS NOT NULL THEN
    ALTER FUNCTION public.prune_webhook_message_claims(interval)
      SECURITY DEFINER
      SET search_path = pg_catalog, public;
    REVOKE ALL ON FUNCTION public.prune_webhook_message_claims(interval) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.prune_webhook_message_claims(interval) TO service_role;
  END IF;

  IF to_regprocedure('public.claim_webhook_job(text)') IS NOT NULL THEN
    ALTER FUNCTION public.claim_webhook_job(text)
      SECURITY DEFINER
      SET search_path = pg_catalog, public;
    REVOKE ALL ON FUNCTION public.claim_webhook_job(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.claim_webhook_job(text) TO service_role;
  END IF;

  IF to_regprocedure('public.recover_stale_webhook_jobs(integer)') IS NOT NULL THEN
    ALTER FUNCTION public.recover_stale_webhook_jobs(integer)
      SECURITY DEFINER
      SET search_path = pg_catalog, public;
    REVOKE ALL ON FUNCTION public.recover_stale_webhook_jobs(integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.recover_stale_webhook_jobs(integer) TO service_role;
  END IF;

  IF to_regprocedure('public.webhook_job_stats()') IS NOT NULL THEN
    ALTER FUNCTION public.webhook_job_stats()
      SECURITY DEFINER
      SET search_path = pg_catalog, public;
    REVOKE ALL ON FUNCTION public.webhook_job_stats() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.webhook_job_stats() TO service_role;
  END IF;

  IF to_regprocedure('public.claim_webhook_message(text)') IS NOT NULL THEN
    ALTER FUNCTION public.claim_webhook_message(text)
      SECURITY DEFINER
      SET search_path = pg_catalog, public;
    REVOKE ALL ON FUNCTION public.claim_webhook_message(text) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.claim_webhook_message(text) TO service_role;
  END IF;

  IF to_regprocedure('public.recover_stale_webhook_claims(integer)') IS NOT NULL THEN
    ALTER FUNCTION public.recover_stale_webhook_claims(integer)
      SECURITY DEFINER
      SET search_path = pg_catalog, public;
    REVOKE ALL ON FUNCTION public.recover_stale_webhook_claims(integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.recover_stale_webhook_claims(integer) TO service_role;
  END IF;
END $$;

-- Explicit table privileges protect against a partial 035/036 application too.
REVOKE ALL ON TABLE public.webhook_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.webhook_jobs TO service_role;
REVOKE ALL ON TABLE public.webhook_message_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.webhook_message_claims TO service_role;
