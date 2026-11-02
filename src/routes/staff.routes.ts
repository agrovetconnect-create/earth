import { Router } from 'express';
import { staffController } from '../controllers/staff.controller.js';
import { requireStaff } from '../utils/admin-auth.js';

export const staffRouter = Router();

/**
 * Control Center API (Staff & Administration)
 */

// Public Control Center routes
staffRouter.post('/api/control/auth/login', staffController.login);

// Authenticated Staff routes
staffRouter.get('/api/control/auth/me', requireStaff(), staffController.getMe);
staffRouter.post('/api/control/auth/logout', staffController.logout);

// Monitoring (Ops, Owner, Security)
staffRouter.get('/api/control/metrics', requireStaff(['ops', 'owner', 'security']), staffController.getMetrics);

// Audit (Security, Owner)
staffRouter.get('/api/control/audit-logs', requireStaff(['security', 'owner']), staffController.getAuditLogs);

// Staff Management (Owner only)
staffRouter.get('/api/control/staff', requireStaff('owner'), staffController.listStaff);
staffRouter.post('/api/control/staff', requireStaff('owner'), staffController.createStaff);
staffRouter.patch('/api/control/staff/:id', requireStaff('owner'), staffController.updateStaff);

// Customer Support
staffRouter.get('/api/control/support/users', requireStaff(['support', 'owner']), staffController.searchUsers);

// CMS Content Management (Owner only)
staffRouter.put('/api/control/cms/:page', requireStaff('owner'), staffController.updateCmsPage);
staffRouter.get('/api/control/cms/:page/history', requireStaff('owner'), staffController.getCmsHistory);
staffRouter.post('/api/control/cms/:page/restore', requireStaff('owner'), staffController.restoreCmsRevision);

// Public Transparency & Guide Data
staffRouter.get('/api/control/cms/:page', staffController.getCmsPage);
staffRouter.get('/api/control/faqs', staffController.getFaqs);


