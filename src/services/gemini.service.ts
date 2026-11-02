import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
<<<<<<< HEAD
import {
  buildUnsupportedInputWarning,
  detectOffTopicText,
} from '../ai/domain-scope.js';
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import { logger } from '../utils/logger.js';
import { GEOLOGICAL_SYSTEM_INSTRUCTION, buildGeologicalUserPrompt } from '../ai/geological.prompt.js';
import { geologicalResponseSchema, validateGeologicalResponse } from '../ai/geological.schema.js';
import { GeologicalAnalysisError, type GeoscienceAnalysisResult } from '../ai/geological.types.js';
import {
  GEOSCIENCE_INTELLIGENCE_SYSTEM_INSTRUCTION,
  buildIntelligenceUserPrompt,
} from '../ai/geoscience-intelligence.prompt.js';
import { intelligenceResponseSchema, validateIntelligenceResponse } from '../ai/geoscience-intelligence.schema.js';
import type { MediaPart, ObservationIntelligenceContext, RawIntelligenceExtras } from '../ai/geoscience-intelligence.types.js';

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
<<<<<<< HEAD
    mediaType: 'image' | 'video' = 'image',
    supportingImages?: Array<{ buffer: Buffer; mimeType: string }>
  ): Promise<GeoscienceAnalysisResult> {
    const modelsToTry = [
      env.GEMINI_MODEL,
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-3.1-flash-lite',
    ].filter((m): m is string => Boolean(m && m.trim()));
=======
    mediaType: 'image' | 'video' = 'image'
  ): Promise<GeoscienceAnalysisResult> {
    const modelsToTry = [
      env.GEMINI_MODEL,
      env.GEMINI_MODEL !== 'gemini-2.5-flash' ? 'gemini-2.5-flash' : null,
      'gemini-2.5-flash-lite',
    ].filter((m): m is string => Boolean(m) && m !== '');
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

    const uniqueModels = Array.from(new Set(modelsToTry));
    let lastError: unknown = null;

    for (const model of uniqueModels) {
      try {
        const startTime = Date.now();
        logger.info(`Gemini geoscience analysis started with model ${model}`, {
          mimeType,
          mediaType,
          mediaBytes: mediaBuffer.length,
<<<<<<< HEAD
          supportingCount: supportingImages?.length ?? 0,
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
        });

        const result = await this.executeAnalysisWithTimeout(
          mediaBuffer,
          mimeType,
          userCaption,
          model,
<<<<<<< HEAD
          mediaType,
          supportingImages
=======
          mediaType
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
        const isAuthError = err instanceof Error && /api key|unauthorized|forbidden|401|403/i.test(err.message);
        const isQuotaError =
          err instanceof Error &&
          /quota|rate limit|429|resource_exhausted|exceeded your current quota/i.test(err.message);

        if (isAuthError) {
          logger.error('Gemini authentication failed. Please verify GEMINI_API_KEY.');
          throw new GeologicalAnalysisError('GEMINI_AUTH_ERROR', 'Gemini authentication failure', err);
        }

        if (isQuotaError) {
          logger.warn(`Model ${model} quota exhausted. Trying fallback model if available...`, {
            error: err instanceof Error ? err.message : 'Quota exceeded',
          });
          continue;
        }

        logger.warn(`Gemini geoscience analysis with ${model} failed, trying fallback...`, {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    if (lastError instanceof GeologicalAnalysisError) {
      throw lastError;
    }
    const finalMsg = lastError instanceof Error ? lastError.message : 'Gemini analysis failed';
    throw new GeologicalAnalysisError('GEMINI_API_ERROR', finalMsg, lastError);
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

    const modelsToTry = [
      env.GEMINI_MODEL,
<<<<<<< HEAD
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-3.1-flash-lite',
    ].filter((m): m is string => Boolean(m && m.trim()));
=======
      env.GEMINI_MODEL !== 'gemini-2.5-flash' ? 'gemini-2.5-flash' : null,
      'gemini-2.5-flash-lite',
    ].filter((m): m is string => Boolean(m) && m !== '');
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

    const uniqueModels = Array.from(new Set(modelsToTry));
    let lastError: unknown = null;

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
        const isAuthError =
          err instanceof Error && /api key|unauthorized|forbidden|401|403/i.test(err.message);
        const isQuotaError =
          err instanceof Error &&
          /quota|rate limit|429|resource_exhausted|exceeded your current quota/i.test(err.message);

        if (isAuthError) {
          logger.error('Gemini authentication failed. Please verify GEMINI_API_KEY.');
          throw new GeologicalAnalysisError('GEMINI_AUTH_ERROR', 'Gemini authentication failure', err);
        }

        if (isQuotaError) {
          logger.warn(`Model ${model} quota exhausted. Trying fallback model if available...`, {
            error: err instanceof Error ? err.message : 'Quota exceeded',
          });
          continue;
        }

        logger.warn(`Gemini context-aware analysis with ${model} failed, trying fallback...`, {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    if (lastError instanceof GeologicalAnalysisError) {
      throw lastError;
    }
    const finalMsg = lastError instanceof Error ? lastError.message : 'Gemini context-aware analysis failed';
    throw new GeologicalAnalysisError('GEMINI_API_ERROR', finalMsg, lastError);
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
<<<<<<< HEAD
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
=======
    mediaType: 'image' | 'video' = 'image'
  ): Promise<GeoscienceAnalysisResult> {
    const base64Data = mediaBuffer.toString('base64');
    const userPrompt = buildGeologicalUserPrompt({ userCaption, mediaType });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

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
<<<<<<< HEAD
          ...extraImageParts,
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
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
    } | null
  ): Promise<string> {
    const offTopicCheck = detectOffTopicText(question);
    if (offTopicCheck.isOffTopic) {
      return buildUnsupportedInputWarning({
        channel: 'mobile',
        inputKind: 'text',
        detectedSubject: offTopicCheck.detectedTopic,
      });
    }

    const contextSection = observationContext
      ? `\n\nActive Observation Context (${observationContext.passportId}):\n` +
        `- Category: ${observationContext.category}${observationContext.possibleName ? ` (${observationContext.possibleName})` : ''}\n` +
        `- Preliminary AI Interpretation: ${observationContext.interpretation}\n` +
        (observationContext.features && observationContext.features.length > 0
          ? `- Observed Features: ${observationContext.features.join(', ')}\n`
          : '') +
        (observationContext.userNotes ? `- Contributor Field Notes: ${observationContext.userNotes}\n` : '')
      : '';

    const promptText =
      `You are Earth Talk's cautious GeoAI field assistant, strictly dedicated to Earth Talk's supported geoscience scope:\n` +
      `- What was observed: geological layers (stratigraphy), rocks, landforms, fossils, minerals, geological structures (bedding, faults, folds, veins), volcanic features, springs/seeps, mining outcrops, and slope exposures.\n` +
      `- Rock type: Igneous, Sedimentary, Metamorphic, Unclassified.\n` +
      `- Evidence state: AI-assisted preliminary reading, Community supported/investigated, Expert reviewed.\n` +
      `Domain enforcement rule:\n` +
      `- If the user's message is unrelated to geoscience, geology, landforms, minerals, fossils, earth science, or how Earth Talk works (for example testing the AI with shoes, clothes, fashion, food, sports, shopping, coding, or everyday non-geological topics), DO NOT answer the off-topic question. Instead output ONLY a single line starting with: [UNSUPPORTED_TOPIC: <short name of what they asked about>]\n` +
      `Scientific safety rules:\n` +
      `- Never claim laboratory certainty, commercial ore grade, or gem valuation.\n` +
      `- Distinguish clearly between visual field clues and laboratory confirmation.\n` +
      `- Keep answers clear, educational, and concise (120-220 words).` +
      contextSection +
      `\n\nContributor Message / Question: ${question}`;

    const qaModels = Array.from(
      new Set(
        [env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'].filter(
          (m): m is string => Boolean(m && m.trim())
        )
      )
    );

    let lastQaErr: unknown = null;
    for (const model of qaModels) {
      try {
        const callPromise = this.ai.models.generateContent({
          model,
          contents: [{ text: promptText }],
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

        return (
          rawText ||
          `Earth Talk helps you explore geological layers, rocks, landforms, fossils, and minerals. Send a clear daylight photo or short video, or ask a specific Earth-science question.`
        );
      } catch (err: unknown) {
        lastQaErr = err;
        logger.warn(`Gemini Q&A generation with ${model} failed; trying fallback if available`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.warn('Gemini Q&A generation exhausted fallback chain; returning cautious fallback response', {
      error: lastQaErr instanceof Error ? lastQaErr.message : String(lastQaErr),
    });
    if (observationContext) {
      return `Your note on ${observationContext.passportId} ("${question}") has been recorded with your observation. AI follow-up commentary is temporarily unavailable, so your field report is preserved verbatim.`;
    }
    return `I received your question: "${question}". Earth Talk's live Q&A model is temporarily unreachable—please try again shortly, or send a photo or short video clip for specimen analysis.`;
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

    const transcriptionModels = ['gemini-3.5-transcribe', 'gemini-3.8-flash', 'gemini-2.5-flash'];
    let transcript: string | null = null;
    let lastTranscribeErr: unknown = null;

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
        logger.warn(`Gemini voice note transcription with ${model} failed; trying fallback`, {
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


=======
}

export const geminiService = new GeminiService();
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
