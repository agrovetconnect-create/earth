import dotenv from 'dotenv';
import crypto from 'node:crypto';
import fs from 'node:fs';

// dotenv never overrides variables that are already present in the process
// environment. A checked-out .env must not silently replace deployment secrets.
const isHermeticTestRun = process.env.HERMETIC_TEST === 'true';
dotenv.config();

if (process.env.NODE_ENV === 'production' && !isHermeticTestRun && fs.existsSync('.env')) {
  throw new Error(
    '[FATAL] A .env file is present while NODE_ENV=production. Remove it from the deployment; supply configuration through the platform secret store.'
  );
}

export const VALID_GEMINI_TEXT_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-4-argon',
] as const;

export const VALID_GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-4-argon',
  'gemini-3.5-transcribe',
] as const;

export type GeminiModelName = (typeof VALID_GEMINI_MODELS)[number];

export function isGeminiModel(value: string): value is GeminiModelName {
  return (VALID_GEMINI_MODELS as readonly string[]).includes(value.trim());
}

export interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  IS_PRODUCTION: boolean;

  // WhatsApp (Stage 1)
  WHATSAPP_ACCESS_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_VERIFY_TOKEN: string;
  /**
   * Meta application secret used to verify the `X-Hub-Signature-256` header on
   * webhook event deliveries. This is NOT the webhook verification token: the
   * token answers the GET handshake, the secret authenticates the POST events.
   */
  WHATSAPP_APP_SECRET: string;
  WHATSAPP_GRAPH_API_VERSION: string;

  // AI (Stage 2)
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  GEMINI_TIMEOUT_MS: number;
  MAX_IMAGE_SIZE_BYTES: number;
  AI_RATE_LIMIT_PER_USER: number;
  AI_RATE_LIMIT_WINDOW_SECONDS: number;
  AI_TEXT_FALLBACK_ENABLED: boolean;
  AI_TEXT_FALLBACK_TIMEOUT_MS: number;
  AI_TEXT_FALLBACK_PROVIDER_ORDER: string;
  AI_TEXT_FALLBACK_MODELS_JSON: string;
  AI_ALLOW_TRIAL_PROVIDERS: boolean;
  GROQ_API_KEY: string;
  OPENROUTER_API_KEY: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  MISTRAL_API_KEY: string;
  COHERE_API_KEY: string;
  NVIDIA_API_KEY: string;
  ZAI_API_KEY: string;
  REQUESTY_API_KEY: string;

  // Data (Stage 3)
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  USER_HASH_SECRET: string;

  // Public API (Stage 4)
  PUBLIC_API_RATE_LIMIT_PER_MINUTE: number;
  CORS_ALLOWED_ORIGINS: string;
  ENABLE_SECURITY_HEADERS: boolean;

  // Super Admin authentication (replaces per-expert accounts)
  SUPER_ADMIN_EMAIL: string;
  SUPER_ADMIN_PASSWORD_HASH: string;
  SUPER_ADMIN_PASSWORD: string;
  SUPER_ADMIN_SESSION_SECRET: string;
  SUPER_ADMIN_SESSION_TTL_SECONDS: number;
  SUPER_ADMIN_RATE_LIMIT_PER_MINUTE: number;

  // Community (Stage 8)
  ANONYMOUS_CONTRIBUTOR_SECRET: string;
  COMMUNITY_RATE_LIMIT_PER_MINUTE: number;
  COMMUNITY_MAX_TEXT_LENGTH: number;

  // Research (Stage 6)
  RESEARCH_EXPORT_RATE_LIMIT_PER_MINUTE: number;
  RESEARCH_DATASET_VERSION: string;

  // Validation (Stage 7)
  VALIDATION_MAX_SAMPLES_PER_RUN: number;
  /**
   * Sample-size policy for reporting evaluation results.
   *
   * These are configurable because "enough specimens" depends on the claim being
   * made, not on a universal number. The previous code treated `>= 3` as
   * scientifically sufficient, which was neither configurable nor defensible.
   */
  VALIDATION_MIN_ANSWERED_TOTAL: number;
  VALIDATION_MIN_PER_CLASS_SUPPORT: number;
  VALIDATION_MIN_REFERENCE_AGREEMENT_PCT: number;
  VALIDATION_MAX_EXCLUDED_RATIO_PCT: number;

  // Community posts, WhatsApp login and discussion (Stage 12)
  AUTH_SESSION_SECRET: string;
  AUTH_SESSION_TTL_SECONDS: number;
  AUTH_CODE_TTL_SECONDS: number;
  AUTH_EMAIL_CODE_TTL_SECONDS: number;
  AUTH_CODE_MAX_ATTEMPTS: number;
  AUTH_REQUEST_RATE_LIMIT_PER_MINUTE: number;
  AUTH_IP_RATE_LIMIT_PER_MINUTE: number;
  REAUTHENTICATION_INACTIVITY_DAYS: number;
  COMMENT_RATE_LIMIT_PER_MINUTE: number;
  COMMENT_MAX_LENGTH: number;
  POST_MEDIA_MAX_STORED_BYTES: number;
  /** Labelled demonstration posts. Always off in production unless set there. */
  DEMO_POSTS_ENABLED: boolean;

  // Email URLs (delivery is handled by Supabase Auth)
  APP_URL: string;
  CONTROL_CENTER_URL: string;

  // Internal Service Security (Item 11)
  INTERNAL_SERVICE_KEY: string;
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

function looksLikePlaceholder(value: string): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return true;
  const lowered = trimmed.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker));
}

/**
 * Non-secret defaults. These are safe to fall back on because falling back
 * cannot compromise the deployment.
 */
const defaults: Record<string, string> = {
  PORT: '3000',
  NODE_ENV: 'development',
  WHATSAPP_GRAPH_API_VERSION: 'v21.0',
  GEMINI_MODEL: 'gemini-3.5-flash-lite',
  GEMINI_TIMEOUT_MS: '10000',
  MAX_IMAGE_SIZE_BYTES: '10000000',
  AI_RATE_LIMIT_PER_USER: '10',
  AI_RATE_LIMIT_WINDOW_SECONDS: '3600',
  AI_TEXT_FALLBACK_ENABLED: 'true',
  AI_TEXT_FALLBACK_TIMEOUT_MS: '10000',
  AI_TEXT_FALLBACK_PROVIDER_ORDER: 'groq,openrouter,cloudflare,mistral,nvidia,zai,requesty,cohere',
  AI_TEXT_FALLBACK_MODELS_JSON: '{}',
  AI_ALLOW_TRIAL_PROVIDERS: 'false',
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
  'INTERNAL_SERVICE_KEY',
];

/**
 * Development-only fallbacks. Used so `npm run dev` works on a fresh clone
 * without ceremony. Refused entirely when NODE_ENV=production.
 */
const devSecretFallbacks: Record<string, string> = {
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
  INTERNAL_SERVICE_KEY: 'dev_internal_service_key_not_configured',
};

/**
 * Strictly validates CORS_ALLOWED_ORIGINS for production deployments.
 * Rejects empty lists, wildcards ('*'), non-HTTPS origins, loopback/localhost
 * hosts, and URLs containing paths, query parameters, fragments, or credentials.
 */
export function validateProductionCorsOrigins(raw: string): string[] {
  const origins = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (origins.length === 0) {
    throw new Error(
      '[FATAL] CORS_ALLOWED_ORIGINS must explicitly list at least one HTTPS origin in production.'
    );
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('[FATAL] CORS_ALLOWED_ORIGINS cannot contain "*" in production.');
    }

    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`[FATAL] CORS_ALLOWED_ORIGINS entry "${origin}" is not a valid URL origin.`);
    }

    if (parsed.origin !== origin || parsed.username || parsed.password) {
      throw new Error(
        `[FATAL] CORS_ALLOWED_ORIGINS entry "${origin}" must be a bare scheme://host[:port] origin without path, query, fragment, or credentials.`
      );
    }

    if (parsed.protocol !== 'https:') {
      throw new Error(
        `[FATAL] CORS_ALLOWED_ORIGINS entry "${origin}" must use https:// in production.`
      );
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]'
    ) {
      throw new Error(
        `[FATAL] CORS_ALLOWED_ORIGINS entry "${origin}" cannot target a loopback or localhost address in production.`
      );
    }
  }

  return origins;
}

function validateEnv(): EnvConfig {
  const isProd = process.env.NODE_ENV === 'production';

  const getVar = (key: string): string => {
    const fromEnv = process.env[key];
    if (fromEnv !== undefined && fromEnv.trim() !== '') {
      if (!isProd && looksLikePlaceholder(fromEnv)) {
        return devSecretFallbacks[key] ?? defaults[key] ?? fromEnv;
      }
      return fromEnv;
    }
    const devFallback = devSecretFallbacks[key];
    if (devFallback) return devFallback;
    return defaults[key] ?? '';
  };

  const getSecret = (key: string): string => {
    const value = getVar(key);
    if (isProd) {
      if (value.trim() === '') {
        throw new Error(
          `[FATAL] ${key} must be explicitly set in production. Refusing to start with an empty secret.`
        );
      }
      if (looksLikePlaceholder(value)) {
        throw new Error(
          `[FATAL] ${key} still holds a placeholder/test value. Set a real secret before starting in production.`
        );
      }
    }
    return value;
  };

  const getOptionalSecret = (key: string): string => {
    const raw = process.env[key];
    if (!raw || raw.trim() === '' || looksLikePlaceholder(raw)) return '';
    return raw.trim();
  };

  if (isProd) {
    const missing: string[] = [];
    for (const key of requiredSecretsInProd) {
      const value = process.env[key];
      if (!value || value.trim() === '') missing.push(key);
    }
    if (missing.length > 0) {
      const message =
        `Missing required production environment variable(s): ${missing.join(', ')}. ` +
        `Generate secrets with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
      console.error(`[FATAL] ${message}`);
      throw new Error(message);
    }
  }

  const parseIntVar = (key: string): number => {
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
    throw new Error(
      '[FATAL] SUPER_ADMIN_PASSWORD_HASH must be set in production. ' +
        'Generate one with: npm run admin:hash-password -- "<your password>"'
    );
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
    AI_TEXT_FALLBACK_ENABLED: getVar('AI_TEXT_FALLBACK_ENABLED') === 'true',
    AI_TEXT_FALLBACK_TIMEOUT_MS: parseIntVar('AI_TEXT_FALLBACK_TIMEOUT_MS'),
    AI_TEXT_FALLBACK_PROVIDER_ORDER: getVar('AI_TEXT_FALLBACK_PROVIDER_ORDER'),
    AI_TEXT_FALLBACK_MODELS_JSON: getVar('AI_TEXT_FALLBACK_MODELS_JSON'),
    AI_ALLOW_TRIAL_PROVIDERS: getVar('AI_ALLOW_TRIAL_PROVIDERS') === 'true',
    GROQ_API_KEY: getOptionalSecret('GROQ_API_KEY'),
    OPENROUTER_API_KEY: getOptionalSecret('OPENROUTER_API_KEY'),
    CLOUDFLARE_ACCOUNT_ID: getOptionalSecret('CLOUDFLARE_ACCOUNT_ID'),
    CLOUDFLARE_API_TOKEN: getOptionalSecret('CLOUDFLARE_API_TOKEN'),
    MISTRAL_API_KEY: getOptionalSecret('MISTRAL_API_KEY'),
    COHERE_API_KEY: getOptionalSecret('COHERE_API_KEY'),
    NVIDIA_API_KEY: getOptionalSecret('NVIDIA_API_KEY'),
    ZAI_API_KEY: getOptionalSecret('ZAI_API_KEY'),
    REQUESTY_API_KEY: getOptionalSecret('REQUESTY_API_KEY'),

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

    // Email URLs
    APP_URL: getVar('APP_URL'),
    CONTROL_CENTER_URL: getVar('CONTROL_CENTER_URL'),

    // Internal Service Key
    INTERNAL_SERVICE_KEY: getSecret('INTERNAL_SERVICE_KEY'),
  };
}

/**
 * Constant-time verification for internal service credentials.
 */
export function verifyInternalServiceKey(providedKey: unknown): boolean {
  if (typeof providedKey !== 'string' || !providedKey.trim()) return false;
  const runtimeKey = process.env.INTERNAL_SERVICE_KEY;
  const configured = runtimeKey && runtimeKey.trim().length > 0 ? runtimeKey : env?.INTERNAL_SERVICE_KEY;
  if (!configured || configured.trim().length === 0) return false;
  if (process.env.NODE_ENV === 'production' && looksLikePlaceholder(configured)) {
    return false;
  }
  const providedBuf = Buffer.from(providedKey.trim());
  const configuredBuf = Buffer.from(configured.trim());
  if (providedBuf.length !== configuredBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, configuredBuf);
}

/**
 * Derives a scrypt password hash in the format consumed by `verifyPassword`.
 * Exposed so the CLI helper and tests share exactly one implementation.
 *
 * Format: scrypt$<saltHex>$<hashHex>
 */
export function hashPassword(password: string, saltHex?: string): string {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const derived = crypto.scryptSync(password.normalize('NFKC'), salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Constant-time password verification. Returns false (never throws) on any
 * malformed input so a corrupt stored hash cannot become an auth bypass.
 */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (expected.length === 0) return false;
    const actual = crypto.scryptSync(password.normalize('NFKC'), salt, expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export const env: EnvConfig = validateEnv();
