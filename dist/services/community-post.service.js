import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { checkDistributedRateLimit } from '../utils/rate-limiter.js';
import { validateDocument, validateMedia } from '../utils/image-validator.js';
import { normalizeDistrictName, resolvePublicCoordinates } from '../utils/public-location.js';
import { hashContributor, normalizeContributorToken } from '../utils/contributor.js';
import { resolveUserAvatarUrl } from '../utils/user-auth.js';
import { squashText } from '../utils/text.js';
import { communityPostRepository } from '../repositories/community-post.repository.js';
import { observationRepository } from '../repositories/observation.repository.js';
import { demoContentEnabled } from './system-settings.service.js';
import { userRepository } from '../repositories/user.repository.js';
import { DEMO_POSTS, demoComments, demoPublicComments, findDemoPost, } from '../data/demo-posts.js';
import { publicObservationRepository, SAME_PLACE_RADIUS_KM } from '../repositories/public-observation.repository.js';
import { haversineKm } from '../repositories/site.repository.js';
import { notificationService, notifyEventSafely } from './notification.service.js';
/**
 * Community observation posts (Stage 12).
 *
 * The service owns three separations that the interface must never blur:
 *
 *   * the contributor's own words (`user_report`) and the model's output
 *     (`ai`) are assembled into different fields, so a renderer cannot present
 *     one as the other;
 *   * a public reader, the owner, and an anonymous visitor each receive the
 *     location, gallery and discussion they are entitled to, decided here
 *     rather than in the browser;
 *   * a labelled demonstration post is built from the demonstration dataset
 *     and keeps its DEMO flag through every field it publishes.
 *
 * Demonstration posts never enter research, validation or accuracy accounting:
 * they are served from `demo-posts.ts`, not from the `observations` table that
 * those systems read.
 */
const AI_DISCLAIMER = 'This is a preliminary AI-assisted identification and not a laboratory or expert determination.';
export class PostServiceError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = 'PostServiceError';
    }
}
function fail(status, code, message) {
    throw new PostServiceError(status, code, message);
}
const MAX_TITLE_LENGTH = 120;
const MAX_REPORT_LENGTH = 4000;
const MAX_CAPTION_LENGTH = 300;
const MEDIA_ROLES = ['main', 'close_up', 'field', 'context', 'video', 'other'];
const LOCATION_PRECISIONS = ['private', 'district', 'approximate', 'exact'];
function cleanText(value, maxLength) {
    return squashText(value, maxLength);
}
// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------
function locationNote(precision, viewerIsOwner) {
    // Every note leads with the source of the position: it is supplied by the
    // contributor with the photos (WhatsApp shares the capture point or its
    // lat/long with the message - the platform never guesses a location), and
    // the AI uses that point to find nearby observations.
    if (viewerIsOwner) {
        switch (precision) {
            case 'exact':
                return 'Exact location as you shared it where the photos were taken. Public readers see this point; our AI uses it to find nearby observations.';
            case 'approximate':
                return 'Approximate location. Public readers see it generalised to about two kilometres; our AI still works from your shared point.';
            case 'district':
                return 'District level. Public readers see only the district; our AI still works from your shared point.';
            case 'private':
                return 'Private location. No public reader receives a coordinate.';
        }
    }
    switch (precision) {
        case 'exact':
            return 'Location shared by the contributor where the photos were taken; our AI uses this point to find nearby observations.';
        case 'approximate':
            return 'Location shared by the contributor, generalised to about two kilometres; our AI uses the point to find nearby observations.';
        case 'district':
            return 'Location provided by the contributor where the images were taken; our AI uses the shared co-ordinates to find nearby observations. Shown at district scale.';
        case 'private':
            return 'The contributor kept this location private.';
    }
}
function buildLocation(params) {
    const { location, viewerIsOwner } = params;
    const precision = location?.public_location_precision ?? 'district';
    let latitude = null;
    let longitude = null;
    if (viewerIsOwner) {
        // The owner always sees the point they recorded, including a private one.
        if (location?.latitude !== null && location?.latitude !== undefined)
            latitude = location.latitude;
        if (location?.longitude !== null && location?.longitude !== undefined)
            longitude = location.longitude;
        if (latitude === null || longitude === null) {
            const districtCentre = resolvePublicCoordinates({
                precision: 'district',
                district: location?.district ?? null,
            });
            latitude = districtCentre?.latitude ?? null;
            longitude = districtCentre?.longitude ?? null;
        }
    }
    else if (precision !== 'private') {
        const resolved = resolvePublicCoordinates({
            precision: precision === 'exact' ? 'exact' : precision,
            district: location?.district ?? null,
            latitude: location?.latitude ?? null,
            longitude: location?.longitude ?? null,
        });
        latitude = resolved?.latitude ?? null;
        longitude = resolved?.longitude ?? null;
    }
    return {
        address: location?.location_text ?? null,
        district: location?.district ?? null,
        sector: location?.sector ?? null,
        cell: location?.cell ?? null,
        village: location?.village ?? null,
        country: 'Rwanda',
        latitude,
        longitude,
        precision,
        approximate: precision !== 'exact',
        privacy_note: locationNote(precision, viewerIsOwner),
    };
}
function demoLocation(post) {
    const resolved = resolvePublicCoordinates({
        precision: post.precision === 'private' ? 'district' : post.precision,
        district: post.district,
        latitude: post.latitude,
        longitude: post.longitude,
    });
    return {
        address: null,
        district: post.district,
        sector: post.sector,
        cell: post.cell ?? null,
        village: post.village ?? null,
        country: 'Rwanda',
        latitude: post.precision === 'private' ? null : (resolved?.latitude ?? null),
        longitude: post.precision === 'private' ? null : (resolved?.longitude ?? null),
        precision: post.precision,
        approximate: post.precision !== 'exact',
        privacy_note: locationNote(post.precision, false),
    };
}
// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------
function mediaItemFromRow(row, passportId) {
    const hasBytes = Boolean(row.content_base64);
    return {
        media_id: row.id,
        kind: row.media_type === 'video' ? 'video' : 'image',
        role: row.media_role ?? 'field',
        caption: row.caption ?? null,
        mime_type: row.mime_type,
        sort_order: row.sort_order ?? 0,
        url: hasBytes
            ? `/api/posts/${encodeURIComponent(passportId)}/media/${encodeURIComponent(row.id)}`
            : null,
        poster_url: null,
        available: hasBytes,
        is_demo: false,
        demo_note: hasBytes
            ? null
            : 'This file arrived through WhatsApp, where only its metadata is kept, so the file itself cannot be replayed here.',
        created_at: row.created_at,
    };
}
function demoMediaItem(post, index) {
    const seed = post.media[index];
    return {
        media_id: `${post.passport_id}-media-${index}`,
        kind: seed.mime_type.startsWith('video/') ? 'video' : 'image',
        role: seed.role,
        caption: seed.caption,
        mime_type: seed.mime_type,
        sort_order: seed.sort_order,
        url: seed.url,
        poster_url: null,
        available: seed.url !== null,
        is_demo: true,
        demo_note: seed.demo_note,
        created_at: post.created_at,
    };
}
// ---------------------------------------------------------------------------
// Attachments and same-place visits
// ---------------------------------------------------------------------------
function attachmentFromRow(row) {
    return {
        attachment_id: row.id,
        kind: row.kind,
        title: row.title,
        description: row.description,
        url: row.url,
        filename: row.filename,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        created_at: row.created_at,
        allow_download: row.allow_download ?? true,
        is_demo: false,
    };
}
function demoAttachmentItem(post, index) {
    const seed = post.attachments[index];
    return {
        attachment_id: `${post.passport_id}-attachment-${index}`,
        kind: seed.kind,
        title: seed.title,
        description: seed.description ?? null,
        url: seed.url,
        filename: seed.filename,
        mime_type: seed.mime_type,
        size_bytes: seed.size_bytes ?? null,
        created_at: post.created_at,
        allow_download: seed.allow_download ?? true,
        is_demo: true,
    };
}
export function demoPublishedCoords(post) {
    if (post.precision === 'private')
        return { latitude: null, longitude: null };
    return { latitude: post.latitude, longitude: post.longitude };
}
const SAME_PLACE_NOTE = 'More than one visit was recorded near this same point (within about half a kilometre of the printed coordinate). Every visit keeps its own photos, videos, reports and documents; nothing is merged.';
/**
 * Two observations are "the same place" when their published points sit within
 * SAME_PLACE_RADIUS_KM of each other. Exact equality would be unrealistic: two
 * visitors rarely capture the identical GPS decimal pair even at the same spot.
 */
function samePlaceNote(available) {
    return available
        ? SAME_PLACE_NOTE
        : 'This observation has no published coordinates to group by.';
}
function samePlaceForDemo(post) {
    const origin = demoPublishedCoords(post);
    const available = origin.latitude !== null && origin.longitude !== null;
    if (!available)
        return { available: false, count: 0, note: samePlaceNote(false), items: [] };
    const items = DEMO_POSTS.filter((candidate) => candidate.passport_id !== post.passport_id &&
        (() => {
            const coords = demoPublishedCoords(candidate);
            if (coords.latitude === null || coords.longitude === null)
                return false;
            const distance = haversineKm(origin.latitude, origin.longitude, coords.latitude, coords.longitude);
            return Number.isFinite(distance) && distance <= SAME_PLACE_RADIUS_KM;
        })())
        .map((candidate) => ({
        passport_id: candidate.passport_id,
        title: candidate.title,
        observation_category: candidate.observation_category,
        district: candidate.district ?? null,
        created_at: candidate.created_at,
        is_demo: true,
    }))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return { available: true, count: items.length + 1, note: samePlaceNote(true), items };
}
async function samePlaceForReal(passportId) {
    const siblings = await publicObservationRepository.findSamePlacePublicObservations({ passportId });
    return {
        available: true,
        count: siblings.length + 1,
        note: samePlaceNote(true),
        items: siblings.map((sibling) => ({
            passport_id: sibling.passport_id,
            title: sibling.post_title ??
                (sibling.district ? `Observation in ${sibling.district}` : 'Observation'),
            observation_category: sibling.observation_category,
            district: sibling.district,
            created_at: sibling.created_at,
            is_demo: sibling.is_demo,
        })),
    };
}
// ---------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------
async function identityFor(userId) {
    const user = await userRepository.findUserById(userId);
    if (!user)
        return null;
    const resolved = await resolveUserAvatarUrl(user).catch(() => ({
        avatarUrl: null,
        displayName: user.display_name,
    }));
    return {
        public_user_id: user.public_user_id,
        display_name: resolved.displayName ?? user.display_name,
        avatar_url: resolved.avatarUrl,
        is_demo: user.is_demo,
    };
}
async function batchIdentitiesFor(userIds) {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    const out = new Map();
    if (uniqueIds.length === 0)
        return out;
    const users = await userRepository.findUsersByIds(uniqueIds);
    const resolvedList = await Promise.all(Array.from(users.entries()).map(async ([id, user]) => {
        const resolved = await resolveUserAvatarUrl(user).catch(() => ({
            avatarUrl: null,
            displayName: user.display_name,
        }));
        return [
            id,
            {
                public_user_id: user.public_user_id,
                display_name: resolved.displayName ?? user.display_name,
                avatar_url: resolved.avatarUrl,
                is_demo: user.is_demo,
            },
        ];
    }));
    for (const [id, identity] of resolvedList) {
        out.set(id, identity);
    }
    return out;
}
function resolveReactorKey(viewer, contributorToken) {
    if (viewer?.userId)
        return `user:${viewer.userId}`;
    const normalized = normalizeContributorToken(contributorToken ?? undefined);
    if (normalized)
        return `contrib:${hashContributor(`web:${normalized}`)}`;
    return null;
}
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export class CommunityPostService {
    get demoEnabled() {
        return demoContentEnabled();
    }
    // ==========================================================================
    // Read: one post
    // ==========================================================================
    async getPost(passportId, viewer, contributorToken) {
        const wanted = String(passportId ?? '').trim();
        if (!wanted)
            return null;
        const demo = this.demoEnabled ? findDemoPost(wanted) : null;
        if (demo)
            return this.buildDemoPost(demo, viewer);
        const row = await communityPostRepository.findObservation(wanted);
        if (!row)
            return null;
        const viewerIsOwner = await this.resolveOwnership(row, viewer, contributorToken);
        const isPublic = row.publication_status === 'public';
        if (!isPublic && !viewerIsOwner) {
            // A private or pending post is indistinguishable from one that does not
            // exist, so an unauthorised caller learns nothing from the status code.
            return null;
        }
        const [location, mediaRows, questionRows, attachmentRows] = await Promise.all([
            communityPostRepository.findLocation(row.id),
            communityPostRepository.listMedia(row.id),
            communityPostRepository.listQuestions(row.id),
            communityPostRepository.listAttachments(row.id),
        ]);
        const ownerIdentity = row.owner_user_id ? await identityFor(row.owner_user_id) : null;
        const questions = this.assembleQuestions(row, questionRows);
        const commentCount = await communityPostRepository.countVisibleComments(row.passport_id);
        return {
            passport_id: row.passport_id,
            title: this.titleOf(row),
            observation_category: row.observation_category ?? 'unknown',
            observation_subcategory: row.observation_subcategory ?? 'unknown',
            is_public: isPublic,
            is_demo: Boolean(row.is_demo),
            created_at: row.created_at,
            updated_at: row.community_updated_at ?? row.updated_at,
            owner: ownerIdentity,
            location: buildLocation({ location, viewerIsOwner }),
            user_report: this.reportOf(row),
            ai: this.aiBlockOf(row),
            media: (viewerIsOwner
                ? mediaRows.filter((m) => m.moderation_status !== 'removed')
                : mediaRows.filter((m) => m.visibility === 'public' && m.is_public === true && m.moderation_status === 'visible')).map((media) => mediaItemFromRow(media, row.passport_id)),
            questions,
            open_questions: questions.filter((question) => question.status === 'open'),
            comment_count: commentCount,
            can_comment: isPublic || viewerIsOwner,
            viewer_is_owner: viewerIsOwner,
            attachments: attachmentRows.filter((entry) => entry.is_public || viewerIsOwner).map(attachmentFromRow),
            same_place: await samePlaceForReal(row.passport_id),
        };
    }
    /**
     * Other visits recorded at the exact same published coordinate pair.
     * Exposes the same grouping the detail endpoint carries, for callers that
     * only need the sibling list.
     */
    async samePlace(passportId) {
        const wanted = String(passportId ?? '').trim();
        if (!wanted)
            return { available: false, count: 0, note: samePlaceNote(false), items: [] };
        const demo = this.demoEnabled ? findDemoPost(wanted) : null;
        if (demo)
            return samePlaceForDemo(demo);
        const row = await communityPostRepository.findObservation(wanted);
        if (!row || row.publication_status !== 'public') {
            // Same non-information behavior as getPost for private or missing posts.
            return { available: false, count: 0, note: samePlaceNote(false), items: [] };
        }
        return samePlaceForReal(row.passport_id);
    }
    async buildDemoPost(demo, viewer) {
        void viewer; // a demonstration post belongs to nobody who is signed in
        const realCommentCount = await communityPostRepository.countVisibleComments(demo.passport_id);
        const demoCommentCount = demoPublicComments(demo.passport_id).reduce((total, root) => total + 1 + root.replies.length, 0);
        const commentCount = demoCommentCount + realCommentCount;
        const questions = demo.questions;
        return {
            passport_id: demo.passport_id,
            title: demo.title,
            observation_category: demo.observation_category,
            observation_subcategory: demo.observation_subcategory,
            is_public: true,
            is_demo: true,
            created_at: demo.created_at,
            updated_at: demo.created_at,
            owner: {
                public_user_id: demo.owner_public_user_id,
                display_name: demo.owner_display_name,
                is_demo: true,
            },
            location: demoLocation(demo),
            user_report: demo.user_report,
            ai: {
                primary_interpretation: demo.primary_interpretation,
                observed_features: demo.observed_features,
                diagnostic_features: demo.diagnostic_features,
                reasoning: demo.reasoning,
                alternative_possibilities: demo.alternative_possibilities,
                uncertainties: demo.uncertainties,
                limitations: demo.limitations,
                recommended_next_steps: demo.recommended_next_steps,
                safety_note: demo.safety_note,
                confidence: 'moderate',
                confidence_score: 0.5,
                evidence_state: 'ai_assisted',
                disclaimer: AI_DISCLAIMER,
            },
            media: demo.media.map((_, index) => demoMediaItem(demo, index)),
            questions,
            open_questions: questions.filter((question) => question.status === 'open'),
            comment_count: commentCount,
            can_comment: true,
            viewer_is_owner: false,
            attachments: (demo.attachments ?? []).map((_, index) => demoAttachmentItem(demo, index)),
            same_place: samePlaceForDemo(demo),
        };
    }
    /**
     * Decides whether the signed-in account owns a post.
     *
     * An account that signs in with the same number that submitted the
     * observation through WhatsApp is the author of that observation, so the
     * link is made once and recorded. Nobody else can claim a post by viewing it.
     */
    async resolveOwnership(row, viewer, contributorToken) {
        const normalizedToken = normalizeContributorToken(contributorToken ?? undefined);
        const tokenHash = normalizedToken ? hashContributor(`web:${normalizedToken}`) : null;
        if (viewer) {
            if (row.owner_user_id)
                return row.owner_user_id === viewer.userId;
            const account = await userRepository.findUserById(viewer.userId);
            if (account && account.phone_hash && account.phone_hash === row.source_user_hash) {
                await communityPostRepository.linkOwner(row.passport_id, viewer.userId);
                row.owner_user_id = viewer.userId;
                return true;
            }
            if (tokenHash && tokenHash === row.source_user_hash) {
                await communityPostRepository.linkOwner(row.passport_id, viewer.userId);
                row.owner_user_id = viewer.userId;
                return true;
            }
            return false;
        }
        if (!row.owner_user_id && tokenHash && tokenHash === row.source_user_hash) {
            return true;
        }
        return false;
    }
    async syncPublicObservationIndex(row) {
        if (row.publication_status !== 'public') {
            publicObservationRepository.unpublishObservation(row.passport_id);
            return;
        }
        const [location, mediaRows] = await Promise.all([
            communityPostRepository.findLocation(row.id).catch(() => null),
            communityPostRepository.listMedia(row.id).catch(() => []),
        ]);
        const precision = location?.public_location_precision ?? 'private';
        const district = location?.district ?? null;
        const publicCoords = precision !== 'private'
            ? resolvePublicCoordinates({
                precision,
                district,
                latitude: location?.latitude ?? null,
                longitude: location?.longitude ?? null,
            })
            : null;
        const publicVisibleMedia = mediaRows.filter((m) => m.visibility === 'public' && m.is_public === true && m.moderation_status === 'visible');
        const firstImage = publicVisibleMedia.find((m) => m.media_type === 'image');
        publicObservationRepository.registerPublicObservation({
            passport_id: row.passport_id,
            observation_category: row.observation_category || 'unknown',
            observation_subcategory: row.observation_subcategory || 'unknown',
            observation_type: row.observation_type || undefined,
            primary_interpretation: row.primary_interpretation,
            geological_context: row.geological_context,
            primary_classification: row.primary_classification,
            possible_name: row.possible_name,
            confidence: row.confidence,
            confidence_score: row.confidence_score,
            verification_status: row.verification_status,
            evidence_state: row.evidence_state,
            community_status: row.community_status,
            observed_features: row.observed_features,
            diagnostic_features: row.diagnostic_features,
            uncertainties: row.uncertainties,
            reasoning: row.reasoning,
            limitations: row.limitations,
            recommended_next_steps: row.recommended_next_steps,
            safety_note: row.safety_note,
            data_quality_status: row.data_quality_status,
            is_research_opportunity: false,
            media_count: Math.max(mediaRows.length, 1),
            public_media_count: publicVisibleMedia.length,
            primary_media_url: firstImage
                ? `/api/posts/${row.passport_id}/media/${firstImage.source_media_id || firstImage.id}`
                : null,
            district: precision === 'private' ? null : district,
            public_location_precision: precision,
            latitude: publicCoords?.latitude ?? null,
            longitude: publicCoords?.longitude ?? null,
            created_at: row.created_at,
            published_at: row.published_at ?? new Date().toISOString(),
            post_title: row.post_title,
            user_report: row.user_report ?? row.user_caption,
            is_demo: false,
        });
    }
    titleOf(row) {
        const title = row.post_title ?? row.user_caption ?? row.primary_interpretation ?? null;
        if (title && title.trim())
            return title.trim().slice(0, MAX_TITLE_LENGTH);
        return `Observation ${row.passport_id}`;
    }
    /** The contributor's own words, never the model's. */
    reportOf(row) {
        const report = row.user_report ?? row.user_caption ?? null;
        return report && report.trim() ? report.trim() : null;
    }
    aiBlockOf(row) {
        return {
            primary_interpretation: row.primary_interpretation ?? null,
            observed_features: row.observed_features ?? [],
            diagnostic_features: row.diagnostic_features ?? [],
            reasoning: row.reasoning ?? '',
            alternative_possibilities: row.alternative_possibilities ?? [],
            uncertainties: row.uncertainties ?? [],
            limitations: row.limitations ?? [],
            recommended_next_steps: row.recommended_next_steps ?? [],
            safety_note: row.safety_note ||
                'Follow local guidance and stay clear of unstable ground when visiting a site.',
            confidence: row.confidence,
            confidence_score: row.confidence_score,
            evidence_state: row.evidence_state ?? null,
            disclaimer: AI_DISCLAIMER,
        };
    }
    /**
     * Questions the model asked, plus any answer the contributor gave.
     *
     * An observation created before Stage 12 still has its questions in
     * `questions_for_user`. They are shown as open questions without being
     * rewritten on read, and the first answer materialises them, so an old
     * record behaves exactly like a new one.
     */
    assembleQuestions(row, persisted) {
        const stored = new Map(persisted.map((entry) => [entry.question_id, entry]));
        const listed = (row.questions_for_user ?? [])
            .map((text, index) => ({ questionId: `q-${index + 1}`, text: String(text) }))
            .filter((entry) => entry.text.trim().length > 0);
        const ids = new Set([
            ...listed.map((entry) => entry.questionId),
            ...persisted.map((entry) => entry.question_id),
        ]);
        const assembled = [];
        for (const questionId of Array.from(ids)) {
            const match = stored.get(questionId);
            const text = match?.question ??
                listed.find((entry) => entry.questionId === questionId)?.text ??
                '';
            if (!text.trim())
                continue;
            assembled.push({
                question_id: questionId,
                question: text,
                asked_by: 'ai',
                asked_at: match?.asked_at ?? row.created_at,
                status: match?.status ?? 'open',
                answer: match?.answer ?? null,
                answered_at: match?.answered_at ?? null,
                answered_by: match?.answered_by ?? null,
                is_public: match?.is_public ?? true,
                is_demo: false,
            });
        }
        return assembled.sort((a, b) => a.asked_at.localeCompare(b.asked_at));
    }
    // ==========================================================================
    // Read: discussion
    // ==========================================================================
    async assembleComments(passportId, isDemo, viewerReactorKey) {
        const [rows, reactionMap] = await Promise.all([
            communityPostRepository
                .listComments(passportId)
                .then((list) => list.filter((row) => row.moderation_status === 'visible')),
            communityPostRepository.listCommentReactions(passportId, viewerReactorKey),
        ]);
        const authorCache = await batchIdentitiesFor(rows.map((r) => r.author_user_id));
        const roots = [];
        const byId = new Map();
        for (const row of rows) {
            const author = authorCache.get(row.author_user_id) ?? {
                public_user_id: 'ET-USER-UNKNOWN',
                display_name: null,
                avatar_url: null,
                is_demo: false,
            };
            const react = reactionMap.get(row.id);
            const comment = {
                comment_id: row.id,
                parent_comment_id: row.parent_comment_id,
                author,
                body: row.body,
                image_url: row.image_url ?? null,
                likes_count: react?.likes_count ?? 0,
                viewer_liked: react?.viewer_liked ?? false,
                created_at: row.created_at,
                edited_at: row.edited_at,
                moderation_status: row.moderation_status,
                reply_count: 0,
                replies: [],
                is_demo: false,
            };
            byId.set(row.id, comment);
        }
        for (const comment of byId.values()) {
            const parent = comment.parent_comment_id ? byId.get(comment.parent_comment_id) : null;
            if (parent) {
                parent.replies.push(comment);
                parent.reply_count = parent.replies.length;
            }
            else {
                roots.push(comment);
            }
        }
        roots.sort((a, b) => a.created_at.localeCompare(b.created_at));
        for (const root of roots) {
            root.replies.sort((a, b) => a.created_at.localeCompare(b.created_at));
        }
        let comments = roots;
        let count = rows.length;
        const applyReactionsToTree = (node) => {
            const react = reactionMap.get(node.comment_id);
            return {
                ...node,
                likes_count: react?.likes_count ?? node.likes_count ?? 0,
                viewer_liked: react?.viewer_liked ?? node.viewer_liked ?? false,
                replies: node.replies.map(applyReactionsToTree),
            };
        };
        if (isDemo) {
            // Demonstration discussion lives in the demonstration dataset; anything
            // a real reader posts is appended to it, never mixed into it.
            const demoRoots = demoPublicComments(passportId).map(applyReactionsToTree);
            comments = [...demoRoots, ...roots];
            count += demoRoots.reduce((total, root) => total + 1 + root.replies.length, 0);
        }
        return { comments, count };
    }
    async listComments(passportId, viewer, contributorToken) {
        const demo = this.demoEnabled ? findDemoPost(passportId) : null;
        if (!demo) {
            const row = await communityPostRepository.findObservation(passportId);
            if (!row)
                return [];
            const viewerIsOwner = await this.resolveOwnership(row, viewer, contributorToken);
            if (row.publication_status !== 'public' && !viewerIsOwner)
                return [];
        }
        const reactorKey = resolveReactorKey(viewer, contributorToken);
        return (await this.assembleComments(passportId, Boolean(demo), reactorKey)).comments;
    }
    // ==========================================================================
    // Moderation (Super Admin)
    // ==========================================================================
    /**
     * The whole discussion across every post, newest first, for the Super Admin.
     *
     * Demonstration comments are listed so the queue is inspectable on a fresh
     * deployment, each one flagged `is_demo: true` and carrying no moderation
     * record. They are included read-only: `moderateComment` rejects them, so a
     * fake thread can never be edited to look moderated or unmoderated.
     */
    async listCommentsForModeration(params) {
        const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
        const offset = Math.max(0, params.offset ?? 0);
        const demoRows = this.listDemoCommentsForModeration().filter((row) => {
            if (params.status && row.moderation_status !== params.status)
                return false;
            if (params.passportId && row.passport_id.toUpperCase() !== params.passportId.trim().toUpperCase()) {
                return false;
            }
            return true;
        });
        // Fetch a bounded newest-first slice (offset + limit) with SQL filtering and exact count
        // so merging with demonstration comments preserves global ordering without full table scans.
        const fetchWindow = Math.min(offset + limit, 2000);
        const source = await communityPostRepository.listCommentsForModeration({
            limit: fetchWindow,
            offset: 0,
            passportId: params.passportId,
            status: params.status,
        });
        const authorCache = await batchIdentitiesFor(source.rows.map((r) => r.author_user_id));
        const fallbackAuthor = {
            public_user_id: 'ET-USER-UNKNOWN',
            display_name: null,
            is_demo: false,
        };
        const rows = source.rows.map((row) => ({
            comment_id: row.id,
            observation_id: row.observation_id,
            passport_id: row.passport_id,
            parent_comment_id: row.parent_comment_id,
            author: authorCache.get(row.author_user_id) ?? fallbackAuthor,
            body: row.body,
            image_url: row.image_url ?? null,
            moderation_status: row.moderation_status,
            moderation_reason: row.moderation_reason,
            moderated_by: row.moderated_by,
            moderated_at: row.moderated_at,
            created_at: row.created_at,
            is_demo: false,
        }));
        const combined = [...demoRows, ...rows];
        combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const total = source.total + demoRows.length;
        return { rows: combined.slice(offset, offset + limit), total };
    }
    /**
     * Hides, restores or removes one comment, recording the actor and reason.
     * A labelled demonstration comment cannot be moderated and is refused.
     */
    async moderateComment(input) {
        const { commentId, status, reason, moderatedBy } = input;
        const reasonText = String(reason ?? '').trim();
        if (!reasonText)
            fail(400, 'REASON_REQUIRED', 'A reason is required for moderation.');
        if (reasonText.length > 500) {
            fail(400, 'REASON_TOO_LONG', 'A moderation reason is limited to 500 characters.');
        }
        const demo = this.demoEnabled &&
            DEMO_POSTS.some((post) => post.comments.some((comment) => comment.comment_id === commentId));
        if (demo) {
            fail(400, 'DEMO_COMMENT_READ_ONLY', 'A labelled demonstration comment is part of the demonstration dataset and cannot be moderated.');
        }
        const updated = await communityPostRepository.setCommentModeration(commentId, status, reasonText, moderatedBy);
        if (!updated)
            fail(404, 'COMMENT_NOT_FOUND', 'That comment does not exist.');
        return this.toAdminComment(updated, {
            public_user_id: 'ET-USER-UNKNOWN',
            display_name: null,
            is_demo: false,
        });
    }
    async toAdminComment(row, fallback) {
        const author = (await identityFor(row.author_user_id)) ?? fallback;
        return {
            comment_id: row.id,
            observation_id: row.observation_id,
            passport_id: row.passport_id,
            parent_comment_id: row.parent_comment_id,
            author,
            body: row.body,
            created_at: row.created_at,
            moderated_at: row.moderated_at,
            moderated_by: row.moderated_by,
            moderation_status: row.moderation_status,
            moderation_reason: row.moderation_reason,
            is_demo: false,
        };
    }
    listDemoCommentsForModeration() {
        if (!this.demoEnabled)
            return [];
        const rows = [];
        for (const post of DEMO_POSTS) {
            for (const comment of post.comments) {
                rows.push({
                    comment_id: comment.comment_id,
                    observation_id: null,
                    passport_id: post.passport_id,
                    parent_comment_id: comment.parent_comment_id,
                    author: {
                        public_user_id: comment.author_public_user_id,
                        display_name: comment.author_display_name,
                        is_demo: true,
                    },
                    body: comment.body,
                    created_at: comment.created_at,
                    moderated_at: null,
                    moderated_by: null,
                    moderation_status: 'visible',
                    moderation_reason: null,
                    is_demo: true,
                });
            }
        }
        return rows;
    }
    // ==========================================================================
    // Write: discussion
    // ==========================================================================
    async createComment(passportId, viewer, input) {
        const body = String(input.body ?? '').trim();
        const rawImage = typeof input.image_base64 === 'string' ? input.image_base64.trim() : '';
        if (!body && !rawImage)
            fail(400, 'COMMENT_EMPTY', 'Write something before posting a comment.');
        if (body.length > env.COMMENT_MAX_LENGTH) {
            fail(400, 'COMMENT_TOO_LONG', `A comment is limited to ${env.COMMENT_MAX_LENGTH} characters.`);
        }
        if (!(await checkDistributedRateLimit(`comment:${viewer.userId}`, env.COMMENT_RATE_LIMIT_PER_MINUTE))) {
            fail(429, 'RATE_LIMITED', 'You are commenting very quickly. Wait a moment and try again.');
        }
        let imageUrl = null;
        if (rawImage) {
            const base64 = rawImage.includes(',') ? rawImage.slice(rawImage.indexOf(',') + 1) : rawImage;
            if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
                fail(400, 'MEDIA_INVALID', 'The attached photo could not be decoded.');
            }
            const buffer = Buffer.from(base64, 'base64');
            if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
                fail(413, 'MEDIA_TOO_LARGE', 'Comment images must be 5 MB or smaller.');
            }
            const validation = validateMedia(buffer, input.image_mime_type ?? undefined);
            if (!validation.isValid || validation.mediaKind !== 'image' || !validation.detectedMimeType) {
                fail(415, 'MEDIA_UNSUPPORTED', 'Only JPEG, PNG, or WebP images can be attached to comments.');
            }
            imageUrl = `data:${validation.detectedMimeType};base64,${base64}`;
        }
        const demo = this.demoEnabled ? findDemoPost(passportId) : null;
        let observationId = null;
        let observationOwnerUserId = null;
        if (!demo) {
            const row = await communityPostRepository.findObservation(passportId);
            if (!row)
                fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
            const viewerIsOwner = await this.resolveOwnership(row, viewer);
            if (row.publication_status !== 'public' && !viewerIsOwner) {
                fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
            }
            observationId = row.id;
            observationOwnerUserId = row.owner_user_id ?? null;
        }
        const parentId = input.parent_comment_id ?? null;
        let replyRecipientUserId = null;
        if (parentId) {
            const parent = await communityPostRepository.findComment(passportId, parentId);
            if (!parent || parent.moderation_status !== 'visible') {
                fail(400, 'PARENT_NOT_FOUND', 'The comment you are replying to is no longer available.');
            }
            replyRecipientUserId = parent.author_user_id ?? null;
        }
        const created = await communityPostRepository.insertComment({
            passport_id: passportId.trim(),
            observation_id: observationId,
            parent_comment_id: parentId,
            author_user_id: viewer.userId,
            body,
            image_url: imageUrl,
        });
        const author = (await identityFor(viewer.userId)) ?? {
            public_user_id: viewer.publicUserId,
            display_name: viewer.displayName ?? null,
            avatar_url: null,
            is_demo: false,
        };
        notifyEventSafely('comment', notificationService.notifyComment({
            recipientUserId: replyRecipientUserId || observationOwnerUserId,
            actorUserId: viewer.userId,
            actorDisplayName: author.display_name ?? viewer.displayName ?? null,
            passportId: passportId.trim(),
            commentId: created.id,
            isReply: Boolean(parentId),
            body: created.body,
        }));
        return {
            comment: {
                comment_id: created.id,
                parent_comment_id: created.parent_comment_id,
                author,
                body: created.body,
                image_url: created.image_url ?? imageUrl,
                likes_count: 0,
                viewer_liked: false,
                created_at: created.created_at,
                edited_at: null,
                moderation_status: 'visible',
                reply_count: 0,
                replies: [],
                is_demo: false,
            },
            message: parentId ? 'Your reply was posted.' : 'Your comment was posted.',
        };
    }
    async reactToComment(passportId, commentId, reactionType, viewer, contributorToken) {
        const reactorKey = resolveReactorKey(viewer, contributorToken);
        if (!reactorKey) {
            fail(401, 'AUTH_REQUIRED', 'Sign in or start a session to react to a comment.');
        }
        const demo = this.demoEnabled ? findDemoPost(passportId) : null;
        if (!demo) {
            const row = await communityPostRepository.findObservation(passportId);
            if (!row)
                fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
            const viewerIsOwner = await this.resolveOwnership(row, viewer, contributorToken);
            if (row.publication_status !== 'public' && !viewerIsOwner) {
                fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
            }
        }
        const stored = await communityPostRepository.findComment(passportId, commentId);
        const isDemoComment = demo ? demoComments(passportId).some((c) => c.comment_id === commentId) : false;
        if (!stored && !isDemoComment) {
            fail(404, 'COMMENT_NOT_FOUND', 'That comment could not be found.');
        }
        const summary = await communityPostRepository.toggleCommentReaction({
            passportId,
            commentId,
            reactorKey,
            reactionType,
        });
        return {
            comment_id: commentId,
            ...summary,
        };
    }
    // ==========================================================================
    // Write: owner edits, privacy and answers
    // ==========================================================================
    /**
     * Updates the contributor's own text and the post's visibility.
     *
     * Every visibility change is written to the privacy audit trail with the
     * account that made it, so "who published this, and when" is answerable
     * later without trusting anybody's memory.
     */
    async updatePost(passportId, viewer, input, contributorToken) {
        const row = await communityPostRepository.findObservation(passportId);
        if (!row) {
            if (this.demoEnabled && findDemoPost(passportId)) {
                fail(400, 'DEMO_POST_READ_ONLY', 'A demonstration post cannot be edited.');
            }
            fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
        }
        if (!(await this.resolveOwnership(row, viewer, contributorToken))) {
            fail(403, 'NOT_OWNER', 'Only the contributor who made this post can edit it.');
        }
        if (input.latitude !== undefined && input.latitude !== null) {
            if (typeof input.latitude !== 'number' || !Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) {
                fail(400, 'INVALID_COORDINATES', 'Latitude must be between -90 and 90.');
            }
        }
        if (input.longitude !== undefined && input.longitude !== null) {
            if (typeof input.longitude !== 'number' || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) {
                fail(400, 'INVALID_COORDINATES', 'Longitude must be between -180 and 180.');
            }
        }
        const patch = {};
        if (input.post_title !== undefined) {
            const title = input.post_title === null ? null : cleanText(input.post_title, MAX_TITLE_LENGTH);
            if (input.post_title !== null && !title) {
                fail(400, 'INVALID_TITLE', 'A title cannot be empty.');
            }
            patch.post_title = title;
            row.post_title = title;
        }
        if (input.user_report !== undefined) {
            const rep = input.user_report === null ? null : cleanText(input.user_report, MAX_REPORT_LENGTH);
            patch.user_report = rep;
            row.user_report = rep;
        }
        if (Object.keys(patch).length > 0) {
            await communityPostRepository.updatePostFields(row.passport_id, patch);
        }
        let publicationChanged = false;
        if (typeof input.is_public === 'boolean') {
            const next = input.is_public ? 'public' : 'private';
            if (next !== row.publication_status) {
                await communityPostRepository.setPublicationStatus(row.passport_id, next);
                await communityPostRepository.setMediaPublicVisibility(row.id, input.is_public);
                await communityPostRepository.setAttachmentsPublicVisibility(row.id, input.is_public);
                await communityPostRepository.recordPrivacyAudit({
                    observation_id: row.id,
                    actor_user_id: viewer?.userId ?? null,
                    actor: 'owner',
                    previous_privacy: row.publication_status,
                    new_privacy: next,
                    reason: input.is_public ? 'owner_published' : 'owner_made_private',
                });
                row.publication_status = next;
                publicationChanged = true;
            }
        }
        const hasCoordinateOrPlacePatch = input.latitude !== undefined ||
            input.longitude !== undefined ||
            input.district !== undefined ||
            input.location_text !== undefined;
        const existingLoc = await communityPostRepository.findLocation(row.id);
        if (input.location_precision !== undefined && input.location_precision !== null) {
            const precision = String(input.location_precision);
            if (!LOCATION_PRECISIONS.includes(precision)) {
                fail(400, 'INVALID_LOCATION_PRECISION', 'That location precision is not supported.');
            }
            const previous = existingLoc?.public_location_precision ?? 'district';
            if (existingLoc && !hasCoordinateOrPlacePatch) {
                if (previous !== precision || publicationChanged) {
                    await communityPostRepository.setLocationPrecision(row.id, precision, row.publication_status === 'public' && precision !== 'private');
                    if (previous !== precision) {
                        await communityPostRepository.recordPrivacyAudit({
                            observation_id: row.id,
                            actor_user_id: viewer?.userId ?? null,
                            actor: 'owner',
                            previous_privacy: previous,
                            new_privacy: precision,
                            reason: 'location_precision',
                        });
                    }
                }
            }
            else {
                const nextLat = input.latitude !== undefined ? input.latitude : (existingLoc?.latitude ?? null);
                const nextLng = input.longitude !== undefined ? input.longitude : (existingLoc?.longitude ?? null);
                const nextLocText = input.location_text !== undefined
                    ? input.location_text
                        ? cleanText(input.location_text, 300)
                        : null
                    : (existingLoc?.location_text ?? null);
                const nextDistrict = input.district !== undefined
                    ? normalizeDistrictName(input.district) ?? (input.district ? cleanText(input.district, 60) : null)
                    : (existingLoc?.district ?? null);
                const savedLoc = await observationRepository.saveObservationLocation({
                    observation_id: row.id,
                    location_source: nextLat !== null && nextLng !== null ? 'user_gps' : 'user_manual',
                    latitude: nextLat,
                    longitude: nextLng,
                    accuracy_meters: existingLoc?.accuracy_meters ?? null,
                    district: nextDistrict,
                    location_text: nextLocText,
                    public_location_precision: precision,
                    is_public: row.publication_status === 'public' && precision !== 'private',
                });
                try {
                    communityPostRepository.registerLocationRecord(savedLoc);
                }
                catch {
                    // Ignored when backed directly by database
                }
                if (previous !== precision) {
                    await communityPostRepository.recordPrivacyAudit({
                        observation_id: row.id,
                        actor_user_id: viewer?.userId ?? null,
                        actor: 'owner',
                        previous_privacy: previous,
                        new_privacy: precision,
                        reason: 'location_precision',
                    });
                }
            }
        }
        else if (hasCoordinateOrPlacePatch) {
            const nextLat = input.latitude !== undefined ? input.latitude : (existingLoc?.latitude ?? null);
            const nextLng = input.longitude !== undefined ? input.longitude : (existingLoc?.longitude ?? null);
            const nextLocText = input.location_text !== undefined
                ? input.location_text
                    ? cleanText(input.location_text, 300)
                    : null
                : (existingLoc?.location_text ?? null);
            const nextDistrict = input.district !== undefined
                ? normalizeDistrictName(input.district) ?? (input.district ? cleanText(input.district, 60) : null)
                : (existingLoc?.district ?? null);
            const keepPrecision = existingLoc?.public_location_precision ?? 'private';
            const savedLoc = await observationRepository.saveObservationLocation({
                observation_id: row.id,
                location_source: nextLat !== null && nextLng !== null ? 'user_gps' : 'user_manual',
                latitude: nextLat,
                longitude: nextLng,
                accuracy_meters: existingLoc?.accuracy_meters ?? null,
                district: nextDistrict,
                location_text: nextLocText,
                public_location_precision: keepPrecision,
                is_public: row.publication_status === 'public' && keepPrecision !== 'private',
            });
            try {
                communityPostRepository.registerLocationRecord(savedLoc);
            }
            catch {
                // Ignored when backed directly by database
            }
        }
        else if (publicationChanged && existingLoc) {
            await communityPostRepository.setLocationPublicFlag(row.id, row.publication_status === 'public' && existingLoc.public_location_precision !== 'private');
        }
        await this.syncPublicObservationIndex(row);
        const detail = await this.getPost(row.passport_id, viewer, contributorToken);
        if (!detail)
            fail(500, 'POST_UNREADABLE', 'The post could not be reloaded after the update.');
        return detail;
    }
    /**
     * Sets whether readers may download one attached document, or may only
     * preview it in the passport. The contributor who owns the post decides;
     * the change is persisted and reflected immediately in the public detail.
     */
    async updateAttachmentDownload(passportId, viewer, attachmentId, allowDownload, contributorToken) {
        const row = await communityPostRepository.findObservation(passportId);
        if (!row) {
            if (this.demoEnabled && findDemoPost(passportId)) {
                fail(400, 'DEMO_POST_READ_ONLY', 'A demonstration post cannot be edited.');
            }
            fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
        }
        if (!(await this.resolveOwnership(row, viewer, contributorToken))) {
            fail(403, 'NOT_OWNER', 'Only the contributor who made this post can set download rights.');
        }
        const attachment = await communityPostRepository.updateAttachmentDownload(row.id, attachmentId, allowDownload);
        if (!attachment) {
            fail(404, 'ATTACHMENT_NOT_FOUND', 'That attached document does not exist.');
        }
        const detail = await this.getPost(row.passport_id, viewer, contributorToken);
        if (!detail)
            fail(500, 'POST_UNREADABLE', 'The post could not be reloaded after the update.');
        return detail;
    }
    /**
     * Answers one AI question as the person who owns the post.
     *
     * The answer records who answered it, so a question the model asked is never
     * readable as though the model had also answered itself.
     */
    async answerQuestion(passportId, viewer, questionId, answerInput, contributorToken) {
        const answer = String(answerInput ?? '').trim();
        if (!answer)
            fail(400, 'ANSWER_EMPTY', 'Write your answer before submitting it.');
        if (answer.length > MAX_REPORT_LENGTH) {
            fail(400, 'ANSWER_TOO_LONG', 'That answer is too long.');
        }
        const row = await communityPostRepository.findObservation(passportId);
        if (!row) {
            if (this.demoEnabled && findDemoPost(passportId)) {
                fail(400, 'DEMO_POST_READ_ONLY', 'A demonstration post cannot be answered.');
            }
            fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
        }
        if (!(await this.resolveOwnership(row, viewer, contributorToken))) {
            fail(403, 'NOT_OWNER', 'Only the contributor who made this post can answer its questions.');
        }
        const persisted = await communityPostRepository.listQuestions(row.id);
        let target = persisted.find((entry) => entry.question_id === questionId) ?? null;
        if (!target) {
            const index = Number(questionId.replace(/^q-/, ''));
            const text = Number.isFinite(index) ? (row.questions_for_user ?? [])[index - 1] : undefined;
            if (!text || !String(text).trim()) {
                fail(404, 'QUESTION_NOT_FOUND', 'That question is not on this post.');
            }
            target = await communityPostRepository.insertQuestion({
                observation_id: row.id,
                question_id: questionId,
                question: String(text),
            });
        }
        if (target.status === 'answered') {
            fail(409, 'ALREADY_ANSWERED', 'This question already has an answer.');
        }
        await communityPostRepository.answerQuestion({
            questionId: target.id,
            answer,
            answeredBy: 'owner',
            answeredByUserId: viewer?.userId ?? 'contributor_owner',
        });
        const detail = await this.getPost(row.passport_id, viewer, contributorToken);
        if (!detail)
            fail(500, 'POST_UNREADABLE', 'The post could not be reloaded after answering.');
        return detail;
    }
    // ==========================================================================
    // Write: gallery (supporting images & videos)
    // ==========================================================================
    async addAttachment(passportId, viewer, input, contributorToken) {
        const row = await communityPostRepository.findObservation(passportId);
        if (!row) {
            if (this.demoEnabled && findDemoPost(passportId)) {
                fail(400, 'DEMO_POST_READ_ONLY', 'A demonstration post cannot receive files.');
            }
            fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
        }
        if (!(await this.resolveOwnership(row, viewer, contributorToken))) {
            fail(403, 'NOT_OWNER', 'Only the contributor who made this post can add files to it.');
        }
        const encoded = String(input.content_base64 ?? '').trim();
        if (!encoded)
            fail(400, 'ATTACHMENT_EMPTY', 'No file was received.');
        const base64 = encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
            fail(400, 'ATTACHMENT_INVALID', 'The file could not be decoded.');
        }
        const buffer = Buffer.from(base64, 'base64');
        if (buffer.length === 0)
            fail(400, 'ATTACHMENT_EMPTY', 'The uploaded file was empty.');
        if (buffer.length > env.MAX_IMAGE_SIZE_BYTES) {
            fail(413, 'ATTACHMENT_TOO_LARGE', `Files up to ${Math.floor(env.MAX_IMAGE_SIZE_BYTES / 1_000_000)} MB can be stored on this deployment.`);
        }
        const validation = validateDocument(buffer, input.mime_type);
        if (!validation.isValid || !validation.detectedMimeType) {
            fail(415, 'ATTACHMENT_UNSUPPORTED', validation.userMessage ?? 'That file type is not supported.');
        }
        const filename = cleanText(input.filename, 200) || 'field-document';
        const kind = input.kind === 'research' || input.kind === 'report' ? input.kind : 'document';
        const id = crypto.randomUUID();
        const stored = await communityPostRepository.insertAttachment({
            id,
            observation_id: row.id,
            kind,
            title: cleanText(input.title, 200) || filename,
            description: input.description ? cleanText(input.description, 500) : null,
            filename,
            mime_type: validation.detectedMimeType,
            size_bytes: buffer.length,
            url: `/api/posts/${encodeURIComponent(row.passport_id)}/attachments/${encodeURIComponent(id)}`,
            content_base64: base64,
            is_public: row.publication_status === 'public',
            allow_download: true,
            uploader_user_id: viewer?.userId ?? null,
        });
        return attachmentFromRow(stored);
    }
    async getAttachmentFile(passportId, attachmentId, viewer, contributorToken) {
        const row = await communityPostRepository.findObservation(passportId);
        if (!row)
            return null;
        const attachment = await communityPostRepository.findAttachment(row.id, attachmentId);
        if (!attachment?.content_base64)
            return null;
        if (!attachment.is_public && !(await this.resolveOwnership(row, viewer, contributorToken))) {
            fail(403, 'NOT_OWNER', 'This file is private to its contributor.');
        }
        return { row: attachment, buffer: Buffer.from(attachment.content_base64, 'base64') };
    }
    /**
     * Stores one uploaded supporting image or video clip on the post/pin.
     *
     * Bytes arrive base64 encoded, are validated by signature rather than by the
     * declared type, and are refused above the configured size instead of being
     * silently truncated. No AI analysis runs on supporting media.
     */
    async addMedia(passportId, viewer, input, contributorToken) {
        const row = await communityPostRepository.findObservation(passportId);
        if (!row) {
            if (this.demoEnabled && findDemoPost(passportId)) {
                fail(400, 'DEMO_POST_READ_ONLY', 'A demonstration post cannot receive files.');
            }
            fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
        }
        if (!(await this.resolveOwnership(row, viewer, contributorToken))) {
            fail(403, 'NOT_OWNER', 'Only the contributor who made this post can add files to it.');
        }
        const encoded = String(input.content_base64 ?? '').trim();
        if (!encoded)
            fail(400, 'MEDIA_EMPTY', 'No file was received.');
        const base64 = encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
            fail(400, 'MEDIA_INVALID', 'The file could not be decoded.');
        }
        const buffer = Buffer.from(base64, 'base64');
        if (buffer.length === 0)
            fail(400, 'MEDIA_EMPTY', 'The uploaded file was empty.');
        if (buffer.length > env.POST_MEDIA_MAX_STORED_BYTES) {
            fail(413, 'MEDIA_TOO_LARGE', `Files up to ${Math.floor(env.POST_MEDIA_MAX_STORED_BYTES / 1_000_000)} MB can be stored on this deployment.`);
        }
        const validation = validateMedia(buffer, input.mime_type);
        if (!validation.isValid || !validation.mediaKind || !validation.detectedMimeType) {
            fail(415, 'MEDIA_UNSUPPORTED', 'Only JPEG, PNG, WebP images and MP4, 3GP, WebM, or QuickTime videos can be attached.');
        }
        const role = (input.role ?? 'field');
        if (!MEDIA_ROLES.includes(role)) {
            fail(400, 'MEDIA_ROLE_INVALID', 'That gallery position is not supported.');
        }
        const caption = input.caption ? cleanText(input.caption, MAX_CAPTION_LENGTH) : null;
        const existing = await communityPostRepository.listMedia(row.id);
        const isVideo = validation.mediaKind === 'video';
        const stored = await communityPostRepository.insertMedia({
            observation_id: row.id,
            media_type: validation.mediaKind,
            mime_type: validation.detectedMimeType,
            file_size: buffer.length,
            sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
            source_media_id: `web:${crypto.randomUUID()}`,
            storage_status: 'stored',
            caption,
            media_role: isVideo ? 'video' : role,
            sort_order: existing.length,
            is_public: row.publication_status === 'public',
            content_base64: base64,
            stored_by_user_id: viewer?.userId ?? null,
            visibility: row.publication_status === 'public' ? 'public' : 'private',
        });
        await this.syncPublicObservationIndex(row);
        return mediaItemFromRow(stored, row.passport_id);
    }
    /**
     * Removes a supporting media item (extra photo or attached video) from a post.
     * The primary analyzed specimen photo cannot be removed if it is the only image.
     */
    async removeMedia(passportId, viewer, mediaId, contributorToken) {
        const row = await communityPostRepository.findObservation(passportId);
        if (!row) {
            if (this.demoEnabled && findDemoPost(passportId)) {
                fail(400, 'DEMO_POST_READ_ONLY', 'A demonstration post cannot be modified.');
            }
            fail(404, 'POST_NOT_FOUND', 'That observation does not exist.');
        }
        if (!(await this.resolveOwnership(row, viewer, contributorToken))) {
            fail(403, 'NOT_OWNER', 'Only the contributor who made this post can remove files from it.');
        }
        const allMedia = await communityPostRepository.listMedia(row.id);
        const target = allMedia.find((m) => m.id === mediaId || m.source_media_id === mediaId);
        if (!target) {
            fail(404, 'MEDIA_NOT_FOUND', 'That media item does not exist on this post.');
        }
        const imageCount = allMedia.filter((m) => m.media_type === 'image').length;
        if (target.media_type === 'image' && imageCount <= 1) {
            fail(400, 'CANNOT_REMOVE_PRIMARY_PHOTO', 'Every Geoscience Passport must keep at least one analyzed specimen photo. Make the post private instead if you want to hide it.');
        }
        await communityPostRepository.deleteMedia(row.id, target.id);
        await this.syncPublicObservationIndex(row);
        const detail = await this.getPost(row.passport_id, viewer, contributorToken);
        if (!detail)
            fail(500, 'POST_UNREADABLE', 'The post could not be reloaded after removing media.');
        return detail;
    }
    /**
     * Resolves raw binary media bytes for `GET /api/posts/:passportId/media/:mediaId`.
     */
    async getRawMedia(passportId, mediaId, viewer, contributorToken) {
        const row = await communityPostRepository.findObservation(passportId);
        if (!row)
            return null;
        const viewerIsOwner = await this.resolveOwnership(row, viewer, contributorToken);
        if (row.publication_status !== 'public' && !viewerIsOwner) {
            return null;
        }
        const mediaRow = await communityPostRepository.findMediaForObservation(row.id, mediaId);
        if (!mediaRow || !mediaRow.content_base64)
            return null;
        if (mediaRow.moderation_status === 'removed') {
            return null;
        }
        if (!viewerIsOwner) {
            if (mediaRow.visibility !== 'public' ||
                mediaRow.is_public !== true ||
                mediaRow.moderation_status !== 'visible') {
                return null;
            }
        }
        return {
            buffer: Buffer.from(mediaRow.content_base64, 'base64'),
            mimeType: mediaRow.mime_type || 'application/octet-stream',
        };
    }
    // ==========================================================================
    // Read: the contributor's own posts
    // ==========================================================================
    async listMyPosts(viewer, contributorToken) {
        const byOwner = viewer ? await communityPostRepository.listObservationsByOwner(viewer.userId) : [];
        let byPhoneHash = [];
        if (viewer) {
            const account = await userRepository.findUserById(viewer.userId);
            if (account?.phone_hash) {
                byPhoneHash = await communityPostRepository.listObservationsBySourceHash(account.phone_hash);
                for (const r of byPhoneHash) {
                    if (!r.owner_user_id) {
                        await communityPostRepository.linkOwner(r.passport_id, viewer.userId);
                        r.owner_user_id = viewer.userId;
                    }
                }
            }
        }
        const normalizedToken = normalizeContributorToken(contributorToken ?? undefined);
        const byToken = normalizedToken
            ? await communityPostRepository.listObservationsBySourceHash(hashContributor(`web:${normalizedToken}`))
            : [];
        const mergedMap = new Map();
        for (const r of [...byOwner, ...byPhoneHash, ...byToken]) {
            mergedMap.set(r.passport_id, r);
        }
        const rows = Array.from(mergedMap.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const data = [];
        for (const row of rows) {
            const [media, persistedQuestions, location, discussion] = await Promise.all([
                communityPostRepository.listMedia(row.id),
                communityPostRepository.listQuestions(row.id),
                communityPostRepository.findLocation(row.id),
                communityPostRepository.listComments(row.passport_id),
            ]);
            const questions = this.assembleQuestions(row, persistedQuestions);
            data.push({
                passport_id: row.passport_id,
                title: this.titleOf(row),
                is_public: row.publication_status === 'public',
                observation_category: row.observation_category ?? 'unknown',
                created_at: row.created_at,
                comment_count: discussion.filter((entry) => entry.moderation_status === 'visible').length,
                media_count: media.length,
                open_question_count: questions.filter((entry) => entry.status === 'open').length,
                location_precision: location?.public_location_precision ?? 'district',
                latitude: location?.latitude ?? null,
                longitude: location?.longitude ?? null,
            });
        }
        return { data };
    }
    /**
     * Demonstration comments, published for readers who cannot write.
     *
     * Used by the public read path so a demonstration post shows its threaded
     * discussion even before anybody signs in.
     */
    demoDiscussion(passportId) {
        if (!this.demoEnabled)
            return [];
        return demoPublicComments(passportId);
    }
    /** Demonstration comment count for a post, for the list endpoints. */
    demoCommentCount(passportId) {
        if (!this.demoEnabled)
            return 0;
        return demoComments(passportId).length;
    }
}
export const communityPostService = new CommunityPostService();
