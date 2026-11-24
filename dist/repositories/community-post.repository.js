import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { nowIso } from '../utils/time.js';
const memory = {
    observations: new Map(),
    locations: new Map(),
    media: new Map(),
    questions: new Map(),
    comments: new Map(),
    commentImages: new Map(),
    commentReactions: new Map(),
    attachments: new Map(),
    audit: [],
};
export class CommunityPostRepository {
    get ready() {
        return isDatabaseConfigured();
    }
    /**
     * Writes need a real database outside development. Silently buffering a
     * privacy change in memory would mean the contributor's choice to hide a
     * post evaporates on the next restart.
     */
    requireDatabase(operation) {
        if (!this.ready && env.IS_PRODUCTION) {
            throw new ServiceUnavailableError(`post ${operation}`, undefined, `Post ${operation} requires a configured database. ` +
                'Set SUPABASE_URL and SUPABASE_SECRET_KEY and run migration 016_community_posts.sql.');
        }
    }
    get database() {
        return this.ready;
    }
    /**
     * A configured database is authoritative: when a read against it fails we
     * surface a 503 rather than answering from the process-local store. Falling
     * back would make an outage look like "no posts", and would hide hidden or
     * private records behind an empty list.
     */
    databaseFailure(operation, err) {
        logger.error('Database read failed; refusing to fall back to process memory', {
            operation,
            error: err instanceof Error ? err.message : String(err),
        });
        return new ServiceUnavailableError(operation, err);
    }
    // ==========================================================================
    // Observations
    // ==========================================================================
    /**
     * Registers a row in the development memory store.
     *
     * Called by tests, and available to the publish path. Never called by the
     * application on its own: an empty store is the honest default.
     */
    registerObservationRecord(row) {
        memory.observations.set(row.passport_id, row);
    }
    async findObservation(passportId) {
        if (!passportId)
            return null;
        const wanted = passportId.trim().toUpperCase();
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observations')
                    .select('*')
                    .ilike('passport_id', wanted)
                    .eq('is_demo', false)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                if (data)
                    return data;
            }
            catch (err) {
                throw this.databaseFailure('observation read for post card', err);
            }
        }
        for (const row of memory.observations.values()) {
            if (!row.is_demo && row.passport_id.toUpperCase() === wanted)
                return row;
        }
        return null;
    }
    async listObservationsByOwner(userId) {
        if (!userId)
            return [];
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observations')
                    .select('*')
                    .eq('owner_user_id', userId)
                    .order('created_at', { ascending: false });
                if (error)
                    throw new Error(error.message);
                if (Array.isArray(data))
                    return data;
            }
            catch (err) {
                throw this.databaseFailure('contributor post list', err);
            }
        }
        return Array.from(memory.observations.values())
            .filter((row) => row.owner_user_id === userId)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    async listObservationsBySourceHash(sourceUserHash) {
        if (!sourceUserHash)
            return [];
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observations')
                    .select('*')
                    .eq('source_user_hash', sourceUserHash)
                    .order('created_at', { ascending: false });
                if (error)
                    throw new Error(error.message);
                if (Array.isArray(data))
                    return data;
            }
            catch (err) {
                throw this.databaseFailure('contributor hash post list', err);
            }
        }
        return Array.from(memory.observations.values())
            .filter((row) => row.source_user_hash === sourceUserHash)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    async updatePostFields(passportId, patch) {
        this.requireDatabase('editing');
        const payload = { ...patch, community_updated_at: nowIso() };
        if (this.database) {
            try {
                const { error } = await supabase.from('observations')
                    .update(payload)
                    .ilike('passport_id', passportId.trim());
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('post field update', err);
            }
        }
        const row = await this.findObservation(passportId);
        if (row)
            Object.assign(row, payload);
    }
    async setPublicationStatus(passportId, status) {
        this.requireDatabase('privacy changes');
        if (this.database) {
            try {
                const { error } = await supabase.from('observations')
                    .update({
                    publication_status: status,
                    published_at: status === 'public' ? nowIso() : null,
                    updated_at: nowIso(),
                })
                    .ilike('passport_id', passportId.trim());
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('post publication status update', err);
            }
        }
        const row = await this.findObservation(passportId);
        if (row) {
            row.publication_status = status;
            row.published_at = status === 'public' ? nowIso() : null;
            row.updated_at = nowIso();
        }
    }
    /** Attaches the signed-in account as owner, once, for a post that has none. */
    async linkOwner(passportId, userId) {
        if (!userId)
            return false;
        this.requireDatabase('ownership');
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observations')
                    .update({ owner_user_id: userId })
                    .ilike('passport_id', passportId.trim())
                    .is('owner_user_id', null)
                    .select('id');
                if (error)
                    throw new Error(error.message);
                return Array.isArray(data) && data.length > 0;
            }
            catch (err) {
                throw this.databaseFailure('post owner link', err);
            }
        }
        const row = await this.findObservation(passportId);
        if (row && !row.owner_user_id) {
            row.owner_user_id = userId;
            return true;
        }
        return false;
    }
    // ==========================================================================
    // Location
    // ==========================================================================
    async findLocation(observationId) {
        if (!observationId)
            return null;
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_locations')
                    .select('*')
                    .eq('observation_id', observationId)
                    .order('created_at', { ascending: true })
                    .limit(1)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                if (data)
                    return data;
                return null;
            }
            catch (err) {
                throw this.databaseFailure('post location read', err);
            }
        }
        return memory.locations.get(observationId) ?? null;
    }
    async setLocationPrecision(observationId, precision, isPublic) {
        this.requireDatabase('location privacy changes');
        const patch = { public_location_precision: precision };
        if (typeof isPublic === 'boolean') {
            patch.is_public = isPublic;
        }
        if (this.database) {
            try {
                const { error } = await supabase.from('observation_locations')
                    .update(patch)
                    .eq('observation_id', observationId);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('location precision update', err);
            }
        }
        const location = memory.locations.get(observationId);
        if (location) {
            location.public_location_precision = precision;
            if (typeof isPublic === 'boolean') {
                location.is_public = isPublic;
            }
        }
    }
    async setLocationPublicFlag(observationId, isPublic) {
        this.requireDatabase('location visibility changes');
        if (this.database) {
            try {
                const { error } = await supabase.from('observation_locations')
                    .update({ is_public: isPublic })
                    .eq('observation_id', observationId);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('location visibility update', err);
            }
        }
        const location = memory.locations.get(observationId);
        if (location) {
            location.is_public = isPublic;
        }
    }
    registerLocationRecord(location) {
        memory.locations.set(location.observation_id, location);
    }
    // ==========================================================================
    // Media
    // ==========================================================================
    async listMedia(observationId) {
        if (!observationId)
            return [];
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_media')
                    .select('*')
                    .eq('observation_id', observationId)
                    .order('sort_order', { ascending: true })
                    .order('created_at', { ascending: true });
                if (error)
                    throw new Error(error.message);
                if (Array.isArray(data))
                    return data;
            }
            catch (err) {
                throw this.databaseFailure('post gallery read', err);
            }
        }
        return memory.media.get(observationId) ?? [];
    }
    registerMediaRecord(mediaRow) {
        const list = memory.media.get(mediaRow.observation_id) ?? [];
        const existingIdx = list.findIndex((entry) => entry.id === mediaRow.id ||
            (mediaRow.source_media_id && entry.source_media_id === mediaRow.source_media_id));
        if (existingIdx >= 0) {
            list[existingIdx] = mediaRow;
        }
        else {
            list.push(mediaRow);
        }
        memory.media.set(mediaRow.observation_id, list);
    }
    async setMediaPublicVisibility(observationId, isPublic) {
        this.requireDatabase('media visibility changes');
        const patch = {
            is_public: isPublic,
            visibility: isPublic ? 'public' : 'private',
            updated_at: nowIso(),
        };
        if (this.database) {
            try {
                const { error } = await supabase.from('observation_media')
                    .update(patch)
                    .eq('observation_id', observationId);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('media visibility update', err);
            }
        }
        const list = memory.media.get(observationId) ?? [];
        for (const item of list) {
            item.is_public = patch.is_public;
            item.visibility = patch.visibility;
            item.updated_at = patch.updated_at;
        }
    }
    async insertMedia(input) {
        this.requireDatabase('media uploads');
        const row = {
            id: crypto.randomUUID(),
            observation_id: input.observation_id,
            media_type: input.media_type,
            mime_type: input.mime_type,
            file_size: input.file_size,
            sha256: input.sha256,
            source_media_id: input.source_media_id,
            storage_status: input.storage_status,
            site_id: null,
            file_path: null,
            capture_date: null,
            caption: input.caption,
            media_category: null,
            view_type: null,
            duration_seconds: null,
            width_px: null,
            height_px: null,
            visibility: input.visibility,
            moderation_status: 'visible',
            moderated_by: null,
            moderated_at: null,
            media_role: input.media_role,
            sort_order: input.sort_order,
            is_public: input.is_public,
            content_base64: input.content_base64,
            stored_by_user_id: input.stored_by_user_id,
            updated_at: nowIso(),
            created_at: nowIso(),
        };
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_media')
                    .insert(row)
                    .select('*')
                    .single();
                if (error || !data)
                    throw new Error(error?.message || 'No media row returned');
                return data;
            }
            catch (err) {
                throw this.databaseFailure('post media insert', err);
            }
        }
        const list = memory.media.get(input.observation_id) ?? [];
        list.push(row);
        memory.media.set(input.observation_id, list);
        return row;
    }
    async findMedia(mediaId) {
        if (!mediaId)
            return null;
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_media')
                    .select('*')
                    .eq('id', mediaId)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                if (data)
                    return data;
                return null;
            }
            catch (err) {
                throw this.databaseFailure('gallery item read', err);
            }
        }
        for (const list of memory.media.values()) {
            const match = list.find((entry) => entry.id === mediaId);
            if (match)
                return match;
        }
        return null;
    }
    async findMediaForObservation(observationId, mediaIdOrSourceId) {
        if (!observationId || !mediaIdOrSourceId)
            return null;
        const list = await this.listMedia(observationId);
        return (list.find((entry) => entry.id === mediaIdOrSourceId || entry.source_media_id === mediaIdOrSourceId) ?? null);
    }
    async deleteMedia(observationId, mediaId) {
        if (!observationId || !mediaId)
            return false;
        this.requireDatabase('media deletion');
        if (this.database) {
            try {
                const { error } = await supabase.from('observation_media')
                    .delete()
                    .eq('observation_id', observationId)
                    .eq('id', mediaId);
                if (error)
                    throw new Error(error.message);
                return true;
            }
            catch (err) {
                throw this.databaseFailure('post media delete', err);
            }
        }
        const list = memory.media.get(observationId) ?? [];
        const next = list.filter((entry) => entry.id !== mediaId && entry.source_media_id !== mediaId);
        if (next.length === list.length)
            return false;
        memory.media.set(observationId, next);
        return true;
    }
    // ==========================================================================
    // Attached documents, research and reports
    // ==========================================================================
    async listAttachments(observationId) {
        if (!observationId)
            return [];
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_attachments')
                    .select('*')
                    .eq('observation_id', observationId)
                    .order('created_at', { ascending: true });
                if (error)
                    throw new Error(error.message);
                if (Array.isArray(data))
                    return data;
            }
            catch (err) {
                throw this.databaseFailure('attachment list', err);
            }
        }
        return memory.attachments.get(observationId) ?? [];
    }
    async insertAttachment(input) {
        this.requireDatabase('attachment uploads');
        const row = {
            id: input.id ?? crypto.randomUUID(),
            observation_id: input.observation_id,
            kind: input.kind,
            title: input.title,
            description: input.description,
            filename: input.filename,
            mime_type: input.mime_type,
            size_bytes: input.size_bytes,
            url: input.url,
            content_base64: input.content_base64 ?? null,
            storage_path: null,
            is_public: input.is_public,
            allow_download: input.allow_download ?? true,
            uploader_user_id: input.uploader_user_id,
            created_at: nowIso(),
            updated_at: nowIso(),
        };
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_attachments')
                    .insert(row)
                    .select('*')
                    .single();
                if (error || !data)
                    throw new Error(error?.message || 'No attachment row returned');
                return data;
            }
            catch (err) {
                throw this.databaseFailure('attachment insert', err);
            }
        }
        const list = memory.attachments.get(input.observation_id) ?? [];
        list.push(row);
        memory.attachments.set(input.observation_id, list);
        return row;
    }
    async findAttachment(observationId, attachmentId) {
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_attachments')
                    .select('*')
                    .eq('id', attachmentId)
                    .eq('observation_id', observationId)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                return data ?? null;
            }
            catch (err) {
                throw this.databaseFailure('attachment lookup', err);
            }
        }
        return memory.attachments.get(observationId)?.find((row) => row.id === attachmentId) ?? null;
    }
    async setAttachmentsPublicVisibility(observationId, isPublic) {
        if (this.database) {
            try {
                const { error } = await supabase.from('observation_attachments')
                    .update({ is_public: isPublic, updated_at: nowIso() })
                    .eq('observation_id', observationId);
                if (error)
                    throw new Error(error.message);
            }
            catch (err) {
                throw this.databaseFailure('attachment visibility update', err);
            }
            return;
        }
        for (const row of memory.attachments.get(observationId) ?? []) {
            row.is_public = isPublic;
            row.updated_at = nowIso();
        }
    }
    /**
     * Flips whether a reader may download one attachment, or only preview it.
     * Ownership is checked by the caller; this only persists the toggle.
     */
    async updateAttachmentDownload(observationId, attachmentId, allowDownload) {
        this.requireDatabase('attachment download permissions');
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_attachments')
                    .update({
                    allow_download: allowDownload,
                    updated_at: nowIso(),
                })
                    .eq('id', attachmentId)
                    .eq('observation_id', observationId)
                    .select('*')
                    .single();
                if (error)
                    throw new Error(error.message);
                if (data)
                    return data;
                return null;
            }
            catch (err) {
                throw this.databaseFailure('attachment download permission update', err);
            }
        }
        const list = memory.attachments.get(observationId) ?? [];
        const row = list.find((entry) => entry.id === attachmentId) ?? null;
        if (row) {
            row.allow_download = allowDownload;
            row.updated_at = nowIso();
        }
        return row;
    }
    // ==========================================================================
    // AI questions
    // ==========================================================================
    async listQuestions(observationId) {
        if (!observationId)
            return [];
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_questions')
                    .select('*')
                    .eq('observation_id', observationId)
                    .order('asked_at', { ascending: true });
                if (error)
                    throw new Error(error.message);
                if (Array.isArray(data))
                    return data;
                return [];
            }
            catch (err) {
                throw this.databaseFailure('AI question list', err);
            }
        }
        return memory.questions.get(observationId) ?? [];
    }
    async insertQuestion(input) {
        this.requireDatabase('question storage');
        const row = {
            id: crypto.randomUUID(),
            observation_id: input.observation_id,
            question_id: input.question_id,
            question: input.question,
            asked_by: 'ai',
            asked_at: nowIso(),
            status: 'open',
            answer: null,
            answered_at: null,
            answered_by: null,
            answered_by_user_id: null,
            is_public: input.is_public ?? true,
            created_at: nowIso(),
            updated_at: nowIso(),
        };
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_questions')
                    .insert(row)
                    .select('*')
                    .single();
                if (error || !data)
                    throw new Error(error?.message || 'No question row returned');
                return data;
            }
            catch (err) {
                throw this.databaseFailure('AI question insert', err);
            }
        }
        const list = memory.questions.get(input.observation_id) ?? [];
        list.push(row);
        memory.questions.set(input.observation_id, list);
        return row;
    }
    /**
     * Records an answer and who gave it.
     *
     * `answered_by` is always written: a question answered by the contributor
     * must never be readable as if the model had answered it.
     */
    async answerQuestion(input) {
        this.requireDatabase('question answers');
        const patch = {
            answer: input.answer,
            answered_at: nowIso(),
            answered_by: input.answeredBy,
            answered_by_user_id: input.answeredByUserId,
            status: 'answered',
            updated_at: nowIso(),
        };
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_questions')
                    .update(patch)
                    .eq('id', input.questionId)
                    .eq('status', 'open')
                    .select('*')
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                return data ?? null;
            }
            catch (err) {
                throw this.databaseFailure('AI question answer', err);
            }
        }
        for (const list of memory.questions.values()) {
            const match = list.find((entry) => entry.id === input.questionId && entry.status === 'open');
            if (match) {
                Object.assign(match, patch);
                return match;
            }
        }
        return null;
    }
    registerQuestions(observationId, rows) {
        memory.questions.set(observationId, rows);
    }
    // ==========================================================================
    // Comments
    // ==========================================================================
    async listComments(passportId) {
        if (!passportId)
            return [];
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_comments')
                    .select('*')
                    .eq('passport_id', passportId.trim())
                    .order('created_at', { ascending: true });
                if (error)
                    throw new Error(error.message);
                if (Array.isArray(data)) {
                    return data.map((row) => ({
                        ...row,
                        image_url: row.image_url ?? memory.commentImages.get(row.id) ?? null,
                    }));
                }
                return [];
            }
            catch (err) {
                throw this.databaseFailure('discussion read', err);
            }
        }
        return memory.comments.get(passportId.trim()) ?? [];
    }
    async countVisibleComments(passportId) {
        const trimmed = passportId.trim();
        if (!trimmed)
            return 0;
        if (this.database) {
            try {
                const { count, error } = await supabase.from('observation_comments')
                    .select('id', { count: 'exact', head: true })
                    .eq('passport_id', trimmed)
                    .eq('moderation_status', 'visible');
                if (error)
                    throw new Error(error.message);
                return typeof count === 'number' ? count : 0;
            }
            catch (err) {
                throw this.databaseFailure('discussion count', err);
            }
        }
        return (memory.comments.get(trimmed) ?? []).filter((row) => row.moderation_status === 'visible').length;
    }
    async insertComment(input) {
        this.requireDatabase('discussion');
        const row = {
            id: crypto.randomUUID(),
            passport_id: input.passport_id,
            observation_id: input.observation_id,
            parent_comment_id: input.parent_comment_id,
            author_user_id: input.author_user_id,
            body: input.body,
            image_url: input.image_url ?? null,
            moderation_status: 'visible',
            moderation_reason: null,
            moderated_by: null,
            moderated_at: null,
            edited_at: null,
            created_at: nowIso(),
            updated_at: nowIso(),
        };
        if (this.database) {
            try {
                const insertPayload = {
                    passport_id: row.passport_id,
                    observation_id: input.observation_id || null,
                    parent_comment_id: input.parent_comment_id,
                    author_user_id: input.author_user_id,
                    body: input.body,
                };
                if (input.image_url) {
                    insertPayload.image_url = input.image_url;
                }
                const firstTry = await supabase.from('observation_comments')
                    .insert(insertPayload)
                    .select('*')
                    .single();
                if (firstTry.error &&
                    input.image_url &&
                    /image_url|schema cache|column/i.test(String(firstTry.error.message || ''))) {
                    delete insertPayload.image_url;
                    const retry = await supabase.from('observation_comments')
                        .insert(insertPayload)
                        .select('*')
                        .single();
                    if (retry.error || !retry.data) {
                        throw new Error(retry.error?.message || 'No comment row returned');
                    }
                    const created = retry.data;
                    memory.commentImages.set(created.id, input.image_url);
                    return { ...created, image_url: input.image_url };
                }
                if (firstTry.error || !firstTry.data) {
                    throw new Error(firstTry.error?.message || 'No comment row returned');
                }
                return firstTry.data;
            }
            catch (err) {
                throw this.databaseFailure('comment insert', err);
            }
        }
        const list = memory.comments.get(input.passport_id) ?? [];
        list.push(row);
        memory.comments.set(input.passport_id, list);
        return row;
    }
    /** True when a reply target exists on the same post. */
    async findComment(passportId, commentId) {
        const rows = await this.listComments(passportId);
        return rows.find((row) => row.id === commentId) ?? null;
    }
    async listCommentReactions(passportId, viewerKey) {
        const summaryMap = new Map();
        const ensure = (commentId) => {
            let item = summaryMap.get(commentId);
            if (!item) {
                item = { likes_count: 0, viewer_liked: false };
                summaryMap.set(commentId, item);
            }
            return item;
        };
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_comment_reactions')
                    .select('comment_id, reactor_key, reaction_type')
                    .eq('passport_id', passportId.trim());
                if (!error && Array.isArray(data)) {
                    for (const row of data) {
                        const target = ensure(row.comment_id);
                        if (row.reaction_type === 'heart') {
                            target.likes_count += 1;
                            if (viewerKey && row.reactor_key === viewerKey)
                                target.viewer_liked = true;
                        }
                    }
                    return summaryMap;
                }
                if (error && !/observation_comment_reactions|relation|schema cache/i.test(error.message || '')) {
                    throw new Error(error.message);
                }
            }
            catch (err) {
                if (!/observation_comment_reactions|relation|schema cache/i.test(err instanceof Error ? err.message : String(err))) {
                    throw this.databaseFailure('comment reactions read', err);
                }
            }
        }
        const passportMap = memory.commentReactions.get(passportId.trim());
        if (passportMap) {
            for (const [commentId, keys] of passportMap.entries()) {
                const target = ensure(commentId);
                for (const composite of keys) {
                    const [rtype, ...rest] = composite.split(':');
                    const rkey = rest.join(':');
                    if (rtype === 'heart') {
                        target.likes_count += 1;
                        if (viewerKey && rkey === viewerKey)
                            target.viewer_liked = true;
                    }
                }
            }
        }
        return summaryMap;
    }
    async toggleCommentReaction(input) {
        const cleanPassport = input.passportId.trim();
        if (this.database) {
            try {
                const existing = await supabase.from('observation_comment_reactions')
                    .select('id')
                    .eq('comment_id', input.commentId)
                    .eq('reactor_key', input.reactorKey)
                    .eq('reaction_type', input.reactionType)
                    .maybeSingle();
                if (!existing.error) {
                    if (existing.data?.id) {
                        await supabase.from('observation_comment_reactions')
                            .delete()
                            .eq('id', existing.data.id);
                    }
                    else {
                        const ins = await supabase.from('observation_comment_reactions').insert({
                            passport_id: cleanPassport,
                            comment_id: input.commentId,
                            reactor_key: input.reactorKey,
                            reaction_type: input.reactionType,
                        });
                        if (ins.error)
                            throw new Error(ins.error.message);
                    }
                    const map = await this.listCommentReactions(cleanPassport, input.reactorKey);
                    return (map.get(input.commentId) ?? {
                        likes_count: 0,
                        viewer_liked: false,
                    });
                }
                if (!/observation_comment_reactions|relation|schema cache/i.test(existing.error.message || '')) {
                    throw new Error(existing.error.message);
                }
            }
            catch (err) {
                if (!/observation_comment_reactions|relation|schema cache/i.test(err instanceof Error ? err.message : String(err))) {
                    throw this.databaseFailure('comment reaction toggle', err);
                }
            }
        }
        let passportMap = memory.commentReactions.get(cleanPassport);
        if (!passportMap) {
            passportMap = new Map();
            memory.commentReactions.set(cleanPassport, passportMap);
        }
        let set = passportMap.get(input.commentId);
        if (!set) {
            set = new Set();
            passportMap.set(input.commentId, set);
        }
        const composite = `${input.reactionType}:${input.reactorKey}`;
        if (set.has(composite)) {
            set.delete(composite);
        }
        else {
            set.add(composite);
        }
        const map = await this.listCommentReactions(cleanPassport, input.reactorKey);
        return (map.get(input.commentId) ?? {
            likes_count: 0,
            viewer_liked: false,
        });
    }
    /**
     * Moderation list, newest first.
     *
     * `moderation_status` filters only what is asked for; the default is every
     * comment, because a queue that hides already-hidden entries would make
     * "what did we hide and why" unanswerable.
     */
    async listCommentsForModeration(params) {
        if (this.database) {
            try {
                let query = supabase.from('observation_comments').select('*', {
                    count: 'exact',
                });
                if (params.passportId)
                    query = query.ilike('passport_id', params.passportId.trim());
                if (params.status)
                    query = query.eq('moderation_status', params.status);
                const { data, error, count } = await query
                    .order('created_at', { ascending: false })
                    .range(params.offset, params.offset + params.limit - 1);
                if (error)
                    throw new Error(error.message);
                const rows = data ?? [];
                return { rows, total: count ?? rows.length };
            }
            catch (err) {
                throw this.databaseFailure('moderation queue read', err);
            }
        }
        const all = [];
        for (const list of memory.comments.values())
            all.push(...list);
        const filtered = all.filter((row) => {
            if (params.passportId && row.passport_id.toUpperCase() !== params.passportId.trim().toUpperCase()) {
                return false;
            }
            if (params.status && row.moderation_status !== params.status)
                return false;
            return true;
        });
        const sorted = filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
        return {
            rows: sorted.slice(params.offset, params.offset + params.limit),
            total: sorted.length,
        };
    }
    /** One comment by its own id, for the moderation queue. */
    async findCommentById(commentId) {
        if (!commentId)
            return null;
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_comments')
                    .select('*')
                    .eq('id', commentId)
                    .maybeSingle();
                if (error)
                    throw new Error(error.message);
                return data ?? null;
            }
            catch (err) {
                throw this.databaseFailure('comment read', err);
            }
        }
        for (const list of memory.comments.values()) {
            const match = list.find((entry) => entry.id === commentId);
            if (match)
                return match;
        }
        return null;
    }
    /**
     * Sets a comment's moderation status with the actor and reason that made the
     * decision, so the queue records who did what and why. Returns the updated
     * row, or null when the comment does not exist.
     */
    async setCommentModeration(commentId, status, reason, moderatedBy) {
        this.requireDatabase('comment moderation');
        const patch = {
            moderation_status: status,
            moderation_reason: reason,
            moderated_by: moderatedBy,
            moderated_at: nowIso(),
            updated_at: nowIso(),
        };
        if (this.database) {
            try {
                const { data, error } = await supabase.rpc('moderate_comment_transactional', {
                    p_comment_id: commentId,
                    p_moderation_status: status,
                    p_reason: reason,
                    p_actor: moderatedBy,
                    p_actor_role: 'super_admin',
                });
                if (error)
                    throw new Error(error.message);
                return data ?? null;
            }
            catch (err) {
                throw this.databaseFailure('comment moderation update', err);
            }
        }
        for (const list of memory.comments.values()) {
            const match = list.find((entry) => entry.id === commentId);
            if (match) {
                Object.assign(match, patch);
                return match;
            }
        }
        return null;
    }
    // ==========================================================================
    // Privacy audit
    // ==========================================================================
    async recordPrivacyAudit(entry) {
        this.requireDatabase('privacy auditing');
        if (this.database) {
            try {
                const { error } = await supabase.from('observation_privacy_audit').insert(entry);
                if (error)
                    throw new Error(error.message);
                return;
            }
            catch (err) {
                throw this.databaseFailure('privacy audit insert', err);
            }
        }
        memory.audit.push(entry);
    }
    /** Audit entries recorded for one post. Used by the owner and by tests. */
    async listPrivacyAudit(observationId) {
        if (this.database) {
            try {
                const { data, error } = await supabase.from('observation_privacy_audit')
                    .select('*')
                    .eq('observation_id', observationId)
                    .order('created_at', { ascending: false });
                if (error)
                    throw new Error(error.message);
                if (Array.isArray(data))
                    return data;
            }
            catch (err) {
                throw this.databaseFailure('privacy audit read', err);
            }
        }
        return memory.audit.filter((entry) => entry.observation_id === observationId);
    }
}
export const communityPostRepository = new CommunityPostRepository();
