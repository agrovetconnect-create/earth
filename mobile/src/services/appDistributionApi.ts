import { requestJson } from './http';

/**
 * Public app-distribution configuration. The sidebar shows the "Get app" and
 * WhatsApp entries only when the deployment advertises them. Fails silently.
 */

export interface AppDistributionPublicConfig {
  whatsapp?: { enabled: boolean; number: string | null; message?: string | null };
  appDownload?: { enabled: boolean; url: string | null } | null;
}

export async function getPublicConfig(): Promise<AppDistributionPublicConfig | null> {
  try {
    return await requestJson<AppDistributionPublicConfig>('/api/app-distribution/config');
  } catch {
    return null;
  }
}
