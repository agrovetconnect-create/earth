-- 031_make_phone_hash_optional.sql
-- Relaxes phone_hash constraint to allow email-only registration.
-- Also ensures uniqueness of phone_hash only when it is present.

ALTER TABLE public.users 
  ALTER COLUMN phone_hash DROP NOT NULL;

-- The existing UNIQUE constraint on phone_hash handles NULLs correctly in PostgreSQL
-- (multiple NULLs are allowed unless UNIQUE (phone_hash) is combined with NOT NULL).
-- So no need to change the index.

COMMENT ON COLUMN public.users.phone_hash IS
  'Optional HMAC-SHA256 of the verified phone number. Required for WhatsApp-first accounts, optional for email-first accounts.';
