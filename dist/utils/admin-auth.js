import crypto from 'node:crypto';
import { env, verifyPassword, hashPassword } from '../config/env.js';
import { describeDatabaseConfig } from '../config/database-config.js';
import { supabase } from '../config/supabase.js';
import { logger } from './logger.js';
import { shortHash } from './hash.js';
import { ServiceUnavailableError } from './service-error.js';
/**
 * In-memory fallback registry for staff sessions.
 */
const memorySessions = new Map();
/** True when Supabase is configured with real, privileged server credentials. */
export function isDatabaseConfigured() {
    const config = describeDatabaseConfig();
    return config.configured && !env.SUPABASE_URL.includes('mock-project-id');
}
export function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
export const BOOTSTRAP_DEV_SUPER_ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidUuid(id) {
    return typeof id === 'string' && UUID_REGEX.test(id);
}
/**
 * Idempotently ensures the bootstrap Super Admin staff record exists in the database
 * with a valid UUID and returns the record ID.
 */
export async function ensureBootstrapSuperAdminRecord(cleanEmail) {
    if (!isDatabaseConfigured()) {
        return BOOTSTRAP_DEV_SUPER_ADMIN_ID;
    }
    const passwordHash = env.SUPER_ADMIN_PASSWORD_HASH ||
        (env.SUPER_ADMIN_PASSWORD ? hashPassword(env.SUPER_ADMIN_PASSWORD) : '');
    try {
        // 1. Atomic idempotent RPC provisioning
        const { data: rpcId, error: rpcError } = await supabase.rpc('bootstrap_super_admin', {
            p_email: cleanEmail,
            p_password_hash: passwordHash,
            p_full_name: 'Super Admin',
        });
        if (!rpcError && isValidUuid(rpcId)) {
            return rpcId;
        }
        // 2. Direct lookup/upsert if RPC is not available in test stub
        const { data: existing, error: findError } = await supabase.from('staff')
            .select('id, is_active, role')
            .eq('email', cleanEmail)
            .maybeSingle();
        if (findError)
            throw findError;
        if (existing && isValidUuid(existing.id)) {
            if (!existing.is_active || existing.role !== 'owner') {
                const { error: updateError } = await supabase.from('staff')
                    .update({ is_active: true, role: 'owner', updated_at: new Date().toISOString() })
                    .eq('id', existing.id);
                if (updateError)
                    throw updateError;
            }
            return existing.id;
        }
        const { data: inserted, error: insertError } = await supabase.from('staff')
            .insert({
            email: cleanEmail,
            password_hash: passwordHash,
            role: 'owner',
            full_name: 'Super Admin',
            is_active: true,
        })
            .select('id')
            .single();
        if (insertError) {
            const { data: retry } = await supabase.from('staff')
                .select('id')
                .eq('email', cleanEmail)
                .maybeSingle();
            if (isValidUuid(retry?.id))
                return retry.id;
            throw insertError;
        }
        if (!isValidUuid(inserted?.id)) {
            throw new Error('Provisioned Super Admin record did not return a valid UUID');
        }
        return inserted.id;
    }
    catch (err) {
        logger.error('Failed to ensure bootstrap Super Admin record in database', { error: String(err) });
        throw new ServiceUnavailableError('bootstrap Super Admin provisioning', err);
    }
}
/**
 * Authenticates a staff member against the database or the bootstrap Super Admin.
 */
export async function authenticateStaff(email, password) {
    const cleanEmail = email.trim().toLowerCase();
    // 1. Check Bootstrap Super Admin
    if (cleanEmail === env.SUPER_ADMIN_EMAIL) {
        let valid = false;
        if (env.SUPER_ADMIN_PASSWORD_HASH) {
            valid = verifyPassword(password, env.SUPER_ADMIN_PASSWORD_HASH);
        }
        else if (!env.IS_PRODUCTION && env.SUPER_ADMIN_PASSWORD) {
            valid = password === env.SUPER_ADMIN_PASSWORD;
        }
        if (valid) {
            const staffId = await ensureBootstrapSuperAdminRecord(cleanEmail);
            return { id: staffId, role: 'owner', email: cleanEmail };
        }
    }
    // 2. Check Staff Table
    if (isDatabaseConfigured()) {
        try {
            const { data, error } = await supabase.from('staff')
                .select('id, password_hash, role, is_active, email')
                .eq('email', cleanEmail)
                .eq('is_active', true)
                .maybeSingle();
            if (error || !data)
                return null;
            if (verifyPassword(password, data.password_hash)) {
                return {
                    id: data.id,
                    role: data.role,
                    email: data.email,
                };
            }
        }
        catch (err) {
            logger.error('Database error during staff authentication', { error: String(err) });
            throw new ServiceUnavailableError('staff authentication lookup', err);
        }
    }
    return null;
}
/**
 * Synchronous credential check for Super Admin bootstrap credentials.
 */
export function authenticateSuperAdmin(email, password) {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== env.SUPER_ADMIN_EMAIL)
        return false;
    if (env.SUPER_ADMIN_PASSWORD_HASH) {
        return verifyPassword(password, env.SUPER_ADMIN_PASSWORD_HASH);
    }
    if (!env.IS_PRODUCTION && env.SUPER_ADMIN_PASSWORD) {
        return password === env.SUPER_ADMIN_PASSWORD;
    }
    return false;
}
function sign(headerB64, payloadB64) {
    return crypto
        .createHmac('sha256', env.SUPER_ADMIN_SESSION_SECRET)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');
}
/**
 * Issues a signed session token for a staff member.
 */
export async function generateStaffToken(staff, context, ttlSeconds = env.SUPER_ADMIN_SESSION_TTL_SECONDS, options) {
    if (!isValidUuid(staff.id)) {
        throw new Error('Valid staff UUID is required to create a staff session');
    }
    const sessionId = crypto.randomUUID();
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const isBootstrapOwner = staff.email.trim().toLowerCase() === env.SUPER_ADMIN_EMAIL.trim().toLowerCase();
    const payload = {
        staffId: staff.id,
        adminId: isBootstrapOwner ? 'super_admin' : staff.id,
        email: staff.email,
        sessionId,
        exp,
    };
    if (!options?.legacyImplicitAdminRole) {
        payload.role = staff.role;
    }
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `${headerB64}.${payloadB64}.${sign(headerB64, payloadB64)}`;
    const tokenHash = hashToken(token);
    const expiresAt = new Date(exp * 1000).toISOString();
    if (isDatabaseConfigured()) {
        try {
            const { error } = await supabase.from('staff_sessions').insert({
                id: sessionId,
                staff_id: staff.id,
                token_hash: tokenHash,
                expires_at: expiresAt,
                ip_hash: context?.ip ? shortHash(context.ip) : null,
                user_agent_hash: context?.userAgent ? shortHash(context.userAgent) : null,
            });
            if (error)
                throw new Error(error.message);
            return token;
        }
        catch (err) {
            logger.error('Could not persist staff session', { error: String(err) });
            throw new ServiceUnavailableError('staff session creation', err);
        }
    }
    // Fallback to memory ONLY if database is intentionally unconfigured
    memorySessions.set(tokenHash, {
        id: sessionId,
        staff_id: staff.id,
        token_hash: tokenHash,
        created_at: new Date().toISOString(),
        expires_at: expiresAt,
        revoked_at: null,
        last_used_at: new Date().toISOString(),
        ip_hash: context?.ip ? shortHash(context.ip) : null,
        user_agent_hash: context?.userAgent ? shortHash(context.userAgent) : null,
    });
    return token;
}
async function loadSession(tokenHash) {
    if (isDatabaseConfigured()) {
        try {
            const { data, error } = await supabase.from('staff_sessions')
                .select('*')
                .eq('token_hash', tokenHash)
                .maybeSingle();
            if (error)
                throw new Error(error.message);
            return data;
        }
        catch (err) {
            logger.error('Could not read staff session', { error: String(err) });
            throw new ServiceUnavailableError('staff session lookup', err);
        }
    }
    return memorySessions.get(tokenHash) ?? null;
}
export async function revokeStaffSession(token) {
    if (!token)
        return false;
    const tokenHash = hashToken(token);
    const revokedAt = new Date().toISOString();
    if (isDatabaseConfigured()) {
        try {
            const { error } = await supabase.from('staff_sessions')
                .update({ revoked_at: revokedAt })
                .eq('token_hash', tokenHash);
            return !error;
        }
        catch (err) {
            logger.error('Could not revoke staff session', { error: String(err) });
            return false;
        }
    }
    const existing = memorySessions.get(tokenHash);
    if (existing) {
        existing.revoked_at = revokedAt;
        return true;
    }
    return false;
}
export async function verifyStaffToken(token) {
    if (!token || typeof token !== 'string')
        return null;
    const tokenHash = hashToken(token);
    const session = await loadSession(tokenHash);
    // FAIL CLOSED: If the database is configured, we REQUIRE a session record.
    // This prevents bypass if a token has a valid signature but was never
    // authorized or has been deleted from the registry.
    if (!session) {
        if (isDatabaseConfigured()) {
            return null;
        }
        // Only continue if we are in unconfigured dev mode where memorySessions is active
    }
    if (session && session.revoked_at)
        return null;
    if (session && session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
        return null;
    }
    const parts = token.split('.');
    if (parts.length !== 3)
        return null;
    const [headerB64, payloadB64, signature] = parts;
    const expected = sign(headerB64, payloadB64);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf))
        return null;
    try {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000))
            return null;
        if (isDatabaseConfigured()) {
            if (!session || !session.staff_id)
                return null;
            const { data: staffRecord, error: staffError } = await supabase.from('staff')
                .select('id, email, role, is_active')
                .eq('id', session.staff_id)
                .maybeSingle();
            if (staffError) {
                logger.error('Database error checking staff status in verifyStaffToken', {
                    error: staffError.message,
                });
                throw new ServiceUnavailableError('staff validation', staffError);
            }
            // Staff does not exist or has been disabled
            if (!staffRecord || !staffRecord.is_active) {
                return null;
            }
            // Staff role changed: reject session
            const effectiveRole = payload.role ?? (payload.adminId === 'super_admin' ? 'owner' : undefined);
            if (!effectiveRole || effectiveRole !== staffRecord.role) {
                return null;
            }
            // Update session last_used_at
            await supabase.from('staff_sessions')
                .update({ last_used_at: new Date().toISOString() })
                .eq('id', session.id);
        }
        return payload;
    }
    catch (err) {
        if (err instanceof ServiceUnavailableError)
            throw err;
        return null;
    }
}
export const STAFF_SESSION_COOKIE_NAME = 'et_staff_session';
export function extractStaffSessionToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        const trimmed = authHeader.substring(7).trim();
        if (trimmed)
            return trimmed;
    }
    if (req.headers['x-staff-token']) {
        const trimmed = String(req.headers['x-staff-token']).trim();
        if (trimmed)
            return trimmed;
    }
    const fromCookie = req.cookies?.[STAFF_SESSION_COOKIE_NAME];
    if (typeof fromCookie === 'string' && fromCookie.trim().length > 0) {
        return fromCookie.trim();
    }
    return undefined;
}
/**
 * Middleware: requires a valid staff session with an optional role requirement.
 */
export function requireStaff(roles) {
    return async (req, res, next) => {
        const token = extractStaffSessionToken(req);
        if (!token) {
            res.status(401).json({ error: 'Authentication required.', code: 'STAFF_AUTH_REQUIRED' });
            return;
        }
        let payload;
        try {
            payload = await verifyStaffToken(token);
        }
        catch (err) {
            res.status(503).json({ error: 'Auth unavailable', code: 'DATABASE_UNAVAILABLE' });
            return;
        }
        if (!payload) {
            res.status(401).json({ error: 'Invalid or expired session', code: 'STAFF_SESSION_INVALID' });
            return;
        }
        const effectiveRole = payload.role ?? (payload.adminId === 'super_admin' ? 'owner' : undefined);
        if (roles) {
            const allowedRoles = Array.isArray(roles) ? roles : [roles];
            const isSuper = effectiveRole === 'owner';
            if (!isSuper && (!effectiveRole || !allowedRoles.includes(effectiveRole))) {
                res.status(403).json({ error: 'Insufficient permissions', code: 'STAFF_FORBIDDEN' });
                return;
            }
        }
        const hydratedPayload = effectiveRole
            ? { ...payload, role: effectiveRole }
            : payload;
        req.staff = hydratedPayload;
        req.admin = hydratedPayload;
        req.rawToken = token;
        next();
    };
}
/**
 * Legacy compatibility middleware.
 */
export const requireSuperAdmin = requireStaff('owner');
export const verifyAdminToken = verifyStaffToken;
export const revokeAdminSession = revokeStaffSession;
export async function isSessionRevoked(token) {
    const tokenHash = hashToken(token);
    const session = await loadSession(tokenHash);
    return Boolean(session?.revoked_at);
}
export async function generateAdminToken(context, ttlSeconds = env.SUPER_ADMIN_SESSION_TTL_SECONDS) {
    const cleanEmail = env.SUPER_ADMIN_EMAIL.trim().toLowerCase();
    const staffId = await ensureBootstrapSuperAdminRecord(cleanEmail);
    return generateStaffToken({ id: staffId, email: cleanEmail, role: 'owner' }, context, ttlSeconds, { legacyImplicitAdminRole: true });
}
export function isSuperAdminConfigured() {
    if (!env.SUPER_ADMIN_EMAIL)
        return false;
    return Boolean(env.SUPER_ADMIN_PASSWORD_HASH || (!env.IS_PRODUCTION && env.SUPER_ADMIN_PASSWORD));
}
