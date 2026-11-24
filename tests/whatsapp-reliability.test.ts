import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { GeologicalAnalysisError, type GeoscienceAnalysisResult } from '../src/ai/geological.types.js';
import { ServiceUnavailableError } from '../src/utils/service-error.js';
import { USER_MESSAGES } from '../src/utils/image-validator.js';
import { WebhookClaimRepository } from '../src/repositories/webhook-claim.repository.js';
import { WebhookJobRepository } from '../src/repositories/webhook-job.repository.js';
import { WebhookQueueService } from '../src/services/webhook-queue.service.js';
import { geminiService } from '../src/services/gemini.service.js';
import { geoscienceIntelligenceService } from '../src/services/geoscience-intelligence.service.js';
import { geoscienceAnalysisService } from '../src/services/geoscience-analysis.service.js';
import { ObservationService } from '../src/services/observation.service.js';
import { whatsappMediaService } from '../src/services/whatsapp-media.service.js';
import { whatsappService } from '../src/services/whatsapp.service.js';
import { webhookClaimRepository } from '../src/repositories/webhook-claim.repository.js';
import { observationService } from '../src/services/observation.service.js';

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

function patch<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]): () => void {
  const original = target[key];
  (target as any)[key] = replacement;
  return () => {
    (target as any)[key] = original;
  };
}

const ROOT = process.cwd();
const read = (relPath: string): string => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 1)]);

function validAnalysis(): GeoscienceAnalysisResult {
  return {
    is_rock: true,
    observation_category: 'rock',
    observation_subcategory: 'granite',
    observation_type: 'rock_specimen',
    is_geoscience_relevant: true,
    primary_interpretation: 'Possibly granite',
    geological_context: 'consistent with a plutonic igneous setting',
    diagnostic_features: ['coarse visible mineral grains'],
    uncertainties: ['a photograph cannot confirm mineral chemistry'],
    questions_for_user: ['Does the specimen react to acid?'],
    blocked_claims: [],
    primary_classification: 'igneous',
    possible_name: 'granite',
    confidence: 'moderate',
    confidence_score: 0.75,
    observed_features: ['coarse visible mineral grains'],
    reasoning: 'The visible interlocking grains are consistent with a coarse igneous rock.',
    alternative_possibilities: ['granodiorite'],
    limitations: ['no laboratory confirmation'],
    recommended_next_steps: ['photograph a fresh broken surface in daylight'],
    safety_note: 'Preliminary AI-assisted reading, not a laboratory determination.',
    model_used: 'gemini-3.8-flash',
  };
}

console.log('--- Running Earth Talk WhatsApp Reliability Suite ---');

await test('audio jobs download the media and send the transcription reply', async () => {
  const jobs = new WebhookJobRepository();
  const replies: string[] = [];
  const restores = [
    patch(whatsappMediaService, 'downloadMedia', async (mediaId: string) => {
      assert.equal(mediaId, 'audio-media-1');
      return { buffer: Buffer.from('audio bytes'), mimeType: 'audio/ogg', fileSize: 11, mediaKind: 'audio' as any };
    }),
    patch(geminiService, 'transcribeAndAnswerVoiceNote', async () => ({
      transcript: 'What is this rock?',
      reply: 'This looks like a possible granite specimen.',
    })),
    patch(whatsappService, 'sendTextMessageStrict', async (_phone: string, reply: string) => {
      replies.push(reply);
      return { messages: [{ id: 'wam-audio-1' }] } as any;
    }),
  ];

  try {
    await jobs.enqueue({
      providerMessageId: 'audio-1',
      jobType: 'audio',
      payload: {
        senderPhoneNumber: '250700000001',
        mediaId: 'audio-media-1',
        declaredMimeType: 'audio/ogg',
      },
    });
    const queue = new WebhookQueueService(jobs, new WebhookClaimRepository());
    assert.equal(await queue.processOnce(), 'completed');
    assert.deepEqual(replies, ['This looks like a possible granite specimen.']);
    assert.equal((await jobs.listByStatus('completed')).length, 1);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

await test('terminal audio failures send a user-facing reply, reply delivery failures stay retryable', async () => {
  const jobs = new WebhookJobRepository();
  const terminalReplies: string[] = [];
  const restores = [
    patch(whatsappMediaService, 'downloadMedia', async () => {
      throw new GeologicalAnalysisError('MEDIA_VALIDATION_ERROR', USER_MESSAGES.OVERSIZED);
    }),
    patch(whatsappService, 'sendTextMessageStrict', async (_phone: string, reply: string) => {
      terminalReplies.push(reply);
      return { messages: [{ id: 'wam-audio-terminal' }] } as any;
    }),
  ];

  try {
    await jobs.enqueue({
      providerMessageId: 'audio-2',
      jobType: 'audio',
      payload: { senderPhoneNumber: '250700000002', mediaId: 'oversized-audio' },
    });
    const queue = new WebhookQueueService(jobs, new WebhookClaimRepository());
    assert.equal(await queue.processOnce(), 'terminal');
    assert.deepEqual(terminalReplies, [USER_MESSAGES.OVERSIZED]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }

  const retryJobs = new WebhookJobRepository();
  const retryRestores = [
    patch(whatsappMediaService, 'downloadMedia', async () => ({
      buffer: Buffer.from('audio bytes'),
      mimeType: 'audio/ogg',
      fileSize: 11,
      mediaKind: 'audio' as any,
    })),
    patch(geminiService, 'transcribeAndAnswerVoiceNote', async () => ({
      transcript: 'hello',
      reply: 'voice reply',
    })),
    patch(whatsappService, 'sendTextMessageStrict', async () => {
      throw new Error('WhatsApp is down');
    }),
  ];

  try {
    await retryJobs.enqueue({
      providerMessageId: 'audio-3',
      jobType: 'audio',
      payload: { senderPhoneNumber: '250700000003', mediaId: 'audio-media-3' },
    });
    const queue = new WebhookQueueService(retryJobs, new WebhookClaimRepository());
    assert.equal(await queue.processOnce(), 'retry');
    assert.equal((await retryJobs.listByStatus('retryable_failure')).length, 1);
  } finally {
    retryRestores.reverse().forEach((restore) => restore());
  }
});

await test('a pending location survives a transient save failure and is consumed after success', async () => {
  const phone = '250700000010';
  const messageId = 'pending-location-1';
  const capturedLocations: Array<unknown> = [];
  let saveAttempts = 0;
  const restores = [
    patch(whatsappService, 'sendTextMessageStrict', async () => ({ messages: [{ id: 'wam-loc' }] } as any)),
    patch(observationService, 'getObservationBySourceMessageId', async () => null),
    patch(webhookClaimRepository, 'claim', async () => 'claimed' as const),
    patch(webhookClaimRepository, 'markRetryable', async () => {}),
    patch(webhookClaimRepository, 'markTerminal', async () => {}),
    patch(webhookClaimRepository, 'markCompleted', async () => {}),
    patch(whatsappMediaService, 'downloadMedia', async () => ({
      buffer: JPEG,
      mimeType: 'image/jpeg',
      fileSize: JPEG.length,
      mediaKind: 'image' as const,
    })),
    patch(geoscienceIntelligenceService, 'analyzeIntelligence', async () => {
      throw new Error('force base analysis fallback');
    }),
    patch(geminiService, 'analyzeGeoscienceMedia', async () => validAnalysis()),
    patch(observationService, 'createRockPassport', async (params: any) => {
      saveAttempts++;
      capturedLocations.push(params.location ?? null);
      if (saveAttempts === 1) throw new ServiceUnavailableError('observation save');
      return { passport_id: 'RT-RW-000010' } as any;
    }),
  ];

  try {
    await geoscienceAnalysisService.recordSharedLocation({
      senderPhoneNumber: phone,
      latitude: -1.9441,
      longitude: 30.0619,
      name: 'Private pin',
      address: 'Kigali',
    });

    const base = {
      senderPhoneNumber: phone,
      messageId,
      mediaId: 'media-pending-location',
      declaredMimeType: 'image/jpeg',
    };

    assert.equal(
      (await geoscienceAnalysisService.processRockImage(base)).state,
      'retryable',
      'the first save must stay retryable'
    );

    const second = await geoscienceAnalysisService.processRockImage({ ...base, messageId: `${messageId}-2` });
    assert.equal(second.state, 'completed');
    const attached = capturedLocations[1] as any;
    assert.equal(attached?.latitude, -1.9441, 'the pin must survive the retry');
    assert.equal(attached?.longitude, 30.0619);

    await geoscienceAnalysisService.processRockImage({ ...base, messageId: `${messageId}-3` });
    assert.equal(capturedLocations[2], null, 'the pin must be consumed after a successful reply');
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

await test('a partial observation write rolls back the observation bundle', async () => {
  const deleted: string[] = [];
  const fakeRepo = {
    findBySourceMessageId: async () => null,
    recordProcessingEvent: async () => {},
    createObservation: async () => ({ id: 'obs-rollback', passport_id: 'RT-RW-999999' }),
    saveObservationMedia: async () => {
      throw new Error('media insert failed');
    },
    saveObservationLocation: async () => ({ id: 'loc-rollback' }),
    updateObservationStatus: async () => {},
    deleteObservationBundle: async (observationId: string) => {
      deleted.push(observationId);
    },
  } as any;

  const service = new ObservationService(fakeRepo);
  await assert.rejects(() =>
    service.createRockPassport({
      aiResult: validAnalysis(),
      senderPhoneNumber: '250700000020',
      messageId: 'rollback-1',
      media: {
        buffer: JPEG,
        mimeType: 'image/jpeg',
        fileSize: JPEG.length,
        mediaId: 'media-rollback',
      },
    })
  );
  assert.deepEqual(deleted, ['obs-rollback']);
});

await test('oversized media is rejected from metadata before bytes are downloaded', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    return {
      ok: true,
      json: async () => ({
        url: 'https://download.test/should-not-be-fetched',
        mime_type: 'image/jpeg',
        file_size: env.MAX_IMAGE_SIZE_BYTES + 1,
      }),
    } as any;
  }) as any;

  try {
    await assert.rejects(
      () => whatsappMediaService.downloadMedia('oversized-by-metadata'),
      (err: unknown) =>
        err instanceof GeologicalAnalysisError &&
        err.category === 'MEDIA_VALIDATION_ERROR' &&
        err.message === USER_MESSAGES.OVERSIZED
    );
    assert.equal(fetchCalls, 1, 'the download URL must not be fetched when file_size is too large');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('oversized media is rejected from content-length and streaming chunk caps', async () => {
  const originalFetch = globalThis.fetch;
  let canceled = false;
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    if (url.endsWith('/content-length-media')) {
      return {
        ok: true,
        json: async () => ({ url: 'https://download.test/content-length', mime_type: 'image/jpeg' }),
      } as any;
    }
    if (url.endsWith('/stream-media')) {
      return {
        ok: true,
        json: async () => ({ url: 'https://download.test/stream', mime_type: 'image/jpeg' }),
      } as any;
    }
    if (url === 'https://download.test/content-length') {
      return {
        ok: true,
        headers: new Headers({ 'content-length': String(env.MAX_IMAGE_SIZE_BYTES + 1) }),
        body: { getReader: () => { throw new Error('body must not be read'); } },
      } as any;
    }
    if (url === 'https://download.test/stream') {
      return {
        ok: true,
        headers: new Headers(),
        body: {
          getReader: () => ({
            read: async () => ({ done: false, value: new Uint8Array(env.MAX_IMAGE_SIZE_BYTES + 1) }),
            cancel: async () => {
              canceled = true;
            },
            releaseLock: () => {},
          }),
        },
      } as any;
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as any;

  try {
    await assert.rejects(
      () => whatsappMediaService.downloadMedia('content-length-media'),
      (err: unknown) =>
        err instanceof GeologicalAnalysisError &&
        err.category === 'MEDIA_VALIDATION_ERROR' &&
        err.message === USER_MESSAGES.OVERSIZED
    );
    await assert.rejects(
      () => whatsappMediaService.downloadMedia('stream-media'),
      (err: unknown) =>
        err instanceof GeologicalAnalysisError &&
        err.category === 'MEDIA_VALIDATION_ERROR' &&
        err.message === USER_MESSAGES.OVERSIZED
    );
    assert.equal(canceled, true, 'the stream must be cancelled once the cap is exceeded');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('database bookkeeping failures propagate instead of being logged and swallowed', () => {
  const jobRepo = read('src/repositories/webhook-job.repository.ts');
  const claimRepo = read('src/repositories/webhook-claim.repository.ts');
  const operations = [
    'webhook job completion',
    'webhook job attempt budget read',
    'webhook job retryable marking',
    'webhook job terminal marking',
    'webhook message completion',
    'webhook message retryable marking',
    'webhook message terminal marking',
  ];
  for (const operation of operations) {
    const source = operation.startsWith('webhook job') ? jobRepo : claimRepo;
    assert.match(source, new RegExp(`this\\.unavailable\\('${operation}', err\\)`));
  }
});

await test('rate-limit checks are strict and keyed by a phone hash', () => {
  const analysis = read('src/services/geoscience-analysis.service.ts');
  const limiter = read('src/utils/rate-limiter.ts');
  assert.match(limiter, /export async function checkDistributedRateLimitStrict/);
  assert.match(limiter, /throw new ServiceUnavailableError\('distributed rate limit check', err\)/);
  assert.match(analysis, /checkDistributedRateLimitStrict\(/);
  assert.match(analysis, /const senderHash = hashUserPhoneNumber\(senderPhoneNumber\)/);
  assert.match(analysis, /wa_ai:\$\{senderHash\}/);
  assert.match(analysis, /private readonly byPhoneHash = new Map/);
  assert.match(analysis, /return hashUserPhoneNumber\(phone\)/);
});

await test('completion paths use strict WhatsApp delivery', () => {
  const queue = read('src/services/webhook-queue.service.ts');
  const analysis = read('src/services/geoscience-analysis.service.ts');
  const commands = read('src/services/community-commands.service.ts');
  assert.match(queue, /sendTextMessageStrict\(payload\.senderPhoneNumber/);
  const notifyStart = queue.indexOf('private async notifyExhausted');
  const notifyBody = queue.slice(notifyStart, queue.indexOf('\n  }', notifyStart));
  assert.doesNotMatch(notifyBody, /sendTextMessageStrict/);
  assert.match(analysis, /sendTextMessageStrict\(senderPhoneNumber, formattedResponse\)/);
  assert.equal((analysis.match(/sendTextMessageStrict\(/g) ?? []).length >= 8, true);
  assert.equal((commands.match(/sendTextMessageStrict\(/g) ?? []).length >= 2, true);
});

console.log(`\n${'='.repeat(72)}`);
console.log(`WhatsApp reliability suite: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(72)}`);

if (failed > 0) process.exit(1);
