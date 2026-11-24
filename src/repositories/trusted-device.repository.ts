import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { logger } from '../utils/logger.js';
import { nowIso } from '../utils/time.js';

const memoryTrustedDevices = new Map<string, Set<string>>();

export class TrustedDeviceRepository {
  async hasAnyTrustedDevice(userId: string): Promise<boolean> {
    if (!userId) return false;
    if (isDatabaseConfigured()) {
      try {
        const { count, error } = await (supabase.from('user_trusted_devices') as any)
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        if (!error) return (count ?? 0) > 0;
      } catch (err) {
        logger.warn('Failed to query trusted devices count', { userId, error: String(err) });
      }
    }
    const local = memoryTrustedDevices.get(userId);
    return Boolean(local && local.size > 0);
  }

  async isDeviceTrusted(userId: string, fingerprint: string): Promise<boolean> {
    if (!userId || !fingerprint) return false;
    if (isDatabaseConfigured()) {
      try {
        const { data, error } = await (supabase.from('user_trusted_devices') as any)
          .select('id')
          .eq('user_id', userId)
          .eq('device_fingerprint', fingerprint)
          .maybeSingle();
        if (!error && data) return true;
      } catch (err) {
        logger.warn('Failed to check trusted device fingerprint', { userId, error: String(err) });
      }
    }
    return Boolean(memoryTrustedDevices.get(userId)?.has(fingerprint));
  }

  async registerTrustedDevice(userId: string, fingerprint: string): Promise<void> {
    if (!userId || !fingerprint) return;
    let set = memoryTrustedDevices.get(userId);
    if (!set) {
      set = new Set<string>();
      memoryTrustedDevices.set(userId, set);
    }
    set.add(fingerprint);

    if (isDatabaseConfigured()) {
      try {
        const now = nowIso();
        const { error } = await (supabase.from('user_trusted_devices') as any).upsert(
          {
            user_id: userId,
            device_fingerprint: fingerprint,
            last_seen_at: now,
          },
          { onConflict: 'user_id,device_fingerprint' }
        );
        if (error) {
          logger.warn('Failed to persist trusted device fingerprint', { userId, error: error.message });
        }
      } catch (err) {
        logger.warn('Error persisting trusted device fingerprint', { userId, error: String(err) });
      }
    }
  }
}

export const trustedDeviceRepository = new TrustedDeviceRepository();
