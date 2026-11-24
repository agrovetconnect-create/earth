import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  FileText,
  Film,
  History,
  Lock,
  MapPin,
  Mic,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  addPostMedia,
  sendWebChatMessage,
  uploadPostAttachment,
  type WebChatLocationPayload,
  type WebChatMessageResponse,
  type WebPhotoSubmissionResult,
} from '../services/postsApi.js';
import { useCommunityUser } from '../services/communityAuth.js';
import { useTranslator } from '../i18n.js';
import { useDialogFocus } from '../hooks/useDialogFocus.js';
import { GeneralLoginModal } from './GeneralLoginModal.js';
import { formatPassportId } from '../lib/format.js';
import {
  distanceBetweenKm,
  extractExifGpsFromArrayBuffer,
  inferNearestRwandaDistrict,
  RWANDA_DISTRICT_CENTERS,
  type BrowserExifGps,
} from '../utils/exifGps.js';

interface WebFieldSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onObservationPinned?: (passportId: string) => void;
}

type PinDecision = 'pin_approximate' | 'pin_exact' | 'pin_district' | 'keep_private';

interface StagedPrimaryPhoto {
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';
  base64: string;
  previewUri: string;
  caption: string;
}

interface StagedSupportingItem {
  id: string;
  fileName: string;
  mimeType: string;
  base64: string;
  kind: 'image' | 'video';
  caption: string;
}

interface StagedDocument {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  base64: string;
}

const DOCUMENT_INPUT_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,' +
  'application/pdf,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-excel,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-powerpoint,' +
  'application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'application/vnd.oasis.opendocument.text,' +
  'application/vnd.oasis.opendocument.spreadsheet,text/plain,text/csv';

const DOCUMENT_EXTENSIONS = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|txt|csv)$/i;
const MAX_DOCUMENT_BYTES = 10_000_000;
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|3gp|3gpp|mov)$/i;

function fileSizeNotice(fileName: string): string {
  return `"${fileName}" must be between 1 byte and 10 MB.`;
}

function documentMimeType(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'ppt':
      return 'application/vnd.ms-powerpoint';
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'odt':
      return 'application/vnd.oasis.opendocument.text';
    case 'ods':
      return 'application/vnd.oasis.opendocument.spreadsheet';
    case 'txt':
      return 'text/plain';
    case 'csv':
      return 'text/csv';
    default:
      return null;
  }
}

interface ChatMessageVersion {
  userText: string;
  userTimestamp: string;
  assistantReply: ChatMessageItem | null;
}

interface ChatMessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  imageUri?: string;
  imageCaption?: string;
  audioUri?: string;
  audioDurationSec?: number;
  supportingCount?: number;
  locationSummary?: string;
  type?: WebChatMessageResponse['type'];
  passport?: WebPhotoSubmissionResult & Record<string, unknown>;
  pendingPassportId?: string | null;
  awaitingPinConfirmation?: boolean;
  pinConfirmation?: WebChatMessageResponse['pin_confirmation'];
  questionsForUser?: string[];
  suggestedActions?: string[];
  transcript?: string;
  versions?: ChatMessageVersion[];
  activeVersionIndex?: number;
}

interface SavedChatSession {
  id: string;
  title: string;
  updatedAt: string;
  activePassportId: string | null;
  messages: ChatMessageItem[];
}

const DEFAULT_PRIMARY_CAPTION = 'The site as it looked on the day of the visit.';

const SUPPORTING_CAPTION_DEFAULTS = [
  'A wider view showing the surrounding ground.',
  'A closer view of the surface detail.',
  'A second angle taken a few steps to the side.',
  'A detail shot of the texture and colour.',
  'Additional angle showing local site context.',
  'Supporting field clip from the visit.',
];

const PIN_OPTIONS: ReadonlyArray<{
  decision: PinDecision;
  label: string;
  primary?: boolean;
}> = [
  { decision: 'pin_approximate', label: 'Pin ~2 km (Recommended)', primary: true },
  { decision: 'pin_exact', label: 'Pin Exact' },
  { decision: 'pin_district', label: 'District Only' },
  { decision: 'keep_private', label: 'Keep Private' },
];

const WAVEFORM_BARS = [
  0.35, 0.55, 0.8, 0.45, 0.9, 0.65, 0.4, 0.75, 0.95, 0.55, 0.7, 0.85,
  0.5, 0.65, 0.9, 0.45, 0.7, 0.6, 0.85, 0.5, 0.75, 0.4, 0.6, 0.35,
];

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read audio recording.'));
    };
    reader.onerror = () => reject(new Error('Could not read audio recording.'));
    reader.readAsDataURL(blob);
  });
}

function cleanAdminUnit(value: string, suffix: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const pattern = new RegExp(`\\s+${suffix}$`, 'i');
  return trimmed.replace(pattern, '').trim();
}

function formatLocationSummary(loc: WebChatLocationPayload | null): string {
  if (!loc) return '';
  const placeParts = [
    loc.district || loc.sector || loc.cell || loc.village ? 'Rwanda' : null,
    loc.district ? `${loc.district} District` : null,
    loc.sector ? `${loc.sector} Sector` : null,
    loc.cell ? `${loc.cell} Cell` : null,
    loc.village ? `${loc.village} Village` : null,
    loc.address || null,
  ].filter(Boolean);

  const coordPart =
    typeof loc.latitude === 'number' &&
    typeof loc.longitude === 'number' &&
    Number.isFinite(loc.latitude) &&
    Number.isFinite(loc.longitude)
      ? `lat ${loc.latitude.toFixed(4)}, lng ${loc.longitude.toFixed(4)}`
      : null;

  return [...placeParts, coordPart].filter(Boolean).join(' · ');
}

function buildWelcomeMessage(displayName?: string | null): ChatMessageItem {
  const safeName = displayName?.trim().replace(/\*/g, '') ?? '';
  const greetingName = safeName ? `, **${safeName}**` : '';
  return {
    id: 'welcome_1',
    sender: 'assistant',
    text:
      `Welcome${greetingName}.\n\n` +
      `I handle the whole submission here — analysis, location, privacy, and confirmation. No other form or screen is needed.\n\n` +
      `Send a clear daylight photograph of a rock, mineral, outcrop, or landform using the attach icon below to create a Geoscience Passport.\n\n` +
      `• Attach extra angles, short video clips, or document files to build your Passport gallery.\n` +
      `• Write or record a voice note for your field report.\n` +
      `• Choose private or public and confirm right here in this chat.`,
    timestamp: nowTimeLabel(),
    type: 'help',
    suggestedActions: [
      'Attach site photo',
      'Share Location Pin',
      'Tell me about volcanic basalt in Musanze',
      'How do I distinguish quartz from feldspar?',
      'SITES',
      'HELP',
    ],
  };
}

function chatHistoryStorageKey(userId: string): string {
  return `et_geoai_chats_${userId}`;
}

function stripHeavyUris(msg: ChatMessageItem): ChatMessageItem {
  const { imageUri: _img, audioUri: _aud, versions, ...rest } = msg;
  return {
    ...rest,
    ...(versions
      ? {
          versions: versions.map((v) => ({
            ...v,
            assistantReply: v.assistantReply ? stripHeavyUris(v.assistantReply) : null,
          })),
        }
      : {}),
  };
}

function loadSavedChats(userId: string | undefined): SavedChatSession[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(chatHistoryStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedChats(userId: string | undefined, chats: SavedChatSession[]): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    const sanitized = chats.slice(0, 20).map((c) => ({
      ...c,
      messages: c.messages.map(stripHeavyUris),
    }));
    localStorage.setItem(chatHistoryStorageKey(userId), JSON.stringify(sanitized));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function buildConversationHistoryPayload(
  msgs: ChatMessageItem[]
): Array<{ role: 'user' | 'assistant'; text: string }> {
  return msgs
    .filter(
      (m) => m.id !== 'welcome_1' && !m.id.startsWith('asst_pending_') && m.text.trim().length > 0
    )
    .slice(-12)
    .map((m) => ({
      role: m.sender,
      text: m.text.slice(0, 600),
    }));
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return tokens.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-[#1f1f1f]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={index} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded bg-[#f1f3f4] px-1.5 py-0.5 font-mono text-[12px] text-[#0b57d0]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

const FormattedGeoAiText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i] ?? '';
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push(
        <p key={`h-${i}`} className="text-[13.5px] font-semibold text-[#1f1f1f] pt-0.5">
          {renderInlineMarkdown(headingMatch[2]!)}
        </p>
      );
      i += 1;
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} className="list-disc pl-4 space-y-1 text-[13px] leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${i}`} className="list-decimal pl-4 space-y-1 text-[13px] leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !/^(#{1,3})\s+/.test((lines[i] ?? '').trim()) &&
      !/^[-*•]\s+/.test((lines[i] ?? '').trim()) &&
      !/^\d+\.\s+/.test((lines[i] ?? '').trim())
    ) {
      paragraphLines.push(lines[i] ?? '');
      i += 1;
    }
    blocks.push(
      <p key={`p-${i}`} className="text-[13px] leading-relaxed whitespace-pre-wrap">
        {renderInlineMarkdown(paragraphLines.join('\n'))}
      </p>
    );
  }

  return <div className="space-y-1.5">{blocks}</div>;
};

const PLAYBACK_RATES: Array<1 | 1.5 | 2> = [1, 1.5, 2];

interface VoiceNotePlayerProps {
  src?: string;
  durationSec?: number;
  isUser: boolean;
}

const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ src, durationSec = 0, isUser }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSec);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.playbackRate = playbackRate;
      void audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const cyclePlaybackRate = () => {
    setPlaybackRate((prev) => {
      const idx = PLAYBACK_RATES.indexOf(prev);
      return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length]!;
    });
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 min-w-[220px] max-w-[280px] ${
        isUser ? 'bg-white/15' : 'bg-[#f0f2f5]'
      }`}
    >
      {src && <audio ref={audioRef} src={src} preload="metadata" className="hidden" />}
      <button
        type="button"
        disabled={!src}
        onClick={togglePlay}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
          isUser
            ? 'bg-white text-[#0b57d0] hover:bg-white/90'
            : 'bg-[#00a884] text-white hover:bg-[#008f70]'
        }`}
      >
        {playing ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current translate-x-[1px]" />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div
          className="flex items-center gap-[2px] h-5 cursor-pointer"
          onClick={(e) => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audio.currentTime = ratio * duration;
            setCurrentTime(audio.currentTime);
          }}
        >
          {WAVEFORM_BARS.map((height, idx) => {
            const filled = idx / WAVEFORM_BARS.length <= progress;
            return (
              <span
                key={idx}
                className={`flex-1 rounded-full transition-colors ${
                  filled
                    ? isUser
                      ? 'bg-white'
                      : 'bg-[#00a884]'
                    : isUser
                      ? 'bg-white/40'
                      : 'bg-[#c7ccd1]'
                }`}
                style={{ height: `${Math.round(height * 18) + 4}px` }}
              />
            );
          })}
        </div>
        <div
          className={`flex items-center justify-between text-[10.5px] font-mono tabular-nums ${
            isUser ? 'text-white/85' : 'text-[#5e5e5e]'
          }`}
        >
          <span>{playing || currentTime > 0 ? formatDuration(currentTime) : formatDuration(duration)}</span>
          <button
            type="button"
            disabled={!src}
            onClick={cyclePlaybackRate}
            aria-label={`Change playback speed (currently ${playbackRate}x)`}
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40 ${
              isUser ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-white text-[#1f1f1f] hover:bg-[#e8edf5]'
            }`}
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  );
};

export const WebFieldSubmissionModal: React.FC<WebFieldSubmissionModalProps> = ({
  isOpen,
  onClose,
  onObservationPinned,
}) => {
  const currentUser = useCommunityUser();
  const t = useTranslator();
  const dialogRef = useDialogFocus<HTMLDivElement>(isOpen);

  const [showLogin, setShowLogin] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string>(() => `chat_${Date.now()}`);
  const [savedChats, setSavedChats] = useState<SavedChatSession[]>([]);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [chatPendingDelete, setChatPendingDelete] = useState<SavedChatSession | null>(null);

  const [messages, setMessages] = useState<ChatMessageItem[]>(() => [
    buildWelcomeMessage(currentUser?.display_name),
  ]);

  const [inputText, setInputText] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [selectedPrimary, setSelectedPrimary] = useState<StagedPrimaryPhoto | null>(null);
  const [attachAsAngleToActive, setAttachAsAngleToActive] = useState(false);
  const [supportingMedia, setSupportingMedia] = useState<StagedSupportingItem[]>([]);
  const [stagedDocuments, setStagedDocuments] = useState<StagedDocument[]>([]);

  // Location tray state
  const [locationDrawerOpen, setLocationDrawerOpen] = useState(false);
  const [exifInfo, setExifInfo] = useState<BrowserExifGps | null>(null);
  const [liveGpsCoords, setLiveGpsCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number | null;
  } | null>(null);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [district, setDistrict] = useState('');
  const [sector, setSector] = useState('');
  const [cell, setCell] = useState('');
  const [village, setVillage] = useState('');
  const [locationNote, setLocationNote] = useState('');
  const [gpsBusy, setGpsBusy] = useState(false);

  const [activePassportId, setActivePassportId] = useState<string | null>(null);
  const [toolsTrayOpen, setToolsTrayOpen] = useState(false);
  const [toolNotice, setToolNotice] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isStagingFiles, setIsStagingFiles] = useState(false);

  // Editing sent user text prompts (ChatGPT-style edit + version history)
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const copiedMsgTimerRef = useRef<number | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Scroll arrows for suggestion chips bar
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // WhatsApp-style Voice Recording state + live timer + mic level meter
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingLevels, setRecordingLevels] = useState<number[]>(() => Array(16).fill(0.25));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const voiceCancelledRef = useRef(false);
  const recordingDurationRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRafRef = useRef<number | null>(null);

  const primaryInputRef = useRef<HTMLInputElement>(null);
  const supportingInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSavedChats(loadSavedChats(currentUser?.public_user_id));
  }, [currentUser?.public_user_id]);

  useEffect(() => {
    if (isOpen && messages.length === 1 && messages[0]?.id === 'welcome_1') {
      setMessages([buildWelcomeMessage(currentUser?.display_name)]);
    }
  }, [isOpen, currentUser?.display_name]);

  // Persist current chat into savedChats automatically once user has sent messages
  useEffect(() => {
    if (!currentUser?.public_user_id) return;
    const firstUserMsg = messages.find((m) => m.sender === 'user');
    if (!firstUserMsg) return;

    const title = firstUserMsg.text.trim().slice(0, 48) || 'Field observation chat';
    setSavedChats((prev) => {
      const existing = prev.find((c) => c.id === currentChatId);
      const entry: SavedChatSession = {
        id: currentChatId,
        title,
        updatedAt: new Date().toISOString(),
        activePassportId,
        messages,
      };
      const next = existing
        ? [entry, ...prev.filter((c) => c.id !== currentChatId)]
        : [entry, ...prev];
      persistSavedChats(currentUser.public_user_id, next);
      return next.slice(0, 20);
    });
  }, [messages, activePassportId, currentChatId, currentUser?.public_user_id]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [isOpen, messages, isSending]);

  useEffect(() => {
    if (!isRecordingVoice) {
      setRecordingSeconds(0);
      return;
    }
    recordingDurationRef.current = 0;
    const interval = window.setInterval(() => {
      recordingDurationRef.current += 1;
      setRecordingSeconds(recordingDurationRef.current);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRecordingVoice]);

  const updateSuggestionScrollArrows = () => {
    const el = suggestionsRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const timer = window.setTimeout(updateSuggestionScrollArrows, 30);
    window.addEventListener('resize', updateSuggestionScrollArrows);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', updateSuggestionScrollArrows);
    };
  }, [messages, isOpen]);

  useEffect(() => {
    return () => {
      if (copiedMsgTimerRef.current !== null) window.clearTimeout(copiedMsgTimerRef.current);
      if (analyserRafRef.current !== null) {
        window.cancelAnimationFrame(analyserRafRef.current);
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close().catch(() => {});
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        voiceCancelledRef.current = true;
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  if (!isOpen) return null;

  const normalizedDistrict = cleanAdminUnit(district, 'District');
  const normalizedSector = cleanAdminUnit(sector, 'Sector');
  const normalizedCell = cleanAdminUnit(cell, 'Cell');
  const normalizedVillage = cleanAdminUnit(village, 'Village');

  const buildCurrentLocationPayload = (): WebChatLocationPayload | null => {
    const latNum = latitude.trim() ? Number(latitude.trim()) : null;
    const lngNum = longitude.trim() ? Number(longitude.trim()) : null;
    const validCoords =
      latNum !== null &&
      lngNum !== null &&
      Number.isFinite(latNum) &&
      Number.isFinite(lngNum) &&
      latNum >= -90 &&
      latNum <= 90 &&
      lngNum >= -180 &&
      lngNum <= 180;

    if (
      !validCoords &&
      !normalizedDistrict &&
      !normalizedSector &&
      !normalizedCell &&
      !normalizedVillage &&
      !locationNote.trim()
    ) {
      return null;
    }

    return {
      latitude: validCoords ? latNum : null,
      longitude: validCoords ? lngNum : null,
      accuracy_meters: liveGpsCoords?.accuracy ?? null,
      district: normalizedDistrict || null,
      sector: normalizedSector || null,
      cell: normalizedCell || null,
      village: normalizedVillage || null,
      address: locationNote.trim() || null,
    };
  };

  const stagedLocationPayload = buildCurrentLocationPayload();
  const stagedLocationSummary = formatLocationSummary(stagedLocationPayload);

  const mismatchKm =
    exifInfo?.found &&
    exifInfo.latitude !== null &&
    exifInfo.longitude !== null &&
    liveGpsCoords
      ? distanceBetweenKm(
          liveGpsCoords.lat,
          liveGpsCoords.lng,
          exifInfo.latitude,
          exifInfo.longitude
        )
      : null;

  const clearLocationFields = () => {
    setExifInfo(null);
    setLiveGpsCoords(null);
    setLatitude('');
    setLongitude('');
    setDistrict('');
    setSector('');
    setCell('');
    setVillage('');
    setLocationNote('');
  };

  const startFreshChat = () => {
    setCurrentChatId(`chat_${Date.now()}`);
    setMessages([buildWelcomeMessage(currentUser?.display_name)]);
    setInputText('');
    setPostTitle('');
    setSelectedPrimary(null);
    setAttachAsAngleToActive(false);
    setSupportingMedia([]);
    setStagedDocuments([]);
    clearLocationFields();
    setLocationDrawerOpen(false);
    setActivePassportId(null);
    setToolsTrayOpen(false);
    setToolNotice(null);
    setEditingMsgId(null);
    setChatMenuOpen(false);
  };

  const loadChatSession = (session: SavedChatSession) => {
    setCurrentChatId(session.id);
    setMessages(session.messages.length > 0 ? session.messages : [buildWelcomeMessage(currentUser?.display_name)]);
    setActivePassportId(session.activePassportId);
    setInputText('');
    setSelectedPrimary(null);
    setSupportingMedia([]);
    setStagedDocuments([]);
    setLocationDrawerOpen(false);
    setToolsTrayOpen(false);
    setEditingMsgId(null);
    setChatMenuOpen(false);
  };

  const deleteSavedChat = (chatId: string) => {
    const next = savedChats.filter((c) => c.id !== chatId);
    setSavedChats(next);
    persistSavedChats(currentUser?.public_user_id, next);
    if (chatId === currentChatId) {
      startFreshChat();
    }
  };

  const handlePrimaryPhotoChosen = async (file: File | undefined) => {
    if (!file) return;
    setIsStagingFiles(true);
    setToolNotice(null);
    try {
      if (file.type.toLowerCase().startsWith('video/')) {
        setToolNotice(
          'Select a still site photo first, or use "Angles / Video" to attach a video clip.'
        );
        return;
      }
      if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) {
        setToolNotice(fileSizeNotice(file.name));
        return;
      }
      const lowerName = file.name.toLowerCase();
      const supportedImage =
        /^image\/(jpeg|png|webp|heic|heif)$/.test((file.type || '').toLowerCase()) ||
        IMAGE_EXTENSIONS.test(lowerName);
      if (!supportedImage) {
        setToolNotice(
          `"${file.name}" format is not supported. Use JPG, PNG, WebP or HEIC. ${fileSizeNotice(file.name)}`
        );
        return;
      }

      const buffer = await file.arrayBuffer();
      const b64 = arrayBufferToBase64(buffer);
      const lower = (file.type || '').toLowerCase();
      const detectedMime: StagedPrimaryPhoto['mimeType'] =
        lower === 'image/png' || file.name.toLowerCase().endsWith('.png')
          ? 'image/png'
          : lower === 'image/webp' || file.name.toLowerCase().endsWith('.webp')
            ? 'image/webp'
            : lower === 'image/heic' ||
                lower === 'image/heif' ||
                /\.hei[cf]$/i.test(file.name)
              ? 'image/heic'
              : 'image/jpeg';

      setSelectedPrimary({
        fileName: file.name,
        mimeType: detectedMime,
        base64: b64,
        previewUri: `data:${detectedMime};base64,${b64}`,
        caption: DEFAULT_PRIMARY_CAPTION,
      });
      setAttachAsAngleToActive(false);
      setToolsTrayOpen(false);

      const parsedExif = extractExifGpsFromArrayBuffer(buffer);
      setExifInfo(parsedExif);
      if (parsedExif.found && parsedExif.latitude !== null && parsedExif.longitude !== null) {
        setLatitude(parsedExif.latitude.toFixed(6));
        setLongitude(parsedExif.longitude.toFixed(6));
        if (parsedExif.inferredDistrict && !district.trim()) {
          setDistrict(parsedExif.inferredDistrict);
        }
        setToolNotice(
          `Recovered camera EXIF GPS (${parsedExif.latitude.toFixed(4)}, ${parsedExif.longitude.toFixed(4)})${
            parsedExif.inferredDistrict ? ` · ${parsedExif.inferredDistrict} District` : ''
          }.`
        );
      }
    } catch {
      setToolNotice('Could not read the selected photo.');
    } finally {
      setIsStagingFiles(false);
    }
  };

  const handleSupportingFilesChosen = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setIsStagingFiles(true);
    setToolNotice(null);
    try {
      const additions: StagedSupportingItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const nextIndex = supportingMedia.length + additions.length;
        if (nextIndex >= 6) break;
        if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) {
          setToolNotice(fileSizeNotice(file.name));
          continue;
        }
        const lowerMime = (file.type || '').toLowerCase();
        const lowerName = file.name.toLowerCase();
        const isVid = lowerMime.startsWith('video/') || VIDEO_EXTENSIONS.test(lowerName);
        const isSupportedImage =
          /^image\/(jpeg|png|webp|heic|heif)$/.test(lowerMime) || IMAGE_EXTENSIONS.test(lowerName);
        const isSupportedVideo =
          /^video\/(mp4|webm|3gpp|quicktime)$/.test(lowerMime) || VIDEO_EXTENSIONS.test(lowerName);
        if (!isSupportedImage && !isSupportedVideo) {
          setToolNotice(
            `"${file.name}" format is not supported. Use JPG, PNG, WebP, HEIC, MP4, WebM, 3GP or MOV. ${fileSizeNotice(file.name)}`
          );
          continue;
        }
        const normalizedMime = isVid
          ? lowerMime.startsWith('video/')
            ? lowerMime
            : lowerName.endsWith('.webm')
              ? 'video/webm'
              : lowerName.endsWith('.3gp') || lowerName.endsWith('.3gpp')
                ? 'video/3gpp'
                : lowerName.endsWith('.mov')
                  ? 'video/quicktime'
                  : 'video/mp4'
          : lowerMime.startsWith('image/')
            ? lowerMime
            : 'image/jpeg';

        const buf = await file.arrayBuffer();
        additions.push({
          id: `sup_${Date.now()}_${i}`,
          fileName: file.name,
          mimeType: normalizedMime,
          base64: arrayBufferToBase64(buf),
          kind: isVid ? 'video' : 'image',
          caption: isVid
            ? 'Short site clip showing surrounding ground.'
            : SUPPORTING_CAPTION_DEFAULTS[nextIndex] ?? 'Supporting site angle.',
        });
      }

      if (additions.length > 0) {
        setSupportingMedia((prev) => [...prev, ...additions]);
        setToolsTrayOpen(false);
      }
    } finally {
      setIsStagingFiles(false);
    }
  };

  const handleDocumentFilesChosen = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setIsStagingFiles(true);
    setToolNotice(null);
    try {
      const additions: StagedDocument[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!;
        const mimeType = documentMimeType(file.name);
        if (!mimeType || !DOCUMENT_EXTENSIONS.test(file.name)) {
          setToolNotice(
            'Supported documents: PDF, Word, Excel, PowerPoint, OpenDocument, TXT and CSV. Files must be between 1 byte and 10 MB.'
          );
          continue;
        }
        if (file.size === 0 || file.size > MAX_DOCUMENT_BYTES) {
          setToolNotice(fileSizeNotice(file.name));
          continue;
        }
        additions.push({
          id: `doc_${Date.now()}_${i}`,
          fileName: file.name,
          mimeType,
          sizeBytes: file.size,
          base64: arrayBufferToBase64(await file.arrayBuffer()),
        });
      }
      if (additions.length > 0) {
        setStagedDocuments((prev) => [...prev, ...additions].slice(0, 10));
        setToolsTrayOpen(false);
      }
    } finally {
      setIsStagingFiles(false);
    }
  };

  const uploadStagedDocuments = async (passportId: string): Promise<number> => {
    if (stagedDocuments.length === 0) return 0;
    const results = await Promise.allSettled(
      stagedDocuments.map((doc) =>
        uploadPostAttachment(passportId, {
          filename: doc.fileName,
          mime_type: doc.mimeType,
          size_bytes: doc.sizeBytes,
          content_base64: doc.base64,
        })
      )
    );
    const uploaded = results.filter((result) => result.status === 'fulfilled').length;
    if (uploaded < stagedDocuments.length) {
      setToolNotice('Some documents could not be attached. Please retry those files.');
    }
    setStagedDocuments([]);
    return uploaded;
  };

  const handleUseLiveGps = () => {
    if (!navigator.geolocation) {
      setToolNotice('Browser geolocation is unavailable. Enter Rwanda District / coordinates manually.');
      return;
    }
    setGpsBusy(true);
    setToolNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const acc = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null;
        setLiveGpsCoords({ lat, lng, accuracy: acc });

        if (
          exifInfo?.found &&
          exifInfo.latitude !== null &&
          exifInfo.longitude !== null &&
          distanceBetweenKm(lat, lng, exifInfo.latitude, exifInfo.longitude) > 0.5
        ) {
          setGpsBusy(false);
          setLocationDrawerOpen(true);
          return;
        }

        setLatitude(lat.toFixed(6));
        setLongitude(lng.toFixed(6));
        const inferred = inferNearestRwandaDistrict(lat, lng);
        if (inferred) setDistrict(inferred);
        setLocationDrawerOpen(true);
        setToolsTrayOpen(false);
        setGpsBusy(false);
      },
      (err) => {
        setGpsBusy(false);
        setToolNotice(err.message || 'Could not acquire live GPS signal.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const toAssistantMessage = (response: WebChatMessageResponse): ChatMessageItem => ({
    id: `asst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    sender: 'assistant',
    text: response.reply,
    timestamp: nowTimeLabel(),
    type: response.type,
    passport: response.passport,
    pendingPassportId: response.pending_passport_id,
    awaitingPinConfirmation: response.awaiting_pin_confirmation,
    pinConfirmation: response.pin_confirmation,
    questionsForUser: response.questions_for_user,
    suggestedActions: response.suggested_actions,
    transcript: response.transcript,
  });

  const appendAssistantResponse = (response: WebChatMessageResponse) => {
    if (response.pending_passport_id) {
      setActivePassportId(response.pending_passport_id);
    } else if (
      typeof response.passport?.passport_id === 'string' &&
      response.passport.passport_id.trim()
    ) {
      setActivePassportId(response.passport.passport_id.trim());
    }

    setMessages((prev) => [...prev, toAssistantMessage(response)]);
  };

  const handleSendComposer = async () => {
    if (!currentUser || isSending || isStagingFiles) return;

    const cleanText = inputText.trim();
    const cleanTitle = postTitle.trim();
    const locPayload = buildCurrentLocationPayload();

    if (
      !cleanText &&
      !selectedPrimary &&
      supportingMedia.length === 0 &&
      stagedDocuments.length === 0 &&
      !locPayload
    ) {
      return;
    }

    if ((latitude.trim() && !longitude.trim()) || (!latitude.trim() && longitude.trim())) {
      setToolNotice('Enter both Latitude and Longitude, or clear coordinates to use District only.');
      return;
    }

    const primaryToSend = selectedPrimary;
    const supportingToSend = [...supportingMedia];
    const documentsToSend = stagedDocuments.map((doc) => ({
      filename: doc.fileName,
      mime_type: doc.mimeType,
      content_base64: doc.base64,
    }));
    const attachAngleMode = attachAsAngleToActive && Boolean(activePassportId);
    const locSummaryForBubble = formatLocationSummary(locPayload);
    const historySnapshot = buildConversationHistoryPayload(messages);
    const clearSubmittedInput = () => {
      setInputText('');
      setPostTitle('');
      setSelectedPrimary(null);
      setAttachAsAngleToActive(false);
      setSupportingMedia([]);
      setStagedDocuments([]);
      setToolsTrayOpen(false);
      setLocationDrawerOpen(false);
      setToolNotice(null);
    };

    let pendingReplyId: string | null = null;
    const showPendingReply = () => {
      pendingReplyId = `asst_pending_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: pendingReplyId!,
          sender: 'assistant',
          text: 'Received — preparing your reply now…',
          timestamp: nowTimeLabel(),
          type: 'help',
        },
      ]);
    };
    const clearPendingReply = () => {
      if (!pendingReplyId) return;
      const id = pendingReplyId;
      pendingReplyId = null;
      setMessages((prev) => prev.filter((message) => message.id !== id));
    };

    const bubbleLabel = cleanText
      ? documentsToSend.length > 0
        ? `${cleanText}\n📎 ${documentsToSend.length} document(s)`
        : cleanText
      : primaryToSend
        ? attachAngleMode
          ? `Attached extra site photo (${primaryToSend.fileName}) to ${activePassportId}`
          : `Sent site photo (${primaryToSend.fileName}) for GeoAI analysis`
        : stagedDocuments.length > 0
          ? `Attached ${stagedDocuments.length} document(s)`
          : supportingToSend.length > 0
            ? `Attached ${supportingToSend.length} supporting media file(s)`
            : `Shared field location (${locSummaryForBubble || 'Rwanda'})`;

    setMessages((prev) => [
      ...prev,
      {
        id: `usr_${Date.now()}`,
        sender: 'user',
        text: bubbleLabel,
        timestamp: nowTimeLabel(),
        imageUri: primaryToSend?.previewUri,
        imageCaption: primaryToSend?.caption,
        supportingCount: supportingToSend.length > 0 ? supportingToSend.length : undefined,
        locationSummary: locSummaryForBubble || undefined,
      },
    ]);

    setIsSending(true);
    try {
      if (!primaryToSend && (supportingToSend.length > 0 || stagedDocuments.length > 0)) {
        if (!activePassportId) {
          if (cleanText || documentsToSend.length > 0) {
            showPendingReply();
            try {
              const textRes = await sendWebChatMessage({
                message: cleanText || undefined,
                documents: documentsToSend.length > 0 ? documentsToSend : undefined,
                conversation_history: historySnapshot,
              });
              clearPendingReply();
              appendAssistantResponse(textRes);
            } catch (err) {
              clearPendingReply();
              throw err;
            }
          }
          setMessages((prev) => [
            ...prev,
            {
              id: `asst_${Date.now()}`,
              sender: 'assistant',
              text:
                'Send a clear primary site photo first so GeoAI can create your Geoscience Passport, then attach extra angles, video clips, or documents to that Passport.',
              timestamp: nowTimeLabel(),
              suggestedActions: ['Attach site photo', 'HELP'],
            },
          ]);
          clearSubmittedInput();
          return;
        }

        await Promise.all(
          supportingToSend.map((item) =>
            addPostMedia(activePassportId, {
              content_base64: item.base64,
              mime_type: item.mimeType,
              caption: item.caption.trim() || null,
              role: item.kind === 'video' ? 'video' : 'field',
            })
          )
        );
        const uploadedDocuments = await uploadStagedDocuments(activePassportId);

        setMessages((prev) => [
          ...prev,
          {
            id: `asst_${Date.now()}`,
            sender: 'assistant',
            text: `Attached ${supportingToSend.length} supporting gallery item(s) and ${uploadedDocuments} document(s) to Geoscience Passport ${activePassportId}.`,
            timestamp: nowTimeLabel(),
            type: 'passport',
            pendingPassportId: activePassportId,
            suggestedActions: ['Share Location Pin', 'Pin Approximate (~2 km)', 'Keep Private'],
          },
        ]);

        if (cleanText || documentsToSend.length > 0) {
          showPendingReply();
          try {
            const textRes = await sendWebChatMessage({
              message: cleanText || undefined,
              documents: documentsToSend.length > 0 ? documentsToSend : undefined,
              pending_passport_id: activePassportId,
              conversation_history: historySnapshot,
            });
            clearPendingReply();
            appendAssistantResponse(textRes);
          } catch (err) {
            clearPendingReply();
            throw err;
          }
        }
        clearSubmittedInput();
        return;
      }

      showPendingReply();
      const response = await sendWebChatMessage({
        message: cleanText || undefined,
        post_title: cleanTitle || undefined,
        image_base64: primaryToSend?.base64,
        mime_type: primaryToSend?.mimeType,
        primary_media_caption: primaryToSend?.caption.trim() || undefined,
        attach_to_active_passport: attachAngleMode || undefined,
        supporting_media:
          primaryToSend && !attachAngleMode && supportingToSend.length > 0
            ? supportingToSend.map((m) => ({
                content_base64: m.base64,
                mime_type: m.mimeType,
                caption: m.caption.trim() || undefined,
                role: m.kind === 'video' ? 'video' : 'field',
              }))
            : undefined,
        documents: documentsToSend.length > 0 ? documentsToSend : undefined,
        location: locPayload ?? undefined,
        pending_passport_id:
          primaryToSend && !attachAngleMode ? undefined : activePassportId ?? undefined,
        conversation_history: historySnapshot,
      });

      clearPendingReply();
      appendAssistantResponse(response);
      const documentTarget = attachAngleMode
        ? activePassportId
        : response.pending_passport_id ?? response.passport?.passport_id ?? null;
      if (documentTarget) {
        const uploaded = await uploadStagedDocuments(documentTarget);
        if (uploaded > 0) {
          setMessages((prev) => [
            ...prev,
            {
              id: `asst_doc_${Date.now()}`,
              sender: 'assistant',
              text: `Attached ${uploaded} document(s) to Geoscience Passport ${documentTarget}. They follow this Passport's privacy and are ready to preview or download here.`,
              timestamp: nowTimeLabel(),
              type: 'passport',
              pendingPassportId: documentTarget,
            },
          ]);
        }
      }
      clearSubmittedInput();
    } catch (err: unknown) {
      clearPendingReply();
      clearSubmittedInput();
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: err instanceof Error ? err.message : 'Could not complete request.',
          timestamp: nowTimeLabel(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveEditedMessage = async (msgId: string) => {
    const trimmed = editingDraft.trim();
    if (!trimmed || isSending) return;
    const msgIndex = messages.findIndex((m) => m.id === msgId);
    if (msgIndex < 0) return;

    const targetMsg = messages[msgIndex]!;
    const currentAssistant =
      messages[msgIndex + 1]?.sender === 'assistant' ? messages[msgIndex + 1]! : null;

    const existingVersions: ChatMessageVersion[] = targetMsg.versions?.length
      ? targetMsg.versions.map((v, idx) =>
          idx === (targetMsg.activeVersionIndex ?? targetMsg.versions!.length - 1)
            ? { ...v, assistantReply: currentAssistant }
            : v
        )
      : [
          {
            userText: targetMsg.text,
            userTimestamp: targetMsg.timestamp,
            assistantReply: currentAssistant,
          },
        ];

    const priorHistory = buildConversationHistoryPayload(messages.slice(0, msgIndex));
    setEditingMsgId(null);
    setEditingDraft('');
    setIsSending(true);

    try {
      const response = await sendWebChatMessage({
        message: trimmed,
        pending_passport_id: activePassportId ?? undefined,
        conversation_history: priorHistory,
      });
      const newReply = toAssistantMessage(response);
      const nextVersions: ChatMessageVersion[] = [
        ...existingVersions,
        {
          userText: trimmed,
          userTimestamp: nowTimeLabel(),
          assistantReply: newReply,
        },
      ];
      const nextActiveIndex = nextVersions.length - 1;

      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msgId);
        if (idx < 0) return prev;
        const updatedUser: ChatMessageItem = {
          ...prev[idx]!,
          text: trimmed,
          timestamp: nextVersions[nextActiveIndex]!.userTimestamp,
          versions: nextVersions,
          activeVersionIndex: nextActiveIndex,
        };
        const head = prev.slice(0, idx);
        const tailStart = prev[idx + 1]?.sender === 'assistant' ? idx + 2 : idx + 1;
        const tail = prev.slice(tailStart);
        return [...head, updatedUser, newReply, ...tail];
      });
    } catch (err: unknown) {
      setToolNotice(err instanceof Error ? err.message : 'Could not update your message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSwitchMessageVersion = (msgId: string, nextIndex: number) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msgId);
      if (idx < 0) return prev;
      const target = prev[idx]!;
      if (!target.versions || nextIndex < 0 || nextIndex >= target.versions.length) return prev;
      const chosen = target.versions[nextIndex]!;
      const updatedUser: ChatMessageItem = {
        ...target,
        text: chosen.userText,
        timestamp: chosen.userTimestamp,
        activeVersionIndex: nextIndex,
      };
      const head = prev.slice(0, idx);
      const hasAssistantNext = prev[idx + 1]?.sender === 'assistant';
      const tail = prev.slice(hasAssistantNext ? idx + 2 : idx + 1);
      return chosen.assistantReply
        ? [...head, updatedUser, chosen.assistantReply, ...tail]
        : [...head, updatedUser, ...tail];
    });
  };

  const handlePinDecision = async (passportId: string, decision: PinDecision, label: string) => {
    if (!currentUser || isSending) return;
    const locPayload = buildCurrentLocationPayload();

    setMessages((prev) => [
      ...prev,
      {
        id: `usr_${Date.now()}`,
        sender: 'user',
        text: label,
        timestamp: nowTimeLabel(),
        locationSummary: formatLocationSummary(locPayload) || undefined,
      },
    ]);

    setIsSending(true);
    try {
      const response = await sendWebChatMessage({
        pending_passport_id: passportId,
        pin_decision: decision,
        location: locPayload ?? undefined,
      });
      appendAssistantResponse(response);
      if (response.pin_confirmation) {
        clearLocationFields();
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: err instanceof Error ? err.message : 'Could not update pin preference.',
          timestamp: nowTimeLabel(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const stopVoiceAnalyser = () => {
    if (analyserRafRef.current !== null) {
      window.cancelAnimationFrame(analyserRafRef.current);
      analyserRafRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      void audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    setRecordingLevels(Array(16).fill(0.25));
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setToolNotice('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      recordedChunksRef.current = [];
      voiceCancelledRef.current = false;
      recordingDurationRef.current = 0;

      // Live microphone amplitude bars via Web Audio API with safe fallback
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          audioCtxRef.current = ctx;
          const bins = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteFrequencyData(bins);
            const nextLevels: number[] = [];
            for (let b = 0; b < 16; b++) {
              const raw = bins[b % bins.length] ?? 0;
              nextLevels.push(Math.max(0.2, Math.min(1, raw / 180)));
            }
            setRecordingLevels(nextLevels);
            analyserRafRef.current = window.requestAnimationFrame(tick);
          };
          analyserRafRef.current = window.requestAnimationFrame(tick);
        }
      } catch {
        // Fallback gently if Web Audio metering is blocked
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stopVoiceAnalyser();
        stream.getTracks().forEach((track) => track.stop());
        if (voiceCancelledRef.current) return;
        const blob = new Blob(recordedChunksRef.current, { type: preferredMime });
        if (blob.size === 0) return;

        const durationCaptured = Math.max(1, recordingDurationRef.current);
        const [buf, dataUri] = await Promise.all([
          blob.arrayBuffer(),
          blobToDataUrl(blob).catch(() => undefined),
        ]);
        const b64 = arrayBufferToBase64(buf);

        setMessages((prev) => [
          ...prev,
          {
            id: `usr_voice_${Date.now()}`,
            sender: 'user',
            text: '',
            timestamp: nowTimeLabel(),
            audioUri: dataUri,
            audioDurationSec: durationCaptured,
          },
        ]);

        setIsSending(true);
        try {
          const response = await sendWebChatMessage({
            audio_base64: b64,
            audio_mime_type: preferredMime,
            pending_passport_id: activePassportId ?? undefined,
          });
          appendAssistantResponse(response);
        } catch (err: unknown) {
          setMessages((prev) => [
            ...prev,
            {
              id: `err_voice_${Date.now()}`,
              sender: 'assistant',
              text: err instanceof Error ? err.message : 'Could not process voice note.',
              timestamp: nowTimeLabel(),
            },
          ]);
        } finally {
          setIsSending(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingVoice(true);
      setToolsTrayOpen(false);
      setToolNotice(null);
    } catch {
      stopVoiceAnalyser();
      setToolNotice('Microphone permission was declined.');
    }
  };

  const stopAndSendVoiceRecording = () => {
    voiceCancelledRef.current = false;
    mediaRecorderRef.current?.stop();
    setIsRecordingVoice(false);
  };

  const cancelVoiceRecording = () => {
    voiceCancelledRef.current = true;
    mediaRecorderRef.current?.stop();
    setIsRecordingVoice(false);
  };

  const handleSuggestedAction = (action: string) => {
    const lower = action.toLowerCase();
    if (
      lower.includes('attach photo') ||
      lower.includes('attach site photo') ||
      lower.includes('snap another photo') ||
      lower.includes('attach another photo')
    ) {
      primaryInputRef.current?.click();
      return;
    }
    if (lower.includes('supporting video')) {
      supportingInputRef.current?.click();
      return;
    }
    if (lower.includes('share location') || lower.includes('location pin')) {
      setLocationDrawerOpen(true);
      setToolsTrayOpen(false);
      return;
    }
    if (activePassportId && lower.includes('pin approximate')) {
      void handlePinDecision(activePassportId, 'pin_approximate', 'Pin ~2 km (Recommended)');
      return;
    }
    if (activePassportId && lower.includes('pin exact')) {
      void handlePinDecision(activePassportId, 'pin_exact', 'Pin Exact');
      return;
    }
    if (activePassportId && (lower.includes('keep private') || lower.includes('make private'))) {
      void handlePinDecision(activePassportId, 'keep_private', 'Keep Private');
      return;
    }
    if (lower.includes('ask a question')) {
      composerTextareaRef.current?.focus();
      return;
    }

    const historySnapshot = buildConversationHistoryPayload(messages);
    setMessages((prev) => [
      ...prev,
      {
        id: `usr_${Date.now()}`,
        sender: 'user',
        text: action,
        timestamp: nowTimeLabel(),
      },
    ]);
    setIsSending(true);
    sendWebChatMessage({
      message: action,
      pending_passport_id: activePassportId ?? undefined,
      conversation_history: historySnapshot,
    })
      .then((res) => appendAssistantResponse(res))
      .catch((err: unknown) => {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            sender: 'assistant',
            text: err instanceof Error ? err.message : 'Could not send message.',
            timestamp: nowTimeLabel(),
          },
        ]);
      })
      .finally(() => setIsSending(false));
  };

  const canSend =
    Boolean(
      currentUser &&
        !isSending &&
        !isStagingFiles &&
        (inputText.trim() ||
          selectedPrimary ||
          supportingMedia.length > 0 ||
          stagedDocuments.length > 0 ||
          stagedLocationPayload)
    );

  const latestSuggestions = messages[messages.length - 1]?.suggestedActions ?? [];

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Submit Field Observation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0f14]/65 p-3 sm:p-4 backdrop-blur-xs"
    >
      <div className="flex h-[88dvh] max-h-[820px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#dadce0] bg-white text-[#1f1f1f] shadow-2xl">
        {/* Header */}
        <div className="shrink-0 border-b border-[#e3e3e3] bg-white">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/icon.png"
                alt=""
                aria-hidden="true"
                className="h-5 w-5 shrink-0 rounded-md object-contain"
              />
              <h2 className="truncate text-base font-semibold text-[#1f1f1f]">
                {t('Submit Field Observation')}
              </h2>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 relative">
              {currentUser && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (savedChats.length === 0 && messages.length <= 1) {
                        startFreshChat();
                      } else {
                        setChatMenuOpen((prev) => !prev);
                      }
                    }}
                    title="New chat & previous conversations"
                    aria-label="New chat and previous conversations"
                    aria-expanded={chatMenuOpen}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dadce0] bg-white px-2.5 text-xs font-medium text-[#3c4043] hover:bg-[#f6f8fb] whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New</span>
                  </button>

                  {chatMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        aria-hidden="true"
                        onClick={() => setChatMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full z-40 mt-1.5 w-72 overflow-hidden rounded-xl border border-[#dadce0] bg-white shadow-xl">
                        <div className="border-b border-[#eceff3] p-1.5">
                          <button
                            type="button"
                            onClick={startFreshChat}
                            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-[#0b57d0] hover:bg-[#edf3fe]"
                          >
                            <Plus className="h-3.5 w-3.5 shrink-0" />
                            <span>Start new chat</span>
                          </button>
                        </div>
                        <div className="max-h-60 overflow-y-auto g-scroll p-1.5 space-y-0.5">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-[#5e5e5e]">
                            <History className="h-3 w-3" />
                            <span>Old chats</span>
                          </div>
                          {savedChats.length === 0 ? (
                            <p className="px-2.5 py-2 text-[11px] text-[#8f8f8f]">
                              No previous chats yet.
                            </p>
                          ) : (
                            savedChats.map((chat) => (
                              <div
                                key={chat.id}
                                className={`group flex items-center justify-between gap-1 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                                  chat.id === currentChatId
                                    ? 'bg-[#edf3fe] text-[#0b57d0] font-medium'
                                    : 'text-[#1f1f1f] hover:bg-[#f6f8fb]'
                                }`}
                                onClick={() => loadChatSession(chat)}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate">{chat.title}</p>
                                  <p className="text-[10px] text-[#8f8f8f] font-mono tabular-nums">
                                    {new Date(chat.updatedAt).toLocaleDateString()} ·{' '}
                                    {chat.messages.filter((m) => m.sender === 'user').length} msg
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setChatMenuOpen(false);
                                    setChatPendingDelete(chat);
                                  }}
                                  aria-label={t('Delete saved chat')}
                                  className="p-1 text-[#8f8f8f] hover:text-[#b3261e]"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="g-icon-btn h-9 w-9 text-[#5e5e5e]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Active Geoscience Passport Banner */}
          {currentUser && activePassportId && (
            <div className="flex items-center justify-between gap-2 border-t border-[#e3e3e3] bg-[#edf3fe] px-5 py-2 text-xs text-[#041e49]">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onObservationPinned?.(activePassportId);
                }}
                className="flex min-w-0 items-center gap-2 text-left font-medium hover:underline"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-[#0b57d0]" />
                <span className="truncate">
                  Active Geoscience Passport:{' '}
                  <span className="font-mono tabular-nums font-semibold">{activePassportId}</span>{' '}
                  · Open on Map
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActivePassportId(null)}
                title="Clear active Passport context"
                aria-label="Clear active Passport context"
                className="p-0.5 text-[#041e49]/75 hover:text-[#041e49]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Strict Login Gate when signed out */}
        {!currentUser ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center bg-[#f8fafd]">
            <div className="max-w-md space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f0fe] text-[#0b57d0]">
                <Lock className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-[#1f1f1f]">
                  Sign in required to submit field observations
                </h3>
                <p className="text-xs text-[#5e5e5e] leading-relaxed">
                  Every Geoscience Passport submitted through Earth Talk is linked to an
                  authenticated contributor account so your photos, field reports, follow-up
                  answers, and map pins remain credited to you in My Earth Talk.
                </p>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowLogin(true)}
                  className="group inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#dadce0] bg-white px-5 py-2.5 text-xs font-medium text-[#1f1f1f] shadow-sm transition-all duration-150 hover:border-[#0b57d0]/40 hover:bg-[#f8faff] hover:shadow active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b57d0] whitespace-nowrap"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.19v3.15C3.17 21.31 7.23 24 12 24z" />
                    <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.19C.43 8.12 0 9.87 0 11.7s.43 3.58 1.19 5.12l4.09-3.15z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.23 0 3.17 2.69 1.19 6.58l4.09 3.15c.95-2.83 3.6-4.98 6.72-4.98z" />
                  </svg>
                  <span>{t('Sign in')}</span>
                  <ArrowRight className="h-4 w-4 text-[#5e5e5e] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[#0b57d0]" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Hidden file inputs */}
            <input
              ref={primaryInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={(e) => {
                void handlePrimaryPhotoChosen(e.target.files?.[0]);
                e.currentTarget.value = '';
              }}
            />
            <input
              ref={supportingInputRef}
              type="file"
              multiple
              accept="video/mp4,video/webm,video/3gpp,video/quicktime,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                void handleSupportingFilesChosen(e.target.files);
                e.currentTarget.value = '';
              }}
            />
            <input
              ref={documentInputRef}
              type="file"
              multiple
              accept={DOCUMENT_INPUT_ACCEPT}
              className="hidden"
              onChange={(e) => {
                void handleDocumentFilesChosen(e.target.files);
                e.currentTarget.value = '';
              }}
            />

            {/* Conversational Message Stream with Drag & Drop */}
            <div
              onDragEnter={(e) => {
                if (e.dataTransfer?.types?.includes('Files')) {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }
              }}
              onDragOver={(e) => {
                if (e.dataTransfer?.types?.includes('Files')) {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setIsDraggingFile(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingFile(false);
                const files = e.dataTransfer?.files;
                if (!files || files.length === 0) return;
                const dropped = Array.from(files);
                const documents = dropped.filter((file) =>
                  DOCUMENT_EXTENSIONS.test(file.name)
                );
                const mediaFiles = dropped.filter(
                  (file) => !DOCUMENT_EXTENSIONS.test(file.name)
                );
                if (documents.length > 0) void handleDocumentFilesChosen(documents);
                if (mediaFiles.length === 0) return;
                if (
                  mediaFiles.length === 1 &&
                  !selectedPrimary &&
                  !mediaFiles[0]!.type.toLowerCase().startsWith('video/')
                ) {
                  void handlePrimaryPhotoChosen(mediaFiles[0]);
                } else {
                  void handleSupportingFilesChosen(mediaFiles);
                }
              }}
              className="g-scroll relative flex-1 overflow-y-auto bg-[#efeae2]/40 px-4 sm:px-5 py-4 space-y-4"
            >
              {isDraggingFile && (
                <div className="pointer-events-none sticky inset-x-0 top-2 z-20 flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[#0b57d0] bg-[#e8f0fe]/95 px-4 py-6 text-center shadow-sm">
                  <UploadCloud className="h-7 w-7 text-[#0b57d0]" aria-hidden="true" />
                  <p className="text-xs font-semibold text-[#0b57d0]">
                    Drop specimen photo or video clip here
                  </p>
                  <p className="text-[11px] text-[#3c4043]">
                    Up to 10 MB per file · EXIF GPS is read automatically
                  </p>
                </div>
              )}
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                const passportId =
                  msg.pendingPassportId ||
                  msg.pinConfirmation?.passport_id ||
                  (typeof msg.passport?.passport_id === 'string'
                    ? msg.passport.passport_id
                    : undefined);
                const isEditableTextMsg =
                  isUser &&
                  !msg.imageUri &&
                  !msg.audioUri &&
                  !msg.locationSummary &&
                  !msg.supportingCount &&
                  Boolean(msg.text.trim());
                const versionCount = msg.versions?.length ?? 0;
                const activeVersionIdx = msg.activeVersionIndex ?? Math.max(0, versionCount - 1);

                return (
                  <div
                    key={msg.id}
                    className={`group flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl p-3.5 space-y-2.5 shadow-2xs ${
                        isUser
                          ? 'rounded-br-sm bg-[#0b57d0] text-white'
                          : 'rounded-bl-sm border border-[#dadce0] bg-white text-[#1f1f1f]'
                      }`}
                    >
                      {msg.imageUri && (
                        <div className="space-y-1">
                          <img
                            src={msg.imageUri}
                            alt={msg.imageCaption || 'Submitted site photo'}
                            referrerPolicy="no-referrer"
                            className="max-h-48 w-auto rounded-lg object-contain bg-[#101820]"
                          />
                          {msg.imageCaption && (
                            <p
                              className={`text-[11px] ${
                                isUser ? 'text-white/85' : 'text-[#5e5e5e]'
                              }`}
                            >
                              {msg.imageCaption}
                            </p>
                          )}
                        </div>
                      )}

                      {(msg.audioUri || typeof msg.audioDurationSec === 'number') && (
                        <VoiceNotePlayer
                          src={msg.audioUri}
                          durationSec={msg.audioDurationSec}
                          isUser={isUser}
                        />
                      )}

                      {msg.supportingCount && msg.supportingCount > 0 && (
                        <p
                          className={`text-[11px] font-mono tabular-nums ${
                            isUser ? 'text-white/90' : 'text-[#5e5e5e]'
                          }`}
                        >
                          +{msg.supportingCount} supporting gallery file(s) attached
                        </p>
                      )}

                      {msg.locationSummary && (
                        <p
                          className={`text-[11px] ${
                            isUser ? 'text-white/90' : 'text-[#5e5e5e]'
                          }`}
                        >
                          Location: {msg.locationSummary}
                        </p>
                      )}

                      {msg.transcript && !isUser && (
                        <p className="text-[11px] text-[#5e5e5e] italic">
                          Voice transcript: &ldquo;{msg.transcript}&rdquo;
                        </p>
                      )}

                      {editingMsgId === msg.id ? (
                        <div className="space-y-2 min-w-[220px]">
                          <textarea
                            rows={2}
                            value={editingDraft}
                            onChange={(e) => setEditingDraft(e.target.value)}
                            className="w-full resize-none rounded-lg bg-white px-2.5 py-2 text-xs text-[#1f1f1f] focus:outline-none"
                            autoFocus
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingMsgId(null);
                                setEditingDraft('');
                              }}
                              className="rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/25"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!editingDraft.trim() || isSending}
                              onClick={() => void handleSaveEditedMessage(msg.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0b57d0] hover:bg-white/90 disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" />
                              <span>Save &amp; Submit</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        msg.text &&
                        (isUser ? (
                          <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        ) : (
                          <FormattedGeoAiText text={msg.text} />
                        ))
                      )}

                      {/* Follow-up questions from GeoAI */}
                      {msg.questionsForUser && msg.questionsForUser.length > 0 && !isUser && (
                        <div className="space-y-1.5 border-t border-[#e3e3e3] pt-2.5">
                          <p className="text-[11px] font-semibold text-[#3c4043]">
                            Questions &amp; answers — click to reply in chat:
                          </p>
                          {msg.questionsForUser.map((q, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setInputText(`Regarding "${q}": `);
                                composerTextareaRef.current?.focus();
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#e3e3e3] bg-[#f8fafd] px-3 py-2 text-left text-xs text-[#1f1f1f] hover:bg-[#edf3fe]"
                            >
                              <span>{q}</span>
                              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#0b57d0]" />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Map Visibility & Pin Precision Confirmation */}
                      {msg.awaitingPinConfirmation && passportId && !isUser && (
                        <div className="space-y-2.5 border-t border-[#e3e3e3] pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-[#1f1f1f]">
                              Approve &amp; choose map visibility:
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setLocationDrawerOpen(true);
                                setToolsTrayOpen(false);
                              }}
                              className="text-[11px] font-medium text-[#0b57d0] hover:underline whitespace-nowrap"
                            >
                              {stagedLocationSummary ? 'Edit attached location' : 'Set Rwanda location / GPS'}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {PIN_OPTIONS.map((opt) => (
                              <button
                                key={opt.decision}
                                type="button"
                                disabled={isSending}
                                onClick={() =>
                                  void handlePinDecision(passportId, opt.decision, opt.label)
                                }
                                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap ${
                                  opt.primary
                                    ? 'bg-[#0b57d0] text-white hover:bg-[#0842a0]'
                                    : 'border border-[#c7c7c7] bg-white text-[#1f1f1f] hover:bg-[#f6f8fb]'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Confirmed Pin Status */}
                      {msg.pinConfirmation && !isUser && (
                        <div className="flex items-center gap-1.5 border-t border-[#e3e3e3] pt-2.5 text-xs font-medium text-[#137333]">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>
                            {msg.pinConfirmation.is_public
                              ? `Published (${msg.pinConfirmation.precision}${
                                  msg.pinConfirmation.district
                                    ? ` · ${msg.pinConfirmation.district} District`
                                    : ''
                                })`
                              : 'Saved privately to My Earth Talk'}
                          </span>
                        </div>
                      )}

                      {/* Open Geoscience Passport Card */}
                      {passportId && !isUser && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onObservationPinned?.(passportId);
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#dadce0] bg-[#f8fafd] px-3 py-2.5 text-left transition-colors hover:bg-[#edf3fe]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="h-4 w-4 shrink-0 text-[#0b57d0]" />
                            <div className="min-w-0">
                              <p className="text-[11px] text-[#5e5e5e]">Geoscience Passport</p>
                              <p className="truncate text-xs font-mono tabular-nums font-semibold text-[#1f1f1f]">
                                {formatPassportId(passportId)}
                              </p>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#0b57d0] whitespace-nowrap">
                            <span>Open</span>
                            <ChevronRight className="h-4 w-4" />
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="mt-1 flex items-center gap-2 px-1">
                      {!isUser && msg.text && (
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(msg.text).then(() => {
                              setCopiedMsgId(msg.id);
                              if (copiedMsgTimerRef.current !== null) {
                                window.clearTimeout(copiedMsgTimerRef.current);
                              }
                              copiedMsgTimerRef.current = window.setTimeout(() => {
                                setCopiedMsgId((cur) => (cur === msg.id ? null : cur));
                                copiedMsgTimerRef.current = null;
                              }, 1800);
                            });
                          }}
                          aria-label="Copy response"
                          className="inline-flex items-center gap-1 text-[11px] text-[#5e5e5e] opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 hover:text-[#0b57d0] transition-opacity"
                        >
                          {copiedMsgId === msg.id ? (
                            <>
                              <Check className="h-3 w-3 text-[#137333]" />
                              <span className="text-[#137333]">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                      {isEditableTextMsg && editingMsgId !== msg.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMsgId(msg.id);
                            setEditingDraft(msg.text);
                          }}
                          title="Edit prompt"
                          aria-label="Edit prompt"
                          className="inline-flex items-center gap-1 text-[11px] text-[#5e5e5e] opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 hover:text-[#0b57d0] transition-opacity"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>Edit</span>
                        </button>
                      )}
                      {versionCount > 1 && (
                        <div className="inline-flex items-center gap-1 text-[11px] font-mono tabular-nums text-[#5e5e5e]">
                          <button
                            type="button"
                            disabled={activeVersionIdx <= 0}
                            onClick={() =>
                              handleSwitchMessageVersion(msg.id, activeVersionIdx - 1)
                            }
                            aria-label="Previous version"
                            className="p-0.5 hover:text-[#1f1f1f] disabled:opacity-35"
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>
                          <span>
                            {activeVersionIdx + 1} / {versionCount}
                          </span>
                          <button
                            type="button"
                            disabled={activeVersionIdx >= versionCount - 1}
                            onClick={() =>
                              handleSwitchMessageVersion(msg.id, activeVersionIdx + 1)
                            }
                            aria-label="Next version"
                            className="p-0.5 hover:text-[#1f1f1f] disabled:opacity-35"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <span className="text-[11px] font-mono tabular-nums text-[#8f8f8f]">
                        {msg.timestamp}
                      </span>
                    </div>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex items-start">
                  <div className="rounded-2xl rounded-bl-sm border border-[#dadce0] bg-white px-4 py-3 text-xs text-[#5e5e5e]">
                    Earth Talk GeoAI is thinking…
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Composer & Attachment Tray (WhatsApp-style) */}
            <div className="shrink-0 bg-[#f0f2f5] px-3 sm:px-4 py-2.5 space-y-2">
              {/* Compact Location Drawer */}
              {locationDrawerOpen && (
                <div className="rounded-xl border border-[#dadce0] bg-white p-3 space-y-2.5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 text-xs font-semibold text-[#1f1f1f]">
                      Location (Rwanda · District · Sector · Cell · Village)
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleUseLiveGps}
                        disabled={gpsBusy}
                        className="inline-flex items-center gap-1 rounded-md border border-[#c7c7c7] bg-white px-2 py-1 text-[11px] font-medium text-[#0b57d0] hover:bg-[#f0f4f9] whitespace-nowrap"
                      >
                        <Compass className="h-3 w-3" />
                        <span>{gpsBusy ? 'Reading…' : 'Live GPS'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLocationDrawerOpen(false)}
                        aria-label="Collapse location panel"
                        className="p-0.5 text-[#5e5e5e] hover:text-[#1f1f1f]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {mismatchKm !== null &&
                    mismatchKm > 0.5 &&
                    exifInfo?.latitude != null &&
                    exifInfo.longitude != null &&
                    liveGpsCoords && (
                      <div className="rounded-lg border border-[#f59e0b]/50 bg-[#fffbeb] p-2.5 space-y-1.5 text-[11px] text-[#92400e]">
                        <div className="flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>
                            Live GPS is{' '}
                            <span className="font-mono tabular-nums">
                              {mismatchKm.toFixed(2)} km
                            </span>{' '}
                            from photo EXIF ({exifInfo.latitude.toFixed(4)},{' '}
                            {exifInfo.longitude.toFixed(4)}).
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setLatitude(exifInfo.latitude!.toFixed(6));
                              setLongitude(exifInfo.longitude!.toFixed(6));
                              if (exifInfo.inferredDistrict) setDistrict(exifInfo.inferredDistrict);
                            }}
                            className="rounded bg-[#92400e] px-2 py-1 text-[11px] font-medium text-white whitespace-nowrap"
                          >
                            Keep Photo EXIF GPS
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLatitude(liveGpsCoords.lat.toFixed(6));
                              setLongitude(liveGpsCoords.lng.toFixed(6));
                              const inf = inferNearestRwandaDistrict(
                                liveGpsCoords.lat,
                                liveGpsCoords.lng
                              );
                              if (inf) setDistrict(inf);
                            }}
                            className="rounded border border-[#d97706] bg-white px-2 py-1 text-[11px] font-medium text-[#92400e] whitespace-nowrap"
                          >
                            Use Live GPS
                          </button>
                        </div>
                      </div>
                    )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <select
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      aria-label="Rwanda District"
                      className="h-8 rounded-lg border border-[#c7c7c7] bg-white px-2 text-xs"
                    >
                      <option value="">District</option>
                      {RWANDA_DISTRICT_CENTERS.map((d) => (
                        <option key={d.name} value={d.name}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={sector}
                      onChange={(e) => setSector(e.target.value)}
                      placeholder="Sector (e.g. Bwishyura)"
                      className="h-8 rounded-lg border border-[#c7c7c7] bg-white px-2 text-xs"
                    />
                    <input
                      type="text"
                      value={cell}
                      onChange={(e) => setCell(e.target.value)}
                      placeholder="Cell (e.g. Bwishyura)"
                      className="h-8 rounded-lg border border-[#c7c7c7] bg-white px-2 text-xs"
                    />
                    <input
                      type="text"
                      value={village}
                      onChange={(e) => setVillage(e.target.value)}
                      placeholder="Village (e.g. Rusange)"
                      className="h-8 rounded-lg border border-[#c7c7c7] bg-white px-2 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      placeholder="Lat (-2.1500)"
                      className="h-8 rounded-lg border border-[#c7c7c7] bg-white px-2 text-xs font-mono tabular-nums"
                    />
                    <input
                      type="text"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      placeholder="Lng (29.3500)"
                      className="h-8 rounded-lg border border-[#c7c7c7] bg-white px-2 text-xs font-mono tabular-nums"
                    />
                    <input
                      type="text"
                      value={locationNote}
                      onChange={(e) => setLocationNote(e.target.value)}
                      placeholder="Landmark (optional)"
                      className="h-8 rounded-lg border border-[#c7c7c7] bg-white px-2 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Tool Notice */}
              {toolNotice && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs text-[#3c4043] shadow-2xs">
                  <span>{toolNotice}</span>
                  <button
                    type="button"
                    onClick={() => setToolNotice(null)}
                    aria-label="Dismiss notice"
                    className="p-0.5 text-[#5e5e5e] hover:text-[#1f1f1f]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Staged Primary Photo + Supporting Gallery + Location Preview */}
              {(selectedPrimary || supportingMedia.length > 0 || stagedDocuments.length > 0 || stagedLocationSummary) && (
                <div className="rounded-xl bg-white p-2.5 space-y-2 max-h-48 overflow-y-auto g-scroll shadow-2xs">
                  {selectedPrimary && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={selectedPrimary.previewUri}
                          alt={selectedPrimary.fileName}
                          referrerPolicy="no-referrer"
                          className="h-11 w-11 shrink-0 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium text-[#1f1f1f]">
                              1 / {1 + supportingMedia.length} · {selectedPrimary.fileName}
                            </span>
                            {activePassportId && (
                              <button
                                type="button"
                                onClick={() => setAttachAsAngleToActive((prev) => !prev)}
                                className="text-[11px] font-medium text-[#0b57d0] hover:underline whitespace-nowrap"
                              >
                                {attachAsAngleToActive
                                  ? `Adding angle to ${activePassportId}`
                                  : 'Creating new Passport'}
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            value={selectedPrimary.caption}
                            onChange={(e) =>
                              setSelectedPrimary((prev) =>
                                prev ? { ...prev, caption: e.target.value } : null
                              )
                            }
                            placeholder={DEFAULT_PRIMARY_CAPTION}
                            className="w-full h-7 rounded border border-[#dadce0] bg-white px-2 text-[11px]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedPrimary(null)}
                          aria-label="Remove staged photo"
                          className="p-1 text-[#5e5e5e] hover:text-[#b3261e]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {!attachAsAngleToActive && (
                        <input
                          type="text"
                          value={postTitle}
                          onChange={(e) => setPostTitle(e.target.value)}
                          placeholder="Optional Passport Title (leave blank for GeoAI title)"
                          maxLength={120}
                          className="w-full h-7 rounded border border-[#dadce0] bg-white px-2 text-[11px]"
                        />
                      )}
                    </div>
                  )}

                  {supportingMedia.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono tabular-nums text-[#5e5e5e] shrink-0">
                        {(selectedPrimary ? 2 : 1) + idx} · {item.kind === 'video' ? 'Clip' : 'Photo'}
                      </span>
                      <input
                        type="text"
                        value={item.caption}
                        onChange={(e) =>
                          setSupportingMedia((prev) =>
                            prev.map((m) =>
                              m.id === item.id ? { ...m, caption: e.target.value } : m
                            )
                          )
                        }
                        placeholder="Gallery caption"
                        className="flex-1 h-7 rounded border border-[#dadce0] bg-white px-2 text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setSupportingMedia((prev) => prev.filter((m) => m.id !== item.id))
                        }
                        aria-label="Remove supporting media"
                        className="p-1 text-[#5e5e5e] hover:text-[#b3261e]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {stagedDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[#b45309]" />
                      <span className="flex-1 truncate text-[11px] text-[#3c4043]">
                        {doc.fileName}
                        <span className="ml-1 text-[#80868b]">
                          ({(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setStagedDocuments((prev) => prev.filter((d) => d.id !== doc.id))
                        }
                        aria-label="Remove staged document"
                        className="p-1 text-[#5e5e5e] hover:text-[#b3261e]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}

                  {stagedLocationSummary && (
                    <div className="flex items-center justify-between gap-2 border-t border-[#e3e3e3] pt-1.5 text-[11px] text-[#3c4043]">
                      <button
                        type="button"
                        onClick={() => setLocationDrawerOpen(true)}
                        className="flex items-center gap-1.5 truncate text-left hover:text-[#0b57d0]"
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-[#137333]" />
                        <span className="truncate">{stagedLocationSummary}</span>
                      </button>
                      <button
                        type="button"
                        onClick={clearLocationFields}
                        aria-label="Clear attached location"
                        className="p-0.5 text-[#5e5e5e] hover:text-[#b3261e]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Scrollable Suggested Quick Actions with < > Arrows */}
              {latestSuggestions.length > 0 && (
                <div className="relative flex items-center gap-1">
                  {canScrollLeft && (
                    <button
                      type="button"
                      onClick={() =>
                        suggestionsRef.current?.scrollBy({ left: -180, behavior: 'smooth' })
                      }
                      aria-label="Scroll suggestions left"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#3c4043] shadow-sm hover:bg-[#e8edf5]"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  )}
                  <div
                    ref={suggestionsRef}
                    onScroll={updateSuggestionScrollArrows}
                    className="flex flex-1 items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {latestSuggestions.map((action, idx) => (
                      <button
                        key={`${action}_${idx}`}
                        type="button"
                        disabled={isSending}
                        onClick={() => handleSuggestedAction(action)}
                        className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-medium text-[#3c4043] shadow-2xs hover:bg-[#edf3fe] hover:text-[#0b57d0] disabled:opacity-50 whitespace-nowrap"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                  {canScrollRight && (
                    <button
                      type="button"
                      onClick={() =>
                        suggestionsRef.current?.scrollBy({ left: 180, behavior: 'smooth' })
                      }
                      aria-label="Scroll suggestions right"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#3c4043] shadow-sm hover:bg-[#e8edf5]"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}

              {/* WhatsApp-Style Chat Input Row / Recording Bar */}
              {isRecordingVoice ? (
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center justify-between gap-3 rounded-full bg-white px-4 py-2 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={cancelVoiceRecording}
                        aria-label="Cancel voice recording"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#b3261e] hover:bg-[#fdf2f2]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#e11d48] animate-pulse"
                        aria-hidden="true"
                      />
                      <span className="font-mono tabular-nums text-[13px] font-semibold text-[#1f1f1f]">
                        {formatDuration(recordingSeconds)}
                      </span>
                    </div>
                    <div className="flex items-center gap-[3px] h-5 flex-1 max-w-[140px]" aria-hidden="true">
                      {recordingLevels.map((lvl, idx) => (
                        <span
                          key={idx}
                          className="flex-1 rounded-full bg-[#00a884] transition-all duration-75"
                          style={{ height: `${Math.round(lvl * 16) + 4}px` }}
                        />
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={stopAndSendVoiceRecording}
                    aria-label="Send voice note"
                    title="Send voice note"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm transition-colors hover:bg-[#008f70]"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative flex items-end gap-2">
                  {/* Vertical, borderless Paperclip attach popover */}
                  {toolsTrayOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-20"
                        aria-hidden="true"
                        onClick={() => setToolsTrayOpen(false)}
                      />
                      <div className="absolute bottom-full left-0 z-30 mb-2 flex flex-col items-start gap-0.5 rounded-2xl bg-white/95 py-2 px-1.5 shadow-lg backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => primaryInputRef.current?.click()}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#1f1f1f] hover:bg-[#f0f2f5] whitespace-nowrap"
                        >
                          <Camera className="h-4 w-4 shrink-0 text-[#0b57d0]" />
                          <span>Site Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => supportingInputRef.current?.click()}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#1f1f1f] hover:bg-[#f0f2f5] whitespace-nowrap"
                        >
                          <Film className="h-4 w-4 shrink-0 text-[#7c3aed]" />
                          <span>Angles / Video</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => documentInputRef.current?.click()}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#1f1f1f] hover:bg-[#f0f2f5] whitespace-nowrap"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-[#b45309]" />
                          <span>File / PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleUseLiveGps}
                          disabled={gpsBusy}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#1f1f1f] hover:bg-[#f0f2f5] disabled:opacity-50 whitespace-nowrap"
                        >
                          <Compass className="h-4 w-4 shrink-0 text-[#16a34a]" />
                          <span>{gpsBusy ? 'Reading GPS…' : 'Live GPS'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLocationDrawerOpen((prev) => !prev);
                            setToolsTrayOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#1f1f1f] hover:bg-[#f0f2f5] whitespace-nowrap"
                        >
                          <MapPin className="h-4 w-4 shrink-0 text-[#ea580c]" />
                          <span>Rwanda Place</span>
                        </button>
                      </div>
                    </>
                  )}

                  {/* WhatsApp-style rounded white input capsule */}
                  <div className="flex flex-1 items-end gap-1 rounded-[24px] bg-white px-2.5 py-1.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setToolsTrayOpen((prev) => !prev)}
                      aria-label="Attach photo, video clip, or location"
                      title="Attach"
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                        toolsTrayOpen
                          ? 'bg-[#edf3fe] text-[#0b57d0]'
                          : 'text-[#54656f] hover:bg-[#f0f2f5]'
                      }`}
                    >
                      <Paperclip className="h-5 w-5 -rotate-45" />
                    </button>

                    <textarea
                      ref={composerTextareaRef}
                      rows={1}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (canSend) {
                            void handleSendComposer();
                          }
                        }
                      }}
                      placeholder={
                        isStagingFiles
                          ? 'Preparing file…'
                          : selectedPrimary
                            ? 'Write your field report for this photo…'
                            : 'Message'
                      }
                      className="max-h-28 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[13px] leading-snug text-[#1f1f1f] placeholder-[#667781] focus:outline-none"
                    />
                  </div>

                  {/* WhatsApp-style circular Action button (Send when content present, Mic otherwise) */}
                  {canSend ? (
                    <button
                      type="button"
                      disabled={isSending || isStagingFiles}
                      onClick={() => void handleSendComposer()}
                      aria-label="Send message"
                      title="Send"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm transition-colors hover:bg-[#008f70] disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void startVoiceRecording()}
                      disabled={isSending || isStagingFiles}
                      aria-label="Record voice note"
                      title="Record voice note"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm transition-colors hover:bg-[#008f70] disabled:opacity-40"
                    >
                      <Mic className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <GeneralLoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onUserLogin={() => setShowLogin(false)}
      />

      {chatPendingDelete && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[#0b0f14]/65 p-4 backdrop-blur-xs"
          onClick={(event) => {
            if (event.target === event.currentTarget) setChatPendingDelete(null);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
            aria-describedby="delete-chat-description"
            className="w-full max-w-sm rounded-2xl border border-[#dadce0] bg-white p-5 shadow-2xl"
          >
            <h2 id="delete-chat-title" className="text-[15px] font-semibold text-[#1f1f1f]">
              {t('Delete saved chat?')}
            </h2>
            <p id="delete-chat-description" className="mt-2 text-[13px] text-[#5e5e5e]">
              {t('This chat and its messages will be deleted from this device. This cannot be undone.')}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setChatPendingDelete(null)}
                className="g-btn g-btn-tonal rounded-lg px-4 py-2 text-[13px] font-medium"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteSavedChat(chatPendingDelete.id);
                  setChatPendingDelete(null);
                }}
                className="rounded-lg bg-[#b3261e] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#8e1d17]"
              >
                {t('Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
