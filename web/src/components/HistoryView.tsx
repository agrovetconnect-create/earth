import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  Compass,
  Download,
  History as HistoryIcon,
  MapPin,
  MoreVertical,
  Search,
  Telescope,
  Trash2,
  X,
  Menu,
} from 'lucide-react';
import {
  clearHistory,
  formatHistoryTime,
  groupHistoryByDay,
  removeHistory,
  useHistory,
  type HistoryEntry,
} from '../services/history.js';

interface HistoryViewProps {
  onOpen: (entry: HistoryEntry) => void;
  onBackToApp: () => void;
  isNarrow?: boolean;
  onOpenSidebar?: () => void;
}

type HistoryFilter = 'all' | 'observation' | 'site' | 'view';

function entryCategory(entry: HistoryEntry): Exclude<HistoryFilter, 'all'> {
  if (entry.passportId) return 'observation';
  if (entry.siteId) return 'site';
  return 'view';
}

function entryKindLabel(entry: HistoryEntry): string {
  if (entry.passportId) return 'Observation';
  if (entry.siteId) return 'Geological site';
  switch (entry.view) {
    case 'explore':
      return 'Explore map';
    case 'sites':
      return 'Geoscience sites';
    case 'community':
      return entry.panel === 'reputation' ? 'Contributions' : 'Investigations';
    case 'mine':
      return 'My Earth Talk';
    case 'my-map':
      return 'My Map';
    default:
      return 'View';
  }
}

function EntryIcon({ entry }: { entry: HistoryEntry }) {
  if (entry.passportId) return <Telescope className="w-5 h-5" aria-hidden="true" />;
  if (entry.siteId || entry.view === 'sites') return <MapPin className="w-5 h-5" aria-hidden="true" />;
  if (entry.view === 'community') return <Search className="w-5 h-5" aria-hidden="true" />;
  if (entry.view === 'explore' || entry.view === 'my-map') {
    return <Compass className="w-5 h-5" aria-hidden="true" />;
  }
  return <HistoryIcon className="w-5 h-5" aria-hidden="true" />;
}

/**
 * Local visit history view matching Earth Talk's Google Material 3 shell.
 * All records stay in this browser's localStorage and never leave the device.
 */
export const HistoryView: React.FC<HistoryViewProps> = ({
  onOpen,
  onBackToApp,
  isNarrow,
  onOpenSidebar,
}) => {
  const entries = useHistory();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [confirmClear, setConfirmClear] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);

  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (!confirmClear) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmClear(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmClear]);

  const handleExportCSV = () => {
    if (entries.length === 0) return;
    const headers = ['ID', 'Date', 'Time', 'Type', 'Label', 'Subtitle', 'View'];
    const rows = entries.map((e) => [
      `"${e.id.replace(/"/g, '""')}"`,
      `"${new Date(e.at).toISOString().split('T')[0]}"`,
      `"${formatHistoryTime(e.at)}"`,
      `"${entryKindLabel(e).replace(/"/g, '""')}"`,
      `"${e.label.replace(/"/g, '""')}"`,
      `"${(e.subtitle ?? '').replace(/"/g, '""')}"`,
      `"${e.view}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `earth_talk_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const counts = useMemo(() => {
    let observation = 0;
    let site = 0;
    let view = 0;
    for (const entry of entries) {
      const cat = entryCategory(entry);
      if (cat === 'observation') observation += 1;
      else if (cat === 'site') site += 1;
      else view += 1;
    }
    return { all: entries.length, observation, site, view };
  }, [entries]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter !== 'all' && entryCategory(entry) !== filter) return false;
      if (!needle) return true;
      return [entry.label, entry.subtitle ?? '', entryKindLabel(entry)].some((value) =>
        String(value ?? '').toLowerCase().includes(needle),
      );
    });
  }, [entries, filter, query]);

  const grouped = useMemo(() => groupHistoryByDay(filtered), [filtered]);

  return (
    <div className="min-h-dvh bg-[#f0f4f9] text-[#1f1f1f] flex flex-col selection:bg-[#d3e3fd] selection:text-[#041e49]">
      <main className="mx-auto flex w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {isNarrow && onOpenSidebar && (
                <button
                  type="button"
                  onClick={onOpenSidebar}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dadce0] bg-white text-[#5e5e5e] shadow-2xs hover:bg-[#f8faff] hover:text-[#0b57d0] transition-colors cursor-pointer"
                  title="Open sidebar"
                  aria-label="Open sidebar"
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
              <div>
                <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1f1f1f] tracking-tight flex items-center gap-2">
                  <HistoryIcon className="w-6 h-6 text-[#0b57d0]" aria-hidden="true" />
                  Visit History
                </h1>
                <p className="text-xs sm:text-[13px] text-[#5e5e5e] mt-0.5">
                  Local browsing records stored only on this device.
                </p>
              </div>
            </div>
            {entries.length > 0 && (
              <div className="hidden items-center gap-2 sm:flex">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-[#3c4043] shadow-[0_1px_2px_rgba(60,64,67,0.12)] transition-colors hover:text-[#0b57d0] cursor-pointer"
                  title="Export history as CSV"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-[#3c4043] shadow-[0_1px_2px_rgba(60,64,67,0.12)] transition-colors hover:text-[#b3261e] cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear history
                </button>
              </div>
            )}
          </div>

          {entries.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search
                    className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5e5e5e]"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search history"
                    aria-label="Search history"
                    className="h-11 w-full rounded-full border border-[#dadce0] bg-white pl-11 pr-10 text-sm text-[#1f1f1f] outline-none transition placeholder:text-[#80868b] focus:border-[#0b57d0] focus:ring-4 focus:ring-[#0b57d0]/10"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[#5e5e5e] transition-colors hover:bg-[#e8eaed] hover:text-[#1f1f1f] cursor-pointer"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="relative shrink-0 sm:hidden">
                  <button
                    type="button"
                    onClick={() => setHistoryMenuOpen((open) => !open)}
                    aria-label="History actions"
                    aria-haspopup="menu"
                    aria-expanded={historyMenuOpen}
                    className="flex h-11 w-11 items-center justify-center text-[#5e5e5e] transition-colors hover:text-[#0b57d0] cursor-pointer"
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden="true" />
                  </button>
                  {historyMenuOpen && (
                    <>
                      <button
                        type="button"
                        aria-label="Close history actions"
                        className="fixed inset-0 z-10 cursor-default"
                        onClick={() => setHistoryMenuOpen(false)}
                      />
                      <div
                        role="menu"
                        className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-xl border border-[#dadce0] bg-white py-1 shadow-[0_8px_24px_rgba(60,64,67,0.18)]"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setHistoryMenuOpen(false);
                            handleExportCSV();
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-[#3c4043] transition-colors hover:bg-[#f1f3f4] hover:text-[#0b57d0] cursor-pointer"
                        >
                          <Download className="h-4 w-4" aria-hidden="true" />
                          Export history
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setHistoryMenuOpen(false);
                            setConfirmClear(true);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-[#b3261e] transition-colors hover:bg-[#fce8e6] cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Clear history
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {(
                  [
                    { id: 'all', label: `All (${counts.all})` },
                    { id: 'observation', label: `Observations (${counts.observation})` },
                    { id: 'site', label: `Sites (${counts.site})` },
                    { id: 'view', label: `Views (${counts.view})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-medium shadow-[0_1px_2px_rgba(60,64,67,0.10)] transition-colors ${
                      filter === tab.id
                        ? 'bg-[#d3e3fd] text-[#041e49]'
                        : 'bg-white text-[#444746] hover:bg-[#e8f0fe]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <section className="rounded-3xl border border-[#dde3ea] bg-white px-6 py-16 text-center shadow-[0_1px_2px_rgba(60,64,67,0.08)]">
              <HistoryIcon className="mx-auto h-10 w-10 text-[#8f8f8f]" aria-hidden="true" />
              <p className="mt-4 text-base font-medium text-[#1f1f1f]">
                {entries.length === 0 ? 'No visit history yet' : 'No matching history entries'}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-[#5e5e5e]">
                {entries.length === 0
                  ? 'Observations, geological sites, and views you open will appear here. Nothing leaves your browser.'
                  : 'Try a different search phrase or switch back to all entries.'}
              </p>
              {entries.length === 0 ? (
                <button
                  type="button"
                  onClick={onBackToApp}
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-[#0b57d0] px-4 text-sm font-medium text-white transition-colors hover:bg-[#0842a0]"
                >
                  <Compass className="h-4 w-4" aria-hidden="true" />
                  Explore map
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                  className="mt-5 inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-[#0b57d0] transition-colors hover:bg-[#e8f0fe]"
                >
                  Reset filters
                </button>
              )}
            </section>
          ) : (
            <div className="space-y-5">
              {grouped.map((group) => (
                <div key={group.day} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <CalendarDays className="h-4 w-4 text-[#5e5e5e]" aria-hidden="true" />
                    <h2 className="text-sm font-semibold text-[#3c4043]">{group.day}</h2>
                    <span className="text-[11px] text-[#80868b]">{group.items.length} entries</span>
                  </div>
                  <div className="divide-y divide-[#eef0f3] rounded-3xl border border-[#dde3ea] bg-white shadow-[0_1px_2px_rgba(60,64,67,0.08)]">
                    {group.items.map((entry) => (
                      <div
                        key={entry.id}
                        className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#f8fafd] sm:gap-4 sm:px-5"
                      >
                        <div className="shrink-0 text-[#0b57d0]">
                          <EntryIcon entry={entry} />
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpen(entry)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <h3 className="truncate text-sm font-medium text-[#0b57d0] group-hover:underline">
                            {entry.label}
                          </h3>
                          <p className="mt-0.5 truncate text-xs text-[#5e5e5e]">
                            {entryKindLabel(entry)}
                            {entry.subtitle &&
                              entry.subtitle.trim().toLowerCase() !==
                                entry.label.trim().toLowerCase() &&
                              entry.subtitle.trim().toLowerCase() !==
                                entryKindLabel(entry).toLowerCase() &&
                              ` · ${entry.subtitle.trim()}`}
                          </p>
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="hidden text-[11px] tabular-nums text-[#80868b] sm:inline">
                            {formatHistoryTime(entry.at)}
                          </span>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenMenuId((current) => (current === entry.id ? null : entry.id));
                              }}
                              title="Entry actions"
                              aria-label="Entry actions"
                              aria-haspopup="menu"
                              aria-expanded={openMenuId === entry.id}
                              className="p-1 text-[#5e5e5e] transition-colors hover:text-[#1f1f1f]"
                            >
                              <MoreVertical className="h-4 w-4" aria-hidden="true" />
                            </button>
                            {openMenuId === entry.id && (
                              <div
                                role="menu"
                                onClick={(event) => event.stopPropagation()}
                                className="absolute right-0 top-full z-20 mt-1 w-36 rounded-xl border border-[#dde3ea] bg-white p-1 shadow-lg"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    onOpen(entry);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#3c4043] transition-colors hover:bg-[#f1f3f4]"
                                >
                                  Open
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    removeHistory(entry.id);
                                    setOpenMenuId(null);
                                  }}
                                  className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#b3261e] transition-colors hover:bg-[#fce8e6]"
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {confirmClear && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-[#0b0f14]/55 p-4 backdrop-blur-xs"
            onClick={(event) => {
              if (event.target === event.currentTarget) setConfirmClear(false);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="clear-history-title"
              aria-describedby="clear-history-description"
              className="w-full max-w-sm rounded-2xl border border-[#dadce0] bg-white p-5 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-[#b3261e]" aria-hidden="true" />
                <div className="min-w-0">
                  <h2 id="clear-history-title" className="text-[15px] font-medium text-[#1f1f1f]">
                    Clear visit history?
                  </h2>
                  <p id="clear-history-description" className="mt-1.5 text-[12px] leading-relaxed text-[#5e5e5e]">
                    This removes every observation, site, and view from this browser. It cannot be undone.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="g-btn g-btn-tonal h-9 px-4 text-[12px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearHistory();
                    setConfirmClear(false);
                    setQuery('');
                    setFilter('all');
                  }}
                  className="inline-flex h-9 items-center rounded-full bg-[#b3261e] px-4 text-[12px] font-medium text-white transition-colors hover:bg-[#8e1d17]"
                >
                  Clear history
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
