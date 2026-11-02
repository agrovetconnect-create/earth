import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { nowIso } from '../utils/time.js';

export interface VerificationChallengeRecord {
  id: string;
  user_id: string;
  email: string;
  otp_hash: string;
  purpose: 'first_login' | 'inactivity_reauth' | 'security_step_up';
  attempts: number;
  max_attempts: number;
  expires_at: string;
  consumed: boolean;
  created_at: string;
}

const memoryChallenges = new Map<string, VerificationChallengeRecord>();

export class VerificationChallengeRepository {
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

    if (isDatabaseConfigured()) {
      try {
        const { error } = await (supabase.from('verification_challenges') as any).insert(record);
        if (error) {
          logger.error('Failed to save verification challenge to database', { error: error.message });
        }
      } catch (err) {
        logger.error('Database error saving verification challenge', { error: String(err) });
      }
    }

    memoryChallenges.set(id, record);
    return record;
  }

  /**
   * Finds an active (unconsumed) challenge by ID.
   */
  async findChallengeById(challengeId: string): Promise<VerificationChallengeRecord | null> {
    if (!challengeId) return null;

    if (isDatabaseConfigured()) {
      try {
        const { data, error } = await (supabase.from('verification_challenges') as any)
          .select('*')
          .eq('id', challengeId)
          .maybeSingle();

        if (!error && data) {
          return data as VerificationChallengeRecord;
        }
      } catch (err) {
        logger.error('Database error fetching verification challenge', { challengeId, error: String(err) });
      }
    }

    return memoryChallenges.get(challengeId) ?? null;
  }

  /**
   * Updates attempts or consumed status of a challenge.
   */
  async updateChallenge(
    challengeId: string,
    updates: Partial<VerificationChallengeRecord>
  ): Promise<void> {
    const existing = await this.findChallengeById(challengeId);
    if (!existing) return;

    const updated = { ...existing, ...updates };

    if (isDatabaseConfigured()) {
      try {
        await (supabase.from('verification_challenges') as any)
          .update(updates)
          .eq('id', challengeId);
      } catch (err) {
        logger.error('Failed to update verification challenge in database', { challengeId, error: String(err) });
      }
    }

    memoryChallenges.set(challengeId, updated);
  }

  /**
   * Invalidates any active (unconsumed) challenges for an email address.
   */
  async invalidateOutstandingChallenges(email: string): Promise<void> {
    const cleanEmail = email.trim().toLowerCase();

    if (isDatabaseConfigured()) {
      try {
        await (supabase.from('verification_challenges') as any)
          .update({ consumed: true })
          .eq('email', cleanEmail)
          .eq('consumed', false);
      } catch (err) {
        logger.error('Failed to invalidate outstanding challenges in database', { email: cleanEmail, error: String(err) });
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
