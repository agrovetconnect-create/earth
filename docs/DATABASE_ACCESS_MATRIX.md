# Earth Talk — Database Access & Row-Level Security Matrix

All persistent database operations in Earth Talk flow through the backend Express server using `SUPABASE_SECRET_KEY` (`service_role`). Direct PostgREST access using `anon` or `authenticated` keys is denied on all internal, administrative, authentication, session, audit, queue, CMS write, APK release, and rate-limiting objects, and restricted strictly to read-only sanitized views or vocabulary reference tables where explicitly documented below.

## 1. Tables, Views & Storage Buckets Access Matrix

| Object | Type | RLS Enabled | `anon` / `PUBLIC` | `authenticated` | `service_role` (Backend) | Policy / Security Notes |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| `public.observations` | Table | Yes | Denied (raw table) | Denied (raw table) | Full CRUD | Raw `source_user_hash`, private notes, and unpublished records never exposed directly; public reads flow via `public.public_observations`. |
| `public.observation_media` | Table | Yes | Denied on raw table (`public_observation_media` view used) | Same as `anon` | Full CRUD | Requires `is_public = true AND visibility = 'public' AND moderation_status = 'visible'` for public exposure; `removed` media blocked for all viewers including owners. |
| `public.observation_locations` | Table | Yes | Denied (exact private coords) | Denied | Full CRUD | Public coordinates generalized (`district` / `approximate` / consented `exact`) via backend resolver & `public_observations`. |
| `public.observation_attachments` | Table | Yes | Denied (raw table) | Denied | Full CRUD | Served exclusively through backend download gate checking `download_permission` and moderation state. |
| `public.observation_comments` | Table | Yes | `SELECT` (`moderation_status = 'visible'`) | `SELECT` (`moderation_status = 'visible'`) | Full CRUD | Comment moderation runs atomically via `moderate_comment_transactional` + `admin_audit_log`. |
| `public.geoscience_categories` | Table | Yes | `SELECT` only (`geoscience_categories_public_read`) | `SELECT` only | Full CRUD | Read-only taxonomy vocabulary; `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` revoked from `PUBLIC`, `anon`, `authenticated` (Migration `036`). |
| `public.geoscience_subcategories` | Table | Yes | `SELECT` only (`geoscience_subcategories_public_read`) | `SELECT` only | Full CRUD | Read-only taxonomy subcategories; all write grants revoked from `PUBLIC`, `anon`, `authenticated` (Migration `036`). |
| `public.geological_sites` | Table | Yes | `SELECT` (`is_public = true AND status = 'active'`) | `SELECT` (`is_public = true AND status = 'active'`) | Full CRUD | Grouping provenance (`grouping_basis`) and location precision explicitly enforced. |
| `public.gis_layers` | Table | Yes | `SELECT` only | `SELECT` only | Full CRUD | Unconfigured layers carry `data_source = NULL` and `enabled = false`. |
| `public.community_investigations` | Table | Yes | `SELECT` (`is_public = true AND status <> 'archived'`) | Same as `anon` | Full CRUD | Opener hash (`opened_by_hash`) never projected in public API DTOs. |
| `public.community_votes` | Table | Yes | Denied (raw `contributor_hash`) | Denied | Full CRUD | Aggregated counts exposed via `public_observations` and backend DTOs. |
| `public.community_evidence` | Table | Yes | `SELECT` (`moderation_status = 'visible'`) | Same as `anon` | Full CRUD | `contributor_hash` redacted to pseudonymous handle in backend DTOs. |
| `public.community_questions` | Table | Yes | `SELECT` (`is_public = true`) | `SELECT` (`is_public = true`) | Full CRUD | Pseudonymous contributor hashes kept server-side. |
| `public.community_answers` | Table | Yes | `SELECT` (parent question public) | Same as `anon` | Full CRUD | `is_expert` set exclusively by authenticated staff/expert reviewers. |
| `public.community_media` | Table | Yes | Denied on raw storage paths | Denied | Full CRUD | Storage bucket `community-media` / `community_media` forced private (`public = false`); served via 300s signed URLs after moderation check. |
| `public.community_abuse_reports` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Reporter hashes and resolution notes restricted strictly to `service_role`. |
| `public.expert_verifications` | Table | Yes | Denied (raw table) | Denied (raw table) | Full CRUD | Public reads use `public_expert_reviews` view honoring `identity_published`; unique `is_latest` maintained atomically via `submit_expert_verification_transactional`. |
| `public.verification_audit_logs` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Insert / Select | Immutable expert verification transition audit log. |
| `public.accredited_laboratories` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Registry of active accredited laboratories required for `scientifically_confirmed` state (Migration `036`). |
| `public.users` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Stores `phone_hash` / `email_hash` (HMAC-SHA256), never plaintext phone numbers. |
| `public.user_avatars` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Locked down in Migration `036`; avatar bytes served solely through sanitized `/api/auth/users/:id/avatar` endpoint. |
| `public.auth_sessions` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Stores SHA-256 `token_hash` for community user sessions (`et_user_session` HttpOnly cookie / mobile SecureStore). |
| `public.auth_verification_codes` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Hashed WhatsApp/email OTP codes with expiry and attempt limits. |
| `public.contributor_sessions` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Server-side revocable pseudonymous contributor sessions (`token_hash` SHA-256) backing `et_contributor_token` HttpOnly cookie & mobile tokens (Migration `036`). |
| `public.staff` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Scrypt password hashes; bootstrap Super Admin provisioned with deterministic UUID via `bootstrap_super_admin`. |
| `public.staff_sessions` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | `staff_id UUID NOT NULL REFERENCES public.staff(id)`; SHA-256 `token_hash`; auto-revoked on role change, password rotation, or deactivation. |
| `public.admin_sessions` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Legacy session table locked down under RLS (`service_role` only). |
| `public.system_audit_logs` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Insert / Select | Immutable staff, RBAC, CMS, and release audit ledger (`ip_hash` only, never raw IP). |
| `public.admin_audit_log` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Insert / Select | Immutable scientific evidence, publication, site assignment, and moderation audit ledger. |
| `public.cms_pages` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Durable CMS content store; public reads served via `/api/cms/:page` (Migration `036`). |
| `public.cms_page_revisions` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Insert / Select | Versioned CMS revision history written atomically with `cms_pages` (Migration `036`). |
| `public.app_releases` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Verified signed Android APK metadata registry; single active release enforced by partial unique index (Migration `036`). |
| `public.webhook_message_claims` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Durable WhatsApp webhook idempotency ledger. |
| `public.webhook_jobs` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Durable background job queue with `FOR UPDATE SKIP LOCKED` claiming. |
| `public.rate_limit_buckets` | Table | Yes | Denied (`REVOKE ALL`) | Denied (`REVOKE ALL`) | Full CRUD | Distributed fixed-window rate-limiting state with periodic expired-bucket cleanup. |
| `public.public_observations` | View | N/A (View) | `SELECT` only | `SELECT` only | `SELECT` | Exposes only `publication_status = 'public' AND status = 'completed' AND is_demo = false` with gated coordinates and `is_public = true AND visibility = 'public' AND moderation_status = 'visible'` primary media. |
| `public.public_observation_media` | View | N/A (View) | `SELECT` only | `SELECT` only | `SELECT` | Requires `m.is_public = true AND m.visibility = 'public' AND m.moderation_status = 'visible'` on public completed observations (Migration `036`). |
| `public.site_timeline` | View | N/A (View) | `SELECT` only | `SELECT` only | `SELECT` | Restricted to `s.is_public = true AND s.status = 'active'` and approved/public child records only (Migration `036`). |
| `public.public_expert_reviews` | View | N/A (View) | `SELECT` only | `SELECT` only | `SELECT` | Applies `public_reviewer_label(reviewer_name, identity_published)` on `is_latest = true` reviews of public observations. |
| `storage.buckets: app-releases` | Bucket | Private | Denied (`public = false`) | Denied | Read / Write | Stores verified signed Android APK binaries; streamed via `/api/app/download.apk` with SHA-256 verification. |
| `storage.buckets: community-media` | Bucket | Private | Denied (`public = false`) | Denied | Read / Write | Private bucket served via short-lived signed URLs after moderation gating. |

---

## 2. `SECURITY DEFINER` Functions & RPC Access Matrix (Migrations `027`, `028`, `035`, `036`)

Every privileged PostgreSQL function sets `SECURITY DEFINER` and `SET search_path = pg_catalog, public`, revokes `ALL` from `PUBLIC`, `anon`, and `authenticated`, and grants `EXECUTE` exclusively to `service_role`:

| Function Signature | Purpose | `PUBLIC` / `anon` / `authenticated` | `service_role` |
| :--- | :--- | :---: | :---: |
| `public.bootstrap_super_admin(text, text, text)` | Concurrency-safe deterministic UUID provisioning for bootstrap Super Admin | Revoked | `EXECUTE` |
| `public.check_distributed_rate_limit(text, integer, integer)` | Atomic distributed rate-limit counter increment & window reset | Revoked | `EXECUTE` |
| `public.cleanup_expired_rate_limit_buckets()` | Deletes expired rows from `public.rate_limit_buckets` | Revoked | `EXECUTE` |
| `public.get_operational_summary()` | Operational queue, user, and observation telemetry | Revoked | `EXECUTE` |
| `public.create_staff_transactional(text, text, public.staff_role, text, uuid, text, text)` | Atomic `staff` insert + `system_audit_logs` insert | Revoked | `EXECUTE` |
| `public.update_staff_transactional(uuid, public.staff_role, boolean, text, text, uuid, text, text)` | Atomic `staff` update + full `before`/`after` audit + session revocation | Revoked | `EXECUTE` |
| `public.update_evidence_state_transactional(uuid, text, text, text, text, jsonb)` | Atomic `observations.evidence_state` update + accredited lab & stored attachment verification + `admin_audit_log` insert | Revoked | `EXECUTE` |
| `public.update_publication_status_transactional(uuid, text, text, text, text)` | Atomic `observations.publication_status` + `observation_locations.is_public` update + `admin_audit_log` insert | Revoked | `EXECUTE` |
| `public.update_media_moderation_transactional(uuid, text, text, text, text)` | Atomic `observation_media.moderation_status` update + `admin_audit_log` insert | Revoked | `EXECUTE` |
| `public.update_media_visibility_transactional(uuid, text, text, text, text)` | Atomic `observation_media.visibility` & `is_public` update + `admin_audit_log` insert | Revoked | `EXECUTE` |
| `public.assign_observation_site_transactional(uuid, uuid, text, text, text)` | Atomic `observations.site_id` assignment + `admin_audit_log` insert | Revoked | `EXECUTE` |
| `public.submit_expert_verification_transactional(...)` | Atomic observation status/publication update, prior `is_latest` reset, `expert_verifications` insert, and `verification_audit_logs` insert | Revoked | `EXECUTE` |
| `public.moderate_community_media_transactional(uuid, text, text, text, text)` | Atomic `community_media` moderation + `admin_audit_log` insert | Revoked | `EXECUTE` |
| `public.moderate_comment_transactional(uuid, text, text, text, text)` | Atomic `observation_comments` moderation + `admin_audit_log` insert | Revoked | `EXECUTE` |
| `public.resolve_abuse_report_transactional(text, text, text, text, text)` | Atomic `community_abuse_reports` resolution + `admin_audit_log` insert | Revoked | `EXECUTE` |
| `public.upsert_cms_page_transactional(text, text, jsonb, text, uuid, text, text, text)` | Atomic `cms_pages` upsert + `cms_page_revisions` append + `system_audit_logs` insert | Revoked | `EXECUTE` |
| `public.prune_webhook_message_claims(interval)` | Prunes stale WhatsApp message idempotency claims | Revoked | `EXECUTE` |
| `public.claim_webhook_job(text)` | Row-locked (`SKIP LOCKED`) durable webhook job claim | Revoked | `EXECUTE` |
| `public.recover_stale_webhook_jobs(integer)` | Recovers abandoned webhook jobs after worker crash | Revoked | `EXECUTE` |
| `public.webhook_job_stats()` | Aggregates durable webhook job counts and age by status | Revoked | `EXECUTE` |
| `public.claim_webhook_message(text)` | Row-locked per-message idempotency claim | Revoked | `EXECUTE` |
| `public.recover_stale_webhook_claims(integer)` | Recovers stale message claims after worker crash | Revoked | `EXECUTE` |
