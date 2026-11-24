import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
function reportPublicId() {
    // Short, non-sequential and human-quotable, without encoding any identity.
    const token = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `RPT-${token}`;
}
function toFiled(report) {
    return {
        public_id: report.public_id,
        target_type: report.target_type,
        target_id: report.target_id,
        reason_code: report.reason_code,
        details: report.details,
        status: report.status,
        created_at: report.created_at,
    };
}
export class AbuseReportRepository {
    memory = new Map();
    get database() {
        return isDatabaseConfigured();
    }
    /** Registers a report in the development store. Used by tests only. */
    registerReport(report) {
        this.memory.set(report.public_id, report);
    }
    requireDatabase(operation) {
        if (!this.database && env.IS_PRODUCTION) {
            throw new ServiceUnavailableError(`abuse report ${operation}`, undefined, `Filing a report requires a configured database (${operation}). ` +
                'Set SUPABASE_URL and SUPABASE_SECRET_KEY and run migration 020_community_abuse_reports.sql.');
        }
    }
    async createReport(input) {
        this.requireDatabase('create');
        const id = crypto.randomUUID();
        const publicId = reportPublicId();
        const createdAt = new Date().toISOString();
        if (this.database) {
            try {
                const { error } = await supabase.from('community_abuse_reports').insert({
                    id,
                    public_id: publicId,
                    target_type: input.target_type,
                    target_id: input.target_id,
                    observation_passport_id: input.observation_passport_id,
                    reason_code: input.reason_code,
                    details: input.details,
                    reported_by_hash: input.reported_by_hash,
                    status: 'open',
                    created_at: createdAt,
                });
                if (error)
                    throw new Error(error.message);
                return {
                    public_id: publicId,
                    target_type: input.target_type,
                    target_id: input.target_id,
                    reason_code: input.reason_code,
                    details: input.details,
                    status: 'open',
                    created_at: createdAt,
                };
            }
            catch (err) {
                logger.error('Could not store the abuse report in the database; refusing to fall back to process memory', {
                    error: String(err),
                });
                throw new ServiceUnavailableError('abuse report create', err);
            }
        }
        const report = {
            id,
            public_id: publicId,
            target_type: input.target_type,
            target_id: input.target_id,
            observation_passport_id: input.observation_passport_id,
            reason_code: input.reason_code,
            details: input.details,
            reported_by_hash: input.reported_by_hash,
            status: 'open',
            resolution_note: null,
            resolved_by: null,
            resolved_at: null,
            created_at: createdAt,
        };
        this.memory.set(publicId, report);
        return toFiled(report);
    }
    /**
     * Looks for an existing report with the same target and reporter hash.
     *
     * Used to keep one reader from filing the same allegation repeatedly. A
     * signed-out, tokenless report carries no hash and is never matched here.
     */
    async findExistingReport(targetType, targetId, reporterHash) {
        if (!reporterHash)
            return null;
        if (this.database) {
            try {
                const { data, error } = await supabase.from('community_abuse_reports')
                    .select('*')
                    .eq('target_type', targetType)
                    .eq('target_id', targetId)
                    .eq('reported_by_hash', reporterHash)
                    .limit(1);
                if (error)
                    throw new Error(error.message);
                if (Array.isArray(data) && data.length > 0) {
                    return toFiled(data[0]);
                }
                return null;
            }
            catch (err) {
                logger.error('Could not check for duplicate abuse report; refusing to fall back to process memory', {
                    error: String(err),
                });
                throw new ServiceUnavailableError('abuse report duplicate check', err);
            }
        }
        for (const report of this.memory.values()) {
            if (report.target_type === targetType &&
                report.target_id === targetId &&
                report.reported_by_hash === reporterHash) {
                return toFiled(report);
            }
        }
        return null;
    }
    /** The moderation queue. Never returns the reporter hash. */
    async listReports(status) {
        if (this.database) {
            try {
                let query = supabase.from('community_abuse_reports').select('*');
                if (status)
                    query = query.eq('status', status);
                const { data, error } = await query.order('created_at', { ascending: false });
                if (error)
                    throw new Error(error.message);
                if (Array.isArray(data)) {
                    return data.map(toFiled);
                }
                return [];
            }
            catch (err) {
                logger.error('Could not read the abuse report queue; refusing to fall back to process memory', {
                    error: String(err),
                });
                throw new ServiceUnavailableError('abuse report list', err);
            }
        }
        return Array.from(this.memory.values())
            .filter((report) => !status || report.status === status)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map(toFiled);
    }
    /**
     * The moderation queue as full records, including the resolution fields.
     *
     * Unlike `listReports` this keeps the reporter hash, because the platform
     * owner is the one caller that may need to see that two reports share a
     * reporter. The hash is still one-way: it identifies no person.
     */
    async listQueue(status) {
        if (this.database) {
            try {
                let query = supabase.from('community_abuse_reports').select('*');
                if (status)
                    query = query.eq('status', status);
                const { data, error } = await query.order('created_at', { ascending: false });
                if (error)
                    throw new Error(error.message);
                if (Array.isArray(data))
                    return data;
                return [];
            }
            catch (err) {
                logger.error('Could not read the abuse report moderation queue; refusing to fall back to process memory', {
                    error: String(err),
                });
                throw new ServiceUnavailableError('abuse report moderation queue', err);
            }
        }
        return Array.from(this.memory.values())
            .filter((report) => !status || report.status === status)
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    /**
     * Records a moderation decision on a report, or returns null when there is no
     * such report. Reopening (`status: 'open'`) clears the resolution.
     */
    async resolveReport(publicId, resolution) {
        const terminal = resolution.status === 'actioned' || resolution.status === 'dismissed';
        const resolvedAt = new Date().toISOString();
        if (this.database) {
            try {
                const { data, error } = await supabase.rpc('resolve_abuse_report_transactional', {
                    p_public_id: publicId,
                    p_status: resolution.status,
                    p_resolution_note: resolution.resolutionNote,
                    p_actor: resolution.resolvedBy,
                    p_actor_role: 'super_admin',
                });
                if (error)
                    throw new Error(error.message);
                if (data && typeof data === 'object')
                    return data;
                return null;
            }
            catch (err) {
                logger.error('Could not record the moderation decision; refusing to fall back to process memory', {
                    error: String(err),
                });
                throw new ServiceUnavailableError('abuse report resolution', err);
            }
        }
        const existing = this.memory.get(publicId);
        if (!existing)
            return null;
        const updated = {
            ...existing,
            status: resolution.status,
            resolution_note: resolution.resolutionNote,
            resolved_by: resolution.status === 'open' ? null : resolution.resolvedBy,
            resolved_at: terminal ? resolvedAt : null,
        };
        this.memory.set(publicId, updated);
        return updated;
    }
}
export const abuseReportRepository = new AbuseReportRepository();
