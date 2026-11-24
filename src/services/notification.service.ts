import { notificationRepository } from '../repositories/notification.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import { logger } from '../utils/logger.js';
import type { NotificationType, UserNotificationRow } from '../types/database.types.js';

/**
 * Contributor notification inbox.
 *
 * The service is the only place that decides what a notification says and who
 * receives it. Every read is keyed by an authenticated viewer's user id, never
 * by a client-supplied account id.
 */

export interface NotificationApiItem {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  type: NotificationType;
  passport_id: string | null;
  site_id: string | null;
  comment_id: string | null;
}

export interface CreateNotificationInput {
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  passportId?: string | null;
  siteId?: string | null;
  commentId?: string | null;
}

export interface StaffNotificationInput {
  recipientUserIds?: string[];
  broadcast?: boolean;
  title: string;
  body: string;
  createdBy: string;
}

const MAX_TITLE_LENGTH = 160;
const MAX_BODY_LENGTH = 500;

function toApiItem(row: UserNotificationRow): NotificationApiItem {
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

function clip(value: string, max: number): string {
  const trimmed = String(value ?? '').replace(/\s+/g, ' ').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export class NotificationService {
  async listForUser(userId: string): Promise<NotificationApiItem[]> {
    const rows = await notificationRepository.listForUser(userId);
    return rows.map(toApiItem);
  }

  async markRead(
    userId: string,
    notificationId: string,
    read: boolean = true
  ): Promise<NotificationApiItem | null> {
    const row = await notificationRepository.markRead(userId, notificationId, read);
    return row ? toApiItem(row) : null;
  }

  async markAllRead(userId: string): Promise<number> {
    return notificationRepository.markAllRead(userId);
  }

  async dismiss(userId: string, notificationId: string): Promise<boolean> {
    return notificationRepository.dismiss(userId, notificationId);
  }

  async clear(userId: string): Promise<number> {
    return notificationRepository.clearForUser(userId);
  }

  /**
   * Creates a notification for a real event. Called by other services after the
   * underlying write has succeeded; a notification failure is logged by the
   * caller and never turns a successful comment or review into an error.
   */
  async create(input: CreateNotificationInput): Promise<NotificationApiItem> {
    const recipientUserId = String(input.recipientUserId ?? '').trim();
    if (!recipientUserId) throw new Error('A notification recipient is required.');

    const title = clip(input.title, MAX_TITLE_LENGTH);
    const body = clip(input.body, MAX_BODY_LENGTH);
    if (!title || !body) throw new Error('A notification needs a title and a body.');

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
  async createStaffAnnouncement(input: StaffNotificationInput): Promise<{ sent: number; recipients: number }> {
    const title = clip(input.title, MAX_TITLE_LENGTH);
    const body = clip(input.body, MAX_BODY_LENGTH);
    if (!title || !body) throw new Error('An announcement needs a title and a message.');

    const recipients = input.broadcast
      ? await userRepository.listRecipientUserIds()
      : [...new Set((input.recipientUserIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))];

    if (recipients.length === 0) {
      throw new Error('Choose at least one recipient or send to all users.');
    }

    const results = await Promise.allSettled(
      recipients.map((recipientUserId) =>
        this.create({
          recipientUserId,
          type: 'announcement',
          title,
          body,
        })
      )
    );

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
  async notifyComment(input: {
    recipientUserId: string | null;
    actorUserId: string;
    actorDisplayName: string | null;
    passportId: string;
    commentId?: string | null;
    isReply: boolean;
    body: string;
  }): Promise<void> {
    const recipient = String(input.recipientUserId ?? '').trim();
    if (!recipient || recipient === input.actorUserId) return;

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
  async notifyVerification(input: {
    recipientUserId: string | null;
    passportId: string;
    status: string;
  }): Promise<void> {
    const recipient = String(input.recipientUserId ?? '').trim();
    if (!recipient) return;

    const decisions: Record<string, { title: string; body: string }> = {
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
    if (!decision) return;

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
export function notifyEventSafely(label: string, promise: Promise<unknown>): void {
  void promise.catch((err: unknown) => {
    logger.warn('Notification could not be recorded', {
      event: label,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
