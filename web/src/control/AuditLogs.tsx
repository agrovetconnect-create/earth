import React, { useEffect, useState } from 'react';
import { controlApi } from '../services/controlApi.js';
import {
  History,
  Shield,
  User,
  Database,
  AlertCircle,
  Terminal,
  RefreshCw,
  Search,
} from 'lucide-react';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const loadLogs = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const data = await controlApi.getAuditLogs();
      setLogs(data.logs || []);
    } catch (err) {
      console.warn('Failed to load audit logs:', err instanceof Error ? err.message : err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    const action = (log.action || '').toLowerCase();
    const staff = (log.staff?.full_name || log.staff?.email || '').toLowerCase();
    const targetType = (log.target_type || '').toLowerCase();
    const targetId = (log.target_id || '').toLowerCase();
    return action.includes(q) || staff.includes(q) || targetType.includes(q) || targetId.includes(q);
  });

  if (loading && logs.length === 0) {
    return (
      <div className="py-20 text-center text-[#5e5e5e] text-sm animate-pulse">
        Retrieving system audit trail...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1f1f1f]">System Audit Logs</h2>
          <p className="text-sm text-[#5e5e5e]">
            Comprehensive append-only record of administrative operations, CMS edits, and authentication events.
          </p>
        </div>
        <button
          onClick={() => loadLogs(true)}
          disabled={refreshing}
          className="g-btn g-btn-outlined text-xs h-9 px-4 rounded-full flex items-center gap-2 text-[#0b57d0] border-[#dadce0] hover:bg-[#e8f0fe] cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh Logs'}</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex items-center gap-3 bg-white border border-[#dadce0] rounded-xl px-4 py-2 shadow-2xs">
        <Search className="w-4 h-4 text-[#8f8f8f] shrink-0" />
        <input
          type="search"
          placeholder="Filter audit logs by staff member, action, or target ID..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          className="w-full text-sm outline-none bg-transparent text-[#1f1f1f] placeholder:text-[#8f8f8f]"
        />
        {searchFilter && (
          <button
            onClick={() => setSearchFilter('')}
            className="text-xs text-[#5e5e5e] hover:text-[#1f1f1f] cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>

      {/* Logs Table / Feed */}
      <div className="bg-white border border-[#dadce0] rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 bg-[#f8fafd] border-b border-[#dadce0] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#5e5e5e] uppercase tracking-wider">
            <Terminal className="w-4 h-4 text-[#0b57d0]" />
            <span>Activity Events ({filteredLogs.length})</span>
          </div>
          <span className="text-xs text-[#8f8f8f]">Immutable audit ledger</span>
        </div>

        <div className="divide-y divide-[#f0f4f9]">
          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-[#8e8e8e] text-sm">
              {searchFilter ? 'No audit events match your filter query.' : 'No audit records found.'}
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="p-4 sm:p-5 hover:bg-[#f8fafd] transition-colors flex items-start gap-4">
                <div className="w-9 h-9 rounded-full bg-[#f0f4f9] flex items-center justify-center shrink-0 mt-0.5">
                  {getActionIcon(log.action)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                    <div className="text-sm font-medium text-[#1f1f1f]">
                      <span className="text-[#0b57d0] font-semibold">
                        {log.staff?.full_name || log.staff?.email || 'System'}
                      </span>{' '}
                      <span className="text-[#444746]">{formatAction(log.action)}</span>
                    </div>
                    <div className="text-xs font-mono tabular-nums text-[#8f8f8f]">
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#5e5e5e] mt-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#f0f4f9] text-[#444746] font-mono text-[11px]">
                      {log.target_type}: {log.target_id ? log.target_id.slice(0, 10) : 'N/A'}
                    </span>
                    {log.ip_hash && (
                      <span className="text-[11px] text-[#8f8f8f] font-mono">
                        Hash: {log.ip_hash}
                      </span>
                    )}
                  </div>

                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div className="mt-2.5 p-2.5 bg-[#f8fafd] border border-[#e3e3e3] rounded-lg text-xs font-mono text-[#5e5e5e] overflow-x-auto g-scroll">
                      {JSON.stringify(log.metadata, null, 2)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

function getActionIcon(action: string) {
  if (action.includes('login')) return <Shield className="w-4 h-4 text-[#137333]" />;
  if (action.includes('create')) return <User className="w-4 h-4 text-[#0b57d0]" />;
  if (action.includes('update') || action.includes('cms')) return <Database className="w-4 h-4 text-[#ea8600]" />;
  if (action.includes('delete')) return <AlertCircle className="w-4 h-4 text-[#c5221f]" />;
  return <History className="w-4 h-4 text-[#5e5e5e]" />;
}

function formatAction(action: string) {
  return action.replace(/\./g, ' › ').replace(/_/g, ' ');
}
