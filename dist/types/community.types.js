/**
 * Community Discovery types.
 *
 * Scientific integrity rules encoded in these types:
 *   - `EvidenceState` is an ordered ladder. It is never derived from vote totals
 *     alone; Level 2 requires independent contributors and Level 5 requires a
 *     recorded laboratory or documented-reference basis.
 *   - Public DTOs deliberately carry a `participant_handle` (e.g.
 *     "Field Explorer #A82F") and never a `contributor_hash`, so no public
 *     response can leak the internal identity key.
 */
// ============================================================================
// Evidence ladder (spec section 4 / 65)
// ============================================================================
/**
 * The evidence ladder (specification section 12).
 *
 * This array is the single source of truth for the ladder. The database CHECK
 * constraint, the public filter validator, the research exports and the client
 * all derive their vocabulary from it, so a state cannot exist in one layer and
 * be missing from another.
 *
 * Three principles are encoded in the ordering, not just in comments:
 *
 *   - A record with no support is not a weak record, it is an absent record.
 *     `insufficient_evidence` exists so "we looked and could not tell" is a
 *     publishable answer instead of being hidden or shown as low confidence.
 *   - `rejected` is a recorded platform-owner determination, never something
 *     inferred from activity.
 *   - `unresolved` outranks `scientifically_confirmed`. A disputed record is
 *     not settled, and a rollup must never let an unrelated confirmation bury
 *     a dispute.
 */
export const EVIDENCE_STATES = [
    'ai_assisted',
    'community_supported',
    'community_investigated',
    'expert_reviewed',
    'scientifically_confirmed',
    'unresolved',
    'insufficient_evidence',
    'rejected',
];
/** True when the state is a valid database value. */
export function isEvidenceState(value) {
    return typeof value === 'string' && EVIDENCE_STATES.includes(value);
}
/**
 * Ordered rank, lowest first. Used for "highest evidence level" rollups.
 *
 * `unresolved` and `rejected` are ranked above `scientifically_confirmed` on
 * purpose. A disputed or withdrawn record is not weakly evidenced - it is a
 * record the platform must not present as settled. Ranking them last would let
 * a rollup quietly bury a dispute behind an unrelated confirmed reading, which
 * is the opposite of honest reporting.
 */
export const EVIDENCE_STATE_RANK = {
    insufficient_evidence: 1,
    ai_assisted: 2,
    community_supported: 3,
    community_investigated: 4,
    expert_reviewed: 5,
    scientifically_confirmed: 6,
    unresolved: 7,
    rejected: 8,
};
/**
 * The states that are explicitly NOT support for an interpretation.
 *
 * A rollup over these must never report a positive level. `insufficient_evidence`
 * means nothing could be concluded and `rejected` means the record should not be
 * presented, so treating either as evidence would be a lie in the other
 * direction.
 */
export const NON_EVIDENCE_STATES = new Set([
    'insufficient_evidence',
    'rejected',
]);
/** True when the state reflects real, recorded human or community support. */
export function isSupportiveEvidence(state) {
    return Boolean(state) && !NON_EVIDENCE_STATES.has(state);
}
export const EVIDENCE_STATE_LABEL = {
    insufficient_evidence: 'Insufficient evidence',
    ai_assisted: 'AI-assisted identification',
    community_supported: 'Community-supported',
    community_investigated: 'Community-investigated',
    expert_reviewed: 'Expert reviewed',
    scientifically_confirmed: 'Scientifically confirmed',
    unresolved: 'Unresolved',
    rejected: 'Rejected',
};
/**
 * Plain-language explanation of what each level does and does not mean.
 *
 * Served with every evidence state so a reader cannot confuse a stronger colour
 * with a better answer.
 */
export const EVIDENCE_STATE_MEANING = {
    insufficient_evidence: 'Something was submitted, but the available evidence cannot support any interpretation. This is not a wrong answer - it is no answer.',
    ai_assisted: 'An automated model produced a preliminary reading. The model has not been to the site and cannot confirm anything.',
    community_supported: 'Several independent people agreed on an interpretation. Agreement is not scientific confirmation.',
    community_investigated: 'People contributed substantive field evidence. A well-supported observation is still not a laboratory result.',
    expert_reviewed: 'A qualified geoscientist reviewed this record and recorded a determination. A review is not a laboratory analysis.',
    scientifically_confirmed: 'An expert review backed by laboratory analysis or a documented reference specimen exists. This is the strongest level Earth Talk records.',
    unresolved: 'There is a dispute or conflicting evidence. This record is deliberately not presented as settled.',
    rejected: 'A platform owner recorded that this should not be presented as an observation. The history is retained for audit.',
};
/**
 * Mandatory wording attached to any community-derived conclusion.
 * Community agreement is never presented as scientific truth.
 */
export const COMMUNITY_DISCLAIMER = 'Community-supported hypothesis — not scientific confirmation.';
export const AI_DISCLAIMER = 'Preliminary AI-assisted interpretation only. Not an authorised laboratory or expert determination.';
// ============================================================================
// Enumerations
// ============================================================================
export const INVESTIGATION_STATUSES = [
    'open',
    'investigating',
    'community_supported',
    'expert_reviewed',
    'resolved',
    'unresolved',
    'archived',
];
export const EVIDENCE_TYPES = [
    'photo',
    'close_up',
    'fresh_surface',
    'texture',
    'outcrop',
    'environment',
    'video',
    'field_note',
    'comparison',
    'discussion',
    'reference',
];
export const MODERATION_STATUSES = ['visible', 'pending_review', 'hidden', 'removed'];
export const QUESTION_STATUSES = [
    'open',
    'investigating',
    'community_supported',
    'expert_reviewed',
    'resolved',
    'unresolved',
];
export const SITE_GROUPING_BASES = ['admin_curated', 'evidence_backed', 'suggested'];
export const SITE_GROUPING_LABEL = {
    admin_curated: 'Curated by the platform owner',
    evidence_backed: 'Grouped from field evidence',
    suggested: 'Suggested grouping (not confirmed)',
};
export const REPUTATION_DISCLAIMER = 'Reputation reflects participation and contribution only. It is not a measure of scientific accuracy.';
// ============================================================================
// Community media (attachments on investigations, evidence, questions, answers)
// ============================================================================
export const COMMUNITY_MEDIA_KINDS = ['image', 'video'];
// ============================================================================
// Research opportunities (specification section 21)
// ============================================================================
/**
 * What a research opportunity was derived from.
 *
 * All three values are community activity. None is a scientific source, and
 * none of them licenses a claim that a discovery was made.
 */
export const RESEARCH_OPPORTUNITY_BASES = ['observation', 'site', 'community'];
/**
 * Mandatory wording attached to every research opportunity.
 *
 * A research opportunity is an open question the community would like answered.
 * It is never an official geological discovery, a survey finding, or a
 * scientific result, and the platform must not present it as one.
 */
export const RESEARCH_OPPORTUNITY_LABEL = 'Community-generated research opportunity';
export const RESEARCH_OPPORTUNITY_DISCLAIMER = 'Community-generated research opportunity: an open question raised from public observations. This is not an official geological discovery, a survey finding, or a scientific result.';
// ============================================================================
// Community abuse reports (specification section 25)
// ============================================================================
/**
 * Reasons a member of the public may report a record.
 *
 * A report is an allegation. It carries no evidence, it never changes an
 * evidence state, and it is never counted as community support.
 */
export const ABUSE_REPORT_REASONS = [
    'incorrect_information',
    'privacy_concern',
    'misleading_claim',
    'commercial_or_spam',
    'abusive_content',
    'duplicate_record',
    'sensitive_location',
    'safety_principles',
    'other',
];
export const ABUSE_REPORT_REASON_LABEL = {
    incorrect_information: 'The geological information looks incorrect',
    privacy_concern: 'It exposes someone\'s private location or identity',
    misleading_claim: 'It makes a claim the evidence does not support',
    commercial_or_spam: 'It is commercial, promotional or spam',
    abusive_content: 'It contains abusive or harmful content',
    duplicate_record: 'It duplicates an existing record',
    sensitive_location: 'The location is ecologically or culturally sensitive',
    safety_principles: 'It violates Earth Talk\'s humanitarian, community or safety principles',
    other: 'Something else',
};
export const ABUSE_REPORT_STATUSES = ['open', 'acknowledged', 'actioned', 'dismissed'];
export const ABUSE_REPORT_TARGET_TYPES = [
    'observation',
    'investigation',
    'question',
    // Comments and their replies share one target type: a reply is just a comment
    // with a parent, and a moderator works the same queue for both.
    'comment',
    'site',
    'evidence',
    'media',
];
