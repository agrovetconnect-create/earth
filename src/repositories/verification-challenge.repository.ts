import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { nowIso } from '../utils/time.js';

export interface VerificationChallengeRecord {
  id: string;
  user_id: string;
  email: string;
  otp_hash: string;
  purpose: 'first_login' | 'inactivity_reauth' | 'security_step_up';
  delivery_mode?: 'app_code' | 'supabase_otp';
  attempts: number;
  max_attempts: number;
  expires_at: string;
  consumed: boolean;
  created_at: string;
}

const memoryChallenges = new Map<string, VerificationChallengeRecord>();

const fastDevAuth = (): boolean =>
  process.env.FAST_DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production';

export class VerificationChallengeRepository {
  private databaseFailure(operation: string, err: unknown): ServiceUnavailableError {
    logger.error('Database operation failed; refusing to fall back to process memory', {
      operation,
      error: err instanceof Error ? err.message : String(err),
    });
    return new ServiceUnavailableError(operation, err);
  }

  /**
   * Creates and persists a verification challenge record.
   */
  async createChallenge(
    data: Omit<VerificationChallengeRecord, 'id' | 'created_at'>
  ): Promise<VerificationChallengeRecord> {
    const id = crypto.randomUUID();
    const created_at = nowIso();

    const record: VerificationChallengeRecord = {
      ...data,
      id,
      created_at,
    };

    memoryChallenges.set(id, record);

    const persist = async (): Promise<void> => {
      const { error } = await (supabase.from('verification_challenges') as any).insert(record);
      if (error) throw new Error(error.message);
    };

    if (fastDevAuth() && isDatabaseConfigured()) {
      void persist().catch((err) => {
        logger.error('Database operation failed; refusing to fall back to process memory', {
          operation: 'verification challenge storage',
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return record;
    }

    if (isDatabaseConfigured()) {
      try {
        await persist();
      } catch (err) {
        throw this.databaseFailure('verification challenge storage', err);
      }
    }

    return record;
  }

  /**
   * Finds an active (unconsumed) challenge by ID.
   */
  async findChallengeById(challengeId: string): Promise<VerificationChallengeRecord | null> {
    if (!challengeId) return null;

    if (fastDevAuth() && memoryChallenges.has(challengeId)) {
      return memoryChallenges.get(challengeId) ?? null;
    }

    if (isDatabaseConfigured()) {
      try {
        const { data, error } = await (supabase.from('verification_challenges') as any)
          .select('*')
          .eq('id', challengeId)
          .maybeSingle();

        if (error) throw new Error(error.message);
        if (data) {
          const record = data as VerificationChallengeRecord;
          memoryChallenges.set(record.id, record);
          return record;
        }
      } catch (err) {
        throw this.databaseFailure('verification challenge lookup', err);
      }
    }

    return memoryChallenges.get(challengeId) ?? null;
  }

  async findActiveChallengeByEmail(email: string): Promise<VerificationChallengeRecord | null> {
    const cleanEmail = email.trim().toLowerCase();
    const now = nowIso();

    if (fastDevAuth()) {
      const cached = Array.from(memoryChallenges.values())
        .filter((record) => record.email.toLowerCase() === cleanEmail && !record.consumed)
        .filter((record) => new Date(record.expires_at).getTime() > Date.now())
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (cached) return cached;
    }

    if (isDatabaseConfigured()) {
      try {
        const { data, error } = await (supabase.from('verification_challenges') as any)
          .select('*')
          .eq('email', cleanEmail)
          .eq('consumed', false)
          .gt('expires_at', now)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw new Error(error.message);
        if (data) {
          const record = data as VerificationChallengeRecord;
          memoryChallenges.set(record.id, record);
          return record;
        }
      } catch (err) {
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
  async updateChallenge(
    challengeId: string,
    updates: Partial<VerificationChallengeRecord>
  ): Promise<void> {
    const existing = memoryChallenges.get(challengeId);
    if (existing) memoryChallenges.set(challengeId, { ...existing, ...updates });

    if (fastDevAuth() && isDatabaseConfigured()) {
      void (async () => {
        try {
          const { error } = await (supabase.from('verification_challenges') as any)
            .update(updates)
            .eq('id', challengeId);
          if (error) throw new Error(error.message);
        } catch (err) {
          logger.error('Database operation failed; refusing to fall back to process memory', {
            operation: 'verification challenge update',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return;
    }

    if (isDatabaseConfigured()) {
      try {
        const { error } = await (supabase.from('verification_challenges') as any)
          .update(updates)
          .eq('id', challengeId);
        if (error) throw new Error(error.message);
      } catch (err) {
        throw this.databaseFailure('verification challenge update', err);
      }
    }

  }

  async consumeChallenge(challengeId: string): Promise<boolean> {
    if (isDatabaseConfigured()) {
      try {
        const { data, error } = await (supabase.from('verification_challenges') as any)
          .update({ consumed: true })
          .eq('id', challengeId)
          .eq('consumed', false)
          .select('id');
        if (error) throw new Error(error.message);
        const existing = memoryChallenges.get(challengeId);
        if (existing) memoryChallenges.set(challengeId, { ...existing, consumed: true });
        return Array.isArray(data) && data.length > 0;
      } catch (err) {
        throw this.databaseFailure('verification challenge consumption', err);
      }
    }

    const existing = memoryChallenges.get(challengeId);
    if (!existing || existing.consumed) return false;
    memoryChallenges.set(challengeId, { ...existing, consumed: true });
    return true;
  }

  /**
   * Returns true when this email has ever had a verification challenge.
   */
  async hasChallengeForEmail(email: string): Promise<boolean> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return false;

    if (fastDevAuth()) {
      for (const record of memoryChallenges.values()) {
        if (record.email.toLowerCase() === cleanEmail) return true;
      }
    }

    if (isDatabaseConfigured()) {
      try {
        const { data, error } = await (supabase.from('verification_challenges') as any)
          .select('id')
          .eq('email', cleanEmail)
          .limit(1);

        if (error) throw new Error(error.message);
        if (Array.isArray(data) && data.length > 0) return true;
      } catch (err) {
        throw this.databaseFailure('verification challenge history lookup', err);
      }
    }

    for (const record of memoryChallenges.values()) {
      if (record.email.toLowerCase() === cleanEmail) return true;
    }

    return false;
  }

  /**
   * Invalidates any active (unconsumed) challenges for an email address.
   */
  async invalidateOutstandingChallenges(email: string): Promise<void> {
    const cleanEmail = email.trim().toLowerCase();

    const persist = async (): Promise<void> => {
      const { error } = await (supabase.from('verification_challenges') as any)
        .update({ consumed: true })
        .eq('email', cleanEmail)
        .eq('consumed', false);
      if (error) throw new Error(error.message);
    };

    if (fastDevAuth() && isDatabaseConfigured()) {
      void persist().catch((err) => {
        logger.error('Database operation failed; refusing to fall back to process memory', {
          operation: 'verification challenge invalidation',
          error: err instanceof Error ? err.message : String(err),
        });
      });
    } else if (isDatabaseConfigured()) {
      try {
        await persist();
      } catch (err) {
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
