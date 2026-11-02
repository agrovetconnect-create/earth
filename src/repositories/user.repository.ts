import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { nowIso } from '../utils/time.js';
import type {
  AuthSessionRow,
  UserRow,
  VerificationCodeRecord,
} from '../types/community-posts.types.js';

/**
 * Accounts, WhatsApp identity links, verification codes and sessions.
 *
 * REAL DATA POLICY: no synthetic users, no seed rows, no placeholder accounts.
 * Every store below starts empty. When Supabase is configured it is
 * authoritative; otherwise a per-process in-memory store keeps a development
 * instance working, exactly as `admin-auth.ts` does for the Super Admin
 * session. In production, a missing database is an error, never a silent
 * in-memory fallback that forgets every account on restart.
 */

export type CreateVia = 'web' | 'whatsapp' | 'email' | 'mobile';

export interface EmailVerificationCodeMemoryRecord {
  id: string;
  email: string;
  code_hash: string;
  purpose: string;
  expires_at: string;
  attempts: number;
  max_attempts: number;
  consumed_at: string | null;
  created_at: string;
}

interface MemoryStores {
  users: Map<string, UserRow>;
  usersByPhoneHash: Map<string, string>;
  usersByEmail: Map<string, string>;
  identities: Map<string, string>;
  codes: Map<string, VerificationCodeRecord[]>;
  emailCodes: Map<string, EmailVerificationCodeMemoryRecord[]>;
  sessions: Map<string, AuthSessionRow>;
}

const memory: MemoryStores = {
  users: new Map(),
  usersByPhoneHash: new Map(),
  usersByEmail: new Map(),
  identities: new Map(),
  codes: new Map(),
  emailCodes: new Map(),
  sessions: new Map(),
};

/** Matches the database default: ET-USER-<4 hex digits>. */
function generatePublicUserId(): string {
  return `ET-USER-${crypto.randomBytes(2).toString('hex')}`;
}

export class UserRepository {
  private get ready(): boolean {
    return isDatabaseConfigured();
  }

  private requireDatabase(operation: string): void {
    if (!this.ready && env.IS_PRODUCTION) {
      throw new ServiceUnavailableError(
        operation,
        undefined,
        `Account ${operation} requires a configured database. ` +
          'Set SUPABASE_URL and SUPABASE_SECRET_KEY and run Supabase migrations.'
      );
    }
  }

  /**
   * A configured database is authoritative. When a query against it fails we
   * must NOT fall back to the process-local map: doing so would interpret an
   * outage as "the account does not exist" (allowing a duplicate to be created)
   * or accept a session that the database never stored. The failure is surfaced
   * as a controlled 503 instead.
   */
  private databaseFailure(operation: string, err: unknown): ServiceUnavailableError {
    logger.error('Database operation failed; refusing to fall back to process memory', {
      operation,
      error: err instanceof Error ? err.message : String(err),
    });
    return new ServiceUnavailableError(operation, err);
  }

  // ==========================================================================
  // Users
  // ==========================================================================

  async findUserByPhoneHash(phoneHash: string): Promise<UserRow | null> {
    if (!phoneHash) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .select('*')
          .eq('phone_hash', phoneHash)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as UserRow) ?? null;
      } catch (err) {
        throw this.databaseFailure('account lookup by phone hash', err);
      }
    }
    const id = memory.usersByPhoneHash.get(phoneHash);
    return id ? memory.users.get(id) ?? null : null;
  }

  async findUserById(id: string): Promise<UserRow | null> {
    if (!id) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as UserRow) ?? null;
      } catch (err) {
        throw this.databaseFailure('account lookup by id', err);
      }
    }
    return memory.users.get(id) ?? null;
  }

  async findUserByPublicUserId(publicUserId: string): Promise<UserRow | null> {
    if (!publicUserId) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .select('*')
          .eq('public_user_id', publicUserId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as UserRow) ?? null;
      } catch (err) {
        throw this.databaseFailure('account lookup by public id', err);
      }
    }
    for (const user of memory.users.values()) {
      if (user.public_user_id === publicUserId) return user;
    }
    return null;
  }

  /**
   * Finds the account for a verified phone hash, creating one when it does not
   * exist yet. This is the single place a new Earth Talk account is born, so a
   * WhatsApp sender and a website login with the same number always resolve to
   * the same account.
   */
  async findOrCreateByPhoneHash(phoneHash: string, createdVia: CreateVia): Promise<UserRow> {
    this.requireDatabase('account creation');

    const existing = await this.findUserByPhoneHash(phoneHash);
    if (existing) return existing;

    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .insert({
            phone_hash: phoneHash,
            created_via: createdVia,
            is_demo: false,
          })
          .select('*')
          .single();
        if (error) {
          // A concurrent request may have created the account first.
          const raced = await this.findUserByPhoneHash(phoneHash);
          if (raced) return raced;
          throw new Error(error.message);
        }
        return data as UserRow;
      } catch (err) {
        const raced = await this.findUserByPhoneHash(phoneHash);
        if (raced) return raced;
        throw err;
      }
    }

    const user: UserRow = {
      id: crypto.randomUUID(),
      public_user_id: generatePublicUserId(),
      display_name: null,
      display_name_updated_at: null,
      phone_hash: phoneHash,
      created_via: createdVia,
      is_demo: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    memory.users.set(user.id, user);
    memory.usersByPhoneHash.set(phoneHash, user.id);
    return user;
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<UserRow | null> {
    this.requireDatabase('profile update');
    const clean = displayName === null ? null : displayName.trim().slice(0, 60) || null;
    const now = nowIso();

    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .update({ display_name: clean, display_name_updated_at: now, updated_at: now })
          .eq('id', userId)
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        return data as UserRow;
      } catch (err) {
        throw this.databaseFailure('profile update', err);
      }
    }

    const user = memory.users.get(userId);
    if (!user) return null;
    const updated: UserRow = {
      ...user,
      display_name: clean,
      display_name_updated_at: now,
      updated_at: now,
    };
    memory.users.set(userId, updated);
    return updated;
  }

  /**
   * Registers an account directly in the development store. Used by tests only,
   * so a rename window can be exercised without waiting seven days.
   */
  registerUser(user: UserRow): void {
    memory.users.set(user.id, user);
    if (user.phone_hash) {
      memory.usersByPhoneHash.set(user.phone_hash, user.id);
    }
    if (user.email) {
      memory.usersByEmail.set(user.email.trim().toLowerCase(), user.id);
    }
  }

  // ==========================================================================
  // WhatsApp identity
  // ==========================================================================

  /**
   * Associates a WhatsApp sender with an Earth Talk account. The association is
   * a one-way hash; nothing here can be used to recover a phone number.
   */
  async linkWhatsAppIdentity(userId: string, identityHash: string): Promise<void> {
    if (!userId || !identityHash) return;
    this.requireDatabase('WhatsApp identity link');

    if (this.ready) {
      try {
        const { error } = await (supabase.from('user_whatsapp_identities') as any)
          .upsert(
            {
              user_id: userId,
              wa_identity_hash: identityHash,
              last_seen_at: nowIso(),
            },
            { onConflict: 'wa_identity_hash' }
          );
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('WhatsApp identity link', err);
      }
    }
    memory.identities.set(identityHash, userId);
  }

  async findUserByWhatsAppHash(identityHash: string): Promise<UserRow | null> {
    if (!identityHash) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('user_whatsapp_identities') as any)
          .select('user_id')
          .eq('wa_identity_hash', identityHash)
          .maybeSingle();
        if (error) throw new Error(error.message);
        const userId = (data as { user_id: string } | null)?.user_id;
        return userId ? await this.findUserById(userId) : null;
      } catch (err) {
        throw this.databaseFailure('WhatsApp identity lookup', err);
      }
    }
    const userId = memory.identities.get(identityHash);
    return userId ? memory.users.get(userId) ?? null : null;
  }

  async isWhatsAppLinked(userId: string): Promise<boolean> {
    if (!userId) return false;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('user_whatsapp_identities') as any)
          .select('wa_identity_hash')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) return false;
        return !!data;
      } catch {
        return false;
      }
    }
    for (const id of memory.identities.values()) {
      if (id === userId) return true;
    }
    return false;
  }

  // ==========================================================================
  // Verification codes
  // ==========================================================================

  async saveVerificationCode(record: VerificationCodeRecord): Promise<void> {
    this.requireDatabase('verification code storage');
    if (this.ready) {
      try {
        const { error } = await (supabase.from('auth_verification_codes') as any).insert({
          id: record.id,
          phone_hash: record.phone_hash,
          code_hash: record.code_hash,
          purpose: record.purpose,
          expires_at: record.expires_at,
          attempts: record.attempts,
          max_attempts: record.max_attempts,
          requested_ip_hash: record.requested_ip_hash,
          delivery: record.delivery,
        });
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('verification code storage', err);
      }
    }
    const list = memory.codes.get(record.phone_hash) ?? [];
    list.push(record);
    memory.codes.set(record.phone_hash, list);
  }

  /**
   * Most recent unconsumed code for a phone hash. An expired or exhausted code
   * is still returned so verification can reject it with the right reason
   * instead of a generic failure that hides an expired link.
   */
  async findLatestVerificationCode(phoneHash: string): Promise<VerificationCodeRecord | null> {
    if (!phoneHash) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('auth_verification_codes') as any)
          .select('*')
          .eq('phone_hash', phoneHash)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as VerificationCodeRecord) ?? null;
      } catch (err) {
        throw this.databaseFailure('verification code lookup', err);
      }
    }
    const list = memory.codes.get(phoneHash) ?? [];
    return list.length > 0 ? list[list.length - 1] : null;
  }

  async updateVerificationCode(
    phoneHash: string,
    codeId: string,
    patch: Partial<Pick<VerificationCodeRecord, 'attempts' | 'consumed_at' | 'delivery'>>
  ): Promise<void> {
    if (this.ready) {
      try {
        const { error } = await (supabase.from('auth_verification_codes') as any)
          .update(patch)
          .eq('id', codeId)
          .eq('phone_hash', phoneHash);
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('verification code update', err);
      }
    }
    const list = memory.codes.get(phoneHash) ?? [];
    const target = list.find((entry) => entry.id === codeId);
    if (target) Object.assign(target, patch);
  }

  /**
   * Invalidates every outstanding code for a phone hash. Called when a new code
   * is requested, so a previously sent code can no longer be replayed.
   */
  async consumeOutstandingCodes(phoneHash: string): Promise<void> {
    const consumedAt = nowIso();
    if (this.ready) {
      try {
        const { error } = await (supabase.from('auth_verification_codes') as any)
          .update({ consumed_at: consumedAt })
          .eq('phone_hash', phoneHash)
          .is('consumed_at', null);
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('verification code invalidation', err);
      }
    }
    for (const entry of memory.codes.get(phoneHash) ?? []) {
      if (!entry.consumed_at) entry.consumed_at = consumedAt;
    }
  }

  // ==========================================================================
  // Sessions
  // ==========================================================================

  async createSession(row: AuthSessionRow): Promise<void> {
    this.requireDatabase('session creation');
    if (this.ready) {
      try {
        const { error } = await (supabase.from('auth_sessions') as any).insert({
          id: row.id,
          user_id: row.user_id,
          token_hash: row.token_hash,
          expires_at: row.expires_at,
          ip_hash: row.ip_hash,
          user_agent_hash: row.user_agent_hash,
        });
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('session creation', err);
      }
    }
    memory.sessions.set(row.token_hash, row);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRow | null> {
    if (!tokenHash) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('auth_sessions') as any)
          .select('*')
          .eq('token_hash', tokenHash)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as AuthSessionRow) ?? null;
      } catch (err) {
        throw this.databaseFailure('session lookup', err);
      }
    }
    return memory.sessions.get(tokenHash) ?? null;
  }

  async revokeSession(tokenHash: string): Promise<boolean> {
    if (!tokenHash) return false;
    const revokedAt = nowIso();
    if (this.ready) {
      try {
        const { error } = await (supabase.from('auth_sessions') as any)
          .update({ revoked_at: revokedAt, updated_at: revokedAt })
          .eq('token_hash', tokenHash);
        if (error) throw new Error(error.message);
      } catch (err) {
        throw this.databaseFailure('session revocation', err);
      }
    }
    const session = memory.sessions.get(tokenHash);
    if (session) {
      session.revoked_at = revokedAt;
      return true;
    }
    // An unknown token is still recorded as revoked so a replayed token is
    // rejected on a later request rather than accepted by the memory store.
    memory.sessions.set(tokenHash, {
      id: crypto.randomUUID(),
      user_id: '',
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      revoked_at: revokedAt,
      last_used_at: revokedAt,
      ip_hash: null,
      user_agent_hash: null,
      created_at: revokedAt,
      updated_at: revokedAt,
    });
    return true;
  }

  async touchSession(tokenHash: string): Promise<void> {
    const lastUsedAt = nowIso();
    if (this.ready) {
      try {
        await (supabase.from('auth_sessions') as any)
          .update({ last_used_at: lastUsedAt })
          .eq('token_hash', tokenHash);
        return;
      } catch {
        // A failed touch must not fail the request; the session is still valid.
      }
    }
    const session = memory.sessions.get(tokenHash);
    if (session) session.last_used_at = lastUsedAt;
  }

  async findUserByEmail(email: string): Promise<UserRow | null> {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .select('*')
          .eq('email', cleanEmail)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as UserRow) ?? null;
      } catch (err) {
        throw this.databaseFailure('account lookup by email', err);
      }
    }
    const id = memory.usersByEmail.get(cleanEmail);
    return id ? memory.users.get(id) ?? null : null;
  }

  async findOrCreateByEmail(email: string): Promise<UserRow> {
    this.requireDatabase('account creation');
    const cleanEmail = email.trim().toLowerCase();
    
    const existing = await this.findUserByEmail(cleanEmail);
    if (existing) return existing;

    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .insert({
            email: cleanEmail,
            created_via: 'web',
            is_demo: false,
          })
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        return data as UserRow;
      } catch (err) {
        const raced = await this.findUserByEmail(cleanEmail);
        if (raced) return raced;
        throw err;
      }
    }

    const user: UserRow = {
      id: crypto.randomUUID(),
      public_user_id: generatePublicUserId(),
      display_name: null,
      display_name_updated_at: null,
      phone_hash: null,
      email: cleanEmail,
      created_via: 'web',
      is_demo: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    memory.users.set(user.id, user);
    memory.usersByEmail.set(cleanEmail, user.id);
    return user;
  }

  async consumeOutstandingEmailCodes(email: string): Promise<void> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;
    const consumedAt = nowIso();
    if (this.ready) {
      try {
        const { error } = await (supabase.from('email_verification_codes') as any)
          .update({ consumed_at: consumedAt })
          .eq('email', cleanEmail)
          .is('consumed_at', null);
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('email verification code invalidation', err);
      }
    }
    for (const entry of memory.emailCodes.get(cleanEmail) ?? []) {
      if (!entry.consumed_at) entry.consumed_at = consumedAt;
    }
  }

  async saveEmailVerificationCode(record: {
    id?: string;
    email: string;
    code_hash: string;
    purpose: string;
    expires_at: string;
    max_attempts?: number;
  }): Promise<string> {
    this.requireDatabase('email verification code storage');
    const cleanEmail = record.email.trim().toLowerCase();
    const id = record.id ?? crypto.randomUUID();
    const maxAttempts = record.max_attempts ?? env.AUTH_CODE_MAX_ATTEMPTS;

    if (this.ready) {
      try {
        const { error } = await (supabase.from('email_verification_codes') as any).insert({
          id,
          email: cleanEmail,
          code_hash: record.code_hash,
          purpose: record.purpose,
          expires_at: record.expires_at,
          attempts: 0,
          max_attempts: maxAttempts,
        });
        if (error) throw new Error(error.message);
        return id;
      } catch (err) {
        throw this.databaseFailure('email verification code storage', err);
      }
    }

    const list = memory.emailCodes.get(cleanEmail) ?? [];
    list.push({
      id,
      email: cleanEmail,
      code_hash: record.code_hash,
      purpose: record.purpose,
      expires_at: record.expires_at,
      attempts: 0,
      max_attempts: maxAttempts,
      consumed_at: null,
      created_at: nowIso(),
    });
    memory.emailCodes.set(cleanEmail, list);
    return id;
  }

  async findLatestEmailCode(email: string): Promise<EmailVerificationCodeMemoryRecord | null> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('email_verification_codes') as any)
          .select('*')
          .eq('email', cleanEmail)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as EmailVerificationCodeMemoryRecord) ?? null;
      } catch (err) {
        throw this.databaseFailure('email verification code lookup', err);
      }
    }
    const list = memory.emailCodes.get(cleanEmail) ?? [];
    return list.length > 0 ? list[list.length - 1] : null;
  }

  async updateEmailCode(
    email: string,
    id: string,
    patch: Partial<Pick<EmailVerificationCodeMemoryRecord, 'attempts' | 'consumed_at'>>
  ): Promise<void> {
    const cleanEmail = email.trim().toLowerCase();
    if (this.ready) {
      try {
        const { error } = await (supabase.from('email_verification_codes') as any)
          .update(patch)
          .eq('id', id)
          .eq('email', cleanEmail);
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('email verification code update', err);
      }
    }
    const list = memory.emailCodes.get(cleanEmail) ?? [];
    const target = list.find((entry) => entry.id === id);
    if (target) Object.assign(target, patch);
  }

  async consumeEmailCode(id: string): Promise<void> {
    if (!id) return;
    const consumedAt = nowIso();
    if (this.ready) {
      try {
        const { error } = await (supabase.from('email_verification_codes') as any)
          .update({ consumed_at: consumedAt })
          .eq('id', id);
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('email verification code consumption', err);
      }
    }
    for (const list of memory.emailCodes.values()) {
      const target = list.find((entry) => entry.id === id);
      if (target) {
        target.consumed_at = consumedAt;
        return;
      }
    }
  }

  async setEmailVerified(userId: string): Promise<void> {
    const verifiedAt = nowIso();
    if (this.ready) {
      try {
        const { error } = await (supabase.from('users') as any)
          .update({ email_verified_at: verifiedAt, updated_at: verifiedAt })
          .eq('id', userId);
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('email verification timestamp update', err);
      }
    }
    const user = memory.users.get(userId);
    if (user) {
      user.email_verified_at = verifiedAt;
      user.updated_at = verifiedAt;
    }
  }

  async setUserPhoneHash(userId: string, phoneHash: string): Promise<void> {
    if (!userId || !phoneHash) return;
    this.requireDatabase('phone hash update');
    const updatedAt = nowIso();
    if (this.ready) {
      try {
        const { error } = await (supabase.from('users') as any)
          .update({ phone_hash: phoneHash, updated_at: updatedAt })
          .eq('id', userId);
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('account phone hash update', err);
      }
    }
    const user = memory.users.get(userId);
    if (user) {
      user.phone_hash = phoneHash;
      user.updated_at = updatedAt;
      memory.usersByPhoneHash.set(phoneHash, userId);
    }
  }

  /**
   * Merges an unlinked WhatsApp-only account (`fromUserId`) into a verified
   * email account (`targetUserId`), reassigning owned observations and comments
   * before removing the duplicate row so `phone_hash` remains unique.
   */
  async mergeWhatsAppAccountIntoUser(
    fromUserId: string,
    targetUserId: string,
    phoneHash: string
  ): Promise<void> {
    if (!fromUserId || !targetUserId || fromUserId === targetUserId) return;
    this.requireDatabase('WhatsApp account merge');

    if (this.ready) {
      try {
        const { error: obsErr } = await (supabase.from('observations') as any)
          .update({ owner_user_id: targetUserId })
          .eq('owner_user_id', fromUserId);
        if (obsErr) throw new Error(obsErr.message);

        const { error: hashObsErr } = await (supabase.from('observations') as any)
          .update({ owner_user_id: targetUserId })
          .eq('source_user_hash', phoneHash)
          .is('owner_user_id', null);
        if (hashObsErr) throw new Error(hashObsErr.message);

        const { error: cmtErr } = await (supabase.from('observation_comments') as any)
          .update({ author_user_id: targetUserId })
          .eq('author_user_id', fromUserId);
        if (cmtErr) throw new Error(cmtErr.message);

        const { error: identErr } = await (supabase.from('user_whatsapp_identities') as any)
          .update({ user_id: targetUserId, updated_at: nowIso() })
          .eq('user_id', fromUserId);
        if (identErr) throw new Error(identErr.message);

        const { error: delErr } = await (supabase.from('users') as any)
          .delete()
          .eq('id', fromUserId);
        if (delErr) throw new Error(delErr.message);
        return;
      } catch (err) {
        throw this.databaseFailure('WhatsApp account merge', err);
      }
    }

    memory.users.delete(fromUserId);
    if (memory.usersByPhoneHash.get(phoneHash) === fromUserId) {
      memory.usersByPhoneHash.set(phoneHash, targetUserId);
    }
    for (const [hash, uid] of memory.identities.entries()) {
      if (uid === fromUserId) memory.identities.set(hash, targetUserId);
    }
  }

  /** Test helper: the number of accounts held in the development memory store. */
  get memoryAccountCount(): number {
    return memory.users.size;
  }
}

export const userRepository = new UserRepository();
