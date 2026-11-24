import { preferencesStore } from './preferences';

/**
 * Shared fetch helpers for the Earth Talk API clients, ported from the web.
 *
 * Authentication credentials travel via HttpOnly cookies (React Native's fetch
 * keeps the native cookie store), paired with double-submit CSRF tokens. On the
 * web the CSRF token is read from the `et_csrf` cookie; on mobile it is read
 * from the JSON body of `/api/auth/csrf` (which returns `{ csrfToken }`).
 */

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let csrfInFlight: Promise<string | null> | null = null;
let cachedCsrfToken: string | null = null;

/** The mobile build keeps the CSRF token in memory instead of a cookie jar. */
export function readCsrfCookie(): string | null {
  return cachedCsrfToken;
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
        cachedCsrfToken = body.csrfToken;
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

export interface JsonRequestInit {
  method?: string;
  headers?: HeadersInit;
  json?: unknown;
  credentials?: RequestCredentials;
  signal?: AbortSignal;
  /** Resolve `null` on HTTP 404 instead of throwing. */
  nullOn404?: boolean;
  /** Message used when the response carries no readable error. */
  errorMessage?: string | ((res: Response) => string);
}

/** Extracts a readable message from an error response, whatever its shape. */
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
  if (
    STATE_CHANGING_METHODS.has(method) &&
    (forceCsrfRefresh || !mergedHeaders.has('X-CSRF-Token'))
  ) {
    const csrfToken = await ensureCsrfToken(forceCsrfRefresh);
    if (csrfToken) {
      mergedHeaders.set('X-CSRF-Token', csrfToken);
    }
  }

  return {
    credentials: rest.credentials ?? 'include',
    ...rest,
    headers: mergedHeaders,
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  };
}

function resolveFallback(
  errorMessage: JsonRequestInit['errorMessage'],
  res: Response
): string | undefined {
  return typeof errorMessage === 'function' ? errorMessage(res) : errorMessage;
}

const NETWORK_ERROR_MESSAGE =
  'Unable to reach the server right now. Please check your connection and try again.';

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

/** One retry for transient network failures on reads, mirroring the web client. */
async function fetchWithRetry(url: string, requestInit: RequestInit): Promise<Response> {
  const method = (requestInit.method ?? 'GET').toUpperCase();
  try {
    return await fetch(url, requestInit);
  } catch (err: unknown) {
    if (requestInit.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw err;
    }
    if (method === 'GET') {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (requestInit.signal?.aborted) throw err;
      return await fetch(url, requestInit);
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
  if (nullOn404 && res.status === 404) return null as unknown as T;
  if (!res.ok) throw new Error(await readErrorMessage(res, resolveFallback(errorMessage, res)));
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

/**
 * Reads a text body (CSV/GeoJSON downloads). The web returned a `Blob`; mobile
 * callers only need the raw text, so this returns the decoded body.
 */
export async function requestBlob(path: string, init: JsonRequestInit = {}): Promise<string> {
  const { nullOn404, errorMessage, ...rest } = init;
  const method = (rest.method ?? 'GET').toUpperCase();
  let res = await fetchWithRetry(apiUrl(path), await buildInitWithCsrf(rest, false));
  if (STATE_CHANGING_METHODS.has(method) && (await isCsrfErrorResponse(res))) {
    res = await fetchWithRetry(apiUrl(path), await buildInitWithCsrf(rest, true));
  }
  if (nullOn404 && res.status === 404) return null as unknown as string;
  if (!res.ok) throw new Error(await readErrorMessage(res, resolveFallback(errorMessage, res)));
  return res.text();
}
