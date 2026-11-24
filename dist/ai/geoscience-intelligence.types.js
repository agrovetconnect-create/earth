/**
 * Stage 11 — Geoscience Intelligence types.
 *
 * Earth Talk's intelligence layer assembles a context-aware interpretation from
 * every available source of evidence, while keeping those sources permanently
 * distinguishable. A user report, an AI inference, a community suggestion, an
 * expert review and a scientific confirmation are different kinds of statement
 * with different reliability, and the platform never merges them.
 */
/** Valid view types a contributor may send. */
export const VALID_VIEW_TYPES = [
    'overview',
    'closeup',
    'texture',
    'fresh_surface',
    'outcrop',
    'environmental',
    'video_frame',
];
/** Mandatory wording attached to every AI-confidence statement. */
export const AI_CONFIDENCE_STATEMENT = 'AI confidence is an internal model indicator and is not a calibrated probability.';
/** Mandatory wording when no geological dataset is configured. */
export const GEOLOGICAL_CONTEXT_UNAVAILABLE = 'Geological context unavailable for this observation.';
/** Used when an expert review exists and differs from the AI reading. */
export const EXPERT_SEPARATION_NOTE = 'The expert review is a separate kind of statement from the AI interpretation. Where they differ, the expert review carries more weight for identification, and the difference is shown rather than reconciled.';
