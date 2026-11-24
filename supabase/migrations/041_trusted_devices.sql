-- ============================================================================
-- 041_trusted_devices.sql
-- Earth Talk — Durable Trusted Device Fingerprints for Step-Up Verification
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_trusted_devices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL,
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_fingerprint)
);

COMMENT ON TABLE public.user_trusted_devices IS
  'Hashed trusted browser/device fingerprints per Earth Talk user for detecting new-device logins.';

CREATE INDEX IF NOT EXISTS idx_user_trusted_devices_user
  ON public.user_trusted_devices(user_id, last_seen_at DESC);

ALTER TABLE public.user_trusted_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No client direct access to trusted devices" ON public.user_trusted_devices;
CREATE POLICY "No client direct access to trusted devices" ON public.user_trusted_devices
  FOR ALL
  USING (false);

REVOKE ALL ON TABLE public.user_trusted_devices FROM anon, authenticated;
