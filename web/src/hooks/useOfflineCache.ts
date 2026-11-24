import { useCallback, useEffect, useState } from 'react';
import {
  clearOfflineCache,
  getOfflineCacheStats,
  prefetchOfflineRegion,
  subscribeOfflineCache,
  type OfflineCacheStats,
  type OfflinePrefetchProgress,
  type OfflineViewportSnapshot,
} from '../services/offlineCache.js';
import { useOnlineStatus } from './useOnlineStatus.js';

export function useOfflineCache() {
  const isOnline = useOnlineStatus();
  const [stats, setStats] = useState<OfflineCacheStats>({
    swActive: false,
    cachedTiles: 0,
    cachedStyles: 0,
    cachedObservations: 0,
    cachedSites: 0,
    cachedPassports: 0,
    lastSyncedAt: null,
  });
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<OfflinePrefetchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    const next = await getOfflineCacheStats();
    setStats(next);
    return next;
  }, []);

  useEffect(() => {
    void refreshStats();
    const unsub = subscribeOfflineCache(() => {
      void refreshStats();
    });
    return unsub;
  }, [refreshStats, isOnline]);

  const saveRegion = useCallback(
    async (snapshot: OfflineViewportSnapshot) => {
      if (!isOnline) {
        setError('Connect to the internet to download a new offline map area.');
        return null;
      }
      setSyncing(true);
      setError(null);
      setProgress({ completed: 0, total: 1 });
      try {
        const updated = await prefetchOfflineRegion(snapshot, (p) => {
          setProgress(p);
        });
        setStats(updated);
        return updated;
      } catch {
        setError('Could not finish caching this area. Try zooming closer and retrying.');
        return null;
      } finally {
        setSyncing(false);
        setProgress(null);
      }
    },
    [isOnline]
  );

  const clearCache = useCallback(async () => {
    setError(null);
    const cleared = await clearOfflineCache();
    setStats(cleared);
    return cleared;
  }, []);

  return {
    isOnline,
    stats,
    syncing,
    progress,
    error,
    refreshStats,
    saveRegion,
    clearCache,
  };
}
