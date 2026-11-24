BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_key
  ON public.users (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_id_fkey'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_public_users_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_public_users_fkey
      FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user_profile();

CREATE OR REPLACE FUNCTION public.cleanup_expired_unverified_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  deleted_count integer := 0;
BEGIN
  WITH doomed AS (
    SELECT u.id
    FROM public.users u
    WHERE u.email_verified_at IS NULL
      AND u.created_at < now() - interval '10 minutes'
      AND EXISTS (
        SELECT 1 FROM public.verification_challenges c
        WHERE c.user_id = u.id
          AND c.purpose = 'first_login'
          AND c.consumed = false
          AND c.expires_at <= now()
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.observations o WHERE o.owner_user_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.auth_sessions s
        WHERE s.user_id = u.id AND s.revoked_at IS NULL
      )
    FOR UPDATE OF u SKIP LOCKED
  )
  DELETE FROM public.users u USING doomed d WHERE u.id = d.id;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END $$;

REVOKE ALL ON FUNCTION public.cleanup_expired_unverified_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_unverified_accounts() TO service_role;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (select auth.uid())
    OR id = (select u.id from public.users u where u.auth_user_id = (select auth.uid()) limit 1)
  );

COMMIT;
