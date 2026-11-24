/**
 * Offline-first field submission queue. Stores pending submissions in localStorage
 * when offline and auto-syncs when network connectivity returns.
 */
interface QueuedSubmission {
  id: string;
  payload: unknown;
  timestamp: number;
}

const STORAGE_KEY = 'et_offline_submission_queue_v1';

export function getOfflineQueue(): QueuedSubmission[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineSubmission(payload: unknown): string {
  if (typeof window === 'undefined') return '';
  try {
    const queue = getOfflineQueue();
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const next = [...queue, { id, payload, timestamp: Date.now() }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return id;
  } catch {
    return '';
  }
}

export function removeOfflineSubmission(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const queue = getOfflineQueue();
    const next = queue.filter((item) => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/**
 * Registers an online event listener to flush queued submissions.
 */
export function initOfflineSyncListener(onSyncItem: (payload: unknown) => Promise<boolean>): void {
  if (typeof window === 'undefined') return;

  const handleOnline = async () => {
    if (!navigator.onLine) return;
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    for (const item of queue) {
      try {
        const success = await onSyncItem(item.payload);
        if (success) {
          removeOfflineSubmission(item.id);
        }
      } catch {
        // Keep in queue for next attempt
      }
    }
  };

  window.addEventListener('online', handleOnline);
}
