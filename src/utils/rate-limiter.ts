import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { isDatabaseConfigured } from './admin-auth.js';
import { logger } from './logger.js';

interface RateLimitRecord {
  timestamps: number[];
}

export class RateLimiter {
  private readonly limits = new Map<string, RateLimitRecord>();
  private readonly processedMessageIds = new Map<string, number>();

  /**
   * Checks whether the user has exceeded their AI analysis rate limit.
   * If not exceeded, records the current request.
   */
  isRateLimited(userId: string): boolean {
    const now = Date.now();
    const windowMs = env.AI_RATE_LIMIT_WINDOW_SECONDS * 1000;
    const maxRequests = env.AI_RATE_LIMIT_PER_USER;

    const record = this.limits.get(userId) || { timestamps: [] };

    // Filter out timestamps outside the active rolling window
    record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

    if (record.timestamps.length >= maxRequests) {
      return true;
    }

    record.timestamps.push(now);
    this.limits.set(userId, record);
    return false;
  }

  /**
   * Checks whether a message ID has already been processed (Deduplication).
   * Returns true if already processed, otherwise marks it as processed and returns false.
   */
  isDuplicate(messageId: string): boolean {
    const now = Date.now();
    const ttlMs = 24 * 60 * 60 * 1000; // 24 hours TTL

    // Clean up expired message IDs occasionally
    if (this.processedMessageIds.size > 2000) {
      for (const [id, timestamp] of this.processedMessageIds.entries()) {
        if (now - timestamp > ttlMs) {
          this.processedMessageIds.delete(id);
        }
      }
    }

    if (this.processedMessageIds.has(messageId)) {
      return true;
    }

    this.processedMessageIds.set(messageId, now);
    return false;
  }

  /**
   * Message sent when rate limit is exceeded.
   */
  getRateLimitMessage(): string {
    return '🪨 You have reached the current Earth Talk testing limit.\n\nPlease try again later.';
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Generic fixed-window rate limiter shared by the admin, community and export
 * surfaces. Keys are explicit (for example `community_vote:<ip>`), so the
 * caller is responsible for scoping the window to the actor it intends.
 *
 * Returns true when the request is allowed. The window resets on first use.
 */
const genericWindows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = genericWindows.get(key);

  if (!entry || entry.resetAt < now) {
    genericWindows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

/**
 * Drops expired windows. Called opportunistically so the map cannot grow
 * without bound on a long-running process.
 */
export function pruneRateLimitWindows(windowMs = 60_000): void {
  const now = Date.now();
  for (const [key, entry] of genericWindows.entries()) {
    if (entry.resetAt + windowMs < now) {
      genericWindows.delete(key);
    }
  }
}

const rpcStatus = new Map<string, boolean>();

function isMissingRpcError(error: any): boolean {
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    msg.includes('could not find the function') ||
    msg.includes('schema cache') ||
    msg.includes('check_distributed_rate_limit') ||
    msg.includes('cleanup_expired_rate_limit_buckets')
  );
}

/**
 * Distributed rate limiter backed by PostgreSQL RPC `check_distributed_rate_limit`.
 * Falls back safely to in-memory genericWindows when database is unconfigured.
 */
export async function checkDistributedRateLimit(
  key: string,
  maxRequests: number,
  windowMs = 60_000
): Promise<boolean> {
  if (!isDatabaseConfigured() || rpcStatus.get('check_distributed_rate_limit') === false) {
    return checkRateLimit(key, maxRequests, windowMs);
  }

  try {
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
    const { data, error } = await (supabase as any).rpc('check_distributed_rate_limit', {
      p_key: key,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      if (isMissingRpcError(error)) {
        if (rpcStatus.get('check_distributed_rate_limit') !== false) {
          logger.info('Distributed rate limit RPC not found; falling back to in-memory limiter', {
            error: error.message || error,
          });
          rpcStatus.set('check_distributed_rate_limit', false);
        }
      } else {
        logger.warn('Distributed rate limit check RPC failed; falling back to in-memory limiter', {
          key,
          error: error.message || error,
        });
      }
      return checkRateLimit(key, maxRequests, windowMs);
    }

    rpcStatus.set('check_distributed_rate_limit', true);
    return Boolean(data);
  } catch (err) {
    if (isMissingRpcError(err)) {
      rpcStatus.set('check_distributed_rate_limit', false);
    } else {
      logger.warn('Distributed rate limit exception; falling back to in-memory limiter', {
        key,
        error: String(err),
      });
    }
    return checkRateLimit(key, maxRequests, windowMs);
  }
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Purges expired in-memory rate-limit windows and invokes PostgreSQL
 * `cleanup_expired_rate_limit_buckets` when Supabase is configured.
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  pruneRateLimitWindows();
  if (!isDatabaseConfigured() || rpcStatus.get('cleanup_expired_rate_limit_buckets') === false) {
    return 0;
  }

  try {
    const { data, error } = await (supabase as any).rpc('cleanup_expired_rate_limit_buckets');
    if (error) {
      if (isMissingRpcError(error)) {
        if (rpcStatus.get('cleanup_expired_rate_limit_buckets') !== false) {
          logger.info('Rate-limit bucket cleanup RPC not found; skipping database cleanup', {
            error: error.message || error,
          });
          rpcStatus.set('cleanup_expired_rate_limit_buckets', false);
        }
      } else {
        logger.warn('Rate-limit bucket cleanup RPC failed', { error: error.message || error });
      }
      return 0;
    }
    rpcStatus.set('cleanup_expired_rate_limit_buckets', true);
    return typeof data === 'number' ? data : 0;
  } catch (err) {
    if (isMissingRpcError(err)) {
      rpcStatus.set('cleanup_expired_rate_limit_buckets', false);
    } else {
      logger.warn('Rate-limit bucket cleanup threw error', { error: String(err) });
    }
    return 0;
  }
}

export function startRateLimitCleanupTimer(intervalMs = 5 * 60_000): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    void cleanupExpiredRateLimits();
  }, intervalMs);
  if (typeof cleanupTimer === 'object' && cleanupTimer && 'unref' in cleanupTimer) {
    (cleanupTimer as { unref: () => void }).unref();
  }
}

export function stopRateLimitCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}


