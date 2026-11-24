import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
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
  Upload,
  X,
} from 'lucide-react-native';
import {
  addPostMedia,
  sendWebChatMessage,
  sendWebChatMessageWithProgress,
  uploadPostAttachment,
  type WebChatLocationPayload,
  type WebChatMessageResponse,
  type WebPhotoSubmissionResult,
} from '../src/services/postsApi';
import { useCommunityUser } from '../src/services/communityAuth';
import { CREDIT_PREFIX_OPTIONS, usePreferences } from '../src/services/preferences';
import { useTheme } from '../src/lib/themeMode';
import { formatCreditLines, nearestDistrictPart, reverseGeocodeParts } from '../src/services/photoCredit';
import {
  clearOutbox,
  loadOutbox,
  readOutboxBase64,
  removeFromOutbox,
  saveBase64ToOutbox,
  type OutboxPhoto,
} from '../src/services/photoOutbox';
import { PhotoCreditStamp, type PhotoCreditStampRef } from '../src/components/PhotoCreditStamp';
import { dataUrlToBase64, documentMimeType, fileToDataUrl } from '../src/lib/file';
import { formatPassportId } from '../src/lib/format';
import {
  distanceBetweenKm,
  inferNearestRwandaDistrict,
  RWANDA_DISTRICT_CENTERS,
  pickerGpsFromExif,
} from '../src/utils/exifGps';

/**
 * "Submit Field Observation" — the web's GeoAI chat + voice field-submission
 * flow (WebFieldSubmissionModal) ported to a full-screen route: a chat
 * thread with a WhatsApp-style composer, voice notes, guided photo
 * attachment and map-pin confirmation. Copy follows the web verbatim.
 */

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

const PLAYBACK_RATES: Array<1 | 1.5 | 2> = [1, 1.5, 2];

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const DOCUMENT_PICKER_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/plain',
  'text/csv',
  'public.item',
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
  const greetingName = displayName?.trim() ? `, ${displayName.trim()}` : '';
  return {
    id: 'welcome_1',
    sender: 'assistant',
    text:
      `Welcome${greetingName}.\n\n` +
      `Send a clear daylight photograph of a rock, mineral, outcrop, or landform using the attach icon below to create a Geoscience Passport.\n\n` +
      `• Attach extra angles or short video clips to build your Passport gallery.\n` +
      `• Write or record a voice note for your field report.\n` +
      `• Ask any geological question or confirm how to pin your observation on the map.`,
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

async function readSavedChats(userId: string | undefined): Promise<SavedChatSession[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(chatHistoryStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persistSavedChats(userId: string | undefined, chats: SavedChatSession[]): Promise<void> {
  if (!userId) return;
  try {
    const sanitized = chats.slice(0, 20).map((c) => ({
      ...c,
      messages: c.messages.map(stripHeavyUris),
    }));
    await AsyncStorage.setItem(chatHistoryStorageKey(userId), JSON.stringify(sanitized));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

function buildConversationHistoryPayload(
  msgs: ChatMessageItem[]
): Array<{ role: 'user' | 'assistant'; text: string }> {
  return msgs
    .filter((m) => m.id !== 'welcome_1' && m.text.trim().length > 0)
    .slice(-12)
    .map((m) => ({
      role: m.sender,
      text: m.text.slice(0, 600),
    }));
}

/** Inline **bold** / *italic* / `code` markdown, rendered with nested Text. */
function renderInlineMarkdown(text: string, styles: {
  mdBold: unknown;
  mdItalic: unknown;
  mdCode: unknown;
}): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return tokens.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <Text key={index} style={styles.mdBold as number}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <Text key={index} style={styles.mdItalic as number}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <Text key={index} style={styles.mdCode as number}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return <Text key={index}>{part}</Text>;
  });
}

const FormattedGeoAiText: React.FC<{ text: string }> = ({ text }) => {
  const md = {
    mdBold: styles.mdBold,
    mdItalic: styles.mdItalic,
    mdCode: styles.mdCode,
  };
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
        <Text key={`h-${i}`} style={styles.geoAiHeading}>
          {renderInlineMarkdown(headingMatch[2] ?? trimmed, md)}
        </Text>
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
        <View key={`ul-${i}`} style={styles.geoAiList}>
          {items.map((item, idx) => (
            <Text key={idx} style={styles.geoAiListItem}>
              •  {renderInlineMarkdown(item, md)}
            </Text>
          ))}
        </View>
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
        <View key={`ol-${i}`} style={styles.geoAiList}>
          {items.map((item, idx) => (
            <Text key={idx} style={styles.geoAiListItem}>
              {idx + 1}.  {renderInlineMarkdown(item, md)}
            </Text>
          ))}
        </View>
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
      <Text key={`p-${i}`} style={styles.geoAiParagraph}>
        {renderInlineMarkdown(paragraphLines.join('\n'), md)}
      </Text>
    );
  }

  return <View style={styles.geoAiBlocks}>{blocks}</View>;
};

interface VoiceNotePlayerProps {
  src?: string;
  durationSec?: number;
  isUser: boolean;
}

const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({ src, durationSec = 0, isUser }) => {
  const soundRef = useRef<Audio.Sound | null>(null);
  const waveformWidthRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSec);
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1);

  useEffect(() => {
    let cancelled = false;
    if (!src) return;
    (async () => {
      try {
        const { sound, status } = await Audio.Sound.createAsync({ uri: src });
        if (cancelled) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
        const loaded = status as { durationMillis?: number };
        if (loaded.durationMillis && loaded.durationMillis > 0) {
          setDuration(loaded.durationMillis / 1000);
        }
        sound.setOnPlaybackStatusUpdate((update) => {
          const s = update as {
            isPlaying?: boolean;
            positionMillis?: number;
            durationMillis?: number;
            didJustFinish?: boolean;
          };
          if (s.didJustFinish) {
            setPlaying(false);
            setCurrentTime(0);
            return;
          }
          setPlaying(Boolean(s.isPlaying));
          if (typeof s.positionMillis === 'number') setCurrentTime(s.positionMillis / 1000);
          if (s.durationMillis && s.durationMillis > 0) setDuration(s.durationMillis / 1000);
        });
      } catch {
        // Playback unavailable for this clip
      }
    })();
    return () => {
      cancelled = true;
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    void soundRef.current?.setRateAsync(playbackRate, true).catch(() => undefined);
  }, [playbackRate]);

  const togglePlay = () => {
    const sound = soundRef.current;
    if (!sound || !src) return;
    if (playing) {
      void sound.pauseAsync();
      setPlaying(false);
    } else {
      void sound.playAsync().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const cyclePlaybackRate = () => {
    setPlaybackRate((prev) => {
      const idx = PLAYBACK_RATES.indexOf(prev);
      return PLAYBACK_RATES[(idx + 1) % PLAYBACK_RATES.length]!;
    });
  };

  const seekToRatio = (ratio: number) => {
    const sound = soundRef.current;
    if (!sound || !duration) return;
    const safe = Math.max(0, Math.min(1, ratio));
    void sound.setPositionAsync(safe * duration * 1000);
    setCurrentTime(safe * duration);
  };

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <View style={[styles.voicePlayer, isUser ? styles.voicePlayerUser : styles.voicePlayerAssistant]}>
      <Pressable
        disabled={!src}
        onPress={togglePlay}
        accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
        style={({ pressed }) => [
          styles.voicePlayButton,
          isUser ? styles.voicePlayButtonUser : styles.voicePlayButtonAssistant,
          !src && { opacity: 0.4 },
          pressed && { opacity: 0.8 },
        ]}
      >
        {playing ? (
          <Pause size={16} color={isUser ? '#0b57d0' : '#ffffff'} fill={isUser ? '#0b57d0' : '#ffffff'} />
        ) : (
          <Play size={16} color={isUser ? '#0b57d0' : '#ffffff'} fill={isUser ? '#0b57d0' : '#ffffff'} />
        )}
      </Pressable>

      <View style={styles.voiceBody}>
        <View
          style={styles.waveform}
          onLayout={(e) => {
            waveformWidthRef.current = e.nativeEvent.layout.width;
          }}
        >
          {WAVEFORM_BARS.map((height, idx) => {
            const filled = idx / WAVEFORM_BARS.length <= progress;
            return (
              <Pressable
                key={idx}
                style={[styles.waveformBar, { height: Math.round(height * 18) + 4 }]}
                onPress={(e) => {
                  if (waveformWidthRef.current > 0) {
                    seekToRatio(e.nativeEvent.locationX / waveformWidthRef.current);
                  }
                }}
              >
                <View
                  style={[
                    styles.waveformFill,
                    { height: Math.round(height * 18) + 4 },
                    filled
                      ? isUser
                        ? styles.waveformFillUserOn
                        : styles.waveformFillAssistantOn
                      : isUser
                        ? styles.waveformFillUserOff
                        : styles.waveformFillAssistantOff,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
        <View style={styles.voiceMeta}>
          <Text style={[styles.voiceTime, isUser ? styles.voiceTimeUser : styles.voiceTimeAssistant]}>
            {playing || currentTime > 0 ? formatDuration(currentTime) : formatDuration(duration)}
          </Text>
          <Pressable
            disabled={!src}
            onPress={cyclePlaybackRate}
            accessibilityLabel={`Change playback speed (currently ${playbackRate}x)`}
            style={[
              styles.voiceRateButton,
              isUser ? styles.voiceRateButtonUser : styles.voiceRateButtonAssistant,
              !src && { opacity: 0.4 },
            ]}
          >
            <Text style={[styles.voiceRateText, isUser ? styles.voiceRateTextUser : styles.voiceRateTextAssistant]}>
              {playbackRate}x
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default function SubmitScreen() {
  const insets = useSafeAreaInsets();
  const currentUser = useCommunityUser();

  const [showChatMenu, setShowChatMenu] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string>(() => `chat_${Date.now()}`);
  const [savedChats, setSavedChats] = useState<SavedChatSession[]>([]);

  const [messages, setMessages] = useState<ChatMessageItem[]>(() => [
    buildWelcomeMessage(),
  ]);

  const [inputText, setInputText] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [selectedPrimary, setSelectedPrimary] = useState<StagedPrimaryPhoto | null>(null);
  const [attachAsAngleToActive, setAttachAsAngleToActive] = useState(false);
  const [supportingMedia, setSupportingMedia] = useState<StagedSupportingItem[]>([]);
  const [stagedDocuments, setStagedDocuments] = useState<StagedDocument[]>([]);

  // Photo credit strip: the web burns "Earth Talk GeoAI - Contributed by <name>"
  // plus the place and coordinates into downloaded media; the app burns the
  // same strip into the site photo when it is sent.
  const stampRef = useRef<PhotoCreditStampRef>(null);
  const { preferences, setPhotoCreditNameHidden, setCreditTextScale, setCreditPrefix } = usePreferences();
  const { dark, palette: t } = useTheme();
  const [prefixPickerOpen, setPrefixPickerOpen] = useState(false);

  // Per-send upload progress: the XHR upload event drives one honest
  // "Uploading N photos" row while the request is in flight. The Cancel
  // control aborts the request and puts the photos back in the tray.
  const [uploadStatus, setUploadStatus] = useState<{ total: number; fraction: number } | null>(null);
  const abortUploadRef = useRef<(() => void) | null>(null);

  // Photos captured without an account: saved on this phone, then offered
  // back for submission once the contributor signs in.
  const [outboxPhotos, setOutboxPhotos] = useState<OutboxPhoto[]>([]);
  useEffect(() => {
    void loadOutbox().then(setOutboxPhotos);
  }, []);
  useEffect(() => {
    // Re-check the outbox when the session changes — signing in is the moment
    // the saved photos can become part of the contributor's own information.
    void loadOutbox().then(setOutboxPhotos);
  }, [currentUser?.public_user_id]);

  // Location tray state
  const [locationDrawerOpen, setLocationDrawerOpen] = useState(false);
  const [exifCoords, setExifCoords] = useState<{ latitude: number; longitude: number; inferredDistrict: string | null } | null>(null);
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
  const [districtPickerOpen, setDistrictPickerOpen] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);

  const [activePassportId, setActivePassportId] = useState<string | null>(null);
  const [toolsTrayOpen, setToolsTrayOpen] = useState(false);
  const [toolNotice, setToolNotice] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // --- Photo credit strip --------------------------------------------------
  // Coordinates carried onto the strip: the photo's own EXIF GPS leads, then
  // the live GPS fix, then whatever the form holds.
  const creditCoords = useMemo(() => {
    if (exifCoords) return { latitude: exifCoords.latitude, longitude: exifCoords.longitude };
    if (liveGpsCoords) return { latitude: liveGpsCoords.lat, longitude: liveGpsCoords.lng };
    const la = Number(latitude);
    const ln = Number(longitude);
    if (latitude.trim() && longitude.trim() && Number.isFinite(la) && Number.isFinite(ln)) {
      return { latitude: la, longitude: ln };
    }
    return null;
  }, [exifCoords, liveGpsCoords, latitude, longitude]);

  // Place names come from the platform reverse geocoder, with the nearest
  // known Rwanda district as the offline fallback.
  const [creditParts, setCreditParts] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    setCreditParts([]);
    if (!creditCoords) return;
    void reverseGeocodeParts(creditCoords.latitude, creditCoords.longitude).then((parts) => {
      if (cancelled) return;
      setCreditParts(
        parts.length > 0
          ? parts
          : nearestDistrictPart(creditCoords.latitude, creditCoords.longitude)
      );
    });
    return () => {
      cancelled = true;
    };
  }, [creditCoords]);

  // The name line only carries the signed-in contributor's name when they
  // have not switched it off on this screen.
  const contributorName = preferences.photoCreditNameHidden ? null : currentUser?.display_name ?? null;
  const creditLines = useMemo(
    () =>
      formatCreditLines({
        latitude: creditCoords?.latitude ?? null,
        longitude: creditCoords?.longitude ?? null,
        placeParts: creditParts,
        contributorName,
        prefix: preferences.creditPrefix,
      }),
    [creditCoords, creditParts, contributorName, preferences.creditPrefix]
  );
  // -------------------------------------------------------------------------

  // Editing sent user text prompts (ChatGPT-style edit + version history)
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Voice Recording state + live timer + mic level meter
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingLevels, setRecordingLevels] = useState<number[]>(() => Array(16).fill(0.25));
  const recordingRef = useRef<Audio.Recording | null>(null);
  const voiceCancelledRef = useRef(false);
  const recordingDurationRef = useRef(0);

  const messagesScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    void readSavedChats(currentUser?.public_user_id).then(setSavedChats);
  }, [currentUser?.public_user_id]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0]?.id === 'welcome_1') {
        return [buildWelcomeMessage(currentUser?.display_name)];
      }
      return prev;
    });
  }, [currentUser?.display_name]);

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
      void persistSavedChats(currentUser.public_user_id, next);
      return next.slice(0, 20);
    });
  }, [messages, activePassportId, currentChatId, currentUser?.public_user_id]);

  useEffect(() => {
    if (!isRecordingVoice) {
      setRecordingSeconds(0);
      return;
    }
    recordingDurationRef.current = 0;
    const interval = setInterval(() => {
      recordingDurationRef.current += 1;
      setRecordingSeconds(recordingDurationRef.current);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecordingVoice]);

  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        void recordingRef.current.stopAndUnloadAsync().catch(() => undefined);
        recordingRef.current = null;
      }
    };
  }, []);

  const normalizedDistrict = cleanAdminUnit(district, 'District');
  const normalizedSector = cleanAdminUnit(sector, 'Sector');
  const normalizedCell = cleanAdminUnit(cell, 'Cell');
  const normalizedVillage = cleanAdminUnit(village, 'Village');

  const buildCurrentLocationPayload = useCallback((): WebChatLocationPayload | null => {
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
  }, [latitude, longitude, liveGpsCoords, normalizedDistrict, normalizedSector, normalizedCell, normalizedVillage, locationNote]);

  const stagedLocationPayload = buildCurrentLocationPayload();
  const stagedLocationSummary = formatLocationSummary(stagedLocationPayload);

  const mismatchKm =
    exifCoords && liveGpsCoords
      ? distanceBetweenKm(liveGpsCoords.lat, liveGpsCoords.lng, exifCoords.latitude, exifCoords.longitude)
      : null;

  const clearLocationFields = () => {
    setExifCoords(null);
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
    clearLocationFields();
    setLocationDrawerOpen(false);
    setActivePassportId(null);
    setToolsTrayOpen(false);
    setToolNotice(null);
    setEditingMsgId(null);
    setShowChatMenu(false);
  };

  const loadChatSession = (session: SavedChatSession) => {
    setCurrentChatId(session.id);
    setMessages(session.messages.length > 0 ? session.messages : [buildWelcomeMessage(currentUser?.display_name)]);
    setActivePassportId(session.activePassportId);
    setInputText('');
    setSelectedPrimary(null);
    setSupportingMedia([]);
    setLocationDrawerOpen(false);
    setToolsTrayOpen(false);
    setEditingMsgId(null);
    setShowChatMenu(false);
  };

  const deleteSavedChat = (chatId: string) => {
    const next = savedChats.filter((c) => c.id !== chatId);
    setSavedChats(next);
    void persistSavedChats(currentUser?.public_user_id, next);
    if (chatId === currentChatId) {
      startFreshChat();
    }
  };

  const openPassport = (passportId: string) => {
    setShowChatMenu(false);
    router.push({ pathname: '/passport/[id]', params: { id: passportId } });
  };

  const handlePrimaryPhotoChosen = async () => {
    setToolNotice(null);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setToolNotice('Could not read the selected photo.');
        return;
      }
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        exif: true,
      });
      if (pickerResult.canceled) return;
      const asset = pickerResult.assets[0];
      if (!asset) return;

      const mime = (asset.mimeType || 'image/jpeg').toLowerCase();
      if (mime.startsWith('video/')) {
        setToolNotice(
          'Select a still site photo first, or use "Angles / Video" to attach a video clip.'
        );
        return;
      }
      if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_FILE_BYTES) {
        setToolNotice('Photo exceeds the 10 MB limit. Please select a smaller image.');
        return;
      }

      const dataUrl = await fileToDataUrl({ uri: asset.uri, mimeType: asset.mimeType ?? undefined });
      const base64 = dataUrlToBase64(dataUrl);
      const detectedMime: StagedPrimaryPhoto['mimeType'] =
        mime === 'image/png'
          ? 'image/png'
          : mime === 'image/webp'
            ? 'image/webp'
            : mime === 'image/heic' || mime === 'image/heif'
              ? 'image/heic'
              : 'image/jpeg';

      setSelectedPrimary({
        fileName: asset.fileName || 'site photo',
        mimeType: detectedMime,
        base64,
        previewUri: dataUrl,
        caption: DEFAULT_PRIMARY_CAPTION,
      });
      setAttachAsAngleToActive(false);
      setToolsTrayOpen(false);

      const gps = pickerGpsFromExif(asset.exif);
      setExifCoords(gps ? { ...gps, inferredDistrict: gps ? inferNearestRwandaDistrict(gps.latitude, gps.longitude) : null } : null);
      if (gps) {
        setLatitude(gps.latitude.toFixed(6));
        setLongitude(gps.longitude.toFixed(6));
        const inferred = inferNearestRwandaDistrict(gps.latitude, gps.longitude);
        if (inferred && !district.trim()) {
          setDistrict(inferred);
        }
        setToolNotice(
          `Recovered camera EXIF GPS (${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)})${
            inferred ? ` · ${inferred} District` : ''
          }.`
        );
      }
    } catch {
      setToolNotice('Could not read the selected photo.');
    }
  };

  // Retake: shoot a replacement with the camera and swap the staged primary
  // in place — caption, title and location fields stay as they are; only the
  // photo (and its EXIF GPS story) is replaced.
  const handleRetakePrimaryPhoto = async () => {
    setToolNotice(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setToolNotice('Camera permission is needed to retake the photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 1,
        exif: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;

      const mime = (asset.mimeType || 'image/jpeg').toLowerCase();
      if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_FILE_BYTES) {
        setToolNotice('Photo exceeds the 10 MB limit. Please retake a smaller image.');
        return;
      }

      const dataUrl = await fileToDataUrl({ uri: asset.uri, mimeType: asset.mimeType ?? undefined });
      const base64 = dataUrlToBase64(dataUrl);
      const detectedMime: StagedPrimaryPhoto['mimeType'] =
        mime === 'image/png'
          ? 'image/png'
          : mime === 'image/webp'
            ? 'image/webp'
            : mime === 'image/heic' || mime === 'image/heif'
              ? 'image/heic'
              : 'image/jpeg';

      setSelectedPrimary((prev) => ({
        fileName: asset.fileName || 'site photo',
        mimeType: detectedMime,
        base64,
        previewUri: dataUrl,
        caption: prev?.caption ?? DEFAULT_PRIMARY_CAPTION,
      }));

      const gps = pickerGpsFromExif(asset.exif);
      setExifCoords(gps ? { ...gps, inferredDistrict: gps ? inferNearestRwandaDistrict(gps.latitude, gps.longitude) : null } : null);
      if (gps) {
        setLatitude(gps.latitude.toFixed(6));
        setLongitude(gps.longitude.toFixed(6));
        const inferred = inferNearestRwandaDistrict(gps.latitude, gps.longitude);
        if (inferred && !district.trim()) {
          setDistrict(inferred);
        }
        setToolNotice(
          `Recovered camera EXIF GPS (${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)})${
            inferred ? ` · ${inferred} District` : ''
          }.`
        );
      } else {
        setExifCoords(null);
      }
    } catch {
      setToolNotice('Could not take the new photo.');
    }
  };

  // Retake a supporting photo with the camera, replaced in place (same slot,
  // same caption). Video slots keep their clip — retake is photo-only.
  const handleRetakeSupportingPhoto = async (itemId: string) => {
    setToolNotice(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setToolNotice('Camera permission is needed to retake the photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 1,
        exif: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_FILE_BYTES) {
        setToolNotice('Photo exceeds the 10 MB limit. Please retake a smaller image.');
        return;
      }

      const dataUrl = await fileToDataUrl({ uri: asset.uri, mimeType: asset.mimeType ?? undefined });
      const lowerMime = (asset.mimeType || '').toLowerCase();
      const normalizedMime = lowerMime.startsWith('image/') ? lowerMime : 'image/jpeg';

      setSupportingMedia((prev) =>
        prev.map((m) =>
          m.id === itemId
            ? {
                ...m,
                kind: 'image',
                fileName: asset.fileName || 'supporting photo',
                mimeType: normalizedMime,
                base64: dataUrlToBase64(dataUrl),
              }
            : m
        )
      );
    } catch {
      setToolNotice('Could not take the new photo.');
    }
  };

  // Unsigned capture: the photos (with captions) are saved on this phone and
  // offered back for submission the moment the contributor signs in.
  const handleUnsignedSaveToOutbox = async (
    primary: StagedPrimaryPhoto | null,
    supporting: StagedSupportingItem[]
  ) => {
    if (!primary && supporting.length === 0) {
      setToolNotice('Sign in to send field observations — your text and location need an account.');
      return;
    }
    try {
      const saved: OutboxPhoto[] = [];
      if (primary) {
        saved.push(
          await saveBase64ToOutbox(
            {
              slot: 'primary',
              kind: 'image',
              fileName: primary.fileName,
              mimeType: primary.mimeType,
              caption: primary.caption.trim(),
            },
            primary.base64
          )
        );
      }
      for (const item of supporting) {
        saved.push(
          await saveBase64ToOutbox(
            {
              slot: 'supporting',
              kind: item.kind,
              fileName: item.fileName,
              mimeType: item.mimeType,
              caption: item.caption.trim(),
            },
            item.base64
          )
        );
      }
      setOutboxPhotos(await loadOutbox());
      setInputText('');
      setPostTitle('');
      setSelectedPrimary(null);
      setAttachAsAngleToActive(false);
      setSupportingMedia([]);
      setToolsTrayOpen(false);
      setLocationDrawerOpen(false);
      setToolNotice(
        `Saved ${saved.length} photo${saved.length === 1 ? '' : 's'} on this phone. Sign in and they will be offered for submission — nothing was sent yet.`
      );
    } catch (err) {
      setToolNotice(err instanceof Error ? err.message : 'The photo could not be saved on this phone.');
    }
  };

  // Signed in: pull the saved photos back into the tray so sending them
  // records them under the contributor's own Passport information.
  const stageOutboxPhotos = async () => {
    const entries = outboxPhotos;
    if (entries.length === 0) return;
    try {
      let primaryStaged = selectedPrimary;
      const supportingAdditions: StagedSupportingItem[] = [];
      for (const entry of entries) {
        const base64 = await readOutboxBase64(entry);
        if (entry.slot === 'primary' && !primaryStaged && entry.kind === 'image') {
          primaryStaged = {
            fileName: entry.fileName,
            mimeType: 'image/jpeg',
            base64,
            previewUri: `data:${entry.mimeType};base64,${base64}`,
            caption: entry.caption || DEFAULT_PRIMARY_CAPTION,
          };
        } else if (supportingAdditions.length < 6) {
          supportingAdditions.push({
            id: `sup_${entry.id}`,
            fileName: entry.fileName,
            mimeType: entry.mimeType,
            base64,
            kind: entry.kind,
            caption: entry.caption || (entry.kind === 'video' ? 'Short site clip showing surrounding ground.' : 'Supporting site angle.'),
          });
        }
      }
      if (primaryStaged && !selectedPrimary) setSelectedPrimary(primaryStaged);
      if (supportingAdditions.length > 0) {
        setSupportingMedia((prev) => [...prev, ...supportingAdditions].slice(0, 6));
      }
      await removeFromOutbox(entries.map((entry) => entry.id));
      setOutboxPhotos(await loadOutbox());
      setToolNotice(
        primaryStaged && supportingAdditions.length > 0
          ? 'Saved photo added, supporting files attached — ready to send.'
          : supportingAdditions.length > 0
            ? `${supportingAdditions.length} saved file(s) attached — ready to send.`
            : 'Saved photo added — ready to send.'
      );
    } catch {
      setToolNotice('A saved photo could not be read from this phone.');
    }
  };

  const discardOutbox = () => {
    Alert.alert(
      'Discard saved photos?',
      'The photos saved on this phone before you signed in will be deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            void clearOutbox().then(() => {
              setOutboxPhotos([]);
              setToolNotice('Saved photos discarded.');
            });
          },
        },
      ]
    );
  };

  const handleSupportingFilesChosen = async () => {
    setToolNotice(null);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        selectionLimit: 6,
        quality: 1,
      });
      if (pickerResult.canceled) return;

      const additions: StagedSupportingItem[] = [];
      for (let i = 0; i < pickerResult.assets.length; i++) {
        const asset = pickerResult.assets[i];
        if (!asset) continue;
        const nextIndex = supportingMedia.length + additions.length;
        if (nextIndex >= 6) break;
        if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_FILE_BYTES) {
          setToolNotice(
            `"${asset.fileName || 'file'}" exceeds 10 MB. Short clips and photos under 10 MB are supported.`
          );
          continue;
        }
        const lowerMime = (asset.mimeType || '').toLowerCase();
        const isVid = lowerMime.startsWith('video/');
        const normalizedMime = isVid
          ? lowerMime || 'video/mp4'
          : lowerMime.startsWith('image/')
            ? lowerMime
            : 'image/jpeg';

        const dataUrl = await fileToDataUrl({ uri: asset.uri, mimeType: asset.mimeType ?? undefined });
        additions.push({
          id: `sup_${Date.now()}_${i}`,
          fileName: asset.fileName || 'supporting media',
          mimeType: normalizedMime,
          base64: dataUrlToBase64(dataUrl),
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
    } catch {
      // Picker cancelled or failed; nothing staged
    }
  };

  const handleDocumentFilesChosen = async () => {
    setToolNotice(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: DOCUMENT_PICKER_TYPES,
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const additions: StagedDocument[] = [];
      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        if (!asset) continue;
        const mimeType = documentMimeType(asset.name);
        if (!mimeType) {
          setToolNotice('Supported documents: PDF, Word, Excel, PowerPoint, OpenDocument, TXT and CSV.');
          continue;
        }
        if (asset.size === 0 || asset.size > MAX_FILE_BYTES) {
          setToolNotice(`"${asset.name}" must be between 1 byte and 10 MB.`);
          continue;
        }
        const dataUrl = await fileToDataUrl({ uri: asset.uri, mimeType, fileName: asset.name });
        additions.push({
          id: `doc_${Date.now()}_${i}`,
          fileName: asset.name,
          mimeType,
          sizeBytes: asset.size,
          base64: dataUrlToBase64(dataUrl),
        });
      }

      if (additions.length > 0) {
        setStagedDocuments((prev) => [...prev, ...additions].slice(0, 10));
        setToolsTrayOpen(false);
      }
    } catch {
      setToolNotice('Could not read that document. Try another file.');
    }
  };

  const handleUseLiveGps = async () => {
    setGpsBusy(true);
    setToolNotice(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsBusy(false);
        setToolNotice('Could not acquire live GPS signal.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = Number(position.coords.latitude.toFixed(6));
      const lng = Number(position.coords.longitude.toFixed(6));
      const acc = position.coords.accuracy ? Math.round(position.coords.accuracy) : null;
      setLiveGpsCoords({ lat, lng, accuracy: acc });

      if (
        exifCoords &&
        distanceBetweenKm(lat, lng, exifCoords.latitude, exifCoords.longitude) > 0.5
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
    } catch (err) {
      setGpsBusy(false);
      setToolNotice(
        err instanceof Error && err.message ? err.message : 'Could not acquire live GPS signal.'
      );
    }
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

  const uploadStagedDocuments = async (passportId: string): Promise<number> => {
    if (stagedDocuments.length === 0) return 0;
    let uploaded = 0;
    for (const doc of stagedDocuments) {
      await uploadPostAttachment(passportId, {
        filename: doc.fileName,
        mime_type: doc.mimeType,
        size_bytes: doc.sizeBytes,
        content_base64: doc.base64,
      });
      uploaded += 1;
    }
    setStagedDocuments([]);
    return uploaded;
  };

  const handleSendComposer = async () => {
    if (isSending) return;

    // Not signed in: capture still works — photos (and captions) are saved on
    // this phone and offered for submission once the contributor signs in.
    if (!currentUser) {
      if (stagedDocuments.length > 0) {
        setToolNotice('Sign in before attaching documents to a Geoscience Passport.');
        return;
      }
      await handleUnsignedSaveToOutbox(selectedPrimary, supportingMedia);
      return;
    }

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
    const documentsToSend = [...stagedDocuments];
    const attachAngleMode = attachAsAngleToActive && Boolean(activePassportId);

    // Burn the credit strip (place · coordinates · contributor) into the site
    // photo before it leaves the device. If stamping fails, the untouched
    // original is sent instead — the photo is never blocked by the strip.
    let primaryMedia: { base64: string; mimeType: StagedPrimaryPhoto['mimeType'] } | null = null;
    if (primaryToSend) {
      try {
        const stampedBase64 = await stampRef.current?.stamp(
          primaryToSend.previewUri,
          creditLines.line1,
          creditLines.line2
        );
        primaryMedia = stampedBase64
          ? { base64: stampedBase64, mimeType: 'image/png' }
          : { base64: primaryToSend.base64, mimeType: primaryToSend.mimeType };
      } catch {
        primaryMedia = { base64: primaryToSend.base64, mimeType: primaryToSend.mimeType };
      }
    }
    const locSummaryForBubble = formatLocationSummary(locPayload);
    const historySnapshot = buildConversationHistoryPayload(messages);

    setInputText('');
    setPostTitle('');
    setSelectedPrimary(null);
    setAttachAsAngleToActive(false);
    setSupportingMedia([]);
    setStagedDocuments([]);
    setToolsTrayOpen(false);
    setLocationDrawerOpen(false);
    setToolNotice(null);

    const bubbleLabel =
      cleanText ||
      (primaryToSend
        ? attachAngleMode
          ? `Attached extra site photo (${primaryToSend.fileName}) to ${activePassportId}`
          : `Sent site photo (${primaryToSend.fileName}) for GeoAI analysis`
        : documentsToSend.length > 0
          ? `Attached ${documentsToSend.length} document(s)`
          : supportingToSend.length > 0
            ? `Attached ${supportingToSend.length} supporting media file(s)`
            : `Shared field location (${locSummaryForBubble || 'Rwanda'})`);

    const bubbleId = `usr_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: bubbleId,
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
      if (!primaryToSend && (supportingToSend.length > 0 || documentsToSend.length > 0)) {
        if (!activePassportId) {
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
          return;
        }

        for (const item of supportingToSend) {
          await addPostMedia(activePassportId, {
            content_base64: item.base64,
            mime_type: item.mimeType,
            caption: item.caption.trim() || null,
            role: item.kind === 'video' ? 'video' : 'field',
          });
        }
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

        if (cleanText) {
          const textRes = await sendWebChatMessage({
            message: cleanText,
            pending_passport_id: activePassportId,
            conversation_history: historySnapshot,
          });
          appendAssistantResponse(textRes);
        }
        return;
      }

      // One request carries the primary photo plus any supporting media;
      // the XHR upload event reports a single shared fraction for the batch.
      const mediaCount =
        (primaryMedia ? 1 : 0) + (primaryToSend && !attachAngleMode ? supportingToSend.length : 0);
      if (mediaCount > 0) setUploadStatus({ total: mediaCount, fraction: 0 });

      const response = await sendWebChatMessageWithProgress(
        {
          message: cleanText || undefined,
          post_title: cleanTitle || undefined,
          image_base64: primaryMedia?.base64,
          mime_type: primaryMedia?.mimeType,
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
          location: locPayload ?? undefined,
          pending_passport_id:
            primaryToSend && !attachAngleMode ? undefined : activePassportId ?? undefined,
          conversation_history: historySnapshot,
        },
        (fraction) => setUploadStatus((prev) => (prev ? { ...prev, fraction } : prev)),
        (abort) => {
          abortUploadRef.current = abort;
        }
      );

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
              text: `Attached ${uploaded} document(s) to Geoscience Passport ${documentTarget}. They follow this Passport's privacy.`,
              timestamp: nowTimeLabel(),
              type: 'passport',
              pendingPassportId: documentTarget,
            },
          ]);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'Upload canceled.') {
        // Cancel returns the photos to the staged state, exactly as they were
        // when Send was tapped — the chat bubble is withdrawn too.
        setMessages((prev) => prev.filter((m) => m.id !== bubbleId));
        setInputText(cleanText);
        setPostTitle(cleanTitle);
        setSelectedPrimary(primaryToSend);
        setSupportingMedia(supportingToSend);
        setStagedDocuments(documentsToSend);
        setToolNotice('Upload canceled — your files are back in the tray.');
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            sender: 'assistant',
            text: err instanceof Error ? err.message : 'Could not complete request.',
            timestamp: nowTimeLabel(),
          },
        ]);
      }
    } finally {
      setIsSending(false);
      setUploadStatus(null);
      abortUploadRef.current = null;
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
    } catch (err) {
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
    } catch (err) {
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

  const stopVoiceLevels = () => {
    setRecordingLevels(Array(16).fill(0.25));
  };

  const startVoiceRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        setToolNotice('Microphone permission was declined.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      }).catch(() => undefined);

      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        },
        (status) => {
          const metering = (status as { metering?: number }).metering;
          if (typeof metering === 'number' && Number.isFinite(metering)) {
            const level = Math.max(0.2, Math.min(1, (metering + 60) / 45));
            setRecordingLevels((prev) => [...prev.slice(1), level]);
          }
        }
      );
      recordingRef.current = recording;
      voiceCancelledRef.current = false;
      recordingDurationRef.current = 0;

      await recording.startAsync();
      setIsRecordingVoice(true);
      setToolsTrayOpen(false);
      setToolNotice(null);
    } catch {
      stopVoiceLevels();
      setToolNotice('Microphone permission was declined.');
    }
  };

  const finishVoiceRecording = async () => {
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording) return;

    let fileUri: string | null = null;
    let base64 = '';
    let durationCaptured = Math.max(1, recordingDurationRef.current);

    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => undefined);
      const uri = recording.getURI();
      if (uri) {
        fileUri = uri;
        base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      const finalStatus = (await recording.getStatusAsync()) as { durationMillis?: number };
      if (finalStatus.durationMillis && finalStatus.durationMillis > 0) {
        durationCaptured = Math.max(1, Math.round(finalStatus.durationMillis / 1000));
      }
    } catch {
      stopVoiceLevels();
      return;
    }

    stopVoiceLevels();
    if (!base64) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `usr_voice_${Date.now()}`,
        sender: 'user',
        text: '',
        timestamp: nowTimeLabel(),
        audioUri: fileUri ?? undefined,
        audioDurationSec: durationCaptured,
      },
    ]);

    setIsSending(true);
    try {
      const response = await sendWebChatMessage({
        audio_base64: base64,
        audio_mime_type: 'audio/mp4',
        pending_passport_id: activePassportId ?? undefined,
      });
      appendAssistantResponse(response);
    } catch (err) {
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

  const stopAndSendVoiceRecording = () => {
    voiceCancelledRef.current = false;
    setIsRecordingVoice(false);
    void finishVoiceRecording();
  };

  const cancelVoiceRecording = () => {
    voiceCancelledRef.current = true;
    const recording = recordingRef.current;
    recordingRef.current = null;
    setIsRecordingVoice(false);
    if (recording) {
      void recording
        .stopAndUnloadAsync()
        .then(() => Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => undefined))
        .catch(() => undefined);
    }
    stopVoiceLevels();
  };

  const handleSuggestedAction = (action: string) => {
    const lower = action.toLowerCase();
    if (
      lower.includes('attach photo') ||
      lower.includes('attach site photo') ||
      lower.includes('snap another photo') ||
      lower.includes('attach another photo')
    ) {
      void handlePrimaryPhotoChosen();
      return;
    }
    if (lower.includes('supporting video')) {
      void handleSupportingFilesChosen();
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
      .catch((err) => {
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

  const copyAssistantMessage = async (msg: ChatMessageItem) => {
    try {
      await Clipboard.setStringAsync(msg.text);
      setCopiedMsgId(msg.id);
      setTimeout(() => {
        setCopiedMsgId((cur) => (cur === msg.id ? null : cur));
      }, 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const canSend = useMemo(
    () =>
      Boolean(
        currentUser &&
          !isSending &&
          (inputText.trim() ||
            selectedPrimary ||
            supportingMedia.length > 0 ||
            stagedLocationPayload)
      ),
    [currentUser, isSending, inputText, selectedPrimary, supportingMedia.length, stagedLocationPayload]
  );

  const latestSuggestions = messages[messages.length - 1]?.suggestedActions ?? [];

  return (
    <View style={[styles.root, { backgroundColor: t.surface }]}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      {/* Off-screen photo stamping workspace (credit strip burn-in). */}
      <PhotoCreditStamp ref={stampRef} scale={preferences.creditTextScale} />
      <View style={[styles.header, { backgroundColor: t.surface, borderBottomColor: t.outlineVariant, paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeading}>
          <Image source={require('../assets/images/icon.png')} style={styles.headerIcon} resizeMode="contain" />
          <Text style={[styles.headerTitle, { color: t.onSurface }]} numberOfLines={1}>
            Submit Field Observation
          </Text>
        </View>

        <View style={styles.headerActions}>
          {currentUser && (
            <View>
              <Pressable
                onPress={() => {
                  if (savedChats.length === 0 && messages.length <= 1) {
                    startFreshChat();
                  } else {
                    setShowChatMenu((prev) => !prev);
                  }
                }}
                accessibilityLabel="New chat and previous conversations"
                accessibilityHint="New chat & previous conversations"
                style={({ pressed }) => [styles.newChatButton, { backgroundColor: t.surface, borderColor: t.outlineVariant }, pressed && { backgroundColor: t.surfaceContainerHigh }]}
              >
                <Plus size={14} color={t.onSurfaceVariant} />
                <Text style={[styles.newChatText, { color: t.onSurface }]}>New</Text>
              </Pressable>

              <Modal visible={showChatMenu} transparent animationType="fade" onRequestClose={() => setShowChatMenu(false)}>
                <Pressable style={styles.menuScrim} onPress={() => setShowChatMenu(false)}>
                  <View style={[styles.chatMenu, { paddingTop: insets.top + 56 }]}>
                    <Pressable
                      onPress={startFreshChat}
                      style={({ pressed }) => [styles.startNewChatButton, pressed && { backgroundColor: '#edf3fe' }]}
                    >
                      <Plus size={14} color="#0b57d0" />
                      <Text style={styles.startNewChatText}>Start new chat</Text>
                    </Pressable>
                    <View style={styles.oldChatsHeader}>
                      <History size={12} color="#5e5e5e" />
                      <Text style={styles.oldChatsText}>Old chats</Text>
                    </View>
                    {savedChats.length === 0 ? (
                      <Text style={styles.noPreviousChats}>No previous chats yet.</Text>
                    ) : (
                      savedChats.map((chat) => (
                        <Pressable
                          key={chat.id}
                          onPress={() => loadChatSession(chat)}
                          style={({ pressed }) => [
                            styles.savedChatRow,
                            chat.id === currentChatId ? styles.savedChatRowActive : null,
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <View style={styles.savedChatBody}>
                            <Text
                              style={[
                                styles.savedChatTitle,
                                chat.id === currentChatId ? styles.savedChatTitleActive : null,
                              ]}
                              numberOfLines={1}
                            >
                              {chat.title}
                            </Text>
                            <Text style={styles.savedChatMeta}>
                              {new Date(chat.updatedAt).toLocaleDateString()} ·{' '}
                              {chat.messages.filter((m) => m.sender === 'user').length} msg
                            </Text>
                          </View>
                          <Pressable
                            onPress={() => deleteSavedChat(chat.id)}
                            accessibilityLabel="Delete saved chat"
                            style={styles.savedChatDelete}
                          >
                            <Trash2 size={12} color="#8f8f8f" />
                          </Pressable>
                        </Pressable>
                      ))
                    )}
                  </View>
                </Pressable>
              </Modal>
            </View>
          )}
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}
          >
            <X size={20} color="#5e5e5e" />
          </Pressable>
        </View>
      </View>

      {currentUser && activePassportId && (
        <View style={styles.passportBanner}>
          <Pressable
            onPress={() => openPassport(activePassportId)}
            style={styles.passportBannerButton}
          >
            <FileText size={14} color="#0b57d0" />
            <Text style={styles.passportBannerText} numberOfLines={1}>
              Active Geoscience Passport:{' '}
              <Text style={styles.passportBannerId}>{activePassportId}</Text> · Open on Map
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActivePassportId(null)}
            accessibilityLabel="Clear active Passport context"
            style={styles.passportBannerClear}
          >
            <X size={16} color="rgba(4, 30, 73, 0.75)" />
          </Pressable>
        </View>
      )}

      {!currentUser ? (
        <View style={styles.loginGate}>
          <View style={styles.loginGateCard}>
            <View style={styles.loginGateIcon}>
              <Lock size={20} color="#0b57d0" />
            </View>
            <Text style={styles.loginGateTitle}>Sign in required to submit field observations</Text>
            <Text style={styles.loginGateBody}>
              Every Geoscience Passport submitted through Earth Talk is linked to an
              authenticated contributor account so your photos, field reports, follow-up
              answers, and map pins remain credited to you in My Earth Talk.
            </Text>
            <Pressable
              onPress={() => router.push('/login')}
              style={({ pressed }) => [styles.signInButton, pressed && { opacity: 0.85 }]}
            >
              <ArrowRight size={16} color="#5e5e5e" />
              <Text style={styles.signInButtonText}>Sign in</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            ref={messagesScrollRef}
            style={styles.stream}
            contentContainerStyle={styles.streamContent}
            onContentSizeChange={() => messagesScrollRef.current?.scrollToEnd({ animated: true })}
          >
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
                <View key={msg.id} style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
                  <View
                    style={[
                      styles.bubble,
                      isUser ? styles.bubbleUser : styles.bubbleAssistant,
                    ]}
                  >
                    {msg.imageUri && (
                      <View style={styles.imageBlock}>
                        <Image
                          source={{ uri: msg.imageUri }}
                          style={styles.messageImage}
                          resizeMode="contain"
                          accessibilityLabel={msg.imageCaption || 'Submitted site photo'}
                        />
                        {msg.imageCaption && (
                          <Text style={[styles.imageCaption, isUser ? styles.metaOnUser : styles.metaOnAssistant]}>
                            {msg.imageCaption}
                          </Text>
                        )}
                      </View>
                    )}

                    {(msg.audioUri || typeof msg.audioDurationSec === 'number') && (
                      <VoiceNotePlayer
                        src={msg.audioUri}
                        durationSec={msg.audioDurationSec}
                        isUser={isUser}
                      />
                    )}

                    {msg.supportingCount && msg.supportingCount > 0 && (
                      <Text style={[styles.supportingCount, isUser ? styles.metaMonoOnUser : styles.metaMonoOnAssistant]}>
                        +{msg.supportingCount} supporting gallery file(s) attached
                      </Text>
                    )}

                    {msg.locationSummary && (
                      <Text style={[styles.locationSummary, isUser ? styles.metaOnUser : styles.metaOnAssistant]}>
                        Location: {msg.locationSummary}
                      </Text>
                    )}

                    {msg.transcript && !isUser && (
                      <Text style={[styles.transcript, styles.metaOnAssistant]}>
                        Voice transcript: "{msg.transcript}"
                      </Text>
                    )}

                    {editingMsgId === msg.id ? (
                      <View style={styles.editBlock}>
                        <TextInput
                          value={editingDraft}
                          onChangeText={setEditingDraft}
                          multiline
                          autoFocus
                          style={styles.editInput}
                        />
                        <View style={styles.editActions}>
                          <Pressable
                            onPress={() => {
                              setEditingMsgId(null);
                              setEditingDraft('');
                            }}
                            style={({ pressed }) => [styles.editCancelButton, pressed && { opacity: 0.8 }]}
                          >
                            <Text style={styles.editCancelText}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            disabled={!editingDraft.trim() || isSending}
                            onPress={() => void handleSaveEditedMessage(msg.id)}
                            style={({ pressed }) => [
                              styles.editSaveButton,
                              (!editingDraft.trim() || isSending) && { opacity: 0.5 },
                              pressed && { opacity: 0.85 },
                            ]}
                          >
                            <Check size={12} color="#0b57d0" />
                            <Text style={styles.editSaveText}>Save & Submit</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      msg.text &&
                      (isUser ? (
                        <Text style={styles.userMessageText}>{msg.text}</Text>
                      ) : (
                        <FormattedGeoAiText text={msg.text} />
                      ))
                    )}

                    {/* Follow-up questions from GeoAI */}
                    {msg.questionsForUser && msg.questionsForUser.length > 0 && !isUser && (
                      <View style={styles.questionsBlock}>
                        <Text style={styles.questionsHeader}>
                          Questions & answers — click to reply in chat:
                        </Text>
                        {msg.questionsForUser.map((q, idx) => (
                          <Pressable
                            key={idx}
                            onPress={() => {
                              setInputText(`Regarding "${q}": `);
                            }}
                            style={({ pressed }) => [styles.questionButton, pressed && { backgroundColor: '#edf3fe' }]}
                          >
                            <Text style={styles.questionText}>{q}</Text>
                            <ArrowRight size={14} color="#0b57d0" />
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {/* Map Visibility & Pin Precision Confirmation */}
                    {msg.awaitingPinConfirmation && passportId && !isUser && (
                      <View style={styles.pinBlock}>
                        <View style={styles.pinHeader}>
                          <Text style={styles.pinHeaderText}>Approve & choose map visibility:</Text>
                          <Pressable
                            onPress={() => {
                              setLocationDrawerOpen(true);
                              setToolsTrayOpen(false);
                            }}
                          >
                            <Text style={styles.pinEditLocation}>
                              {stagedLocationSummary ? 'Edit attached location' : 'Set Rwanda location / GPS'}
                            </Text>
                          </Pressable>
                        </View>
                        <View style={styles.pinOptions}>
                          {PIN_OPTIONS.map((opt) => (
                            <Pressable
                              key={opt.decision}
                              disabled={isSending}
                              onPress={() => void handlePinDecision(passportId, opt.decision, opt.label)}
                              style={({ pressed }) => [
                                styles.pinOption,
                                opt.primary ? styles.pinOptionPrimary : styles.pinOptionSecondary,
                                isSending && { opacity: 0.5 },
                                pressed && { opacity: 0.85 },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.pinOptionText,
                                  opt.primary ? styles.pinOptionTextPrimary : styles.pinOptionTextSecondary,
                                ]}
                              >
                                {opt.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Confirmed Pin Status */}
                    {msg.pinConfirmation && !isUser && (
                      <View style={styles.pinConfirmed}>
                        <CheckCircle2 size={16} color="#137333" />
                        <Text style={styles.pinConfirmedText}>
                          {msg.pinConfirmation.is_public
                            ? `Published (${msg.pinConfirmation.precision}${
                                msg.pinConfirmation.district
                                  ? ` · ${msg.pinConfirmation.district} District`
                                  : ''
                              })`
                            : 'Saved privately to My Earth Talk'}
                        </Text>
                      </View>
                    )}

                    {/* Open Geoscience Passport Card */}
                    {passportId && !isUser && (
                      <Pressable
                        onPress={() => openPassport(passportId)}
                        style={({ pressed }) => [styles.passportCard, pressed && { backgroundColor: '#edf3fe' }]}
                      >
                        <View style={styles.passportCardLeading}>
                          <FileText size={16} color="#0b57d0" />
                          <View style={styles.passportCardBody}>
                            <Text style={styles.passportCardLabel}>Geoscience Passport</Text>
                            <Text style={styles.passportCardId}>{formatPassportId(passportId)}</Text>
                          </View>
                        </View>
                        <View style={styles.passportCardOpen}>
                          <Text style={styles.passportCardOpenText}>Open</Text>
                          <ChevronRight size={16} color="#0b57d0" />
                        </View>
                      </Pressable>
                    )}
                  </View>

                  <View style={styles.messageActions}>
                    {!isUser && msg.text && (
                      <Pressable
                        onPress={() => void copyAssistantMessage(msg)}
                        accessibilityLabel="Copy response"
                        style={styles.messageAction}
                      >
                        {copiedMsgId === msg.id ? (
                          <>
                            <Check size={12} color="#137333" />
                            <Text style={styles.messageActionCopied}>Copied</Text>
                          </>
                        ) : (
                          <>
                            <Copy size={12} color="#5e5e5e" />
                            <Text style={styles.messageActionText}>Copy</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                    {isEditableTextMsg && editingMsgId !== msg.id && (
                      <Pressable
                        onPress={() => {
                          setEditingMsgId(msg.id);
                          setEditingDraft(msg.text);
                        }}
                        accessibilityLabel="Edit prompt"
                        style={styles.messageAction}
                      >
                        <Pencil size={12} color="#5e5e5e" />
                        <Text style={styles.messageActionText}>Edit</Text>
                      </Pressable>
                    )}
                    {versionCount > 1 && (
                      <View style={styles.versionNav}>
                        <Pressable
                          disabled={activeVersionIdx <= 0}
                          onPress={() => handleSwitchMessageVersion(msg.id, activeVersionIdx - 1)}
                          accessibilityLabel="Previous version"
                          style={[styles.versionButton, activeVersionIdx <= 0 && { opacity: 0.35 }]}
                        >
                          <ChevronLeft size={14} color="#5e5e5e" />
                        </Pressable>
                        <Text style={styles.versionCount}>
                          {activeVersionIdx + 1} / {versionCount}
                        </Text>
                        <Pressable
                          disabled={activeVersionIdx >= versionCount - 1}
                          onPress={() => handleSwitchMessageVersion(msg.id, activeVersionIdx + 1)}
                          accessibilityLabel="Next version"
                          style={[styles.versionButton, activeVersionIdx >= versionCount - 1 && { opacity: 0.35 }]}
                        >
                          <ChevronRight size={14} color="#5e5e5e" />
                        </Pressable>
                      </View>
                    )}
                    <Text style={styles.messageTimestamp}>{msg.timestamp}</Text>
                  </View>
                </View>
              );
            })}

            {isSending && (
              <View style={styles.thinkingRow}>
                <View style={styles.thinkingBubble}>
                  <Text style={styles.thinkingText}>Earth Talk GeoAI is thinking…</Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Composer & Attachment Tray (WhatsApp-style) */}
          <View style={[styles.composer, { backgroundColor: t.surfaceContainer, paddingBottom: Math.max(insets.bottom, 10) }]}>

            {/* Compact Location Drawer */}
            {locationDrawerOpen && (
              <View style={styles.locationDrawer}>
                <View style={styles.locationDrawerHeader}>
                  <Text style={styles.locationDrawerTitle} numberOfLines={1}>
                    Location (Rwanda · District · Sector · Cell · Village)
                  </Text>
                  <View style={styles.locationDrawerActions}>
                    <Pressable
                      onPress={() => void handleUseLiveGps()}
                      disabled={gpsBusy}
                      style={({ pressed }) => [
                        styles.liveGpsButton,
                        gpsBusy && { opacity: 0.6 },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Compass size={12} color="#0b57d0" />
                      <Text style={styles.liveGpsText}>{gpsBusy ? 'Reading…' : 'Live GPS'}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setLocationDrawerOpen(false)}
                      accessibilityLabel="Collapse location panel"
                      style={styles.locationDrawerClose}
                    >
                      <X size={16} color="#5e5e5e" />
                    </Pressable>
                  </View>
                </View>

                {mismatchKm !== null &&
                  mismatchKm > 0.5 &&
                  exifCoords &&
                  liveGpsCoords && (
                    <View style={styles.mismatchCard}>
                      <View style={styles.mismatchRow}>
                        <AlertTriangle size={14} color="#92400e" />
                        <Text style={styles.mismatchText}>
                          Live GPS is{' '}
                          <Text style={styles.mismatchMono}>{mismatchKm.toFixed(2)} km</Text> from
                          photo EXIF ({exifCoords.latitude.toFixed(4)},{' '}
                          {exifCoords.longitude.toFixed(4)}).
                        </Text>
                      </View>
                      <View style={styles.mismatchActions}>
                        <Pressable
                          onPress={() => {
                            setLatitude(exifCoords.latitude.toFixed(6));
                            setLongitude(exifCoords.longitude.toFixed(6));
                            if (exifCoords.inferredDistrict) setDistrict(exifCoords.inferredDistrict);
                          }}
                          style={({ pressed }) => [styles.mismatchKeepButton, pressed && { opacity: 0.85 }]}
                        >
                          <Text style={styles.mismatchKeepText}>Keep Photo EXIF GPS</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setLatitude(liveGpsCoords.lat.toFixed(6));
                            setLongitude(liveGpsCoords.lng.toFixed(6));
                            const inf = inferNearestRwandaDistrict(liveGpsCoords.lat, liveGpsCoords.lng);
                            if (inf) setDistrict(inf);
                          }}
                          style={({ pressed }) => [styles.mismatchUseButton, pressed && { opacity: 0.85 }]}
                        >
                          <Text style={styles.mismatchUseText}>Use Live GPS</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                <View style={styles.locationGrid}>
                  <Pressable
                    onPress={() => setDistrictPickerOpen(true)}
                    accessibilityLabel="Rwanda District"
                    style={styles.locationInput}
                  >
                    <Text style={[styles.locationInputText, !district && styles.locationPlaceholder]}>
                      {district || 'District'}
                    </Text>
                  </Pressable>
                  <TextInput
                    value={sector}
                    onChangeText={setSector}
                    placeholder="Sector (e.g. Bwishyura)"
                    style={styles.locationInput}
                  />
                  <TextInput
                    value={cell}
                    onChangeText={setCell}
                    placeholder="Cell (e.g. Bwishyura)"
                    style={styles.locationInput}
                  />
                  <TextInput
                    value={village}
                    onChangeText={setVillage}
                    placeholder="Village (e.g. Rusange)"
                    style={styles.locationInput}
                  />
                </View>

                <View style={styles.locationGridWide}>
                  <TextInput
                    value={latitude}
                    onChangeText={setLatitude}
                    placeholder="Lat (-2.1500)"
                    keyboardType="decimal-pad"
                    style={[styles.locationInput, styles.locationMono]}
                  />
                  <TextInput
                    value={longitude}
                    onChangeText={setLongitude}
                    placeholder="Lng (29.3500)"
                    keyboardType="decimal-pad"
                    style={[styles.locationInput, styles.locationMono]}
                  />
                  <TextInput
                    value={locationNote}
                    onChangeText={setLocationNote}
                    placeholder="Landmark (optional)"
                    style={styles.locationInput}
                  />
                </View>
              </View>
            )}

            {/* Tool Notice */}
            {toolNotice && (
              <View style={styles.toolNotice}>
                <Text style={styles.toolNoticeText}>{toolNotice}</Text>
                <Pressable
                  onPress={() => setToolNotice(null)}
                  accessibilityLabel="Dismiss notice"
                  style={styles.toolNoticeClose}
                >
                  <X size={14} color="#5e5e5e" />
                </Pressable>
              </View>
            )}

            {/* Staged Primary Photo + Supporting Gallery + Location Preview */}
            {(selectedPrimary ||
              supportingMedia.length > 0 ||
              stagedDocuments.length > 0 ||
              stagedLocationSummary) && (
              <View style={styles.stagedTray}>
                {selectedPrimary && (
                  <View style={styles.stagedPrimary}>
                    <View style={styles.stagedPrimaryRow}>
                      <View>
                        <Image source={{ uri: selectedPrimary.previewUri }} style={styles.stagedThumb} resizeMode="cover" />
                        {/* Live preview of the credit strip that will be burned
                            into the photo when it is sent. */}
                        <View style={styles.creditStripPreview} pointerEvents="none">
                          <Text style={[styles.creditLine1, { fontSize: 4.5 * preferences.creditTextScale }]} numberOfLines={1}>
                            {creditLines.line1}
                          </Text>
                          <Text style={[styles.creditLine2, { fontSize: 4 * preferences.creditTextScale }]} numberOfLines={1}>
                            {creditLines.line2}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.stagedPrimaryBody}>
                        <View style={styles.stagedPrimaryHeader}>
                          <Text style={styles.stagedPrimaryName} numberOfLines={1}>
                            1 / {1 + supportingMedia.length} · {selectedPrimary.fileName}
                          </Text>
                          {activePassportId && (
                            <Pressable onPress={() => setAttachAsAngleToActive((prev) => !prev)}>
                              <Text style={styles.attachAngleToggle}>
                                {attachAsAngleToActive
                                  ? `Adding angle to ${activePassportId}`
                                  : 'Creating new Passport'}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                        <TextInput
                          value={selectedPrimary.caption}
                          onChangeText={(next) =>
                            setSelectedPrimary((prev) =>
                              prev ? { ...prev, caption: next } : null
                            )
                          }
                          placeholder={DEFAULT_PRIMARY_CAPTION}
                          style={styles.stagedCaptionInput}
                        />
                      </View>
                      <View style={styles.stagedActionsColumn}>
                        <Pressable
                          onPress={() => void handleRetakePrimaryPhoto()}
                          accessibilityLabel="Retake staged photo with camera"
                          style={styles.stagedRemove}
                        >
                          <Camera size={14} color="#0b57d0" />
                        </Pressable>
                        <Pressable
                          onPress={() => setSelectedPrimary(null)}
                          accessibilityLabel="Remove staged photo"
                          style={styles.stagedRemove}
                        >
                          <Trash2 size={14} color="#5e5e5e" />
                        </Pressable>
                      </View>
                    </View>

                    {!attachAsAngleToActive && (
                      <TextInput
                        value={postTitle}
                        onChangeText={setPostTitle}
                        placeholder="Optional Passport Title (leave blank for GeoAI title)"
                        maxLength={120}
                        style={styles.stagedTitleInput}
                      />
                    )}

                    {/* Contributor credit: the photo carries the location
                        address automatically; the signed-in contributor can
                        keep or drop their own name from the strip. */}
                    <View style={styles.creditToggleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.creditToggleTitle}>
                          {currentUser?.display_name
                            ? `Show my name on the photo — "Contributed by ${currentUser.display_name}"`
                            : 'Show my name on the photo'}
                        </Text>
                        <Text style={styles.creditToggleHint}>
                          {currentUser?.display_name
                            ? 'Off: the photo is credited to Earth Talk GeoAI only. The location address stays.'
                            : 'Sign in to credit your name; the location address is always included.'}
                        </Text>
                      </View>
                      <Switch
                        value={Boolean(currentUser?.display_name) && !preferences.photoCreditNameHidden}
                        disabled={!currentUser?.display_name}
                        onValueChange={setPhotoCreditNameHidden}
                        trackColor={{ false: '#d3d7db', true: '#0b57d0' }}
                        thumbColor="#ffffff"
                        accessibilityLabel="Show my name on the photo"
                      />
                    </View>

                    {/* Credit-line prefix: the reader picks the platform phrasing
                        that leads line 2 of the burned-in strip. */}
                    <View style={styles.creditToggleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.creditToggleTitle}>Credit line</Text>
                        <Text style={styles.creditToggleHint} numberOfLines={1}>
                          “{preferences.creditPrefix}” leads the credit line on the photo.
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setPrefixPickerOpen((prev) => !prev)}
                        accessibilityLabel="Choose credit line prefix"
                        style={styles.prefixPickerButton}
                      >
                        <Text style={styles.prefixPickerText} numberOfLines={1}>
                          {preferences.creditPrefix}
                        </Text>
                        <ChevronRight
                          size={14}
                          color="#0b57d0"
                          style={prefixPickerOpen ? { transform: [{ rotate: '90deg' }] } : undefined}
                        />
                      </Pressable>
                    </View>
                    {prefixPickerOpen
                      ? CREDIT_PREFIX_OPTIONS.map((option) => {
                          const active = option === preferences.creditPrefix;
                          return (
                            <Pressable
                              key={option}
                              onPress={() => {
                                setCreditPrefix(option);
                                setPrefixPickerOpen(false);
                              }}
                              style={({ pressed }) => [
                                styles.prefixOptionRow,
                                active && { backgroundColor: t.primaryContainer },
                                pressed && { opacity: 0.85 },
                              ]}
                              accessibilityLabel={`Credit prefix ${option}`}
                              accessibilityState={active ? { checked: true } : undefined}
                            >
                              <Text
                                style={[styles.prefixOptionText, { color: t.onSurface }]}
                                numberOfLines={1}
                              >
                                {option}
                              </Text>
                              {active ? <Check size={14} color={t.primary} /> : null}
                            </Pressable>
                          );
                        })
                      : null}

                    {/* Credit text size: preview on the thumbnail scales live,
                        and the same multiplier sizes the burned-in strip. */}
                    <View style={styles.creditToggleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.creditToggleTitle}>Credit text size</Text>
                        <Text style={styles.creditToggleHint}>
                          {Math.round(preferences.creditTextScale * 100)}% — check the thumbnail preview
                        </Text>
                      </View>
                      <Slider
                        style={styles.creditSizeSlider}
                        minimumValue={0.7}
                        maximumValue={1.6}
                        step={0.05}
                        value={preferences.creditTextScale}
                        onValueChange={setCreditTextScale}
                        minimumTrackTintColor="#0b57d0"
                        maximumTrackTintColor={t.outlineVariant}
                        accessibilityLabel="Credit text size"
                      />
                    </View>
                  </View>
                )}

                {supportingMedia.map((item, idx) => (
                  <View key={item.id} style={styles.supportingRow}>
                    <Text style={styles.supportingIndex}>
                      {(selectedPrimary ? 2 : 1) + idx} · {item.kind === 'video' ? 'Clip' : 'Photo'}
                    </Text>
                    <TextInput
                      value={item.caption}
                      onChangeText={(next) =>
                        setSupportingMedia((prev) =>
                          prev.map((m) =>
                            m.id === item.id ? { ...m, caption: next } : m
                          )
                        )
                      }
                      placeholder="Gallery caption"
                      style={styles.supportingCaptionInput}
                    />
                    <Pressable
                      onPress={() =>
                        setSupportingMedia((prev) => prev.filter((m) => m.id !== item.id))
                      }
                      accessibilityLabel="Remove supporting media"
                      style={styles.stagedRemove}
                    >
                      <Trash2 size={14} color="#5e5e5e" />
                    </Pressable>
                    {item.kind === 'image' ? (
                      <Pressable
                        onPress={() => void handleRetakeSupportingPhoto(item.id)}
                        accessibilityLabel="Retake supporting photo with camera"
                        style={styles.stagedRemove}
                      >
                        <Camera size={14} color="#0b57d0" />
                      </Pressable>
                    ) : null}
                  </View>
                ))}

                {stagedDocuments.map((doc) => (
                  <View key={doc.id} style={styles.supportingRow}>
                    <FileText size={14} color="#b45309" />
                    <Text style={styles.supportingIndex} numberOfLines={1}>
                      {doc.fileName} ({(doc.sizeBytes / 1024 / 1024).toFixed(1)} MB)
                    </Text>
                    <Pressable
                      onPress={() =>
                        setStagedDocuments((prev) => prev.filter((d) => d.id !== doc.id))
                      }
                      accessibilityLabel="Remove staged document"
                      style={styles.stagedRemove}
                    >
                      <Trash2 size={14} color="#5e5e5e" />
                    </Pressable>
                  </View>
                ))}

                {stagedLocationSummary && (
                  <View style={styles.stagedLocationRow}>
                    <Pressable onPress={() => setLocationDrawerOpen(true)} style={styles.stagedLocationButton}>
                      <MapPin size={14} color="#137333" />
                      <Text style={styles.stagedLocationSummary} numberOfLines={1}>
                        {stagedLocationSummary}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={clearLocationFields}
                      accessibilityLabel="Clear attached location"
                      style={styles.stagedRemove}
                    >
                      <X size={14} color="#5e5e5e" />
                    </Pressable>
                  </View>
                )}
              </View>
            )}

            {/* Photos captured before signing in, kept on this phone until the
                contributor signs in — then one tap stages them for sending. */}
            {currentUser && outboxPhotos.length > 0 ? (
              <View style={styles.outboxBar}>
                <Camera size={14} color="#0b57d0" />
                <Text style={styles.outboxBarText} numberOfLines={2}>
                  {outboxPhotos.length} photo{outboxPhotos.length === 1 ? '' : 's'} saved on this phone
                </Text>
                <Pressable
                  onPress={() => void stageOutboxPhotos()}
                  style={({ pressed }) => [styles.outboxSendButton, pressed && { opacity: 0.85 }]}
                  accessibilityLabel="Attach saved photos to this chat"
                >
                  <Text style={styles.outboxSendText}>Attach</Text>
                </Pressable>
                <Pressable
                  onPress={discardOutbox}
                  accessibilityLabel="Discard saved photos"
                  style={styles.stagedRemove}
                >
                  <X size={14} color="#5e5e5e" />
                </Pressable>
              </View>
            ) : null}

            {/* Upload progress: one honest row for the batch of photos the
                current request is carrying up (fetch cannot see this; the XHR
                upload event can). Cancel aborts the request and the photos
                return to the staged tray. */}
            {uploadStatus ? (
              <View style={styles.uploadRow}>
                <Upload size={13} color="#0b57d0" />
                <View style={styles.uploadRowBody}>
                  <Text style={styles.uploadRowText}>
                    Uploading {uploadStatus.total} photo{uploadStatus.total === 1 ? '' : 's'}…
                    {' '}
                    {Math.round(uploadStatus.fraction * 100)}%
                  </Text>
                  <View style={styles.uploadBarTrack}>
                    <View
                      style={[
                        styles.uploadBarFill,
                        { width: `${Math.max(4, Math.round(uploadStatus.fraction * 100))}%` },
                      ]}
                    />
                  </View>
                </View>
                <Pressable
                  onPress={() => abortUploadRef.current?.()}
                  accessibilityLabel="Cancel upload"
                  style={({ pressed }) => [styles.uploadCancelButton, pressed && { opacity: 0.7 }]}
                >
                  <X size={15} color="#c5221f" />
                  <Text style={styles.uploadCancelText}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Scrollable Suggested Quick Actions */}
            {latestSuggestions.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestions} contentContainerStyle={styles.suggestionsContent}>
                {latestSuggestions.map((action, idx) => (
                  <Pressable
                    key={`${action}_${idx}`}
                    disabled={isSending}
                    onPress={() => handleSuggestedAction(action)}
                    style={({ pressed }) => [
                      styles.suggestionChip,
                      isSending && { opacity: 0.5 },
                      pressed && { backgroundColor: '#edf3fe' },
                    ]}
                  >
                    <Text style={styles.suggestionChipText}>{action}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {/* WhatsApp-Style Chat Input Row / Recording Bar */}
            {isRecordingVoice ? (
              <View style={styles.recordingRow}>
                <View style={styles.recordingBar}>
                  <View style={styles.recordingLeading}>
                    <Pressable
                      onPress={cancelVoiceRecording}
                      accessibilityLabel="Cancel voice recording"
                      style={styles.recordingCancelButton}
                    >
                      <Trash2 size={16} color="#b3261e" />
                    </Pressable>
                    <View style={styles.recordingDot} />
                    <Text style={styles.recordingTime}>{formatDuration(recordingSeconds)}</Text>
                  </View>
                  <View style={styles.recordingLevels}>
                    {recordingLevels.map((lvl, idx) => (
                      <View
                        key={idx}
                        style={[styles.recordingLevelBar, { height: Math.round(lvl * 16) + 4 }]}
                      />
                    ))}
                  </View>
                </View>

                <Pressable
                  onPress={stopAndSendVoiceRecording}
                  accessibilityLabel="Send voice note"
                  style={({ pressed }) => [styles.roundActionButton, pressed && { backgroundColor: '#008f70' }]}
                >
                  <Send size={16} color="#ffffff" />
                </Pressable>
              </View>
            ) : (
              <View>
                {/* Paperclip attach tray */}
                {toolsTrayOpen && (
                  <>
                    <Pressable style={styles.trayScrim} onPress={() => setToolsTrayOpen(false)} />
                    <View style={styles.attachTray}>
                      <Pressable
                        onPress={() => void handlePrimaryPhotoChosen()}
                        style={({ pressed }) => [styles.attachTrayItem, pressed && { backgroundColor: '#f0f2f5' }]}
                      >
                        <Camera size={16} color="#0b57d0" />
                        <Text style={styles.attachTrayText}>Site Photo</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleSupportingFilesChosen()}
                        style={({ pressed }) => [styles.attachTrayItem, pressed && { backgroundColor: '#f0f2f5' }]}
                      >
                        <Film size={16} color="#7c3aed" />
                        <Text style={styles.attachTrayText}>Angles / Video</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleDocumentFilesChosen()}
                        style={({ pressed }) => [styles.attachTrayItem, pressed && { backgroundColor: '#f0f2f5' }]}
                      >
                        <FileText size={16} color="#b45309" />
                        <Text style={styles.attachTrayText}>File / PDF</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleUseLiveGps()}
                        disabled={gpsBusy}
                        style={({ pressed }) => [
                          styles.attachTrayItem,
                          gpsBusy && { opacity: 0.5 },
                          pressed && { backgroundColor: '#f0f2f5' },
                        ]}
                      >
                        <Compass size={16} color="#16a34a" />
                        <Text style={styles.attachTrayText}>{gpsBusy ? 'Reading GPS…' : 'Live GPS'}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setLocationDrawerOpen((prev) => !prev);
                          setToolsTrayOpen(false);
                        }}
                        style={({ pressed }) => [styles.attachTrayItem, pressed && { backgroundColor: '#f0f2f5' }]}
                      >
                        <MapPin size={16} color="#ea580c" />
                        <Text style={styles.attachTrayText}>Rwanda Place</Text>
                      </Pressable>
                    </View>
                  </>
                )}

                <View style={styles.inputRow}>
                  <View style={styles.inputCapsule}>
                    <Pressable
                      onPress={() => setToolsTrayOpen((prev) => !prev)}
                      accessibilityLabel="Attach photo, video clip, document, or location"
                      style={({ pressed }) => [
                        styles.paperclipButton,
                        toolsTrayOpen ? styles.paperclipButtonActive : null,
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Paperclip
                        size={20}
                        color={toolsTrayOpen ? '#0b57d0' : '#54656f'}
                        style={styles.paperclipIcon}
                      />
                    </Pressable>

                    <TextInput
                      value={inputText}
                      onChangeText={setInputText}
                      multiline
                      placeholder={
                        selectedPrimary
                          ? 'Write your field report for this photo…'
                          : 'Message'
                      }
                      placeholderTextColor="#667781"
                      style={styles.composerInput}
                    />
                  </View>

                  {canSend ? (
                    <Pressable
                      disabled={isSending}
                      onPress={() => void handleSendComposer()}
                      accessibilityLabel="Send message"
                      style={({ pressed }) => [
                        styles.roundActionButton,
                        isSending && { opacity: 0.4 },
                        pressed && { backgroundColor: '#008f70' },
                      ]}
                    >
                      <Send size={16} color="#ffffff" />
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => void startVoiceRecording()}
                      disabled={isSending}
                      accessibilityLabel="Record voice note"
                      style={({ pressed }) => [
                        styles.roundActionButton,
                        isSending && { opacity: 0.4 },
                        pressed && { backgroundColor: '#008f70' },
                      ]}
                    >
                      <Mic size={20} color="#ffffff" />
                    </Pressable>
                  )}
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

      {/* District picker sheet */}
      <Modal visible={districtPickerOpen} transparent animationType="slide" onRequestClose={() => setDistrictPickerOpen(false)}>
        <Pressable style={styles.menuScrim} onPress={() => setDistrictPickerOpen(false)}>
          <View style={styles.districtSheet}>
            <Text style={styles.districtSheetTitle}>Rwanda District</Text>
            <ScrollView style={styles.districtSheetList}>
              <Pressable
                onPress={() => {
                  setDistrict('');
                  setDistrictPickerOpen(false);
                }}
                style={({ pressed }) => [styles.districtRow, pressed && { backgroundColor: '#edf3fe' }]}
              >
                <Text style={styles.districtRowText}>District</Text>
              </Pressable>
              {RWANDA_DISTRICT_CENTERS.map((d) => (
                <Pressable
                  key={d.name}
                  onPress={() => {
                    setDistrict(d.name);
                    setDistrictPickerOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.districtRow,
                    district === d.name ? styles.districtRowActive : null,
                    pressed && { backgroundColor: '#edf3fe' },
                  ]}
                >
                  <Text
                    style={[
                      styles.districtRowText,
                      district === d.name ? styles.districtRowTextActive : null,
                    ]}
                  >
                    {d.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e3e3e3',
  },
  headerLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  headerIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f1f1f',
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  newChatButton: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
  },
  newChatText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3c4043',
  },
  menuScrim: {
    flex: 1,
    backgroundColor: 'rgba(11, 15, 20, 0.35)',
  },
  chatMenu: {
    position: 'absolute',
    right: 12,
    width: 288,
    maxWidth: '88%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    padding: 6,
    shadowColor: '#202124',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  startNewChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  startNewChatText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0b57d0',
  },
  oldChatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  oldChatsText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#5e5e5e',
  },
  noPreviousChats: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 11,
    color: '#8f8f8f',
  },
  savedChatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  savedChatRowActive: {
    backgroundColor: '#edf3fe',
  },
  savedChatBody: {
    flex: 1,
    minWidth: 0,
  },
  savedChatTitle: {
    fontSize: 12,
    color: '#1f1f1f',
  },
  savedChatTitleActive: {
    color: '#0b57d0',
    fontWeight: '500',
  },
  savedChatMeta: {
    fontSize: 10,
    color: '#8f8f8f',
    fontVariant: ['tabular-nums'],
  },
  savedChatDelete: {
    padding: 4,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#e3e3e3',
    backgroundColor: '#edf3fe',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  passportBannerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  passportBannerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#041e49',
    flexShrink: 1,
  },
  passportBannerId: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  passportBannerClear: {
    padding: 2,
  },
  loginGate: {
    flex: 1,
    backgroundColor: '#f8fafd',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loginGateCard: {
    maxWidth: 448,
    gap: 16,
  },
  loginGateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e8f0fe',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  loginGateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f1f1f',
    textAlign: 'center',
  },
  loginGateBody: {
    fontSize: 12,
    lineHeight: 20,
    color: '#5e5e5e',
    textAlign: 'center',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    alignSelf: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: '#202124',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  signInButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  stream: {
    flex: 1,
    backgroundColor: 'rgba(239, 234, 226, 0.4)',
  },
  streamContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
  },
  messageRow: {
    flexDirection: 'column',
  },
  messageRowUser: {
    alignItems: 'flex-end',
  },
  messageRowAssistant: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
    backgroundColor: '#0b57d0',
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
  },
  imageBlock: {
    gap: 4,
  },
  messageImage: {
    height: 192,
    width: 240,
    borderRadius: 8,
    backgroundColor: '#101820',
  },
  imageCaption: {
    fontSize: 11,
  },
  metaOnUser: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  metaOnAssistant: {
    color: '#5e5e5e',
  },
  metaMonoOnUser: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  metaMonoOnAssistant: {
    color: '#5e5e5e',
  },
  supportingCount: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  locationSummary: {
    fontSize: 11,
  },
  transcript: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  userMessageText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#ffffff',
  },
  geoAiBlocks: {
    gap: 6,
  },
  geoAiHeading: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1f1f1f',
    paddingTop: 2,
  },
  geoAiList: {
    gap: 4,
    paddingLeft: 8,
  },
  geoAiListItem: {
    fontSize: 13,
    lineHeight: 20,
    color: '#1f1f1f',
  },
  geoAiParagraph: {
    fontSize: 13,
    lineHeight: 20,
    color: '#1f1f1f',
  },
  mdBold: {
    fontWeight: '600',
    color: '#1f1f1f',
  },
  mdItalic: {
    fontStyle: 'italic',
  },
  mdCode: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 12,
    color: '#0b57d0',
    backgroundColor: '#f1f3f4',
  },
  voicePlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 220,
    maxWidth: 280,
  },
  voicePlayerUser: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  voicePlayerAssistant: {
    backgroundColor: '#f0f2f5',
  },
  voicePlayButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePlayButtonUser: {
    backgroundColor: '#ffffff',
  },
  voicePlayButtonAssistant: {
    backgroundColor: '#00a884',
  },
  voiceBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 22,
  },
  waveformBar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  waveformFill: {
    width: '100%',
    borderRadius: 2,
  },
  waveformFillUserOn: {
    backgroundColor: '#ffffff',
  },
  waveformFillUserOff: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  waveformFillAssistantOn: {
    backgroundColor: '#00a884',
  },
  waveformFillAssistantOff: {
    backgroundColor: '#c7ccd1',
  },
  voiceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceTime: {
    fontSize: 10.5,
    fontVariant: ['tabular-nums'],
  },
  voiceTimeUser: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  voiceTimeAssistant: {
    color: '#5e5e5e',
  },
  voiceRateButton: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  voiceRateButtonUser: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  voiceRateButtonAssistant: {
    backgroundColor: '#ffffff',
  },
  voiceRateText: {
    fontSize: 10,
    fontWeight: '600',
  },
  voiceRateTextUser: {
    color: '#ffffff',
  },
  voiceRateTextAssistant: {
    color: '#1f1f1f',
  },
  editBlock: {
    gap: 8,
    minWidth: 220,
  },
  editInput: {
    borderRadius: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: '#1f1f1f',
    minHeight: 44,
    textAlignVertical: 'top',
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  editCancelButton: {
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  editCancelText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#ffffff',
  },
  editSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  editSaveText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0b57d0',
  },
  questionsBlock: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#e3e3e3',
    paddingTop: 10,
  },
  questionsHeader: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3c4043',
  },
  questionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    backgroundColor: '#f8fafd',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  questionText: {
    flex: 1,
    fontSize: 12,
    color: '#1f1f1f',
  },
  pinBlock: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#e3e3e3',
    paddingTop: 12,
  },
  pinHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pinHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  pinEditLocation: {
    fontSize: 11,
    fontWeight: '500',
    color: '#0b57d0',
    textDecorationLine: 'underline',
  },
  pinOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pinOption: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pinOptionPrimary: {
    backgroundColor: '#0b57d0',
  },
  pinOptionSecondary: {
    borderWidth: 1,
    borderColor: '#c7c7c7',
    backgroundColor: '#ffffff',
  },
  pinOptionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  pinOptionTextPrimary: {
    color: '#ffffff',
  },
  pinOptionTextSecondary: {
    color: '#1f1f1f',
  },
  pinConfirmed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#e3e3e3',
    paddingTop: 10,
  },
  pinConfirmedText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#137333',
  },
  passportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#f8fafd',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  passportCardLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  passportCardBody: {
    flex: 1,
    minWidth: 0,
  },
  passportCardLabel: {
    fontSize: 11,
    color: '#5e5e5e',
  },
  passportCardId: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    color: '#1f1f1f',
  },
  passportCardOpen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  passportCardOpenText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0b57d0',
  },
  messageActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  messageAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  messageActionText: {
    fontSize: 11,
    color: '#5e5e5e',
  },
  messageActionCopied: {
    fontSize: 11,
    color: '#137333',
  },
  versionNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  versionButton: {
    padding: 2,
  },
  versionCount: {
    fontSize: 11,
    color: '#5e5e5e',
    fontVariant: ['tabular-nums'],
  },
  messageTimestamp: {
    fontSize: 11,
    color: '#8f8f8f',
    fontVariant: ['tabular-nums'],
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  thinkingBubble: {
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  thinkingText: {
    fontSize: 12,
    color: '#5e5e5e',
  },
  composer: {
    backgroundColor: '#f0f2f5',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  locationDrawer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    padding: 12,
    gap: 10,
  },
  locationDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  locationDrawerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  locationDrawerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveGpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c7c7c7',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveGpsText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#0b57d0',
  },
  locationDrawerClose: {
    padding: 2,
  },
  mismatchCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.5)',
    backgroundColor: '#fffbeb',
    padding: 10,
    gap: 6,
  },
  mismatchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  mismatchMono: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  mismatchText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: '#92400e',
  },
  mismatchActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mismatchKeepButton: {
    borderRadius: 4,
    backgroundColor: '#92400e',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mismatchKeepText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#ffffff',
  },
  mismatchUseButton: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#d97706',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mismatchUseText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#92400e',
  },
  locationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  locationGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  locationInput: {
    flexGrow: 1,
    minWidth: '44%',
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7c7c7',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    fontSize: 12,
    color: '#1f1f1f',
    justifyContent: 'center',
  },
  locationInputText: {
    fontSize: 12,
    color: '#1f1f1f',
  },
  locationPlaceholder: {
    color: '#8f8f8f',
  },
  locationMono: {
    fontVariant: ['tabular-nums'],
  },
  toolNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#202124',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  toolNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#3c4043',
  },
  toolNoticeClose: {
    padding: 2,
  },
  stagedTray: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 10,
    gap: 8,
    maxHeight: 192,
  },
  stagedPrimary: {
    gap: 8,
  },
  stagedPrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stagedThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  creditStripPreview: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(8, 8, 14, 0.55)',
    paddingHorizontal: 3,
    paddingVertical: 2,
    gap: 1,
  },
  creditLine1: {
    fontSize: 4.5,
    fontWeight: '600',
    color: '#ffffff',
  },
  creditLine2: {
    fontSize: 4,
    fontWeight: '400',
    color: '#ffffff',
  },
  creditToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f6f8fa',
    borderWidth: 1,
    borderColor: '#e3e3e3',
  },
  creditToggleTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  creditToggleHint: {
    fontSize: 11,
    color: '#5e5e5e',
    marginTop: 2,
  },
  stagedActionsColumn: {
    alignItems: 'center',
    gap: 6,
  },
  prefixPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 150,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  prefixPickerText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#0b57d0',
    flexShrink: 1,
  },
  prefixOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
  },
  prefixOptionText: {
    flex: 1,
    fontSize: 12,
  },
  creditSizeSlider: {
    width: 130,
    height: 28,
  },
  outboxBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d3e3fd',
    backgroundColor: '#f0f4fe',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  outboxBarText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: '#174ea6',
  },
  outboxSendButton: {
    borderRadius: 999,
    backgroundColor: '#0b57d0',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  outboxSendText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  uploadCancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fce8e6',
    backgroundColor: '#fce8e6',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  uploadCancelText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#c5221f',
  },
  uploadRowBody: {
    flex: 1,
    gap: 4,
  },
  uploadRowText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  uploadBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e8eaed',
    overflow: 'hidden',
  },
  uploadBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#0b57d0',
  },
  stagedPrimaryBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  stagedPrimaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stagedPrimaryName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  attachAngleToggle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#0b57d0',
    textDecorationLine: 'underline',
  },
  stagedCaptionInput: {
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    fontSize: 11,
    color: '#1f1f1f',
  },
  stagedTitleInput: {
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    fontSize: 11,
    color: '#1f1f1f',
  },
  stagedRemove: {
    padding: 4,
  },
  supportingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  supportingIndex: {
    fontSize: 11,
    color: '#5e5e5e',
    fontVariant: ['tabular-nums'],
  },
  supportingCaptionInput: {
    flex: 1,
    height: 28,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 8,
    fontSize: 11,
    color: '#1f1f1f',
  },
  stagedLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#e3e3e3',
    paddingTop: 6,
  },
  stagedLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  stagedLocationSummary: {
    flex: 1,
    fontSize: 11,
    color: '#3c4043',
  },
  suggestions: {
    flexGrow: 0,
  },
  suggestionsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  suggestionChip: {
    borderRadius: 999,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    shadowColor: '#202124',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  suggestionChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3c4043',
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 1,
  },
  recordingLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  recordingCancelButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#e11d48',
  },
  recordingTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f1f1f',
    fontVariant: ['tabular-nums'],
  },
  recordingLevels: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 20,
    flex: 1,
    maxWidth: 140,
  },
  recordingLevelBar: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: '#00a884',
  },
  trayScrim: {
    position: 'absolute',
    top: -600,
    left: -24,
    right: -24,
    bottom: 0,
  },
  attachTray: {
    position: 'absolute',
    bottom: 64,
    left: 0,
    zIndex: 30,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 2,
    shadowColor: '#202124',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  attachTrayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attachTrayText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  inputCapsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    elevation: 1,
  },
  paperclipButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paperclipButtonActive: {
    backgroundColor: '#edf3fe',
  },
  paperclipIcon: {
    transform: [{ rotate: '-45deg' }],
  },
  composerInput: {
    flex: 1,
    maxHeight: 112,
    paddingHorizontal: 6,
    paddingVertical: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#1f1f1f',
  },
  roundActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00a884',
  },
  districtSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '70%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#ffffff',
    paddingBottom: 24,
  },
  districtSheetTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f1f1f',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eceff3',
  },
  districtSheetList: {
    flexGrow: 0,
  },
  districtRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  districtRowActive: {
    backgroundColor: '#edf3fe',
  },
  districtRowText: {
    fontSize: 14,
    color: '#1f1f1f',
  },
  districtRowTextActive: {
    color: '#0b57d0',
    fontWeight: '600',
  },
});
