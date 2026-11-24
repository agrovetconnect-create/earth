import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageSquarePlus,
  LogIn,
  LogOut,
  Smartphone,
  Upload,
  Menu,
  X,
} from 'lucide-react';
import {
  NAV_FOOTER_UTILS,
  NAV_GROUPS,
  type AppView,
  type CommunityPanel,
  type NavEntry,
} from '../navigation.js';
import { useTranslator } from '../i18n.js';
import { LanguageCard } from './LanguageCard.js';
import { appDistributionApi, type AppDistributionData } from '../services/appDistributionApi.js';
import type { CommunityUser } from '../types/communityPosts.js';

interface SidebarProps {
  view: AppView;
  /** `panel` jumps a view straight to one of its sections. */
  onNavigate: (view: AppView, panel?: CommunityPanel) => void;
  onOpenWhatsApp: () => void;
  /** Opens the direct Web Photo & Supporting Media submission modal. */
  onOpenWebUpload: () => void;
  /** Opens the general Google/email sign-in modal. */
  onOpenLogin: () => void;
  onSignOut: () => void;
  /** The signed-in contributor, when there is one. */
  currentUser: CommunityUser | null;
  distributionConfig?: AppDistributionData | null;
  /**
   * The section on screen, when the open view is split across several entries
   * that share its id (the four Community sections). Each such entry carries a
   * `panel`, and this decides which one is marked active.
   */
  activePanel?: CommunityPanel | null;
  /**
   * Icon-only mode, and the control that toggles it. The three horizontal
   * lines live in this header and open or narrow this column only. On a phone
   * the same control shuts the drawer; the map's "show sidebar" button and the
   * floating Menu button are what bring it back.
   */
  collapsed?: boolean;
  onToggleCollapsed?: (() => void) | null;
  /** Closes this column: folds it to the icon rail, or shuts the phone drawer. */
  onClose?: (() => void) | null;
  /**
   * True while the column is an overlay drawer rather than an inline column.
   * The drawer has no icon-rail mode to narrow into - its own X and the
   * backdrop are the close controls - so the rail toggle is suppressed.
   */
  overlay?: boolean;
  /**
   * Panel content for the active view. It renders inside the same scroll
   * region as the navigation, directly beneath it, which is how a Google-style
   * desktop sidebar works: one column, navigation on top, contextual panel
   * underneath. Nothing is duplicated inline in the page header.
   */
  children?: React.ReactNode;
}

/**
 * The single navigation surface for the app.
 *
 * It follows the map-drawer menu pattern: an "Earth Talk" wordmark, a plain
 * list of destinations (no section headings), and a
 * short column of footer utilities. The column folds to an icon-only rail whose
 * top-left control reopens it.
 *
 * Every row is a plain destination. Whether the reader is signed in is shown
 * once, in the pinned action area at the foot of the column: a "Sign in" button
 * while signed out, replaced by the reader's identity once they sign in. Staff
 * and governance tools live only in the separate Control Center.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  view,
  onNavigate,
  onOpenWhatsApp,
  onOpenWebUpload,
  onOpenLogin,
  onSignOut,
  currentUser,
  distributionConfig,
  activePanel,
  onToggleCollapsed = null,
  collapsed = false,
  onClose = null,
  overlay = false,
  children,
}) => {
  // The footer Language row opens a popover instead of leaving for a screen, so
  // a reader switches the navigation's language without losing their place.
  const [languageOpen, setLanguageOpen] = useState(false);
  // The icon rail hides the sign-out button; the reader's avatar opens this
  // small menu instead, so the session is still reachable in the narrow column.
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuPos, setAccountMenuPos] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  } | null>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const [avatarError, setAvatarError] = useState(false);
  const playStoreReady = Boolean(
    distributionConfig?.is_play_store_active && distributionConfig?.play_store_url
  );
  const apkReady = Boolean(distributionConfig?.apk_available);
  const channelReady =
    (distributionConfig?.mode === 'play_store' && playStoreReady) ||
    (distributionConfig?.mode === 'apk' && apkReady) ||
    (distributionConfig?.mode === 'both' && (playStoreReady || apkReady));
  const showGetApp = Boolean(distributionConfig?.is_get_app_sidebar_visible) && channelReady;
  const showWhatsApp = Boolean(distributionConfig?.is_whatsapp_sidebar_visible);

  useEffect(() => {
    setAvatarError(false);
  }, [currentUser?.avatar_url]);

  useEffect(() => {
    setAccountMenuOpen(false);
  }, [collapsed]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const close = () => setAccountMenuOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [accountMenuOpen]);

  const handleGetApp = async () => {
    try {
      const config = await appDistributionApi.getPublicConfig();
      if (config.is_play_store_active && config.mode === 'play_store' && config.play_store_url) {
        window.location.href = config.play_store_url;
      } else {
        appDistributionApi.triggerDirectDownload(config.apk_filename || 'earthtalk.apk');
      }
    } catch {
      appDistributionApi.triggerDirectDownload('earthtalk.apk');
    }
  };

  // Navigation chrome follows the language chosen in Language settings.
  const t = useTranslator();

  // Escape shuts the phone drawer, matching every other overlay in the app.
  useEffect(() => {
    if (!overlay || !onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [overlay, onClose]);

  const handleEntry = (entry: NavEntry) => onNavigate(entry.id, entry.panel);

  // An entry is active when it matches the open view and, for a view split
  // across several entries (the four Community sections), the section the view
  // is currently showing.
  const isEntryActive = (entry: NavEntry) => {
    if (entry.id === 'about' && (view === 'about' || view === 'how-it-works')) return true;
    if (entry.id === 'terms' && (view === 'terms' || view === 'privacy')) return true;
    return entry.id === view && (entry.panel ? entry.panel === activePanel : activePanel == null);
  };

  const iconButton = (
    label: string,
    onClick: () => void,
    icon: React.ReactNode,
    extraClass = ''
  ) => (
    <button
      type="button"
      className={`g-icon-btn h-11 w-11 shrink-0 ${extraClass}`}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  // Whoever is signed in with Google/email is shown in the pinned action area
  // so the session is never ambiguous.
  const initials = (value: string | null | undefined) =>
    (value || '')
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

  const contributorName =
    currentUser?.display_name ||
    currentUser?.email?.split('@')[0] ||
    currentUser?.public_user_id ||
    '';

  const identity = currentUser
    ? {
        name: contributorName,
        email: currentUser.email || '',
        role: 'Contributor',
        avatarUrl: currentUser.avatar_url || null,
        avatarClass: 'bg-[#ceead6] text-[#1f4f33]',
        initials: initials(contributorName),
      }
    : null;

  // Destinations that need a session are hidden until there is one, and a
  // section that ends up empty is not drawn as a bare rule. Staff tools are not
  // part of this navigation at all; they are reached through the Control Center.
  const signedIn = Boolean(currentUser);
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) => !(entry.requiresSignIn && !signedIn)),
  })).filter((group) => group.entries.length > 0);

  // Only a viewer whose session reports a linked WhatsApp identity is sent into
  // My Earth Talk on WhatsApp; everyone else sees the onboarding label.
  const whatsAppLabel = currentUser?.is_whatsapp_linked
    ? 'My Earth Talk on WhatsApp'
    : 'Start on WhatsApp';

  // Only the collapsed rail's account menu is portaled: the sidebar's
  // overflow-hidden rail clipped the wide popup, making Log out unreachable.
  const toggleAccountMenu = () => {
    if (!accountMenuOpen && accountButtonRef.current) {
      const rect = accountButtonRef.current.getBoundingClientRect();
      if (collapsed) {
        setAccountMenuPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
      } else {
        setAccountMenuPos({ top: rect.top - 8, right: window.innerWidth - rect.right });
      }
    }
    setAccountMenuOpen((prev) => !prev);
  };

  const accountMenuBody = identity ? (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-semibold ring-1 ring-[#e3e3e3] ${
          identity.avatarUrl && !avatarError ? 'bg-[#f0f4f9]' : identity.avatarClass
        }`}
      >
        {identity.avatarUrl && !avatarError ? (
          <img
            src={identity.avatarUrl}
            alt={identity.name}
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
            onError={() => setAvatarError(true)}
          />
        ) : (
          identity.initials
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-[12px] font-medium text-[#1f1f1f]">{identity.name}</span>
        </div>
        <div className="truncate text-[10px] text-[#5e5e5e]">{identity.email}</div>
      </div>
      <button
        type="button"
        title="Log out"
        aria-label="Log out"
        className="g-icon-btn h-8 w-8 shrink-0"
        onClick={() => {
          setAccountMenuOpen(false);
          onSignOut();
        }}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  ) : null;

  const accountMenuPortal =
    collapsed && identity && accountMenuOpen && accountMenuPos && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[60]"
              aria-hidden="true"
              onClick={() => setAccountMenuOpen(false)}
            />
            <div
              role="menu"
              className="fixed z-[61] w-48 overflow-hidden rounded-xl border border-[#e3e3e3] bg-white p-2 shadow-[var(--g-elev-2)]"
              style={{
                top: accountMenuPos.top,
                bottom: accountMenuPos.bottom,
                left: accountMenuPos.left,
                right: accountMenuPos.right,
                transform: collapsed ? 'translateY(-50%)' : 'translateY(-100%)',
              }}
            >
              {accountMenuBody}
            </div>
          </>,
          document.body
        )
      : null;

  const inlineAccountMenu =
    !collapsed && identity && accountMenuOpen ? (
      <>
        <div
          className="fixed inset-0 z-40"
          aria-hidden="true"
          onClick={() => setAccountMenuOpen(false)}
        />
        <div className="absolute bottom-full right-0 left-0 z-50 mb-2 overflow-hidden rounded-xl border border-[#e3e3e3] bg-white p-2 shadow-[var(--g-elev-2)]">
          {accountMenuBody}
        </div>
      </>
    ) : null;

  return (
    <>
      <aside className={`g-sidebar ${collapsed ? 'g-sidebar--rail' : ''}`}>
      {/* Header — fixed above the scroll region. The expand control (the
          three lines) lives only in the icon rail: the full column is opened
          by it, and closed from its X, which narrows the column straight back
          to this top-left control rather than removing it from the page. */}
      <div className="flex h-16 shrink-0 items-center justify-between px-3">
        {collapsed ? (
          <div className="flex w-full justify-center">
            {onToggleCollapsed && (
              <button
                type="button"
                className="g-icon-btn h-10 w-10 rounded-lg hover:bg-[#f0f4f9] hover:text-[#0b57d0] transition-colors flex items-center justify-center text-[#5e5e5e] cursor-pointer"
                title="Expand sidebar"
                aria-label="Expand sidebar"
                onClick={onToggleCollapsed}
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (
          <>
            <img
              src="/logo-no-subtitle.png"
              alt="Earth Talk"
              className="ml-1 h-10 w-auto object-contain select-none"
            />
            {(onClose ?? onToggleCollapsed) &&
              iconButton(
                overlay ? 'Close sidebar' : 'Collapse sidebar',
                (onClose ?? onToggleCollapsed)!,
                <X className="h-5 w-5" aria-hidden="true" />,
                '!h-9 !w-9',
              )}
          </>
        )}
      </div>

      {/* Navigation + contextual panel — the one scroll region, with the
          header and the footer held outside it. */}
      <nav className="flex-1 overflow-y-auto g-scroll" aria-label="Primary navigation">
        <div className="py-1">
          {visibleGroups.map((group) => (
            <div key={group.id}>
              {group.entries.map((entry) => {
                const active = isEntryActive(entry);
                const Icon = entry.icon;
                const label = t(entry.label);
                return (
                  <button
                    key={`${entry.id}:${entry.panel ?? ''}`}
                    type="button"
                    className={`et-menu-item ${collapsed ? 'et-menu-item--rail' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? label : undefined}
                    aria-label={collapsed ? label : undefined}
                    onClick={() => handleEntry(entry)}
                  >
                    <Icon
                      className={`h-5 w-5 shrink-0 ${
                        active ? 'text-[#041e49]' : 'text-[#444746]'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="et-menu-label flex-1 truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          ))}

          {/* Footer utilities (Language) */}
          {NAV_FOOTER_UTILS.map((util) => {
            const Icon = util.icon;
            const label = t(util.label);
            const active = util.id === 'language' && languageOpen;
            return (
              <button
                key={util.id}
                type="button"
                className={`et-menu-item ${collapsed ? 'et-menu-item--rail' : ''}`}
                aria-expanded={util.id === 'language' ? languageOpen : undefined}
                title={collapsed ? label : undefined}
                aria-label={collapsed ? label : undefined}
                onClick={() => {
                  if (util.id === 'language') setLanguageOpen((prev) => !prev);
                }}
              >
                <Icon
                  className={`h-5 w-5 shrink-0 ${
                    active ? 'text-[#0b57d0]' : 'text-[#444746]'
                  }`}
                  aria-hidden="true"
                />
                <span className="et-menu-label flex-1 truncate">{label}</span>
              </button>
            );
          })}
        </div>

        {/* The contextual panel for the active view. */}
        {!collapsed && children && <div className="px-2 pb-6">{children}</div>}
      </nav>

      {/* Language service popover */}
      {languageOpen && (
        <div className="relative h-0">
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => setLanguageOpen(false)}
          />
          <div
            className={`z-50 overflow-hidden ${
              collapsed ? 'fixed left-16 bottom-20 z-50' : 'absolute bottom-full left-3 right-3 mb-2'
            }`}
          >
            <LanguageCard onSelect={() => setLanguageOpen(false)} />
          </div>
        </div>
      )}

      {/* Primary action + session state — pinned to the bottom, outside the
          scroll region, so starting on WhatsApp is always one click away. */}
      <div
        className={`shrink-0 bg-white space-y-2 ${
          collapsed ? 'flex flex-col items-center px-2 py-3' : 'px-3 py-3'
        }`}
      >
        {collapsed ? (
          <>
            {showGetApp && (
              <button
                type="button"
                className="g-icon-btn h-11 w-11"
                title={t('Get app')}
                aria-label={t('Get app')}
                onClick={handleGetApp}
              >
                <Smartphone className="h-5 w-5" />
              </button>
            )}
            {showWhatsApp && (
              <button
                type="button"
                className="g-icon-btn h-11 w-11"
                title={t(whatsAppLabel)}
                aria-label={t(whatsAppLabel)}
                onClick={onOpenWhatsApp}
              >
                <MessageSquarePlus className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              className="g-icon-btn h-11 w-11 text-[#0b57d0]"
              title={t('Submit Field Observation')}
              aria-label={t('Submit Field Observation')}
              onClick={onOpenWebUpload}
            >
              <Upload className="h-5 w-5" />
            </button>
            {identity ? (
              <div className="relative">
                <button
                  ref={accountButtonRef}
                  type="button"
                  className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${identity.avatarClass}`}
                  title={`${identity.name} · ${identity.role}`}
                  aria-label={`${identity.name} — account and log out`}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  onClick={toggleAccountMenu}
                >
                  {identity.avatarUrl && !avatarError ? (
                    <img
                      src={identity.avatarUrl}
                      alt={identity.name}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    identity.initials
                  )}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="g-icon-btn h-11 w-11"
                title="Sign in"
                aria-label="Sign in"
                onClick={onOpenLogin}
              >
                <LogIn className="h-5 w-5" />
              </button>
            )}
          </>
        ) : (
          <>
            {showGetApp && (
              <button
                type="button"
                className="g-btn g-btn-tonal h-10 w-full"
                onClick={handleGetApp}
              >
                <Smartphone className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{t('Get app')}</span>
              </button>
            )}
            {showWhatsApp && (
              <button
                type="button"
                className="g-btn g-btn-tonal h-10 w-full"
                onClick={onOpenWhatsApp}
              >
                <MessageSquarePlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{t(whatsAppLabel)}</span>
              </button>
            )}
            <button
              type="button"
              className="g-btn g-btn-filled h-10 w-full"
              title={t('Submit Field Observation')}
              onClick={onOpenWebUpload}
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{t('Submit Field Observation')}</span>
            </button>

            {identity ? (
              <div className="relative">
                <button
                  ref={accountButtonRef}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-[#f0f4f9]"
                  title={`${identity.name} · ${identity.role}`}
                  aria-label={`${identity.name} — account and log out`}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  onClick={toggleAccountMenu}
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${identity.avatarClass}`}
                  >
                    {identity.avatarUrl && !avatarError ? (
                      <img
                        src={identity.avatarUrl}
                        alt={identity.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      identity.initials
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium leading-tight text-[#1f1f1f]">
                      {identity.name}
                    </div>
                    <div className="flex items-center gap-1 truncate text-[10px] leading-tight text-[#5e5e5e]">
                      {identity.role}
                    </div>
                  </div>
                </button>
                {inlineAccountMenu}
              </div>
            ) : (
              <button
                type="button"
                className="g-btn g-btn-outlined h-11 w-full"
                onClick={onOpenLogin}
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>Sign in</span>
              </button>
            )}
          </>
        )}
      </div>

      </aside>
      {accountMenuPortal}
    </>
  );
};
