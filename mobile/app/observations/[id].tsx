<<<<<<< HEAD
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthProvider';
import { AsyncPanel } from '../../components/AsyncPanel';
import { ComparePassportsModal } from '../../components/ComparePassportsModal';
import { ObservationImage } from '../../components/ObservationImage';
import { ReportContentModal, type ReportTarget } from '../../components/ReportContentModal';
import { Eyebrow, Screen, ScreenTitle } from '../../components/Screen';
import {
  useNearbyObservations,
  useObservation,
  useObservationComments,
  usePostDetail,
  useSimilarObservations,
} from '../../hooks/useObservations';
import {
  addPostMedia,
  answerPostQuestion,
  createObservationComment,
  removePostMedia,
  updateMyPost,
  updatePostAttachmentDownload,
} from '../../services/api';
import { getContributorToken } from '../../services/contributorToken';
import { recordMobileHistory } from '../../services/history';
import { radius, spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import type {
  LocationPrivacyLevel,
  PostQuestion,
  PublicComment,
  PublicMediaItem,
} from '../../types/api';
import { nearestRwandaDistrict } from '../../utils/exifExtractor';
import { useAppLanguage } from '../../utils/language';
import { safeMediaUrl } from '../../utils/media';
import { observationDetailRoute } from '../../utils/observationNavigation';
import { useResponsiveLayout } from '../../utils/responsive';
import { userFacingError } from '../../utils/userFacingError';

const RWANDA_DISTRICTS = [
  'Bugesera', 'Burera', 'Gakenke', 'Gasabo', 'Gatsibo', 'Gicumbi',
  'Gisagara', 'Huye', 'Kamonyi', 'Karongi', 'Kayonza', 'Kicukiro',
  'Kirehe', 'Muhanga', 'Musanze', 'Ngoma', 'Ngororero', 'Nyabihu',
  'Nyagatare', 'Nyamagabe', 'Nyamasheke', 'Nyanza', 'Nyarugenge', 'Nyaruguru',
  'Rubavu', 'Ruhango', 'Rulindo', 'Rusizi', 'Rutsiro', 'Rwamagana',
] as const;

const PRECISION_OPTIONS: Array<{ value: LocationPrivacyLevel; label: string }> = [
  { value: 'exact', label: 'Exact' },
  { value: 'approximate', label: 'Approximate (~2 km)' },
  { value: 'district', label: 'District Only' },
  { value: 'private', label: 'Private (Unpinned)' },
];

interface WebGeolocationLike {
  getCurrentPosition: (
    success: (pos: { coords: { latitude: number; longitude: number } }) => void,
    error: () => void,
    options?: { enableHighAccuracy?: boolean; timeout?: number }
  ) => void;
}

export default function ObservationDetailScreen() {
  const { colors } = useAppTheme();
  const { language, t } = useAppLanguage();
  const dateLocale = language === 'fr' ? 'fr-FR' : 'en-US';
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const passportParam = id ?? '';
  const auth = useAuth();
  const queryClient = useQueryClient();

  const [contributorToken, setContributorToken] = useState<string | null>(null);
  useEffect(() => {
    void getContributorToken()
      .then((tok) => setContributorToken(tok))
      .catch(() => undefined);
  }, []);

  const postQuery = usePostDetail(passportParam, auth.token, contributorToken);
  const publicQuery = useObservation(passportParam);
  const post = postQuery.data;
  const fallbackObservation = publicQuery.data;

  const activePassportId = post?.passport_id ?? fallbackObservation?.passport_id ?? '';
  const isPublicRecord = post ? post.is_public : Boolean(fallbackObservation);
  const isOwner = Boolean(post?.viewer_is_owner);

  const comments = useObservationComments(activePassportId);
  const nearby = useNearbyObservations(activePassportId, isPublicRecord);
  const similar = useSimilarObservations(activePassportId, isPublicRecord);

  const [selectedMediaIndex, setSelectedMediaIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareTargetB, setCompareTargetB] = useState('');
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  // Threaded discussion state
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<PublicComment | null>(null);
  const [commentError, setCommentError] = useState('');

  // Owner management state
  const [ownerPanelOpen, setOwnerPanelOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editReport, setEditReport] = useState('');
  const [editDistrict, setEditDistrict] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');
  const [editPrecision, setEditPrecision] = useState<LocationPrivacyLevel>('approximate');
  const [ownerFeedback, setOwnerFeedback] = useState('');
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!post) return;
    setEditTitle(post.title || '');
    setEditReport(post.user_report || '');
    setEditDistrict(post.location.district || '');
    setEditAddress(post.location.address || '');
    setEditLat(post.location.latitude !== null ? String(post.location.latitude) : '');
    setEditLng(post.location.longitude !== null ? String(post.location.longitude) : '');
    setEditPrecision(post.location.precision);
  }, [post]);

  useEffect(() => {
    setSelectedMediaIndex(0);
  }, [activePassportId]);

  useEffect(() => {
    if (post) {
      void recordMobileHistory({
        kind: 'observation',
        refId: post.passport_id,
        title: post.title || post.passport_id,
        subtitle: `${t(post.observation_category)} · ${
          post.location.district || t(post.is_public ? 'Public record' : 'Private record')
        }`,
      });
    } else if (fallbackObservation) {
      void recordMobileHistory({
        kind: 'observation',
        refId: fallbackObservation.passport_id,
        title:
          fallbackObservation.post_title ||
          fallbackObservation.possible_name ||
          fallbackObservation.passport_id,
        subtitle: `${t(fallbackObservation.observation_category)} · ${
          fallbackObservation.district || t('Public record')
        }`,
      });
    }
  }, [post, fallbackObservation, t]);

  const invalidatePostQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['post-detail', activePassportId] }),
      queryClient.invalidateQueries({ queryKey: ['observation', activePassportId] }),
      queryClient.invalidateQueries({ queryKey: ['observations'] }),
      queryClient.invalidateQueries({ queryKey: ['map', 'observations'] }),
      queryClient.invalidateQueries({ queryKey: ['account', 'observations'] }),
    ]);
  };

  const updatePostMutation = useMutation({
    mutationFn: async (patch: Parameters<typeof updateMyPost>[1]) =>
      updateMyPost(activePassportId, patch, auth.token, undefined, contributorToken),
    onSuccess: async () => {
      setOwnerFeedback(t('Observation settings updated.'));
      await invalidatePostQueries();
    },
    onError: (err) => setOwnerFeedback(userFacingError(err)),
  });

  const answerQuestionMutation = useMutation({
    mutationFn: async ({ questionId, answer }: { questionId: string; answer: string }) =>
      answerPostQuestion(
        activePassportId,
        questionId,
        answer,
        auth.token,
        undefined,
        contributorToken
      ),
    onSuccess: async (_, vars) => {
      setQuestionDrafts((prev) => ({ ...prev, [vars.questionId]: '' }));
      await invalidatePostQueries();
    },
    onError: (err) => setOwnerFeedback(userFacingError(err)),
  });

  const addMediaMutation = useMutation({
    mutationFn: async (input: {
      content_base64: string;
      mime_type?: string;
      caption?: string;
      role?: string;
    }) => addPostMedia(activePassportId, input, auth.token, undefined, contributorToken),
    onSuccess: async () => {
      setOwnerFeedback(t('Supporting media attached.'));
      await invalidatePostQueries();
    },
    onError: (err) => setOwnerFeedback(userFacingError(err)),
  });

  const removeMediaMutation = useMutation({
    mutationFn: async (mediaId: string) =>
      removePostMedia(activePassportId, mediaId, auth.token, undefined, contributorToken),
    onSuccess: async () => {
      setSelectedMediaIndex(0);
      setOwnerFeedback(t('Media item removed.'));
      await invalidatePostQueries();
    },
    onError: (err) => setOwnerFeedback(userFacingError(err)),
  });

  const toggleAttachmentDownloadMutation = useMutation({
    mutationFn: async ({
      attachmentId,
      allowDownload,
    }: {
      attachmentId: string;
      allowDownload: boolean;
    }) => {
      if (!auth.token) throw new Error(t('Sign in to update attachment download permissions.'));
      return updatePostAttachmentDownload(
        activePassportId,
        attachmentId,
        allowDownload,
        auth.token
      );
    },
    onSuccess: async () => {
      await invalidatePostQueries();
    },
    onError: (err) => setOwnerFeedback(userFacingError(err)),
  });

  const commentMutation = useMutation({
    mutationFn: async ({ text, parentId }: { text: string; parentId?: string }) => {
      if (!auth.token || !activePassportId) throw new Error(t('Sign in to comment.'));
      return createObservationComment(activePassportId, text, auth.token, parentId);
    },
    onSuccess: async () => {
      setCommentText('');
      setReplyTo(null);
      setCommentError('');
      await queryClient.invalidateQueries({ queryKey: ['observation-comments', activePassportId] });
    },
    onError: (err) => setCommentError(userFacingError(err)),
  });

  const handlePickSupportingFile = () => {
    const g = globalThis as unknown as {
      document?: {
        createElement: (tag: string) => {
          type: string;
          accept: string;
          onchange: ((ev: { target: { files?: ArrayLike<Blob & { name: string; type: string; size: number }> | null } }) => void) | null;
          click: () => void;
        };
      };
      FileReader?: new () => {
        result: string | ArrayBuffer | null;
        onload: (() => void) | null;
        readAsDataURL: (b: Blob) => void;
      };
    };

    if (Platform.OS === 'web' && g.document && g.FileReader) {
      const input = g.document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime';
      input.onchange = (ev) => {
        const file = ev.target.files?.[0];
        if (!file || !g.FileReader) return;
        if (file.size > 10 * 1024 * 1024) {
          setOwnerFeedback(t('File exceeds 10 MB limit.'));
          return;
        }
        const reader = new g.FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            const b64 = reader.result.includes(',')
              ? reader.result.slice(reader.result.indexOf(',') + 1)
              : reader.result;
            addMediaMutation.mutate({
              content_base64: b64,
              mime_type: file.type || 'image/jpeg',
              caption: file.name,
              role: file.type.startsWith('video/') ? 'video' : 'field',
            });
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    setOwnerFeedback(t('Use Submit Field Photo from the menu to capture new device camera files.'));
  };

  const handleUseLiveGpsForEdit = () => {
    const nav = (globalThis as unknown as { navigator?: { geolocation?: WebGeolocationLike } })
      .navigator;
    if (!nav?.geolocation) {
      setOwnerFeedback(t('Live GPS unavailable in this environment.'));
      return;
    }
    nav.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setEditLat(lat.toFixed(6));
        setEditLng(lng.toFixed(6));
        const inferred = nearestRwandaDistrict(lat, lng);
        if (inferred) setEditDistrict(inferred);
        setOwnerFeedback(t('Loaded live GPS coordinates into form.'));
      },
      () => setOwnerFeedback(t('Could not read device GPS.')),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const isLoading = !post && !fallbackObservation && (postQuery.isLoading || publicQuery.isLoading);
  const loadError = !post && !fallbackObservation ? (postQuery.error ?? publicQuery.error) : null;
  const isEmpty = !isLoading && !post && !fallbackObservation;

  const title = post
    ? post.title || post.ai.primary_interpretation || t('Geological observation')
    : fallbackObservation?.post_title ||
      fallbackObservation?.possible_name ||
      fallbackObservation?.observation_subcategory ||
      t('Geological observation');

  const categorySubtitle = post
    ? `${t(post.observation_category.replace(/_/g, ' '))}${
        post.observation_subcategory ? ` · ${t(post.observation_subcategory.replace(/_/g, ' '))}` : ''
      }`
    : `${t((fallbackObservation?.observation_category ?? '').replace(/_/g, ' '))}${
        fallbackObservation?.observation_subcategory
          ? ` · ${t(fallbackObservation.observation_subcategory.replace(/_/g, ' '))}`
          : ''
      }`;

  const mediaItems: PublicMediaItem[] = useMemo(() => {
    if (post && post.media.length > 0) return post.media;
    if (fallbackObservation?.primary_media_url) {
      return [
        {
          media_id: 'primary',
          kind: 'image',
          role: 'primary',
          caption: null,
          mime_type: 'image/jpeg',
          sort_order: 0,
          url: fallbackObservation.primary_media_url,
          poster_url: null,
          available: true,
          is_demo: Boolean(fallbackObservation.is_demo),
          demo_note: null,
          created_at: fallbackObservation.created_at,
        },
      ];
    }
    return [];
  }, [post, fallbackObservation]);

  const activeMedia = mediaItems[selectedMediaIndex] ?? mediaItems[0] ?? null;

  const latVal = post?.location.latitude ?? fallbackObservation?.latitude ?? null;
  const lngVal = post?.location.longitude ?? fallbackObservation?.longitude ?? null;
  const hasCoordinates = typeof latVal === 'number' && typeof lngVal === 'number';

  const districtVal = post?.location.district ?? fallbackObservation?.district ?? null;
  const sectorVal = post?.location.sector ?? fallbackObservation?.sector ?? null;
  const cellVal = post?.location.cell ?? null;
  const villageVal = post?.location.village ?? null;
  const addressVal = post?.location.address ?? null;
  const precisionVal = post?.location.precision ?? fallbackObservation?.location_precision ?? 'private';

  const evidenceState =
    post?.ai.evidence_state ?? fallbackObservation?.evidence_state ?? 'ai_assisted';
  const confidenceLabel = post?.ai.confidence ?? fallbackObservation?.confidence ?? 'moderate';
  const confidenceScore =
    post?.ai.confidence_score ?? fallbackObservation?.confidence_score ?? 0;

  const interpretation =
    post?.ai.primary_interpretation ?? fallbackObservation?.primary_interpretation ?? null;
  const geologicalContext = fallbackObservation?.geological_context ?? null;
  const observedFeatures =
    post?.ai.observed_features ?? fallbackObservation?.observed_features ?? [];
  const diagnosticFeatures =
    post?.ai.diagnostic_features ?? fallbackObservation?.diagnostic_features ?? [];
  const reasoning = post?.ai.reasoning ?? fallbackObservation?.reasoning ?? '';
  const alternativePossibilities = post?.ai.alternative_possibilities ?? [];
  const uncertainties = post?.ai.uncertainties ?? fallbackObservation?.uncertainties ?? [];
  const limitations = post?.ai.limitations ?? fallbackObservation?.limitations ?? [];
  const nextSteps =
    post?.ai.recommended_next_steps ?? fallbackObservation?.recommended_next_steps ?? [];
  const safetyNote = post?.ai.safety_note ?? fallbackObservation?.safety_note ?? '';
  const disclaimer =
    (post?.ai.disclaimer ? t(post.ai.disclaimer) : '') ||
    t('Preliminary AI reading — not confirmed without expert review.');

  return (
    <Screen includeTopInset={false} includeBottomInset keyboardAvoiding>
      <AsyncPanel
        isLoading={isLoading}
        error={loadError}
        isEmpty={isEmpty}
        onRetry={() => {
          void postQuery.refetch();
          void publicQuery.refetch();
        }}
      />

      {activePassportId ? (
        <View style={styles.container}>
          {/* Header Metadata */}
          <View style={styles.header}>
            <Eyebrow>
              {activePassportId} · {t(isPublicRecord ? 'Public Record' : 'Private Draft')} ·{' '}
              {t(evidenceState.replace(/_/g, ' '))}
            </Eyebrow>
            <ScreenTitle subtitle={categorySubtitle}>{title}</ScreenTitle>
            <Text style={styles.metaSubline}>
              {t(`Confidence: ${confidenceLabel} (${Math.round(confidenceScore * 100)}%)`)}
              {post?.owner?.display_name ? ` · ${t(`Shared by ${post.owner.display_name}`)}` : ''}
              {post?.created_at || fallbackObservation?.created_at
                ? ` · ${new Date(
                    post?.created_at ?? fallbackObservation!.created_at
                  ).toLocaleDateString(dateLocale)}`
                : ''}
            </Text>
          </View>

          {/* Action Row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actionRow}
          >
            {hasCoordinates && (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/map',
                    params: {
                      lat: String(latVal),
                      lng: String(lngVal),
                      label: title,
                      passportId: activePassportId,
                    },
                  })
                }
                style={[styles.actionBtn, styles.actionBtnPrimary]}
              >
                <Ionicons name="navigate" size={16} color={colors.onPrimary} />
                <Text style={styles.actionBtnPrimaryText}>{t('Navigate')}</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                setCompareTargetB('');
                setCompareOpen(true);
              }}
              style={styles.actionBtn}
            >
              <Ionicons name="git-compare-outline" size={17} color={colors.primary} />
              <Text style={styles.actionBtnText}>{t('Compare')}</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/chat',
                  params: { passportId: activePassportId },
                })
              }
              style={styles.actionBtn}
            >
              <Ionicons name="chatbubbles-outline" size={17} color={colors.primary} />
              <Text style={styles.actionBtnText}>{t('Ask GeoAI')}</Text>
            </Pressable>
            {isOwner && (
              <Pressable
                onPress={() => setOwnerPanelOpen((v) => !v)}
                style={styles.actionBtn}
              >
                <Ionicons name="create-outline" size={17} color={colors.primary} />
                <Text style={styles.actionBtnText}>
                  {t(ownerPanelOpen ? 'Done' : 'Edit')}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() =>
                setReportTarget({
                  targetType: 'observation',
                  targetId: activePassportId,
                  label: title,
                  observationPassportId: activePassportId,
                })
              }
              style={styles.actionBtn}
            >
              <Ionicons name="flag-outline" size={17} color={colors.onSurfaceVariant} />
              <Text style={[styles.actionBtnText, { color: colors.onSurfaceVariant }]}>
                {t('Report')}
              </Text>
            </Pressable>
          </ScrollView>

          {/* Owner Management Panel */}
          {isOwner && ownerPanelOpen && (
            <DetailSection
              title={t('Manage Your Observation')}
              icon="options-outline"
              colors={colors}
              styles={styles}
            >
              {ownerFeedback ? (
                <Text style={styles.feedbackBanner}>{ownerFeedback}</Text>
              ) : null}

              <View style={styles.ownerQuickRow}>
                <Pressable
                  disabled={updatePostMutation.isPending}
                  onPress={() => updatePostMutation.mutate({ is_public: !isPublicRecord })}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>
                    {t(isPublicRecord ? 'Make Private' : 'Publish Publicly')}
                  </Text>
                </Pressable>
                {precisionVal !== 'private' && (
                  <Pressable
                    disabled={updatePostMutation.isPending}
                    onPress={() =>
                      updatePostMutation.mutate({ location_precision: 'private' })
                    }
                    style={styles.secondaryBtn}
                  >
                    <Text style={[styles.secondaryBtnText, { color: colors.danger }]}>
                      {t('Remove Public Pin')}
                    </Text>
                  </Pressable>
                )}
              </View>

              <Text style={styles.fieldLabel}>{t('Public Location Precision')}</Text>
              <View style={styles.chipWrap}>
                {PRECISION_OPTIONS.map((opt) => {
                  const selected = editPrecision === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setEditPrecision(opt.value)}
                      style={[
                        styles.choiceChip,
                        selected && styles.choiceChipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceChipText,
                          selected && styles.choiceChipTextSelected,
                        ]}
                      >
                        {t(opt.label)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>{t('Observation Title')}</Text>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder={t('Observation title')}
                placeholderTextColor={colors.onSurfaceFaint}
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>{t('Field Notes / Report')}</Text>
              <TextInput
                value={editReport}
                onChangeText={setEditReport}
                placeholder={t('Bedding, grain size, scale object...')}
                placeholderTextColor={colors.onSurfaceFaint}
                multiline
                style={[styles.input, styles.textArea]}
              />

              <View style={styles.rowBetween}>
                <Text style={styles.fieldLabel}>{t('Rwanda District & Coordinates')}</Text>
                <Pressable onPress={handleUseLiveGpsForEdit}>
                  <Text style={styles.inlineLink}>{t('Use Live GPS')}</Text>
                </Pressable>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6 }}
              >
                {RWANDA_DISTRICTS.map((d) => {
                  const active = editDistrict === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setEditDistrict(active ? '' : d)}
                      style={[styles.choiceChip, active && styles.choiceChipSelected]}
                    >
                      <Text
                        style={[
                          styles.choiceChipText,
                          active && styles.choiceChipTextSelected,
                        ]}
                      >
                        {d}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={[styles.coordInputsRow, layout.isCompactPhone && styles.coordInputsStack]}>
                <TextInput
                  value={editLat}
                  onChangeText={setEditLat}
                  placeholder={t('Lat (-1.50)')}
                  placeholderTextColor={colors.onSurfaceFaint}
                  keyboardType="numeric"
                  style={[styles.input, { flex: 1 }]}
                />
                <TextInput
                  value={editLng}
                  onChangeText={setEditLng}
                  placeholder={t('Lng (29.63)')}
                  placeholderTextColor={colors.onSurfaceFaint}
                  keyboardType="numeric"
                  style={[styles.input, { flex: 1 }]}
                />
              </View>

              <TextInput
                value={editAddress}
                onChangeText={setEditAddress}
                placeholder={t('Landmark / locality note')}
                placeholderTextColor={colors.onSurfaceFaint}
                style={styles.input}
              />

              <View style={styles.ownerQuickRow}>
                <Pressable
                  disabled={updatePostMutation.isPending}
                  onPress={() => {
                    const parsedLat = editLat.trim() ? parseFloat(editLat.trim()) : null;
                    const parsedLng = editLng.trim() ? parseFloat(editLng.trim()) : null;
                    updatePostMutation.mutate({
                      post_title: editTitle.trim() || null,
                      user_report: editReport.trim() || null,
                      district: editDistrict.trim() || null,
                      location_text: editAddress.trim() || null,
                      location_precision: editPrecision,
                      latitude:
                        parsedLat !== null && Number.isFinite(parsedLat) ? parsedLat : null,
                      longitude:
                        parsedLng !== null && Number.isFinite(parsedLng) ? parsedLng : null,
                    });
                  }}
                  style={[styles.primaryBtn, { flex: 1 }]}
                >
                  <Text style={styles.primaryBtnText}>
                    {t(updatePostMutation.isPending ? 'Saving…' : 'Save Changes')}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={addMediaMutation.isPending}
                  onPress={handlePickSupportingFile}
                  style={styles.secondaryBtn}
                >
                  <Text style={styles.secondaryBtnText}>{t('+ Attach Media')}</Text>
                </Pressable>
              </View>
            </DetailSection>
          )}

          {/* Multi-Media Gallery */}
          <View style={styles.galleryBlock}>
            <Pressable
              disabled={!activeMedia?.url}
              onPress={() => {
                if (activeMedia?.kind === 'video' && activeMedia.url) {
                  const safe = safeMediaUrl(activeMedia.url);
                  if (safe) void Linking.openURL(safe);
                } else if (activeMedia?.url) {
                  setLightboxOpen(true);
                }
              }}
              style={styles.mediaCard}
            >
              {activeMedia?.kind === 'video' ? (
                <View style={styles.videoCardInner}>
                  <Ionicons name="videocam" size={40} color={colors.primary} />
                  <Text style={styles.videoTitle}>
                    {activeMedia.caption || t('Supporting Outcrop Video')}
                  </Text>
                  <Text style={styles.metaText}>
                    {activeMedia.mime_type} · {t('Tap to open video stream')}
                  </Text>
                </View>
              ) : (
                <ObservationImage
                  uri={activeMedia?.url ?? null}
                  label={t(`Field image for ${title}`)}
                />
              )}

              {mediaItems.length > 1 && (
                <View style={styles.mediaCounterBadge}>
                  <Text style={styles.mediaCounterText}>
                    {selectedMediaIndex + 1} / {mediaItems.length}
                  </Text>
                </View>
              )}
            </Pressable>

            {activeMedia?.caption ? (
              <Text style={styles.captionText}>{activeMedia.caption}</Text>
            ) : null}

            {mediaItems.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbRow}
              >
                {mediaItems.map((m, idx) => {
                  const active = idx === selectedMediaIndex;
                  return (
                    <View key={m.media_id} style={styles.thumbWrap}>
                      <Pressable
                        onPress={() => setSelectedMediaIndex(idx)}
                        style={[styles.thumbItem, active && styles.thumbItemActive]}
                      >
                        {m.kind === 'video' ? (
                          <View style={styles.thumbVideo}>
                            <Ionicons name="play-circle" size={22} color={colors.primary} />
                          </View>
                        ) : (
                          <ObservationImage uri={m.url} label={m.caption || t(`Media ${idx + 1}`)} />
                        )}
                      </Pressable>
                      {isOwner && m.media_id !== 'primary' && mediaItems.length > 1 && (
                        <Pressable
                          onPress={() => removeMediaMutation.mutate(m.media_id)}
                          style={styles.removeMediaBadge}
                        >
                          <Ionicons name="close" size={12} color={colors.onPrimary} />
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* Safety Alert if present */}
          {safetyNote ? (
            <View style={styles.safetyCard}>
              <Ionicons name="warning-outline" size={20} color={colors.warning} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.safetyTitle}>{t('Field Safety Note')}</Text>
                <Text style={styles.bodyText}>{safetyNote}</Text>
              </View>
            </View>
          ) : null}

          {/* Contributor Field Report */}
          {post?.user_report ? (
            <DetailSection
              title={t('Field Notes')}
              icon="reader-outline"
              colors={colors}
              styles={styles}
            >
              <Text style={styles.bodyText}>{post.user_report}</Text>
            </DetailSection>
          ) : null}

          {/* Location Section */}
          <DetailSection
            title={t('Location')}
            icon="location-outline"
            colors={colors}
            styles={styles}
          >
            <Text style={styles.bodyText}>
              {[villageVal, cellVal, sectorVal, districtVal].filter(Boolean).join(', ') ||
                t('District not specified')}
            </Text>
            {addressVal ? <Text style={styles.metaText}>{addressVal}</Text> : null}
            {hasCoordinates ? (
              <Text style={styles.metaText}>
                {latVal!.toFixed(5)}, {lngVal!.toFixed(5)} ({t(precisionVal)})
              </Text>
            ) : (
              <Text style={styles.metaText}>
                {t(`No public pin (${precisionVal}). Listed under Unlocated Posts.`)}
              </Text>
            )}
            {post?.location.privacy_note ? (
              <Text style={styles.mutedText}>{t(post.location.privacy_note)}</Text>
            ) : null}
            <View style={styles.ownerQuickRow}>
              {hasCoordinates ? (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/map',
                      params: {
                        lat: String(latVal),
                        lng: String(lngVal),
                        label: title,
                        passportId: activePassportId,
                      },
                    })
                  }
                  style={styles.secondaryBtn}
                >
                  <Ionicons name="navigate-outline" size={15} color={colors.primary} />
                  <Text style={styles.secondaryBtnText}>{t('Route')}</Text>
                </Pressable>
              ) : isOwner ? (
                <Pressable
                  onPress={() => setOwnerPanelOpen(true)}
                  style={styles.secondaryBtn}
                >
                  <Ionicons name="pin-outline" size={15} color={colors.primary} />
                  <Text style={styles.secondaryBtnText}>{t('Set Location')}</Text>
                </Pressable>
              ) : null}
            </View>
          </DetailSection>

          {/* Complete AI Preliminary Interpretation */}
          <DetailSection
            title={t('GeoAI Reading')}
            icon="bulb-outline"
            colors={colors}
            styles={styles}
          >
            <Text style={styles.bodyText}>
              {interpretation || t('Interpretation pending…')}
            </Text>

            {geologicalContext ? (
              <View style={styles.subBlock}>
                <Text style={styles.subBlockTitle}>{t('Geological Context')}</Text>
                <Text style={styles.bodyText}>{geologicalContext}</Text>
              </View>
            ) : null}

            {observedFeatures.length > 0 && (
              <View style={styles.subBlock}>
                <Text style={styles.subBlockTitle}>{t('Observed Features')}</Text>
                {observedFeatures.map((f, i) => (
                  <View key={`obs-${i}`} style={styles.featureItem}>
                    <Ionicons name="checkmark-circle-outline" size={16} color={colors.success} />
                    <Text style={[styles.bodyText, { flex: 1 }]}>{f}</Text>
                  </View>
                ))}
              </View>
            )}

            {diagnosticFeatures.length > 0 && (
              <View style={styles.subBlock}>
                <Text style={styles.subBlockTitle}>{t('Diagnostic Features')}</Text>
                {diagnosticFeatures.map((f, i) => (
                  <View key={`diag-${i}`} style={styles.featureItem}>
                    <Ionicons name="eye-outline" size={16} color={colors.primary} />
                    <Text style={[styles.bodyText, { flex: 1 }]}>{f}</Text>
                  </View>
                ))}
              </View>
            )}

            {reasoning ? (
              <View style={styles.subBlock}>
                <Text style={styles.subBlockTitle}>{t('Reasoning')}</Text>
                <Text style={styles.bodyText}>{reasoning}</Text>
              </View>
            ) : null}

            {alternativePossibilities.length > 0 && (
              <View style={styles.subBlock}>
                <Text style={styles.subBlockTitle}>{t('Alternative Possibilities')}</Text>
                {alternativePossibilities.map((alt, i) => (
                  <Text key={`alt-${i}`} style={styles.metaText}>
                    • {alt}
                  </Text>
                ))}
              </View>
            )}

            {(uncertainties.length > 0 || limitations.length > 0) && (
              <View style={styles.subBlock}>
                <Text style={styles.subBlockTitle}>{t('Uncertainties & Limitations')}</Text>
                {[...uncertainties, ...limitations].map((lim, i) => (
                  <Text key={`lim-${i}`} style={styles.metaText}>
                    • {lim}
                  </Text>
                ))}
              </View>
            )}

            {nextSteps.length > 0 && (
              <View style={styles.subBlock}>
                <Text style={styles.subBlockTitle}>{t('Recommended Field Checks')}</Text>
                {nextSteps.map((step, i) => (
                  <Text key={`step-${i}`} style={styles.bodyText}>
                    {i + 1}. {step}
                  </Text>
                ))}
              </View>
            )}

            <Text style={styles.disclaimerText}>{disclaimer}</Text>
          </DetailSection>

          {/* Layer 3 · Scientific Verification Status */}
          <DetailSection
            title={t('Verification')}
            icon="shield-checkmark-outline"
            colors={colors}
            styles={styles}
          >
            {evidenceState === 'scientifically_confirmed' ||
            evidenceState === 'expert_reviewed' ||
            fallbackObservation?.verification_status === 'expert_verified' ? (
              <Text style={styles.bodyText}>
                {t(
                  evidenceState === 'scientifically_confirmed'
                    ? 'Scientifically confirmed with documented evidence.'
                    : 'Reviewed by a verified geoscience specialist.'
                )}
              </Text>
            ) : (
              <Text style={styles.mutedText}>
                {t(`No formal expert review yet (${evidenceState.replace(/_/g, ' ')}).`)}
              </Text>
            )}
          </DetailSection>

          {/* AI Follow-up Questions */}
          {post && post.questions.length > 0 && (
            <DetailSection
              title={t('Clarifications')}
              icon="help-circle-outline"
              colors={colors}
              styles={styles}
            >
              {post.questions.map((q: PostQuestion) => (
                <View key={q.question_id} style={styles.questionBox}>
                  <Text style={styles.questionPrompt}>{q.question}</Text>
                  {q.answer ? (
                    <Text style={styles.questionAnswer}>{t(`Answer: ${q.answer}`)}</Text>
                  ) : isOwner ? (
                    <View style={styles.answerInputRow}>
                      <TextInput
                        value={questionDrafts[q.question_id] ?? ''}
                        onChangeText={(txt) =>
                          setQuestionDrafts((prev) => ({ ...prev, [q.question_id]: txt }))
                        }
                        placeholder={t('Answer from your field observation…')}
                        placeholderTextColor={colors.onSurfaceFaint}
                        style={[styles.input, { flex: 1 }]}
                      />
                      <Pressable
                        disabled={
                          !(questionDrafts[q.question_id] ?? '').trim() ||
                          answerQuestionMutation.isPending
                        }
                        onPress={() =>
                          answerQuestionMutation.mutate({
                            questionId: q.question_id,
                            answer: questionDrafts[q.question_id] ?? '',
                          })
                        }
                        style={styles.smallPrimaryBtn}
                      >
                        <Text style={styles.primaryBtnText}>{t('Reply')}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text style={styles.mutedText}>{t('Awaiting contributor response')}</Text>
                  )}
                </View>
              ))}
            </DetailSection>
          )}

          {/* Attachments */}
          {post && post.attachments.length > 0 && (
            <DetailSection
              title={t('Attachments')}
              icon="attach-outline"
              colors={colors}
              styles={styles}
            >
              {post.attachments.map((att) => (
                <View key={att.attachment_id} style={styles.attachmentRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subBlockTitle}>{att.title || att.filename}</Text>
                    <Text style={styles.metaText}>{att.mime_type}</Text>
                  </View>
                  {att.allow_download && (
                    <Pressable
                      onPress={() => {
                        const safe = safeMediaUrl(att.url);
                        if (safe) void Linking.openURL(safe);
                      }}
                      style={styles.secondaryBtn}
                    >
                      <Text style={styles.secondaryBtnText}>{t('Open')}</Text>
                    </Pressable>
                  )}
                  {isOwner && auth.token && (
                    <Pressable
                      onPress={() =>
                        toggleAttachmentDownloadMutation.mutate({
                          attachmentId: att.attachment_id,
                          allowDownload: !att.allow_download,
                        })
                      }
                      style={styles.secondaryBtn}
                    >
                      <Text style={styles.secondaryBtnText}>
                        {t(att.allow_download ? 'Lock' : 'Allow DL')}
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </DetailSection>
          )}

          {/* Related Observations (Same Place, Nearby, Similar) */}
          {((post?.same_place.items.length ?? 0) > 0 ||
            (nearby.data?.items.length ?? 0) > 0 ||
            (similar.data?.items.length ?? 0) > 0) && (
            <DetailSection
              title={t('Related Records')}
              icon="compass-outline"
              colors={colors}
              styles={styles}
            >
              {(post?.same_place.items.length ?? 0) > 0 && (
                <View style={styles.subBlock}>
                  <Text style={styles.subBlockTitle}>{t('Same locality')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {post!.same_place.items.map((rel) => (
                      <Pressable
                        key={rel.passport_id}
                        onPress={() => router.push(observationDetailRoute(rel.passport_id))}
                        style={styles.relatedCard}
                      >
                        <Text numberOfLines={1} style={styles.relatedTitle}>
                          {rel.title || rel.passport_id}
                        </Text>
                        <Text style={styles.metaText}>
                          {rel.passport_id} · {t(rel.observation_category)}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {(nearby.data?.items.length ?? 0) > 0 && (
                <View style={styles.subBlock}>
                  <Text style={styles.subBlockTitle}>{t('Nearby within 25 km')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {nearby.data!.items.slice(0, 8).map((rel) => (
                      <View key={rel.passport_id} style={styles.relatedCard}>
                        <Pressable
                          onPress={() => router.push(observationDetailRoute(rel.passport_id))}
                        >
                          <Text numberOfLines={1} style={styles.relatedTitle}>
                            {rel.possible_name || t(rel.observation_category)}
                          </Text>
                          <Text style={styles.metaText}>
                            {rel.passport_id}
                            {rel.distance_km !== null ? ` · ${rel.distance_km} km` : ''}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setCompareTargetB(rel.passport_id);
                            setCompareOpen(true);
                          }}
                        >
                          <Text style={styles.inlineLink}>{t('Compare')}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}

              {(similar.data?.items.length ?? 0) > 0 && (
                <View style={styles.subBlock}>
                  <Text style={styles.subBlockTitle}>{t('Similar features')}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {similar.data!.items.slice(0, 8).map((rel) => (
                      <View key={rel.passport_id} style={styles.relatedCard}>
                        <Pressable
                          onPress={() => router.push(observationDetailRoute(rel.passport_id))}
                        >
                          <Text numberOfLines={1} style={styles.relatedTitle}>
                            {rel.possible_name ||
                              t(rel.observation_subcategory || rel.observation_category)}
                          </Text>
                          <Text style={styles.metaText}>
                            {rel.passport_id}
                            {rel.district ? ` · ${rel.district}` : ''}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setCompareTargetB(rel.passport_id);
                            setCompareOpen(true);
                          }}
                        >
                          <Text style={styles.inlineLink}>{t('Compare')}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </DetailSection>
          )}

          {/* Threaded Community Discussion */}
          <DetailSection
            title={t(`Discussion (${comments.data?.total ?? 0})`)}
            icon="chatbubbles-outline"
            colors={colors}
            styles={styles}
          >
            {(comments.data?.data ?? []).length === 0 ? (
              <Text style={styles.mutedText}>{t('No comments yet.')}</Text>
            ) : (
              (comments.data?.data ?? []).map((item) => (
                <View key={item.comment_id} style={styles.commentItem}>
                  <View style={styles.commentHeader}>
                    <Text style={styles.commentAuthor}>
                      {item.author.display_name || item.author.public_user_id}
                    </Text>
                    <Text style={styles.commentDate}>
                      {new Date(item.created_at).toLocaleDateString(dateLocale)}
                    </Text>
                  </View>
                  <Text style={styles.commentBody}>{item.body}</Text>
                  <View style={styles.commentActionsRow}>
                    {auth.user && (
                      <Pressable onPress={() => setReplyTo(item)} hitSlop={8}>
                        <Text style={styles.inlineLink}>{t('Reply')}</Text>
                      </Pressable>
                    )}
                    <Pressable
                      hitSlop={8}
                      onPress={() =>
                        setReportTarget({
                          targetType: 'comment',
                          targetId: item.comment_id,
                          label: item.body.slice(0, 60),
                          observationPassportId: activePassportId,
                        })
                      }
                    >
                      <Text style={styles.metaText}>{t('Report')}</Text>
                    </Pressable>
                  </View>

                  {item.replies.length > 0 && (
                    <View style={styles.repliesList}>
                      {item.replies.map((rep) => (
                        <View key={rep.comment_id} style={styles.replyItem}>
                          <View style={styles.commentHeader}>
                            <Text style={styles.commentAuthor}>
                              {rep.author.display_name || rep.author.public_user_id}
                            </Text>
                            <Text style={styles.commentDate}>
                              {new Date(rep.created_at).toLocaleDateString(dateLocale)}
                            </Text>
                          </View>
                          <Text style={styles.commentBody}>{rep.body}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))
            )}

            {auth.user ? (
              <View style={styles.commentForm}>
                {replyTo && (
                  <View style={styles.replyBanner}>
                    <Text style={styles.metaText} numberOfLines={1}>
                      {t(`Replying to ${replyTo.author.display_name || replyTo.author.public_user_id}`)}
                    </Text>
                    <Pressable onPress={() => setReplyTo(null)}>
                      <Ionicons name="close-circle" size={18} color={colors.onSurfaceVariant} />
                    </Pressable>
                  </View>
                )}
                <TextInput
                  placeholder={t(replyTo ? 'Write a reply…' : 'Add a comment…')}
                  placeholderTextColor={colors.onSurfaceFaint}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  style={styles.commentInput}
                />
                <Text style={styles.mutedText}>
                  {t('Public comment — distinct from expert verification.')}
                </Text>
                {commentError ? <Text style={styles.feedbackBanner}>{commentError}</Text> : null}
                <Pressable
                  disabled={!commentText.trim() || commentMutation.isPending}
                  onPress={() =>
                    commentMutation.mutate({
                      text: commentText,
                      parentId: replyTo?.comment_id,
                    })
                  }
                  style={[
                    styles.primaryBtn,
                    (!commentText.trim() || commentMutation.isPending) && styles.disabled,
                  ]}
                >
                  <Text style={styles.primaryBtnText}>
                    {t(
                      commentMutation.isPending
                        ? 'Posting…'
                        : replyTo
                          ? 'Post Reply'
                          : 'Comment'
                    )}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => router.push('/(tabs)/profile')}>
                <Text style={styles.inlineLink}>{t('Sign in to comment →')}</Text>
              </Pressable>
            )}
          </DetailSection>

          {/* Fullscreen Image Lightbox Modal */}
          <Modal
            visible={lightboxOpen}
            transparent
            statusBarTranslucent
            animationType="fade"
            onRequestClose={() => setLightboxOpen(false)}
          >
            <View
              style={[
                styles.lightboxBackdrop,
                {
                  paddingTop: layout.modalHeaderTopPadding,
                  paddingBottom: layout.bottomSafePadding,
                  paddingLeft: layout.sideSafeLeft + layout.horizontalPadding,
                  paddingRight: layout.sideSafeRight + layout.horizontalPadding,
                },
              ]}
            >
              <View style={styles.lightboxHeader}>
                <Text style={styles.lightboxTitle} numberOfLines={1}>
                  {title} ({selectedMediaIndex + 1}/{mediaItems.length})
                </Text>
                <Pressable onPress={() => setLightboxOpen(false)} style={styles.lightboxClose}>
                  <Ionicons name="close" size={26} color="#ffffff" />
                </Pressable>
              </View>
              <View style={styles.lightboxBody}>
                <ObservationImage
                  uri={activeMedia?.url ?? null}
                  label={t(`Fullscreen ${title}`)}
                />
              </View>
            </View>
          </Modal>

          <ComparePassportsModal
            visible={compareOpen}
            initialPassportA={activePassportId}
            initialPassportB={compareTargetB}
            onClose={() => {
              setCompareOpen(false);
              setCompareTargetB('');
            }}
          />
          <ReportContentModal
            visible={Boolean(reportTarget)}
            target={reportTarget}
            onClose={() => setReportTarget(null)}
          />
        </View>
      ) : null}
    </Screen>
  );
}

function DetailSection({
  title,
  icon,
  fallbackIcon,
  colors,
  styles,
  children,
}: {
  title: string;
  icon: string;
  fallbackIcon?: keyof typeof Ionicons.glyphMap;
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  children: React.ReactNode;
}) {
  const resolvedIcon = (fallbackIcon ?? icon) as keyof typeof Ionicons.glyphMap;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={resolvedIcon} size={20} color={colors.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: { gap: spacing.lg, paddingBottom: spacing.xl },
    header: { gap: 4 },
    metaSubline: { fontSize: 12, color: colors.onSurfaceFaint, marginTop: 2 },
    actionRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      minHeight: 42,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      backgroundColor: colors.surface,
    },
    actionBtnPrimary: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    actionBtnPrimaryText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.onPrimary,
    },
    actionBtnText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    galleryBlock: { gap: 8 },
    mediaCard: {
      borderRadius: radius.l,
      overflow: 'hidden',
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      aspectRatio: 4 / 3,
    },
    videoCardInner: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
      gap: 8,
    },
    videoTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface, textAlign: 'center' },
    mediaCounterBadge: {
      position: 'absolute',
      bottom: 10,
      right: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.full,
      backgroundColor: 'rgba(0,0,0,0.65)',
    },
    mediaCounterText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
    captionText: { fontSize: 12, color: colors.onSurfaceVariant, paddingHorizontal: 4 },
    thumbRow: { gap: 8, paddingVertical: 2 },
    thumbWrap: { position: 'relative' },
    thumbItem: {
      width: 64,
      height: 64,
      borderRadius: radius.s,
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: colors.outlineSoft,
      backgroundColor: colors.surfaceContainerLow,
    },
    thumbItemActive: {
      borderColor: colors.primary,
    },
    thumbVideo: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainerHigh,
    },
    removeMediaBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    safetyCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: spacing.md,
      borderRadius: radius.l,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    safetyTitle: { fontSize: 14, fontWeight: '800', color: colors.warning },
    section: {
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      overflow: 'hidden',
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: spacing.md,
      backgroundColor: colors.surfaceContainer,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
    },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface },
    sectionContent: { padding: spacing.md, gap: 12 },
    subBlock: { gap: 6, paddingTop: 4 },
    subBlockTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    bodyText: { fontSize: 15, color: colors.onSurface, lineHeight: 22 },
    featureItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    metaText: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 19 },
    mutedText: { fontSize: 13, color: colors.onSurfaceFaint, fontStyle: 'italic' },
    disclaimerText: {
      fontSize: 12,
      color: colors.onSurfaceFaint,
      lineHeight: 18,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: colors.outlineSoft,
    },
    feedbackBanner: {
      padding: 10,
      borderRadius: radius.s,
      backgroundColor: colors.primaryContainer,
      color: colors.onPrimaryContainer,
      fontSize: 13,
      fontWeight: '600',
    },
    ownerQuickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    fieldLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.onSurfaceFaint,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    choiceChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radius.s,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      backgroundColor: colors.surfaceContainerLow,
    },
    choiceChipSelected: {
      backgroundColor: colors.primaryContainer,
      borderColor: colors.primary,
    },
    choiceChipText: { fontSize: 12, fontWeight: '600', color: colors.onSurface },
    choiceChipTextSelected: { color: colors.onPrimaryContainer, fontWeight: '700' },
    coordInputsRow: { flexDirection: 'row', gap: 8 },
    coordInputsStack: { flexDirection: 'column' },
    input: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      borderRadius: radius.m,
      paddingHorizontal: 12,
      fontSize: 14,
      color: colors.onSurface,
      backgroundColor: colors.surfaceContainerLow,
    },
    textArea: {
      minHeight: 80,
      paddingVertical: 10,
      textAlignVertical: 'top',
    },
    inlineLink: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    secondaryBtn: {
      height: 40,
      paddingHorizontal: 14,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outline,
      backgroundColor: colors.surfaceContainerLow,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    primaryBtn: {
      height: 44,
      paddingHorizontal: 18,
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smallPrimaryBtn: {
      height: 44,
      paddingHorizontal: 14,
      backgroundColor: colors.primary,
      borderRadius: radius.m,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 14 },
    disabled: { opacity: 0.5 },
    questionBox: {
      padding: 12,
      borderRadius: radius.m,
      backgroundColor: colors.surfaceContainerLow,
      gap: 6,
    },
    questionPrompt: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
    questionAnswer: { fontSize: 14, color: colors.primary, fontWeight: '600' },
    answerInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    attachmentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
    },
    relatedCard: {
      width: 176,
      padding: 12,
      borderRadius: radius.m,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      backgroundColor: colors.surfaceContainerLow,
      gap: 6,
    },
    relatedTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
    commentItem: {
      gap: 6,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
    },
    commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    commentAuthor: { fontSize: 13, fontWeight: '700', color: colors.primary },
    commentDate: { fontSize: 11, color: colors.onSurfaceFaint },
    commentBody: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
    commentActionsRow: { flexDirection: 'row', gap: 16, marginTop: 2 },
    repliesList: {
      marginLeft: 16,
      marginTop: 6,
      paddingLeft: 12,
      borderLeftWidth: 2,
      borderLeftColor: colors.outlineSoft,
      gap: 8,
    },
    replyItem: { gap: 2 },
    commentForm: { gap: 10, marginTop: 4 },
    replyBanner: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.s,
      backgroundColor: colors.primaryContainer,
    },
    commentInput: {
      minHeight: 80,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      borderRadius: radius.m,
      padding: 12,
      fontSize: 14,
      color: colors.onSurface,
      textAlignVertical: 'top',
      backgroundColor: colors.surfaceContainerLow,
    },
    lightboxBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      justifyContent: 'space-between',
    },
    lightboxHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    lightboxTitle: {
      flex: 1,
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
      marginRight: 12,
    },
    lightboxClose: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lightboxBody: {
      flex: 1,
      justifyContent: 'center',
    },
  });
}
=======
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AsyncPanel } from '../../components/AsyncPanel';
import { ObservationImage } from '../../components/ObservationImage';
import { Eyebrow, Screen, ScreenTitle } from '../../components/Screen';
import { useObservation } from '../../hooks/useObservations';
import { useObservationComments } from '../../hooks/useObservations';
import { spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError, createObservationComment } from '../../services/api';
import { userFacingError } from '../../utils/userFacingError';

export default function ObservationDetailScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useObservation(id ?? '');
  const observation = query.data;
  const comments = useObservationComments(observation?.passport_id ?? '');
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');
  const [commentFeedback, setCommentFeedback] = useState('');
  const commentMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!auth.token || !observation) throw new Error('Sign in to comment.');
      return createObservationComment(observation.passport_id, text, auth.token);
    },
    onSuccess: async (created) => {
      setCommentText('');
      setCommentFeedback(created.message);
      await queryClient.invalidateQueries({ queryKey: ['observation-comments', observation?.passport_id] });
    },
    onError: (error) => setCommentFeedback(userFacingError(error)),
  });
  useEffect(() => {
    if (commentMutation.error instanceof ApiError && commentMutation.error.kind === 'unauthorized') void auth.refreshSession();
  }, [commentMutation.error, auth.refreshSession]);
  return <Screen><AsyncPanel isLoading={query.isLoading} error={query.error} isEmpty={!observation} onRetry={() => { void query.refetch(); }} emptyTitle="Observation unavailable" emptyMessage="This observation was not found or is not public." />
    {observation ? <>
      <Eyebrow>{observation.passport_id}</Eyebrow><ScreenTitle subtitle={`${observation.observation_category}${observation.observation_subcategory ? ` · ${observation.observation_subcategory}` : ''}`}>{observation.post_title || observation.possible_name || observation.observation_subcategory || 'Geological observation'}</ScreenTitle>
      <ObservationImage uri={observation.primary_media_url} label={`Public image for ${observation.post_title || observation.passport_id}`} />
      <View style={styles.meta}><Text style={styles.metaText}>{observation.district || (observation.location_precision === 'private' ? 'Location kept private' : 'Location not provided')}</Text><Text style={styles.metaText}>{observation.verification_status === 'expert_verified' ? 'Expert reviewed' : 'Not expert verified'}</Text></View>
      {observation.evidence_state ? <Section title="Evidence status"><Text style={styles.body}>{observation.evidence_state.replaceAll('_', ' ')}</Text></Section> : null}
      {observation.primary_interpretation ? <Section title="Preliminary interpretation"><Text style={styles.body}>{observation.primary_interpretation}</Text></Section> : null}
      {observation.geological_context ? <Section title="Context"><Text style={styles.body}>{observation.geological_context}</Text></Section> : null}
      <Section title="What was observed">{observation.observed_features.length ? observation.observed_features.map((item, i) => <Text key={`${i}-${item}`} style={styles.bullet}>•  {item}</Text>) : <Text style={styles.body}>No feature notes were provided.</Text>}</Section>
      <Section title="Reasoning"><Text style={styles.body}>{observation.reasoning}</Text></Section>
      <Section title="Confidence"><Text style={styles.body}>{observation.confidence} ({Math.round(observation.confidence_score * 100)}%)</Text></Section>
      {observation.uncertainties?.length ? <Section title="Uncertainties">{observation.uncertainties.map((item, i) => <Text key={`${i}-${item}`} style={styles.bullet}>•  {item}</Text>)}</Section> : null}
      <Section title="Limitations">{observation.limitations.length ? observation.limitations.map((item, i) => <Text key={`${i}-${item}`} style={styles.bullet}>•  {item}</Text>) : <Text style={styles.body}>No limitations were listed in this record.</Text>}</Section>
      {observation.recommended_next_steps.length ? <Section title="Suggested next steps">{observation.recommended_next_steps.map((item, i) => <Text key={`${i}-${item}`} style={styles.bullet}>•  {item}</Text>)}</Section> : null}
      <View style={styles.warning}><Text style={styles.warningTitle}>AI-assisted, not scientific confirmation</Text><Text style={styles.body}>{observation.safety_note}</Text></View>
      <Section title="Community discussion">
        {comments.isLoading ? <Text accessibilityRole="progressbar" accessibilityLabel="Loading public comments" style={styles.body}>Loading public comments…</Text> : comments.error && !comments.data ? <View><Text style={styles.body}>Comments are unavailable right now.</Text><Pressable accessibilityRole="button" accessibilityLabel="Retry loading public comments" hitSlop={8} onPress={() => { void comments.refetch(); }} style={styles.commentRetry}><Text style={styles.commentLink}>Tap to retry</Text></Pressable></View> : comments.data?.data.length ? comments.data.data.map((comment) => <View key={comment.comment_id} style={styles.comment}><Text style={styles.commentAuthor}>{comment.author.display_name}{comment.author.is_demo ? ' · Demonstration record' : ''}</Text><Text style={styles.body}>{comment.body}</Text><Text style={styles.commentDate}>{new Date(comment.created_at).toLocaleDateString()}</Text>{comment.replies.map((reply) => <View key={reply.comment_id} style={styles.reply}><Text style={styles.commentAuthor}>{reply.author.display_name}</Text><Text style={styles.body}>{reply.body}</Text><Text style={styles.commentDate}>{new Date(reply.created_at).toLocaleDateString()}</Text></View>)}</View>) : <Text style={styles.body}>No public comments are available for this observation.</Text>}
        {auth.user && auth.token ? <View style={styles.commentForm}>
          <TextInput accessibilityLabel="Write a public comment" placeholder="Add a respectful observation note" placeholderTextColor={colors.muted} multiline maxLength={2000} value={commentText} onChangeText={setCommentText} style={styles.commentInput} editable={!commentMutation.isPending} />
          <Pressable accessibilityRole="button" accessibilityLabel="Post comment" disabled={!commentText.trim() || commentMutation.isPending} onPress={() => { commentMutation.mutate(commentText); }} style={[styles.commentSubmit, (!commentText.trim() || commentMutation.isPending) && styles.disabled]}>
            {commentMutation.isPending ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.commentSubmitText}>Post comment</Text>}
          </Pressable>
        </View> : <Text style={styles.commentNote}>Sign in from Profile with your WhatsApp verified account to post a comment. Browsing remains public.</Text>}
        {commentFeedback ? <Text accessibilityRole="alert" style={styles.commentNote}>{commentFeedback}</Text> : null}
        {!auth.user ? <Link href="/(tabs)/profile" asChild><Pressable accessibilityRole="button" accessibilityLabel="Open Profile to sign in" style={styles.commentRetry}><Text style={styles.commentLink}>Open Profile to sign in</Text></Pressable></Link> : null}
      </Section>
    </> : null}
  </Screen>;
}
function Section({ title, children }: React.PropsWithChildren<{ title: string }>) { const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]); return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>; }
function createStyles(colors: Palette) { return StyleSheet.create({ meta: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }, metaText: { color: colors.muted, fontSize: 12 }, section: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: spacing.md, gap: 9 }, sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' }, body: { color: colors.ink, lineHeight: 21, fontSize: 14 }, bullet: { color: colors.ink, lineHeight: 21, fontSize: 14 }, warning: { padding: spacing.md, backgroundColor: colors.warningBg, borderRadius: 16, gap: 8 }, warningTitle: { color: colors.warning, fontWeight: '800' }, comment: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 5 }, reply: { marginLeft: 14, paddingTop: 7, gap: 4 }, commentAuthor: { color: colors.forest, fontSize: 13, fontWeight: '700' }, commentDate: { color: colors.muted, fontSize: 11 }, commentNote: { color: colors.muted, fontSize: 12, lineHeight: 18 }, commentForm: { gap: 8 }, commentInput: { minHeight: 78, maxHeight: 160, borderWidth: 1, borderColor: colors.line, borderRadius: 12, color: colors.ink, padding: 12, textAlignVertical: 'top' }, commentSubmit: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.forest }, commentSubmitText: { color: colors.surface, fontWeight: '800' }, disabled: { opacity: 0.5 }, commentRetry: { minHeight: 44, justifyContent: 'center' }, commentLink: { color: colors.forest, fontWeight: '700' } }); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
