/**
 * Free-text cleaning shared by validation and services.
 *
 * Untrusted text is coerced, trimmed and bounded before it is stored or
 * interpreted, so callers never have to re-implement the same three lines.
 */
/** Trims a string to a maximum length, returning '' for a non-string. */
export function trimText(value, maxLength) {
    if (typeof value !== 'string')
        return '';
    return value.trim().slice(0, maxLength);
}
/** Coerces any value to a single-line string with collapsed whitespace. */
export function squashText(value, maxLength) {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}
/** Bounds a list of free-text items, dropping the empties. */
export function cleanTextList(value, maxItems, maxItemLength = 400) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => trimText(item, maxItemLength))
        .filter((item) => item.length > 0)
        .slice(0, maxItems);
}
