import type { Request, Response } from 'express';
import { expertService, ExpertService } from '../services/expert.service.js';
<<<<<<< HEAD
import type { AuthenticatedStaffRequest } from '../utils/admin-auth.js';
import {
  revokeStaffSession,
  authenticateStaff,
  extractStaffSessionToken,
  generateStaffToken,
  STAFF_SESSION_COOKIE_NAME,
} from '../utils/admin-auth.js';
import { checkDistributedRateLimit } from '../utils/rate-limiter.js';
import { shortHash } from '../utils/hash.js';
=======
import type { AuthenticatedAdminRequest } from '../utils/admin-auth.js';
import {
  revokeAdminSession,
  authenticateSuperAdmin,
  isSuperAdminConfigured,
  generateAdminToken,
} from '../utils/admin-auth.js';
import { checkRateLimit } from '../utils/rate-limiter.js';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { isServiceUnavailableError } from '../utils/service-error.js';
import type { ExpertFilterOptions, ExpertReviewInput } from '../types/expert.types.js';

/**
 * Review surface for the Super Admin.
 *
 * There is no expert login. Every route here requires a Super Admin session
 * (`requireSuperAdmin` is applied in `expert.routes.ts`), and reviews name a
 * reviewer as an attribute of the review rather than as a logged-in account.
 */
export class ExpertController {
  constructor(private service: ExpertService = expertService) {}

  /**
   * POST /api/expert/auth/login
<<<<<<< HEAD
   */
  login = async (req: Request, res: Response): Promise<void> => {
    const rawIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const ipHash = shortHash(rawIp);

    const body = (req.body ?? {}) as { email?: unknown; password?: unknown; passcode?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
=======
   *
   * Exchanges Super Admin credentials for a session token.
   *
   * There is deliberately no quick-select or passwordless path. An earlier
   * version of the verification portal presented a list of preset reviewer
   * accounts that could be entered with a single click and no credential at all,
   * which fabricated expert identities and bypassed authentication entirely.
   * Both are gone.
   */
  login = async (req: Request, res: Response): Promise<void> => {
    // Rate limit by client address so credential guessing is throttled.
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(`admin-login:${clientIp}`, env.SUPER_ADMIN_RATE_LIMIT_PER_MINUTE, 60_000)) {
      res.status(429).json({
        error: 'Too many sign-in attempts. Please wait a minute and try again.',
      });
      return;
    }

    if (!isSuperAdminConfigured()) {
      // Report the real reason rather than implying bad credentials.
      logger.warn('Super Admin login attempted but no credentials are configured');
      res.status(503).json({
        error:
          'The verification portal is not available because no administrator credentials are configured on the server.',
      });
      return;
    }

    const body = (req.body ?? {}) as { email?: unknown; passcode?: unknown; password?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    // `passcode` is the historical field name; `password` is accepted as the
    // clearer modern spelling. Neither is treated as sufficient on its own.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    const password =
      typeof body.password === 'string' && body.password.length > 0
        ? body.password
        : typeof body.passcode === 'string'
          ? body.passcode
          : '';

<<<<<<< HEAD
    const allowed = await checkDistributedRateLimit(
      `staff_login:${ipHash}:${email || 'anon'}`,
      env.SUPER_ADMIN_RATE_LIMIT_PER_MINUTE,
      60_000
    );
    if (!allowed) {
      res.status(429).json({
        error: 'Too many sign-in attempts. Please wait a minute and try again.',
        code: 'STAFF_LOGIN_RATE_LIMIT_EXCEEDED',
      });
      return;
    }

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    if (!email || !password) {
      res.status(400).json({ error: 'Both an email address and a password are required.' });
      return;
    }

<<<<<<< HEAD
    try {
      const staff = await authenticateStaff(email, password);
      if (!staff) {
        logger.warn('Rejected staff sign-in attempt', { ipHash });
        res.status(401).json({ error: 'Those credentials were not recognised.' });
        return;
      }

      const token = await generateStaffToken(
        { id: staff.id, email: staff.email, role: staff.role },
        {
          ip: rawIp,
          userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
        }
      );

      logger.info('Staff session issued', { ipHash, role: staff.role });

      res.setHeader('Cache-Control', 'no-store');
      res.cookie(STAFF_SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: env.IS_PRODUCTION,
        sameSite: 'strict',
        path: '/',
        maxAge: env.SUPER_ADMIN_SESSION_TTL_SECONDS * 1000,
      });

      const isMobile = req.headers['x-client-platform'] === 'mobile';

      res.status(200).json({
        ...(isMobile ? { token } : {}),
        staff: { id: staff.id, email: staff.email, role: staff.role },
        admin: { adminId: staff.id, email: staff.email, role: staff.role },
        expert: { id: staff.id, email: staff.email, role: staff.role },
      });
    } catch (err: unknown) {
      logger.error('Failed to issue staff session', {
        ipHash,
=======
    if (!authenticateSuperAdmin(email, password)) {
      logger.warn('Rejected Super Admin sign-in attempt', { clientIp });
      // Deliberately identical message for unknown email and wrong password so
      // the endpoint cannot be used to discover the administrator address.
      res.status(401).json({ error: 'Those credentials were not recognised.' });
      return;
    }

    let token: string;
    try {
      token = await generateAdminToken({
        ip: clientIp,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      });
    } catch (err: unknown) {
      // A failed token issue must answer, not reject: an unhandled rejection in
      // an Express 4 handler leaves the request hanging with no response.
      logger.error('Failed to issue Super Admin session', {
        clientIp,
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
        error: err instanceof Error ? err.message : String(err),
      });
      if (isServiceUnavailableError(err)) {
        res.status(503).json({
          error: 'Could not reach the session store right now. Please try again shortly.',
          code: 'DATABASE_UNAVAILABLE',
        });
        return;
      }
      res.status(500).json({ error: 'Could not start a session. Please try again.' });
<<<<<<< HEAD
    }
=======
      return;
    }

    logger.info('Super Admin session issued', { clientIp });

    res.status(200).json({
      token,
      admin: { adminId: 'super_admin', email: env.SUPER_ADMIN_EMAIL, role: 'super_admin' },
      // Kept as `expert` for backward compatibility with the existing client.
      expert: { id: 'super_admin', email: env.SUPER_ADMIN_EMAIL, role: 'super_admin' },
    });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  };

  /**
   * GET /api/expert/auth/me
<<<<<<< HEAD
   */
  getMe = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    if (!req.staff) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({ staff: req.staff, admin: req.staff, expert: req.staff });
=======
   * GET /api/expert/session
   * Returns the current Super Admin session.
   */
  getMe = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    if (!req.admin) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    // Returned under both keys because the existing client reads `expert`
    // while the backend session payload is an admin record.
    res.status(200).json({ admin: req.admin, expert: req.admin });
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  };

  /**
   * POST /api/expert/logout
   */
<<<<<<< HEAD
  logout = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const token = req.rawToken ?? extractStaffSessionToken(req);
    if (token) {
      try {
        await revokeStaffSession(token);
      } catch (err: unknown) {
        logger.error('Failed to revoke staff session', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    res.clearCookie(STAFF_SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: env.IS_PRODUCTION,
      sameSite: 'strict',
      path: '/',
    });
=======
  logout = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    const token = req.rawToken;
    if (token) {
      try {
        await revokeAdminSession(token);
      } catch (err: unknown) {
        logger.error('Failed to revoke Super Admin session', {
          error: err instanceof Error ? err.message : String(err),
        });
        if (isServiceUnavailableError(err)) {
          // Do not claim the session was revoked when the database refused it.
          res.status(503).json({
            error: 'The session could not be revoked because the session store is unavailable.',
            code: 'DATABASE_UNAVAILABLE',
          });
          return;
        }
      }
    }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    res.status(200).json({ message: 'Logged out and session revoked successfully' });
  };

  /**
   * GET /api/expert/observations
   */
<<<<<<< HEAD
  getObservations = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
  getObservations = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    try {
      const filters: ExpertFilterOptions = {
        status: (req.query.status as any) || undefined,
        classification: (req.query.classification as any) || undefined,
        district: typeof req.query.district === 'string' ? req.query.district : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        page: req.query.page ? parseInt(String(req.query.page), 10) : 1,
        limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 25,
      };

      const result = await this.service.getObservations(filters);
      res.status(200).json(result);
    } catch (err: unknown) {
      if (isServiceUnavailableError(err)) {
        res.status(503).json({
          error: 'Observation review is temporarily unavailable, please retry.',
          code: 'DATABASE_UNAVAILABLE',
        });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Error fetching observations';
      logger.error('Error in expert getObservations', { error: msg });
      res.status(500).json({ error: 'Failed to retrieve observations for review' });
    }
  };

  /**
   * GET /api/expert/observations/:passportId
   */
<<<<<<< HEAD
  getObservationDetail = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
  getObservationDetail = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    try {
      const { passportId } = req.params;
      const detail = await this.service.getObservationDetail(passportId);

      if (!detail) {
        res.status(404).json({ error: `Observation '${passportId}' not found.` });
        return;
      }

      res.status(200).json(detail);
    } catch (err: unknown) {
<<<<<<< HEAD
      if (isServiceUnavailableError(err)) {
        res.status(503).json({
          error: 'Observation details are temporarily unavailable, please retry.',
          code: 'DATABASE_UNAVAILABLE',
        });
        return;
      }
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      const msg = err instanceof Error ? err.message : 'Error retrieving observation';
      logger.error('Error in expert getObservationDetail', { error: msg });
      res.status(500).json({ error: 'Failed to retrieve observation details' });
    }
  };

  /**
   * POST /api/expert/observations/:passportId/review
<<<<<<< HEAD
   */
  submitReview = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    try {
      const { passportId } = req.params;
      if (!req.staff) {
=======
   *
   * The reviewer is named in the request body, not derived from a session,
   * because a review records who made the judgement while the session only
   * records who entered it. `identity_published` must be an explicit boolean so
   * publishing someone's name is always a deliberate act.
   */
  submitReview = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const { passportId } = req.params;
      if (!req.admin) {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
        res.status(401).json({ error: 'Unauthorized session.' });
        return;
      }

      const body = (req.body ?? {}) as Partial<ExpertReviewInput> & {
        reviewer_label?: string;
        organization?: string;
        identity_published?: unknown;
      };

      if (!body.verification_status) {
        res.status(400).json({ error: "Missing required field 'verification_status'." });
        return;
      }
      if (!body.reviewer_label || body.reviewer_label.trim().length === 0) {
        res.status(400).json({
          error: "Missing required field 'reviewer_label'. Every review must name the person making the judgement.",
        });
        return;
      }
      if (typeof body.identity_published !== 'boolean') {
        res.status(400).json({
          error: "Missing required field 'identity_published'. State explicitly whether the reviewer's name may be published.",
        });
        return;
      }

      const input: ExpertReviewInput = {
        verification_status: body.verification_status,
        expert_classification: body.expert_classification,
        expert_rock_name: body.expert_rock_name,
        expert_confidence: body.expert_confidence,
        expert_observed_features: body.expert_observed_features ?? [],
        expert_notes: body.expert_notes,
        scientific_remarks: body.scientific_remarks,
        publication_status: body.publication_status,
        public_visibility_reason: body.public_visibility_reason,
      };

      const result = await this.service.submitReview(
        passportId,
        {
<<<<<<< HEAD
          enteredBy: req.staff.staffId,
=======
          enteredBy: req.admin.adminId,
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
          reviewerLabel: body.reviewer_label,
          organization: body.organization ?? null,
          identityPublished: body.identity_published,
        },
        input
      );
      res.status(200).json(result);
    } catch (err: unknown) {
<<<<<<< HEAD
      if (isServiceUnavailableError(err)) {
        res.status(503).json({
          error: 'Could not save verification review because the database is temporarily unavailable.',
          code: 'DATABASE_UNAVAILABLE',
        });
        return;
      }
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      const msg = err instanceof Error ? err.message : 'Error submitting review';
      logger.error('Error in expert submitReview', { error: msg });
      res.status(400).json({ error: msg });
    }
  };

  /**
   * GET /api/expert/stats
   */
<<<<<<< HEAD
  getStats = async (_req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
  getStats = async (_req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    try {
      const stats = await this.service.getStats();
      res.status(200).json(stats);
    } catch (err: unknown) {
<<<<<<< HEAD
      if (isServiceUnavailableError(err)) {
        res.status(503).json({ error: 'Statistics temporarily unavailable', code: 'DATABASE_UNAVAILABLE' });
        return;
      }
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      const msg = err instanceof Error ? err.message : 'Error retrieving stats';
      logger.error('Error in expert getStats', { error: msg });
      res.status(500).json({ error: 'Failed to retrieve review statistics' });
    }
  };

  /**
   * GET /api/expert/audit-logs
   */
<<<<<<< HEAD
  getAuditLogs = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
=======
  getAuditLogs = async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const logs = await this.service.getAuditLogs(limit);
      res.status(200).json({ data: logs });
    } catch (err: unknown) {
<<<<<<< HEAD
      if (isServiceUnavailableError(err)) {
        res.status(503).json({ error: 'Audit trail temporarily unavailable', code: 'DATABASE_UNAVAILABLE' });
        return;
      }
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      const msg = err instanceof Error ? err.message : 'Error retrieving audit logs';
      logger.error('Error in expert getAuditLogs', { error: msg });
      res.status(500).json({ error: 'Failed to retrieve audit trail' });
    }
  };

  // NOTE: the previous GET /api/expert/media/:passportId endpoint was removed.
  // It did not serve the submitted photograph; it returned a procedurally
  // generated SVG of a rock labelled "VERIFIED FIELD SAMPLE PHOTOGRAPH".
  // A reviewer could therefore confirm a classification against an image the
  // system had invented, which would make any resulting "verification"
  // meaningless. Media is now served only from real stored uploads.
}

export const expertController = new ExpertController();