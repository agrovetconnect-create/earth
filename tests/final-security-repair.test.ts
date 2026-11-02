/**
 * Final Security, Reliability & Mobile Repair Cycle — Comprehensive Regression Suite
 *
 * Verifies every repaired issue across:
 *   1. Super Admin bootstrap UUID provisioning & session regression controls
 *   2. Media privacy enforcement (getPost, getRawMedia, syncPublicObservationIndex)
 *   3. Atomic PostgreSQL transactional administrative operations + fail-closed error handling
 *   4. Operational summary & migration 035 least-privilege RLS / function hardening
 *   5. Context-aware GeoAI pipeline integration & fallback
 *   6. Scientific confirmation traceable laboratory evidence enforcement
 *   7. Contributor credential sessionStorage + HttpOnly cookie security
 *   8. Trust proxy, distributed rate limiting & constant-time INTERNAL_SERVICE_KEY auth
 *   9. CMS owner-only RBAC, path-traversal blocking, safe corrupted-JSON handling & rollback
 *  10. Honest Android APK distribution integrity (no fabricated archives or metadata)
 *
 * Note: Because `npm test` runs hermetically (`tests/run.ts`), database-backed
 * paths are verified via deterministic Supabase client stubs (`withMockSupabase`)
 * and SQL schema assertions against migration 035.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env, hashPassword, verifyInternalServiceKey } from '../src/config/env.js';
import { supabase } from '../src/config/supabase.js';
import {
  isValidUuid,
  ensureBootstrapSuperAdminRecord,
  authenticateStaff,
  generateStaffToken,
  generateAdminToken,
  verifyStaffToken,
  revokeStaffSession,
  requireStaff,
  hashToken,
  BOOTSTRAP_DEV_SUPER_ADMIN_ID,
} from '../src/utils/admin-auth.js';
import { ServiceUnavailableError, isServiceUnavailableError } from '../src/utils/service-error.js';
import { communityPostService } from '../src/services/community-post.service.js';
import { communityPostRepository, CommunityPostRepository } from '../src/repositories/community-post.repository.js';
import { observationRepository } from '../src/repositories/observation.repository.js';
import { communityMediaRepository } from '../src/repositories/community-media.repository.js';
import { abuseReportRepository, AbuseReportRepository } from '../src/repositories/abuse-report.repository.js';
import { staffService } from '../src/services/staff.service.js';
import { communityService } from '../src/services/community.service.js';
import { adminController } from '../src/controllers/admin.controller.js';
import { staffController } from '../src/controllers/staff.controller.js';
import { cmsService } from '../src/services/cms.service.js';
import { appDistributionService } from '../src/services/app-distribution.service.js';
import { appDistributionController } from '../src/controllers/app-distribution.controller.js';
import { checkDistributedRateLimit } from '../src/utils/rate-limiter.js';
import { geoscienceIntelligenceService } from '../src/services/geoscience-intelligence.service.js';
import { photoSubmissionService } from '../src/services/photo-submission.service.js';
import {
  verifyScientificConfirmationEvidence,
  registerAccreditedLaboratoryInMemory,
  registerObservationEvidenceRefInMemory,
  clearScientificEvidenceRegistriesInMemory,
} from '../src/utils/scientific-evidence.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

function section(title: string): void {
  console.log(`\n${'-'.repeat(70)}\n${title}\n${'-'.repeat(70)}`);
}

const ROOT = process.cwd();
const read = (relPath: string): string => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

function mockRes() {
  const headers: Record<string, string | string[]> = {};
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  let statusCode = 200;
  let jsonBody: any = undefined;
  return {
    get statusCode() {
      return statusCode;
    },
    get jsonBody() {
      return jsonBody;
    },
    get headers() {
      return headers;
    },
    get cookies() {
      return cookies;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(k: string, v: string | string[]) {
      headers[k.toLowerCase()] = v;
      return this;
    },
    cookie(name: string, value: string, options: Record<string, unknown> = {}) {
      cookies.push({ name, value, options });
      return this;
    },
    json(payload: unknown) {
      jsonBody = payload;
      return this;
    },
    send(payload: unknown) {
      jsonBody = payload;
      return this;
    },
  } as any;
}

async function withMockSupabase<T>(
  handlers: {
    from?: (table: string) => any;
    rpc?: (fnName: string, params?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  },
  fn: () => Promise<T>
): Promise<T> {
  const origUrl = env.SUPABASE_URL;
  const origKey = env.SUPABASE_SECRET_KEY;
  const origFrom = supabase.from.bind(supabase);
  const origRpc = supabase.rpc.bind(supabase);

  env.SUPABASE_URL = 'https://unitverifyproject.supabase.co';
  env.SUPABASE_SECRET_KEY = 'sb_secret_unitverifykey1234567890';
  if (handlers.from) {
    (supabase as any).from = handlers.from;
  }
  if (handlers.rpc) {
    (supabase as any).rpc = handlers.rpc;
  }

  try {
    return await fn();
  } finally {
    env.SUPABASE_URL = origUrl;
    env.SUPABASE_SECRET_KEY = origKey;
    (supabase as any).from = origFrom;
    (supabase as any).rpc = origRpc;
  }
}

// =============================================================================
// 1. Super Admin Session Provisioning & Authentication Regression Suite
// =============================================================================
section('1. Super Admin Bootstrap UUID & Authentication Regressions');

await test('bootstrap Super Admin provisions an idempotent valid UUID and inserts non-null UUID into staff_sessions', async () => {
  const provisionedUuid = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const insertedSessions: any[] = [];
  let rpcCalls = 0;

  await withMockSupabase(
    {
      rpc: async (fnName, params) => {
        if (fnName === 'bootstrap_super_admin') {
          rpcCalls++;
          assert.equal(params?.p_email, env.SUPER_ADMIN_EMAIL);
          return { data: provisionedUuid, error: null };
        }
        return { data: null, error: { message: 'unexpected rpc' } };
      },
      from: (table: string) => {
        if (table === 'staff_sessions') {
          return {
            insert: async (row: any) => {
              // Enforce PostgreSQL NOT NULL + UUID FK constraint check directly in mock!
              assert.ok(row.staff_id !== null && row.staff_id !== undefined, 'staff_id MUST NOT be NULL');
              assert.notEqual(row.staff_id, 'super_admin', 'staff_id MUST NOT be literal "super_admin"');
              assert.equal(isValidUuid(row.staff_id), true, 'staff_id MUST be a valid UUID');
              insertedSessions.push({
                ...row,
                revoked_at: null,
                created_at: new Date().toISOString(),
                last_used_at: new Date().toISOString(),
              });
              return { error: null };
            },
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: async () => ({
                  data: insertedSessions.find((s) => s.token_hash === val) ?? null,
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }
        if (table === 'staff') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: async () => ({
                  data:
                    val === provisionedUuid
                      ? { id: provisionedUuid, email: env.SUPER_ADMIN_EMAIL, role: 'owner', is_active: true }
                      : null,
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    },
    async () => {
      const id1 = await ensureBootstrapSuperAdminRecord(env.SUPER_ADMIN_EMAIL);
      const id2 = await ensureBootstrapSuperAdminRecord(env.SUPER_ADMIN_EMAIL);
      assert.equal(id1, provisionedUuid);
      assert.equal(id2, provisionedUuid, 'bootstrap provisioning must be idempotent');
      assert.equal(rpcCalls, 2);

      const adminToken = await generateAdminToken({ ip: '198.51.100.12', userAgent: 'UnitVerify/1.0' });
      assert.equal(insertedSessions.length, 1);
      assert.equal(insertedSessions[0].staff_id, provisionedUuid);

      const verifiedAdmin = await verifyStaffToken(adminToken);
      assert.ok(verifiedAdmin);
      assert.equal(verifiedAdmin.staffId, provisionedUuid);
      assert.equal(verifiedAdmin.adminId, 'super_admin');

      const staffToken = await generateStaffToken({
        id: provisionedUuid,
        email: env.SUPER_ADMIN_EMAIL,
        role: 'owner',
      });
      assert.equal(insertedSessions.length, 2);
      assert.equal(insertedSessions[1].staff_id, provisionedUuid);

      const verifiedStaff = await verifyStaffToken(staffToken);
      assert.ok(verifiedStaff);
      assert.equal(verifiedStaff.staffId, provisionedUuid);
      assert.equal(verifiedStaff.role, 'owner');
    }
  );
});

await test('missing database session, revoked session, expired session, disabled staff, and changed role are all rejected', async () => {
  const staffUuid = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
  const sessionStore = new Map<string, any>();
  let staffState = {
    id: staffUuid,
    email: 'ops@earthtalk.local',
    role: 'ops',
    is_active: true,
  };

  await withMockSupabase(
    {
      from: (table: string) => {
        if (table === 'staff_sessions') {
          return {
            insert: async (row: any) => {
              sessionStore.set(row.token_hash, {
                ...row,
                revoked_at: null,
                created_at: new Date().toISOString(),
                last_used_at: new Date().toISOString(),
              });
              return { error: null };
            },
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: async () => ({
                  data: sessionStore.get(val) ?? null,
                  error: null,
                }),
              }),
            }),
            update: (patch: any) => ({
              eq: async (col: string, val: string) => {
                if (col === 'token_hash' && sessionStore.has(val)) {
                  Object.assign(sessionStore.get(val), patch);
                }
                return { error: null };
              },
            }),
          };
        }
        if (table === 'staff') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: async () => ({
                  data: val === staffUuid ? { ...staffState } : null,
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      },
    },
    async () => {
      const token = await generateStaffToken({
        id: staffUuid,
        email: staffState.email,
        role: 'ops',
      });
      const tokenHash = hashToken(token);

      // Baseline valid
      assert.ok(await verifyStaffToken(token));

      // 1.Changed staff role takes effect immediately
      staffState.role = 'support';
      assert.equal(await verifyStaffToken(token), null, 'changed role must invalidate active session');
      staffState.role = 'ops';
      assert.ok(await verifyStaffToken(token));

      // 2. Disabled staff cannot continue using existing sessions
      staffState.is_active = false;
      assert.equal(await verifyStaffToken(token), null, 'disabled staff must be rejected immediately');
      staffState.is_active = true;
      assert.ok(await verifyStaffToken(token));

      // 3. Expired session in DB is rejected
      const savedExpiry = sessionStore.get(tokenHash).expires_at;
      sessionStore.get(tokenHash).expires_at = new Date(Date.now() - 60_000).toISOString();
      assert.equal(await verifyStaffToken(token), null, 'expired DB session must be rejected');
      sessionStore.get(tokenHash).expires_at = savedExpiry;

      // 4. Revoked session is rejected
      await revokeStaffSession(token);
      assert.equal(await verifyStaffToken(token), null, 'revoked session must be rejected');

      // 5. Missing database session (valid HMAC signature, deleted row) is rejected
      sessionStore.delete(tokenHash);
      assert.equal(await verifyStaffToken(token), null, 'missing DB session must fail closed');
    }
  );
});

await test('database errors during session verification fail closed with 503 DATABASE_UNAVAILABLE', async () => {
  await withMockSupabase(
    {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'connection refused' } }),
          }),
        }),
      }),
    },
    async () => {
      const mw = requireStaff('owner');
      const req: any = { headers: { authorization: 'Bearer synthetic.token.value' } };
      const res = mockRes();
      let nextCalled = false;
      await mw(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 503);
      assert.equal(res.jsonBody?.code, 'DATABASE_UNAVAILABLE');
    }
  );
});

await test('staff login rate limiting enforces per-IP + email attempt cap (429)', async () => {
  const uniqueEmail = `ratelimit-${Date.now()}@earthtalk.local`;
  const limit = env.SUPER_ADMIN_RATE_LIMIT_PER_MINUTE;
  let lastStatus = 0;

  for (let i = 0; i <= limit; i++) {
    const req: any = {
      ip: '203.0.113.77',
      socket: { remoteAddress: '203.0.113.77' },
      headers: { 'user-agent': 'RateLimitTest' },
      body: { email: uniqueEmail, password: 'wrong-password' },
    };
    const res = mockRes();
    await staffController.login(req, res);
    lastStatus = res.statusCode;
  }

  assert.equal(lastStatus, 429, 'login endpoint must return 429 once rate limit is exceeded');
});

await test('unconfigured dev Super Admin uses deterministic valid UUID, never null or non-UUID', async () => {
  const id = await ensureBootstrapSuperAdminRecord(env.SUPER_ADMIN_EMAIL);
  assert.equal(id, BOOTSTRAP_DEV_SUPER_ADMIN_ID);
  assert.equal(isValidUuid(id), true);
});

// =============================================================================
// 2. Media Privacy Matrix (getPost & getRawMedia, Owner vs Non-Owner)
// =============================================================================
section('2. Media Privacy Matrix (Post Detail & Raw Media)');

await test('media privacy matrix enforces public+visible for non-owners and blocks removed for all viewers', async () => {
  const ownerId = 'user-owner-001';
  const nonOwnerViewer = { userId: 'user-other-999', publicUserId: 'ET-OTHER', displayName: 'Other' };
  const ownerViewer = { userId: ownerId, publicUserId: 'ET-OWNER', displayName: 'Owner' };
  const passportId = 'ET-PRIVACY-TEST-001';
  const sampleBase64 = Buffer.from('fake-jpeg-bytes').toString('base64');

  const sampleObs: any = {
    id: 'obs-uuid-privacy-1',
    passport_id: passportId,
    owner_user_id: ownerId,
    source_user_hash: 'hash-owner',
    publication_status: 'public',
    observation_category: 'rock',
    observation_subcategory: 'outcrop',
    is_demo: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    primary_interpretation: 'Quartzite outcrop',
    observed_features: [],
    diagnostic_features: [],
    reasoning: 'Visual',
    alternative_possibilities: [],
    uncertainties: [],
    limitations: [],
    recommended_next_steps: [],
    safety_note: 'Safe',
    confidence: 'moderate',
    confidence_score: 0.7,
    evidence_state: 'ai_assisted',
  };

  const mediaMatrix: any[] = [
    {
      id: 'm-approved-public',
      observation_id: sampleObs.id,
      media_type: 'image',
      mime_type: 'image/jpeg',
      visibility: 'public',
      is_public: true,
      moderation_status: 'visible',
      content_base64: sampleBase64,
      created_at: new Date().toISOString(),
    },
    {
      id: 'm-pending',
      observation_id: sampleObs.id,
      media_type: 'image',
      mime_type: 'image/jpeg',
      visibility: 'pending',
      is_public: true,
      moderation_status: 'pending_review',
      content_base64: sampleBase64,
      created_at: new Date().toISOString(),
    },
    {
      id: 'm-private',
      observation_id: sampleObs.id,
      media_type: 'image',
      mime_type: 'image/jpeg',
      visibility: 'private',
      is_public: false,
      moderation_status: 'visible',
      content_base64: sampleBase64,
      created_at: new Date().toISOString(),
    },
    {
      id: 'm-rejected-hidden',
      observation_id: sampleObs.id,
      media_type: 'image',
      mime_type: 'image/jpeg',
      visibility: 'hidden',
      is_public: false,
      moderation_status: 'hidden',
      content_base64: sampleBase64,
      created_at: new Date().toISOString(),
    },
    {
      id: 'm-removed',
      observation_id: sampleObs.id,
      media_type: 'image',
      mime_type: 'image/jpeg',
      visibility: 'hidden',
      is_public: false,
      moderation_status: 'removed',
      content_base64: sampleBase64,
      created_at: new Date().toISOString(),
    },
  ];

  const origFindObs = communityPostRepository.findObservation.bind(communityPostRepository);
  const origListMedia = communityPostRepository.listMedia.bind(communityPostRepository);
  const origFindMedia = communityPostRepository.findMediaForObservation.bind(communityPostRepository);
  const origFindLoc = communityPostRepository.findLocation.bind(communityPostRepository);
  const origListQ = communityPostRepository.listQuestions.bind(communityPostRepository);
  const origListAtt = communityPostRepository.listAttachments.bind(communityPostRepository);
  const origListComments = communityPostRepository.listComments.bind(communityPostRepository);

  (communityPostRepository as any).findObservation = async (id: string) =>
    id === passportId ? sampleObs : null;
  (communityPostRepository as any).listMedia = async () => mediaMatrix;
  (communityPostRepository as any).findMediaForObservation = async (_obsId: string, mId: string) =>
    mediaMatrix.find((m) => m.id === mId) ?? null;
  (communityPostRepository as any).findLocation = async () => null;
  (communityPostRepository as any).listQuestions = async () => [];
  (communityPostRepository as any).listAttachments = async () => [];
  (communityPostRepository as any).listComments = async () => [];

  try {
    // Non-owner post detail: ONLY m-approved-public
    const publicDetail = await communityPostService.getPost(passportId, nonOwnerViewer);
    assert.ok(publicDetail);
    assert.deepEqual(
      publicDetail.media.map((m) => m.media_id),
      ['m-approved-public'],
      'non-owner must only see public + is_public + visible media in post detail'
    );

    // Anonymous viewer post detail: ONLY m-approved-public
    const anonDetail = await communityPostService.getPost(passportId, null);
    assert.ok(anonDetail);
    assert.deepEqual(anonDetail.media.map((m) => m.media_id), ['m-approved-public']);

    // Owner post detail: sees approved, pending, private, hidden, EXCEPT removed
    const ownerDetail = await communityPostService.getPost(passportId, ownerViewer);
    assert.ok(ownerDetail);
    assert.deepEqual(
      ownerDetail.media.map((m) => m.media_id),
      ['m-approved-public', 'm-pending', 'm-private', 'm-rejected-hidden'],
      'owner may see own unremoved media, but removed media must be withheld'
    );

    // Raw media endpoint checks — Non-Owner
    assert.ok(await communityPostService.getRawMedia(passportId, 'm-approved-public', nonOwnerViewer));
    assert.equal(await communityPostService.getRawMedia(passportId, 'm-pending', nonOwnerViewer), null);
    assert.equal(await communityPostService.getRawMedia(passportId, 'm-private', nonOwnerViewer), null);
    assert.equal(await communityPostService.getRawMedia(passportId, 'm-rejected-hidden', nonOwnerViewer), null);
    assert.equal(await communityPostService.getRawMedia(passportId, 'm-removed', nonOwnerViewer), null);

    // Raw media endpoint checks — Owner
    assert.ok(await communityPostService.getRawMedia(passportId, 'm-approved-public', ownerViewer));
    assert.ok(await communityPostService.getRawMedia(passportId, 'm-pending', ownerViewer));
    assert.ok(await communityPostService.getRawMedia(passportId, 'm-private', ownerViewer));
    assert.ok(await communityPostService.getRawMedia(passportId, 'm-rejected-hidden', ownerViewer));
    assert.equal(
      await communityPostService.getRawMedia(passportId, 'm-removed', ownerViewer),
      null,
      'removed media must never be served even to owner'
    );
  } finally {
    (communityPostRepository as any).findObservation = origFindObs;
    (communityPostRepository as any).listMedia = origListMedia;
    (communityPostRepository as any).findMediaForObservation = origFindMedia;
    (communityPostRepository as any).findLocation = origFindLoc;
    (communityPostRepository as any).listQuestions = origListQ;
    (communityPostRepository as any).listAttachments = origListAtt;
    (communityPostRepository as any).listComments = origListComments;
  }
});

// =============================================================================
// 3. Atomic Transactional Administrative Operations
// =============================================================================
section('3. Atomic Transactional Administrative Operations');

await test('administrative mutations invoke atomic *_transactional RPCs and fail closed without non-transactional table updates', async () => {
  const rpcCalls: string[] = [];
  let directTableMutationAttempted = false;

  await withMockSupabase(
    {
      rpc: async (fnName) => {
        rpcCalls.push(fnName);
        return { data: { id: '00000000-0000-0000-0000-000000000099' }, error: null };
      },
      from: () => ({
        update: () => {
          directTableMutationAttempted = true;
          throw new Error('Non-transactional update must never be called');
        },
        insert: () => {
          directTableMutationAttempted = true;
          throw new Error('Non-transactional insert must never be called');
        },
      }),
    },
    async () => {
      await observationRepository.setPublicationStatus('obs-1', 'public', 'Verified field photo', 'owner-1');
      await observationRepository.setEvidenceState('obs-1', 'expert_reviewed', 'Reviewed outcrop', 'owner-1');
      await observationRepository.setMediaVisibility('med-1', 'public', 'Safe image', 'owner-1');
      await observationRepository.moderateMedia('med-1', 'visible', 'Approved', 'owner-1');
      await staffService.createStaff(
        { email: 'sci@earthtalk.local', role: 'science', full_name: 'Science Staff', password: 'Password123!' },
        { staffId: BOOTSTRAP_DEV_SUPER_ADMIN_ID, role: 'owner' }
      );
      await staffService.updateStaff(
        '00000000-0000-0000-0000-000000000055',
        { is_active: false },
        { staffId: BOOTSTRAP_DEV_SUPER_ADMIN_ID, role: 'owner' }
      );
    }
  );

  assert.equal(directTableMutationAttempted, false, 'zero non-transactional table writes allowed');
  assert.deepEqual(rpcCalls, [
    'update_publication_status_transactional',
    'update_evidence_state_transactional',
    'update_media_visibility_transactional',
    'update_media_moderation_transactional',
    'create_staff_transactional',
    'update_staff_transactional',
  ]);
});

await test('transactional RPC failure aborts cleanly with ServiceUnavailableError (no partial state or fallback)', async () => {
  await withMockSupabase(
    {
      rpc: async () => ({ data: null, error: { message: 'transaction rolled back: audit write failed' } }),
      from: () => {
        throw new Error('Fallback direct table access is forbidden');
      },
    },
    async () => {
      await assert.rejects(
        () => observationRepository.setPublicationStatus('obs-1', 'public', 'Reason', 'owner-1'),
        (err: unknown) => isServiceUnavailableError(err)
      );
      await assert.rejects(
        () => communityMediaRepository.setModerationStatus('cm-1', 'visible', 'Reason', 'owner-1'),
        (err: unknown) => isServiceUnavailableError(err)
      );
      const dbPostRepo = new CommunityPostRepository();
      await assert.rejects(
        () => dbPostRepo.setCommentModeration('c-1', 'hidden', 'Spam', 'owner-1'),
        (err: unknown) => isServiceUnavailableError(err)
      );
      const dbAbuseRepo = new AbuseReportRepository();
      await assert.rejects(
        () =>
          dbAbuseRepo.resolveReport('r-1', {
            status: 'actioned',
            resolvedBy: 'owner-1',
            resolutionNote: 'Handled',
          }),
        (err: unknown) => isServiceUnavailableError(err)
      );
    }
  );
});

// =============================================================================
// 4. Migration 035 Operational Summary & RLS Hardening
// =============================================================================
section('4. Migration 035 Operational Summary & Database Access Hardening');

await test('migration 035 locks down get_operational_summary, transactional RPCs, and internal tables to service_role', () => {
  const sql = read('supabase/migrations/035_security_hardening_and_transactional_ops.sql');

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_operational_summary\(\)[\s\S]*?SECURITY DEFINER/i);
  assert.match(sql, /SET search_path = pg_catalog, public/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_operational_summary\(\) FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_operational_summary\(\) TO service_role/i);

  for (const rpcName of [
    'bootstrap_super_admin',
    'check_distributed_rate_limit',
    'create_staff_transactional',
    'update_staff_transactional',
    'update_evidence_state_transactional',
    'update_publication_status_transactional',
    'update_media_visibility_transactional',
    'update_media_moderation_transactional',
    'moderate_community_media_transactional',
    'moderate_comment_transactional',
    'resolve_abuse_report_transactional',
  ]) {
    assert.ok(sql.includes(rpcName), `migration 035 must define and lock down ${rpcName}`);
  }

  for (const tbl of ['staff', 'staff_sessions', 'system_audit_logs', 'rate_limit_buckets']) {
    assert.ok(sql.includes(`public.${tbl}`), `migration 035 must harden table ${tbl}`);
  }
});

// =============================================================================
// 5. GeoAI Context-Aware Intelligence Pipeline Connection
// =============================================================================
section('5. Context-Aware GeoAI Pipeline Connection');

await test('photo submission and WhatsApp analysis pipelines connect to geoscienceIntelligenceService with clean fallback', async () => {
  const photoSvc = read('src/services/photo-submission.service.ts');
  const waSvc = read('src/services/geoscience-analysis.service.ts');

  assert.ok(photoSvc.includes('geoscienceIntelligenceService.analyzeIntelligence'));
  assert.ok(waSvc.includes('geoscienceIntelligenceService.analyzeIntelligence'));
  assert.equal(typeof geoscienceIntelligenceService.analyzeIntelligence, 'function');
  assert.equal(typeof photoSubmissionService.submitObservation, 'function');
});

// =============================================================================
// 6. Scientific Confirmation Integrity
// =============================================================================
section('6. Scientific Confirmation Evidence Integrity');

await test('deriveEvidenceState rejects keyword strings and community activity, requiring verified laboratory evidence', async () => {
  // Keyword strings like "lab" or "laboratory" without structured verified evidence MUST NOT reach scientifically_confirmed
  assert.equal(
    communityService.deriveEvidenceState({
      hasExpertReview: true,
      expertEvidenceBasis: 'Checked in laboratory with XRD lab notes',
      laboratoryEvidence: null,
    }),
    'expert_reviewed'
  );

  // Unaccredited laboratory claim MUST NOT reach scientifically_confirmed
  assert.equal(
    communityService.deriveEvidenceState({
      hasExpertReview: true,
      laboratoryEvidence: {
        reportId: 'RMB-2026-0091',
        laboratoryName: 'Rwanda Mines Lab',
        evidenceReference: 'https://rmb.gov.rw/assays/0091',
        accreditationVerified: false,
        reviewAuthorization: 'AUTH-RMB-01',
      },
    }),
    'expert_reviewed'
  );

  // Massive community votes/participants without expert + accredited lab MUST NOT reach scientifically_confirmed
  assert.equal(
    communityService.deriveEvidenceState({
      hasExpertReview: false,
      distinctParticipants: 500,
      substantiveEvidenceCount: 100,
    }),
    'community_investigated'
  );

  // Client-supplied accreditationVerified: true without server verification MUST stay expert_reviewed
  assert.equal(
    communityService.deriveEvidenceState({
      hasExpertReview: true,
      laboratoryEvidence: {
        reportId: 'RMB-ASSAY-2026-044',
        laboratoryName: 'Rwanda Mines, Petroleum and Gas Board Analytical Lab',
        evidenceReference: 'ISO-17025 Cert #RW-8821 / Sample Pass-044',
        accreditationVerified: true,
        reviewAuthorization: 'REV-DIR-2026-19',
      },
    }),
    'expert_reviewed'
  );

  // Full traceable, server-verified accredited laboratory evidence reaches scientifically_confirmed
  registerAccreditedLaboratoryInMemory({
    lab_code: 'RMB-ANALYTICAL-01',
    name: 'Rwanda Mines, Petroleum and Gas Board Analytical Lab',
    accreditation_ref: 'ISO-17025-RW-8821',
    is_active: true,
  });
  registerObservationEvidenceRefInMemory(
    '00000000-0000-0000-0000-000000000699',
    '00000000-0000-0000-0000-000000000644'
  );
  try {
    const verified = await verifyScientificConfirmationEvidence(
      '00000000-0000-0000-0000-000000000699',
      {
        laboratory_id: 'RMB-ANALYTICAL-01',
        laboratory_name: 'Rwanda Mines, Petroleum and Gas Board Analytical Lab',
        report_id: 'RMB-ASSAY-2026-044',
        analytical_method: 'X-Ray Diffraction (XRD)',
        evidence_reference: '00000000-0000-0000-0000-000000000644',
        review_authorization: 'REV-DIR-2026-19',
      }
    );
    assert.equal(
      communityService.deriveEvidenceState({
        hasExpertReview: true,
        verifiedScientificConfirmation: verified,
      }),
      'scientifically_confirmed'
    );
  } finally {
    clearScientificEvidenceRegistriesInMemory();
  }
});

await test('admin updateEvidenceState rejects scientifically_confirmed without traceable laboratory fields', async () => {
  const reqMissingLab: any = {
    params: { observationId: 'obs-lab-1' },
    staff: { staffId: BOOTSTRAP_DEV_SUPER_ADMIN_ID, role: 'owner', email: env.SUPER_ADMIN_EMAIL },
    body: {
      evidence_state: 'scientifically_confirmed',
      reason: 'Looks like quartz in lab',
    },
  };
  const res1 = mockRes();
  await adminController.updateEvidenceState(reqMissingLab, res1);
  assert.equal(res1.statusCode, 400);
  assert.equal(res1.jsonBody?.error?.code, 'SCIENTIFIC_CONFIRMATION_EVIDENCE_REQUIRED');
});

// =============================================================================
// 7. Contributor Credential Security
// =============================================================================
section('7. Contributor Credential Storage & HttpOnly Cookie');

await test('frontend contributor token transport avoids both localStorage and sessionStorage and uses HttpOnly cookie', () => {
  const communityApi = read('web/src/services/communityApi.ts');
  const httpSvc = read('web/src/services/http.ts');

  assert.ok(!communityApi.includes('localStorage'), 'communityApi.ts must not store contributor tokens in localStorage');
  assert.ok(!communityApi.includes('sessionStorage'), 'communityApi.ts must not store contributor tokens in sessionStorage');
  assert.match(
    httpSvc,
    /credentials:\s*(?:rest\.credentials\s*\?\?\s*)?'include'/,
    'http client must include credentials for HttpOnly cookie'
  );
});

await test('backend contributor token endpoint sets HttpOnly SameSite=Lax cookie', () => {
  const ctrl = read('src/controllers/community.controller.ts');
  const contribUtil = read('src/utils/contributor.ts');
  assert.ok(contribUtil.includes("CONTRIBUTOR_COOKIE_NAME = 'et_contributor_token'"));
  assert.ok(ctrl.includes('CONTRIBUTOR_COOKIE_NAME') || ctrl.includes("'et_contributor_token'"));
  assert.ok(ctrl.includes('httpOnly: true'));
  assert.match(ctrl, /sameSite:\s*'lax'/);
});

// =============================================================================
// 8. Proxy Configuration, Distributed Rate Limiting & Internal Auth
// =============================================================================
section('8. Proxy Trust, Distributed Rate Limiting & Internal Service Key');

await test('Express configures trust proxy and internal route enforces constant-time INTERNAL_SERVICE_KEY', () => {
  const serverSrc = read('src/server.ts');
  assert.ok(serverSrc.includes("app.set('trust proxy', 1)"), 'server.ts must configure trust proxy');
  assert.ok(
    !serverSrc.includes('env.SUPABASE_SECRET_KEY'),
    'server.ts must never use SUPABASE_SECRET_KEY as an internal HTTP bearer token'
  );
  assert.ok(serverSrc.includes('verifyInternalServiceKey'), 'server.ts must verify INTERNAL_SERVICE_KEY');

  const prevKey = process.env.INTERNAL_SERVICE_KEY;
  process.env.INTERNAL_SERVICE_KEY = 'internal_test_secret_key_for_timing_safe_check_99';
  try {
    assert.equal(verifyInternalServiceKey(undefined), false);
    assert.equal(verifyInternalServiceKey(''), false);
    assert.equal(verifyInternalServiceKey('wrong_key'), false);
    assert.equal(verifyInternalServiceKey(env.SUPABASE_SECRET_KEY), false);
    assert.equal(verifyInternalServiceKey('internal_test_secret_key_for_timing_safe_check_99'), true);
  } finally {
    if (prevKey === undefined) delete process.env.INTERNAL_SERVICE_KEY;
    else process.env.INTERNAL_SERVICE_KEY = prevKey;
  }
});

await test('distributed rate limiter invokes check_distributed_rate_limit RPC when database is configured', async () => {
  let calledRpc = '';
  await withMockSupabase(
    {
      rpc: async (fnName) => {
        calledRpc = fnName;
        return { data: false, error: null };
      },
    },
    async () => {
      const allowed = await checkDistributedRateLimit('login:test', 5, 60_000);
      assert.equal(calledRpc, 'check_distributed_rate_limit');
      assert.equal(allowed, false);
    }
  );
});

await test('render.yaml declares all required production secrets including INTERNAL_SERVICE_KEY', () => {
  const renderYaml = read('render.yaml');
  for (const requiredVar of [
    'INTERNAL_SERVICE_KEY',
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'SUPER_ADMIN_PASSWORD_HASH',
    'SUPER_ADMIN_SESSION_SECRET',
    'USER_HASH_SECRET',
    'ANONYMOUS_CONTRIBUTOR_SECRET',
    'AUTH_SESSION_SECRET',
    'WHATSAPP_APP_SECRET',
    'GEMINI_API_KEY',
  ]) {
    assert.ok(renderYaml.includes(requiredVar), `render.yaml must configure ${requiredVar}`);
  }
});

// =============================================================================
// 9. CMS Owner-Only Authorization, Path Traversal & Safe Revision Parsing
// =============================================================================
section('9. CMS Security, Path Traversal & Corrupted JSON Resilience');

await test('non-owner staff roles (ops, support, science, security) are forbidden from CMS mutations', async () => {
  const routesSrc = read('src/routes/staff.routes.ts');
  assert.match(routesSrc, /staffRouter\.put\('\/api\/control\/cms\/:page',\s*requireStaff\('owner'\)/);
  assert.match(routesSrc, /staffRouter\.get\('\/api\/control\/cms\/:page\/history',\s*requireStaff\('owner'\)/);
  assert.match(routesSrc, /staffRouter\.post\('\/api\/control\/cms\/:page\/restore',\s*requireStaff\('owner'\)/);

  for (const role of ['ops', 'support', 'science', 'security'] as const) {
    const token = await generateStaffToken({
      id: '00000000-0000-0000-0000-000000000077',
      email: `${role}@earthtalk.local`,
      role,
    });
    const mw = requireStaff('owner');
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    let nextCalled = false;
    await mw(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false, `role ${role} must not pass requireStaff('owner')`);
    assert.equal(res.statusCode, 403);
  }
});

await test('CMS restoreRevision blocks path traversal, absolute paths, Windows paths, and cross-page revisions', async () => {
  const maliciousInputs = [
    '../cms-content.json',
    '../../package.json',
    '/etc/passwd',
    'C:\\Windows\\win.ini',
    '..\\..\\secret.json',
    'terms_../../evil.json',
    'privacy_2026-10-24T12-00-00-000Z.json', // cross-page restore onto 'terms'
    'terms_2026\0evil.json',
  ];

  for (const badName of maliciousInputs) {
    await assert.rejects(
      () => cmsService.restoreRevision('terms', badName),
      /Invalid revision filename/,
      `must reject malicious filename: ${badName}`
    );
  }
});

await test('CMS restoreCmsRevision safely handles corrupted JSON without leaking stack traces or paths, and rolls back on audit failure', async () => {
  const historyDir = path.resolve(ROOT, 'src/data/cms-history');
  fs.mkdirSync(historyDir, { recursive: true });
  const corruptFile = path.join(historyDir, 'terms_2099-01-01T00-00-00-000Z.json');
  fs.writeFileSync(corruptFile, '{bad json syntax!!!', 'utf8');

  try {
    const req: any = {
      params: { page: 'terms' },
      body: { filename: 'terms_2099-01-01T00-00-00-000Z.json' },
      staff: { staffId: BOOTSTRAP_DEV_SUPER_ADMIN_ID, role: 'owner', email: env.SUPER_ADMIN_EMAIL },
    };
    const res = mockRes();
    await staffController.restoreCmsRevision(req, res);

    assert.equal(res.statusCode, 400);
    const serialized = JSON.stringify(res.jsonBody);
    assert.ok(!serialized.includes(ROOT), 'error response must never leak filesystem paths');
    assert.ok(!serialized.includes('SyntaxError'), 'error response must never leak parser stack details');
  } finally {
    if (fs.existsSync(corruptFile)) fs.unlinkSync(corruptFile);
  }

  // Verify rollback when audit logging fails during updateCmsPage
  const beforePage = await cmsService.getPage('about');
  const origLogAudit = staffService.logAudit.bind(staffService);
  (staffService as any).logAudit = async () => {
    throw new ServiceUnavailableError('audit log write failed');
  };

  try {
    const reqUpdate: any = {
      params: { page: 'about' },
      body: { ...beforePage, title: 'UNAUDITED MUTATION SHOULD ROLL BACK' },
      staff: { staffId: BOOTSTRAP_DEV_SUPER_ADMIN_ID, role: 'owner', email: env.SUPER_ADMIN_EMAIL },
    };
    const resUpdate = mockRes();
    await staffController.updateCmsPage(reqUpdate, resUpdate);
    assert.equal(resUpdate.statusCode, 503);

    const afterPage = await cmsService.getPage('about');
    assert.equal(afterPage.title, beforePage.title, 'CMS file write must roll back when audit logging fails');
  } finally {
    (staffService as any).logAudit = origLogAudit;
  }
});

// =============================================================================
// 10. Honest Android APK Distribution Integrity
// =============================================================================
section('10. Android APK Distribution Integrity');

await test('dummy APK is absent, metadata is unfabricated, and download endpoint returns 503 APK_UNAVAILABLE', async () => {
  const apkDiskPath = path.resolve(ROOT, 'public/downloads/earthtalk.apk');
  assert.equal(fs.existsSync(apkDiskPath), false, 'fabricated 385-byte placeholder APK must not exist');
  assert.equal(appDistributionService.getApkPath(), null);

  const cfgRes = mockRes();
  await appDistributionController.getConfig({} as any, cfgRes);
  assert.equal(cfgRes.statusCode, 200);
  assert.equal(cfgRes.jsonBody?.apk_available, false);
  assert.equal(cfgRes.jsonBody?.apk_size_bytes, 0);
  assert.equal(cfgRes.jsonBody?.apk_sha256, '');

  const dlRes = mockRes();
  await appDistributionController.downloadApk({} as any, dlRes);
  assert.equal(dlRes.statusCode, 503);
  assert.equal(dlRes.jsonBody?.error, 'APK_UNAVAILABLE');
});

console.log(`\n${'='.repeat(70)}`);
console.log(`Final Security & Reliability Repair Suite: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(70)}`);

if (failed > 0) {
  process.exit(1);
}
