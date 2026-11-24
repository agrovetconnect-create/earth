import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tiny read-through cache for detail payloads (Geoscience Passports, Site
 * Explorers). Each payload is stored per id the moment it loads successfully;
 * when the network fails later, the last saved copy keeps the screen useful
 * offline instead of a dead end. Display cache only — nothing is queued for
 * replay, and the server remains the source of truth.
 */

export async function cacheJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — the cache is best-effort by design.
  }
}

export async function readCachedJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export const offlineCacheKey = {
  passport: (id: string) => `et_passport_cache_${id}`,
  site: (id: string) => `et_site_cache_${id}`,
};
