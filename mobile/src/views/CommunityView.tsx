import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  ExternalLink,
  Flag,
  ImagePlus,
  Images,
  Maximize,
  MessageCircleQuestion,
  Pencil,
  PlusCircle,
  Search,
  Send,
  Share2,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import {
  fetchInvestigations,
  fetchInvestigation,
  fetchSites,
  openInvestigation,
  updateInvestigation,
  castVote,
  checkChecklistItem,
  submitEvidence,
  uploadCommunityMedia,
  communityMediaSrc,
} from '../services/communityApi';
import { useCommunityUser } from '../services/communityAuth';
import { ReportDialog } from '../components/ReportDialog';
import { formatPassportId } from '../lib/format';
import {
  CATEGORY_LABELS,
  EVIDENCE_TYPE_LABELS,
  investigationStatusLabel,
} from '../types/community';
import type {
  CommunityEvidenceType,
  PublicInvestigationDetail,
  PublicInvestigationSummary,
  PublicSiteSummary,
} from '../types/community';
import { colors, radius, spacing, type } from '../lib/theme';

/**
 * Community Discovery — open investigations.
 * Port of the web CommunityDiscoveryView with the mobile narrow-viewport layout:
 * reading is open to everyone; contributing needs a signed-in identity.
 */

const SUBJECT_CATEGORIES = [
  'rock',
  'mineral',
  'fossil',
  'geological_structure',
  'geological_layer',
  'geomorphology',
  'volcanic_feature',
  'hydrogeological_feature',
  'mining_observation',
  'engineering_geology',
  'other_geoscience',
] as const;

const EVIDENCE_TYPES = Object.keys(EVIDENCE_TYPE_LABELS) as CommunityEvidenceType[];

const MAX_ATTACHMENTS = 3;

const subjectLabel = (id: string | null | undefined) =>
  id ? (CATEGORY_LABELS[id] ?? id.replace(/_/g, ' ')) : null;

function shareBase(): string {
  return process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/api\/?$/, '') ?? '';
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

function SectionHeader({
  icon,
  title,
  intro,
}: {
  icon: React.ReactNode;
  title: string;
  intro: string;
}) {
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {icon}
        <Text style={textStyles.sectionHeading}>{title}</Text>
      </View>
      <Text style={textStyles.sectionIntro}>{intro}</Text>
    </View>
  );
}

function CheckSquare({
  checked,
  onPress,
  disabled,
}: {
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.checkbox,
        checked && { backgroundColor: '#0b57d0', borderColor: '#0b57d0' },
        disabled && { opacity: 0.5 },
      ]}
    >
      {checked ? <Check size={14} color="#ffffff" /> : null}
    </Pressable>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Text style={textStyles.fieldLabel}>{label}</Text>
      <Pressable style={({ pressed }) => [styles.selectField, pressed && { opacity: 0.8 }]} onPress={() => setOpen(true)}>
        <Text style={[textStyles.selectValue, !current && { color: '#8f8f8f' }]} numberOfLines={1}>
          {current ? current.label : placeholder}
        </Text>
        <ChevronRight size={14} color="#8f8f8f" style={{ transform: [{ rotate: '90deg' }] }} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheetCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetGrabber} />
            <ScrollView style={{ maxHeight: 420 }}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.7 }]}
                  onPress={() => {
                    onSelect(option.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.sheetRowText, option.value === value && { color: '#0b57d0', fontWeight: '600' }]} numberOfLines={2}>
                    {option.label}
                  </Text>
                  {option.value === value ? <Check size={16} color="#0b57d0" /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Composer (open / edit an investigation)                             */
/* ------------------------------------------------------------------ */

interface ComposerPayload {
  text: string;
  context: string | null;
  category: string | null;
  siteId: string | null;
  options: string[];
  checklist: string[];
  researchInterest: boolean;
  mediaIds: string[];
}

interface ComposerInitial {
  text: string;
  context: string;
  category: string | null;
  siteId: string;
  options: string[];
  checklist: string[];
  researchInterest: boolean;
}

function CommunityComposer({
  sites,
  initial,
  onCancel,
  onSubmit,
}: {
  sites: PublicSiteSummary[];
  /** When provided, the composer edits an existing investigation instead of creating one: site is fixed and attachments are not offered. */
  initial?: ComposerInitial;
  onCancel: () => void;
  onSubmit: (payload: ComposerPayload) => Promise<string>;
}) {
  const isEdit = Boolean(initial);
  const [text, setText] = useState(initial?.text ?? '');
  const [context, setContext] = useState(initial?.context ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [siteId, setSiteId] = useState(initial?.siteId ?? sites[0]?.site_id ?? '');
  const [survey, setSurvey] = useState(Boolean(initial && initial.options.length > 0));
  const [options, setOptions] = useState<string[]>(
    initial && initial.options.length > 0 ? initial.options : ['', ''],
  );
  const [checklist, setChecklist] = useState<string[]>(initial?.checklist ?? []);
  const [researchInterest, setResearchInterest] = useState(initial?.researchInterest ?? false);
  const [attachments, setAttachments] = useState<Array<{ uri: string; mimeType?: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const pickAttachments = async () => {
    if (attachments.length >= MAX_ATTACHMENTS) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library access was declined, so nothing was attached.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
    });
    if (result.canceled) return;
    setAttachments((prev) =>
      [
        ...prev,
        ...result.assets.map((asset) => ({ uri: asset.uri, mimeType: asset.mimeType ?? undefined })),
      ].slice(0, MAX_ATTACHMENTS),
    );
  };

  const handleSubmit = async () => {
    if (!text.trim()) {
      setError('Write the question you want settled.');
      return;
    }
    if (!siteId) {
      setError('Choose the site or area this is about.');
      return;
    }
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (survey && cleanOptions.length < 2) {
      setError('A survey needs at least two answer choices.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const media = await Promise.all(attachments.map((a) => uploadCommunityMedia(a)));
      const cleanChecklist = checklist.map((item) => item.trim()).filter(Boolean);
      const ref = await onSubmit({
        text: text.trim(),
        context: context.trim() || null,
        category: category || null,
        siteId,
        options: survey ? cleanOptions : [],
        checklist: cleanChecklist,
        researchInterest,
        mediaIds: media.map((m) => m.id),
      });
      setReference(ref);
      setText('');
      setContext('');
      setAttachments([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That could not be submitted. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={styles.composer}
      accessibilityLabel={isEdit ? 'Edit investigation' : 'Open an investigation'}
    >
      <Text style={textStyles.composerTitle}>
        {isEdit ? 'Edit this investigation' : 'Open an investigation'}
      </Text>

      <View>
        <Text style={textStyles.fieldLabel}>What should the community settle?</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Example: Is this basalt or granite?"
          placeholderTextColor="#8f8f8f"
          maxLength={500}
          multiline
          style={[styles.field, { minHeight: 56, textAlignVertical: 'top' }]}
        />
        <Text style={textStyles.charCount}>{text.length} / 500</Text>
      </View>

      <View style={{ gap: spacing.md }}>
        <View>
          <SelectField
            label="Site or area"
            value={siteId}
            placeholder={sites.length === 0 ? 'No published sites available' : 'Choose a site'}
            options={[
              ...(isEdit ? [] : [{ value: '', label: 'No specific site' }]),
              ...sites.map((s) => ({ value: s.site_id, label: s.district ? `${s.title} — ${s.district}` : s.title })),
            ]}
            onSelect={setSiteId}
          />
          {isEdit ? (
            <Text style={textStyles.hint}>
              The site cannot be changed after publishing; moving it would change what earlier votes were about.
            </Text>
          ) : null}
          {!isEdit && sites.length === 0 ? (
            <Text style={textStyles.hint}>
              No geological sites have been published yet. Nothing is listed before it genuinely exists, so this list stays empty until a real site is recorded.
            </Text>
          ) : null}
        </View>
        <SelectField
          label="Subject"
          value={category}
          placeholder="Not specified"
          options={[
            { value: '', label: 'Not specified' },
            ...SUBJECT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] ?? c })),
          ]}
          onSelect={setCategory}
        />
      </View>

      <View>
        <Text style={textStyles.fieldLabel}>
          Context <Text style={{ fontWeight: '400', color: '#8f8f8f' }}>(optional)</Text>
        </Text>
        <TextInput
          value={context}
          onChangeText={setContext}
          placeholder="What you saw, where you stood, what makes you unsure."
          placeholderTextColor="#8f8f8f"
          maxLength={1000}
          multiline
          style={[styles.field, { minHeight: 56, textAlignVertical: 'top' }]}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <CheckSquare checked={survey} onPress={() => setSurvey(!survey)} />
          <Text style={textStyles.checkLabel}>Give fixed answer choices (a survey)</Text>
        </View>
        {survey ? (
          <View style={{ gap: spacing.sm, paddingLeft: spacing.xs }}>
            {options.map((opt, index) => (
              <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <TextInput
                  value={opt}
                  onChangeText={(next) => setOptions((prev) => prev.map((o, i) => (i === index ? next : o)))}
                  maxLength={80}
                  placeholder={`Choice ${index + 1}`}
                  placeholderTextColor="#8f8f8f"
                  style={[styles.field, { flex: 1, minHeight: 40 }]}
                />
                {options.length > 2 ? (
                  <Pressable
                    onPress={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                    style={styles.removeButton}
                    accessibilityLabel="Remove choice"
                  >
                    <Trash2 size={16} color="#d32f28" />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {options.length < 8 ? (
              <Pressable onPress={() => setOptions((prev) => [...prev, ''])}>
                <Text style={styles.linkText}>+ Add another choice</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <CheckSquare checked={researchInterest} onPress={() => setResearchInterest(!researchInterest)} />
          <Text style={textStyles.checkLabel}>Flag as a research opportunity</Text>
        </View>

        <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: spacing.sm }}>
          <Text style={textStyles.fieldLabel}>
            Evidence checklist <Text style={{ fontWeight: '400', color: '#8f8f8f' }}>(optional)</Text>
          </Text>
          <Text style={textStyles.hint}>
            List what you would need to settle this. Others can mark which items they can provide.
          </Text>
          {checklist.map((item, index) => (
            <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <TextInput
                value={item}
                onChangeText={(next) => setChecklist((prev) => prev.map((v, i) => (i === index ? next : v)))}
                maxLength={120}
                placeholder="e.g. a clear close-up of a fresh surface"
                placeholderTextColor="#8f8f8f"
                style={[styles.field, { flex: 1, minHeight: 40 }]}
              />
              <Pressable
                onPress={() => setChecklist((prev) => prev.filter((_, i) => i !== index))}
                style={styles.removeButton}
                accessibilityLabel="Remove checklist item"
              >
                <Trash2 size={16} color="#8f8f8f" />
              </Pressable>
            </View>
          ))}
          {checklist.length < 8 ? (
            <Pressable onPress={() => setChecklist((prev) => [...prev, ''])}>
              <Text style={styles.linkText}>+ Add an evidence request</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {!isEdit ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Pressable
              onPress={() => void pickAttachments()}
              disabled={attachments.length >= MAX_ATTACHMENTS}
              style={({ pressed }) => [
                styles.attachButton,
                attachments.length >= MAX_ATTACHMENTS && { opacity: 0.5 },
                pressed && { opacity: 0.7 },
              ]}
            >
              <ImagePlus size={16} color="#3c4043" />
              <Text style={textStyles.attachText}>Add photo</Text>
            </Pressable>
            <Text style={[textStyles.hint, { flex: 1, minWidth: 160 }]}>
              Up to {MAX_ATTACHMENTS} images. Files are validated and, on a live deployment, reviewed before display.
            </Text>
          </View>
          {attachments.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {attachments.map((a, index) => (
                <View key={index} style={styles.attachmentThumb}>
                  <Image source={{ uri: a.uri }} style={styles.attachmentImage} />
                  <Pressable
                    style={styles.attachmentRemove}
                    onPress={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                    accessibilityLabel="Remove attachment"
                  >
                    <X size={12} color="#ffffff" />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <View style={styles.composerError}>
          <AlertTriangle size={14} color="#d32f28" style={{ marginTop: 2 }} />
          <Text style={textStyles.composerErrorText}>{error}</Text>
        </View>
      ) : null}

      {reference ? (
        <View style={styles.composerSuccess}>
          <Text style={textStyles.composerSuccessText}>
            {isEdit ? 'Saved. ' : 'Created. '}
            {isEdit
              ? 'Your correction is now shown to everyone.'
              : 'Reference: '}
            {!isEdit ? (
              <Text style={{ fontFamily: 'monospace', fontWeight: '600' }}>{reference}</Text>
            ) : null}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Pressable
          onPress={() => void handleSubmit()}
          disabled={busy}
          style={({ pressed }) => [
            styles.greenButton,
            busy && { opacity: 0.5 },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Send size={14} color="#ffffff" />
          <Text style={textStyles.greenButtonText}>
            {busy ? 'Submitting…' : isEdit ? 'Save changes' : 'Open investigation'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          disabled={busy}
          style={styles.neutralButton}
          accessibilityLabel="Close modal"
        >
          <Text style={textStyles.neutralButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Investigation card                                                  */
/* ------------------------------------------------------------------ */

function InvestigationCard({
  investigation,
  canContribute,
  onRequireSignIn,
  onVoted,
  onEdit,
}: {
  investigation: PublicInvestigationSummary;
  canContribute: boolean;
  onRequireSignIn?: () => void;
  onVoted: () => void;
  onEdit?: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [vote, setVote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState(investigation.checklist);
  const [checkBusy, setCheckBusy] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [detail, setDetail] = useState<PublicInvestigationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [evidenceType, setEvidenceType] = useState<CommunityEvidenceType>('close_up');
  const [evidenceText, setEvidenceText] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceNotice, setEvidenceNotice] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => setChecklist(investigation.checklist), [investigation.checklist]);

  const isSurvey = investigation.options.length > 0;
  const hasMedia = Boolean(investigation.media_ids && investigation.media_ids.length > 0);
  const mediaCount = investigation.media_ids?.length ?? 0;
  const activeMediaId = hasMedia
    ? investigation.media_ids[activeMediaIndex] ?? investigation.media_ids[0]
    : null;
  const activeMediaSrc = activeMediaId
    ? activeMediaId.startsWith('/') || activeMediaId.startsWith('http')
      ? activeMediaId
      : communityMediaSrc(activeMediaId)
    : null;

  const showPrevMedia = () => setActiveMediaIndex((i) => (i - 1 + mediaCount) % mediaCount);
  const showNextMedia = () => setActiveMediaIndex((i) => (i + 1) % mediaCount);

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      setDetail(await fetchInvestigation(investigation.public_id));
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, [investigation.public_id]);

  useEffect(() => {
    if (modalOpen && !detail) void loadDetail();
  }, [modalOpen, detail, loadDetail]);

  const openWeighInModal = () => {
    setModalOpen(true);
    if (!detail) void loadDetail();
  };

  const shareInvestigationLink = async () => {
    const url = `${shareBase()}/?view=community&panel=investigations&investigation=${encodeURIComponent(investigation.public_id)}`;
    await Clipboard.setStringAsync(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleEvidence = async () => {
    if (!canContribute) {
      onRequireSignIn?.();
      return;
    }
    if (!evidenceText.trim()) {
      setEvidenceError('Describe what you observed first.');
      return;
    }
    setEvidenceBusy(true);
    setEvidenceError(null);
    setEvidenceNotice(null);
    try {
      let mediaIds: string[] = [];
      if (evidenceFile) {
        const media = await uploadCommunityMedia(evidenceFile);
        mediaIds = [media.id];
      }
      await submitEvidence({
        investigationId: investigation.public_id,
        evidenceType,
        explanation: evidenceText.trim(),
        mediaIds,
      });
      setEvidenceText('');
      setEvidenceFile(null);
      setEvidenceNotice('Your evidence was recorded for this investigation.');
      await loadDetail();
      onVoted();
    } catch (err: unknown) {
      setEvidenceError(err instanceof Error ? err.message : 'Your evidence was not recorded.');
    } finally {
      setEvidenceBusy(false);
    }
  };

  const pickEvidenceFile = async () => {
    if (!canContribute) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setEvidenceError('Photo library access was declined, so nothing was attached.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    setEvidenceFile({
      uri: result.assets[0].uri,
      mimeType: result.assets[0].mimeType ?? undefined,
    });
  };

  const toggleCheck = async (itemId: string, checked: boolean) => {
    if (!canContribute) {
      onRequireSignIn?.();
      return;
    }
    setCheckBusy(itemId);
    setError(null);
    try {
      const result = await checkChecklistItem(investigation.public_id, itemId, checked);
      setChecklist((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, viewer_checked: result.checked, check_count: result.check_count }
            : item,
        ),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Your check was not recorded.');
    } finally {
      setCheckBusy(null);
    }
  };

  const handleVote = async () => {
    if (!canContribute) {
      onRequireSignIn?.();
      return;
    }
    if (!vote.trim()) {
      setError(isSurvey ? 'Choose an option before voting.' : 'Enter your view before voting.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await castVote(investigation.public_id, vote.trim());
      setMessage(result.message);
      setVote('');
      onVoted();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Your vote was not recorded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.investigationCard}>
      {/* Hero media banner */}
      <Pressable
        style={styles.hero}
        accessibilityLabel={activeMediaSrc ? 'View full screen image' : undefined}
        onPress={() => {
          if (activeMediaSrc) setLightboxOpen(true);
          else openWeighInModal();
        }}
      >
        {activeMediaSrc ? (
          <Image source={{ uri: activeMediaSrc }} style={styles.heroImage} />
        ) : (
          <LinearGradientPlaceholder label={subjectLabel(investigation.category) ?? 'Geological Field Investigation'} />
        )}

        <View style={styles.heroTopRow} pointerEvents="none">
          <View style={styles.statusPill}>
            {investigation.status === 'open' ? <View style={styles.statusDot} /> : null}
            <Text style={textStyles.statusText}>{investigationStatusLabel(investigation.status)}</Text>
          </View>
          {isSurvey ? (
            <View style={styles.surveyPill}>
              <Text style={textStyles.surveyText}>Survey</Text>
            </View>
          ) : null}
        </View>

        {activeMediaSrc || (hasMedia && mediaCount > 1) ? (
          <View style={styles.heroBottomRow} pointerEvents="box-none">
            {activeMediaSrc ? (
              <Pressable
                style={styles.heroButton}
                onPress={() => setLightboxOpen(true)}
              >
                <Maximize size={16} color="#ffffff" />
              </Pressable>
            ) : null}
            {hasMedia && mediaCount > 1 ? (
              <View style={styles.mediaSwitcher}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 }}>
                  <Images size={14} color="rgba(255,255,255,0.8)" />
                  <Text style={textStyles.mediaCountText}>{mediaCount}</Text>
                </View>
                {investigation.media_ids.map((id, idx) => {
                  const src = id.startsWith('/') || id.startsWith('http') ? id : communityMediaSrc(id);
                  const isSelected = activeMediaIndex === idx;
                  return (
                    <Pressable key={`${id}-${idx}`} onPress={() => setActiveMediaIndex(idx)}>
                      <Image
                        source={{ uri: src }}
                        style={[styles.mediaThumb, isSelected ? styles.mediaThumbActive : styles.mediaThumbIdle]}
                      />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}
      </Pressable>

      {/* Full screen image lightbox */}
      <Modal visible={lightboxOpen && Boolean(activeMediaSrc)} transparent animationType="fade" onRequestClose={() => setLightboxOpen(false)}>
        <View style={styles.lightboxBackdrop}>
          <Pressable style={styles.lightboxClose} onPress={() => setLightboxOpen(false)} accessibilityLabel="Close full screen image">
            <X size={20} color="#ffffff" />
          </Pressable>
          {mediaCount > 1 ? (
            <View style={styles.lightboxCounter}>
              <Text style={textStyles.lightboxCounterText}>
                {activeMediaIndex + 1} / {mediaCount}
              </Text>
            </View>
          ) : null}
          {mediaCount > 1 ? (
            <>
              <Pressable style={[styles.lightboxNav, { left: 12 }]} onPress={showPrevMedia} accessibilityLabel="Previous image">
                <ChevronLeft size={24} color="#ffffff" />
              </Pressable>
              <Pressable style={[styles.lightboxNav, { right: 12 }]} onPress={showNextMedia} accessibilityLabel="Next image">
                <ChevronRight size={24} color="#ffffff" />
              </Pressable>
            </>
          ) : null}
          {activeMediaSrc ? (
            <Image
              source={{ uri: activeMediaSrc }}
              style={styles.lightboxImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>

      {/* Card body */}
      <View style={styles.cardBody}>
        <Pressable onPress={openWeighInModal}>
          <Text style={textStyles.cardQuestion} numberOfLines={2}>
            {investigation.question}
          </Text>
          {investigation.context ? (
            <Text style={textStyles.cardContext} numberOfLines={2}>
              {investigation.context}
            </Text>
          ) : null}
        </Pressable>

        <View style={styles.cardFooter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', flex: 1 }}>
            <Text style={textStyles.monoId}>{formatPassportId(investigation.public_id)}</Text>
            <Text style={textStyles.metaText}>· {investigation.evidence_count} evidence</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.weighInButton, pressed && { opacity: 0.85 }]}
            onPress={openWeighInModal}
          >
            <Text style={textStyles.weighInText}>Weigh in & Vote</Text>
            <ChevronRight size={14} color="#ffffff" />
          </Pressable>
        </View>

        <View style={styles.cardMetaRow}>
          <Text style={textStyles.metaDim}>{new Date(investigation.created_at).toLocaleDateString()}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            {onEdit ? (
              <Pressable
                style={({ pressed }) => [styles.metaAction, pressed && { opacity: 0.7 }]}
                onPress={onEdit}
                accessibilityLabel="Edit investigation"
              >
                <Pencil size={14} color="#0b57d0" />
                <Text style={[textStyles.metaActionText, { color: '#0b57d0' }]}>Edit</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={({ pressed }) => [
                styles.metaAction,
                linkCopied && { backgroundColor: '#e6f4ea' },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => void shareInvestigationLink()}
              accessibilityLabel="Share this investigation"
            >
              {linkCopied ? <Check size={14} color="#137333" /> : <Share2 size={14} color="#5e5e5e" />}
              <Text style={[textStyles.metaActionText, linkCopied && { color: '#137333' }]}>
                {linkCopied ? 'Copied' : 'Share'}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.metaAction, pressed && { opacity: 0.7 }]}
              onPress={() => setReporting(true)}
              accessibilityLabel="Report this investigation"
            >
              <Flag size={14} color="#5e5e5e" />
              <Text style={textStyles.metaActionText}>Report</Text>
            </Pressable>
          </View>
        </View>

        {reporting ? (
          <ReportDialog
            isOpen
            onClose={() => setReporting(false)}
            targetType="investigation"
            targetId={investigation.public_id}
            targetLabel={investigation.question}
          />
        ) : null}

        {/* Weigh in & Vote modal */}
        <Modal
          visible={modalOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setModalOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <Pressable style={styles.modalBackdropPress} onPress={() => setModalOpen(false)} />
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                    <Text style={textStyles.monoId}>{formatPassportId(investigation.public_id)}</Text>
                    <Text style={textStyles.metaText}>· {investigation.evidence_count} evidence</Text>
                  </View>
                  <Text style={textStyles.modalQuestion}>{investigation.question}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.headerShareButton,
                      linkCopied && { borderColor: '#13733350', backgroundColor: '#e6f4ea' },
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => void shareInvestigationLink()}
                    accessibilityLabel="Share investigation link"
                  >
                    {linkCopied ? <Check size={14} color="#137333" /> : <Share2 size={14} color="#3c4043" />}
                    <Text style={[textStyles.metaActionText, linkCopied && { color: '#137333' }]}>
                      {linkCopied ? 'Copied' : 'Share'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.modalClose}
                    onPress={() => setModalOpen(false)}
                    accessibilityLabel="Close Weigh in and Vote dialog"
                  >
                    <X size={20} color="#5e5e5e" />
                  </Pressable>
                </View>
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalBody}>
                {investigation.context ? (
                  <Text style={textStyles.modalContext}>{investigation.context}</Text>
                ) : null}

                {/* Community consensus */}
                {investigation.vote_distribution.length > 0 ? (
                  <View style={styles.consensusBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <BarChart3 size={16} color="#0b57d0" />
                        <Text style={textStyles.consensusTitle}>Community Consensus</Text>
                      </View>
                      <Text style={textStyles.consensusCount}>{investigation.vote_count} total votes</Text>
                    </View>
                    <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                      {investigation.vote_distribution.map((tally, idx) => {
                        const isLeading = idx === 0 && tally.count > 0;
                        return (
                          <View key={tally.option} style={{ gap: 4 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Text
                                style={[textStyles.tallyOption, isLeading && { fontWeight: '600', color: '#1f1f1f' }]}
                                numberOfLines={1}
                              >
                                {tally.option}
                              </Text>
                              <Text style={textStyles.tallyCount}>
                                {tally.count} ({tally.share_pct}%)
                              </Text>
                            </View>
                            <View style={styles.tallyTrack}>
                              <View
                                style={[
                                  styles.tallyFill,
                                  {
                                    width: `${Math.min(100, tally.share_pct)}%`,
                                    backgroundColor: isLeading ? '#0b57d0' : '#70a5f9',
                                  },
                                ]}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {/* Checklist */}
                {checklist.length > 0 ? (
                  <View style={styles.checklistBox}>
                    <Text style={textStyles.checklistTitle}>What the community can provide</Text>
                    {checklist.map((item) => (
                      <View key={item.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                        <CheckSquare
                          checked={item.viewer_checked}
                          disabled={checkBusy === item.id}
                          onPress={() => void toggleCheck(item.id, !item.viewer_checked)}
                        />
                        <Text style={[textStyles.checklistText, { flex: 1 }]}>{item.text}</Text>
                        <Text style={textStyles.checklistCount}>{item.check_count} confirmed</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/* Voting */}
                <View style={{ gap: spacing.sm }}>
                  <Text style={textStyles.voteHeading}>
                    {isSurvey ? 'Select your interpretation:' : 'Add your view:'}
                  </Text>
                  {isSurvey ? (
                    <View style={{ gap: spacing.sm }}>
                      {investigation.options.map((option) => (
                        <Pressable
                          key={option}
                          onPress={() => setVote(option)}
                          disabled={!canContribute}
                          style={({ pressed }) => [
                            styles.voteOption,
                            vote === option ? styles.voteOptionActive : pressed && { backgroundColor: '#f0f4f9' },
                            !canContribute && { opacity: 0.6 },
                          ]}
                        >
                          <View
                            style={[styles.radioOuter, vote === option && { borderColor: '#0b57d0' }]}
                          >
                            {vote === option ? <View style={styles.radioInner} /> : null}
                          </View>
                          <Text style={textStyles.voteOptionText}>{option}</Text>
                        </Pressable>
                      ))}
                      <Pressable
                        onPress={() => void handleVote()}
                        disabled={busy || !canContribute}
                        style={({ pressed }) => [
                          styles.blueButton,
                          (busy || !canContribute) && { opacity: 0.5 },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <ThumbsUp size={16} color="#ffffff" />
                        <Text style={textStyles.blueButtonText}>
                          {busy ? 'Recording vote…' : 'Submit Vote'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ gap: spacing.sm }}>
                      <TextInput
                        value={vote}
                        onChangeText={setVote}
                        placeholder="Your interpretation or observation"
                        placeholderTextColor="#8f8f8f"
                        maxLength={80}
                        editable={canContribute}
                        style={styles.field}
                      />
                      <Pressable
                        onPress={() => void handleVote()}
                        disabled={busy || !canContribute}
                        style={({ pressed }) => [
                          styles.blueButton,
                          { alignSelf: 'flex-start' },
                          (busy || !canContribute) && { opacity: 0.5 },
                          pressed && { opacity: 0.85 },
                        ]}
                      >
                        <ThumbsUp size={16} color="#ffffff" />
                        <Text style={textStyles.blueButtonText}>{busy ? 'Recording…' : 'Submit Vote'}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Evidence gathered */}
                <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: '#e3e3e3', paddingTop: spacing.md }}>
                  <Text style={textStyles.evidenceHeading}>
                    Evidence gathered ({investigation.evidence_count})
                  </Text>
                  {loadingDetail ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator size="small" color="#8f8f8f" />
                      <Text style={textStyles.hint}>Loading evidence…</Text>
                    </View>
                  ) : detail && detail.evidence.length > 0 ? (
                    <View style={{ gap: spacing.sm }}>
                      {detail.evidence.map((item) => (
                        <View key={item.id} style={styles.evidenceItem}>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
                            <Text style={textStyles.evidenceTypeText}>
                              {EVIDENCE_TYPE_LABELS[item.evidence_type] ?? item.evidence_type.replace(/_/g, ' ')}
                            </Text>
                            {item.supports_evidence ? (
                              <View style={styles.supportsChip}>
                                <Text style={textStyles.supportsText}>supports</Text>
                              </View>
                            ) : null}
                            {item.is_challenge ? (
                              <View style={styles.challengesChip}>
                                <Text style={textStyles.challengesText}>challenges</Text>
                              </View>
                            ) : null}
                            <Text style={textStyles.metaText}>· {item.contributor_handle}</Text>
                            <Text style={textStyles.metaText}>· {new Date(item.created_at).toLocaleDateString()}</Text>
                          </View>
                          {item.explanation ? (
                            <Text style={textStyles.evidenceExplanation}>{item.explanation}</Text>
                          ) : null}
                          {item.media_ids.length > 0 ? (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm }}>
                              {item.media_ids.map((id) => {
                                const src = id.startsWith('/') || id.startsWith('http') ? id : communityMediaSrc(id);
                                return (
                                  <Image
                                    key={id}
                                    source={{ uri: src }}
                                    accessibilityLabel="Evidence attachment"
                                    style={styles.evidenceMedia}
                                  />
                                );
                              })}
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={textStyles.hint}>No evidence items attached yet.</Text>
                  )}

                  {/* Add evidence */}
                  <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: spacing.sm }}>
                    <Text style={textStyles.evidenceHeading}>Add evidence</Text>
                    <View style={{ gap: spacing.sm }}>
                      <SelectField
                        label="Kind of evidence"
                        value={evidenceType}
                        placeholder={EVIDENCE_TYPE_LABELS[evidenceType]}
                        options={EVIDENCE_TYPES.map((t) => ({ value: t, label: EVIDENCE_TYPE_LABELS[t] }))}
                        onSelect={(v) => setEvidenceType(v as CommunityEvidenceType)}
                      />
                      <Pressable
                        onPress={() => void pickEvidenceFile()}
                        disabled={!canContribute}
                        style={({ pressed }) => [
                          styles.attachButton,
                          { alignSelf: 'flex-start' },
                          !canContribute && { opacity: 0.5 },
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <ImagePlus size={16} color="#5e5e5e" />
                        <Text style={textStyles.attachText} numberOfLines={1}>
                          {evidenceFile ? 'Photo attached' : 'Attach a photo (optional)'}
                        </Text>
                      </Pressable>
                    </View>
                    <TextInput
                      value={evidenceText}
                      onChangeText={setEvidenceText}
                      placeholder="Describe field evidence, texture, coordinates or context..."
                      placeholderTextColor="#8f8f8f"
                      maxLength={2000}
                      multiline
                      editable={canContribute}
                      style={[styles.field, { minHeight: 56, textAlignVertical: 'top' }]}
                    />
                    <Pressable
                      onPress={() => void handleEvidence()}
                      disabled={evidenceBusy || !canContribute}
                      style={({ pressed }) => [
                        styles.greenButton,
                        { alignSelf: 'flex-start' },
                        (evidenceBusy || !canContribute) && { opacity: 0.5 },
                        pressed && { opacity: 0.85 },
                      ]}
                    >
                      <Send size={14} color="#ffffff" />
                      <Text style={textStyles.greenButtonText}>
                        {evidenceBusy ? 'Recording…' : 'Submit Evidence'}
                      </Text>
                    </Pressable>
                    {evidenceNotice ? (
                      <Text style={textStyles.noticeGreen}>{evidenceNotice}</Text>
                    ) : null}
                    {evidenceError ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={12} color="#d32f28" />
                        <Text style={textStyles.errorText}>{evidenceError}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {message ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <ExternalLink size={12} color="#2b7f3f" />
                    <Text style={textStyles.noticeGreen}>{message}</Text>
                  </View>
                ) : null}
                {error ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={12} color="#d32f28" />
                    <Text style={textStyles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Text style={textStyles.disclaimerText}>{investigation.disclaimer}</Text>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

/** Dark gradient stand-in for investigations without an attached photo. */
function LinearGradientPlaceholder({ label }: { label: string }) {
  return (
    <View style={styles.heroPlaceholder}>
      <View style={styles.heroPlaceholderIcon}>
        <Compass size={24} color="#70a5f9" />
      </View>
      <Text style={textStyles.heroPlaceholderText}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Community view                                                      */
/* ------------------------------------------------------------------ */

export function CommunityView({
  onSignIn,
}: {
  onSignIn: () => void;
}) {
  const user = useCommunityUser();
  const [investigations, setInvestigations] = useState<PublicInvestigationSummary[]>([]);
  const [sites, setSites] = useState<PublicSiteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [showNewInvestigation, setShowNewInvestigation] = useState(false);
  const [editingInvestigation, setEditingInvestigation] = useState<PublicInvestigationSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [investigationQuery, setInvestigationQuery] = useState('');
  const [investigationFilter, setInvestigationFilter] = useState<'all' | 'open' | 'survey'>('all');

  const requireSignIn = useCallback((): boolean => {
    if (user) return true;
    onSignIn();
    return false;
  }, [user, onSignIn]);

  const needle = investigationQuery.trim().toLowerCase();
  const filteredInvestigations = useMemo(
    () =>
      investigations.filter((inv) => {
        if (investigationFilter === 'open' && inv.status !== 'open') return false;
        if (investigationFilter === 'survey' && inv.options.length === 0) return false;
        if (!needle) return true;
        return [inv.question, inv.context ?? '', inv.public_id, inv.category ?? ''].some((val) =>
          String(val).toLowerCase().includes(needle),
        );
      }),
    [investigations, investigationFilter, needle],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnavailable(false);
    try {
      const [i, s] = await Promise.all([
        fetchInvestigations({ limit: 30 }),
        fetchSites({ limit: 200 }).catch(() => ({ rows: [], total: 0 })),
      ]);
      setInvestigations(i.rows);
      setSites(s.rows);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not load community data.';
      setError(message);
      // A 503 means the community database is not configured, which is a
      // different situation from "there is nothing here yet".
      setUnavailable(/unavailable|not configured/i.test(message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.primary}
          />
        }
      >
        {unavailable ? (
          <View style={styles.unavailableBanner}>
            <AlertTriangle size={20} color="#9f6108" style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={textStyles.unavailableTitle}>
                Community features are not available right now.
              </Text>
              <Text style={textStyles.unavailableBody}>
                Please try again shortly. Nothing you submit will be recorded. This does not mean there are no contributions.
              </Text>
            </View>
          </View>
        ) : null}

        {error && !unavailable ? (
          <View style={styles.errorBanner}>
            <AlertTriangle size={20} color="#d32f28" style={{ marginTop: 2 }} />
            <Text style={[textStyles.errorText, { flex: 1 }]}>{error}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: spacing.xxl }}>
            <ActivityIndicator size="small" color="#5e5e5e" />
            <Text style={textStyles.loadingText}>Loading community data…</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }}>
              <View style={{ flex: 1, minWidth: 240 }}>
                <SectionHeader
                  icon={<Search size={24} color="#2b7f3f" />}
                  title="Community investigations"
                  intro="An investigation is a public question about a rock or site that anyone can help settle with fixed choices and photos."
                />
              </View>
              <Pressable
                style={({ pressed }) => [styles.greenButton, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  if (!requireSignIn()) return;
                  setShowNewInvestigation(true);
                }}
              >
                <PlusCircle size={16} color="#ffffff" />
                <Text style={textStyles.greenButtonText}>Open investigation</Text>
              </Pressable>
            </View>

            {investigations.length > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  height: 44,
                  borderRadius: radius.full,
                  borderWidth: 1,
                  borderColor: '#dde3ea',
                  backgroundColor: '#ffffff',
                  paddingHorizontal: 14,
                }}
              >
                <Search size={16} color="#5e5e5e" />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: '#1f1f1f', padding: 0 }}
                  value={investigationQuery}
                  onChangeText={setInvestigationQuery}
                  placeholder="Search investigations by topic, rock, or ID"
                  placeholderTextColor="#5e5e5e"
                  accessibilityLabel="Search community investigations"
                />
                {investigationQuery ? (
                  <Pressable
                    onPress={() => setInvestigationQuery('')}
                    accessibilityLabel="Clear search"
                    hitSlop={6}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  >
                    <X size={16} color="#5e5e5e" />
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {investigations.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
              >
                {([
                  { id: 'all', label: `All (${investigations.length})` },
                  { id: 'open', label: 'Open' },
                  { id: 'survey', label: 'Surveys' },
                ] as const).map((chip) => (
                  <Pressable
                    key={chip.id}
                    onPress={() => setInvestigationFilter(chip.id)}
                    style={({ pressed }) => [
                      styles.investigationChip,
                      investigationFilter === chip.id && styles.investigationChipActive,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.investigationChipText,
                        investigationFilter === chip.id && styles.investigationChipTextActive,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            {showNewInvestigation ? (
              <CommunityComposer
                sites={sites}
                onCancel={() => setShowNewInvestigation(false)}
                onSubmit={async (payload) => {
                  const created = await openInvestigation({
                    question: payload.text,
                    context: payload.context,
                    category: payload.category,
                    options: payload.options,
                    checklist: payload.checklist,
                    researchInterest: payload.researchInterest,
                    siteId: payload.siteId,
                    mediaIds: payload.mediaIds,
                  });
                  setShowNewInvestigation(false);
                  setInvestigations((prev) => [created, ...prev]);
                  return created.public_id;
                }}
              />
            ) : null}

            {editingInvestigation ? (
              <CommunityComposer
                sites={sites}
                initial={{
                  text: editingInvestigation.question,
                  context: editingInvestigation.context ?? '',
                  category: editingInvestigation.category,
                  siteId: editingInvestigation.site_id ?? '',
                  options: editingInvestigation.options,
                  checklist: editingInvestigation.checklist.map((item) => item.text),
                  researchInterest: editingInvestigation.research_interest,
                }}
                onCancel={() => setEditingInvestigation(null)}
                onSubmit={async (payload) => {
                  const updated = await updateInvestigation(editingInvestigation.public_id, {
                    question: payload.text,
                    context: payload.context,
                    category: payload.category,
                    options: payload.options,
                    checklist: payload.checklist,
                    researchInterest: payload.researchInterest,
                  });
                  setInvestigations((prev) =>
                    prev.map((i) => (i.public_id === updated.public_id ? updated : i)),
                  );
                  setEditingInvestigation(null);
                  return updated.public_id;
                }}
              />
            ) : null}

            {investigations.length === 0 ? (
              <View style={{ paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.xs }}>
                <View style={styles.emptyIllustration}>
                  <MessageCircleQuestion size={32} color="#2b7f3f" />
                  <View style={styles.emptyIllustrationBadge}>
                    <Search size={14} color="#e37400" />
                  </View>
                </View>
                <Text style={textStyles.emptyTitle}>No community investigations yet</Text>
                <Text style={[textStyles.emptyBody, { textAlign: 'center' }]}>
                  An investigation is a public question about a rock or site. When one is opened, anyone
                  can vote and add what they observed. Nobody has opened one yet.
                </Text>
              </View>
            ) : filteredInvestigations.length === 0 ? (
              <View
                style={{
                  borderRadius: radius.xl,
                  borderWidth: 1,
                  borderColor: '#dde3ea',
                  backgroundColor: '#ffffff',
                  padding: 40,
                  alignItems: 'center',
                }}
              >
                <Text style={[textStyles.emptyBody, { textAlign: 'center' }]}>
                  No investigations match your current search or filter.
                </Text>
              </View>
            ) : (
              <View style={{ gap: spacing.lg }}>
                {filteredInvestigations.map((inv) => (
                  <InvestigationCard
                    key={inv.public_id}
                    investigation={inv}
                    canContribute={Boolean(user)}
                    onRequireSignIn={onSignIn}
                    onVoted={() => void load()}
                    onEdit={inv.viewer_is_owner ? () => setEditingInvestigation(inv) : undefined}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const textStyles = StyleSheet.create({
  sectionHeading: {
    fontSize: 22,
    fontWeight: '500',
    color: '#1f1f1f',
    flexShrink: 1,
  },
  checkLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3c4043',
    flex: 1,
  },
  unavailableTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9f6108',
  },
  unavailableBody: {
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(159, 97, 8, 0.8)',
    marginTop: 4,
  },
  sectionIntro: {
    fontSize: 13,
    lineHeight: 19,
    color: '#5e5e5e',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3c4043',
    marginBottom: 6,
  },
  charCount: {
    fontSize: 11,
    color: '#8f8f8f',
    textAlign: 'right',
    marginTop: 2,
  },
  hint: {
    fontSize: 11,
    lineHeight: 15,
    color: '#8f8f8f',
    marginTop: 4,
  },
  selectValue: {
    fontSize: 13,
    color: '#1f1f1f',
    flex: 1,
  },
  composerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  composerErrorText: {
    flex: 1,
    fontSize: 12,
    color: '#d32f28',
  },
  composerSuccessText: {
    fontSize: 12,
    color: '#2b7f3f',
  },
  greenButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#ffffff',
  },
  neutralButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#3c4043',
  },
  attachText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3c4043',
    maxWidth: 180,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  surveyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  mediaCountText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#ffffff',
  },
  cardQuestion: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f1f1f',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  cardContext: {
    fontSize: 12,
    lineHeight: 17,
    color: '#4a5568',
    marginTop: 6,
  },
  monoId: {
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#0b57d0',
  },
  metaText: {
    fontSize: 11.5,
    color: '#5e5e5e',
  },
  weighInText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  metaDim: {
    fontSize: 11,
    color: '#8f8f8f',
  },
  metaActionText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#5e5e5e',
  },
  modalQuestion: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f1f1f',
    lineHeight: 22,
  },
  modalContext: {
    fontSize: 13,
    lineHeight: 19,
    color: '#4a5568',
  },
  consensusTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0b57d0',
  },
  consensusCount: {
    fontSize: 11,
    fontWeight: '400',
    color: '#5e5e5e',
  },
  tallyOption: {
    fontSize: 12,
    color: '#4a5568',
    maxWidth: '72%',
  },
  tallyCount: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '500',
    color: '#5e5e5e',
  },
  checklistTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3c4043',
    marginBottom: spacing.xs,
  },
  checklistText: {
    fontSize: 12,
    color: '#3c4043',
  },
  checklistCount: {
    fontSize: 11,
    color: '#8f8f8f',
  },
  voteHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  voteOptionText: {
    flex: 1,
    fontSize: 13,
    color: '#3c4043',
  },
  blueButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#ffffff',
  },
  evidenceHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  evidenceTypeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3c4043',
  },
  supportsText: {
    fontSize: 11,
    color: '#2b7f3f',
  },
  challengesText: {
    fontSize: 11,
    color: '#b3261e',
  },
  evidenceExplanation: {
    fontSize: 12,
    lineHeight: 17,
    color: '#1f1f1f',
  },
  noticeGreen: {
    fontSize: 12,
    color: '#2b7f3f',
  },
  errorText: {
    fontSize: 12,
    color: '#d32f28',
  },
  disclaimerText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#8f8f8f',
    paddingTop: spacing.xs,
  },
  amberText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#9f6108',
  },
  loadingText: {
    fontSize: 13,
    color: '#5e5e5e',
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  emptyBody: {
    fontSize: 12,
    lineHeight: 17,
    color: '#5e5e5e',
  },
  lightboxCounterText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#ffffff',
  },
  heroPlaceholderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 3,
    gap: spacing.lg,
  },
  unavailableBanner: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: '#fef7e0',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
  },
  unavailableTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9f6108',
  },
  unavailableBody: {
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(159, 97, 8, 0.8)',
    marginTop: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: '#ffdad8',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  greenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#2b7f3f',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  neutralButton: {
    backgroundColor: '#eef1f6',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  composer: {
    padding: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: '#c7c7c7',
    gap: spacing.lg,
  },
  field: {
    backgroundColor: '#f8fafd',
    borderWidth: 1,
    borderColor: '#c7c7c7',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 13,
    color: '#1f1f1f',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#c7c7c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#f8fafd',
    borderWidth: 1,
    borderColor: '#c7c7c7',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.xl,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.outlineVariant,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sheetRowText: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
  },
  removeButton: {
    padding: 6,
    borderRadius: radius.sm,
  },
  investigationChip: {
    height: 32,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,64,67,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3c4043',
    shadowOpacity: 0.1,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  investigationChipActive: {
    backgroundColor: '#d3e3fd',
  },
  investigationChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5e5e5e',
  },
  investigationChipTextActive: {
    color: '#041e49',
  },
  linkText: {
    fontSize: 12,
    color: '#0b57d0',
    textDecorationLine: 'underline',
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#eef1f6',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  attachmentThumb: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e3e3e3',
  },
  attachmentImage: {
    width: '100%',
    height: '100%',
  },
  attachmentRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    padding: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  composerError: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: '#ffdad8',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  composerSuccess: {
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: '#c4eed0',
    borderWidth: 1,
    borderColor: 'rgba(43, 127, 63, 0.3)',
  },
  investigationCard: {
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    overflow: 'hidden',
  },
  hero: {
    width: '100%',
    aspectRatio: 1.6,
    backgroundColor: '#f0f4f9',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#101824',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  heroPlaceholderIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTopRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#137333',
  },
  surveyPill: {
    backgroundColor: 'rgba(43, 127, 63, 0.9)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroBottomRow: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroButton: {
    padding: 8,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  mediaSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  mediaThumb: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    marginLeft: 4,
  },
  mediaThumbActive: {
    borderWidth: 2,
    borderColor: '#0b57d0',
  },
  mediaThumbIdle: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    opacity: 0.7,
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  lightboxCounter: {
    position: 'absolute',
    top: 20,
    left: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 20,
  },
  lightboxNav: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  lightboxImage: {
    width: '92%',
    height: '80%',
  },
  cardBody: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  weighInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0b57d0',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metaAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: '#eef1f6',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 11, 12, 0.6)',
    justifyContent: 'flex-end',
  },
  modalBackdropPress: {
    flex: 1,
  },
  modalCard: {
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#e3e3e3',
  },
  headerShareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceContainerHigh,
  },
  modalBody: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  consensusBox: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: '#f8fafd',
    borderWidth: 1,
    borderColor: '#e3e3e3',
  },
  tallyTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e3e3e3',
    overflow: 'hidden',
  },
  tallyFill: {
    height: '100%',
    borderRadius: 4,
  },
  checklistBox: {
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: '#f8fafd',
    borderWidth: 1,
    borderColor: '#e3e3e3',
    gap: spacing.sm,
  },
  voteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#c7c7c7',
    backgroundColor: '#ffffff',
  },
  voteOptionActive: {
    borderColor: '#0b57d0',
    backgroundColor: '#e8f0fe',
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#c7c7c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0b57d0',
  },
  blueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#0b57d0',
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  evidenceItem: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: '#f8fafd',
    borderWidth: 1,
    borderColor: '#e3e3e3',
    gap: 6,
  },
  supportsChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: '#e6f4ea',
  },
  challengesChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: '#ffdad8',
  },
  evidenceMedia: {
    width: 112,
    height: 112,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    backgroundColor: '#f0f4f9',
  },
  emptyIllustration: {
    width: 112,
    height: 112,
    borderRadius: radius.lg,
    backgroundColor: '#e6f4ea',
    borderWidth: 1,
    borderColor: 'rgba(43, 127, 63, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyIllustrationBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fef7e0',
    borderWidth: 1,
    borderColor: 'rgba(227, 116, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
