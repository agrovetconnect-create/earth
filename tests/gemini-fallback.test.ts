import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { env, VALID_GEMINI_MODELS, VALID_GEMINI_TEXT_MODELS } from '../src/config/env.js';
import { GeologicalAnalysisError } from '../src/ai/geological.types.js';
import {
  GeminiService,
  classifyGeminiError,
  geminiRetryDelay,
} from '../src/services/gemini.service.js';

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

const ROOT = process.cwd();
const read = (relPath: string): string => fs.readFileSync(path.join(ROOT, relPath), 'utf8');

function apiError(status: number, message = `Gemini API error ${status}`): Error {
  return Object.assign(new Error(message), { status, name: 'ApiError' });
}

function mockService(thrower: (model: string) => never | Promise<never>): {
  service: GeminiService;
  calls: string[];
} {
  const service = new GeminiService();
  const calls: string[] = [];
  (service as any).ai = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        return thrower(model);
      },
    },
  };
  return { service, calls };
}

await test('invalid Gemini model IDs are absent from source and configuration', () => {
  for (const rel of ['src/services/gemini.service.ts', '.env', '.env.example']) {
    if (rel === '.env' && !fs.existsSync(path.join(ROOT, rel))) continue;
    const contents = read(rel);
    for (const stale of [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-3.8-flash',
    ]) {
      assert.ok(!contents.includes(stale), `${rel} must not contain stale model ${stale}`);
    }
  }
  assert.equal(env.GEMINI_MODEL, 'gemini-4-hydrogen');
  assert.ok((VALID_GEMINI_MODELS as readonly string[]).includes(env.GEMINI_MODEL));
  assert.ok((VALID_GEMINI_TEXT_MODELS as readonly string[]).includes(env.GEMINI_MODEL));
});

await test('classifyGeminiError separates terminal, retryable and unknown failures', () => {
  assert.equal(classifyGeminiError(apiError(400)), 'rejected');
  assert.equal(classifyGeminiError(apiError(402)), 'rejected');
  assert.equal(classifyGeminiError(apiError(404)), 'rejected');
  assert.equal(classifyGeminiError(apiError(401)), 'auth');
  assert.equal(classifyGeminiError(apiError(403)), 'auth');
  assert.equal(classifyGeminiError(new Error('API key not valid. Please pass a valid API key.')), 'auth');
  assert.equal(classifyGeminiError(new Error('PERMISSION_DENIED')), 'auth');
  assert.equal(classifyGeminiError(apiError(429)), 'retryable');
  assert.equal(classifyGeminiError(apiError(503)), 'retryable');
  assert.equal(classifyGeminiError(new Error('RESOURCE_EXHAUSTED: quota exceeded')), 'retryable');
  assert.equal(classifyGeminiError(new Error('socket hang up')), 'unknown');
});

await test('analysis refuses further models on 404, 402 and 403', async () => {
  for (const [status, category] of [
    [404, 'GEMINI_API_ERROR'],
    [402, 'GEMINI_API_ERROR'],
    [403, 'GEMINI_AUTH_ERROR'],
  ] as const) {
    const { service, calls } = mockService(() => {
      throw apiError(status);
    });
    await assert.rejects(
      () => service.analyzeGeoscienceMedia(Buffer.from('image'), 'image/jpeg'),
      (err: unknown) =>
        err instanceof GeologicalAnalysisError && err.category === category
    );
    assert.equal(calls.length, 1, `status ${status} must not trigger another model`);
  }
});

await test('context-aware analysis refuses further models on 404', async () => {
  const service = new GeminiService();
  const models: string[] = [];
  (service as any).executeIntelligenceWithTimeout = async (_media: unknown, _description: unknown, _context: unknown, model: string) => {
    models.push(model);
    throw apiError(404);
  };
  await assert.rejects(
    () =>
      service.analyzeGeoscienceIntelligence({
        media: [{ buffer: Buffer.from('image'), mimeType: 'image/jpeg' }],
        context: {} as any,
      }),
    (err: unknown) => err instanceof GeologicalAnalysisError && err.category === 'GEMINI_API_ERROR'
  );
  assert.equal(models.length, 1);
});

await test('Q&A and transcription return cautious fallback without further models on terminal errors', async () => {
  const qa = mockService(() => {
    throw apiError(404);
  });
  const qaAnswer = await qa.service.answerGeoscienceQuestion('What is this rock?');
  assert.match(qaAnswer, /temporarily unreachable/);
  assert.equal(qa.calls.length, 1);

  const voice = mockService(() => {
    throw apiError(403);
  });
  const voiceAnswer = await voice.service.transcribeAndAnswerVoiceNote(
    Buffer.from('audio').toString('base64'),
    'audio/webm'
  );
  assert.equal(voiceAnswer.transcript, '');
  assert.match(voiceAnswer.reply, /Live audio transcription is temporarily unavailable/);
  assert.equal(voice.calls.length, 1);
});

await test('429 retries across the fallback chain with tiny backoff', async () => {
  const { service, calls } = mockService(() => {
    throw apiError(429);
  });
  const started = Date.now();
  await assert.rejects(
    () => service.analyzeGeoscienceMedia(Buffer.from('image'), 'image/jpeg'),
    (err: unknown) => err instanceof GeologicalAnalysisError
  );
  const elapsed = Date.now() - started;
  assert.equal(calls.length, VALID_GEMINI_TEXT_MODELS.length);
  assert.ok(elapsed >= 10 && elapsed < 1000, `unexpected backoff duration ${elapsed}ms`);
});

await test('quota failures expose a friendly message instead of raw Gemini JSON', async () => {
  const raw = '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"quota exceeded"}}';
  const { service } = mockService(() => {
    throw apiError(429, raw);
  });
  await assert.rejects(
    () => service.analyzeGeoscienceMedia(Buffer.from('image'), 'image/jpeg'),
    (err: unknown) =>
      err instanceof GeologicalAnalysisError &&
      err.category === 'GEMINI_RATE_LIMIT_ERROR' &&
      err.message ===
        'AI analysis is at capacity right now. Please try again in a few minutes; nothing was recorded.'
  );
});

await test('transient unknown errors keep the existing full fallback chain', async () => {
  const { service, calls } = mockService(() => {
    throw new Error('socket hang up');
  });
  const answer = await service.answerGeoscienceQuestion('What is this mineral?');
  assert.match(answer, /temporarily unreachable/);
  assert.equal(calls.length, VALID_GEMINI_TEXT_MODELS.length);
});

await test('geminiRetryDelay is exponential, jittered and capped at 200ms', async () => {
  const started = Date.now();
  await geminiRetryDelay(0);
  await geminiRetryDelay(1);
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 20 && elapsed < 300, `unexpected delay ${elapsed}ms`);
});

console.log(`\n${'='.repeat(72)}`);
console.log(`Gemini fallback suite: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(72)}`);

if (failed > 0) {
  process.exit(1);
}
