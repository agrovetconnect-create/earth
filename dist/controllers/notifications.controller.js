import { notificationService } from '../services/notification.service.js';
import { bodyOf, fail, sendError } from '../utils/http.js';
/**
 * Contributor inbox endpoints. Every handler takes the account id from the
 * verified session (`req.viewer`) so a client cannot request someone else's
 * notifications, even with a valid notification id.
 */
export async function listNotificationsHandler(req, res) {
    try {
        if (!req.viewer) {
            fail(res, 401, 'AUTH_REQUIRED', 'Sign in to view your notifications.');
            return;
        }
        const data = await notificationService.listForUser(req.viewer.userId);
        res.status(200).json({
            data,
            unread_count: data.filter((item) => !item.read).length,
        });
    }
    catch (err) {
        sendError(res, err);
    }
}
export async function markNotificationReadHandler(req, res) {
    try {
        if (!req.viewer) {
            fail(res, 401, 'AUTH_REQUIRED', 'Sign in to update your notifications.');
            return;
        }
        const body = bodyOf(req);
        const read = typeof body.read === 'boolean' ? body.read : true;
        const updated = await notificationService.markRead(req.viewer.userId, String(req.params.notificationId ?? ''), read);
        if (!updated) {
            fail(res, 404, 'NOTIFICATION_NOT_FOUND', 'That notification is not in your inbox.');
            return;
        }
        res.status(200).json({ data: updated });
    }
    catch (err) {
        sendError(res, err);
    }
}
export async function markAllNotificationsReadHandler(req, res) {
    try {
        if (!req.viewer) {
            fail(res, 401, 'AUTH_REQUIRED', 'Sign in to update your notifications.');
            return;
        }
        const marked = await notificationService.markAllRead(req.viewer.userId);
        res.status(200).json({ marked });
    }
    catch (err) {
        sendError(res, err);
    }
}
export async function dismissNotificationHandler(req, res) {
    try {
        if (!req.viewer) {
            fail(res, 401, 'AUTH_REQUIRED', 'Sign in to update your notifications.');
            return;
        }
        const removed = await notificationService.dismiss(req.viewer.userId, String(req.params.notificationId ?? ''));
        if (!removed) {
            fail(res, 404, 'NOTIFICATION_NOT_FOUND', 'That notification is not in your inbox.');
            return;
        }
        res.status(200).json({ dismissed: true });
    }
    catch (err) {
        sendError(res, err);
    }
}
export async function clearNotificationsHandler(req, res) {
    try {
        if (!req.viewer) {
            fail(res, 401, 'AUTH_REQUIRED', 'Sign in to update your notifications.');
            return;
        }
        const cleared = await notificationService.clear(req.viewer.userId);
        res.status(200).json({ cleared });
    }
    catch (err) {
        sendError(res, err);
    }
}
