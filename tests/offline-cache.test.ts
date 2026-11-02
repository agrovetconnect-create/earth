import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import {
  computeViewportTileUrls,
  formatSlippyTileUrl,
  isCacheableReadPath,
  lonLatToTileXY,
} from '../web/src/services/offlineCache.js';

const ROOT = process.cwd();
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (err: unknown) {
    failed += 1;
    console.log(`FAIL  ${name}`);
    console.log(`      ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Lightweight W3C CacheStorage + ServiceWorkerGlobalScope harness to execute
 * `/public/sw.js` directly in Node and verify real request interception,
 * caching, offline fallback synthesis, and postMessage commands.
 */
function createServiceWorkerHarness(
  networkImpl: (req: Request) => Promise<Response>
) {
  const buckets = new Map<string, Map<string, Response>>();

  const toKey = (reqOrUrl: Request | string): string => {
    const raw = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
    return new URL(raw, 'https://earthtalk.rw').href;
  };

  const openBucket = (name: string) => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    const store = buckets.get(name)!;
    return {
      async add(url: string) {
        const req = new Request(new URL(url, 'https://earthtalk.rw').href);
        const res = await networkImpl(req);
        if (res && res.status === 200) {
          store.set(toKey(req), res.clone());
        }
      },
      async put(reqOrUrl: Request | string, response: Response) {
        const key = toKey(reqOrUrl);
        store.delete(key); // Refresh insertion order for LRU
        store.set(key, response.clone());
      },
      async match(reqOrUrl: Request | string) {
        const hit = store.get(toKey(reqOrUrl));
        return hit ? hit.clone() : undefined;
      },
      async delete(reqOrUrl: Request | string) {
        return store.delete(toKey(reqOrUrl));
      },
      async keys() {
        return Array.from(store.keys()).map((u) => new Request(u));
      },
    };
  };

  const cachesMock = {
    async open(name: string) {
      return openBucket(name);
    },
    async keys() {
      return Array.from(buckets.keys());
    },
    async delete(name: string) {
      return buckets.delete(name);
    },
    async match(reqOrUrl: Request | string) {
      for (const name of buckets.keys()) {
        const hit = await openBucket(name).match(reqOrUrl);
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const listeners = new Map<string, Array<(event: any) => void>>();
  const selfMock: Record<string, any> = {
    location: new URL('https://earthtalk.rw/sw.js'),
    caches: cachesMock,
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    Promise,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Math,
    Date,
    JSON,
    RegExp,
    encodeURIComponent,
    decodeURIComponent,
    fetch: (input: Request | string, init?: RequestInit) => {
      const req =
        input instanceof Request
          ? input
          : new Request(new URL(String(input), 'https://earthtalk.rw').href, init);
      return networkImpl(req);
    },
    skipWaiting: () => Promise.resolve(),
    clients: {
      claim: () => Promise.resolve(),
    },
    addEventListener(type: string, handler: (event: any) => void) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
  };
  selfMock.self = selfMock;

  const swCode = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
  vm.runInNewContext(swCode, selfMock, { filename: 'public/sw.js' });

  return {
    buckets,
    async dispatchInstallAndActivate() {
      for (const type of ['install', 'activate']) {
        const pending: Promise<unknown>[] = [];
        for (const fn of listeners.get(type) ?? []) {
          fn({ waitUntil: (p: Promise<unknown>) => pending.push(p) });
        }
        await Promise.all(pending);
      }
    },
    async dispatchFetch(url: string, init?: RequestInit): Promise<Response | 'BYPASSED'> {
      const request = new Request(new URL(url, 'https://earthtalk.rw').href, init);
      let responded: Promise<Response> | null = null;
      for (const fn of listeners.get('fetch') ?? []) {
        fn({
          request,
          respondWith(p: Promise<Response> | Response) {
            responded = Promise.resolve(p);
          },
        });
      }
      if (!responded) return 'BYPASSED';
      return responded;
    },
    async dispatchMessage(data: Record<string, unknown>): Promise<any> {
      let replyPayload: any = null;
      const pending: Promise<unknown>[] = [];
      const progressEvents: any[] = [];
      for (const fn of listeners.get('message') ?? []) {
        fn({
          data,
          ports: [{ postMessage: (msg: any) => (replyPayload = msg) }],
          source: { postMessage: (msg: any) => progressEvents.push(msg) },
          waitUntil: (p: Promise<unknown>) => pending.push(p),
        });
      }
      await Promise.all(pending);
      return { replyPayload, progressEvents };
    },
  };
}

await test('Web Mercator tile math computes valid bounded tile URLs across all 4 Earth Talk basemaps', () => {
  const kigaliTile = lonLatToTileXY(30.0619, -1.9441, 10);
  assert.equal(kigaliTile.z, 10);
  assert.ok(kigaliTile.x > 500 && kigaliTile.x < 650);
  assert.ok(kigaliTile.y > 500 && kigaliTile.y < 540);

  // ArcGIS satellite & terrain use /{z}/{y}/{x} while OSM & Carto use /{z}/{x}/{y}
  const satUrl = formatSlippyTileUrl('satellite', 10, 597, 517);
  assert.match(satUrl, /\/tile\/10\/517\/597$/);
  const osmUrl = formatSlippyTileUrl('streets', 10, 597, 517);
  assert.match(osmUrl, /\/10\/597\/517\.png$/);

  const bounds = { west: 29.55, south: -1.6, east: 29.75, north: -1.4 };
  for (const basemap of ['map', 'streets', 'satellite', 'terrain'] as const) {
    const urls = computeViewportTileUrls({
      bounds,
      currentZoom: 10,
      basemap,
      maxTiles: 60,
    });
    assert.ok(urls.length > 0 && urls.length <= 60, `${basemap} tile pack is non-empty and bounded`);
  }

  assert.equal(isCacheableReadPath('/api/public/observations.geojson'), true);
  assert.equal(isCacheableReadPath('/api/community/sites.geojson?limit=500'), true);
  assert.equal(isCacheableReadPath('/api/posts/ET-RW-0001'), true);
  assert.equal(isCacheableReadPath('/api/admin/community/reports'), false);
  assert.equal(isCacheableReadPath('/api/me/observations'), false);
});

await test('Service Worker strictly bypasses AI Studio preview scripts, Vite dev modules, and private APIs', async () => {
  const harness = createServiceWorkerHarness(async () => new Response('ok', { status: 200 }));
  await harness.dispatchInstallAndActivate();

  const bypassedPaths = [
    'https://earthtalk.rw/_aistudio-iframe.js?v=123',
    'https://earthtalk.rw/@vite/client',
    'https://earthtalk.rw/@react-refresh',
    'https://earthtalk.rw/node_modules/.vite/deps/react.js?v=abc',
    'https://earthtalk.rw/web/src/App.tsx',
    'https://earthtalk.rw/api/me/observations',
    'https://earthtalk.rw/api/admin/community/reports',
    'https://earthtalk.rw/webhook',
  ];

  for (const url of bypassedPaths) {
    const res = await harness.dispatchFetch(url);
    assert.equal(res, 'BYPASSED', `${url} must not be intercepted by Service Worker`);
  }

  // Non-GET requests must also be bypassed
  const postRes = await harness.dispatchFetch('https://earthtalk.rw/api/posts/ET-1/comments', {
    method: 'POST',
  });
  assert.equal(postRes, 'BYPASSED');
});

await test('Service Worker caches slippy-map raster and vector tiles offline and returns 503 for uncached tiles', async () => {
  let online = true;
  let tileFetchCount = 0;

  const harness = createServiceWorkerHarness(async (req) => {
    if (!online) throw new TypeError('Failed to fetch');
    if (req.url.includes('tile.openstreetmap.org') || req.url.includes('arcgisonline.com')) {
      tileFetchCount += 1;
      return new Response('PNG_TILE_BYTES', {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }
    return new Response('ok', { status: 200 });
  });

  const tileUrl = 'https://tile.openstreetmap.org/10/597/517.png';
  const first = await harness.dispatchFetch(tileUrl);
  assert.ok(first !== 'BYPASSED');
  assert.equal(first.status, 200);
  assert.equal(await first.text(), 'PNG_TILE_BYTES');
  assert.equal(tileFetchCount, 1);

  // Go offline: cached tile still resolves 200 immediately; uncached tile resolves 503 (never undefined!)
  online = false;
  const cachedOffline = await harness.dispatchFetch(tileUrl);
  assert.ok(cachedOffline !== 'BYPASSED');
  assert.equal(cachedOffline.status, 200);
  assert.equal(await cachedOffline.text(), 'PNG_TILE_BYTES');

  const uncachedOffline = await harness.dispatchFetch(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/518/598'
  );
  assert.ok(uncachedOffline !== 'BYPASSED');
  assert.equal(uncachedOffline.status, 503);
});

await test('Service Worker caches geological observations GeoJSON and synthesizes filtered queries + passports when offline', async () => {
  let online = true;
  const geojsonFixture = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [29.634, -1.501] },
        properties: {
          passport_id: 'ET-TEST-0101',
          post_title: 'Northern Rift Outcrop',
          observation_category: 'rock',
          observation_subcategory: 'volcanic',
          classification: 'igneous',
          confidence: 'high',
          confidence_score: 0.85,
          evidence_state: 'ai_assisted',
          verification_status: 'unverified',
          district: 'Musanze',
          location_precision: 'approximate',
          created_at: '2026-03-01T10:00:00.000Z',
        },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [30.061, -1.944] },
        properties: {
          passport_id: 'ET-TEST-0102',
          post_title: 'Central Ridge Exposure',
          observation_category: 'geological_structure',
          observation_subcategory: 'fold',
          classification: 'metamorphic',
          confidence: 'medium',
          confidence_score: 0.72,
          evidence_state: 'community_supported',
          verification_status: 'unverified',
          district: 'Gasabo',
          location_precision: 'exact',
          created_at: '2026-03-02T10:00:00.000Z',
        },
      },
    ],
  };

  const harness = createServiceWorkerHarness(async (req) => {
    if (!online) throw new TypeError('Network unreachable');
    const u = new URL(req.url);
    if (u.pathname === '/api/public/observations.geojson' && !u.search) {
      return new Response(JSON.stringify(geojsonFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });

  // Load unfiltered GeoJSON while online
  const initialRes = await harness.dispatchFetch(
    'https://earthtalk.rw/api/public/observations.geojson'
  );
  assert.ok(initialRes !== 'BYPASSED');
  assert.equal(initialRes.status, 200);

  // Switch offline
  online = false;

  // 1. Unfiltered GeoJSON loads from cache
  const offlineBase = await harness.dispatchFetch(
    'https://earthtalk.rw/api/public/observations.geojson'
  );
  assert.ok(offlineBase !== 'BYPASSED');
  assert.equal(offlineBase.status, 200);
  const baseBody = await offlineBase.json();
  assert.equal(baseBody.features.length, 2);

  // 2. Filtered GeoJSON query (?district=Musanze&category=rock) is synthesized offline from cached base GeoJSON!
  const offlineFiltered = await harness.dispatchFetch(
    'https://earthtalk.rw/api/public/observations.geojson?district=Musanze&category=rock'
  );
  assert.ok(offlineFiltered !== 'BYPASSED');
  assert.equal(offlineFiltered.status, 200);
  const filteredBody = await offlineFiltered.json();
  assert.equal(filteredBody.features.length, 1);
  assert.equal(filteredBody.features[0].properties.passport_id, 'ET-TEST-0101');

  // 3. Clicking pin ET-TEST-0101 offline synthesizes a read-only passport card from cached GeoJSON!
  const offlinePassport = await harness.dispatchFetch(
    'https://earthtalk.rw/api/posts/ET-TEST-0101'
  );
  assert.ok(offlinePassport !== 'BYPASSED');
  assert.equal(offlinePassport.status, 200);
  const passportBody = await offlinePassport.json();
  assert.equal(passportBody.passport_id, 'ET-TEST-0101');
  assert.equal(passportBody.location.district, 'Musanze');

  // 4. Unknown passport offline returns honest HTTP 503
  const missingPassport = await harness.dispatchFetch(
    'https://earthtalk.rw/api/posts/ET-DOES-NOT-EXIST'
  );
  assert.ok(missingPassport !== 'BYPASSED');
  assert.equal(missingPassport.status, 503);
});

await test('Service Worker PREFETCH_OFFLINE_PACK, GET_OFFLINE_CACHE_STATS, and CLEAR_OFFLINE_CACHE message protocol works end-to-end', async () => {
  const harness = createServiceWorkerHarness(async (req) => {
    if (req.url.endsWith('/api/public/observations.geojson')) {
      return new Response(
        JSON.stringify({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [30, -2] }, properties: { passport_id: 'ET-1' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (req.url.includes('/api/community/sites.geojson')) {
      return new Response(
        JSON.stringify({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [30, -2] }, properties: { site_id: 'S-1' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('ASSET_BYTES', { status: 200 });
  });

  const prefetch = await harness.dispatchMessage({
    type: 'PREFETCH_OFFLINE_PACK',
    tileUrls: [
      'https://tile.openstreetmap.org/9/298/258.png',
      'https://tile.openstreetmap.org/9/298/259.png',
    ],
    styleUrls: ['https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'],
    observationUrls: [
      '/api/public/observations.geojson',
      '/api/community/sites.geojson?limit=500',
      '/api/posts/ET-1',
    ],
  });

  assert.equal(prefetch.replyPayload?.type, 'OFFLINE_PACK_COMPLETE');
  assert.equal(prefetch.replyPayload?.stats.cachedTiles, 2);
  assert.equal(prefetch.replyPayload?.stats.cachedObservations, 1);
  assert.equal(prefetch.replyPayload?.stats.cachedSites, 1);
  assert.equal(prefetch.replyPayload?.stats.cachedPassports, 1);
  assert.ok(prefetch.replyPayload?.stats.lastSyncedAt);
  assert.equal(prefetch.progressEvents.length, 6);

  const cleared = await harness.dispatchMessage({ type: 'CLEAR_OFFLINE_CACHE' });
  assert.equal(cleared.replyPayload?.type, 'OFFLINE_CACHE_CLEARED');
  assert.equal(cleared.replyPayload?.stats.cachedTiles, 0);
  assert.equal(cleared.replyPayload?.stats.cachedObservations, 0);
});

await test('PWA manifest, compliant PNG icons, viewport meta tag, and web/mobile offline UI wiring are present', () => {
  const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(indexHtml, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1\.0/);
  assert.match(indexHtml, /rel="apple-touch-icon"\s+href="\/apple-touch-icon\.png"/);
  assert.match(indexHtml, /rel="manifest"\s+href="\/app\.webmanifest"/);

  const manifest = JSON.parse(readFileSync(join(ROOT, 'public/app.webmanifest'), 'utf8'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.short_name.length <= 12);
  assert.ok(manifest.icons.some((i: any) => i.sizes === '192x192' && i.purpose === 'any'));
  assert.ok(manifest.icons.some((i: any) => i.sizes === '512x512' && i.purpose === 'any'));
  assert.ok(manifest.icons.some((i: any) => i.sizes === '512x512' && i.purpose === 'maskable'));

  for (const [file, dim] of [
    ['public/pwa-192x192.png', 192],
    ['public/pwa-512x512.png', 512],
    ['public/pwa-maskable-512x512.png', 512],
    ['public/apple-touch-icon.png', 180],
  ] as const) {
    assert.equal(existsSync(join(ROOT, file)), true, `${file} exists`);
    const buf = readFileSync(join(ROOT, file));
    assert.equal(buf.readUInt32BE(16), dim, `${file} width is ${dim}`);
    assert.equal(buf.readUInt32BE(20), dim, `${file} height is ${dim}`);
  }

  assert.equal(existsSync(join(ROOT, 'mobile/public/sw.js')), true, 'mobile web Service Worker is synced');
  assert.equal(existsSync(join(ROOT, 'mobile/services/offlineCache.ts')), true, 'mobile offline cache service exists');
});

console.log(`\n${'='.repeat(60)}`);
console.log(`Offline Service Worker & Tile/Observation Cache: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));
if (failed > 0) process.exit(1);
