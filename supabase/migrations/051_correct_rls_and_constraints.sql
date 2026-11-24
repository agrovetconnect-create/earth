-- 051_correct_rls_and_constraints.sql
-- Corrective migration after the advisor hardening in 042 and the RPC widening in 036.
-- Restores public read semantics, aligns CHECK constraints with the RPCs and
-- replaces a tautological profile policy with a real client-side email guard.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Public read views must run with their owner's privileges again.
-- The deny-all base-table policies added in 042 remain in force for direct
-- client access; only the curated public views expose rows to anon readers.
-- ---------------------------------------------------------------------------
ALTER VIEW public.public_observations SET (security_invoker = false);
ALTER VIEW public.public_geological_sites SET (security_invoker = false);
ALTER VIEW public.public_expert_reviews SET (security_invoker = false);
ALTER VIEW public.public_category_counts SET (security_invoker = false);
ALTER VIEW public.public_observation_media SET (security_invoker = false);
ALTER VIEW public.site_timeline SET (security_invoker = false);

GRANT SELECT ON TABLE public.public_observations TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.public_geological_sites TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.public_expert_reviews TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.public_category_counts TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.public_observation_media TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.site_timeline TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. publication_status: 036 accepts pending_review/rejected but 002's CHECK
--    does not. Widen the table constraint to match the transactional RPC.
-- ---------------------------------------------------------------------------
ALTER TABLE public.observations DROP CONSTRAINT IF EXISTS observations_publication_status_check;

DO $$
DECLARE
  c name;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.observations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE 'CHECK ((publication_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.observations DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.observations
  ADD CONSTRAINT observations_publication_status_check
  CHECK (publication_status IN ('private', 'pending', 'pending_review', 'public', 'hidden', 'rejected'));

-- ---------------------------------------------------------------------------
-- 3. public_visibility_reason: 036 writes free-form audit reasons but 007
--    allowed only three enum-like strings. Keep the field free-form but bounded
--    so audit reasons are never silently rejected or truncated.
-- ---------------------------------------------------------------------------
ALTER TABLE public.observations DROP CONSTRAINT IF EXISTS observations_public_visibility_reason_check;

DO $$
DECLARE
  c name;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.observations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE 'CHECK ((public_visibility_reason%'
  LOOP
    EXECUTE format('ALTER TABLE public.observations DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.observations
  ADD CONSTRAINT observations_public_visibility_reason_check
  CHECK (
    public_visibility_reason IS NULL
    OR (length(btrim(public_visibility_reason)) BETWEEN 1 AND 120)
  );

-- ---------------------------------------------------------------------------
-- 4. Replace the ineffective `email = email` UPDATE check with a real guard.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO public
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_profile_email_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email
     AND current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Email address cannot be changed by a client';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_email_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_profile_email_immutable() TO service_role;

DROP TRIGGER IF EXISTS trg_profile_email_immutable ON public.profiles;
CREATE TRIGGER trg_profile_email_immutable
  BEFORE UPDATE OF email ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_email_immutable();

COMMIT;

-- Verification (run manually on staging):
--   SET ROLE anon; SELECT count(*) FROM public.public_observations;
--   SELECT count(*) FROM public.observations; -- must be denied
--   RESET ROLE;
--   SELECT conname FROM pg_constraint WHERE conrelid='public.observations'::regclass AND contype='c';
