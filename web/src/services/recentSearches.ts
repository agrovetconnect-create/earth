import { createPersistedStore } from './localStore.js';

const STORAGE_KEY = 'earthtalk_recent_searches';
const MAX_SEARCHES = 10;

function deserializeSearches(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  return raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, MAX_SEARCHES);
}

export const recentSearchesStore = createPersistedStore<string[]>(STORAGE_KEY, [], {
  deserialize: deserializeSearches,
});

/**
 * Saves a search query to the recent searches list in localStorage.
 * Deduplicates case-insensitively and puts the latest search at the front.
 */
export function addRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;

  recentSearchesStore.update((current) => {
    const filtered = current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
    return [trimmed, ...filtered].slice(0, MAX_SEARCHES);
  });
}

/**
 * Removes a specific search query from localStorage.
 */
export function removeRecentSearch(query: string): void {
  const target = query.trim().toLowerCase();
  recentSearchesStore.update((current) =>
    current.filter((item) => item.trim().toLowerCase() !== target)
  );
}

/**
 * Clears all stored recent searches from localStorage.
 */
export function clearRecentSearches(): void {
  recentSearchesStore.set([]);
}

/**
 * Reactive hook to subscribe a component to recent searches.
 */
export function useRecentSearches(): string[] {
  return recentSearchesStore.use();
}
