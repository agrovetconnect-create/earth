import { abuseReportRepository } from '../repositories/abuse-report.repository.js';
import { squashText } from '../utils/text.js';
import { ABUSE_REPORT_REASON_LABEL, ABUSE_REPORT_REASONS, ABUSE_REPORT_STATUSES, ABUSE_REPORT_TARGET_TYPES, } from '../types/community.types.js';
/**
 * Community abuse reports (specification section 25).
 *
 * A report is an allegation and is treated as one. Filing it never changes what
 * anyone sees: it only puts a work item in the moderation queue. Anyone may
 * file one, including a signed-out visitor, because a reader who cannot report
 * harmful content cannot protect themselves or the community.
 */
const MAX_DETAILS_LENGTH = 1000;
export class AbuseReportError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = 'AbuseReportError';
    }
}
function cleanText(value, maxLength) {
    const text = squashText(value, maxLength);
    return text.length > 0 ? text : null;
}
function toQueueItem(report) {
    return {
        public_id: report.public_id,
        target_type: report.target_type,
        target_id: report.target_id,
        observation_passport_id: report.observation_passport_id ?? null,
        reason_code: report.reason_code,
        reason_label: ABUSE_REPORT_REASON_LABEL[report.reason_code] ?? report.reason_code,
        details: report.details,
        status: report.status,
        resolution_note: report.resolution_note,
        resolved_by: report.resolved_by,
        resolved_at: report.resolved_at,
        created_at: report.created_at,
        has_reporter_identity: Boolean(report.reported_by_hash),
    };
}
export class AbuseReportService {
    async fileReport(input) {
        const targetType = String(input.targetType ?? '').toLowerCase();
        if (!ABUSE_REPORT_TARGET_TYPES.includes(targetType)) {
            throw new AbuseReportError(400, 'INVALID_TARGET', 'Choose what you are reporting.');
        }
        const targetId = String(input.targetId ?? '').trim();
        if (targetId.length === 0 || targetId.length > 200) {
            throw new AbuseReportError(400, 'INVALID_TARGET_ID', 'The item being reported is not valid.');
        }
        const reasonCode = String(input.reasonCode ?? '').toLowerCase();
        if (!ABUSE_REPORT_REASONS.includes(reasonCode)) {
            throw new AbuseReportError(400, 'INVALID_REASON', 'Choose a reason for your report.');
        }
        const details = cleanText(input.details, MAX_DETAILS_LENGTH);
        const passportId = cleanText(input.observationPassportId, 64);
        // One reader, one report per target. A repeat is answered honestly with the
        // existing reference rather than creating a second queue item, and the
        // reporter is never identified to anyone.
        const reporterHash = input.reporterHash ?? null;
        if (reporterHash) {
            const existing = await abuseReportRepository.findExistingReport(targetType, targetId, reporterHash);
            if (existing) {
                return {
                    report: existing,
                    message: 'You have already reported this content. A moderator will review your existing report; there is no need to file it again.',
                };
            }
        }
        const report = await abuseReportRepository.createReport({
            target_type: targetType,
            target_id: targetId,
            observation_passport_id: passportId ?? (targetType === 'observation' ? targetId : null),
            reason_code: reasonCode,
            details,
            reported_by_hash: reporterHash,
        });
        return {
            report,
            message: 'Thank you. Your report has been recorded for review. A report is an allegation and does not by itself change what is shown.',
        };
    }
    /**
     * The moderation queue, newest first. Visible only to the platform owner.
     */
    async listQueue(status) {
        if (status !== undefined && status !== '' && !ABUSE_REPORT_STATUSES.includes(status)) {
            throw new AbuseReportError(400, 'INVALID_STATUS', `status must be one of: ${ABUSE_REPORT_STATUSES.join(', ')}.`);
        }
        const rows = await abuseReportRepository.listQueue(status);
        return rows.map(toQueueItem);
    }
    /**
     * Records a moderation decision.
     *
     * A report is an allegation; resolving it decides what happens to the record
     * it names, and that decision is attributed. `actioned` and `dismissed` end
     * the item and therefore require a note; `acknowledged` only marks it seen;
     * `open` reopens a closed item.
     */
    async resolveReport(publicId, input, resolvedBy) {
        const id = String(publicId ?? '').trim();
        if (id.length === 0) {
            throw new AbuseReportError(404, 'REPORT_NOT_FOUND', 'That report does not exist.');
        }
        const status = String(input.status ?? '').toLowerCase();
        if (!ABUSE_REPORT_STATUSES.includes(status)) {
            throw new AbuseReportError(400, 'INVALID_STATUS', `status must be one of: ${ABUSE_REPORT_STATUSES.join(', ')}.`);
        }
        const note = cleanText(input.note, MAX_DETAILS_LENGTH);
        const terminal = status === 'actioned' || status === 'dismissed';
        if (terminal && !note) {
            throw new AbuseReportError(400, 'NOTE_REQUIRED', 'Resolving a report needs a short note explaining the decision.');
        }
        const updated = await abuseReportRepository.resolveReport(id, {
            status: status,
            resolutionNote: note,
            resolvedBy,
        });
        if (!updated) {
            throw new AbuseReportError(404, 'REPORT_NOT_FOUND', 'That report does not exist.');
        }
        return toQueueItem(updated);
    }
}
export const abuseReportService = new AbuseReportService();
