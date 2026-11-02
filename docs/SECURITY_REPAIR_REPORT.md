# Earth Talk — Security, Reliability & Blocker-Only Repair Report

## 1. Executive Summary

This report documents the root-cause repairs, corrective database migration (`supabase/migrations/036_production_blocker_repairs.sql`), application security hardening, GeoAI upgrades, and regression suites implemented across `/src`, `/web`, `/mobile`, `/supabase/migrations`, `/tests`, and `/render.yaml` to resolve every finding classified as `NOT FIXED`, `PARTIALLY FIXED`, or `BLOCKED` in the Independent Production Readiness Audit.

All changes preserve existing UI/UX layouts, geological taxonomy, API behavior, and migration history. Zero fabricated data, placeholder credentials, dummy APK binaries, or unverified live-database claims were introduced.

---

## 2. Priority 1 — Database Migrations, Transactional RPCs, RLS & Access Control

### 2.1 Migration `033` & `035` Repairs + Corrective Migration `036`
- **`033_cleanup_legacy_names.sql`:** Wrapped in `BEGIN; ... COMMIT;` and removed the unconditional `UPDATE public.gis_layers SET description = ...` referencing a nonexistent column (`gis_layers` only defines `display_name`, `attribution`, `legend_json`, etc.).
- **`035_security_hardening_and_transactional_ops.sql`:** Removed all four casts to nonexistent PostgreSQL enum types (`::public.staff_role`, `::public.staff_status`, `::public.evidence_state`, `::public.publication_status`) where the underlying schema uses `TEXT` columns with `CHECK` constraints.
- **`036_production_blocker_repairs.sql` (New Atomic Corrective Migration):**
  - Preserves migration history for environments where `033` or `035` may already be recorded while allowing clean sequential replay `001`→`036` inside `BEGIN; ... COMMIT;`.
  - Creates `public.contributor_sessions`, `public.accredited_laboratories` (empty by default — zero fabricated entries), `public.cms_pages`, `public.cms_page_revisions`, `public.app_releases`, and private storage bucket `app-releases`.
  - Recreates and hardens all transactional PL/pgSQL RPCs (`update_staff_transactional`, `update_evidence_state_transactional`, `update_publication_status_transactional`, `update_media_moderation_transactional`, `update_media_visibility_transactional`, `assign_observation_site_transactional`, `submit_expert_verification_transactional`, `upsert_cms_page_transactional`, `cleanup_expired_rate_limit_buckets`, `get_operational_summary`) with `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, and `EXECUTE` locked exclusively to `service_role`.
  - Enables RLS and revokes `PUBLIC, anon, authenticated` privileges on `public.user_avatars`.
  - Restricts `public.geoscience_categories` and `public.geoscience_subcategories` to read-only (`SELECT`) for `anon`/`authenticated`, blocking client writes.
  - Recreates `public.site_timeline` preserving its exact 5-column contract (`site_id`, `observation_public_id`, `observed_at`, `primary_classification`, `evidence_state`) restricted to published, non-demo observations on active sites.
  - Hardens `public.public_observation_media` and `public.public_observations` so only media with `is_public = true AND moderation_status = 'approved'` and published observations are exposed.
  - Revokes `PUBLIC, anon, authenticated` `EXECUTE` privileges on webhook queue RPCs (`claim_inbound_webhook_event`, `complete_inbound_webhook_event`, `fail_inbound_webhook_event`, `claim_next_webhook_job`, `complete_webhook_job`, `fail_webhook_job`), granting `EXECUTE` exclusively to `service_role`.
- **`docs/DATABASE_ACCESS_MATRIX.md`:** Reconciled to match exact SQL table, view, bucket, and RPC names across migrations `001`–`036`.

---

## 3. Priority 2 — Scientific Confirmation Integrity & Transactional Repository Wiring

- **`src/utils/scientific-evidence.ts`:** Implemented `parseStructuredScientificEvidence`, `verifyScientificConfirmationEvidence`, and `verifyPersistedConfirmationBasis` backed by an unforgeable symbol-branded `VerifiedScientificConfirmation`.
- **Server-Side Accredited Registry & Stored Evidence Verification:** `scientifically_confirmed` cannot be reached via client-supplied `accreditationVerified: true` booleans, free-text keywords, external URLs, or community vote counts. The server verifies that `laboratory_id` exists with `is_active = true` in `public.accredited_laboratories` and that `evidence_reference` matches an actual persisted attachment/media/evidence row belonging to the target observation.
- **Transactional Wiring:** Wired `observationRepository.setObservationSite` (`assign_observation_site_transactional`), `observationRepository.setEvidenceState` (`update_evidence_state_transactional`), and `expertRepository.submitVerification` (`submit_expert_verification_transactional`) so mutations and audit entries commit or roll back atomically.

---

## 4. Priority 3 — Authentication, CSRF Protection & Credential Transport

- **End-to-End `HttpOnly` Cookie Sessions:**
  - User (`et_user_session`), Staff/Owner/Expert (`et_staff_session`), and Contributor (`et_contributor_token`) sessions are transported via `HttpOnly` cookies (`Secure` in production) on web (`credentials: 'include'`).
  - Web JSON responses no longer return raw session or contributor tokens; mobile clients explicitly send `X-Client-Platform: mobile` and store credentials exclusively in OS hardware-backed `expo-secure-store` (zero `AsyncStorage`, `localStorage`, or `sessionStorage` credential fallbacks).
- **Cookie Parsing & CSRF Protection (`src/middleware/csrf.ts`):**
  - Fixed cookie parsing to slice at the first `=` (preserving base64 padding) and wrapped `decodeURIComponent` in `try/catch`.
  - Mounted `GET /api/auth/csrf` and `requireCsrfProtection` across `/api` (`POST`/`PUT`/`PATCH`/`DELETE`), enforcing `Origin`/`Referer` allowlist verification plus constant-time double-submit token comparison (`et_csrf_token` cookie vs `X-CSRF-Token` header) whenever session cookies are present.
- **Revocable Contributor Sessions (`src/utils/contributor.ts`):**
  - Contributor tokens are persisted as SHA-256 hashes in `public.contributor_sessions` (with TTL and `revoked_at`) and immediately revoked via `POST /api/community/contributor-token/logout`.

---

## 5. Priority 4 — GeoAI Pipeline, Active Models & `insufficient_image` Guard

- **Active Gemini Model Chains (`src/services/gemini.service.ts`):** Upgraded `@google/genai` to `^2.32.0`, removed deprecated `gemini-2.5-flash-lite`, configured `[env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']` for multimodal image & Q&A workflows, and configured `['gemini-3.5-transcribe', 'gemini-3.8-flash', 'gemini-2.5-flash']` with timeouts for voice-note transcription.
- **Multimodal Supporting Photos:** Forwarded supporting image attachments alongside the primary field photograph in a single multimodal GeoAI call (while excluding non-image video files from Gemini image parts).
- **`insufficient_image` Rejection Guard:** Both HTTP/mobile submission (`photoSubmissionService`, `mobileChatService`) and WhatsApp submission (`geoscienceAnalysisService`) detect `observation_category === 'insufficient_image' || primary_classification === 'insufficient_image' || confidence === 'insufficient'` and return actionable retake guidance without minting a Geoscience Passport.

---

## 6. Priority 5 — Distributed Rate Limiting, Production CORS & Drain

- **Distributed Rate Limiting:** Wired `checkDistributedRateLimit` across WhatsApp AI analysis, HTTP photo submissions, email OTP auth flows (with hashed email keys), expert review submissions, community comments, public read APIs (`public.controller.ts`), and research exports (`research.controller.ts`), plus periodic `cleanup_expired_rate_limit_buckets` pruning.
- **Production CORS Validation (`src/config/env.ts`):** `validateProductionCorsOrigins` rejects empty origins, `*`, `http://`, `localhost`/`127.0.0.1`/`::1`/`0.0.0.0`, embedded credentials, and origins containing paths/queries/fragments when `NODE_ENV=production`.
- **Render Health Check & Graceful Drain:** Added `healthCheckPath: /health` to `render.yaml` and `webhookQueueService.drain()` during graceful shutdown in `src/server.ts`.

---

## 7. Priority 6 — Transactional CMS & Cryptographic APK Verification

- **CMS Persistence & XSS Hardening (`src/services/cms.service.ts`):**
  - Persists CMS pages and revisions transactionally via `public.cms_pages`, `public.cms_page_revisions`, and `public.upsert_cms_page_transactional` when Supabase is configured (with serialized atomic temp-file writes in local dev).
  - Enforces strict schema bounds and active-markup XSS rejection (`<script>`, `<iframe>`, `javascript:`, inline `on*=` handlers) via `validateCmsUpdatePayload`, and returns deep `structuredClone` copies of `DEFAULT_CMS_DATA`.
- **Cryptographic Signed APK Verification (`src/services/app-distribution.service.ts`):**
  - `inspectAndVerifyApkBuffer` walks the ZIP End of Central Directory and Central Directory, rejects duplicate entries and out-of-bounds offsets, decompresses and verifies IEEE CRC-32 checksums on `AndroidManifest.xml` and `classes.dex` (`dex\n` magic), confirms `org.earthtalk.mobile` in UTF-8 or UTF-16LE AXML string pool, and verifies a cryptographic **APK Signature Scheme v2/v3 Signing Block (`APK Sig Block 42`, IDs `0x7109871a` / `0xf05368c0`)** or **JAR v1 (`META-INF/*.MF`, `*.SF`, `*.(RSA|DSA|EC)`)** signature.
  - Persists verified releases in private Supabase Storage (`app-releases`) + `public.app_releases`, verifies SHA-256 on download before serving, and sanitizes `Content-Disposition` filenames (`sanitizeApkFilename`).

---

## 8. Live Verification Status & Remaining Pre-Cutover Requirement

- **Local Compilation & Hermetic Regression Suites:** Executed and passing across web, backend, and mobile (`npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm --prefix mobile run typecheck`, `npm --prefix mobile test`).
- **Live PostgreSQL / Staging Supabase Migration Verification (`001`–`036`):** **`BLOCKED / SKIPPED`** in this container environment (`SUPABASE_URL` is unconfigured and no local `psql` / `postgres` / `docker` / `supabase` runtime is installed; `npm run test:integration` exited `0` with `SKIP Database is not configured`).
- **Production Readiness Gate:** Do **not** cut over production traffic until migrations `001`–`036` (or `036_production_blocker_repairs.sql` on environments with `001`–`035` applied) are executed and verified against a live staging Supabase PostgreSQL instance (`npm run test:integration` with live staging credentials).
