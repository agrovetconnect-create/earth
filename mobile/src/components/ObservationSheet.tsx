import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CornerDownRight,
  Download,
  Eye,
  EyeOff,
  FileText,
  Flag,
  Heart,
  HelpCircle,
  ImagePlus,
  Loader2,
  Lock,
  MapPin,
  Maximize2,
  MessageCircle,
  MoreVertical,
  MessageSquare,
  MessagesSquare,
  Navigation,
  Paperclip,
  Pencil,
  Share2,
  SendHorizontal,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  X,
  XCircle,
} from 'lucide-react-native';
import { colors, radius, spacing, type as typeScale } from '../lib/theme';
import { CATEGORY_COLORS, CATEGORY_COLOR_FALLBACK } from '../lib/theme';
import { formatDate, formatRelativeTime } from '../lib/format';
import { formatBytes, formatPassportId } from '../lib/format';
import { dataUrlToBase64, documentMimeType, fileToDataUrl } from '../lib/file';
import { useCommunityUser } from '../services/communityAuth';
import {
  addPostMedia,
  answerQuestion,
  createComment,
  fetchComments,
  fetchPost,
  reactToComment,
  removePostMedia,
  updateAttachmentDownload,
  updatePost,
  uploadPostAttachment,
  type UpdatePostPatch,
} from '../services/postsApi';
import type {
  CommunityPostDetail,
  PostQuestion,
  PublicComment,
  PublicMediaItem,
  PublicObservationAttachment,
  PublicUserIdentity,
} from '../types/communityPosts';
import { ReportDialog } from './ReportDialog';
import { PublicVisibilityNote } from './PublicVisibilityNote';

/**
 * The observation side card, ported from the web's `ObservationSideCard`.
 * A reader opens one observation: its photographs, the contributor's own
 * account, the interpretation produced from the evidence, the questions the
 * interpretation raised, and the public discussion underneath.
 */

/** The web shows two replies per comment before a "Show more" toggle. */
const MAX_VISIBLE_REPLIES = 2;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
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

/** The owner's location-privacy options, in the web's select order. */
const PRECISION_OPTIONS = ['exact', 'approximate', 'district', 'private'] as const;
const PRECISION_LABELS: Record<(typeof PRECISION_OPTIONS)[number], string> = {
  exact: 'Exact location',
  approximate: 'Approximate location',
  district: 'District only',
  private: 'Private — not shown on the map',
};

function categoryColor(category: string | null | undefined): string {
  if (!category) return CATEGORY_COLOR_FALLBACK;
  return (CATEGORY_COLORS as Record<string, string>)[category] ?? CATEGORY_COLOR_FALLBACK;
}

function categoryLabel(category: string | null | undefined): string {
  if (!category) return 'Observation';
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function initialsOf(identity: PublicUserIdentity | null): string {
  const name = identity?.display_name?.trim();
  if (name) {
    const parts = name.split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join('');
  }
  const pid = identity?.public_user_id?.replace(/^ET-?/i, '') ?? '';
  return pid.slice(0, 2).toUpperCase() || 'ET';
}

function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:|file:)/i.test(url)) return url;
  const base =
    process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/api\/?$/, '').replace(/\/+$/, '') ?? '';
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

interface ReportTarget {
  targetType: 'observation' | 'question' | 'comment' | 'media';
  targetId: string;
  observationPassportId: string | null;
  label: string;
}

export function ObservationSheet({
  passportId,
  onClose,
}: {
  passportId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const viewer = useCommunityUser();

  const [post, setPost] = useState<CommunityPostDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeMedia, setActiveMedia] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyParent, setReplyParent] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [reportEdit, setReportEdit] = useState<string | null>(null);
  const [reportEditing, setReportEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishPending, setPublishPending] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [stagedCommentImage, setStagedCommentImage] = useState<{
    uri: string;
    base64: string;
    mimeType: string;
  } | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<PublicObservationAttachment | null>(null);
  // Community location proposal & verification state, as on the web.
  const [suggestLocationOpen, setSuggestLocationOpen] = useState(false);
  const [proposedPlace, setProposedPlace] = useState('');
  const [proposedLat, setProposedLat] = useState('');
  const [proposedLng, setProposedLng] = useState('');
  const [confirmCount, setConfirmCount] = useState(2);
  const [locationSuccess, setLocationSuccess] = useState<string | null>(null);
  // Owner precision select and detail-edit drafts, as on the web.
  const [precisionSelectOpen, setPrecisionSelectOpen] = useState(false);
  const [isEditingOwnerDetails, setIsEditingOwnerDetails] = useState(false);
  const [ownerTitleDraft, setOwnerTitleDraft] = useState('');
  const [ownerReportDraft, setOwnerReportDraft] = useState('');
  const [ownerDistrictDraft, setOwnerDistrictDraft] = useState('');
  const [ownerLatDraft, setOwnerLatDraft] = useState('');
  const [ownerLngDraft, setOwnerLngDraft] = useState('');
  const [ownerAddressDraft, setOwnerAddressDraft] = useState('');
  const [supportingCaptionDraft, setSupportingCaptionDraft] = useState('');
  const [openQuestionMenuId, setOpenQuestionMenuId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const detail = await fetchPost(id);
      if (!detail) {
        setLoadError('This observation is no longer available.');
        setPost(null);
      } else {
        setPost(detail);
        setActiveMedia(0);
        setReportEdit(detail.user_report ?? null);
        setReportEditing(false);
      }
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'This observation could not be loaded.');
      setPost(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadComments = useCallback(async (id: string) => {
    try {
      setComments(await fetchComments(id));
    } catch {
      setComments([]);
    }
  }, []);

  useEffect(() => {
    if (!passportId) {
      setPost(null);
      setComments([]);
      setNotice(null);
      setPublishPending(false);
      return;
    }
    void load(passportId);
    void loadComments(passportId);
  }, [passportId, load, loadComments]);

  // Community location-suggestion confirmations persist per observation, as on
  // the web (`et_conf_{id}`).
  useEffect(() => {
    if (!passportId) return;
    setSuggestLocationOpen(false);
    setProposedPlace('');
    setProposedLat('');
    setProposedLng('');
    setLocationSuccess(null);
    AsyncStorage.getItem(`et_conf_${passportId}`)
      .then((stored) => setConfirmCount(stored ? Number(stored) || 2 : 2))
      .catch(() => setConfirmCount(2));
  }, [passportId]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    []
  );

  const media: PublicMediaItem[] = useMemo(() => post?.media ?? [], [post]);
  const currentMedia = media[activeMedia] ?? null;
  const isOwner = Boolean(post?.viewer_is_owner);

  const shareLink = useMemo(() => {
    if (!post) return '';
    const base = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/api\/?$/, '') ?? '';
    const params = new URLSearchParams();
    params.set('view', 'explore');
    params.set('passport', post.passport_id);
    if (
      post.location.latitude !== null &&
      post.location.longitude !== null &&
      post.location.precision !== 'private'
    ) {
      params.set('lat', post.location.latitude.toFixed(5));
      params.set('lng', post.location.longitude.toFixed(5));
    }
    return `${base}/?${params.toString()}`;
  }, [post]);

  const copyShareLink = async () => {
    await Clipboard.setStringAsync(shareLink);
    setLinkCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setLinkCopied(false), 2000);
  };

  const downloadMedia = async (item: PublicMediaItem) => {
    const url = resolveMediaUrl(item.url);
    if (!url) return;
    setBusy(`media:${item.media_id}`);
    try {
      const match = /\.([a-z0-9]+)(?:\?|$)/i.exec(url);
      const ext = match?.[1] ?? (item.kind === 'video' ? 'mp4' : 'jpg');
      const file = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}et-${item.media_id}.${ext}`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: item.mime_type || undefined });
      }
    } catch {
      Alert.alert('Download failed', 'This file could not be downloaded right now.');
    } finally {
      setBusy(null);
    }
  };

  const saveReport = async () => {
    if (!post) return;
    setBusy('report');
    try {
      const updated = await updatePost(post.passport_id, {
        user_report: reportEdit?.trim() ? reportEdit.trim() : null,
      });
      setPost(updated);
      setReportEditing(false);
      setNotice('Your report was saved.');
    } catch (err: unknown) {
      Alert.alert('Not saved', err instanceof Error ? err.message : 'Your report could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const patchPost = async (patch: UpdatePostPatch, successMessage: string) => {
    if (!post) return;
    setBusy('owner');
    try {
      const updated = await updatePost(post.passport_id, patch);
      setPost(updated);
      setNotice(successMessage);
      setPublishPending(false);
    } catch (err: unknown) {
      Alert.alert('Not saved', err instanceof Error ? err.message : 'Could not apply that change.');
    } finally {
      setBusy(null);
    }
  };

  /** The web applies the unpin immediately, with inline feedback. */
  const removePin = () =>
    void patchPost(
      { location_precision: 'private' },
      'Pin removed from the public map. Your observation record remains saved.'
    );

  /** The web's owner detail form: title, notes, coordinates, district, landmark. */
  const saveOwnerEdits = async () => {
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
    await patchPost(
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

  const publishWithDownloads = async (allow: boolean) => {
    if (!post || busy) return;
    setBusy('owner');
    setNotice(null);
    try {
      for (const attachment of post.attachments) {
        await updateAttachmentDownload(post.passport_id, attachment.attachment_id, allow);
      }
      const updated = await updatePost(post.passport_id, { is_public: true });
      setPost(updated);
      setPublishPending(false);
      setPreviewAttachment(null);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not publish the post.');
    } finally {
      setBusy(null);
    }
  };

  const submitAnswer = async (question: PostQuestion) => {
    if (!post) return;
    const answer = (answerDrafts[question.question_id] ?? '').trim();
    if (!answer) return;
    setBusy(`answer:${question.question_id}`);
    try {
      const updated = await answerQuestion(post.passport_id, question.question_id, answer);
      setPost(updated);
      setAnswerDrafts((prev) => ({ ...prev, [question.question_id]: '' }));
      setNotice('Your answer was published.');
    } catch (err: unknown) {
      Alert.alert('Not saved', err instanceof Error ? err.message : 'Could not save your answer.');
    } finally {
      setBusy(null);
    }
  };

  const submitComment = async () => {
    if (!post) return;
    const body = commentText.trim() || (stagedCommentImage ? 'Shared a field photo' : '');
    if (!body && !stagedCommentImage) return;
    setBusy('comment');
    try {
      await createComment(
        post.passport_id,
        body,
        null,
        stagedCommentImage
          ? { base64: stagedCommentImage.base64, mimeType: stagedCommentImage.mimeType }
          : null
      );
      setCommentText('');
      setStagedCommentImage(null);
      await loadComments(post.passport_id);
    } catch (err: unknown) {
      Alert.alert('Not posted', err instanceof Error ? err.message : 'Could not post your comment.');
    } finally {
      setBusy(null);
    }
  };

  /** Pick and stage an image for the new comment, as the web's attach button does. */
  const stageCommentImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Photo library access was declined, so no image was attached.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      setNotice('Please select a JPEG, PNG, or WebP image.');
      return;
    }
    if ((asset.fileSize ?? 0) > 5 * 1024 * 1024) {
      setNotice('Comment photo must be 5 MB or smaller.');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl({ uri: asset.uri, mimeType: mime });
      setStagedCommentImage({
        uri: asset.uri,
        base64: dataUrlToBase64(dataUrl),
        mimeType: mime,
      });
    } catch {
      setNotice('Could not read photo.');
    }
  };

  const applyCommentReactionUpdate = (
    list: PublicComment[],
    commentId: string,
    patch: Partial<PublicComment>
  ): PublicComment[] =>
    list.map((c) => ({
      ...(c.comment_id === commentId ? { ...c, ...patch } : c),
      replies: applyCommentReactionUpdate(c.replies, commentId, patch),
    }));

  const handleReactComment = async (commentId: string) => {
    if (!post || reactingId === commentId) return;
    setReactingId(commentId);
    try {
      const updated = await reactToComment(post.passport_id, commentId, 'heart');
      setComments((prev) =>
        applyCommentReactionUpdate(prev, commentId, {
          likes_count: updated.likes_count,
          viewer_liked: updated.viewer_liked,
        })
      );
    } catch {
      // Non-fatal reaction failure
    } finally {
      setReactingId(null);
    }
  };

  const submitReply = async (parentCommentId: string) => {
    if (!post) return;
    const body = replyText.trim();
    if (!body) return;
    setBusy(`reply:${parentCommentId}`);
    try {
      await createComment(post.passport_id, body, parentCommentId);
      setReplyText('');
      setReplyParent(null);
      await loadComments(post.passport_id);
    } catch (err: unknown) {
      Alert.alert('Not posted', err instanceof Error ? err.message : 'Could not post your reply.');
    } finally {
      setBusy(null);
    }
  };

  const attachSupportingMedia = async () => {
    if (!post) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Photo library access was declined, so nothing was attached.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 1,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if ((asset.fileSize ?? 0) > 10 * 1024 * 1024) {
      setNotice('Supporting photo or video must be 10 MB or smaller.');
      return;
    }
    setBusy('attach');
    let base64: string;
    try {
      const dataUrl = await fileToDataUrl({ uri: asset.uri, mimeType: asset.mimeType ?? undefined });
      base64 = dataUrlToBase64(dataUrl);
    } catch {
      setNotice('Could not read selected file.');
      setBusy(null);
      return;
    }
    try {
      const updated = await addPostMedia(post.passport_id, {
        content_base64: base64,
        mime_type: asset.mimeType ?? 'image/jpeg',
        caption: supportingCaptionDraft.trim() || asset.fileName || null,
        role: (asset.mimeType ?? '').startsWith('video/') ? 'video' : 'field',
      });
      setSupportingCaptionDraft('');
      setPost((prev) => (prev ? { ...prev, media: [...prev.media, updated.media] } : prev));
      setNotice('Supporting site media attached to this observation.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not attach supporting media.');
    } finally {
      setBusy(null);
    }
  };

  const attachSupportingDocument = async () => {
    if (!post) return;
    setNotice(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: DOCUMENT_PICKER_TYPES,
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      let attached = 0;
      setBusy('attach-document');
      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        if (!asset) continue;
        const mimeType = documentMimeType(asset.name);
        if (!mimeType) {
          setNotice('Supported documents: PDF, Word, Excel, PowerPoint, OpenDocument, TXT and CSV.');
          continue;
        }
        if (asset.size === 0 || asset.size > MAX_DOCUMENT_BYTES) {
          setNotice(`"${asset.name}" must be between 1 byte and 10 MB.`);
          continue;
        }
        const dataUrl = await fileToDataUrl({ uri: asset.uri, mimeType, fileName: asset.name });
        const updated = await uploadPostAttachment(post.passport_id, {
          filename: asset.name,
          mime_type: mimeType,
          size_bytes: asset.size,
          content_base64: dataUrlToBase64(dataUrl),
        });
        attached += 1;
        setPost((prev) =>
          prev ? { ...prev, attachments: [...prev.attachments, updated.attachment] } : prev
        );
      }
      if (attached > 0) setNotice(`${attached} document(s) attached to this Passport.`);
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not attach that document.');
    } finally {
      setBusy(null);
    }
  };

  /** The web's remove button on each supporting media row. */
  const removeSupportingMedia = async (mediaId: string) => {
    if (!post || busy) return;
    setBusy(`remove-media:${mediaId}`);
    setNotice(null);
    try {
      const updated = await removePostMedia(post.passport_id, mediaId);
      setPost(updated);
      setNotice('Media item removed from this observation.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Could not remove that media item.');
    } finally {
      setBusy(null);
    }
  };

  const openPassport = () => {
    if (!post) return;
    onClose();
    router.push(`/passport/${post.passport_id}`);
  };

  const openReportDialog = (target: ReportTarget) => setReportTarget(target);

  /** The web's community suggest-location card (3 confirmations pin the post). */
  const handleProposeLocation = () => {
    if (!post) return;
    const latNum = parseFloat(proposedLat);
    const lngNum = parseFloat(proposedLng);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      setNotice('Please enter valid numeric latitude and longitude coordinates.');
      return;
    }
    const newCount = confirmCount + 1;
    setConfirmCount(newCount);
    AsyncStorage.setItem(`et_conf_${post.passport_id}`, String(newCount)).catch(() => {});
    if (newCount >= 3) {
      setLocationSuccess('3 confirmations reached! This place is confirmed and pinned on the Explorer Map.');
      setPost({
        ...post,
        location: {
          ...post.location,
          latitude: latNum,
          longitude: lngNum,
          district: proposedPlace.trim() || post.location.district || 'Confirmed Location',
          precision: 'exact',
        },
      });
    } else {
      setLocationSuccess(`Your location was submitted. ${3 - newCount} more confirmation needed to pin.`);
    }
  };

  const renderSuggestLocation = () => {
    if (!post) return null;
    const isConfirmed = confirmCount >= 3;
    const isExpanded = suggestLocationOpen || Boolean(locationSuccess) || isConfirmed;
    return (
      <View style={styles.suggestCard}>
        <Pressable onPress={() => setSuggestLocationOpen((v) => !v)} style={styles.suggestHeader}>
          <MapPin size={14} color="#0b57d0" />
          <Text style={styles.suggestHeaderText} numberOfLines={1}>
            No map pin yet · Suggest location
          </Text>
          <Text style={styles.suggestCount}>{Math.min(3, confirmCount)}/3</Text>
          {isExpanded ? (
            <ChevronUp size={16} color="#5e5e5e" />
          ) : (
            <ChevronDown size={16} color="#5e5e5e" />
          )}
        </Pressable>
        {isExpanded ? (
          <View style={styles.suggestBody}>
            <Text style={styles.suggestCopy}>
              {isConfirmed
                ? '3 people confirmed this location. It is now pinned on the Explorer Map!'
                : 'This observation has no published coordinates. Enter the place and coordinate you think this is. 3 community confirmations will pin it to the Explorer Map.'}
            </Text>
            {locationSuccess ? (
              <View style={styles.suggestSuccess}>
                <Text style={styles.suggestSuccessText}>{locationSuccess}</Text>
              </View>
            ) : null}
            {!isConfirmed ? (
              <View style={{ gap: spacing.sm, paddingTop: spacing.xs }}>
                <View style={{ gap: 4 }}>
                  <Text style={styles.suggestLabel}>Place / District</Text>
                  <TextInput
                    style={styles.suggestInput}
                    value={proposedPlace}
                    onChangeText={setProposedPlace}
                    placeholder="e.g. Gatsibo District, Kiziguro"
                    placeholderTextColor={colors.outline}
                  />
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.suggestLabel}>Latitude</Text>
                    <TextInput
                      style={styles.suggestInput}
                      value={proposedLat}
                      onChangeText={setProposedLat}
                      placeholder="-2.1605"
                      placeholderTextColor={colors.outline}
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.suggestLabel}>Longitude</Text>
                    <TextInput
                      style={styles.suggestInput}
                      value={proposedLng}
                      onChangeText={setProposedLng}
                      placeholder="30.4771"
                      placeholderTextColor={colors.outline}
                      autoCapitalize="none"
                    />
                  </View>
                </View>
                <Pressable style={styles.suggestSubmit} onPress={handleProposeLocation}>
                  <MapPin size={14} color="#ffffff" />
                  <Text style={styles.suggestSubmitText}>
                    Submit place & coordinate ({3 - confirmCount} more needed)
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const renderComment = (comment: PublicComment, depth: number) => {
    const authorName = comment.author.display_name ?? comment.author.public_user_id;
    const isOp = Boolean(post?.owner && comment.author.public_user_id === post.owner.public_user_id);
    const likesCount = comment.likes_count ?? 0;
    const hasExtraReplies = comment.replies.length > MAX_VISIBLE_REPLIES;
    const repliesExpanded = expandedReplies[comment.comment_id] ?? false;
    const visibleReplies =
      depth === 0 && hasExtraReplies && !repliesExpanded
        ? comment.replies.slice(0, MAX_VISIBLE_REPLIES)
        : comment.replies;
    const hiddenReplyCount = Math.max(0, comment.replies.length - visibleReplies.length);
    return (
      <View key={comment.comment_id} style={depth > 0 ? styles.replyIndent : null}>
        <View style={styles.commentCard}>
          <View style={styles.commentHeader}>
            {depth > 0 ? <CornerDownRight size={13} color="#8f8f8f" /> : null}
            <View style={[styles.avatar, depth > 0 && { width: 26, height: 26 }]}>
              <Text style={depth > 0 ? styles.avatarInitialsSmall : styles.avatarInitials}>
                {initialsOf(comment.author)}
              </Text>
            </View>
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2 }}>
              <Text style={styles.commentAuthor}>{authorName}</Text>
              {isOp ? (
                <View style={styles.opBadge}>
                  <Text style={styles.opBadgeText}>OP</Text>
                </View>
              ) : null}
              <Text style={styles.commentMeta}>·</Text>
              <Text style={styles.commentMeta}>{formatRelativeTime(comment.created_at)}</Text>
            </View>
            <Pressable
              hitSlop={6}
              onPress={() =>
                openReportDialog({
                  targetType: 'comment',
                  targetId: comment.comment_id,
                  observationPassportId: post?.passport_id ?? null,
                  label: `a comment by ${authorName}`,
                })
              }
            >
              <Text style={styles.flagLink}>{depth === 0 ? 'Report comment' : 'Report reply'}</Text>
            </Pressable>
          </View>
          <Text style={styles.commentBody}>{comment.body}</Text>
          {comment.image_url ? (
            <Image
              source={{ uri: comment.image_url }}
              accessibilityLabel="Comment attachment"
              resizeMode="contain"
              style={{
                marginTop: spacing.sm,
                maxHeight: 224,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: '#e0e4da',
                width: '100%',
              }}
            />
          ) : null}
          <View style={[styles.commentActions, { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' }]}>
            <Pressable
              disabled={reactingId === comment.comment_id}
              onPress={() => void handleReactComment(comment.comment_id)}
              accessibilityLabel={`Like comment (${likesCount})`}
              style={[styles.reactionPill, comment.viewer_liked ? styles.reactionPillHeartActive : null]}
            >
              <Heart size={14} color={comment.viewer_liked ? '#c81e32' : '#263029'} fill={comment.viewer_liked ? '#c81e32' : 'none'} />
              <Text style={[styles.reactionPillText, comment.viewer_liked ? { color: '#c81e32' } : null]}>{likesCount}</Text>
            </Pressable>
            {replyParent === comment.comment_id ? (
              <>
                <TextInput
                  style={styles.replyInput}
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder={viewer ? `Reply to ${authorName}…` : `Sign in to reply to ${authorName}…`}
                  placeholderTextColor={colors.outline}
                  multiline
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Pressable style={styles.tonalButton} onPress={() => void submitReply(comment.comment_id)}>
                    {busy === `reply:${comment.comment_id}` ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.tonalText}>Reply</Text>
                    )}
                  </Pressable>
                  <Pressable style={[styles.tonalButton, { backgroundColor: 'transparent' }]} onPress={() => setReplyParent(null)}>
                    <Text style={styles.tonalText}>Cancel</Text>
                  </Pressable>
                </View>
                <PublicVisibilityNote />
              </>
            ) : (
              <Pressable
                onPress={() => {
                  if (!viewer) return;
                  setReplyParent(comment.comment_id);
                  setReplyText('');
                }}
                style={styles.reactionPill}
              >
                <MessageSquare size={14} color="#263029" />
                <Text style={styles.reactionPillText}>Reply</Text>
              </Pressable>
            )}
          </View>
        </View>
        {visibleReplies.length ? visibleReplies.map((reply) => renderComment(reply, depth + 1)) : null}
        {depth === 0 && hasExtraReplies ? (
          <Pressable
            onPress={() => setExpandedReplies((prev) => ({ ...prev, [comment.comment_id]: !prev[comment.comment_id] }))}
            style={[styles.showRepliesToggle, depth > 0 ? null : null]}
          >
            <Text style={styles.showRepliesText}>
              {repliesExpanded
                ? 'Show fewer replies'
                : `Show ${hiddenReplyCount} more ${hiddenReplyCount === 1 ? 'reply' : 'replies'}`}
            </Text>
            {repliesExpanded ? (
              <ChevronUp size={14} color="#18211b" />
            ) : (
              <ChevronDown size={14} color="#18211b" />
            )}
          </Pressable>
        ) : null}
      </View>
    );
  };

  const openQuestionReport = (question: PostQuestion) => {
    openReportDialog({
      targetType: 'question',
      targetId: question.question_id,
      observationPassportId: post?.passport_id ?? null,
      label: question.question,
    });
  };

  const renderQuestion = (question: PostQuestion) => {
    const answered = question.status === 'answered' && question.answer;
    return (
      <View key={question.question_id} style={styles.questionCard}>
        <View style={[styles.questionHeader, { position: 'relative' }]}>
          <Text style={styles.questionText}>{question.question}</Text>
          <Pressable
            hitSlop={6}
            accessibilityLabel="Question options"
            accessibilityRole="button"
            onPress={() =>
              setOpenQuestionMenuId((prev) =>
                prev === question.question_id ? null : question.question_id
              )
            }
            style={({ pressed }) => [styles.questionMenuButton, pressed && { opacity: 0.7 }]}
          >
            <MoreVertical size={16} color="#5b655d" />
          </Pressable>
          {openQuestionMenuId === question.question_id ? (
            <View style={styles.questionMenu}>
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.questionMenuItem,
                  pressed && { backgroundColor: '#fdf2f2' },
                ]}
                onPress={() => {
                  setOpenQuestionMenuId(null);
                  openQuestionReport(question);
                }}
              >
                <Flag size={14} color="#b3261e" />
                <Text style={styles.questionMenuItemText}>Report question</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        {answered ? (
          <View style={styles.answerBlock}>
            <Text style={styles.answerText}>{question.answer}</Text>
            {question.answered_at ? (
              <Text style={styles.commentMeta}>Answered {formatDate(question.answered_at)}</Text>
            ) : null}
          </View>
        ) : isOwner ? (
          <View style={{ gap: spacing.sm }}>
            <TextInput
              style={styles.replyInput}
              value={answerDrafts[question.question_id] ?? ''}
              onChangeText={(text) => setAnswerDrafts((prev) => ({ ...prev, [question.question_id]: text }))}
              placeholder="Your answer…"
              placeholderTextColor={colors.outline}
              multiline
            />
            <Pressable style={styles.tonalButton} onPress={() => void submitAnswer(question)}>
              {busy === `answer:${question.question_id}` ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.tonalText}>Answer</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <Text style={styles.pendingText}>Waiting for the contributor to answer.</Text>
        )}
      </View>
    );
  };

  const body = () => {
    if (loading) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    if (loadError || !post) {
      return (
        <View style={styles.centerState}>
          <XCircle size={28} color={colors.danger} />
          <Text style={styles.emptyText}>{loadError ?? 'This observation is no longer available.'}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.loadErrorClose}
          >
            <Text style={styles.loadErrorCloseText}>Close</Text>
          </Pressable>
        </View>
      );
    }

    const tint = categoryColor(post.observation_category);
    const ai = post.ai;

    return (
      <>
        {/* Media gallery — 4:3, counter, lightbox, thumbnails */}
        {media.length ? (
          <View style={styles.mediaWrap}>
            <View style={styles.mediaFrame}>
              {currentMedia?.kind === 'video' && currentMedia.url ? (
                <Video
                  source={{ uri: resolveMediaUrl(currentMedia.url) ?? '' }}
                  style={StyleSheet.absoluteFill}
                  resizeMode={ResizeMode.CONTAIN}
                  useNativeControls
                />
              ) : currentMedia?.poster_url || currentMedia?.url ? (
                <Image
                  source={{ uri: resolveMediaUrl(currentMedia?.poster_url ?? currentMedia?.url) ?? '' }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="contain"
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16 }]}>
                  <ImagePlus size={28} color="#7f8b99" />
                  <Text style={styles.unavailableMediaText}>
                    {currentMedia?.demo_note ??
                      (currentMedia?.caption ?? 'Image preview is not available on this deployment.')}
                  </Text>
                  {currentMedia?.kind === 'video' ? (
                    <Text style={styles.unavailableMediaSubtext}>Video metadata only.</Text>
                  ) : null}
                </View>
              )}
              <View style={styles.mediaScrimTop} pointerEvents="none" />
              <View style={styles.mediaCounter}>
                <Text style={styles.mediaCounterText}>
                  {activeMedia + 1} / {media.length}
                </Text>
              </View>
              <Pressable
                style={styles.lightboxButton}
                onPress={() => setLightboxOpen(true)}
                accessibilityLabel="Preview image full screen"
              >
                <Maximize2 size={15} color="#ffffff" />
              </Pressable>
              {currentMedia?.url ? (
                <Pressable style={styles.mediaDownload} onPress={() => void downloadMedia(currentMedia)}>
                  {busy === `media:${currentMedia.media_id}` ? (
                    <Loader2 size={15} color="#ffffff" />
                  ) : (
                    <Download size={15} color="#ffffff" />
                  )}
                </Pressable>
              ) : null}
              {currentMedia?.caption ? (
                <Text style={styles.mediaCaption}>{currentMedia.caption}</Text>
              ) : null}
            </View>
            {media.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbStrip}>
                {media.map((item, index) => (
                  <Pressable
                    key={item.media_id}
                    onPress={() => setActiveMedia(index)}
                    style={[styles.thumb, index === activeMedia && styles.thumbActive]}
                  >
                    {item.kind === 'video' ? (
                      item.poster_url ? (
                        <Image source={{ uri: resolveMediaUrl(item.poster_url) ?? '' }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      ) : (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1b2635', alignItems: 'center', justifyContent: 'center' }]}>
                          <MessageCircle size={14} color="#ffffff" />
                        </View>
                      )
                    ) : (
                      <Image source={{ uri: resolveMediaUrl(item.poster_url ?? item.url) ?? '' }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        {/* Title block — the web's h2 + Share pill + meta row */}
        <View style={styles.titleBlock}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
            <Text style={[styles.postTitle, { flex: 1 }]}>{post.title || 'Untitled observation'}</Text>
            {post.is_public ? (
              <Pressable
                accessibilityLabel="Share Geoscience Passport link"
                onPress={() => void copyShareLink()}
                style={[styles.sharePill, linkCopied && styles.sharePillCopied]}
              >
                {linkCopied ? (
                  <CheckCircle2 size={12} color="#137333" />
                ) : (
                  <Share2 size={12} color="#3c4043" />
                )}
                <Text style={[styles.sharePillText, linkCopied && { color: '#137333' }]}>
                  {linkCopied ? 'Copied' : 'Share'}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.categoryDot, { backgroundColor: tint }]} />
              <Text style={[styles.metaText, { color: tint, fontWeight: '500' }]}>
                {categoryLabel(post.observation_category)}
              </Text>
            </View>
            <Text style={styles.metaText}>·</Text>
            <Text style={styles.metaText}>{formatDate(post.created_at)}</Text>
            <Text style={styles.metaText}>·</Text>
            <Text style={styles.metaPassportId}>{formatPassportId(post.passport_id)}</Text>
          </View>
        </View>

        {notice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {/* Contributor's report */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <User size={16} color="#5e5e5e" />
            <Text style={styles.sectionLabel}>Contributor&apos;s report</Text>
          </View>
          {isOwner && reportEditing ? (
            <View style={{ gap: spacing.sm }}>
              <TextInput
                style={[styles.replyInput, { minHeight: 96 }]}
                value={reportEdit ?? ''}
                onChangeText={setReportEdit}
                placeholder="Edit your report…"
                placeholderTextColor={colors.outline}
                multiline
                textAlignVertical="top"
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Pressable style={styles.tonalButton} onPress={() => void saveReport()}>
                  {busy === 'report' ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={styles.tonalText}>Save</Text>
                  )}
                </Pressable>
                <Pressable style={[styles.tonalButton, { backgroundColor: 'transparent' }]} onPress={() => setReportEditing(false)}>
                  <Text style={styles.tonalText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {post.user_report ? (
                <Text style={styles.reportBody}>{post.user_report}</Text>
              ) : (
                <Text style={styles.emptyText}>No written report has been added yet.</Text>
              )}
              {isOwner ? (
                <Pressable style={styles.tonalButton} onPress={() => setReportEditing(true)}>
                  <Text style={styles.tonalText}>{post.user_report ? 'Edit report' : 'Add a report'}</Text>
                </Pressable>
              ) : null}
            </>
          )}

          {post.attachments.length ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {post.attachments.map((attachment) => (
                <Pressable
                  key={attachment.attachment_id}
                  style={[styles.attachmentRow, { flexDirection: 'row' }]}
                  onPress={() => setPreviewAttachment(attachment)}
                  accessibilityLabel={`Preview ${attachment.title}`}
                >
                  <Paperclip size={14} color={colors.onSurfaceVariant} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.attachmentTitle} numberOfLines={1}>{attachment.title}</Text>
                    <Text style={styles.attachmentMeta}>
                      {attachment.filename}
                      {attachment.size_bytes != null ? ` · ${formatBytes(attachment.size_bytes)}` : ''}
                    </Text>
                  </View>
                  {attachment.allow_download ? (
                    <Pressable
                      hitSlop={6}
                      onPress={() => {
                        void (async () => {
                          try {
                            const updated = await updateAttachmentDownload(
                              post.passport_id,
                              attachment.attachment_id,
                              false
                            );
                            setPost(updated);
                          } catch {
                            /* counted best effort */
                          }
                          await downloadMedia({
                            ...attachment,
                            media_id: attachment.attachment_id,
                            kind: 'image',
                            role: 'other',
                            caption: null,
                            mime_type: attachment.mime_type,
                            sort_order: 0,
                            url: attachment.url,
                            poster_url: null,
                            available: true,
                            is_demo: attachment.is_demo,
                            demo_note: null,
                            created_at: attachment.created_at,
                          });
                        })();
                      }}
                    >
                      <Download size={15} color={colors.primary} />
                    </Pressable>
                  ) : (
                    <View style={styles.readOnlyPill}>
                      <Text style={styles.readOnlyText}>Read only</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Contributor identity row, as on the web */}
          {post.owner ? (
            <View style={styles.ownerFooterRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarInitials}>{initialsOf(post.owner)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerFooterName} numberOfLines={1}>
                  {post.owner.display_name ?? 'Earth Talk contributor'}
                </Text>
                <Text style={styles.ownerFooterRole}>Contributor</Text>
              </View>
            </View>
          ) : (
            <View style={styles.ownerFooterRow}>
              <View style={[styles.avatar, { backgroundColor: '#e8f0fe' }]}>
                <Text style={[styles.avatarInitials, { color: '#0b57d0' }]}>ET</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerFooterName} numberOfLines={1}>
                  Earth Talk Contributor
                </Text>
                <Text style={styles.ownerFooterRole}>Contributor · Earth Talk</Text>
              </View>
            </View>
          )}
        </View>

        {/* AI interpretation */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Brain size={16} color={colors.primary} />
            <Text style={styles.sectionLabel}>AI interpretation</Text>
          </View>
          {!ai.primary_interpretation ? (
            <Text style={styles.emptyText}>No interpretation produced.</Text>
          ) : (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.aiPrimary}>{ai.primary_interpretation}</Text>
              {ai.observed_features.length ? (
                <View style={{ gap: spacing.xs }}>
                  <Text style={styles.aiSubLabel}>Observed features</Text>
                  {ai.observed_features.map((feature) => (
                    <View key={feature} style={styles.featureRow}>
                      <CheckCircle2 size={13} color="#2b7f3f" />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {ai.alternative_possibilities.length ? (
                <View style={{ gap: spacing.xs }}>
                  <Text style={styles.aiSubLabel}>Alternative possibilities</Text>
                  {ai.alternative_possibilities.map((possibility) => (
                    <Text key={possibility} style={styles.bulletText}>• {possibility}</Text>
                  ))}
                </View>
              ) : null}
              {ai.uncertainties.length ? (
                <View style={{ gap: spacing.xs }}>
                  <Text style={styles.aiSubLabel}>Uncertainties</Text>
                  {ai.uncertainties.map((uncertainty) => (
                    <Text key={uncertainty} style={styles.bulletText}>
                      <Text style={{ fontWeight: '700' }}>Uncertainties:</Text> {uncertainty}
                    </Text>
                  ))}
                </View>
              ) : null}
              {ai.disclaimer ? <Text style={styles.disclaimer}>{ai.disclaimer}</Text> : null}
              {ai.safety_note ? (
                <View style={styles.safetyNote}>
                  <AlertTriangle size={14} color="#9f6108" />
                  <Text style={styles.safetyNoteText}>{ai.safety_note}</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* Questions & answers */}
        {post.questions.length ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <HelpCircle size={16} color={colors.primary} />
              <Text style={styles.sectionLabel}>Questions &amp; answers</Text>
            </View>
            {post.questions.map(renderQuestion)}
          </View>
        ) : null}

        {/* Discussion */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MessagesSquare size={16} color={colors.primary} />
            <Text style={styles.sectionLabel}>Discussion</Text>
            <Text style={[styles.sectionLabel, { fontFamily: 'monospace', letterSpacing: 0 }]}>
              {post.comment_count}
            </Text>
          </View>
          <View style={styles.discussionBanner}>
            <Text style={styles.discussionBannerText}>
              Comments are public. Be constructive — this record is read by students, teachers and
              geoscientists across Rwanda.
            </Text>
          </View>
          {viewer ? (
            <View style={{ gap: spacing.sm }}>
              {replyParent ? (
                <View style={styles.replyingTo}>
                  <CornerDownRight size={12} color="#8f8f8f" />
                  <Text style={styles.replyingToText}>Replying to a comment</Text>
                  <Pressable onPress={() => setReplyParent(null)} hitSlop={6}>
                    <X size={12} color={colors.onSurfaceVariant} />
                  </Pressable>
                </View>
              ) : null}
              {stagedCommentImage ? (
                <View style={styles.stagedImageRow}>
                  <Image
                    source={{ uri: stagedCommentImage.uri }}
                    style={styles.stagedImage}
                    resizeMode="cover"
                    accessibilityLabel="Staged discussion attachment"
                  />
                  <Pressable
                    hitSlop={6}
                    onPress={() => setStagedCommentImage(null)}
                    accessibilityLabel="Remove attached discussion photo"
                    style={styles.stagedImageRemove}
                  >
                    <X size={12} color={colors.onSurfaceVariant} />
                  </Pressable>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={[styles.replyInput, { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 40, paddingLeft: 14, paddingRight: 4, borderRadius: radius.full, borderWidth: 1, borderColor: '#d6d9d2' }]}>
                  <TextInput
                    style={{ flex: 1, fontSize: 13, color: '#1f1f1f', paddingVertical: 6 }}
                    value={commentText}
                    onChangeText={setCommentText}
                    placeholder="Add to the conversation"
                    placeholderTextColor="#6b726c"
                    multiline
                  />
                  <Pressable
                    hitSlop={4}
                    onPress={() => void stageCommentImage()}
                    accessibilityLabel="Attach image to comment"
                    style={styles.composerIconButton}
                  >
                    <ImagePlus size={16} color="#4e5951" />
                  </Pressable>
                </View>
                <Pressable
                  disabled={busy === 'comment' || (!commentText.trim() && !stagedCommentImage)}
                  onPress={() => void submitComment()}
                  accessibilityLabel="Send comment"
                  style={[styles.composerSend, (!commentText.trim() && !stagedCommentImage) && { opacity: 0.45 }]}
                >
                  {busy === 'comment' ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <SendHorizontal size={16} color="#ffffff" />
                  )}
                </Pressable>
              </View>
              <PublicVisibilityNote />
            </View>
          ) : (
            <View style={styles.signInBanner}>
              <Text style={styles.emptyText}>Sign in to join the discussion.</Text>
            </View>
          )}
          {comments.length ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
              {comments.filter((c) => !c.parent_comment_id).map((c) => renderComment(c, 0))}
            </View>
          ) : (
            <Text style={[styles.emptyText, { marginTop: spacing.md, fontStyle: 'italic' }]}>
              No comments yet. Start the discussion below.
            </Text>
          )}
        </View>

        {/* Owner management */}
        {isOwner ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <ShieldCheck size={16} color={colors.primary} />
              <Text style={styles.sectionLabel}>Manage Your Observation</Text>
            </View>
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>Status</Text>
              <Text style={styles.statusValue}>
                {post.is_public
                  ? post.location.precision === 'private'
                    ? 'Public · Unpinned'
                    : `Pinned (${post.location.precision})`
                  : 'Private record'}
              </Text>
            </View>
            {post.is_public && post.location.precision !== 'private' ? (
              <Pressable
                style={[styles.ownerButton, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }]}
                onPress={removePin}
              >
                {busy === 'owner' ? (
                  <Loader2 size={14} color={colors.primary} />
                ) : (
                  <MapPin size={14} color={colors.primary} />
                )}
                <Text style={styles.ownerButtonText}>Remove Pin from Public Map (Keep Post)</Text>
              </Pressable>
            ) : null}
            {publishPending ? (
              <View style={styles.confirmBox}>
                <Text style={styles.confirmText}>
                  Choose download permission for the {post.attachments.length} attached document
                  {post.attachments.length === 1 ? '' : 's'} before publishing.
                </Text>
                <Pressable
                  disabled={busy === 'owner'}
                  style={[styles.primaryButton, busy === 'owner' && { opacity: 0.5 }]}
                  onPress={() => void publishWithDownloads(true)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
                    <Download size={14} color="#ffffff" />
                    <Text style={styles.primaryButtonText}>Publish — downloads on</Text>
                  </View>
                </Pressable>
                <Pressable
                  disabled={busy === 'owner'}
                  style={[styles.ownerButton, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, busy === 'owner' && { opacity: 0.5 }]}
                  onPress={() => void publishWithDownloads(false)}
                >
                  <Lock size={14} color={colors.primary} />
                  <Text style={styles.ownerButtonText}>Publish — read only</Text>
                </Pressable>
                <Pressable disabled={busy === 'owner'} onPress={() => setPublishPending(false)}>
                  <Text style={{ fontSize: 12, color: '#5e5e5e', textAlign: 'center', textDecorationLine: 'underline' }}>
                    Cancel
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.ownerButton}
                onPress={() => {
                  if (post.is_public) {
                    void patchPost(
                      { is_public: false },
                      'Observation set to private and removed from public map and feed.'
                    );
                  } else if (post.attachments.length > 0) {
                    setPublishPending(true);
                  } else {
                    void patchPost({ is_public: true }, 'Observation published.');
                  }
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
                  {post.is_public ? <EyeOff size={14} color={colors.primary} /> : <Eye size={14} color={colors.primary} />}
                  <Text style={styles.ownerButtonText}>
                    {post.is_public ? 'Make Entire Observation Private' : 'Publish Observation'}
                  </Text>
                </View>
              </Pressable>
            )}
            <View style={{ gap: 4 }}>
              <Text style={styles.fieldLabel}>Map location precision</Text>
              <Pressable
                disabled={busy === 'owner'}
                style={({ pressed }) => [styles.fieldSelect, pressed && { opacity: 0.85 }]}
                onPress={() => setPrecisionSelectOpen(true)}
              >
                <Text style={styles.fieldSelectText} numberOfLines={1}>
                  {PRECISION_LABELS[post.location.precision as (typeof PRECISION_OPTIONS)[number]] ??
                    post.location.precision}
                </Text>
                <ChevronDown size={14} color="#5e5e5e" />
              </Pressable>
            </View>

            {/* Edit Title, Field Notes & Coordinates */}
            <View style={styles.ownerDivider}>
              <Pressable
                disabled={busy === 'owner'}
                onPress={() => setIsEditingOwnerDetails((v) => !v)}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: 6 })}
              >
                <Pencil size={14} color="#0b57d0" />
                <Text style={styles.editToggleText}>
                  {isEditingOwnerDetails
                    ? 'Hide Edit Form'
                    : 'Edit Title, Field Notes & Coordinates'}
                </Text>
              </Pressable>
              {isEditingOwnerDetails ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                  <View style={{ gap: 4 }}>
                    <Text style={styles.fieldLabel}>Observation title</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={ownerTitleDraft}
                      onChangeText={setOwnerTitleDraft}
                      maxLength={140}
                    />
                  </View>
                  <View style={{ gap: 4 }}>
                    <Text style={styles.fieldLabel}>Field report / context notes</Text>
                    <TextInput
                      style={[styles.fieldInput, styles.fieldTextArea]}
                      value={ownerReportDraft}
                      onChangeText={setOwnerReportDraft}
                      maxLength={2000}
                      multiline
                      placeholder="Outcrop context, fresh fracture surface, scale reference..."
                      placeholderTextColor="#c7c7c7"
                    />
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.fieldLabel}>Latitude</Text>
                      <TextInput
                        style={styles.fieldInputMono}
                        value={ownerLatDraft}
                        onChangeText={setOwnerLatDraft}
                        keyboardType="decimal-pad"
                        autoCapitalize="none"
                        placeholder="-1.4980"
                        placeholderTextColor="#c7c7c7"
                      />
                    </View>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.fieldLabel}>Longitude</Text>
                      <TextInput
                        style={styles.fieldInputMono}
                        value={ownerLngDraft}
                        onChangeText={setOwnerLngDraft}
                        keyboardType="decimal-pad"
                        autoCapitalize="none"
                        placeholder="29.6330"
                        placeholderTextColor="#c7c7c7"
                      />
                    </View>
                  </View>
                  <View style={{ gap: 4 }}>
                    <Text style={styles.fieldLabel}>Rwanda District</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={ownerDistrictDraft}
                      onChangeText={setOwnerDistrictDraft}
                      maxLength={60}
                      placeholder="e.g. Musanze"
                      placeholderTextColor="#c7c7c7"
                    />
                  </View>
                  <View style={{ gap: 4 }}>
                    <Text style={styles.fieldLabel}>Outcrop / Landmark note</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={ownerAddressDraft}
                      onChangeText={setOwnerAddressDraft}
                      maxLength={200}
                      placeholder="e.g. Roadcut 400 m east of bridge"
                      placeholderTextColor="#c7c7c7"
                    />
                  </View>
                  <Pressable
                    disabled={busy === 'owner'}
                    style={[styles.primaryButton, busy === 'owner' && { opacity: 0.5 }]}
                    onPress={() => void saveOwnerEdits()}
                  >
                    <Text style={styles.primaryButtonText}>Save Observation Changes</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* Attach or Remove Supporting Site Videos & Extra Photos */}
            <View style={[styles.ownerDivider, { gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm + 4 }]}>
              <Text style={styles.fieldLabel}>
                Supporting Site Videos & Photos (attached to pin without re-running AI)
              </Text>
              <TextInput
                style={styles.fieldInput}
                value={supportingCaptionDraft}
                onChangeText={setSupportingCaptionDraft}
                maxLength={200}
                placeholder="Optional caption (e.g. 360° outcrop video, fresh fracture, scale coin)"
                placeholderTextColor="#c7c7c7"
              />
              <Pressable
                disabled={busy === 'attach'}
                style={[
                  styles.ownerButton,
                  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
                  busy === 'attach' && { opacity: 0.5 },
                ]}
                onPress={() => void attachSupportingMedia()}
              >
                <Upload size={14} color={colors.primary} />
                <Text style={styles.ownerButtonText}>Attach Supporting Video or Photo</Text>
              </Pressable>
              <Pressable
                disabled={busy === 'attach-document'}
                style={[
                  styles.ownerButton,
                  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
                  busy === 'attach-document' && { opacity: 0.5 },
                ]}
                onPress={() => void attachSupportingDocument()}
              >
                <FileText size={14} color={colors.primary} />
                <Text style={styles.ownerButtonText}>Attach Document / PDF</Text>
              </Pressable>
              {post.media.length > 1
                ? post.media.slice(1).map((item, idx) => (
                    <View key={item.media_id} style={styles.mediaRow}>
                      <Text style={styles.mediaRowText} numberOfLines={1}>
                        {item.kind === 'video' ? 'Video' : 'Photo'} #{idx + 2}
                        {item.caption ? ` · ${item.caption}` : ''}
                      </Text>
                      <Pressable
                        disabled={busy !== null}
                        hitSlop={6}
                        accessibilityLabel={`Remove supporting media ${idx + 2}`}
                        onPress={() => void removeSupportingMedia(item.media_id)}
                      >
                        <Trash2 size={14} color="#b3261e" />
                      </Pressable>
                    </View>
                  ))
                : null}
            </View>
          </View>
        ) : null}

        {/* Location */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MapPin size={16} color={colors.primary} />
            <Text style={styles.sectionLabel}>Location</Text>
          </View>
          <View style={styles.locationCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
              <Text style={styles.locationPlace}>
                {[
                  post.location.country,
                  post.location.district ? `${post.location.district} District` : null,
                  post.location.sector ? `${post.location.sector} Sector` : null,
                  post.location.cell ? `${post.location.cell} Cell` : null,
                  post.location.village ? `${post.location.village} Village` : null,
                  post.location.address,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Location kept private'}
              </Text>
              {post.location.latitude != null && post.location.longitude != null ? (
                <Pressable
                  style={styles.navigateButton}
                  onPress={() =>
                    void Linking.openURL(
                      `https://www.google.com/maps?q=${post.location.latitude},${post.location.longitude}`
                    )
                  }
                >
                  <Navigation size={13} color="#ffffff" />
                  <Text style={styles.navigateText}>Navigate</Text>
                </Pressable>
              ) : null}
            </View>
            {post.location.latitude != null &&
            post.location.longitude != null &&
            post.location.precision !== 'private' ? (
              <Text style={styles.locationCoords}>
                lat {post.location.latitude.toFixed(4)}, lng {post.location.longitude.toFixed(4)}
              </Text>
            ) : renderSuggestLocation()}
          </View>
        </View>

        <Pressable style={styles.passportButton} onPress={openPassport}>
          <Text style={styles.passportButtonText}>Open full Geoscience Passport</Text>
        </Pressable>
      </>
    );
  };

  return (
    <>
      <View style={styles.sheet}>
        <View style={styles.grabberWrap} pointerEvents="box-none">
          <View style={styles.grabber} />
          <Pressable accessibilityLabel="Close card" style={styles.closeButton} onPress={onClose} hitSlop={8}>
            <X size={18} color="#ffffff" />
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
          {body()}
        </ScrollView>
      </View>

      {/* Map location precision option sheet, as on the web's owner select */}
      <Modal
        transparent
        visible={precisionSelectOpen}
        animationType="fade"
        onRequestClose={() => setPrecisionSelectOpen(false)}
      >
        <Pressable style={styles.precisionScrim} onPress={() => setPrecisionSelectOpen(false)}>
          <Pressable style={styles.precisionSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.precisionTitle}>Map location precision</Text>
            {PRECISION_OPTIONS.map((option) => {
              const selected = post?.location.precision === option;
              return (
                <Pressable
                  key={option}
                  style={({ pressed }) => [
                    styles.precisionRow,
                    selected && { backgroundColor: '#e8f0fe' },
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => {
                    setPrecisionSelectOpen(false);
                    if (post && option !== post.location.precision) {
                      void patchPost(
                        { location_precision: option },
                        'Map location precision updated.'
                      );
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.precisionRowText,
                      selected && { color: '#0b57d0', fontWeight: '600' },
                    ]}
                  >
                    {PRECISION_LABELS[option]}
                  </Text>
                  {selected ? <CheckCircle2 size={16} color="#0b57d0" /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Full-screen lightbox */}
      <Modal visible={lightboxOpen} transparent animationType="fade" onRequestClose={() => setLightboxOpen(false)}>
        <View style={styles.lightboxScrim} accessibilityLabel="Full screen media preview">
          <View style={styles.lightboxTop}>
            <Text style={styles.lightboxCounter}>
              {activeMedia + 1} / {media.length}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              {currentMedia?.url ? (
                <Pressable
                  accessibilityLabel="Download the original file, with its location details and credit"
                  accessibilityHint={
                    busy === `media:${currentMedia.media_id}` ? 'Preparing download…' : undefined
                  }
                  onPress={() => void downloadMedia(currentMedia)}
                  hitSlop={8}
                >
                  {busy === `media:${currentMedia.media_id}` ? (
                    <Loader2 size={22} color="#ffffff" />
                  ) : (
                    <Download size={22} color="#ffffff" />
                  )}
                </Pressable>
              ) : null}
              <Pressable accessibilityLabel="Close full screen preview" onPress={() => setLightboxOpen(false)} hitSlop={8}>
                <X size={22} color="#ffffff" />
              </Pressable>
            </View>
          </View>
          {media.length > 1 ? (
            <>
              <Pressable
                accessibilityLabel="Previous image"
                style={styles.lightboxNavLeft}
                onPress={() => setActiveMedia((i) => (i - 1 + media.length) % media.length)}
              >
                <ChevronLeft size={24} color="#ffffff" />
              </Pressable>
              <Pressable
                accessibilityLabel="Next image"
                style={styles.lightboxNavRight}
                onPress={() => setActiveMedia((i) => (i + 1) % media.length)}
              >
                <ChevronRight size={24} color="#ffffff" />
              </Pressable>
            </>
          ) : null}
          {currentMedia?.kind === 'video' ? (
            <Video
              source={{ uri: resolveMediaUrl(currentMedia.url) ?? '' }}
              style={styles.lightboxMedia}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              shouldPlay
            />
          ) : (
            <Image
              source={{ uri: resolveMediaUrl(currentMedia?.poster_url ?? currentMedia?.url) ?? '' }}
              style={styles.lightboxMedia}
              resizeMode="contain"
            />
          )}
          {currentMedia?.caption || post?.title ? (
            <Text style={styles.lightboxCaption}>{currentMedia?.caption ?? post?.title}</Text>
          ) : null}
        </View>
      </Modal>

      {/* Attachment preview modal, with the owner's download-permission toggle */}
      <Modal
        visible={previewAttachment !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewAttachment(null)}
      >
        {previewAttachment ? (
          <View style={styles.lightboxScrim}>
            <View style={styles.attachmentPreviewCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
                <Text style={styles.attachmentPreviewTitle} numberOfLines={1}>
                  {previewAttachment.title}
                </Text>
                <Pressable accessibilityLabel="Close document preview" onPress={() => setPreviewAttachment(null)} hitSlop={8}>
                  <X size={18} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>
              <Text style={styles.attachmentPreviewMeta}>
                {previewAttachment.filename}
                {previewAttachment.size_bytes != null ? ` · ${formatBytes(previewAttachment.size_bytes)}` : ''}
              </Text>
              {isOwner ? (
                <Pressable
                  disabled={busy === 'attachment-download'}
                  style={styles.ownerButton}
                  accessibilityLabel="Choose whether readers may download this document"
                  onPress={() => {
                    void (async () => {
                      setBusy('attachment-download');
                      try {
                        const updated = await updateAttachmentDownload(
                          post!.passport_id,
                          previewAttachment.attachment_id,
                          !previewAttachment.allow_download
                        );
                        setPost(updated);
                        setPreviewAttachment(null);
                      } catch (err: unknown) {
                        Alert.alert('Not saved', err instanceof Error ? err.message : 'Could not change the download setting.');
                      } finally {
                        setBusy(null);
                      }
                    })();
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
                    {previewAttachment.allow_download ? (
                      <Download size={14} color={colors.primary} />
                    ) : (
                      <Lock size={14} color={colors.primary} />
                    )}
                    <Text style={styles.ownerButtonText}>
                      Downloads: {previewAttachment.allow_download ? 'on' : 'off'}
                    </Text>
                  </View>
                </Pressable>
              ) : null}
              {previewAttachment.allow_download && previewAttachment.url ? (
                <Pressable
                  style={styles.tonalButton}
                  onPress={() => {
                    void downloadMedia({
                      ...previewAttachment,
                      media_id: previewAttachment.attachment_id,
                      kind: 'image',
                      role: 'other',
                      caption: null,
                      mime_type: previewAttachment.mime_type,
                      sort_order: 0,
                      url: previewAttachment.url,
                      poster_url: null,
                      available: true,
                      is_demo: previewAttachment.is_demo,
                      demo_note: null,
                      created_at: previewAttachment.created_at,
                    });
                    setPreviewAttachment(null);
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
                    <Download size={14} color={colors.primary} />
                    <Text style={styles.tonalText}>Download</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </Modal>

      <ReportDialog
        isOpen={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        targetType={reportTarget?.targetType ?? 'observation'}
        targetId={reportTarget?.targetId ?? ''}
        observationPassportId={reportTarget?.observationPassportId ?? null}
        targetLabel={reportTarget?.label}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  grabberWrap: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  grabber: {
    width: 48,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: '#d6d9dd',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: 'rgba(16,24,32,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 48,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: 80,
    paddingHorizontal: spacing.xl,
  },
  loadErrorClose: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#ffffff',
  },
  loadErrorCloseText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  mediaWrap: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: '#101820',
  },
  mediaFrame: {
    width: '100%',
    aspectRatio: 4 / 3,
    overflow: 'hidden',
  },
  mediaScrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  mediaCounter: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  mediaCounterText: {
    color: '#ffffff',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  lightboxButton: {
    position: 'absolute',
    top: spacing.md,
    right: 52,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaDownload: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaCaption: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    color: '#ffffff',
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 4,
  },
  thumbStrip: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  thumb: {
    width: 56,
    height: 44,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbActive: {
    borderColor: colors.primary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    height: 30,
  },
  chipActive: {
    backgroundColor: '#e6f4ea',
    borderColor: 'rgba(19,115,51,0.3)',
  },
  chipText: {
    fontSize: 12,
    color: colors.onSurface,
    maxWidth: 220,
  },
  notice: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: '#e8f0fe',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  noticeText: {
    fontSize: 12,
    color: '#174ea6',
    lineHeight: 17,
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.onSurfaceVariant,
    flex: 1,
  },
  reportBody: {
    ...typeScale.body,
    color: colors.onSurface,
    lineHeight: 21,
  },
  emptyText: {
    ...typeScale.bodySmall,
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
    padding: spacing.md,
  },
  attachmentTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.onSurface,
  },
  attachmentMeta: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  readOnlyPill: {
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  readOnlyText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.onSurfaceVariant,
  },
  aiPrimary: {
    ...typeScale.body,
    color: colors.onSurface,
    lineHeight: 21,
  },
  aiSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.onSurfaceVariant,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    color: colors.onSurface,
  },
  bulletText: {
    fontSize: 13,
    color: colors.onSurface,
    lineHeight: 19,
    paddingLeft: spacing.sm,
  },
  disclaimer: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    lineHeight: 16,
  },
  safetyNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#ffdf99',
    backgroundColor: '#fff3e0',
    padding: spacing.md,
  },
  safetyNoteText: {
    flex: 1,
    fontSize: 12,
    color: '#9f6108',
    lineHeight: 17,
  },
  questionCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  questionMenuButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionMenu: {
    position: 'absolute',
    right: 0,
    top: 32,
    width: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e5db',
    backgroundColor: '#ffffff',
    padding: 4,
    zIndex: 30,
  },
  questionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  questionMenuItemText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#b3261e',
  },
  questionText: {
    flex: 1,
    ...typeScale.body,
    fontWeight: '500',
    color: colors.onSurface,
    lineHeight: 20,
  },
  answerBlock: {
    gap: spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
    paddingLeft: spacing.md,
  },
  answerText: {
    fontSize: 13,
    color: colors.onSurface,
    lineHeight: 19,
  },
  pendingText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.onSurfaceVariant,
  },
  flagLink: {
    fontSize: 11,
    fontWeight: '500',
    color: '#b3261e',
  },
  discussionBanner: {
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerHigh,
    padding: spacing.md,
  },
  discussionBannerText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    lineHeight: 17,
  },
  signInBanner: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderStyle: 'dashed',
    padding: spacing.lg,
    alignItems: 'center',
  },
  commentCard: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ownerFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.md,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9eaec',
  },
  ownerFooterName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  ownerFooterRole: {
    fontSize: 10,
    color: '#8f8f8f',
    marginTop: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: '#e8f0fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  avatarInitialsSmall: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.onSurface,
  },
  commentMeta: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
  },
  commentBody: {
    fontSize: 13,
    color: colors.onSurface,
    lineHeight: 19,
  },
  commentActions: {
    gap: spacing.sm,
  },
  replyToggle: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.primary,
  },
  replyIndent: {
    paddingLeft: 24,
  },
  replyInput: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
    padding: spacing.md,
    fontSize: 13,
    color: colors.onSurface,
    minHeight: 44,
  },
  replyingTo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  replyingToText: {
    flex: 1,
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  tonalButton: {
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerHigh,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  tonalText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
  },
  primaryButton: {
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.onSurfaceVariant,
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.onSurface,
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  ownerButton: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainer,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  ownerButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
    flexShrink: 1,
  },
  confirmBox: {
    gap: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#f8fafd',
    padding: spacing.md,
  },
  confirmText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    lineHeight: 17,
  },
  locationCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#f8fafd',
    padding: spacing.md,
    gap: spacing.sm,
  },
  locationPlace: {
    fontSize: 13,
    color: colors.onSurface,
    lineHeight: 19,
  },
  locationCoords: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  navigateButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  navigateText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  passportButton: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passportButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  lightboxScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  lightboxTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 56,
    paddingBottom: spacing.md,
  },
  lightboxCounter: {
    color: '#ffffff',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  lightboxMedia: {
    flex: 1,
  },
  lightboxCaption: {
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'center',
    padding: spacing.lg,
  },
  lightboxNavLeft: {
    position: 'absolute',
    left: 4,
    top: '50%',
    transform: [{ translateY: -20 }],
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    zIndex: 10,
  },
  lightboxNavRight: {
    position: 'absolute',
    right: 4,
    top: '50%',
    transform: [{ translateY: -20 }],
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    zIndex: 10,
  },
  titleBlock: {
    borderBottomWidth: 1,
    borderBottomColor: '#e3e3e3',
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: 6,
  },
  postTitle: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 25,
    color: '#1f1f1f',
    flexWrap: 'wrap',
  },
  sharePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f3f4',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sharePillCopied: {
    backgroundColor: '#e6f4ea',
  },
  sharePillText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#3c4043',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 6,
    rowGap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#5e5e5e',
  },
  metaPassportId: {
    fontSize: 11.5,
    fontWeight: '600',
    fontFamily: 'monospace',
    color: '#0b57d0',
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  opBadge: {
    backgroundColor: '#dff2e1',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  opBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#1f6b32',
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#d6dcd3',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  reactionPillHeartActive: {
    borderColor: 'rgba(217,56,74,0.4)',
    backgroundColor: '#fdf2f3',
  },
  reactionPillText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#263029',
  },
  showRepliesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 24,
    paddingTop: 2,
  },
  showRepliesText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#18211b',
  },
  unavailableMediaText: {
    fontSize: 12,
    color: '#aeb8c2',
    textAlign: 'center',
  },
  unavailableMediaSubtext: {
    fontSize: 11,
    color: '#7f8b99',
  },
  stagedImageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stagedImage: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  stagedImageRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
  },
  composerIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d26c2a',
  },
  suggestCard: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    backgroundColor: '#f8fafd',
    overflow: 'hidden',
  },
  suggestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  suggestHeaderText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#0b57d0',
  },
  suggestCount: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#5e5e5e',
  },
  suggestBody: {
    borderTopWidth: 1,
    borderTopColor: '#e3e3e3',
    backgroundColor: 'rgba(240,244,249,0.6)',
    padding: 14,
    gap: 10,
  },
  suggestCopy: {
    fontSize: 11.5,
    lineHeight: 16,
    color: '#5e5e5e',
  },
  suggestSuccess: {
    padding: 8,
    borderRadius: radius.md,
    backgroundColor: '#e6f4ea',
    borderWidth: 1,
    borderColor: 'rgba(19,115,51,0.3)',
  },
  suggestSuccessText: {
    fontSize: 11.5,
    color: '#137333',
  },
  suggestLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#3c4043',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#3c4043',
  },
  fieldSelect: {
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#c7c7c7',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  fieldSelectText: {
    flex: 1,
    fontSize: 13,
    color: '#1f1f1f',
  },
  fieldInput: {
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#c7c7c7',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#1f1f1f',
  },
  fieldInputMono: {
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#c7c7c7',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    color: '#1f1f1f',
  },
  fieldTextArea: {
    height: 84,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  ownerDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e3e3e3',
    paddingTop: spacing.sm,
  },
  editToggleText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0b57d0',
    flexShrink: 1,
  },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e3e3e3',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mediaRowText: {
    flex: 1,
    fontSize: 11,
    color: '#3c4043',
  },
  precisionScrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  precisionSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xl,
  },
  precisionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onSurface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  precisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  precisionRowText: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
  },
  suggestInput: {
    height: 32,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#c7c7c7',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#1f1f1f',
  },
  suggestSubmit: {
    height: 32,
    marginTop: 4,
    borderRadius: radius.md,
    backgroundColor: '#0b57d0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  suggestSubmitText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  attachmentPreviewCard: {
    margin: spacing.lg,
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  attachmentPreviewTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.onSurface,
  },
  attachmentPreviewMeta: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
});
