import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchCommunityEvidence,
  submitCommunityEvidence,
} from '../../services/api';
import { spacing, radius, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import type { CommunityInvestigation, CommunityEvidenceType } from '../../types/api';
import { useAppLanguage } from '../../utils/language';
import { observationDetailRoute } from '../../utils/observationNavigation';
import { userFacingError } from '../../utils/userFacingError';

const EVIDENCE_TYPES: Array<{ value: CommunityEvidenceType; label: string }> = [
  { value: 'field_note', label: 'Note' },
  { value: 'close_up', label: 'Close-up' },
  { value: 'fresh_surface', label: 'Fracture' },
  { value: 'texture', label: 'Texture' },
  { value: 'outcrop', label: 'Outcrop' },
  { value: 'environment', label: 'Site' },
  { value: 'comparison', label: 'Compare' },
  { value: 'reference', label: 'Ref' },
];

export function InvestigationCard({
  item,
  pending,
  ensureToken,
  onFeedback,
  onReport,
  onVote,
  onToggleCheck,
}: {
  item: CommunityInvestigation;
  pending: boolean;
  ensureToken: () => Promise<string>;
  onFeedback: (msg: string) => void;
  onReport: (target: { targetType: 'investigation'; targetId: string; label: string }) => void;
  onVote: (option: string) => void;
  onToggleCheck: (itemId: string, checked: boolean) => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const [showEvidence, setShowEvidence] = useState(false);
  const [evType, setEvType] = useState<CommunityEvidenceType>('field_note');
  const [evExplanation, setEvExplanation] = useState('');

  const evidenceQuery = useQuery({
    queryKey: ['community', 'evidence', item.public_id],
    queryFn: ({ signal }) => fetchCommunityEvidence({ investigationId: item.public_id }, signal),
    enabled: showEvidence,
  });

  const submitEvMutation = useMutation({
    mutationFn: async () =>
      submitCommunityEvidence(
        {
          investigationId: item.public_id,
          siteId: item.site_id,
          evidenceType: evType,
          explanation: evExplanation,
        },
        await ensureToken()
      ),
    onSuccess: async () => {
      setEvExplanation('');
      onFeedback(t('Evidence added.'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community', 'evidence', item.public_id] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'investigations'] }),
      ]);
    },
    onError: (err) => onFeedback(userFacingError(err)),
  });

  const totals = new Map(item.vote_distribution.map((entry) => [entry.option, entry.count]));

  return (
    <View style={styles.card}>
      {/* Header Banner */}
      <View style={styles.hero}>
        <View style={styles.badgeRow}>
          {item.category ? (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{t(item.category.replace(/_/g, ' '))}</Text>
            </View>
          ) : null}
          {item.research_interest ? (
            <View style={[styles.categoryBadge, { backgroundColor: colors.warning }]}>
              <Ionicons name="flask" size={10} color={colors.surface} />
              <Text style={[styles.categoryText, { color: colors.surface }]}>{t('RESEARCH')}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.heroContent}>
          <Text style={styles.idText}>{item.public_id}</Text>
          <Text style={styles.heroTitle} numberOfLines={3}>
            {item.question}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        {item.context ? (
          <Text style={styles.contextText}>{item.context}</Text>
        ) : null}

        {item.passport_id ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(observationDetailRoute(item.passport_id!))}
            style={styles.linkRow}
          >
            <Ionicons name="document-text-outline" size={16} color={colors.primary} />
            <Text style={styles.linkText}>{t(`Passport ${item.passport_id}`)}</Text>
          </Pressable>
        ) : null}

        {item.options.length > 0 ? (
          <View style={styles.optionsGrid}>
            {item.options.map((option) => (
              <Pressable
                key={option}
                disabled={pending}
                onPress={() => onVote(option)}
                style={({ pressed }) => [
                  styles.voteBtn,
                  pressed && styles.pressed,
                  pending && styles.disabled,
                ]}
              >
                <Text style={styles.voteBtnText}>{option}</Text>
                <View style={styles.voteCount}>
                  <Text style={styles.voteCountText}>{totals.get(option) ?? 0}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {item.checklist && item.checklist.length > 0 ? (
          <View style={styles.checklistSection}>
            <Text style={styles.sectionLabel}>{t('Checklist')}</Text>
            {item.checklist.map((chk) => (
              <Pressable
                key={chk.id}
                disabled={pending}
                onPress={() => onToggleCheck(chk.id, !chk.viewer_checked)}
                style={[styles.checkItem, chk.viewer_checked && styles.checkItemSelected]}
              >
                <Ionicons
                  name={chk.viewer_checked ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={chk.viewer_checked ? colors.primary : colors.onSurfaceFaint}
                />
                <Text style={[styles.checkText, chk.viewer_checked && styles.checkTextSelected]}>
                  {chk.text}
                </Text>
                <Text style={styles.checkCount}>{chk.check_count}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text style={styles.statsText}>
            {t(`${item.participant_count} people`)} · {t(`${item.evidence_count} notes`)}
          </Text>

          <View style={styles.actions}>
            <Pressable onPress={() => setShowEvidence(!showEvidence)} style={styles.actionBtn}>
              <Text style={styles.actionText}>
                {showEvidence ? t('Hide') : t(`Evidence (${item.evidence_count})`)}
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                onReport({
                  targetType: 'investigation',
                  targetId: item.public_id,
                  label: item.question,
                })
              }
              style={styles.actionBtn}
            >
              <Text style={styles.reportText}>{t('Report')}</Text>
            </Pressable>
          </View>
        </View>

        {showEvidence && (
          <View style={styles.evidencePanel}>
             {evidenceQuery.isLoading ? (
               <ActivityIndicator color={colors.primary} />
             ) : (
               <View style={styles.evidenceList}>
                 {evidenceQuery.data?.rows.map((ev) => (
                   <View key={ev.id} style={styles.evidenceItem}>
                     <View style={styles.evidenceHeader}>
                        <Text style={styles.evidenceMeta}>{ev.contributor_handle} · {t(ev.evidence_type.replace(/_/g, ' '))}</Text>
                     </View>
                     <Text style={styles.evidenceBody}>{ev.explanation}</Text>
                   </View>
                 ))}
                 {evidenceQuery.data?.rows.length === 0 && (
                   <Text style={styles.emptyEvidence}>{t('No evidence items yet.')}</Text>
                 )}
               </View>
             )}

             <View style={styles.addEvidence}>
                <Text style={styles.addEvidenceLabel}>{t('Add field evidence')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.evTypeScroll}>
                  {EVIDENCE_TYPES.map((evOpt) => (
                    <Pressable
                      key={evOpt.value}
                      onPress={() => setEvType(evOpt.value)}
                      style={[styles.evTypeChip, evType === evOpt.value && styles.evTypeChipSelected]}
                    >
                      <Text style={[styles.evTypeLabel, evType === evOpt.value && styles.evTypeLabelSelected]}>{t(evOpt.label)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={styles.evInputRow}>
                   <TextInput
                      style={styles.evInput}
                      placeholder={t('Note your observation...')}
                      placeholderTextColor={colors.onSurfaceFaint}
                      value={evExplanation}
                      onChangeText={setEvExplanation}
                      multiline
                   />
                   <Pressable
                      disabled={!evExplanation.trim() || submitEvMutation.isPending}
                      onPress={() => submitEvMutation.mutate()}
                      style={[styles.evSubmit, (!evExplanation.trim() || submitEvMutation.isPending) && styles.disabled]}
                   >
                      <Ionicons name="send" size={20} color={colors.onPrimary} />
                   </Pressable>
                </View>
             </View>
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      overflow: 'hidden',
      marginBottom: spacing.md,
    },
    hero: {
      backgroundColor: colors.surfaceContainerHigh,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
      padding: spacing.md,
      gap: 8,
    },
    badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    categoryBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.primaryContainer,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    categoryText: {
      color: colors.onPrimaryContainer,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    heroContent: { gap: 4 },
    idText: {
      color: colors.onSurfaceFaint,
      fontSize: 11,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    heroTitle: { color: colors.onSurface, fontSize: 17, fontWeight: '800', lineHeight: 22 },
    body: { padding: spacing.md, gap: spacing.md },
    contextText: { color: colors.onSurface, fontSize: 14, lineHeight: 20 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    linkText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    optionsGrid: { gap: 8 },
    voteBtn: {
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      backgroundColor: colors.surfaceContainerLow,
    },
    voteBtnText: { color: colors.onSurface, fontWeight: '700', fontSize: 14 },
    voteCount: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    voteCountText: { color: colors.onPrimaryContainer, fontSize: 12, fontWeight: '800' },
    checklistSection: { gap: 8 },
    sectionLabel: { fontSize: 12, fontWeight: '800', color: colors.onSurfaceFaint, textTransform: 'uppercase' },
    checkItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerLow,
    },
    checkItemSelected: { backgroundColor: colors.primaryContainer + '40' },
    checkText: { flex: 1, color: colors.onSurface, fontSize: 14 },
    checkTextSelected: { fontWeight: '600' },
    checkCount: { color: colors.onSurfaceFaint, fontSize: 12, fontWeight: '700' },
    footer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.outlineSoft,
    },
    statsText: { fontSize: 11, color: colors.onSurfaceFaint },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    actionBtn: { minHeight: 36, justifyContent: 'center', paddingVertical: 4 },
    actionText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    reportText: { color: colors.onSurfaceFaint, fontSize: 12 },
    evidencePanel: { gap: spacing.md, marginTop: spacing.xs },
    evidenceList: { gap: 8 },
    evidenceItem: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerHigh,
    },
    evidenceHeader: { marginBottom: 4 },
    evidenceMeta: { fontSize: 11, fontWeight: '700', color: colors.onSurfaceVariant },
    evidenceBody: { fontSize: 13, color: colors.onSurface, lineHeight: 18 },
    emptyEvidence: { textAlign: 'center', color: colors.onSurfaceFaint, fontSize: 12, padding: 12 },
    addEvidence: { gap: 8 },
    addEvidenceLabel: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
    evTypeScroll: { flexDirection: 'row', marginBottom: 4 },
    evTypeChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      marginRight: 6,
      backgroundColor: colors.surface,
    },
    evTypeChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    evTypeLabel: { fontSize: 12, color: colors.onSurfaceVariant },
    evTypeLabelSelected: { color: colors.onPrimary, fontWeight: '700' },
    evInputRow: { flexDirection: 'row', gap: 8 },
    evInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: colors.onSurface,
      fontSize: 14,
    },
    evSubmit: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
    disabled: { opacity: 0.5 },
  });
}
