import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { nowIso } from '../utils/time.js';
const memory = {
    users: new Map(),
    usersByPhoneHash: new Map(),
    usersByEmail: new Map(),
    identities: new Map(),
    codes: new Map(),
    emailCodes: new Map(),
    sessions: new Map(),
};
/** Matches the database default: ET-USER-<4 hex digits>. */
function generatePublicUserId() {
    return `ET-USER-${crypto.randomBytes(2).toString('hex')}`;
}
export class UserRepository {
    get ready() {
        return isDatabaseConfigured();
    }
    requireDatabase(operation) {
        if (!this.ready && env.IS_PRODUCTION) {
            throw new ServiceUnavailableError(operation, undefined, `Account ${operation} requires a configured database. ` +
                'Set SUPABASE_URL and SUPABASE_SECRET_KEY and run Supabase migrations.');
        }
    }
    /**
     * A configured database is authoritative. When a query against it fails we
     * must NOT fall back to the process-local map: doing so would interpret an
     * outage as "the account does not exist" (allowing a duplicate to be created)
     * or accept a session that the database never stored. The failure is surfaced
     * as a controlled 503 instead.
     */
    databaseFailure(operation, err) {
        logger.error('Database operation failed; refusing to fall back to process memory', {
            operation,
            error: err instanceof Error ? err.message : String(err),
        });
        return new ServiceUnavailableError(operation, err);
    }
    // ==========================================================================
    // Users
    // ==========================================================================
    async findUserByPhoneHash(phoneHash) {
        if (!phoneHash)
            return null;
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('users')
                    .select('*')
                    .eq('phone_hash', phoneHash)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                return data ?? null;
            }
            catch (err) {
                throw this.databaseFailure('account lookup by phone hash', err);
            }
        }
        const id = memory.usersByPhoneHash.get(phoneHash);
        return id ? memory.users.get(id) ?? null : null;
    }
    async findUserById(id) {
        if (!id)
            return null;
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('users')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                return data ?? null;
            }
            catch (err) {
                throw this.databaseFailure('account lookup by id', err);
            }
        }
        return memory.users.get(id) ?? null;
    }
    async findUsersByIds(ids) {
        const uniqueIds = Array.from(new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean)));
        const result = new Map();
        if (uniqueIds.length === 0)
            return result;
        if (this.ready) {
            try {
                const CHUNK_SIZE = 200;
                for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
                    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
                    const { data, error } = await supabase.from('users')
                        .select('*')
                        .in('id', chunk);
                    if (error)
                        throw new Error(error.message);
                    for (const row of (data ?? [])) {
                        result.set(row.id, row);
                    }
                }
                return result;
            }
            catch (err) {
                throw this.databaseFailure('account batch lookup by ids', err);
            }
        }
        for (const id of uniqueIds) {
            const user = memory.users.get(id);
            if (user)
                result.set(id, user);
        }
        return result;
    }
    async findUserByPublicUserId(publicUserId) {
        if (!publicUserId)
            return null;
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('users')
                    .select('*')
                    .eq('public_user_id', publicUserId)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                return data ?? null;
            }
            catch (err) {
                throw this.databaseFailure('account lookup by public id', err);
            }
        }
        for (const user of memory.users.values()) {
            if (user.public_user_id === publicUserId)
                return user;
        }
        return null;
    }
    /**
     * Finds the account for a verified phone hash, creating one when it does not
     * exist yet. This is the single place a new Earth Talk account is born, so a
     * WhatsApp sender and a website login with the same number always resolve to
     * the same account.
     */
    async findOrCreateByPhoneHash(phoneHash, createdVia) {
        this.requireDatabase('account creation');
        const existing = await this.findUserByPhoneHash(phoneHash);
        if (existing)
            return existing;
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('users')
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
                    if (raced)
                        return raced;
                    throw new Error(error.message);
                }
                return data;
            }
            catch (err) {
                const raced = await this.findUserByPhoneHash(phoneHash);
                if (raced)
                    return raced;
                throw err;
            }
        }
        const user = {
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
    async updateDisplayName(userId, displayName) {
        this.requireDatabase('profile update');
        const clean = displayName === null ? null : displayName.trim().slice(0, 60) || null;
        const now = nowIso();
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('users')
                    .update({ display_name: clean, display_name_updated_at: now, updated_at: now })
                    .eq('id', userId)
                    .select('*')
                    .single();
                if (error)
                    throw new Error(error.message);
                return data;
            }
            catch (err) {
                throw this.databaseFailure('profile update', err);
            }
        }
        const user = memory.users.get(userId);
        if (!user)
            return null;
        const updated = {
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
    registerUser(user) {
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
    async linkWhatsAppIdentity(userId, identityHash) {
        if (!userId || !identityHash)
            return;
        this.requireDatabase('WhatsApp identity link');
        if (this.ready) {
            try {
                const { error } = await supabase.from('user_whatsapp_identities')
                    .upsert({
                    user_id: userId,
                    wa_identity_hash: identityHash,
                    last_seen_at: nowIso(),
                }, { onConflict: 'wa_identity_hash' });
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('WhatsApp identity link', err);
            }
        }
        memory.identities.set(identityHash, userId);
    }
    async findUserByWhatsAppHash(identityHash) {
        if (!identityHash)
            return null;
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('user_whatsapp_identities')
                    .select('user_id')
                    .eq('wa_identity_hash', identityHash)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                const userId = data?.user_id;
                return userId ? await this.findUserById(userId) : null;
            }
            catch (err) {
                throw this.databaseFailure('WhatsApp identity lookup', err);
            }
        }
        const userId = memory.identities.get(identityHash);
        return userId ? memory.users.get(userId) ?? null : null;
    }
    async isWhatsAppLinked(userId) {
        if (!userId)
            return false;
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('user_whatsapp_identities')
                    .select('wa_identity_hash')
                    .eq('user_id', userId)
                    .maybeSingle();
                if (error)
                    return false;
                return !!data;
            }
            catch {
                return false;
            }
        }
        for (const id of memory.identities.values()) {
            if (id === userId)
                return true;
        }
        return false;
    }
    // ==========================================================================
    // Verification codes
    // ==========================================================================
    async saveVerificationCode(record) {
        this.requireDatabase('verification code storage');
        if (this.ready) {
            try {
                const { error } = await supabase.from('auth_verification_codes').insert({
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
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
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
    async findLatestVerificationCode(phoneHash) {
        if (!phoneHash)
            return null;
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('auth_verification_codes')
                    .select('*')
                    .eq('phone_hash', phoneHash)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                return data ?? null;
            }
            catch (err) {
                throw this.databaseFailure('verification code lookup', err);
            }
        }
        const list = memory.codes.get(phoneHash) ?? [];
        return list.length > 0 ? list[list.length - 1] : null;
    }
    async updateVerificationCode(phoneHash, codeId, patch) {
        if (this.ready) {
            try {
                const { error } = await supabase.from('auth_verification_codes')
                    .update(patch)
                    .eq('id', codeId)
                    .eq('phone_hash', phoneHash);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('verification code update', err);
            }
        }
        const list = memory.codes.get(phoneHash) ?? [];
        const target = list.find((entry) => entry.id === codeId);
        if (target)
            Object.assign(target, patch);
    }
    /**
     * Invalidates every outstanding code for a phone hash. Called when a new code
     * is requested, so a previously sent code can no longer be replayed.
     */
    async consumeOutstandingCodes(phoneHash) {
        const consumedAt = nowIso();
        if (this.ready) {
            try {
                const { error } = await supabase.from('auth_verification_codes')
                    .update({ consumed_at: consumedAt })
                    .eq('phone_hash', phoneHash)
                    .is('consumed_at', null);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('verification code invalidation', err);
            }
        }
        for (const entry of memory.codes.get(phoneHash) ?? []) {
            if (!entry.consumed_at)
                entry.consumed_at = consumedAt;
        }
    }
    // ==========================================================================
    // Sessions
    // ==========================================================================
    async createSession(row) {
        this.requireDatabase('session creation');
        if (this.ready) {
            try {
                const { error } = await supabase.from('auth_sessions').insert({
                    id: row.id,
                    user_id: row.user_id,
                    token_hash: row.token_hash,
                    expires_at: row.expires_at,
                    ip_hash: row.ip_hash,
                    user_agent_hash: row.user_agent_hash,
                });
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('session creation', err);
            }
        }
        memory.sessions.set(row.token_hash, row);
    }
    async findSessionByTokenHash(tokenHash) {
        if (!tokenHash)
            return null;
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('auth_sessions')
                    .select('*')
                    .eq('token_hash', tokenHash)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                return data ?? null;
            }
            catch (err) {
                throw this.databaseFailure('session lookup', err);
            }
        }
        return memory.sessions.get(tokenHash) ?? null;
    }
    async revokeSession(tokenHash) {
        if (!tokenHash)
            return false;
        const revokedAt = nowIso();
        if (this.ready) {
            try {
                const { error } = await supabase.from('auth_sessions')
                    .update({ revoked_at: revokedAt, updated_at: revokedAt })
                    .eq('token_hash', tokenHash);
                if (error)
                    throw new Error(error.message);
            }
            catch (err) {
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
    async touchSession(tokenHash) {
        const lastUsedAt = nowIso();
        if (this.ready) {
            try {
                await supabase.from('auth_sessions')
                    .update({ last_used_at: lastUsedAt })
                    .eq('token_hash', tokenHash);
                return;
            }
            catch {
                // A failed touch must not fail the request; the session is still valid.
            }
        }
        const session = memory.sessions.get(tokenHash);
        if (session)
            session.last_used_at = lastUsedAt;
    }
    async findUserByEmail(email) {
        if (!email)
            return null;
        const cleanEmail = email.trim().toLowerCase();
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('users')
                    .select('*')
                    .eq('email', cleanEmail)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                return data ?? null;
            }
            catch (err) {
                throw this.databaseFailure('account lookup by email', err);
            }
        }
        const id = memory.usersByEmail.get(cleanEmail);
        return id ? memory.users.get(id) ?? null : null;
    }
    async findOrCreateByEmail(email, preferredId) {
        this.requireDatabase('account creation');
        const cleanEmail = email.trim().toLowerCase();
        const existing = await this.findUserByEmail(cleanEmail);
        if (existing)
            return existing;
        if (preferredId) {
            const existingById = await this.findUserById(preferredId);
            if (existingById)
                return existingById;
        }
        if (this.ready) {
            try {
                const insertPayload = {
                    email: cleanEmail,
                    created_via: 'web',
                    is_demo: false,
                };
                if (preferredId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(preferredId)) {
                    insertPayload.id = preferredId;
                }
                const { data, error } = await supabase.from('users')
                    .insert(insertPayload)
                    .select('*')
                    .single();
                if (error)
                    throw new Error(error.message);
                return data;
            }
            catch (err) {
                const raced = await this.findUserByEmail(cleanEmail);
                if (raced)
                    return raced;
                if (preferredId) {
                    const existingById = await this.findUserById(preferredId);
                    if (existingById)
                        return existingById;
                }
                throw this.databaseFailure('account creation', err);
            }
        }
        const user = {
            id: preferredId || crypto.randomUUID(),
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
    async consumeOutstandingEmailCodes(email) {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail)
            return;
        const consumedAt = nowIso();
        if (this.ready) {
            try {
                const { error } = await supabase.from('email_verification_codes')
                    .update({ consumed_at: consumedAt })
                    .eq('email', cleanEmail)
                    .is('consumed_at', null);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('email verification code invalidation', err);
            }
        }
        for (const entry of memory.emailCodes.get(cleanEmail) ?? []) {
            if (!entry.consumed_at)
                entry.consumed_at = consumedAt;
        }
    }
    async saveEmailVerificationCode(record) {
        this.requireDatabase('email verification code storage');
        const cleanEmail = record.email.trim().toLowerCase();
        const id = record.id ?? crypto.randomUUID();
        const maxAttempts = record.max_attempts ?? env.AUTH_CODE_MAX_ATTEMPTS;
        if (this.ready) {
            try {
                const { error } = await supabase.from('email_verification_codes').insert({
                    id,
                    email: cleanEmail,
                    code_hash: record.code_hash,
                    purpose: record.purpose,
                    expires_at: record.expires_at,
                    attempts: 0,
                    max_attempts: maxAttempts,
                });
                if (error)
                    throw new Error(error.message);
                return id;
            }
            catch (err) {
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
    async findLatestEmailCode(email) {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail)
            return null;
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('email_verification_codes')
                    .select('*')
                    .eq('email', cleanEmail)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                return data ?? null;
            }
            catch (err) {
                throw this.databaseFailure('email verification code lookup', err);
            }
        }
        const list = memory.emailCodes.get(cleanEmail) ?? [];
        return list.length > 0 ? list[list.length - 1] : null;
    }
    async updateEmailCode(email, id, patch) {
        const cleanEmail = email.trim().toLowerCase();
        if (this.ready) {
            try {
                const { error } = await supabase.from('email_verification_codes')
                    .update(patch)
                    .eq('id', id)
                    .eq('email', cleanEmail);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('email verification code update', err);
            }
        }
        const list = memory.emailCodes.get(cleanEmail) ?? [];
        const target = list.find((entry) => entry.id === id);
        if (target)
            Object.assign(target, patch);
    }
    async consumeEmailCode(id) {
        if (!id)
            return;
        const consumedAt = nowIso();
        if (this.ready) {
            try {
                const { error } = await supabase.from('email_verification_codes')
                    .update({ consumed_at: consumedAt })
                    .eq('id', id);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
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
    async setEmailVerified(userId) {
        const verifiedAt = nowIso();
        if (this.ready) {
            try {
                const { error } = await supabase.from('users')
                    .update({ email_verified_at: verifiedAt, updated_at: verifiedAt })
                    .eq('id', userId);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('email verification timestamp update', err);
            }
        }
        const user = memory.users.get(userId);
        if (user) {
            user.email_verified_at = verifiedAt;
            user.updated_at = verifiedAt;
        }
    }
    async setAuthUserId(userId, authUserId) {
        if (!userId || !authUserId)
            return;
        if (this.ready) {
            try {
                const { error } = await supabase.from('users')
                    .update({ auth_user_id: authUserId, updated_at: nowIso() })
                    .eq('id', userId);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                logger.warn('Failed to store Supabase auth user id', { error: String(err) });
                return;
            }
        }
        const user = memory.users.get(userId);
        if (user)
            user.auth_user_id = authUserId;
    }
    async markWelcomeEmailSent(userId) {
        const sentAt = nowIso();
        if (this.ready) {
            try {
                const { error } = await supabase.from('users')
                    .update({ welcome_email_sent: true, welcome_email_sent_at: sentAt, updated_at: sentAt })
                    .eq('id', userId);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('welcome email delivery marker update', err);
            }
        }
        const user = memory.users.get(userId);
        if (user) {
            user.welcome_email_sent = true;
            user.welcome_email_sent_at = sentAt;
            user.updated_at = sentAt;
        }
    }
    async setUserPhoneHash(userId, phoneHash) {
        if (!userId || !phoneHash)
            return;
        this.requireDatabase('phone hash update');
        const updatedAt = nowIso();
        if (this.ready) {
            try {
                const { error } = await supabase.from('users')
                    .update({ phone_hash: phoneHash, updated_at: updatedAt })
                    .eq('id', userId);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
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
    async mergeWhatsAppAccountIntoUser(fromUserId, targetUserId, phoneHash) {
        if (!fromUserId || !targetUserId || fromUserId === targetUserId)
            return;
        this.requireDatabase('WhatsApp account merge');
        if (this.ready) {
            try {
                const { error: obsErr } = await supabase.from('observations')
                    .update({ owner_user_id: targetUserId })
                    .eq('owner_user_id', fromUserId);
                if (obsErr)
                    throw new Error(obsErr.message);
                const { error: hashObsErr } = await supabase.from('observations')
                    .update({ owner_user_id: targetUserId })
                    .eq('source_user_hash', phoneHash)
                    .is('owner_user_id', null);
                if (hashObsErr)
                    throw new Error(hashObsErr.message);
                const { error: cmtErr } = await supabase.from('observation_comments')
                    .update({ author_user_id: targetUserId })
                    .eq('author_user_id', fromUserId);
                if (cmtErr)
                    throw new Error(cmtErr.message);
                const { error: identErr } = await supabase.from('user_whatsapp_identities')
                    .update({ user_id: targetUserId, updated_at: nowIso() })
                    .eq('user_id', fromUserId);
                if (identErr)
                    throw new Error(identErr.message);
                const { error: delErr } = await supabase.from('users')
                    .delete()
                    .eq('id', fromUserId);
                if (delErr)
                    throw new Error(delErr.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('WhatsApp account merge', err);
            }
        }
        memory.users.delete(fromUserId);
        if (memory.usersByPhoneHash.get(phoneHash) === fromUserId) {
            memory.usersByPhoneHash.set(phoneHash, targetUserId);
        }
        for (const [hash, uid] of memory.identities.entries()) {
            if (uid === fromUserId)
                memory.identities.set(hash, targetUserId);
        }
    }
    async listRecipientUserIds() {
        if (!this.ready) {
            return [...memory.users.values()]
                .filter((user) => !user.is_demo)
                .map((user) => user.id);
        }
        const { data, error } = await supabase.from('users')
            .select('id')
            .eq('is_demo', false)
            .order('created_at', { ascending: true });
        if (error)
            throw this.databaseFailure('notification recipient listing', error);
        return (data ?? []).map((row) => String(row.id)).filter(Boolean);
    }
    /** Test helper: the number of accounts held in the development memory store. */
    get memoryAccountCount() {
        return memory.users.size;
    }
}
export const userRepository = new UserRepository();
