import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { validateMedia } from '../utils/image-validator.js';
import { checkDistributedRateLimit, rateLimiter } from '../utils/rate-limiter.js';
import { geminiService } from './gemini.service.js';
import { geoscienceIntelligenceService } from './geoscience-intelligence.service.js';
import type { MediaPart } from '../ai/geoscience-intelligence.types.js';
import { observationService, type ObservationLocationInput } from './observation.service.js';
import { communityPostRepository } from '../repositories/community-post.repository.js';
import { observationRepository } from '../repositories/observation.repository.js';
import { publicObservationRepository } from '../repositories/public-observation.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { isServiceUnavailableError } from '../utils/service-error.js';
import { normalizeDistrictName, resolvePublicCoordinates } from '../utils/public-location.js';
import { hashUserPhoneNumber } from '../utils/crypto.js';
import { hashContributor, normalizeContributorToken } from '../utils/contributor.js';
import {
  distanceBetweenPointsKm,
  extractExifGpsFromBuffer,
  type ExtractedExifGps,
} from '../utils/exif-gps.js';
import { GeologicalAnalysisError, type GeoscienceAnalysisResult } from '../ai/geological.types.js';
import {
  buildUnsupportedInputWarning,
  describeUnsupportedVisualSubject,
  isNonGeoscienceAnalysis,
} from '../ai/domain-scope.js';
import type { GeoscienceCategory } from '../ai/geoscience-taxonomy.js';
import type { EvidenceState } from '../types/community.types.js';
import type { MediaRole } from '../types/community-posts.types.js';
import type { Viewer } from '../utils/user-auth.js';
import type { PublicLocationPrecision, ObservationRow } from '../types/database.types.js';

export type PinConfirmationDecision = 'pin_exact' | 'pin_approximate' | 'pin_district' | 'keep_private';

export type SpecimenFieldContext =
  | 'in_situ_outcrop'
  | 'road_cut_exposure'
  | 'loose_float_talus'
  | 'stream_cobble'
  | 'quarry_mine'
  | 'hand_sample_core';

const SPECIMEN_CONTEXT_LABELS: Record<SpecimenFieldContext, string> = {
  in_situ_outcrop: 'In-situ bedrock outcrop (attached to host rock)',
  road_cut_exposure: 'Road cut / excavated slope exposure',
  loose_float_talus: 'Loose float / detached boulder (may have moved downslope)',
  stream_cobble: 'Stream / river cobble (transported from upstream source)',
  quarry_mine: 'Quarry face / mine working or spoil pile',
  hand_sample_core: 'Collected hand specimen / drill core',
};

export interface SupportingMediaInput {
  content_base64: string;
  mime_type?: string;
  caption?: string;
  role?: MediaRole;
}

export interface ConfirmPinInput {
  passport_id: string;
  decision: PinConfirmationDecision;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  location_text?: string | null;
  post_title?: string | null;
  user_report?: string | null;
  contributor_token?: string | null;
}

export interface ConfirmPinResult {
  passport_id: string;
  is_public: boolean;
  precision: PublicLocationPrecision;
  district: string | null;
  public_latitude: number | null;
  public_longitude: number | null;
}

export interface PhotoSubmissionLocation {
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
  location_text?: string | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  location_origin?: 'photo_exif' | 'live_gps' | 'manual_map' | 'district_only';
  public_location_precision?: PublicLocationPrecision;
}

export interface PhotoSubmissionInput {
  content_base64: string;
  mime_type?: string;
  caption?: string;
  primary_media_caption?: string | null;
  post_title?: string;
  location?: PhotoSubmissionLocation;
  specimen_context?: SpecimenFieldContext | null;
  has_scale_reference?: boolean;
  has_fresh_surface?: boolean;
  supporting_media?: SupportingMediaInput[];
  contributor_token?: string | null;
  site_id?: string | null;
  is_public?: boolean;
}

export interface PhotoSubmissionResult {
  passport_id: string;
  observation_id: string;
  status: 'completed';
  category: GeoscienceCategory;
  subcategory: string;
  primary_classification: string;
  possible_name: string | null;
  confidence: string;
  confidence_score: number;
  primary_interpretation: string;
  geological_context: string | null;
  observed_features: string[];
  diagnostic_features: string[];
  reasoning: string;
  alternative_possibilities: string[];
  uncertainties: string[];
  limitations: string[];
  recommended_next_steps: string[];
  questions_for_user: string[];
  safety_note: string;
  evidence_state: EvidenceState;
  created_at: string;
  is_public: boolean;
  location_attached: boolean;
  disclaimer: string;
  gps_mismatch_km: number | null;
  supporting_media_count: number;
  location: {
    latitude: number | null;
    longitude: number | null;
    district: string | null;
    precision: PublicLocationPrecision;
    origin?: 'photo_exif' | 'live_gps' | 'manual_map' | 'district_only';
  } | null;
  exif_location?: {
    has_gps: boolean;
    found: boolean;
    detected: boolean;
    latitude: number | null;
    longitude: number | null;
    altitude_meters: number | null;
    accuracy_meters: number | null;
    captured_at: string | null;
    within_rwanda: boolean;
    suggested_district: string | null;
    inferred_district: string | null;
    gps_mismatch_km: number | null;
  };
  media: {
    media_id: string;
    mime_type: string;
    file_size: number;
    file_size_bytes: number;
    sha256: string;
  };
  supporting_media_stored: Array<{
    media_id: string;
    kind: 'image' | 'video';
    mime_type: string;
    role: MediaRole;
    caption: string | null;
  }>;
}

function buildSourceHashForSubmission(
  viewer?: Viewer | null,
  contributorToken?: string | null,
  clientIp?: string,
  fallbackId?: string
): string {
  const normalizedToken = normalizeContributorToken(contributorToken ?? undefined);
  if (!viewer?.userId && normalizedToken) {
    return hashContributor(`web:${normalizedToken}`);
  }
  if (viewer?.publicUserId) {
    return hashUserPhoneNumber(viewer.publicUserId);
  }
  if (clientIp) {
    return hashUserPhoneNumber(`ip:${clientIp}`);
  }
  return hashUserPhoneNumber(`anonymous-${fallbackId ?? crypto.randomUUID()}`);
}

export async function doesCallerOwnObservation(
  observation: ObservationRow,
  viewer?: Viewer | null,
  contributorToken?: string | null,
  clientIp?: string
): Promise<boolean> {
  if (observation.owner_user_id) {
    return Boolean(viewer?.userId && observation.owner_user_id === viewer.userId);
  }
  if (viewer?.userId) {
    if (
      viewer.publicUserId &&
      observation.source_user_hash === hashUserPhoneNumber(viewer.publicUserId)
    ) {
      return true;
    }
    const account = await userRepository.findUserById(viewer.userId);
    if (account?.phone_hash && observation.source_user_hash === account.phone_hash) {
      return true;
    }
  }
  const normalizedToken = normalizeContributorToken(contributorToken ?? undefined);
  if (normalizedToken) {
    const tokenHash = hashContributor(`web:${normalizedToken}`);
    if (observation.source_user_hash === tokenHash) {
      return true;
    }
  }
  if (clientIp && observation.source_user_hash === hashUserPhoneNumber(`ip:${clientIp}`)) {
    return true;
  }
  return false;
}

export class PhotoSubmissionService {
  async submitObservation(
    input: PhotoSubmissionInput,
    viewer?: Viewer | null,
    clientIp?: string
  ): Promise<PhotoSubmissionResult> {
    // 1. Rate limiting check (in-memory + distributed database bucket when configured)
    const rateLimitKey = viewer?.userId || clientIp || 'anonymous_mobile_submitter';
    const distributedAllowed = await checkDistributedRateLimit(
      `ai_submit:${rateLimitKey}`,
      env.AI_RATE_LIMIT_PER_USER,
      env.AI_RATE_LIMIT_WINDOW_SECONDS * 1000
    );
    if (!distributedAllowed || rateLimiter.isRateLimited(rateLimitKey)) {
      throw new GeologicalAnalysisError(
        'GEMINI_RATE_LIMIT_ERROR',
        'Submission limit reached. Please wait before submitting another observation.'
      );
    }

    // 2. Base64 payload validation
    const rawEncoded = String(input.content_base64 ?? '').trim();
    if (!rawEncoded) {
      throw new GeologicalAnalysisError('IMAGE_VALIDATION_ERROR', 'No image content was provided in the submission.');
    }

    const base64 = rawEncoded.includes(',') ? rawEncoded.slice(rawEncoded.indexOf(',') + 1) : rawEncoded;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new GeologicalAnalysisError('IMAGE_VALIDATION_ERROR', 'The uploaded image could not be decoded from base64.');
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length < 100) {
      throw new GeologicalAnalysisError('IMAGE_VALIDATION_ERROR', 'The uploaded image file is empty or corrupted.');
    }

    if (buffer.length > env.MAX_IMAGE_SIZE_BYTES) {
      const maxMb = Math.floor(env.MAX_IMAGE_SIZE_BYTES / 1_000_000);
      throw new GeologicalAnalysisError(
        'IMAGE_VALIDATION_ERROR',
        `Image file is too large (${(buffer.length / 1_000_000).toFixed(1)} MB). Maximum allowed size is ${maxMb} MB.`
      );
    }

    // 3. Media magic bytes & IMAGE-ONLY GeoAI enforcement
    const validation = validateMedia(buffer, input.mime_type);
    if (!validation.isValid || !validation.detectedMimeType) {
      throw new GeologicalAnalysisError(
        'MEDIA_VALIDATION_ERROR',
        validation.userMessage || 'Only valid JPEG, PNG, and WebP images are supported for geological analysis.'
      );
    }

    if (validation.mediaKind === 'video') {
      throw new GeologicalAnalysisError(
        'MEDIA_VALIDATION_ERROR',
        'GeoAI analyzes still photos (JPEG, PNG, WebP) only. Please upload a clear specimen or outcrop photo for GeoAI analysis, and attach videos as supporting site media on your post or pin.'
      );
    }

    const detectedMime = validation.detectedMimeType;

    // 3b. Extract embedded EXIF GPS & capture timestamp from photo bytes (critical when photo was taken earlier!)
    const exif: ExtractedExifGps =
      detectedMime === 'image/jpeg'
        ? extractExifGpsFromBuffer(buffer)
        : {
            hasGps: false,
            latitude: null,
            longitude: null,
            altitudeMeters: null,
            accuracyMeters: null,
            capturedAt: null,
            withinRwanda: false,
            suggestedDistrict: null,
          };

    // 4. Clean user caption, geological field context, and title
    const contextTags: string[] = [];
    if (input.specimen_context && SPECIMEN_CONTEXT_LABELS[input.specimen_context]) {
      contextTags.push(`Sampling context: ${SPECIMEN_CONTEXT_LABELS[input.specimen_context]}`);
    }
    if (input.has_scale_reference) {
      contextTags.push('Scale object included in photo');
    }
    if (input.has_fresh_surface) {
      contextTags.push('Fresh unweathered fracture surface visible');
    }
    if (exif.capturedAt) {
      contextTags.push(`Original photo capture date: ${exif.capturedAt}`);
    }
    if (exif.altitudeMeters !== null) {
      contextTags.push(`Photo EXIF elevation: ${exif.altitudeMeters} m`);
    }

    const rawUserCaption =
      typeof input.caption === 'string' && input.caption.trim().length > 0
        ? input.caption.trim().slice(0, 1800)
        : '';

    const combinedCaptionParts = [
      rawUserCaption || null,
      contextTags.length > 0 ? `[Field metadata: ${contextTags.join(' · ')}]` : null,
    ].filter(Boolean);

    const caption = combinedCaptionParts.length > 0 ? combinedCaptionParts.join('\n').slice(0, 2000) : undefined;

    const postTitle =
      typeof input.post_title === 'string' && input.post_title.trim().length > 0
        ? input.post_title.trim().slice(0, 160)
        : null;

    // 5. Geographic location validation + EXIF GPS automatic recovery & mismatch check
    let locationInput: ObservationLocationInput | undefined = undefined;
    let resolvedOrigin: 'photo_exif' | 'live_gps' | 'manual_map' | 'district_only' | undefined =
      input.location?.location_origin;
    let gpsMismatchKm: number | null = null;

    if (input.location) {
      const {
        latitude,
        longitude,
        accuracy_meters,
        location_text,
        district,
        sector,
        cell,
        village,
        public_location_precision,
      } = input.location;

      if (latitude !== undefined && latitude !== null) {
        if (typeof latitude !== 'number' || isNaN(latitude) || latitude < -90 || latitude > 90) {
          throw new GeologicalAnalysisError(
            'INTERNAL_ERROR',
            `Invalid latitude: ${latitude}. Must be between -90 and 90.`
          );
        }
      }

      if (longitude !== undefined && longitude !== null) {
        if (typeof longitude !== 'number' || isNaN(longitude) || longitude < -180 || longitude > 180) {
          throw new GeologicalAnalysisError(
            'INTERNAL_ERROR',
            `Invalid longitude: ${longitude}. Must be between -180 and 180.`
          );
        }
      }

      const effectiveLat = latitude ?? (exif.hasGps ? exif.latitude : null);
      const effectiveLng = longitude ?? (exif.hasGps ? exif.longitude : null);
      const effectiveDistrict =
        normalizeDistrictName(district) ??
        (exif.hasGps ? exif.suggestedDistrict : null) ??
        district ??
        null;

      if (
        latitude != null &&
        longitude != null &&
        exif.hasGps &&
        exif.latitude !== null &&
        exif.longitude !== null
      ) {
        const diff = distanceBetweenPointsKm(latitude, longitude, exif.latitude, exif.longitude);
        if (Number.isFinite(diff) && diff >= 0.5) {
          gpsMismatchKm = Number(diff.toFixed(2));
        }
      }

      if (!resolvedOrigin) {
        if (latitude == null && exif.hasGps) resolvedOrigin = 'photo_exif';
        else if (effectiveLat != null && effectiveLng != null) resolvedOrigin = 'live_gps';
        else if (effectiveDistrict) resolvedOrigin = 'district_only';
      }

      const precision: PublicLocationPrecision =
        public_location_precision &&
        ['private', 'district', 'approximate', 'exact'].includes(public_location_precision)
          ? public_location_precision
          : 'private';

      locationInput = {
        latitude: effectiveLat,
        longitude: effectiveLng,
        accuracyMeters: accuracy_meters ?? exif.accuracyMeters ?? null,
        locationText: location_text ?? (resolvedOrigin === 'photo_exif' && exif.capturedAt ? `Recovered from photo EXIF (${exif.capturedAt})` : null),
        district: effectiveDistrict,
        sector: sector ?? null,
        cell: cell ?? null,
        village: village ?? null,
        locationSource: effectiveLat != null && effectiveLng != null ? 'user_gps' : 'user_manual',
        publicLocationPrecision: precision,
      };
    } else if (exif.hasGps && exif.latitude !== null && exif.longitude !== null) {
      // Photo was taken earlier outside the app & uploaded without live GPS — recover EXIF coordinates privately!
      resolvedOrigin = 'photo_exif';
      locationInput = {
        latitude: exif.latitude,
        longitude: exif.longitude,
        accuracyMeters: exif.accuracyMeters ?? null,
        locationText: exif.capturedAt
          ? `Recovered from photo EXIF metadata (captured ${exif.capturedAt})`
          : 'Recovered from photo EXIF metadata',
        district: exif.suggestedDistrict,
        locationSource: 'user_gps',
        publicLocationPrecision: 'private',
      };
    }

    logger.info('Starting shared GeoAI image analysis for photo submission', {
      mediaBytes: buffer.length,
      mimeType: detectedMime,
      hasLocation: Boolean(locationInput?.latitude != null),
      exifGpsRecovered: exif.hasGps,
      supportingMediaCount: Array.isArray(input.supporting_media) ? input.supporting_media.length : 0,
      viewerId: viewer?.userId ?? 'anonymous',
    });

    // 5b. Pre-validate supporting media items so valid supporting photos travel with the primary
    //     photo in a single multimodal GeoAI request while videos stay excluded from AI analysis.
    interface PrevalidatedSupportingItem {
      idx: number;
      base64: string;
      buffer: Buffer;
      kind: 'image' | 'video';
      mimeType: string;
      role: MediaRole;
      viewType: MediaPart['viewType'];
      caption: string | null;
    }
    const prevalidatedSupporting: PrevalidatedSupportingItem[] = [];
    if (Array.isArray(input.supporting_media) && input.supporting_media.length > 0) {
      const items = input.supporting_media.slice(0, 6);
      for (let idx = 0; idx < items.length; idx++) {
        const sup = items[idx];
        const supRaw = String(sup?.content_base64 ?? '').trim();
        if (!supRaw) continue;
        const supBase64 = supRaw.includes(',') ? supRaw.slice(supRaw.indexOf(',') + 1) : supRaw;
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(supBase64)) continue;
        const supBuf = Buffer.from(supBase64, 'base64');
        if (supBuf.length === 0 || supBuf.length > env.POST_MEDIA_MAX_STORED_BYTES) continue;

        const supVal = validateMedia(supBuf, sup.mime_type);
        if (!supVal.isValid || !supVal.mediaKind || !supVal.detectedMimeType) continue;

        const supKind = supVal.mediaKind;
        const defaultRole: MediaRole = supKind === 'video' ? 'video' : 'field';
        const supRole: MediaRole =
          sup.role && ['main', 'close_up', 'field', 'context', 'video', 'other'].includes(sup.role)
            ? (supKind === 'video' ? 'video' : sup.role)
            : defaultRole;
        const rawRole = String(sup.role ?? '');
        const viewType: MediaPart['viewType'] =
          supKind === 'video'
            ? 'video_frame'
            : rawRole === 'close_up' || rawRole === 'scale'
              ? 'closeup'
              : rawRole === 'field'
                ? 'outcrop'
                : rawRole === 'context'
                  ? 'environmental'
                  : 'texture';
        const supCaption =
          typeof sup.caption === 'string' && sup.caption.trim().length > 0
            ? sup.caption.trim().slice(0, 300)
            : null;

        prevalidatedSupporting.push({
          idx,
          base64: supBase64,
          buffer: supBuf,
          kind: supKind,
          mimeType: supVal.detectedMimeType,
          role: supRole,
          viewType,
          caption: supCaption,
        });
      }
    }

    const supportingImageParts: MediaPart[] = prevalidatedSupporting
      .filter((item) => item.kind === 'image')
      .slice(0, 5)
      .map((item) => ({
        buffer: item.buffer,
        mimeType: item.mimeType,
        viewType: item.viewType,
        caption: item.caption,
      }));

    // 6. Invoke shared GeoAI advanced intelligence pipeline (primary photo + supporting photos in 1 multimodal call)
    let aiResult: GeoscienceAnalysisResult;
    try {
      const intel = await geoscienceIntelligenceService.analyzeIntelligence({
        media: [{ buffer, mimeType: detectedMime, viewType: 'overview' }, ...supportingImageParts],
        userDescription: caption,
        latitude: locationInput?.latitude,
        longitude: locationInput?.longitude,
      });
      aiResult = intel.baseAnalysis ?? {
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
      logger.warn('Advanced intelligence failed in mobile photo submission, trying base pipeline', {
        error: String(intelErr),
      });
      aiResult = await geminiService.analyzeGeoscienceMedia(
        buffer,
        detectedMime,
        caption,
        'image',
        supportingImageParts.map((part) => ({ buffer: part.buffer, mimeType: part.mimeType }))
      );
    }

    if (isNonGeoscienceAnalysis(aiResult)) {
      const detectedSubject = describeUnsupportedVisualSubject(aiResult, caption);
      throw new GeologicalAnalysisError(
        'NON_GEOSCIENCE_SUBMISSION',
        buildUnsupportedInputWarning({
          channel: 'mobile',
          inputKind: 'media',
          detectedSubject,
        })
      );
    }

    if (
      aiResult.observation_category === 'insufficient_image' ||
      aiResult.primary_classification === 'insufficient_image' ||
      aiResult.confidence === 'insufficient'
    ) {
      throw new GeologicalAnalysisError(
        'INSUFFICIENT_IMAGE_QUALITY',
        'This photo does not contain enough clear visual detail for a reliable geological reading. Please retake the photo in bright natural daylight, hold the camera steady in sharp focus, include a fresh unweathered surface and a scale object if safe, and submit again. No permanent Geoscience Passport was created.'
      );
    }

    // 7. Persist observation into database / repository
    const messageId = `mobile:${crypto.randomUUID()}`;
    const mediaId = `mobile_media:${crypto.randomUUID()}`;
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    const sourceUserHash = buildSourceHashForSubmission(
      viewer,
      input.contributor_token,
      clientIp,
      messageId
    );

    const isPublic = Boolean(input.is_public);

    const primaryMediaCaption =
      typeof input.primary_media_caption === 'string' && input.primary_media_caption.trim().length > 0
        ? input.primary_media_caption.trim().slice(0, 300)
        : (rawUserCaption || null);

    const observation: ObservationRow = await observationService.createRockPassport({
      aiResult,
      sourceUserHash,
      ownerUserId: viewer?.userId ?? null,
      source: 'mobile',
      postTitle,
      userReport: rawUserCaption || null,
      publicationStatus: isPublic ? 'public' : 'private',
      messageId,
      media: {
        buffer,
        mimeType: detectedMime,
        fileSize: buffer.length,
        mediaId,
        mediaType: 'image',
        captureDate: exif.capturedAt ?? null,
        contentBase64: base64,
        storageStatus: 'stored',
        mediaRole: 'main',
        sortOrder: 0,
        isPublic,
        visibility: isPublic ? 'public' : 'private',
        storedByUserId: viewer?.userId ?? null,
        caption: primaryMediaCaption,
      },
      userCaption: caption,
      location: locationInput,
      siteId: input.site_id ?? null,
    });

    // 8. Persist pre-validated supporting site media (extra angle/scale photos + outcrop videos)
    const storedSupportingMedia: PhotoSubmissionResult['supporting_media_stored'] = [];
    for (const supItem of prevalidatedSupporting) {
      const supSourceId = `support_media:${crypto.randomUUID()}`;
      try {
        const inserted = await communityPostRepository.insertMedia({
          observation_id: observation.id,
          media_type: supItem.kind,
          mime_type: supItem.mimeType,
          file_size: supItem.buffer.length,
          sha256: crypto.createHash('sha256').update(supItem.buffer).digest('hex'),
          source_media_id: supSourceId,
          storage_status: 'stored',
          caption: supItem.caption,
          media_role: supItem.role,
          sort_order: supItem.idx + 1,
          is_public: isPublic,
          content_base64: supItem.base64,
          stored_by_user_id: viewer?.userId ?? null,
          visibility: isPublic ? 'public' : 'private',
        });
        storedSupportingMedia.push({
          media_id: inserted.id,
          kind: supItem.kind,
          mime_type: supItem.mimeType,
          role: supItem.role,
          caption: supItem.caption,
        });
      } catch (err: unknown) {
        if (isServiceUnavailableError(err)) {
          throw err;
        }
        logger.warn('Could not store supporting media item', {
          observationId: observation.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const totalMediaCount = 1 + storedSupportingMedia.length;

    // 9. Sync with in-memory public repository if public (live Supabase reads public_observations directly)
    if (isPublic && !isDatabaseConfigured()) {
      const pubPrecision = locationInput?.publicLocationPrecision ?? 'private';
      const pubCoords =
        pubPrecision !== 'private'
          ? resolvePublicCoordinates({
              precision: pubPrecision,
              district: locationInput?.district ?? null,
              latitude: locationInput?.latitude ?? null,
              longitude: locationInput?.longitude ?? null,
            })
          : null;

      try {
        publicObservationRepository.registerPublicObservation({
          passport_id: observation.passport_id,
          observation_category: observation.observation_category || 'unknown',
          observation_subcategory: observation.observation_subcategory || 'unknown',
          observation_type: observation.observation_type || undefined,
          primary_interpretation: observation.primary_interpretation,
          geological_context: observation.geological_context,
          primary_classification: observation.primary_classification,
          possible_name: observation.possible_name,
          confidence: observation.confidence,
          confidence_score: observation.confidence_score,
          verification_status: observation.verification_status,
          evidence_state: observation.evidence_state,
          community_status: observation.community_status,
          observed_features: observation.observed_features,
          diagnostic_features: observation.diagnostic_features,
          uncertainties: observation.uncertainties,
          reasoning: observation.reasoning,
          limitations: observation.limitations,
          recommended_next_steps: observation.recommended_next_steps,
          safety_note: observation.safety_note,
          data_quality_status: observation.data_quality_status,
          is_research_opportunity: false,
          media_count: totalMediaCount,
          public_media_count: totalMediaCount,
          primary_media_url: `/api/posts/${observation.passport_id}/media/${mediaId}`,
          district: pubPrecision === 'private' ? null : (locationInput?.district ?? null),
          public_location_precision: pubPrecision,
          latitude: pubCoords?.latitude ?? null,
          longitude: pubCoords?.longitude ?? null,
          created_at: observation.created_at,
          published_at: observation.created_at,
          post_title: postTitle,
          user_report: rawUserCaption || caption || null,
          is_demo: false,
        });
      } catch (err: unknown) {
        logger.warn('Could not index observation in public observation repository', {
          passportId: observation.passport_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info('Photo submission successfully processed and persisted', {
      passportId: observation.passport_id,
      category: observation.observation_category,
      evidenceState: observation.evidence_state,
      supportingMediaStored: storedSupportingMedia.length,
      isPublic,
    });

    return {
      passport_id: observation.passport_id,
      observation_id: observation.id,
      status: 'completed',
      category: observation.observation_category || 'unknown',
      subcategory: observation.observation_subcategory || 'unknown',
      primary_classification: observation.primary_classification,
      possible_name: observation.possible_name,
      confidence: observation.confidence,
      confidence_score: observation.confidence_score,
      primary_interpretation: observation.primary_interpretation || 'Geoscience observation recorded.',
      geological_context: observation.geological_context ?? null,
      observed_features: observation.observed_features ?? [],
      diagnostic_features: observation.diagnostic_features ?? [],
      reasoning: observation.reasoning ?? 'Visual macroeconomic field reading.',
      alternative_possibilities: observation.alternative_possibilities ?? [],
      uncertainties: observation.uncertainties ?? [],
      limitations: observation.limitations ?? [],
      recommended_next_steps: observation.recommended_next_steps ?? [],
      questions_for_user: observation.questions_for_user ?? [],
      safety_note: observation.safety_note ?? 'Exercise standard safety precautions in field geology.',
      evidence_state: observation.evidence_state,
      created_at: observation.created_at,
      is_public: isPublic,
      location_attached: Boolean(locationInput),
      disclaimer:
        'AI interpretations are preliminary educational observations and not certified laboratory assays or geological confirmations.',
      gps_mismatch_km: gpsMismatchKm,
      supporting_media_count: storedSupportingMedia.length,
      location: locationInput
        ? {
            latitude: locationInput.latitude ?? null,
            longitude: locationInput.longitude ?? null,
            district: locationInput.district ?? null,
            precision: locationInput.publicLocationPrecision ?? 'private',
            origin: resolvedOrigin,
          }
        : null,
      exif_location: {
        has_gps: exif.hasGps,
        found: exif.hasGps,
        detected: exif.hasGps,
        latitude: exif.latitude,
        longitude: exif.longitude,
        altitude_meters: exif.altitudeMeters,
        accuracy_meters: exif.accuracyMeters,
        captured_at: exif.capturedAt,
        within_rwanda: exif.withinRwanda,
        suggested_district: exif.suggestedDistrict,
        inferred_district: exif.suggestedDistrict,
        gps_mismatch_km: gpsMismatchKm,
      },
      media: {
        media_id: mediaId,
        mime_type: detectedMime,
        file_size: buffer.length,
        file_size_bytes: buffer.length,
        sha256,
      },
      supporting_media_stored: storedSupportingMedia,
    };
  }

  /**
   * Confirms, updates, or unpins the location & public visibility of an observation
   * after the contributor has reviewed the preliminary GeoAI summary (or later).
   */
  async confirmObservationPin(
    input: ConfirmPinInput,
    viewer?: Viewer | null,
    clientIp?: string
  ): Promise<ConfirmPinResult> {
    const cleanPassportId = String(input.passport_id ?? '').trim().toUpperCase();
    if (!cleanPassportId) {
      throw new GeologicalAnalysisError('INTERNAL_ERROR', 'A valid Passport ID is required to confirm location.');
    }

    const observation =
      (await observationService.getObservationByPassportId(cleanPassportId)) ??
      (await communityPostRepository.findObservation(cleanPassportId));

    if (!observation) {
      throw new GeologicalAnalysisError('INTERNAL_ERROR', `Observation ${cleanPassportId} was not found.`);
    }

    if (!(await doesCallerOwnObservation(observation, viewer, input.contributor_token, clientIp))) {
      throw new GeologicalAnalysisError(
        'INTERNAL_ERROR',
        'Only the contributor who submitted this observation may change its location or privacy.'
      );
    }

    if (viewer?.userId && !observation.owner_user_id) {
      await communityPostRepository.linkOwner(observation.passport_id, viewer.userId);
      observation.owner_user_id = viewer.userId;
    }

    observationService.validateCoordinates(input.latitude, input.longitude);

    const existingLoc = await communityPostRepository.findLocation(observation.id);
    const lat = input.latitude !== undefined ? input.latitude : (existingLoc?.latitude ?? null);
    const lng = input.longitude !== undefined ? input.longitude : (existingLoc?.longitude ?? null);
    const accuracy = input.accuracy_meters !== undefined ? input.accuracy_meters : (existingLoc?.accuracy_meters ?? null);
    const locText =
      typeof input.location_text === 'string' && input.location_text.trim().length > 0
        ? input.location_text.trim().slice(0, 300)
        : (existingLoc?.location_text ?? null);
    const normalizedDistrict =
      normalizeDistrictName(input.district) ??
      normalizeDistrictName(locText) ??
      existingLoc?.district ??
      null;
    const cleanAdminUnit = (val: string | null | undefined, fallback: string | null | undefined) => {
      if (val !== undefined) {
        return typeof val === 'string' && val.trim().length > 0 ? val.trim().slice(0, 120) : null;
      }
      return fallback ?? null;
    };
    const resolvedSector = cleanAdminUnit(input.sector, existingLoc?.sector);
    const resolvedCell = cleanAdminUnit(input.cell, existingLoc?.cell);
    const resolvedVillage = cleanAdminUnit(input.village, existingLoc?.village);

    let precision: PublicLocationPrecision = 'private';
    let isPublic = false;

    switch (input.decision) {
      case 'keep_private':
        precision = 'private';
        isPublic = false;
        break;
      case 'pin_district':
        precision = 'district';
        isPublic = true;
        if (!normalizedDistrict && (lat === null || lng === null)) {
          throw new GeologicalAnalysisError(
            'INTERNAL_ERROR',
            'Please choose a Rwanda district (e.g. Musanze, Rubavu, Karongi, Gasabo) or share GPS coordinates first.'
          );
        }
        break;
      case 'pin_approximate':
        precision = 'approximate';
        isPublic = true;
        if ((lat === null || lng === null) && !normalizedDistrict) {
          throw new GeologicalAnalysisError(
            'INTERNAL_ERROR',
            'Please share a GPS location pin or district before pinning to the map.'
          );
        }
        break;
      case 'pin_exact':
        precision = 'exact';
        isPublic = true;
        if (lat === null || lng === null) {
          throw new GeologicalAnalysisError(
            'INTERNAL_ERROR',
            'Exact outcrop pinning requires GPS latitude and longitude coordinates.'
          );
        }
        break;
    }

    if (lat !== null || lng !== null || normalizedDistrict || resolvedSector || resolvedCell || resolvedVillage || locText || existingLoc) {
      const savedLoc = await observationRepository.saveObservationLocation({
        observation_id: observation.id,
        location_source: lat !== null && lng !== null ? 'user_gps' : 'user_manual',
        latitude: lat,
        longitude: lng,
        accuracy_meters: accuracy,
        district: normalizedDistrict,
        sector: resolvedSector,
        cell: resolvedCell,
        village: resolvedVillage,
        location_text: locText,
        public_location_precision: precision,
        is_public: isPublic && precision !== 'private',
      });
      if (!isDatabaseConfigured()) {
        communityPostRepository.registerLocationRecord(savedLoc);
      }
    }

    if (input.post_title !== undefined || input.user_report !== undefined) {
      await communityPostRepository.updatePostFields(observation.passport_id, {
        ...(input.post_title !== undefined ? { post_title: input.post_title } : {}),
        ...(input.user_report !== undefined ? { user_report: input.user_report } : {}),
      });
    }

    const previousPrivacy = observation.publication_status;
    const nextPrivacy = isPublic ? 'public' : 'private';
    await communityPostRepository.setPublicationStatus(observation.passport_id, nextPrivacy);
    await communityPostRepository.setMediaPublicVisibility(observation.id, isPublic);
    if (previousPrivacy !== nextPrivacy) {
      await communityPostRepository.recordPrivacyAudit({
        observation_id: observation.id,
        actor_user_id: viewer?.userId ?? null,
        actor: 'owner',
        previous_privacy: previousPrivacy,
        new_privacy: nextPrivacy,
        reason: isPublic ? `pin_${precision}` : 'keep_private',
      });
    }
    observation.publication_status = nextPrivacy;

    let publicCoords: { latitude: number; longitude: number } | null = null;
    if (isPublic && precision !== 'private') {
      publicCoords = resolvePublicCoordinates({
        precision,
        district: normalizedDistrict,
        latitude: lat,
        longitude: lng,
      });
    }

    if (!isDatabaseConfigured()) {
      if (isPublic) {
        const mediaRows = await communityPostRepository.listMedia(observation.id);
        const firstImage = mediaRows.find((m) => m.media_type === 'image');
        publicObservationRepository.registerPublicObservation({
          passport_id: observation.passport_id,
          observation_category: observation.observation_category || 'unknown',
          observation_subcategory: observation.observation_subcategory || 'unknown',
          observation_type: observation.observation_type || undefined,
          primary_interpretation: observation.primary_interpretation,
          geological_context: observation.geological_context,
          primary_classification: observation.primary_classification,
          possible_name: observation.possible_name,
          confidence: observation.confidence,
          confidence_score: observation.confidence_score,
          verification_status: observation.verification_status,
          evidence_state: observation.evidence_state,
          community_status: observation.community_status,
          observed_features: observation.observed_features,
          diagnostic_features: observation.diagnostic_features,
          uncertainties: observation.uncertainties,
          reasoning: observation.reasoning,
          limitations: observation.limitations,
          recommended_next_steps: observation.recommended_next_steps,
          safety_note: observation.safety_note,
          data_quality_status: lat !== null || normalizedDistrict ? 'complete' : observation.data_quality_status,
          is_research_opportunity: false,
          media_count: Math.max(mediaRows.length, 1),
          public_media_count: Math.max(mediaRows.length, 1),
          primary_media_url: firstImage
            ? `/api/posts/${observation.passport_id}/media/${firstImage.source_media_id || firstImage.id}`
            : null,
          district: normalizedDistrict,
          public_location_precision: precision,
          latitude: publicCoords?.latitude ?? null,
          longitude: publicCoords?.longitude ?? null,
          created_at: observation.created_at,
          published_at: new Date().toISOString(),
          post_title: input.post_title ?? observation.post_title,
          user_report: input.user_report ?? observation.user_report,
          is_demo: false,
        });
      } else {
        publicObservationRepository.unpublishObservation(observation.passport_id);
      }
    }

    return {
      passport_id: observation.passport_id,
      is_public: isPublic,
      precision,
      district: normalizedDistrict,
      public_latitude: publicCoords?.latitude ?? null,
      public_longitude: publicCoords?.longitude ?? null,
    };
  }

  /**
   * Appends a contributor's answer or field note to their observation record.
   */
  async appendObservationFieldNote(
    passportId: string,
    note: string,
    viewer?: Viewer | null,
    contributorToken?: string | null,
    clientIp?: string
  ): Promise<ObservationRow | null> {
    const cleanId = String(passportId ?? '').trim().toUpperCase();
    const cleanNote = String(note ?? '').trim().slice(0, 1500);
    if (!cleanId || !cleanNote) return null;

    const observation =
      (await observationService.getObservationByPassportId(cleanId)) ??
      (await communityPostRepository.findObservation(cleanId));
    if (!observation) return null;

    if (!(await doesCallerOwnObservation(observation, viewer, contributorToken, clientIp))) {
      return null;
    }

    const updatedReport = observation.user_report
      ? `${observation.user_report}\n• ${cleanNote}`.slice(0, 4000)
      : cleanNote;

    observation.user_report = updatedReport;
    await communityPostRepository.updatePostFields(observation.passport_id, {
      user_report: updatedReport,
    });

    return observation;
  }
}

export const photoSubmissionService = new PhotoSubmissionService();
