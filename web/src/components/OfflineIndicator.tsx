import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOfflineCache } from '../hooks/useOfflineCache.js';

export const OfflineIndicator: React.FC = () => {
  const { isOnline, stats } = useOfflineCache();

  if (isOnline) return null;

  const summary =
    stats.cachedObservations > 0 || stats.cachedTiles > 0
      ? `${stats.cachedObservations} cached observations · ${stats.cachedTiles} map tiles available`
      : 'Serving locally cached map tiles & geological observations';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-14 left-3 right-3 z-50 flex items-center gap-2.5 rounded-xl bg-[#202124] px-3.5 py-2.5 text-xs font-medium text-white shadow-lg sm:bottom-4 sm:left-4 sm:right-auto"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
      <div className="min-w-0">
        <div className="truncate font-medium">Offline Mode</div>
        <div className="truncate text-[11px] font-normal text-[#dadce0]">{summary}</div>
      </div>
    </div>
  );
};
