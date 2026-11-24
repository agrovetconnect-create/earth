import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { logger } from '../utils/logger.js';
export const MAINTENANCE_TEMPLATES = {
    scheduled: 'Earth Talk is undergoing scheduled maintenance. Please try again shortly.',
    upgrade: 'We are upgrading Earth Talk with new tools. Service will return soon.',
    incident: 'Earth Talk is temporarily unavailable while we resolve a service issue.',
};
const SETTINGS_KEY = 'maintenance_mode';
const DEMO_CONTENT_KEY = 'demo_content_enabled';
const DEMO_CACHE_TTL_MS = 5000;
const memorySettings = new Map();
let demoEnabledCache = env.IS_PRODUCTION ? false : env.DEMO_POSTS_ENABLED;
let demoCacheExpiresAt = 0;
let demoRefreshInFlight = null;
function defaultDemoContent() {
    return {
        enabled: env.IS_PRODUCTION ? false : env.DEMO_POSTS_ENABLED,
        updated_at: null,
    };
}
function toDemoContent(value, updatedAt) {
    const record = value && typeof value === 'object' ? value : {};
    return {
        enabled: Boolean(record.enabled),
        updated_at: updatedAt ?? null,
    };
}
function rememberDemoContent(settings) {
    demoEnabledCache = settings.enabled;
    demoCacheExpiresAt = Date.now() + DEMO_CACHE_TTL_MS;
}
function defaultSettings() {
    return {
        enabled: false,
        message: '',
        template: 'custom',
        updated_at: null,
    };
}
function toSettings(value, updatedAt) {
    const record = value && typeof value === 'object' ? value : {};
    const template = MAINTENANCE_TEMPLATES[record.template]
        ? record.template
        : 'custom';
    return {
        enabled: Boolean(record.enabled),
        message: typeof record.message === 'string' ? record.message : '',
        template,
        updated_at: updatedAt ?? null,
    };
}
export class SystemSettingsService {
    async getMaintenanceMode() {
        if (!isDatabaseConfigured()) {
            if (env.IS_PRODUCTION)
                throw new ServiceUnavailableError('system settings');
            const stored = memorySettings.get(SETTINGS_KEY);
            return stored ? toSettings(stored.value, stored.updated_at) : defaultSettings();
        }
        const { data, error } = await supabase.from('system_settings')
            .select('*')
            .eq('key', SETTINGS_KEY)
            .maybeSingle();
        if (error) {
            const message = error.message || '';
            if (message.includes('system_settings') && message.includes('schema cache')) {
                logger.warn('system_settings table not yet migrated; using disabled maintenance mode');
                return defaultSettings();
            }
            logger.error('Failed to read maintenance mode setting', { error: message });
            throw new ServiceUnavailableError('maintenance mode settings', error);
        }
        return data ? toSettings(data.value, data.updated_at) : defaultSettings();
    }
    async setMaintenanceMode(input, updatedBy) {
        const enabled = Boolean(input.enabled);
        const template = input.template && MAINTENANCE_TEMPLATES[input.template]
            ? input.template
            : 'custom';
        const message = String(input.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
        const resolvedMessage = enabled
            ? template === 'custom'
                ? message
                : MAINTENANCE_TEMPLATES[template]
            : '';
        if (enabled && !resolvedMessage) {
            throw new Error('A maintenance message is required.');
        }
        const value = { enabled, message: resolvedMessage, template };
        const updatedAt = new Date().toISOString();
        if (!isDatabaseConfigured()) {
            if (env.IS_PRODUCTION)
                throw new ServiceUnavailableError('system settings');
            memorySettings.set(SETTINGS_KEY, { value, updated_at: updatedAt });
            return toSettings(value, updatedAt);
        }
        const { error } = await supabase.from('system_settings').upsert({
            key: SETTINGS_KEY,
            value,
            updated_at: updatedAt,
            updated_by: updatedBy,
        }, { onConflict: 'key' });
        if (error) {
            logger.error('Failed to save maintenance mode setting', { error: error.message });
            throw new ServiceUnavailableError('maintenance mode settings', error);
        }
        return toSettings(value, updatedAt);
    }
    async getDemoContent() {
        if (!isDatabaseConfigured()) {
            const stored = memorySettings.get(DEMO_CONTENT_KEY);
            const settings = stored ? toDemoContent(stored.value, stored.updated_at) : defaultDemoContent();
            rememberDemoContent(settings);
            return settings;
        }
        try {
            const { data, error } = await supabase.from('system_settings')
                .select('*')
                .eq('key', DEMO_CONTENT_KEY)
                .maybeSingle();
            if (error) {
                const message = error.message || '';
                if (message.includes('system_settings') && message.includes('schema cache')) {
                    logger.warn('system_settings table not yet migrated; using safe demo-content default');
                    const settings = env.IS_PRODUCTION
                        ? { enabled: false, updated_at: null }
                        : defaultDemoContent();
                    rememberDemoContent(settings);
                    return settings;
                }
                throw error;
            }
            const settings = data ? toDemoContent(data.value, data.updated_at) : defaultDemoContent();
            rememberDemoContent(settings);
            return settings;
        }
        catch (err) {
            logger.error('Failed to read demo-content setting', { error: String(err) });
            const settings = env.IS_PRODUCTION
                ? { enabled: false, updated_at: null }
                : defaultDemoContent();
            rememberDemoContent(settings);
            return settings;
        }
    }
    async setDemoContent(enabled, updatedBy) {
        const value = { enabled: Boolean(enabled) };
        const updatedAt = new Date().toISOString();
        if (!isDatabaseConfigured()) {
            if (env.IS_PRODUCTION)
                throw new ServiceUnavailableError('system settings');
            memorySettings.set(DEMO_CONTENT_KEY, { value, updated_at: updatedAt });
            const settings = toDemoContent(value, updatedAt);
            rememberDemoContent(settings);
            return settings;
        }
        const { error } = await supabase.from('system_settings').upsert({
            key: DEMO_CONTENT_KEY,
            value,
            updated_at: updatedAt,
            updated_by: updatedBy,
        }, { onConflict: 'key' });
        if (error) {
            logger.error('Failed to save demo-content setting', { error: error.message });
            throw new ServiceUnavailableError('demo content settings', error);
        }
        const settings = toDemoContent(value, updatedAt);
        rememberDemoContent(settings);
        return settings;
    }
}
export const systemSettingsService = new SystemSettingsService();
export async function refreshDemoContentCache() {
    await systemSettingsService.getDemoContent();
}
export function demoContentEnabled() {
    if (Date.now() < demoCacheExpiresAt)
        return demoEnabledCache;
    if (!demoRefreshInFlight) {
        demoRefreshInFlight = systemSettingsService
            .getDemoContent()
            .then(() => undefined)
            .catch(() => undefined)
            .finally(() => {
            demoRefreshInFlight = null;
        });
    }
    return demoEnabledCache;
}
