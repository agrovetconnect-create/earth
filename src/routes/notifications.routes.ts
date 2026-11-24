import { Router } from 'express';
import {
  clearNotificationsHandler,
  dismissNotificationHandler,
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from '../controllers/notifications.controller.js';
import { requireUser } from '../utils/user-auth.js';

export const notificationsRouter = Router();

/**
 * Per-account notification inbox (migration 048).
 *
 * All routes require a verified contributor session. The handler resolves the
 * recipient from the session, so no route accepts a user id or any other
 * caller-supplied ownership claim.
 */
notificationsRouter.get('/api/me/notifications', requireUser, listNotificationsHandler);
notificationsRouter.patch('/api/me/notifications/:notificationId/read', requireUser, markNotificationReadHandler);
notificationsRouter.patch('/api/me/notifications/read-all', requireUser, markAllNotificationsReadHandler);
notificationsRouter.delete('/api/me/notifications/:notificationId', requireUser, dismissNotificationHandler);
notificationsRouter.delete('/api/me/notifications', requireUser, clearNotificationsHandler);
