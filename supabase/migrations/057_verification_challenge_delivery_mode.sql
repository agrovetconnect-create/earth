begin;

alter table public.verification_challenges
  add column if not exists delivery_mode text not null default 'app_code';

do $$
begin
  alter table public.verification_challenges
    add constraint verification_challenges_delivery_mode_check
    check (delivery_mode in ('app_code', 'supabase_otp'));
exception
  when duplicate_object then null;
end $$;

update public.verification_challenges
  set delivery_mode = 'supabase_otp'
  where otp_hash = 'SUPABASE_AUTH_OTP';

commit;
