import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { hashUserPhoneNumber } from './crypto.js';
import { hashToken } from './admin-auth.js';
import { shortHash } from './hash.js';
import { ServiceUnavailableError } from './service-error.js';
import { userRepository } from '../repositories/user.repository.js';
import { userAvatarRepository } from '../repositories/user-avatar.repository.js';
import { profileService } from '../services/profile.service.js';
/** Prefix makes a leaked token recognisable and prevents cross-service use. */
const SESSION_TOKEN_PREFIX = 'rt_session_';
/**
 * Normalises a phone number to the digits form used by WhatsApp senders
 * (`message.from`), so a website login and a WhatsApp message resolve to the
 * same account.
 *
 * Returns null when the input is not a plausible international number. A
 * national format starting with 0 is rejected on purpose: guessing a country
 * code would silently bind an account to a different person.
 */
export function normalizePhoneNumber(input) {
    if (typeof input !== 'string')
        return null;
    const digits = input.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15)
        return null;
    if (digits.startsWith('0'))
        return null;
    if (/^0{4,}/.test(digits))
        return null;
    return digits;
}
/** One-way phone hash shared with the WhatsApp `source_user_hash` convention. */
export function phoneHashFromInput(input) {
    const digits = normalizePhoneNumber(input);
    if (!digits)
        return null;
    return hashUserPhoneNumber(digits);
}
/** Constant-time comparison for two equally long ASCII strings. */
function timingSafeEqualString(a, b) {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length)
        return false;
    return crypto.timingSafeEqual(bufA, bufB);
}
// ---------------------------------------------------------------------------
// Verification codes
// ---------------------------------------------------------------------------
export function generateVerificationCode() {
    return String(crypto.randomInt(100_000, 1_000_000));
}
/**
 * Hashes a verification code with scrypt, salted by the session secret and the
 * phone hash, so a stolen code row cannot be brute-forced offline against a
 * different number and cannot be replayed against another account.
 */
export function hashCodeForPhone(code, phoneHash) {
    const salt = `${env.AUTH_SESSION_SECRET}:${phoneHash}`;
    return crypto.scryptSync(String(code), salt, 64).toString('hex');
}
export function verifyCodeForPhone(code, phoneHash, codeHash) {
    if (!code || !codeHash)
        return false;
    const candidate = hashCodeForPhone(code, phoneHash);
    return timingSafeEqualString(candidate, codeHash);
}
/**
 * Hashes a verification code for email, salted by the session secret and the email.
 */
export function hashCodeForEmail(code, email) {
    const salt = `${env.AUTH_SESSION_SECRET}:${email.toLowerCase().trim()}`;
    return crypto.scryptSync(String(code), salt, 64).toString('hex');
}
export function verifyCodeForEmail(code, email, codeHash) {
    if (!code || !codeHash)
        return false;
    const candidate = hashCodeForEmail(code, email);
    return timingSafeEqualString(candidate, codeHash);
}
/**
 * Issues an opaque bearer token. Only its hash is persisted, so a database
 * dump cannot be replayed as a live session.
 */
export async function issueUserSession(user, context) {
    const token = `${SESSION_TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + env.AUTH_SESSION_TTL_SECONDS * 1000).toISOString();
    await userRepository.createSession({
        id: crypto.randomUUID(),
        user_id: user.id,
        token_hash: hashToken(token),
        expires_at: expiresAt,
        revoked_at: null,
        last_used_at: new Date().toISOString(),
        ip_hash: context?.ip ? shortHash(context.ip) : null,
        user_agent_hash: context?.userAgent ? shortHash(context.userAgent) : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });
    return { token, expiresAt };
}
/**
 * Resolves a bearer token to its account, or null when the token is unknown,
 * revoked or expired. Expiry is checked against the stored row rather than
 * trusting any client-held claim.
 */
export async function resolveUserFromToken(token) {
    if (!token || typeof token !== 'string' || !token.startsWith(SESSION_TOKEN_PREFIX)) {
        return null;
    }
    const tokenHash = hashToken(token);
    const session = await userRepository.findSessionByTokenHash(tokenHash);
    if (!session)
        return null;
    if (session.revoked_at)
        return null;
    if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now())
        return null;
    if (!session.user_id)
        return null;
    const user = await userRepository.findUserById(session.user_id);
    if (!user)
        return null;
    void userRepository.touchSession(tokenHash);
    return { user, tokenHash, expiresAt: session.expires_at };
}
export async function revokeUserSession(token) {
    if (!token)
        return false;
    return userRepository.revokeSession(hashToken(token));
}
export async function resolveUserAvatarUrl(user) {
    const uploaded = await userAvatarRepository.findAvatarByUserId(user.id).catch(() => null);
    const profile = await profileService.getProfile(user.id).catch(() => null);
    const avatarUrl = uploaded
        ? `/api/users/${encodeURIComponent(user.public_user_id)}/avatar`
        : (profile?.avatar_url || profile?.google_avatar_url || null);
    const displayName = user.display_name || profile?.display_name || profile?.google_display_name || null;
    return { avatarUrl, displayName };
}
export async function viewerFromUser(user) {
    const [isLinked, resolved] = await Promise.all([
        userRepository.isWhatsAppLinked(user.id),
        resolveUserAvatarUrl(user),
    ]);
    return {
        userId: user.id,
        publicUserId: user.public_user_id,
        displayName: resolved.displayName,
        email: user.email ?? null,
        avatarUrl: resolved.avatarUrl,
        isWhatsAppLinked: isLinked,
        isDemo: user.is_demo,
    };
}
export const USER_SESSION_COOKIE_NAME = 'et_user_session';
export function extractUserSessionToken(req) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        const trimmed = header.substring(7).trim();
        if (trimmed)
            return trimmed;
    }
    const cookieVal = req.cookies?.[USER_SESSION_COOKIE_NAME];
    if (typeof cookieVal === 'string' && cookieVal.trim().length > 0) {
        return cookieVal.trim();
    }
    return undefined;
}
/** Attaches the viewer when a valid session is present; never rejects. */
export async function attachViewer(req, _res, next) {
    try {
        const token = extractUserSessionToken(req);
        if (token) {
            const resolved = await resolveUserFromToken(token);
            if (resolved) {
                req.viewer = await viewerFromUser(resolved.user);
                req.rawUserToken = token;
            }
        }
    }
    catch (err) {
        // An unreadable session must not break a public request; the caller is
        // simply treated as anonymous.
        void err;
    }
    next();
}
/** Express middleware: requires a valid contributor session. */
export async function requireUser(req, res, next) {
    const token = extractUserSessionToken(req);
    if (!token) {
        res.status(401).json({
            error: 'Sign in with your email to continue.',
            code: 'AUTH_REQUIRED',
        });
        return;
    }
    let resolved;
    try {
        resolved = await resolveUserFromToken(token);
    }
    catch (err) {
        // A database outage must not be read as "this session is invalid": answer
        // 503 so the caller retries instead of being silently signed out.
        if (err instanceof ServiceUnavailableError) {
            res.status(503).json({
                error: 'Authentication is temporarily unavailable. Please try again shortly.',
                code: 'DATABASE_UNAVAILABLE',
            });
            return;
        }
        throw err;
    }
    if (!resolved) {
        res.status(401).json({
            error: 'Your session has expired. Request a new code to sign in again.',
            code: 'AUTH_SESSION_INVALID',
        });
        return;
    }
    req.viewer = await viewerFromUser(resolved.user);
    req.rawUserToken = token;
    next();
}
/** Hash of the caller's address, used only as a rate-limit key. */
export function hashRequestIp(req) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    return shortHash(String(ip));
}
