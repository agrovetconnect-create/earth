import { ensureCsrfToken } from './http.js';

export type DistributionMode = 'apk' | 'play_store' | 'both';

export interface AppDistributionData {
  mode: DistributionMode;
  is_play_store_active: boolean;
  is_get_app_sidebar_visible: boolean;
  is_whatsapp_sidebar_visible: boolean;
  whatsapp_number: string;
  play_store_url: string;
  version_name: string;
  version_code: number;
  package_name: string;
  min_android: string;
  apk_filename: string;
  apk_size_bytes: number;
  apk_size_mb: number;
  apk_sha256: string;
  apk_available: boolean;
  release_notes: string;
  download_count: number;
  download_url: string;
  updated_at: string;
  updated_by: string;
}

export const appDistributionApi = {
  /**
   * Fetch current public distribution configuration and status.
   */
  getPublicConfig: async (): Promise<AppDistributionData> => {
    const res = await fetch('/api/app-distribution', { credentials: 'include' });
    if (!res.ok) {
      throw new Error('Failed to fetch app distribution settings');
    }
    return res.json();
  },

  /**
   * Initiate direct browser download of the APK file.
   */
  triggerDirectDownload: (filename = 'earthtalk.apk') => {
    const link = document.createElement('a');
    link.href = '/api/app-distribution/download';
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  /**
   * Update distribution configuration (Admin/Staff only).
   */
  updateConfig: async (updates: Partial<AppDistributionData>): Promise<{ success: boolean; config: AppDistributionData }> => {
    const csrf = await ensureCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    };

    const res = await fetch('/api/control/app-distribution/config', {
      method: 'PUT',
      credentials: 'include',
      headers,
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Update failed' }));
      const message = typeof err?.error === 'string' ? err.error : err?.error?.message;
      throw new Error(message || 'Failed to update distribution configuration');
    }

    return res.json();
  },

  /**
   * Upload compiled APK binary file with metadata (Admin/Staff only).
   */
  uploadApk: async (formData: FormData): Promise<{ success: boolean; message: string; config: AppDistributionData }> => {
    const csrf = await ensureCsrfToken();
    const headers: Record<string, string> = {
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    };

    const res = await fetch('/api/control/app-distribution/upload', {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      const message = typeof err?.error === 'string' ? err.error : err?.error?.message;
      throw new Error(message || 'Failed to upload APK');
    }

    return res.json();
  },
};
