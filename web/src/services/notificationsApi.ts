import { getCommunitySession } from './communityAuth.js';
import { requestJson } from './http.js';

/**
 * Authenticated contributor notification inbox.
 *
 * Every request is scoped by the server-side session cookie; the browser never
 * supplies an account id, so one user cannot read another user's notifications.
 */

export type NotificationType = 'reply' | 'vote' | 'verification' | 'visit' | 'announcement';

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  type: NotificationType;
  passport_id: string | null;
  site_id: string | null;
  comment_id?: string | null;
}

interface NotificationListResponse {
  data: NotificationItem[];
  unread_count?: number;
}

function requireSignedIn(): void {
  if (!getCommunitySession()?.user) throw new Error('Sign in to view your notifications.');
}

function normaliseList(data: NotificationListResponse): NotificationItem[] {
  return Array.isArray(data?.data) ? data.data : [];
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const data = await requestJson<NotificationListResponse>('/api/me/notifications', {
    headers: { Accept: 'application/json' },
    errorMessage: 'Could not load your notifications.',
  });
  return normaliseList(data);
}

export async function markNotificationRead(
  id: string,
  read: boolean = true
): Promise<NotificationItem | null> {
  requireSignedIn();
  const data = await requestJson<{ data: NotificationItem }>(
    `/api/me/notifications/${encodeURIComponent(id)}/read`,
    {
      method: 'PATCH',
      headers: { Accept: 'application/json' },
      json: { read },
      errorMessage: 'Could not update that notification.',
    }
  );
  return data?.data ?? null;
}

export async function markAllNotificationsRead(): Promise<void> {
  requireSignedIn();
  await requestJson('/api/me/notifications/read-all', {
    method: 'PATCH',
    headers: { Accept: 'application/json' },
    errorMessage: 'Could not update your notifications.',
  });
}

export async function dismissNotification(id: string): Promise<void> {
  requireSignedIn();
  await requestJson(`/api/me/notifications/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    errorMessage: 'Could not dismiss that notification.',
  });
}

export async function clearNotifications(): Promise<void> {
  requireSignedIn();
  await requestJson('/api/me/notifications', {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    errorMessage: 'Could not clear your notifications.',
  });
}
