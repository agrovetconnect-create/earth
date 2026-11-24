import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { communityPostRepository } from '../src/repositories/community-post.repository.js';
import { PostServiceError, communityPostService } from '../src/services/community-post.service.js';
import type { ObservationRow } from '../src/types/database.types.js';
import type { ViewerContext } from '../src/types/community-posts.types.js';
import { hashContributor } from '../src/utils/contributor.js';
import { validateDocument } from '../src/utils/image-validator.js';

let passed = 0;
let failed = 0;
let currentTest = '';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  currentTest = name;
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
  console.log(`\n${'-'.repeat(60)}\n${title}\n${'-'.repeat(60)}`);
}

const contributorToken = 'attachment-support-token-1234567890';
const owner: ViewerContext = {
  userId: 'attachment-owner',
  publicUserId: 'attachment-owner-public',
  displayName: 'Attachment Tester',
};
const stranger: ViewerContext = {
  userId: 'attachment-stranger',
  publicUserId: 'attachment-stranger-public',
  displayName: 'Stranger',
};

function seedObservation(over: Partial<ObservationRow> = {}): ObservationRow {
  const now = new Date().toISOString();
  const row: ObservationRow = {
    id: crypto.randomUUID(),
    passport_id: `RT-ATT-${crypto.randomUUID().slice(0, 8)}`,
    source: 'web',
    source_message_id: null,
    source_user_hash: hashContributor(`web:${contributorToken}`),
    status: 'completed',
    observation_category: 'rock',
    observation_subcategory: 'igneous',
    observation_type: 'rock_specimen',
    primary_interpretation: 'A test observation for attachment storage.',
    geological_context: null,
    diagnostic_features: [],
    possible_alternatives: [],
    uncertainties: [],
    questions_for_user: [],
    community_status: 'not_started',
    is_rock: true,
    primary_classification: 'igneous',
    possible_name: 'granite',
    confidence: 'moderate',
    confidence_score: 0.6,
    observed_features: [],
    reasoning: 'Test fixture.',
    alternative_possibilities: [],
    limitations: [],
    recommended_next_steps: [],
    safety_note: null,
    user_caption: null,
    verification_status: 'unverified',
    publication_status: 'public',
    evidence_state: 'ai_assisted',
    evidence_state_reason: null,
    evidence_state_changed_at: null,
    evidence_state_changed_by: null,
    scientific_confirmation_basis: null,
    scientific_confirmed_at: null,
    site_id: null,
    location_status: 'user_provided',
    data_quality_status: 'partial',
    owner_user_id: owner.userId,
    post_title: null,
    user_report: null,
    is_demo: false,
    community_updated_at: null,
    ai_model: 'test-model',
    ai_prompt_version: 'test',
    analysis_version: 'test',
    system_version: 'test',
    created_at: now,
    updated_at: now,
    published_at: now,
    ...over,
  };
  communityPostRepository.registerObservationRecord(row);
  return row;
}

async function expectServiceError(
  fn: () => Promise<unknown>,
  status: number,
  code: string
): Promise<void> {
  try {
    await fn();
    throw new Error(`expected ${code} to be thrown`);
  } catch (err) {
    assert.ok(err instanceof PostServiceError, `threw ${String(err)}`);
    assert.equal(err.status, status);
    assert.equal(err.code, code);
  }
}

section('Document validation');

await test('validateDocument accepts a real PDF signature', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
  const result = validateDocument(pdf, 'application/pdf');
  assert.equal(result.isValid, true);
  assert.equal(result.detectedMimeType, 'application/pdf');
  assert.equal(result.mediaKind, null);
});

await test('validateDocument rejects an empty file', () => {
  const result = validateDocument(Buffer.alloc(0), 'application/pdf');
  assert.equal(result.isValid, false);
  assert.equal(result.errorReason, 'EMPTY_BODY');
});

await test('validateDocument rejects an unsupported or mismatched document', () => {
  const unsupported = validateDocument(Buffer.from('%PDF-1.4'), 'application/x-msdownload');
  assert.equal(unsupported.isValid, false);
  assert.equal(unsupported.errorReason, 'UNSUPPORTED_FORMAT');

  const mismatched = validateDocument(Buffer.from('plain text'), 'application/pdf');
  assert.equal(mismatched.isValid, false);
  assert.equal(mismatched.errorReason, 'CORRUPTED');
});

section('Attachment storage and privacy');

await test('owner can attach a PDF and download the original bytes', async () => {
  const row = seedObservation();
  const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Title (Field report) >>\nendobj\n%%EOF');
  const attachment = await communityPostService.addAttachment(
    row.passport_id,
    owner,
    {
      filename: 'field-report.pdf',
      mime_type: 'application/pdf',
      size_bytes: pdf.length,
      content_base64: pdf.toString('base64'),
      title: 'Field report',
      description: 'Supporting geometry notes',
      kind: 'report',
    },
    contributorToken
  );

  assert.equal(attachment.filename, 'field-report.pdf');
  assert.equal(attachment.mime_type, 'application/pdf');
  assert.equal(attachment.kind, 'report');
  assert.equal(attachment.allow_download, true);
  assert.equal(
    attachment.url,
    `/api/posts/${encodeURIComponent(row.passport_id)}/attachments/${encodeURIComponent(attachment.attachment_id)}`
  );

  const stored = await communityPostService.getAttachmentFile(
    row.passport_id,
    attachment.attachment_id,
    owner,
    contributorToken
  );
  assert.ok(stored);
  assert.deepEqual(stored.buffer, pdf);
});

await test('non-owner cannot attach files to another Passport', async () => {
  const row = seedObservation();
  await expectServiceError(
    () =>
      communityPostService.addAttachment(row.passport_id, stranger, {
        filename: 'hijack.pdf',
        mime_type: 'application/pdf',
        content_base64: Buffer.from('%PDF-1.4').toString('base64'),
      }),
    403,
    'NOT_OWNER'
  );
});

await test('making a post private also makes its attachments private', async () => {
  const row = seedObservation();
  const pdf = Buffer.from('%PDF-1.4\nprivate attachment\n%%EOF');
  const attachment = await communityPostService.addAttachment(
    row.passport_id,
    owner,
    {
      filename: 'private.pdf',
      mime_type: 'application/pdf',
      content_base64: pdf.toString('base64'),
    },
    contributorToken
  );

  const publicRead = await communityPostService.getAttachmentFile(
    row.passport_id,
    attachment.attachment_id,
    null
  );
  assert.ok(publicRead, 'public post attachment is readable without a session');

  await communityPostService.updatePost(
    row.passport_id,
    owner,
    { is_public: false },
    contributorToken
  );

  await expectServiceError(
    () =>
      communityPostService.getAttachmentFile(
        row.passport_id,
        attachment.attachment_id,
        stranger
      ),
    403,
    'NOT_OWNER'
  );

  const ownerRead = await communityPostService.getAttachmentFile(
    row.passport_id,
    attachment.attachment_id,
    owner,
    contributorToken
  );
  assert.ok(ownerRead, 'owner can still read the private attachment');
});

section('Web and mobile attachment wiring');

await test('backend routes expose upload and byte-serving endpoints', () => {
  const controller = readFileSync('src/controllers/posts.controller.ts', 'utf8');
  const routes = readFileSync('src/routes/posts.routes.ts', 'utf8');
  assert.match(controller, /export async function addAttachmentHandler/);
  assert.match(controller, /export async function serveAttachmentHandler/);
  assert.match(controller, /Content-Disposition/);
  assert.match(routes, /posts\/:passportId\/attachments\/:attachmentId/);
  assert.match(routes, /posts\/:passportId\/attachments/);
});

await test('web chat can stage and upload documents', () => {
  const src = readFileSync('web/src/components/WebFieldSubmissionModal.tsx', 'utf8');
  const api = readFileSync('web/src/services/postsApi.ts', 'utf8');
  assert.match(src, /File \/ PDF/);
  assert.match(src, /stagedDocuments/);
  assert.match(src, /uploadPostAttachment/);
  assert.match(src, /documents: documentsToSend\.length > 0 \? documentsToSend : undefined/);
  assert.match(src, /isStagingFiles/);
  assert.match(api, /\/api\/posts\/\$\{encodeURIComponent\(passportId\)\}\/attachments/);
  assert.match(api, /documents\?: Array/);
});

await test('chat sends attached document bytes to Gemini for reading', () => {
  const controller = readFileSync('src/controllers/mobile-chat.controller.ts', 'utf8');
  const service = readFileSync('src/services/mobile-chat.service.ts', 'utf8');
  const gemini = readFileSync('src/services/gemini.service.ts', 'utf8');
  assert.match(controller, /body\.documents/);
  assert.match(service, /request\.documents/);
  assert.match(gemini, /Attached documents \(read and use them/);
  assert.match(gemini, /attachedDocumentParts/);
});

await test('mobile chat and Passport sheet can attach documents', () => {
  const submit = readFileSync('mobile/app/submit.tsx', 'utf8');
  const sheet = readFileSync('mobile/src/components/ObservationSheet.tsx', 'utf8');
  const api = readFileSync('mobile/src/services/postsApi.ts', 'utf8');
  const file = readFileSync('mobile/src/lib/file.ts', 'utf8');
  assert.match(submit, /File \/ PDF/);
  assert.match(submit, /DocumentPicker\.getDocumentAsync/);
  assert.match(submit, /uploadPostAttachment/);
  assert.match(sheet, /Attach Document \/ PDF/);
  assert.match(sheet, /attachSupportingDocument/);
  assert.match(api, /\/api\/posts\/\$\{encodeURIComponent\(passportId\)\}\/attachments/);
  assert.match(file, /export function documentMimeType/);
});

section('Chat-only CMS copy');

await test('CMS defaults and live migration no longer advertise another submission route', () => {
  const data = readFileSync('src/data/cms-content.json', 'utf8');
  const service = readFileSync('src/services/cms.service.ts', 'utf8');
  const migration = readFileSync('supabase/migrations/056_chat_only_cms_copy.sql', 'utf8');
  for (const source of [data, service]) {
    assert.doesNotMatch(source, /web submission form/i);
    assert.doesNotMatch(source, /web upload/i);
    assert.doesNotMatch(source, /upload via the web form/i);
    assert.doesNotMatch(source, /WhatsApp or Web/i);
  }
  assert.match(migration, /Submit Field Observation chat/);
  assert.match(migration, /Earth Talk chat/);
});

console.log(`\n${'='.repeat(60)}`);
console.log('Document attachment support');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.error(`\nLast test: ${currentTest}`);
  process.exit(1);
}
