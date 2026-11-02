import crypto from 'node:crypto';
import type { Request } from 'express';
import { env } from '../config/env.js';
<<<<<<< HEAD
import { supabase } from '../config/supabase.js';
import { hashUserPhoneNumber } from './crypto.js';
import { hashToken, isDatabaseConfigured } from './admin-auth.js';
import { shortHash } from './hash.js';
import { logger } from './logger.js';
import { ServiceUnavailableError } from './service-error.js';

/**
 * Anonymous contributor identity & server-revocable contributor sessions.
 */

export const CONTRIBUTOR_HEADER = 'x-contributor-token';
export const CONTRIBUTOR_COOKIE_NAME = 'et_contributor_token';

const MIN_CONTRIBUTOR_TOKEN_LENGTH = 16;
const MAX_CONTRIBUTOR_TOKEN_LENGTH = 256;
export const CONTRIBUTOR_SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;

interface InMemoryContributorSession {
  tokenHash: string;
  contributorHash: string;
  issuedPlatform: 'web' | 'mobile';
  expiresAt: string;
  revokedAt: string | null;
}

const inMemoryContributorSessions = new Map<string, InMemoryContributorSession>();

=======
import { hashUserPhoneNumber } from './crypto.js';

/**
 * Anonymous contributor identity.
 *
 * Earth Talk has no user accounts. A participant is identified only by a stable
 * one-way hash, which lets the platform prevent duplicate votes and count
 * contributions without ever storing or exposing:
 *   - a phone number
 *   - a WhatsApp ID / MSISDN
 *   - a name, email, or any contact detail
 *
 * Two entry paths, both producing the same kind of opaque hash:
 *   1. WhatsApp  -> HMAC over the sender's phone number (see `hashUserPhoneNumber`).
 *   2. Web / GIS -> HMAC over a long random token the browser keeps in
 *                   localStorage and sends as `X-Contributor-Token`.
 *
 * The web token is pseudonymous, not anonymous: it is a bearer secret held by
 * the browser. It carries no personal data, and losing it simply means losing
 * recognition of past contributions rather than exposing anything.
 */

/** Header carrying the browser-held contributor token. */
export const CONTRIBUTOR_HEADER = 'x-contributor-token';

/** Minimum length for a browser-supplied contributor token. Short values are
 *  rejected so contributors cannot trivially collide or be enumerated. */
const MIN_CONTRIBUTOR_TOKEN_LENGTH = 16;
const MAX_CONTRIBUTOR_TOKEN_LENGTH = 256;

/**
 * Produces the stable opaque contributor key.
 *
 * Keyed with ANONYMOUS_CONTRIBUTOR_SECRET so the digest cannot be reversed by
 * building a lookup table of candidate phone numbers.
 */
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export function hashContributor(rawIdentifier: string): string {
  return crypto
    .createHmac('sha256', env.ANONYMOUS_CONTRIBUTOR_SECRET)
    .update(rawIdentifier.trim())
    .digest('hex');
}

<<<<<<< HEAD
=======
/**
 * Resolves the contributor key for a WhatsApp participant.
 *
 * This deliberately returns exactly the same value as `hashUserPhoneNumber`,
 * which is the identity already stored against every observation created
 * through Stages 1-2. A person who photographed a rock and later votes on a
 * community investigation must be recognised as the same contributor,
 * otherwise their reputation would restart from zero and duplicate-vote
 * protection would not span both entry paths.
 *
 * Both values are one-way HMACs, so no phone number is ever stored or exposed
 * by either function.
 */
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export function whatsappContributorHash(phoneNumber: string): string {
  return hashUserPhoneNumber(phoneNumber);
}

<<<<<<< HEAD
=======
/**
 * Validates a browser-supplied contributor token.
 * Returns null when absent or malformed so callers can decide the policy.
 */
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export function normalizeContributorToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  if (token.length < MIN_CONTRIBUTOR_TOKEN_LENGTH) return null;
  if (token.length > MAX_CONTRIBUTOR_TOKEN_LENGTH) return null;
<<<<<<< HEAD
=======
  // Constrain to URL-safe characters so the value is stable across transports.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  if (!/^[A-Za-z0-9._~-]+$/.test(token)) return null;
  return token;
}

<<<<<<< HEAD
export function createContributorToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Extracts a raw contributor token from header, HttpOnly cookie, or request body.
 */
export function extractRawContributorToken(req: Request): string | null {
  const rawHeader = req.headers[CONTRIBUTOR_HEADER];
  const fromHeader = normalizeContributorToken(
    Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  );
  if (fromHeader) return fromHeader;

  const fromCookie = normalizeContributorToken((req as any).cookies?.[CONTRIBUTOR_COOKIE_NAME]);
  if (fromCookie) return fromCookie;

  const body = req.body as Record<string, unknown> | undefined;
  const fromBody = normalizeContributorToken(body?.contributor_token);
  if (fromBody) return fromBody;
=======
/**
 * Resolves the contributor key for an incoming public request.
 *
 * Order of preference:
 *   1. `X-Contributor-Token` header (browser session)
 *   2. `contributor_token` body field (form posts without custom headers)
 *
 * Returns null when no usable token was supplied. Endpoints that accept
 * anonymous contributions may still proceed by issuing an ephemeral key, which
 * means the contribution is recorded but not recognised as coming from a
 * previously-seen contributor.
 */
export function resolveContributorHashFromRequest(req: Request): string | null {
  const fromHeader = normalizeContributorToken(req.headers[CONTRIBUTOR_HEADER]);
  if (fromHeader) return hashContributor(`web:${fromHeader}`);

  const body = req.body as Record<string, unknown> | undefined;
  const fromBody = normalizeContributorToken(body?.contributor_token);
  if (fromBody) return hashContributor(`web:${fromBody}`);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  return null;
}

/**
<<<<<<< HEAD
 * Issues and persists a revocable server-side contributor session.
 */
export async function issueContributorSession(
  req: Request,
  platform: 'web' | 'mobile' = 'web'
): Promise<{ token: string; contributorHash: string; expiresAt: string }> {
  const token = createContributorToken();
  const tokenHash = hashToken(token);
  const contributorHash = hashContributor(`web:${token}`);
  const expiresAt = new Date(Date.now() + CONTRIBUTOR_SESSION_TTL_MS).toISOString();
  const ip = req.ip || req.socket?.remoteAddress || undefined;
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;

  if (isDatabaseConfigured()) {
    try {
      const { error } = await (supabase.from('contributor_sessions') as any).insert({
        token_hash: tokenHash,
        contributor_hash: contributorHash,
        issued_platform: platform,
        ip_hash: ip ? shortHash(ip) : null,
        user_agent_hash: userAgent ? shortHash(userAgent) : null,
        expires_at: expiresAt,
      });
      if (error) throw new Error(error.message);
    } catch (err) {
      logger.error('Failed to persist contributor session', { error: String(err) });
      throw new ServiceUnavailableError('contributor session creation', err);
    }
  } else {
    inMemoryContributorSessions.set(tokenHash, {
      tokenHash,
      contributorHash,
      issuedPlatform: platform,
      expiresAt,
      revokedAt: null,
    });
  }

  return { token, contributorHash, expiresAt };
}

/**
 * Verifies a contributor token against server-side revocation and expiry state.
 * Fails closed when the database is configured.
 */
export async function verifyContributorSession(rawToken: string | null | undefined): Promise<string | null> {
  const normalized = normalizeContributorToken(rawToken);
  if (!normalized) return null;

  const tokenHash = hashToken(normalized);

  if (isDatabaseConfigured()) {
    try {
      const { data, error } = await (supabase.from('contributor_sessions') as any)
        .select('token_hash, expires_at, revoked_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) return null;
      if (data.revoked_at) return null;
      if (!data.expires_at || new Date(data.expires_at).getTime() <= Date.now()) return null;

      void (supabase.from('contributor_sessions') as any)
        .update({ last_used_at: new Date().toISOString() })
        .eq('token_hash', tokenHash);

      return normalized;
    } catch (err) {
      logger.error('Failed to verify contributor session', { error: String(err) });
      throw new ServiceUnavailableError('contributor session lookup', err);
    }
  }

  const mem = inMemoryContributorSessions.get(tokenHash);
  if (mem) {
    if (mem.revokedAt) return null;
    if (new Date(mem.expiresAt).getTime() <= Date.now()) return null;
  }
  return normalized;
}

/**
 * Revokes an issued contributor session immediately.
 */
export async function revokeContributorSession(rawToken: string | null | undefined): Promise<boolean> {
  const normalized = normalizeContributorToken(rawToken);
  if (!normalized) return false;

  const tokenHash = hashToken(normalized);
  const now = new Date().toISOString();

  if (isDatabaseConfigured()) {
    try {
      const { error } = await (supabase.from('contributor_sessions') as any)
        .update({ revoked_at: now })
        .eq('token_hash', tokenHash);
      if (error) throw new Error(error.message);
      return true;
    } catch (err) {
      logger.error('Failed to revoke contributor session', { error: String(err) });
      throw new ServiceUnavailableError('contributor session revocation', err);
    }
  }

  const existing = inMemoryContributorSessions.get(tokenHash);
  if (existing) {
    existing.revokedAt = now;
  } else {
    inMemoryContributorSessions.set(tokenHash, {
      tokenHash,
      contributorHash: hashContributor(`web:${normalized}`),
      issuedPlatform: 'web',
      expiresAt: now,
      revokedAt: now,
    });
  }
  return true;
}

/**
 * Async request resolver verifying contributor token against server-side revocation.
 */
export async function resolveVerifiedContributorTokenFromRequest(req: Request): Promise<string | null> {
  const raw = extractRawContributorToken(req);
  if (!raw) return null;
  return verifyContributorSession(raw);
}

export async function resolveVerifiedContributorHashFromRequest(req: Request): Promise<string | null> {
  const verifiedToken = await resolveVerifiedContributorTokenFromRequest(req);
  if (!verifiedToken) return null;
  return hashContributor(`web:${verifiedToken}`);
}

/**
 * Synchronous helper retained for pure synchronous callers; checks in-memory
 * revocation when DB is unconfigured. HTTP controllers should prefer
 * `resolveVerifiedContributorHashFromRequest`.
 */
export function resolveContributorHashFromRequest(req: Request): string | null {
  const raw = extractRawContributorToken(req);
  if (!raw) return null;
  const mem = inMemoryContributorSessions.get(hashToken(raw));
  if (mem && (mem.revokedAt || new Date(mem.expiresAt).getTime() <= Date.now())) {
    return null;
  }
  return hashContributor(`web:${raw}`);
}

=======
 * Creates a fresh contributor token for a browser with no existing one.
 * Returned to the client once and then stored locally by the client.
 */
export function createContributorToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * The public display handle, e.g. "Field Explorer #A82F".
 *
 * Derived from the contributor hash so it is stable and collision-resistant
 * across the platform, while revealing nothing about the underlying identity.
 */
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export function publicContributorHandle(contributorHash: string): string {
  if (!contributorHash) return 'Anonymous Contributor';
  const suffix = crypto.createHash('sha256').update(contributorHash).digest('hex').substring(0, 4).toUpperCase();
  return `Field Explorer #${suffix}`;
}

<<<<<<< HEAD
=======
/**
 * Partially redacted contributor key for audit records.
 * Enough to correlate an action, not enough to reconstruct the input.
 */
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export function redactContributorHash(contributorHash: string): string {
  if (!contributorHash) return 'none';
  return `${contributorHash.substring(0, 8)}…`;
}
