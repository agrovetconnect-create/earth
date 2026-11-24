import { notificationRepository } from '../repositories/notification.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { logger } from '../utils/logger.js';
const MAX_TITLE_LENGTH = 160;
const MAX_BODY_LENGTH = 500;
function toApiItem(row) {
    return {
        id: row.id,
        title: row.title,
        body: row.body,
        created_at: row.created_at,
        read: Boolean(row.read_at),
        type: row.type,
        passport_id: row.passport_id,
        site_id: row.site_id,
        comment_id: row.comment_id ?? null,
    };
}
function clip(value, max) {
    const trimmed = String(value ?? '').replace(/\s+/g, ' ').trim();
    return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}
export class NotificationService {
    async listForUser(userId) {
        const rows = await notificationRepository.listForUser(userId);
        return rows.map(toApiItem);
    }
    async markRead(userId, notificationId, read = true) {
        const row = await notificationRepository.markRead(userId, notificationId, read);
        return row ? toApiItem(row) : null;
    }
    async markAllRead(userId) {
        return notificationRepository.markAllRead(userId);
    }
    async dismiss(userId, notificationId) {
        return notificationRepository.dismiss(userId, notificationId);
    }
    async clear(userId) {
        return notificationRepository.clearForUser(userId);
    }
    /**
     * Creates a notification for a real event. Called by other services after the
     * underlying write has succeeded; a notification failure is logged by the
     * caller and never turns a successful comment or review into an error.
     */
    async create(input) {
        const recipientUserId = String(input.recipientUserId ?? '').trim();
        if (!recipientUserId)
            throw new Error('A notification recipient is required.');
        const title = clip(input.title, MAX_TITLE_LENGTH);
        const body = clip(input.body, MAX_BODY_LENGTH);
        if (!title || !body)
            throw new Error('A notification needs a title and a body.');
        const row = await notificationRepository.create({
            recipient_user_id: recipientUserId,
            type: input.type,
            title,
            body,
            passport_id: input.passportId ? String(input.passportId).trim() : null,
            site_id: input.siteId ? String(input.siteId).trim() : null,
            comment_id: input.commentId ? String(input.commentId).trim() : null,
        });
        return toApiItem(row);
    }
    /** Sends a Control Center announcement to selected accounts or every account. */
    async createStaffAnnouncement(input) {
        const title = clip(input.title, MAX_TITLE_LENGTH);
        const body = clip(input.body, MAX_BODY_LENGTH);
        if (!title || !body)
            throw new Error('An announcement needs a title and a message.');
        const recipients = input.broadcast
            ? await userRepository.listRecipientUserIds()
            : [...new Set((input.recipientUserIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];
        if (recipients.length === 0) {
            throw new Error('Choose at least one recipient or send to all users.');
        }
        const results = await Promise.allSettled(recipients.map((recipientUserId) => this.create({
            recipientUserId,
            type: 'announcement',
            title,
            body,
        })));
        const sent = results.filter((result) => result.status === 'fulfilled').length;
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                logger.warn('Staff announcement could not be delivered', {
                    recipientUserId: recipients[index],
                    createdBy: input.createdBy,
                    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
                });
            }
        });
        if (sent === 0) {
            throw new Error('The announcement could not be delivered to any recipient.');
        }
        return { sent, recipients: recipients.length };
    }
    /** A reply or comment on an observation the recipient owns or discussed. */
    async notifyComment(input) {
        const recipient = String(input.recipientUserId ?? '').trim();
        if (!recipient || recipient === input.actorUserId)
            return;
        const actor = clip(input.actorDisplayName || 'A contributor', 60);
        const excerpt = clip(input.body, 140);
        await this.create({
            recipientUserId: recipient,
            type: 'reply',
            title: input.isReply ? 'New reply to your comment' : 'New comment on your observation',
            body: `${actor}: "${excerpt}"`,
            passportId: input.passportId,
            commentId: input.commentId ?? null,
        });
    }
    /** An expert verification decision on the recipient's observation. */
    async notifyVerification(input) {
        const recipient = String(input.recipientUserId ?? '').trim();
        if (!recipient)
            return;
        const decisions = {
            expert_verified: {
                title: 'Expert verification complete',
                body: `Your observation ${input.passportId} received expert verification.`,
            },
            rejected: {
                title: 'Verification decision received',
                body: `An expert review returned a negative decision for ${input.passportId}.`,
            },
            under_review: {
                title: 'Your observation is under review',
                body: `An expert started reviewing ${input.passportId}.`,
            },
        };
        const decision = decisions[input.status];
        if (!decision)
            return;
        await this.create({
            recipientUserId: recipient,
            type: 'verification',
            title: decision.title,
            body: decision.body,
            passportId: input.passportId,
        });
    }
}
export const notificationService = new NotificationService();
/** Helper used by event producers: notification failure must never fail the event. */
export function notifyEventSafely(label, promise) {
    void promise.catch((err) => {
        logger.warn('Notification could not be recorded', {
            event: label,
            error: err instanceof Error ? err.message : String(err),
        });
    });
}
