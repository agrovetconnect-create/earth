import React, { useState, useEffect } from 'react';
import { ControlLogin } from './ControlLogin.js';
import { OperationsOverview } from './OperationsOverview.js';
import { StaffManagement } from './StaffManagement.js';
import { AuditLogs } from './AuditLogs.js';
import { CustomerSupport } from './CustomerSupport.js';
import { CmsManagement } from './CmsManagement.js';
import { AppDistributionManagement } from './AppDistributionManagement.js';
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
  Info,
  AlertCircle,
} from 'lucide-react';

type ControlTab = 'ops' | 'staff' | 'audit' | 'support' | 'cms' | 'distribution';

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
  const canSeeAudit = ['owner', 'security'].includes(role);
  const canSeeSupport = ['owner', 'support'].includes(role);
  const canManageCms = role === 'owner';
  const canManageDistribution = ['owner', 'ops', 'security'].includes(role);

  const getTabLabel = (tab: ControlTab) => {
    switch (tab) {
      case 'ops':
        return 'Operations Overview';
      case 'staff':
        return 'Staff Management';
      case 'audit':
        return 'Audit Logs';
      case 'support':
        return 'Customer Support';
      case 'cms':
        return 'CMS & Content Management';
      case 'distribution':
        return 'App & Sidebar Channels';
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
  ].filter((item) => item.visible);

  const staffName = session.staff.full_name || session.staff.email || 'ET';
  const staffInitials = staffName
    .split(' ')
    .map((s: string) => s[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ET';

  const sidebarContent = (
    <div className="h-full flex flex-col bg-white border-r border-[#e3e3e3] select-none">
      {/* Brand Header */}
      {/* Brand Header removed per request */}
      {mobileMenuOpen && (
        <div className="h-16 px-5 flex items-center justify-end shrink-0 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="p-1.5 rounded-full text-[#5e5e5e] hover:bg-[#f0f4f9]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

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
    <div className="flex h-dvh bg-[#f8fafd] text-[#1f1f1f] overflow-hidden">
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[#5e5e5e] hover:bg-[#f0f4f9] hover:text-[#1f1f1f]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <NotificationsPanel />
          </div>
        </header>

        {/* Content Viewport */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 g-scroll">
          <div className="max-w-6xl mx-auto pb-12">
            {activeTab === 'ops' && <OperationsOverview />}
            {activeTab === 'staff' && <StaffManagement />}
            {activeTab === 'audit' && <AuditLogs />}
            {activeTab === 'support' && <CustomerSupport />}
            {activeTab === 'cms' && <CmsManagement />}
            {activeTab === 'distribution' && <AppDistributionManagement />}
          </div>
        </div>
      </main>
    </div>
  );
};

const NotificationsPanel: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'report', title: 'New Moderation Report', detail: 'Observation #obs_104 flagged for sensitive content.', time: '5m ago' },
    { id: 2, type: 'error', title: 'Validation Error', detail: 'Webhook delivery failed for Meta API endpoint.', time: '12m ago' },
    { id: 3, type: 'report', title: 'New Verification Request', detail: 'Expert consensus needed on site #site_29.', time: '1h ago' }
  ]);

  const unreadCount = notifications.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-full text-[#5e5e5e] hover:bg-[#f0f4f9] hover:text-[#0b57d0] transition-colors relative cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#d32f2f] text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-12 right-0 z-50 w-80 bg-white border border-[#dadce0] rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[#f0f4f9] bg-[#f8fafd] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1f1f1f]">Admin Notifications</h3>
              <span className="text-[10px] bg-[#e8f0fe] text-[#0b57d0] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Live Alerts
              </span>
            </div>
            <div className="max-h-[400px] overflow-y-auto g-scroll">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-[#8f8f8f] text-sm">No new notifications.</div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className="px-5 py-4 border-b border-[#f0f4f9] last:border-0 hover:bg-[#f8fafd] transition-colors cursor-pointer group">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
                        n.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                      }`}>
                        {n.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-[#1f1f1f] group-hover:text-[#0b57d0] transition-colors">
                          {n.title}
                        </div>
                        <div className="text-xs text-[#5e5e5e] mt-0.5 leading-relaxed">
                          {n.detail}
                        </div>
                        <div className="text-[10px] text-[#8f8f8f] mt-2 font-medium">
                          {n.time}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-[#f0f4f9] text-center bg-[#f8fafd]">
              <button 
                onClick={() => setNotifications([])}
                className="text-xs font-bold text-[#0b57d0] hover:underline"
              >
                Clear all alerts
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
