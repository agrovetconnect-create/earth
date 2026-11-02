import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export const CSRF_COOKIE_NAME = 'et_csrf';
export const CSRF_HEADER_NAME = 'x-csrf-token';

const SESSION_COOKIE_NAMES = [
  'et_staff_session',
  'et_user_session',
  'et_contributor_token',
] as const;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Safely parses an HTTP Cookie header while preserving '=' base64 padding
 * and surviving malformed percent-encoded sequences without throwing.
 */
export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  for (const rawCookie of cookieHeader.split(';')) {
    const eqIdx = rawCookie.indexOf('=');
    if (eqIdx > 0) {
      const key = rawCookie.slice(0, eqIdx).trim();
      const rawVal = rawCookie.slice(eqIdx + 1).trim();
      if (key) {
        try {
          cookies[key] = decodeURIComponent(rawVal);
        } catch {
          cookies[key] = rawVal;
        }
      }
    }
  }
  return cookies;
}

function mintCsrfToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

function timingSafeMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length || bufA.length < 16) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getAllowedOrigins(req: Request): Set<string> {
  const set = new Set<string>();
  const configured = (env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const origin of configured) {
    set.add(origin.replace(/\/$/, ''));
  }

  const host = req.get('host');
  if (host) {
    set.add(`${req.protocol}://${host}`);
    set.add(`https://${host}`);
    if (!env.IS_PRODUCTION) {
      set.add(`http://${host}`);
    }
  }
  return set;
}

function extractRequestOrigin(req: Request): string | null {
  const originHeader = req.headers.origin;
  if (typeof originHeader === 'string' && originHeader.trim() && originHeader !== 'null') {
    return originHeader.trim().replace(/\/$/, '');
  }
  const refererHeader = req.headers.referer;
  if (typeof refererHeader === 'string' && refererHeader.trim()) {
    try {
      const parsed = new URL(refererHeader);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return 'invalid://referer';
    }
  }
  return null;
}

export function ensureCsrfCookie(req: Request, res: Response): string {
  const cookies = ((req as any).cookies ?? {}) as Record<string, string>;
  const existing = typeof cookies[CSRF_COOKIE_NAME] === 'string' ? cookies[CSRF_COOKIE_NAME].trim() : '';
  if (existing.length >= 24 && /^[A-Za-z0-9_-]+$/.test(existing)) {
    return existing;
  }

  const fresh = mintCsrfToken();
  cookies[CSRF_COOKIE_NAME] = fresh;
  (req as any).cookies = cookies;
  res.cookie(CSRF_COOKIE_NAME, fresh, {
    httpOnly: false,
    secure: env.IS_PRODUCTION,
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
  res.setHeader('X-CSRF-Token', fresh);
  return fresh;
}

/**
 * GET /api/auth/csrf
 * Issues or echoes the double-submit CSRF token for browser SPA requests.
 */
export function csrfTokenHandler(req: Request, res: Response): void {
  const csrfToken = ensureCsrfCookie(req, res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-CSRF-Token', csrfToken);
  res.status(200).json({ csrfToken });
}

/**
 * Express middleware enforcing Origin/Referer checks on state-changing requests
 * and double-submit CSRF token verification whenever cookie-backed credentials
 * are present without an explicit Authorization Bearer token.
 */
export function csrfAndOriginProtection(req: Request, res: Response, next: NextFunction): void {
  // Meta WhatsApp webhooks verify X-Hub-Signature-256 HMAC and internal routes
  // verify INTERNAL_SERVICE_KEY; neither uses browser cookies.
  if (req.path.startsWith('/webhook') || req.path.startsWith('/internal/')) {
    next();
    return;
  }

  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    ensureCsrfCookie(req, res);
    next();
    return;
  }

  // 1. Origin / Referer enforcement when supplied by browser user-agents
  const reqOrigin = extractRequestOrigin(req);
  const rawOriginHeader = req.headers.origin;
  if (rawOriginHeader === 'null') {
    res.status(403).json({
      error: {
        code: 'CSRF_ORIGIN_DENIED',
        message: 'Cross-origin requests from opaque/null origins are not permitted.',
      },
    });
    return;
  }

  if (reqOrigin !== null) {
    const allowed = getAllowedOrigins(req);
    if (!allowed.has(reqOrigin)) {
      res.status(403).json({
        error: {
          code: 'CSRF_ORIGIN_DENIED',
          message: 'Cross-origin state-changing request denied.',
        },
      });
      return;
    }
  }

  // 2. Double-submit CSRF check whenever any auth/contributor cookie is carried
  const cookies = ((req as any).cookies ?? {}) as Record<string, string>;
  const hasSessionCookie = SESSION_COOKIE_NAMES.some(
    (name) => typeof cookies[name] === 'string' && cookies[name].trim().length > 0
  );
  const hasExplicitBearer =
    typeof req.headers.authorization === 'string' &&
    req.headers.authorization.startsWith('Bearer ');
  const isMobileNative = req.headers['x-client-platform'] === 'mobile';

  if (hasSessionCookie && !hasExplicitBearer && !isMobileNative) {
    const cookieToken = typeof cookies[CSRF_COOKIE_NAME] === 'string' ? cookies[CSRF_COOKIE_NAME].trim() : '';
    const rawHeader = req.headers[CSRF_HEADER_NAME];
    const headerToken =
      typeof rawHeader === 'string'
        ? rawHeader.trim()
        : Array.isArray(rawHeader) && typeof rawHeader[0] === 'string'
          ? rawHeader[0].trim()
          : '';

    if (!cookieToken || !headerToken || !timingSafeMatch(cookieToken, headerToken)) {
      res.status(403).json({
        error: {
          code: 'CSRF_TOKEN_INVALID',
          message: 'Missing or invalid CSRF token. Reload the page and try again.',
        },
      });
      return;
    }
  } else {
    ensureCsrfCookie(req, res);
  }

  next();
}
