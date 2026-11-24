import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
import type { Database } from '../types/database.types.js';

const REQUEST_TIMEOUT_MS = 3_000;

async function fetchWithDeadline(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const externalSignal = init?.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

let supabaseUrl = env.SUPABASE_URL;
let supabaseKey = env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseUrl.startsWith('http') || supabaseUrl.includes('REQUIRED')) {
  supabaseUrl = 'https://mock-project-id.supabase.co';
}
if (!supabaseKey || supabaseKey.includes('REQUIRED')) {
  supabaseKey = 'dev_supabase_key_not_configured';
}

/**
 * Singleton server-side Supabase client with service privileges.
 * Used exclusively on the backend; never exposed to clients or user devices.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseKey,
  {
    accessToken: async () => supabaseKey,
    global: { fetch: fetchWithDeadline },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

/**
 * Separate client for Supabase Auth calls. `verifyOtp` and
 * `exchangeCodeForSession` keep a session in the client, which would replace
 * the service key on every database request if the privileged client were used.
 */
export const supabaseAuth: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseKey,
  {
    global: { fetch: fetchWithDeadline },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);
