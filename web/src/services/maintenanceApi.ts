import { requestJson } from './http.js';

export interface MaintenanceModeSettings {
  enabled: boolean;
  message: string;
  template: 'scheduled' | 'upgrade' | 'incident' | 'custom';
  updated_at: string | null;
}

export async function fetchMaintenanceMode(): Promise<MaintenanceModeSettings> {
  return requestJson<MaintenanceModeSettings>('/api/system/maintenance', {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
}
