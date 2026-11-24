import { createPersistedStore, usePersistedStore } from './localStore';

const STORAGE_KEY = 'earthtalk_recent_searches';
const MAX_SEARCHES = 10;

export const recentSearchesStore = createPersistedStore<string[]>(STORAGE_KEY, []);

/** Saves a search query. Deduplicates case-insensitively, latest first. */
export function addRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;

  recentSearchesStore.update((current) => {
    const filtered = current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
    return [trimmed, ...filtered].slice(0, MAX_SEARCHES);
  });
}

/** Removes a specific search query. */
export function removeRecentSearch(query: string): void {
  const target = query.trim().toLowerCase();
  recentSearchesStore.update((current) =>
    current.filter((item) => item.trim().toLowerCase() !== target)
  );
}

/** Clears all stored recent searches. */
export function clearRecentSearches(): void {
  recentSearchesStore.set([]);
}

/** Reactive hook to subscribe a component to recent searches. */
export function useRecentSearches(): string[] {
  return usePersistedStore(recentSearchesStore);
}
