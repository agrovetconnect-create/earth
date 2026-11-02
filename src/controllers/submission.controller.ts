import type { Response } from 'express';
import { photoSubmissionService, type PhotoSubmissionInput } from '../services/photo-submission.service.js';
import { type AuthenticatedUserRequest, hashRequestIp } from '../utils/user-auth.js';
import { resolveVerifiedContributorTokenFromRequest } from '../utils/contributor.js';
import { GeologicalAnalysisError } from '../ai/geological.types.js';
import { isServiceUnavailableError } from '../utils/service-error.js';
import { logger } from '../utils/logger.js';

export async function submitPhotoObservationHandler(
  req: AuthenticatedUserRequest,
  res: Response
): Promise<void> {
  try {
    const body = (req.body ?? {}) as Partial<PhotoSubmissionInput> & { image_base64?: string };

    if (!body.content_base64 && !body.image_base64) {
      res.status(400).json({
        error: {
          code: 'IMAGE_REQUIRED',
          message: 'An image (base64 encoded) is required for geoscience analysis.',
        },
      });
      return;
    }

    const contributorToken = await resolveVerifiedContributorTokenFromRequest(req);

    const input: PhotoSubmissionInput = {
      content_base64: String(body.content_base64 || body.image_base64 || ''),
      mime_type: body.mime_type,
      caption: body.caption,
      primary_media_caption: typeof body.primary_media_caption === 'string' ? body.primary_media_caption : undefined,
      post_title: body.post_title,
      location: body.location,
      specimen_context: body.specimen_context ?? null,
      has_scale_reference: Boolean(body.has_scale_reference),
      has_fresh_surface: Boolean(body.has_fresh_surface),
      supporting_media: Array.isArray(body.supporting_media) ? body.supporting_media : undefined,
      contributor_token: contributorToken,
      site_id: body.site_id,
      is_public: typeof body.is_public === 'boolean' ? body.is_public : false,
    };

    const clientIp = hashRequestIp(req);
    const result = await photoSubmissionService.submitObservation(input, req.viewer, clientIp);

    res.status(201).json(result);
  } catch (err: unknown) {
    if (err instanceof GeologicalAnalysisError) {
      const status =
        err.category === 'GEMINI_RATE_LIMIT_ERROR'
          ? 429
          : err.category === 'MEDIA_VALIDATION_ERROR' || err.category === 'IMAGE_VALIDATION_ERROR'
            ? 400
            : err.category === 'GEMINI_TIMEOUT' || err.category === 'GEMINI_API_ERROR'
              ? 503
              : 422;

      logger.warn('Photo submission rejected by geological analysis service', {
        category: err.category,
        message: err.message,
      });

      res.status(status).json({
        error: {
          code: err.category,
          message: err.message,
        },
      });
      return;
    }

    if (isServiceUnavailableError(err)) {
      logger.error('Database unavailable during photo observation submission', {
        error: err.message,
      });
      res.status(503).json({
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message:
            'Your observation could not be saved because the database is temporarily unavailable. No Geoscience Passport was stored; please try again shortly.',
        },
      });
      return;
    }

    const message = err instanceof Error ? err.message : 'Unknown submission error';
    logger.error('Unexpected error processing photo observation submission', { error: message });

    res.status(500).json({
      error: {
        code: 'SUBMISSION_FAILED',
        message: 'Could not complete photo observation submission. Please try again.',
      },
    });
  }
}
