import { GoogleGenAI } from '@google/genai';
import { env, VALID_GEMINI_TEXT_MODELS, isGeminiModel } from '../config/env.js';
import {
  buildUnsupportedInputWarning,
  detectOffTopicText,
} from '../ai/domain-scope.js';
import { logger } from '../utils/logger.js';
import { aiTextFallbackService } from './ai-text-fallback.service.js';
import { GEOLOGICAL_SYSTEM_INSTRUCTION, buildGeologicalUserPrompt } from '../ai/geological.prompt.js';
import { geologicalResponseSchema, validateGeologicalResponse } from '../ai/geological.schema.js';
import { GeologicalAnalysisError, type GeoscienceAnalysisResult } from '../ai/geological.types.js';
import {
  GEOSCIENCE_INTELLIGENCE_SYSTEM_INSTRUCTION,
  buildIntelligenceUserPrompt,
} from '../ai/geoscience-intelligence.prompt.js';
import { intelligenceResponseSchema, validateIntelligenceResponse } from '../ai/geoscience-intelligence.schema.js';
import type { MediaPart, ObservationIntelligenceContext, RawIntelligenceExtras } from '../ai/geoscience-intelligence.types.js';

export type GeminiErrorClass = 'auth' | 'rejected' | 'retryable' | 'unknown';

function errorStatusCode(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number' && Number.isFinite(status)) return status;
  if (typeof status === 'string' && /^\d{3}$/.test(status.trim())) return Number(status.trim());
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'number' && Number.isFinite(code)) return code;
  if (typeof code === 'string' && /^\d{3}$/.test(code.trim())) return Number(code.trim());
  return null;
}

export function classifyGeminiError(err: unknown): GeminiErrorClass {
  const status = errorStatusCode(err);
  const details = [
    err instanceof Error ? err.message : String(err),
    err && typeof err === 'object' ? String((err as { status?: unknown }).status ?? '') : '',
    err && typeof err === 'object' ? String((err as { code?: unknown }).code ?? '') : '',
  ]
    .join(' ')
    .toLowerCase();

  if (status === 429 || status === 503) return 'retryable';
  if (status === 401 || status === 403) return 'auth';
  if (status === 400 || status === 402 || status === 404) return 'rejected';

  if (/api[_ -]?key|unauthori[sz]ed|forbidden|permission[_ -]?denied|unauthenticated|\b401\b|\b403\b/.test(details)) {
    return 'auth';
  }
  if (
    /\b400\b|\b402\b|\b404\b|not[_ -]?found|billing|payment|insufficient[_ -]?credit|invalid[_ -]?argument|invalid[_ -]?request|failed_precondition|model[_ -]?not[_ -]?available/.test(
      details
    )
  ) {
    return 'rejected';
  }
  if (/quota|rate[_ -]?limit|\b429\b|\b503\b|resource_exhausted|too[_ -]?many[_ -]?requests|overloaded|unavailable/.test(details)) {
    return 'retryable';
  }
  return 'unknown';
}

export async function geminiRetryDelay(attempt: number): Promise<void> {
  const exponentialMs = Math.min(20 * 2 ** Math.max(0, attempt), 200);
  const delayMs = Math.min(exponentialMs + Math.random() * 10, 200);
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function uniqueValidModels(models: string[]): string[] {
  return Array.from(new Set(models.filter(isGeminiModel).map((model) => model.trim())));
}

const FRIENDLY_GEMINI_MESSAGES = {
  retryable:
    'AI analysis is at capacity right now. Please try again in a few minutes; nothing was recorded.',
  auth: 'AI analysis is not configured correctly. Please contact support.',
  rejected: 'AI could not process that request. Please try a different photo or question.',
  unknown: 'AI analysis is temporarily unavailable. Please try again.',
} as const;

function safeGeminiError(err: unknown, fallbackMessage: string): GeologicalAnalysisError {
  const classification = classifyGeminiError(err);
  const category =
    classification === 'auth'
      ? 'GEMINI_AUTH_ERROR'
      : classification === 'retryable'
        ? 'GEMINI_RATE_LIMIT_ERROR'
        : 'GEMINI_API_ERROR';
  const message = FRIENDLY_GEMINI_MESSAGES[classification] ?? fallbackMessage;
  return new GeologicalAnalysisError(category, message, err);
}

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  /**
   * Sends a photograph (or a video frame) to Gemini for a preliminary,
   * category-first geoscience assessment.
   *
   * The response is validated and screened after it arrives. A model response
   * that asserts something the scientific-safety policy forbids is discarded
   * rather than softened, because a partially rewritten sentence still reads as
   * an assertion.
   *
   * @param mediaBuffer Raw image or video bytes.
   * @param mimeType Validated MIME type (e.g. image/jpeg, image/png, video/mp4).
   * @param userCaption Optional unverified context from the sender's caption.
   */
  async analyzeGeoscienceMedia(
    mediaBuffer: Buffer,
    mimeType: string,
    userCaption?: string | null,
    mediaType: 'image' | 'video' = 'image',
    supportingImages?: Array<{ buffer: Buffer; mimeType: string }>
  ): Promise<GeoscienceAnalysisResult> {
    const uniqueModels = uniqueValidModels([env.GEMINI_MODEL, ...VALID_GEMINI_TEXT_MODELS]);
    let lastError: unknown = null;
    let retryAttempt = 0;

    for (const model of uniqueModels) {
      try {
        const startTime = Date.now();
        logger.info(`Gemini geoscience analysis started with model ${model}`, {
          mimeType,
          mediaType,
          mediaBytes: mediaBuffer.length,
          supportingCount: supportingImages?.length ?? 0,
        });

        const result = await this.executeAnalysisWithTimeout(
          mediaBuffer,
          mimeType,
          userCaption,
          model,
          mediaType,
          supportingImages
        );
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`Gemini geoscience analysis completed in ${duration}s using ${model}`, {
          category: result.observation_category,
          subcategory: result.observation_subcategory,
          classification: result.primary_classification,
          confidence: result.confidence,
        });

        // A blocked claim is a warning, not a failure: the observation is still
        // real and the rest of the assessment is still usable.
        if (result.blocked_claims.length > 0) {
          logger.warn('Gemini response contained a prohibited claim; the field was dropped', {
            model,
            blocked: result.blocked_claims,
          });
        }

        return result;
      } catch (err: unknown) {
        lastError = err;
        const classification = classifyGeminiError(err);

        if (classification === 'retryable') {
          logger.warn(`Model ${model} is rate limited or unavailable. Backing off before the next model...`, {
            error: err instanceof Error ? err.message : String(err),
          });
          await geminiRetryDelay(retryAttempt++);
        } else {
          logger.warn(`Gemini geoscience analysis with ${model} failed (${classification}); trying the next available model...`, {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    if (lastError instanceof GeologicalAnalysisError) {
      throw lastError;
    }
    throw safeGeminiError(lastError, 'Gemini analysis failed');
  }

  /**
   * Backward-compatible alias.
   *
   * Existing callers and Stage 2 tests use `analyzeRockImage`. The pipeline is
   * no longer rock-only, so the canonical name is `analyzeGeoscienceMedia`;
   * this alias keeps the historical entry point working.
   */
  async analyzeRockImage(
    imageBuffer: Buffer,
    mimeType: string,
    userCaption?: string
  ): Promise<GeoscienceAnalysisResult> {
    return this.analyzeGeoscienceMedia(imageBuffer, mimeType, userCaption, 'image');
  }

  /**
   * Stage 11 — context-aware analysis of one or more media items.
   *
   * Sends every media part (overview, close-up, texture, fresh surface, outcrop,
   * environmental, video frame) plus any contributor description plus the
   * platform context (nearby public observations, site, community activity,
   * geological-context status) to the model in a single structured call, and
   * returns the validated base analysis together with the sanitised intelligence
   * extras.
   *
   * The same model fallback chain and timeout that protect the base pipeline
   * protect this call. When the model is unreachable the caller is expected to
   * fall back to the standard single-media analysis rather than to invent data.
   */
  async analyzeGeoscienceIntelligence(params: {
    media: MediaPart[];
    userDescription?: string | null;
    context: ObservationIntelligenceContext;
  }): Promise<{ result: GeoscienceAnalysisResult; extras: RawIntelligenceExtras }> {
    const media = params.media.slice(0, 6);
    if (media.length === 0) {
      throw new GeologicalAnalysisError('GEMINI_API_ERROR', 'No media was provided for analysis');
    }

    const uniqueModels = uniqueValidModels([env.GEMINI_MODEL, ...VALID_GEMINI_TEXT_MODELS]);
    let lastError: unknown = null;
    let retryAttempt = 0;

    for (const model of uniqueModels) {
      try {
        const startTime = Date.now();
        logger.info('Gemini context-aware intelligence analysis started', {
          model,
          mediaCount: media.length,
          mediaBytes: media.reduce((sum, m) => sum + m.buffer.length, 0),
        });

        const { result, extras } = await this.executeIntelligenceWithTimeout(
          media,
          params.userDescription,
          params.context,
          model
        );
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`Gemini context-aware intelligence analysis completed in ${duration}s using ${model}`, {
          category: result.observation_category,
          subcategory: result.observation_subcategory,
          classification: result.primary_classification,
          confidence: result.confidence,
          hypotheses: extras.hypotheses.length,
        });

        if (result.blocked_claims.length > 0) {
          logger.warn('Gemini intelligence response contained a prohibited claim; the field was dropped', {
            model,
            blocked: result.blocked_claims,
          });
        }

        return { result, extras };
      } catch (err: unknown) {
        lastError = err;
        const classification = classifyGeminiError(err);

        if (classification === 'retryable') {
          logger.warn(`Model ${model} is rate limited or unavailable. Backing off before the next model...`, {
            error: err instanceof Error ? err.message : String(err),
          });
          await geminiRetryDelay(retryAttempt++);
        } else {
          logger.warn(`Gemini context-aware analysis with ${model} failed (${classification}); trying the next available model...`, {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    if (lastError instanceof GeologicalAnalysisError) {
      throw lastError;
    }
    throw safeGeminiError(lastError, 'Gemini context-aware analysis failed');
  }

  /**
   * Runs the context-aware analysis with the same timeout policy as the base
   * pipeline.
   */
  private async executeIntelligenceWithTimeout(
    media: MediaPart[],
    userDescription: string | null | undefined,
    context: ObservationIntelligenceContext,
    modelName: string
  ): Promise<{ result: GeoscienceAnalysisResult; extras: RawIntelligenceExtras }> {
    const parts: object[] = [];
    for (const part of media) {
      parts.push({
        inlineData: {
          mimeType: part.mimeType,
          data: part.buffer.toString('base64'),
        },
      });
    }
    parts.push({
      text: buildIntelligenceUserPrompt({ media, userDescription, context }),
    });

    const callPromise = this.ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        systemInstruction: GEOSCIENCE_INTELLIGENCE_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: intelligenceResponseSchema,
      },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(
          new GeologicalAnalysisError(
            'GEMINI_TIMEOUT',
            `Gemini request timed out after ${env.GEMINI_TIMEOUT_MS}ms`
          )
        );
      }, env.GEMINI_TIMEOUT_MS);
      timer.unref?.();
    });

    const response = await Promise.race([callPromise, timeoutPromise]);
    const jsonText = response.text;

    if (!jsonText || jsonText.trim().length === 0) {
      throw new GeologicalAnalysisError('GEMINI_INVALID_RESPONSE', 'Gemini returned empty text response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText.trim());
    } catch (parseErr) {
      throw new GeologicalAnalysisError('GEMINI_INVALID_RESPONSE', 'Failed to parse Gemini output as JSON', parseErr);
    }

    try {
      return validateIntelligenceResponse(parsed, modelName);
    } catch (validationErr) {
      throw new GeologicalAnalysisError(
        'GEMINI_INVALID_RESPONSE',
        validationErr instanceof Error ? validationErr.message : 'Invalid schema',
        validationErr
      );
    }
  }

  /**
   * Internal helper executing generateContent wrapped in the configured timeout.
   */
  private async executeAnalysisWithTimeout(
    mediaBuffer: Buffer,
    mimeType: string,
    userCaption: string | null | undefined,
    modelName: string = env.GEMINI_MODEL,
    mediaType: 'image' | 'video' = 'image',
    supportingImages?: Array<{ buffer: Buffer; mimeType: string }>
  ): Promise<GeoscienceAnalysisResult> {
    const base64Data = mediaBuffer.toString('base64');
    const userPrompt = buildGeologicalUserPrompt({ userCaption, mediaType });
    const extraImageParts = (supportingImages ?? []).slice(0, 5).map((img) => ({
      inlineData: {
        mimeType: img.mimeType,
        data: img.buffer.toString('base64'),
      },
    }));

    const callPromise = this.ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          ...extraImageParts,
          {
            text: userPrompt,
          },
        ],
      },
      config: {
        systemInstruction: GEOLOGICAL_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: geologicalResponseSchema,
      },
    });

    // Enforce timeout using Promise.race
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(
          new GeologicalAnalysisError(
            'GEMINI_TIMEOUT',
            `Gemini request timed out after ${env.GEMINI_TIMEOUT_MS}ms`
          )
        );
      }, env.GEMINI_TIMEOUT_MS);
      // Clean up timer if process unrefs
      timer.unref?.();
    });

    const response = await Promise.race([callPromise, timeoutPromise]);
    const jsonText = response.text;

    if (!jsonText || jsonText.trim().length === 0) {
      throw new GeologicalAnalysisError('GEMINI_INVALID_RESPONSE', 'Gemini returned empty text response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText.trim());
    } catch (parseErr) {
      throw new GeologicalAnalysisError('GEMINI_INVALID_RESPONSE', 'Failed to parse Gemini output as JSON', parseErr);
    }

    try {
      // `modelName` is threaded down from the caller, which knows which model
      // in the fallback chain actually produced this response.
      return validateGeologicalResponse(parsed, modelName);
    } catch (validationErr) {
      throw new GeologicalAnalysisError(
        'GEMINI_INVALID_RESPONSE',
        validationErr instanceof Error ? validationErr.message : 'Invalid schema',
        validationErr
      );
    }
  }
  /**
   * Answers geoscience Q&A and follow-up questions about an active observation.
   */
  async answerGeoscienceQuestion(
    question: string,
    observationContext?: {
      passportId: string;
      category: string;
      possibleName?: string | null;
      interpretation: string;
      features?: string[];
      userNotes?: string | null;
    } | null,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; text: string }>,
    documents?: Array<{ filename: string; mimeType: string; data: string }>
  ): Promise<string> {
    const cleanQuestion = String(question ?? '').trim();
    const isSimpleGreeting =
      /^(?:hello|hi|hey|yo|muraho|habari|amakuru|good\s+(?:morning|afternoon|evening)|greetings)[!.?\s]*$/i.test(
        cleanQuestion
      );

    const offTopicCheck = detectOffTopicText(cleanQuestion);
    if (offTopicCheck.isOffTopic) {
      return buildUnsupportedInputWarning({
        channel: 'mobile',
        inputKind: 'text',
        detectedSubject: offTopicCheck.detectedTopic,
      });
    }

    const attachedDocumentParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
    const extractedDocumentText: string[] = [];
    for (const doc of documents ?? []) {
      const mimeType = doc.mimeType.toLowerCase();
      if (mimeType === 'application/pdf') {
        attachedDocumentParts.push({
          inlineData: { data: doc.data, mimeType: 'application/pdf' },
        });
      } else if (mimeType === 'text/plain' || mimeType === 'text/csv') {
        extractedDocumentText.push(
          `--- ${doc.filename} ---\n${Buffer.from(doc.data, 'base64').toString('utf8').slice(0, 12000)}`
        );
      }
    }

    const documentSection =
      documents && documents.length > 0
        ? `\n\nAttached documents (read and use them; cite the filename when relying on one):\n` +
          documents.map((doc) => `- ${doc.filename} (${doc.mimeType})`).join('\n') +
          (extractedDocumentText.length > 0
            ? `\n\nExtracted document text:\n${extractedDocumentText.join('\n\n')}`
            : '') +
          `\nIf a document's contents cannot be read, say so plainly rather than guessing.`
        : '';

    const contextSection = observationContext
      ? `\n\nActive Observation Context (${observationContext.passportId}):\n` +
        `- Category: ${observationContext.category}${observationContext.possibleName ? ` (${observationContext.possibleName})` : ''}\n` +
        `- Preliminary AI Interpretation: ${observationContext.interpretation}\n` +
        (observationContext.features && observationContext.features.length > 0
          ? `- Observed Features: ${observationContext.features.join(', ')}\n`
          : '') +
        (observationContext.userNotes ? `- Contributor Field Notes: ${observationContext.userNotes}\n` : '')
      : '';

    const historySection =
      conversationHistory && conversationHistory.length > 0
        ? `\n\nRecent conversation context:\n${conversationHistory
            .slice(-10)
            .map((turn) => `${turn.role === 'user' ? 'Contributor' : 'GeoAI'}: ${turn.text.slice(0, 500)}`)
            .join('\n')}`
        : '';

    const promptText =
      `You are Earth Talk's GeoAI field assistant — knowledgeable, warm, direct, and scientifically cautious.\n` +
      `Supported geoscience domain:\n` +
      `- Geological layers (stratigraphy), rocks (Igneous, Sedimentary, Metamorphic, Unclassified), minerals, fossils, structures (bedding, faults, folds, veins), volcanic features, springs/seeps, mining outcrops, and slope exposures (especially East African / Rwandan geology when relevant).\n` +
      `- Helping contributors document field photos, angles/clips, voice notes, and coordinates cleanly.\n` +
      `Conversational behavior rules:\n` +
      `- Always reply directly to what the contributor actually said or asked, taking into account any prior conversation turns.\n` +
      `- If the contributor greets you (e.g. "hello", "muraho", "hi") or makes a brief conversational check-in, reply warmly in 1-3 short, natural sentences acknowledging their greeting, mentioning any active observation if present, and asking what specimen, outcrop, or geology question they would like to explore — DO NOT dump a long help manual or bullet list unless they explicitly ask what Earth Talk can do.\n` +
      `- If the contributor asks an unrelated non-geoscience question (e.g. shoes, fashion, food recipes, sports scores, general coding), DO NOT answer it; output ONLY one line: [UNSUPPORTED_TOPIC: <short name of what they asked about>]\n` +
      `- The whole Earth Talk submission is completed in this chat: attach media, review the GeoAI summary, share location, choose private/public, and confirm here. NEVER tell the contributor to open another form, screen, page, website, or app. If they ask how to submit, publish, keep it private, or confirm, tell them to use the buttons shown in this chat and confirm here.\n` +
      `- Scientific caution: never claim laboratory assay certainty, commercial ore grade, or gem valuation; distinguish field clues from lab tests; keep non-greeting answers clear, structured, and concise (80-200 words).` +
      contextSection +
      historySection +
      documentSection +
      `\n\nContributor Message: ${cleanQuestion}`;

    const qaModels = uniqueValidModels([env.GEMINI_MODEL, 'gemini-4-argon', ...VALID_GEMINI_TEXT_MODELS]);

    let lastQaErr: unknown = null;
    let retryAttempt = 0;
    for (const model of qaModels) {
      try {
        const callPromise = this.ai.models.generateContent({
          model,
          contents: [{ text: promptText }, ...attachedDocumentParts],
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Gemini Q&A timed out after ${env.GEMINI_TIMEOUT_MS}ms`));
          }, env.GEMINI_TIMEOUT_MS);
          timer.unref?.();
        });
        const response = await Promise.race([callPromise, timeoutPromise]);

        const rawText = response.text?.trim() || '';
        const unsupportedMatch = rawText.match(/^\[UNSUPPORTED_TOPIC:\s*([^\]]+)\]/i);
        if (unsupportedMatch) {
          return buildUnsupportedInputWarning({
            channel: 'mobile',
            inputKind: 'text',
            detectedSubject: unsupportedMatch[1]?.trim() || null,
          });
        }

        if (rawText) return rawText;
      } catch (err: unknown) {
        lastQaErr = err;
        const classification = classifyGeminiError(err);
        if (classification === 'retryable') {
          await geminiRetryDelay(retryAttempt++);
        }
        logger.warn(`Gemini Q&A generation with ${model} failed (${classification}); trying the next available model...`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const textFallbackAnswer = await aiTextFallbackService.answerQuestion(promptText);
    if (textFallbackAnswer) {
      const unsupportedMatch = textFallbackAnswer.match(/^\[UNSUPPORTED_TOPIC:\s*([^\]]+)\]/i);
      if (unsupportedMatch) {
        return buildUnsupportedInputWarning({
          channel: 'mobile',
          inputKind: 'text',
          detectedSubject: unsupportedMatch[1]?.trim() || null,
        });
      }
      return textFallbackAnswer;
    }

    logger.warn('Gemini Q&A generation exhausted fallback chain; returning cautious fallback response', {
      error: lastQaErr instanceof Error ? lastQaErr.message : String(lastQaErr),
    });

    if (isSimpleGreeting) {
      if (observationContext) {
        return `Hello! I'm ready to help with ${observationContext.passportId}. Ask a question about this specimen, record a voice note, or attach another angle or location pin.`;
      }
      return `Hello! How can I help with your field work today? You can ask a geology question, share a field location, or attach a specimen or outcrop photo for GeoAI analysis.`;
    }

    if (observationContext) {
      return `Your note on ${observationContext.passportId} ("${cleanQuestion}") has been recorded with your observation. AI follow-up commentary is temporarily unavailable, so your field report is preserved verbatim.`;
    }
    return `I received your question: "${cleanQuestion}". Earth Talk's live Q&A model is temporarily unreachable—please try again shortly, or send a photo or short video clip for specimen analysis.`;
  }

  /**
   * Transcribes a spoken voice note and provides a cautious GeoAI response.
   */
  async transcribeAndAnswerVoiceNote(
    audioBase64: string,
    mimeType: string,
    observationContext?: {
      passportId: string;
      category: string;
      possibleName?: string | null;
      interpretation: string;
      features?: string[];
      userNotes?: string | null;
    } | null
  ): Promise<{ transcript: string; reply: string; isOffTopic?: boolean }> {
    const cleanBase64 = audioBase64.includes(',')
      ? audioBase64.slice(audioBase64.indexOf(',') + 1)
      : audioBase64.trim();

    const transcriptionModels = uniqueValidModels([
      'gemini-3.5-transcribe',
      'gemini-3.5-flash-lite',
      'gemini-4-hydrogen',
      'gemini-3.1-flash-lite',
    ]);
    let transcript: string | null = null;
    let lastTranscribeErr: unknown = null;
    let retryAttempt = 0;

    for (const model of transcriptionModels) {
      try {
        const callPromise = this.ai.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'audio/webm',
                  data: cleanBase64,
                },
              },
              {
                text: 'Transcribe the speaker accurately in plain text. Output only the spoken words.',
              },
            ],
          },
        });
        const timeoutPromise = new Promise<never>((_, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Gemini transcription timed out after ${env.GEMINI_TIMEOUT_MS}ms`));
          }, env.GEMINI_TIMEOUT_MS);
          timer.unref?.();
        });
        const transcriptionResponse = await Promise.race([callPromise, timeoutPromise]);
        transcript = (transcriptionResponse.text || '').trim();
        break;
      } catch (err: unknown) {
        lastTranscribeErr = err;
        const classification = classifyGeminiError(err);
        if (classification === 'retryable') {
          await geminiRetryDelay(retryAttempt++);
        }
        logger.warn(`Gemini voice note transcription with ${model} failed (${classification}); trying the next available model...`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (transcript === null) {
      logger.warn('Gemini voice note transcription exhausted fallback chain', {
        error: lastTranscribeErr instanceof Error ? lastTranscribeErr.message : String(lastTranscribeErr),
      });
      return {
        transcript: '',
        reply:
          '🎙️ Voice note received! Live audio transcription is temporarily unavailable, so you can also type a short caption or send a photo/video directly.',
      };
    }

    if (!transcript) {
      return {
        transcript: '',
        reply:
          '🎙️ Voice note received, though I could not make out clear speech. Try recording in a quieter spot or type your question below.',
      };
    }

    const offTopicCheck = detectOffTopicText(transcript);
    if (offTopicCheck.isOffTopic) {
      const warning = buildUnsupportedInputWarning({
        channel: 'mobile',
        inputKind: 'voice',
        detectedSubject: offTopicCheck.detectedTopic,
      });
      return {
        transcript,
        reply: `🎙️ Transcribed: "${transcript}"\n\n${warning}`,
        isOffTopic: true,
      };
    }

    const answer = await this.answerGeoscienceQuestion(transcript, observationContext);
    const isOffTopic = answer.startsWith('⚠️ Unsupported');
    return {
      transcript,
      reply: `🎙️ Transcribed: "${transcript}"\n\n${answer}`,
      isOffTopic,
    };
  }
}

export const geminiService = new GeminiService();


