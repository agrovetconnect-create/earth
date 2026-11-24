import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  EyeOff,
  Image as ImageIcon,
  MessageCircle,
  Sparkles,
  Telescope,
  AlertCircle,
  Smartphone,
  CheckCircle2,
  Mail,
  User,
  X,
  Menu,
} from 'lucide-react';
import type { CommunityUser, MyPostSummary } from '../types/communityPosts.js';
import { fetchMyPosts } from '../services/postsApi.js';
import {
  linkWhatsApp,
  verifyLinkWhatsApp,
  refreshSession,
} from '../services/communityAuth.js';
import { getLocalAccount } from '../services/localAccount.js';
import { categoryLabel } from '../types/community.js';
import { formatPassportId } from '../lib/format.js';
import { CATEGORY_COLORS } from './MapView.js';
import WhatsAppIcon from './WhatsAppIcon.js';
import { useDialogFocus } from '../hooks/useDialogFocus.js';

interface MyEarthTalkViewProps {
  viewer: CommunityUser | null;
  onRequestLogin: () => void;
  onOpenPost: (passportId: string) => void;
  onOpenWebUpload?: () => void;
  isNarrow?: boolean;
  onOpenSidebar?: () => void;
}

/**
 * Sub-component for the WhatsApp linking flow.
 */
const WhatsAppLinker: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'input' | 'verify'>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await linkWhatsApp(phone.trim());
      setStep('verify');
      setMessage('A verification code was sent to your WhatsApp.');
    } catch (err: any) {
      setError(err.message || 'Failed to request linking code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await verifyLinkWhatsApp(phone.trim(), code.trim());
      await refreshSession().catch(() => null);
      setMessage('WhatsApp identity linked to your account.');
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleUseDifferentNumber = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setPhone('');
    setCode('');
    setError(null);
    setMessage(null);
    setStep('input');
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[12px]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {message && !error && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-[12px]">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {step === 'input' ? (
        <form key="whatsapp-link-input" onSubmit={handleRequest} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+250 78..."
              className="w-full h-10 px-3 pr-10 rounded-lg border border-[#c7c7c7] text-[13px] focus:outline-none focus:border-[#0b57d0]"
            />
            <Smartphone className="w-4 h-4 text-[#8f8f8f] absolute right-3 top-3" />
          </div>
          <button
            type="submit"
            disabled={loading || !phone.trim()}
            className="g-btn g-btn-tonal h-10 px-4 text-[12px] whitespace-nowrap shrink-0"
          >
            {loading ? 'Sending...' : 'Link WhatsApp'}
          </button>
        </form>
      ) : (
        <form key="whatsapp-link-verify" onSubmit={handleVerify} className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              className="flex-1 min-w-0 h-10 px-3 rounded-lg border border-[#c7c7c7] text-[13px] tracking-widest text-center font-bold focus:outline-none focus:border-[#0b57d0]"
            />
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="g-btn g-btn-filled h-10 px-6 text-[12px]"
            >
              {loading ? 'Verifying...' : 'Verify & Link'}
            </button>
          </div>
          <button
            type="button"
            onClick={handleUseDifferentNumber}
            className="text-[11px] text-[#0b57d0] hover:underline self-start"
          >
            Use a different number
          </button>
        </form>
      )}
    </div>
  );
};

/**
 * MY EARTH TALK - the contributor's own dashboard.
 */
export const MyEarthTalkView: React.FC<MyEarthTalkViewProps> = ({
  viewer,
  onRequestLogin,
  onOpenPost,
  isNarrow,
  onOpenSidebar,
}) => {
  const [posts, setPosts] = useState<MyPostSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const whatsAppDialogRef = useDialogFocus<HTMLDivElement>(whatsAppModalOpen);
  const loadSeqRef = useRef(0);

  const load = useCallback(async () => {
    if (!viewer) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const data = await fetchMyPosts();
      if (seq !== loadSeqRef.current) return;
      const list = Array.isArray(data) ? data : [];
      const unique = Array.from(new Map(list.map((p) => [p.passport_id, p])).values());
      setPosts(unique);
    } catch (err: unknown) {
      if (seq !== loadSeqRef.current) return;
      setNotice(err instanceof Error ? err.message : 'Could not load your posts.');
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [viewer]);

  useEffect(() => {
    setPosts([]);
    setNotice(null);
    setAvatarFailed(false);
    setWhatsAppModalOpen(false);
    if (viewer) {
      load();
    }
  }, [viewer, load]);

  useEffect(() => {
    if (!whatsAppModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setWhatsAppModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [whatsAppModalOpen]);

  const local = getLocalAccount();
  const isLocal = Boolean(
    !viewer?.email && local && viewer && local.public_user_id === viewer.public_user_id
  );

  if (!viewer) {
    return (
      <div className="min-h-dvh bg-[#f0f4f9] text-[#1f1f1f] flex flex-col p-4 sm:p-6">
        {isNarrow && onOpenSidebar && (
          <div className="mb-4">
            <button
              type="button"
              onClick={onOpenSidebar}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dadce0] bg-white text-[#5e5e5e] shadow-2xs hover:bg-[#f8faff] hover:text-[#0b57d0] transition-colors"
              title="Open sidebar"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="g-card p-8 text-center max-w-lg mx-auto my-auto">
          <Telescope className="w-8 h-8 text-[#0b57d0] mx-auto" aria-hidden="true" />
          <h2 className="mt-3 text-[16px] font-medium text-[#1f1f1f]">My Earth Talk</h2>
          <p className="mt-2 text-[13px] text-[#5e5e5e] leading-relaxed">
            Your observations, your questions, your comments - under one sign-in.
            Sign in with Google or Gmail to sync and edit your personal field records.
          </p>
          <button
            type="button"
            onClick={onRequestLogin}
            className="group mt-4 inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#dadce0] bg-white px-5 py-2.5 text-[13px] font-medium text-[#1f1f1f] shadow-sm transition-all duration-150 hover:border-[#0b57d0]/40 hover:bg-[#f8faff] hover:shadow active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0]"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.31 7.23 24 12 24z" />
              <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.12 0 9.87 0 11.7s.43 3.58 1.19 5.12l4.09-3.15z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.23 0 3.17 2.69 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
            </svg>
            <span>Sign in to Earth Talk</span>
            <ArrowRight className="h-4 w-4 text-[#5e5e5e] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[#0b57d0]" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const resolvedDisplayName =
    viewer.display_name || viewer.email?.split('@')[0] || 'Earth Talk Member';
  const avatarSrc = !isLocal && viewer ? viewer.avatar_url ?? null : null;
  const showAvatarImage = Boolean(avatarSrc) && !avatarFailed;

  return (
    <div className="min-h-dvh bg-[#f0f4f9] text-[#1f1f1f] flex flex-col selection:bg-[#d3e3fd] selection:text-[#041e49]">
      <main className="mx-auto flex w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="w-full space-y-6">
          <div className="flex items-center gap-3">
            {isNarrow && onOpenSidebar && (
              <button
                type="button"
                onClick={onOpenSidebar}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dadce0] bg-white text-[#5e5e5e] shadow-2xs hover:bg-[#f8faff] hover:text-[#0b57d0] transition-colors"
                title="Open sidebar"
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
            <div>
              <h1 className="text-[22px] sm:text-[26px] font-semibold text-[#1f1f1f] tracking-tight flex items-center gap-2">
                <Telescope className="w-6 h-6 text-[#0b57d0]" aria-hidden="true" />
                My Earth Talk
              </h1>
              <p className="text-xs sm:text-[13px] text-[#5e5e5e] mt-0.5">
                Your observations, questions, and personal field records.
              </p>
            </div>
          </div>

      {notice && (
        <div className="mt-3 text-[12px] text-[#5e5e5e] bg-[#f0f4f9] border border-[#e3e3e3] rounded-lg px-3 py-2">
          {notice}
        </div>
      )}

      {/* Identity */}
      <section className="g-card mt-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f0fe] text-[#0b57d0] ring-1 ring-[#e3e3e3]">
            {showAvatarImage ? (
              <img
                src={avatarSrc ?? undefined}
                alt={`${resolvedDisplayName} profile photo`}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <User className="h-5 w-5" aria-hidden="true" />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <p className="truncate text-[14px] font-medium text-[#1f1f1f]">
              {resolvedDisplayName}
            </p>
            {viewer.email && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] text-[#1a73e8] font-medium bg-[#e8f0fe] px-2 py-0.5 rounded-md">
                  <Mail className="w-3 h-3 text-[#1a73e8]" />
                  {viewer.email}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 border-t border-[#e8eaed] pt-3">
          <button
            type="button"
            onClick={() => setWhatsAppModalOpen(true)}
            aria-haspopup="dialog"
            className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:text-[#0b57d0]"
          >
            <span className="flex items-center gap-2">
              <WhatsAppIcon className="h-4 w-4 shrink-0 text-[#25d366]" />
              <span className="text-[13px] font-medium text-[#1f1f1f]">WhatsApp Account Linking</span>
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#0b57d0]">
              {viewer.is_whatsapp_linked ? 'Linked' : 'Open'}
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </button>
          {viewer.is_whatsapp_linked && (
            <div className="mt-2 flex items-start gap-2 px-1 text-[12px] text-[#166534]">
              <Sparkles className="mt-0.5 w-4 h-4 shrink-0 text-[#16a34a]" aria-hidden="true" />
              WhatsApp identity linked. Your WhatsApp observations are associated with this account.
            </div>
          )}
        </div>
      </section>

      {/* Your observations */}
      <section className="mt-6">
        <h3 className="text-[13px] font-medium text-[#1f1f1f] mb-2">Your observations</h3>
        {loading && posts.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-pulse" aria-label="Loading your posts">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="g-card p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="h-4 w-3/5 rounded bg-[#e8edf5]" />
                  <div className="h-3 w-14 rounded bg-[#eef1f6]" />
                </div>
                <div className="h-3 w-1/2 rounded bg-[#f1f3f4]" />
                <div className="h-3 w-1/3 rounded bg-[#f1f3f4]" />
                <div className="h-8 w-16 rounded-lg bg-[#eef1f6]" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="py-14 px-4 text-center text-[#5e5e5e] text-sm bg-white rounded-xl border border-dashed border-[#c7c7c7]">
            <p className="font-medium text-[#1f1f1f] mb-1">Nothing here yet.</p>
            <p className="text-xs">When you upload a specimen photo or send an observation, it appears here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {posts.map((post) => {
              const color = CATEGORY_COLORS[post.observation_category] ?? '#78716c';
              return (
                <div key={post.passport_id} className="g-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[14px] font-medium text-[#1f1f1f] break-words">{post.title}</h4>
                    <span
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium"
                      style={{ color: post.is_public ? '#137333' : '#7f5f00' }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: post.is_public ? '#137333' : '#b45309' }}
                        aria-hidden="true"
                      />
                      {post.is_public ? 'Public' : 'Private'}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px]">
                    <span className="font-mono text-[11.5px] font-semibold text-[#0b57d0] tabular-nums">
                      {formatPassportId(post.passport_id)}
                    </span>
                    <span className="text-[#c7c7c7]" aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1.5 font-medium" style={{ color }}>
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                      {categoryLabel(post.observation_category)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[#5e5e5e] tabular-nums">
                    <span className="flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" aria-hidden="true" />
                      {post.media_count ?? 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" aria-hidden="true" />
                      {post.comment_count ?? 0}
                    </span>
                    {(post.open_question_count ?? 0) > 0 && (
                      <span className="flex items-center gap-1 text-[#9f6108]">
                        <Sparkles className="w-3 h-3" aria-hidden="true" />
                        {post.open_question_count} open question{(post.open_question_count ?? 0) === 1 ? '' : 's'}
                      </span>
                    )}
                    {!post.is_public && (
                      <span className="flex items-center gap-1">
                        <EyeOff className="w-3 h-3" aria-hidden="true" />
                        Not on the map
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="g-btn g-btn-tonal h-8 px-3 mt-3 text-[12px]"
                    onClick={() => onOpenPost(post.passport_id)}
                  >
                    Open
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {whatsAppModalOpen && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[95] flex items-center justify-center bg-[#0b0f14]/55 p-3 backdrop-blur-xs sm:p-5"
            onClick={(event) => {
              if (event.target === event.currentTarget) setWhatsAppModalOpen(false);
            }}
          >
            <div
              ref={whatsAppDialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="whatsapp-link-title"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setWhatsAppModalOpen(false);
              }}
              className="g-scroll max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#dadce0] bg-white p-5 shadow-2xl focus:outline-none"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="whatsapp-link-title" className="flex items-center gap-2 text-[15px] font-medium text-[#1f1f1f]">
                    <WhatsAppIcon className="h-4 w-4 shrink-0 text-[#25d366]" />
                    WhatsApp Account Linking
                  </h2>
                  <p className="mt-1 text-[12px] text-[#5e5e5e]">
                    Link your WhatsApp number so field observations sent from WhatsApp join this account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWhatsAppModalOpen(false)}
                  aria-label="Close WhatsApp linking"
                  className="rounded-full p-1.5 text-[#5e5e5e] transition-colors hover:bg-[#f1f3f4] hover:text-[#1f1f1f]"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-4">
                {viewer.is_whatsapp_linked ? (
                  <div className="flex items-start gap-3 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-[#166534]">
                    <Sparkles className="w-4 h-4 shrink-0 text-[#16a34a]" aria-hidden="true" />
                    <div className="text-[12px]">
                      <p className="font-bold">WhatsApp identity linked</p>
                      <p>Your WhatsApp observations are automatically associated with this account.</p>
                    </div>
                  </div>
                ) : (
                  <WhatsAppLinker />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
        </div>
      </main>
    </div>
  );
};
