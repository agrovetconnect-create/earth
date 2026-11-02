import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
<<<<<<< HEAD
import { env, verifyPassword, hashPassword } from '../config/env.js';
=======
import { env, verifyPassword } from '../config/env.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import { describeDatabaseConfig } from '../config/database-config.js';
import { supabase } from '../config/supabase.js';
import { logger } from './logger.js';
import { shortHash } from './hash.js';
import { ServiceUnavailableError } from './service-error.js';

/**
 * Super Admin authentication.
 *
 * This is the ONLY authenticated role in Earth Talk.
 *
 * Ordinary participants need no account: they contribute through WhatsApp or the
 * public website and are identified solely by a one-way contributor hash.
 * Geological reviewers do not need accounts either: a review is a record entered
 * by the Super Admin on a reviewer's behalf (see `expert_verifications`).
 *
 * There is therefore no user directory, no registration, and no expert roster.
 */

<<<<<<< HEAD

export type StaffRole = 'owner' | 'security' | 'ops' | 'support' | 'science';

export interface StaffSessionPayload {
  staffId: string;
  adminId?: string;
  email: string;
  role: StaffRole;
=======
export interface AdminSessionPayload {
  adminId: string;
  email: string;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  sessionId: string;
  exp: number; // Unix seconds
}

<<<<<<< HEAD
export interface AuthenticatedStaffRequest extends Request {
  staff?: StaffSessionPayload;
=======
export interface AuthenticatedAdminRequest extends Request {
  admin?: AdminSessionPayload;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  rawToken?: string;
  requestId?: string;
}

<<<<<<< HEAD
interface StaffSessionRecord {
  id: string;
  staff_id: string;
=======
interface AdminSessionRecord {
  id: string;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string;
  ip_hash: string | null;
  user_agent_hash: string | null;
}

/**
<<<<<<< HEAD
 * In-memory fallback registry for staff sessions.
 */
const memorySessions = new Map<string, StaffSessionRecord>();

/** True when Supabase is configured with real, privileged server credentials. */
export function isDatabaseConfigured(): boolean {
  const config = describeDatabaseConfig();
  return config.configured && !env.SUPABASE_URL.includes('mock-project-id');
=======
 * In-memory fallback registry.
 *
 * Used only when Supabase is not reachable. This is a real store, not fixture
 * data, but it is per-process: sessions do not survive a restart and are not
 * shared between replicas. When Supabase is available the durable table
 * `admin_sessions` is authoritative and this map is not consulted.
 */
const memorySessions = new Map<string, AdminSessionRecord>();

/** True when Supabase is configured with real, privileged server credentials. */
export function isDatabaseConfigured(): boolean {
  return describeDatabaseConfig().configured;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

<<<<<<< HEAD
export const BOOTSTRAP_DEV_SUPER_ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | null | undefined): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * Idempotently ensures the bootstrap Super Admin staff record exists in the database
 * with a valid UUID and returns the record ID.
 */
export async function ensureBootstrapSuperAdminRecord(cleanEmail: string): Promise<string> {
  if (!isDatabaseConfigured()) {
    return BOOTSTRAP_DEV_SUPER_ADMIN_ID;
  }

  const passwordHash =
    env.SUPER_ADMIN_PASSWORD_HASH ||
    (env.SUPER_ADMIN_PASSWORD ? hashPassword(env.SUPER_ADMIN_PASSWORD) : '');

  try {
    // 1. Atomic idempotent RPC provisioning
    const { data: rpcId, error: rpcError } = await (supabase as any).rpc('bootstrap_super_admin', {
      p_email: cleanEmail,
      p_password_hash: passwordHash,
      p_full_name: 'Super Admin',
    });

    if (!rpcError && isValidUuid(rpcId)) {
      return rpcId;
    }

    // 2. Direct lookup/upsert if RPC is not available in test stub
    const { data: existing, error: findError } = await (supabase.from('staff') as any)
      .select('id, is_active, role')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (findError) throw findError;

    if (existing && isValidUuid(existing.id)) {
      if (!existing.is_active || existing.role !== 'owner') {
        const { error: updateError } = await (supabase.from('staff') as any)
          .update({ is_active: true, role: 'owner', updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (updateError) throw updateError;
      }
      return existing.id;
    }

    const { data: inserted, error: insertError } = await (supabase.from('staff') as any)
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
      const { data: retry } = await (supabase.from('staff') as any)
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();
      if (isValidUuid(retry?.id)) return retry.id;
      throw insertError;
    }

    if (!isValidUuid(inserted?.id)) {
      throw new Error('Provisioned Super Admin record did not return a valid UUID');
    }

    return inserted.id;
  } catch (err) {
    logger.error('Failed to ensure bootstrap Super Admin record in database', { error: String(err) });
    throw new ServiceUnavailableError('bootstrap Super Admin provisioning', err);
  }
}

/**
 * Authenticates a staff member against the database or the bootstrap Super Admin.
 */
export async function authenticateStaff(
  email: string,
  password: string
): Promise<{ id: string; role: StaffRole; email: string } | null> {
  const cleanEmail = email.trim().toLowerCase();

  // 1. Check Bootstrap Super Admin
  if (cleanEmail === env.SUPER_ADMIN_EMAIL) {
    let valid = false;
    if (env.SUPER_ADMIN_PASSWORD_HASH) {
      valid = verifyPassword(password, env.SUPER_ADMIN_PASSWORD_HASH);
    } else if (!env.IS_PRODUCTION && env.SUPER_ADMIN_PASSWORD) {
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
      const { data, error } = await (supabase.from('staff') as any)
        .select('id, password_hash, role, is_active, email')
        .eq('email', cleanEmail)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) return null;

      if (verifyPassword(password, data.password_hash)) {
        return {
          id: data.id,
          role: data.role as StaffRole,
          email: data.email,
        };
      }
    } catch (err) {
      logger.error('Database error during staff authentication', { error: String(err) });
      throw new ServiceUnavailableError('staff authentication lookup', err);
    }
  }

  return null;
}

/**
 * Synchronous credential check for Super Admin bootstrap credentials.
=======
/**
 * Credentials check for the single Super Admin identity.
 *
 * Production requires a scrypt `SUPER_ADMIN_PASSWORD_HASH`. Development may use
 * a plaintext `SUPER_ADMIN_PASSWORD` for convenience; it is stripped from the
 * config entirely when NODE_ENV=production.
 *
 * `passcode` is deliberately not accepted: the previous expert login treated an
 * omitted passcode as valid, which meant knowing an email address was enough.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
 */
export function authenticateSuperAdmin(email: string, password: string): boolean {
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail !== env.SUPER_ADMIN_EMAIL) return false;
<<<<<<< HEAD
  if (env.SUPER_ADMIN_PASSWORD_HASH) {
    return verifyPassword(password, env.SUPER_ADMIN_PASSWORD_HASH);
  }
  if (!env.IS_PRODUCTION && env.SUPER_ADMIN_PASSWORD) {
    return password === env.SUPER_ADMIN_PASSWORD;
  }
  return false;
}

=======
  if (!password || password.length === 0) return false;

  if (env.SUPER_ADMIN_PASSWORD_HASH) {
    return verifyPassword(password, env.SUPER_ADMIN_PASSWORD_HASH);
  }

  if (!env.IS_PRODUCTION && env.SUPER_ADMIN_PASSWORD) {
    const a = Buffer.from(password);
    const b = Buffer.from(env.SUPER_ADMIN_PASSWORD);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  return false;
}

/** True when the deployment has any usable Super Admin credential configured. */
export function isSuperAdminConfigured(): boolean {
  if (!env.SUPER_ADMIN_EMAIL) return false;
  return Boolean(env.SUPER_ADMIN_PASSWORD_HASH || (!env.IS_PRODUCTION && env.SUPER_ADMIN_PASSWORD));
}

>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
function sign(headerB64: string, payloadB64: string): string {
  return crypto
    .createHmac('sha256', env.SUPER_ADMIN_SESSION_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
}

/**
<<<<<<< HEAD
 * Issues a signed session token for a staff member.
 */
export async function generateStaffToken(
  staff: { id: string; email: string; role: StaffRole },
  context?: { ip?: string; userAgent?: string },
  ttlSeconds: number = env.SUPER_ADMIN_SESSION_TTL_SECONDS,
  options?: { legacyImplicitAdminRole?: boolean }
): Promise<string> {
  if (!isValidUuid(staff.id)) {
    throw new Error('Valid staff UUID is required to create a staff session');
  }

  const sessionId = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const isBootstrapOwner = staff.email.trim().toLowerCase() === env.SUPER_ADMIN_EMAIL.trim().toLowerCase();

  const payload: Record<string, unknown> = {
    staffId: staff.id,
    adminId: isBootstrapOwner ? 'super_admin' : staff.id,
    email: staff.email,
    sessionId,
    exp,
  };
  if (!options?.legacyImplicitAdminRole) {
    payload.role = staff.role;
  }
=======
 * Issues a signed session token and registers it for revocation.
 */
export async function generateAdminToken(
  context?: { ip?: string; userAgent?: string },
  ttlSeconds: number = env.SUPER_ADMIN_SESSION_TTL_SECONDS
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;

  const payload: AdminSessionPayload = {
    adminId: 'super_admin',
    email: env.SUPER_ADMIN_EMAIL,
    sessionId,
    exp,
  };
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `${headerB64}.${payloadB64}.${sign(headerB64, payloadB64)}`;

<<<<<<< HEAD
  const tokenHash = hashToken(token);
  const expiresAt = new Date(exp * 1000).toISOString();

  if (isDatabaseConfigured()) {
    try {
      const { error } = await (supabase.from('staff_sessions') as any).insert({
        id: sessionId,
        staff_id: staff.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        ip_hash: context?.ip ? shortHash(context.ip) : null,
        user_agent_hash: context?.userAgent ? shortHash(context.userAgent) : null,
      });
      if (error) throw new Error(error.message);
      return token;
    } catch (err) {
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
=======
  const record: AdminSessionRecord = {
    id: sessionId,
    token_hash: hashToken(token),
    created_at: new Date().toISOString(),
    expires_at: new Date(exp * 1000).toISOString(),
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    revoked_at: null,
    last_used_at: new Date().toISOString(),
    ip_hash: context?.ip ? shortHash(context.ip) : null,
    user_agent_hash: context?.userAgent ? shortHash(context.userAgent) : null,
<<<<<<< HEAD
  });
  return token;
}

async function loadSession(tokenHash: string): Promise<StaffSessionRecord | null> {
  if (isDatabaseConfigured()) {
    try {
      const { data, error } = await (supabase.from('staff_sessions') as any)
=======
  };

  if (isDatabaseConfigured()) {
    try {
      const { error } = await (supabase.from('admin_sessions') as any).insert({
        id: sessionId,
        token_hash: record.token_hash,
        expires_at: record.expires_at,
        ip_hash: record.ip_hash,
        user_agent_hash: record.user_agent_hash,
      });
      if (error) throw new Error(error.message);
      return token;
    } catch (err) {
      // A configured database is authoritative. Issuing a token that only this
      // process knows about would let an unrelated instance, or this instance
      // after a restart, reject a session the user believes is live.
      logger.error('Could not persist admin session; refusing to issue an unbacked session', {
        error: String(err),
      });
      throw new ServiceUnavailableError('admin session creation', err);
    }
  }

  memorySessions.set(record.token_hash, record);
  return token;
}

async function loadSession(tokenHash: string): Promise<AdminSessionRecord | null> {
  if (isDatabaseConfigured()) {
    try {
      const { data, error } = await (supabase.from('admin_sessions') as any)
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
        .select('*')
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (error) throw new Error(error.message);
<<<<<<< HEAD
      return data as StaffSessionRecord | null;
    } catch (err) {
      logger.error('Could not read staff session', { error: String(err) });
      throw new ServiceUnavailableError('staff session lookup', err);
=======
      if (data) return data as AdminSessionRecord;
      return null;
    } catch (err) {
      logger.error('Could not read admin session; refusing to fall back to process memory', {
        error: String(err),
      });
      throw new ServiceUnavailableError('admin session lookup', err);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    }
  }
  return memorySessions.get(tokenHash) ?? null;
}

<<<<<<< HEAD
export async function revokeStaffSession(token: string): Promise<boolean> {
=======
/**
 * Revokes a session immediately.
 *
 * An unknown token is still recorded as revoked so a replayed token can never be
 * re-accepted on a later request.
 */
export async function revokeAdminSession(token: string): Promise<boolean> {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  if (!token) return false;
  const tokenHash = hashToken(token);
  const revokedAt = new Date().toISOString();

  if (isDatabaseConfigured()) {
    try {
<<<<<<< HEAD
      const { error } = await (supabase.from('staff_sessions') as any)
        .update({ revoked_at: revokedAt })
        .eq('token_hash', tokenHash);
      return !error;
    } catch (err) {
      logger.error('Could not revoke staff session', { error: String(err) });
      return false;
=======
      const { error } = await (supabase.from('admin_sessions') as any)
        .update({ revoked_at: revokedAt })
        .eq('token_hash', tokenHash);
      if (error) throw new Error(error.message);
      return true;
    } catch (err) {
      // Reporting success here would tell the operator the session is dead when
      // the database never recorded the revocation.
      logger.error('Could not revoke admin session; refusing to report success', {
        error: String(err),
      });
      throw new ServiceUnavailableError('admin session revocation', err);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    }
  }

  const existing = memorySessions.get(tokenHash);
  if (existing) {
    existing.revoked_at = revokedAt;
<<<<<<< HEAD
    return true;
  }
  return false;
}

export async function verifyStaffToken(token: string): Promise<StaffSessionPayload | null> {
  if (!token || typeof token !== 'string') return null;

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

  if (session && session.revoked_at) return null;
  if (session && session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
    return null;
  }
=======
  } else {
    memorySessions.set(tokenHash, {
      id: crypto.randomUUID(),
      token_hash: tokenHash,
      created_at: revokedAt,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      revoked_at: revokedAt,
      last_used_at: revokedAt,
      ip_hash: null,
      user_agent_hash: null,
    });
  }
  return true;
}

export async function isSessionRevoked(token: string): Promise<boolean> {
  if (!token) return true;
  const session = await loadSession(hashToken(token));
  return Boolean(session && session.revoked_at !== null);
}

/**
 * Verifies signature, expiry and revocation status.
 *
 * Revocation is checked before the signature so a revoked token fails fast and
 * identically regardless of how it was tampered with.
 */
export async function verifyAdminToken(token: string): Promise<AdminSessionPayload | null> {
  if (!token || typeof token !== 'string') return null;

  const session = await loadSession(hashToken(token));
  if (session && session.revoked_at) return null;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;
  const expected = sign(headerB64, payloadB64);
<<<<<<< HEAD
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as StaffSessionPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    if (isDatabaseConfigured()) {
      if (!session || !session.staff_id) return null;

      const { data: staffRecord, error: staffError } = await (supabase.from('staff') as any)
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
      const effectiveRole: StaffRole | undefined =
        payload.role ?? (payload.adminId === 'super_admin' ? 'owner' : undefined);
      if (!effectiveRole || effectiveRole !== staffRecord.role) {
        return null;
      }

      // Update session last_used_at
      await (supabase.from('staff_sessions') as any)
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', session.id);
    }

    return payload;
  } catch (err) {
    if (err instanceof ServiceUnavailableError) throw err;
=======

  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as AdminSessionPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (session) session.last_used_at = new Date().toISOString();
    return payload;
  } catch {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    return null;
  }
}

<<<<<<< HEAD
export const STAFF_SESSION_COOKIE_NAME = 'et_staff_session';

export function extractStaffSessionToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const trimmed = authHeader.substring(7).trim();
    if (trimmed) return trimmed;
  }
  if (req.headers['x-staff-token']) {
    const trimmed = String(req.headers['x-staff-token']).trim();
    if (trimmed) return trimmed;
  }
  const fromCookie = (req as any).cookies?.[STAFF_SESSION_COOKIE_NAME];
  if (typeof fromCookie === 'string' && fromCookie.trim().length > 0) {
    return fromCookie.trim();
  }
  return undefined;
}

/**
 * Middleware: requires a valid staff session with an optional role requirement.
 */
export function requireStaff(roles?: StaffRole | StaffRole[]) {
  return async (req: AuthenticatedStaffRequest, res: Response, next: NextFunction): Promise<void> => {
    const token = extractStaffSessionToken(req);

    if (!token) {
      res.status(401).json({ error: 'Authentication required.', code: 'STAFF_AUTH_REQUIRED' });
      return;
    }

    let payload: StaffSessionPayload | null;
    try {
      payload = await verifyStaffToken(token);
    } catch (err) {
      res.status(503).json({ error: 'Auth unavailable', code: 'DATABASE_UNAVAILABLE' });
      return;
    }

    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired session', code: 'STAFF_SESSION_INVALID' });
      return;
    }

    const effectiveRole: StaffRole | undefined =
      payload.role ?? (payload.adminId === 'super_admin' ? 'owner' : undefined);

    if (roles) {
      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      const isSuper = effectiveRole === 'owner';
      if (!isSuper && (!effectiveRole || !allowedRoles.includes(effectiveRole))) {
        res.status(403).json({ error: 'Insufficient permissions', code: 'STAFF_FORBIDDEN' });
        return;
      }
    }

    const hydratedPayload: StaffSessionPayload = effectiveRole
      ? { ...payload, role: effectiveRole }
      : payload;
    req.staff = hydratedPayload;
    (req as any).admin = hydratedPayload;
    req.rawToken = token;
    next();
  };
}

/**
 * Legacy compatibility middleware.
 */
export const requireSuperAdmin = requireStaff('owner');

/**
 * Legacy compatibility exports for Expert portal.
 */
export type AdminSessionPayload = StaffSessionPayload;
export type AuthenticatedAdminRequest = AuthenticatedStaffRequest;
export const verifyAdminToken = verifyStaffToken;
export const revokeAdminSession = revokeStaffSession;

export async function isSessionRevoked(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const session = await loadSession(tokenHash);
  return Boolean(session?.revoked_at);
}

export async function generateAdminToken(
  context?: { ip?: string; userAgent?: string },
  ttlSeconds: number = env.SUPER_ADMIN_SESSION_TTL_SECONDS
): Promise<string> {
  const cleanEmail = env.SUPER_ADMIN_EMAIL.trim().toLowerCase();
  const staffId = await ensureBootstrapSuperAdminRecord(cleanEmail);
  return generateStaffToken(
    { id: staffId, email: cleanEmail, role: 'owner' },
    context,
    ttlSeconds,
    { legacyImplicitAdminRole: true }
  );
}

export function isSuperAdminConfigured(): boolean {
  if (!env.SUPER_ADMIN_EMAIL) return false;
  return Boolean(env.SUPER_ADMIN_PASSWORD_HASH || (!env.IS_PRODUCTION && env.SUPER_ADMIN_PASSWORD));
=======
/**
 * Express middleware: requires a valid Super Admin session.
 */
export async function requireSuperAdmin(
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-admin-token']) {
    token = String(req.headers['x-admin-token']).trim();
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required.', code: 'ADMIN_AUTH_REQUIRED' });
    return;
  }

  let payload: AdminSessionPayload | null;
  try {
    payload = await verifyAdminToken(token);
  } catch (err) {
    if (err instanceof ServiceUnavailableError) {
      res.status(503).json({
        error: 'Authentication is temporarily unavailable. Please try again shortly.',
        code: 'DATABASE_UNAVAILABLE',
      });
      return;
    }
    throw err;
  }

  if (!payload) {
    res.status(401).json({
      error: 'Invalid, expired, or revoked session. Please sign in again.',
      code: 'ADMIN_SESSION_INVALID',
    });
    return;
  }

  req.admin = payload;
  req.rawToken = token;
  next();
}

/**
 * Revokes every active session. Used by the emergency secret-rotation runbook.
 */
export async function revokeAllAdminSessions(): Promise<number> {
  const revokedAt = new Date().toISOString();
  let count = 0;

  if (isDatabaseConfigured()) {
    try {
      const { data, error } = await (supabase.from('admin_sessions') as any)
        .update({ revoked_at: revokedAt })
        .is('revoked_at', null);
      if (error) throw new Error(error.message);
      count = Array.isArray(data) ? data.length : 0;
      return count;
    } catch (err) {
      logger.error('Failed to revoke admin sessions in database; refusing to report success', {
        error: String(err),
      });
      throw new ServiceUnavailableError('admin session bulk revocation', err);
    }
  }

  for (const session of memorySessions.values()) {
    if (!session.revoked_at) {
      session.revoked_at = revokedAt;
      count += 1;
    }
  }
  return count;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}
