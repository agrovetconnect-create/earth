/**
 * Types for Earth Talk geological / geoscience AI analysis.
 *
 * The analysis is category-first: a photograph is classified into a geoscience
 * category and subcategory before any interpretation is attempted, so a fossil,
 * a fault, a spring and a rock all travel the same pipeline without the
 * pipeline pretending they are all rocks.
 *
 * Every existing rock-analysis field is preserved. A category that is not
 * rock-like leaves those fields honestly empty rather than filling them with a
 * plausible-looking value.
 */
export class GeologicalAnalysisError extends Error {
    category;
    originalError;
    constructor(category, message, originalError) {
        super(message);
        this.category = category;
        this.originalError = originalError;
        this.name = 'GeologicalAnalysisError';
    }
}
