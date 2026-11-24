import { useSyncExternalStore } from 'react';
import type { CommunitySession, CommunityUser } from '../types/communityPosts.js';
import { apiUrl, requestJson } from './http.js';
import { logoutContributorSession } from './communityApi.js';

/**
 * Authenticated community user state.
 *
 * Session credentials live exclusively in the server-issued `et_user_session`
 * HttpOnly cookie. Only non-secret user profile state is held in memory for UI
 * rendering, and `/api/auth/session` hydrates that state on page load.
 */

let currentSession: CommunitySession | null = null;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCommunitySession(): CommunitySession | null {
  return currentSession;
}

export function getCommunityToken(): string | null {
  return null;
}

export function setCommunitySession(next: CommunitySession | null): void {
  currentSession = next ? { ...next, token: '' } : null;
  emitChange();
}

export function useCommunitySession(): CommunitySession | null {
  return useSyncExternalStore(subscribe, getCommunitySession, () => null);
}

export function useCommunityUser(): CommunityUser | null {
  return useCommunitySession()?.user ?? null;
}

export interface GoogleAuthConfig {
  method: 'google_supabase';
  google_enabled: boolean;
  supabase_url: string | null;
}

/** GET /api/auth/config — resolves public Supabase project URL for Google OAuth. */
export async function fetchGoogleAuthConfig(): Promise<GoogleAuthConfig> {
  return requestJson<GoogleAuthConfig>('/api/auth/config', {
    method: 'GET',
    errorMessage: 'Unable to load Google sign-in configuration.',
  });
}

/** POST /api/auth/link-whatsapp */
export async function linkWhatsApp(phone: string): Promise<any> {
  return requestJson<any>('/api/auth/link-whatsapp', {
    method: 'POST',
    json: { phone },
    errorMessage: 'WhatsApp link request failed.',
  });
}

/** POST /api/auth/verify-link-whatsapp */
export async function verifyLinkWhatsApp(phone: string, code: string): Promise<any> {
  const data = await requestJson<any>('/api/auth/verify-link-whatsapp', {
    method: 'POST',
    json: { phone, code },
    errorMessage: 'WhatsApp link verification failed.',
  });
  const current = getCommunitySession();
  if (data?.user) {
    setCommunitySession({
      token: current?.token ?? '',
      expires_at: current?.expires_at ?? '',
      user: data.user,
    });
  } else {
    await refreshSession().catch(() => null);
  }
  return data;
}

/** GET /api/auth/session — reconciles the HttpOnly session cookie with the server. */
export async function refreshSession(): Promise<CommunityUser | null> {
  const res = await fetch(apiUrl('/api/auth/session'), {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.authenticated && data.user) {
    setCommunitySession({
      token: '',
      expires_at: typeof data.expires_at === 'string' ? data.expires_at : '',
      user: data.user,
    });
    return data.user;
  }
  setCommunitySession(null);
  return null;
}

/** POST /api/auth/sign-out */
export async function signOut(): Promise<void> {
  await Promise.allSettled([
    requestJson('/api/auth/sign-out', { method: 'POST' }),
    logoutContributorSession(),
  ]);
  setCommunitySession(null);
}

/** PATCH /api/auth/profile */
export async function updateProfile(displayName: string | null): Promise<CommunityUser> {
  if (!getCommunitySession()?.user) throw new Error('Signed out.');
  const data = await requestJson<{ user: CommunityUser }>('/api/auth/profile', {
    method: 'PATCH',
    json: { display_name: displayName },
    errorMessage: 'Profile update failed.',
  });
  const current = getCommunitySession();
  if (current) setCommunitySession({ ...current, user: data.user });
  return data.user;
}

/**
 * URL for a contributor's profile photo, or null without a public id.
 */
export function userAvatarSrc(
  publicUserId: string | null | undefined,
  version?: number | string
): string | null {
  if (!publicUserId) return null;
  const base = apiUrl(`/api/users/${encodeURIComponent(publicUserId)}/avatar`);
  return version === undefined ? base : `${base}?v=${encodeURIComponent(String(version))}`;
}

/** POST /api/auth/avatar — replaces the signed-in contributor's profile photo. */
export async function setAvatar(
  contentBase64: string,
  mimeType: string
): Promise<{ updatedAt: string }> {
  if (!getCommunitySession()?.user) throw new Error('Signed out.');
  const data = await requestJson<{ updatedAt: string }>('/api/auth/avatar', {
    method: 'POST',
    json: { content_base64: contentBase64, mime_type: mimeType },
    errorMessage: 'The photo could not be saved.',
  });
  const current = getCommunitySession();
  if (current) {
    setCommunitySession({
      ...current,
      user: {
        ...current.user,
        avatar_url: userAvatarSrc(current.user.public_user_id, data.updatedAt) ?? current.user.avatar_url,
      },
    });
  }
  return { updatedAt: data.updatedAt };
}

/** DELETE /api/auth/avatar — removes the signed-in contributor's profile photo. */
export async function clearAvatar(): Promise<void> {
  if (!getCommunitySession()?.user) throw new Error('Signed out.');
  await requestJson('/api/auth/avatar', {
    method: 'DELETE',
    errorMessage: 'The photo could not be removed.',
  });
  await refreshSession().catch(() => null);
}

export interface GoogleAuthResponse {
  authenticated?: boolean;
  verification_required?: boolean;
  challenge_id?: string;
  email?: string;
  masked_email?: string;
  purpose?: string;
  expires_in_seconds?: number;
  message?: string;
  token?: string;
  expires_at?: string;
  user?: CommunityUser;
}

/** POST /api/auth/google-callback — exchanges Supabase OAuth access_token or code on the server */
export async function completeGoogleOAuthCallback(payload: {
  accessToken?: string | null;
  code?: string | null;
}): Promise<GoogleAuthResponse> {
  const data = await requestJson<GoogleAuthResponse>('/api/auth/google-callback', {
    method: 'POST',
    json: {
      access_token: payload.accessToken || undefined,
      code: payload.code || undefined,
    },
    errorMessage: 'Google authentication failed.',
  });

  if (!data.verification_required && data.user) {
    const next: CommunitySession = { token: '', expires_at: data.expires_at || '', user: data.user };
    setCommunitySession(next);
  }
  return data;
}

/** POST /api/auth/google/verify-challenge — verifies 6-digit OTP code for Google login */
export async function verifyGoogleChallenge(
  challengeId: string,
  code: string,
  displayName?: string | null,
  avatarUrl?: string | null
): Promise<CommunitySession> {
  const data = await requestJson<{ token?: string; expires_at: string; user: CommunityUser }>(
    '/api/auth/google/verify-challenge',
    {
      method: 'POST',
      json: { challenge_id: challengeId, code, displayName, avatarUrl },
      errorMessage: 'Google verification code failed.',
    }
  );
  const next: CommunitySession = { token: '', expires_at: data.expires_at, user: data.user };
  setCommunitySession(next);
  return next;
}

/** POST /api/auth/google/resend-challenge — resends 6-digit OTP code for Google login */
export async function resendGoogleChallenge(
  challengeId: string
): Promise<{ ok: true; challenge_id: string; expires_in_seconds: number; message?: string }> {
  return requestJson<{ ok: true; challenge_id: string; expires_in_seconds: number; message?: string }>(
    '/api/auth/google/resend-challenge',
    {
      method: 'POST',
      json: { challenge_id: challengeId },
      errorMessage: 'Resending verification code failed.',
    }
  );
}

/** POST /api/auth/restore-google-avatar — restores original Google photo */
export async function restoreGoogleAvatar(): Promise<any> {
  if (!getCommunitySession()?.user) throw new Error('Signed out.');
  const data = await requestJson<any>('/api/auth/restore-google-avatar', {
    method: 'POST',
    errorMessage: 'Failed to restore Google profile photo.',
  });
  await refreshSession().catch(() => null);
  return data;
}

/** GET /api/auth/profile — fetches user profile */
export async function fetchUserProfile(): Promise<any> {
  if (!getCommunitySession()?.user) throw new Error('Signed out.');
  return requestJson<any>('/api/auth/profile', {
    method: 'GET',
    errorMessage: 'Failed to load user profile.',
  });
}

/** Content headers for community post APIs; auth is carried via HttpOnly cookie. */
export function getCommunityAuthHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}