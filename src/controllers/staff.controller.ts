import type { Request, Response } from 'express';
import { staffService } from '../services/staff.service.js';
import {
  authenticateStaff,
  extractStaffSessionToken,
  generateStaffToken,
  revokeStaffSession,
  STAFF_SESSION_COOKIE_NAME,
  type AuthenticatedStaffRequest,
} from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { researchAnalyticsService } from '../services/research-analytics.service.js';
import { cmsService } from '../services/cms.service.js';
import { env } from '../config/env.js';
import { checkDistributedRateLimit } from '../utils/rate-limiter.js';
import { shortHash } from '../utils/hash.js';
import { isServiceUnavailableError } from '../utils/service-error.js';

function setStaffCookie(res: Response, token: string): void {
  res.setHeader('Cache-Control', 'no-store');
  res.cookie(STAFF_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.IS_PRODUCTION,
    sameSite: 'strict',
    path: '/',
    maxAge: env.SUPER_ADMIN_SESSION_TTL_SECONDS * 1000,
  });
}

function clearStaffCookie(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.clearCookie(STAFF_SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.IS_PRODUCTION,
    sameSite: 'strict',
    path: '/',
  });
}

function respondStaffOutage(res: Response, err: unknown): boolean {
  if (isServiceUnavailableError(err)) {
    res.status(503).json({
      error: 'The administrative database is temporarily unavailable. Please try again shortly.',
      code: 'DATABASE_UNAVAILABLE',
    });
    return true;
  }
  return false;
}

export class StaffController {
  /**
   * POST /api/control/auth/login
   */
  login = async (req: Request, res: Response): Promise<void> => {
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const rawIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const ipHash = shortHash(rawIp);
    const rateLimitKey = `staff_login:${ipHash}:${email.toLowerCase()}`;
    const allowed = await checkDistributedRateLimit(rateLimitKey, env.SUPER_ADMIN_RATE_LIMIT_PER_MINUTE);
    if (!allowed) {
      res.status(429).json({
        error: 'Too many login attempts. Please try again later.',
        code: 'STAFF_LOGIN_RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    try {
      const staff = await authenticateStaff(email, password);
      if (!staff) {
        logger.warn('Rejected control login attempt', { ipHash });
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const token = await generateStaffToken(staff, {
        ip: rawIp,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      });

      await staffService.logAudit({
        staff_id: staff.id === 'super_admin' ? undefined : staff.id,
        action: 'staff.login',
        target_type: 'staff',
        target_id: staff.id === 'super_admin' ? undefined : staff.id,
        ip_hash: ipHash,
      });

      setStaffCookie(res, token);
      const isMobile = req.headers['x-client-platform'] === 'mobile';

      res.status(200).json({
        ...(isMobile ? { token } : {}),
        staff: {
          id: staff.id,
          email: staff.email,
          role: staff.role,
        },
      });
    } catch (err) {
      logger.error('Login error', { ipHash, error: String(err) });
      if (respondStaffOutage(res, err)) return;
      res.status(500).json({ error: 'Internal server error during login' });
    }
  };

  /**
   * GET /api/control/auth/me
   */
  getMe = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    if (!req.staff) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({ staff: req.staff });
  };

  /**
   * POST /api/control/auth/logout
   */
  logout = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    const token = req.rawToken ?? extractStaffSessionToken(req);
    if (token) {
      try {
        await revokeStaffSession(token);
      } catch (err) {
        logger.error('Failed to revoke staff session during logout', { error: String(err) });
      }
    }
    clearStaffCookie(res);
    res.status(200).json({ message: 'Logged out' });
  };

  /**
   * GET /api/control/metrics
   */
  getMetrics = async (_req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    try {
      const metrics = await staffService.getOperationalMetrics();
      const research = await researchAnalyticsService.getResearchSummary();

      res.status(200).json({
        ...metrics,
        analytics: research.observation_stats,
        verification: research.verification_stats,
        uptime: research.operational_metrics.uptime_seconds,
      });
    } catch (err) {
      if (respondStaffOutage(res, err)) return;
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  };

  /**
   * GET /api/control/audit-logs
   */
  getAuditLogs = async (_req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    try {
      const logs = await staffService.listAuditLogs();
      res.status(200).json({ logs });
    } catch (err) {
      if (respondStaffOutage(res, err)) return;
      res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
  };

  /**
   * GET /api/control/staff
   */
  listStaff = async (_req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    try {
      const staff = await staffService.listStaff();
      res.status(200).json({ staff });
    } catch (err) {
      if (respondStaffOutage(res, err)) return;
      res.status(500).json({ error: 'Failed to list staff' });
    }
  };

  /**
   * POST /api/control/staff
   */
  createStaff = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    try {
      const actor = {
        staffId: req.staff?.staffId,
        role: req.staff?.role,
        ipHash: req.ip ? shortHash(req.ip) : undefined,
      };
      const result = (await staffService.createStaff(req.body, actor)) as any;
      res.status(201).json(result);
    } catch (err) {
      if (respondStaffOutage(res, err)) return;
      const message = err instanceof Error ? err.message : 'Failed to create staff';
      res.status(400).json({ error: message });
    }
  };

  /**
   * PATCH /api/control/staff/:id
   */
  updateStaff = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    try {
      const actor = {
        staffId: req.staff?.staffId,
        role: req.staff?.role,
        ipHash: req.ip ? shortHash(req.ip) : undefined,
      };
      const result = (await staffService.updateStaff(req.params.id, req.body, actor)) as any;
      res.status(200).json(result);
    } catch (err) {
      if (respondStaffOutage(res, err)) return;
      const message = err instanceof Error ? err.message : 'Failed to update staff';
      res.status(400).json({ error: message });
    }
  };

  /**
   * GET /api/control/support/users?q=...
   */
  searchUsers = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    try {
      const query = String(req.query.q || '');
      const users = await staffService.searchUsers(query);

      await staffService.logAudit({
        staff_id: req.staff?.staffId,
        action: 'user.search',
        target_type: 'user',
        ip_hash: req.ip ? shortHash(req.ip) : undefined,
        metadata: { query },
      });

      res.status(200).json({ users });
    } catch (err) {
      if (respondStaffOutage(res, err)) return;
      res.status(500).json({ error: 'Failed to search users' });
    }
  };

  /**
   * GET /api/control/cms/:page
   */
  getCmsPage = async (req: Request, res: Response): Promise<void> => {
    try {
      const page = await cmsService.getPage(req.params.page);
      res.status(200).json(page);
    } catch (err) {
      if (respondStaffOutage(res, err)) return;
      res.status(404).json({ error: 'Page not found' });
    }
  };

  /**
   * PUT /api/control/cms/:page
   */
  updateCmsPage = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    let previousSnapshot: Awaited<ReturnType<typeof cmsService.getPage>> | null = null;
    try {
      const actor = {
        staffId: req.staff?.staffId,
        email: req.staff?.email,
        role: req.staff?.role,
        ipHash: req.ip ? shortHash(req.ip) : undefined,
      };
      previousSnapshot = await cmsService.getPage(req.params.page);
      const updated = await cmsService.updatePage(req.params.page, req.body, actor);
      if (!cmsService.isDatabaseBacked()) {
        try {
          await staffService.logAudit({
            staff_id: req.staff?.staffId === 'super_admin' ? undefined : req.staff?.staffId,
            action: 'cms.update',
            target_type: 'cms_page',
            target_id: req.params.page,
            ip_hash: actor.ipHash,
            metadata: { page: req.params.page },
          });
        } catch (auditErr) {
          if (previousSnapshot) {
            await cmsService.updatePage(req.params.page, previousSnapshot).catch(() => null);
          }
          throw auditErr;
        }
      }
      res.status(200).json(updated);
    } catch (err) {
      if (respondStaffOutage(res, err)) return;
      res.status(400).json({ error: 'Failed to update CMS page' });
    }
  };

  /**
   * GET /api/control/cms/:page/history
   */
  getCmsHistory = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    try {
      const history = await cmsService.getHistory(req.params.page);
      res.status(200).json({ history });
    } catch (err) {
      if (respondStaffOutage(res, err)) return;
      res.status(500).json({ error: 'Failed to fetch CMS history' });
    }
  };

  /**
   * POST /api/control/cms/:page/restore
   */
  restoreCmsRevision = async (req: AuthenticatedStaffRequest, res: Response): Promise<void> => {
    let previousSnapshot: Awaited<ReturnType<typeof cmsService.getPage>> | null = null;
    try {
      const { filename } = req.body ?? {};
      if (!filename || typeof filename !== 'string') {
        res.status(400).json({ error: 'Filename is required' });
        return;
      }
      const actor = {
        staffId: req.staff?.staffId,
        email: req.staff?.email,
        role: req.staff?.role,
        ipHash: req.ip ? shortHash(req.ip) : undefined,
      };
      previousSnapshot = await cmsService.getPage(req.params.page);
      const restored = await cmsService.restoreRevision(req.params.page, filename, actor);

      if (!cmsService.isDatabaseBacked()) {
        try {
          await staffService.logAudit({
            staff_id: req.staff?.staffId === 'super_admin' ? undefined : req.staff?.staffId,
            action: 'cms.restore',
            target_type: 'cms_page',
            target_id: req.params.page,
            ip_hash: actor.ipHash,
            metadata: { page: req.params.page, revision: filename },
          });
        } catch (auditErr) {
          if (previousSnapshot) {
            await cmsService.updatePage(req.params.page, previousSnapshot).catch(() => null);
          }
          throw auditErr;
        }
      }

      res.status(200).json(restored);
    } catch (err) {
      if (respondStaffOutage(res, err)) return;
      res.status(400).json({ error: 'Failed to restore CMS revision' });
    }
  };

  /**
   * GET /api/control/faqs
   */
  getFaqs = async (_req: Request, res: Response): Promise<void> => {
    try {
      const faqs = await cmsService.getFaqs();
      res.status(200).json({ faqs });
    } catch (err) {
      if (respondStaffOutage(res, err)) return;
      res.status(500).json({ error: 'Failed to fetch FAQs' });
    }
  };
}

export const staffController = new StaffController();

