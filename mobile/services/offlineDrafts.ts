/**
 * Offline Field Draft Queue for Remote Geoscience Fieldwork
 * Lets geologists and citizen scientists save primary photos, recovered EXIF
 * coordinates, sampling context, and supporting site videos locally when cell
 * signal is absent in valleys or quarries, then analyze & pin once connected.
 */

export interface SupportingMediaDraftItem {
  content_base64: string;
  mime_type: string;
  caption?: string;
  role?: string;
  file_name?: string;
}

export interface OfflineFieldDraft {
  id: string;
  savedAt: string;
  title: string;
  caption: string;
  district: string;
  latitude: string;
  longitude: string;
  locationSource: 'exif' | 'live_gps' | 'manual';
  specimenContext: string;
  hasScaleReference: boolean;
  hasFreshSurface: boolean;
  primaryBase64: string;
  primaryMimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
  primaryFileName: string;
  supportingMedia: SupportingMediaDraftItem[];
}

const STORAGE_KEY = 'earth-talk-mobile-offline-field-drafts-v1';
const MAX_DRAFTS = 10;
let memoryDrafts: OfflineFieldDraft[] = [];

async function readRawDrafts(): Promise<OfflineFieldDraft[]> {
  try {
    const mod = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = mod?.default;
    if (AsyncStorage?.getItem) {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          memoryDrafts = parsed.filter(
            (d): d is OfflineFieldDraft =>
              typeof d === 'object' &&
              d !== null &&
              typeof (d as Record<string, unknown>).id === 'string' &&
              typeof (d as Record<string, unknown>).primaryBase64 === 'string'
          );
          return memoryDrafts;
        }
      }
    }
  } catch {
    // Fallback to memory store
  }
  return memoryDrafts;
}

async function writeRawDrafts(items: OfflineFieldDraft[]): Promise<void> {
  memoryDrafts = items;
  try {
    const mod = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = mod?.default;
    if (AsyncStorage?.setItem) {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // Ignore storage quota or permission errors
  }
}

export async function listOfflineFieldDrafts(): Promise<OfflineFieldDraft[]> {
  return readRawDrafts();
}

export async function saveOfflineFieldDraft(
  draft: Omit<OfflineFieldDraft, 'id' | 'savedAt'>
): Promise<OfflineFieldDraft> {
  const existing = await readRawDrafts();
  const created: OfflineFieldDraft = {
    ...draft,
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    savedAt: new Date().toISOString(),
  };
  const next = [created, ...existing].slice(0, MAX_DRAFTS);
  await writeRawDrafts(next);
  return created;
}

export async function removeOfflineFieldDraft(id: string): Promise<void> {
  const existing = await readRawDrafts();
  await writeRawDrafts(existing.filter((d) => d.id !== id));
}

export type OfflineDraftSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface OfflineObservationDraft {
  id: string;
  photoUri: string;
  title: string;
  category?: string;
  district?: string;
  latitude?: number | null;
  longitude?: number | null;
  notes?: string;
  createdAt: string;
  syncStatus: OfflineDraftSyncStatus;
}

let syncQueueStore: OfflineObservationDraft[] = [];

export function saveOfflineDraft(
  input: Omit<OfflineObservationDraft, 'id' | 'createdAt' | 'syncStatus'>
): OfflineObservationDraft {
  const created: OfflineObservationDraft = {
    ...input,
    id: `sync_draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
  };
  syncQueueStore = [created, ...syncQueueStore];
  return created;
}

export function getOfflineDrafts(): OfflineObservationDraft[] {
  return [...syncQueueStore];
}

export function getPendingDrafts(): OfflineObservationDraft[] {
  return syncQueueStore.filter((d) => d.syncStatus === 'pending' || d.syncStatus === 'failed');
}

export function updateDraftStatus(id: string, status: OfflineDraftSyncStatus): boolean {
  const idx = syncQueueStore.findIndex((d) => d.id === id);
  if (idx === -1) return false;
  syncQueueStore[idx] = { ...syncQueueStore[idx]!, syncStatus: status };
  return true;
}

export function deleteOfflineDraft(id: string): boolean {
  const prevLen = syncQueueStore.length;
  syncQueueStore = syncQueueStore.filter((d) => d.id !== id);
  return syncQueueStore.length < prevLen;
}

