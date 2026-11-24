import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
/** Backoff between retries: base * 2^(attempt-1), capped. */
export function backoffDelayMs(attempt, baseMs = 5_000, maxMs = 15 * 60_000) {
    const exp = Math.max(1, attempt);
    return Math.min(maxMs, baseMs * 2 ** (exp - 1));
}
/**
 * Per-message processing claims with a persistent, multi-instance-safe backend.
 *
 * This repository is the authority for "is this message being, or has it been,
 * processed?". When a database is configured the claim lives in
 * `webhook_message_claims` and is acquired through a row-locked SQL function, so
 * two workers on two instances can never both process the same message. A
 * database failure throws `ServiceUnavailableError`; it is never read as "no
 * claim exists", because that would let an outage duplicate an observation.
 *
 * Without a database a process-local adapter stands in for development and
 * isolated tests. It is explicitly labelled `durable = false` so no caller can
 * mistake it for the production guarantee.
 */
export class WebhookClaimRepository {
    /**
     * True when claims survive a restart and are shared across instances.
     *
     * Derived from the live configuration, not cached at construction, so the
     * process-local adapter is never mistaken for the production guarantee.
     */
    get durable() {
        return isDatabaseConfigured();
    }
    /** Development/test adapter only. Never shared across processes. */
    memory = new Map();
    get databaseReady() {
        return isDatabaseConfigured();
    }
    unavailable(operation, err) {
        logger.error('Webhook claim database operation failed', {
            operation,
            error: err instanceof Error ? err.message : String(err),
        });
        throw new ServiceUnavailableError(operation, err);
    }
    /**
     * Acquires the claim for a message, or reports it is already held/finished.
     *
     * Returns 'claimed' when the caller owns the message and should process it,
     * 'duplicate' when another worker holds it or it has reached a terminal state.
     */
    async claim(messageId) {
        if (this.databaseReady) {
            try {
                const { data, error } = await supabase.rpc('claim_webhook_message', {
                    p_message_id: messageId,
                });
                if (error)
                    throw new Error(error.message);
                return data === 'claimed' ? 'claimed' : 'duplicate';
            }
            catch (err) {
                this.unavailable('webhook message claim', err);
            }
        }
        const existing = this.memory.get(messageId);
        if (!existing) {
            this.memory.set(messageId, {
                status: 'processing',
                attempts: 1,
                lastError: null,
                nextAttemptAt: Date.now(),
                lockedAt: Date.now(),
            });
            return 'claimed';
        }
        if (existing.status === 'processing' || existing.status === 'completed' || existing.status === 'terminal_failure') {
            return 'duplicate';
        }
        existing.status = 'processing';
        existing.attempts += 1;
        existing.lockedAt = Date.now();
        return 'claimed';
    }
    /** Marks a claim as terminally successful. */
    async markCompleted(messageId) {
        if (this.databaseReady) {
            try {
                const { error } = await supabase.from('webhook_message_claims')
                    .update({ status: 'completed', locked_at: null, updated_at: new Date().toISOString() })
                    .eq('message_id', messageId);
                if (error)
                    throw new Error(error.message);
            }
            catch (err) {
                this.unavailable('webhook message completion', err);
            }
            return;
        }
        const record = this.memory.get(messageId);
        if (record) {
            record.status = 'completed';
            record.lockedAt = null;
        }
    }
    /**
     * Records a transient failure. The claim stays retryable and becomes eligible
     * again after the backoff, so a redelivery or a recovery sweep can retry it.
     */
    async markRetryable(messageId, error) {
        const current = await this.get(messageId);
        const attempt = current?.attempts ?? 1;
        const nextAttemptAt = new Date(Date.now() + backoffDelayMs(attempt)).toISOString();
        if (this.databaseReady) {
            try {
                const { error: dbError } = await supabase.from('webhook_message_claims')
                    .update({
                    status: 'retryable_failure',
                    last_error: error.slice(0, 1000),
                    next_attempt_at: nextAttemptAt,
                    locked_at: null,
                    updated_at: new Date().toISOString(),
                })
                    .eq('message_id', messageId);
                if (dbError)
                    throw new Error(dbError.message);
            }
            catch (err) {
                this.unavailable('webhook message retryable marking', err);
            }
            return;
        }
        const record = this.memory.get(messageId);
        if (record) {
            record.status = 'retryable_failure';
            record.lastError = error;
            record.nextAttemptAt = Date.now() + backoffDelayMs(record.attempts);
            record.lockedAt = null;
        }
    }
    /**
     * Records a permanent failure. The message is never processed again: an
     * invalid image or a rate-limited request must not trigger endless rework.
     */
    async markTerminal(messageId, error) {
        if (this.databaseReady) {
            try {
                const { error: dbError } = await supabase.from('webhook_message_claims')
                    .update({
                    status: 'terminal_failure',
                    last_error: error.slice(0, 1000),
                    locked_at: null,
                    updated_at: new Date().toISOString(),
                })
                    .eq('message_id', messageId);
                if (dbError)
                    throw new Error(dbError.message);
            }
            catch (err) {
                this.unavailable('webhook message terminal marking', err);
            }
            return;
        }
        const record = this.memory.get(messageId);
        if (record) {
            record.status = 'terminal_failure';
            record.lastError = error;
            record.lockedAt = null;
        }
    }
    /** Reads a claim, for tests and operator diagnostics. */
    async get(messageId) {
        if (this.databaseReady) {
            const { data, error } = await supabase.from('webhook_message_claims')
                .select('*')
                .eq('message_id', messageId)
                .maybeSingle();
            if (error)
                this.unavailable('webhook claim lookup', error);
            return data ?? null;
        }
        const record = this.memory.get(messageId);
        if (!record)
            return null;
        return {
            message_id: messageId,
            status: record.status,
            attempts: record.attempts,
            last_error: record.lastError,
            next_attempt_at: new Date(record.nextAttemptAt).toISOString(),
            locked_at: record.lockedAt ? new Date(record.lockedAt).toISOString() : null,
        };
    }
    /**
     * Returns claims abandoned by a crashed worker to the retryable pool.
     *
     * A claim that has been `processing` for longer than the stale window cannot
     * belong to a live worker, so it is recovered. Idempotent and safe to run on
     * every instance at startup.
     */
    async recoverStale(staleSeconds = 300) {
        if (this.databaseReady) {
            try {
                const { data, error } = await supabase.rpc('recover_stale_webhook_claims', {
                    p_stale_seconds: staleSeconds,
                });
                if (error)
                    throw new Error(error.message);
                return typeof data === 'number' ? data : 0;
            }
            catch (err) {
                this.unavailable('webhook claim recovery', err);
            }
        }
        const cutoff = Date.now() - staleSeconds * 1000;
        let recovered = 0;
        for (const [, record] of this.memory) {
            if (record.status === 'processing' && record.lockedAt !== null && record.lockedAt < cutoff) {
                record.status = 'retryable_failure';
                record.lastError = 'recovered: worker lock expired (likely crash)';
                record.nextAttemptAt = Date.now();
                record.lockedAt = null;
                recovered++;
            }
        }
        return recovered;
    }
    /** Test helper: clear the development adapter. */
    resetMemory() {
        this.memory.clear();
    }
}
export const webhookClaimRepository = new WebhookClaimRepository();
