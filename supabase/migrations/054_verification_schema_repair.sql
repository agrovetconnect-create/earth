ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz NULL;
