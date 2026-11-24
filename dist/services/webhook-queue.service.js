import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';
import { geminiService } from './gemini.service.js';
import { whatsappMediaService } from './whatsapp-media.service.js';
import { whatsappService } from './whatsapp.service.js';
import { GeologicalAnalysisError } from '../ai/geological.types.js';
import { geoscienceAnalysisService, classifyPipelineError, USER_FACING_MESSAGES, } from './geoscience-analysis.service.js';
import { communityCommandService } from './community-commands.service.js';
import { checkDurableQueueReadiness, REQUIRED_QUEUE_FUNCTIONS, REQUIRED_QUEUE_TABLES, } from './webhook-queue-readiness.js';
import { webhookJobRepository } from '../repositories/webhook-job.repository.js';
import { webhookClaimRepository } from '../repositories/webhook-claim.repository.js';
import { buildUnsupportedInputWarning, detectOffTopicText, EARTH_TALK_GOAL, EARTH_TALK_MISSION, SUPPORTED_EVIDENCE_STATE_SUMMARY, SUPPORTED_OBSERVED_SUMMARY, SUPPORTED_ROCK_TYPE_SUMMARY, } from '../ai/domain-scope.js';
/**
 * Polls between periodic recovery sweeps. At the default 1.5s cadence this is
 * roughly one sweep a minute.
 */
const RECOVERY_SWEEP_TICKS = 40;
export const RESPONSES = {
    START: `🪨 Welcome to Earth Talk!

🌍 Mission: ${EARTH_TALK_MISSION}
🎯 Goal: ${EARTH_TALK_GOAL}

What we support (our core focus & filters):
• What was observed: ${SUPPORTED_OBSERVED_SUMMARY}
• Rock type: ${SUPPORTED_ROCK_TYPE_SUMMARY}
• Evidence state: ${SUPPORTED_EVIDENCE_STATE_SUMMARY}

⚠️ Note: Unrelated everyday items (such as shoes, clothes, food, selfies, or household objects) are not supported and will not create a Geoscience Passport.

Send a clear daylight photo or short video of a geological feature, or type HELP to see commands.`,
    HELP: `🪨 EARTH TALK HELP

Earth Talk supports only Earth-science & geological observations:
• What was observed: Geological layers, rocks, landforms, fossils, minerals, structures (bedding, faults, folds, veins), volcanic features, springs/seeps, and slope exposures
• Rock type: Igneous, Sedimentary, Metamorphic, Unclassified
• Evidence state: AI-assisted preliminary reading → Community supported / investigated → Expert reviewed

You can:
📸 Send a photo of a supported geological feature
🎥 Send a short outcrop/specimen video
📍 Share a location pin first, then send the photo or video
💬 Use COMMUNITYHELP, SITES, INVESTIGATE, or ASK for geological discussions

⚠️ Unrelated items (shoes, clothes, food, selfies, or off-topic tests) are not supported.

Type START to begin.`,
    UNKNOWN: `🪨 I'm Earth Talk — focused strictly on Earth-science observations.

🌍 Mission: Discover Earth. Together. Document, explore, and learn from real geological observations with scientific honesty.

We support:
• What was observed: Geological layers, rocks, landforms, fossils, minerals, structures, volcanic/water/slope features
• Rock type: Igneous, Sedimentary, Metamorphic, Unclassified
• Evidence state: Preliminary AI reading, Community evidence, and Expert review

⚠️ Non-geoscience submissions (e.g., shoes, clothes, everyday objects, or unrelated messages) are not supported. Send a geological photo/short video or type HELP.`,
};
function isGreeting(normalized) {
    const words = ['start', 'hello', 'hi', 'hey', 'yo', 'greetings', 'muraho', 'habari'];
    if (words.includes(normalized))
        return true;
    return /^(hey|hello|hi|muraho|habari)\b/i.test(normalized);
}
async function determineTextResponse(body) {
    const normalized = (body || '').trim().toLowerCase();
    if (isGreeting(normalized))
        return RESPONSES.START;
    if (normalized === 'help')
        return RESPONSES.HELP;
    const offTopic = detectOffTopicText(body);
    if (offTopic.isOffTopic) {
        return buildUnsupportedInputWarning({
            channel: 'whatsapp',
            inputKind: 'text',
            detectedSubject: offTopic.detectedTopic,
        });
    }
    try {
        const aiAnswer = await geminiService.answerGeoscienceQuestion(body);
        if (aiAnswer && !aiAnswer.startsWith('⚠️ Unsupported')) {
            return aiAnswer;
        }
    }
    catch (err) {
        logger.debug('Direct Gemini Q&A failed for WhatsApp text, falling back to unknown response', { error: err });
    }
    return RESPONSES.UNKNOWN;
}
/**
 * The durable inbound-event queue.
 *
 * `acceptInbound` normalizes a Meta webhook payload into jobs and persists each
 * one *before* the controller acknowledges Meta. `start` runs the worker that
 * drains the queue: it claims one job at a time, dispatches it, and records the
 * outcome so a crash mid-job is retried rather than lost.
 *
 * The worker is safe to run on multiple instances: job and message claims are
 * atomic. On startup, `recover` returns jobs and claims abandoned by a crashed
 * worker to the retryable pool.
 */
export class WebhookQueueService {
    jobs;
    claims;
    timer = null;
    readinessRetryTimer = null;
    running = false;
    started = false;
    tickCount = 0;
    workerId = `webhook-worker-${process.pid}-${randomUUID().slice(0, 8)}`;
    constructor(jobs = webhookJobRepository, claims = webhookClaimRepository) {
        this.jobs = jobs;
        this.claims = claims;
    }
    get isDurable() {
        return this.jobs.durable;
    }
    /**
     * Persists every inbound message as a durable job.
     *
     * Throws when the queue itself cannot be written: the caller must then refuse
     * to acknowledge Meta, so Meta retries until the event is safely queued.
     */
    async acceptInbound(payload) {
        const summary = { accepted: 0, duplicates: 0, statuses: 0 };
        const entries = payload.entry || [];
        for (const entry of entries) {
            for (const change of entry.changes || []) {
                const value = change.value;
                if (!value)
                    continue;
                for (const message of value.messages || []) {
                    const enqueued = await this.enqueueMessage(message);
                    if (enqueued)
                        summary.accepted++;
                    else if (enqueued === false)
                        summary.duplicates++;
                }
                if (value.statuses)
                    summary.statuses += value.statuses.length;
            }
        }
        return summary;
    }
    /**
     * Builds and persists the job for one message.
     *
     * Returns true when new work was queued, false when it was a duplicate, and
     * throws if the queue could not be written.
     */
    async enqueueMessage(message) {
        const built = this.buildJob(message);
        if (!built)
            return false;
        const result = await this.jobs.enqueue(built);
        if (result === 'duplicate') {
            logger.info('Duplicate inbound message ignored at enqueue', { messageId: message.id });
            return false;
        }
        return true;
    }
    buildJob(message) {
        if (!message.id || !message.from) {
            logger.warn('Skipping malformed inbound message without id or sender');
            return null;
        }
        if (message.type === 'image' || message.type === 'video') {
            const media = message.type === 'image' ? message.image : message.video;
            if (media?.id) {
                const payload = {
                    senderPhoneNumber: message.from,
                    messageId: message.id,
                    mediaId: media.id,
                    declaredMimeType: media.mime_type,
                    caption: media.caption,
                };
                return { providerMessageId: message.id, jobType: 'media', payload };
            }
            // A media message without an id cannot be downloaded, and re-trying will
            // not change that: reply once through the unsupported path.
            const payload = {
                senderPhoneNumber: message.from,
                reply: USER_FACING_MESSAGES.INSUFFICIENT_IMAGE,
            };
            return { providerMessageId: message.id, jobType: 'unsupported', payload };
        }
        if (message.type === 'audio') {
            if (message.audio?.id) {
                const payload = {
                    senderPhoneNumber: message.from,
                    mediaId: message.audio.id,
                    declaredMimeType: message.audio.mime_type,
                };
                return { providerMessageId: message.id, jobType: 'audio', payload };
            }
            const payload = {
                senderPhoneNumber: message.from,
                reply: USER_FACING_MESSAGES.AI_UNAVAILABLE,
            };
            return { providerMessageId: message.id, jobType: 'unsupported', payload };
        }
        if (message.type === 'location' && message.location) {
            const { latitude, longitude, name, address } = message.location;
            if (typeof latitude === 'number' && typeof longitude === 'number') {
                const payload = {
                    senderPhoneNumber: message.from,
                    latitude,
                    longitude,
                    name,
                    address,
                };
                return { providerMessageId: message.id, jobType: 'location', payload };
            }
            const payload = {
                senderPhoneNumber: message.from,
                reply: USER_FACING_MESSAGES.INVALID_LOCATION,
            };
            return { providerMessageId: message.id, jobType: 'unsupported', payload };
        }
        if (message.type === 'text') {
            const payload = {
                senderPhoneNumber: message.from,
                body: message.text?.body ?? '',
            };
            return { providerMessageId: message.id, jobType: 'text', payload };
        }
        const payload = {
            senderPhoneNumber: message.from,
            reply: RESPONSES.UNKNOWN,
        };
        return { providerMessageId: message.id, jobType: 'unsupported', payload };
    }
    /**
     * Processes at most one job. Exposed for tests and for a worker that prefers
     * to drive the loop itself.
     */
    async processOnce() {
        const job = await this.jobs.claimNext(this.workerId);
        if (!job)
            return 'idle';
        let outcome;
        try {
            outcome = await this.dispatch(job);
        }
        catch (err) {
            outcome = { state: 'retryable', error: err instanceof Error ? err.message : 'dispatch_error' };
        }
        if (outcome.state === 'completed' || outcome.state === 'duplicate') {
            await this.jobs.markCompleted(job.id);
            return 'completed';
        }
        if (outcome.state === 'terminal') {
            await this.jobs.markTerminal(job.id, outcome.error);
            return 'terminal';
        }
        const retryResult = await this.jobs.markRetryable(job.id, outcome.error, job.attempts);
        if (retryResult === 'terminal') {
            await this.notifyExhausted(job, outcome.error);
            return 'terminal';
        }
        return 'retry';
    }
    async dispatch(job) {
        switch (job.job_type) {
            case 'media':
                return geoscienceAnalysisService.processRockImage(job.payload);
            case 'audio':
                return this.handleAudio(job.payload);
            case 'location':
                return this.handleLocation(job.payload);
            case 'text':
                return this.handleText(job.payload);
            case 'unsupported':
                return this.handleUnsupported(job.payload);
            default:
                return { state: 'terminal', error: `unknown_job_type:${job.job_type}` };
        }
    }
    async handleAudio(payload) {
        try {
            const media = await whatsappMediaService.downloadMedia(payload.mediaId);
            if (media.buffer.length === 0) {
                throw new GeologicalAnalysisError('MEDIA_VALIDATION_ERROR', 'empty audio note');
            }
            const voice = await geminiService.transcribeAndAnswerVoiceNote(media.buffer.toString('base64'), media.mimeType || payload.declaredMimeType || 'audio/ogg; codecs=opus', null);
            await whatsappService.sendTextMessageStrict(payload.senderPhoneNumber, voice.reply);
            return { state: 'completed' };
        }
        catch (err) {
            const classified = classifyPipelineError(err);
            logger.error('Audio job failed', { error: classified.error });
            if (classified.state === 'terminal') {
                const reply = err instanceof GeologicalAnalysisError && err.category === 'MEDIA_VALIDATION_ERROR'
                    ? err.message
                    : USER_FACING_MESSAGES.AI_UNAVAILABLE;
                try {
                    await whatsappService.sendTextMessageStrict(payload.senderPhoneNumber, reply);
                }
                catch {
                    return { state: 'retryable', error: 'reply_delivery_failed' };
                }
            }
            return classified;
        }
    }
    async handleLocation(payload) {
        try {
            await geoscienceAnalysisService.recordSharedLocation(payload);
            return { state: 'completed' };
        }
        catch (err) {
            const classified = classifyPipelineError(err);
            logger.error('Location job failed', { error: classified.error });
            return classified;
        }
    }
    async handleText(payload) {
        try {
            const handled = await communityCommandService.handleTextMessage(payload.senderPhoneNumber, payload.body);
            if (handled)
                return { state: 'completed' };
            const replyText = await determineTextResponse(payload.body);
            await whatsappService.sendTextMessageStrict(payload.senderPhoneNumber, replyText);
            return { state: 'completed' };
        }
        catch (err) {
            const classified = classifyPipelineError(err);
            logger.error('Text job failed', { error: classified.error });
            return classified;
        }
    }
    async handleUnsupported(payload) {
        try {
            await whatsappService.sendTextMessageStrict(payload.senderPhoneNumber, payload.reply);
            return { state: 'completed' };
        }
        catch (err) {
            const classified = classifyPipelineError(err);
            logger.error('Unsupported-message job failed', { error: classified.error });
            return classified;
        }
    }
    /**
     * When a job exhausts its attempts, the sender is told once. Until then a
     * transient failure is silent to the user, because it will be retried.
     */
    async notifyExhausted(job, error) {
        const phone = job.payload.senderPhoneNumber;
        logger.error('Webhook job exhausted its attempts', {
            jobId: job.id,
            jobType: job.job_type,
            attempts: job.attempts,
            error,
        });
        if (!phone)
            return;
        try {
            await whatsappService.sendTextMessage(phone, USER_FACING_MESSAGES.AI_UNAVAILABLE);
        }
        catch {
            // The user-facing apology is best-effort; failing to send it must not
            // resurrect a job that already reached a terminal state.
        }
    }
    /**
     * Verifies the queue, recovers work abandoned by a crashed worker, then starts
     * the polling loop.
     *
     * When a database is configured the queue is only reported as enabled after
     * the tables and claim functions have been confirmed reachable; otherwise the
     * exact blocker is logged and the check is retried, rather than the worker
     * pretending to be durable and failing on every tick. Idempotent: safe to call
     * on every instance at startup.
     */
    async start(intervalMs = 1_500) {
        if (this.started)
            return;
        this.started = true;
        await this.bootstrap(intervalMs);
    }
    async bootstrap(intervalMs) {
        if (!this.started)
            return;
        if (this.isDurable) {
            const readiness = await checkDurableQueueReadiness();
            if (!readiness.ready) {
                const retryMs = Math.max(intervalMs, 15_000);
                logger.error('Durable webhook queue NOT enabled', {
                    blocker: readiness.blocker,
                    retryInMs: retryMs,
                });
                this.scheduleReadinessRetry(intervalMs, retryMs);
                return;
            }
            logger.info('Durable webhook queue enabled', {
                tables: [...REQUIRED_QUEUE_TABLES],
                functions: [...REQUIRED_QUEUE_FUNCTIONS],
            });
        }
        else {
            logger.warn('WhatsApp webhook events are held in a process-local queue and are NOT durable. ' +
                'Migration 028 defines the durable queue schema, but no usable database is configured, so the in-memory queue is in use. ' +
                'Do not rely on webhook processing guarantees on this deployment.');
        }
        await this.recoverStaleWork();
        logger.info('Webhook queue worker started', {
            workerId: this.workerId,
            durable: this.isDurable,
            intervalMs,
        });
        this.schedule(intervalMs);
    }
    scheduleReadinessRetry(intervalMs, delayMs) {
        this.readinessRetryTimer = setTimeout(() => {
            void this.bootstrap(intervalMs);
        }, delayMs);
        if (typeof this.readinessRetryTimer === 'object' &&
            this.readinessRetryTimer &&
            'unref' in this.readinessRetryTimer) {
            this.readinessRetryTimer.unref();
        }
    }
    /**
     * Returns work abandoned by a crashed worker to the retryable pool.
     *
     * Runs at startup and then periodically, so a worker that dies while others
     * stay up does not strand its jobs/claims indefinitely.
     */
    async recoverStaleWork() {
        const recoveredJobs = await this.jobs.recoverStale().catch((err) => {
            logger.error('Webhook job recovery failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            return 0;
        });
        const recoveredClaims = await this.claims.recoverStale().catch((err) => {
            logger.error('Webhook claim recovery failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            return 0;
        });
        if (recoveredJobs || recoveredClaims) {
            logger.info('Recovered stale webhook work', { recoveredJobs, recoveredClaims });
        }
    }
    /** Stops the polling loop. In-flight jobs finish; no new ones are claimed. */
    stop() {
        this.started = false;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.readinessRetryTimer) {
            clearTimeout(this.readinessRetryTimer);
            this.readinessRetryTimer = null;
        }
    }
    /**
     * Stops claiming new jobs and waits for any in-flight tick to finish before
     * process shutdown, bounded by `timeoutMs`.
     */
    async drain(timeoutMs = 5_000) {
        this.stop();
        const deadline = Date.now() + timeoutMs;
        while (this.running && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }
    schedule(intervalMs) {
        this.timer = setTimeout(() => {
            void this.tick(intervalMs);
        }, intervalMs);
        // Do not hold the process open for the worker alone.
        if (typeof this.timer === 'object' && this.timer && 'unref' in this.timer) {
            this.timer.unref();
        }
    }
    async tick(intervalMs) {
        if (this.running) {
            this.schedule(intervalMs);
            return;
        }
        this.running = true;
        try {
            // Drain a bounded batch so one busy instance cannot monopolise the queue.
            for (let i = 0; i < 10; i++) {
                if (!this.started)
                    break;
                const result = await this.processOnce();
                if (result === 'idle')
                    break;
            }
            // Periodically sweep for work stranded by a crashed worker. The interval
            // is deliberately much longer than the poll cadence: recovery is a
            // safety net, not part of the request path.
            this.tickCount += 1;
            if (this.started && this.tickCount % RECOVERY_SWEEP_TICKS === 0) {
                await this.recoverStaleWork();
            }
        }
        catch (err) {
            logger.error('Webhook worker tick failed', {
                error: err instanceof Error ? err.message : String(err),
            });
        }
        finally {
            this.running = false;
            if (this.started)
                this.schedule(intervalMs);
        }
    }
}
export const webhookQueueService = new WebhookQueueService();
