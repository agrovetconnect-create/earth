import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { nowIso } from '../utils/time.js';
/**
 * Per-account notification inbox (migration 048).
 *
 * Every operation is scoped by recipient_user_id, so one account can never
 * read, mark or delete another account's notification even if it guesses an id.
 * Supabase is authoritative when configured; the process-local store is only a
 * development fallback and is never seeded with invented notifications.
 */
const LIST_LIMIT = 100;
const memory = new Map();
export class NotificationRepository {
    get ready() {
        return isDatabaseConfigured();
    }
    requireDatabase(operation) {
        if (!this.ready && env.IS_PRODUCTION) {
            throw new ServiceUnavailableError(operation, undefined, `${operation} requires a configured database. Set SUPABASE_URL and SUPABASE_SECRET_KEY and run migration 048_user_notifications.sql.`);
        }
    }
    databaseFailure(operation, err) {
        logger.error('Database operation failed; refusing to fall back to process memory', {
            operation,
            error: err instanceof Error ? err.message : String(err),
        });
        return new ServiceUnavailableError(operation, err);
    }
    async listForUser(userId) {
        if (!userId)
            return [];
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('user_notifications')
                    .select('*')
                    .eq('recipient_user_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(LIST_LIMIT);
                if (error)
                    throw new Error(error.message);
                return Array.isArray(data) ? data : [];
            }
            catch (err) {
                throw this.databaseFailure('notification list', err);
            }
        }
        return (memory.get(userId) ?? [])
            .slice()
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, LIST_LIMIT);
    }
    async create(input) {
        this.requireDatabase('notification create');
        const row = {
            id: crypto.randomUUID(),
            recipient_user_id: input.recipient_user_id,
            type: input.type,
            title: input.title,
            body: input.body,
            passport_id: input.passport_id ?? null,
            site_id: input.site_id ?? null,
            comment_id: input.comment_id ?? null,
            read_at: input.read_at ?? null,
            created_at: input.created_at ?? nowIso(),
        };
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('user_notifications')
                    .insert({
                    recipient_user_id: row.recipient_user_id,
                    type: row.type,
                    title: row.title,
                    body: row.body,
                    passport_id: row.passport_id,
                    site_id: row.site_id,
                    comment_id: row.comment_id,
                    read_at: row.read_at,
                    created_at: row.created_at,
                })
                    .select('*')
                    .single();
                if (error || !data)
                    throw new Error(error?.message || 'No notification row returned');
                return data;
            }
            catch (err) {
                throw this.databaseFailure('notification create', err);
            }
        }
        const list = memory.get(row.recipient_user_id) ?? [];
        list.unshift(row);
        memory.set(row.recipient_user_id, list);
        return row;
    }
    async markRead(userId, notificationId, read = true) {
        if (!userId || !notificationId)
            return null;
        this.requireDatabase('notification update');
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('user_notifications')
                    .update({ read_at: read ? nowIso() : null })
                    .eq('recipient_user_id', userId)
                    .eq('id', notificationId)
                    .select('*')
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                return data ?? null;
            }
            catch (err) {
                throw this.databaseFailure('notification update', err);
            }
        }
        const list = memory.get(userId) ?? [];
        const index = list.findIndex((item) => item.id === notificationId);
        if (index < 0)
            return null;
        list[index] = { ...list[index], read_at: read ? nowIso() : null };
        memory.set(userId, list);
        return list[index];
    }
    async markAllRead(userId) {
        if (!userId)
            return 0;
        this.requireDatabase('notification update');
        const readAt = nowIso();
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('user_notifications')
                    .update({ read_at: readAt })
                    .eq('recipient_user_id', userId)
                    .is('read_at', null)
                    .select('id');
                if (error)
                    throw new Error(error.message);
                return Array.isArray(data) ? data.length : 0;
            }
            catch (err) {
                throw this.databaseFailure('notification update', err);
            }
        }
        const list = memory.get(userId) ?? [];
        let changed = 0;
        const updated = list.map((item) => {
            if (item.read_at)
                return item;
            changed += 1;
            return { ...item, read_at: readAt };
        });
        memory.set(userId, updated);
        return changed;
    }
    async dismiss(userId, notificationId) {
        if (!userId || !notificationId)
            return false;
        this.requireDatabase('notification removal');
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('user_notifications')
                    .delete()
                    .eq('recipient_user_id', userId)
                    .eq('id', notificationId)
                    .select('id');
                if (error)
                    throw new Error(error.message);
                return Array.isArray(data) && data.length > 0;
            }
            catch (err) {
                throw this.databaseFailure('notification removal', err);
            }
        }
        const list = memory.get(userId) ?? [];
        const remaining = list.filter((item) => item.id !== notificationId);
        const removed = remaining.length !== list.length;
        memory.set(userId, remaining);
        return removed;
    }
    async clearForUser(userId) {
        if (!userId)
            return 0;
        this.requireDatabase('notification removal');
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('user_notifications')
                    .delete()
                    .eq('recipient_user_id', userId)
                    .select('id');
                if (error)
                    throw new Error(error.message);
                return Array.isArray(data) ? data.length : 0;
            }
            catch (err) {
                throw this.databaseFailure('notification removal', err);
            }
        }
        const count = (memory.get(userId) ?? []).length;
        memory.set(userId, []);
        return count;
    }
}
export const notificationRepository = new NotificationRepository();
