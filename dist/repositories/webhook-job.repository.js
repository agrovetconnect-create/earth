import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { backoffDelayMs } from './webhook-claim.repository.js';
/** Default attempts before a job is declared terminally failed. */
export const DEFAULT_MAX_ATTEMPTS = 6;
export class WebhookJobRepository {
    /**
     * True when the queue survives a restart and is shared across instances.
     *
     * Derived from the live configuration rather than cached at construction: the
     * process-local adapter is only a development stand-in, and reporting it as
     * durable would let a deployment believe events are safe when they are not.
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
        logger.error('Webhook job database operation failed', {
            operation,
            error: err instanceof Error ? err.message : String(err),
        });
        throw new ServiceUnavailableError(operation, err);
    }
    /**
     * Durably records an inbound event.
     *
     * Returns 'duplicate' when the provider message id already has a job, so a
     * Meta redelivery cannot enqueue the same work twice.
     */
    async enqueue(input) {
        if (this.databaseReady) {
            try {
                const { error } = await supabase.from('webhook_jobs').insert({
                    provider_message_id: input.providerMessageId,
                    job_type: input.jobType,
                    payload: input.payload,
                    status: 'queued',
                    max_attempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
                });
                if (error) {
                    if (error.code === '23505')
                        return 'duplicate';
                    throw new Error(error.message);
                }
                return 'enqueued';
            }
            catch (err) {
                this.unavailable('webhook job enqueue', err);
            }
        }
        if (this.memory.has(input.providerMessageId))
            return 'duplicate';
        const now = new Date().toISOString();
        const job = {
            id: `mem-${input.providerMessageId}`,
            provider_message_id: input.providerMessageId,
            job_type: input.jobType,
            payload: input.payload,
            status: 'queued',
            attempts: 0,
            max_attempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
            next_attempt_at: now,
            locked_at: null,
            locked_by: null,
            last_error: null,
            created_at: now,
            updated_at: now,
            notBefore: Date.now(),
        };
        this.memory.set(input.providerMessageId, job);
        return 'enqueued';
    }
    /**
     * Claims the oldest due job, atomically.
     *
     * Returns null when nothing is due. Two workers never receive the same job,
     * even across instances, because the claim is a single row-locked update.
     */
    async claimNext(workerId) {
        if (this.databaseReady) {
            try {
                const { data, error } = await supabase.rpc('claim_webhook_job', {
                    p_worker_id: workerId,
                });
                if (error)
                    throw new Error(error.message);
                const rows = Array.isArray(data) ? data : data ? [data] : [];
                return rows[0] ?? null;
            }
            catch (err) {
                this.unavailable('webhook job claim', err);
            }
        }
        const now = Date.now();
        let picked = null;
        for (const job of this.memory.values()) {
            if ((job.status === 'queued' || job.status === 'retryable_failure') && job.notBefore <= now) {
                if (!picked || job.notBefore < picked.notBefore)
                    picked = job;
            }
        }
        if (!picked)
            return null;
        picked.status = 'processing';
        picked.attempts += 1;
        picked.locked_at = new Date().toISOString();
        picked.locked_by = workerId;
        picked.updated_at = new Date().toISOString();
        return this.strip(picked);
    }
    /** Marks a job completed. */
    async markCompleted(jobId) {
        if (this.databaseReady) {
            try {
                const { error } = await supabase.from('webhook_jobs')
                    .update({ status: 'completed', locked_at: null, locked_by: null, updated_at: new Date().toISOString() })
                    .eq('id', jobId);
                if (error)
                    throw new Error(error.message);
            }
            catch (err) {
                this.unavailable('webhook job completion', err);
            }
            return;
        }
        const job = this.findById(jobId);
        if (job) {
            job.status = 'completed';
            job.locked_at = null;
            job.locked_by = null;
        }
    }
    /**
     * Records a transient failure and schedules a bounded-backoff retry.
     *
     * When attempts reach max_attempts the job is marked terminal instead, so a
     * permanently failing job cannot be retried forever.
     */
    async markRetryable(jobId, error, attempt) {
        const nextAttemptAt = new Date(Date.now() + backoffDelayMs(attempt)).toISOString();
        const job = this.databaseReady ? null : this.findById(jobId);
        // Honour the per-job attempt budget. In the database path the budget lives on
        // the row (it is set at enqueue time), so it is read rather than assumed to
        // be the default: otherwise a job enqueued with a custom budget would be
        // retired too early or retried too long.
        let currentAttempt = job ? job.attempts : attempt;
        let max = job ? job.max_attempts : DEFAULT_MAX_ATTEMPTS;
        if (this.databaseReady) {
            try {
                const { data, error: readError } = await supabase.from('webhook_jobs')
                    .select('attempts, max_attempts')
                    .eq('id', jobId)
                    .maybeSingle();
                if (readError)
                    throw new Error(readError.message);
                if (data) {
                    if (typeof data.attempts === 'number')
                        currentAttempt = data.attempts;
                    if (typeof data.max_attempts === 'number')
                        max = data.max_attempts;
                }
            }
            catch (err) {
                this.unavailable('webhook job attempt budget read', err);
            }
        }
        if (currentAttempt >= max) {
            await this.markTerminal(jobId, `attempts exhausted (${currentAttempt}/${max}): ${error}`);
            return 'terminal';
        }
        if (this.databaseReady) {
            try {
                const { error: dbError } = await supabase.from('webhook_jobs')
                    .update({
                    status: 'retryable_failure',
                    last_error: error.slice(0, 1000),
                    next_attempt_at: nextAttemptAt,
                    locked_at: null,
                    locked_by: null,
                    updated_at: new Date().toISOString(),
                })
                    .eq('id', jobId);
                if (dbError)
                    throw new Error(dbError.message);
            }
            catch (err) {
                this.unavailable('webhook job retryable marking', err);
            }
            return 'retry';
        }
        if (job) {
            job.status = 'retryable_failure';
            job.last_error = error;
            job.next_attempt_at = nextAttemptAt;
            job.notBefore = Date.now() + backoffDelayMs(attempt);
            job.locked_at = null;
            job.locked_by = null;
        }
        return 'retry';
    }
    /** Records a permanent failure. The job is never retried. */
    async markTerminal(jobId, error) {
        if (this.databaseReady) {
            try {
                const { error: dbError } = await supabase.from('webhook_jobs')
                    .update({
                    status: 'terminal_failure',
                    last_error: error.slice(0, 1000),
                    locked_at: null,
                    locked_by: null,
                    updated_at: new Date().toISOString(),
                })
                    .eq('id', jobId);
                if (dbError)
                    throw new Error(dbError.message);
            }
            catch (err) {
                this.unavailable('webhook job terminal marking', err);
            }
            return;
        }
        const job = this.findById(jobId);
        if (job) {
            job.status = 'terminal_failure';
            job.last_error = error;
            job.locked_at = null;
            job.locked_by = null;
        }
    }
    /** Returns abandoned jobs to the queue. Safe on every instance at startup. */
    async recoverStale(staleSeconds = 300) {
        if (this.databaseReady) {
            try {
                const { data, error } = await supabase.rpc('recover_stale_webhook_jobs', {
                    p_stale_seconds: staleSeconds,
                });
                if (error)
                    throw new Error(error.message);
                return typeof data === 'number' ? data : 0;
            }
            catch (err) {
                this.unavailable('webhook job recovery', err);
            }
        }
        const cutoff = Date.now() - staleSeconds * 1000;
        let recovered = 0;
        for (const job of this.memory.values()) {
            if (job.status === 'processing' && job.locked_at && Date.parse(job.locked_at) < cutoff) {
                job.status = 'retryable_failure';
                job.last_error = job.last_error ?? 'recovered: worker lock expired (likely crash)';
                job.notBefore = Date.now();
                job.locked_at = null;
                job.locked_by = null;
                recovered++;
            }
        }
        return recovered;
    }
    /** Operator visibility: job counts by status. */
    async stats() {
        if (this.databaseReady) {
            const { data, error } = await supabase.rpc('webhook_job_stats');
            if (error)
                this.unavailable('webhook job stats', error);
            return (data ?? []);
        }
        const counts = new Map();
        for (const job of this.memory.values()) {
            counts.set(job.status, (counts.get(job.status) ?? 0) + 1);
        }
        return Array.from(counts.entries()).map(([status, job_count]) => ({ status, job_count }));
    }
    /** Lists jobs in a given status, for operator dashboards. */
    async listByStatus(status) {
        if (this.databaseReady) {
            const { data, error } = await supabase.from('webhook_jobs')
                .select('*')
                .eq('status', status)
                .order('created_at', { ascending: true });
            if (error)
                this.unavailable('webhook job list', error);
            return (data ?? []);
        }
        return Array.from(this.memory.values())
            .filter((job) => job.status === status)
            .map((job) => this.strip(job));
    }
    /** Test helper: clear the development adapter. */
    resetMemory() {
        this.memory.clear();
    }
    findById(jobId) {
        for (const job of this.memory.values()) {
            if (job.id === jobId)
                return job;
        }
        return undefined;
    }
    strip(job) {
        const { notBefore: _notBefore, ...rest } = job;
        return rest;
    }
}
export const webhookJobRepository = new WebhookJobRepository();
