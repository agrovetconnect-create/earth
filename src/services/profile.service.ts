import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { nowIso } from '../utils/time.js';

export interface UserProfile {
  id: string; // references auth.users(id) or users(id)
  email: string;
  google_display_name: string | null;
  google_avatar_url: string | null;
  display_name: string;
  avatar_url: string | null;
  avatar_source: 'google' | 'uploaded';
  name_source: 'google' | 'custom';
  email_verified_at?: string | null;
  last_successful_login_at?: string | null;
  last_successful_activity_at?: string | null;
  last_step_up_verification_at?: string | null;
  profile_updated_at: string;
  created_at: string;
  updated_at: string;
}

const memoryProfiles = new Map<string, UserProfile>();

export class ProfileService {
  private profilesTableUnavailable = false;

  private isTableUnavailableError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();
    return (
      lower.includes('profiles') ||
      lower.includes('relation') ||
      lower.includes('does not exist') ||
      lower.includes('schema cache') ||
      lower.includes('could not find the table')
    );
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    if (!userId) return null;

    if (isDatabaseConfigured() && !this.profilesTableUnavailable) {
      try {
        const { data, error } = await (supabase.from('profiles') as any)
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (error) throw new Error(error.message);
        return (data as UserProfile) ?? null;
      } catch (err) {
        if (this.isTableUnavailableError(err)) {
          this.profilesTableUnavailable = true;
        } else {
          logger.error('Error fetching user profile from database', { userId, error: String(err) });
        }
        // Fall back to memory cache if present
      }
    }

    return memoryProfiles.get(userId) ?? null;
  }

  async getProfileByEmail(email: string): Promise<UserProfile | null> {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) return null;

    if (isDatabaseConfigured() && !this.profilesTableUnavailable) {
      try {
        const { data, error } = await (supabase.from('profiles') as any)
          .select('*')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (error) throw new Error(error.message);
        return (data as UserProfile) ?? null;
      } catch (err) {
        if (this.isTableUnavailableError(err)) {
          this.profilesTableUnavailable = true;
        } else {
          logger.error('Error fetching user profile by email', { email: cleanEmail, error: String(err) });
        }
      }
    }

    for (const p of memoryProfiles.values()) {
      if (p.email.toLowerCase() === cleanEmail) {
        return p;
      }
    }
    return null;
  }

  async syncGoogleProfile(
    userId: string,
    googleData: {
      email: string;
      displayName?: string | null;
      avatarUrl?: string | null;
    }
  ): Promise<UserProfile> {
    const cleanEmail = googleData.email.trim().toLowerCase();
    const gName = googleData.displayName?.trim() || cleanEmail.split('@')[0] || 'Earth Talk Contributor';
    const gAvatar = googleData.avatarUrl?.trim() || null;
    const now = nowIso();

    const existing = await this.getProfile(userId) || await this.getProfileByEmail(cleanEmail);

    if (existing) {
      // PRESERVATION RULE: Never overwrite a display_name or avatar that the user customized!
      const updatedDisplayName =
        existing.name_source === 'custom' && existing.display_name
          ? existing.display_name
          : (gName || existing.display_name);

      const updatedAvatar =
        existing.avatar_source === 'uploaded' && existing.avatar_url
          ? existing.avatar_url
          : (gAvatar || existing.avatar_url);

      const updatedSourceAvatar = existing.avatar_source === 'uploaded' ? 'uploaded' : 'google';

      const merged: UserProfile = {
        ...existing,
        id: userId,
        email: cleanEmail,
        google_display_name: gName || existing.google_display_name,
        google_avatar_url: gAvatar || existing.google_avatar_url,
        display_name: updatedDisplayName,
        avatar_url: updatedAvatar,
        avatar_source: updatedSourceAvatar,
        updated_at: now,
      };

      if (isDatabaseConfigured() && !this.profilesTableUnavailable) {
        try {
          const { error } = await (supabase.from('profiles') as any).upsert(merged);
          if (error) throw new Error(error.message);
        } catch (err) {
          if (this.isTableUnavailableError(err)) {
            this.profilesTableUnavailable = true;
          } else {
            logger.error('Failed to sync profile to database', { error: String(err) });
          }
        }
      }

      memoryProfiles.set(userId, merged);
      return merged;
    }

    // New profile creation
    const newProfile: UserProfile = {
      id: userId,
      email: cleanEmail,
      google_display_name: gName,
      google_avatar_url: gAvatar,
      display_name: gName,
      avatar_url: gAvatar,
      avatar_source: 'google',
      name_source: 'google',
      profile_updated_at: now,
      created_at: now,
      updated_at: now,
    };

    if (isDatabaseConfigured() && !this.profilesTableUnavailable) {
      try {
        const { error } = await (supabase.from('profiles') as any).upsert(newProfile);
        if (error) throw new Error(error.message);
      } catch (err) {
        if (this.isTableUnavailableError(err)) {
          this.profilesTableUnavailable = true;
        } else {
          logger.error('Failed to create new profile in database', { error: String(err) });
        }
      }
    }

    memoryProfiles.set(userId, newProfile);
    return newProfile;
  }

  async updateDisplayName(userId: string, newDisplayName: string): Promise<UserProfile> {
    const clean = newDisplayName.trim().slice(0, 60);
    if (!clean) throw new Error('Display name cannot be empty.');
    const now = nowIso();

    const existing = await this.getProfile(userId);
    const updated: UserProfile = existing
      ? {
          ...existing,
          display_name: clean,
          name_source: 'custom',
          profile_updated_at: now,
          updated_at: now,
        }
      : {
          id: userId,
          email: '',
          google_display_name: null,
          google_avatar_url: null,
          display_name: clean,
          avatar_url: null,
          avatar_source: 'google',
          name_source: 'custom',
          profile_updated_at: now,
          created_at: now,
          updated_at: now,
        };

    if (isDatabaseConfigured() && !this.profilesTableUnavailable) {
      try {
        const { error } = await (supabase.from('profiles') as any).upsert(updated);
        if (error) throw new Error(error.message);
      } catch (err) {
        if (this.isTableUnavailableError(err)) {
          this.profilesTableUnavailable = true;
        } else {
          logger.error('Failed to update display name in database', { error: String(err) });
          throw new ServiceUnavailableError('profile update', err);
        }
      }
    }

    memoryProfiles.set(userId, updated);
    return updated;
  }

  async setCustomAvatar(userId: string, avatarUrl: string): Promise<UserProfile> {
    const cleanUrl = avatarUrl.trim();
    const now = nowIso();

    const existing = await this.getProfile(userId);
    const updated: UserProfile = existing
      ? {
          ...existing,
          avatar_url: cleanUrl,
          avatar_source: 'uploaded',
          profile_updated_at: now,
          updated_at: now,
        }
      : {
          id: userId,
          email: '',
          google_display_name: null,
          google_avatar_url: null,
          display_name: 'Earth Talk Contributor',
          avatar_url: cleanUrl,
          avatar_source: 'uploaded',
          name_source: 'google',
          profile_updated_at: now,
          created_at: now,
          updated_at: now,
        };

    if (isDatabaseConfigured() && !this.profilesTableUnavailable) {
      try {
        const { error } = await (supabase.from('profiles') as any).upsert(updated);
        if (error) throw new Error(error.message);
      } catch (err) {
        if (this.isTableUnavailableError(err)) {
          this.profilesTableUnavailable = true;
        } else {
          logger.error('Failed to save avatar to database', { error: String(err) });
          throw new ServiceUnavailableError('avatar update', err);
        }
      }
    }

    memoryProfiles.set(userId, updated);
    return updated;
  }

  async restoreGoogleAvatar(userId: string): Promise<UserProfile> {
    const now = nowIso();
    const existing = await this.getProfile(userId);
    if (!existing) {
      throw new Error('Profile not found.');
    }

    const restored: UserProfile = {
      ...existing,
      avatar_url: existing.google_avatar_url,
      avatar_source: 'google',
      profile_updated_at: now,
      updated_at: now,
    };

    if (isDatabaseConfigured() && !this.profilesTableUnavailable) {
      try {
        const { error } = await (supabase.from('profiles') as any).upsert(restored);
        if (error) throw new Error(error.message);
      } catch (err) {
        if (this.isTableUnavailableError(err)) {
          this.profilesTableUnavailable = true;
        } else {
          logger.error('Failed to restore Google avatar in database', { error: String(err) });
          throw new ServiceUnavailableError('restore google avatar', err);
        }
      }
    }

    memoryProfiles.set(userId, restored);
    return restored;
  }

  async updateVerificationTimestamps(
    userId: string,
    options: { markVerified?: boolean; markLogin?: boolean; markActivity?: boolean; markStepUp?: boolean }
  ): Promise<UserProfile | null> {
    const existing = await this.getProfile(userId);
    if (!existing) return null;

    const now = nowIso();
    const updated: UserProfile = {
      ...existing,
      ...(options.markVerified ? { email_verified_at: existing.email_verified_at || now } : {}),
      ...(options.markLogin ? { last_successful_login_at: now } : {}),
      ...(options.markActivity ? { last_successful_activity_at: now } : {}),
      ...(options.markStepUp ? { last_step_up_verification_at: now } : {}),
      updated_at: now,
    };

    if (isDatabaseConfigured()) {
      try {
        const { error } = await (supabase.from('profiles') as any).upsert(updated);
        if (error) throw new Error(error.message);
      } catch (err) {
        logger.error('Failed to update profile verification timestamps in database', { error: String(err) });
      }
    }

    memoryProfiles.set(userId, updated);
    return updated;
  }
}

export const profileService = new ProfileService();
