# Earth Talk — Production Deployment Checklist

Follow every step below in order before promoting a release to staging or production.

## 1. Database & Supabase Readiness

- [ ] Verify PostGIS is enabled in the `extensions` schema (`001_extensions.sql`).
- [ ] Confirm migrations `001` through `034` are applied in order without modification.
- [ ] Apply `supabase/migrations/035_security_hardening_and_transactional_ops.sql` on a staging database first, then production.
- [ ] Run post-migration SQL verification in Supabase SQL Editor:
  ```sql
  -- Verify RLS is enabled on hardened tables
  SELECT relname, relrowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND relname IN ('staff', 'staff_sessions', 'system_audit_logs', 'compliance_audit_log', 'rate_limit_buckets');

  -- Verify anon/authenticated cannot execute get_operational_summary or transactional RPCs
  SELECT has_function_privilege('anon', 'public.get_operational_summary()', 'EXECUTE') AS anon_can_exec,
         has_function_privilege('authenticated', 'public.get_operational_summary()', 'EXECUTE') AS auth_can_exec,
         has_function_privilege('service_role', 'public.get_operational_summary()', 'EXECUTE') AS service_can_exec;
  ```
- [ ] Confirm `community_media` storage bucket is private (`public = false`).

## 2. Environment Variables & Secrets (`render.yaml` / Host Environment)

Ensure `NODE_ENV=production` and none of the secrets below contain placeholder substrings (`placeholder`, `mock-project-id`, `test_`, `changeme`, `replace_me`, `not_configured`):

- [ ] `SUPABASE_URL` — Production `https://<project-ref>.supabase.co` URL.
- [ ] `SUPABASE_SECRET_KEY` — Privileged server-only `sb_secret_...` or `service_role` key (never `anon` / `sb_publishable_...`).
- [ ] `SUPER_ADMIN_EMAIL` — Authoritative owner email address.
- [ ] `SUPER_ADMIN_PASSWORD_HASH` — Scrypt hash (`scrypt$<saltHex>$<hashHex>`). Confirm `SUPER_ADMIN_PASSWORD` plaintext variable is unset in production.
- [ ] `SUPER_ADMIN_SESSION_SECRET` — Minimum 32-byte cryptographically random secret.
- [ ] `USER_HASH_SECRET` — Dedicated 32-byte secret for irreversible phone-number HMAC-SHA256 hashing.
- [ ] `ANONYMOUS_CONTRIBUTOR_SECRET` — Dedicated 32-byte secret for contributor token signing/hashing.
- [ ] `AUTH_SESSION_SECRET` — Dedicated 32-byte secret for contributor WhatsApp-login sessions.
- [ ] `INTERNAL_SERVICE_KEY` — Dedicated 32-byte secret for `/internal/*` endpoints (never reuse `SUPABASE_SECRET_KEY`).
- [ ] `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` — Meta WhatsApp Cloud API production credentials (`WHATSAPP_APP_SECRET` validates `X-Hub-Signature-256`).
- [ ] `GEMINI_API_KEY` — Production Gemini API credential.
- [ ] `EMAIL_API_KEY`, `EMAIL_FROM`, `CONTROL_CENTER_URL` — Production transactional email configuration.
- [ ] `CORS_ALLOWED_ORIGINS` — Explicit comma-separated production HTTPS origin(s) (no wildcards).
- [ ] `DEMO_POSTS_ENABLED=false` — Ensure demonstration posts remain disabled in production.

## 3. Reverse Proxy, Cookies & Transport Security

- [ ] Confirm `app.set('trust proxy', 1)` matches the deployment ingress hop count (1 hop on Render standard load balancer).
- [ ] Verify HTTPS termination is enforced at the edge so `Secure`, `HttpOnly`, `SameSite=Lax` contributor cookies (`et_contributor_token`) and HSTS headers operate over TLS.

## 4. Build, Automated Test & Smoke Verification

- [ ] `npm run build` exits `0`.
- [ ] `npx tsc --noEmit` and `npm run lint` exit `0`.
- [ ] `npm test` exits `0` across all 19 backend/web suites.
- [ ] `npm --prefix mobile run typecheck` and `npm --prefix mobile test` exit `0`.
- [ ] Smoke-test `GET /health` against production (`200 OK`, `database.status: "connected"`).
- [ ] Smoke-test Super Admin login (`POST /api/control/auth/login`), confirm a valid UUID row exists in `public.staff` and `public.staff_sessions`, and verify logout (`POST /api/control/auth/logout`) immediately invalidates the bearer token.
- [ ] If distributing an Android APK directly (`mode: "apk"` or `"both"`), upload a signed release APK (`>= 100 KB` with valid `AndroidManifest.xml`) via Control Center (`POST /api/control/app-distribution/upload`) and verify SHA-256 checksum; otherwise confirm `GET /api/app-distribution/download` returns `503 APK_UNAVAILABLE`.
