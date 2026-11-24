import React, { useState, useEffect } from 'react';
import { ControlLogin } from './ControlLogin.js';
import { OperationsOverview } from './OperationsOverview.js';
import { StaffManagement } from './StaffManagement.js';
import { AuditLogs } from './AuditLogs.js';
import { CustomerSupport } from './CustomerSupport.js';
import { CmsManagement } from './CmsManagement.js';
import { AppDistributionManagement } from './AppDistributionManagement.js';
import { UserMessaging } from './UserMessaging.js';
import { ResearchAnalyticsDashboard } from '../components/ResearchAnalyticsDashboard.js';
import { ValidationEvaluationDashboard } from '../components/ValidationEvaluationDashboard.js';
import { ExpertDashboardView } from '../components/ExpertDashboardView.js';
import { AdminModerationDashboard } from '../components/AdminModerationDashboard.js';
import type { ExpertUser } from '../types/expert.js';
import { getStoredStaff, setStoredStaff, controlApi } from '../services/controlApi.js';
import {
  LayoutDashboard,
  Users,
  History,
  LogOut,
  ExternalLink,
  Search,
  FileText,
  ShieldCheck,
  Smartphone,
  Menu,
  X,
  Bell,
  MessageSquare,
  Settings,
} from 'lucide-react';

type ControlTab =
  | 'ops'
  | 'governance'
  | 'staff'
  | 'audit'
  | 'support'
  | 'messaging'
  | 'cms'
  | 'distribution'
  | 'system';

export const ControlCenter: React.FC = () => {
  const [session, setSession] = useState(getStoredStaff());
  const [checkingSession, setCheckingSession] = useState(() => getStoredStaff() === null);
  const [activeTab, setActiveTab] = useState<ControlTab>('ops');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    controlApi
      .getMe()
      .then((res) => {
        if (cancelled) return;
        if (res?.staff) {
          const next = { token: '', staff: res.staff };
          setStoredStaff(next);
          setSession(next);
        } else {
          setStoredStaff(null);
          setSession(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStoredStaff(null);
        setSession(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    void controlApi.logout();
    setSession(null);
  };

  if (checkingSession) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#f8fafd] text-sm text-[#5e5e5e]">
        Verifying session…
      </div>
    );
  }

  if (!session) {
    return <ControlLogin onLogin={() => setSession(getStoredStaff())} />;
  }

  const role = session.staff.role;
  const canManageStaff = role === 'owner';
  const canManageGovernance = role === 'owner';
  const canSeeAudit = ['owner', 'security'].includes(role);
  const canSeeSupport = ['owner', 'support'].includes(role);
  const canManageCms = role === 'owner';
  const canManageDistribution = ['owner', 'ops', 'security'].includes(role);
  const canManageMaintenance = ['owner', 'ops', 'security'].includes(role);

  const getTabLabel = (tab: ControlTab) => {
    switch (tab) {
      case 'ops':
        return 'Operations Overview';
      case 'governance':
        return 'Research & Governance';
      case 'staff':
        return 'Staff Management';
      case 'audit':
        return 'Audit Logs';
      case 'support':
        return 'Customer Support';
      case 'messaging':
        return 'User Messaging';
      case 'cms':
        return 'CMS & Content Management';
      case 'distribution':
        return 'App & Sidebar Channels';
      case 'system':
        return 'Owner System Controls';
    }
  };

  const navItems = [
    {
      id: 'ops' as ControlTab,
      label: 'Operations',
      icon: <LayoutDashboard className="w-5 h-5 shrink-0" />,
      visible: true,
    },
    {
      id: 'governance' as ControlTab,
      label: 'Research & Governance',
      icon: <ShieldCheck className="w-5 h-5 shrink-0" />,
      visible: canManageGovernance,
    },
    {
      id: 'staff' as ControlTab,
      label: 'Staff Management',
      icon: <Users className="w-5 h-5 shrink-0" />,
      visible: canManageStaff,
    },
    {
      id: 'audit' as ControlTab,
      label: 'Audit Logs',
      icon: <History className="w-5 h-5 shrink-0" />,
      visible: canSeeAudit,
    },
    {
      id: 'support' as ControlTab,
      label: 'Customer Support',
      icon: <Search className="w-5 h-5 shrink-0" />,
      visible: canSeeSupport,
    },
    {
      id: 'messaging' as ControlTab,
      label: 'User Messaging',
      icon: <MessageSquare className="w-5 h-5 shrink-0" />,
      visible: true,
    },
    {
      id: 'cms' as ControlTab,
      label: 'CMS Content',
      icon: <FileText className="w-5 h-5 shrink-0" />,
      visible: canManageCms,
    },
    {
      id: 'distribution' as ControlTab,
      label: 'App & Channels',
      icon: <Smartphone className="w-5 h-5 shrink-0" />,
      visible: canManageDistribution,
    },
    {
      id: 'system' as ControlTab,
      label: 'Owner Controls',
      icon: <Settings className="w-5 h-5 shrink-0" />,
      visible: role === 'owner',
    },
  ].filter((item) => item.visible);

  const activeView: ControlTab = navItems.some((item) => item.id === activeTab) ? activeTab : 'ops';

  const staffName = session.staff.full_name || session.staff.email || 'ET';
  const staffInitials = staffName
    .split(' ')
    .map((s: string) => s[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ET';

  const governanceUser: ExpertUser = {
    id: session.staff.id,
    email: session.staff.email,
    name: staffName,
    role: 'admin',
    organization: 'Earth Talk Control Center',
  };

  const sidebarContent = (
    <div className="h-full flex flex-col bg-white border-r border-[#e3e3e3] select-none">
      <div className="h-16 px-5 flex items-center gap-3 border-b border-[#e3e3e3] shrink-0">
        <img src="/logo-no-subtitle.png" alt="Earth Talk" className="h-9 w-auto max-w-[8rem] object-contain" />
        <div className="h-7 w-px bg-[#dadce0]" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#1f1f1f] truncate">Control Center</div>
          <div className="text-[10px] text-[#5e5e5e]">Earth Talk administration</div>
        </div>
        {mobileMenuOpen && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
            className="ml-auto p-1.5 rounded-full text-[#5e5e5e] hover:bg-[#f0f4f9] lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <div className="flex-1 p-3 space-y-1 overflow-y-auto g-scroll">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#5e5e5e]">
          Administration
        </div>
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-r-full text-sm font-medium transition-colors text-left cursor-pointer ${
                isActive
                  ? 'bg-[#e8f0fe] text-[#0b57d0] font-semibold'
                  : 'text-[#3c4043] hover:bg-[#f0f4f9] hover:text-[#1f1f1f]'
              }`}
            >
              <span className={isActive ? 'text-[#0b57d0]' : 'text-[#5e5e5e]'}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Account Info & Logout */}
      <div className="p-3 border-t border-[#e3e3e3] bg-[#f8fafd]">
        <div className="flex items-center gap-3 p-2 rounded-xl bg-white border border-[#dadce0] shadow-2xs">
          <div className="w-9 h-9 rounded-full bg-[#d3e3fd] text-[#041e49] flex items-center justify-center font-bold text-xs shrink-0">
            {staffInitials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#1f1f1f] truncate">
              {session.staff.full_name || session.staff.email}
            </div>
            <div className="text-[11px] text-[#5e5e5e] capitalize flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#137333]" />
              <span>{session.staff.role}</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-[#5e5e5e] hover:text-[#d32f28] hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh bg-[#f0f4f9] text-[#1f1f1f] overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 md:w-72 flex-col shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-2xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[80vw] h-full shadow-2xl z-10">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-[#e3e3e3] px-4 sm:px-8 flex items-center justify-between shrink-0 shadow-2xs">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[#5e5e5e] hover:bg-[#f0f4f9] hover:text-[#1f1f1f]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-[#8f8f8f]">Control Center</div>
              <div className="truncate text-sm font-semibold text-[#1f1f1f]">
                {getTabLabel(activeView)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/"
              className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[#5e5e5e] hover:bg-[#f0f4f9] hover:text-[#0b57d0] sm:flex"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open public site
            </a>
            <NotificationsPanel />
          </div>
        </header>

        {/* Content Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 g-scroll">
          <div className="max-w-6xl mx-auto pb-12">
            {activeView === 'ops' && <OperationsOverview />}
            {activeView === 'governance' && canManageGovernance && (
              <GovernanceSuite
                currentUser={governanceUser}
                onExit={() => setActiveTab('ops')}
              />
            )}
            {activeView === 'staff' && canManageStaff && <StaffManagement />}
            {activeView === 'audit' && canSeeAudit && <AuditLogs />}
            {activeView === 'support' && canSeeSupport && <CustomerSupport />}
            {activeView === 'messaging' && <UserMessaging canManageMaintenance={canManageMaintenance} />}
            {activeView === 'cms' && canManageCms && <CmsManagement />}
            {activeView === 'distribution' && canManageDistribution && <AppDistributionManagement />}
            {activeView === 'system' && role === 'owner' && <SystemControls />}
          </div>
        </div>
      </main>
    </div>
  );
};

type GovernanceSection = 'research' | 'reviews' | 'validation' | 'moderation';

const GovernanceSuite: React.FC<{
  currentUser: ExpertUser;
  onExit: () => void;
}> = ({ currentUser, onExit }) => {
  const [section, setSection] = useState<GovernanceSection>('research');

  const sections: Array<{ id: GovernanceSection; label: string }> = [
    { id: 'research', label: 'Research analytics' },
    { id: 'reviews', label: 'Expert reviews' },
    { id: 'validation', label: 'Field validation' },
    { id: 'moderation', label: 'Moderation' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1f1f1f]">Research & Governance</h2>
          <p className="mt-1 text-sm text-[#5e5e5e]">
            Owner-only supervision tools. Every action is attributed to the signed-in Control Center account.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {sections.map((item) => {
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={`h-9 rounded-full px-4 text-xs font-medium transition-colors cursor-pointer ${
                active
                  ? 'bg-[#0b57d0] text-white'
                  : 'bg-white text-[#3c4043] border border-[#dadce0] hover:bg-[#e8f0fe]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#dadce0] bg-white shadow-xs">
        {section === 'research' && <ResearchAnalyticsDashboard onBackToQueue={onExit} />}
        {section === 'reviews' && <ExpertDashboardView currentUser={currentUser} />}
        {section === 'validation' && <ValidationEvaluationDashboard />}
        {section === 'moderation' && <AdminModerationDashboard />}
      </div>
    </div>
  );
};

const NotificationsPanel: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-full text-[#5e5e5e] hover:bg-[#f0f4f9] hover:text-[#0b57d0] transition-colors relative cursor-pointer"
        aria-label="Staff notifications"
      >
        <Bell className="w-5 h-5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-12 right-0 z-50 w-80 bg-white border border-[#dadce0] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[#f0f4f9] bg-[#f8fafd] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1f1f1f]">Staff Notifications</h3>
            </div>
            <div className="py-12 px-5 text-center text-[#5e5e5e] text-sm">
              No staff alert feed is connected to this panel.
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const SystemControls: React.FC = () => {
  const [settings, setSettings] = useState<{ enabled: boolean; updated_at: string | null } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    controlApi
      .getDemoContent()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to read owner settings.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setEnabled = async (enabled: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const result = await controlApi.updateDemoContent(enabled);
      setSettings(result.settings);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update owner setting.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[#1f1f1f]">Owner System Controls</h2>
        <p className="mt-1 text-sm text-[#5e5e5e]">
          Production controls reserved for the owner account. Every change is written to the staff audit log.
        </p>
      </div>

      <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
              <Settings className="h-4 w-4 text-[#0b57d0]" />
              Demonstration content
            </h3>
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[#5e5e5e]">
              Turns clearly labelled demonstration records on for investor or partner walkthroughs.
              When off, public map, post cards, discussions, community sites, and attachments come
              only from real contributor data.
            </p>
          </div>
          <button
            type="button"
            disabled={loading || saving || !settings}
            onClick={() => settings && setEnabled(!settings.enabled)}
            className={`inline-flex h-10 items-center gap-2 self-start rounded-full px-5 text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
              settings?.enabled
                ? 'bg-[#b06000] text-white hover:bg-[#8a4a00]'
                : 'bg-[#137333] text-white hover:bg-[#0e5c29]'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            {saving
              ? 'Saving…'
              : !settings
                ? 'Unavailable'
                : settings.enabled
                  ? 'Turn demo data off'
                  : 'Turn demo data on'}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <OwnerFact
            label="Current state"
            value={
              settings
                ? settings.enabled
                  ? 'Demo data visible'
                  : 'Real data only'
                : loading
                  ? 'Loading…'
                  : 'Unavailable'
            }
          />
          <OwnerFact
            label="Last changed"
            value={settings?.updated_at ? new Date(settings.updated_at).toLocaleString() : 'Not recorded'}
          />
          <OwnerFact label="Audited" value={saved ? 'Owner attribution recorded' : 'Audit follows each change'} />
        </div>

        {settings?.enabled && (
          <p className="mt-4 rounded-xl border border-[#fdd663] bg-[#fef7e0]/50 px-4 py-3 text-xs text-[#7a4b00]">
            Demonstration mode is active. Labelled demo records may appear on public surfaces until you turn it off.
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-[#f5c2c0] bg-[#fce8e6] px-4 py-3 text-xs text-[#c5221f]">
            {error}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[#dadce0] bg-white p-6 shadow-xs">
        <h3 className="text-sm font-semibold text-[#1f1f1f]">Owner responsibilities</h3>
        <ul className="mt-3 grid gap-2 text-xs leading-relaxed text-[#5e5e5e] sm:grid-cols-2">
          <li>• Research, expert review, validation, and moderation access.</li>
          <li>• Staff accounts, CMS publishing, and app channel configuration.</li>
          <li>• Demonstration data visibility for walkthroughs and pitches.</li>
          <li>• Final accountability for audit events and production data integrity.</li>
        </ul>
      </div>
    </div>
  );
};

const OwnerFact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-xl border border-[#e3e3e3] bg-[#f8fafd] p-4">
    <p className="text-[11px] font-medium text-[#8f8f8f]">{label}</p>
    <p className="mt-1 text-sm font-semibold text-[#1f1f1f]">{value}</p>
  </div>
);
