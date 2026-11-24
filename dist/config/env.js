import dotenv from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';
// dotenv never overrides variables that are already present in the process
// environment. A checked-out .env must not silently replace deployment secrets.
const isHermeticTestRun = process.env.HERMETIC_TEST === 'true';
dotenv.config();
if (process.env.NODE_ENV === 'production' && !isHermeticTestRun && fs.existsSync('.env')) {
    throw new Error('[FATAL] A .env file is present while NODE_ENV=production. Remove it from the deployment; supply configuration through the platform secret store.');
}
export const VALID_GEMINI_TEXT_MODELS = [
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
    'gemini-4-argon',
];
export const VALID_GEMINI_MODELS = [
    'gemini-4-hydrogen',
    'gemini-3.1-flash-lite',
    'gemini-4-argon',
    'gemini-3.5-transcribe',
];
export function isGeminiModel(value) {
    return VALID_GEMINI_MODELS.includes(value.trim());
}
/**
 * Placeholder values that must never reach production. These are matched
 * case-insensitively as substrings so a partially-configured environment is
 * caught too (e.g. "test_gemini_api_key_placeholder_abc").
 */
const PLACEHOLDER_MARKERS = [
    'placeholder',
    'mock-project-id',
    'test_',
    'changeme',
    'replace_me',
    'not_configured',
    'required in production',
    '# required',
    'required',
];
function looksLikePlaceholder(value) {
    if (!value)
        return true;
    const trimmed = value.trim();
    if (trimmed.startsWith('#'))
        return true;
    const lowered = trimmed.toLowerCase();
    return PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker));
}
/**
 * Non-secret defaults. These are safe to fall back on because falling back
 * cannot compromise the deployment.
 */
const defaults = {
    PORT: '3000',
    NODE_ENV: 'development',
    WHATSAPP_GRAPH_API_VERSION: 'v21.0',
    GEMINI_MODEL: 'gemini-4-hydrogen',
    GEMINI_TIMEOUT_MS: '30000',
    MAX_IMAGE_SIZE_BYTES: '10000000',
    AI_RATE_LIMIT_PER_USER: '10',
    AI_RATE_LIMIT_WINDOW_SECONDS: '3600',
    PUBLIC_API_RATE_LIMIT_PER_MINUTE: '100',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:5173,http://localhost:3001,http://localhost:8081,http://localhost:19006',
    ENABLE_SECURITY_HEADERS: 'true',
    SUPER_ADMIN_EMAIL: 'owner@earthtalk.local',
    SUPER_ADMIN_SESSION_TTL_SECONDS: '43200',
    SUPER_ADMIN_RATE_LIMIT_PER_MINUTE: '10',
    COMMUNITY_RATE_LIMIT_PER_MINUTE: '20',
    COMMUNITY_MAX_TEXT_LENGTH: '2000',
    RESEARCH_EXPORT_RATE_LIMIT_PER_MINUTE: '10',
    RESEARCH_DATASET_VERSION: 'RT-RW-RESEARCH-2026-001',
    VALIDATION_MAX_SAMPLES_PER_RUN: '50',
    VALIDATION_MIN_ANSWERED_TOTAL: '20',
    VALIDATION_MIN_PER_CLASS_SUPPORT: '5',
    VALIDATION_MIN_REFERENCE_AGREEMENT_PCT: '80',
    VALIDATION_MAX_EXCLUDED_RATIO_PCT: '50',
    AUTH_SESSION_TTL_SECONDS: '604800',
    AUTH_CODE_TTL_SECONDS: '600',
    AUTH_EMAIL_CODE_TTL_SECONDS: '600',
    AUTH_CODE_MAX_ATTEMPTS: '5',
    AUTH_REQUEST_RATE_LIMIT_PER_MINUTE: '5',
    AUTH_IP_RATE_LIMIT_PER_MINUTE: '20',
    REAUTHENTICATION_INACTIVITY_DAYS: '7',
    COMMENT_RATE_LIMIT_PER_MINUTE: '10',
    COMMENT_MAX_LENGTH: '2000',
    POST_MEDIA_MAX_STORED_BYTES: '1500000',
    EMAIL_FROM: 'Earth Talk <noreply@earthtalk.local>',
    APP_URL: 'http://localhost:3000',
    CONTROL_CENTER_URL: 'http://localhost:3000/control',
};
/**
 * Secrets that must be explicitly provided in production.
 *
 * The previous configuration silently fell back to hard-coded default secrets,
 * two of which were published in the README. That made a production deploy
 * missing USER_HASH_SECRET sign every phone-number hash with a publicly known
 * key, which is fully reversible. Production now fails closed instead.
 */
const requiredSecretsInProd = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_APP_SECRET',
    'GEMINI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'USER_HASH_SECRET',
    'SUPER_ADMIN_PASSWORD_HASH',
    'SUPER_ADMIN_SESSION_SECRET',
    'ANONYMOUS_CONTRIBUTOR_SECRET',
    'AUTH_SESSION_SECRET',
    'EMAIL_API_KEY',
    'INTERNAL_SERVICE_KEY',
];
/**
 * Development-only fallbacks. Used so `npm run dev` works on a fresh clone
 * without ceremony. Refused entirely when NODE_ENV=production.
 */
const devSecretFallbacks = {
    WHATSAPP_ACCESS_TOKEN: 'dev_whatsapp_token_not_configured',
    // Deliberately not a structurally valid Meta phone number ID. A 15-digit
    // number here looks like a real business account and invites being pasted into
    // a request as though it were one.
    WHATSAPP_PHONE_NUMBER_ID: 'dev_phone_number_id_not_configured',
    WHATSAPP_VERIFY_TOKEN: 'dev_verify_token_not_configured',
    WHATSAPP_APP_SECRET: 'dev_whatsapp_app_secret_not_configured',
    GEMINI_API_KEY: 'dev_gemini_key_not_configured',
    SUPABASE_URL: 'https://mock-project-id.supabase.co',
    SUPABASE_SECRET_KEY: 'dev_supabase_key_not_configured',
    USER_HASH_SECRET: 'dev_user_hash_secret_not_configured',
    SUPER_ADMIN_PASSWORD_HASH: '',
    SUPER_ADMIN_SESSION_SECRET: 'dev_admin_session_secret_not_configured',
    ANONYMOUS_CONTRIBUTOR_SECRET: 'dev_contributor_secret_not_configured',
    AUTH_SESSION_SECRET: 'dev_auth_session_secret_not_configured',
    EMAIL_API_KEY: 'dev_email_api_key_not_configured',
    INTERNAL_SERVICE_KEY: 'dev_internal_service_key_not_configured',
};
/**
 * Strictly validates CORS_ALLOWED_ORIGINS for production deployments.
 * Rejects empty lists, wildcards ('*'), non-HTTPS origins, loopback/localhost
 * hosts, and URLs containing paths, query parameters, fragments, or credentials.
 */
export function validateProductionCorsOrigins(raw) {
    const origins = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    if (origins.length === 0) {
        throw new Error('[FATAL] CORS_ALLOWED_ORIGINS must explicitly list at least one HTTPS origin in production.');
    }
    for (const origin of origins) {
        if (origin === '*') {
            throw new Error('[FATAL] CORS_ALLOWED_ORIGINS cannot contain "*" in production.');
        }
        let parsed;
        try {
            parsed = new URL(origin);
        }
        catch {
            throw new Error(`[FATAL] CORS_ALLOWED_ORIGINS entry "${origin}" is not a valid URL origin.`);
        }
        if (parsed.origin !== origin || parsed.username || parsed.password) {
            throw new Error(`[FATAL] CORS_ALLOWED_ORIGINS entry "${origin}" must be a bare scheme://host[:port] origin without path, query, fragment, or credentials.`);
        }
        if (parsed.protocol !== 'https:') {
            throw new Error(`[FATAL] CORS_ALLOWED_ORIGINS entry "${origin}" must use https:// in production.`);
        }
        const host = parsed.hostname.toLowerCase();
        if (host === 'localhost' ||
            host.endsWith('.localhost') ||
            host === '127.0.0.1' ||
            host === '0.0.0.0' ||
            host === '::1' ||
            host === '[::1]') {
            throw new Error(`[FATAL] CORS_ALLOWED_ORIGINS entry "${origin}" cannot target a loopback or localhost address in production.`);
        }
    }
    return origins;
}
function validateEnv() {
    const isProd = process.env.NODE_ENV === 'production';
    const getVar = (key) => {
        const fromEnv = process.env[key];
        if (fromEnv !== undefined && fromEnv.trim() !== '') {
            if (!isProd && looksLikePlaceholder(fromEnv)) {
                return devSecretFallbacks[key] ?? defaults[key] ?? fromEnv;
            }
            return fromEnv;
        }
        const devFallback = devSecretFallbacks[key];
        if (devFallback)
            return devFallback;
        return defaults[key] ?? '';
    };
    const getSecret = (key) => {
        const value = getVar(key);
        if (isProd) {
            if (value.trim() === '') {
                throw new Error(`[FATAL] ${key} must be explicitly set in production. Refusing to start with an empty secret.`);
            }
            if (looksLikePlaceholder(value)) {
                throw new Error(`[FATAL] ${key} still holds a placeholder/test value. Set a real secret before starting in production.`);
            }
        }
        return value;
    };
    if (isProd) {
        const missing = [];
        for (const key of requiredSecretsInProd) {
            const value = process.env[key];
            if (!value || value.trim() === '')
                missing.push(key);
        }
        if (missing.length > 0) {
            const message = `Missing required production environment variable(s): ${missing.join(', ')}. ` +
                `Generate secrets with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
            console.error(`[FATAL] ${message}`);
            throw new Error(message);
        }
    }
    const parseIntVar = (key) => {
        const raw = getVar(key);
        const parsed = parseInt(raw, 10);
        if (Number.isNaN(parsed)) {
            throw new Error(`[FATAL] Environment variable ${key} must be an integer, received '${raw}'.`);
        }
        return parsed;
    };
    const adminPasswordHash = getVar('SUPER_ADMIN_PASSWORD_HASH');
    const adminPasswordPlain = getVar('SUPER_ADMIN_PASSWORD');
    if (isProd && !adminPasswordHash) {
        throw new Error('[FATAL] SUPER_ADMIN_PASSWORD_HASH must be set in production. ' +
            'Generate one with: npm run admin:hash-password -- "<your password>"');
    }
    const rawCorsOrigins = getVar('CORS_ALLOWED_ORIGINS');
    if (isProd) {
        validateProductionCorsOrigins(rawCorsOrigins);
    }
    const rawPort = parseIntVar('PORT');
    // In development environments with nginx proxy on 8080 (such as AI Studio), the app process must listen on port 3000
    const port = !isProd && rawPort === 8080 ? 3000 : rawPort;
    const configuredGeminiModel = getVar('GEMINI_MODEL').trim();
    const geminiModel = isGeminiModel(configuredGeminiModel)
        ? configuredGeminiModel
        : defaults.GEMINI_MODEL;
    return {
        PORT: port,
        NODE_ENV: getVar('NODE_ENV'),
        IS_PRODUCTION: isProd,
        // WhatsApp
        WHATSAPP_ACCESS_TOKEN: getSecret('WHATSAPP_ACCESS_TOKEN'),
        WHATSAPP_PHONE_NUMBER_ID: getVar('WHATSAPP_PHONE_NUMBER_ID'),
        WHATSAPP_VERIFY_TOKEN: getSecret('WHATSAPP_VERIFY_TOKEN'),
        WHATSAPP_APP_SECRET: getSecret('WHATSAPP_APP_SECRET'),
        WHATSAPP_GRAPH_API_VERSION: getVar('WHATSAPP_GRAPH_API_VERSION'),
        // AI
        GEMINI_API_KEY: getSecret('GEMINI_API_KEY'),
        GEMINI_MODEL: geminiModel,
        GEMINI_TIMEOUT_MS: parseIntVar('GEMINI_TIMEOUT_MS'),
        MAX_IMAGE_SIZE_BYTES: parseIntVar('MAX_IMAGE_SIZE_BYTES'),
        AI_RATE_LIMIT_PER_USER: parseIntVar('AI_RATE_LIMIT_PER_USER'),
        AI_RATE_LIMIT_WINDOW_SECONDS: parseIntVar('AI_RATE_LIMIT_WINDOW_SECONDS'),
        // Data
        SUPABASE_URL: getSecret('SUPABASE_URL'),
        SUPABASE_SECRET_KEY: getSecret('SUPABASE_SECRET_KEY'),
        USER_HASH_SECRET: getSecret('USER_HASH_SECRET'),
        // Public API
        PUBLIC_API_RATE_LIMIT_PER_MINUTE: parseIntVar('PUBLIC_API_RATE_LIMIT_PER_MINUTE'),
        CORS_ALLOWED_ORIGINS: getVar('CORS_ALLOWED_ORIGINS'),
        ENABLE_SECURITY_HEADERS: getVar('ENABLE_SECURITY_HEADERS') === 'true',
        // Super Admin
        SUPER_ADMIN_EMAIL: getVar('SUPER_ADMIN_EMAIL').trim().toLowerCase(),
        SUPER_ADMIN_PASSWORD_HASH: adminPasswordHash,
        SUPER_ADMIN_PASSWORD: isProd ? '' : adminPasswordPlain,
        SUPER_ADMIN_SESSION_SECRET: getSecret('SUPER_ADMIN_SESSION_SECRET'),
        SUPER_ADMIN_SESSION_TTL_SECONDS: parseIntVar('SUPER_ADMIN_SESSION_TTL_SECONDS'),
        SUPER_ADMIN_RATE_LIMIT_PER_MINUTE: parseIntVar('SUPER_ADMIN_RATE_LIMIT_PER_MINUTE'),
        // Community
        ANONYMOUS_CONTRIBUTOR_SECRET: getSecret('ANONYMOUS_CONTRIBUTOR_SECRET'),
        COMMUNITY_RATE_LIMIT_PER_MINUTE: parseIntVar('COMMUNITY_RATE_LIMIT_PER_MINUTE'),
        COMMUNITY_MAX_TEXT_LENGTH: parseIntVar('COMMUNITY_MAX_TEXT_LENGTH'),
        // Research
        RESEARCH_EXPORT_RATE_LIMIT_PER_MINUTE: parseIntVar('RESEARCH_EXPORT_RATE_LIMIT_PER_MINUTE'),
        RESEARCH_DATASET_VERSION: getVar('RESEARCH_DATASET_VERSION'),
        // Validation
        VALIDATION_MAX_SAMPLES_PER_RUN: parseIntVar('VALIDATION_MAX_SAMPLES_PER_RUN'),
        VALIDATION_MIN_ANSWERED_TOTAL: parseIntVar('VALIDATION_MIN_ANSWERED_TOTAL'),
        VALIDATION_MIN_PER_CLASS_SUPPORT: parseIntVar('VALIDATION_MIN_PER_CLASS_SUPPORT'),
        VALIDATION_MIN_REFERENCE_AGREEMENT_PCT: parseIntVar('VALIDATION_MIN_REFERENCE_AGREEMENT_PCT'),
        VALIDATION_MAX_EXCLUDED_RATIO_PCT: parseIntVar('VALIDATION_MAX_EXCLUDED_RATIO_PCT'),
        // Community posts, WhatsApp login and discussion (Stage 12)
        AUTH_SESSION_SECRET: getSecret('AUTH_SESSION_SECRET'),
        AUTH_SESSION_TTL_SECONDS: parseIntVar('AUTH_SESSION_TTL_SECONDS'),
        AUTH_CODE_TTL_SECONDS: parseIntVar('AUTH_CODE_TTL_SECONDS'),
        AUTH_EMAIL_CODE_TTL_SECONDS: parseIntVar('AUTH_EMAIL_CODE_TTL_SECONDS'),
        AUTH_CODE_MAX_ATTEMPTS: parseIntVar('AUTH_CODE_MAX_ATTEMPTS'),
        AUTH_REQUEST_RATE_LIMIT_PER_MINUTE: parseIntVar('AUTH_REQUEST_RATE_LIMIT_PER_MINUTE'),
        AUTH_IP_RATE_LIMIT_PER_MINUTE: parseIntVar('AUTH_IP_RATE_LIMIT_PER_MINUTE'),
        REAUTHENTICATION_INACTIVITY_DAYS: parseIntVar('REAUTHENTICATION_INACTIVITY_DAYS'),
        COMMENT_RATE_LIMIT_PER_MINUTE: parseIntVar('COMMENT_RATE_LIMIT_PER_MINUTE'),
        COMMENT_MAX_LENGTH: parseIntVar('COMMENT_MAX_LENGTH'),
        POST_MEDIA_MAX_STORED_BYTES: parseIntVar('POST_MEDIA_MAX_STORED_BYTES'),
        // Labelled demonstration posts exist to exercise the interface. They are
        // on by default in development and OFF in production unless someone
        // deliberately turns them on there, because a demonstration record must
        // never be mistaken for a collected observation.
        DEMO_POSTS_ENABLED: (() => {
            const explicit = process.env.DEMO_POSTS_ENABLED;
            if (explicit !== undefined && explicit.trim() !== '') {
                return explicit.trim().toLowerCase() === 'true';
            }
            return !isProd;
        })(),
        // Email
        EMAIL_API_KEY: getSecret('EMAIL_API_KEY'),
        EMAIL_FROM: getVar('EMAIL_FROM'),
        APP_URL: getVar('APP_URL'),
        CONTROL_CENTER_URL: getVar('CONTROL_CENTER_URL'),
        // Internal Service Key
        INTERNAL_SERVICE_KEY: getSecret('INTERNAL_SERVICE_KEY'),
    };
}
/**
 * Constant-time verification for internal service credentials.
 */
export function verifyInternalServiceKey(providedKey) {
    if (typeof providedKey !== 'string' || !providedKey.trim())
        return false;
    const runtimeKey = process.env.INTERNAL_SERVICE_KEY;
    const configured = runtimeKey && runtimeKey.trim().length > 0 ? runtimeKey : env?.INTERNAL_SERVICE_KEY;
    if (!configured || configured.trim().length === 0)
        return false;
    if (process.env.NODE_ENV === 'production' && looksLikePlaceholder(configured)) {
        return false;
    }
    const providedBuf = Buffer.from(providedKey.trim());
    const configuredBuf = Buffer.from(configured.trim());
    if (providedBuf.length !== configuredBuf.length)
        return false;
    return crypto.timingSafeEqual(providedBuf, configuredBuf);
}
/**
 * Derives a scrypt password hash in the format consumed by `verifyPassword`.
 * Exposed so the CLI helper and tests share exactly one implementation.
 *
 * Format: scrypt$<saltHex>$<hashHex>
 */
export function hashPassword(password, saltHex) {
    const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
    const derived = crypto.scryptSync(password.normalize('NFKC'), salt, 64);
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}
/**
 * Constant-time password verification. Returns false (never throws) on any
 * malformed input so a corrupt stored hash cannot become an auth bypass.
 */
export function verifyPassword(password, stored) {
    try {
        const parts = stored.split('$');
        if (parts.length !== 3 || parts[0] !== 'scrypt')
            return false;
        const salt = Buffer.from(parts[1], 'hex');
        const expected = Buffer.from(parts[2], 'hex');
        if (expected.length === 0)
            return false;
        const actual = crypto.scryptSync(password.normalize('NFKC'), salt, expected.length);
        return crypto.timingSafeEqual(actual, expected);
    }
    catch {
        return false;
    }
}
export const env = validateEnv();
