import React, { useEffect, useMemo, useState } from 'react';
import { controlApi } from '../services/controlApi.js';
import {
  Activity,
  Users,
  Database,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  BarChart3,
  BookOpen,
} from 'lucide-react';

export const OperationsOverview: React.FC = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const [metricsResult, auditResult] = await Promise.allSettled([
        controlApi.getMetrics(),
        controlApi.getAuditLogs(500),
      ]);
      if (metricsResult.status === 'fulfilled') {
        setMetrics(metricsResult.value);
        setError(null);
      } else {
        setError(
          metricsResult.reason instanceof Error
            ? metricsResult.reason.message
            : 'Operational metrics are unavailable.'
        );
      }
      if (auditResult.status === 'fulfilled') {
        setAuditLogs(Array.isArray(auditResult.value?.logs) ? auditResult.value.logs : []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(() => loadMetrics(), 30000);
    return () => clearInterval(interval);
  }, []);

  const activity = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - 6 + index);
      return {
        key: date.toISOString().slice(0, 10),
        label: date.toLocaleDateString(undefined, { weekday: 'short' }),
        count: 0,
      };
    });
    for (const log of auditLogs) {
      const timestamp = log?.created_at ? new Date(log.created_at) : null;
      if (!timestamp || Number.isNaN(timestamp.getTime())) continue;
      const day = days.find((entry) => entry.key === timestamp.toISOString().slice(0, 10));
      if (day) day.count += 1;
    }
    return days;
  }, [auditLogs]);

  if (loading && !metrics) {
    return (
      <div className="py-20 text-center text-[#5e5e5e] text-sm animate-pulse">
        Connecting to Earth Talk operational status...
      </div>
    );
  }

  const systemStatus = metrics?.system_status ?? 'unknown';
  const isOnline = systemStatus === 'online';
  const statusUnknown = systemStatus === 'unknown';
  const totalObs = metrics?.total_observations || 0;
  const verifiedCount = metrics?.expert_verified_count || 0;
  const pendingVerification = Math.max(0, totalObs - verifiedCount);
  const aiCount = metrics?.ai_analyses_count || 0;
  const aiProgress = totalObs > 0 ? Math.min(100, (aiCount / totalObs) * 100) : 0;
  const verificationProgress = totalObs > 0 ? (pendingVerification / totalObs) * 100 : 0;
  const lastUpdated = metrics?.last_updated
    ? new Date(metrics.last_updated).toLocaleString()
    : 'Unknown';

  return (
    <div className="space-y-6">
      {/* Title & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1f1f1f]">Operations Overview</h2>
          <p className="text-sm text-[#5e5e5e]">
            Real-time status of Earth Talk platform ingestion, AI verification, and participant activity.
          </p>
          <p className="mt-1 text-[11px] text-[#8f8f8f]">Last metrics update: {lastUpdated}</p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            onClick={() => loadMetrics(true)}
            disabled={refreshing}
            className="g-btn g-btn-outlined text-xs h-9 px-4 rounded-full flex items-center gap-2 text-[#0b57d0] border-[#dadce0] hover:bg-[#e8f0fe] cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Status'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-[#fdd663] bg-[#fef7e0]/60 p-4 text-sm text-[#7a4b00]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Live metrics are temporarily unavailable.</p>
            <p className="mt-0.5 text-xs">
              {error}{' '}
              {metrics
                ? 'The values below are the last known readings.'
                : 'No successful reading yet; values are shown as zero.'}
            </p>
          </div>
        </div>
      )}

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="System Status"
          value={isOnline ? 'Operational' : statusUnknown ? 'Unknown' : 'Degraded'}
          icon={<Globe className={`w-5 h-5 ${isOnline ? 'text-[#137333]' : 'text-[#5e5e5e]'}`} />}
          trend={
            isOnline
              ? 'Live operational metrics'
              : statusUnknown
                ? 'Health probe not instrumented'
                : 'Metrics endpoint reported degraded'
          }
          status={isOnline ? 'normal' : statusUnknown ? 'unknown' : 'warning'}
        />
        <MetricCard
          title="Active Participants"
          value={metrics?.total_users ? Number(metrics.total_users).toLocaleString() : '0'}
          icon={<Users className="w-5 h-5 text-[#0b57d0]" />}
          trend="Unique registered contributors"
          status="normal"
        />
        <MetricCard
          title="Observations"
          value={totalObs ? Number(totalObs).toLocaleString() : '0'}
          icon={<Database className="w-5 h-5 text-[#1a73e8]" />}
          trend={`${verifiedCount.toLocaleString()} expert verified`}
          status="normal"
        />
        <MetricCard
          title="Webhook Queue"
          value={metrics?.pending_webhooks != null ? Number(metrics.pending_webhooks).toLocaleString() : '0'}
          icon={<Activity className="w-5 h-5 text-[#ea8600]" />}
          trend={metrics?.failed_webhooks > 0 ? `${metrics.failed_webhooks} failed deliveries` : 'No failed deliveries reported'}
          status={metrics?.failed_webhooks > 0 ? 'warning' : 'normal'}
        />
      </div>

      {/* Detail Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Processing Throughput */}
        <div className="lg:col-span-2 bg-white border border-[#dadce0] rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-semibold text-[#1f1f1f] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#0b57d0]" />
              <span>Processing Throughput & AI Verification</span>
            </h3>
            <span className="text-xs text-[#5e5e5e]">Live pipeline</span>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-[#5e5e5e] font-medium">AI Analyses Completed</span>
                <span className="font-mono tabular-nums font-bold text-[#1f1f1f]">
                  {metrics?.ai_analyses_count != null ? Number(metrics.ai_analyses_count).toLocaleString() : '0'}
                </span>
              </div>
                <div className="w-full bg-[#f0f4f9] h-2.5 rounded-full overflow-hidden">
                  <div className="bg-[#0b57d0] h-full rounded-full transition-all duration-500" style={{ width: `${aiProgress}%` }} />
                </div>

            </div>

            <div>
              <div className="flex justify-between items-center text-sm mb-2">
                <span className="text-[#5e5e5e] font-medium">Verification Backlog</span>
                <span className="font-mono tabular-nums font-bold text-[#b06000]">
                  {pendingVerification.toLocaleString()} observations
                </span>
              </div>
                <div className="w-full bg-[#f0f4f9] h-2.5 rounded-full overflow-hidden">
                  <div className="bg-[#ea8600] h-full rounded-full transition-all duration-500" style={{ width: `${verificationProgress}%` }} />
                </div>

            </div>

            <div className="pt-2 text-xs text-[#5e5e5e] flex items-center justify-between border-t border-[#f0f4f9]">
              <span>Counts are read from the live metrics endpoint.</span>
              <span>Updated automatically every 30s</span>
            </div>
          </div>
        </div>

        {/* Service Health */}
        <div className="bg-white border border-[#dadce0] rounded-xl p-6 shadow-xs">
          <h3 className="text-sm font-semibold text-[#1f1f1f] mb-5 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#0b57d0]" />
            <span>Service Health Matrix</span>
          </h3>

          <ul className="space-y-3.5">
            <HealthItem
              label="Database"
              detail={
                isOnline
                  ? 'Connected'
                  : statusUnknown
                    ? 'Health probe not instrumented'
                    : 'Status unavailable'
              }
              status={isOnline ? 'healthy' : statusUnknown ? 'unknown' : 'warning'}
            />
            <HealthItem
              label="Webhook queue"
              detail={`${metrics?.pending_webhooks ?? 0} pending, ${metrics?.failed_webhooks ?? 0} failed`}
              status={metrics?.failed_webhooks > 0 ? 'warning' : 'healthy'}
            />
            <HealthItem label="WhatsApp Meta API" detail="Delivery not instrumented" status="unknown" />
            <HealthItem label="Gemini AI Gateway" detail="Latency not instrumented" status="unknown" />
            <HealthItem label="Email dispatch" detail="Delivery not instrumented" status="unknown" />
          </ul>
        </div>
      </div>

      <div className="bg-white border border-[#dadce0] rounded-xl p-6 shadow-xs">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
            <BarChart3 className="h-4 w-4 text-[#0b57d0]" />
            Data Interpretation
          </h3>
          <span className="text-[11px] text-[#8f8f8f]">
            Derived from live records and system audit events
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <DonutChart
            value={aiCount}
            total={totalObs}
            label="AI coverage"
            hint={`${aiCount.toLocaleString()} of ${totalObs.toLocaleString()} real observations analyzed`}
            color="#0b57d0"
          />
          <ActivityBars data={activity} />
          <div className="rounded-xl border border-[#e3e3e3] bg-[#f8fafd] p-4">
            <h4 className="flex items-center gap-2 text-xs font-semibold text-[#1f1f1f]">
              <BookOpen className="h-4 w-4 text-[#2b7f3f]" />
              How to read this
            </h4>
            <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-[#5e5e5e]">
              <li>
                <strong className="text-[#3c4043]">AI coverage</strong> is the share of real observations with a stored analysis. A low value means ingestion is ahead of processing.
              </li>
              <li>
                <strong className="text-[#3c4043]">Verification backlog</strong> is observations without expert verification. It is a workload signal, not an error rate.
              </li>
              <li>
                  <strong className="text-[#3c4043]">Staff activity</strong> counts the most recent real audit events from the last seven days. It reflects review and administration activity only.

              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend: string;
  status?: 'normal' | 'warning' | 'unknown';
}> = ({ title, value, icon, trend, status = 'normal' }) => (
  <div
    className={`bg-white border rounded-xl p-5 shadow-xs transition-shadow ${
      status === 'warning'
        ? 'border-[#fdd663] bg-[#fef7e0]/30'
        : 'border-[#dadce0] hover:border-[#c7c7c7]'
    }`}
  >
    <div className="flex justify-between items-start mb-3">
      <span className="text-xs font-medium text-[#5e5e5e]">{title}</span>
      <div className="p-1.5 rounded-lg bg-[#f0f4f9]">{icon}</div>
    </div>
    <div className="text-2xl font-bold tabular-nums text-[#1f1f1f] mb-1">{value}</div>
    <div
      className={`text-xs ${
        status === 'warning' ? 'text-[#b06000] font-medium' : 'text-[#5e5e5e]'
      }`}
    >
      {trend}
    </div>
  </div>
);

const HealthItem: React.FC<{
  label: string;
  status: 'healthy' | 'warning' | 'unknown';
  detail: string;
}> = ({ label, status, detail }) => (
  <li className="flex justify-between items-center py-1">
    <div className="flex flex-col">
      <span className="text-sm font-medium text-[#1f1f1f]">{label}</span>
      <span className="text-[11px] text-[#8f8f8f]">{detail}</span>
    </div>
    {status === 'healthy' ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#e6f4ea] text-[#137333]">
        <CheckCircle2 className="w-3 h-3" />
        Healthy
      </span>
    ) : status === 'warning' ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#fef7e0] text-[#b06000]">
        <AlertTriangle className="w-3 h-3" />
        Attention
      </span>
    ) : (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#f0f4f9] text-[#5e5e5e]">
        No telemetry
      </span>
    )}
  </li>
);

const DonutChart: React.FC<{
  value: number;
  total: number;
  label: string;
  hint: string;
  color: string;
}> = ({ value, total, label, hint, color }) => {
  const percent = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="rounded-xl border border-[#e3e3e3] bg-[#f8fafd] p-4">
      <p className="text-xs font-semibold text-[#1f1f1f]">{label}</p>
      <div className="mt-3 flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0" role="img" aria-label={`${label}: ${Math.round(percent)} percent`}>
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#e8f0fe" strokeWidth="10" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - percent / 100)}
            transform="rotate(-90 50 50)"
          />
          <text x="50" y="55" textAnchor="middle" className="fill-[#1f1f1f] text-[16px] font-bold">
            {Math.round(percent)}%
          </text>
        </svg>
        <p className="text-[11px] leading-relaxed text-[#5e5e5e]">{hint}</p>
      </div>
    </div>
  );
};

const ActivityBars: React.FC<{ data: Array<{ key: string; label: string; count: number }> }> = ({
  data,
}) => {
  const max = Math.max(1, ...data.map((day) => day.count));

  return (
    <div className="rounded-xl border border-[#e3e3e3] bg-[#f8fafd] p-4">
      <p className="text-xs font-semibold text-[#1f1f1f]">Staff activity (7 days)</p>
      <div className="mt-4 flex h-28 items-end gap-2">
        {data.map((day) => (
          <div key={day.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-mono text-[#5e5e5e]">{day.count}</span>
            <div className="flex h-16 w-full items-end rounded bg-[#e8f0fe]">
              <div
                className="w-full rounded bg-[#2b7f3f] transition-all duration-500"
                style={{ height: `${day.count === 0 ? 2 : (day.count / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-[#8f8f8f]">{day.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
