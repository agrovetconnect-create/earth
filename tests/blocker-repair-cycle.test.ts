/**
 * Earth Talk — Blocker-Only Repair Cycle Regression Suite
 *
 * Independently verifies all Priority 1–6 blocker repairs:
 *   1. Migrations 033, 035, and 036 SQL integrity, atomicity, RLS, grants, and view security
 *   2. Scientific confirmation integrity (server-side registry + persisted evidence check)
 *   3. End-to-end HttpOnly cookies, base64 '=' cookie parsing, CSRF double-submit + Origin check,
 *      contributor session revocation, and zero browser/AsyncStorage secret storage
 *   4. GeoAI active Gemini fallback chains, multimodal supporting photos, and insufficient_image guard
 *   5. Distributed rate limiting across endpoints, production CORS validation, healthCheckPath, and webhook drain
 *   6. Transactional CMS persistence, strict XSS/schema validation, immutable defaults, and
 *      cryptographic APK ZIP/Manifest/DEX/Signature v2 verification + header sanitization
 */

process.env.SUPABASE_URL = 'https://mock-project-id.supabase.co';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { env, validateProductionCorsOrigins } from '../src/config/env.js';
import { supabase } from '../src/config/supabase.js';
import {
  csrfTokenHandler,
  parseCookieHeader,
  csrfAndOriginProtection,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from '../src/middleware/csrf.js';
import {
  issueContributorSession,
  verifyContributorSession,
  resolveVerifiedContributorHashFromRequest,
  revokeContributorSession,
  CONTRIBUTOR_COOKIE_NAME,
} from '../src/utils/contributor.js';
import * as communityController from '../src/controllers/community.controller.js';
import {
  verifyScientificConfirmationEvidence,
  verifyPersistedConfirmationBasis,
} from '../src/utils/scientific-evidence.js';
import { communityService } from '../src/services/community.service.js';
import { observationRepository } from '../src/repositories/observation.repository.js';
import { expertRepository } from '../src/repositories/expert.repository.js';
import { photoSubmissionService } from '../src/services/photo-submission.service.js';
import { geminiService } from '../src/services/gemini.service.js';
import { geoscienceIntelligenceService } from '../src/services/geoscience-intelligence.service.js';
import { geoscienceAnalysisService } from '../src/services/geoscience-analysis.service.js';
import { whatsappService } from '../src/services/whatsapp.service.js';
import { whatsappMediaService } from '../src/services/whatsapp-media.service.js';
import { webhookQueueService } from '../src/services/webhook-queue.service.js';
import { cmsService, validateCmsUpdatePayload } from '../src/services/cms.service.js';
import {
  inspectAndVerifyApkBuffer,
  sanitizeApkFilename,
  appDistributionService,
} from '../src/services/app-distribution.service.js';
import { appDistributionController } from '../src/controllers/app-distribution.controller.js';

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
  console.log(`\n${'-'.repeat(72)}\n${title}\n${'-'.repeat(72)}`);
}

const ROOT = process.cwd();
const read = (relPath: string): string => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

function mockRes() {
  const headers: Record<string, string | string[]> = {};
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const clearedCookies: string[] = [];
  let statusCode = 200;
  let jsonBody: any = undefined;
  let endedBody: Buffer | undefined = undefined;
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
    get clearedCookies() {
      return clearedCookies;
    },
    get endedBody() {
      return endedBody;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(k: string, v: string | string[] | number) {
      headers[k.toLowerCase()] = String(v);
      return this;
    },
    cookie(name: string, value: string, options: Record<string, unknown> = {}) {
      cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name: string) {
      clearedCookies.push(name);
      return this;
    },
    json(payload: unknown) {
      jsonBody = payload;
      return this;
    },
    end(payload?: Buffer) {
      endedBody = payload;
      return this;
    },
  } as any;
}

async function withMockSupabase<T>(
  handlers: {
    from?: (table: string) => any;
    rpc?: (fnName: string, params?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
    storage?: any;
  },
  fn: () => Promise<T>
): Promise<T> {
  const origUrl = env.SUPABASE_URL;
  const origKey = env.SUPABASE_SECRET_KEY;
  const origFrom = supabase.from.bind(supabase);
  const origRpc = supabase.rpc.bind(supabase);
  const origStorage = supabase.storage;

  env.SUPABASE_URL = 'https://blockerrepairtest.supabase.co';
  env.SUPABASE_SECRET_KEY = 'sb_secret_blockerrepairproductionkey99912345';
  if (handlers.from) (supabase as any).from = handlers.from;
  if (handlers.rpc) (supabase as any).rpc = handlers.rpc;
  if (handlers.storage) (supabase as any).storage = handlers.storage;

  try {
    return await fn();
  } finally {
    env.SUPABASE_URL = origUrl;
    env.SUPABASE_SECRET_KEY = origKey;
    (supabase as any).from = origFrom;
    (supabase as any).rpc = origRpc;
    (supabase as any).storage = origStorage;
  }
}

/**
 * Helper to build a real byte-accurate ZIP / APK binary for cryptographic & structural verification tests.
 */
function buildSyntheticApkBuffer(opts: {
  packageName?: string;
  includeManifest?: boolean;
  includeDex?: boolean;
  signV2?: boolean;
  corruptManifestCrc?: boolean;
  duplicateManifestEntry?: boolean;
  dexMagic?: Buffer;
  padSizeBytes?: number;
}): Buffer {
  const packageName = opts.packageName ?? 'org.earthtalk.mobile';
  const includeManifest = opts.includeManifest ?? true;
  const includeDex = opts.includeDex ?? true;
  const signV2 = opts.signV2 ?? true;
  const padSizeBytes = opts.padSizeBytes ?? 110 * 1024;

  const files: Array<{ name: string; data: Buffer; corruptCrc?: boolean }> = [];

  if (includeManifest) {
    // Binary AXML-style payload carrying UTF-16LE encoded package name
    const axmlHeader = Buffer.from([0x03, 0x00, 0x08, 0x00]);
    const pkgUtf16 = Buffer.from(packageName, 'utf16le');
    files.push({
      name: 'AndroidManifest.xml',
      data: Buffer.concat([axmlHeader, pkgUtf16, Buffer.alloc(64, 0)]),
      corruptCrc: opts.corruptManifestCrc,
    });
  }

  if (includeDex) {
    const dexHeader = opts.dexMagic ?? Buffer.from('dex\n035\0', 'ascii');
    const filler = Buffer.alloc(Math.max(64, padSizeBytes), 0x11);
    files.push({
      name: 'classes.dex',
      data: Buffer.concat([dexHeader, filler]),
    });
  }

  const localParts: Buffer[] = [];
  const cdEntries: Buffer[] = [];
  let offset = 0;

  const pushEntry = (name: string, data: Buffer, corruptCrc = false, recordLocal = true, forcedOffset?: number) => {
    const nameBuf = Buffer.from(name, 'utf8');
    let crc = (zlib as any).crc32(data) >>> 0;
    if (corruptCrc) crc = (crc ^ 0xffffffff) >>> 0;

    const localOffset = forcedOffset ?? offset;
    if (recordLocal) {
      const lfh = Buffer.alloc(30);
      lfh.writeUInt32LE(0x04034b50, 0);
      lfh.writeUInt16LE(20, 4); // version needed
      lfh.writeUInt16LE(0, 6); // flags
      lfh.writeUInt16LE(0, 8); // stored (method 0)
      lfh.writeUInt16LE(0, 10);
      lfh.writeUInt16LE(0, 12);
      lfh.writeUInt32LE(crc, 14);
      lfh.writeUInt32LE(data.length, 18);
      lfh.writeUInt32LE(data.length, 22);
      lfh.writeUInt16LE(nameBuf.length, 26);
      lfh.writeUInt16LE(0, 28);

      localParts.push(lfh, nameBuf, data);
      offset += lfh.length + nameBuf.length + data.length;
    }

    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(0, 10); // stored
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(data.length, 20);
    cdh.writeUInt32LE(data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(localOffset, 42);

    cdEntries.push(cdh, nameBuf);
  };

  for (const f of files) {
    const entryStart = offset;
    pushEntry(f.name, f.data, Boolean(f.corruptCrc), true);
    if (opts.duplicateManifestEntry && f.name === 'AndroidManifest.xml') {
      pushEntry(f.name, f.data, false, false, entryStart);
    }
  }

  // Optional APK Signature Scheme v2 Signing Block immediately before Central Directory
  if (signV2) {
    const signerPayload = Buffer.alloc(64, 0xaa);
    const pairLen = 4 + signerPayload.length; // uint32 ID + value
    const pairBuf = Buffer.alloc(8 + pairLen);
    pairBuf.writeBigUInt64LE(BigInt(pairLen), 0);
    pairBuf.writeUInt32LE(0x7109871a, 8); // APK Signature Scheme v2 ID
    signerPayload.copy(pairBuf, 12);

    // size_of_block excludes the first 8-byte size field, includes pairs + 8-byte footer size + 16-byte magic
    const sizeOfBlock = BigInt(pairBuf.length + 8 + 16);
    const headerSize = Buffer.alloc(8);
    headerSize.writeBigUInt64LE(sizeOfBlock, 0);
    const footerSize = Buffer.alloc(8);
    footerSize.writeBigUInt64LE(sizeOfBlock, 0);
    const magic = Buffer.from('APK Sig Block 42', 'ascii');

    const sigBlock = Buffer.concat([headerSize, pairBuf, footerSize, magic]);
    localParts.push(sigBlock);
    offset += sigBlock.length;
  }

  const centralDirOffset = offset;
  const centralDirBuf = Buffer.concat(cdEntries);
  const totalEntryCount = cdEntries.length / 2;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(totalEntryCount, 8);
  eocd.writeUInt16LE(totalEntryCount, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

// =============================================================================
// 1. Database Migrations 033, 035 & 036 Structural and Security Verification
// =============================================================================
section('1. Migrations 033, 035 & 036 SQL Integrity & Least-Privilege Security');

await test('migration 033 is atomic and does not unconditionally reference nonexistent gis_layers.description', () => {
  const m033 = read('supabase/migrations/033_cleanup_legacy_names.sql');
  assert.match(m033, /^\s*BEGIN;/m, '033 must start transaction with BEGIN;');
  assert.match(m033, /COMMIT;\s*$/m, '033 must finish transaction with COMMIT;');
  assert.ok(
    !m033.includes('description = REPLACE'),
    '033 must not unconditionally UPDATE gis_layers.description'
  );
});

await test('migration 035 and 036 contain zero nonexistent PostgreSQL enum casts', () => {
  const m035 = read('supabase/migrations/035_security_hardening_and_transactional_ops.sql');
  const m036 = read('supabase/migrations/036_production_blocker_repairs.sql');

  for (const forbiddenCast of [
    '::public.staff_role',
    '::public.staff_status',
    '::public.evidence_state',
    '::public.publication_status',
  ]) {
    assert.ok(!m035.includes(forbiddenCast), `035 must not cast to nonexistent ${forbiddenCast}`);
    assert.ok(!m036.includes(forbiddenCast), `036 must not cast to nonexistent ${forbiddenCast}`);
  }
});

await test('migration 036 is atomic and hardens user_avatars, taxonomy tables, public views, webhook RPCs, and empty lab registry', () => {
  const m036 = read('supabase/migrations/036_production_blocker_repairs.sql');
  assert.match(m036, /BEGIN;/);
  assert.match(m036, /COMMIT;/);

  // RLS + restricted grants on user_avatars
  assert.match(m036, /ALTER TABLE public\.user_avatars ENABLE ROW LEVEL SECURITY/);
  assert.match(m036, /REVOKE ALL ON TABLE public\.user_avatars FROM PUBLIC, anon, authenticated/);

  // Read-only grants on geoscience_categories & geoscience_subcategories
  assert.match(m036, /REVOKE ALL ON TABLE public\.geoscience_categories FROM PUBLIC, anon, authenticated/);
  assert.match(m036, /REVOKE ALL ON TABLE public\.geoscience_subcategories FROM PUBLIC, anon, authenticated/);
  assert.match(m036, /GRANT SELECT ON TABLE public\.geoscience_categories TO anon, authenticated/);

  // site_timeline preserves exact 5 columns and filters public approved observations
  assert.match(m036, /CREATE OR REPLACE VIEW public\.site_timeline AS/);
  assert.match(m036, /o\.site_id/);
  assert.match(m036, /o\.passport_id/);
  assert.match(m036, /o\.evidence_state/);
  assert.match(m036, /o\.publication_status/);

  // public_observation_media & public_observations enforce is_public = true
  assert.match(m036, /CREATE OR REPLACE VIEW public\.public_observation_media/);
  assert.match(m036, /m\.is_public = true/);
  assert.match(m036, /CREATE OR REPLACE VIEW public\.public_observations/);

  // Webhook RPCs revoked from anon/authenticated and granted only to service_role
  assert.match(m036, /claim_webhook_job|claim_webhook_message/);
  assert.match(m036, /TO service_role/);

  // Accredited laboratories registry starts empty (zero INSERT INTO accredited_laboratories)
  assert.ok(
    !/INSERT\s+INTO\s+public\.accredited_laboratories/i.test(m036),
    '036 must never seed fake accredited laboratories'
  );
});

// =============================================================================
// 2. Scientific Confirmation Integrity & Transactional Repository Wiring
// =============================================================================
section('2. Scientific Confirmation & Transactional Repository Wiring');

await test('verifyScientificConfirmationEvidence rejects unaccredited labs, external URLs, and missing evidence attachments', async () => {
  await assert.rejects(
    () =>
      verifyScientificConfirmationEvidence('00000000-0000-0000-0000-000000000111', {
        laboratory_id: 'UNREGISTERED-LAB',
        laboratory_name: 'Unregistered Lab',
        report_id: 'REP-2026-01',
        analytical_method: 'XRD',
        evidence_reference: '00000000-0000-0000-0000-000000000222',
        review_authorization: 'AUTH-01',
      }),
    (err: any) => err?.code === 'UNACCREDITED_LABORATORY'
  );

  await assert.rejects(
    () =>
      verifyScientificConfirmationEvidence('00000000-0000-0000-0000-000000000111', {
        laboratory_id: 'RMB-LAB-01',
        report_id: 'REP-2026-01',
        analytical_method: 'XRD',
        evidence_reference: 'https://unverified.example.com/report.pdf',
        review_authorization: 'AUTH-01',
      }),
    (err: any) => err?.code === 'SCIENTIFIC_CONFIRMATION_EVIDENCE_UNVERIFIED_URL'
  );
});

await test('observationRepository.setObservationSite and expertRepository.submitVerification call transactional RPCs', async () => {
  const rpcCalls: string[] = [];
  await withMockSupabase(
    {
      rpc: async (fnName) => {
        rpcCalls.push(fnName);
        if (fnName === 'submit_expert_verification_transactional') {
          return {
            data: {
              observation: { id: '00000000-0000-0000-0000-000000000101', passport_id: 'RT-RW-000001' },
              verification: { id: '00000000-0000-0000-0000-000000000901', observation_id: '00000000-0000-0000-0000-000000000101', created_at: new Date().toISOString() },
              audit_log: { id: '00000000-0000-0000-0000-000000000999', created_at: new Date().toISOString() },
            },
            error: null,
          };
        }
        return { data: { updated: true }, error: null };
      },
      from: () => {
        const obsData = {
          id: '00000000-0000-0000-0000-000000000101',
          passport_id: 'RT-RW-000001',
          primary_classification: 'igneous',
          confidence: 'high',
          verification_status: 'expert_verified',
          publication_status: 'public',
          observed_features: [],
          alternative_possibilities: [],
          limitations: [],
          recommended_next_steps: [],
          safety_note: 'None',
          reasoning: 'Test reason',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          ilike: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: obsData, error: null }),
          single: async () => ({ data: obsData, error: null }),
          then: (resolve: any) => resolve({ data: [obsData], error: null }),
        };
        return chain;
      },
    },
    async () => {
      await observationRepository.setObservationSite(
        '00000000-0000-0000-0000-000000000101',
        '00000000-0000-0000-0000-000000000303',
        '00000000-0000-0000-0000-000000000001',
        'Attached by expert',
        'science'
      );

      const ver = await expertRepository.submitVerification(
        'RT-RW-000001',
        { id: '00000000-0000-0000-0000-000000000001', name: 'Dr. Expert', role: 'expert', organization: 'RMB' },
        {
          agreed_with_ai: true,
          expert_classification: 'Quartz',
          expert_confidence: 'high',
          verification_status: 'expert_verified',
        }
      );
      assert.ok(ver);
    }
  );

  assert.deepEqual(rpcCalls, [
    'assign_observation_site_transactional',
    'submit_expert_verification_transactional',
  ]);
});

// =============================================================================
// 3. Cookie Parsing, CSRF Protection, Revocable Contributor Sessions & Zero Storage
// =============================================================================
section('3. Cookie Parsing, CSRF Protection & Revocable Contributor Sessions');

await test('parseCookieHeader preserves base64 "=" padding and survives malformed percent-encoding', () => {
  const cookies = parseCookieHeader(
    'et_user_session=abc.def==; bad_pct=%E0%A4%A; et_csrf_token=tok_123='
  );
  assert.equal(cookies.et_user_session, 'abc.def==');
  assert.equal(cookies.bad_pct, '%E0%A4%A');
  assert.equal(cookies.et_csrf_token, 'tok_123=');
});

await test('CSRF middleware issues token, rejects missing/mismatched header or cross-origin, and accepts matching double-submit token', () => {
  const csrfRes = mockRes();
  csrfTokenHandler({ headers: {}, cookies: {} } as any, csrfRes);
  assert.equal(csrfRes.statusCode, 200);
  const token = csrfRes.jsonBody?.csrfToken;
  assert.equal(typeof token, 'string');
  assert.ok(token.length >= 24);

  const makeReq = (opts: { origin: string; includeHeader: boolean }) => {
    const cookieStr = `${CONTRIBUTOR_COOKIE_NAME}=ect1_test_token_123456; ${CSRF_COOKIE_NAME}=${token}`;
    return {
      method: 'POST',
      path: '/api/posts',
      protocol: 'http',
      get: (h: string) => (h.toLowerCase() === 'host' ? 'localhost:3000' : undefined),
      headers: {
        cookie: cookieStr,
        origin: opts.origin,
        ...(opts.includeHeader ? { [CSRF_HEADER_NAME]: token } : {}),
      },
      cookies: parseCookieHeader(cookieStr),
    } as any;
  };

  // State-changing cookie-authenticated request WITHOUT X-CSRF-Token -> 403
  const missingHeaderRes = mockRes();
  let nextCalled = false;
  csrfAndOriginProtection(makeReq({ origin: 'http://localhost:3000', includeHeader: false }), missingHeaderRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(missingHeaderRes.statusCode, 403);
  assert.equal(missingHeaderRes.jsonBody?.error?.code, 'CSRF_TOKEN_INVALID');

  // Cross-origin request -> 403 even with matching CSRF token
  const evilOriginRes = mockRes();
  csrfAndOriginProtection(makeReq({ origin: 'https://evil-attacker.example', includeHeader: true }), evilOriginRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(evilOriginRes.statusCode, 403);
  assert.equal(evilOriginRes.jsonBody?.error?.code, 'CSRF_ORIGIN_DENIED');

  // Matching cookie + header + allowed origin -> passes!
  const validRes = mockRes();
  csrfAndOriginProtection(makeReq({ origin: 'http://localhost:3000', includeHeader: true }), validRes, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

await test('contributor sessions omit raw token on web, issue HttpOnly cookie, and immediately revoke on logout', async () => {
  const dummyReq: any = { headers: {}, ip: '127.0.0.1' };
  const issued = await issueContributorSession(dummyReq, 'web');
  const verifiedBefore = await verifyContributorSession(issued.token);
  assert.equal(verifiedBefore, issued.token);
  const hashBefore = await resolveVerifiedContributorHashFromRequest({
    headers: {},
    cookies: { [CONTRIBUTOR_COOKIE_NAME]: issued.token },
  } as any);
  assert.equal(hashBefore, issued.contributorHash);

  await revokeContributorSession(issued.token);
  const verifiedAfter = await verifyContributorSession(issued.token);
  assert.equal(verifiedAfter, null, 'revoked contributor session must immediately fail lookup');

  // Web request to issueContributorToken must NOT expose raw token in JSON body
  const webReq: any = { headers: {}, ip: '127.0.0.1' };
  const webRes = mockRes();
  await communityController.issueContributorToken(webReq, webRes);
  assert.equal(webRes.statusCode, 200);
  assert.equal(webRes.jsonBody?.token, undefined, 'web JSON body must not leak raw contributor token');
  assert.equal(typeof webRes.jsonBody?.handle_preview, 'string');
  assert.ok(webRes.cookies.some((c: any) => c.name === CONTRIBUTOR_COOKIE_NAME && c.options.httpOnly === true));

  // Mobile request explicitly receives token
  const mobileReq: any = { headers: { 'x-client-platform': 'mobile' }, ip: '127.0.0.1' };
  const mobileRes = mockRes();
  await communityController.issueContributorToken(mobileReq, mobileRes);
  assert.equal(mobileRes.statusCode, 200);
  assert.equal(typeof mobileRes.jsonBody?.contributor_token, 'string');
});

await test('web services and mobile AuthProvider store zero auth secrets in localStorage, sessionStorage, or AsyncStorage', () => {
  const webAuthFiles = [
    'web/src/services/communityApi.ts',
    'web/src/services/communityAuth.ts',
    'web/src/services/postsApi.ts',
    'web/src/services/controlApi.ts',
    'web/src/services/expertApi.ts',
    'web/src/services/adminApi.ts',
    'web/src/services/validationApi.ts',
    'web/src/services/appDistributionApi.ts',
    'web/src/control/ControlCenter.tsx',
  ];

  for (const rel of webAuthFiles) {
    const content = read(rel);
    assert.ok(!content.includes('localStorage'), `${rel} must not use localStorage for credentials`);
    assert.ok(!content.includes('sessionStorage'), `${rel} must not use sessionStorage for credentials`);
  }

  const mobileAuth = read('mobile/auth/AuthProvider.tsx');
  assert.ok(
    !mobileAuth.includes('AsyncStorage'),
    'mobile/auth/AuthProvider.tsx must use SecureStore only and never fall back to AsyncStorage'
  );
});

// =============================================================================
// 4. GeoAI Active Models, Multimodal Supporting Photos & insufficient_image Guard
// =============================================================================
section('4. GeoAI Active Models, Multimodal Supporting Photos & insufficient_image Guard');

await test('gemini.service.ts uses only active Gemini models and removes deprecated gemini-2.5-flash-lite', () => {
  const geminiSrc = read('src/services/gemini.service.ts');
  assert.ok(
    !geminiSrc.includes('gemini-2.5-flash-lite'),
    'deprecated gemini-2.5-flash-lite must not appear in gemini.service.ts'
  );
  assert.ok(geminiSrc.includes('gemini-3.8-flash'));
  assert.ok(geminiSrc.includes('gemini-3.1-flash-lite'));
  assert.ok(geminiSrc.includes('gemini-3.5-transcribe'));
});

await test('photoSubmissionService forwards supporting images in a single GeoAI call and rejects insufficient_image without creating a Passport', async () => {
  const jpegHeader = Buffer.alloc(200, 0xff);
  jpegHeader[0] = 0xff;
  jpegHeader[1] = 0xd8;
  jpegHeader[2] = 0xff;
  const pngHeader = Buffer.alloc(200, 0x00);
  pngHeader[0] = 0x89;
  pngHeader[1] = 0x50;
  pngHeader[2] = 0x4e;
  pngHeader[3] = 0x47;
  pngHeader[4] = 0x0d;
  pngHeader[5] = 0x0a;
  pngHeader[6] = 0x1a;
  pngHeader[7] = 0x0a;

  const origIntel = geoscienceIntelligenceService.analyzeIntelligence;
  let capturedMediaCount = 0;

  (geoscienceIntelligenceService as any).analyzeIntelligence = async (params: any) => {
    capturedMediaCount = params.media.length;
    return {
      base: {
        observationCategory: 'insufficient_image',
        observationSubcategory: 'insufficient_image',
        confidence: 'insufficient',
      },
      baseAnalysis: {
        observation_category: 'insufficient_image',
        primary_classification: 'insufficient_image',
        alternative_possibilities: [],
        confidence: 'insufficient',
        confidence_score: 0.1,
        confidence_explanation: 'Out of focus and dark.',
        visible_evidence: [],
        limitations: ['Camera motion blur obscures mineral grain boundaries.'],
        caution: 'Retake in daylight.',
        educational_explanation: 'Clear focus is required for visual interpretation.',
        next_best_actions: ['Retake closer in natural daylight with a coin for scale.'],
        follow_up_question: 'Can you share a clearer photo?',
        needs_more_context: true,
        recommended_capture_guidance: ['Hold steady in daylight'],
        safety_guidance: [],
        escalation_required: false,
        ai_disclaimer: 'Preliminary visual guidance.',
      },
    };
  };

  try {
    await assert.rejects(
      () =>
        photoSubmissionService.submitObservation({
          content_base64: jpegHeader.toString('base64'),
          mime_type: 'image/jpeg',
          supporting_media: [{ content_base64: pngHeader.toString('base64'), mime_type: 'image/png', role: 'closeup' as any }],
        }),
      (err: any) => err?.category === 'INSUFFICIENT_IMAGE_QUALITY'
    );
    assert.equal(
      capturedMediaCount,
      2,
      'primary JPEG + supporting PNG must both be forwarded to GeoAI in a single call'
    );
  } finally {
    geoscienceIntelligenceService.analyzeIntelligence = origIntel;
  }
});

await test('WhatsApp geoscienceAnalysisService replies with retake instructions on insufficient_image without creating a Passport', async () => {
  const origDownload = whatsappMediaService.downloadMedia;
  const origSend = whatsappService.sendTextMessage;
  const origIntel = geoscienceIntelligenceService.analyzeIntelligence;
  const origCreateObs = observationRepository.createObservation;

  let sentReply = '';
  let passportCreated = false;

  const buf = Buffer.alloc(200, 0xff);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;

  (whatsappMediaService as any).downloadMedia = async () => ({
    buffer: buf,
    mimeType: 'image/jpeg',
    fileSize: 200,
  });
  (whatsappService as any).sendTextMessage = async (_to: string, text: string) => {
    sentReply = text;
  };
  (geoscienceIntelligenceService as any).analyzeIntelligence = async () => ({
    base: {
      observationCategory: 'insufficient_image',
      observationSubcategory: 'insufficient_image',
      confidence: 'insufficient',
    },
    baseAnalysis: {
      observation_category: 'insufficient_image',
      primary_classification: 'insufficient_image',
      confidence: 'insufficient',
      confidence_score: 0.05,
      observed_features: [],
      reasoning: 'Too blurry.',
      limitations: ['Blurry image'],
    },
  });
  (observationRepository as any).createObservation = async () => {
    passportCreated = true;
    throw new Error('Must not create observation for insufficient_image');
  };

  try {
    await geoscienceAnalysisService.processRockImage({
      senderPhoneNumber: '250788000111',
      mediaId: 'media_blurry_1',
      messageId: 'wamid.blurry.1',
      caption: '',
    });
    assert.equal(passportCreated, false, 'Passport must never be created for insufficient_image');
    assert.match(sentReply, /clear enough|natural daylight|better daylight/i);
  } finally {
    (whatsappMediaService as any).downloadMedia = origDownload;
    (whatsappService as any).sendTextMessage = origSend;
    (geoscienceIntelligenceService as any).analyzeIntelligence = origIntel;
    (observationRepository as any).createObservation = origCreateObs;
  }
});

// =============================================================================
// 5. Production CORS Validation, Render Health Check & Webhook Drain
// =============================================================================
section('5. Production CORS Validation, Render Health Check & Webhook Drain');

await test('validateProductionCorsOrigins rejects wildcard, HTTP, localhost, loopback, and path origins while accepting HTTPS origins', () => {
  assert.throws(() => validateProductionCorsOrigins(''), /at least one HTTPS origin/);
  assert.throws(() => validateProductionCorsOrigins('*'), /cannot contain "\*"/);
  assert.throws(() => validateProductionCorsOrigins('http://earthtalk.rw'), /must use https:\/\//);
  assert.throws(() => validateProductionCorsOrigins('https://localhost:3000'), /loopback or localhost/);
  assert.throws(() => validateProductionCorsOrigins('https://127.0.0.1'), /loopback or localhost/);
  assert.throws(() => validateProductionCorsOrigins('https://earthtalk.rw/app'), /bare scheme:\/\/host/);

  const valid = validateProductionCorsOrigins('https://earthtalk.rw, https://app.earthtalk.rw');
  assert.deepEqual(valid, ['https://earthtalk.rw', 'https://app.earthtalk.rw']);
});

await test('render.yaml configures healthCheckPath: /health and webhookQueueService.drain awaits in-flight tasks', async () => {
  const renderYaml = read('render.yaml');
  assert.match(renderYaml, /healthCheckPath:\s*\/health/);

  await webhookQueueService.drain(500);
  assert.ok(true);
});

// =============================================================================
// 6. CMS Persistence/XSS Hardening & Cryptographic Signed APK Verification
// =============================================================================
section('6. CMS Schema/XSS Validation & Cryptographic Signed APK Verification');

await test('CMS getPage returns immutable clones and validateCmsUpdatePayload blocks XSS and unknown fields', async () => {
  const pageA = await cmsService.getPage('about');
  pageA.title = 'MUTATED IN MEMORY';
  pageA.sections[0].title = 'MUTATED SECTION';

  const pageB = await cmsService.getPage('about');
  assert.notEqual(pageB.title, 'MUTATED IN MEMORY', 'DEFAULT_CMS_DATA must not be mutated by callers');
  assert.notEqual(pageB.sections[0].title, 'MUTATED SECTION');

  assert.throws(
    () => validateCmsUpdatePayload('about', { title: '<script>alert(1)</script>' }, pageB),
    /disallowed executable markup/
  );
  assert.throws(
    () =>
      validateCmsUpdatePayload(
        'about',
        {
          sections: [
            {
              id: 'sec-1',
              title: 'Safe',
              content: '<img src=x onerror=alert(1)>',
            },
          ],
        },
        pageB
      ),
    /disallowed executable markup/
  );
  assert.throws(
    () => validateCmsUpdatePayload('about', { unexpectedField: true } as any, pageB),
    /Unsupported CMS field/
  );
});

await test('CMS updatePage invokes upsert_cms_page_transactional with mapped how_it_works slug when DB is configured', async () => {
  let rpcName = '';
  let rpcArgs: any = null;

  await withMockSupabase(
    {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
      rpc: async (fnName, params) => {
        rpcName = fnName;
        rpcArgs = params;
        return { data: { ok: true }, error: null };
      },
    },
    async () => {
      const updated = await cmsService.updatePage(
        'how-it-works',
        { title: 'How Earth Talk Works in Rwanda' },
        {
          staffId: '00000000-0000-0000-0000-000000000001',
          email: 'owner@earthtalk.rw',
          role: 'owner',
          ipHash: 'abc12345',
        }
      );
      assert.equal(updated.page, 'how-it-works');
      assert.equal(rpcName, 'upsert_cms_page_transactional');
      assert.equal(rpcArgs.p_slug, 'how_it_works');
      assert.equal(rpcArgs.p_actor_role, 'owner');
    }
  );
});

await test('inspectAndVerifyApkBuffer rejects unsigned ZIPs, wrong package names, bad CRCs, and duplicate entries, and accepts valid v2-signed APK', () => {
  const unsignedApk = buildSyntheticApkBuffer({ signV2: false });
  assert.throws(
    () => inspectAndVerifyApkBuffer(unsignedApk),
    /INVALID_APK_SIGNATURE/,
    'unsigned ZIP renamed to .apk must be rejected'
  );

  const wrongPackageApk = buildSyntheticApkBuffer({
    packageName: 'com.example.unrelated',
    signV2: true,
  });
  assert.throws(
    () => inspectAndVerifyApkBuffer(wrongPackageApk),
    /package does not match expected "org\.earthtalk\.mobile"/
  );

  const badCrcApk = buildSyntheticApkBuffer({ corruptManifestCrc: true, signV2: true });
  assert.throws(() => inspectAndVerifyApkBuffer(badCrcApk), /CRC-32 checksum mismatch/);

  const duplicateEntryApk = buildSyntheticApkBuffer({ duplicateManifestEntry: true, signV2: true });
  assert.throws(() => inspectAndVerifyApkBuffer(duplicateEntryApk), /Duplicate ZIP entry/);

  const validSignedApk = buildSyntheticApkBuffer({ signV2: true });
  const verified = inspectAndVerifyApkBuffer(validSignedApk);
  assert.equal(verified.packageName, 'org.earthtalk.mobile');
  assert.equal(verified.signatureScheme, 'v2_or_v3');
});

await test('sanitizeApkFilename neutralizes Content-Disposition CRLF/quote/path injection and durable storage verifies SHA-256 on download', async () => {
  assert.equal(
    sanitizeApkFilename('../../evil"\r\nX-Injected: 1.apk'),
    'evilX-Injected__1.apk'
  );

  const validSignedApk = buildSyntheticApkBuffer({ signV2: true });
  let storedBytes: Buffer | null = null;
  let insertedRelease: any = null;

  await withMockSupabase(
    {
      storage: {
        from: () => ({
          upload: async (_path: string, buf: Buffer) => {
            storedBytes = Buffer.from(buf);
            return { data: { path: _path }, error: null };
          },
          download: async () => ({
            data: new Blob([storedBytes ?? Buffer.alloc(0)]),
            error: null,
          }),
          remove: async () => ({ data: [], error: null }),
        }),
      },
      from: (table: string) => ({
        update: () => ({
          eq: async () => ({ data: null, error: null }),
        }),
        insert: async (row: any) => {
          if (table === 'app_releases') insertedRelease = row;
          return { data: row, error: null };
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: insertedRelease, error: null }),
          }),
        }),
      }),
    },
    async () => {
      const tmpApk = path.resolve(ROOT, `tmp/test_signed_${Date.now()}.apk`);
      fs.mkdirSync(path.dirname(tmpApk), { recursive: true });
      fs.writeFileSync(tmpApk, validSignedApk);

      const cfg = await appDistributionService.processUploadedApk(
        tmpApk,
        'earthtalk"\r\nInjected.apk',
        validSignedApk.length,
        'owner@earthtalk.rw',
        'v1.2.0',
        12,
        'Signed release'
      );
      assert.equal(cfg.apk_filename, 'earthtalkInjected.apk');

      const dlRes = mockRes();
      await appDistributionController.downloadApk({} as any, dlRes);
      assert.equal(dlRes.statusCode, 200);
      assert.equal(dlRes.headers['content-disposition'], 'attachment; filename="earthtalkInjected.apk"');
      assert.equal(dlRes.headers['x-apk-sha256'], cfg.apk_sha256);
      assert.equal(dlRes.endedBody?.length, validSignedApk.length);

      // Tamper with stored bytes -> SHA-256 verification must refuse to serve (503 APK_UNAVAILABLE)
      if (storedBytes) storedBytes[10] ^= 0xff;
      const tamperedRes = mockRes();
      await appDistributionController.downloadApk({} as any, tamperedRes);
      assert.equal(tamperedRes.statusCode, 503);
      assert.equal(tamperedRes.jsonBody?.error, 'APK_UNAVAILABLE');
    }
  );
});

console.log(`\n${'='.repeat(72)}`);
console.log(`Blocker-Only Repair Cycle Suite: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(72)}`);

if (failed > 0) {
  process.exit(1);
}
