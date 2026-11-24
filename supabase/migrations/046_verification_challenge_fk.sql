DELETE FROM public.verification_challenges AS vc
WHERE NOT EXISTS (
  SELECT 1 FROM public.users AS u WHERE u.id = vc.user_id
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.verification_challenges'::regclass
      AND conname = 'verification_challenges_user_id_fkey'
  ) THEN
    ALTER TABLE public.verification_challenges
      DROP CONSTRAINT verification_challenges_user_id_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.verification_challenges'::regclass
      AND conname = 'verification_challenges_user_id_public_users_fkey'
  ) THEN
    ALTER TABLE public.verification_challenges
      ADD CONSTRAINT verification_challenges_user_id_public_users_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;
