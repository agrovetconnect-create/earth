import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
export class UserAvatarRepository {
    memory = new Map();
    get ready() {
        return isDatabaseConfigured();
    }
    requireDatabase(operation) {
        if (!this.ready && env.IS_PRODUCTION) {
            throw new Error(`A profile photo ${operation} requires a configured database. ` +
                'Set SUPABASE_URL and SUPABASE_SECRET_KEY and run migration 024_user_avatars.sql.');
        }
    }
    async setAvatar(userId, avatar) {
        this.requireDatabase('upload');
        const updatedAt = new Date().toISOString();
        if (this.ready) {
            const { error } = await supabase.from('user_avatars').upsert({
                user_id: userId,
                mime_type: avatar.mimeType,
                content_base64: avatar.base64,
                byte_size: avatar.byteSize,
                updated_at: updatedAt,
            }, { onConflict: 'user_id' });
            if (error) {
                logger.warn('Could not store the profile photo', { error: error.message });
                throw new Error('The profile photo could not be stored. Please try again.');
            }
            return { ...avatar, updatedAt };
        }
        const stored = { ...avatar, updatedAt };
        this.memory.set(userId, stored);
        return stored;
    }
    async clearAvatar(userId) {
        this.requireDatabase('removal');
        if (this.ready) {
            const { error } = await supabase.from('user_avatars')
                .delete()
                .eq('user_id', userId);
            if (error) {
                logger.warn('Could not remove the profile photo', { error: error.message });
                throw new Error('The profile photo could not be removed. Please try again.');
            }
            return;
        }
        this.memory.delete(userId);
    }
    async findAvatarByUserId(userId) {
        if (this.ready) {
            try {
                const { data, error } = await supabase.from('user_avatars')
                    .select('mime_type, content_base64, byte_size, updated_at')
                    .eq('user_id', userId)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                if (!data)
                    return null;
                return {
                    mimeType: data.mime_type,
                    base64: data.content_base64,
                    byteSize: data.byte_size,
                    updatedAt: data.updated_at,
                };
            }
            catch (err) {
                logger.warn('Could not read the profile photo', { error: String(err) });
                return null;
            }
        }
        return this.memory.get(userId) ?? null;
    }
}
export const userAvatarRepository = new UserAvatarRepository();
