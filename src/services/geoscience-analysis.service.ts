<<<<<<< HEAD
import { env } from '../config/env.js';
import { whatsappMediaService } from './whatsapp-media.service.js';
import { geminiService } from './gemini.service.js';
import { geoscienceIntelligenceService } from './geoscience-intelligence.service.js';
=======
import { whatsappMediaService } from './whatsapp-media.service.js';
import { geminiService } from './gemini.service.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import { whatsappService } from './whatsapp.service.js';
import { observationService } from './observation.service.js';
import { webhookClaimRepository } from '../repositories/webhook-claim.repository.js';
import { isServiceUnavailableError } from '../utils/service-error.js';
import { validateMedia } from '../utils/image-validator.js';
<<<<<<< HEAD
import { checkDistributedRateLimit, rateLimiter } from '../utils/rate-limiter.js';
import { hashUserPhoneNumber } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';
import { GeologicalAnalysisError, type GeoscienceAnalysisResult } from '../ai/geological.types.js';
import {
  buildUnsupportedInputWarning,
  describeUnsupportedVisualSubject,
  formatObservedCategoryLabel,
  isNonGeoscienceAnalysis,
} from '../ai/domain-scope.js';
import type { ObservationRow } from '../types/database.types.js';

export const USER_FACING_MESSAGES = {
  NON_ROCK: buildUnsupportedInputWarning({
    channel: 'whatsapp',
    inputKind: 'media',
  }),
=======
import { rateLimiter } from '../utils/rate-limiter.js';
import { logger } from '../utils/logger.js';
import { GeologicalAnalysisError, type GeoscienceAnalysisResult } from '../ai/geological.types.js';
import type { ObservationRow } from '../types/database.types.js';

export const USER_FACING_MESSAGES = {
  NON_ROCK: `📸 I received your image.\n\nI couldn't confidently identify a natural geological specimen in this photo.\n\nPlease send a clear photo of the specimen by itself, preferably in good daylight.`,
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

  INSUFFICIENT_IMAGE: `📸 I received your photo, but there isn't enough visual information for a useful interpretation.\n\nPlease try:\n• Better daylight\n• A closer photo\n• Less blur\n• The whole subject in view\n• Another angle\n\nThen send the photo again.`,

  AI_UNAVAILABLE: `I received your submission, but Earth Talk's AI analysis is temporarily unavailable.\n\nPlease try again in a little while.`,

  DATABASE_SAVE_FAILED: `I completed the analysis, but I couldn't save your observation right now.\n\nPlease try sending the photo again later.\n\nNo public observation was created.`,

  LOCATION_RECEIVED: `📍 Location received.\n\nIt is stored privately with your observation and is NOT published as an exact point.\n\nNow send the photo or video you want to attach it to.`,

  INVALID_LOCATION: `📍 I could not read that location.\n\nPlease share the pin again using your phone's location button.`,
};

function formatCapitalized(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/** Relay text (kept internal in case future formatting needs it). */
function appendBlock(lines: string[], label: string, items: string[], emoji = '💡'): void {
  const clean = (items ?? []).map((i) => i.trim()).filter(Boolean);
  if (clean.length === 0) return;
  lines.push(`\n${emoji} ${label}:`);
  for (const item of clean.slice(0, 4)) {
    lines.push(`• ${item}`);
  }
}

/**
 * Stage 11 — WhatsApp intelligence suffix.
 *
 * Adds the contributor's next-step and follow-up questions to a passport reply
 * so the conversational loop can advance the interpretation. The AI-confidence
 * statement travels with any AI value, and low/moderate confidence prompts the
 * closer-photo guidance without claiming the platform knows more than it does.
 */
export function buildWhatsAppIntelligenceSuffix(result: GeoscienceAnalysisResult): string {
  const lines: string[] = [];

  if (result.questions_for_user && result.questions_for_user.length > 0) {
    appendBlock(lines, 'Help me improve this: a few questions', result.questions_for_user, '❓');
  }

  if (result.confidence === 'low' || result.confidence === 'moderate') {
    lines.push('\n📸 To narrow it down, a closer photo of a fresh surface in daylight would help the most.');
  }

  if (result.alternative_possibilities && result.alternative_possibilities.length > 0) {
    appendBlock(
      lines,
      'Other readings that remain possible',
      result.alternative_possibilities,
      '🧩'
    );
  }

  lines.push('\n🤖 AI confidence is an internal model indicator and is not a calibrated probability.');

  return lines.join('');
}

/**
 * Stage 2 response formatter: Converts a structured GeoscienceAnalysisResult into a mobile-friendly WhatsApp message.
 * Preserved for backwards compatibility with Stage 2 tests.
 */
export function formatWhatsAppAnalysisResponse(result: GeoscienceAnalysisResult): string {
<<<<<<< HEAD
  if (
    result.observation_category === 'insufficient_image' ||
    result.primary_classification === 'insufficient_image' ||
    result.confidence === 'insufficient'
  ) {
    return USER_FACING_MESSAGES.INSUFFICIENT_IMAGE;
  }

  if (isNonGeoscienceAnalysis(result)) {
    return USER_FACING_MESSAGES.NON_ROCK;
=======
  if (!result.is_rock || result.primary_classification === 'non_rock') {
    return USER_FACING_MESSAGES.NON_ROCK;
  }

  if (result.primary_classification === 'insufficient_image' || result.confidence === 'insufficient') {
    return USER_FACING_MESSAGES.INSUFFICIENT_IMAGE;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  const lines: string[] = ['🪨 EARTH TALK GEOSCIENCE ANALYSIS\n'];

  if (result.possible_name) {
    lines.push(`Possible identification: ${formatCapitalized(result.possible_name)}`);
  }
<<<<<<< HEAD
  if (result.observation_category) {
    lines.push(`What was observed: ${formatObservedCategoryLabel(result.observation_category)}`);
  }
  if (
    result.primary_classification &&
    result.primary_classification !== 'non_rock' &&
    (!result.observation_category || result.observation_category === 'rock')
  ) {
    lines.push(`Rock type: ${formatCapitalized(result.primary_classification)}`);
  }
  lines.push(
    `Category: ${
      result.observation_category && result.observation_category !== 'rock'
        ? formatObservedCategoryLabel(result.observation_category)
        : formatCapitalized(result.primary_classification)
    }`
  );
  lines.push(`Evidence state: AI-assisted preliminary reading`);
  lines.push(`Confidence: ${formatCapitalized(result.confidence)}`);

  const visibleFeatures =
    result.observed_features && result.observed_features.length > 0
      ? result.observed_features
      : result.diagnostic_features ?? [];
  if (visibleFeatures.length > 0) {
    lines.push('\n🔎 What I can see:');
    for (const feat of visibleFeatures) {
=======
  lines.push(`Category: ${formatCapitalized(result.primary_classification)}`);
  lines.push(`Confidence: ${formatCapitalized(result.confidence)}`);

  if (result.observed_features && result.observed_features.length > 0) {
    lines.push('\n🔎 What I can see:');
    for (const feat of result.observed_features) {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      lines.push(`• ${feat}`);
    }
  }

<<<<<<< HEAD
  const explanationText = result.reasoning || result.primary_interpretation;
  if (explanationText) {
    lines.push('\n💡 Why:');
    lines.push(explanationText);
=======
  if (result.reasoning) {
    lines.push('\n💡 Why:');
    lines.push(result.reasoning);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  if (result.alternative_possibilities && result.alternative_possibilities.length > 0) {
    lines.push(`\nOther possibilities: ${result.alternative_possibilities.join(', ')}`);
  }

  lines.push('\n⚠️ Important:');
  lines.push(
    result.safety_note ||
      'This is a preliminary AI-assisted identification, not a laboratory or expert determination.'
  );

  if (result.recommended_next_steps && result.recommended_next_steps.length > 0) {
    lines.push('\n📸 Want a better result?');
    for (const step of result.recommended_next_steps) {
      lines.push(`• ${step}`);
    }
  }

  return lines.join('\n');
}

/**
 * Stage 3 response formatter: Formats analysis result with the official
 * Geoscience Passport ID and privacy notice.
 */
export function formatWhatsAppPassportResponse(
  result: GeoscienceAnalysisResult,
  passportId: string,
  locationText?: string | null
): string {
<<<<<<< HEAD
  if (
    result.observation_category === 'insufficient_image' ||
    result.primary_classification === 'insufficient_image' ||
    result.confidence === 'insufficient'
  ) {
    return `🪨 EARTH TALK\n\n🆔 Geoscience Passport: ${passportId}\n\n${USER_FACING_MESSAGES.INSUFFICIENT_IMAGE}\n\n🔒 Privacy:\nYour observation is currently private and is not publicly displayed.`;
  }

  if (isNonGeoscienceAnalysis(result)) {
    return `🪨 EARTH TALK\n\n🆔 Geoscience Passport: ${passportId}\n\n${USER_FACING_MESSAGES.NON_ROCK}\n\n🔒 Privacy:\nYour observation is currently private and is not publicly displayed.`;
=======
  if (!result.is_rock || result.primary_classification === 'non_rock') {
    return `🪨 EARTH TALK\n\n🆔 Geoscience Passport: ${passportId}\n\n${USER_FACING_MESSAGES.NON_ROCK}\n\n🔒 Privacy:\nYour observation is currently private and is not publicly displayed.`;
  }

  if (result.primary_classification === 'insufficient_image' || result.confidence === 'insufficient') {
    return `🪨 EARTH TALK\n\n🆔 Geoscience Passport: ${passportId}\n\n${USER_FACING_MESSAGES.INSUFFICIENT_IMAGE}\n\n🔒 Privacy:\nYour observation is currently private and is not publicly displayed.`;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  const lines: string[] = [
    '🪨 EARTH TALK\n',
    'Your Geoscience Passport has been created.\n',
    `🆔 Geoscience Passport: ${passportId}\n`,
  ];

  if (result.possible_name) {
    lines.push(`Possible identification: ${formatCapitalized(result.possible_name)}`);
  }
<<<<<<< HEAD
  if (result.observation_category) {
    lines.push(`What was observed: ${formatObservedCategoryLabel(result.observation_category)}`);
  }
  if (
    result.primary_classification &&
    result.primary_classification !== 'non_rock' &&
    (!result.observation_category || result.observation_category === 'rock')
  ) {
    lines.push(`Rock type: ${formatCapitalized(result.primary_classification)}`);
  }
  lines.push(
    `Category: ${
      result.observation_category && result.observation_category !== 'rock'
        ? formatObservedCategoryLabel(result.observation_category)
        : formatCapitalized(result.primary_classification)
    }`
  );
  lines.push(`Evidence state: AI-assisted preliminary reading`);
  lines.push(`Confidence: ${formatCapitalized(result.confidence)}`);

  const visibleFeatures =
    result.observed_features && result.observed_features.length > 0
      ? result.observed_features
      : result.diagnostic_features ?? [];
  if (visibleFeatures.length > 0) {
    lines.push('\n🔎 Observed:');
    for (const feat of visibleFeatures) {
=======
  lines.push(`Category: ${formatCapitalized(result.primary_classification)}`);
  lines.push(`Confidence: ${formatCapitalized(result.confidence)}`);

  if (result.observed_features && result.observed_features.length > 0) {
    lines.push('\n🔎 Observed:');
    for (const feat of result.observed_features) {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      lines.push(`• ${feat}`);
    }
  }

<<<<<<< HEAD
  const explanationText = result.reasoning || result.primary_interpretation;
  if (explanationText) {
    lines.push('\n💡 Reasoning:');
    lines.push(explanationText);
=======
  if (result.reasoning) {
    lines.push('\n💡 Reasoning:');
    lines.push(result.reasoning);
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }

  lines.push('\n⚠️ Important:');
  lines.push(
    result.safety_note ||
      'This is a preliminary AI-assisted identification, not a laboratory or expert determination.'
  );

  lines.push('\n📍 Location:');
  lines.push(locationText ? locationText : 'Not provided');

  lines.push('\n🔒 Privacy:');
  lines.push('Your observation is currently private and is not publicly displayed.');

  if (result.recommended_next_steps && result.recommended_next_steps.length > 0) {
    lines.push('\n📸 Next steps:');
    for (const step of result.recommended_next_steps) {
      lines.push(`• ${step}`);
    }
  }

  lines.push(buildWhatsAppIntelligenceSuffix(result));

  return lines.join('\n');
}

export interface IncomingMediaMessage {
  senderPhoneNumber: string;
  messageId: string;
  mediaId: string;
  declaredMimeType?: string;
  caption?: string;
}

/**
 * A location volunteered by the sender for an observation they have already
 * submitted, held briefly so it can be attached to the right record.
 *
 * Nothing here is published by default. The sender shared a pin so Earth Talk
 * could organise their record; that is not consent to publish an exact point.
 */
export interface PendingLocation {
  latitude: number;
  longitude: number;
  name?: string | null;
  address?: string | null;
  receivedAt: number;
}

/**
 * Pending locations expire quickly.
 *
 * A pin is attached to the most recent observation from the same sender. That
 * association is only defensible while the request is recent, so an old pin is
 * discarded rather than attached to whatever record happens to be newest later.
 */
const PENDING_LOCATION_TTL_MS = 15 * 60 * 1000;

const MAX_PENDING_LOCATIONS = 500;

class PendingLocationStore {
  private readonly byPhone = new Map<string, PendingLocation>();

  set(phone: string, location: Omit<PendingLocation, 'receivedAt'>): void {
    this.prune();
    // The map is keyed by sender, so a new pin replaces the previous one: a sender
    // correcting themselves must not leave two candidates competing to attach.
    this.byPhone.set(phone, { ...location, receivedAt: Date.now() });
  }

  take(phone: string): PendingLocation | null {
    this.prune();
    const found = this.byPhone.get(phone) ?? null;
    // Removed on read so one pin cannot silently attach to a second observation.
    this.byPhone.delete(phone);
    return found;
  }

<<<<<<< HEAD
  peek(phone: string): PendingLocation | null {
    this.prune();
    return this.byPhone.get(phone) ?? null;
  }

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  private prune(): void {
    const now = Date.now();
    for (const [phone, location] of this.byPhone) {
      if (now - location.receivedAt > PENDING_LOCATION_TTL_MS) {
        this.byPhone.delete(phone);
      }
    }
    // Bound the map so an unauthenticated flood of pinned locations cannot grow
    // process memory without limit. The oldest entry is evicted first.
    while (this.byPhone.size > MAX_PENDING_LOCATIONS) {
      const oldest = this.byPhone.keys().next();
      if (oldest.done) break;
      this.byPhone.delete(oldest.value);
    }
  }

  get size(): number {
    return this.byPhone.size;
  }
}

const pendingLocations = new PendingLocationStore();

/**
 * The result of running the image analysis pipeline once.
 *
 * The caller (the durable webhook worker) uses this to decide the fate of the
 * queue job. Aided by this outcome, every message ends in exactly one of:
 *   - completed: fully handled, reply sent, claim finalised.
 *   - duplicate: another delivery (or an earlier attempt) already owns it.
 *   - retryable: a transient failure; the job stays queued with bounded backoff.
 *   - terminal:  a permanent failure; the job is never processed again.
 */
export type ProcessOutcome =
  | { state: 'completed'; passportId?: string }
  | { state: 'duplicate' }
  | { state: 'retryable'; error: string }
  | { state: 'terminal'; error: string };

/**
 * Classifies a pipeline error as retryable or terminal.
 *
 * The distinction is deliberately conservative: anything we cannot prove is
 * permanent stays retryable, and the queue's bounded attempts make that safe.
 * Only failures that re-running cannot fix (invalid media, a prohibited claim,
 * an authentication or malformed-response error) are terminal.
 */
export function classifyPipelineError(err: unknown): { state: 'retryable' | 'terminal'; error: string } {
  if (isServiceUnavailableError(err)) {
    return { state: 'retryable', error: 'database_unavailable' };
  }
  if (err instanceof GeologicalAnalysisError) {
    switch (err.category) {
      case 'MEDIA_VALIDATION_ERROR':
      case 'IMAGE_VALIDATION_ERROR':
      case 'WHATSAPP_MEDIA_ERROR':
      case 'GEMINI_PROHIBITED_CLAIM':
      case 'GEMINI_AUTH_ERROR':
      case 'GEMINI_INVALID_RESPONSE':
<<<<<<< HEAD
      case 'NON_GEOSCIENCE_SUBMISSION':
      case 'INSUFFICIENT_IMAGE_QUALITY':
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
        return { state: 'terminal', error: err.category };
      case 'IMAGE_DOWNLOAD_ERROR':
      case 'GEMINI_RATE_LIMIT_ERROR':
      case 'GEMINI_TIMEOUT':
      case 'GEMINI_API_ERROR':
      case 'INTERNAL_ERROR':
      default:
        return { state: 'retryable', error: err.category };
    }
  }
  return { state: 'retryable', error: err instanceof Error ? err.message : 'unknown_error' };
}

export class GeoscienceAnalysisService {
  /**
   * Orchestrates the complete geoscience observation pipeline for an image or a
   * video sent over WhatsApp:
   * 1. Durable per-message claim (idempotency across retries and instances)
   * 2. Rate limiting
   * 3. Media metadata and binary download from Meta
   * 4. Media validation (size, container, magic bytes - not the declared type)
   * 5. Multimodal Gemini category-first geoscience assessment
   * 6. Persisting the observation, media metadata and location in Supabase
   * 7. Formatting into an educational, cautious WhatsApp message
   * 8. Dispatching the reply to the sender
   *
   * Every exit path finalises the claim: success -> completed, transient
   * failure -> retryable_failure (bounded by the queue), permanent failure ->
   * terminal_failure. No path may leave a claim stuck in `processing`, and no
   * path may treat a database error as "no claim exists".
   *
   * The method name is preserved from Stage 2 because the webhook and existing
   * tests call it. It now accepts video as well as photographs.
   */
  async processRockImage(params: IncomingMediaMessage): Promise<ProcessOutcome> {
    const { senderPhoneNumber, messageId, mediaId, declaredMimeType, caption } = params;

    // Step 1: Idempotency. A stored observation means this message is done.
    //
    // The lookup throws on a database error rather than returning null, so an
    // outage can never be mistaken for "this message is new".
    try {
      const existing = await observationService.getObservationBySourceMessageId(messageId);
      if (existing) {
        logger.info('Duplicate message detected: observation already exists in database', {
          messageId,
          passportId: existing.passport_id,
        });
        const duplicateMsg = `This submission has already been processed.\n\nObservation ID:\n${existing.passport_id}`;
        await whatsappService.sendTextMessage(senderPhoneNumber, duplicateMsg);
        return { state: 'duplicate' };
      }
    } catch (err: unknown) {
      if (isServiceUnavailableError(err)) {
        // Without the uniqueness check there is no safe way to proceed: running
        // the analysis could duplicate an observation that already exists.
        logger.error('Cannot verify message uniqueness; deferring processing', { messageId });
        return { state: 'retryable', error: 'uniqueness_check_unavailable' };
      }
      throw err;
    }

    // Step 2: Claim the message. A claim that cannot be acquired is retryable;
    // it is never read as "unclaimed". In production this is a row-locked upsert
    // in `webhook_message_claims`; without a database it is a process-local
    // adapter for development only.
    let claimed = false;
    try {
      const claim = await webhookClaimRepository.claim(messageId);
      if (claim === 'duplicate') {
        logger.info('Duplicate webhook delivery ignored; a claim already exists', { messageId });
        return { state: 'duplicate' };
      }
      claimed = true;
    } catch (err: unknown) {
      logger.error('Cannot acquire durable claim; deferring processing', { messageId });
      return { state: 'retryable', error: 'claim_acquisition_unavailable' };
    }

<<<<<<< HEAD
    // Step 3: Rate limit check per user (distributed bucket + in-memory guard).
    // Sender phone is hashed before querying rate_limit_buckets so raw PII is never stored.
    const senderHash = hashUserPhoneNumber(senderPhoneNumber);
    const distributedAllowed = await checkDistributedRateLimit(
      `wa_ai:${senderHash}`,
      env.AI_RATE_LIMIT_PER_USER,
      env.AI_RATE_LIMIT_WINDOW_SECONDS * 1000
    );
    if (!distributedAllowed || rateLimiter.isRateLimited(senderPhoneNumber)) {
=======
    // Step 3: Rate limit check per user. A rate-limited message is terminal: it
    // is not a transient system failure and must not be reprocessed forever.
    if (rateLimiter.isRateLimited(senderPhoneNumber)) {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      logger.warn('Rate limit exceeded for user', { messageId });
      if (claimed) await webhookClaimRepository.markTerminal(messageId, 'rate_limited');
      await whatsappService.sendTextMessage(senderPhoneNumber, rateLimiter.getRateLimitMessage());
      return { state: 'terminal', error: 'rate_limited' };
    }

    logger.info('Media received, starting analysis & observation pipeline', { messageId, mediaId });

    try {
      // Step 4: Secure media download from Meta
      const media = await whatsappMediaService.downloadMedia(mediaId);

      // Step 5: Media validation.
      //
      // `validateMedia` inspects the bytes, so a file labelled `image/jpeg` that
      // is actually an MP4 is routed as video rather than being sent to the image
      // pipeline and rejected.
      const validation = validateMedia(media.buffer, media.mimeType || declaredMimeType);
      if (!validation.isValid) {
        logger.warn('Media failed validation', {
          reason: validation.errorReason,
          messageId,
        });
        const errorReply = validation.userMessage || USER_FACING_MESSAGES.INSUFFICIENT_IMAGE;
        if (claimed) {
          await webhookClaimRepository.markTerminal(
            messageId,
            validation.errorReason ?? 'invalid_media'
          );
        }
        await whatsappService.sendTextMessage(senderPhoneNumber, errorReply);
        return { state: 'terminal', error: 'invalid_media' };
      }

      const mediaType = validation.mediaKind === 'video' ? 'video' : 'image';

<<<<<<< HEAD
      // Step 6: Advanced Gemini Multimodal Geoscience Intelligence Analysis
      const peekedLoc = pendingLocations.peek(senderPhoneNumber);
      let analysisResult: GeoscienceAnalysisResult;
      try {
        const intel = await geoscienceIntelligenceService.analyzeIntelligence({
          media: [
            {
              buffer: media.buffer,
              mimeType: validation.detectedMimeType!,
              viewType: mediaType === 'video' ? 'video_frame' : 'overview',
            },
          ],
          userDescription: caption,
          latitude: peekedLoc?.latitude,
          longitude: peekedLoc?.longitude,
        });
        analysisResult = intel.baseAnalysis ?? {
          is_rock: intel.base.observationCategory === 'rock',
          observation_category: intel.base.observationCategory,
          observation_subcategory: intel.base.observationSubcategory,
          observation_type: intel.base.observationSubcategory || 'specimen',
          is_geoscience_relevant: !['non_geoscience', 'insufficient_image'].includes(intel.base.observationCategory),
          primary_interpretation: intel.primaryHypothesis,
          geological_context: intel.geologicalContextNote,
          diagnostic_features: intel.observedFromMedia,
          uncertainties: intel.uncertainties,
          questions_for_user: intel.followUpQuestions,
          blocked_claims: [],
          primary_classification: intel.base.primaryClassification as GeoscienceAnalysisResult['primary_classification'],
          possible_name: intel.primaryHypothesis.replace(/^Possible\s+/i, '') || null,
          confidence: intel.base.confidence,
          confidence_score: intel.base.confidenceScore,
          observed_features: intel.observedFromMedia,
          reasoning: intel.summary,
          alternative_possibilities: intel.alternativeHypotheses.map((h) => h.label),
          limitations: intel.scientificLimitations ? [intel.scientificLimitations] : [],
          recommended_next_steps: intel.recommendedFieldChecks,
          safety_note: intel.safetyNote,
          model_used: env.GEMINI_MODEL,
        };
      } catch (intelErr) {
        logger.warn('Advanced intelligence failed in WhatsApp media analysis; attempting base analysis', {
          error: String(intelErr),
        });
        analysisResult = await geminiService.analyzeGeoscienceMedia(
          media.buffer,
          validation.detectedMimeType!,
          caption,
          mediaType
        );
      }

      // Step 6b: Enforce Earth Talk domain focus — do not create a Geoscience
      // Passport for unrelated everyday items (e.g. shoes, clothes, selfies).
      if (isNonGeoscienceAnalysis(analysisResult)) {
        const detectedSubject = describeUnsupportedVisualSubject(analysisResult, caption);
        const warningReply = buildUnsupportedInputWarning({
          channel: 'whatsapp',
          inputKind: 'media',
          detectedSubject,
        });
        logger.info('Rejected non-geoscience WhatsApp media without creating passport', {
          messageId,
          detectedSubject,
          category: analysisResult.observation_category,
        });
        await whatsappService.sendTextMessage(senderPhoneNumber, warningReply);
        if (claimed) await webhookClaimRepository.markCompleted(messageId);
        return { state: 'completed' };
      }

      // Step 6c: Do not mint a permanent Geoscience Passport when the photo is
      // too blurry, dark, or obstructed for any meaningful reading.
      if (
        analysisResult.observation_category === 'insufficient_image' ||
        analysisResult.primary_classification === 'insufficient_image' ||
        analysisResult.confidence === 'insufficient'
      ) {
        logger.info('Rejected insufficient-quality WhatsApp media without creating passport', {
          messageId,
          category: analysisResult.observation_category,
          confidence: analysisResult.confidence,
        });
        await whatsappService.sendTextMessage(senderPhoneNumber, USER_FACING_MESSAGES.INSUFFICIENT_IMAGE);
        if (claimed) await webhookClaimRepository.markCompleted(messageId);
        return { state: 'completed' };
      }
=======
      // Step 6: Gemini Multimodal Analysis
      const analysisResult = await geminiService.analyzeGeoscienceMedia(
        media.buffer,
        validation.detectedMimeType!,
        caption,
        mediaType
      );
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

      // Step 7: A location the sender shared just before this media is attached
      // here, so the pin and the observation it belongs to land together.
      const pendingLocation = pendingLocations.take(senderPhoneNumber);
      const location = pendingLocation
        ? {
            latitude: pendingLocation.latitude,
            longitude: pendingLocation.longitude,
            locationText: pendingLocation.address ?? pendingLocation.name ?? null,
            locationSource: 'user_gps' as const,
          }
        : undefined;

      // Step 8: Create the persistent observation in Supabase. A save failure is
      // transient: the claim is left retryable so a later attempt can persist it.
      let observation: ObservationRow;
      try {
        observation = await observationService.createRockPassport({
          aiResult: analysisResult,
          senderPhoneNumber,
          messageId,
          media: {
            buffer: media.buffer,
            mimeType: validation.detectedMimeType!,
            fileSize: media.fileSize,
            mediaId,
            mediaType,
          },
          userCaption: caption,
          location,
        });
      } catch (dbErr: unknown) {
        const errorMsg = dbErr instanceof Error ? dbErr.message : 'Database error';
        logger.error('Failed to create observation in Supabase', { messageId, error: errorMsg });
        if (claimed) await webhookClaimRepository.markRetryable(messageId, 'observation_save_failed');
        return { state: 'retryable', error: 'observation_save_failed' };
      }

      // Step 9: Format WhatsApp response with the observation ID
      const formattedResponse = formatWhatsAppPassportResponse(
        analysisResult,
        observation.passport_id,
        location ? (location.locationText ?? 'Shared pin received') : caption ? undefined : null
      );

      // Step 10: Send response to user
      await whatsappService.sendTextMessage(senderPhoneNumber, formattedResponse);
      logger.info('WhatsApp analysis & observation response sent', {
        messageId,
        passportId: observation.passport_id,
        mediaType,
        category: analysisResult.observation_category,
        classification: analysisResult.primary_classification,
      });

      // The message is fully handled; keep the durable claim as `completed` so no
      // later delivery (a retry, or another instance) can process it again.
      if (claimed) await webhookClaimRepository.markCompleted(messageId);
      return { state: 'completed', passportId: observation.passport_id };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const category = err instanceof GeologicalAnalysisError ? err.category : 'INTERNAL_ERROR';
      logger.error('Geoscience analysis pipeline failed', {
        messageId,
        error: errMsg,
        category,
      });

      const classification = classifyPipelineError(err);
      if (claimed) {
        if (classification.state === 'terminal') {
          await webhookClaimRepository.markTerminal(messageId, classification.error);
        } else {
          await webhookClaimRepository.markRetryable(messageId, classification.error);
        }
      }

      // Give the sender a reply only when the failure is permanent (or when there
      // is no queue behind us). Transient failures are retried first; the worker
      // sends the final "temporarily unavailable" note when attempts run out.
      if (classification.state === 'terminal') {
        await whatsappService
          .sendTextMessage(senderPhoneNumber, USER_FACING_MESSAGES.AI_UNAVAILABLE)
          .catch(() => {});
      }
      return classification;
    }
  }

  /**
   * Records a location pin shared by a sender.
   *
   * The pin is held, not published, and is never turned into a place name. The
   * label WhatsApp attaches to a pin is whatever the sender typed, so it is
   * stored as free text and never used as a verified address.
   */
  async recordSharedLocation(params: {
    senderPhoneNumber: string;
    latitude: number;
    longitude: number;
    name?: string | null;
    address?: string | null;
  }): Promise<void> {
    const { senderPhoneNumber, latitude, longitude, name, address } = params;

    try {
      observationService.validateCoordinates(latitude, longitude);
    } catch (err: unknown) {
      logger.warn('Rejected a shared location with out-of-range coordinates', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      await whatsappService.sendTextMessage(senderPhoneNumber, USER_FACING_MESSAGES.INVALID_LOCATION);
      return;
    }

    pendingLocations.set(senderPhoneNumber, {
      latitude,
      longitude,
      name: name ?? null,
      address: address ?? null,
    });

    logger.info('Shared location recorded and held privately', {
      // No coordinates and no label in the log: a log line is not a private store.
      hasLabel: Boolean(name ?? address),
      pendingCount: pendingLocations.size,
    });

    await whatsappService.sendTextMessage(senderPhoneNumber, USER_FACING_MESSAGES.LOCATION_RECEIVED);
  }
}

export const geoscienceAnalysisService = new GeoscienceAnalysisService();
