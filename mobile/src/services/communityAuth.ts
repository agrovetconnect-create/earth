import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CommunitySession, CommunityUser } from '../types/communityPosts';
import { apiUrl, requestJson } from './http';
import { logoutContributorSession } from './communityApi';

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

/**
 * The signed-in user profile is cached in AsyncStorage so the contributor
 * stays logged in across app restarts and even with no internet: the session
 * cookie still lives in the native cookie store, and this cached profile
 * hydrates the UI while the server is unreachable. The server still rejects
 * stale sessions for any real action, so this is display state only.
 */
const SESSION_CACHE_KEY = 'et_user_session_cache';

function writeSessionCache(next: CommunitySession | null): void {
  if (next?.user) {
    void AsyncStorage.setItem(
      SESSION_CACHE_KEY,
      JSON.stringify({ expires_at: next.expires_at, user: next.user }),
    ).catch(() => undefined);
  } else {
    void AsyncStorage.removeItem(SESSION_CACHE_KEY).catch(() => undefined);
  }
}

/** Restores the last known signed-in user from the device cache, if any. */
export async function hydrateCachedSession(): Promise<CommunityUser | null> {
  if (currentSession) return currentSession.user;
  try {
    const raw = await AsyncStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expires_at?: string; user?: CommunityUser };
    if (!parsed?.user) return null;
    setCommunitySession({ token: '', expires_at: parsed.expires_at ?? '', user: parsed.user });
    return parsed.user;
  } catch {
    return null;
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
  writeSessionCache(next);
  emitChange();
}

export function useCommunitySession(): CommunitySession | null {
  return useSyncExternalStore(subscribe, getCommunitySession, () => null);
}

export function useCommunityUser(): CommunityUser | null {
  return useCommunitySession()?.user ?? null;
}

export interface RequestCodeResult {
  delivery: string;
  message: string;
  expires_in_seconds: number;
}

/** POST /api/auth/request-code — @deprecated Use requestEmailCode */
export async function requestCode(phone: string): Promise<RequestCodeResult> {
  return requestJson<RequestCodeResult>('/api/auth/request-code', {
    method: 'POST',
    json: { phone },
    errorMessage: 'Sign-in request failed.',
  });
}

/** POST /api/auth/verify-code — @deprecated Use verifyEmailCode */
export async function verifyCode(phone: string, code: string): Promise<CommunitySession> {
  const data = await requestJson<{ token?: string; expires_at: string; user: CommunityUser }>(
    '/api/auth/verify-code',
    {
      method: 'POST',
      json: { phone, code },
      errorMessage: 'The code could not be verified.',
    }
  );
  const next: CommunitySession = { token: '', expires_at: data.expires_at, user: data.user };
  setCommunitySession(next);
  return next;
}

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
  let data: { authenticated?: boolean; expires_at?: string; user?: CommunityUser };
  try {
    const res = await fetch(apiUrl('/api/auth/session'), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      setCommunitySession(null);
      return null;
    }
    data = await res.json();
  } catch {
    // Offline or the server is unreachable: keep the cached login so the
    // contributor stays signed in until connectivity returns.
    return currentSession?.user ?? null;
  }
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
  return { updatedAt: data.updatedAt };
}

/** DELETE /api/auth/avatar — removes the signed-in contributor's profile photo. */
export async function clearAvatar(): Promise<void> {
  if (!getCommunitySession()?.user) throw new Error('Signed out.');
  await requestJson('/api/auth/avatar', {
    method: 'DELETE',
    errorMessage: 'The photo could not be removed.',
  });
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

export interface WelcomeEmailStatus {
  sent: boolean;
  sent_at: string | null;
  last_attempt_at: string | null;
  attempts: number;
  last_error: string | null;
  can_resend: boolean;
  retry_after_seconds: number;
}

/** GET /api/auth/welcome-email — checks whether the welcome email was delivered. */
export async function fetchWelcomeEmailStatus(): Promise<WelcomeEmailStatus> {
  if (!getCommunitySession()?.user) throw new Error('Signed out.');
  const data = await requestJson<{ welcome_email: WelcomeEmailStatus }>(
    '/api/auth/welcome-email',
    { method: 'GET', errorMessage: 'Could not check the welcome email.' }
  );
  return data.welcome_email;
}

/** POST /api/auth/welcome-email/resend — resends the branded welcome email. */
export async function resendWelcomeEmail(): Promise<{
  sent: boolean;
  welcome_email: WelcomeEmailStatus;
}> {
  if (!getCommunitySession()?.user) throw new Error('Signed out.');
  return requestJson<{ sent: boolean; welcome_email: WelcomeEmailStatus }>(
    '/api/auth/welcome-email/resend',
    { method: 'POST', errorMessage: 'The welcome email could not be sent.' }
  );
}

/** Content headers for community post APIs; auth is carried via HttpOnly cookie. */
export function getCommunityAuthHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}