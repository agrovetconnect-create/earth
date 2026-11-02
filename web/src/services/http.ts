<<<<<<< HEAD
import {
  isCacheableReadPath,
  matchOfflineCacheFallback,
  mirrorToOfflineCache,
} from './offlineCache.js';
import { preferencesStore } from './preferences.js';

/**
 * Shared fetch helpers for the web API clients.
 *
 * Authentication credentials on the web travel exclusively via HttpOnly cookies
 * (`credentials: 'include'`), paired with double-submit CSRF tokens (`et_csrf`
 * cookie echoed in `X-CSRF-Token`) on state-changing requests.
=======
/**
 * Shared fetch helpers for the web API clients.
 *
 * Each service used to declare its own base URL, JSON headers, `res.ok` check
 * and error-message extraction. They live here now so the backend error
 * envelope (`{ error: { code, message } }`, or a bare `{ error }` string) is
 * interpreted in exactly one place.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
 */

export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || '';

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

<<<<<<< HEAD
const CSRF_COOKIE_NAME = 'et_csrf';
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let csrfInFlight: Promise<string | null> | null = null;

export function readCsrfCookie(): string | null {
  if (typeof document === 'undefined' || typeof document.cookie !== 'string') {
    return null;
  }
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    if (name !== CSRF_COOKIE_NAME) continue;
    const rawVal = trimmed.slice(eqIdx + 1).trim();
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return rawVal;
    }
  }
  return null;
}

export async function ensureCsrfToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh) {
    const existing = readCsrfCookie();
    if (existing) return existing;
  }
  if (csrfInFlight) return csrfInFlight;

  csrfInFlight = (async () => {
    try {
      const res = await fetch(apiUrl('/api/auth/csrf'), {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return readCsrfCookie();
      const body = (await res.json().catch(() => null)) as { csrfToken?: unknown } | null;
      if (body && typeof body.csrfToken === 'string' && body.csrfToken.length > 0) {
        return body.csrfToken;
      }
      return readCsrfCookie();
    } catch {
      return readCsrfCookie();
    } finally {
      csrfInFlight = null;
    }
  })();

  return csrfInFlight;
}

/** JSON content type plus an optional bearer token when explicitly supplied. */
=======
/** JSON content type plus a bearer token when one is present. */
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export function bearerHeaders(
  token: string | null | undefined,
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export interface JsonRequestInit extends Omit<RequestInit, 'body'> {
  /** JSON body; serialised and paired with a JSON content type. */
  json?: unknown;
  /** Resolve `null` on HTTP 404 instead of throwing. */
  nullOn404?: boolean;
  /** Message used when the response carries no readable error. */
  errorMessage?: string | ((res: Response) => string);
}

/**
 * Extracts a readable message from an error response, whatever its shape.
<<<<<<< HEAD
=======
 *
 * The community routes nest the message (`{ error: { code, message } }`) while
 * older routes send a bare string (`{ error: '...' }`); both are handled, and a
 * 503 is named plainly because the caller acted on a feature that is simply off.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
 */
export async function readErrorMessage(res: Response, fallback?: string): Promise<string> {
  const body = await res.json().catch(() => null);
  if (body && typeof body === 'object') {
    const err = (body as { error?: unknown }).error;
    if (typeof err === 'string' && err.length > 0) return err;
    if (err && typeof err === 'object') {
      const message = (err as { message?: unknown }).message;
      if (typeof message === 'string' && message.length > 0) return message;
    }
  }
  if (res.status === 503) {
    return 'This feature is unavailable right now. Nothing was recorded.';
  }
  return fallback && fallback.length > 0 ? fallback : `Request failed (${res.status})`;
}

<<<<<<< HEAD
async function buildInitWithCsrf(
  init: Omit<JsonRequestInit, 'nullOn404' | 'errorMessage'>,
  forceCsrfRefresh = false
): Promise<RequestInit> {
  const { json, headers, ...rest } = init;
  const method = (rest.method ?? 'GET').toUpperCase();
  const mergedHeaders = new Headers(headers);
  if (json !== undefined && !mergedHeaders.has('Content-Type')) {
    mergedHeaders.set('Content-Type', 'application/json');
  }
  if (!mergedHeaders.has('Accept-Language')) {
    try {
      const pref = preferencesStore.get();
      if (pref?.locale) {
        mergedHeaders.set('Accept-Language', pref.locale);
      }
    } catch {
      // fallback
    }
  }
  if (STATE_CHANGING_METHODS.has(method) && (forceCsrfRefresh || !mergedHeaders.has('X-CSRF-Token'))) {
    const csrfToken = await ensureCsrfToken(forceCsrfRefresh);
    if (csrfToken) {
      mergedHeaders.set('X-CSRF-Token', csrfToken);
    }
  }

  return {
    credentials: rest.credentials ?? 'include',
    ...rest,
    headers: mergedHeaders,
=======
function buildInit(init: Omit<JsonRequestInit, 'nullOn404' | 'errorMessage'>): RequestInit {
  const { json, headers, ...rest } = init;
  return {
    ...rest,
    headers:
      json === undefined
        ? headers
        : { 'Content-Type': 'application/json', ...(headers as Record<string, string>) },
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  };
}

function resolveFallback(
  errorMessage: JsonRequestInit['errorMessage'],
  res: Response
): string | undefined {
  return typeof errorMessage === 'function' ? errorMessage(res) : errorMessage;
}

<<<<<<< HEAD
const NETWORK_ERROR_MESSAGE =
  'Unable to reach the server right now. Please check your connection and try again.';

function hasPrivateAuthHeader(headers: HeadersInit | undefined): boolean {
  if (!headers) return false;
  if (headers instanceof Headers) {
    return headers.has('Authorization') || headers.has('X-Contributor-Token');
  }
  if (Array.isArray(headers)) {
    return headers.some(
      ([k]) => k.toLowerCase() === 'authorization' || k.toLowerCase() === 'x-contributor-token'
    );
  }
  const rec = headers as Record<string, string>;
  return Boolean(rec.Authorization || rec.authorization || rec['X-Contributor-Token']);
}

async function isCsrfErrorResponse(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;
  try {
    const body = await res.clone().json();
    if (body && typeof body === 'object') {
      const err = (body as { error?: unknown }).error;
      if (typeof err === 'string') return err.toUpperCase().includes('CSRF');
      if (err && typeof err === 'object') {
        const code = (err as { code?: unknown }).code;
        return typeof code === 'string' && code.toUpperCase().includes('CSRF');
      }
    }
  } catch {
    return false;
  }
  return false;
}

async function fetchWithRetry(url: string, requestInit: RequestInit): Promise<Response> {
  const method = (requestInit.method ?? 'GET').toUpperCase();
  const canMirrorPublicRead =
    method === 'GET' &&
    isCacheableReadPath(url) &&
    (!hasPrivateAuthHeader(requestInit.headers) || url.includes('/api/public/'));

  const maybeMirror = (res: Response): Response => {
    if (
      canMirrorPublicRead &&
      res.status === 200 &&
      typeof navigator !== 'undefined' &&
      !navigator.serviceWorker?.controller
    ) {
      void mirrorToOfflineCache(url, res);
    }
    return res;
  };

  try {
    const res = await fetch(url, requestInit);
    if (method === 'GET' && res.status === 503 && isCacheableReadPath(url)) {
      const cached = await matchOfflineCacheFallback(url);
      if (cached) return cached;
    }
    return maybeMirror(res);
  } catch (err: unknown) {
    if (requestInit.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw err;
    }
    if (method === 'GET') {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const cached = await matchOfflineCacheFallback(url);
        if (cached) return cached;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      if (requestInit.signal?.aborted) throw err;
      try {
        const retryRes = await fetch(url, requestInit);
        if (retryRes.status === 503 && isCacheableReadPath(url)) {
          const cached = await matchOfflineCacheFallback(url);
          if (cached) return cached;
        }
        return maybeMirror(retryRes);
      } catch (retryErr: unknown) {
        if (
          requestInit.signal?.aborted ||
          (retryErr instanceof Error && retryErr.name === 'AbortError')
        ) {
          throw retryErr;
        }
        const cached = await matchOfflineCacheFallback(url);
        if (cached) return cached;
        throw new Error(NETWORK_ERROR_MESSAGE);
      }
    }
    if (err instanceof TypeError) {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }
    throw err;
  }
}

/** Fetches JSON, throwing a readable `Error` for any non-2xx response. */
export async function requestJson<T>(path: string, init: JsonRequestInit = {}): Promise<T> {
  const { nullOn404, errorMessage, ...rest } = init;
  const method = (rest.method ?? 'GET').toUpperCase();
  let res = await fetchWithRetry(apiUrl(path), await buildInitWithCsrf(rest, false));
  if (STATE_CHANGING_METHODS.has(method) && (await isCsrfErrorResponse(res))) {
    res = await fetchWithRetry(apiUrl(path), await buildInitWithCsrf(rest, true));
  }
=======
/** Fetches JSON, throwing a readable `Error` for any non-2xx response. */
export async function requestJson<T>(path: string, init: JsonRequestInit = {}): Promise<T> {
  const { nullOn404, errorMessage, ...rest } = init;
  const res = await fetch(apiUrl(path), buildInit(rest));
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  if (nullOn404 && res.status === 404) return null as unknown as T;
  if (!res.ok) throw new Error(await readErrorMessage(res, resolveFallback(errorMessage, res)));
  return (await res.json()) as T;
}

/** Fetches a binary body (CSV/GeoJSON download), throwing for non-2xx. */
export async function requestBlob(path: string, init: JsonRequestInit = {}): Promise<Blob> {
  const { nullOn404, errorMessage, ...rest } = init;
<<<<<<< HEAD
  const method = (rest.method ?? 'GET').toUpperCase();
  let res = await fetchWithRetry(apiUrl(path), await buildInitWithCsrf(rest, false));
  if (STATE_CHANGING_METHODS.has(method) && (await isCsrfErrorResponse(res))) {
    res = await fetchWithRetry(apiUrl(path), await buildInitWithCsrf(rest, true));
  }
=======
  const res = await fetch(apiUrl(path), buildInit(rest));
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  if (nullOn404 && res.status === 404) return null as unknown as Blob;
  if (!res.ok) throw new Error(await readErrorMessage(res, resolveFallback(errorMessage, res)));
  return res.blob();
}
