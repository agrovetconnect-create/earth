import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronRight,
  Compass,
  FileText,
  Film,
  Lock,
  LogIn,
  MapPin,
  Mic,
  Plus,
  RotateCcw,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  addPostMedia,
  sendWebChatMessage,
  type WebChatLocationPayload,
  type WebChatMessageResponse,
  type WebPhotoSubmissionResult,
} from '../services/postsApi.js';
import { useCommunityUser } from '../services/communityAuth.js';
import { useTranslator } from '../i18n.js';
import { GeneralLoginModal } from './GeneralLoginModal.js';
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

interface ChatMessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  imageUri?: string;
  imageCaption?: string;
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

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
      `Send a clear daylight photograph of a rock, mineral, outcrop, or landform using the + button below to create a Geoscience Passport — just like on the Earth Talk Mobile App and WhatsApp.\n\n` +
      `• Attach extra angles or short video clips to build the Passport gallery (1 / N).\n` +
      `• Write or record a voice note for your Contributor's report.\n` +
      `• Camera EXIF GPS is recovered automatically, or attach Rwanda District · Sector · Cell · Village.\n` +
      `• Review your GeoAI reading and reply in chat before confirming how to pin it on the map.`,
    timestamp: nowTimeLabel(),
    type: 'help',
    suggestedActions: [
      'Attach site photo',
      'Share Location Pin',
      'SITES',
      'HELP',
    ],
  };
}

export const WebFieldSubmissionModal: React.FC<WebFieldSubmissionModalProps> = ({
  isOpen,
  onClose,
  onObservationPinned,
}) => {
  const currentUser = useCommunityUser();
  const t = useTranslator();

  const [showLogin, setShowLogin] = useState(false);
  const [messages, setMessages] = useState<ChatMessageItem[]>(() => [
    buildWelcomeMessage(currentUser?.display_name),
  ]);

  const [inputText, setInputText] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [selectedPrimary, setSelectedPrimary] = useState<StagedPrimaryPhoto | null>(null);
  const [attachAsAngleToActive, setAttachAsAngleToActive] = useState(false);
  const [supportingMedia, setSupportingMedia] = useState<StagedSupportingItem[]>([]);

  // Location tray state (shared with photo or sent as standalone location pin in chat)
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

  // Browser voice note recording (same capability as WhatsApp / Mobile voice notes)
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const primaryInputRef = useRef<HTMLInputElement>(null);
  const supportingInputRef = useRef<HTMLInputElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && messages.length === 1 && messages[0]?.id === 'welcome_1') {
      setMessages([buildWelcomeMessage(currentUser?.display_name)]);
    }
  }, [isOpen, currentUser?.display_name]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [isOpen, messages, isSending]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
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

  const handleResetChat = () => {
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
  };

  const handlePrimaryPhotoChosen = async (file: File | undefined) => {
    if (!file) return;
    setToolNotice(null);

    if (file.type.toLowerCase().startsWith('video/')) {
      setToolNotice(
        'Select a still site photo first, or use "Extra Angles / Clips" to attach a video clip.'
      );
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setToolNotice('Photo exceeds the 10 MB limit. Please select a smaller image.');
      return;
    }

    try {
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
    }
  };

  const handleSupportingFilesChosen = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setToolNotice(null);
    const additions: StagedSupportingItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const nextIndex = supportingMedia.length + additions.length;
      if (nextIndex >= 6) break;
      if (file.size > 10 * 1024 * 1024) {
        setToolNotice(`"${file.name}" exceeds 10 MB. Short clips and photos under 10 MB are supported.`);
        continue;
      }
      const lowerMime = (file.type || '').toLowerCase();
      const lowerName = file.name.toLowerCase();
      const isVid =
        lowerMime.startsWith('video/') || /\.(mp4|3gp|3gpp|webm|mov)$/i.test(lowerName);
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

  const appendAssistantResponse = (response: WebChatMessageResponse) => {
    if (response.pending_passport_id) {
      setActivePassportId(response.pending_passport_id);
    } else if (
      typeof response.passport?.passport_id === 'string' &&
      response.passport.passport_id.trim()
    ) {
      setActivePassportId(response.passport.passport_id.trim());
    }

    setMessages((prev) => [
      ...prev,
      {
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
      },
    ]);
  };

  const handleSendComposer = async () => {
    if (!currentUser || isSending) return;

    const cleanText = inputText.trim();
    const cleanTitle = postTitle.trim();
    const locPayload = buildCurrentLocationPayload();

    if (!cleanText && !selectedPrimary && supportingMedia.length === 0 && !locPayload) {
      return;
    }

    // Validate manual coordinates if partially entered
    if ((latitude.trim() && !longitude.trim()) || (!latitude.trim() && longitude.trim())) {
      setToolNotice('Enter both Latitude and Longitude, or clear coordinates to use District only.');
      return;
    }

    const primaryToSend = selectedPrimary;
    const supportingToSend = [...supportingMedia];
    const attachAngleMode = attachAsAngleToActive && Boolean(activePassportId);
    const locSummaryForBubble = formatLocationSummary(locPayload);

    // Clear staged inputs immediately for responsive chat feel
    setInputText('');
    setPostTitle('');
    setSelectedPrimary(null);
    setAttachAsAngleToActive(false);
    setSupportingMedia([]);
    setToolsTrayOpen(false);
    setLocationDrawerOpen(false);
    setToolNotice(null);

    const bubbleLabel =
      cleanText ||
      (primaryToSend
        ? attachAngleMode
          ? `Attached extra site photo (${primaryToSend.fileName}) to ${activePassportId}`
          : `Sent site photo (${primaryToSend.fileName}) for GeoAI analysis`
        : supportingToSend.length > 0
          ? `Attached ${supportingToSend.length} supporting media file(s)`
          : `Shared field location (${locSummaryForBubble || 'Rwanda'})`);

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
      // Case A: User attached ONLY supporting clips/photos without a primary photo
      if (!primaryToSend && supportingToSend.length > 0) {
        if (!activePassportId) {
          setMessages((prev) => [
            ...prev,
            {
              id: `asst_${Date.now()}`,
              sender: 'assistant',
              text:
                'Send a clear primary site photo first so GeoAI can create your Geoscience Passport, then attach extra angles and video clips to that Passport.',
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

        setMessages((prev) => [
          ...prev,
          {
            id: `asst_${Date.now()}`,
            sender: 'assistant',
            text: `Attached ${supportingToSend.length} supporting gallery item(s) to Geoscience Passport ${activePassportId}.`,
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
          });
          appendAssistantResponse(textRes);
        }
        return;
      }

      // Case B: Standard chat request (Primary photo + supporting + location + report, OR location pin, OR text/command)
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
        location: locPayload ?? undefined,
        pending_passport_id:
          primaryToSend && !attachAngleMode ? undefined : activePassportId ?? undefined,
      });

      appendAssistantResponse(response);
    } catch (err: unknown) {
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

  const handleToggleVoiceRecording = async () => {
    if (isRecordingVoice) {
      mediaRecorderRef.current?.stop();
      setIsRecordingVoice(false);
      return;
    }

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

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordedChunksRef.current, { type: preferredMime });
        if (blob.size === 0) return;

        const b64 = arrayBufferToBase64(await blob.arrayBuffer());
        setMessages((prev) => [
          ...prev,
          {
            id: `usr_voice_${Date.now()}`,
            sender: 'user',
            text: 'Sent field voice note',
            timestamp: nowTimeLabel(),
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
      setToolNotice(null);
    } catch {
      setToolNotice('Microphone permission was declined.');
    }
  };

  const handleSuggestedAction = (action: string) => {
    const lower = action.toLowerCase();
    if (lower.includes('attach photo') || lower.includes('attach site photo') || lower.includes('snap another photo') || lower.includes('attach another photo')) {
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
        (inputText.trim() ||
          selectedPrimary ||
          supportingMedia.length > 0 ||
          stagedLocationPayload)
    );

  const latestSuggestions = messages[messages.length - 1]?.suggestedActions ?? [];
  const contributorInitials = currentUser
    ? (currentUser.display_name || currentUser.public_user_id).slice(0, 2).toUpperCase()
    : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Submit Field Observation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0b0f14]/65 p-3 sm:p-4 backdrop-blur-xs"
    >
      <div className="flex h-[88dvh] max-h-[820px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#dadce0] bg-white text-[#1f1f1f] shadow-2xl">
        {/* Header */}
        <div className="shrink-0 border-b border-[#e3e3e3] bg-white">
          <div className="flex items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex items-center gap-3 min-w-0">
              {currentUser && (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0b57d0] text-xs font-semibold text-white">
                  {contributorInitials}
                </span>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-[#1f1f1f]">
                  {t('Submit Field Observation')}
                </h2>
                <p className="truncate text-xs text-[#5e5e5e]">
                  {currentUser
                    ? `${currentUser.display_name || 'Earth Talk Member'} · Contributor · GeoAI Field Chat`
                    : 'Sign in required · GeoAI Field Chat'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {currentUser && messages.length > 1 && (
                <button
                  type="button"
                  onClick={handleResetChat}
                  title="Reset conversation"
                  aria-label="Reset conversation"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#dadce0] bg-white px-2.5 text-xs font-medium text-[#3c4043] hover:bg-[#f6f8fb] whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>New</span>
                </button>
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

          {/* Active Geoscience Passport Banner (matches Mobile App chat.tsx) */}
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
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b57d0] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#0842a0] whitespace-nowrap"
                >
                  <LogIn className="h-4 w-4" />
                  <span>{t('Sign in')}</span>
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

            {/* Conversational Message Stream */}
            <div className="g-scroll flex-1 overflow-y-auto bg-[#f8fafd] px-4 sm:px-5 py-4 space-y-4">
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                const passportId =
                  msg.pendingPassportId ||
                  msg.pinConfirmation?.passport_id ||
                  (typeof msg.passport?.passport_id === 'string'
                    ? msg.passport.passport_id
                    : undefined);

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl border p-3.5 space-y-2.5 ${
                        isUser
                          ? 'rounded-br-sm border-[#0b57d0] bg-[#0b57d0] text-white'
                          : 'rounded-bl-sm border-[#dadce0] bg-white text-[#1f1f1f]'
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

                      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>

                      {/* Follow-up questions from GeoAI (tap to reply in chat) */}
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

                      {/* Open Geoscience Passport Card (matches Mobile App chat.tsx) */}
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
                                {passportId}
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

                    <span className="mt-1 px-1 text-[11px] font-mono tabular-nums text-[#8f8f8f]">
                      {msg.timestamp}
                    </span>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex items-start">
                  <div className="rounded-2xl rounded-bl-sm border border-[#dadce0] bg-white px-4 py-3 text-xs text-[#5e5e5e]">
                    Earth Talk GeoAI is analyzing…
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Composer & Attachment Tray */}
            <div className="shrink-0 border-t border-[#e3e3e3] bg-white px-4 py-3 space-y-2.5">
              {/* Tools Tray (+ menu) */}
              {toolsTrayOpen && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-1">
                  <button
                    type="button"
                    onClick={() => primaryInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl border border-[#dadce0] bg-[#f8fafd] px-3 py-2.5 text-xs font-medium text-[#1f1f1f] hover:bg-[#edf3fe] whitespace-nowrap"
                  >
                    <Camera className="h-4 w-4 shrink-0 text-[#0b57d0]" />
                    <span className="truncate">Site Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => supportingInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl border border-[#dadce0] bg-[#f8fafd] px-3 py-2.5 text-xs font-medium text-[#1f1f1f] hover:bg-[#edf3fe] whitespace-nowrap"
                  >
                    <Film className="h-4 w-4 shrink-0 text-[#0b57d0]" />
                    <span className="truncate">Angles / Video</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleUseLiveGps}
                    disabled={gpsBusy}
                    className="flex items-center gap-2 rounded-xl border border-[#dadce0] bg-[#f8fafd] px-3 py-2.5 text-xs font-medium text-[#1f1f1f] hover:bg-[#edf3fe] disabled:opacity-50 whitespace-nowrap"
                  >
                    <Compass className="h-4 w-4 shrink-0 text-[#137333]" />
                    <span className="truncate">{gpsBusy ? 'Reading GPS…' : 'Live GPS'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocationDrawerOpen((prev) => !prev);
                      setToolsTrayOpen(false);
                    }}
                    className="flex items-center gap-2 rounded-xl border border-[#dadce0] bg-[#f8fafd] px-3 py-2.5 text-xs font-medium text-[#1f1f1f] hover:bg-[#edf3fe] whitespace-nowrap"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-[#0b57d0]" />
                    <span className="truncate">Rwanda Place</span>
                  </button>
                </div>
              )}

              {/* Compact Location Drawer (District · Sector · Cell · Village + lat, lng) */}
              {locationDrawerOpen && (
                <div className="rounded-xl border border-[#dadce0] bg-[#f8fafd] p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#1f1f1f]">
                      Location (Rwanda · District · Sector · Cell · Village)
                    </span>
                    <div className="flex items-center gap-2">
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
                <div className="flex items-center justify-between gap-2 rounded-lg border border-[#dadce0] bg-[#f8fafd] px-3 py-2 text-xs text-[#3c4043]">
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
              {(selectedPrimary || supportingMedia.length > 0 || stagedLocationSummary) && (
                <div className="rounded-xl border border-[#dadce0] bg-[#f8fafd] p-2.5 space-y-2 max-h-48 overflow-y-auto g-scroll">
                  {selectedPrimary && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={selectedPrimary.previewUri}
                          alt={selectedPrimary.fileName}
                          referrerPolicy="no-referrer"
                          className="h-11 w-11 shrink-0 rounded-lg object-cover border border-[#dadce0]"
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

              {/* Suggested Quick Actions (matches Mobile App chat.tsx) */}
              {latestSuggestions.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 g-scroll">
                  {latestSuggestions.map((action, idx) => (
                    <button
                      key={`${action}_${idx}`}
                      type="button"
                      disabled={isSending}
                      onClick={() => handleSuggestedAction(action)}
                      className="shrink-0 rounded-lg border border-[#dadce0] bg-[#f8fafd] px-2.5 py-1 text-xs font-medium text-[#3c4043] hover:bg-[#edf3fe] hover:text-[#0b57d0] disabled:opacity-50 whitespace-nowrap"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              )}

              {/* Main Chat Input Row */}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setToolsTrayOpen((prev) => !prev)}
                  aria-label="Attach photo, video clip, or location"
                  title="Attach photo, video clip, or location"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                    toolsTrayOpen
                      ? 'border-[#0b57d0] bg-[#edf3fe] text-[#0b57d0]'
                      : 'border-[#dadce0] bg-[#f8fafd] text-[#0b57d0] hover:bg-[#edf3fe]'
                  }`}
                >
                  {toolsTrayOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </button>

                <textarea
                  ref={composerTextareaRef}
                  rows={2}
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
                    selectedPrimary
                      ? "Write your Contributor's report for this photo (or press Enter to send)…"
                      : 'Send a site photo (+), write your field report, answer a question, or type SITES…'
                  }
                  className="flex-1 resize-none rounded-xl border border-[#c7c7c7] bg-white px-3 py-2 text-xs leading-relaxed text-[#1f1f1f] focus:border-[#0b57d0] focus:outline-none"
                />

                <button
                  type="button"
                  onClick={() => void handleToggleVoiceRecording()}
                  disabled={isSending}
                  aria-label={isRecordingVoice ? 'Stop and send voice note' : 'Record voice note'}
                  title={isRecordingVoice ? 'Stop & send voice note' : 'Record voice note'}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                    isRecordingVoice
                      ? 'border-[#b3261e] bg-[#fdf2f2] text-[#b3261e]'
                      : 'border-[#dadce0] bg-[#f8fafd] text-[#3c4043] hover:bg-[#edf3fe]'
                  }`}
                >
                  {isRecordingVoice ? (
                    <Square className="h-4 w-4 fill-current" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </button>

                <button
                  type="button"
                  disabled={!canSend}
                  onClick={() => void handleSendComposer()}
                  aria-label="Send message"
                  title="Send"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0b57d0] text-white transition-colors hover:bg-[#0842a0] disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <GeneralLoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onUserLogin={() => setShowLogin(false)}
      />
    </div>
  );
};
