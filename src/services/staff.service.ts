import crypto from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { env, hashPassword } from '../config/env.js';
import { isDatabaseConfigured, type StaffRole } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { logger } from '../utils/logger.js';
import { shortHash } from '../utils/hash.js';

export class StaffService {
  private ensureDatabaseForWrite(operation: string): void {
    if (!isDatabaseConfigured()) {
      throw new ServiceUnavailableError(
        `staff ${operation}`,
        undefined,
        `Staff ${operation} requires a configured Supabase database.`
      );
    }
  }

  /**
   * Lists all staff members. (Owner only)
   */
  async listStaff() {
    if (!isDatabaseConfigured()) {
      if (env.IS_PRODUCTION) {
        throw new ServiceUnavailableError('staff list');
      }
      return [];
    }

    const { data, error } = await (supabase.from('staff') as any)
      .select('id, email, role, full_name, is_active, created_at, last_login_at')
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error listing staff', { error: error.message });
      throw new ServiceUnavailableError('staff list', error);
    }
    return data ?? [];
  }

  /**
   * Creates a new staff member. (Owner only)
   */
  async createStaff(
    input: {
      email: string;
      password?: string;
      role: StaffRole;
      full_name: string;
    },
    actor?: {
      staffId?: string;
      role?: string;
      ipHash?: string;
    }
  ) {
    this.ensureDatabaseForWrite('create');
    const password = input.password || crypto.randomBytes(8).toString('hex');
    const passwordHash = hashPassword(password);
    const cleanEmail = input.email.trim().toLowerCase();

    // Atomic transactional RPC ensuring staff mutation + audit log in single DB transaction
    const { data, error } = await (supabase as any).rpc('create_staff_transactional', {
      p_email: cleanEmail,
      p_password_hash: passwordHash,
      p_role: input.role,
      p_full_name: input.full_name,
      p_actor_id: actor?.staffId ?? null,
      p_actor_role: actor?.role ?? 'owner',
      p_ip_hash: actor?.ipHash ?? null,
    });

    if (error) {
      logger.error('Error creating staff transactionally', { error: error.message });
      if (/duplicate|unique/i.test(error.message)) {
        throw new Error('A staff account with that email already exists.');
      }
      throw new ServiceUnavailableError('staff create transactional', error);
    }

    return { staff: data, temporaryPassword: input.password ? undefined : password };
  }

  /**
   * Updates staff details or role.
   */
  async updateStaff(
    id: string,
    updates: {
      role?: StaffRole;
      is_active?: boolean;
      full_name?: string;
      password?: string;
    },
    actor?: {
      staffId?: string;
      role?: string;
      ipHash?: string;
    }
  ) {
    this.ensureDatabaseForWrite('update');
    const passwordHash = updates.password ? hashPassword(updates.password) : null;

    // Atomic transactional RPC ensuring staff update + audit log in single DB transaction
    const { data, error } = await (supabase as any).rpc('update_staff_transactional', {
      p_staff_id: id,
      p_role: updates.role ?? null,
      p_is_active: updates.is_active ?? null,
      p_full_name: updates.full_name ?? null,
      p_password_hash: passwordHash,
      p_actor_id: actor?.staffId ?? null,
      p_actor_role: actor?.role ?? 'owner',
      p_ip_hash: actor?.ipHash ?? null,
    });

    if (error) {
      logger.error('Error updating staff transactionally', { error: error.message, id });
      throw new ServiceUnavailableError('staff update transactional', error);
    }

    return data;
  }

  /**
   * Fetches real-time operational metrics for the Control Center, excluding demo records.
   */
  async getOperationalMetrics() {
    if (!isDatabaseConfigured()) {
      if (env.IS_PRODUCTION) {
        throw new ServiceUnavailableError('operational metrics');
      }
      return {
        total_users: 0,
        total_observations: 0,
        pending_webhooks: 0,
        system_status: 'database_unconfigured',
        last_updated: new Date().toISOString(),
      };
    }

    const { data, error } = await (supabase.rpc('get_operational_summary') as any);
    if (!error && data) {
      return data;
    }

    const [users, observations, webhooks] = await Promise.all([
      (supabase.from('users') as any)
        .select('id', { count: 'exact', head: true })
        .eq('is_demo', false),
      (supabase.from('observations') as any)
        .select('id', { count: 'exact', head: true })
        .eq('is_demo', false),
      (supabase.from('webhook_jobs') as any)
        .select('id', { count: 'exact', head: true })
        .in('status', ['queued', 'retryable_failure']),
    ]);

    if (users.error || observations.error || webhooks.error) {
      const underlying = users.error ?? observations.error ?? webhooks.error;
      logger.error('Error fetching operational metrics', { error: underlying?.message });
      throw new ServiceUnavailableError('operational metrics', underlying);
    }

    return {
      total_users: users.count || 0,
      total_observations: observations.count || 0,
      pending_webhooks: webhooks.count || 0,
      system_status: 'online',
      last_updated: new Date().toISOString(),
    };
  }

  /**
   * Logs a system audit event.
   */
  async logAudit(event: {
    staff_id?: string;
    action: string;
    target_type: string;
    target_id?: string;
    metadata?: any;
    ip_hash?: string;
  }) {
    if (!isDatabaseConfigured()) return;

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validStaffId = event.staff_id && uuidRe.test(event.staff_id) ? event.staff_id : null;
    const hasNonUuidTarget = Boolean(event.target_id && !uuidRe.test(event.target_id));
    const validTargetId = event.target_id && uuidRe.test(event.target_id) ? event.target_id : null;

    // Never persist raw IPv4/IPv6 addresses in ip_hash
    const normalizedIpHash = event.ip_hash
      ? /^[0-9a-f]{16,64}$/i.test(event.ip_hash)
        ? event.ip_hash
        : shortHash(event.ip_hash)
      : null;

    const mergedMetadata = {
      ...(event.metadata && typeof event.metadata === 'object' ? event.metadata : {}),
      ...(hasNonUuidTarget ? { target_ref: event.target_id } : {}),
    };

    const { error } = await (supabase.from('system_audit_logs') as any).insert({
      staff_id: validStaffId,
      action: event.action,
      target_type: event.target_type,
      target_id: validTargetId,
      metadata: mergedMetadata,
      ip_hash: normalizedIpHash,
    });
    if (error) {
      logger.error('Failed to log system audit', { error: error.message, action: event.action });
      throw new ServiceUnavailableError('system audit logging', error);
    }
  }

  /**
   * Lists system audit logs. (Security/Owner only)
   */
  async listAuditLogs(limit = 100) {
    if (!isDatabaseConfigured()) {
      if (env.IS_PRODUCTION) {
        throw new ServiceUnavailableError('system audit logs');
      }
      return [];
    }

    const { data, error } = await (supabase.from('system_audit_logs') as any)
      .select('*, staff:staff_id(email, full_name)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Error listing system audit logs', { error: error.message });
      throw new ServiceUnavailableError('system audit logs', error);
    }
    return (data ?? []) as any[];
  }

  /**
   * Searches for users. (Support/Owner only)
   */
  async searchUsers(query: string) {
    const cleanQuery = query.trim();
    if (!cleanQuery) return [];

    if (!isDatabaseConfigured()) {
      if (env.IS_PRODUCTION) {
        throw new ServiceUnavailableError('staff user search');
      }
      return [];
    }

    const safeFields = 'id, public_user_id, display_name, email, created_at, is_demo';
    let builder = (supabase.from('users') as any).select(safeFields).eq('is_demo', false);

    if (cleanQuery.includes('@')) {
      builder = builder.ilike('email', `%${cleanQuery}%`);
    } else {
      builder = builder.or(`public_user_id.ilike.%${cleanQuery}%,phone_hash.eq.${cleanQuery}`);
    }

    const { data, error } = await builder.limit(50);
    if (error) {
      logger.error('Error searching users', { error: error.message, query });
      throw new ServiceUnavailableError('staff user search', error);
    }
    return data ?? [];
  }
}

export const staffService = new StaffService();
