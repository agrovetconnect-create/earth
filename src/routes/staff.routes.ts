import { Router } from 'express';
import { staffController } from '../controllers/staff.controller.js';
import { requireStaff } from '../utils/admin-auth.js';

export const staffRouter = Router();

/**
 * Control Center API (Staff & Administration)
 */

// Public Control Center routes
staffRouter.post('/api/control/auth/login', staffController.login);
staffRouter.get('/api/system/maintenance', staffController.getMaintenanceMode);
staffRouter.get('/api/system/demo-content', staffController.getDemoContent);

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

// User Notifications (all active staff roles)
staffRouter.post('/api/control/notifications', requireStaff(), staffController.sendNotification);

// Maintenance Mode (Owner, Ops, Security)
staffRouter.get('/api/control/maintenance', requireStaff(['owner', 'ops', 'security']), staffController.getMaintenanceMode);
staffRouter.put('/api/control/maintenance', requireStaff(['owner', 'ops', 'security']), staffController.updateMaintenanceMode);

// Demonstration Content (Owner only)
staffRouter.get('/api/control/demo-content', requireStaff('owner'), staffController.getDemoContent);
staffRouter.put('/api/control/demo-content', requireStaff('owner'), staffController.updateDemoContent);

// CMS Content Management (Owner only)
staffRouter.put('/api/control/cms/:page', requireStaff('owner'), staffController.updateCmsPage);
staffRouter.get('/api/control/cms/:page/history', requireStaff('owner'), staffController.getCmsHistory);
staffRouter.post('/api/control/cms/:page/restore', requireStaff('owner'), staffController.restoreCmsRevision);

// Public Transparency & Guide Data
staffRouter.get('/api/control/cms/:page', staffController.getCmsPage);


