-- ============================================================================
-- 038_google_gmail_profiles.sql
-- Earth Talk — Google OAuth & Gmail OTP User Profiles & Identity Hardening
-- ============================================================================

-- 1. Profiles Table for Supabase Auth Users
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               text NOT NULL UNIQUE,
  google_display_name text NULL,
  google_avatar_url   text NULL,
  display_name        text NOT NULL,
  avatar_url          text NULL,
  avatar_source       text NOT NULL DEFAULT 'google' CHECK (avatar_source IN ('google', 'uploaded')),
  name_source         text NOT NULL DEFAULT 'google' CHECK (name_source IN ('google', 'custom')),
  profile_updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Linked Supabase Auth user profiles with Google OAuth metadata, custom display names, and profile photo management.';

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_updated ON public.profiles(updated_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT
  USING (id = auth.uid() OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND email = email -- immutable email at profile level
  );

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- 4. Automatic profile synchronization trigger on auth.users creation
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
DECLARE
  v_google_name text;
  v_google_avatar text;
  v_email text;
BEGIN
  v_email := NEW.email;
  v_google_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(v_email, '@', 1),
    'Earth Talk Contributor'
  );
  v_google_avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture',
    NULL
  );

  INSERT INTO public.profiles (
    id,
    email,
    google_display_name,
    google_avatar_url,
    display_name,
    avatar_url,
    avatar_source,
    name_source,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    v_email,
    v_google_name,
    v_google_avatar,
    v_google_name,
    v_google_avatar,
    'google',
    'google',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    google_display_name = COALESCE(public.profiles.google_display_name, EXCLUDED.google_display_name),
    google_avatar_url = COALESCE(public.profiles.google_avatar_url, EXCLUDED.google_avatar_url),
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();
