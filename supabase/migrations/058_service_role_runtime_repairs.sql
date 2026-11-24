begin;

do $$
declare
  t record;
begin
  for t in
    select distinct schemaname, tablename
    from pg_policies
    where schemaname = 'public'
      and policyname like 'No client direct access%'
      and 'public' = any(roles)
  loop
    execute format('grant all on table %I.%I to service_role', t.schemaname, t.tablename);
    execute format('drop policy if exists %I on %I.%I', 'Service role full access', t.schemaname, t.tablename);
    execute format(
      'create policy %I on %I.%I for all to service_role using (true) with check (true)',
      'Service role full access',
      t.schemaname,
      t.tablename
    );
  end loop;
end $$;

do $$
begin
  if to_regprocedure('public.prune_webhook_message_claims(interval)') is not null then
    alter function public.prune_webhook_message_claims(interval) owner to postgres;
    alter function public.prune_webhook_message_claims(interval) security definer set search_path = pg_catalog, public;
    revoke all on function public.prune_webhook_message_claims(interval) from public, anon, authenticated;
    grant execute on function public.prune_webhook_message_claims(interval) to service_role;
  end if;

  if to_regprocedure('public.claim_webhook_job(text)') is not null then
    alter function public.claim_webhook_job(text) owner to postgres;
    alter function public.claim_webhook_job(text) security definer set search_path = pg_catalog, public;
    revoke all on function public.claim_webhook_job(text) from public, anon, authenticated;
    grant execute on function public.claim_webhook_job(text) to service_role;
  end if;

  if to_regprocedure('public.recover_stale_webhook_jobs(integer)') is not null then
    alter function public.recover_stale_webhook_jobs(integer) owner to postgres;
    alter function public.recover_stale_webhook_jobs(integer) security definer set search_path = pg_catalog, public;
    revoke all on function public.recover_stale_webhook_jobs(integer) from public, anon, authenticated;
    grant execute on function public.recover_stale_webhook_jobs(integer) to service_role;
  end if;

  if to_regprocedure('public.webhook_job_stats()') is not null then
    alter function public.webhook_job_stats() owner to postgres;
    alter function public.webhook_job_stats() security definer set search_path = pg_catalog, public;
    revoke all on function public.webhook_job_stats() from public, anon, authenticated;
    grant execute on function public.webhook_job_stats() to service_role;
  end if;

  if to_regprocedure('public.claim_webhook_message(text)') is not null then
    alter function public.claim_webhook_message(text) owner to postgres;
    alter function public.claim_webhook_message(text) security definer set search_path = pg_catalog, public;
    revoke all on function public.claim_webhook_message(text) from public, anon, authenticated;
    grant execute on function public.claim_webhook_message(text) to service_role;
  end if;

  if to_regprocedure('public.recover_stale_webhook_claims(integer)') is not null then
    alter function public.recover_stale_webhook_claims(integer) owner to postgres;
    alter function public.recover_stale_webhook_claims(integer) security definer set search_path = pg_catalog, public;
    revoke all on function public.recover_stale_webhook_claims(integer) from public, anon, authenticated;
    grant execute on function public.recover_stale_webhook_claims(integer) to service_role;
  end if;

  grant all on table public.webhook_jobs to service_role;
  grant all on table public.webhook_message_claims to service_role;
  grant all on table public.users to service_role;
  grant all on table public.auth_sessions to service_role;
  grant all on table public.verification_challenges to service_role;
end $$;

commit;
