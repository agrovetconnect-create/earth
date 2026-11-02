const CACHE_VERSION = 'v3';
const SHELL_CACHE = `earthtalk-shell-${CACHE_VERSION}`;
const MAP_STYLE_CACHE = `earthtalk-map-styles-${CACHE_VERSION}`;
const MAP_TILE_CACHE = `earthtalk-map-tiles-${CACHE_VERSION}`;
const OBS_DATA_CACHE = `earthtalk-observations-${CACHE_VERSION}`;

const VALID_CACHES = new Set([
  SHELL_CACHE,
  MAP_STYLE_CACHE,
  MAP_TILE_CACHE,
  OBS_DATA_CACHE,
]);

const MAX_TILE_ENTRIES = 800;
const MAX_MEDIA_ENTRIES = 160;
const OFFLINE_META_URL = '/__earthtalk_offline_meta__';

const STATIC_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/app.webmanifest',
  '/icon.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
  '/logo-no-subtitle.png',
  '/logo_withsubtitle.png',
  '/flag-en.svg',
  '/flag-fr.svg',
  '/maplibre-gl-worker.mjs',
  '/maplibre-gl-shared.mjs',
];

const TILE_HOST_PATTERNS = [
  'tile.openstreetmap.org',
  'server.arcgisonline.com',
  'services.arcgisonline.com',
];

const STYLE_AND_VECTOR_HOST_PATTERNS = [
  'basemaps.cartocdn.com',
  'cartocdn.com',
  'fonts.openmaptiles.org',
  'demotiles.maplibre.org',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.allSettled(STATIC_SHELL_ASSETS.map((asset) => cache.add(asset)))
      )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (!VALID_CACHES.has(key)) {
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      );
      await self.clients.claim();
    })()
  );
});

function isBypassedRequest(request, url) {
  if (request.method !== 'GET') return true;
  if (!url.protocol.startsWith('http')) return true;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return true;

  const p = url.pathname;
  // Never intercept AI Studio preview scripts, Vite dev modules, source files, or private admin/auth endpoints
  if (
    p.startsWith('/_aistudio') ||
    p.startsWith('/@vite') ||
    p.startsWith('/@fs') ||
    p.startsWith('/@id') ||
    p.startsWith('/@react-refresh') ||
    p.startsWith('/node_modules/') ||
    p.startsWith('/web/') ||
    p.startsWith('/src/') ||
    p.endsWith('.tsx') ||
    p.endsWith('.ts') ||
    url.searchParams.has('import') ||
    url.searchParams.has('direct') ||
    (url.origin === self.location.origin && url.searchParams.has('t') && p.includes('/'))
  ) {
    return true;
  }

  return false;
}

function isMapTileUrl(url) {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (TILE_HOST_PATTERNS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return true;
  }

  if (STYLE_AND_VECTOR_HOST_PATTERNS.some((h) => host === h || host.endsWith(`.${h}`))) {
    // Slippy-map vector/raster tiles (.pbf, .mvt, /{z}/{x}/{y}.png) go in bounded tile cache
    if (
      path.endsWith('.pbf') ||
      path.endsWith('.mvt') ||
      /\/\d+\/\d+\/\d+(\.[a-z0-9]+|@2x\.[a-z0-9]+)?$/i.test(path)
    ) {
      // Glyph font ranges look like /fonts/{fontstack}/{range}.pbf -> keep those in MAP_STYLE_CACHE
      if (path.includes('/fonts/') || path.includes('glyph')) {
        return false;
      }
      return true;
    }
  }

  return false;
}

function isMapStyleOrAssetUrl(url) {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (url.origin === self.location.origin) {
    return (
      path === '/maplibre-gl-worker.mjs' ||
      path === '/maplibre-gl-shared.mjs' ||
      path === '/maplibre-gl-worker.mjs.map'
    );
  }

  return STYLE_AND_VECTOR_HOST_PATTERNS.some((h) => host === h || host.endsWith(`.${h}`));
}

function isObservationMediaPath(pathname) {
  if (pathname.startsWith('/media/')) return true;
  return /^\/api\/posts\/[^/]+\/media\/[^/]+$/.test(pathname);
}

function isCacheableObservationApi(pathname) {
  if (pathname.startsWith('/api/public/')) return true;
  if (pathname === '/api/community/sites.geojson' || pathname === '/api/community/sites') return true;
  if (/^\/api\/community\/sites\/[^/]+\/(explorer|timeline|visits)$/.test(pathname)) return true;
  if (/^\/api\/posts\/[^/]+$/.test(pathname)) return true;
  if (/^\/api\/posts\/[^/]+\/(comments|same-place)$/.test(pathname)) return true;
  return false;
}

function isCacheableResponse(response) {
  if (!response) return false;
  return response.status === 200 || response.type === 'opaque';
}

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const overflow = keys.length - maxEntries;
    if (overflow > 0) {
      await Promise.all(
        keys
          .filter((req) => !req.url.endsWith(OFFLINE_META_URL))
          .slice(0, overflow)
          .map((req) => cache.delete(req))
      );
    }
  } catch {
    // Ignore storage trim errors
  }
}

function filterGeoJsonCollection(collection, searchParams) {
  if (!collection || !Array.isArray(collection.features)) return null;

  const district = (searchParams.get('district') || '').trim().toLowerCase();
  const category = (searchParams.get('category') || '').trim().toLowerCase();
  const subcategory = (searchParams.get('subcategory') || '').trim().toLowerCase();
  const classification = (searchParams.get('classification') || '').trim().toLowerCase();
  const confidence = (searchParams.get('confidence') || '').trim().toLowerCase();
  const verification = (searchParams.get('verification') || '').trim().toLowerCase();
  const evidenceState = (searchParams.get('evidence_state') || '').trim().toLowerCase();
  const search = (searchParams.get('search') || '').trim().toLowerCase();
  const bboxRaw = (searchParams.get('bbox') || '').trim();

  let bbox = null;
  if (bboxRaw) {
    const parts = bboxRaw.split(',').map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      bbox = parts; // [minLng, minLat, maxLng, maxLat]
    }
  }

  const features = collection.features.filter((feature) => {
    const p = (feature && feature.properties) || {};
    if (district && String(p.district || '').toLowerCase() !== district) return false;
    if (category) {
      const obsCat = String(p.observation_category || '').toLowerCase();
      const siteCats = Array.isArray(p.observed_classifications)
        ? p.observed_classifications.map((v) => String(v).toLowerCase())
        : [];
      if (obsCat !== category && !siteCats.includes(category)) return false;
    }
    if (subcategory && String(p.observation_subcategory || '').toLowerCase() !== subcategory) {
      return false;
    }
    if (classification) {
      const cls = String(p.classification || p.primary_classification || '').toLowerCase();
      if (!cls.includes(classification)) return false;
    }
    if (confidence && String(p.confidence || '').toLowerCase() !== confidence) return false;
    if (verification && String(p.verification_status || '').toLowerCase() !== verification) {
      return false;
    }
    if (evidenceState) {
      const ev = String(p.evidence_state || p.highest_evidence_state || '').toLowerCase();
      if (ev !== evidenceState) return false;
    }
    if (bbox && feature.geometry && Array.isArray(feature.geometry.coordinates)) {
      const [lng, lat] = feature.geometry.coordinates;
      if (
        typeof lng === 'number' &&
        typeof lat === 'number' &&
        (lng < bbox[0] || lat < bbox[1] || lng > bbox[2] || lat > bbox[3])
      ) {
        return false;
      }
    }
    if (search) {
      const haystack = [
        p.passport_id,
        p.post_title,
        p.possible_name,
        p.title,
        p.site_code,
        p.primary_classification,
        p.observation_category,
        p.observation_subcategory,
        p.district,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

function synthesizePostDetailFromFeature(feature) {
  if (!feature || !feature.properties) return null;
  const p = feature.properties;
  const coords =
    feature.geometry && Array.isArray(feature.geometry.coordinates)
      ? feature.geometry.coordinates
      : [null, null];
  const longitude = typeof coords[0] === 'number' ? coords[0] : null;
  const latitude = typeof coords[1] === 'number' ? coords[1] : null;
  const createdAt = p.created_at || new Date(0).toISOString();
  const passportId = String(p.passport_id || '');
  if (!passportId) return null;

  const rawScore = typeof p.confidence_score === 'number' ? p.confidence_score : 0.7;
  const normalizedScore = rawScore > 1 ? rawScore / 100 : rawScore;

  return {
    passport_id: passportId,
    title: p.post_title || p.possible_name || p.primary_classification || passportId,
    observation_category: p.observation_category || 'unknown',
    observation_subcategory: p.observation_subcategory || 'unclassified',
    is_public: true,
    is_demo: Boolean(p.is_demo),
    created_at: createdAt,
    updated_at: createdAt,
    owner: {
      public_user_id: 'ET-OFFLINE',
      display_name: 'Cached Field Record',
      is_demo: Boolean(p.is_demo),
    },
    location: {
      address: null,
      district: p.district || null,
      sector: null,
      cell: null,
      village: null,
      country: 'Rwanda',
      latitude,
      longitude,
      precision: p.location_precision || 'approximate',
      approximate: p.location_precision !== 'exact',
      privacy_note: 'Loaded from offline map cache.',
    },
    user_report: 'Viewing cached field summary saved for offline map access.',
    ai: {
      primary_interpretation:
        p.primary_interpretation ||
        p.primary_classification ||
        p.possible_name ||
        'Cached geoscience observation.',
      observed_features: p.observation_category
        ? [`Recorded category: ${String(p.observation_category).replace(/_/g, ' ')}`]
        : [],
      diagnostic_features: [],
      reasoning:
        'Full narrative details sync automatically when your connection returns; displaying verified map summary from local cache.',
      alternative_possibilities: [],
      uncertainties: ['Offline cache summary — reconnect to refresh full discussion and attachments.'],
      limitations: ['Offline mode shows locally cached observation metadata.'],
      recommended_next_steps: ['Reconnect to view live comments or newly uploaded media.'],
      safety_note:
        'Field safety: Observe outcrops from stable ground and respect local land access rules.',
      confidence: p.confidence || 'medium',
      confidence_score: normalizedScore,
      evidence_state: p.evidence_state || 'ai_assisted',
      disclaimer: 'Preliminary citizen science record (offline cached copy).',
    },
    media: p.primary_media_url
      ? [
          {
            media_id: `${passportId}-cached-main`,
            kind: 'image',
            role: 'main',
            caption: p.post_title || p.possible_name || passportId,
            mime_type: 'image/jpeg',
            sort_order: 0,
            url: p.primary_media_url,
            poster_url: null,
            available: true,
            is_demo: Boolean(p.is_demo),
            demo_note: null,
            created_at: createdAt,
          },
        ]
      : [],
    questions: [],
    open_questions: [],
    comment_count: 0,
    can_comment: false,
    viewer_is_owner: false,
    attachments: [],
    same_place: { available: false, count: 0, note: 'Offline mode', items: [] },
  };
}

async function resolveOfflineApiFallback(cache, request, url) {
  // 1. Exact request or URL match (ignoreVary so headers difference doesn't miss)
  const exact =
    (await cache.match(request, { ignoreVary: true })) ||
    (await cache.match(url.pathname + url.search, { ignoreVary: true }));
  if (exact) return exact;

  // 2. Filtered observations GeoJSON fallback from cached base collection
  if (url.pathname === '/api/public/observations.geojson') {
    const baseRes = await cache.match('/api/public/observations.geojson', { ignoreVary: true });
    if (baseRes) {
      const baseJson = await baseRes.json().catch(() => null);
      const filtered = filterGeoJsonCollection(baseJson, url.searchParams);
      if (filtered) {
        return new Response(JSON.stringify(filtered), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-EarthTalk-Cache': 'synthesized-offline',
          },
        });
      }
    }
  }

  // 3. Filtered sites GeoJSON fallback from cached base sites collection
  if (url.pathname === '/api/community/sites.geojson') {
    const baseSites =
      (await cache.match('/api/community/sites.geojson?limit=500', { ignoreVary: true })) ||
      (await cache.match('/api/community/sites.geojson', { ignoreVary: true }));
    if (baseSites) {
      const baseJson = await baseSites.json().catch(() => null);
      const filtered = filterGeoJsonCollection(baseJson, url.searchParams);
      if (filtered) {
        return new Response(JSON.stringify(filtered), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-EarthTalk-Cache': 'synthesized-offline',
          },
        });
      }
    }
  }

  // 4. Individual passport fallback synthesized from cached observations.geojson
  const postMatch = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
  if (postMatch) {
    const passportId = decodeURIComponent(postMatch[1]);
    const baseRes = await cache.match('/api/public/observations.geojson', { ignoreVary: true });
    if (baseRes) {
      const baseJson = await baseRes.json().catch(() => null);
      const feature =
        baseJson &&
        Array.isArray(baseJson.features) &&
        baseJson.features.find(
          (f) => f && f.properties && String(f.properties.passport_id) === passportId
        );
      const synthesized = synthesizePostDetailFromFeature(feature);
      if (synthesized) {
        return new Response(JSON.stringify(synthesized), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-EarthTalk-Cache': 'synthesized-offline',
          },
        });
      }
    }
  }

  if (/^\/api\/posts\/[^/]+\/comments$/.test(url.pathname)) {
    return new Response(JSON.stringify({ data: [], total: 0 }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-EarthTalk-Cache': 'synthesized-offline',
      },
    });
  }

  if (/^\/api\/posts\/[^/]+\/same-place$/.test(url.pathname)) {
    return new Response(
      JSON.stringify({ available: false, count: 0, note: 'Offline mode', items: [] }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-EarthTalk-Cache': 'synthesized-offline',
        },
      }
    );
  }

  return null;
}

async function handleTileRequest(request) {
  const cache = await caches.open(MAP_TILE_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) {
    // Opportunistic background refresh without blocking immediate offline/cached tile render
    fetch(request)
      .then((res) => {
        if (isCacheableResponse(res)) {
          return cache.put(request, res.clone());
        }
      })
      .catch(() => {});
    return cached;
  }

  try {
    const networkResponse = await fetch(request);
    if (isCacheableResponse(networkResponse)) {
      cache
        .put(request, networkResponse.clone())
        .then(() => trimCache(MAP_TILE_CACHE, MAX_TILE_ENTRIES))
        .catch(() => {});
    }
    return networkResponse;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline tile' });
  }
}

async function handleStyleOrAssetRequest(request) {
  const cache = await caches.open(MAP_STYLE_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  const networkPromise = fetch(request)
    .then((res) => {
      if (isCacheableResponse(res)) {
        cache.put(request, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const fresh = await networkPromise;
  if (fresh) return fresh;
  return new Response('', { status: 503, statusText: 'Offline style asset' });
}

async function handleMediaRequest(request) {
  const cache = await caches.open(OBS_DATA_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (isCacheableResponse(networkResponse)) {
      cache
        .put(request, networkResponse.clone())
        .then(() => trimCache(OBS_DATA_CACHE, MAX_MEDIA_ENTRIES + 120))
        .catch(() => {});
    }
    return networkResponse;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline media' });
  }
}

async function handleObservationApiRequest(request, url) {
  const cache = await caches.open(OBS_DATA_CACHE);
  const hasAuth =
    request.headers.has('Authorization') || request.headers.has('X-Contributor-Token');

  try {
    const networkResponse = await fetch(request);
    // Only write unauthenticated public representations (or non-private public GeoJSON/lists) to shared offline cache
    if (networkResponse && networkResponse.status === 200) {
      if (!hasAuth || url.pathname.startsWith('/api/public/')) {
        cache.put(url.pathname + url.search, networkResponse.clone()).catch(() => {});
      }
    }
    return networkResponse;
  } catch {
    const fallback = await resolveOfflineApiFallback(cache, request, url);
    if (fallback) return fallback;

    return new Response(
      JSON.stringify({ error: 'Offline — observation data is not yet cached on this device.' }),
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

self.addEventListener('fetch', (event) => {
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }

  if (isBypassedRequest(event.request, url)) {
    return;
  }

  // 1. Slippy-map raster & vector tiles (cross-origin & same-origin)
  if (isMapTileUrl(url)) {
    event.respondWith(handleTileRequest(event.request));
    return;
  }

  // 2. MapLibre style JSON, sprites, glyphs & WebWorker bundle
  if (isMapStyleOrAssetUrl(url)) {
    event.respondWith(handleStyleOrAssetRequest(event.request));
    return;
  }

  // Do not intercept any other cross-origin requests (e.g., fonts/CDN scripts)
  if (url.origin !== self.location.origin) {
    return;
  }

  // 3. Observation field photos & static media
  if (isObservationMediaPath(url.pathname)) {
    event.respondWith(handleMediaRequest(event.request));
    return;
  }

  // 4. Geological observations, geoscience sites & public passports
  if (isCacheableObservationApi(url.pathname)) {
    event.respondWith(handleObservationApiRequest(event.request, url));
    return;
  }

  // 5. Never intercept other /api, /webhook, or /internal endpoints
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/webhook') ||
    url.pathname.startsWith('/internal')
  ) {
    return;
  }

  // 6. Production static shell & SPA navigation (Network-First with offline shell fallback)
  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(event.request, networkResponse.clone()).catch(() => {});
        }
        return networkResponse;
      } catch {
        const cached = await caches.match(event.request, { ignoreVary: true });
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          const shell =
            (await caches.match('/index.html', { ignoreVary: true })) ||
            (await caches.match('/', { ignoreVary: true }));
          if (shell) return shell;
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});

async function computeCacheStats() {
  const [tileCache, styleCache, obsCache] = await Promise.all([
    caches.open(MAP_TILE_CACHE),
    caches.open(MAP_STYLE_CACHE),
    caches.open(OBS_DATA_CACHE),
  ]);

  const [tileKeys, styleKeys, obsKeys] = await Promise.all([
    tileCache.keys(),
    styleCache.keys(),
    obsCache.keys(),
  ]);

  let cachedObservations = 0;
  let cachedSites = 0;
  let lastSyncedAt = null;

  const baseObsRes = await obsCache.match('/api/public/observations.geojson', {
    ignoreVary: true,
  });
  if (baseObsRes) {
    const obsJson = await baseObsRes.json().catch(() => null);
    if (obsJson && Array.isArray(obsJson.features)) {
      cachedObservations = obsJson.features.length;
    }
  }

  const baseSitesRes =
    (await obsCache.match('/api/community/sites.geojson?limit=500', { ignoreVary: true })) ||
    (await obsCache.match('/api/community/sites.geojson', { ignoreVary: true }));
  if (baseSitesRes) {
    const sitesJson = await baseSitesRes.json().catch(() => null);
    if (sitesJson && Array.isArray(sitesJson.features)) {
      cachedSites = sitesJson.features.length;
    }
  }

  const metaRes = await obsCache.match(OFFLINE_META_URL, { ignoreVary: true });
  if (metaRes) {
    const meta = await metaRes.json().catch(() => null);
    if (meta && typeof meta.lastSyncedAt === 'string') {
      lastSyncedAt = meta.lastSyncedAt;
    }
  }

  const cachedPassports = obsKeys.filter((req) => {
    try {
      const u = new URL(req.url);
      return /^\/api\/posts\/[^/]+$/.test(u.pathname);
    } catch {
      return false;
    }
  }).length;

  return {
    swActive: true,
    cachedTiles: tileKeys.length,
    cachedStyles: styleKeys.length,
    cachedObservations,
    cachedSites,
    cachedPassports,
    lastSyncedAt,
  };
}

async function batchCacheUrls(cache, urls, options, onItemDone) {
  const concurrency = 6;
  let index = 0;
  async function worker() {
    while (index < urls.length) {
      const current = urls[index++];
      try {
        const resolvedUrl = new URL(current, self.location.origin).href;
        const existing = options.skipExisting
          ? await cache.match(resolvedUrl, { ignoreVary: true })
          : null;
        if (!existing) {
          const req = options.crossOriginTile
            ? new Request(resolvedUrl, { mode: 'cors', credentials: 'omit' })
            : new Request(resolvedUrl, { credentials: 'same-origin' });
          let res;
          try {
            res = await fetch(req);
          } catch {
            if (options.crossOriginTile) {
              res = await fetch(
                new Request(resolvedUrl, { mode: 'no-cors', credentials: 'omit' })
              );
            }
          }
          if (res && isCacheableResponse(res)) {
            await cache.put(resolvedUrl, res.clone());
          }
        }
      } catch {
        // Individual tile/record hiccup never aborts the pack
      } finally {
        onItemDone();
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, urls.length)) }, () =>
    worker()
  );
  await Promise.all(workers);
}

self.addEventListener('message', (event) => {
  const data = event.data || {};
  const reply = (payload) => {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(payload);
    } else if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage(payload);
    }
  };

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'GET_OFFLINE_CACHE_STATS') {
    event.waitUntil(
      computeCacheStats()
        .then((stats) => reply({ type: 'OFFLINE_CACHE_STATS', stats }))
        .catch(() =>
          reply({
            type: 'OFFLINE_CACHE_STATS',
            stats: {
              swActive: true,
              cachedTiles: 0,
              cachedStyles: 0,
              cachedObservations: 0,
              cachedSites: 0,
              cachedPassports: 0,
              lastSyncedAt: null,
            },
          })
        )
    );
    return;
  }

  if (data.type === 'CLEAR_OFFLINE_CACHE') {
    event.waitUntil(
      (async () => {
        await Promise.all([
          caches.delete(MAP_TILE_CACHE),
          caches.delete(MAP_STYLE_CACHE),
          caches.delete(OBS_DATA_CACHE),
        ]);
        const stats = await computeCacheStats();
        reply({ type: 'OFFLINE_CACHE_CLEARED', stats });
      })()
    );
    return;
  }

  if (data.type === 'PREFETCH_OFFLINE_PACK') {
    const tileUrls = Array.isArray(data.tileUrls) ? data.tileUrls.slice(0, 250) : [];
    const styleUrls = Array.isArray(data.styleUrls) ? data.styleUrls.slice(0, 30) : [];
    const observationUrls = Array.isArray(data.observationUrls)
      ? data.observationUrls.slice(0, 120)
      : [];

    const total = tileUrls.length + styleUrls.length + observationUrls.length;
    let completed = 0;

    const notifyProgress = () => {
      completed += 1;
      if (event.source && typeof event.source.postMessage === 'function') {
        event.source.postMessage({
          type: 'OFFLINE_PACK_PROGRESS',
          completed,
          total,
        });
      }
    };

    event.waitUntil(
      (async () => {
        const [tileCache, styleCache, obsCache] = await Promise.all([
          caches.open(MAP_TILE_CACHE),
          caches.open(MAP_STYLE_CACHE),
          caches.open(OBS_DATA_CACHE),
        ]);

        await batchCacheUrls(
          obsCache,
          observationUrls,
          { skipExisting: false, crossOriginTile: false },
          notifyProgress
        );
        await batchCacheUrls(
          styleCache,
          styleUrls,
          { skipExisting: false, crossOriginTile: true },
          notifyProgress
        );
        await batchCacheUrls(
          tileCache,
          tileUrls,
          { skipExisting: true, crossOriginTile: true },
          notifyProgress
        );

        await trimCache(MAP_TILE_CACHE, MAX_TILE_ENTRIES);

        const syncedAt = new Date().toISOString();
        await obsCache.put(
          OFFLINE_META_URL,
          new Response(JSON.stringify({ lastSyncedAt: syncedAt }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );

        const stats = await computeCacheStats();
        reply({ type: 'OFFLINE_PACK_COMPLETE', stats });
      })()
    );
  }
});
