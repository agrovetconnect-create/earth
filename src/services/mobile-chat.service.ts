import { geminiService } from './gemini.service.js';
import {
  doesCallerOwnObservation,
  photoSubmissionService,
  type ConfirmPinResult,
  type PhotoSubmissionInput,
  type PhotoSubmissionResult,
  type PinConfirmationDecision,
  type SpecimenFieldContext,
  type SupportingMediaInput,
} from './photo-submission.service.js';
import {
  COMMUNITY_COMMANDS,
  communityCommandService,
  parseCommand,
} from './community-commands.service.js';
import { communityService } from './community.service.js';
import { communityPostService } from './community-post.service.js';
import { siteRepository } from '../repositories/site.repository.js';
import { observationService } from './observation.service.js';
import { communityPostRepository } from '../repositories/community-post.repository.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { isServiceUnavailableError } from '../utils/service-error.js';
import {
  hashContributor,
  normalizeContributorToken,
  publicContributorHandle,
  whatsappContributorHash,
} from '../utils/contributor.js';
import { normalizeDistrictName } from '../utils/public-location.js';
import { detectMediaFromBuffer } from '../utils/image-validator.js';
import { GeologicalAnalysisError } from '../ai/geological.types.js';
import {
  buildUnsupportedInputWarning,
  detectOffTopicText,
  EARTH_TALK_GOAL,
  EARTH_TALK_MISSION,
  formatObservedCategoryLabel,
  SUPPORTED_EVIDENCE_STATE_SUMMARY,
  SUPPORTED_OBSERVED_SUMMARY,
  SUPPORTED_ROCK_TYPE_SUMMARY,
} from '../ai/domain-scope.js';
import {
  COMMUNITY_DISCLAIMER,
  EVIDENCE_STATE_LABEL,
  EVIDENCE_TYPES,
  REPUTATION_DISCLAIMER,
  type CommunityEvidenceType,
} from '../types/community.types.js';
import type { Viewer } from '../utils/user-auth.js';
import type { ObservationRow } from '../types/database.types.js';

function sanitizePassportLookupRow(row: ObservationRow): Record<string, unknown> {
  return {
    passport_id: row.passport_id,
    category: row.observation_category ?? 'unknown',
    subcategory: row.observation_subcategory ?? 'unknown',
    primary_classification: row.primary_classification,
    possible_name: row.possible_name,
    confidence: row.confidence,
    confidence_score: row.confidence_score,
    primary_interpretation: row.primary_interpretation,
    geological_context: row.geological_context,
    observed_features: row.observed_features ?? [],
    diagnostic_features: row.diagnostic_features ?? [],
    reasoning: row.reasoning,
    uncertainties: row.uncertainties ?? [],
    limitations: row.limitations ?? [],
    recommended_next_steps: row.recommended_next_steps ?? [],
    questions_for_user: row.questions_for_user ?? [],
    safety_note: row.safety_note,
    evidence_state: row.evidence_state,
    is_public: row.publication_status === 'public',
    created_at: row.created_at,
  };
}

export interface MobileChatLocationInput {
  latitude?: number | null;
  longitude?: number | null;
  accuracy_meters?: number | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  address?: string | null;
}

export interface MobileChatMessageRequest {
  message?: string;
  image_base64?: string;
  media_base64?: string;
  mime_type?: string;
  audio_base64?: string;
  audio_mime_type?: string;
  location?: MobileChatLocationInput;
  pending_passport_id?: string;
  pin_decision?: PinConfirmationDecision;
  post_title?: string;
  primary_media_caption?: string;
  attach_to_active_passport?: boolean;
  contributor_token?: string;
  specimen_context?: SpecimenFieldContext;
  has_scale_reference?: boolean;
  has_fresh_surface?: boolean;
  supporting_media?: SupportingMediaInput[];
}

export interface MobileChatMessageResponse {
  reply: string;
  type:
    | 'text'
    | 'passport'
    | 'draft_summary'
    | 'location_acknowledged'
    | 'help'
    | 'voice_reply'
    | 'domain_warning';
  passport?: PhotoSubmissionResult | Record<string, unknown>;
  pin_confirmation?: ConfirmPinResult;
  pending_passport_id?: string | null;
  pending_location?: {
    latitude: number | null;
    longitude: number | null;
    district: string | null;
    sector?: string | null;
    cell?: string | null;
    village?: string | null;
    address: string | null;
  } | null;
  awaiting_pin_confirmation?: boolean;
  questions_for_user?: string[];
  transcript?: string;
  suggested_actions?: string[];
}

interface HeldMobileLocation {
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  district: string | null;
  sector: string | null;
  cell: string | null;
  village: string | null;
  address: string | null;
  receivedAt: number;
}

const HELD_LOCATION_TTL_MS = 15 * 60 * 1000;
const MAX_HELD_LOCATIONS = 500;

class PendingMobileLocationStore {
  private readonly store = new Map<string, HeldMobileLocation>();

  set(key: string, loc: Omit<HeldMobileLocation, 'receivedAt'>): void {
    this.prune();
    this.store.set(key, { ...loc, receivedAt: Date.now() });
  }

  get(key: string): HeldMobileLocation | null {
    this.prune();
    return this.store.get(key) ?? null;
  }

  take(key: string): HeldMobileLocation | null {
    this.prune();
    const found = this.store.get(key) ?? null;
    this.store.delete(key);
    return found;
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (now - v.receivedAt > HELD_LOCATION_TTL_MS) {
        this.store.delete(k);
      }
    }
    while (this.store.size > MAX_HELD_LOCATIONS) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }
  }
}

const pendingMobileLocations = new PendingMobileLocationStore();

function resolveSenderKey(
  viewer?: Viewer | null,
  contributorToken?: string,
  clientIp?: string
): string {
  if (viewer?.userId) return `user:${viewer.userId}`;
  const normalized = normalizeContributorToken(contributorToken);
  if (normalized) {
    return `token:${hashContributor(`web:${normalized}`)}`;
  }
  return `ip:${clientIp || '127.0.0.1'}`;
}

function resolveContributorHash(
  viewer?: Viewer | null,
  contributorToken?: string,
  clientIp?: string
): string {
  const normalized = normalizeContributorToken(contributorToken);
  if (normalized) {
    return hashContributor(`web:${normalized}`);
  }
  if (viewer?.publicUserId) {
    return whatsappContributorHash(viewer.publicUserId);
  }
  return whatsappContributorHash(clientIp || 'mobile-anonymous');
}

function formatDraftSummaryMessage(
  result: PhotoSubmissionResult,
  heldLoc: {
    latitude: number | null;
    longitude: number | null;
    district: string | null;
    sector?: string | null;
    cell?: string | null;
    village?: string | null;
    address: string | null;
  } | null,
  viewer?: Viewer | null
): string {
  const contributorLine = viewer?.userId
    ? `👤 Contributor: ${viewer.displayName || 'Earth Talk Member'} (Contributor)`
    : `👤 Contributor: Earth Talk Contributor`;

  const lines: string[] = [
    '📸 PRELIMINARY PHOTO GEOSCIENCE SUMMARY',
    `🆔 Geoscience Passport: ${result.passport_id}`,
    contributorLine,
    `🔒 Status: Saved privately (review summary before pinning)`,
    '',
    `• What was observed: ${formatObservedCategoryLabel(result.category)} (${result.subcategory.replace(/_/g, ' ')})`,
  ];

  const rockType = (result as { classification?: string | null }).classification;
  if (rockType && rockType !== 'non_rock' && rockType !== 'insufficient_image') {
    lines.push(`• Rock type: ${rockType}`);
  }
  lines.push(`• Evidence state: ${result.evidence_state ? result.evidence_state.replace(/_/g, ' ') : 'ai assisted'} (preliminary reading)`);
  if (result.possible_name) {
    lines.push(`• Possible identification: ${result.possible_name}`);
  }
  lines.push(
    `• Confidence: ${result.confidence} (${Math.round(result.confidence_score * 100)}%) — AI-assisted, unverified`
  );
  if (result.supporting_media_count > 0) {
    lines.push(`• Supporting site media attached: ${result.supporting_media_count} file(s)`);
  }
  lines.push(`\n💡 Interpretation:\n${result.primary_interpretation}`);

  if (result.observed_features?.length > 0) {
    lines.push(`\n🔎 Observed features:\n• ${result.observed_features.slice(0, 5).join('\n• ')}`);
  }

  if (result.uncertainties?.length > 0) {
    lines.push(`\n⚖️ Uncertainties:\n• ${result.uncertainties.slice(0, 3).join('\n• ')}`);
  }

  if (result.questions_for_user?.length > 0) {
    lines.push(
      `\n❓ Help refine this observation:\n• ${result.questions_for_user.slice(0, 3).join('\n• ')}`
    );
  }

  if (result.recommended_next_steps?.length > 0) {
    lines.push(`\n📸 Recommended next steps:\n• ${result.recommended_next_steps.slice(0, 3).join('\n• ')}`);
  }

  lines.push(`\n⚠️ Safety & Scientific Note:\n${result.safety_note}`);

  if (
    result.exif_location?.found &&
    result.exif_location.latitude !== null &&
    result.exif_location.longitude !== null
  ) {
    lines.push(
      `\n🛰️ Photo EXIF Metadata Recovered:` +
        `\n• Captured coordinates: ${result.exif_location.latitude.toFixed(5)}, ${result.exif_location.longitude.toFixed(5)}` +
        (result.exif_location.inferred_district ? ` (${result.exif_location.inferred_district} District)` : '') +
        (result.exif_location.captured_at ? `\n• Original capture time: ${result.exif_location.captured_at}` : '')
    );
  }

  if (result.gps_mismatch_km !== null && result.gps_mismatch_km > 0.5) {
    lines.push(
      `\n⚠️ Field Location Warning: Your live GPS is ${result.gps_mismatch_km.toFixed(2)} km away from the photo's embedded EXIF coordinates. Verify you are pinning the actual outcrop site rather than your current home/office.`
    );
  }

  if (heldLoc && (heldLoc.latitude !== null || heldLoc.district || heldLoc.sector || heldLoc.cell || heldLoc.village)) {
    const adminHierarchy = [
      heldLoc.district ? `${heldLoc.district} District` : null,
      heldLoc.sector ? `${heldLoc.sector} Sector` : null,
      heldLoc.cell ? `${heldLoc.cell} Cell` : null,
      heldLoc.village ? `${heldLoc.village} Village` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const locLabel = [
      adminHierarchy ? `Rwanda · ${adminHierarchy}` : null,
      heldLoc.latitude !== null && heldLoc.longitude !== null
        ? `lat ${heldLoc.latitude.toFixed(4)}, lng ${heldLoc.longitude.toFixed(4)}`
        : null,
      heldLoc.address ? heldLoc.address : null,
    ]
      .filter(Boolean)
      .join(' • ');
    lines.push(
      `\n📍 Held Location (${locLabel}):\nHow would you like to pin ${result.passport_id} on the geological map? Choose Approximate (~2 km), Exact Point, District Only, or Keep Private below. You can also attach supporting outcrop videos or extra angle photos.`
    );
  } else {
    lines.push(
      `\n📍 Pin to Geological Map?\nShare a GPS location pin or select a Rwanda district to place ${result.passport_id} on the map, or choose "Keep Private".`
    );
  }

  return lines.join('\n');
}

function parsePinTextCommand(
  text: string
): { decision: PinConfirmationDecision; district?: string | null } | null {
  const lower = text.trim().toLowerCase();
  if (
    lower === 'keep private' ||
    lower === 'keep location private' ||
    lower === '🔒 keep private' ||
    lower === '🔒 keep location private' ||
    lower === 'unpin' ||
    lower === 'remove pin' ||
    lower === 'make private' ||
    lower === 'unpublish'
  ) {
    return { decision: 'keep_private' };
  }
  if (
    lower === 'pin approximate' ||
    lower === '📍 pin approximate (~2 km)' ||
    lower === 'pin approximate (~2 km)'
  ) {
    return { decision: 'pin_approximate' };
  }
  if (
    lower === 'pin exact' ||
    lower === '📌 pin exact outcrop point' ||
    lower === 'pin exact point'
  ) {
    return { decision: 'pin_exact' };
  }
  const districtMatch = /^pin\s+district(?:\s+(.+))?$/i.exec(text.trim());
  if (districtMatch) {
    return {
      decision: 'pin_district',
      district: districtMatch[1] ? normalizeDistrictName(districtMatch[1]) : undefined,
    };
  }
  return null;
}

export class MobileChatService {
  async processChatMessage(
    request: MobileChatMessageRequest,
    viewer?: Viewer | null,
    clientIp?: string
  ): Promise<MobileChatMessageResponse> {
    const text = (request.message || '').trim();
    const mediaBase64 = (request.media_base64 || request.image_base64 || '').trim();
    const mimeType = (request.mime_type || 'image/jpeg').trim();
    const senderKey = resolveSenderKey(viewer, request.contributor_token, clientIp);
    const contributorHash = resolveContributorHash(viewer, request.contributor_token, clientIp);

    let isVideo = mimeType.toLowerCase().startsWith('video/');
    if (mediaBase64.length > 0 && !isVideo) {
      const cleanB64 = mediaBase64.includes(',')
        ? mediaBase64.slice(mediaBase64.indexOf(',') + 1)
        : mediaBase64;
      const detected = detectMediaFromBuffer(Buffer.from(cleanB64, 'base64'));
      if (detected?.kind === 'video') {
        isVideo = true;
      }
    }

    // -------------------------------------------------------------------------
    // 1. Explicit Pin / Unpin / Privacy Confirmation for an Observation
    // -------------------------------------------------------------------------
    const parsedPinCmd = !request.pin_decision && request.pending_passport_id ? parsePinTextCommand(text) : null;
    const effectivePinDecision = request.pin_decision ?? parsedPinCmd?.decision;

    if (effectivePinDecision && request.pending_passport_id) {
      const held = pendingMobileLocations.take(senderKey);
      const lat = request.location?.latitude ?? held?.latitude ?? undefined;
      const lng = request.location?.longitude ?? held?.longitude ?? undefined;
      const acc = request.location?.accuracy_meters ?? held?.accuracy_meters ?? undefined;
      const dist =
        request.location?.district ??
        parsedPinCmd?.district ??
        held?.district ??
        normalizeDistrictName(request.location?.address) ??
        undefined;
      const locText = request.location?.address ?? held?.address ?? undefined;

      const confirmed = await photoSubmissionService.confirmObservationPin(
        {
          passport_id: request.pending_passport_id,
          decision: effectivePinDecision,
          latitude: lat,
          longitude: lng,
          accuracy_meters: acc,
          district: dist,
          sector: request.location?.sector ?? held?.sector ?? undefined,
          cell: request.location?.cell ?? held?.cell ?? undefined,
          village: request.location?.village ?? held?.village ?? undefined,
          location_text: locText,
          post_title: request.post_title,
          contributor_token: request.contributor_token,
        },
        viewer,
        clientIp
      );

      if (!confirmed.is_public) {
        return {
          reply:
            `🔒 Observation ${confirmed.passport_id} is now private and unpinned from the public map.\n\n` +
            `No coordinates or media are shown publicly. You can edit, attach supporting videos/photos, or publish it anytime.`,
          type: 'passport',
          pin_confirmation: confirmed,
          pending_passport_id: confirmed.passport_id,
          awaiting_pin_confirmation: false,
          suggested_actions: ['Attach supporting video', 'Snap another photo', 'Ask a geology question'],
        };
      }

      const precisionDescription =
        confirmed.precision === 'exact'
          ? `Exact outcrop coordinates (${confirmed.public_latitude?.toFixed(4)}, ${confirmed.public_longitude?.toFixed(4)})`
          : confirmed.precision === 'approximate'
            ? `Approximate ~2 km area (${confirmed.public_latitude?.toFixed(2)}, ${confirmed.public_longitude?.toFixed(2)})`
            : `District center (${confirmed.district ?? 'Rwanda'})`;

      return {
        reply:
          `✅ GEOSCIENCE PASSPORT PINNED TO MAP\n` +
          `🆔 Passport ID: ${confirmed.passport_id}\n` +
          `📍 Public Map Pin: ${precisionDescription}\n` +
          (confirmed.district ? `🗺️ District: ${confirmed.district}\n` : '') +
          `\nYour observation is now live on the Earth Talk Geological Map! You can still attach supporting videos, add angle photos, edit details, or unpin/make it private anytime.`,
        type: 'passport',
        pin_confirmation: confirmed,
        pending_passport_id: confirmed.passport_id,
        awaiting_pin_confirmation: false,
        suggested_actions: ['Attach supporting video', 'Make Private', 'Ask a question about this specimen'],
      };
    }

    // -------------------------------------------------------------------------
    // 2. Media Upload:
    //    - Photos -> GeoAI Image Analysis + EXIF GPS Recovery + Private Draft Summary
    //    - Videos -> Attached as Supporting Site Media (NO video AI analysis!)
    // -------------------------------------------------------------------------
    if (mediaBase64.length > 0) {
      if (isVideo || (request.attach_to_active_passport && request.pending_passport_id)) {
        if (request.pending_passport_id) {
          const added = await communityPostService.addMedia(
            request.pending_passport_id,
            viewer ?? null,
            {
              content_base64: mediaBase64,
              mime_type: isVideo
                ? mimeType.toLowerCase().startsWith('video/')
                  ? mimeType
                  : 'video/mp4'
                : mimeType,
              caption:
                text ||
                (isVideo
                  ? 'Supporting field outcrop video'
                  : 'A second angle taken at the site.'),
              role: isVideo ? 'video' : 'field',
            },
            request.contributor_token
          );

          return {
            reply: isVideo
              ? `🎥 Supporting field video attached to ${request.pending_passport_id} (${added.mime_type}).\n\n` +
                `GeoAI analyzes still specimen/outcrop photos only — your video clip is stored directly on this post/pin as supporting site context alongside your photos.`
              : `🖼️ Extra angle photo attached to ${request.pending_passport_id} gallery.`,
            type: 'passport',
            pending_passport_id: request.pending_passport_id,
            awaiting_pin_confirmation: false,
            suggested_actions: [
              'Attach another photo',
              '📍 Share Location Pin',
              'Ask a question about this specimen',
            ],
          };
        }

        return {
          reply:
            `🎥 Video clip received — GeoAI analyzes still photos (JPEG, PNG, WebP, HEIC) only.\n\n` +
            `Send a clear specimen or outcrop photo first to generate your Geoscience Passport summary, and then attach your video clip (plus any extra photos) as supporting media for that place!`,
          type: 'text',
          pending_passport_id: null,
          awaiting_pin_confirmation: false,
          suggested_actions: ['Attach photo', 'HELP'],
        };
      }

      const preShared = pendingMobileLocations.take(senderKey);
      const locSource = request.location
        ? {
            latitude: request.location.latitude ?? null,
            longitude: request.location.longitude ?? null,
            accuracy_meters: request.location.accuracy_meters ?? null,
            district:
              normalizeDistrictName(request.location.district) ??
              normalizeDistrictName(request.location.address) ??
              null,
            sector: request.location.sector ?? null,
            cell: request.location.cell ?? null,
            village: request.location.village ?? null,
            address: request.location.address ?? null,
          }
        : preShared;

      const input: PhotoSubmissionInput = {
        content_base64: mediaBase64,
        mime_type: mimeType as PhotoSubmissionInput['mime_type'],
        caption: text || undefined,
        primary_media_caption: request.primary_media_caption || undefined,
        post_title: request.post_title || undefined,
        contributor_token: request.contributor_token,
        specimen_context: request.specimen_context,
        has_scale_reference: request.has_scale_reference,
        has_fresh_surface: request.has_fresh_surface,
        supporting_media: request.supporting_media,
        location: locSource
          ? {
              latitude: locSource.latitude,
              longitude: locSource.longitude,
              accuracy_meters: locSource.accuracy_meters,
              district: locSource.district,
              sector: locSource.sector,
              cell: locSource.cell,
              village: locSource.village,
              location_text: locSource.address,
              // Always private until the contributor reviews the summary and confirms pinning!
              public_location_precision: 'private',
            }
          : undefined,
        is_public: false,
      };

      let result: PhotoSubmissionResult;
      try {
        result = await photoSubmissionService.submitObservation(input, viewer, clientIp);
      } catch (err: unknown) {
        if (
          err instanceof GeologicalAnalysisError &&
          (err.category === 'NON_GEOSCIENCE_SUBMISSION' || err.category === 'INSUFFICIENT_IMAGE_QUALITY')
        ) {
          if (locSource) {
            pendingMobileLocations.set(senderKey, locSource);
          }
          return {
            reply: err.message,
            type: err.category === 'NON_GEOSCIENCE_SUBMISSION' ? 'domain_warning' : 'text',
            pending_passport_id: request.pending_passport_id ?? null,
            awaiting_pin_confirmation: false,
            suggested_actions: ['Attach photo', 'HELP', 'SITES'],
          };
        }
        throw err;
      }

      const pendingLocSummary =
        locSource &&
        (locSource.latitude !== null ||
          locSource.district !== null ||
          locSource.sector !== null ||
          locSource.cell !== null ||
          locSource.village !== null)
          ? {
              latitude: locSource.latitude,
              longitude: locSource.longitude,
              district: locSource.district,
              sector: locSource.sector,
              cell: locSource.cell,
              village: locSource.village,
              address: locSource.address,
            }
          : result.exif_location?.found
            ? {
                latitude: result.exif_location.latitude,
                longitude: result.exif_location.longitude,
                district: result.exif_location.inferred_district,
                sector: null,
                cell: null,
                village: null,
                address: result.exif_location.captured_at
                  ? `Photo EXIF (${result.exif_location.captured_at})`
                  : 'Recovered from photo EXIF metadata',
              }
            : null;

      return {
        reply: formatDraftSummaryMessage(result, pendingLocSummary, viewer),
        type: 'draft_summary',
        passport: result,
        pending_passport_id: result.passport_id,
        pending_location: pendingLocSummary,
        awaiting_pin_confirmation: true,
        questions_for_user: result.questions_for_user ?? [],
        suggested_actions: pendingLocSummary
          ? ['📍 Pin Approximate (~2 km)', '📌 Pin Exact Outcrop Point', 'Attach supporting video', '🔒 Keep Private']
          : ['📍 Share Location Pin', 'Attach supporting video', '🔒 Keep Private'],
      };
    }

    // -------------------------------------------------------------------------
    // 3. Location Pin Shared (Before Media OR After Receiving Draft Summary)
    // -------------------------------------------------------------------------
    if (
      request.location &&
      (request.location.latitude != null ||
        request.location.longitude != null ||
        request.location.district ||
        request.location.sector ||
        request.location.cell ||
        request.location.village)
    ) {
      observationService.validateCoordinates(request.location.latitude, request.location.longitude);

      const normalizedDist =
        normalizeDistrictName(request.location.district) ??
        normalizeDistrictName(request.location.address) ??
        null;

      const heldPayload = {
        latitude: request.location.latitude ?? null,
        longitude: request.location.longitude ?? null,
        accuracy_meters: request.location.accuracy_meters ?? null,
        district: normalizedDist,
        sector: request.location.sector ?? null,
        cell: request.location.cell ?? null,
        village: request.location.village ?? null,
        address: request.location.address ?? null,
      };

      if (request.pending_passport_id) {
        await photoSubmissionService.confirmObservationPin(
          {
            passport_id: request.pending_passport_id,
            decision: 'keep_private',
            latitude: heldPayload.latitude,
            longitude: heldPayload.longitude,
            accuracy_meters: heldPayload.accuracy_meters,
            district: heldPayload.district,
            sector: heldPayload.sector,
            cell: heldPayload.cell,
            village: heldPayload.village,
            location_text: heldPayload.address,
            contributor_token: request.contributor_token,
          },
          viewer,
          clientIp
        );

        const coordLabel =
          heldPayload.latitude !== null && heldPayload.longitude !== null
            ? `${heldPayload.latitude.toFixed(4)}, ${heldPayload.longitude.toFixed(4)}`
            : (heldPayload.district ?? 'Rwanda');

        return {
          reply:
            `📍 Location attached privately to ${request.pending_passport_id} (${coordLabel}${heldPayload.district ? ` • ${heldPayload.district}` : ''}).\n\n` +
            `Confirm how you want this observation pinned on the public geological map:`,
          type: 'draft_summary',
          pending_passport_id: request.pending_passport_id,
          pending_location: heldPayload,
          awaiting_pin_confirmation: true,
          suggested_actions: [
            '📍 Pin Approximate (~2 km)',
            '📌 Pin Exact Outcrop Point',
            ...(heldPayload.district ? [`Pin District ${heldPayload.district}`] : []),
            '🔒 Keep Private',
          ],
        };
      }

      pendingMobileLocations.set(senderKey, heldPayload);
      const coordDesc =
        heldPayload.latitude !== null && heldPayload.longitude !== null
          ? `${heldPayload.latitude.toFixed(4)}, ${heldPayload.longitude.toFixed(4)}`
          : (heldPayload.district ?? 'Selected District');

      return {
        reply:
          `📍 Location received (${coordDesc}${heldPayload.district ? ` • ${heldPayload.district}` : ''}).\n\n` +
          `It is held privately and is NOT published yet.\n\n` +
          `Now send the specimen or outcrop photo for GeoAI analysis — I will show you the full summary before asking how to pin it, and you can attach supporting videos too!`,
        type: 'location_acknowledged',
        pending_location: heldPayload,
        suggested_actions: ['Attach photo'],
      };
    }

    // -------------------------------------------------------------------------
    // 4. Voice Note / Audio Transcription & Contextual Geoscience Q&A
    // -------------------------------------------------------------------------
    if (request.audio_base64 && request.audio_base64.trim().length > 0) {
      const obsContext = await this.loadObservationContext(
        request.pending_passport_id,
        viewer,
        request.contributor_token,
        clientIp
      );
      const voiceResult = await geminiService.transcribeAndAnswerVoiceNote(
        request.audio_base64,
        request.audio_mime_type || 'audio/webm',
        obsContext
      );

      if (request.pending_passport_id && voiceResult.transcript && !voiceResult.isOffTopic && obsContext) {
        await photoSubmissionService.appendObservationFieldNote(
          request.pending_passport_id,
          `[Voice note]: ${voiceResult.transcript}`,
          viewer,
          request.contributor_token,
          clientIp
        );
      }

      return {
        reply: voiceResult.reply,
        type: voiceResult.isOffTopic ? 'domain_warning' : 'voice_reply',
        transcript: voiceResult.transcript,
        pending_passport_id: request.pending_passport_id ?? null,
        suggested_actions: request.pending_passport_id
          ? ['📍 Share Location Pin', 'Attach supporting video', '🔒 Keep Private']
          : ['Attach photo', 'HELP'],
      };
    }

    // -------------------------------------------------------------------------
    // 5. WhatsApp Built-in Commands (START, HELP) & Passport Lookup
    // -------------------------------------------------------------------------
    const lowerText = text.toLowerCase();
    const isGreeting =
      lowerText === 'help' ||
      lowerText === 'start' ||
      lowerText === 'hello' ||
      lowerText === 'hi' ||
      lowerText === 'hey' ||
      lowerText === 'yo' ||
      /^(hey|hello|hi|muraho|habari)\b/i.test(lowerText);
    if (isGreeting) {
      return {
        reply:
          `🪨 EARTH TALK — MOBILE GEOSCIENCE ASSISTANT\n\n` +
          `🌍 Mission: ${EARTH_TALK_MISSION}\n` +
          `🎯 Goal: ${EARTH_TALK_GOAL}\n\n` +
          `What Earth Talk Supports (Core Focus & Filters):\n` +
          `• What was observed: ${SUPPORTED_OBSERVED_SUMMARY}.\n` +
          `• Rock type: ${SUPPORTED_ROCK_TYPE_SUMMARY}.\n` +
          `• Evidence state: ${SUPPORTED_EVIDENCE_STATE_SUMMARY}.\n\n` +
          `⚠️ Unsupported items: Everyday non-geological items (such as shoes, clothes, food, selfies, or indoor objects sent to test the AI) are rejected with a warning and never create a Geoscience Passport.\n\n` +
          `• 📸 Analyze Photos (Image-Only GeoAI): Send a clear daylight photo of a geological layer, rock, landform, fossil, or mineral.\n` +
          `• 🎥 Supporting Outcrop Videos & Extra Photos: Attach MP4/3GP/WebM clips and extra angles to an active Passport.\n` +
          `• 📋 Summary Before Pinning: Review your GeoAI summary first, then choose Exact, Approximate (~2 km), District, or Private.\n` +
          `• 🔎 Community commands: SITES, SITE <code>, INVESTIGATE, VOTE, EVIDENCE, ASK, ANSWER, VISIT, REP, COMMUNITYHELP`,
        type: 'help',
        pending_passport_id: request.pending_passport_id ?? null,
        suggested_actions: [
          'COMMUNITYHELP',
          'SITES',
          'Tell me about volcanic basalt in Musanze',
          'How do I distinguish quartz from feldspar?',
        ],
      };
    }

    // Check if message references or looks up a specific Passport ID (e.g. RT-RW-000001 or ET-DEMO-001)
    const passportLookupMatch = /^(?:passport\s+)?((?:RT|ET)-[A-Z]+-\d{3,8})$/i.exec(text);
    if (passportLookupMatch) {
      const targetId = passportLookupMatch[1].toUpperCase();
      const found =
        (await observationService.getObservationByPassportId(targetId)) ??
        (await communityPostRepository.findObservation(targetId));
      if (found) {
        const canAccess =
          found.publication_status === 'public' ||
          (await doesCallerOwnObservation(found, viewer, request.contributor_token, clientIp));
        if (!canAccess) {
          return {
            reply: `🔎 Public Geoscience Passport ${targetId} was not found.`,
            type: 'text',
            pending_passport_id: request.pending_passport_id ?? null,
            suggested_actions: ['SITES', 'HELP'],
          };
        }
        return {
          reply:
            `🪨 GEOSCIENCE PASSPORT ${found.passport_id}\n` +
            `• Category: ${found.observation_category ?? 'unknown'} / ${found.observation_subcategory ?? 'unknown'}\n` +
            (found.possible_name ? `• Possible identification: ${found.possible_name}\n` : '') +
            `• Confidence: ${found.confidence}\n` +
            `• Evidence state: ${found.evidence_state}\n` +
            `• Visibility: ${found.publication_status}\n\n` +
            `💡 Interpretation:\n${found.primary_interpretation ?? found.reasoning}`,
          type: 'passport',
          passport: sanitizePassportLookupRow(found),
          pending_passport_id: found.passport_id,
          suggested_actions: ['Ask a question about this specimen', 'SITES'],
        };
      }
    }

    // -------------------------------------------------------------------------
    // 6. All 11 WhatsApp Community Commands (SITES, SITE, INVESTIGATE, VOTE, EVIDENCE, ASK, ANSWER, VISIT, REP, COMMUNITYHELP)
    // -------------------------------------------------------------------------
    const communityReply = await this.tryCommunityCommand(text, contributorHash, senderKey);
    if (communityReply !== null) {
      const isHelpCmd = text.trim().toUpperCase() === COMMUNITY_COMMANDS.COMMUNITY_HELP;
      const isWarning = communityReply.startsWith('⚠️ Unsupported');
      return {
        reply: communityReply,
        type: isWarning ? 'domain_warning' : isHelpCmd ? 'help' : 'text',
        pending_passport_id: request.pending_passport_id ?? null,
        suggested_actions: ['SITES', 'REP', 'COMMUNITYHELP'],
      };
    }

    // -------------------------------------------------------------------------
    // 7. Follow-up Answers on Active Observation & Conversational Geoscience Q&A
    // -------------------------------------------------------------------------
    if (text) {
      const offTopic = detectOffTopicText(text);
      if (offTopic.isOffTopic) {
        return {
          reply: buildUnsupportedInputWarning({
            channel: 'mobile',
            inputKind: 'text',
            detectedSubject: offTopic.detectedTopic,
          }),
          type: 'domain_warning',
          pending_passport_id: request.pending_passport_id ?? null,
          suggested_actions: ['Attach photo', 'HELP', 'SITES'],
        };
      }

      const obsContext = await this.loadObservationContext(
        request.pending_passport_id,
        viewer,
        request.contributor_token,
        clientIp
      );
      const aiAnswer = await geminiService.answerGeoscienceQuestion(text, obsContext);
      const isWarning = aiAnswer.startsWith('⚠️ Unsupported');

      let appendedNote = false;
      if (!isWarning && request.pending_passport_id && obsContext) {
        const updatedObs = await photoSubmissionService.appendObservationFieldNote(
          request.pending_passport_id,
          text,
          viewer,
          request.contributor_token,
          clientIp
        );
        appendedNote = Boolean(updatedObs);
      }

      return {
        reply:
          !isWarning && request.pending_passport_id && obsContext && appendedNote
            ? `📝 Recorded on ${obsContext.passportId}\n\n${aiAnswer}`
            : aiAnswer,
        type: isWarning ? 'domain_warning' : 'text',
        pending_passport_id: request.pending_passport_id ?? null,
        suggested_actions: request.pending_passport_id
          ? ['📍 Share Location Pin', 'Attach supporting video', '🔒 Keep Private']
          : ['Attach photo', 'SITES', 'HELP'],
      };
    }

    return {
      reply: 'Send a specimen/outcrop photo for GeoAI analysis, attach a supporting video to an active Passport, share a location pin, or type any geological question!',
      type: 'text',
      pending_passport_id: request.pending_passport_id ?? null,
      suggested_actions: ['HELP', 'COMMUNITYHELP', 'SITES'],
    };
  }

  private async loadObservationContext(
    passportId?: string | null,
    viewer?: Viewer | null,
    contributorToken?: string | null,
    clientIp?: string
  ) {
    if (!passportId) return null;
    const clean = passportId.trim().toUpperCase();
    if (!clean) return null;
    const obs =
      (await observationService.getObservationByPassportId(clean)) ??
      (await communityPostRepository.findObservation(clean));
    if (!obs) return null;
    const allowed =
      obs.publication_status === 'public' ||
      (await doesCallerOwnObservation(obs, viewer, contributorToken, clientIp));
    if (!allowed) return null;
    return {
      passportId: obs.passport_id,
      category: `${obs.observation_category ?? 'unknown'} / ${obs.observation_subcategory ?? 'unknown'}`,
      possibleName: obs.possible_name,
      interpretation: obs.primary_interpretation ?? obs.reasoning ?? '',
      features: obs.observed_features ?? [],
      userNotes: obs.user_report ?? obs.user_caption ?? null,
    };
  }

  private async tryCommunityCommand(
    rawText: string,
    contributorHash: string,
    senderKey: string
  ): Promise<string | null> {
    const parsed = parseCommand(rawText);
    if (!parsed) return null;
    const { verb, argument } = parsed;

    const validVerbs = new Set<string>(Object.values(COMMUNITY_COMMANDS));
    if (!validVerbs.has(verb)) return null;

    if (isDatabaseConfigured()) {
      return communityCommandService.buildReply(senderKey, rawText);
    }

    // In-memory / development runtime support so mobile users can run all community commands seamlessly
    try {
      switch (verb) {
        case COMMUNITY_COMMANDS.COMMUNITY_HELP:
          return (
            `🪨 EARTH TALK — COMMUNITY COMMANDS\n\n` +
            `• SITES [district] — List published geological sites\n` +
            `• SITE <code> — View AI reading, community record & expert review\n` +
            `• INVESTIGATE <question> — Open a community investigation\n` +
            `• VOTE <INV-id> <option> — Vote on an investigation\n` +
            `• EVIDENCE <INV-id> <type> <notes> — Types: ${EVIDENCE_TYPES.join(', ')}\n` +
            `• ASK <question> — Post a geological question\n` +
            `• ANSWER <Q-id> <answer> — Answer a community question\n` +
            `• VISIT <site-code> [YYYY-MM-DD] [notes] — Record a site visit\n` +
            `• REP — View your contribution summary\n\n` +
            COMMUNITY_DISCLAIMER
          );

        case COMMUNITY_COMMANDS.SITES: {
          const { rows } = await siteRepository.listPublicSites({
            district: argument.trim() || undefined,
            limit: 15,
            offset: 0,
          });
          if (rows.length === 0) {
            return `🗺️ No geological sites match right now.\n\n${COMMUNITY_DISCLAIMER}`;
          }
          const lines = rows.map((s) => {
            const strength = s.highest_evidence_state
              ? ` — ${EVIDENCE_STATE_LABEL[s.highest_evidence_state]}`
              : '';
            const where = s.district ? ` (${s.district})` : '';
            return `• ${s.site_code} — ${s.title}${where}\n  ${s.observation_count} observation(s)${strength}`;
          });
          return `🗺️ GEOLOGICAL SITES (${rows.length})\n\n${lines.join('\n')}\n\nType SITE <code> to inspect one.\n\n${COMMUNITY_DISCLAIMER}`;
        }

        case COMMUNITY_COMMANDS.SITE:
        case COMMUNITY_COMMANDS.EXPLORE: {
          if (!argument) return 'Please include a site code, e.g.: SITE ET-SITE-001';
          const site =
            (await siteRepository.findSiteByCode(argument)) ??
            (await siteRepository.findSiteById(argument));
          if (!site) return `🔭 Could not find a site with code "${argument}". Type SITES to list available sites.`;
          const payload = await communityService.buildSiteExplorer(site.id);
          if (!payload) return 'That site is not publicly available.';
          return (
            `🔭 ${payload.site.title} (${payload.site.site_code})\n` +
            (payload.site.district ? `District: ${payload.site.district}\n` : '') +
            `\n🤖 AI INTERPRETATION (automated, unverified)\n` +
            (payload.ai_interpretation
              ? `${payload.ai_interpretation.primary_classification}${payload.ai_interpretation.possible_name ? ` — ${payload.ai_interpretation.possible_name}` : ''} (Confidence: ${payload.ai_interpretation.confidence})`
              : 'No AI interpretation recorded.') +
            `\n\n👥 COMMUNITY RECORD\n` +
            `Investigations: ${payload.community.investigation_count} · Questions: ${payload.community.question_count} · Evidence: ${payload.community.evidence_count} · Visits: ${payload.community.visit_count}` +
            `\n\n🔎 EXPERT REVIEW\n` +
            (payload.expert_review
              ? `Reviewed (${payload.expert_review.reviewer_label})${payload.expert_review.expert_rock_name ? `: ${payload.expert_review.expert_rock_name}` : ''}`
              : 'No expert has reviewed this site yet.') +
            `\n\n${COMMUNITY_DISCLAIMER}`
          );
        }

        case COMMUNITY_COMMANDS.INVESTIGATE: {
          if (!argument) return 'Include your question, e.g.: INVESTIGATE Is this vesicular basalt or scoria?';
          const offTopicInv = detectOffTopicText(argument);
          if (offTopicInv.isOffTopic) {
            return buildUnsupportedInputWarning({
              channel: 'mobile',
              inputKind: 'command',
              detectedSubject: offTopicInv.detectedTopic,
            });
          }
          const inv = await communityService.openInvestigation({ question: argument }, contributorHash);
          return `🔎 Investigation opened: ${inv.public_id}\nHandle: ${inv.opened_by_handle ?? publicContributorHandle(contributorHash)}\n\nOthers can now vote with: VOTE ${inv.public_id} <option>\n\n${COMMUNITY_DISCLAIMER}`;
        }

        case COMMUNITY_COMMANDS.VOTE: {
          const parts = argument.split(/\s+/);
          if (parts.length < 2) return 'Usage: VOTE <INV-id> <option>';
          const [invId, ...rest] = parts;
          const res = await communityService.castVote(
            { investigationPublicId: invId, option: rest.join(' ') },
            contributorHash
          );
          return `🗳️ ${res.message}\nYour vote on ${invId}: ${res.option}\n\n${COMMUNITY_DISCLAIMER}`;
        }

        case COMMUNITY_COMMANDS.EVIDENCE: {
          const parts = argument.split(/\s+/);
          if (parts.length < 3) {
            return `Usage: EVIDENCE <INV-id> <type> <what you observed>\nTypes: ${EVIDENCE_TYPES.join(', ')}`;
          }
          const [invId, rawType, ...rest] = parts;
          const evType = rawType.toLowerCase() as CommunityEvidenceType;
          if (!EVIDENCE_TYPES.includes(evType)) {
            return `Unrecognised evidence type "${rawType}". Use one of: ${EVIDENCE_TYPES.join(', ')}`;
          }
          const item = await communityService.submitEvidence(
            { investigationId: invId, evidenceType: evType, explanation: rest.join(' ') },
            contributorHash
          );
          return `🔬 Evidence recorded (${item.evidence_type.replace(/_/g, ' ')}).\n\n${COMMUNITY_DISCLAIMER}`;
        }

        case COMMUNITY_COMMANDS.ASK: {
          if (!argument) return 'Include your question, e.g.: ASK What causes columnar jointing in basalt?';
          const offTopicAsk = detectOffTopicText(argument);
          if (offTopicAsk.isOffTopic) {
            return buildUnsupportedInputWarning({
              channel: 'mobile',
              inputKind: 'command',
              detectedSubject: offTopicAsk.detectedTopic,
            });
          }
          const q = await communityService.askQuestion({ question: argument }, contributorHash);
          return `❓ Question posted: ${q.public_id}\nOthers can reply with: ANSWER ${q.public_id} <answer>\n\n${COMMUNITY_DISCLAIMER}`;
        }

        case COMMUNITY_COMMANDS.ANSWER: {
          const parts = argument.split(/\s+/);
          if (parts.length < 2) return 'Usage: ANSWER <Q-id> <your answer>';
          const [qId, ...rest] = parts;
          const ans = await communityService.postAnswer(
            { questionPublicId: qId, answer: rest.join(' ') },
            contributorHash
          );
          return `💬 Answer recorded as ${ans.contributor_handle}.\n\n${COMMUNITY_DISCLAIMER}`;
        }

        case COMMUNITY_COMMANDS.VISIT: {
          const parts = argument.split(/\s+/);
          if (!parts[0]) return 'Usage: VISIT <site-code> [YYYY-MM-DD] [notes]';
          const site =
            (await siteRepository.findSiteByCode(parts[0])) ??
            (await siteRepository.findSiteById(parts[0]));
          if (!site) return `Could not find site "${parts[0]}". Type SITES to see published sites.`;
          let visitedOn: string | undefined;
          let noteIdx = 1;
          if (parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1])) {
            visitedOn = parts[1];
            noteIdx = 2;
          }
          const notes = parts.slice(noteIdx).join(' ').trim() || undefined;
          const visit = await communityService.recordVisit(
            { siteId: site.id, visitedOn, notes },
            contributorHash
          );
          return `📍 Visit recorded for ${site.site_code} on ${visit.visited_on} (${visit.contributor_handle}).\n\n${COMMUNITY_DISCLAIMER}`;
        }

        case COMMUNITY_COMMANDS.REP: {
          const rep = await communityService.getReputation(contributorHash);
          return (
            `📊 YOUR CONTRIBUTIONS (${rep.public_handle})\n\n` +
            `Observations: ${rep.observations_count} · Investigations: ${rep.investigations_count} · Votes: ${rep.votes_count} · Evidence: ${rep.evidence_count} · Questions: ${rep.questions_count} · Answers: ${rep.answers_count} · Visits: ${rep.visits_count}\n\n` +
            REPUTATION_DISCLAIMER
          );
        }

        default:
          return null;
      }
    } catch (err: unknown) {
      if (isServiceUnavailableError(err)) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : 'Command could not be completed.';
      return `⚠️ ${msg}`;
    }
  }
}

export const mobileChatService = new MobileChatService();
