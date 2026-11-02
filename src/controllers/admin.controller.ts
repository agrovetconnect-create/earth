import type { Response } from 'express';
import { researchAnalyticsService } from '../services/research-analytics.service.js';
import { observationRepository } from '../repositories/observation.repository.js';
import { EVIDENCE_STATES, isEvidenceState } from '../types/community.types.js';
import type { MediaModerationStatus } from '../types/database.types.js';
import type { ModerationStatus } from '../types/community-posts.types.js';
import {
  communityPostService,
} from '../services/community-post.service.js';
import { abuseReportService } from '../services/abuse-report.service.js';
import { communityMediaService } from '../services/community-media.service.js';
import type { AuthenticatedStaffRequest } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { bodyOf, fail, sendError } from '../utils/http.js';
import {
  ScientificEvidenceValidationError,
  verifyScientificConfirmationEvidence,
  type VerifiedScientificConfirmation,
} from '../utils/scientific-evidence.js';
import { isServiceUnavailableError } from '../utils/service-error.js';

const MEDIA_MODERATION_STATUSES: readonly MediaModerationStatus[] = [
  'visible',
  'pending_review',
  'hidden',
  'removed',
];

const COMMENT_MODERATION_STATUSES: readonly ModerationStatus[] = ['visible', 'hidden', 'removed'];

const MEDIA_VISIBILITIES = ['private', 'pending', 'public', 'hidden'] as const;
const PUBLICATION_STATUSES = ['public', 'private', 'hidden'] as const;

/**
 * Rejects a request whose body is missing a usable reason.
 */
function requireReason(body: Record<string, unknown>): string | null {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length === 0) return null;
  if (reason.length > 500) return null;
  return reason;
}

/**
 * The actor recorded on an audit entry.
 */
function actorOf(req: any): string {
  return req.admin?.email ?? req.staff?.email ?? req.staff?.staffId ?? 'unknown:staff';
}

function actorRoleOf(req: any): string {
  return req.staff?.role ?? 'super_admin';
}

export class AdminController {
  /**
   * GET /api/admin/compliance-logs
   */
  getComplianceLogs = async (_req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const logs = researchAnalyticsService.getComplianceLogs();
    res.status(200).json({ logs, count: logs.length });
  };

  /**
   * GET /api/admin/reviewers
   */
  getReviewers = async (_req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    res.status(200).json({
      reviewers: [],
      note: 'Reviewers are recorded on individual reviews.',
    });
  };

  /**
   * GET /api/admin/audit-log
   */
  getAuditLog = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

    try {
      const result = await observationRepository.listAuditLog({
        limit,
        offset,
        ...(typeof req.query.action === 'string' && req.query.action.trim()
          ? { action: req.query.action.trim() }
          : {}),
        ...(typeof req.query.target_type === 'string' && req.query.target_type.trim()
          ? { targetType: req.query.target_type.trim() }
          : {}),
        ...(typeof req.query.target_id === 'string' && req.query.target_id.trim()
          ? { targetId: req.query.target_id.trim() }
          : {}),
      });

      res.status(200).json({
        rows: result.rows,
        total: result.total,
        limit,
        offset,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error reading the audit log', { error: message });
      fail(res, 500, 'AUDIT_LOG_UNAVAILABLE', 'Failed to read the audit log.');
    }
  };

  /**
   * GET /api/admin/observations/:observationId/media
   */
  listObservationMedia = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    try {
      const media = await observationRepository.listObservationMedia(req.params.observationId);
      res.status(200).json({ media, count: media.length });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error listing observation media', { error: message });
      fail(res, 500, 'MEDIA_LIST_FAILED', 'Failed to list media for this observation.');
    }
  };

  /**
   * PATCH /api/admin/observations/:observationId/evidence-state
   */
  updateEvidenceState = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const state = body.evidence_state;

    if (!isEvidenceState(state)) {
      fail(
        res,
        400,
        'INVALID_EVIDENCE_STATE',
        `evidence_state must be one of: ${EVIDENCE_STATES.join(', ')}.`
      );
      return;
    }

    const reason = requireReason(body);
    if (!reason) {
      fail(res, 400, 'REASON_REQUIRED', 'A reason is required and must be 500 characters or fewer.');
      return;
    }

    let verifiedEvidence: VerifiedScientificConfirmation | null = null;
    if (state === 'scientifically_confirmed') {
      try {
        verifiedEvidence = await verifyScientificConfirmationEvidence(
          req.params.observationId,
          body,
          (obsId, ref) => observationRepository.hasInMemoryEvidenceReference(obsId, ref)
        );
      } catch (err: unknown) {
        if (err instanceof ScientificEvidenceValidationError) {
          fail(res, err.status, err.code, err.message);
          return;
        }
        if (isServiceUnavailableError(err)) {
          fail(res, 503, 'DATABASE_UNAVAILABLE', 'Unable to verify accredited laboratory or stored evidence records right now.');
          return;
        }
        fail(res, 400, 'SCIENTIFIC_CONFIRMATION_EVIDENCE_REQUIRED', 'Scientific confirmation verification failed.');
        return;
      }
    }

    try {
      await observationRepository.setEvidenceState(
        req.params.observationId,
        state,
        reason,
        actorOf(req),
        verifiedEvidence,
        actorRoleOf(req)
      );
      res.status(200).json({
        observation_id: req.params.observationId,
        evidence_state: state,
        reason,
        ...(verifiedEvidence
          ? {
              scientific_evidence: {
                laboratory_id: verifiedEvidence.laboratory_id,
                laboratory_name: verifiedEvidence.laboratory_name,
                report_id: verifiedEvidence.report_id,
                analytical_method: verifiedEvidence.analytical_method,
                evidence_reference: verifiedEvidence.evidence_reference,
                review_authorization: verifiedEvidence.review_authorization,
                confirmed_at: verifiedEvidence.confirmed_at,
              },
            }
          : {}),
      });
    } catch (err: unknown) {
      if (err instanceof ScientificEvidenceValidationError) {
        fail(res, err.status, err.code, err.message);
        return;
      }
      if (isServiceUnavailableError(err)) {
        fail(res, 503, 'DATABASE_UNAVAILABLE', 'Database unavailable while updating evidence state.');
        return;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error setting evidence state', { error: message });
      fail(res, 500, 'EVIDENCE_STATE_UPDATE_FAILED', 'Failed to update the evidence state.');
    }
  };

  /**
   * PATCH /api/admin/observations/:observationId/publication-status
   */
  updatePublicationStatus = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const status = body.publication_status;

    if (typeof status !== 'string' || !PUBLICATION_STATUSES.includes(status as any)) {
      fail(
        res,
        400,
        'INVALID_PUBLICATION_STATUS',
        `publication_status must be one of: ${PUBLICATION_STATUSES.join(', ')}.`
      );
      return;
    }

    const reason = requireReason(body);
    if (!reason) {
      fail(res, 400, 'REASON_REQUIRED', 'A reason is required and must be 500 characters or fewer.');
      return;
    }

    try {
      await observationRepository.setPublicationStatus(
        req.params.observationId,
        status as 'public' | 'private' | 'hidden',
        reason,
        actorOf(req)
      );
      res.status(200).json({ observation_id: req.params.observationId, publication_status: status, reason });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error setting publication status', { error: message });
      fail(res, 500, 'PUBLICATION_STATUS_UPDATE_FAILED', 'Failed to update the publication status.');
    }
  };

  /**
   * PATCH /api/admin/media/:mediaId/visibility
   */
  updateMediaVisibility = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const visibility = body.visibility;

    if (typeof visibility !== 'string' || !MEDIA_VISIBILITIES.includes(visibility as any)) {
      fail(
        res,
        400,
        'INVALID_MEDIA_VISIBILITY',
        `visibility must be one of: ${MEDIA_VISIBILITIES.join(', ')}.`
      );
      return;
    }

    const reason = requireReason(body);
    if (!reason) {
      fail(res, 400, 'REASON_REQUIRED', 'A reason is required and must be 500 characters or fewer.');
      return;
    }

    try {
      await observationRepository.setMediaVisibility(
        req.params.mediaId,
        visibility as 'private' | 'pending' | 'public' | 'hidden',
        reason,
        actorOf(req)
      );
      res.status(200).json({ media_id: req.params.mediaId, visibility, reason });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error setting media visibility', { error: message });
      fail(res, 500, 'MEDIA_VISIBILITY_UPDATE_FAILED', 'Failed to update media visibility.');
    }
  };

  /**
   * PATCH /api/admin/media/:mediaId/moderation
   */
  updateMediaModeration = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const moderationStatus = body.moderation_status;

    if (
      typeof moderationStatus !== 'string' ||
      !MEDIA_MODERATION_STATUSES.includes(moderationStatus as MediaModerationStatus)
    ) {
      fail(
        res,
        400,
        'INVALID_MODERATION_STATUS',
        `moderation_status must be one of: ${MEDIA_MODERATION_STATUSES.join(', ')}.`
      );
      return;
    }

    const reason = requireReason(body);
    if (!reason) {
      fail(res, 400, 'REASON_REQUIRED', 'A reason is required and must be 500 characters or fewer.');
      return;
    }

    try {
      await observationRepository.moderateMedia(
        req.params.mediaId,
        moderationStatus as MediaModerationStatus,
        reason,
        actorOf(req)
      );
      res.status(200).json({ media_id: req.params.mediaId, moderation_status: moderationStatus, reason });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error moderating media', { error: message });
      fail(res, 500, 'MEDIA_MODERATION_FAILED', 'Failed to moderate this media item.');
    }
  };

  /**
   * PATCH /api/admin/community/media/:mediaId/moderation
   */
  updateCommunityMediaModeration = async (
    req: AuthenticatedStaffRequest,
    res: Response
  ): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const moderationStatus = body.moderation_status;

    if (
      typeof moderationStatus !== 'string' ||
      !MEDIA_MODERATION_STATUSES.includes(moderationStatus as MediaModerationStatus)
    ) {
      fail(
        res,
        400,
        'INVALID_MODERATION_STATUS',
        `moderation_status must be one of: ${MEDIA_MODERATION_STATUSES.join(', ')}.`
      );
      return;
    }

    const reason = requireReason(body);
    if (!reason) {
      fail(res, 400, 'REASON_REQUIRED', 'A reason is required and must be 500 characters or fewer.');
      return;
    }

    try {
      const updated = await communityMediaService.setModeration(
        req.params.mediaId,
        moderationStatus as ModerationStatus,
        reason,
        actorOf(req)
      );
      if (!updated) {
        fail(res, 404, 'MEDIA_NOT_FOUND', 'No community attachment exists with that id.');
        return;
      }
      res.status(200).json({
        media_id: req.params.mediaId,
        moderation_status: moderationStatus,
        reason,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error moderating community media', { error: message });
      sendError(res, err);
    }
  };

  /**
   * GET /api/admin/community/comments
   */
  getCommunityComments = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

    const passportId = typeof req.query.passport_id === 'string' ? req.query.passport_id.trim() : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;

    if (status && !COMMENT_MODERATION_STATUSES.includes(status as ModerationStatus)) {
      fail(
        res,
        400,
        'INVALID_MODERATION_STATUS',
        `moderation_status must be one of: ${COMMENT_MODERATION_STATUSES.join(', ')}.`
      );
      return;
    }

    try {
      const result = await communityPostService.listCommentsForModeration({
        limit,
        offset,
        ...(passportId ? { passportId } : {}),
        ...(status ? { status: status as ModerationStatus } : {}),
      });
      res.status(200).json({ rows: result.rows, total: result.total, limit, offset });
    } catch (err) {
      sendError(res, err);
    }
  };

  /**
   * PATCH /api/admin/community/comments/:commentId/moderation
   */
  moderateCommunityComment = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const body = bodyOf(req);
    const status = body.moderation_status;

    if (!COMMENT_MODERATION_STATUSES.includes(status as ModerationStatus)) {
      fail(
        res,
        400,
        'INVALID_MODERATION_STATUS',
        `moderation_status must be one of: ${COMMENT_MODERATION_STATUSES.join(', ')}.`
      );
      return;
    }

    const reason = requireReason(body);
    if (!reason) {
      fail(res, 400, 'REASON_REQUIRED', 'A reason is required and must be 500 characters or fewer.');
      return;
    }

    try {
      const row = await communityPostService.moderateComment({
        commentId: String(req.params.commentId ?? ''),
        status: status as ModerationStatus,
        reason,
        moderatedBy: actorOf(req),
      });
      res.status(200).json(row);
    } catch (err) {
      sendError(res, err);
    }
  };

  /**
   * GET /api/admin/community/reports
   */
  getAbuseReports = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : undefined;
    try {
      const reports = await abuseReportService.listQueue(status);
      res.status(200).json({ reports, count: reports.length });
    } catch (err) {
      sendError(res, err);
    }
  };

  /**
   * PATCH /api/admin/community/reports/:publicId
   */
  resolveAbuseReport = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const body = bodyOf(req);
    try {
      const report = await abuseReportService.resolveReport(
        String(req.params.publicId ?? ''),
        {
          status: typeof body.status === 'string' ? body.status : undefined,
          note: typeof body.note === 'string' ? body.note : null,
        },
        actorOf(req)
      );
      res.status(200).json({ report });
    } catch (err) {
      sendError(res, err);
    }
  };
}

export const adminController = new AdminController();