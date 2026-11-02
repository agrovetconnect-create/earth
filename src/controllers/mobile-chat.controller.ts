import type { Response } from 'express';
import {
  mobileChatService,
  type MobileChatMessageRequest,
} from '../services/mobile-chat.service.js';
import { GeologicalAnalysisError } from '../ai/geological.types.js';
import { isServiceUnavailableError } from '../utils/service-error.js';
import { type AuthenticatedUserRequest, hashRequestIp } from '../utils/user-auth.js';
import { resolveVerifiedContributorTokenFromRequest } from '../utils/contributor.js';
import { logger } from '../utils/logger.js';

export async function mobileChatHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    const viewer = req.viewer ?? null;
    const clientIp = hashRequestIp(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const contributorToken = (await resolveVerifiedContributorTokenFromRequest(req)) ?? undefined;

    const rawLoc =
      body.location && typeof body.location === 'object' && !Array.isArray(body.location)
        ? (body.location as Record<string, unknown>)
        : undefined;

    const validRoles = new Set(['primary', 'outcrop', 'scale', 'field', 'video']);
    const rawSupporting = Array.isArray(body.supporting_media) ? body.supporting_media : undefined;
    const supportingMedia = rawSupporting
      ? rawSupporting
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
          .map((item) => ({
            content_base64: typeof item.content_base64 === 'string' ? item.content_base64 : '',
            mime_type: typeof item.mime_type === 'string' ? item.mime_type : undefined,
            caption: typeof item.caption === 'string' ? item.caption : undefined,
            role:
              typeof item.role === 'string' && validRoles.has(item.role)
                ? (item.role as NonNullable<MobileChatMessageRequest['supporting_media']>[number]['role'])
                : undefined,
          }))
          .filter((item) => item.content_base64.length > 0)
      : undefined;

    const validContexts = new Set([
      'in_situ_outcrop',
      'road_cut_exposure',
      'loose_float_talus',
      'stream_cobble',
      'quarry_mine',
      'hand_sample_core',
    ]);

    const payload: MobileChatMessageRequest = {
      message: typeof body.message === 'string' ? body.message : undefined,
      image_base64: typeof body.image_base64 === 'string' ? body.image_base64 : undefined,
      media_base64: typeof body.media_base64 === 'string' ? body.media_base64 : undefined,
      mime_type: typeof body.mime_type === 'string' ? body.mime_type : undefined,
      audio_base64: typeof body.audio_base64 === 'string' ? body.audio_base64 : undefined,
      audio_mime_type: typeof body.audio_mime_type === 'string' ? body.audio_mime_type : undefined,
      pending_passport_id:
        typeof body.pending_passport_id === 'string' ? body.pending_passport_id : undefined,
      pin_decision:
        typeof body.pin_decision === 'string' &&
        ['pin_exact', 'pin_approximate', 'pin_district', 'keep_private'].includes(body.pin_decision)
          ? (body.pin_decision as MobileChatMessageRequest['pin_decision'])
          : undefined,
      post_title: typeof body.post_title === 'string' ? body.post_title : undefined,
      primary_media_caption:
        typeof body.primary_media_caption === 'string' ? body.primary_media_caption : undefined,
      attach_to_active_passport:
        typeof body.attach_to_active_passport === 'boolean'
          ? body.attach_to_active_passport
          : undefined,
      contributor_token: contributorToken,
      specimen_context:
        typeof body.specimen_context === 'string' && validContexts.has(body.specimen_context)
          ? (body.specimen_context as MobileChatMessageRequest['specimen_context'])
          : undefined,
      has_scale_reference:
        typeof body.has_scale_reference === 'boolean' ? body.has_scale_reference : undefined,
      has_fresh_surface:
        typeof body.has_fresh_surface === 'boolean' ? body.has_fresh_surface : undefined,
      supporting_media: supportingMedia,
      location: rawLoc
        ? {
            latitude: typeof rawLoc.latitude === 'number' ? rawLoc.latitude : null,
            longitude: typeof rawLoc.longitude === 'number' ? rawLoc.longitude : null,
            accuracy_meters:
              typeof rawLoc.accuracy_meters === 'number' ? rawLoc.accuracy_meters : null,
            district: typeof rawLoc.district === 'string' ? rawLoc.district : null,
            sector: typeof rawLoc.sector === 'string' ? rawLoc.sector : null,
            cell: typeof rawLoc.cell === 'string' ? rawLoc.cell : null,
            village: typeof rawLoc.village === 'string' ? rawLoc.village : null,
            address: typeof rawLoc.address === 'string' ? rawLoc.address : null,
          }
        : undefined,
    };

    const response = await mobileChatService.processChatMessage(payload, viewer, clientIp);
    res.status(200).json(response);
  } catch (err: unknown) {
    if (isServiceUnavailableError(err)) {
      logger.error('Database unavailable during mobile chat request', { error: err.message });
      res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message:
            'Earth Talk could not reach the database right now, so your changes were not saved. Please try again shortly.',
        },
      });
      return;
    }

    if (
      err instanceof Error &&
      typeof (err as { status?: unknown }).status === 'number' &&
      typeof (err as { code?: unknown }).code === 'string'
    ) {
      const coded = err as Error & { status: number; code: string };
      res.status(coded.status).json({
        error: {
          code: coded.code,
          message: coded.message,
        },
      });
      return;
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    const status =
      err instanceof GeologicalAnalysisError &&
      (err.category === 'IMAGE_VALIDATION_ERROR' || err.category === 'MEDIA_VALIDATION_ERROR')
        ? 400
        : err instanceof GeologicalAnalysisError && err.category === 'GEMINI_RATE_LIMIT_ERROR'
          ? 429
          : err instanceof GeologicalAnalysisError &&
              (err.category === 'GEMINI_TIMEOUT' || err.category === 'GEMINI_API_ERROR')
            ? 503
            : 400;

    logger.warn('Mobile chat request returned validation/recoverable error', { error: errorMsg });
    res.status(status).json({
      error: {
        code: err instanceof GeologicalAnalysisError ? err.category : 'MOBILE_CHAT_ERROR',
        message: errorMsg,
      },
    });
  }
}
