import crypto from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { nowIso } from '../utils/time.js';
const memoryChallenges = new Map();
export class VerificationChallengeRepository {
    databaseFailure(operation, err) {
        logger.error('Database operation failed; refusing to fall back to process memory', {
            operation,
            error: err instanceof Error ? err.message : String(err),
        });
        return new ServiceUnavailableError(operation, err);
    }
    /**
     * Creates and persists a verification challenge record.
     */
    async createChallenge(data) {
        const id = crypto.randomUUID();
        const created_at = nowIso();
        const record = {
            ...data,
            id,
            created_at,
        };
        if (isDatabaseConfigured()) {
            try {
                const { error } = await supabase.from('verification_challenges').insert(record);
                if (error)
                    throw new Error(error.message);
            }
            catch (err) {
                throw this.databaseFailure('verification challenge storage', err);
            }
        }
        memoryChallenges.set(id, record);
        return record;
    }
    /**
     * Finds an active (unconsumed) challenge by ID.
     */
    async findChallengeById(challengeId) {
        if (!challengeId)
            return null;
        if (isDatabaseConfigured()) {
            try {
                const { data, error } = await supabase.from('verification_challenges')
                    .select('*')
                    .eq('id', challengeId)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                if (data)
                    return data;
            }
            catch (err) {
                throw this.databaseFailure('verification challenge lookup', err);
            }
        }
        return memoryChallenges.get(challengeId) ?? null;
    }
    async findActiveChallengeByEmail(email) {
        const cleanEmail = email.trim().toLowerCase();
        const now = nowIso();
        if (isDatabaseConfigured()) {
            try {
                const { data, error } = await supabase.from('verification_challenges')
                    .select('*')
                    .eq('email', cleanEmail)
                    .eq('consumed', false)
                    .gt('expires_at', now)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                if (data)
                    return data;
            }
            catch (err) {
                throw this.databaseFailure('active verification challenge lookup', err);
            }
        }
        const candidates = Array.from(memoryChallenges.values())
            .filter((record) => record.email.toLowerCase() === cleanEmail && !record.consumed)
            .filter((record) => new Date(record.expires_at).getTime() > Date.now())
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
        return candidates[0] ?? null;
    }
    /**
     * Updates attempts or consumed status of a challenge.
     */
    async updateChallenge(challengeId, updates) {
        if (isDatabaseConfigured()) {
            try {
                const { error } = await supabase.from('verification_challenges')
                    .update(updates)
                    .eq('id', challengeId);
                if (error)
                    throw new Error(error.message);
            }
            catch (err) {
                throw this.databaseFailure('verification challenge update', err);
            }
        }
        const existing = memoryChallenges.get(challengeId);
        if (!existing)
            return;
        memoryChallenges.set(challengeId, { ...existing, ...updates });
    }
    async consumeChallenge(challengeId) {
        if (isDatabaseConfigured()) {
            try {
                const { data, error } = await supabase.from('verification_challenges')
                    .update({ consumed: true })
                    .eq('id', challengeId)
                    .eq('consumed', false)
                    .select('id');
                if (error)
                    throw new Error(error.message);
                const existing = memoryChallenges.get(challengeId);
                if (existing)
                    memoryChallenges.set(challengeId, { ...existing, consumed: true });
                return Array.isArray(data) && data.length > 0;
            }
            catch (err) {
                throw this.databaseFailure('verification challenge consumption', err);
            }
        }
        const existing = memoryChallenges.get(challengeId);
        if (!existing || existing.consumed)
            return false;
        memoryChallenges.set(challengeId, { ...existing, consumed: true });
        return true;
    }
    /**
     * Returns true when this email has ever had a verification challenge.
     */
    async hasChallengeForEmail(email) {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail)
            return false;
        if (isDatabaseConfigured()) {
            try {
                const { data, error } = await supabase.from('verification_challenges')
                    .select('id')
                    .eq('email', cleanEmail)
                    .limit(1);
                if (error)
                    throw new Error(error.message);
                if (Array.isArray(data) && data.length > 0)
                    return true;
            }
            catch (err) {
                throw this.databaseFailure('verification challenge history lookup', err);
            }
        }
        for (const record of memoryChallenges.values()) {
            if (record.email.toLowerCase() === cleanEmail)
                return true;
        }
        return false;
    }
    /**
     * Invalidates any active (unconsumed) challenges for an email address.
     */
    async invalidateOutstandingChallenges(email) {
        const cleanEmail = email.trim().toLowerCase();
        if (isDatabaseConfigured()) {
            try {
                const { error } = await supabase.from('verification_challenges')
                    .update({ consumed: true })
                    .eq('email', cleanEmail)
                    .eq('consumed', false);
                if (error)
                    throw new Error(error.message);
            }
            catch (err) {
                throw this.databaseFailure('verification challenge invalidation', err);
            }
        }
        for (const [id, record] of memoryChallenges.entries()) {
            if (record.email.toLowerCase() === cleanEmail && !record.consumed) {
                memoryChallenges.set(id, { ...record, consumed: true });
            }
        }
    }
}
export const verificationChallengeRepository = new VerificationChallengeRepository();
