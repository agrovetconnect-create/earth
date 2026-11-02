/**
 * Cross-platform Offline Map Tile & Geological Observation Cache for Earth Talk Mobile.
 *
 * - In mobile web / PWA mode (`navigator.serviceWorker` / `window.caches`), registers
 *   `/sw.js` and delegates tile + observation pack caching to the Service Worker and
 *   CacheStorage (`earthtalk-map-tiles-v3`, `earthtalk-observations-v3`).
 * - In native iOS / Android mode, persists validated geological observation datasets,
 *   individual passports, geoscience sites, and pre-warmed regional tile pack metadata
 *   via AsyncStorage (with an in-memory mirror so unit tests run without native bridges).
 */

import type {
  CommunityPostDetail,
  GeoJsonCollection,
  ObservationDetail,
  ObservationFilters,
  ObservationSummary,
  Paginated,
  PublicCategory,
  PublicDistrict,
} from '../types/api.ts';
import type { MapCamera } from '../features/map/geojson.ts';

const STORAGE_PREFIX = 'earth-talk-mobile-offline-cache-v3:';
const TILE_CACHE_NAME = 'earthtalk-map-tiles-v3';
const OBS_CACHE_NAME = 'earthtalk-observations-v3';

export interface MobileOfflineStats {
  swActive: boolean;
  cachedTiles: number;
  cachedObservations: number;
  cachedSites: number;
  lastSyncedAt: string | null;
}

interface StoredOfflineEnvelope<T> {
  updatedAt: string;
  payload: T;
}

const memoryStore = new Map<string, string>();

async function readStorage(key: string): Promise<string | null> {
  const fullKey = `${STORAGE_PREFIX}${key}`;
  try {
    const mod = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = mod?.default;
    if (AsyncStorage?.getItem) {
      const val = await AsyncStorage.getItem(fullKey);
      if (val !== null) {
        memoryStore.set(fullKey, val);
        return val;
      }
    }
  } catch {
    // Fall back to in-memory map
  }
  return memoryStore.get(fullKey) ?? null;
}

async function writeStorage(key: string, value: string): Promise<void> {
  const fullKey = `${STORAGE_PREFIX}${key}`;
  memoryStore.set(fullKey, value);
  try {
    const mod = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = mod?.default;
    if (AsyncStorage?.setItem) {
      await AsyncStorage.setItem(fullKey, value);
    }
  } catch {
    // Ignore quota or native bridge errors
  }
}

async function removeStorage(key: string): Promise<void> {
  const fullKey = `${STORAGE_PREFIX}${key}`;
  memoryStore.delete(fullKey);
  try {
    const mod = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = mod?.default;
    if (AsyncStorage?.removeItem) {
      await AsyncStorage.removeItem(fullKey);
    }
  } catch {
    // Ignore storage removal errors
  }
}

export async function registerMobileServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    return true;
  } catch {
    return false;
  }
}

export function lonLatToSlippyTile(
  longitude: number,
  latitude: number,
  zoom: number
): { x: number; y: number; z: number } {
  const z = Math.max(0, Math.min(19, Math.floor(zoom)));
  const n = 2 ** z;
  const lon = Math.max(-179.9999, Math.min(179.9999, longitude));
  const lat = Math.max(-85.0511, Math.min(85.0511, latitude));
  const x = Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n)));
  const latRad = (lat * Math.PI) / 180;
  const y = Math.min(
    n - 1,
    Math.max(
      0,
      Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
    )
  );
  return { x, y, z };
}

/**
 * Generates slippy-map raster tile URLs around a mobile MapCamera across the
 * active zoom and two closer field zoom levels, bounded to `maxTiles`.
 */
export function computeMobileCameraTileUrls(
  camera: MapCamera,
  options: { radiusTiles?: number; maxTiles?: number } = {}
): string[] {
  const radius = Math.max(1, Math.min(5, options.radiusTiles ?? 2));
  const maxTiles = Math.max(4, Math.min(180, options.maxTiles ?? 96));
  const baseZ = Math.max(6, Math.min(16, Math.round(camera.zoom)));
  const zooms = Array.from(new Set([baseZ, Math.min(17, baseZ + 1), Math.min(17, baseZ + 2)]));

  const urls: string[] = [];
  for (const z of zooms) {
    const center = lonLatToSlippyTile(camera.longitude, camera.latitude, z);
    const limit = 2 ** z - 1;
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (urls.length >= maxTiles) return urls;
        const x = Math.max(0, Math.min(limit, center.x + dx));
        const y = Math.max(0, Math.min(limit, center.y + dy));
        urls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
      }
    }
  }
  return urls;
}

export async function saveOfflineDataset<T>(key: string, payload: T): Promise<void> {
  const envelope: StoredOfflineEnvelope<T> = {
    updatedAt: new Date().toISOString(),
    payload,
  };
  await writeStorage(key, JSON.stringify(envelope));
}

export async function loadOfflineDataset<T>(key: string): Promise<T | null> {
  const raw = await readStorage(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredOfflineEnvelope<T>;
    return parsed && 'payload' in parsed ? parsed.payload : null;
  } catch {
    return null;
  }
}

export function filterOfflineGeoJson(
  collection: GeoJsonCollection,
  filters: ObservationFilters = {}
): GeoJsonCollection {
  const category = (filters.category ?? '').trim().toLowerCase();
  const classification = (filters.classification ?? '').trim().toLowerCase();
  const evidenceState = (filters.evidence_state ?? '').trim().toLowerCase();
  const district = (filters.district ?? '').trim().toLowerCase();
  const confidence = (filters.confidence ?? '').trim().toLowerCase();
  const verification = (filters.verification ?? '').trim().toLowerCase();
  const search = (filters.search ?? '').trim().toLowerCase();

  const features = collection.features.filter((feature) => {
    const p = (feature.properties ?? {}) as Record<string, unknown>;
    if (category && String(p.observation_category ?? '').toLowerCase() !== category) return false;
    if (classification) {
      const cls = String(p.classification ?? p.primary_classification ?? '').toLowerCase();
      if (!cls.includes(classification)) return false;
    }
    if (evidenceState) {
      const ev = String(p.evidence_state ?? p.highest_evidence_state ?? '').toLowerCase();
      if (ev !== evidenceState) return false;
    }
    if (district && String(p.district ?? '').toLowerCase() !== district) return false;
    if (confidence && String(p.confidence ?? '').toLowerCase() !== confidence) return false;
    if (verification && String(p.verification_status ?? '').toLowerCase() !== verification) {
      return false;
    }
    if (search) {
      const haystack = [
        p.passport_id,
        p.post_title,
        p.possible_name,
        p.title,
        p.observation_category,
        p.observation_subcategory,
        p.district,
      ]
        .map((v) => String(v ?? '').toLowerCase())
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

export function filterOfflineObservationList(
  rows: ObservationSummary[],
  filters: ObservationFilters = {},
  page = 1,
  limit = 20
): Paginated<ObservationSummary> {
  const category = (filters.category ?? '').trim().toLowerCase();
  const classification = (filters.classification ?? '').trim().toLowerCase();
  const evidenceState = (filters.evidence_state ?? '').trim().toLowerCase();
  const district = (filters.district ?? '').trim().toLowerCase();
  const confidence = (filters.confidence ?? '').trim().toLowerCase();
  const verification = (filters.verification ?? '').trim().toLowerCase();
  const search = (filters.search ?? '').trim().toLowerCase();

  const matched = rows.filter((item) => {
    if (category && item.observation_category.toLowerCase() !== category) return false;
    if (classification && !item.classification.toLowerCase().includes(classification)) return false;
    if (evidenceState && (item.evidence_state ?? '').toLowerCase() !== evidenceState) return false;
    if (district && (item.district ?? '').toLowerCase() !== district) return false;
    if (confidence && (item.confidence ?? '').toLowerCase() !== confidence) return false;
    if (verification && item.verification_status.toLowerCase() !== verification) return false;
    if (search) {
      const haystack = [
        item.passport_id,
        item.post_title,
        item.possible_name,
        item.primary_interpretation,
        item.observation_category,
        item.observation_subcategory,
        item.district,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const start = Math.max(0, (page - 1) * limit);
  const sliced = matched.slice(start, start + limit);
  const totalPages = matched.length === 0 ? 0 : Math.ceil(matched.length / limit);
  return {
    data: sliced,
    pagination: {
      page,
      limit,
      total: matched.length,
      totalPages,
    },
  };
}

function isOfflineNetworkFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const kind = (error as { kind?: unknown }).kind;
  return kind === 'network' || kind === 'timeout';
}

/**
 * Executes a network fetcher, persists validated results into the offline store,
 * and falls back to `readFallback()` if and only if a network/timeout failure occurs.
 */
export async function withOfflineFallback<T>(
  fetcher: () => Promise<T>,
  onSuccessPersist: (data: T) => Promise<void>,
  readFallback: () => Promise<T | null>
): Promise<T> {
  try {
    const fresh = await fetcher();
    await onSuccessPersist(fresh).catch(() => {});
    return fresh;
  } catch (err: unknown) {
    if (isOfflineNetworkFailure(err)) {
      const cached = await readFallback().catch(() => null);
      if (cached !== null) {
        return cached;
      }
    }
    throw err;
  }
}

export async function cacheObservationsGeoJson(
  collection: GeoJsonCollection,
  isUnfiltered: boolean
): Promise<void> {
  if (isUnfiltered) {
    await saveOfflineDataset('map:observations:base', collection);
  }
  await saveOfflineDataset('meta:lastSyncedAt', new Date().toISOString());
}

export async function getCachedObservationsGeoJson(
  filters: ObservationFilters = {}
): Promise<GeoJsonCollection | null> {
  const base = await loadOfflineDataset<GeoJsonCollection>('map:observations:base');
  if (!base) return null;
  return filterOfflineGeoJson(base, filters);
}

export async function cacheSitesGeoJson(
  collection: GeoJsonCollection,
  district?: string
): Promise<void> {
  if (!district) {
    await saveOfflineDataset('map:sites:base', collection);
  } else {
    await saveOfflineDataset(`map:sites:${district.toLowerCase()}`, collection);
  }
}

export async function getCachedSitesGeoJson(district?: string): Promise<GeoJsonCollection | null> {
  if (district) {
    const exact = await loadOfflineDataset<GeoJsonCollection>(`map:sites:${district.toLowerCase()}`);
    if (exact) return exact;
  }
  const base = await loadOfflineDataset<GeoJsonCollection>('map:sites:base');
  if (!base) return null;
  return district ? filterOfflineGeoJson(base, { district }) : base;
}

export async function cacheObservationSummaries(rows: ObservationSummary[]): Promise<void> {
  const existing = (await loadOfflineDataset<ObservationSummary[]>('list:observations')) ?? [];
  const merged = new Map<string, ObservationSummary>();
  for (const r of rows) merged.set(r.passport_id, r);
  for (const r of existing) {
    if (!merged.has(r.passport_id)) merged.set(r.passport_id, r);
  }
  await saveOfflineDataset('list:observations', Array.from(merged.values()).slice(0, 400));
}

export async function getCachedObservationSummaries(
  filters: ObservationFilters = {},
  page = 1,
  limit = 20
): Promise<Paginated<ObservationSummary> | null> {
  const rows = await loadOfflineDataset<ObservationSummary[]>('list:observations');
  if (!rows || rows.length === 0) return null;
  return filterOfflineObservationList(rows, filters, page, limit);
}

export async function cacheObservationDetail(detail: ObservationDetail | null): Promise<void> {
  if (!detail) return;
  await saveOfflineDataset(`detail:${detail.passport_id}`, detail);
}

export async function getCachedObservationDetail(id: string): Promise<ObservationDetail | null> {
  return loadOfflineDataset<ObservationDetail>(`detail:${id}`);
}

export async function cachePostDetail(detail: CommunityPostDetail | null): Promise<void> {
  if (!detail || !detail.is_public) return;
  await saveOfflineDataset(`post:${detail.passport_id}`, detail);
}

export async function getCachedPostDetail(id: string): Promise<CommunityPostDetail | null> {
  return loadOfflineDataset<CommunityPostDetail>(`post:${id}`);
}

export async function cacheCategories(items: PublicCategory[]): Promise<void> {
  await saveOfflineDataset('meta:categories', items);
}

export async function getCachedCategories(): Promise<PublicCategory[] | null> {
  return loadOfflineDataset<PublicCategory[]>('meta:categories');
}

export async function cacheDistricts(items: PublicDistrict[]): Promise<void> {
  await saveOfflineDataset('meta:districts', items);
}

export async function getCachedDistricts(): Promise<PublicDistrict[] | null> {
  return loadOfflineDataset<PublicDistrict[]>('meta:districts');
}

/**
 * Pre-caches regional slippy-map tiles + active geological observations & sites
 * for offline field access in both mobile web (Service Worker / CacheStorage)
 * and native mobile modes.
 */
export async function saveMobileOfflinePack(options: {
  camera: MapCamera;
  observationsGeoJson?: GeoJsonCollection | null;
  sitesGeoJson?: GeoJsonCollection | null;
  maxTiles?: number;
}): Promise<MobileOfflineStats> {
  await registerMobileServiceWorker();
  const tileUrls = computeMobileCameraTileUrls(options.camera, {
    radiusTiles: 2,
    maxTiles: options.maxTiles ?? 72,
  });

  if (options.observationsGeoJson) {
    await saveOfflineDataset('map:observations:base', options.observationsGeoJson);
  }
  if (options.sitesGeoJson) {
    await saveOfflineDataset('map:sites:base', options.sitesGeoJson);
  }

  let cachedTileCount = 0;

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const [tileCache, obsCache] = await Promise.all([
        window.caches.open(TILE_CACHE_NAME),
        window.caches.open(OBS_CACHE_NAME),
      ]);
      if (options.observationsGeoJson && window.location?.origin) {
        await obsCache.put(
          new URL('/api/public/observations.geojson', window.location.origin).href,
          new Response(JSON.stringify(options.observationsGeoJson), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      if (options.sitesGeoJson && window.location?.origin) {
        await obsCache.put(
          new URL('/api/community/sites.geojson?limit=500', window.location.origin).href,
          new Response(JSON.stringify(options.sitesGeoJson), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      await Promise.all(
        tileUrls.map(async (url) => {
          const hit = await tileCache.match(url, { ignoreVary: true });
          if (hit) {
            cachedTileCount += 1;
            return;
          }
          try {
            const res = await fetch(new Request(url, { mode: 'cors', credentials: 'omit' }));
            if (res && (res.status === 200 || res.type === 'opaque')) {
              await tileCache.put(url, res.clone());
              cachedTileCount += 1;
            }
          } catch {
            // Individual tile fetch hiccup ignored
          }
        })
      );
      const keys = await tileCache.keys();
      cachedTileCount = keys.length;
    } catch {
      cachedTileCount = tileUrls.length;
    }
  } else {
    // Native HTTP cache warming for regional tile pack
    let warmed = 0;
    await Promise.all(
      tileUrls.slice(0, 36).map(async (url) => {
        try {
          const res = await fetch(url);
          if (res && (res.ok || res.type === 'opaque')) warmed += 1;
        } catch {
          // Ignore individual offline/network errors
        }
      })
    );
    const prevTiles = (await loadOfflineDataset<number>('meta:cachedTiles')) ?? 0;
    cachedTileCount = Math.max(prevTiles, warmed);
  }

  const syncedAt = new Date().toISOString();
  await saveOfflineDataset('meta:cachedTiles', cachedTileCount);
  await saveOfflineDataset('meta:lastSyncedAt', syncedAt);

  return getMobileOfflineStats();
}

export async function getMobileOfflineStats(): Promise<MobileOfflineStats> {
  const [obs, sites, storedTileCount, lastSyncedAt] = await Promise.all([
    loadOfflineDataset<GeoJsonCollection>('map:observations:base'),
    loadOfflineDataset<GeoJsonCollection>('map:sites:base'),
    loadOfflineDataset<number>('meta:cachedTiles'),
    loadOfflineDataset<string>('meta:lastSyncedAt'),
  ]);

  let cachedTiles = storedTileCount ?? 0;
  let swActive = false;

  if (typeof window !== 'undefined') {
    swActive = Boolean(
      typeof navigator !== 'undefined' &&
        'serviceWorker' in navigator &&
        navigator.serviceWorker.controller
    );
    if ('caches' in window) {
      try {
        const tileCache = await window.caches.open(TILE_CACHE_NAME);
        const keys = await tileCache.keys();
        cachedTiles = Math.max(cachedTiles, keys.length);
      } catch {
        // Ignore
      }
    }
  }

  return {
    swActive,
    cachedTiles,
    cachedObservations: obs?.features?.length ?? 0,
    cachedSites: sites?.features?.length ?? 0,
    lastSyncedAt: lastSyncedAt ?? null,
  };
}

export async function clearMobileOfflineCache(): Promise<void> {
  await Promise.all([
    removeStorage('map:observations:base'),
    removeStorage('map:sites:base'),
    removeStorage('list:observations'),
    removeStorage('meta:categories'),
    removeStorage('meta:districts'),
    removeStorage('meta:cachedTiles'),
    removeStorage('meta:lastSyncedAt'),
  ]);
  memoryStore.clear();
  if (typeof window !== 'undefined' && 'caches' in window) {
    await Promise.all([
      window.caches.delete(TILE_CACHE_NAME),
      window.caches.delete(OBS_CACHE_NAME),
    ]).catch(() => {});
  }
}
