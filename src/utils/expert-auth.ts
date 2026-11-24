import crypto from 'node:crypto';
import type { Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import {
  verifyAdminToken,
  requireSuperAdmin,
  type AdminSessionPayload,
  type AuthenticatedAdminRequest,
  revokeAdminSession,
  generateAdminToken,
} from './admin-auth.js';

/**
 * Review-surface authentication.
 *
 * Authentication therefore delegates entirely to `admin-auth.ts`. The aliases
 * below exist only so existing call sites keep compiling while they are migrated
 * to `requireSuperAdmin`; they grant exactly the authority of the Super Admin
 * session and nothing more.
 */

/** Deprecated alias for {@link AdminSessionPayload}. */
export type ExpertSessionPayload = AdminSessionPayload;

/** Deprecated alias for {@link AuthenticatedAdminRequest}. */
export type AuthenticatedExpertRequest = AuthenticatedAdminRequest;

/**
 * @deprecated Import nothing. Reviewers are attributes of a review, not users.
 */
export const AUTHORIZED_EXPERTS: never[] = [];

/** @deprecated Use `verifyAdminToken` from `admin-auth.ts`. */
export { verifyAdminToken as verifyExpertToken };

/** @deprecated Use `revokeAdminSession` from `admin-auth.ts`. */
export { revokeAdminSession as revokeExpertSession };

/**
 * @deprecated Use `generateAdminToken` from `admin-auth.ts`.
 */
export async function generateExpertToken(context?: {
  ip?: string;
  userAgent?: string;
}): Promise<string> {
  return generateAdminToken({
    ip: context?.ip,
    userAgent: context?.userAgent,
  });
}

/**
 * Ephemeral signed token for review media access.
 */
export function generateSignedMediaToken(mediaId: string, ttlSeconds = 300): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto
    .createHmac('sha256', env.SUPER_ADMIN_SESSION_SECRET)
    .update(`${mediaId}:${expiresAt}`)
    .digest('hex')
    .substring(0, 32);
  return `${expiresAt}.${sig}`;
}

/**
 * Validates an ephemeral signed media token using a timing-safe comparison.
 */
export function verifySignedMediaToken(mediaId: string, token: string): boolean {
  if (!token) return false;
  const [expStr, sig] = token.split('.');
  const expiresAt = parseInt(expStr, 10);
  if (Number.isNaN(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expectedSig = crypto
    .createHmac('sha256', env.SUPER_ADMIN_SESSION_SECRET)
    .update(`${mediaId}:${expiresAt}`)
    .digest('hex')
    .substring(0, 32);
  if (sig.length !== expectedSig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
}

/**
 * @deprecated Contributor redaction now lives in `contributor.ts`.
 */
export { redactContributorHash as anonymizeContributor } from './contributor.js';

/**
 * @deprecated Use `requireSuperAdmin` from `admin-auth.ts`.
 */
export async function requireExpertAuth(
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await requireSuperAdmin(req, res, next);
}

/**
 * @deprecated Use `requireSuperAdmin` from `admin-auth.ts`.
 */
export async function requireAdminAuth(
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await requireSuperAdmin(req, res, next);
}

/** @deprecated Use `checkRateLimit` from `rate-limiter.ts`. */
export { checkRateLimit } from './rate-limiter.js';