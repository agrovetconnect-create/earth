import React, { useEffect, useRef, useState } from 'react';
import { Check, CloudDownload, Loader2, Trash2, WifiOff, X } from 'lucide-react';
import { useOfflineCache } from '../hooks/useOfflineCache.js';
import type { OfflineViewportSnapshot } from '../services/offlineCache.js';
import { PWAInstallButton } from './PWAInstallButton.js';

interface OfflineMapControlProps {
  getViewportSnapshot?: () => OfflineViewportSnapshot;
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Not yet saved';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Saved locally';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const OfflineMapControl: React.FC<OfflineMapControlProps> = ({ getViewportSnapshot }) => {
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { isOnline, stats, syncing, progress, error, refreshStats, saveRegion, clearCache } =
    useOfflineCache();

  useEffect(() => {
    if (!open) return;
    void refreshStats();
  }, [open, refreshStats]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const hasCachedData =
    stats.cachedTiles > 0 || stats.cachedObservations > 0 || stats.cachedSites > 0;
  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : 0;

  const handleSaveArea = async () => {
    if (!getViewportSnapshot) return;
    setJustSaved(false);
    const snapshot = getViewportSnapshot();
    const res = await saveRegion(snapshot);
    if (res) {
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 3000);
    }
  };

  return (
    <div ref={panelRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Offline map & observations cache"
        aria-label="Offline map and geological observations cache"
        aria-expanded={open}
        className={`relative flex h-8 w-8 items-center justify-center rounded-full border shadow-[var(--g-elev-2)] transition-colors cursor-pointer ${
          !isOnline
            ? 'border-[#f9ab00] bg-[#fef7e0] text-[#b06000]'
            : open || syncing
              ? 'border-[#0b57d0] bg-[#e8f0fe] text-[#0b57d0]'
              : 'border-[#e3e3e3] bg-white text-[#444746] hover:bg-[#f0f4f9]'
        }`}
      >
        {syncing ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#0b57d0]" aria-hidden="true" />
        ) : !isOnline ? (
          <WifiOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <CloudDownload className="h-4 w-4" aria-hidden="true" />
        )}
        {hasCachedData && isOnline && !syncing && (
          <span
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-[#188038] ring-2 ring-white"
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Offline field map cache"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(320px,calc(100vw-32px))] rounded-2xl border border-[#e3e3e3] bg-white p-3.5 shadow-[var(--g-elev-3)]"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-[13px] font-medium text-[#1f1f1f]">Offline field map</h3>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    isOnline
                      ? 'bg-[#e6f4ea] text-[#137333]'
                      : 'bg-[#fef7e0] text-[#b06000]'
                  }`}
                >
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-[#5e5e5e]">
                Caches map tiles and geological observations on this device for valley or quarry fieldwork.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="g-icon-btn !h-7 !w-7 shrink-0"
              aria-label="Close offline map panel"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#f8fafd] p-2.5 text-[11px]">
            <div>
              <div className="text-[#5e5e5e]">Map tiles</div>
              <div className="mt-0.5 font-mono text-[13px] font-medium text-[#1f1f1f]">
                {stats.cachedTiles}
              </div>
            </div>
            <div>
              <div className="text-[#5e5e5e]">Observations</div>
              <div className="mt-0.5 font-mono text-[13px] font-medium text-[#1f1f1f]">
                {stats.cachedObservations}
                {stats.cachedSites > 0 ? ` · ${stats.cachedSites} sites` : ''}
              </div>
            </div>
            <div className="col-span-2 flex items-center justify-between pt-1 text-[10px] text-[#5e5e5e]">
              <span>{stats.swActive ? 'Service Worker active' : 'Local CacheStorage active'}</span>
              <span className="font-mono">{formatSyncTime(stats.lastSyncedAt)}</span>
            </div>
          </div>

          {syncing && progress && (
            <div className="mt-2.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-[#444746]">
                <span>Caching tiles & passports…</span>
                <span className="font-mono">{pct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#e8f0fe]">
                <div
                  className="h-full rounded-full bg-[#0b57d0] transition-all duration-150"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="mt-2 text-[11px] leading-snug text-[#c5221f]">{error}</p>
          )}

          {(getViewportSnapshot || (hasCachedData && !syncing)) && (
          <div className="mt-3 flex items-center gap-2">
            {getViewportSnapshot && (
              <button
                type="button"
                disabled={syncing || !isOnline}
                onClick={handleSaveArea}
                className="g-btn g-btn-filled h-9 flex-1 text-[12px] disabled:opacity-50"
              >
                {syncing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Saving…</span>
                  </>
                ) : justSaved ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Area cached</span>
                  </>
                ) : (
                  <>
                    <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Save current area</span>
                  </>
                )}
              </button>
            )}

            {hasCachedData && !syncing && (
              <button
                type="button"
                onClick={() => void clearCache()}
                title="Clear cached tiles and observations"
                aria-label="Clear cached tiles and observations"
                className="g-icon-btn !h-9 !w-9 border border-[#e3e3e3] text-[#5e5e5e] hover:text-[#c5221f]"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          )}

          <div className="mt-2">
            <PWAInstallButton />
          </div>
        </div>
      )}
    </div>
  );
};
