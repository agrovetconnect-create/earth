<<<<<<< HEAD
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
=======
import type { CommunitySession, CommunityUser } from '../types/communityPosts.js';
import { apiUrl, bearerHeaders, requestJson } from './http.js';
import { createPersistedStore } from './localStore.js';

const TOKEN_STORAGE_KEY = 'rt_community_token';

/**
 * WhatsApp verification session state (Stage 12).
 *
 * The signed-in contributor is a single shared, reactive value: the side card
 * and the MY EARTH TALK dashboard both need it, and it must change in both the
 * moment a session is established or lost. A persisted store keeps that
 * guarantee without a context provider or a global event emitter to debug.
 */

const store = createPersistedStore<CommunitySession | null>(TOKEN_STORAGE_KEY, null, {
  deserialize: (raw, fallback) => {
    const parsed = raw as CommunitySession | null;
    return parsed && parsed.token && parsed.user ? parsed : fallback;
  },
});

export function getCommunitySession(): CommunitySession | null {
  return store.get();
}

export function getCommunityToken(): string | null {
  return getCommunitySession()?.token ?? null;
}

export function setCommunitySession(next: CommunitySession | null): void {
  store.set(next);
}

export function useCommunitySession(): CommunitySession | null {
  return store.use();
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}

export function useCommunityUser(): CommunityUser | null {
  return useCommunitySession()?.user ?? null;
}

export interface RequestCodeResult {
  delivery: string;
  message: string;
  expires_in_seconds: number;
}

<<<<<<< HEAD
/** POST /api/auth/request-code — @deprecated Use requestEmailCode */
export async function requestCode(phone: string): Promise<RequestCodeResult> {
  return requestJson<RequestCodeResult>('/api/auth/request-code', {
    method: 'POST',
=======
/** POST /api/auth/request-code */
export async function requestCode(phone: string): Promise<RequestCodeResult> {
  return requestJson<RequestCodeResult>('/api/auth/request-code', {
    method: 'POST',
    headers: bearerHeaders(null),
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    json: { phone },
    errorMessage: 'Sign-in request failed.',
  });
}

<<<<<<< HEAD
/** POST /api/auth/verify-code — @deprecated Use verifyEmailCode */
export async function verifyCode(phone: string, code: string): Promise<CommunitySession> {
  const data = await requestJson<{ token?: string; expires_at: string; user: CommunityUser }>(
    '/api/auth/verify-code',
    {
      method: 'POST',
=======
/** POST /api/auth/verify-code — returns a token exactly once. */
export async function verifyCode(phone: string, code: string): Promise<CommunitySession> {
  const data = await requestJson<{ token: string; expires_at: string; user: CommunityUser }>(
    '/api/auth/verify-code',
    {
      method: 'POST',
      headers: bearerHeaders(null),
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      json: { phone, code },
      errorMessage: 'The code could not be verified.',
    }
  );
<<<<<<< HEAD
  const next: CommunitySession = { token: '', expires_at: data.expires_at, user: data.user };
=======
  const next: CommunitySession = { token: data.token, expires_at: data.expires_at, user: data.user };
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  setCommunitySession(next);
  return next;
}

<<<<<<< HEAD
/** POST /api/auth/request-email-code */
export async function requestEmailCode(email: string, purpose: string = 'registration'): Promise<any> {
  return requestJson<any>('/api/auth/request-email-code', {
    method: 'POST',
    json: { email, purpose },
    errorMessage: 'Email verification request failed.',
  });
}

/** POST /api/auth/verify-email-code */
export async function verifyEmailCode(email: string, code: string): Promise<CommunitySession> {
  const data = await requestJson<{ token?: string; expires_at: string; user: CommunityUser }>(
    '/api/auth/verify-email-code',
    {
      method: 'POST',
      json: { email, code },
      errorMessage: 'Email code verification failed.',
    }
  );
  const next: CommunitySession = { token: '', expires_at: data.expires_at, user: data.user };
  setCommunitySession(next);
  return next;
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
  return requestJson<any>('/api/auth/verify-link-whatsapp', {
    method: 'POST',
    json: { phone, code },
    errorMessage: 'WhatsApp link verification failed.',
  });
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
=======
/** GET /api/auth/session — reconciles a stored token with the server. */
export async function refreshSession(): Promise<CommunityUser | null> {
  const token = getCommunityToken();
  if (!token) return null;
  const res = await fetch(apiUrl('/api/auth/session'), { headers: bearerHeaders(token) });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.authenticated && data.user) {
    const current = getCommunitySession();
    if (current) {
      setCommunitySession({ ...current, user: data.user });
    }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    return data.user;
  }
  setCommunitySession(null);
  return null;
}

/** POST /api/auth/sign-out */
export async function signOut(): Promise<void> {
<<<<<<< HEAD
  await Promise.allSettled([
    requestJson('/api/auth/sign-out', { method: 'POST' }),
    logoutContributorSession(),
  ]);
=======
  const token = getCommunityToken();
  try {
    if (token) {
      await fetch(apiUrl('/api/auth/sign-out'), {
        method: 'POST',
        headers: bearerHeaders(token),
      });
    }
  } catch {
    // A signed-out identity is still signed out locally.
  }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  setCommunitySession(null);
}

/** PATCH /api/auth/profile */
export async function updateProfile(displayName: string | null): Promise<CommunityUser> {
<<<<<<< HEAD
  if (!getCommunitySession()?.user) throw new Error('Signed out.');
  const data = await requestJson<{ user: CommunityUser }>('/api/auth/profile', {
    method: 'PATCH',
=======
  const token = getCommunityToken();
  if (!token) throw new Error('Signed out.');
  const data = await requestJson<{ user: CommunityUser }>('/api/auth/profile', {
    method: 'PATCH',
    headers: bearerHeaders(token),
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    json: { display_name: displayName },
    errorMessage: 'Profile update failed.',
  });
  const current = getCommunitySession();
  if (current) setCommunitySession({ ...current, user: data.user });
  return data.user;
}

/**
 * URL for a contributor's profile photo, or null without a public id.
<<<<<<< HEAD
=======
 *
 * `version` busts the browser cache after a change so a replaced or removed
 * photo is not served from the old cache entry.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
  if (!getCommunitySession()?.user) throw new Error('Signed out.');
  const data = await requestJson<{ updatedAt: string }>('/api/auth/avatar', {
    method: 'POST',
=======
  const token = getCommunityToken();
  if (!token) throw new Error('Signed out.');
  const data = await requestJson<{ updatedAt: string }>('/api/auth/avatar', {
    method: 'POST',
    headers: bearerHeaders(token),
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    json: { content_base64: contentBase64, mime_type: mimeType },
    errorMessage: 'The photo could not be saved.',
  });
  return { updatedAt: data.updatedAt };
}

/** DELETE /api/auth/avatar — removes the signed-in contributor's profile photo. */
export async function clearAvatar(): Promise<void> {
<<<<<<< HEAD
  if (!getCommunitySession()?.user) throw new Error('Signed out.');
  await requestJson('/api/auth/avatar', {
    method: 'DELETE',
=======
  const token = getCommunityToken();
  if (!token) throw new Error('Signed out.');
  await requestJson('/api/auth/avatar', {
    method: 'DELETE',
    headers: bearerHeaders(token),
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    errorMessage: 'The photo could not be removed.',
  });
}

<<<<<<< HEAD
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

/** POST /api/auth/google-callback — authenticates with Google account credentials */
export async function loginWithGoogle(
  email: string,
  displayName?: string | null,
  avatarUrl?: string | null
): Promise<GoogleAuthResponse> {
  const data = await requestJson<GoogleAuthResponse>('/api/auth/google-callback', {
    method: 'POST',
    json: { email, displayName, avatarUrl },
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
): Promise<{ ok: true; challenge_id: string; expires_in_seconds: number }> {
  return requestJson<{ ok: true; challenge_id: string; expires_in_seconds: number }>(
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
  return requestJson<any>('/api/auth/restore-google-avatar', {
    method: 'POST',
    errorMessage: 'Failed to restore Google profile photo.',
  });
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
=======
/** Auth header for community post APIs; empty when signed out. */
export function getCommunityAuthHeaders(): Record<string, string> {
  return bearerHeaders(getCommunityToken());
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}