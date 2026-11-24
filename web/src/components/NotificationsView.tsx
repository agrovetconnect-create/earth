import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCheck,
  Inbox,
  MapPin,
  MessageSquare,
  MoreVertical,
  Search,
  ShieldCheck,
  Trash2,
  Vote,
  X,
  Menu,
} from 'lucide-react';
import type { CommunityUser } from '../types/communityPosts.js';
import {
  clearNotifications,
  dismissNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '../services/notificationsApi.js';
import { useTranslator } from '../i18n.js';

export type { NotificationItem } from '../services/notificationsApi.js';

interface NotificationsViewProps {
  viewer: CommunityUser | null;
  onRequestLogin: () => void;
  onOpenObservation: (passportId: string, commentId?: string | null) => void;
  onOpenSite?: (siteId: string) => void;
  onBackToApp: () => void;
  isNarrow?: boolean;
  onOpenSidebar?: () => void;
}

function timestampOf(createdAt: string): string {
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(createdAt).toLocaleDateString();
}

function isToday(createdAt: string): boolean {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  viewer,
  onRequestLogin,
  onOpenObservation,
  onOpenSite,
  isNarrow,
  onOpenSidebar,
}) => {
  const t = useTranslator();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [query, setQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const loadSeqRef = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!viewer) {
        setItems([]);
        setLoading(false);
        return;
      }
      const seq = ++loadSeqRef.current;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await fetchNotifications();
        if (seq !== loadSeqRef.current) return;
        setItems(data);
      } catch (err: unknown) {
        if (seq !== loadSeqRef.current) return;
        setError(messageOf(err, 'Could not load your notifications.'));
      } finally {
        if (!silent && seq === loadSeqRef.current) setLoading(false);
      }
    },
    [viewer]
  );

  useEffect(() => {
    void load(false);
    if (!viewer) return;
    const interval = window.setInterval(() => {
      void load(true);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [load, viewer]);

  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (!confirmClearAll) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmClearAll(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmClearAll]);

  const unreadCount = items.filter((item) => !item.read).length;

  const markAllAsRead = async () => {
    setActionError(null);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    } catch (err: unknown) {
      setActionError(messageOf(err, 'Could not update your notifications.'));
    }
  };

  const clearAll = async () => {
    setActionError(null);
    try {
      await clearNotifications();
      setItems([]);
      setQuery('');
      setFilter('all');
      setConfirmClearAll(false);
    } catch (err: unknown) {
      setActionError(messageOf(err, 'Could not clear your notifications.'));
      setConfirmClearAll(false);
    }
  };

  const deleteItem = async (id: string) => {
    setActionError(null);
    try {
      await dismissNotification(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: unknown) {
      setActionError(messageOf(err, 'Could not dismiss that notification.'));
    }
  };

  const toggleRead = async (id: string, currentlyRead: boolean) => {
    setActionError(null);
    try {
      const updated = await markNotificationRead(id, !currentlyRead);
      setItems((prev) =>
        prev.map((item) => (item.id === id ? (updated ?? { ...item, read: !currentlyRead }) : item))
      );
    } catch (err: unknown) {
      setActionError(messageOf(err, 'Could not update that notification.'));
    }
  };

  const handleOpenItem = (item: NotificationItem) => {
    if (!item.read) {
      setItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry))
      );
      void markNotificationRead(item.id, true).catch(() => {
        // Non-fatal; navigation should proceed immediately.
      });
    }
    if (item.passport_id) {
      onOpenObservation(item.passport_id, item.comment_id ?? null);
      return;
    }
    if (item.site_id && onOpenSite) {
      onOpenSite(item.site_id);
    }
  };

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === 'unread' && item.read) return false;
      if (!needle) return true;
      return [item.title, item.body, timestampOf(item.created_at)].some((value) =>
        value.toLowerCase().includes(needle)
      );
    });
  }, [filter, items, query]);

  const groupedItems = useMemo(() => {
    const today = filteredItems.filter((item) => isToday(item.created_at));
    const earlier = filteredItems.filter((item) => !isToday(item.created_at));
    return [
      ...(today.length > 0 ? [{ label: 'Today', items: today }] : []),
      ...(earlier.length > 0 ? [{ label: 'Earlier', items: earlier }] : []),
    ];
  }, [filteredItems]);

  if (!viewer) {
    return (
      <div className="min-h-dvh bg-[#f0f4f9] text-[#1f1f1f] flex flex-col selection:bg-[#d3e3fd] selection:text-[#041e49]">
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
          {isNarrow && onOpenSidebar && (
            <div className="mb-4">
              <button
                type="button"
                onClick={onOpenSidebar}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dadce0] bg-white text-[#5e5e5e] shadow-2xs hover:bg-[#f8faff] hover:text-[#0b57d0] transition-colors cursor-pointer"
                title="Open sidebar"
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="g-card w-full max-w-lg p-8 text-center mx-auto my-auto">
            <Bell className="mx-auto h-8 w-8 text-[#0b57d0]" aria-hidden="true" />
            <h1 className="mt-3 text-[16px] font-medium text-[#1f1f1f]">Your notifications</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[#5e5e5e]">
              Sign in to see replies, verification results and other updates meant only for your
              account.
            </p>
            <button type="button" onClick={onRequestLogin} className="g-btn g-btn-filled mt-5">
              Sign in to continue
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f0f4f9] text-[#1f1f1f] flex flex-col selection:bg-[#d3e3fd] selection:text-[#041e49]">
      <main className="mx-auto flex w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {isNarrow && onOpenSidebar && (
                <button
                  type="button"
                  onClick={onOpenSidebar}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dadce0] bg-white text-[#5e5e5e] shadow-2xs hover:bg-[#f8faff] hover:text-[#0b57d0] transition-colors cursor-pointer"
                  title="Open sidebar"
                  aria-label="Open sidebar"
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
              <div>
                <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1f1f1f] tracking-tight flex items-center gap-2">
                  <Bell className="w-6 h-6 text-[#0b57d0]" aria-hidden="true" />
                  {t('Notifications')}
                </h1>
                <p className="text-xs sm:text-[13px] text-[#5e5e5e] mt-0.5">
                  Replies, verification updates, and activity on your field records.
                </p>
              </div>
            </div>
            {items.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void markAllAsRead()}
                  disabled={unreadCount === 0}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-[#3c4043] shadow-[0_1px_2px_rgba(60,64,67,0.12)] transition-colors hover:text-[#0b57d0] disabled:opacity-50 cursor-pointer"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Mark all read
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-[#3c4043] shadow-[0_1px_2px_rgba(60,64,67,0.12)] transition-colors hover:text-[#b3261e] cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear all
                </button>
              </div>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-300/60 bg-[#ffdad8] px-4 py-3 text-[13px] text-[#a50e0e]"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </span>
              <button
                type="button"
                onClick={() => void load(false)}
                className="rounded-full px-3 py-1 font-medium transition-colors hover:bg-white/60"
              >
                Retry
              </button>
            </div>
          )}

          {actionError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl border border-amber-300/60 bg-[#fef7e0] px-4 py-2.5 text-[12px] text-[#8a5305]"
            >
              <span>{actionError}</span>
              <button
                type="button"
                aria-label="Dismiss message"
                onClick={() => setActionError(null)}
                className="rounded-full p-1 transition-colors hover:bg-white/70"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-3" aria-label="Loading notifications">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="h-20 animate-pulse rounded-3xl border border-[#dde3ea] bg-white"
                />
              ))}
            </div>
          ) : (
            <>
              {items.length > 0 && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5e5e5e]"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search notifications"
                      aria-label="Search notifications"
                      className="h-11 w-full rounded-full border border-[#dadce0] bg-white pl-11 pr-10 text-sm text-[#1f1f1f] outline-none transition placeholder:text-[#80868b] focus:border-[#0b57d0] focus:ring-4 focus:ring-[#0b57d0]/10"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-[#5e5e5e] transition-colors hover:bg-[#e8eaed] hover:text-[#1f1f1f] cursor-pointer"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(
                      [
                        { id: 'all', label: `All (${items.length})` },
                        { id: 'unread', label: `Unread (${unreadCount})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setFilter(tab.id)}
                        className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-medium shadow-[0_1px_2px_rgba(60,64,67,0.10)] transition-colors ${
                          filter === tab.id
                            ? 'bg-[#d3e3fd] text-[#041e49]'
                            : 'bg-white text-[#444746] hover:bg-[#e8f0fe]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredItems.length === 0 ? (
                <section className="rounded-3xl border border-[#dde3ea] bg-white px-6 py-16 text-center shadow-[0_1px_2px_rgba(60,64,67,0.08)]">
                  <Inbox className="mx-auto h-10 w-10 text-[#9aa0a6]" aria-hidden="true" />
                  <p className="mt-4 text-base font-medium text-[#1f1f1f]">
                    {items.length === 0 ? 'You are all caught up' : 'No notifications found'}
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-[#5e5e5e]">
                    {items.length === 0
                      ? 'New replies, verification results, and community updates will appear here.'
                      : 'Try a different search phrase or switch back to all notifications.'}
                  </p>
                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setFilter('all');
                      }}
                      className="mt-5 inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-[#0b57d0] transition-colors hover:bg-[#e8f0fe]"
                    >
                      Reset filters
                    </button>
                  )}
                </section>
              ) : (
                <div className="space-y-5">
                  {groupedItems.map((group) => (
                    <div key={group.label} className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <CalendarDays className="h-4 w-4 text-[#5e5e5e]" aria-hidden="true" />
                        <h2 className="text-sm font-semibold text-[#3c4043]">{group.label}</h2>
                        <span className="text-[11px] text-[#80868b]">
                          {group.items.length} updates
                        </span>
                      </div>
                      <div className="divide-y divide-[#eef0f3] rounded-3xl border border-[#dde3ea] bg-white shadow-[0_1px_2px_rgba(60,64,67,0.08)]">
                        {group.items.map((item) => {
                          let Icon = Bell;
                          if (item.type === 'reply') Icon = MessageSquare;
                          else if (item.type === 'verification') Icon = ShieldCheck;
                          else if (item.type === 'visit') Icon = MapPin;
                          else if (item.type === 'vote') Icon = Vote;

                          const canOpen = Boolean(item.passport_id || (item.site_id && onOpenSite));
                          const content = (
                            <>
                              <div className="relative shrink-0 text-[#0b57d0]">
                                <Icon className="h-5 w-5" aria-hidden="true" />
                                {!item.read && (
                                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#0b57d0]" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <h3
                                    className={`min-w-0 truncate text-sm font-medium text-[#0b57d0] ${
                                      canOpen ? 'group-hover:underline' : ''
                                    }`}
                                  >
                                    {item.title}
                                  </h3>
                                </div>
                                <p className="mt-0 truncate text-xs text-[#5e5e5e]">{item.body}</p>
                              </div>
                            </>
                          );

                          return (
                            <div
                              key={item.id}
                              className="group relative flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#f8fafd] sm:gap-4 sm:px-5"
                            >
                              {canOpen ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenItem(item)}
                                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left focus:outline-none sm:gap-4"
                                >
                                  {content}
                                </button>
                              ) : (
                                <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                                  {content}
                                </div>
                              )}
                              <div className="flex shrink-0 items-center gap-1">
                                <span className="text-[11px] tabular-nums text-[#80868b]">
                                  {timestampOf(item.created_at)}
                                </span>
                                <div className="relative">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setOpenMenuId((current) =>
                                        current === item.id ? null : item.id
                                      );
                                    }}
                                    title="Notification actions"
                                    aria-label="Notification actions"
                                    aria-haspopup="menu"
                                    aria-expanded={openMenuId === item.id}
                                    className="p-1 text-[#5e5e5e] transition-colors hover:text-[#1f1f1f]"
                                  >
                                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                  {openMenuId === item.id && (
                                    <div
                                      role="menu"
                                      onClick={(event) => event.stopPropagation()}
                                      className="absolute right-0 top-full z-20 mt-1 w-48 rounded-xl border border-[#dde3ea] bg-white p-1 shadow-lg"
                                    >
                                      {item.passport_id && (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          onClick={() => {
                                            handleOpenItem(item);
                                            setOpenMenuId(null);
                                          }}
                                          className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#3c4043] transition-colors hover:bg-[#f1f3f4]"
                                        >
                                          {item.comment_id
                                            ? 'Reply in Passport'
                                            : `Open Passport ${item.passport_id}`}
                                        </button>
                                      )}
                                      {item.site_id && onOpenSite && (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          onClick={() => {
                                            handleOpenItem(item);
                                            setOpenMenuId(null);
                                          }}
                                          className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#3c4043] transition-colors hover:bg-[#f1f3f4]"
                                        >
                                          Open Site {item.site_id}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          void toggleRead(item.id, item.read);
                                          setOpenMenuId(null);
                                        }}
                                        className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#3c4043] transition-colors hover:bg-[#f1f3f4]"
                                      >
                                        {item.read ? 'Mark unread' : 'Mark as read'}
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          void deleteItem(item.id);
                                          setOpenMenuId(null);
                                        }}
                                        className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-xs font-medium text-[#b3261e] transition-colors hover:bg-[#fce8e6]"
                                      >
                                        Dismiss
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {confirmClearAll && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-[#0b0f14]/55 p-4 backdrop-blur-xs"
            onClick={(event) => {
              if (event.target === event.currentTarget) setConfirmClearAll(false);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="clear-notifications-title"
              aria-describedby="clear-notifications-description"
              className="w-full max-w-sm rounded-2xl border border-[#dadce0] bg-white p-5 shadow-2xl"
            >
              <div className="flex items-start gap-3">
                <Trash2 className="mt-0.5 h-5 w-5 shrink-0 text-[#b3261e]" aria-hidden="true" />
                <div className="min-w-0">
                  <h2 id="clear-notifications-title" className="text-[15px] font-medium text-[#1f1f1f]">
                    Clear all notifications?
                  </h2>
                  <p id="clear-notifications-description" className="mt-1.5 text-[12px] leading-relaxed text-[#5e5e5e]">
                    This removes every notification from your inbox. It cannot be undone.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="g-btn g-btn-tonal h-9 px-4 text-[12px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void clearAll()}
                  className="inline-flex h-9 items-center rounded-full bg-[#b3261e] px-4 text-[12px] font-medium text-white transition-colors hover:bg-[#8e1d17]"
                >
                  Clear all
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
