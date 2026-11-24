import { MAP_CONFIG } from '../config/map.js';

export const OFFLINE_CACHE_BUCKETS = {
  shell: 'earthtalk-shell-v3',
  styles: 'earthtalk-map-styles-v3',
  tiles: 'earthtalk-map-tiles-v3',
  observations: 'earthtalk-observations-v3',
} as const;

const OFFLINE_META_URL = '/__earthtalk_offline_meta__';
const MAX_CLIENT_TILES = 800;

export type OfflineBasemapId = 'map' | 'streets' | 'satellite' | 'terrain';

export interface GeoBoundsBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface OfflineCacheStats {
  swActive: boolean;
  cachedTiles: number;
  cachedStyles: number;
  cachedObservations: number;
  cachedSites: number;
  cachedPassports: number;
  lastSyncedAt: string | null;
}

export interface OfflinePrefetchProgress {
  completed: number;
  total: number;
}

export interface OfflineViewportSnapshot {
  bounds: GeoBoundsBox;
  zoom: number;
  basemap: OfflineBasemapId;
  passportIdsInBounds: string[];
  mediaUrlsInBounds: string[];
}

const TILE_TEMPLATES: Record<OfflineBasemapId, string> = {
  map: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  streets: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  satellite:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  terrain:
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
};

const EMPTY_STATS: OfflineCacheStats = {
  swActive: false,
  cachedTiles: 0,
  cachedStyles: 0,
  cachedObservations: 0,
  cachedSites: 0,
  cachedPassports: 0,
  lastSyncedAt: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignore subscriber errors
    }
  });
}

export function subscribeOfflineCache(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Registers `/sw.js` across desktop web, responsive mobile web, and installed
 * standalone PWA sessions. If browser privacy partitioning blocks Service Worker
 * registration (e.g. restricted cross-site iframe), resolves `null` cleanly so
 * the CacheStorage fallback layer continues to operate without errors.
 */
export function registerOfflineServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  if (swRegistrationPromise) return swRegistrationPromise;

  swRegistrationPromise = (async () => {
    try {
      // Clean up legacy v1/v2 cache buckets if present
      if ('caches' in window) {
        const keys = await window.caches.keys().catch(() => [] as string[]);
        await Promise.all(
          keys
            .filter(
              (k) =>
                k.startsWith('earthtalk-') &&
                !Object.values(OFFLINE_CACHE_BUCKETS).includes(
                  k as (typeof OFFLINE_CACHE_BUCKETS)[keyof typeof OFFLINE_CACHE_BUCKETS]
                )
            )
            .map((k) => window.caches.delete(k))
        );
      }

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            installing.postMessage({ type: 'SKIP_WAITING' });
          }
          emitChange();
        });
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        emitChange();
      });

      emitChange();
      return registration;
    } catch {
      return null;
    }
  })();

  return swRegistrationPromise;
}

/** Converts WGS84 longitude/latitude to Web Mercator slippy-map tile X/Y indices. */
export function lonLatToTileXY(
  lon: number,
  lat: number,
  zoom: number
): { x: number; y: number; z: number } {
  const z = Math.max(0, Math.min(19, Math.floor(zoom)));
  const n = 2 ** z;
  const clampedLon = Math.max(-179.9999, Math.min(179.9999, lon));
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const x = Math.min(n - 1, Math.max(0, Math.floor(((clampedLon + 180) / 360) * n)));
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.min(
    n - 1,
    Math.max(
      0,
      Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
    )
  );
  return { x, y, z };
}

export function formatSlippyTileUrl(
  basemap: OfflineBasemapId,
  z: number,
  x: number,
  y: number
): string {
  return TILE_TEMPLATES[basemap]
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/**
 * Computes slippy-map tile URLs covering a geographic bounding box across the
 * current zoom and up to two closer detail zoom levels, bounded by `maxTiles`.
 */
export function computeViewportTileUrls(options: {
  bounds: GeoBoundsBox;
  currentZoom: number;
  basemap: OfflineBasemapId;
  maxTiles?: number;
}): string[] {
  const maxTiles = Math.max(8, Math.min(240, options.maxTiles ?? 160));
  const baseZ = Math.max(6, Math.min(16, Math.round(options.currentZoom)));
  const zoomLevels = [baseZ, Math.min(17, baseZ + 1), Math.min(17, baseZ + 2)];
  const uniqueZooms = Array.from(new Set(zoomLevels));

  const west = Math.min(options.bounds.west, options.bounds.east);
  const east = Math.max(options.bounds.west, options.bounds.east);
  const south = Math.min(options.bounds.south, options.bounds.north);
  const north = Math.max(options.bounds.south, options.bounds.north);

  const urls: string[] = [];
  const seen = new Set<string>();

  for (const z of uniqueZooms) {
    const nw = lonLatToTileXY(west, north, z);
    const se = lonLatToTileXY(east, south, z);
    const minX = Math.min(nw.x, se.x);
    const maxX = Math.max(nw.x, se.x);
    const minY = Math.min(nw.y, se.y);
    const maxY = Math.max(nw.y, se.y);

    // Prioritize tiles closest to viewport center first
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const coords: Array<{ x: number; y: number; dist: number }> = [];

    // Cap grid scan per zoom if user zoomed far out
    const spanX = maxX - minX + 1;
    const spanY = maxY - minY + 1;
    if (spanX * spanY > 400) continue;

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        coords.push({
          x,
          y,
          dist: Math.hypot(x - centerX, y - centerY),
        });
      }
    }

    coords.sort((a, b) => a.dist - b.dist);

    for (const c of coords) {
      if (urls.length >= maxTiles) return urls;
      const primary = formatSlippyTileUrl(options.basemap, z, c.x, c.y);
      if (!seen.has(primary)) {
        seen.add(primary);
        urls.push(primary);
      }
      // If user is on the default vector 'map' basemap, also warm OpenStreetMap/Terrain
      // raster fallback tiles at the base zoom so offline fallback style has crisp imagery
      if (options.basemap === 'map' && z === baseZ && urls.length < maxTiles) {
        const streetFallback = formatSlippyTileUrl('streets', z, c.x, c.y);
        if (!seen.has(streetFallback)) {
          seen.add(streetFallback);
          urls.push(streetFallback);
        }
      }
    }
  }

  return urls;
}

export function isCacheableReadPath(pathOrUrl: string): boolean {
  let pathname = pathOrUrl;
  try {
    const u = new URL(
      pathOrUrl,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    );
    pathname = u.pathname;
  } catch {
    // Keep raw path
  }
  if (pathname.startsWith('/api/public/')) return true;
  if (pathname === '/api/community/sites.geojson' || pathname === '/api/community/sites') {
    return true;
  }
  if (/^\/api\/community\/sites\/[^/]+\/(explorer|timeline|visits)$/.test(pathname)) {
    return true;
  }
  if (/^\/api\/posts\/[^/]+$/.test(pathname)) return true;
  if (/^\/api\/posts\/[^/]+\/(comments|same-place)$/.test(pathname)) return true;
  return false;
}

function normalizePathAndQuery(urlOrPath: string): { key: string; url: URL } | null {
  try {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    const parsed = new URL(urlOrPath, origin);
    return { key: `${parsed.pathname}${parsed.search}`, url: parsed };
  } catch {
    return null;
  }
}

/**
 * Mirrors a successful GET response into CacheStorage when the Service Worker
 * has not yet claimed the page (e.g. very first load or restricted WebView).
 */
export async function mirrorToOfflineCache(urlOrPath: string, response: Response): Promise<void> {
  if (typeof window === 'undefined' || !('caches' in window)) return;
  if (!response || response.status !== 200) return;
  if (!isCacheableReadPath(urlOrPath)) return;
  const norm = normalizePathAndQuery(urlOrPath);
  if (!norm) return;

  try {
    const cache = await window.caches.open(OFFLINE_CACHE_BUCKETS.observations);
    await cache.put(norm.key, response.clone());
  } catch {
    // Ignore storage quota errors
  }
}

function filterGeoJsonFeaturesClient(
  collection: { type?: string; features?: Array<Record<string, any>> } | null,
  searchParams: URLSearchParams
) {
  if (!collection || !Array.isArray(collection.features)) return null;

  const district = (searchParams.get('district') || '').trim().toLowerCase();
  const category = (searchParams.get('category') || '').trim().toLowerCase();
  const subcategory = (searchParams.get('subcategory') || '').trim().toLowerCase();
  const classification = (searchParams.get('classification') || '').trim().toLowerCase();
  const confidence = (searchParams.get('confidence') || '').trim().toLowerCase();
  const verification = (searchParams.get('verification') || '').trim().toLowerCase();
  const evidenceState = (searchParams.get('evidence_state') || '').trim().toLowerCase();
  const search = (searchParams.get('search') || '').trim().toLowerCase();

  const features = collection.features.filter((feature) => {
    const p = feature?.properties || {};
    if (district && String(p.district || '').toLowerCase() !== district) return false;
    if (category) {
      const obsCat = String(p.observation_category || '').toLowerCase();
      const siteCats = Array.isArray(p.observed_classifications)
        ? p.observed_classifications.map((v: unknown) => String(v).toLowerCase())
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

  return { type: 'FeatureCollection', features };
}

/**
 * Client-side CacheStorage fallback reader used if a network request fails
 * before the Service Worker has claimed the client or in sandboxed WebViews.
 */
export async function matchOfflineCacheFallback(urlOrPath: string): Promise<Response | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  if (!isCacheableReadPath(urlOrPath)) return null;
  const norm = normalizePathAndQuery(urlOrPath);
  if (!norm) return null;

  try {
    const cache = await window.caches.open(OFFLINE_CACHE_BUCKETS.observations);
    const exact = await cache.match(norm.key, { ignoreVary: true });
    if (exact) return exact.clone();

    if (norm.url.pathname === '/api/public/observations.geojson') {
      const baseRes = await cache.match('/api/public/observations.geojson', { ignoreVary: true });
      if (baseRes) {
        const baseJson = await baseRes.clone().json().catch(() => null);
        const filtered = filterGeoJsonFeaturesClient(baseJson, norm.url.searchParams);
        if (filtered) {
          return new Response(JSON.stringify(filtered), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }

    if (norm.url.pathname === '/api/community/sites.geojson') {
      const baseSites =
        (await cache.match('/api/community/sites.geojson?limit=500', { ignoreVary: true })) ||
        (await cache.match('/api/community/sites.geojson', { ignoreVary: true }));
      if (baseSites) {
        const baseJson = await baseSites.clone().json().catch(() => null);
        const filtered = filterGeoJsonFeaturesClient(baseJson, norm.url.searchParams);
        if (filtered) {
          return new Response(JSON.stringify(filtered), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

function sendMessageToSW<T>(
  payload: Record<string, unknown>,
  timeoutMs = 15_000
): Promise<T | null> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !navigator.serviceWorker.controller
  ) {
    return Promise.resolve(null);
  }

  return new Promise<T | null>((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      resolve(null);
    }, timeoutMs);

    channel.port1.onmessage = (event) => {
      window.clearTimeout(timer);
      resolve((event.data as T) ?? null);
    };

    try {
      navigator.serviceWorker.controller!.postMessage(payload, [channel.port2]);
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

async function readStatsFromCacheStorage(): Promise<OfflineCacheStats> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return EMPTY_STATS;
  }

  try {
    const [tileCache, styleCache, obsCache] = await Promise.all([
      window.caches.open(OFFLINE_CACHE_BUCKETS.tiles),
      window.caches.open(OFFLINE_CACHE_BUCKETS.styles),
      window.caches.open(OFFLINE_CACHE_BUCKETS.observations),
    ]);

    const [tileKeys, styleKeys, obsKeys] = await Promise.all([
      tileCache.keys(),
      styleCache.keys(),
      obsCache.keys(),
    ]);

    let cachedObservations = 0;
    let cachedSites = 0;
    let lastSyncedAt: string | null = null;

    const baseObsRes = await obsCache.match('/api/public/observations.geojson', {
      ignoreVary: true,
    });
    if (baseObsRes) {
      const obsJson = await baseObsRes.clone().json().catch(() => null);
      if (obsJson && Array.isArray(obsJson.features)) {
        cachedObservations = obsJson.features.length;
      }
    }

    const baseSitesRes =
      (await obsCache.match('/api/community/sites.geojson?limit=500', { ignoreVary: true })) ||
      (await obsCache.match('/api/community/sites.geojson', { ignoreVary: true }));
    if (baseSitesRes) {
      const sitesJson = await baseSitesRes.clone().json().catch(() => null);
      if (sitesJson && Array.isArray(sitesJson.features)) {
        cachedSites = sitesJson.features.length;
      }
    }

    const metaRes = await obsCache.match(OFFLINE_META_URL, { ignoreVary: true });
    if (metaRes) {
      const meta = await metaRes.clone().json().catch(() => null);
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

    const swActive = Boolean(
      'serviceWorker' in navigator && navigator.serviceWorker.controller
    );

    return {
      swActive,
      cachedTiles: tileKeys.length,
      cachedStyles: styleKeys.length,
      cachedObservations,
      cachedSites,
      cachedPassports,
      lastSyncedAt,
    };
  } catch {
    return EMPTY_STATS;
  }
}

export async function getOfflineCacheStats(): Promise<OfflineCacheStats> {
  const swReply = await sendMessageToSW<{ stats?: OfflineCacheStats }>(
    { type: 'GET_OFFLINE_CACHE_STATS' },
    3500
  );
  if (swReply?.stats) {
    return swReply.stats;
  }
  return readStatsFromCacheStorage();
}

export async function clearOfflineCache(): Promise<OfflineCacheStats> {
  const swReply = await sendMessageToSW<{ stats?: OfflineCacheStats }>(
    { type: 'CLEAR_OFFLINE_CACHE' },
    5000
  );
  if (swReply?.stats) {
    emitChange();
    return swReply.stats;
  }

  if (typeof window !== 'undefined' && 'caches' in window) {
    await Promise.all([
      window.caches.delete(OFFLINE_CACHE_BUCKETS.tiles),
      window.caches.delete(OFFLINE_CACHE_BUCKETS.styles),
      window.caches.delete(OFFLINE_CACHE_BUCKETS.observations),
    ]).catch(() => {});
  }
  emitChange();
  return readStatsFromCacheStorage();
}

export async function prefetchOfflineRegion(
  snapshot: OfflineViewportSnapshot,
  onProgress?: (progress: OfflinePrefetchProgress) => void
): Promise<OfflineCacheStats> {
  const tileUrls = computeViewportTileUrls({
    bounds: snapshot.bounds,
    currentZoom: snapshot.zoom,
    basemap: snapshot.basemap,
    maxTiles: 160,
  });

  const styleUrls = [
    MAP_CONFIG.defaultStyleUrl,
    '/maplibre-gl-worker.mjs',
  ];

  const passportPaths = snapshot.passportIdsInBounds
    .slice(0, 30)
    .map((id) => `/api/posts/${encodeURIComponent(id)}`);
  const mediaPaths = snapshot.mediaUrlsInBounds
    .filter((u) => typeof u === 'string' && u.startsWith('/'))
    .slice(0, 30);

  const observationUrls = [
    '/api/public/observations.geojson',
    '/api/community/sites.geojson?limit=500',
    '/api/public/districts',
    '/api/public/categories',
    '/api/public/stats',
    '/api/public/observations/unlocated?page=1&limit=200',
    ...passportPaths,
    ...mediaPaths,
  ];

  // Ensure Service Worker registration has been initiated
  await registerOfflineServiceWorker();

  // Path A: Delegate to active Service Worker controller with live message progress
  if (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    navigator.serviceWorker.controller
  ) {
    const onSwMessage = (event: MessageEvent) => {
      const d = event.data;
      if (d && d.type === 'OFFLINE_PACK_PROGRESS' && onProgress) {
        onProgress({ completed: Number(d.completed) || 0, total: Number(d.total) || 1 });
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    try {
      const reply = await sendMessageToSW<{ stats?: OfflineCacheStats }>(
        {
          type: 'PREFETCH_OFFLINE_PACK',
          tileUrls,
          styleUrls,
          observationUrls,
        },
        60_000
      );
      if (reply?.stats) {
        emitChange();
        return reply.stats;
      }
    } finally {
      navigator.serviceWorker.removeEventListener('message', onSwMessage);
    }
  }

  // Path B: Direct CacheStorage fallback (works immediately before SW claims or in WebViews)
  if (typeof window !== 'undefined' && 'caches' in window) {
    const [tileCache, styleCache, obsCache] = await Promise.all([
      window.caches.open(OFFLINE_CACHE_BUCKETS.tiles),
      window.caches.open(OFFLINE_CACHE_BUCKETS.styles),
      window.caches.open(OFFLINE_CACHE_BUCKETS.observations),
    ]);

    const total = observationUrls.length + styleUrls.length + tileUrls.length;
    let completed = 0;
    const step = () => {
      completed += 1;
      onProgress?.({ completed, total });
    };

    const runBatch = async (
      cache: Cache,
      urls: string[],
      crossOriginTile: boolean,
      skipExisting: boolean
    ) => {
      let idx = 0;
      const concurrency = 6;
      const worker = async () => {
        while (idx < urls.length) {
          const target = urls[idx++];
          try {
            const resolvedUrl = new URL(target, window.location.origin).href;
            const hit = skipExisting
              ? await cache.match(resolvedUrl, { ignoreVary: true })
              : null;
            if (!hit) {
              let res: Response | null = null;
              try {
                res = await fetch(
                  new Request(resolvedUrl, {
                    mode: crossOriginTile ? 'cors' : 'same-origin',
                    credentials: crossOriginTile ? 'omit' : 'same-origin',
                  })
                );
              } catch {
                if (crossOriginTile) {
                  res = await fetch(
                    new Request(resolvedUrl, { mode: 'no-cors', credentials: 'omit' })
                  ).catch(() => null);
                }
              }
              if (res && (res.status === 200 || res.type === 'opaque')) {
                await cache.put(resolvedUrl, res.clone());
              }
            }
          } catch {
            // Continue caching remaining items
          } finally {
            step();
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(concurrency, Math.max(1, urls.length)) }, () => worker())
      );
    };

    await runBatch(obsCache, observationUrls, false, false);
    await runBatch(styleCache, styleUrls, true, false);
    await runBatch(tileCache, tileUrls, true, true);

    const tileKeys = await tileCache.keys();
    if (tileKeys.length > MAX_CLIENT_TILES) {
      await Promise.all(
        tileKeys.slice(0, tileKeys.length - MAX_CLIENT_TILES).map((k) => tileCache.delete(k))
      );
    }

    await obsCache.put(
      OFFLINE_META_URL,
      new Response(JSON.stringify({ lastSyncedAt: new Date().toISOString() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    emitChange();
    return readStatsFromCacheStorage();
  }

  return EMPTY_STATS;
}
