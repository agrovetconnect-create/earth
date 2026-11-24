import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  Flag,
  Heart,
  HelpCircle,
  Image as ImageIcon,
  Lock,
  MapPin,
  Maximize2,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  MoreVertical,
  Navigation,
  Paperclip,
  Pencil,
  PlayCircle,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import type {
  AbuseReportTargetType,
  CommunityPostDetail,
  CommunityUser,
  LocationPrivacyLevel,
  PublicComment,
  PublicObservationAttachment,
  PublicPostLocation,
} from '../types/communityPosts.js';
import { categoryLabel } from '../types/community.js';
import { CATEGORY_COLORS } from './MapView.js';
import {
  addPostMedia,
  answerQuestion,
  createComment,
  fetchComments,
  reactToComment,
  removePostMedia,
  updateAttachmentDownload,
  updatePost,
} from '../services/postsApi.js';
import type { UpdatePostPatch } from '../services/postsApi.js';
import { PdfPreview } from './PdfPreview.js';
import { ReportDialog } from './ReportDialog.js';
import { downloadBlob } from '../lib/download.js';
import { formatDate, formatPassportId } from '../lib/format.js';
import { useDialogFocus } from '../hooks/useDialogFocus.js';

interface ReportTarget {
  type: AbuseReportTargetType;
  id: string;
  label: string;
}

const PRECISION_LABELS: Record<LocationPrivacyLevel, string> = {
  exact: 'Exact location',
  approximate: 'Approximate location',
  district: 'District only',
  private: 'Private — not shown on the map',
};

const PRECISION_OPTIONS: LocationPrivacyLevel[] = ['exact', 'approximate', 'district', 'private'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ADMIN_UNIT_SUFFIX = /\s+(district|sector|cell|village)$/i;

function normalizePlaceToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(ADMIN_UNIT_SUFFIX, '')
    .replace(/^rwanda$/, '');
}

function placePartsOf(loc: PublicPostLocation): string[] {
  const structured = [
    loc.country ?? null,
    loc.district ? `${loc.district} District` : null,
    loc.sector ? `${loc.sector} Sector` : null,
    loc.cell ? `${loc.cell} Cell` : null,
    loc.village ? `${loc.village} Village` : null,
  ].filter(Boolean) as string[];

  const known = new Set(
    [loc.district, loc.sector, loc.cell, loc.village, loc.country]
      .filter(Boolean)
      .map((value) => normalizePlaceToken(String(value)))
  );

  const extraAddress = String(loc.address ?? '')
    .split(/[,·|;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !known.has(normalizePlaceToken(part)))
    .join(', ');

  return [...structured, extraAddress || null].filter(Boolean) as string[];
}

function initialsOf(name: string | null, fallback: string): string {
  if (!name) return fallback.slice(0, 1).toUpperCase();
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function formatRelativeTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return formatDate(iso);
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(iso);
}

const AVATAR_TONES = [
  'bg-[#dce9dc] text-[#234d2c]',
  'bg-[#e1e8f5] text-[#1c4076]',
  'bg-[#f3e3d8] text-[#7a3b14]',
  'bg-[#ece3f5] text-[#4b2d6b]',
];

function avatarToneFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length]!;
}

const DiscussionAvatar: React.FC<{
  src?: string | null;
  name: string | null;
  fallbackId: string;
  sizeClass?: string;
}> = ({ src, name, fallbackId, sizeClass = 'h-9 w-9' }) => {
  const [imgError, setImgError] = useState(false);
  useEffect(() => {
    setImgError(false);
  }, [src]);
  const resolvedSrc = src ?? null;
  const label = name || fallbackId;
  return (
    <span
      className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold ring-1 ring-black/5 ${
        resolvedSrc && !imgError ? 'bg-[#e9ece4]' : avatarToneFor(fallbackId || label)
      }`}
    >
      {resolvedSrc && !imgError ? (
        <img
          src={resolvedSrc}
          alt={label}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        initialsOf(name, fallbackId)
      )}
    </span>
  );
};

/** The friendly file extension for the media the server reports. */
function downloadExtensionFor(mime: string): string {
  const t = mime.toLowerCase();
  if (t.includes('mp4')) return 'mp4';
  if (t.includes('webm')) return 'webm';
  if (t.includes('quicktime') || t.includes('mov')) return 'mov';
  if (t.includes('matroska')) return 'mkv';
  if (t.includes('3gp')) return '3gp';
  if (t.includes('ogg')) return 'ogv';
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  return t.startsWith('video/') ? 'mp4' : 'bin';
}

/** The best container the recorder supports, preferring MP4 for wider support. */
function pickRecorderMime(): string {
  const candidates = [
    'video/mp4;codecs="avc1.640029,mp4a.40.2"',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/x-matroska',
  ];
  return (
    candidates.find(
      (type) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type),
    ) ?? 'video/webm'
  );
}

/** A bitrate that keeps a clip visually identical to its source on any screen. */
function videoBitrateFor(width: number, height: number): number {
  const pixels = width * height;
  if (pixels >= 2_073_600) return 24_000_000; // 1080p and above
  if (pixels >= 921_600) return 14_000_000; // 720p
  return 8_000_000;
}

/**
 * Re-encodes a clip with the same slim credit strip burned along the bottom
 * (location · co-ordinates · platform · contributor). It is drawn over every
 * frame at the original resolution with a generous bitrate so the download
 * stays HD; the file is MP4 when the browser can record it, else WebM/Matroska.
 */
async function stampVideoWithCredit(
  src: string,
  line1: string,
  line2: string,
): Promise<{ blob: Blob; mime: string }> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener(
        'error',
        () => reject(new Error('Could not load the clip')),
        { once: true },
      );
    });
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error('The clip has no playable track');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported');
    // The exact same strip proportions and fonts as the photo download, so the
    // text lands pixel-for-pixel as crisp on the clip as it does on an image.
    const scale = Math.max(0.8, Math.min(width, height) / 1080);
    const strip = Math.round(62 * scale);
    const pad = Math.round(18 * scale);
    const stamp = () => {
      ctx.drawImage(video, 0, 0, width, height);
      ctx.fillStyle = 'rgba(8, 8, 14, 0.55)';
      ctx.fillRect(0, height - strip, width, strip);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(13 * scale)}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(line1, pad, height - strip + strip * 0.34, width - pad * 2);
      ctx.font = `400 ${Math.round(11.5 * scale)}px system-ui, -apple-system, sans-serif`;
      ctx.fillText(line2, pad, height - strip + strip * 0.7, width - pad * 2);
    };
    await video.play();
    // Give the decoder a first frame before recording so the top of the clip
    // is not black.
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    const stream = canvas.captureStream(30);
    const captureTracks = (video as HTMLVideoElement & { captureStream?: () => MediaStream })
      .captureStream;
    const audioTracks = (captureTracks ? captureTracks.call(video) : new MediaStream())
      .getAudioTracks();
    for (const track of audioTracks) stream.addTrack(track);
    const mime = pickRecorderMime();
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: videoBitrateFor(width, height),
      audioBitsPerSecond: 128_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    let frame = 0;
    const draw = () => {
      stamp();
      frame = requestAnimationFrame(draw);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start(250);
    draw();
    const durationMs = (Number.isFinite(video.duration) ? video.duration : 3) * 1000;
    await new Promise((resolve) => window.setTimeout(resolve, durationMs + 400));
    cancelAnimationFrame(frame);
    recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: recorder.mimeType || mime });
    if (!blob.size) throw new Error('The stamped clip could not be encoded');
    return { blob, mime: recorder.mimeType || mime };
  } finally {
    video.removeAttribute('src');
    video.load();
    video.remove();
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the image'));
    image.src = src;
  });
}

/**
 * Re-exports the image at its full native resolution and stamps a slim credit
 * strip along the bottom - the location, the platform, and the contributor.
 * PNG is lossless, so the download is never recompressed or downscaled.
 */
async function stampImageWithCredit(
  src: string,
  line1: string,
  line2: string,
): Promise<Blob> {
  const image = await loadImageElement(src);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported');
  ctx.drawImage(image, 0, 0);
  const scale = Math.max(0.8, Math.min(canvas.width, canvas.height) / 1080);
  const strip = Math.round(62 * scale);
  const pad = Math.round(18 * scale);
  ctx.fillStyle = 'rgba(8, 8, 14, 0.55)';
  ctx.fillRect(0, canvas.height - strip, canvas.width, strip);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.round(13 * scale)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(line1, pad, canvas.height - strip + strip * 0.34, canvas.width - pad * 2);
  ctx.font = `400 ${Math.round(11.5 * scale)}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(line2, pad, canvas.height - strip + strip * 0.7, canvas.width - pad * 2);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The stamped image could not be exported'));
    }, 'image/png');
  });
}

export interface ObservationSideCardProps {
  post: CommunityPostDetail | null;
  loading: boolean;
  viewer: CommunityUser | null;
  onClose: () => void;
  onRequestLogin: () => void;
  onOpenPassport: (passportId: string) => void;
  onPostChanged: (post: CommunityPostDetail) => void;
  /** Starts navigation to the given place on the platform's own map. */
  onNavigate: (latitude: number, longitude: number, label: string) => void;
  /** Renders the card as the full-screen passport instead of the map sheet. */
  fullscreen?: boolean;
  /** Closes the full-screen passport back to the side card. */
  onExitFullscreen?: () => void;
  /** Optional discussion comment id to scroll to, highlight, and open reply for. */
  targetCommentId?: string | null;
  /** Scrolls to the discussion section if targetCommentId is absent or missing. */
  focusDiscussion?: boolean;
  /** Called once targetCommentId / focusDiscussion has been handled. */
  onTargetCommentHandled?: () => void;
}

/**
 * The observation card that opens when a pin is clicked.
 *
 * Layout follows the map-details pattern: the photos lead, the sheet is a
 * phone bottom-sheet and a desktop right panel, the close control floats over
 * the media, and one primary action ("full Geoscience Passport") closes it.
 *
 * It is deliberately a different surface from the Geoscience Passport: the
 * passport is the immutable record, this card is the conversation around it.
 */
export const ObservationSideCard: React.FC<ObservationSideCardProps> = ({
  post,
  loading,
  viewer,
  onClose,
  onRequestLogin,
  onOpenPassport,
  onPostChanged,
  onNavigate,
  fullscreen = false,
  onExitFullscreen,
  targetCommentId = null,
  focusDiscussion = false,
  onTargetCommentHandled,
}) => {
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<PublicObservationAttachment | null>(null);
  const lightboxDialogRef = useDialogFocus<HTMLDivElement>(
    lightboxIndex !== null && Boolean(post?.media[lightboxIndex])
  );
  const attachmentDialogRef = useDialogFocus<HTMLDivElement>(Boolean(previewAttachment));
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentsRevision, setCommentsRevision] = useState(0);
  const [commentsLoadedKey, setCommentsLoadedKey] = useState<string | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const discussionSectionRef = useRef<HTMLElement | null>(null);
  const lastCommentsPassportRef = useRef<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [stagedCommentImage, setStagedCommentImage] = useState<{
    base64: string;
    mimeType: string;
    previewUri: string;
  } | null>(null);
  const commentImageInputRef = useRef<HTMLInputElement | null>(null);
  const [reactingCommentId, setReactingCommentId] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const linkCopiedTimer = useRef<number | null>(null);
  const [downloadState, setDownloadState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  // Cleared on unmount so a pending "back to idle" tick never fires after the
  // card is gone.
  const downloadResetTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (downloadResetTimer.current !== null) window.clearTimeout(downloadResetTimer.current);
      if (linkCopiedTimer.current !== null) window.clearTimeout(linkCopiedTimer.current);
      if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    },
    []
  );
  const [publishPending, setPublishPending] = useState(false);
  // What the reader is currently reporting, if anything. A report is filed as an
  // allegation and never hides the content.
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [openQuestionMenuId, setOpenQuestionMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!openQuestionMenuId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenQuestionMenuId(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openQuestionMenuId]);

  // Mobile 3-snap bottom sheet detents (peek / half / full)
  const [sheetSnap, setSheetSnap] = useState<'peek' | 'half' | 'full'>('half');
  const dragStartYRef = useRef<number | null>(null);

  // Post-pin owner editing & supporting media state
  const [isEditingOwnerDetails, setIsEditingOwnerDetails] = useState(false);
  const [ownerTitleDraft, setOwnerTitleDraft] = useState('');
  const [ownerReportDraft, setOwnerReportDraft] = useState('');
  const [ownerDistrictDraft, setOwnerDistrictDraft] = useState('');
  const [ownerLatDraft, setOwnerLatDraft] = useState('');
  const [ownerLngDraft, setOwnerLngDraft] = useState('');
  const [ownerAddressDraft, setOwnerAddressDraft] = useState('');
  const [supportingCaptionDraft, setSupportingCaptionDraft] = useState('');
  const supportingMediaInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!post) return;
    setSheetSnap('half');
    setIsEditingOwnerDetails(false);
    setOwnerTitleDraft(post.title ?? '');
    setOwnerReportDraft(post.user_report ?? '');
    setOwnerDistrictDraft(post.location.district ?? '');
    setOwnerLatDraft(post.location.latitude !== null ? String(post.location.latitude) : '');
    setOwnerLngDraft(post.location.longitude !== null ? String(post.location.longitude) : '');
    setOwnerAddressDraft(post.location.address ?? '');
    setSupportingCaptionDraft('');
    setOpenQuestionMenuId(null);
  }, [post?.passport_id]);

  useEffect(() => {
    if (!post) return;
    let cancelled = false;
    const passportId = post.passport_id;
    const isNewPassport = lastCommentsPassportRef.current !== passportId;
    lastCommentsPassportRef.current = passportId;
    if (isNewPassport) {
      setComments([]);
      setCommentText('');
      setReplyTarget(null);
      setReplyTexts({});
      setAnswers({});
      setNotice(null);
      setHighlightedCommentId(null);
    }
    const loadKey = `${passportId}:${commentsRevision}`;
    fetchComments(passportId)
      .then((next) => {
        if (cancelled) return;
        setComments(next);
        setCommentsLoadedKey(loadKey);
      })
      .catch(() => {
        if (cancelled) return;
        if (isNewPassport) setComments([]);
        setCommentsLoadedKey(loadKey);
      });
    return () => {
      cancelled = true;
    };
  }, [post?.passport_id, commentsRevision]);

  useEffect(() => {
    if (loading || !post) return;
    if (!targetCommentId && !focusDiscussion) return;
    const currentKey = `${post.passport_id}:${commentsRevision}`;
    if (commentsLoadedKey !== currentKey) return;

    const targetExists = Boolean(
      targetCommentId && findCommentInTree(comments, targetCommentId)
    );
    if (targetCommentId && targetExists) {
      if (viewer) {
        setReplyTarget(targetCommentId);
      }
      setHighlightedCommentId(targetCommentId);
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedCommentId(null);
        highlightTimerRef.current = null;
      }, 5000);
    }

    const timer = window.setTimeout(() => {
      if (targetCommentId && targetExists) {
        const element = document.getElementById(`comment-${targetCommentId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          discussionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } else if (focusDiscussion) {
        discussionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      onTargetCommentHandled?.();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    loading,
    post,
    comments,
    commentsRevision,
    commentsLoadedKey,
    targetCommentId,
    focusDiscussion,
    viewer,
    onTargetCommentHandled,
  ]);

  useEffect(() => {
    if (lightboxIndex === null || !post) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightboxIndex(null);
        const item = post.media[lightboxIndex];
        if (item) setActiveMediaId(item.media_id);
      } else if (event.key === 'ArrowRight') {
        setLightboxIndex((i) => (i === null ? i : (i + 1) % post.media.length));
      } else if (event.key === 'ArrowLeft') {
        setLightboxIndex((i) => (i === null ? i : (i - 1 + post.media.length) % post.media.length));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIndex, post]);

  const thread = useMemo(() => {
    const byId = new Map<string, PublicComment>();
    for (const comment of comments) byId.set(comment.comment_id, comment);
    return comments.filter((comment) => {
      const parentId = comment.parent_comment_id;
      return !parentId || !byId.has(parentId);
    });
  }, [comments]);

  const mobileSnapHeightClass =
    sheetSnap === 'full' ? 'h-[92dvh]' : sheetSnap === 'peek' ? 'h-[38dvh]' : 'h-[64dvh]';

  const cycleSheetSnap = () => {
    setSheetSnap((prev) => (prev === 'peek' ? 'half' : prev === 'half' ? 'full' : 'peek'));
  };

  const handleSheetDragStart = (clientY: number) => {
    dragStartYRef.current = clientY;
  };

  const handleSheetDragEnd = (clientY: number) => {
    const startY = dragStartYRef.current;
    dragStartYRef.current = null;
    if (startY === null) return;
    const deltaY = clientY - startY;
    if (Math.abs(deltaY) < 24) {
      cycleSheetSnap();
      return;
    }
    if (deltaY < 0) {
      setSheetSnap((prev) => (prev === 'peek' ? 'half' : 'full'));
    } else {
      setSheetSnap((prev) => (prev === 'full' ? 'half' : 'peek'));
    }
  };

  const sheetShell = fullscreen
    ? 'fixed inset-0 z-[90] flex h-full w-full flex-col overflow-hidden bg-white'
    : `fixed inset-x-0 bottom-0 z-30 flex ${mobileSnapHeightClass} w-full flex-col overflow-hidden rounded-t-2xl border border-[#e3e3e3] bg-white shadow-[var(--g-elev-2)] transition-[height] duration-200 ease-out ` +
      'sm:inset-x-4 sm:mx-auto sm:max-w-2xl md:left-auto md:right-0 md:inset-y-0 md:mx-0 md:max-w-none md:h-full md:w-[390px] lg:w-[440px] xl:w-[460px] md:rounded-l-2xl md:rounded-tl-none md:rounded-tr-none';

  if (loading && !post) {
    return (
      <aside className={sheetShell}>
        <div className="md:hidden flex justify-center pt-2.5">
          <span className="h-1.5 w-12 rounded-full bg-[#d6d9dd]" aria-hidden="true" />
        </div>
        <div className="flex flex-1 flex-col gap-4 p-5 animate-pulse">
          <div className="aspect-[4/3] w-full rounded-xl bg-[#eef1f6]" />
          <div className="h-5 w-3/4 rounded bg-[#e8edf5]" />
          <div className="h-3.5 w-1/2 rounded bg-[#eef1f6]" />
          <div className="space-y-2 pt-2">
            <div className="h-3 w-full rounded bg-[#f1f3f4]" />
            <div className="h-3 w-5/6 rounded bg-[#f1f3f4]" />
            <div className="h-3 w-4/6 rounded bg-[#f1f3f4]" />
          </div>
        </div>
      </aside>
    );
  }

  if (!post) {
    return (
      <aside className={sheetShell}>
        <div className="md:hidden flex justify-center pt-2.5">
          <span className="h-1.5 w-12 rounded-full bg-[#d6d9dd]" aria-hidden="true" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <MessageCircle className="h-6 w-6 text-[#c7c7c7]" aria-hidden="true" />
          <p className="text-sm text-[#5e5e5e]">This observation is no longer available.</p>
          <button type="button" className="g-btn g-btn-text" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    );
  }

  const category = post.observation_category || 'unknown';
  const color = CATEGORY_COLORS[category] ?? '#78716c';

  const submitComment = async () => {
    const body = commentText.trim();
    if ((!body && !stagedCommentImage) || !post || busy) return;
    if (!viewer) {
      onRequestLogin();
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await createComment(
        post.passport_id,
        body || 'Shared a field photo',
        null,
        stagedCommentImage
          ? { base64: stagedCommentImage.base64, mimeType: stagedCommentImage.mimeType }
          : null
      );
      setNotice(result.message);
      setCommentText('');
      setStagedCommentImage(null);
      setCommentsRevision((n) => n + 1);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not post your comment.');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectCommentImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice('Please select a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setNotice('Comment photo must be 5 MB or smaller.');
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result)
            : reject(new Error('Could not read photo.'));
        reader.onerror = () => reject(new Error('Could not read photo.'));
        reader.readAsDataURL(file);
      });
      const comma = dataUrl.indexOf(',');
      if (comma < 0) return;
      setStagedCommentImage({
        base64: dataUrl.slice(comma + 1),
        mimeType: file.type || 'image/jpeg',
        previewUri: dataUrl,
      });
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not attach image.');
    }
  };

  const applyCommentReactionUpdate = (
    list: PublicComment[],
    commentId: string,
    patch: {
      likes_count: number;
      viewer_liked: boolean;
    }
  ): PublicComment[] =>
    list.map((c) => ({
      ...c,
      ...(c.comment_id === commentId ? patch : {}),
      replies: applyCommentReactionUpdate(c.replies, commentId, patch),
    }));

  const handleReactComment = async (commentId: string) => {
    if (!post || reactingCommentId === commentId) return;
    setReactingCommentId(commentId);
    try {
      const updated = await reactToComment(post.passport_id, commentId);
      setComments((prev) =>
        applyCommentReactionUpdate(prev, commentId, {
          likes_count: updated.likes_count,
          viewer_liked: updated.viewer_liked,
        })
      );
    } catch {
      // Non-fatal reaction failure
    } finally {
      setReactingCommentId(null);
    }
  };

  const submitReply = async (parentId: string) => {
    const body = (replyTexts[parentId] ?? '').trim();
    if (!body || !post || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await createComment(post.passport_id, body, parentId);
      setReplyTexts((prev) => ({ ...prev, [parentId]: '' }));
      setReplyTarget(null);
      setCommentsRevision((n) => n + 1);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not post your reply.');
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = async (questionId: string) => {
    const answer = (answers[questionId] ?? '').trim();
    if (!answer || !post || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await answerQuestion(post.passport_id, questionId, answer);
      setAnswers((prev) => ({ ...prev, [questionId]: '' }));
      onPostChanged(updated);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not save your answer.');
    } finally {
      setBusy(false);
    }
  };

  const applyUpdate = async (patch: UpdatePostPatch, feedback?: string) => {
    if (!post || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await updatePost(post.passport_id, patch);
      onPostChanged(updated);
      if (feedback) setNotice(feedback);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not apply that change.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveOwnerEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || busy) return;
    const latTrim = ownerLatDraft.trim();
    const lngTrim = ownerLngDraft.trim();
    const parsedLat = latTrim ? Number(latTrim) : null;
    const parsedLng = lngTrim ? Number(lngTrim) : null;
    if ((latTrim && !Number.isFinite(parsedLat)) || (lngTrim && !Number.isFinite(parsedLng))) {
      setNotice('Enter valid decimal latitude and longitude coordinates, or clear both.');
      return;
    }
    if ((parsedLat !== null && parsedLng === null) || (parsedLat === null && parsedLng !== null)) {
      setNotice('Provide both latitude and longitude together, or clear both.');
      return;
    }
    await applyUpdate(
      {
        post_title: ownerTitleDraft.trim() || null,
        user_report: ownerReportDraft.trim() || null,
        district: ownerDistrictDraft.trim() || null,
        location_text: ownerAddressDraft.trim() || null,
        latitude: parsedLat,
        longitude: parsedLng,
      },
      'Observation details and coordinates updated.'
    );
    setIsEditingOwnerDetails(false);
  };

  const handleAttachSupportingMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !post || busy) return;
    if (file.size > 10 * 1024 * 1024) {
      setNotice('Supporting photo or video must be 10 MB or smaller.');
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== 'string') {
            reject(new Error('Could not read selected file.'));
            return;
          }
          const comma = reader.result.indexOf(',');
          resolve(comma >= 0 ? reader.result.slice(comma + 1) : reader.result);
        };
        reader.onerror = () => reject(new Error('Could not read selected file.'));
        reader.readAsDataURL(file);
      });
      const mimeType =
        file.type ||
        (file.name.toLowerCase().endsWith('.mp4')
          ? 'video/mp4'
          : file.name.toLowerCase().endsWith('.webm')
            ? 'video/webm'
            : file.name.toLowerCase().endsWith('.mov')
              ? 'video/quicktime'
              : file.name.toLowerCase().endsWith('.3gp')
                ? 'video/3gpp'
                : 'image/jpeg');
      const added = await addPostMedia(post.passport_id, {
        content_base64: base64,
        mime_type: mimeType,
        caption: supportingCaptionDraft.trim() || file.name,
        role: mimeType.startsWith('video/') ? 'video' : 'field',
      });
      setSupportingCaptionDraft('');
      onPostChanged({
        ...post,
        media: [...post.media, added.media],
      });
      setNotice('Supporting site media attached to this observation.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not attach supporting media.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveSupportingMedia = async (mediaId: string) => {
    if (!post || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await removePostMedia(post.passport_id, mediaId);
      if (activeMediaId === mediaId) setActiveMediaId(null);
      onPostChanged(updated);
      setNotice('Media item removed from this observation.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not remove that media item.');
    } finally {
      setBusy(false);
    }
  };

  const setAttachmentDownload = async (
    attachment: PublicObservationAttachment,
    allow: boolean
  ) => {
    if (!post || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const updated = await updateAttachmentDownload(post.passport_id, attachment.attachment_id, allow);
      onPostChanged(updated);
      const next = updated.attachments.find((a) => a.attachment_id === attachment.attachment_id);
      if (next) setPreviewAttachment(next);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not change the download setting.');
    } finally {
      setBusy(false);
    }
  };

  const publishWithDownloads = async (allow: boolean) => {
    if (!post || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      for (const attachment of post.attachments) {
        await updateAttachmentDownload(post.passport_id, attachment.attachment_id, allow);
      }
      const updated = await updatePost(post.passport_id, { is_public: true });
      onPostChanged(updated);
      setPublishPending(false);
      setPreviewAttachment(null);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not publish the post.');
    } finally {
      setBusy(false);
    }
  };

  const hasMedia = post.media.length > 0;
  const active = post.media.find((m) => m.media_id === activeMediaId) ?? post.media[0];
  const activeIndex = post.media.findIndex((m) => m.media_id === active?.media_id);
  const heroReady = !!active?.url;

  const closeLightbox = () => {
    if (lightboxIndex !== null && post) {
      const item = post.media[lightboxIndex];
      if (item) setActiveMediaId(item.media_id);
    }
    setLightboxIndex(null);
  };

  const stepLightbox = (delta: number) => {
    if (!post || post.media.length < 2) return;
    setLightboxIndex((i) => (i === null ? 0 : (i + delta + post.media.length) % post.media.length));
  };

  const downloadMedia = async (media: (typeof post.media)[number]) => {
    if (!media.url || downloadState !== 'idle') return;
    const loc = post.location;
    const place = placePartsOf(loc).join(' · ') || 'Location kept private';
    const coords =
      loc.latitude !== null && loc.longitude !== null
        ? `lat ${loc.latitude.toFixed(4)}, lng ${loc.longitude.toFixed(4)}`
        : 'lat & lng withheld';
    const contributor = post.owner?.display_name ?? 'Earth Talk Contributor';
    const base = `earth-talk-${post.passport_id}-${media.sort_order + 1}`;
    const line1 = `${place} - ${coords}`;
    const line2 = `Earth Talk GeoAI - Contributed by ${contributor}`;

    setDownloadState('busy');
    try {
      if (media.kind === 'video') {
        // The clip is re-encoded at full resolution with the same credit strip
        // burned along the bottom (location · co-ordinates · platform ·
        // contributor), at a bitrate matched to the resolution so it stays HD.
        // One click produces one video file. If the clip cannot be read for
        // stamping, the untouched original is downloaded instead.
        try {
          const stamped = await stampVideoWithCredit(media.url, line1, line2);
          downloadBlob(stamped.blob, `${base}.${downloadExtensionFor(stamped.mime)}`);
        } catch (videoError) {
          const blob = await fetch(media.url).then((response) => {
            if (!response.ok) throw new Error('Could not fetch the clip');
            return response.blob();
          });
          downloadBlob(blob, `${base}.${downloadExtensionFor(media.mime_type)}`);
        }
      } else {
        try {
          const stamped = await stampImageWithCredit(media.url, line1, line2);
          downloadBlob(stamped, `${base}.png`);
        } catch (imageError) {
          // A cross-origin image without CORS headers cannot be stamped; fall
          // back to the original file untouched rather than to nothing.
          const blob = await fetch(media.url).then((response) => {
            if (!response.ok) throw new Error('Could not fetch the image');
            return response.blob();
          });
          downloadBlob(blob, `${base}.${downloadExtensionFor(media.mime_type)}`);
        }
      }
      setDownloadState('done');
    } catch {
      setDownloadState('failed');
    } finally {
      if (downloadResetTimer.current !== null) window.clearTimeout(downloadResetTimer.current);
      downloadResetTimer.current = window.setTimeout(() => setDownloadState('idle'), 2400);
    }
  };

  const sharePassportUrl = () => {
    if (!post?.is_public || typeof window === 'undefined') return;
    const params = new URLSearchParams();
    params.set('view', 'explore');
    params.set('passport', post.passport_id);
    if (fullscreen) params.set('fullscreen', '1');
    if (
      post.location.latitude !== null &&
      post.location.longitude !== null &&
      post.location.precision !== 'private'
    ) {
      params.set('lat', post.location.latitude.toFixed(5));
      params.set('lng', post.location.longitude.toFixed(5));
    }
    const shareUrl = `${window.location.origin}/?${params.toString()}`;
    void navigator.clipboard?.writeText(shareUrl).then(() => {
      setLinkCopied(true);
      if (linkCopiedTimer.current !== null) window.clearTimeout(linkCopiedTimer.current);
      linkCopiedTimer.current = window.setTimeout(() => {
        setLinkCopied(false);
        linkCopiedTimer.current = null;
      }, 2000);
    });
  };

  return (
    <>
      <aside className={sheetShell}>
      {fullscreen && (
        <button
          type="button"
          onClick={onExitFullscreen ?? onClose}
          aria-label="Close Geoscience Passport"
          className="g-icon-btn fixed right-4 top-3 z-[92] h-10 w-10 border border-[#e3e3e3] bg-white/95 text-[#1f1f1f] shadow-[var(--g-elev-2)] backdrop-blur-sm hover:bg-[#f0f4f9]"
        >
          <X className="h-5 w-5" />
        </button>
      )}
      <div className="g-scroll flex-1 overflow-y-auto">
        {/* No-media top bar: drag handle on phones, close control always. */}
        {!hasMedia && !fullscreen && (
          <div className="flex items-center justify-between border-b border-[#e3e3e3] bg-white/95 px-3 py-2">
            <button
              type="button"
              onPointerDown={(e) => handleSheetDragStart(e.clientY)}
              onPointerUp={(e) => handleSheetDragEnd(e.clientY)}
              aria-label="Resize observation sheet"
              className="md:hidden flex items-center justify-center py-2 px-3 -my-1 touch-none"
            >
              <span className="h-1.5 w-12 rounded-full bg-[#d6d9dd]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close card"
              className="g-icon-btn h-8 w-8 border border-[#e3e3e3] text-[#5e5e5e]"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        )}
        {/* Full-screen desktop uses the observation-detail arrangement (media
            and identity on the left, reading and discussion on the right);
            the map sheet keeps its single column. */}
        <div className={fullscreen ? 'mx-auto flex w-full max-w-3xl flex-col lg:max-w-none lg:flex-row lg:items-start' : ''}>
        <div className={fullscreen ? 'lg:w-[52%] xl:w-[55%] lg:shrink-0 lg:sticky lg:top-0' : ''}>
        {hasMedia ? (
          <div className="shrink-0">
            <div className={`relative w-full overflow-hidden bg-[#101820] ${fullscreen ? 'aspect-[4/3] sm:aspect-[16/10] lg:aspect-[4/3]' : 'aspect-[4/3]'}`}>
              {!fullscreen && (
                <button
                  type="button"
                  onPointerDown={(e) => handleSheetDragStart(e.clientY)}
                  onPointerUp={(e) => handleSheetDragEnd(e.clientY)}
                  aria-label="Resize observation sheet"
                  className="md:hidden absolute inset-x-0 top-0 z-10 flex justify-center pt-2.5 pb-3 touch-none"
                >
                  <span className="h-1.5 w-12 rounded-full bg-white/75 shadow-xs" aria-hidden="true" />
                </button>
              )}

              {heroReady ? (
                active.kind === 'video' ? (
                  <div className="block h-full w-full">
                    <video
                      src={active.url || undefined}
                      poster={active.poster_url || undefined}
                      preload="metadata"
                      playsInline
                      controls
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="block h-full w-full">
                    <img
                      src={active.url || undefined}
                      alt={active.caption ?? post.title}
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                  </div>
                )
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-4 text-center">
                  <ImageIcon className="h-7 w-7 text-[#7f8b99]" aria-hidden="true" />
                  <p className="text-[12px] text-[#aeb8c2]">
                    {active?.demo_note ?? (active?.caption ?? 'Image preview is not available on this deployment.')}
                  </p>
                  {active?.kind === 'video' && (
                    <p className="text-[11px] text-[#7f8b99]">Video metadata only.</p>
                  )}
                </div>
              )}

              {/* Scrim keeps the controls and counter readable on any photo */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent" aria-hidden="true" />

              {hasMedia && post.media.length > 1 && (
                <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white">
                  {activeIndex + 1} / {post.media.length}
                </span>
              )}

              {!fullscreen && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close card"
                  className="g-icon-btn absolute right-3 top-3 z-20 h-8 w-8 border border-[#e3e3e3] bg-white text-[#1f1f1f] shadow-[var(--g-elev-1)] hover:bg-[#f0f4f9]"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              )}

              {/* Expand affordance: one tap opens the media full screen. */}
              <button
                type="button"
                onClick={() => setLightboxIndex(activeIndex)}
                aria-label="Preview image full screen"
                className="absolute bottom-3 right-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70"
              >
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {post.media.length > 1 && (
              <div className={`flex gap-2 overflow-x-auto border-b border-[#e3e3e3] bg-white/95 px-4 ${fullscreen ? 'py-2.5 lg:py-3' : 'py-2.5'}`}>
                {post.media.map((item) => (
                  <button
                    key={item.media_id}
                    type="button"
                    onClick={() => setActiveMediaId(item.media_id)}
                    className={`relative flex ${fullscreen ? 'h-12 w-16 sm:h-14 sm:w-20 lg:h-16 lg:w-24' : 'h-11 w-14'} shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
                      item.kind === 'video' ? 'bg-[#101820]' : 'bg-[#f0f4f9]'
                    } ${
                      item.media_id === active?.media_id
                        ? 'border-[#0b57d0] ring-1 ring-[#0b57d0]'
                        : 'border-[#e3e3e3] hover:border-[#8f8f8f]'
                    }`}
                    title={item.caption ?? item.role}
                  >
                    {item.kind === 'video' ? (
                      item.poster_url ? (
                        <img
                          src={item.poster_url}
                          alt={item.caption ?? item.role}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      ) : item.url ? (
                        <video
                          src={`${item.url}#t=0.1`}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover pointer-events-none"
                        />
                      ) : (
                        <span className="h-full w-full bg-[#101820]" aria-hidden="true" />
                      )
                    ) : item.url ? (
                      <img
                        src={item.url}
                        alt={item.caption ?? item.role}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-[#8f8f8f]" aria-hidden="true" />
                    )}
                    {item.kind === 'video' && (
                      <span className="pointer-events-none absolute flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white shadow">
                        <PlayCircle className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* Title block */}
        <div className="border-b border-[#e3e3e3] px-5 pb-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-[18px] font-semibold leading-snug break-words pr-8 md:pr-0">
              {post.title || 'Untitled observation'}
            </h2>
            {post.is_public && (
              <button
                type="button"
                onClick={sharePassportUrl}
                aria-label="Share Geoscience Passport link"
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  linkCopied
                    ? 'bg-[#e6f4ea] text-[#137333]'
                    : 'bg-[#f1f3f4] text-[#3c4043] hover:bg-[#e8edf5]'
                }`}
              >
                {linkCopied ? (
                  <>
                    <Check className="h-3 w-3" aria-hidden="true" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Share2 className="h-3 w-3" aria-hidden="true" />
                    <span>Share</span>
                  </>
                )}
              </button>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-[#5e5e5e]">
            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color }}>
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              {categoryLabel(category)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{formatDate(post.created_at)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-[11.5px] font-semibold text-[#0b57d0] tabular-nums">
              {formatPassportId(post.passport_id)}
            </span>
          </div>
          {(() => {
            const loc = post.location;
            const hasCoords =
              loc.latitude !== null &&
              loc.longitude !== null &&
              Number.isFinite(loc.latitude) &&
              Number.isFinite(loc.longitude) &&
              loc.precision !== 'private';

            const placeParts = placePartsOf(loc);

            if (hasCoords) {
              return (
                <div className="mt-3 rounded-xl border border-[#e3e3e3] bg-[#f8fafd] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1 text-[11px] text-[#5e5e5e]">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      <span className="font-medium text-[#3c4043]">Location</span>
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate(loc.latitude!, loc.longitude!, post.title)
                      }
                      className="inline-flex h-7 items-center gap-1 rounded-full bg-[#0b57d0] px-3 text-[11px] font-medium text-white transition-colors hover:bg-[#0842a0]"
                    >
                      <Navigation className="h-3 w-3" aria-hidden="true" />
                      Navigate
                    </button>
                  </div>
                  {placeParts.length > 0 && (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-[#3c4043]">
                      {placeParts.join(' · ')}
                    </p>
                  )}
                  <p className="mt-1 font-mono tabular-nums text-[11px] text-[#8f8f8f]">
                    lat {loc.latitude!.toFixed(4)}, lng {loc.longitude!.toFixed(4)}
                  </p>
                </div>
              );
            }

            return (
              <div className="mt-3 rounded-xl border border-[#e3e3e3] bg-[#f8fafd] px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[12px] font-medium text-[#3c4043]">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#5e5e5e]" aria-hidden="true" />
                  <span>No map pin yet</span>
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-[#5e5e5e]">
                  Published coordinates are not available for this observation yet. The contributor
                  can add coordinates via My Earth Talk, or viewers can share locality clues in
                  the Discussion thread below.
                </p>
              </div>
            );
          })()}
          </div>
          </div>

          <div className={fullscreen ? 'min-w-0 flex-1' : ''}>
        <div className="space-y-6 p-4 sm:space-y-7 sm:p-5">
          {/* Contributor's report */}
          <section>
            <h3 className="g-panel-title">
              <User className="h-3.5 w-3.5 text-[#5e5e5e]" aria-hidden="true" />
              <span>Contributor&apos;s report</span>
            </h3>
            {post.user_report ? (
              <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{post.user_report}</p>
            ) : (
              <p className="text-[13px] text-[#8f8f8f] italic">
                No written report has been added yet.
              </p>
            )}
            {post.attachments.length > 0 && (
              <div className="mt-4">
                <ul className="divide-y divide-[#e9eaec]">
                  {post.attachments.map((attachment) => (
                    <li key={attachment.attachment_id} className="-mx-2">
                      <button
                        type="button"
                        onClick={() => setPreviewAttachment(attachment)}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-[#f6f8fb]"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Paperclip
                            className="h-3.5 w-3.5 shrink-0 text-[#5e5e5e]"
                            aria-hidden="true"
                          />
                          <span className="truncate text-[13px] font-medium leading-tight text-[#1f1f1f]">
                            {attachment.title}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-[#8f8f8f] flex items-center gap-2">
                          {!attachment.allow_download && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[10px] font-medium text-[#5e5e5e]">
                              <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                              Read only
                            </span>
                          )}
                          {attachment.size_bytes !== null ? formatBytes(attachment.size_bytes) : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {post.owner ? (
              <div className="mt-4 flex items-center gap-2.5 border-t border-[#e9eaec] pt-3">
                <DiscussionAvatar
                  src={post.owner.avatar_url}
                  name={post.owner.display_name}
                  fallbackId={post.owner.public_user_id}
                  sizeClass="h-8 w-8"
                />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-[#1f1f1f]">
                    {post.owner.display_name ?? 'Earth Talk contributor'}
                  </p>
                  <p className="text-[10px] text-[#8f8f8f]">Contributor</p>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2.5 border-t border-[#e9eaec] pt-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e8f0fe] text-[11px] font-semibold text-[#0b57d0]">
                  ET
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-[#1f1f1f]">
                    Earth Talk Contributor
                  </p>
                  <p className="text-[10px] text-[#8f8f8f]">Contributor · Earth Talk</p>
                </div>
              </div>
            )}
          </section>

          {/* AI interpretation */}
          <section>
            <h3 className="g-panel-title">
              <Brain className="h-3.5 w-3.5 text-[#0b57d0]" aria-hidden="true" />
              <span>AI interpretation</span>
            </h3>

            {post.ai.primary_interpretation ? (
              <p className="text-[14px] leading-relaxed text-[#1f1f1f]">{post.ai.primary_interpretation}</p>
            ) : (
              <p className="text-[13px] text-[#8f8f8f] italic">No interpretation produced.</p>
            )}

            {post.ai.observed_features.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-medium text-[#3c4043]">Observed features</p>
                <ul className="mt-1 space-y-1">
                  {post.ai.observed_features.map((feature, index) => (
                    <li key={`${feature}-${index}`} className="text-[14px] text-[#1f1f1f] flex gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#2b7f3f] shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-3 text-[13px] leading-relaxed text-[#5e5e5e]">{post.ai.reasoning}</p>

            {post.ai.alternative_possibilities.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-medium text-[#3c4043]">Alternative possibilities</p>
                <ul className="mt-1 space-y-1">
                  {post.ai.alternative_possibilities.map((alt, index) => (
                    <li key={index} className="text-[13px] text-[#5e5e5e]">
                      • {alt}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {post.ai.uncertainties.length > 0 && (
              <div className="mt-3 text-[13px] text-[#5e5e5e]">
                <span className="font-medium text-[#3c4043]">Uncertainties:</span>{' '}
                {post.ai.uncertainties.join(' ')}
              </div>
            )}

            <p className="mt-3 text-[11px] text-[#8f8f8f] leading-relaxed">{post.ai.disclaimer}</p>

            {post.ai.safety_note && (
              <div className="mt-3 p-3 rounded-lg bg-[#fff3e0] border border-[#ffdf99] text-[13px] text-[#9f6108] flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{post.ai.safety_note}</span>
              </div>
            )}
          </section>

          {/* Questions & answers */}
          {post.questions.length > 0 && (
            <section>
              <h3 className="g-panel-title">
                <HelpCircle className="h-3.5 w-3.5 text-[#5e5e5e]" aria-hidden="true" />
                <span>Questions &amp; answers</span>
              </h3>
              <div className="space-y-3 mt-2">
                {post.questions.map((question) => (
                  <div key={question.question_id} className="rounded-xl border border-[#e3e3e3] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[14px] font-medium text-[#1f1f1f]">{question.question}</p>
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenQuestionMenuId((prev) =>
                              prev === question.question_id ? null : question.question_id
                            )
                          }
                          aria-label="Question options"
                          aria-haspopup="menu"
                          aria-expanded={openQuestionMenuId === question.question_id}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-[#5b655d] hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-[#0b57d0]"
                        >
                          <MoreVertical className="h-4 w-4" aria-hidden="true" />
                        </button>
                        {openQuestionMenuId === question.question_id && (
                          <>
                            <div
                              className="fixed inset-0 z-20"
                              aria-hidden="true"
                              onClick={() => setOpenQuestionMenuId(null)}
                            />
                            <div
                              role="menu"
                              className="absolute right-0 top-full z-30 mt-1 w-40 rounded-xl border border-[#e1e5db] bg-white p-1 shadow-lg"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenQuestionMenuId(null);
                                  setReportTarget({
                                    type: 'question',
                                    id: question.question_id,
                                    label: question.question,
                                  });
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-[#b3261e] hover:bg-[#fdf2f2]"
                              >
                                <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Report question</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {question.status === 'answered' && question.answer ? (
                      <div className="mt-2 text-[14px] leading-relaxed text-[#3c4043]">
                        {question.answer}
                        {question.answered_at && (
                          <span className="block mt-1 text-[10px] text-[#8f8f8f]">
                            {formatDate(question.answered_at)}
                          </span>
                        )}
                      </div>
                    ) : post.viewer_is_owner &&
                      post.open_questions.some((q) => q.question_id === question.question_id) ? (
                      <div className="mt-2">
                        <textarea
                          value={answers[question.question_id] ?? ''}
                          onChange={(e) =>
                            setAnswers((prev) => ({ ...prev, [question.question_id]: e.target.value }))
                          }
                          rows={2}
                          placeholder="Your answer…"
                          className="w-full rounded-lg border border-[#c7c7c7] p-2.5 text-[13px] focus:outline-none focus:border-[#0b57d0]"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          className="g-btn g-btn-tonal h-8 px-3 mt-1.5 text-[12px] disabled:opacity-50"
                          onClick={() => submitAnswer(question.question_id)}
                        >
                          Answer
                        </button>
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-[#8f8f8f] italic">
                        Waiting for the contributor to answer.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Discussion */}
          <section
            ref={discussionSectionRef}
            id="discussion-section"
            className="rounded-2xl border border-[#e7eae0] bg-[#f9faf5] p-3.5 sm:p-4 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="g-panel-title !mb-0">
                <MessagesSquare className="h-3.5 w-3.5 text-[#5e5e5e]" aria-hidden="true" />
                <span>Discussion</span>
                {comments.length > 0 && (
                  <span className="text-[11px] text-[#5e5e5e] font-mono tabular-nums">
                    {post.comment_count}
                  </span>
                )}
              </h3>
            </div>

            {notice && (
              <div className="text-[12px] text-[#3c4043] bg-white border border-[#e2e6dc] rounded-xl px-3 py-2">
                {notice}
              </div>
            )}

            {thread.length === 0 ? (
              <p className="py-2 text-[12.5px] text-[#6d746b] italic">
                No comments yet. Start the discussion below.
              </p>
            ) : (
              <div className="space-y-4">
                {thread.map((comment) => (
                  <CommentThread
                    key={comment.comment_id}
                    comment={comment}
                    opUserId={post.owner?.public_user_id ?? null}
                    viewer={viewer}
                    busy={busy}
                    reactingCommentId={reactingCommentId}
                    replyTarget={replyTarget}
                    replyTexts={replyTexts}
                    targetCommentId={targetCommentId}
                    highlightedCommentId={highlightedCommentId}
                    onReplyToggle={(id) =>
                      setReplyTarget(replyTarget === id ? null : id)
                    }
                    onReplyTextChange={(id, text) =>
                      setReplyTexts((prev) => ({ ...prev, [id]: text }))
                    }
                    onSubmitReply={(id) => submitReply(id)}
                    onReact={(id) => void handleReactComment(id)}
                    onRequestLogin={onRequestLogin}
                    onReport={(target) =>
                      setReportTarget({
                        type: 'comment',
                        id: target.comment_id,
                        label: target.author.display_name ?? target.author.public_user_id,
                      })
                    }
                  />
                ))}
              </div>
            )}

            {/* Add to the conversation composer */}
            <div className="border-t border-[#e5e8de] pt-3 space-y-2">
              {stagedCommentImage && (
                <div className="relative inline-flex items-center gap-2 rounded-xl border border-[#d6dcd3] bg-white p-1.5">
                  <img
                    src={stagedCommentImage.previewUri}
                    alt="Staged discussion attachment"
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setStagedCommentImage(null)}
                    aria-label="Remove attached discussion photo"
                    className="rounded-full p-1 text-[#5e5e5e] hover:bg-[#f2f4ee] hover:text-[#b3261e]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <input
                ref={commentImageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleSelectCommentImage}
              />

              <div className="flex items-center gap-2">
                {viewer ? (
                  <span className="hidden min-[380px]:inline-flex shrink-0">
                    <DiscussionAvatar
                      src={viewer.avatar_url}
                      name={viewer.display_name}
                      fallbackId={viewer.public_user_id}
                      sizeClass="h-9 w-9"
                    />
                  </span>
                ) : (
                  <span className="hidden min-[380px]:flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e4e8df] text-[#4e5951]">
                    <User className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}

                <div className="flex flex-1 min-w-0 items-center gap-1 rounded-full border border-[#d6d9d2] bg-white pl-3.5 pr-1.5 py-0.5 shadow-2xs focus-within:border-[#2b7f3f]">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void submitComment();
                      }
                    }}
                    placeholder="Add to the conversation"
                    className="min-w-0 flex-1 bg-transparent py-2 text-[14px] sm:text-[13px] text-[#1f1f1f] placeholder-[#6b726c] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => commentImageInputRef.current?.click()}
                    title="Attach photo"
                    aria-label="Attach image to comment"
                    className="flex h-10 w-10 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full text-[#4e5951] transition-colors hover:bg-[#f1f4ec]"
                  >
                    <ImageIcon className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={busy || (!commentText.trim() && !stagedCommentImage)}
                  onClick={() => void submitComment()}
                  aria-label="Send comment"
                  title="Send"
                  className="flex h-11 w-11 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-[#d26c2a] text-white shadow-xs transition-colors hover:bg-[#b85a1e] disabled:opacity-45"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <PublicVisibilityNote />
            </div>
          </section>

          {/* Owner controls */}
          {post.viewer_is_owner && (
            <section className="rounded-xl border border-[#e3e3e3] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[13px] font-medium text-[#1f1f1f] flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-[#0b57d0]" aria-hidden="true" />
                  <span>Manage Your Observation</span>
                </h3>
                <span className="text-[11px] text-[#5e5e5e]">
                  {post.is_public
                    ? post.location.precision === 'private'
                      ? 'Public · Unpinned'
                      : `Pinned (${post.location.precision})`
                    : 'Private record'}
                </span>
              </div>

              <div className="space-y-2.5">
                {/* Quick Unpin from Map action when currently pinned */}
                {post.location.precision !== 'private' && (
                  <button
                    type="button"
                    className="g-btn g-btn-tonal w-full text-[12px] disabled:opacity-50"
                    disabled={busy}
                    onClick={() =>
                      applyUpdate(
                        { location_precision: 'private' },
                        'Pin removed from the public map. Your observation record remains saved.'
                      )
                    }
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Remove Pin from Public Map (Keep Post)</span>
                  </button>
                )}

                <button
                  type="button"
                  className="g-btn g-btn-tonal w-full text-[12px] disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    if (!post.is_public && post.attachments.length > 0) {
                      setPublishPending(true);
                    } else {
                      applyUpdate(
                        { is_public: !post.is_public },
                        post.is_public
                          ? 'Observation set to private and removed from public map and feed.'
                          : 'Observation published.'
                      );
                    }
                  }}
                >
                  {post.is_public ? (
                    <>
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Make Entire Observation Private</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Publish Observation</span>
                    </>
                  )}
                </button>

                {publishPending && (
                  <div className="rounded-lg border border-[#e3e3e3] bg-[#f8fafd] p-3 space-y-2">
                    <p className="text-[12px] font-medium text-[#1f1f1f]">
                      Choose download permission for the {post.attachments.length} attached
                      document{post.attachments.length === 1 ? '' : 's'} before publishing.
                    </p>
                    <button
                      type="button"
                      className="g-btn g-btn-filled w-full text-[12px] disabled:opacity-50"
                      disabled={busy}
                      onClick={() => publishWithDownloads(true)}
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Publish — downloads on</span>
                    </button>
                    <button
                      type="button"
                      className="g-btn g-btn-tonal w-full text-[12px] disabled:opacity-50"
                      disabled={busy}
                      onClick={() => publishWithDownloads(false)}
                    >
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Publish — read only</span>
                    </button>
                    <button
                      type="button"
                      className="w-full text-[12px] text-[#5e5e5e] hover:text-[#1f1f1f] underline disabled:opacity-50"
                      disabled={busy}
                      onClick={() => setPublishPending(false)}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-[#3c4043] mb-1">
                    Map location precision
                  </label>
                  <select
                    value={post.location.precision}
                    disabled={busy}
                    onChange={(e) =>
                      applyUpdate(
                        { location_precision: e.target.value as LocationPrivacyLevel },
                        'Map location precision updated.'
                      )
                    }
                    className="w-full h-9 rounded-lg border border-[#c7c7c7] px-2.5 text-[13px] bg-white focus:outline-none focus:border-[#0b57d0] disabled:opacity-50"
                  >
                    {PRECISION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {PRECISION_LABELS[option]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Edit Title, Field Notes & Coordinates */}
                <div className="pt-1 border-t border-[#e3e3e3]">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setIsEditingOwnerDetails((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#0b57d0] hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {isEditingOwnerDetails
                        ? 'Hide Edit Form'
                        : 'Edit Title, Field Notes & Coordinates'}
                    </span>
                  </button>

                  {isEditingOwnerDetails && (
                    <form onSubmit={handleSaveOwnerEdits} className="mt-2.5 space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-[#3c4043] mb-1">
                          Observation title
                        </label>
                        <input
                          type="text"
                          value={ownerTitleDraft}
                          onChange={(e) => setOwnerTitleDraft(e.target.value)}
                          maxLength={140}
                          className="w-full h-9 rounded-lg border border-[#c7c7c7] px-2.5 text-[13px] focus:outline-none focus:border-[#0b57d0]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#3c4043] mb-1">
                          Field report / context notes
                        </label>
                        <textarea
                          rows={3}
                          value={ownerReportDraft}
                          onChange={(e) => setOwnerReportDraft(e.target.value)}
                          maxLength={2000}
                          placeholder="Outcrop context, fresh fracture surface, scale reference..."
                          className="w-full rounded-lg border border-[#c7c7c7] p-2.5 text-[13px] focus:outline-none focus:border-[#0b57d0]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-[#3c4043] mb-1">
                            Latitude
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={ownerLatDraft}
                            onChange={(e) => setOwnerLatDraft(e.target.value)}
                            placeholder="-1.4980"
                            className="w-full h-9 rounded-lg border border-[#c7c7c7] px-2.5 font-mono tabular-nums text-[12px] focus:outline-none focus:border-[#0b57d0]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[#3c4043] mb-1">
                            Longitude
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={ownerLngDraft}
                            onChange={(e) => setOwnerLngDraft(e.target.value)}
                            placeholder="29.6330"
                            className="w-full h-9 rounded-lg border border-[#c7c7c7] px-2.5 font-mono tabular-nums text-[12px] focus:outline-none focus:border-[#0b57d0]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#3c4043] mb-1">
                          Rwanda District
                        </label>
                        <input
                          type="text"
                          value={ownerDistrictDraft}
                          onChange={(e) => setOwnerDistrictDraft(e.target.value)}
                          placeholder="e.g. Musanze"
                          maxLength={60}
                          className="w-full h-9 rounded-lg border border-[#c7c7c7] px-2.5 text-[13px] focus:outline-none focus:border-[#0b57d0]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#3c4043] mb-1">
                          Outcrop / Landmark note
                        </label>
                        <input
                          type="text"
                          value={ownerAddressDraft}
                          onChange={(e) => setOwnerAddressDraft(e.target.value)}
                          placeholder="e.g. Roadcut 400 m east of bridge"
                          maxLength={200}
                          className="w-full h-9 rounded-lg border border-[#c7c7c7] px-2.5 text-[13px] focus:outline-none focus:border-[#0b57d0]"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={busy}
                        className="g-btn g-btn-filled w-full text-[12px] disabled:opacity-50"
                      >
                        Save Observation Changes
                      </button>
                    </form>
                  )}
                </div>

                {/* Attach or Remove Supporting Site Videos & Extra Photos */}
                <div className="pt-2 border-t border-[#e3e3e3] space-y-2">
                  <p className="text-[11px] font-medium text-[#3c4043]">
                    Supporting Site Videos &amp; Photos (attached to pin without re-running AI)
                  </p>
                  <input
                    type="text"
                    value={supportingCaptionDraft}
                    onChange={(e) => setSupportingCaptionDraft(e.target.value)}
                    placeholder="Optional caption (e.g. 360° outcrop video, fresh fracture, scale coin)"
                    maxLength={200}
                    className="w-full h-8 rounded-lg border border-[#c7c7c7] px-2.5 text-[12px] focus:outline-none focus:border-[#0b57d0]"
                  />
                  <input
                    ref={supportingMediaInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/3gpp,video/webm,video/quicktime"
                    className="hidden"
                    onChange={handleAttachSupportingMedia}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => supportingMediaInputRef.current?.click()}
                    className="g-btn g-btn-tonal w-full text-[12px] disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Attach Supporting Video or Photo</span>
                  </button>

                  {post.media.length > 1 && !post.is_demo && (
                    <div className="space-y-1 pt-1">
                      {post.media.slice(1).map((item, idx) => (
                        <div
                          key={item.media_id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[#e3e3e3] px-2.5 py-1.5 text-[11px]"
                        >
                          <span className="truncate text-[#3c4043]">
                            {item.kind === 'video' ? 'Video' : 'Photo'} #{idx + 2}
                            {item.caption ? ` · ${item.caption}` : ''}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleRemoveSupportingMedia(item.media_id)}
                            className="inline-flex items-center gap-1 text-[#b3261e] hover:underline shrink-0"
                            aria-label={`Remove supporting media ${idx + 2}`}
                          >
                            <Trash2 className="h-3 w-3" aria-hidden="true" />
                            <span>Remove</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-[#8f8f8f]">
                Changes to visibility, map precision, coordinates, or media take effect immediately.
              </p>
            </section>
          )}

          {/* Primary action: the immutable record this card only annotates. The
              full-screen passport closes via its header control, so the open
              button is only shown on the map sheet. */}
          {!fullscreen && (
            <div className="pt-2">
              <button
                type="button"
                className="g-btn g-btn-filled w-full h-11 text-[13px]"
                onClick={() => onOpenPassport(post.passport_id)}
              >
                <ArrowLeft className="h-4 w-4 rotate-90" aria-hidden="true" />
                <span>Open full Geoscience Passport</span>
              </button>
            </div>
          )}
        </div>
          </div>
        </div>
      </div>
      </aside>

      {/* Full-screen media preview. A single action from the card, closed with
          X, Escape, or the arrow keys; images and clips both open here. */}
      {lightboxIndex !== null && post && post.media[lightboxIndex] && (
        <div
          ref={lightboxDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Full screen media preview"
          className={`fixed inset-0 ${fullscreen ? 'z-[95]' : 'z-[80]'} flex flex-col bg-black/95`}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-mono text-[11px] font-medium text-white/70">
              {lightboxIndex + 1} / {post.media.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void downloadMedia(post.media[lightboxIndex])}
                disabled={downloadState !== 'idle'}
                aria-label="Download the original file, with its location details and credit"
                title={
                  downloadState === 'busy'
                    ? 'Preparing download…'
                    : downloadState === 'done'
                      ? 'Downloaded'
                      : downloadState === 'failed'
                        ? 'Download failed'
                        : 'Download with location details and credit'
                }
                className="g-icon-btn h-9 w-9 text-white hover:bg-white/10 disabled:opacity-70"
              >
                {downloadState === 'busy' ? (
                  <span
                    className="block h-5 w-5 animate-spin rounded-full border-2 border-white/70 border-t-transparent"
                    aria-hidden="true"
                  />
                ) : (
                  <Download className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={closeLightbox}
                aria-label="Close full screen preview"
                className="g-icon-btn h-9 w-9 text-white hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {post.media.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => stepLightbox(-1)}
                aria-label="Previous image"
                className="absolute left-1 top-1/2 z-10 -translate-y-1/2 g-icon-btn h-10 w-10 text-white hover:bg-white/10 sm:left-2"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => stepLightbox(1)}
                aria-label="Next image"
                className="absolute right-1 top-1/2 z-10 -translate-y-1/2 g-icon-btn h-10 w-10 text-white hover:bg-white/10 sm:right-2"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-5">
            {post.media[lightboxIndex].kind === 'video' &&
            post.media[lightboxIndex].url ? (
              <video
                src={post.media[lightboxIndex].url || undefined}
                poster={post.media[lightboxIndex].poster_url || undefined}
                controls
                playsInline
                preload="metadata"
                className="max-h-full max-w-full"
              />
            ) : (
              <img
                src={post.media[lightboxIndex].url || undefined}
                alt={post.media[lightboxIndex].caption ?? post.title}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>

          <div className="px-4 py-3 text-center text-[12px] text-white/70">
            {post.media[lightboxIndex].caption || post.title}
          </div>
        </div>
      )}

      {previewAttachment && (
        <div
          ref={attachmentDialogRef}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[#0b0f14]/80 p-3 backdrop-blur-sm sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={previewAttachment.title}
        >
          <div className="flex h-full max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-[#e3e3e3] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-[#1f1f1f]">
                  {previewAttachment.title}
                </p>
                <p className="truncate font-mono text-[11px] text-[#8f8f8f]">
                  {previewAttachment.filename}
                  {previewAttachment.size_bytes !== null
                    ? ` · ${formatBytes(previewAttachment.size_bytes)}`
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {post.viewer_is_owner && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setAttachmentDownload(
                        previewAttachment,
                        !previewAttachment.allow_download
                      )
                    }
                    title="Choose whether readers may download this document"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#c7c7c7] px-3.5 text-[12px] font-medium text-[#3c4043] transition-colors hover:bg-[#f6f8fb] disabled:opacity-50"
                  >
                    {previewAttachment.allow_download ? (
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {previewAttachment.allow_download ? 'Downloads: on' : 'Downloads: off'}
                  </button>
                )}
                {!previewAttachment.allow_download && (
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#f1f3f4] px-3.5 text-[12px] font-medium text-[#5e5e5e]">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    Read only
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  aria-label="Close document preview"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f1f3f4] text-[#5e5e5e] transition-colors hover:bg-[#e3e6e8]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <PdfPreview
              url={previewAttachment.url}
              filename={previewAttachment.filename}
              allowDownload={previewAttachment.allow_download}
            />
          </div>
        </div>
      )}

      {reportTarget && (
        <ReportDialog
          isOpen
          onClose={() => setReportTarget(null)}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          observationPassportId={post.passport_id}
          targetLabel={reportTarget.label}
        />
      )}
    </>
  );
};

/**
 * The note shown above a comment or reply box. Comments on a public post are
 * public and attributed to the reader's display name, so the reader is told so
 * before they type rather than after.
 */
const PublicVisibilityNote: React.FC = () => (
  <p className="mt-1 text-[10.5px] leading-snug text-[#8f8f8f]">
    Public post: your words, your display name and the time are visible to everyone.
  </p>
);

function containsComment(comment: PublicComment, targetId: string): boolean {
  if (comment.comment_id === targetId) return true;
  return comment.replies.some((reply) => containsComment(reply, targetId));
}

function findCommentInTree(list: PublicComment[], targetId: string): PublicComment | null {
  for (const item of list) {
    if (item.comment_id === targetId) return item;
    const nested = findCommentInTree(item.replies, targetId);
    if (nested) return nested;
  }
  return null;
}

interface CommentThreadProps {
  comment: PublicComment;
  opUserId?: string | null;
  viewer: CommunityUser | null;
  busy: boolean;
  reactingCommentId: string | null;
  replyTarget: string | null;
  replyTexts: Record<string, string>;
  targetCommentId?: string | null;
  highlightedCommentId?: string | null;
  onReplyToggle: (commentId: string) => void;
  onReplyTextChange: (commentId: string, text: string) => void;
  onSubmitReply: (commentId: string) => void;
  onReact: (commentId: string) => void;
  onRequestLogin: () => void;
  onReport: (comment: PublicComment) => void;
  depth?: number;
}

const MAX_VISIBLE_REPLIES = 2;

/**
 * Threaded comment card matching the Earth Talk discussion design:
 * circular avatar, OP badge, relative time, overflow menu, heart/reply pills,
 * L-shaped curved reply connectors, and collapsible extra replies.
 */
const CommentThread: React.FC<CommentThreadProps> = ({
  comment,
  opUserId,
  viewer,
  busy,
  reactingCommentId,
  replyTarget,
  replyTexts,
  targetCommentId = null,
  highlightedCommentId = null,
  onReplyToggle,
  onReplyTextChange,
  onSubmitReply,
  onReact,
  onRequestLogin,
  onReport,
  depth = 0,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState(false);
  const hasTargetReply = Boolean(
    targetCommentId && comment.replies.some((reply) => containsComment(reply, targetCommentId))
  );
  useEffect(() => {
    if (hasTargetReply) setExpandedReplies(true);
  }, [hasTargetReply]);

  const replyText = replyTexts[comment.comment_id] ?? '';
  const replying = replyTarget === comment.comment_id;
  const isHighlighted = highlightedCommentId === comment.comment_id;
  const isOp = Boolean(opUserId && comment.author.public_user_id === opUserId);
  const authorName = comment.author.display_name ?? comment.author.public_user_id;
  const likesCount = comment.likes_count ?? 0;

  const hasExtraReplies = comment.replies.length > MAX_VISIBLE_REPLIES;
  const visibleReplies =
    hasExtraReplies && !expandedReplies
      ? comment.replies.slice(0, MAX_VISIBLE_REPLIES)
      : comment.replies;
  const hiddenReplyCount = Math.max(0, comment.replies.length - visibleReplies.length);

  return (
    <div className="min-w-0">
      <div
        id={`comment-${comment.comment_id}`}
        className={`flex items-start gap-2.5 rounded-xl transition-colors duration-300 ${
          isHighlighted ? 'bg-[#e8f0fe]/90 p-2 -m-2 ring-2 ring-[#0b57d0]/45' : ''
        }`}
      >
        <DiscussionAvatar
          src={comment.author.avatar_url}
          name={comment.author.display_name}
          fallbackId={comment.author.public_user_id}
          sizeClass="h-9 w-9"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="truncate text-[13.5px] font-semibold text-[#18211b]">
                {authorName}
              </span>
              {isOp && (
                <span className="inline-flex items-center rounded-full bg-[#dff2e1] px-2 py-0.5 text-[10.5px] font-semibold text-[#1f6b32]">
                  OP
                </span>
              )}
              <span className="text-[12px] text-[#667068]" aria-hidden="true">
                ·
              </span>
              <span className="text-[12px] text-[#667068]">
                {formatRelativeTime(comment.created_at)}
              </span>
            </div>

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-label="Comment options"
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#5b655d] hover:bg-black/5"
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    aria-hidden="true"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-xl border border-[#e1e5db] bg-white p-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onReport(comment);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-[#b3261e] hover:bg-[#fdf2f2]"
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{depth === 0 ? 'Report comment' : 'Report reply'}</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <p className="mt-1 text-[13.5px] leading-relaxed text-[#1f2621] whitespace-pre-wrap break-words">
            {comment.body}
          </p>

          {comment.image_url && (
            <div className="mt-2">
              <img
                src={comment.image_url}
                alt="Comment attachment"
                referrerPolicy="no-referrer"
                className="max-h-56 w-auto rounded-xl border border-[#e0e4da] object-contain"
              />
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={reactingCommentId === comment.comment_id}
              onClick={() => onReact(comment.comment_id)}
              aria-label={`Love comment (${likesCount})`}
              aria-pressed={Boolean(comment.viewer_liked)}
              title="Love"
              className={`inline-flex min-h-[40px] sm:min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors active:scale-[0.98] ${
                comment.viewer_liked
                  ? 'border-[#e5a3ac] bg-[#fdf2f4] text-[#b42334] shadow-2xs'
                  : 'border-[#d6dcd3] bg-white text-[#263029] hover:border-[#e5a3ac] hover:bg-[#fff7f8] hover:text-[#b42334]'
              }`}
            >
              <Heart
                className={`h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0 ${
                  comment.viewer_liked ? 'fill-current text-[#c81e32]' : 'text-[#b42334]'
                }`}
                aria-hidden="true"
              />
              <span className="font-mono text-[11.5px] tabular-nums opacity-85">{likesCount}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!viewer) {
                  onRequestLogin();
                  return;
                }
                onReplyToggle(comment.comment_id);
              }}
              className="inline-flex min-h-[40px] sm:min-h-[36px] items-center gap-1.5 rounded-full border border-[#d6dcd3] bg-white px-3 py-1.5 text-[12px] font-medium text-[#263029] whitespace-nowrap transition-colors hover:bg-[#f3f5f0] active:scale-[0.98]"
            >
              <MessageSquare className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0" aria-hidden="true" />
              <span>Reply</span>
            </button>
          </div>

          {replying && (
            <div className="mt-2.5 rounded-xl border border-[#dce1d7] bg-white p-2.5 sm:p-3">
              <textarea
                value={replyText}
                onChange={(e) => onReplyTextChange(comment.comment_id, e.target.value)}
                rows={2}
                placeholder={`Reply to ${authorName}…`}
                className="w-full rounded-lg border border-[#d4d8cf] bg-[#fafbf8] p-2.5 text-[14px] sm:text-[13px] focus:border-[#2b7f3f] focus:outline-none"
                autoFocus
              />
              <PublicVisibilityNote />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onReplyToggle(comment.comment_id)}
                  className="min-h-[40px] sm:min-h-[34px] rounded-full px-3.5 py-1.5 text-[12px] font-medium text-[#5e5e5e] hover:bg-[#f1f3ee]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !replyText.trim()}
                  onClick={() => onSubmitReply(comment.comment_id)}
                  className="min-h-[40px] sm:min-h-[34px] rounded-full bg-[#d26c2a] px-4 py-1.5 text-[12px] font-medium text-white hover:bg-[#b85a1e] disabled:opacity-45"
                >
                  Reply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nested replies with curved L-shaped branch lines (indentation capped on mobile so deep threads stay wide) */}
      {comment.replies.length > 0 && (
        <div className={`mt-3 ${depth < 2 ? 'pl-2.5 sm:pl-4' : 'pl-1 sm:pl-2.5'}`}>
          {visibleReplies.map((reply, idx) => {
            const isLastRow = idx === visibleReplies.length - 1 && !hasExtraReplies;
            return (
              <div
                key={reply.comment_id}
                className={`relative pb-3 ${depth < 2 ? 'pl-4 sm:pl-6' : 'pl-3 sm:pl-4'}`}
              >
                {!isLastRow && (
                  <span
                    className="pointer-events-none absolute left-0 top-0 bottom-0 w-0.5 bg-[#d4ddd2]"
                    aria-hidden="true"
                  />
                )}
                <span
                  className={`pointer-events-none absolute left-0 top-0 h-5 rounded-bl-xl border-b-2 border-l-2 border-[#d4ddd2] ${
                    depth < 2 ? 'w-3.5 sm:w-5' : 'w-2.5 sm:w-3.5'
                  }`}
                  aria-hidden="true"
                />
                <CommentThread
                  comment={reply}
                  opUserId={opUserId}
                  viewer={viewer}
                  busy={busy}
                  reactingCommentId={reactingCommentId}
                  replyTarget={replyTarget}
                  replyTexts={replyTexts}
                  targetCommentId={targetCommentId}
                  highlightedCommentId={highlightedCommentId}
                  onReplyToggle={onReplyToggle}
                  onReplyTextChange={onReplyTextChange}
                  onSubmitReply={onSubmitReply}
                  onReact={onReact}
                  onRequestLogin={onRequestLogin}
                  onReport={onReport}
                  depth={depth + 1}
                />
              </div>
            );
          })}

          {hasExtraReplies && (
            <div className="relative pl-6 pt-0.5">
              <span
                className="pointer-events-none absolute left-0 top-0 h-3.5 w-5 rounded-bl-xl border-b-2 border-l-2 border-[#d4ddd2]"
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => setExpandedReplies((prev) => !prev)}
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#18211b] hover:text-[#1f6b32]"
              >
                <span>
                  {expandedReplies
                    ? 'Show fewer replies'
                    : `Show ${hiddenReplyCount} more ${hiddenReplyCount === 1 ? 'reply' : 'replies'}`}
                </span>
                {expandedReplies ? (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};