import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
class CommunityMediaRepository {
    get ready() {
        return isDatabaseConfigured();
    }
    unavailable(operation, err) {
        logger.error('Community media database operation failed', {
            operation,
            error: err instanceof Error ? err.message : String(err),
        });
        throw new ServiceUnavailableError(operation, err);
    }
    /**
     * Records a freshly uploaded attachment as hidden pending review.
     *
     * Callers must delete the stored object if this throws, so an attachment that
     * has no moderation row never exists in the bucket.
     */
    async insertPending(input) {
        try {
            const { data, error } = await supabase.from('community_media')
                .insert({
                id: input.id,
                media_type: input.kind,
                mime_type: input.mimeType,
                storage_path: input.storagePath,
                caption: input.caption,
                contributor_hash: input.contributorHash,
                moderation_status: 'pending_review',
                is_public: false,
            })
                .select('*')
                .single();
            if (error)
                throw new Error(error.message);
            return data;
        }
        catch (err) {
            this.unavailable('community media record creation', err);
        }
    }
    /** Reads the moderation row. A database error is thrown, never read as "absent". */
    async findById(id) {
        try {
            const { data, error } = await supabase.from('community_media')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            if (error)
                throw new Error(error.message);
            return data ?? null;
        }
        catch (err) {
            this.unavailable('community media lookup', err);
        }
    }
    /**
     * Applies a moderation decision. `visible` is the only status that publishes
     * bytes; every other status clears `is_public`.
     */
    async setModerationStatus(id, status, reason, actor) {
        try {
            const { data, error } = await supabase.rpc('moderate_community_media_transactional', {
                p_media_id: id,
                p_moderation_status: status,
                p_reason: reason,
                p_actor: actor,
                p_actor_role: 'super_admin',
            });
            if (error)
                throw new Error(error.message);
            return data ?? null;
        }
        catch (err) {
            this.unavailable('community media moderation', err);
        }
    }
}
export const communityMediaRepository = new CommunityMediaRepository();
