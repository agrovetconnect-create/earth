import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  Pencil,
  Sparkles,
  Telescope,
  Trash2,
<<<<<<< HEAD
  AlertCircle,
  Smartphone,
  CheckCircle2,
  Mail,
  RotateCcw,
  Upload,
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
} from 'lucide-react';
import type { CommunityUser, MyPostSummary } from '../types/communityPosts.js';
import { fetchMyPosts } from '../services/postsApi.js';
import {
  clearAvatar,
  setAvatar,
<<<<<<< HEAD
  restoreGoogleAvatar,
  updateProfile,
  userAvatarSrc,
  linkWhatsApp,
  verifyLinkWhatsApp,
} from '../services/communityAuth.js';
import {
  canEditDisplayNameFor,
  canEditDisplayName,
  getLocalAccount,
  nextDisplayNameEditAtFor,
  nextDisplayNameEditAt,
=======
  updateProfile,
  userAvatarSrc,
} from '../services/communityAuth.js';
import {
  canEditDisplayName,
  canEditDisplayNameFor,
  getLocalAccount,
  nextDisplayNameEditAt,
  nextDisplayNameEditAtFor,
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  updateLocalAccountDisplayName,
} from '../services/localAccount.js';
import { categoryLabel } from '../types/community.js';
import { fileToDataUrl } from '../lib/file.js';
import { CATEGORY_COLORS } from './MapView.js';
import { ReputationPanel } from './ReputationPanel.js';

interface MyEarthTalkViewProps {
  viewer: CommunityUser | null;
  onRequestLogin: () => void;
  onOpenPost: (passportId: string) => void;
<<<<<<< HEAD
  onOpenWebUpload?: () => void;
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
      window.location.reload(); // Refresh to show linked state
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-[#5e5e5e] leading-relaxed">
        Associate your WhatsApp observations with this account. This allows you to edit and manage
        your field records across all platforms.
      </p>

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
        <form onSubmit={handleRequest} className="flex gap-2">
          <div className="relative flex-1">
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
            className="g-btn g-btn-tonal h-10 px-4 text-[12px] whitespace-nowrap"
          >
            {loading ? 'Sending...' : 'Link WhatsApp'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              className="flex-1 h-10 px-3 rounded-lg border border-[#c7c7c7] text-[13px] tracking-widest text-center font-bold focus:outline-none focus:border-[#0b57d0]"
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
            onClick={() => setStep('input')}
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
=======
}

/**
 * MY EARTH TALK - the contributor's own dashboard (Stage 12).
 *
 * Shows exactly the caller's own posts, public and private, and their
 * participation record together, so everything a contributor owns is on one
 * screen. The reader's photo/name controls live here rather than in the page
 * header: the identity block itself is the editor.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
 */
export const MyEarthTalkView: React.FC<MyEarthTalkViewProps> = ({
  viewer,
  onRequestLogin,
  onOpenPost,
<<<<<<< HEAD
  onOpenWebUpload,
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}) => {
  const [posts, setPosts] = useState<MyPostSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [confirmingName, setConfirmingName] = useState(false);
  const [name, setName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
<<<<<<< HEAD
=======
  // Guards against an earlier request landing after a newer one (for example
  // after switching accounts), which would show another reader's posts.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
    setEditingName(false);
    setConfirmingName(false);
    setAvatarVersion(0);
    setAvatarFailed(false);
    if (viewer) {
      setName(viewer.display_name ?? '');
      load();
    }
  }, [viewer, load]);

<<<<<<< HEAD
=======
  // A local (auto-created) account renames through the browser store and is
  // bound by the seven-day interval; a WhatsApp-verified account renames on the
  // server, which reports the same timestamp in the session. The identity block
  // reads the same rule either way, and the server enforces it regardless of
  // what the browser believes.
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  const local = getLocalAccount();
  const isLocal = Boolean(local && viewer && local.public_user_id === viewer.public_user_id);
  const nameEditable = isLocal
    ? canEditDisplayName(local)
    : canEditDisplayNameFor(viewer?.display_name_updated_at);
  const nextEditAt = isLocal
    ? nextDisplayNameEditAt(local)
    : nextDisplayNameEditAtFor(viewer?.display_name_updated_at);

  if (!viewer) {
    return (
      <div className="p-6">
        <div className="g-card p-8 text-center max-w-lg mx-auto">
          <Telescope className="w-8 h-8 text-[#0b57d0] mx-auto" aria-hidden="true" />
          <h2 className="mt-3 text-[16px] font-medium text-[#1f1f1f]">My Earth Talk</h2>
          <p className="mt-2 text-[13px] text-[#5e5e5e] leading-relaxed">
<<<<<<< HEAD
            Your observations, your questions, your comments - under one sign-in.
            Sign in with Google or Gmail to sync and edit your personal field records.
          </p>
          <button type="button" className="g-btn g-btn-filled mt-4" onClick={onRequestLogin}>
            Sign in to Earth Talk
=======
            Your observations, your questions, your comments - under one sign-in. Verify your
            WhatsApp number once and everything you contribute is in one place.
          </p>
          <button type="button" className="g-btn g-btn-filled mt-4" onClick={onRequestLogin}>
            Sign in with WhatsApp
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
          </button>
        </div>
      </div>
    );
  }

  const saveName = async () => {
    const next = name.trim();
    if (next === (viewer.display_name ?? '')) {
      setConfirmingName(false);
      setEditingName(false);
      return;
    }
    setNotice(null);
    try {
      if (isLocal) {
        const updated = updateLocalAccountDisplayName(next);
        setNotice(`You now appear as "${updated.display_name}".`);
      } else {
        const updated = await updateProfile(next.length > 0 ? next : null);
        setNotice(
          updated.display_name
            ? `You now appear as "${updated.display_name}".`
            : 'Your posts are now shared anonymously.',
        );
      }
      setEditingName(false);
      setConfirmingName(false);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not update your name.');
      setConfirmingName(false);
    }
  };

  const onAvatarChosen = async (file: File | undefined) => {
    if (!file) return;
    setNotice(null);
    setAvatarBusy(true);
    try {
      let dataUrl: string;
      try {
        dataUrl = await fileToDataUrl(file);
      } catch {
        throw new Error('The image could not be read.');
      }
      const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
      if (!match) throw new Error('Only JPEG, PNG or WebP images are allowed.');
      await setAvatar(match[2], match[1]);
      setAvatarFailed(false);
      setAvatarVersion((v) => v + 1);
      setNotice('Your profile photo was updated.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'The photo could not be saved.');
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const onAvatarRemove = async () => {
    setNotice(null);
    setAvatarBusy(true);
    try {
      await clearAvatar();
      setAvatarFailed(true);
      setAvatarVersion((v) => v + 1);
      setNotice('Your profile photo was removed.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'The photo could not be removed.');
    } finally {
      setAvatarBusy(false);
    }
  };

<<<<<<< HEAD
  const onAvatarRestoreGoogle = async () => {
    setNotice(null);
    setAvatarBusy(true);
    try {
      await restoreGoogleAvatar();
      setAvatarFailed(false);
      setAvatarVersion((v) => v + 1);
      setNotice('Original Google profile photo restored.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not restore Google photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  const avatarSrc = !isLocal && viewer ? userAvatarSrc(viewer.public_user_id, avatarVersion) : null;
  const showAvatarImage = Boolean(avatarSrc) && !avatarFailed;

  const publicCount = posts.filter((post) => post.is_public).length;
  const privateCount = posts.length - publicCount;
  const openQuestions = posts.reduce((total, post) => total + (post.open_question_count ?? 0), 0);

  const daysUntilRename = nextEditAt > Date.now()
    ? Math.ceil((nextEditAt - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-medium text-[#1f1f1f] flex items-center gap-2">
          <Telescope className="w-5 h-5 text-[#0b57d0]" aria-hidden="true" />
          My Earth Talk
        </h2>
      </div>

      {notice && (
        <div className="mt-3 text-[12px] text-[#5e5e5e] bg-[#f0f4f9] border border-[#e3e3e3] rounded-lg px-3 py-2">
          {notice}
        </div>
      )}

      {/* Identity */}
      <section className="g-card mt-4 p-5">
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 flex-col items-center gap-1">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f0f4f9] ring-1 ring-[#e3e3e3]">
              {showAvatarImage ? (
                <img
                  src={avatarSrc ?? undefined}
                  alt={`${viewer.display_name ?? viewer.public_user_id} profile photo`}
                  className="h-full w-full object-cover"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <img src="/icon.png" alt="" className="h-7 w-7 object-contain" />
              )}
            </span>
            {!isLocal && (
              <>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[#5e5e5e] hover:bg-[#f0f4f9] disabled:opacity-40"
                    aria-label="Change profile photo"
                    title="Change profile photo"
                    disabled={avatarBusy}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <Camera className="w-3 h-3" />
                  </button>
<<<<<<< HEAD
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[#5e5e5e] hover:bg-[#f0f4f9] disabled:opacity-40"
                    aria-label="Restore Google profile photo"
                    title="Restore Google profile photo"
                    disabled={avatarBusy}
                    onClick={onAvatarRestoreGoogle}
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
                  {showAvatarImage && (
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[#5e5e5e] hover:bg-[#f0f4f9] disabled:opacity-40"
                      aria-label="Remove profile photo"
                      title="Remove profile photo"
                      disabled={avatarBusy}
                      onClick={onAvatarRemove}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => onAvatarChosen(e.target.files?.[0])}
                />
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your public name"
                    autoFocus
                    className="h-9 flex-1 rounded-lg border border-[#c7c7c7] px-3 text-[13px] focus:outline-none focus:border-[#0b57d0]"
                  />
                  {confirmingName ? (
                    <>
                      <button
                        type="button"
                        className="g-btn g-btn-filled h-9 px-3 text-[12px]"
                        onClick={saveName}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="g-btn g-btn-text h-9 px-2 text-[12px]"
                        onClick={() => setConfirmingName(false)}
                      >
                        Back
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="g-btn g-btn-filled h-9 px-3 text-[12px]"
                        onClick={() => setConfirmingName(true)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="g-btn g-btn-text h-9 px-2 text-[12px]"
                        onClick={() => setEditingName(false)}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
                {confirmingName && (
                  <p className="text-[11px] leading-snug text-[#9f6108]">
                    Change your name to "{name.trim() || 'Anonymous contributor'}"? A name can only be
                    changed once every 7 days.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-medium text-[#1f1f1f]">
                  {viewer.display_name ?? 'Anonymous contributor'}
                </p>
                <button
                  type="button"
                  className="g-icon-btn disabled:opacity-40"
                  aria-label="Edit display name"
                  disabled={!nameEditable}
                  title={
                    nameEditable
                      ? 'Edit your display name'
                      : `Your name can be changed again in ${daysUntilRename} day${daysUntilRename === 1 ? '' : 's'}`
                  }
                  onClick={() => {
                    setName(viewer.display_name ?? '');
                    setEditingName(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
<<<<<<< HEAD
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-[11px] text-[#5e5e5e] font-mono">{viewer.public_user_id}</span>
              {viewer.email && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[#1a73e8] font-medium bg-[#e8f0fe] px-2 py-0.5 rounded-md">
                  <Mail className="w-3 h-3 text-[#1a73e8]" />
                  {viewer.email}
                </span>
              )}
            </div>
=======
            <p className="text-[11px] text-[#5e5e5e] font-mono mt-0.5">{viewer.public_user_id}</p>
            {isLocal && (
              <p className="text-[11px] text-[#5e5e5e] mt-0.5">
                {nameEditable
                  ? 'This name was created for you. Rename it once to make it your own.'
                  : `You can rename again in ${daysUntilRename} day${daysUntilRename === 1 ? '' : 's'}.`}
              </p>
            )}
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
          </div>
        </div>
      </section>

<<<<<<< HEAD
      {/* WhatsApp Linking */}
      <section className="g-card mt-4 p-5">
        <h3 className="text-[13px] font-medium text-[#1f1f1f] mb-2 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-[#25d366]" />
          WhatsApp Account Linking
        </h3>
        {viewer.is_whatsapp_linked ? (
          <div className="flex items-center gap-3 p-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
            <Sparkles className="w-4 h-4 text-[#16a34a]" />
            <div className="text-[12px] text-[#166534]">
              <p className="font-bold">WhatsApp identity linked</p>
              <p>Your WhatsApp observations are automatically associated with this account.</p>
            </div>
          </div>
        ) : (
          <WhatsAppLinker />
        )}
      </section>

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      {/* Stats */}
      <section className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Your posts', value: posts.length, icon: Telescope },
          { label: 'Public', value: publicCount, icon: Eye },
          { label: 'Private', value: privateCount, icon: Lock },
          { label: 'Open AI questions', value: openQuestions, icon: Sparkles },
        ].map((stat) => (
          <div key={stat.label} className="g-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#5e5e5e]">{stat.label}</span>
              <stat.icon className="w-4 h-4 text-[#8f8f8f]" aria-hidden="true" />
            </div>
            <p className="mt-1 text-[20px] font-semibold text-[#1f1f1f]">{stat.value}</p>
          </div>
        ))}
      </section>

      {/* Your posts */}
      <section className="mt-4">
<<<<<<< HEAD
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="text-[13px] font-medium text-[#1f1f1f]">Your observations</h3>
          {onOpenWebUpload && (
            <button
              type="button"
              onClick={onOpenWebUpload}
              className="g-btn g-btn-filled h-9 px-3.5 text-xs flex items-center gap-1.5 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span>Upload Photo &amp; Supporting Media</span>
            </button>
          )}
        </div>
        {loading && posts.length === 0 ? (
          <div className="py-16 text-center text-[#5e5e5e] text-sm">Loading your posts…</div>
        ) : posts.length === 0 ? (
          <div className="py-16 px-4 text-center text-[#5e5e5e] text-sm bg-white rounded-xl border border-dashed border-[#c7c7c7]">
            <p className="font-medium text-[#1f1f1f] mb-1">Nothing here yet.</p>
            <p className="text-xs mb-4">When you upload a specimen photo or send an observation, it appears here.</p>
            {onOpenWebUpload && (
              <button
                type="button"
                onClick={onOpenWebUpload}
                className="g-btn g-btn-tonal h-9 px-4 text-xs inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span>Upload Photo &amp; Supporting Media on Web</span>
              </button>
            )}
=======
        <h3 className="text-[13px] font-medium text-[#1f1f1f] mb-2">Your observations</h3>
        {loading && posts.length === 0 ? (
          <div className="py-16 text-center text-[#5e5e5e] text-sm">Loading your posts…</div>
        ) : posts.length === 0 ? (
          <div className="py-16 text-center text-[#5e5e5e] text-sm bg-white rounded-xl border border-dashed border-[#c7c7c7]">
            <p className="font-medium text-[#1f1f1f] mb-1">Nothing here yet.</p>
            <p className="text-xs">When you send an observation to Earth Talk, it appears here.</p>
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
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
                      className="shrink-0 text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full border"
                      style={{
                        color: post.is_public ? '#2b7f3f' : '#7f5f00',
                        background: post.is_public ? '#c4eed0' : '#fff3cd',
                        borderColor: post.is_public ? '#2b7f3f33' : '#e6c20040',
                      }}
                    >
                      {post.is_public ? 'Public' : 'Private'}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border"
                      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
                    >
                      <svg width="8" height="11" viewBox="0 0 42 52" aria-hidden="true">
                        <path
                          d="M21 2C10.5 2 2 10.1 2 20.6 2 35.9 21 49.6 21 49.6S40 35.9 40 20.6C40 10.1 31.5 2 21 2z"
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth="6"
                        />
                      </svg>
                      {categoryLabel(post.observation_category)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-[#5e5e5e]">
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

<<<<<<< HEAD
      {/* Contribution record */}
=======
      {/* Contribution record - moved here from the old "My contributions" page */}
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
      <section className="mt-6">
        <h3 className="text-[13px] font-medium text-[#1f1f1f] mb-2">Your contribution record</h3>
        <ReputationPanel displayName={viewer.display_name} />
      </section>
    </div>
  );
};
