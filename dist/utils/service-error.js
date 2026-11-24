/**
 * Raised when a required persistent operation cannot be completed because the
 * authoritative database is unreachable, timed out or refused the request.
 *
 * This exists so a database outage is never silently reinterpreted as "the
 * record does not exist" or "the write succeeded". A caller that receives this
 * error must answer 503 (service unavailable), and must NOT fall back to a
 * process-local store or treat an empty result as authoritative.
 */
export class ServiceUnavailableError extends Error {
    status = 503;
    code;
    operation;
    constructor(operation, cause, message) {
        super(message ??
            `The ${operation} is temporarily unavailable. No data was changed.`);
        this.name = 'ServiceUnavailableError';
        this.code = 'DATABASE_UNAVAILABLE';
        this.operation = operation;
        if (cause !== undefined) {
            this.cause = cause;
        }
    }
}
export function isServiceUnavailableError(err) {
    return err instanceof ServiceUnavailableError;
}
