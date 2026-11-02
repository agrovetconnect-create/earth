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
<<<<<<< HEAD
import type { AuthenticatedStaffRequest } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { bodyOf, fail, sendError } from '../utils/http.js';
import {
  ScientificEvidenceValidationError,
  verifyScientificConfirmationEvidence,
  type VerifiedScientificConfirmation,
} from '../utils/scientific-evidence.js';
import { isServiceUnavailableError } from '../utils/service-error.js';
=======
import type { AuthenticatedAdminRequest } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { bodyOf, fail, sendError } from '../utils/http.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed

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
<<<<<<< HEAD
=======
 *
 * A reason is mandatory rather than optional on every mutating route here. An
 * evidence state or a visibility change with no stated reason is exactly the kind
 * of administrative edit a later reader of the public map cannot interrogate, so
 * the request is refused before anything is written.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
 */
function requireReason(body: Record<string, unknown>): string | null {
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length === 0) return null;
  if (reason.length > 500) return null;
  return reason;
}

/**
 * The actor recorded on an audit entry.
<<<<<<< HEAD
 */
function actorOf(req: any): string {
  return req.admin?.email ?? req.staff?.email ?? req.staff?.staffId ?? 'unknown:staff';
}

function actorRoleOf(req: any): string {
  return req.staff?.role ?? 'super_admin';
=======
 *
 * Taken from the verified session rather than the request body. An actor supplied
 * by the caller would make the audit log self-attesting and therefore worthless.
 */
function actorOf(req: AuthenticatedAdminRequest): string {
  return req.admin?.email ?? req.admin?.adminId ?? 'unknown:admin';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}

export class AdminController {
  /**
   * GET /api/admin/compliance-logs
   */
<<<<<<< HEAD
  getComplianceLogs = async (_req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
  getComplianceLogs = async (_req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    const logs = researchAnalyticsService.getComplianceLogs();
    res.status(200).json({ logs, count: logs.length });
  };

  /**
   * GET /api/admin/reviewers
<<<<<<< HEAD
   */
  getReviewers = async (_req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    res.status(200).json({
      reviewers: [],
      note: 'Reviewers are recorded on individual reviews.',
=======
   *
   * There is no roster of expert users to return. Earth Talk has exactly one
   * account type (Super Admin) and reviewers are recorded as attributes of
   * individual reviews, not as accounts.
   *
   * Reviewer statistics are derived from real review records instead:
   * GET /api/admin/reviewers should be backed by a grouped query over
   * expert_verifications once that table is populated.
   */
  getReviewers = async (_req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    res.status(200).json({
      reviewers: [],
      note: 'Reviewers are recorded on individual reviews. No expert accounts exist on this platform.',
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    });
  };

  /**
   * GET /api/admin/audit-log
<<<<<<< HEAD
   */
  getAuditLog = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
   *
   * Paginated, and filterable by action, target type and target id so an
   * administrator can answer "who changed this record, and why" without reading
   * the whole log.
   */
  getAuditLog = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
   */
  listObservationMedia = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
   *
   * Media bytes are never returned here, only the moderation metadata. Serving an
   * image through an audit screen would make private media readable by anyone who
   * can reach the admin API.
   */
  listObservationMedia = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
  updateEvidenceState = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const state = body.evidence_state;

=======
  updateEvidenceState = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const state = body.evidence_state;

    // Rejecting an unknown state is deliberate. Writing it would fail the database
    // constraint anyway, but with an opaque error that looks like a server fault
    // rather than a bad request.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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

<<<<<<< HEAD
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

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    try {
      await observationRepository.setEvidenceState(
        req.params.observationId,
        state,
        reason,
<<<<<<< HEAD
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
=======
        actorOf(req)
      );
      res.status(200).json({ observation_id: req.params.observationId, evidence_state: state, reason });
    } catch (err: unknown) {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Error setting evidence state', { error: message });
      fail(res, 500, 'EVIDENCE_STATE_UPDATE_FAILED', 'Failed to update the evidence state.');
    }
  };

  /**
   * PATCH /api/admin/observations/:observationId/publication-status
   */
<<<<<<< HEAD
  updatePublicationStatus = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
  updatePublicationStatus = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
  updateMediaVisibility = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
  updateMediaVisibility = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
  updateMediaModeration = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
  updateMediaModeration = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
   */
  updateCommunityMediaModeration = async (
    req: AuthenticatedStaffRequest,
=======
   *
   * Moderates a community attachment (an image or clip uploaded through
   * `POST /api/community/media`). This is the only path that can make such an
   * attachment publicly readable: the row starts `pending_review`, and only
   * `visible` sets `is_public`. A reason and the acting admin are recorded.
   */
  updateCommunityMediaModeration = async (
    req: AuthenticatedAdminRequest,
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
   */
  getCommunityComments = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
   *
   * The community discussion moderation queue. Demonstration comments appear
   * read-only, each flagged `is_demo: true`, so the queue is inspectable on a
   * fresh deployment without ever being editable.
   */
  getCommunityComments = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
  moderateCommunityComment = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
  moderateCommunityComment = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
   */
  getAbuseReports = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
   *
   * The community abuse-report queue. Reports are write-only until this reads
   * them; the optional `status` narrows to one state (open by default in the
   * interface, but the endpoint returns every state when it is omitted).
   */
  getAbuseReports = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
<<<<<<< HEAD
   */
  resolveAbuseReport = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
   *
   * Records the moderation decision on one report. The actor is taken from the
   * verified session, never the body, so the resolution is attributable.
   */
  resolveAbuseReport = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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