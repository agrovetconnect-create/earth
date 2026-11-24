import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from './admin-auth.js';
import { ServiceUnavailableError } from './service-error.js';
/**
 * Unforgeable brand marking scientific confirmation evidence that was verified
 * on the server against the accredited laboratory registry and stored evidence
 * records (never constructible from a raw JSON payload or client boolean).
 */
const VERIFIED_SCIENTIFIC_CONFIRMATION_BRAND = Symbol('EarthTalkVerifiedScientificConfirmation');
export function isVerifiedScientificConfirmation(candidate) {
    return Boolean(candidate &&
        typeof candidate === 'object' &&
        candidate[VERIFIED_SCIENTIFIC_CONFIRMATION_BRAND] === true);
}
/**
 * In-memory accredited laboratory registry used ONLY when the database is not
 * configured (unit tests). Starts completely empty — zero fabricated entries.
 */
const inMemoryAccreditedLabs = new Map();
/**
 * In-memory observation evidence reference hook used ONLY when the database is
 * not configured (unit tests). Starts empty.
 */
const inMemoryObservationEvidenceRefs = new Map();
export function registerAccreditedLaboratoryInMemory(lab) {
    if (isDatabaseConfigured()) {
        throw new Error('registerAccreditedLaboratoryInMemory cannot be used when database is configured');
    }
    inMemoryAccreditedLabs.set(lab.lab_code.trim().toLowerCase(), {
        lab_code: lab.lab_code.trim(),
        name: lab.name.trim(),
        accreditation_ref: lab.accreditation_ref.trim(),
        is_active: lab.is_active,
    });
}
export function registerObservationEvidenceRefInMemory(observationId, refId) {
    if (isDatabaseConfigured()) {
        throw new Error('registerObservationEvidenceRefInMemory cannot be used when database is configured');
    }
    const set = inMemoryObservationEvidenceRefs.get(observationId) ?? new Set();
    set.add(refId.trim());
    inMemoryObservationEvidenceRefs.set(observationId, set);
}
export function clearScientificEvidenceRegistriesInMemory() {
    inMemoryAccreditedLabs.clear();
    inMemoryObservationEvidenceRefs.clear();
}
export class ScientificEvidenceValidationError extends Error {
    code;
    status;
    constructor(code, message, status = 400) {
        super(message);
        this.name = 'ScientificEvidenceValidationError';
        this.code = code;
        this.status = status;
    }
}
const VALID_ID_TOKEN_RE = /^[A-Za-z0-9._:/#-]{3,160}$/;
function cleanString(value, maxLen = 200) {
    return typeof value === 'string' ? value.trim().slice(0, maxLen) : '';
}
/**
 * Parses and validates the five mandatory structured fields required for
 * `scientifically_confirmed`. Client booleans such as `accreditation_verified`
 * are ignored — accreditation is verified against the server laboratory registry.
 */
export function parseStructuredScientificEvidence(body) {
    const source = body.scientific_evidence && typeof body.scientific_evidence === 'object'
        ? body.scientific_evidence
        : body;
    const laboratory_id = cleanString(source.laboratory_id ?? source.lab_code, 64);
    const laboratory_name = cleanString(source.laboratory_name, 160);
    const report_id = cleanString(source.report_id ?? source.lab_report_id ?? source.sample_id, 120);
    const analytical_method = cleanString(source.analytical_method, 160);
    const evidence_reference = cleanString(source.evidence_reference ?? source.attachment_id, 160);
    const review_authorization = cleanString(source.review_authorization, 120);
    if (!laboratory_id ||
        !report_id ||
        !analytical_method ||
        !evidence_reference ||
        !review_authorization) {
        throw new ScientificEvidenceValidationError('SCIENTIFIC_CONFIRMATION_EVIDENCE_REQUIRED', 'Scientific confirmation requires structured laboratory evidence: laboratory_id, report_id, analytical_method, evidence_reference, and review_authorization.');
    }
    if (!VALID_ID_TOKEN_RE.test(laboratory_id) ||
        !VALID_ID_TOKEN_RE.test(report_id) ||
        analytical_method.length < 3 ||
        evidence_reference.length < 3 ||
        review_authorization.length < 3) {
        throw new ScientificEvidenceValidationError('SCIENTIFIC_CONFIRMATION_EVIDENCE_INVALID', 'Scientific confirmation fields failed format validation. Supply a valid laboratory_id, report_id, analytical_method, stored evidence_reference, and review_authorization.');
    }
    if (/^https?:\/\//i.test(evidence_reference)) {
        throw new ScientificEvidenceValidationError('SCIENTIFIC_CONFIRMATION_EVIDENCE_UNVERIFIED_URL', 'External URLs cannot substitute for a stored platform attachment or evidence record ID in evidence_reference.');
    }
    return {
        laboratory_id,
        ...(laboratory_name ? { laboratory_name } : {}),
        report_id,
        analytical_method,
        evidence_reference,
        review_authorization,
    };
}
/**
 * Verifies structured laboratory evidence against:
 *   1. The server's accredited_laboratories registry (`is_active = true`)
 *   2. Stored evidence/attachment rows belonging to `observationId`
 */
export async function verifyScientificConfirmationEvidence(observationId, body, hasLocalObservationEvidence) {
    const parsed = parseStructuredScientificEvidence(body);
    if (!isDatabaseConfigured()) {
        const lab = inMemoryAccreditedLabs.get(parsed.laboratory_id.toLowerCase());
        if (!lab || !lab.is_active) {
            throw new ScientificEvidenceValidationError('UNACCREDITED_LABORATORY', `Laboratory '${parsed.laboratory_id}' is not registered as an active accredited laboratory.`, 422);
        }
        const existsInRefSet = inMemoryObservationEvidenceRefs.get(observationId)?.has(parsed.evidence_reference) ?? false;
        const existsInRepo = hasLocalObservationEvidence
            ? hasLocalObservationEvidence(observationId, parsed.evidence_reference)
            : false;
        if (!existsInRefSet && !existsInRepo) {
            throw new ScientificEvidenceValidationError('EVIDENCE_REFERENCE_NOT_FOUND', `Evidence reference '${parsed.evidence_reference}' does not correspond to a stored attachment or media record on observation '${observationId}'.`, 422);
        }
        return mintVerifiedScientificConfirmation({
            ...parsed,
            laboratory_name: parsed.laboratory_name || lab.name,
        });
    }
    try {
        const { data: labRow, error: labErr } = await supabase.from('accredited_laboratories')
            .select('lab_code, name, is_active')
            .ilike('lab_code', parsed.laboratory_id)
            .maybeSingle();
        if (labErr) {
            throw new ServiceUnavailableError('accredited laboratory verification', labErr);
        }
        if (!labRow || labRow.is_active !== true) {
            throw new ScientificEvidenceValidationError('UNACCREDITED_LABORATORY', `Laboratory '${parsed.laboratory_id}' is not registered as an active accredited laboratory.`, 422);
        }
        const ref = parsed.evidence_reference;
        const [attRes, mediaRes, commEvRes] = await Promise.all([
            supabase.from('observation_attachments')
                .select('id, storage_path')
                .eq('observation_id', observationId),
            supabase.from('observation_media')
                .select('id, source_media_id, storage_path, moderation_status')
                .eq('observation_id', observationId)
                .neq('moderation_status', 'removed'),
            supabase.from('community_evidence')
                .select('id, moderation_status')
                .eq('observation_id', observationId)
                .eq('moderation_status', 'visible'),
        ]);
        if (attRes.error || mediaRes.error || commEvRes.error) {
            throw new ServiceUnavailableError('scientific evidence attachment verification', attRes.error ?? mediaRes.error ?? commEvRes.error);
        }
        const matchedAttachment = (attRes.data ?? []).some((r) => String(r.id) === ref || r.storage_path === ref);
        const matchedMedia = (mediaRes.data ?? []).some((r) => String(r.id) === ref || r.source_media_id === ref || r.storage_path === ref);
        const matchedCommunityEvidence = (commEvRes.data ?? []).some((r) => String(r.id) === ref);
        if (!matchedAttachment && !matchedMedia && !matchedCommunityEvidence) {
            throw new ScientificEvidenceValidationError('EVIDENCE_REFERENCE_NOT_FOUND', `Evidence reference '${ref}' does not correspond to a stored attachment, media item, or visible evidence record on observation '${observationId}'.`, 422);
        }
        return mintVerifiedScientificConfirmation({
            ...parsed,
            laboratory_name: parsed.laboratory_name || String(labRow.name),
        });
    }
    catch (err) {
        if (err instanceof ScientificEvidenceValidationError || err instanceof ServiceUnavailableError) {
            throw err;
        }
        throw new ServiceUnavailableError('scientific confirmation verification', err);
    }
}
/**
 * Reconstructs a `VerifiedScientificConfirmation` from an authoritative
 * database record (`scientific_confirmation_basis` JSON + `scientific_confirmed_at`)
 * persisted by `update_evidence_state_transactional`.
 */
export function verifyPersistedConfirmationBasis(basisJson, confirmedAt) {
    if (!basisJson || !confirmedAt)
        return null;
    try {
        const parsed = JSON.parse(basisJson);
        const structured = parseStructuredScientificEvidence(parsed);
        return mintVerifiedScientificConfirmation(structured, confirmedAt);
    }
    catch {
        return null;
    }
}
function mintVerifiedScientificConfirmation(evidence, confirmedAt = new Date().toISOString()) {
    const verified = {
        ...evidence,
        confirmed_at: confirmedAt,
        [VERIFIED_SCIENTIFIC_CONFIRMATION_BRAND]: true,
    };
    return Object.freeze(verified);
}
