export interface MobileHistoryItem {
  id: string;
  kind: 'observation' | 'site';
  refId: string;
  title: string;
  subtitle: string;
  visitedAt: string;
}

const HISTORY_STORAGE_KEY = 'earth-talk-mobile-history-v1';
const MAX_HISTORY_ITEMS = 50;
let memoryHistory: MobileHistoryItem[] = [];

async function readRaw(): Promise<MobileHistoryItem[]> {
  try {
    const mod = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = mod?.default;
    if (AsyncStorage?.getItem) {
      const stored = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          memoryHistory = parsed.filter(
            (x): x is MobileHistoryItem =>
              typeof x === 'object' &&
              x !== null &&
              typeof (x as Record<string, unknown>).refId === 'string' &&
              typeof (x as Record<string, unknown>).title === 'string'
          );
          return memoryHistory;
        }
      }
    }
  } catch {
    // Fallback to memory store
  }
  return memoryHistory;
}

async function writeRaw(items: MobileHistoryItem[]): Promise<void> {
  memoryHistory = items;
  try {
    const mod = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = mod?.default;
    if (AsyncStorage?.setItem) {
      await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // Ignore storage write failure
  }
}

export async function recordMobileHistory(entry: {
  kind: 'observation' | 'site';
  refId: string;
  title: string;
  subtitle: string;
}): Promise<void> {
  const current = await readRaw();
  const deduped = current.filter((item) => !(item.kind === entry.kind && item.refId === entry.refId));
  const next: MobileHistoryItem[] = [
    {
      id: `${entry.kind}:${entry.refId}:${Date.now()}`,
      kind: entry.kind,
      refId: entry.refId,
      title: entry.title,
      subtitle: entry.subtitle,
      visitedAt: new Date().toISOString(),
    },
    ...deduped,
  ].slice(0, MAX_HISTORY_ITEMS);
  await writeRaw(next);
}

export async function getMobileHistory(): Promise<MobileHistoryItem[]> {
  return readRaw();
}

export async function clearMobileHistory(): Promise<void> {
  await writeRaw([]);
}

export async function removeMobileHistoryItem(id: string): Promise<MobileHistoryItem[]> {
  const current = await readRaw();
  const next = current.filter((item) => item.id !== id);
  await writeRaw(next);
  return next;
}

const RECENT_SEARCH_KEY = 'earth-talk-mobile-recent-searches-v1';
const MAX_RECENT_SEARCHES = 8;
let memoryRecentSearches: string[] = [];

export async function getRecentMapSearches(): Promise<string[]> {
  try {
    const mod = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = mod?.default;
    if (AsyncStorage?.getItem) {
      const raw = await AsyncStorage.getItem(RECENT_SEARCH_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          memoryRecentSearches = parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
          return memoryRecentSearches;
        }
      }
    }
  } catch {
    // Fallback to memory
  }
  return memoryRecentSearches;
}

async function saveRecentMapSearches(items: string[]): Promise<void> {
  memoryRecentSearches = items;
  try {
    const mod = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = mod?.default;
    if (AsyncStorage?.setItem) {
      await AsyncStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(items));
    }
  } catch {
    // Ignore storage write error
  }
}

export async function addRecentMapSearch(query: string): Promise<string[]> {
  const clean = query.trim();
  if (!clean) return getRecentMapSearches();
  const current = await getRecentMapSearches();
  const next = [clean, ...current.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(
    0,
    MAX_RECENT_SEARCHES
  );
  await saveRecentMapSearches(next);
  return next;
}

export async function removeRecentMapSearch(query: string): Promise<string[]> {
  const current = await getRecentMapSearches();
  const next = current.filter((item) => item !== query);
  await saveRecentMapSearches(next);
  return next;
}

export async function clearRecentMapSearches(): Promise<string[]> {
  await saveRecentMapSearches([]);
  return [];
}
