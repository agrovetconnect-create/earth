import assert from 'node:assert/strict';
import test from 'node:test';
<<<<<<< HEAD
import { ApiError, castInvestigationVote, createObservationComment, fetchAuthSession, fetchCategories, fetchContributorToken, fetchInvestigations, fetchMyObservations, fetchObservation, fetchObservationComments, fetchObservations, fetchObservationMapData, fetchSiteVisits, getApiBaseUrl, recordSiteVisit, requestAuthCode, signOutAuthSession, submitPhotoObservation, updateAccountProfile, verifyAuthCode } from '../services/api.ts';
=======
import { ApiError, castInvestigationVote, createObservationComment, fetchAuthSession, fetchCategories, fetchContributorToken, fetchInvestigations, fetchMyObservations, fetchObservation, fetchObservationComments, fetchObservations, fetchObservationMapData, fetchSiteVisits, getApiBaseUrl, recordSiteVisit, requestAuthCode, signOutAuthSession, updateAccountProfile, verifyAuthCode } from '../services/api.ts';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import { observationCardViewModel } from '../utils/observationCard.ts';
import { safeMediaUrl } from '../utils/media.ts';
import { buildWhatsAppStartUrl, hasConfiguredWhatsAppRecipient } from '../utils/whatsapp.ts';
import { nextObservationPage, observationDetailRoute } from '../utils/observationNavigation.ts';
import { contentState } from '../utils/uiState.ts';

const original = process.env.EXPO_PUBLIC_API_BASE_URL;
const originalFetch = globalThis.fetch;
const env = process.env as Record<string, string | undefined>;
function restore() {
  if (original === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = original;
  globalThis.fetch = originalFetch;
}
const record = { passport_id: 'ET-RW-000001', observation_category: 'rock', observation_subcategory: 'outcrop', primary_interpretation: null, classification: 'igneous', possible_name: null, confidence: 'low', confidence_score: 0.25, verification_status: 'unverified' as const, evidence_state: 'ai_assisted', district: null, location_precision: 'private' as const, created_at: '2026-01-01T00:00:00.000Z' };

test('missing and invalid public API configuration returns useful errors', () => {
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  assert.throws(() => getApiBaseUrl(), /not configured/);
  process.env.EXPO_PUBLIC_API_BASE_URL = 'not-a-url';
  assert.throws(() => getApiBaseUrl(), /invalid/);
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://example.test/v1';
  assert.throws(() => getApiBaseUrl(), /origin/);
  restore();
});

test('production API configuration requires HTTPS and a non-loopback host', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  env.NODE_ENV = 'production';
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://earth-talk.example';
  assert.throws(() => getApiBaseUrl(), /Production builds require/);
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://localhost';
  assert.throws(() => getApiBaseUrl(), /Production builds require/);
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://10.0.2.2';
  assert.throws(() => getApiBaseUrl(), /Production builds require/);
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://0.0.0.0';
  assert.throws(() => getApiBaseUrl(), /Production builds require/);
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.example';
  assert.equal(getApiBaseUrl(), 'https://earth-talk.example');
  if (originalNodeEnv === undefined) Reflect.deleteProperty(env, 'NODE_ENV'); else env.NODE_ENV = originalNodeEnv;
  restore();
});

test('observation list builds the verified endpoint URL and accepts its real envelope', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test/';
  let called = '';
  globalThis.fetch = async (input) => {
    called = String(input);
    return new Response(JSON.stringify({ data: [record], pagination: { page: 2, limit: 20, total: 21, totalPages: 2 } }), { status: 200 });
  };
  const result = await fetchObservations(2, 20);
  assert.equal(called, 'https://earth-talk.test/api/public/observations?page=2&limit=20');
  assert.equal(result.data[0]?.passport_id, record.passport_id);
  assert.equal(result.pagination.totalPages, 2);
  restore();
});

test('mocked browse-to-detail journey preserves the backend observation identifier', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  const detail = { ...record, observed_features: ['Layered texture'], reasoning: 'Preliminary description.', limitations: [], recommended_next_steps: [], safety_note: 'AI-assisted, not confirmation.' };
  globalThis.fetch = async (input) => String(input).endsWith('/ET-RW-000001')
    ? new Response(JSON.stringify(detail), { status: 200 })
    : new Response(JSON.stringify({ data: [record], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }), { status: 200 });
  const listing = await fetchObservations();
  const selectedId = listing.data[0]!.passport_id;
  const selected = await fetchObservation(selectedId);
  assert.equal(selected?.passport_id, selectedId);
  assert.deepEqual(observationDetailRoute(selectedId), { pathname: '/observations/[id]', params: { id: selectedId } });
  restore();
});

test('search and category filters are encoded as supported query parameters', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let called = '';
  globalThis.fetch = async (input) => { called = String(input); return new Response(JSON.stringify({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }), { status: 200 }); };
  await fetchObservations(1, 20, undefined, { search: 'lava flow', category: 'rock' });
  const parsed = new URL(called);
  assert.equal(parsed.pathname, '/api/public/observations');
  assert.equal(parsed.searchParams.get('search'), 'lava flow');
  assert.equal(parsed.searchParams.get('category'), 'rock');
  restore();
});

test('category response is validated and returned as the actual array contract', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async () => new Response(JSON.stringify([{ category: 'rock', label: 'Rock', observation_count: 4 }]), { status: 200 });
  assert.deepEqual(await fetchCategories(), [{ category: 'rock', label: 'Rock', observation_count: 4 }]);
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [] }), { status: 200 });
  await assert.rejects(fetchCategories(), (error: unknown) => error instanceof ApiError && error.kind === 'malformed');
  restore();
});

test('map endpoint builds the verified public GeoJSON URL with supported server filters', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let called = '';
  globalThis.fetch = async (input) => { called = String(input); return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 }); };
  const result = await fetchObservationMapData(undefined, { search: 'basalt ridge', category: 'rock' });
  const parsed = new URL(called);
  assert.equal(parsed.pathname, '/api/public/observations.geojson');
  assert.equal(parsed.searchParams.get('search'), 'basalt ridge');
  assert.equal(parsed.searchParams.get('category'), 'rock');
  assert.equal(result.features.length, 0);
  globalThis.fetch = async () => new Response(JSON.stringify({ type: 'FeatureCollection', features: [null] }), { status: 200 });
  await assert.rejects(fetchObservationMapData(), (error: unknown) => error instanceof ApiError && error.kind === 'malformed');
  restore();
});

test('network failures and 404 detail responses are classified safely', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async () => { throw new TypeError('private low level details'); };
  await assert.rejects(fetchObservations(), (error: unknown) => error instanceof ApiError && error.kind === 'network' && !error.message.includes('private low level details'));
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'PUBLIC_OBSERVATION_NOT_FOUND', message: 'Public observation not found.' } }), { status: 404 });
  assert.equal(await fetchObservation('ET-NOT-PUBLIC'), null);
  restore();
});

test('media URLs reject missing values and non-http schemes; WhatsApp validates configured number and falls back safely', () => {
  assert.equal(safeMediaUrl(null), null);
  assert.equal(safeMediaUrl('file:///private/image.jpg'), null);
  assert.equal(safeMediaUrl('https://storage.example/image.jpg'), 'https://storage.example/image.jpg');
  const originalNodeEnv = process.env.NODE_ENV;
  env.NODE_ENV = 'production';
  assert.equal(safeMediaUrl('http://storage.example/image.jpg'), null);
  if (originalNodeEnv === undefined) Reflect.deleteProperty(env, 'NODE_ENV'); else env.NODE_ENV = originalNodeEnv;
  assert.equal(buildWhatsAppStartUrl(''), 'https://wa.me/?text=START');
  assert.equal(buildWhatsAppStartUrl('+250 700-123-456'), 'https://wa.me/250700123456?text=START');
  assert.equal(buildWhatsAppStartUrl('Call +250 7'), 'https://wa.me/?text=START');
  assert.equal(buildWhatsAppStartUrl('1234567890123456'), 'https://wa.me/?text=START');
  assert.equal(hasConfiguredWhatsAppRecipient(''), false);
  assert.equal(hasConfiguredWhatsAppRecipient('+250 700-123-456'), true);
  assert.equal(hasConfiguredWhatsAppRecipient('12'), false);
});

test('an already-cancelled API request does not start a network fetch', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  const controller = new AbortController();
  controller.abort();
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}'); };
  await assert.rejects(fetchObservations(1, 20, controller.signal), (error: unknown) => error instanceof Error && error.name === 'AbortError');
  assert.equal(called, false);
  restore();
});

test('aborting an in-flight API request aborts fetch without converting cancellation to network failure', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  const controller = new AbortController();
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('fetch aborted')), { once: true });
  });
  const request = fetchObservations(1, 20, controller.signal);
  controller.abort();
  await assert.rejects(request, /fetch aborted/);
  restore();
});

test('API request timeout aborts the transport and reports a timeout error', async (t) => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('transport aborted')), { once: true });
  });
  const request = fetchObservations();
  await new Promise<void>((resolve) => setImmediate(resolve));
  t.mock.timers.tick(12_000);
  await assert.rejects(request, (error: unknown) => error instanceof ApiError && error.kind === 'timeout');
  t.mock.timers.reset();
  restore();
});

test('API distinguishes unauthorized and forbidden responses and rejects invalid JSON', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'Sign in required.' } }), { status: 401 });
  await assert.rejects(fetchObservations(), (error: unknown) => error instanceof ApiError && error.kind === 'unauthorized' && error.status === 401);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Not permitted.' } }), { status: 403 });
  await assert.rejects(fetchObservations(), (error: unknown) => error instanceof ApiError && error.kind === 'forbidden' && error.status === 403);
  globalThis.fetch = async () => new Response('{ invalid json', { status: 200 });
  await assert.rejects(fetchObservations(), (error: unknown) => error instanceof ApiError && error.kind === 'malformed');
  restore();
});

test('malformed observation detail is rejected instead of reaching presentation', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async () => new Response(JSON.stringify({ passport_id: 'ET-RW-000001' }), { status: 200 });
  await assert.rejects(fetchObservation('ET-RW-000001'), (error: unknown) => error instanceof ApiError && /unexpected format/.test(error.message));
  restore();
});

test('nested server error envelopes retain status and readable message', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Please retry later.' } }), { status: 429 });
  await assert.rejects(fetchObservations(), (error: unknown) => error instanceof ApiError && error.status === 429 && error.code === 'RATE_LIMIT_EXCEEDED' && error.message === 'Please retry later.');
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Service unavailable.' } }), { status: 503 });
  await assert.rejects(fetchObservations(), (error: unknown) => error instanceof ApiError && error.status === 503 && error.kind === 'server');
  restore();
});

test('community reads use verified public contracts and reject malformed payloads', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let called = '';
  globalThis.fetch = async (input) => {
    called = String(input);
    return new Response(JSON.stringify({ rows: [{ public_id: 'INV-1', question: 'What evidence is needed?', status: 'open', site_id: null, observation_id: null, passport_id: null, participant_count: 2, evidence_count: 1, vote_count: 2, options: ['Option A', 'Option B'], checklist: [], context: null, category: null, media_ids: [], vote_distribution: [{ option: 'Option A', count: 2, share_pct: 100 }], opened_by_handle: null, viewer_is_owner: false, is_demo: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', disclaimer: 'Community opinion.' }], total: 1 }), { status: 200 });
  };
  const result = await fetchInvestigations();
  assert.equal(called, 'https://earth-talk.test/api/community/investigations?status=open&limit=50&offset=0');
  assert.equal(result.rows[0]?.vote_distribution[0]?.count, 2);
  globalThis.fetch = async () => new Response(JSON.stringify({ rows: [null], total: 1 }), { status: 200 });
  await assert.rejects(fetchInvestigations(), (error: unknown) => error instanceof ApiError && error.kind === 'malformed');
  restore();
});

test('community vote sends only selected option and secure contributor header; server must confirm', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let request: { url: string; init?: RequestInit } = { url: '' };
  globalThis.fetch = async (input, init) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({ option: 'Option A', changed: true, message: 'Your vote was recorded.' }), { status: 200 });
  };
  const result = await castInvestigationVote('INV/1', 'Option A', 'opaque-contributor-token');
  assert.equal(request.url, 'https://earth-talk.test/api/community/investigations/INV%2F1/vote');
  assert.equal(request.init?.method, 'POST');
  assert.equal(new Headers(request.init?.headers).get('X-Contributor-Token'), 'opaque-contributor-token');
  assert.deepEqual(JSON.parse(String(request.init?.body)), { option: 'Option A' });
  assert.equal(result.changed, true);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'CONTRIBUTOR_TOKEN_REQUIRED', message: 'A contributor token is required.' } }), { status: 401 });
  await assert.rejects(castInvestigationVote('INV-1', 'Option A', 'opaque-contributor-token'), (error: unknown) => error instanceof ApiError && error.kind === 'unauthorized');
  restore();
});

test('site visits, comments and pseudonymous token are defensively validated', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/community/contributor-token')) return new Response(JSON.stringify({ contributor_token: '01234567890123456789012345678901', handle_preview: 'Field Explorer #AB12', note: 'Stored locally.' }), { status: 200 });
    if (url.endsWith('/visits')) return new Response(JSON.stringify({ rows: [{ id: 'V1', site_id: 'S1', contributor_handle: 'Field Explorer #1234', visited_on: '2026-01-02', notes: null, media_id: null, created_at: '2026-01-02T00:00:00Z' }] }), { status: 200 });
    return new Response(JSON.stringify({ data: [{ comment_id: 'C1', parent_comment_id: null, author: { public_user_id: 'U1', display_name: 'Community member' }, body: 'A public note.', created_at: '2026-01-02T00:00:00Z', edited_at: null, moderation_status: 'visible', reply_count: 0, replies: [] }], total: 1 }), { status: 200 });
  };
  assert.equal((await fetchContributorToken()).contributor_token.length, 32);
  assert.equal((await fetchSiteVisits('S1')).rows[0]?.contributor_handle, 'Field Explorer #1234');
  assert.equal((await fetchObservationComments('ET-RW-000001')).data[0]?.body, 'A public note.');
  restore();
});

test('site visit writes send the confirmed local date and classify network/malformed failures', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let captured: { url: string; init?: RequestInit } = { url: '' };
  const visit = { id: 'V1', site_id: 'S/1', contributor_handle: 'Field Explorer #1234', visited_on: '2026-10-19', notes: null, media_id: null, created_at: '2026-10-19T08:00:00Z' };
  globalThis.fetch = async (input, init) => { captured = { url: String(input), init }; return new Response(JSON.stringify(visit), { status: 201 }); };
  const result = await recordSiteVisit('S/1', '2026-10-19', 'opaque-contributor-token');
  assert.equal(captured.url, 'https://earth-talk.test/api/community/sites/S%2F1/visits');
  assert.equal(captured.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(captured.init?.body)), { visited_on: '2026-10-19' });
  assert.equal(result.id, 'V1');
  globalThis.fetch = async () => { throw new TypeError('internal network detail'); };
  await assert.rejects(recordSiteVisit('S1', '2026-10-19', 'opaque-contributor-token'), (error: unknown) => error instanceof ApiError && error.kind === 'network' && !error.message.includes('internal network detail'));
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 'V1' }), { status: 201 });
  await assert.rejects(recordSiteVisit('S1', '2026-10-19', 'opaque-contributor-token'), (error: unknown) => error instanceof ApiError && error.kind === 'malformed');
  restore();
});

test('content UI distinguishes loading, error, empty, and success states', () => {
  assert.equal(contentState({ loading: true, error: false, empty: false }), 'loading');
  assert.equal(contentState({ loading: false, error: true, empty: false }), 'error');
  assert.equal(contentState({ loading: false, error: false, empty: true }), 'empty');
  assert.equal(contentState({ loading: false, error: false, empty: false }), 'success');
});

test('pagination stops at the server-reported final page and cards link by real passport id', () => {
  assert.equal(nextObservationPage(1, 3), 2);
  assert.equal(nextObservationPage(3, 3), undefined);
  assert.deepEqual(observationDetailRoute('ET-RW-000001'), { pathname: '/observations/[id]', params: { id: 'ET-RW-000001' } });
});

test('community writes reject invalid inputs and duplicate concurrent actions are suppressed', async () => {
  assert.throws(() => castInvestigationVote('INV-1', ' ', 'opaque-token'), ApiError);
  assert.throws(() => recordSiteVisit('S1', 'today', 'opaque-token'), ApiError);
  const { runOnce } = await import('../utils/actionLock.ts');
  const lock = new Set<string>();
  let calls = 0;
  let release: () => void = () => {};
  const first = runOnce(lock, 'vote:INV-1', () => new Promise<void>((resolve) => { calls += 1; release = resolve; }));
  const duplicate = runOnce(lock, 'vote:INV-1', async () => { calls += 1; });
  await duplicate;
  assert.equal(calls, 1);
  release();
  await first;
  assert.equal(lock.size, 0);
  restore();
});

test('observation card presentation uses returned fields and never shows private coordinates', () => {
  const fields = observationCardViewModel({ ...record, latitude: -1.9, longitude: 30.1 });
  assert.equal(fields.title, 'outcrop');
  assert.equal(fields.location, 'Location kept private');
  assert.equal(fields.description, null);
  assert.equal('latitude' in fields, false);
  assert.equal(fields.verification, 'Unverified');
});

test('native WhatsApp OTP uses verified auth contracts and bearer sessions stay in headers', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const user = { public_user_id: 'USR-1234', display_name: 'Field Reader', is_demo: false, display_name_updated_at: null };
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith('/api/auth/request-code')) return new Response(JSON.stringify({ delivery: 'whatsapp', message: 'A code was sent.', expires_in_seconds: 600 }), { status: 200 });
    if (url.endsWith('/api/auth/verify-code')) return new Response(JSON.stringify({ token: 'rt_session_test_only', expires_at: '2026-10-20T10:00:00Z', user }), { status: 200 });
    if (url.endsWith('/api/auth/session')) return new Response(JSON.stringify({ authenticated: true, user }), { status: 200 });
    if (url.endsWith('/api/auth/profile')) return new Response(JSON.stringify({ user: { ...user, display_name: 'New Name' } }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  assert.equal((await requestAuthCode('+250781234567')).delivery, 'whatsapp');
  assert.equal(JSON.parse(String(calls[0]?.init?.body)).phone, '+250781234567');
  const verified = await verifyAuthCode('+250781234567', '123456');
  assert.equal(verified.token, 'rt_session_test_only');
  assert.equal(JSON.parse(String(calls[1]?.init?.body)).code, '123456');
  assert.equal(calls.some((call) => call.url.includes(verified.token) || String(call.init?.body).includes(verified.token)), false);
  assert.equal((await fetchAuthSession(verified.token)).authenticated, true);
  assert.equal(calls[2]?.init?.headers && new Headers(calls[2].init.headers).get('Authorization'), 'Bearer rt_session_test_only');
  assert.equal((await updateAccountProfile(verified.token, 'New Name')).user.display_name, 'New Name');
  assert.deepEqual(JSON.parse(String(calls[3]?.init?.body)), { display_name: 'New Name' });
  assert.deepEqual(await signOutAuthSession(verified.token), { ok: true });
  restore();
});

test('authenticated observation comment uses the verified route and server response', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let captured: { url: string; init?: RequestInit } = { url: '' };
  const comment = { comment_id: 'C1', parent_comment_id: null, author: { public_user_id: 'USR-1', display_name: 'Field Reader', is_demo: false }, body: 'A field note.', created_at: '2026-10-20T09:00:00Z', edited_at: null, moderation_status: 'visible', reply_count: 0, replies: [], is_demo: false };
  globalThis.fetch = async (input, init) => { captured = { url: String(input), init }; return new Response(JSON.stringify({ comment, message: 'Your comment was posted.' }), { status: 201 }); };
  const result = await createObservationComment('ET-RW-000001', '  A field note.  ', 'rt_session_test_only');
  assert.equal(captured.url, 'https://earth-talk.test/api/posts/ET-RW-000001/comments');
  assert.equal(captured.init?.method, 'POST');
  assert.equal(new Headers(captured.init?.headers).get('Authorization'), 'Bearer rt_session_test_only');
  assert.deepEqual(JSON.parse(String(captured.init?.body)), { body: 'A field note.' });
  assert.equal(result.comment.body, 'A field note.');
  assert.throws(() => createObservationComment('ET-RW-000001', ' ', 'rt_session_test_only'), ApiError);
  restore();
});

test('owner observation history uses the authenticated private route and rejects malformed rows', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let captured: { url: string; init?: RequestInit } = { url: '' };
  globalThis.fetch = async (input, init) => {
    captured = { url: String(input), init };
    return new Response(JSON.stringify({ data: [{ passport_id: 'ET-RW-000009', title: 'Owner record', is_public: false, observation_category: 'rock', created_at: '2026-10-20T09:00:00Z', comment_count: 0, media_count: 1, open_question_count: 0, location_precision: 'exact', latitude: -1.94, longitude: 29.87 }] }), { status: 200 });
  };
  const result = await fetchMyObservations('rt_session_test_only');
  assert.equal(captured.url, 'https://earth-talk.test/api/me/observations');
  assert.equal(new Headers(captured.init?.headers).get('Authorization'), 'Bearer rt_session_test_only');
  assert.equal(result.data[0]?.is_public, false);
  assert.equal(result.data[0]?.latitude, -1.94);
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ passport_id: 'bad' }] }), { status: 200 });
  await assert.rejects(fetchMyObservations('rt_session_test_only'), (error: unknown) => error instanceof ApiError && error.kind === 'malformed');
  restore();
});
<<<<<<< HEAD

test('submitPhotoObservation sends valid payload to /api/observations/submit and parses result', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let captured: { url: string; init?: RequestInit } = { url: '' };
  const mockResponse = {
    status: 'completed',
    passport_id: 'RT-RW-000001',
    category: 'rock',
    subcategory: 'igneous',
    primary_classification: 'igneous',
    possible_name: 'Granite',
    confidence: 'moderate',
    confidence_score: 0.75,
    primary_interpretation: 'Granite outcrop with visible quartz and feldspar.',
    geological_context: 'Rwanda basement complex',
    observed_features: ['Phaneritic texture'],
    diagnostic_features: ['Interlocking crystalline texture'],
    reasoning: 'Plutonic cooling indicators',
    uncertainties: ['Weathering rind'],
    limitations: ['Macroscopic visual analysis only'],
    recommended_next_steps: ['Examine fresh surface'],
    safety_note: 'Watch footing on steep slopes.',
    evidence_state: 'ai_assisted',
    is_public: true,
    media: {
      mime_type: 'image/png',
      file_size_bytes: 512,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    },
    location_attached: true,
    disclaimer: 'AI interpretations are preliminary.',
  };

  globalThis.fetch = async (input, init) => {
    captured = { url: String(input), init };
    return new Response(JSON.stringify(mockResponse), { status: 201 });
  };

  const payload = {
    content_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    mime_type: 'image/png' as const,
    caption: 'Granite sample from Musanze',
    post_title: 'Musanze Granite Outcrop',
    is_public: true,
    location: {
      latitude: -1.498,
      longitude: 29.633,
    },
  };

  const result = await submitPhotoObservation(payload, 'rt_session_test_token');
  assert.equal(captured.url, 'https://earth-talk.test/api/observations/submit');
  assert.equal(captured.init?.method, 'POST');
  assert.equal(new Headers(captured.init?.headers).get('Authorization'), 'Bearer rt_session_test_token');
  assert.equal(result.status, 'completed');
  assert.equal(result.passport_id, 'RT-RW-000001');
  assert.equal(result.category, 'rock');
  assert.equal(result.confidence_score, 0.75);
  assert.equal(result.is_public, true);
  restore();
});

test('sendMobileChatMessage sends valid request to /api/mobile/chat and parses response', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  let captured: { url: string; init?: RequestInit } = { url: '' };
  const mockChatResponse = {
    reply: '🪨 Basalt is a dark, fine-grained igneous rock abundant in Musanze.',
    type: 'text',
    suggested_actions: ['Snap photo', 'Explore map'],
  };

  globalThis.fetch = async (input, init) => {
    captured = { url: String(input), init };
    return new Response(JSON.stringify(mockChatResponse), { status: 200 });
  };

  const { sendMobileChatMessage } = await import('../services/api.ts');
  const result = await sendMobileChatMessage(
    { message: 'Tell me about basalt in Musanze' },
    'rt_session_test_token',
    undefined,
    'contrib_token_0123456789abcdef'
  );

  assert.equal(captured.url, 'https://earth-talk.test/api/mobile/chat');
  assert.equal(captured.init?.method, 'POST');
  assert.equal(new Headers(captured.init?.headers).get('Authorization'), 'Bearer rt_session_test_token');
  assert.equal(new Headers(captured.init?.headers).get('X-Contributor-Token'), 'contrib_token_0123456789abcdef');
  assert.equal(result.type, 'text');
  assert.equal(result.reply.includes('Basalt'), true);
  assert.equal(result.suggested_actions?.length, 2);
  restore();
});

test('sendMobileChatMessage supports photo draft_summary, supporting MP4 attachment, pin confirmation, and EXIF GPS extraction', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (init?.method === 'DELETE' && url.includes('/media/')) {
      return new Response(
        JSON.stringify({
          passport_id: 'RT-RW-000042',
          title: 'Musanze Outcrop',
          observation_category: 'rock',
          observation_subcategory: 'basalt',
          is_public: false,
          is_demo: false,
          created_at: '2026-10-20T09:00:00Z',
          updated_at: '2026-10-20T09:10:00Z',
          owner: { public_user_id: 'USR-1', display_name: 'Geologist', is_demo: false },
          location: {
            address: null,
            district: 'Musanze',
            sector: null,
            cell: null,
            village: null,
            country: 'Rwanda',
            latitude: -1.5008,
            longitude: 29.6342,
            precision: 'private',
            approximate: true,
            privacy_note: 'Private location.',
          },
          user_report: 'Field notes.',
          ai: {
            primary_interpretation: 'Basalt outcrop.',
            observed_features: [],
            diagnostic_features: [],
            reasoning: 'Fine-grained dark matrix.',
            alternative_possibilities: [],
            uncertainties: [],
            limitations: [],
            recommended_next_steps: [],
            safety_note: 'Watch footing.',
            confidence: 'moderate',
            confidence_score: 0.75,
            evidence_state: 'ai_assisted',
            disclaimer: 'Preliminary AI reading.',
          },
          media: [],
          questions: [],
          open_questions: [],
          comment_count: 0,
          can_comment: true,
          viewer_is_owner: true,
          attachments: [],
          same_place: { available: false, count: 0, note: 'Private.', items: [] },
        }),
        { status: 200 }
      );
    }

    const parsedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    if (parsedBody.pin_decision) {
      return new Response(
        JSON.stringify({
          reply: '✅ LOCATION PIN CONFIRMED — RT-RW-000042',
          type: 'passport',
          pending_passport_id: 'RT-RW-000042',
          awaiting_pin_confirmation: false,
          pin_confirmation: {
            passport_id: 'RT-RW-000042',
            is_public: true,
            precision: 'approximate',
            district: 'Musanze',
            public_latitude: -1.5,
            public_longitude: 29.63,
          },
        }),
        { status: 200 }
      );
    }
    if (parsedBody.mime_type === 'video/mp4' && parsedBody.pending_passport_id) {
      return new Response(
        JSON.stringify({
          reply: '🎬 Supporting outcrop video attached to RT-RW-000042 (no AI video analysis).',
          type: 'passport',
          pending_passport_id: 'RT-RW-000042',
          awaiting_pin_confirmation: true,
        }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({
        reply: '🪨 PRELIMINARY PHOTO GEOSCIENCE SUMMARY\n🆔 Geoscience Passport: RT-RW-000042',
        type: 'draft_summary',
        pending_passport_id: 'RT-RW-000042',
        awaiting_pin_confirmation: true,
        questions_for_user: ['Is this outcrop continuous along the road cut?'],
      }),
      { status: 200 }
    );
  };

  const { sendMobileChatMessage, removePostMedia } = await import('../services/api.ts');
  const { buildSampleExifJpegBase64, extractExifFromBase64, distanceBetweenKm } = await import('../utils/exifExtractor.ts');

  // Verify binary EXIF GPS extraction for earlier field photo taken outside the app
  const sampleExifBase64 = buildSampleExifJpegBase64(-1.5008, 29.6342, '2026:03:18 09:42:15');
  const extracted = extractExifFromBase64(sampleExifBase64);
  assert.equal(extracted.hasCoordinates, true);
  assert.equal(Math.abs(extracted.latitude - -1.5008) < 0.001, true);
  assert.equal(Math.abs(extracted.longitude - 29.6342) < 0.001, true);
  assert.equal(extracted.inferredDistrict, 'Musanze');
  assert.equal(extracted.capturedAt, '2026-03-18T09:42:15Z');
  assert.equal(distanceBetweenKm(-1.5008, 29.6342, -1.9501, 30.0588) > 50, true);

  // 1. Primary photo -> GeoAI draft_summary before pin
  const draft = await sendMobileChatMessage(
    {
      media_base64: sampleExifBase64,
      mime_type: 'image/jpeg',
      message: 'Outcrop specimen near Musanze',
      location: { latitude: extracted.latitude, longitude: extracted.longitude, district: 'Musanze' },
    },
    null,
    undefined,
    'contrib_token_0123456789abcdef'
  );

  assert.equal(draft.type, 'draft_summary');
  assert.equal(draft.awaiting_pin_confirmation, true);
  assert.equal(draft.pending_passport_id, 'RT-RW-000042');
  assert.equal(draft.questions_for_user?.[0], 'Is this outcrop continuous along the road cut?');

  // 2. Supporting MP4 video -> attached to pending_passport_id without AI analysis
  const attachedVideo = await sendMobileChatMessage(
    {
      pending_passport_id: 'RT-RW-000042',
      media_base64: 'AAAAGGZ0eXBpc29tAAAAAAAAAAAAAAAA',
      mime_type: 'video/mp4',
      message: '360° outcrop context clip',
    },
    null,
    undefined,
    'contrib_token_0123456789abcdef'
  );
  assert.equal(attachedVideo.type, 'passport');

  // 3. Pin decision confirmation
  const confirmed = await sendMobileChatMessage(
    {
      pending_passport_id: 'RT-RW-000042',
      pin_decision: 'pin_approximate',
      location: { latitude: -1.5008, longitude: 29.6342, district: 'Musanze' },
    },
    null,
    undefined,
    'contrib_token_0123456789abcdef'
  );

  assert.equal(confirmed.type, 'passport');
  assert.equal(confirmed.awaiting_pin_confirmation, false);
  assert.equal(confirmed.pin_confirmation?.is_public, true);
  assert.equal(confirmed.pin_confirmation?.precision, 'approximate');

  // 4. Contributor-token owner can delete supporting media via DELETE /api/posts/:id/media/:mediaId
  const afterRemove = await removePostMedia(
    'RT-RW-000042',
    'M-VID-1',
    null,
    undefined,
    'contrib_token_0123456789abcdef'
  );
  assert.equal(afterRemove.location.precision, 'private');
  assert.equal(calls.length, 4);
  assert.equal(new Headers(calls[3]?.init?.headers).get('X-Contributor-Token'), 'contrib_token_0123456789abcdef');
  restore();
});

test('Web-parity post detail, owner editing, open question answers, media attachment, and threaded comments use exact contracts', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const postPayload = {
    passport_id: 'RT-RW-000099',
    title: 'Private Pegmatite Draft',
    observation_category: 'rock',
    observation_subcategory: 'pegmatite',
    is_public: false,
    is_demo: false,
    created_at: '2026-10-20T09:00:00Z',
    updated_at: '2026-10-20T09:00:00Z',
    owner: { public_user_id: 'USR-1', display_name: 'Geologist', is_demo: false },
    location: {
      address: null,
      district: 'Muhanga',
      sector: null,
      cell: null,
      village: null,
      country: 'Rwanda',
      latitude: null,
      longitude: null,
      precision: 'private' as const,
      approximate: true,
      privacy_note: 'Private location.',
    },
    user_report: 'Coarse feldspar and muscovite books.',
    ai: {
      primary_interpretation: 'Felsic pegmatite vein.',
      observed_features: ['Coarse crystals'],
      diagnostic_features: [],
      reasoning: 'Very coarse interlocking crystals.',
      alternative_possibilities: [],
      uncertainties: [],
      limitations: [],
      recommended_next_steps: [],
      safety_note: 'Caution near steep cuts.',
      confidence: 'moderate',
      confidence_score: 0.72,
      evidence_state: 'ai_assisted',
      disclaimer: 'AI reading only.',
    },
    media: [],
    questions: [
      {
        question_id: 'Q-1',
        question: 'How wide is the vein?',
        asked_by: 'ai' as const,
        asked_at: '2026-10-20T09:00:00Z',
        status: 'open' as const,
        answer: null,
        answered_at: null,
        answered_by: null,
        is_public: false,
        is_demo: false,
      },
    ],
    open_questions: [],
    comment_count: 0,
    can_comment: true,
    viewer_is_owner: true,
    attachments: [],
    same_place: { available: false, count: 0, note: 'No coordinates.', items: [] },
  };

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/media')) {
      return new Response(
        JSON.stringify({
          media: {
            media_id: 'M-1',
            kind: 'image',
            role: 'field',
            caption: 'Scale photo',
            mime_type: 'image/png',
            sort_order: 1,
            url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            poster_url: null,
            available: true,
            is_demo: false,
            demo_note: null,
            created_at: '2026-10-20T09:05:00Z',
          },
        }),
        { status: 201 }
      );
    }
    if (url.endsWith('/comments')) {
      return new Response(
        JSON.stringify({
          comment: {
            comment_id: 'C-2',
            parent_comment_id: 'C-1',
            author: { public_user_id: 'USR-1', display_name: null, is_demo: false },
            body: 'Threaded reply note.',
            created_at: '2026-10-20T09:06:00Z',
            edited_at: null,
            moderation_status: 'visible',
            reply_count: 0,
            replies: [],
          },
          message: 'Reply posted.',
        }),
        { status: 201 }
      );
    }
    return new Response(JSON.stringify(postPayload), { status: 200 });
  };

  const {
    fetchPostDetail,
    updateMyPost,
    answerPostQuestion,
    addPostMedia,
  } = await import('../services/api.ts');

  const detail = await fetchPostDetail('RT-RW-000099', 'rt_session_owner');
  assert.equal(detail?.viewer_is_owner, true);
  assert.equal(detail?.is_public, false);

  const edited = await updateMyPost(
    'RT-RW-000099',
    { post_title: 'Updated Pegmatite', is_public: true, location_precision: 'district' },
    'rt_session_owner'
  );
  assert.equal(edited.passport_id, 'RT-RW-000099');
  assert.equal(calls[1]?.init?.method, 'PATCH');

  const answered = await answerPostQuestion('RT-RW-000099', 'Q-1', 'Approximately 45 cm wide.', 'rt_session_owner');
  assert.equal(answered.passport_id, 'RT-RW-000099');
  assert.equal(calls[2]?.url.endsWith('/api/posts/RT-RW-000099/questions/Q-1/answer'), true);

  const attached = await addPostMedia(
    'RT-RW-000099',
    { content_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', mime_type: 'image/png', caption: 'Scale photo' },
    'rt_session_owner'
  );
  assert.equal(attached.media.media_id, 'M-1');
  assert.equal(safeMediaUrl(attached.media.url)?.startsWith('data:image/png;base64,'), true);

  const reply = await createObservationComment('RT-RW-000099', 'Threaded reply note.', 'rt_session_owner', 'C-1');
  assert.equal(reply.comment.parent_comment_id, 'C-1');
  assert.equal(JSON.parse(String(calls[4]?.init?.body)).parent_comment_id, 'C-1');

  restore();
});

test('Web-parity community investigations, checklists, Q&A, 3-layer Site Explorer, reputation, abuse reports, stats, and comparison match backend shapes', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/community/investigations') && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          public_id: 'INV-99',
          question: 'Columnar jointing or tectonic fractures?',
          status: 'open',
          site_id: null,
          observation_id: null,
          passport_id: 'RT-RW-000001',
          participant_count: 1,
          evidence_count: 0,
          vote_count: 0,
          options: ['Columnar', 'Tectonic'],
          checklist: [{ id: 'chk-1', text: 'Fresh surface', check_count: 0, viewer_checked: false }],
          vote_distribution: [],
          is_demo: false,
          created_at: '2026-10-20T10:00:00Z',
        }),
        { status: 201 }
      );
    }
    if (url.endsWith('/checklist')) {
      return new Response(
        JSON.stringify({ checked: true, check_count: 1, message: 'Marked as something you can provide.' }),
        { status: 200 }
      );
    }
    if (url.endsWith('/api/community/questions') && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          public_id: 'QST-1',
          question: 'How to distinguish muscovite from pyrite?',
          status: 'open',
          site_id: null,
          observation_id: null,
          investigation_id: null,
          passport_id: null,
          answer_count: 0,
          vote_count: 0,
          asked_by_handle: 'Field Explorer #AB12',
          requested_expert: true,
          context: null,
          category: null,
          media_ids: [],
          created_at: '2026-10-20T10:00:00Z',
          updated_at: '2026-10-20T10:00:00Z',
        }),
        { status: 201 }
      );
    }
    if (url.includes('/explorer')) {
      return new Response(
        JSON.stringify({
          site: {
            site_id: 'S-1',
            site_code: 'SITE-RW-01',
            title: 'Musanze Basalt Flow',
            district: 'Musanze',
            description: 'Volcanic flow exposure.',
          },
          observations: [],
          timeline: [{ event_type: 'visit', event_at: '2026-10-20T10:00:00Z', ref_id: 'V-1', summary: 'Site visited' }],
          nearby: [],
          ai_interpretation: null,
          community: {
            investigation_count: 1,
            question_count: 1,
            evidence_count: 0,
            visit_count: 2,
            vote_count: 3,
            participants: 2,
            note: 'Community activity is not scientific confirmation.',
          },
          expert_review: null,
        }),
        { status: 200 }
      );
    }
    if (url.endsWith('/api/community/me/reputation')) {
      return new Response(
        JSON.stringify({
          public_handle: 'Field Explorer #AB12',
          observations_count: 2,
          evidence_count: 1,
          votes_count: 4,
          questions_count: 1,
          answers_count: 2,
          visits_count: 1,
          investigations_count: 1,
          districts_represented: 2,
          achievements: [],
          disclaimer: 'Participation count only.',
        }),
        { status: 200 }
      );
    }
    if (url.endsWith('/api/community/reports')) {
      return new Response(
        JSON.stringify({
          report: {
            public_id: 'RPT-101',
            status: 'open',
            reason_code: 'misleading_claim',
            created_at: '2026-10-20T10:10:00Z',
          },
          message: 'Thank you. Moderators will review this report.',
        }),
        { status: 201 }
      );
    }
    if (url.endsWith('/api/public/stats')) {
      return new Response(
        JSON.stringify({
          total_observations: 18,
          districts_with_observations: 6,
          rock_categories: 3,
          verified_observations: 4,
          unverified_observations: 14,
          recent_observations: 7,
        }),
        { status: 200 }
      );
    }
    if (url.includes('/api/public/observations/compare')) {
      return new Response(
        JSON.stringify({
          comparison: [
            { label: 'Observation category', valueA: 'rock', valueB: 'mineral', note: 'Category comparison.' },
          ],
          expertSeparationNote: 'Independent records.',
        }),
        { status: 200 }
      );
    }
    return new Response(
      JSON.stringify({
        count: 1,
        items: [
          {
            opportunity_id: 'opp-inv-INV-99',
            public_id: 'OPP-INV-INV-99',
            label: 'Potential research opportunity',
            basis: 'community',
            question: 'Columnar jointing or tectonic fractures?',
            summary: 'Columnar jointing or tectonic fractures?',
            observation_category: null,
            observation_subcategory: null,
            site_id: null,
            site_code: null,
            site_title: null,
            district: 'Musanze',
            observation_count: 0,
            investigation_count: 1,
            evidence_count: 0,
            contributor_count: 1,
            highest_evidence_state: null,
            status: 'open',
            created_at: '2026-10-20T10:00:00Z',
            last_activity_at: '2026-10-20T10:00:00Z',
            disclaimer: 'Not scientific confirmation.',
          },
        ],
      }),
      { status: 200 }
    );
  };

  const {
    openCommunityInvestigation,
    toggleInvestigationChecklist,
    askCommunityQuestion,
    fetchSiteExplorer,
    fetchMyReputation,
    fileCommunityAbuseReport,
    fetchPublicStats,
    compareObservations,
    fetchResearchOpportunities,
  } = await import('../services/api.ts');

  const inv = await openCommunityInvestigation(
    { question: 'Columnar jointing or tectonic fractures?', options: ['Columnar', 'Tectonic'], checklist: ['Fresh surface'] },
    'contrib_tok_1234567890123456'
  );
  assert.equal(inv.public_id, 'INV-99');

  const chk = await toggleInvestigationChecklist('INV-99', 'chk-1', true, 'contrib_tok_1234567890123456');
  assert.equal(chk.checked, true);

  const qst = await askCommunityQuestion(
    { question: 'How to distinguish muscovite from pyrite?', requestedExpert: true },
    'contrib_tok_1234567890123456'
  );
  assert.equal(qst.public_id, 'QST-1');

  const explorer = await fetchSiteExplorer('S-1');
  assert.equal(explorer?.site.site_code, 'SITE-RW-01');
  assert.equal(explorer?.community.visit_count, 2);

  const rep = await fetchMyReputation('contrib_tok_1234567890123456');
  assert.equal(rep.public_handle, 'Field Explorer #AB12');
  assert.equal(rep.votes_count, 4);

  const filed = await fileCommunityAbuseReport(
    { target_type: 'observation', target_id: 'RT-RW-000001', reason_code: 'misleading_claim' },
    'contrib_tok_1234567890123456'
  );
  assert.equal(filed.report.public_id, 'RPT-101');

  const stats = await fetchPublicStats();
  assert.equal(stats.districts_with_observations, 6);

  const comp = await compareObservations('RT-RW-000001', 'RT-RW-000002');
  assert.equal(comp.comparison[0]?.valueA, 'rock');

  const opps = await fetchResearchOpportunities();
  assert.equal(opps.count, 1);
  assert.equal(opps.items[0]?.public_id, 'OPP-INV-INV-99');

  const { recordMobileHistory, getMobileHistory, clearMobileHistory } = await import('../services/history.ts');
  await clearMobileHistory();
  await recordMobileHistory({ kind: 'observation', refId: 'RT-RW-000001', title: 'Musanze Basalt', subtitle: 'rock · Musanze' });
  await recordMobileHistory({ kind: 'site', refId: 'S-1', title: 'Musanze Flow', subtitle: 'SITE-RW-01' });
  const hist = await getMobileHistory();
  assert.equal(hist.length, 2);
  assert.equal(hist[0]?.refId, 'S-1');
  await clearMobileHistory();
  assert.equal((await getMobileHistory()).length, 0);

  restore();
});

test('email OTP verification accepts backend camelCase expiresAt and normalizes to expires_at', async () => {
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://earth-talk.test';
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/auth/request-email-code')) {
      return new Response(
        JSON.stringify({ ok: true, delivery: 'email', expires_in_seconds: 600 }),
        { status: 200 }
      );
    }
    if (url.endsWith('/api/auth/verify-email-code')) {
      return new Response(
        JSON.stringify({
          ok: true,
          token: 'rt_session_email_test_token_123456',
          expiresAt: '2026-12-31T23:59:59.000Z',
          user: {
            public_user_id: 'ET-U-EMAIL01',
            display_name: 'Kigali Geologist',
            is_demo: false,
            display_name_updated_at: null,
            email: 'geo@example.rw',
            is_whatsapp_linked: false,
          },
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  };

  const { requestEmailAuthCode, verifyEmailAuthCode } = await import('../services/api.ts');
  const reqRes = await requestEmailAuthCode('geo@example.rw');
  assert.equal(reqRes.ok, true);

  const verified = await verifyEmailAuthCode('geo@example.rw', '123456');
  assert.equal(verified.token, 'rt_session_email_test_token_123456');
  assert.equal(verified.expires_at, '2026-12-31T23:59:59.000Z');
  assert.equal(verified.user.email, 'geo@example.rw');

  restore();
});
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
