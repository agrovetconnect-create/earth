import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import {
  sendMobileChatMessage,
  submitPhotoObservation,
  type MobilePinConfirmationSummary,
  type MobilePinDecision,
} from '../services/api';
import { getContributorToken } from '../services/contributorToken';
import {
  listOfflineFieldDrafts,
  removeOfflineFieldDraft,
  saveOfflineFieldDraft,
  type OfflineFieldDraft,
  type SupportingMediaDraftItem,
} from '../services/offlineDrafts';
import type {
  PhotoSubmissionRequest,
  PhotoSubmissionResponse,
  SpecimenContextType,
} from '../types/api';
import { spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import {
  buildSampleExifJpegBase64,
  distanceBetweenKm,
  extractExifFromBase64,
  nearestRwandaDistrict,
  type ExtractedLocation,
} from '../utils/exifExtractor';
import { useAppLanguage } from '../utils/language';
import { observationDetailRoute } from '../utils/observationNavigation';
import { useResponsiveLayout } from '../utils/responsive';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (result: PhotoSubmissionResponse) => void;
}

type PrimaryImageMimeType = NonNullable<PhotoSubmissionRequest['mime_type']>;

const SPECIMEN_CONTEXT_OPTIONS: ReadonlyArray<{ value: SpecimenContextType; label: string }> = [
  { value: 'in_situ_outcrop', label: 'In-situ bedrock' },
  { value: 'road_cut', label: 'Road cut' },
  { value: 'quarry_exposure', label: 'Quarry / pit' },
  { value: 'loose_float', label: 'Loose float' },
  { value: 'stream_cobble', label: 'Stream cobble' },
  { value: 'hand_sample', label: 'Hand sample' },
];

interface WebFileLike {
  name: string;
  type: string;
  size: number;
}

import * as Location from 'expo-location';

function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    output += chars[(triplet >> 18) & 0x3f];
    output += chars[(triplet >> 12) & 0x3f];
    output += i + 1 < bytes.length ? chars[(triplet >> 6) & 0x3f] : '=';
    output += i + 2 < bytes.length ? chars[triplet & 0x3f] : '=';
  }
  return output;
}

function createSimulatorMediaFixture(kind: 'image' | 'video'): string {
  const bytes = new Uint8Array(160);
  if (kind === 'image') {
    const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    pngHeader.forEach((b, idx) => {
      bytes[idx] = b;
    });
    for (let i = 8; i < bytes.length; i++) bytes[i] = (i * 7) & 0xff;
  } else {
    const mp4Header = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d];
    mp4Header.forEach((b, idx) => {
      bytes[idx] = b;
    });
    for (let i = 12; i < bytes.length; i++) bytes[i] = (i * 13) & 0xff;
  }
  return bytesToBase64(bytes);
}

function normalizePrimaryImageMime(rawMime: string, fileName: string): PrimaryImageMimeType | null {
  const lowerMime = rawMime.toLowerCase();
  const lowerName = fileName.toLowerCase();
  if (
    lowerMime.startsWith('video/') ||
    lowerName.endsWith('.mp4') ||
    lowerName.endsWith('.3gp') ||
    lowerName.endsWith('.webm') ||
    lowerName.endsWith('.mov')
  ) {
    return null;
  }
  if (lowerMime === 'image/png' || lowerName.endsWith('.png')) return 'image/png';
  if (lowerMime === 'image/webp' || lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerMime === 'image/heic' || lowerName.endsWith('.heic') || lowerName.endsWith('.heif')) {
    return 'image/heic';
  }
  return 'image/jpeg';
}

function normalizeSupportingMime(rawMime: string, fileName: string): string {
  const lowerMime = rawMime.toLowerCase();
  const lowerName = fileName.toLowerCase();
  if (lowerMime === 'video/mp4' || lowerName.endsWith('.mp4')) return 'video/mp4';
  if (lowerMime === 'video/3gpp' || lowerName.endsWith('.3gp') || lowerName.endsWith('.3gpp')) {
    return 'video/3gpp';
  }
  if (lowerMime === 'video/webm' || lowerName.endsWith('.webm')) return 'video/webm';
  if (lowerMime === 'video/quicktime' || lowerName.endsWith('.mov')) return 'video/quicktime';
  if (lowerMime === 'image/png' || lowerName.endsWith('.png')) return 'image/png';
  if (lowerMime === 'image/webp' || lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerMime === 'image/heic' || lowerName.endsWith('.heic') || lowerName.endsWith('.heif')) {
    return 'image/heic';
  }
  return 'image/jpeg';
}

export function PhotoSubmissionModal({ visible, onClose, onSuccess }: Props) {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, token } = useAuth();

  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [district, setDistrict] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [locationSource, setLocationSource] = useState<'exif' | 'live_gps' | 'manual'>('manual');
  const [exifInfo, setExifInfo] = useState<ExtractedLocation | null>(null);
  const [liveGpsMismatchKm, setLiveGpsMismatchKm] = useState<number | null>(null);

  const [specimenContext, setSpecimenContext] = useState<SpecimenContextType>('in_situ_outcrop');
  const [hasScaleReference, setHasScaleReference] = useState(false);
  const [hasFreshSurface, setHasFreshSurface] = useState(false);

  const [base64Media, setBase64Media] = useState<string>('');
  const [mimeType, setMimeType] = useState<PrimaryImageMimeType>('image/jpeg');
  const [fileName, setFileName] = useState<string>('');
  const [supportingMedia, setSupportingMedia] = useState<SupportingMediaDraftItem[]>([]);
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineFieldDraft[]>([]);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<PhotoSubmissionResponse | null>(null);
  const [pinConfirmation, setPinConfirmation] = useState<MobilePinConfirmationSummary | null>(null);

  useEffect(() => {
    if (!visible) return;
    void listOfflineFieldDrafts().then(setOfflineDrafts);
  }, [visible]);

  const resetForm = () => {
    setTitle('');
    setCaption('');
    setDistrict('');
    setLatitude('');
    setLongitude('');
    setLocationSource('manual');
    setExifInfo(null);
    setLiveGpsMismatchKm(null);
    setSpecimenContext('in_situ_outcrop');
    setHasScaleReference(false);
    setHasFreshSurface(false);
    setBase64Media('');
    setMimeType('image/jpeg');
    setFileName('');
    setSupportingMedia([]);
    setStatusBanner(null);
    setErrorMessage(null);
    setResult(null);
    setPinConfirmation(null);
  };

  const applyPrimaryPhotoSelection = (
    rawBase64: string,
    detectedMime: PrimaryImageMimeType,
    selectedName: string
  ) => {
    setBase64Media(rawBase64);
    setMimeType(detectedMime);
    setFileName(selectedName);
    setErrorMessage(null);

    const extracted = extractExifFromBase64(rawBase64);
    if (extracted.hasCoordinates) {
      setExifInfo(extracted);
      setLatitude(extracted.latitude.toFixed(6));
      setLongitude(extracted.longitude.toFixed(6));
      if (extracted.inferredDistrict) {
        setDistrict(extracted.inferredDistrict);
      }
      setLocationSource('exif');
      setLiveGpsMismatchKm(null);
      setStatusBanner(
        t(
          `EXIF GPS found (${extracted.latitude.toFixed(5)}, ${extracted.longitude.toFixed(5)}${
            extracted.inferredDistrict ? ` · ${extracted.inferredDistrict}` : ''
          }).`
        )
      );
    } else {
      setExifInfo(null);
      setLiveGpsMismatchKm(null);
      setStatusBanner(
        t('No EXIF GPS found. Pick a district, use Live GPS, or keep private.')
      );
    }
  };

  const triggerWebFilePicker = (mode: 'primary_photo' | 'supporting') => {
    const g = globalThis as unknown as {
      document?: {
        createElement: (tag: string) => {
          type: string;
          accept: string;
          onchange: ((ev: { target: { files?: ArrayLike<WebFileLike & Blob> | null } }) => void) | null;
          click: () => void;
        };
      };
      FileReader?: new () => {
        result: string | ArrayBuffer | null;
        onload: (() => void) | null;
        onerror: (() => void) | null;
        readAsDataURL: (b: Blob) => void;
      };
    };

    if (!g.document || !g.FileReader) {
      setErrorMessage(
        t('Native file picker requires a device build or use the field photo & supporting video fixtures below.')
      );
      return;
    }

    const input = g.document.createElement('input');
    input.type = 'file';
    input.accept =
      mode === 'primary_photo'
        ? 'image/jpeg,image/png,image/webp,image/heic'
        : 'video/mp4,video/3gpp,video/webm,video/quicktime,image/jpeg,image/png,image/webp,image/heic';
    input.onchange = (ev) => {
      const file = ev.target.files?.[0];
      if (!file || !g.FileReader) return;
      if (file.size > 10 * 1024 * 1024) {
        setErrorMessage(t('File exceeds 10 MB limit. Choose a smaller photo or shorter outcrop video.'));
        return;
      }

      if (mode === 'primary_photo') {
        const primaryMime = normalizePrimaryImageMime(file.type, file.name);
        if (!primaryMime) {
          setErrorMessage(
            t('GeoAI analyzes still images only. Select a photo as the primary specimen image, then attach your video under Supporting Site Videos & Extra Photos.')
          );
          return;
        }
        const reader = new g.FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            const rawBase64 = reader.result.includes(',')
              ? reader.result.slice(reader.result.indexOf(',') + 1)
              : reader.result;
            applyPrimaryPhotoSelection(rawBase64, primaryMime, file.name);
          }
        };
        reader.onerror = () => setErrorMessage(t('Failed to read selected photo.'));
        reader.readAsDataURL(file);
        return;
      }

      if (supportingMedia.length >= 5) {
        setErrorMessage(t('Up to 5 supporting videos or extra photos can be bundled at once.'));
        return;
      }
      const supMime = normalizeSupportingMime(file.type, file.name);
      const reader = new g.FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const rawBase64 = reader.result.includes(',')
            ? reader.result.slice(reader.result.indexOf(',') + 1)
            : reader.result;
          setSupportingMedia((prev) => [
            ...prev,
            {
              content_base64: rawBase64,
              mime_type: supMime,
              caption: file.name,
              role: supMime.startsWith('video/') ? 'video' : 'field',
              file_name: file.name,
            },
          ]);
          setErrorMessage(null);
        }
      };
      reader.onerror = () => setErrorMessage(t('Failed to read supporting media file.'));
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleLoadExifFixturePhoto = () => {
    const exifJpeg = buildSampleExifJpegBase64(-1.5008, 29.6342, '2026:03:18 09:42:15');
    setTitle(t('Musanze Basalt Roadcut (Photographed Earlier)'));
    setCaption(t('Vesicular volcanic outcrop photographed in the morning before returning to town.'));
    applyPrimaryPhotoSelection(exifJpeg, 'image/jpeg', 'musanze_earlier_exif_photo.jpg');
  };

  const handleLoadPlainFixturePhoto = () => {
    const pngB64 = createSimulatorMediaFixture('image');
    setTitle(t('Musanze Felsic Outcrop'));
    setCaption(t('Felsic intrusive outcrop with visible quartz and feldspar crystals.'));
    applyPrimaryPhotoSelection(pngB64, 'image/png', 'musanze_outcrop_photo.png');
  };

  const handleAttachSupportingVideoFixture = () => {
    if (supportingMedia.length >= 5) return;
    setSupportingMedia((prev) => [
      ...prev,
      {
        content_base64: createSimulatorMediaFixture('video'),
        mime_type: 'video/mp4',
        caption: t('360° outcrop pan video (attached to post without AI video analysis)'),
        role: 'video',
        file_name: 'outcrop_walkthrough_clip.mp4',
      },
    ]);
    setErrorMessage(null);
  };

  const handleRestoreExifCoordinates = () => {
    if (!exifInfo?.hasCoordinates) return;
    setLatitude(exifInfo.latitude.toFixed(6));
    setLongitude(exifInfo.longitude.toFixed(6));
    if (exifInfo.inferredDistrict) setDistrict(exifInfo.inferredDistrict);
    setLocationSource('exif');
    setLiveGpsMismatchKm(null);
  };

  const handleDetectGps = async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMessage(t('Location permission was denied.'));
        setLocLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const liveLat = loc.coords.latitude;
      const liveLon = loc.coords.longitude;
      setLatitude(liveLat.toFixed(6));
      setLongitude(liveLon.toFixed(6));
      const inferred = nearestRwandaDistrict(liveLat, liveLon);
      if (inferred) setDistrict(inferred);
      setLocationSource('live_gps');
      if (exifInfo?.hasCoordinates) {
        const distKm = distanceBetweenKm(exifInfo.latitude, exifInfo.longitude, liveLat, liveLon);
        setLiveGpsMismatchKm(distKm > 0.5 ? distKm : null);
      }
      setErrorMessage(null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? t(err.message) : t('Unable to read live device GPS.'));
    } finally {
      setLocLoading(false);
    }
  };

  const handleSaveOfflineDraft = async () => {
    if (!base64Media) {
      setErrorMessage(t('Select a primary specimen or outcrop photo first before saving an offline draft.'));
      return;
    }
    await saveOfflineFieldDraft({
      title,
      caption,
      district,
      latitude,
      longitude,
      locationSource,
      specimenContext,
      hasScaleReference,
      hasFreshSurface,
      primaryBase64: base64Media,
      primaryMimeType: mimeType,
      primaryFileName: fileName || 'field_photo.jpg',
      supportingMedia,
    });
    const updated = await listOfflineFieldDrafts();
    setOfflineDrafts(updated);
    setStatusBanner(t('Saved to Offline Field Drafts on this device. Submit whenever network returns.'));
  };

  const handleLoadOfflineDraft = async (draft: OfflineFieldDraft) => {
    setTitle(draft.title);
    setCaption(draft.caption);
    setDistrict(draft.district);
    setLatitude(draft.latitude);
    setLongitude(draft.longitude);
    setLocationSource(draft.locationSource);
    setSpecimenContext((draft.specimenContext as SpecimenContextType) || 'in_situ_outcrop');
    setHasScaleReference(draft.hasScaleReference);
    setHasFreshSurface(draft.hasFreshSurface);
    setBase64Media(draft.primaryBase64);
    setMimeType(draft.primaryMimeType);
    setFileName(draft.primaryFileName);
    setSupportingMedia(draft.supportingMedia);
    await removeOfflineFieldDraft(draft.id);
    setOfflineDrafts(await listOfflineFieldDrafts());
    setStatusBanner(t(`Loaded offline field draft "${draft.title || draft.primaryFileName}".`));
  };

  /**
   * Step 1: Analyze PRIMARY PHOTO ONLY as a private draft first; bundle any
   * supporting videos & extra photos directly onto the post without AI video calls.
   */
  const handleAnalyzeDraft = async () => {
    if (!base64Media) {
      setErrorMessage(t('Select a primary specimen or outcrop photo (JPEG, PNG, WebP, or HEIC) first.'));
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    const latNum = latitude.trim() ? parseFloat(latitude.trim()) : undefined;
    const lngNum = longitude.trim() ? parseFloat(longitude.trim()) : undefined;

    try {
      const contributorToken = await getContributorToken().catch(() => null);

      const payload: PhotoSubmissionRequest = {
        content_base64: base64Media,
        mime_type: mimeType,
        caption: caption.trim() || undefined,
        post_title: title.trim() || undefined,
        is_public: false,
        specimen_context: specimenContext,
        has_scale_reference: hasScaleReference,
        has_fresh_surface: hasFreshSurface,
        supporting_media: supportingMedia.map((item) => ({
          content_base64: item.content_base64,
          mime_type: item.mime_type,
          caption: item.caption,
          role: item.role,
        })),
        contributor_token: contributorToken ?? undefined,
        location:
          latNum !== undefined && !isNaN(latNum) && lngNum !== undefined && !isNaN(lngNum)
            ? {
                latitude: latNum,
                longitude: lngNum,
                district: district.trim() || undefined,
                public_location_precision: 'private',
              }
            : district.trim()
              ? {
                  district: district.trim(),
                  public_location_precision: 'private',
                }
              : undefined,
      };

      const response = await submitPhotoObservation(payload, token, undefined, contributorToken);
      if (
        response.exif_location?.has_gps &&
        response.exif_location.latitude !== null &&
        response.exif_location.longitude !== null &&
        !latitude.trim() &&
        !longitude.trim()
      ) {
        setLatitude(response.exif_location.latitude.toFixed(6));
        setLongitude(response.exif_location.longitude.toFixed(6));
        if (response.exif_location.inferred_district && !district.trim()) {
          setDistrict(response.exif_location.inferred_district);
        }
        setLocationSource('exif');
      }
      if (response.gps_mismatch_km && response.gps_mismatch_km > 0.5) {
        setLiveGpsMismatchKm(response.gps_mismatch_km);
      }
      setResult(response);
      setPinConfirmation(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? t(err.message) : t('Photo GeoAI analysis failed.');
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Step 2: Confirm how to pin & publish (or keep private) AFTER reviewing the summary.
   */
  const handleConfirmPinDecision = async (decision: MobilePinDecision) => {
    if (!result) return;
    setPinning(true);
    setErrorMessage(null);

    const latNum = latitude.trim() ? parseFloat(latitude.trim()) : null;
    const lngNum = longitude.trim() ? parseFloat(longitude.trim()) : null;

    try {
      const contributorToken = await getContributorToken().catch(() => null);

      const chatRes = await sendMobileChatMessage(
        {
          pending_passport_id: result.passport_id,
          pin_decision: decision,
          post_title: title.trim() || undefined,
          location: {
            latitude: latNum !== null && !isNaN(latNum) ? latNum : null,
            longitude: lngNum !== null && !isNaN(lngNum) ? lngNum : null,
            district: district.trim() || null,
          },
        },
        token,
        undefined,
        contributorToken
      );

      if (chatRes.pin_confirmation) {
        setPinConfirmation(chatRes.pin_confirmation);
        const updatedResult: PhotoSubmissionResponse = {
          ...result,
          is_public: chatRes.pin_confirmation.is_public,
        };
        setResult(updatedResult);
        if (chatRes.pin_confirmation.is_public) {
          onSuccess?.(updatedResult);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? t(err.message) : t('Could not update pin preference.');
      setErrorMessage(msg);
    } finally {
      setPinning(false);
    }
  };

  const handleViewPassport = () => {
    if (result) {
      const route = observationDetailRoute(result.passport_id);
      onClose();
      resetForm();
      router.push(route);
    }
  };

  const handleOpenInChat = () => {
    onClose();
    resetForm();
    router.push('/(tabs)/chat');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.header,
            {
              paddingTop: layout.modalHeaderTopPadding,
              paddingLeft: layout.sideSafeLeft + layout.horizontalPadding,
              paddingRight: layout.sideSafeRight + layout.horizontalPadding,
            },
          ]}
        >
          <Text style={styles.title} numberOfLines={1}>
            {t(result ? 'Review & Pin' : 'Submit Observation')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Close')}
            onPress={() => {
              onClose();
              if (result) resetForm();
            }}
            style={styles.closeBtn}
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: layout.horizontalPadding,
              paddingBottom: layout.bottomSafePadding + 24,
              maxWidth: layout.contentMaxWidth,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {!user && !result ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>{t('Sign in required')}</Text>
              <Text style={styles.subtitle}>
                {t('Sign in to submit field observations and link your contributor credit.')}
              </Text>
              <Pressable
                accessibilityRole="button"
                style={styles.primaryBtn}
                onPress={() => {
                  onClose();
                  router.push('/(tabs)/profile');
                }}
              >
                <Text style={styles.primaryBtnText}>{t('Sign in')}</Text>
              </Pressable>
            </View>
          ) : result ? (
            <View style={styles.resultBox}>
              <View style={styles.passportBadge}>
                <Text style={styles.passportBadgeText}>{result.passport_id}</Text>
                <Text style={styles.evidenceStateBadge}>
                  {pinConfirmation
                    ? pinConfirmation.is_public
                      ? t(`Pinned (${pinConfirmation.precision})`)
                      : t('Saved Private')
                    : t('Draft — Not Yet Public')}
                </Text>
              </View>

              <Text style={styles.resultTitle}>
                {result.possible_name || t(result.subcategory) || t(result.category)}
              </Text>
              <Text style={styles.resultInterpretation}>{result.primary_interpretation}</Text>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t('What was observed')}</Text>
                <Text style={styles.metaValue}>
                  {t(result.category.replace(/_/g, ' '))} · {t(result.subcategory.replace(/_/g, ' '))}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t('Evidence state')}</Text>
                <Text style={styles.metaValue}>
                  {t(result.evidence_state.replace(/_/g, ' '))}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t('Confidence')}</Text>
                <Text style={styles.metaValue}>
                  {t(result.confidence)} ({(result.confidence_score * 100).toFixed(0)}%)
                </Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t('Media Stored')}</Text>
                <Text style={styles.metaValue}>
                  {t(
                    `Primary ${result.media.mime_type}${
                      result.supporting_media_count
                        ? ` + ${result.supporting_media_count} supporting file(s)`
                        : ''
                    }`
                  )}
                </Text>
              </View>

              {result.diagnostic_features.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.sectionLabel}>{t('Diagnostic Features')}</Text>
                  {result.diagnostic_features.map((feat, idx) => (
                    <Text key={idx} style={styles.bulletItem}>
                      • {feat}
                    </Text>
                  ))}
                </View>
              )}

              {result.uncertainties.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.sectionLabel}>{t('Uncertainties')}</Text>
                  {result.uncertainties.map((unc, idx) => (
                    <Text key={idx} style={styles.bulletItem}>
                      • {unc}
                    </Text>
                  ))}
                </View>
              )}

              {result.safety_note ? (
                <View style={styles.safetyBox}>
                  <Text style={styles.safetyTitle}>{t('Safety Note')}</Text>
                  <Text style={styles.safetyText}>{result.safety_note}</Text>
                </View>
              ) : null}

              {/* Step 2: Ask Pin / Location Precision Confirmation Card */}
              <View style={styles.pinCard}>
                <Text style={styles.pinCardTitle}>
                  {t(pinConfirmation ? 'Pin Saved' : 'Choose Map Pin Precision')}
                </Text>
                <Text style={styles.pinCardSubtitle}>
                  {pinConfirmation
                    ? pinConfirmation.is_public
                      ? t(
                          `Published (${pinConfirmation.precision}${
                            pinConfirmation.district ? ` · ${pinConfirmation.district}` : ''
                          }).`
                        )
                      : t('Saved privately. Coordinates remain hidden.')
                    : t('Confirm location and public map precision:')}
                </Text>

                {liveGpsMismatchKm !== null && !pinConfirmation && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>
                      {t(`Live GPS is ${liveGpsMismatchKm.toFixed(1)} km from photo EXIF. Restore EXIF to pin the outcrop.`)}
                    </Text>
                    {exifInfo?.hasCoordinates && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleRestoreExifCoordinates}
                        style={[styles.secondaryBtn, { marginTop: 8 }]}
                      >
                        <Text style={styles.secondaryBtnText}>{t('Restore Photo EXIF GPS')}</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {!pinConfirmation && (
                  <>
                    <View style={styles.field}>
                      <View style={styles.gpsHeaderRow}>
                        <Text style={styles.fieldLabel}>
                          {t('District')} ·{' '}
                          {t(
                            locationSource === 'exif'
                              ? 'EXIF'
                              : locationSource === 'live_gps'
                                ? 'Live GPS'
                                : 'Manual'
                          )}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={handleDetectGps}
                          disabled={locLoading}
                          style={styles.gpsMiniBtn}
                        >
                          <Text style={styles.gpsMiniBtnText}>
                            {t(locLoading ? 'Reading…' : 'Live GPS')}
                          </Text>
                        </Pressable>
                      </View>
                      <TextInput
                        value={district}
                        onChangeText={(txt) => {
                          setDistrict(txt);
                          if (locationSource !== 'exif') setLocationSource('manual');
                        }}
                        placeholder={t('e.g. Musanze, Karongi')}
                        placeholderTextColor={colors.muted}
                        style={styles.input}
                        maxLength={40}
                      />
                    </View>

                    <View style={[styles.row, layout.isCompactPhone && styles.rowStack]}>
                      <View style={[styles.field, { flex: 1 }]}>
                        <Text style={styles.fieldLabel}>{t('Latitude')}</Text>
                        <TextInput
                          value={latitude}
                          onChangeText={(txt) => {
                            setLatitude(txt);
                            setLocationSource('manual');
                          }}
                          placeholder="-1.5008"
                          placeholderTextColor={colors.muted}
                          style={styles.input}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={[styles.field, { flex: 1 }]}>
                        <Text style={styles.fieldLabel}>{t('Longitude')}</Text>
                        <TextInput
                          value={longitude}
                          onChangeText={(txt) => {
                            setLongitude(txt);
                            setLocationSource('manual');
                          }}
                          placeholder="29.6342"
                          placeholderTextColor={colors.muted}
                          style={styles.input}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>

                    {errorMessage && (
                      <View style={styles.errorBox}>
                        <Text style={styles.errorText}>{errorMessage}</Text>
                      </View>
                    )}

                    <View style={styles.pinDecisionGrid}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={pinning}
                        style={[styles.primaryBtn, pinning && styles.btnDisabled]}
                        onPress={() => {
                          void handleConfirmPinDecision('pin_approximate');
                        }}
                      >
                        <Text style={styles.primaryBtnText}>
                          {t('Pin Approximate (~2 km) · Recommended')}
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        disabled={pinning}
                        style={[styles.secondaryBtn, pinning && styles.btnDisabled]}
                        onPress={() => {
                          void handleConfirmPinDecision('pin_exact');
                        }}
                      >
                        <Text style={styles.secondaryBtnText}>{t('Pin Exact Coordinates')}</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        disabled={pinning}
                        style={[styles.secondaryBtn, pinning && styles.btnDisabled]}
                        onPress={() => {
                          void handleConfirmPinDecision('pin_district');
                        }}
                      >
                        <Text style={styles.secondaryBtnText}>{t('Pin District Only')}</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        disabled={pinning}
                        style={[styles.privateBtn, pinning && styles.btnDisabled]}
                        onPress={() => {
                          void handleConfirmPinDecision('keep_private');
                        }}
                      >
                        <Text style={styles.privateBtnText}>{t('Keep Private')}</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </View>

              <Text style={styles.disclaimerText}>{t(result.disclaimer)}</Text>

              <View style={styles.buttonGroup}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.primaryBtn}
                  onPress={handleViewPassport}
                >
                  <Text style={styles.primaryBtnText}>{t('Open Passport')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.secondaryBtn}
                  onPress={handleOpenInChat}
                >
                  <Text style={styles.secondaryBtnText}>{t('Ask GeoAI')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.secondaryBtn}
                  onPress={resetForm}
                >
                  <Text style={styles.secondaryBtnText}>{t('Submit Another')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.subtitle}>
                {t('Upload a rock, landform, or outcrop photo. EXIF GPS is read automatically; videos attach as site media.')}
              </Text>

              {offlineDrafts.length > 0 && (
                <View style={styles.offlineBox}>
                  <Text style={styles.fieldLabel}>
                    {t(`Saved Offline Field Drafts (${offlineDrafts.length})`)}
                  </Text>
                  {offlineDrafts.map((draft) => (
                    <View key={draft.id} style={styles.offlineRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.metaValue} numberOfLines={1}>
                          {draft.title || draft.primaryFileName}
                        </Text>
                        <Text style={styles.metaLabel}>
                          {draft.district || t('No district')} · {t(`${draft.supportingMedia.length} extra media`)}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        style={styles.gpsMiniBtn}
                        onPress={() => {
                          void handleLoadOfflineDraft(draft);
                        }}
                      >
                        <Text style={styles.gpsMiniBtnText}>{t('Load Draft')}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}

              {/* 1. Primary Specimen / Outcrop Photo (GeoAI Analyzed) */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('1. Primary Photo')}</Text>

                <View style={styles.pickerRow}>
                  {Platform.OS === 'web' && (
                    <Pressable
                      accessibilityRole="button"
                      style={styles.sampleBtn}
                      onPress={() => triggerWebFilePicker('primary_photo')}
                    >
                      <Text style={styles.sampleBtnText}>{t('Choose Photo')}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    style={styles.fixtureBtn}
                    onPress={handleLoadExifFixturePhoto}
                  >
                    <Text style={styles.fixtureBtnText}>{t('Sample (EXIF GPS)')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.fixtureBtn}
                    onPress={handleLoadPlainFixturePhoto}
                  >
                    <Text style={styles.fixtureBtnText}>{t('Sample (No GPS)')}</Text>
                  </Pressable>
                </View>

                {fileName ? (
                  <Text style={styles.fileSelected} numberOfLines={1}>
                    {t(`Selected: ${fileName}`)}
                  </Text>
                ) : null}
              </View>

              {/* 2. Supporting Videos & Extra Site Photos */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('2. Extra Media (Optional)')}</Text>
                <Text style={styles.metaLabel}>
                  {t('Attach outcrop videos or extra angles (up to 5).')}
                </Text>
                <View style={styles.pickerRow}>
                  {Platform.OS === 'web' && (
                    <Pressable
                      accessibilityRole="button"
                      style={styles.fixtureBtn}
                      onPress={() => triggerWebFilePicker('supporting')}
                    >
                      <Text style={styles.fixtureBtnText}>{t('+ Photo / Video')}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    style={styles.fixtureBtn}
                    onPress={handleAttachSupportingVideoFixture}
                  >
                    <Text style={styles.fixtureBtnText}>{t('+ Sample Video')}</Text>
                  </Pressable>
                </View>

                {supportingMedia.length > 0 && (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    {supportingMedia.map((item, idx) => (
                      <View key={`${item.file_name}-${idx}`} style={styles.supportingRow}>
                        <Text style={styles.metaValue} numberOfLines={1}>
                          {t(item.mime_type.startsWith('video/') ? 'Video' : 'Photo')}:{' '}
                          {item.file_name || item.caption || t(`Media #${idx + 1}`)}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            setSupportingMedia((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Text style={styles.removeLink}>{t('Remove')}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* 3. Geological Sampling Context */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('3. Context')}</Text>
                <View style={styles.pickerRow}>
                  {SPECIMEN_CONTEXT_OPTIONS.map((opt) => {
                    const active = specimenContext === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        onPress={() => setSpecimenContext(opt.value)}
                        style={[styles.contextBtn, active && styles.contextBtnActive]}
                      >
                        <Text style={[styles.contextBtnText, active && styles.contextBtnTextActive]}>
                          {t(opt.label)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.pickerRow}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: hasScaleReference }}
                    onPress={() => setHasScaleReference((v) => !v)}
                    style={[styles.contextBtn, hasScaleReference && styles.contextBtnActive]}
                  >
                    <Text
                      style={[
                        styles.contextBtnText,
                        hasScaleReference && styles.contextBtnTextActive,
                      ]}
                    >
                      {t(hasScaleReference ? '✓ Scale in photo' : 'Scale in photo')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: hasFreshSurface }}
                    onPress={() => setHasFreshSurface((v) => !v)}
                    style={[styles.contextBtn, hasFreshSurface && styles.contextBtnActive]}
                  >
                    <Text
                      style={[
                        styles.contextBtnText,
                        hasFreshSurface && styles.contextBtnTextActive,
                      ]}
                    >
                      {t(hasFreshSurface ? '✓ Fresh surface' : 'Fresh surface')}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Observation Title & Field Notes */}
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('Title (optional)')}</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  placeholder={t('e.g. Musanze Outcrop')}
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  maxLength={100}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('Field notes (optional)')}</Text>
                <TextInput
                  value={caption}
                  onChangeText={setCaption}
                  placeholder={t('Bedding, grain size, surrounding slope...')}
                  placeholderTextColor={colors.muted}
                  style={[styles.input, styles.textArea]}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                />
              </View>

              {/* 4. Location Recovery */}
              <View style={styles.field}>
                <View style={styles.gpsHeaderRow}>
                  <Text style={styles.fieldLabel}>{t('4. Location')}</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleDetectGps}
                    disabled={locLoading}
                    style={styles.gpsMiniBtn}
                  >
                    <Text style={styles.gpsMiniBtnText}>
                      {t(locLoading ? 'Reading…' : 'Live GPS')}
                    </Text>
                  </Pressable>
                </View>

                {statusBanner && (
                  <View style={styles.statusInfoBox}>
                    <Text style={styles.statusInfoText}>{statusBanner}</Text>
                  </View>
                )}

                {liveGpsMismatchKm !== null && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>
                      {t(`Live GPS is ${liveGpsMismatchKm.toFixed(1)} km from photo EXIF.`)}
                    </Text>
                    {exifInfo?.hasCoordinates && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={handleRestoreExifCoordinates}
                        style={[styles.secondaryBtn, { marginTop: 8 }]}
                      >
                        <Text style={styles.secondaryBtnText}>{t('Use Photo EXIF GPS')}</Text>
                      </Pressable>
                    )}
                  </View>
                )}

                <TextInput
                  value={district}
                  onChangeText={(txt) => {
                    setDistrict(txt);
                    if (locationSource !== 'exif') setLocationSource('manual');
                  }}
                  placeholder={t('District (e.g. Musanze, Karongi)')}
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  maxLength={40}
                />
              </View>

              <View style={[styles.row, layout.isCompactPhone && styles.rowStack]}>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>{t('Latitude')}</Text>
                  <TextInput
                    value={latitude}
                    onChangeText={(txt) => {
                      setLatitude(txt);
                      setLocationSource('manual');
                    }}
                    placeholder="-1.5008"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.field, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>{t('Longitude')}</Text>
                  <TextInput
                    value={longitude}
                    onChangeText={(txt) => {
                      setLongitude(txt);
                      setLocationSource('manual');
                    }}
                    placeholder="29.6342"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {errorMessage && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              <Pressable
                accessibilityRole="button"
                style={[styles.submitBtn, submitting && styles.btnDisabled]}
                onPress={() => {
                  void handleAnalyzeDraft();
                }}
                disabled={submitting}
              >
                {submitting ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={colors.surface} />
                    <Text style={styles.submitBtnText}>{t('Analyzing…')}</Text>
                  </View>
                ) : (
                  <Text style={styles.submitBtnText}>{t('Analyze & Preview')}</Text>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                style={styles.secondaryBtn}
                onPress={() => {
                  void handleSaveOfflineDraft();
                }}
              >
                <Text style={styles.secondaryBtnText}>{t('Save Offline Draft')}</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      backgroundColor: colors.surface,
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: '800',
      color: colors.ink,
    },
    closeBtn: {
      minHeight: 44,
      minWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    closeBtnText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.muted,
    },
    content: {
      width: '100%',
      alignSelf: 'center',
      paddingTop: spacing.md,
    },
    subtitle: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.muted,
      marginBottom: spacing.xs,
    },
    form: {
      gap: spacing.md,
    },
    field: {
      gap: 6,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.ink,
      flexShrink: 1,
    },
    gpsHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    gpsMiniBtn: {
      minHeight: 38,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.moss,
      borderWidth: 1,
      borderColor: colors.forest,
      justifyContent: 'center',
    },
    gpsMiniBtnText: {
      color: colors.forest,
      fontSize: 12,
      fontWeight: '700',
    },
    pickerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    contextBtn: {
      minHeight: 40,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    contextBtnActive: {
      borderColor: colors.forest,
      backgroundColor: colors.moss,
    },
    contextBtnText: {
      fontSize: 12,
      color: colors.ink,
      fontWeight: '600',
    },
    contextBtnTextActive: {
      color: colors.forest,
      fontWeight: '700',
    },
    supportingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      gap: 8,
    },
    removeLink: {
      color: colors.warning,
      fontSize: 12,
      fontWeight: '700',
    },
    offlineBox: {
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      gap: 8,
    },
    offlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    statusInfoBox: {
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.forest,
      backgroundColor: colors.moss,
    },
    statusInfoText: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.ink,
    },
    input: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.ink,
    },
    textArea: {
      minHeight: 74,
      textAlignVertical: 'top',
    },
    row: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    rowStack: {
      flexDirection: 'column',
    },
    fileSelected: {
      fontSize: 13,
      color: colors.forest,
      fontWeight: '700',
      marginTop: 2,
    },
    sampleBtn: {
      minHeight: 44,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.forest,
      justifyContent: 'center',
    },
    sampleBtnText: {
      color: colors.surface,
      fontWeight: '700',
      fontSize: 13,
    },
    fixtureBtn: {
      minHeight: 44,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.forest,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    fixtureBtnText: {
      color: colors.forest,
      fontWeight: '700',
      fontSize: 12,
    },
    submitBtn: {
      minHeight: 48,
      backgroundColor: colors.forest,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
    },
    btnDisabled: {
      opacity: 0.7,
    },
    submitBtnText: {
      color: colors.surface,
      fontSize: 15,
      fontWeight: '700',
      textAlign: 'center',
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    errorBox: {
      backgroundColor: colors.surfaceContainerHigh,
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    errorText: {
      color: colors.warning,
      fontSize: 13,
      lineHeight: 18,
    },
    resultBox: {
      backgroundColor: colors.surface,
      padding: spacing.md,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      gap: spacing.sm,
    },
    passportBadge: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
      gap: 8,
    },
    passportBadgeText: {
      fontWeight: '800',
      fontSize: 16,
      color: colors.forest,
    },
    evidenceStateBadge: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.earth,
    },
    resultTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.ink,
    },
    resultInterpretation: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.ink,
      marginBottom: 8,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.canvas,
      gap: 8,
    },
    metaLabel: {
      fontSize: 12,
      color: colors.muted,
      fontWeight: '600',
    },
    metaValue: {
      fontSize: 13,
      color: colors.ink,
      fontWeight: '700',
      flexShrink: 1,
    },
    detailSection: {
      marginTop: 6,
      gap: 4,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.ink,
    },
    bulletItem: {
      fontSize: 13,
      color: colors.muted,
      lineHeight: 18,
    },
    safetyBox: {
      marginTop: 8,
      padding: 10,
      borderRadius: 10,
      backgroundColor: colors.surfaceContainerHigh,
    },
    safetyTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.warning,
      marginBottom: 2,
    },
    safetyText: {
      fontSize: 12,
      color: colors.ink,
      lineHeight: 16,
    },
    pinCard: {
      marginTop: 10,
      padding: spacing.md,
      borderRadius: 14,
      backgroundColor: colors.moss,
      borderWidth: 1,
      borderColor: colors.forest,
      gap: 10,
    },
    pinCardTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.primaryPressed,
    },
    pinCardSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.ink,
    },
    pinDecisionGrid: {
      gap: 8,
      marginTop: 4,
    },
    privateBtn: {
      minHeight: 44,
      backgroundColor: colors.surface,
      paddingVertical: 11,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.muted,
    },
    privateBtnText: {
      color: colors.muted,
      fontSize: 13,
      fontWeight: '700',
    },
    disclaimerText: {
      fontSize: 11,
      color: colors.muted,
      lineHeight: 15,
      marginTop: 8,
      fontStyle: 'italic',
    },
    buttonGroup: {
      gap: 10,
      marginTop: 12,
    },
    primaryBtn: {
      minHeight: 46,
      backgroundColor: colors.forest,
      paddingVertical: 13,
      paddingHorizontal: 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      color: colors.surface,
      fontSize: 14,
      fontWeight: '700',
      textAlign: 'center',
    },
    secondaryBtn: {
      minHeight: 46,
      backgroundColor: colors.canvas,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.line,
    },
    secondaryBtnText: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
}
