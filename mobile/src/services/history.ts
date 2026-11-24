import type { View } from './navigation';
import { createPersistedStore } from './localStore';

/**
 * Visit history for Earth Talk, persisted under the same key as the web app.
 * Records the views the visitor opened so they can retrace their session.
 */

export interface NavigationHistoryEntry {
  id: string;
  ts: number;
  view: View;
  panel: string | null;
  title: string;
  passportId: string | null;
  siteId: string | null;
}

const HISTORY_KEY = 'rt_history';
const HISTORY_MAX = 200;

export const historyStore = createPersistedStore<NavigationHistoryEntry[]>(HISTORY_KEY, []);

export function recordView(entry: {
  view: View;
  panel?: string | null;
  title: string;
  passportId?: string | null;
  siteId?: string | null;
}): void {
  const now = Date.now();
  const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const next: NavigationHistoryEntry = {
    id,
    ts: now,
    view: entry.view,
    panel: entry.panel ?? null,
    title: entry.title,
    passportId: entry.passportId ?? null,
    siteId: entry.siteId ?? null,
  };
  const current = historyStore.get();
  const isDuplicate = current.some(
    (existing) =>
      existing.view === next.view &&
      existing.panel === next.panel &&
      existing.passportId === next.passportId &&
      existing.siteId === next.siteId &&
      // same target within 90 seconds is not a new visit
      now - existing.ts < 90_000
  );
  if (isDuplicate) return;
  historyStore.set([next, ...current].slice(0, HISTORY_MAX));
}

export function clearHistory(): void {
  historyStore.set([]);
}

export function removeHistory(id: string): void {
  historyStore.set(historyStore.get().filter((entry) => entry.id !== id));
}

export interface HistoryDayGroup {
  label: string;
  entries: NavigationHistoryEntry[];
}

function dayLabel(ts: number, dateLocale: string): string {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function groupHistoryByDay(
  entries: NavigationHistoryEntry[],
  dateLocale = 'en-US'
): HistoryDayGroup[] {
  const groups = new Map<string, NavigationHistoryEntry[]>();
  for (const entry of entries) {
    const label = dayLabel(entry.ts, dateLocale);
    const bucket = groups.get(label);
    if (bucket) bucket.push(entry);
    else groups.set(label, [entry]);
  }
  return Array.from(groups.entries()).map(([label, groupEntries]) => ({
    label,
    entries: groupEntries,
  }));
}

export function formatHistoryTime(ts: number, dateLocale = 'en-US'): string {
  return new Date(ts).toLocaleTimeString(dateLocale, { hour: 'numeric', minute: '2-digit' });
}
