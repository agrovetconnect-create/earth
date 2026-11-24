import { logger } from './logger.js';
function isHttpCodedError(err) {
    return (err instanceof Error &&
        typeof err.status === 'number' &&
        typeof err.code === 'string');
}
/** Reads a request body as a plain object, tolerating a missing or non-object body. */
export function bodyOf(req) {
    return req.body && typeof req.body === 'object' ? req.body : {};
}
/** Answers with the standard error envelope. */
export function fail(res, status, code, message) {
    res.status(status).json({ error: { code, message } });
}
/**
 * Translates a thrown error into a response: a service error keeps its own
 * status and code, anything else becomes an opaque 500 so no internal detail
 * reaches the client.
 */
export function sendError(res, err) {
    if (isHttpCodedError(err)) {
        res.status(err.status).json({ error: { code: err.code, message: err.message } });
        return;
    }
    logger.error('Request failed', { error: String(err) });
    fail(res, 500, 'INTERNAL_ERROR', 'The request could not be completed.');
}
/** Standard security and cache headers for a public, read-only endpoint. */
export function setPublicHeaders(res, maxAgeSeconds = 30) {
    res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}
