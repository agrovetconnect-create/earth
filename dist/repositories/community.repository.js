import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { publicContributorHandle } from '../utils/contributor.js';
import { demoContentEnabled } from '../services/system-settings.service.js';
/**
 * Community Discovery repository.
 *
 * Every method reads or writes real database rows when a database is
 * configured.
 *
 * There is deliberately NO in-memory seed and NO synthetic fallback for real
 * deployments. When the database is not configured, reads return empty results
 * and writes throw. A platform that invents community activity is worse than one
 * that admits it has none, because a fabricated vote or visit is
 * indistinguishable from a real one once it reaches the public API.
 *
 * The single exception is the labelled demonstration mode: when
 * `DEMO_POSTS_ENABLED` is true AND no real database is configured, the methods
 * serve and mutate an in-memory copy of `src/data/demo-community.ts`. Every
 * demonstration record is marked `is_demo`, nothing is written into any
 * database, and the public DTOs carry `is_demo: true` so a client can label the
 * content as demonstration material.
 */
export class CommunityRepository {
    /** True when real Supabase credentials are present. */
    get ready() {
        return isDatabaseConfigured();
    }
    /**
     * True when the labelled demonstration store is the sole store (no DB configured).
     */
    get demoActive() {
        return demoContentEnabled() && !isDatabaseConfigured();
    }
    /**
     * True when labelled demonstration records should be surfaced alongside
     * collected database records (development/preview with DEMO_POSTS_ENABLED).
     */
    get demoEnabled() {
        return demoContentEnabled();
    }
    isDemoInvestigationId(idOrPublicId) {
        if (!idOrPublicId || !this.demoEnabled)
            return false;
        const raw = idOrPublicId.trim();
        const upper = raw.toUpperCase();
        return (raw.startsWith('demo-inv-') ||
            upper.startsWith('ET-INV-DEMO-') ||
            this.demoInvestigations.some((i) => i.id === raw || i.public_id.toUpperCase() === upper));
    }
    isDemoQuestionId(idOrPublicId) {
        if (!idOrPublicId || !this.demoEnabled)
            return false;
        const raw = idOrPublicId.trim();
        const upper = raw.toUpperCase();
        return (raw.startsWith('demo-q-') ||
            upper.startsWith('ET-Q-DEMO-') ||
            this.demoQuestions.some((q) => q.id === raw || q.public_id.toUpperCase() === upper));
    }
    isDemoEvidenceId(id) {
        if (!id || !this.demoEnabled)
            return false;
        return id.startsWith('demo-ev-') || this.demoEvidence.some((e) => e.id === id);
    }
    isDemoSiteId(siteId) {
        if (!siteId || !this.demoEnabled)
            return false;
        const upper = siteId.trim().toUpperCase();
        return (siteId === 'd1000000-0000-4000-8000-000000000007' ||
            upper.startsWith('ET-SITE-DEMO-'));
    }
    isDemoObservationId(obsId) {
        if (!obsId || !this.demoEnabled)
            return false;
        return obsId.trim().toUpperCase().startsWith('ET-DEMO-');
    }
    demoInvestigations = [];
    demoVotes = [];
    demoEvidence = [];
    demoQuestions = [];
    demoAnswers = [];
    demoVisits = [];
    /** The demonstration checklist check-offs, keyed by investigation + item. */
    demoChecklistChecks = [];
    demoCounter = 1000;
    /** Replaces the whole demonstration store. Safe to call more than once. */
    registerDemoCommunityData(data) {
        this.demoInvestigations = data.investigations;
        this.demoVotes = data.votes;
        this.demoEvidence = data.evidence;
        this.demoQuestions = data.questions;
        this.demoAnswers = data.answers;
        this.demoVisits = data.visits;
        this.demoChecklistChecks = [];
        return (this.demoInvestigations.length +
            this.demoVotes.length +
            this.demoEvidence.length +
            this.demoQuestions.length +
            this.demoAnswers.length +
            this.demoVisits.length);
    }
    /** Contribution counters for a demonstration site, for the site summary. */
    demoSiteCounts(siteId) {
        const investigations = this.demoInvestigations.filter((i) => i.site_id === siteId);
        const participants = investigations.reduce((max, i) => Math.max(max, i.participant_count ?? 0), 0);
        return {
            investigation_count: investigations.length,
            question_count: this.demoQuestions.filter((q) => q.site_id === siteId).length,
            evidence_count: this.demoEvidence.filter((e) => e.site_id === siteId && e.moderation_status === 'visible').length,
            visit_count: this.demoVisits.filter((v) => v.site_id === siteId).length,
            vote_count: investigations.reduce((sum, i) => sum + (i.vote_count ?? 0), 0),
            participants,
        };
    }
    nextDemoId(prefix) {
        this.demoCounter += 1;
        return `${prefix}-${this.demoCounter}`;
    }
    /**
     * Tracks whether PostgreSQL tables in the remote database have an `is_demo` column.
     * `community_investigations` and `community_questions` tables were created without `is_demo`
     * in migration 011; demo records are kept in-memory when demoActive is true.
     */
    static supportsIsDemoColumn = {
        community_investigations: false,
        community_questions: false,
        observations: true,
    };
    isMissingIsDemoColumn(err) {
        if (!err)
            return false;
        const msg = String(err.message || err.details || err.hint || '');
        return ((msg.includes('is_demo') && (msg.includes('does not exist') || msg.includes('undefined_column'))) ||
            err.code === '42703');
    }
    requireDatabase(operation) {
        if (!this.ready && !this.demoActive) {
            throw new ServiceUnavailableError(`community ${operation}`, undefined, `Community ${operation} requires a configured database. ` +
                'Set SUPABASE_URL and SUPABASE_SECRET_KEY and run migration 011_community_sites_gis.sql.');
        }
    }
    // ==========================================================================
    // Investigations
    // ==========================================================================
    async createInvestigation(input, openedByHash) {
        this.requireDatabase('investigation creation');
        const question = input.question.trim();
        if (!question)
            throw new Error('An investigation question is required.');
        if (!input.siteId && !input.observationId) {
            throw new Error('An investigation must be attached to a geological site or an observation.');
        }
        const targetsDemo = this.demoEnabled &&
            (this.isDemoSiteId(input.siteId) || this.isDemoObservationId(input.observationId));
        if (this.demoActive || targetsDemo) {
            this.demoCounter += 1;
            const record = {
                id: this.nextDemoId('demo-inv'),
                public_id: `ET-INV-DEMO-${String(this.demoCounter).padStart(4, '0')}`,
                site_id: input.siteId ?? null,
                observation_id: input.observationId ?? null,
                question,
                status: 'open',
                opened_by_hash: openedByHash,
                is_public: input.isPublic !== false,
                participant_count: 0,
                evidence_count: 0,
                vote_count: 0,
                research_interest: input.researchInterest === true,
                options: input.options ?? [],
                checklist: input.checklistItems ?? [],
                context: input.context ?? null,
                category: input.category ?? null,
                media_ids: input.mediaIds ?? [],
                is_demo: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            this.demoInvestigations.unshift(record);
            return record;
        }
        const { data, error } = await supabase.from('community_investigations')
            .insert({
            site_id: input.siteId ?? null,
            observation_id: input.observationId ?? null,
            question,
            status: 'open',
            opened_by_hash: openedByHash,
            is_public: input.isPublic !== false,
            research_interest: input.researchInterest === true,
            options: input.options ?? [],
            checklist: input.checklistItems ?? [],
            context: input.context ?? null,
            category: input.category ?? null,
            media_ids: input.mediaIds ?? [],
        })
            .select()
            .single();
        if (error || !data) {
            throw new ServiceUnavailableError('community investigation create', error);
        }
        return data;
    }
    async findInvestigationByPublicId(publicId) {
        if (!this.ready && !this.demoEnabled)
            return null;
        const clean = publicId.trim().toUpperCase();
        if (!clean)
            return null;
        if (this.demoEnabled) {
            const demoMatch = this.demoInvestigations.find((i) => i.public_id.toUpperCase() === clean);
            if (demoMatch)
                return demoMatch;
        }
        if (!this.ready)
            return null;
        const { data, error } = await supabase.from('community_investigations')
            .select('*')
            .eq('public_id', clean)
            .maybeSingle();
        if (error) {
            logger.error('Failed to read investigation; refusing to mask database error', { error: error.message });
            throw new ServiceUnavailableError('community investigation read', error);
        }
        return data ?? null;
    }
    async findInvestigationById(id) {
        if (!this.ready && !this.demoEnabled)
            return null;
        if (this.demoEnabled) {
            const demoMatch = this.demoInvestigations.find((i) => i.id === id);
            if (demoMatch)
                return demoMatch;
        }
        if (!this.ready)
            return null;
        const { data, error } = await supabase.from('community_investigations')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) {
            logger.error('Failed to read investigation by id; refusing to mask database error', { error: error.message });
            throw new ServiceUnavailableError('community investigation lookup', error);
        }
        return data ?? null;
    }
    async listInvestigations(options) {
        if (!this.ready && !this.demoEnabled)
            return { rows: [], total: 0 };
        let dbRows = [];
        let dbCount = 0;
        if (this.ready) {
            const fetchLimit = Math.max(options.offset + options.limit, 1);
            let query = supabase.from('community_investigations')
                .select('*', { count: 'exact' })
                .eq('is_public', true);
            if (CommunityRepository.supportsIsDemoColumn['community_investigations'] === true) {
                query = query.eq('is_demo', false);
            }
            if (options.status)
                query = query.eq('status', options.status);
            if (options.siteId)
                query = query.eq('site_id', options.siteId);
            if (options.observationId)
                query = query.eq('observation_id', options.observationId);
            if (options.researchInterestOnly)
                query = query.eq('research_interest', true);
            query = query
                .order('created_at', { ascending: false })
                .range(0, fetchLimit - 1);
            const { data, count, error } = await query;
            if (error) {
                if (this.isMissingIsDemoColumn(error)) {
                    CommunityRepository.supportsIsDemoColumn['community_investigations'] = false;
                    let retryQuery = supabase.from('community_investigations')
                        .select('*', { count: 'exact' })
                        .eq('is_public', true);
                    if (options.status)
                        retryQuery = retryQuery.eq('status', options.status);
                    if (options.siteId)
                        retryQuery = retryQuery.eq('site_id', options.siteId);
                    if (options.observationId)
                        retryQuery = retryQuery.eq('observation_id', options.observationId);
                    if (options.researchInterestOnly)
                        retryQuery = retryQuery.eq('research_interest', true);
                    retryQuery = retryQuery
                        .order('created_at', { ascending: false })
                        .range(0, fetchLimit - 1);
                    const retry = await retryQuery;
                    if (!retry.error) {
                        dbRows = (retry.data ?? []).filter((r) => !r.is_demo);
                        dbCount = retry.count ?? dbRows.length;
                    }
                    else if (!this.demoEnabled) {
                        logger.error('Failed to list investigations; refusing to mask database error', { error: retry.error.message });
                        throw new ServiceUnavailableError('community investigations list', retry.error);
                    }
                    else {
                        logger.warn('Failed to list investigations from DB; falling back to demo investigations', { error: retry.error.message });
                    }
                }
                else if (!this.demoEnabled) {
                    logger.error('Failed to list investigations; refusing to mask database error', { error: error.message });
                    throw new ServiceUnavailableError('community investigations list', error);
                }
                else {
                    logger.warn('Failed to list investigations from DB; falling back to demo investigations', { error: error.message });
                }
            }
            else {
                dbRows = (data ?? []).filter((r) => !r.is_demo);
                dbCount = count ?? dbRows.length;
            }
        }
        if (!this.demoEnabled) {
            return {
                rows: dbRows.slice(options.offset, options.offset + options.limit),
                total: dbCount,
            };
        }
        let demoRows = this.demoInvestigations.filter((i) => i.is_public !== false);
        if (options.status)
            demoRows = demoRows.filter((i) => i.status === options.status);
        if (options.siteId)
            demoRows = demoRows.filter((i) => i.site_id === options.siteId);
        if (options.observationId)
            demoRows = demoRows.filter((i) => i.observation_id === options.observationId);
        if (options.researchInterestOnly)
            demoRows = demoRows.filter((i) => i.research_interest === true);
        const seen = new Set(dbRows.map((r) => r.id));
        const extraDemo = demoRows.filter((d) => !seen.has(d.id));
        const merged = [...dbRows, ...extraDemo].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return {
            rows: merged.slice(options.offset, options.offset + options.limit),
            total: dbCount + extraDemo.length,
        };
    }
    async setInvestigationStatus(id, status) {
        this.requireDatabase('status update');
        if (this.demoActive || this.isDemoInvestigationId(id)) {
            const record = this.demoInvestigations.find((i) => i.id === id);
            if (!record)
                return null;
            record.status = status;
            record.updated_at = new Date().toISOString();
            return record;
        }
        const { data, error } = await supabase.from('community_investigations')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error)
            throw new Error(`Could not update investigation: ${error.message}`);
        return data ?? null;
    }
    async setInvestigationModeration(id, patch) {
        this.requireDatabase('moderation');
        if (this.demoActive || this.isDemoInvestigationId(id)) {
            const record = this.demoInvestigations.find((i) => i.id === id);
            if (!record)
                return null;
            if (patch.is_public !== undefined)
                record.is_public = patch.is_public;
            if (patch.research_interest !== undefined)
                record.research_interest = patch.research_interest;
            record.updated_at = new Date().toISOString();
            return record;
        }
        const { data, error } = await supabase.from('community_investigations')
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error)
            throw new Error(`Could not moderate investigation: ${error.message}`);
        return data ?? null;
    }
    /**
     * Applies an opener's corrections to a published investigation.
     *
     * Only content fields are writable here; status, moderation and counters are
     * managed by the dedicated methods above, and the site/observation are never
     * moved once people have voted.
     */
    async updateInvestigation(id, patch) {
        this.requireDatabase('investigation edit');
        if (this.demoActive || this.isDemoInvestigationId(id)) {
            const record = this.demoInvestigations.find((i) => i.id === id);
            if (!record)
                return null;
            if (patch.question !== undefined)
                record.question = patch.question;
            if (patch.context !== undefined)
                record.context = patch.context;
            if (patch.category !== undefined)
                record.category = patch.category;
            if (patch.options !== undefined)
                record.options = patch.options;
            if (patch.checklist !== undefined)
                record.checklist = patch.checklist;
            if (patch.researchInterest !== undefined)
                record.research_interest = patch.researchInterest;
            record.updated_at = new Date().toISOString();
            return record;
        }
        const dbPatch = { updated_at: new Date().toISOString() };
        if (patch.question !== undefined)
            dbPatch.question = patch.question;
        if (patch.context !== undefined)
            dbPatch.context = patch.context;
        if (patch.category !== undefined)
            dbPatch.category = patch.category;
        if (patch.options !== undefined)
            dbPatch.options = patch.options;
        if (patch.checklist !== undefined)
            dbPatch.checklist = patch.checklist;
        if (patch.researchInterest !== undefined)
            dbPatch.research_interest = patch.researchInterest;
        const { data, error } = await supabase.from('community_investigations')
            .update(dbPatch)
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error)
            throw new Error(`Could not update investigation: ${error.message}`);
        return data ?? null;
    }
    // ==========================================================================
    // Votes (spec section 32: one vote per contributor per investigation)
    // ==========================================================================
    /**
     * Records or replaces a contributor's single vote.
     *
     * Duplicate protection is enforced by the `community_votes_one_per_contributor`
     * unique constraint rather than by a read-then-write check, so two concurrent
     * requests cannot both insert.
     *
     * Returns `changed: false` when the contributor re-submits the same option.
     */
    async castVote(input, contributorHash) {
        this.requireDatabase('vote');
        const existing = await this.findVote(input.investigationId, contributorHash);
        if (existing && existing.option === input.option) {
            return { option: input.option, changed: false };
        }
        if (this.demoActive || this.isDemoInvestigationId(input.investigationId)) {
            if (existing) {
                existing.option = input.option;
                existing.updated_at = new Date().toISOString();
            }
            else {
                this.demoVotes.push({
                    id: this.nextDemoId('demo-vote'),
                    investigation_id: input.investigationId,
                    contributor_hash: contributorHash,
                    option: input.option,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });
            }
            await this.recountInvestigation(input.investigationId);
            return { option: input.option, changed: true };
        }
        const { error } = await supabase.from('community_votes').upsert({
            investigation_id: input.investigationId,
            contributor_hash: contributorHash,
            option: input.option,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'investigation_id,contributor_hash' });
        if (error)
            throw new ServiceUnavailableError('community vote write', error);
        await this.recountInvestigation(input.investigationId);
        return { option: input.option, changed: true };
    }
    async findVote(investigationId, contributorHash) {
        if (!this.ready && !this.demoEnabled)
            return null;
        if (this.demoActive || this.isDemoInvestigationId(investigationId)) {
            return (this.demoVotes.find((v) => v.investigation_id === investigationId && v.contributor_hash === contributorHash) ?? null);
        }
        const { data, error } = await supabase.from('community_votes')
            .select('*')
            .eq('investigation_id', investigationId)
            .eq('contributor_hash', contributorHash)
            .maybeSingle();
        if (error) {
            logger.warn('Failed to read existing vote', { error: error.message });
            return null;
        }
        return data ?? null;
    }
    /** Real aggregate tally. Empty array when nobody has voted. */
    async getVoteTally(investigationId) {
        if (!this.ready && !this.demoEnabled)
            return [];
        if (this.demoActive || this.isDemoInvestigationId(investigationId)) {
            const counts = new Map();
            for (const vote of this.demoVotes) {
                if (vote.investigation_id !== investigationId)
                    continue;
                counts.set(vote.option, (counts.get(vote.option) ?? 0) + 1);
            }
            return Array.from(counts.entries())
                .map(([option, count]) => ({ option, count }))
                .sort((a, b) => b.count - a.count || a.option.localeCompare(b.option));
        }
        const { data, error } = await supabase.from('community_votes')
            .select('option')
            .eq('investigation_id', investigationId);
        if (error) {
            logger.warn('Failed to tally votes', { error: error.message });
            return [];
        }
        const counts = new Map();
        for (const row of (data ?? [])) {
            counts.set(row.option, (counts.get(row.option) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([option, count]) => ({ option, count }))
            .sort((a, b) => b.count - a.count || a.option.localeCompare(b.option));
    }
    async countDistinctParticipants(investigationId) {
        if (!this.ready && !this.demoEnabled)
            return 0;
        if (this.demoActive || this.isDemoInvestigationId(investigationId)) {
            return new Set(this.demoVotes
                .filter((v) => v.investigation_id === investigationId)
                .map((v) => v.contributor_hash)).size;
        }
        const { data, error } = await supabase.from('community_votes')
            .select('contributor_hash')
            .eq('investigation_id', investigationId);
        if (error) {
            logger.warn('Failed to count participants', { error: error.message });
            return 0;
        }
        return new Set((data ?? []).map((r) => r.contributor_hash)).size;
    }
    // ==========================================================================
    // Investigation checklist check-offs
    // ==========================================================================
    /**
     * Every check recorded on an investigation, one row per (item, contributor).
     *
     * A check means "I can provide this", never "this was verified". The list is
     * aggregated into counts and a per-viewer flag; the contributor hash is never
     * returned to a client.
     */
    async listInvestigationChecks(investigationId) {
        if (!this.ready && !this.demoEnabled)
            return [];
        if (this.demoActive || this.isDemoInvestigationId(investigationId)) {
            return this.demoChecklistChecks
                .filter((c) => c.investigation_id === investigationId)
                .map((c) => ({ item_id: c.item_id, contributor_hash: c.contributor_hash }));
        }
        const { data, error } = await supabase.from('community_investigation_checks')
            .select('item_id, contributor_hash')
            .eq('investigation_id', investigationId);
        if (error) {
            logger.warn('Failed to read investigation checklist', { error: error.message });
            return [];
        }
        return (data ?? []);
    }
    /**
     * Sets or clears one contributor's check on one checklist item.
     *
     * Duplicate protection is the unique (investigation_id, item_id,
     * contributor_hash) constraint, so a double tap cannot inflate the count.
     */
    async setInvestigationCheck(investigationId, itemId, contributorHash, checked) {
        this.requireDatabase('checklist update');
        if (this.demoActive || this.isDemoInvestigationId(investigationId)) {
            const index = this.demoChecklistChecks.findIndex((c) => c.investigation_id === investigationId &&
                c.item_id === itemId &&
                c.contributor_hash === contributorHash);
            if (checked && index === -1) {
                this.demoChecklistChecks.push({
                    investigation_id: investigationId,
                    item_id: itemId,
                    contributor_hash: contributorHash,
                });
            }
            else if (!checked && index !== -1) {
                this.demoChecklistChecks.splice(index, 1);
            }
            const count = this.demoChecklistChecks.filter((c) => c.investigation_id === investigationId && c.item_id === itemId).length;
            return { checked, check_count: count };
        }
        if (checked) {
            const { error } = await supabase.from('community_investigation_checks').upsert({
                investigation_id: investigationId,
                item_id: itemId,
                contributor_hash: contributorHash,
            }, { onConflict: 'investigation_id,item_id,contributor_hash' });
            if (error)
                throw new ServiceUnavailableError('community checklist write', error);
        }
        else {
            const { error } = await supabase.from('community_investigation_checks')
                .delete()
                .eq('investigation_id', investigationId)
                .eq('item_id', itemId)
                .eq('contributor_hash', contributorHash);
            if (error)
                throw new ServiceUnavailableError('community checklist delete', error);
        }
        const { count, error: countError } = await supabase.from('community_investigation_checks')
            .select('item_id', { count: 'exact', head: true })
            .eq('investigation_id', investigationId)
            .eq('item_id', itemId);
        if (countError) {
            logger.warn('Failed to count checklist checks', { error: countError.message });
            return { checked, check_count: 0 };
        }
        return { checked, check_count: count ?? 0 };
    }
    // ==========================================================================
    // Evidence
    // ==========================================================================
    async addEvidence(input, contributorHash, moderationStatus = 'visible') {
        this.requireDatabase('evidence');
        if (!input.investigationId && !input.siteId && !input.observationId) {
            throw new Error('Evidence must be attached to an investigation, site, or observation.');
        }
        const targetsDemo = this.demoEnabled &&
            (this.isDemoInvestigationId(input.investigationId) ||
                this.isDemoSiteId(input.siteId) ||
                this.isDemoObservationId(input.observationId));
        if (this.demoActive || targetsDemo) {
            const now = new Date().toISOString();
            const record = {
                id: this.nextDemoId('demo-ev'),
                investigation_id: input.investigationId ?? null,
                site_id: input.siteId ?? null,
                observation_id: input.observationId ?? null,
                media_id: input.mediaId ?? null,
                media_ids: input.mediaIds ?? (input.mediaId ? [input.mediaId] : []),
                contributor_hash: contributorHash,
                evidence_type: input.evidenceType,
                explanation: input.explanation?.trim() || null,
                supports_evidence: input.supportsEvidence !== false,
                is_challenge: input.isChallenge === true,
                moderation_status: moderationStatus,
                created_at: now,
                updated_at: now,
            };
            this.demoEvidence.push(record);
            if (input.investigationId)
                await this.recountInvestigation(input.investigationId);
            return record;
        }
        const { data, error } = await supabase.from('community_evidence')
            .insert({
            investigation_id: input.investigationId ?? null,
            site_id: input.siteId ?? null,
            observation_id: input.observationId ?? null,
            media_id: input.mediaId ?? null,
            media_ids: input.mediaIds ?? (input.mediaId ? [input.mediaId] : []),
            contributor_hash: contributorHash,
            evidence_type: input.evidenceType,
            explanation: input.explanation?.trim() || null,
            supports_evidence: input.supportsEvidence !== false,
            is_challenge: input.isChallenge === true,
            moderation_status: moderationStatus,
        })
            .select()
            .single();
        if (error || !data)
            throw new ServiceUnavailableError('community evidence create', error);
        if (input.investigationId)
            await this.recountInvestigation(input.investigationId);
        return data;
    }
    async listEvidence(filter) {
        if (!this.ready && !this.demoEnabled)
            return [];
        let dbRows = [];
        if (this.ready) {
            let query = supabase.from('community_evidence')
                .select('*')
                .eq('moderation_status', 'visible');
            if (filter.investigationId)
                query = query.eq('investigation_id', filter.investigationId);
            if (filter.siteId)
                query = query.eq('site_id', filter.siteId);
            if (filter.observationId)
                query = query.eq('observation_id', filter.observationId);
            const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
            if (error) {
                if (!this.demoEnabled) {
                    logger.error('Failed to list evidence; refusing to mask database error', { error: error.message });
                    throw new ServiceUnavailableError('community evidence list', error);
                }
                logger.warn('Failed to list evidence from DB; falling back to demo evidence', { error: error.message });
            }
            else {
                dbRows = data ?? [];
            }
        }
        if (!this.demoEnabled)
            return dbRows;
        let demoRows = this.demoEvidence.filter((e) => e.moderation_status === 'visible');
        if (filter.investigationId)
            demoRows = demoRows.filter((e) => e.investigation_id === filter.investigationId);
        if (filter.siteId)
            demoRows = demoRows.filter((e) => e.site_id === filter.siteId);
        if (filter.observationId)
            demoRows = demoRows.filter((e) => e.observation_id === filter.observationId);
        const seen = new Set(dbRows.map((r) => r.id));
        return [...dbRows, ...demoRows.filter((d) => !seen.has(d.id))].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    async setEvidenceModeration(id, status) {
        this.requireDatabase('evidence moderation');
        if (this.demoActive || this.isDemoEvidenceId(id)) {
            const record = this.demoEvidence.find((e) => e.id === id);
            if (!record)
                return null;
            record.moderation_status = status;
            record.updated_at = new Date().toISOString();
            if (record.investigation_id)
                await this.recountInvestigation(record.investigation_id);
            return record;
        }
        const { data, error } = await supabase.from('community_evidence')
            .update({ moderation_status: status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .maybeSingle();
        if (error)
            throw new Error(`Could not moderate evidence: ${error.message}`);
        return data ?? null;
    }
    // ==========================================================================
    // Questions and answers
    // ==========================================================================
    async askQuestion(input, contributorHash) {
        this.requireDatabase('question');
        const question = input.question.trim();
        if (!question)
            throw new Error('A question is required.');
        if (!input.siteId && !input.observationId && !input.investigationId) {
            throw new Error('A question must be attached to a site, observation, or investigation.');
        }
        const targetsDemo = this.demoEnabled &&
            (this.isDemoSiteId(input.siteId) ||
                this.isDemoObservationId(input.observationId) ||
                this.isDemoInvestigationId(input.investigationId));
        if (this.demoActive || targetsDemo) {
            this.demoCounter += 1;
            const now = new Date().toISOString();
            const record = {
                id: this.nextDemoId('demo-q'),
                public_id: `ET-Q-DEMO-${String(this.demoCounter).padStart(4, '0')}`,
                site_id: input.siteId ?? null,
                observation_id: input.observationId ?? null,
                investigation_id: input.investigationId ?? null,
                question,
                contributor_hash: contributorHash,
                status: 'open',
                is_public: true,
                answer_count: 0,
                vote_count: 0,
                requested_expert: input.requestedExpert === true,
                context: input.context ?? null,
                category: input.category ?? null,
                media_ids: input.mediaIds ?? [],
                is_demo: true,
                created_at: now,
                updated_at: now,
            };
            this.demoQuestions.unshift(record);
            return record;
        }
        const { data, error } = await supabase.from('community_questions')
            .insert({
            site_id: input.siteId ?? null,
            observation_id: input.observationId ?? null,
            investigation_id: input.investigationId ?? null,
            question,
            contributor_hash: contributorHash,
            status: 'open',
            is_public: true,
            requested_expert: input.requestedExpert === true,
            context: input.context ?? null,
            category: input.category ?? null,
            media_ids: input.mediaIds ?? [],
        })
            .select()
            .single();
        if (error || !data)
            throw new ServiceUnavailableError('community question create', error);
        return data;
    }
    async findQuestionByPublicId(publicId) {
        if (!this.ready && !this.demoEnabled)
            return null;
        const clean = publicId.trim().toUpperCase();
        if (!clean)
            return null;
        if (this.demoEnabled) {
            const demoMatch = this.demoQuestions.find((q) => q.public_id.toUpperCase() === clean);
            if (demoMatch)
                return demoMatch;
        }
        if (!this.ready)
            return null;
        const { data, error } = await supabase.from('community_questions')
            .select('*')
            .eq('public_id', clean)
            .maybeSingle();
        if (error) {
            logger.error('Failed to read question; refusing to mask database error', { error: error.message });
            throw new ServiceUnavailableError('community question read', error);
        }
        return data ?? null;
    }
    async listQuestions(options) {
        if (!this.ready && !this.demoEnabled)
            return { rows: [], total: 0 };
        let dbRows = [];
        let dbCount = 0;
        if (this.ready) {
            const fetchLimit = Math.max(options.offset + options.limit, 1);
            let query = supabase.from('community_questions')
                .select('*', { count: 'exact' })
                .eq('is_public', true);
            if (CommunityRepository.supportsIsDemoColumn['community_questions'] === true) {
                query = query.eq('is_demo', false);
            }
            if (options.siteId)
                query = query.eq('site_id', options.siteId);
            if (options.investigationId)
                query = query.eq('investigation_id', options.investigationId);
            if (options.observationId)
                query = query.eq('observation_id', options.observationId);
            const { data, count, error } = await query
                .order('created_at', { ascending: false })
                .range(0, fetchLimit - 1);
            if (error) {
                if (this.isMissingIsDemoColumn(error)) {
                    CommunityRepository.supportsIsDemoColumn['community_questions'] = false;
                    let retryQuery = supabase.from('community_questions')
                        .select('*', { count: 'exact' })
                        .eq('is_public', true);
                    if (options.siteId)
                        retryQuery = retryQuery.eq('site_id', options.siteId);
                    if (options.investigationId)
                        retryQuery = retryQuery.eq('investigation_id', options.investigationId);
                    if (options.observationId)
                        retryQuery = retryQuery.eq('observation_id', options.observationId);
                    retryQuery = retryQuery
                        .order('created_at', { ascending: false })
                        .range(0, fetchLimit - 1);
                    const retry = await retryQuery;
                    if (!retry.error) {
                        dbRows = (retry.data ?? []).filter((r) => !r.is_demo);
                        dbCount = retry.count ?? dbRows.length;
                    }
                    else if (!this.demoEnabled) {
                        logger.error('Failed to list questions; refusing to mask database error', { error: retry.error.message });
                        throw new ServiceUnavailableError('community questions list', retry.error);
                    }
                    else {
                        logger.warn('Failed to list questions from DB; falling back to demo questions', { error: retry.error.message });
                    }
                }
                else if (!this.demoEnabled) {
                    logger.error('Failed to list questions; refusing to mask database error', { error: error.message });
                    throw new ServiceUnavailableError('community questions list', error);
                }
                else {
                    logger.warn('Failed to list questions from DB; falling back to demo questions', { error: error.message });
                }
            }
            else {
                dbRows = (data ?? []).filter((r) => !r.is_demo);
                dbCount = count ?? dbRows.length;
            }
        }
        if (!this.demoEnabled) {
            return {
                rows: dbRows.slice(options.offset, options.offset + options.limit),
                total: dbCount,
            };
        }
        let demoRows = this.demoQuestions.filter((q) => q.is_public !== false);
        if (options.siteId)
            demoRows = demoRows.filter((q) => q.site_id === options.siteId);
        if (options.investigationId)
            demoRows = demoRows.filter((q) => q.investigation_id === options.investigationId);
        if (options.observationId)
            demoRows = demoRows.filter((q) => q.observation_id === options.observationId);
        const seen = new Set(dbRows.map((r) => r.id));
        const extraDemo = demoRows.filter((d) => !seen.has(d.id));
        const merged = [...dbRows, ...extraDemo].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return {
            rows: merged.slice(options.offset, options.offset + options.limit),
            total: dbCount + extraDemo.length,
        };
    }
    async postAnswer(input, contributorHash) {
        this.requireDatabase('answer');
        const answer = input.answer.trim();
        if (!answer)
            throw new Error('An answer is required.');
        if (this.demoActive || this.isDemoQuestionId(input.questionId)) {
            const record = {
                id: this.nextDemoId('demo-ans'),
                question_id: input.questionId,
                contributor_hash: contributorHash,
                answer,
                evidence_id: input.evidenceId ?? null,
                media_ids: input.mediaIds ?? [],
                is_expert: input.isExpert === true,
                created_at: new Date().toISOString(),
            };
            this.demoAnswers.push(record);
            await this.recountQuestion(input.questionId);
            return record;
        }
        const { data, error } = await supabase.from('community_answers')
            .insert({
            question_id: input.questionId,
            contributor_hash: contributorHash,
            answer,
            evidence_id: input.evidenceId ?? null,
            media_ids: input.mediaIds ?? [],
            is_expert: input.isExpert === true,
        })
            .select()
            .single();
        if (error || !data)
            throw new ServiceUnavailableError('community answer create', error);
        await this.recountQuestion(input.questionId);
        return data;
    }
    async listAnswers(questionId) {
        if (!this.ready && !this.demoEnabled)
            return [];
        if (this.demoActive || this.isDemoQuestionId(questionId)) {
            return this.demoAnswers
                .filter((a) => a.question_id === questionId)
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        }
        const { data, error } = await supabase.from('community_answers')
            .select('*')
            .eq('question_id', questionId)
            .order('created_at', { ascending: true })
            .limit(200);
        if (error) {
            logger.error('Failed to list answers; refusing to mask database error', { error: error.message });
            throw new ServiceUnavailableError('community answers list', error);
        }
        return data ?? [];
    }
    // ==========================================================================
    // Visits
    // ==========================================================================
    async recordVisit(input, contributorHash) {
        this.requireDatabase('visit');
        if (this.demoActive || this.isDemoSiteId(input.siteId)) {
            const now = new Date().toISOString();
            const record = {
                id: this.nextDemoId('demo-vis'),
                site_id: input.siteId,
                contributor_hash: contributorHash,
                visited_on: input.visitedOn ?? now.slice(0, 10),
                notes: input.notes?.trim() || null,
                media_id: input.mediaId ?? null,
                created_at: now,
            };
            this.demoVisits.unshift(record);
            return record;
        }
        const { data, error } = await supabase.from('community_visits')
            .insert({
            site_id: input.siteId,
            contributor_hash: contributorHash,
            visited_on: input.visitedOn ?? new Date().toISOString().slice(0, 10),
            notes: input.notes?.trim() || null,
            media_id: input.mediaId ?? null,
        })
            .select()
            .single();
        if (error || !data)
            throw new ServiceUnavailableError('community visit create', error);
        return data;
    }
    async listVisits(siteId, limit = 100) {
        if (!this.ready && !this.demoEnabled)
            return [];
        let dbRows = [];
        if (this.ready) {
            const { data, error } = await supabase.from('community_visits')
                .select('*')
                .eq('site_id', siteId)
                .order('created_at', { ascending: false })
                .limit(limit);
            if (error) {
                if (!this.demoEnabled) {
                    logger.error('Failed to list visits; refusing to mask database error', { error: error.message });
                    throw new ServiceUnavailableError('community visits list', error);
                }
                logger.warn('Failed to list visits from DB; falling back to demo visits', { error: error.message });
            }
            else {
                dbRows = data ?? [];
            }
        }
        if (!this.demoEnabled)
            return dbRows;
        const demoRows = this.demoVisits.filter((v) => v.site_id === siteId);
        const seen = new Set(dbRows.map((r) => r.id));
        return [...dbRows, ...demoRows.filter((d) => !seen.has(d.id))]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, limit);
    }
    // ==========================================================================
    // Reputation
    // ==========================================================================
    async getReputation(contributorHash) {
        if ((!this.ready && !this.demoActive) || !contributorHash)
            return null;
        if (this.demoActive) {
            const evidence = this.demoEvidence.filter((e) => e.contributor_hash === contributorHash).length;
            const votes = this.demoVotes.filter((v) => v.contributor_hash === contributorHash).length;
            const questions = this.demoQuestions.filter((q) => q.contributor_hash === contributorHash).length;
            const answers = this.demoAnswers.filter((a) => a.contributor_hash === contributorHash).length;
            const visits = this.demoVisits.filter((v) => v.contributor_hash === contributorHash).length;
            const investigations = new Set(this.demoVotes.filter((v) => v.contributor_hash === contributorHash).map((v) => v.investigation_id)).size;
            return {
                contributor_hash: contributorHash,
                public_handle: publicContributorHandle(contributorHash),
                observations_count: 0,
                evidence_count: evidence,
                votes_count: votes,
                questions_count: questions,
                answers_count: answers,
                visits_count: visits,
                investigations_count: investigations,
                districts_represented: 0,
                achievements: buildAchievements({
                    observations: 0,
                    evidence,
                    votes,
                    questions,
                    visits,
                    investigations,
                    districtsRepresented: 0,
                }),
                updated_at: new Date().toISOString(),
            };
        }
        const { data, error } = await supabase.from('community_reputation')
            .select('*')
            .eq('contributor_hash', contributorHash)
            .maybeSingle();
        if (error) {
            logger.error('Failed to read reputation; refusing to mask database error', { error: error.message });
            throw new ServiceUnavailableError('community reputation read', error);
        }
        return data ?? null;
    }
    /**
     * Recomputes contribution counters for one contributor from real rows only.
     *
     * Explicitly does NOT compute an accuracy or correctness figure.
     */
    async refreshReputation(contributorHash, publicHandle) {
        if ((!this.ready && !this.demoActive) || !contributorHash)
            return null;
        if (this.demoActive) {
            return this.getReputation(contributorHash);
        }
        const countRows = async (table, column, excludeDemo = false) => {
            let query = supabase.from(table)
                .select('*', { count: 'exact', head: true })
                .eq(column, contributorHash);
            if (excludeDemo && CommunityRepository.supportsIsDemoColumn[table] !== false) {
                query = query.eq('is_demo', false);
            }
            const { count, error } = await query;
            if (error) {
                if (excludeDemo && this.isMissingIsDemoColumn(error)) {
                    CommunityRepository.supportsIsDemoColumn[table] = false;
                    const retry = await supabase.from(table)
                        .select('*', { count: 'exact', head: true })
                        .eq(column, contributorHash);
                    if (!retry.error) {
                        return retry.count ?? 0;
                    }
                }
                logger.warn('Failed counting reputation rows', { table, error: error.message });
                return 0;
            }
            return count ?? 0;
        };
        const [observations, evidence, votes, questions, answers, visits] = await Promise.all([
            countRows('observations', 'source_user_hash', true),
            countRows('community_evidence', 'contributor_hash'),
            countRows('community_votes', 'contributor_hash'),
            countRows('community_questions', 'contributor_hash', false),
            countRows('community_answers', 'contributor_hash'),
            countRows('community_visits', 'contributor_hash'),
        ]);
        // Districts represented, derived from real non-demo observation locations.
        let districtsRepresented = 0;
        try {
            const { data: obsRows, error: obsErr } = await supabase.from('observations')
                .select('id')
                .eq('source_user_hash', contributorHash)
                .eq('is_demo', false);
            if (!obsErr && Array.isArray(obsRows) && obsRows.length > 0) {
                const ids = obsRows.map((r) => r.id);
                const { data: locRows } = await supabase.from('observation_locations')
                    .select('district')
                    .in('observation_id', ids)
                    .not('district', 'is', null);
                districtsRepresented = new Set((locRows ?? []).map((r) => r.district)).size;
            }
        }
        catch (err) {
            logger.warn('Failed counting reputation districts', { error: String(err) });
        }
        const investigations = await this.countDistinctParticipantsOfAny(contributorHash);
        const record = {
            contributor_hash: contributorHash,
            public_handle: publicHandle,
            observations_count: observations,
            evidence_count: evidence,
            votes_count: votes,
            questions_count: questions,
            answers_count: answers,
            visits_count: visits,
            investigations_count: investigations,
            districts_represented: districtsRepresented,
            achievements: buildAchievements({
                observations,
                evidence,
                votes,
                questions,
                visits,
                investigations,
                districtsRepresented,
            }),
            updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase.from('community_reputation')
            .upsert(record, { onConflict: 'contributor_hash' })
            .select()
            .maybeSingle();
        if (error) {
            logger.warn('Failed to persist reputation', { error: error.message });
            return record;
        }
        return data ?? record;
    }
    async countDistinctParticipantsOfAny(contributorHash) {
        const { data, error } = await supabase.from('community_votes')
            .select('investigation_id')
            .eq('contributor_hash', contributorHash);
        if (error)
            return 0;
        return new Set((data ?? []).map((r) => r.investigation_id)).size;
    }
    // ==========================================================================
    // Counter integrity
    // ==========================================================================
    /**
     * Recomputes an investigation's cached counters from its real child rows so a
     * displayed count can never drift from the rows that justify it.
     */
    async recountInvestigation(investigationId) {
        if (!this.ready && !this.demoEnabled)
            return;
        if (this.demoActive || this.isDemoInvestigationId(investigationId)) {
            const record = this.demoInvestigations.find((i) => i.id === investigationId);
            if (!record)
                return;
            record.evidence_count = this.demoEvidence.filter((e) => e.investigation_id === investigationId && e.moderation_status === 'visible').length;
            record.vote_count = this.demoVotes.filter((v) => v.investigation_id === investigationId).length;
            record.participant_count = new Set(this.demoVotes.filter((v) => v.investigation_id === investigationId).map((v) => v.contributor_hash)).size;
            record.updated_at = new Date().toISOString();
            return;
        }
        const { count: evidenceCount } = await supabase.from('community_evidence')
            .select('*', { count: 'exact', head: true })
            .eq('investigation_id', investigationId)
            .eq('moderation_status', 'visible');
        const { count: voteCount } = await supabase.from('community_votes')
            .select('*', { count: 'exact', head: true })
            .eq('investigation_id', investigationId);
        const participants = await this.countDistinctParticipants(investigationId);
        await supabase.from('community_investigations')
            .update({
            evidence_count: evidenceCount ?? 0,
            vote_count: voteCount ?? 0,
            participant_count: participants,
            updated_at: new Date().toISOString(),
        })
            .eq('id', investigationId);
    }
    async recountQuestion(questionId) {
        if (!this.ready && !this.demoEnabled)
            return;
        if (this.demoActive || this.isDemoQuestionId(questionId)) {
            const record = this.demoQuestions.find((q) => q.id === questionId);
            if (!record)
                return;
            record.answer_count = this.demoAnswers.filter((a) => a.question_id === questionId).length;
            record.updated_at = new Date().toISOString();
            return;
        }
        const { count } = await supabase.from('community_answers')
            .select('*', { count: 'exact', head: true })
            .eq('question_id', questionId);
        await supabase.from('community_questions')
            .update({ answer_count: count ?? 0, updated_at: new Date().toISOString() })
            .eq('id', questionId);
    }
}
/**
 * Participation achievements only.
 *
 * There is deliberately no "scientific accuracy" achievement. Reputation on this
 * platform measures contribution, never correctness.
 */
export function buildAchievements(input) {
    return [
        {
            id: 'field_explorer',
            label: 'Field Explorer',
            description: 'Visited 10 geological sites.',
            progress: { current: input.visits, required: 10 },
            earned: input.visits >= 10,
        },
        {
            id: 'observation_contributor',
            label: 'Observation Contributor',
            description: 'Submitted 25 useful observations.',
            progress: { current: input.observations, required: 25 },
            earned: input.observations >= 25,
        },
        {
            id: 'geological_detective',
            label: 'Geological Detective',
            description: 'Participated in 20 investigations.',
            progress: { current: input.investigations, required: 20 },
            earned: input.investigations >= 20,
        },
        {
            id: 'map_explorer',
            label: 'Map Explorer',
            description: 'Explored 50 geological sites.',
            progress: { current: input.visits, required: 50 },
            earned: input.visits >= 50,
        },
        {
            id: 'rock_hunter',
            label: 'Rock Hunter',
            description: 'Submitted observations from multiple districts.',
            progress: { current: input.districtsRepresented, required: 3 },
            earned: input.districtsRepresented >= 3,
        },
        {
            id: 'question_starter',
            label: 'Question Starter',
            description: 'Asked geological questions that attract answers.',
            progress: { current: input.questions, required: 5 },
            earned: input.questions >= 5,
        },
        {
            id: 'community_helper',
            label: 'Community Helper',
            description: 'Contributed evidence to investigations.',
            progress: { current: input.evidence, required: 10 },
            earned: input.evidence >= 10,
        },
    ];
}
export const communityRepository = new CommunityRepository();
/** Convenience re-export so callers can reason about DB availability. */
export const communityDataAvailable = () => isDatabaseConfigured() && env.SUPABASE_URL.length > 0;
