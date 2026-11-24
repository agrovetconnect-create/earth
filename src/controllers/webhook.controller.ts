import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { webhookQueueService } from '../services/webhook-queue.service.js';
import type { WhatsAppWebhookPayload } from '../types/whatsapp.types.js';

function verifyTokenMatches(token: unknown, expected: string): boolean {
  if (typeof token !== 'string' || typeof expected !== 'string') return false;
  const receivedHash = crypto.createHash('sha256').update(token).digest();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(receivedHash, expectedHash);
}

/**
 * GET /webhook
 * Meta Webhook verification endpoint.
 */
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const safeChallenge =
    typeof challenge === 'string' &&
    challenge.length > 0 &&
    challenge.length <= 512 &&
    !/[\r\n\u0000-\u001f]/.test(challenge);
  if (mode === 'subscribe' && verifyTokenMatches(token, env.WHATSAPP_VERIFY_TOKEN)) {
    if (!safeChallenge) {
      logger.warn('Webhook verification rejected an invalid challenge');
      res.status(400).json({ error: 'Invalid hub.challenge' });
      return;
    }
    logger.info('Webhook verification successful');
    res.status(200).type('text/plain').send(challenge);
  } else {
    logger.warn('Webhook verification failed: Invalid verify token or mode');
    res.sendStatus(403);
  }
}

/**
 * POST /webhook
 * Meta WhatsApp Cloud API event endpoint.
 *
 * Meta requires a timely 2xx, but acknowledging an event we have not durably
 * stored would risk losing it to a crash. The handler therefore persists every
 * message as a durable queue job *first*:
 *
 *   - persist succeeds -> 200. The worker processes the job asynchronously.
 *   - persist fails    -> 503. Meta retries until the event is safely queued.
 *
 * The old handler acknowledged first and did the work in a fire-and-forget
 * promise; a crash in that gap silently dropped the submission with no retry.
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ error: 'Invalid JSON request' });
    return;
  }

  const payload = req.body as WhatsAppWebhookPayload;

  if (payload.object !== 'whatsapp_business_account') {
    res.sendStatus(404);
    return;
  }

  logger.info('Webhook event received', { durableQueue: webhookQueueService.isDurable });

  let summary;
  try {
    summary = await webhookQueueService.acceptInbound(payload);
  } catch (err: unknown) {
    // We could not durably record the event. Refuse to acknowledge so Meta
    // redelivers, rather than losing the submission. The error body carries no
    // user data and does not echo internals.
    logger.error('Failed to persist webhook event; requesting Meta retry', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    res.status(503).json({ error: 'EVENT_NOT_PERSISTED' });
    return;
  }

  res.status(200).send('EVENT_RECEIVED');

  logger.info('Webhook event accepted into durable queue', {
    accepted: summary.accepted,
    duplicates: summary.duplicates,
    statuses: summary.statuses,
  });
}
