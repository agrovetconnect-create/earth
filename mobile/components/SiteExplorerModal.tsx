import { router } from 'expo-router';
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageState } from './AsyncState';
import { ReportContentModal, type ReportTarget } from './ReportContentModal';
import { useSiteExplorer } from '../hooks/useObservations';
import { recordSiteVisit } from '../services/api';
import { getContributorToken } from '../services/contributorToken';
import { recordMobileHistory } from '../services/history';
import { spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import { useAppLanguage } from '../utils/language';
import { observationDetailRoute } from '../utils/observationNavigation';
import { useResponsiveLayout } from '../utils/responsive';
import { userFacingError } from '../utils/userFacingError';

function localDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function SiteExplorerModal({
  visible,
  siteId,
  onClose,
}: {
  visible: boolean;
  siteId: string | null;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { language, t } = useAppLanguage();
  const dateLocale = language === 'fr' ? 'fr-FR' : 'en-US';
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const explorer = useSiteExplorer(visible && siteId ? siteId : '');
  const payload = explorer.data;

  const [activeLayer, setActiveLayer] = useState<'overview' | 'ai' | 'community' | 'expert'>('overview');
  const [visitNotes, setVisitNotes] = useState('');
  const [visitFeedback, setVisitFeedback] = useState('');
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  useEffect(() => {
    if (visible) {
      setActiveLayer('overview');
      setVisitNotes('');
      setVisitFeedback('');
    }
  }, [visible, siteId]);

  useEffect(() => {
    if (payload?.site) {
      void recordMobileHistory({
        kind: 'site',
        refId: payload.site.site_id,
        title: payload.site.title,
        subtitle: `${payload.site.site_code}${payload.site.district ? ` · ${payload.site.district}` : ''}`,
      });
    }
  }, [payload?.site]);

  const visitMutation = useMutation({
    mutationFn: async () => {
      if (!siteId) throw new Error(t('No geological site selected.'));
      const token = await getContributorToken();
      return recordSiteVisit(siteId, localDate(), token, undefined, visitNotes);
    },
    onSuccess: async () => {
      setVisitNotes('');
      setVisitFeedback(t('Your field visit was recorded for today.'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community', 'site-explorer', siteId] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'visits', siteId] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'sites'] }),
      ]);
    },
    onError: (err) => setVisitFeedback(userFacingError(err)),
  });

  const openPassport = (passportId: string) => {
    onClose();
    router.push(observationDetailRoute(passportId));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[
          styles.backdrop,
          {
            paddingLeft: layout.sideSafeLeft,
            paddingRight: layout.sideSafeRight,
          },
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.sheet,
            {
              marginTop: layout.sheetTopMargin,
              paddingBottom: layout.bottomSafePadding,
              maxWidth: layout.sheetMaxWidth,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>
                {payload?.site.site_code || t('Site Explorer')}
              </Text>
              <Text numberOfLines={2} style={styles.title}>
                {payload?.site.title || t('Geological site')}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Close Site Explorer')}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>{t('Close')}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {explorer.isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.forest} />
                <Text style={styles.muted}>{t('Loading site…')}</Text>
              </View>
            ) : explorer.error && !payload ? (
              <MessageState
                title={t('Site unavailable')}
                message={userFacingError(explorer.error)}
                onRetry={() => {
                  void explorer.refetch();
                }}
              />
            ) : !payload ? (
              <Text style={styles.muted}>{t('Site could not be loaded.')}</Text>
            ) : (
              <>
                <Text style={styles.metaLine}>
                  {payload.site.district || 'Rwanda'}
                  {' · '}
                  {t(`${payload.site.observation_count ?? payload.observations.length} posts`)}
                  {' · '}
                  {t(`${payload.community.visit_count} visits`)}
                  {payload.site.highest_evidence_state
                    ? ` · ${t(payload.site.highest_evidence_state.replaceAll('_', ' '))}`
                    : ''}
                </Text>

                {payload.site.description ? (
                  <Text style={styles.bodyText}>{payload.site.description}</Text>
                ) : null}

                {typeof payload.site.latitude === 'number' &&
                typeof payload.site.longitude === 'number' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      const lat = String(payload.site.latitude);
                      const lng = String(payload.site.longitude);
                      const label = payload.site.title;
                      onClose();
                      router.push({
                        pathname: '/(tabs)/map',
                        params: { lat, lng, label },
                      });
                    }}
                    style={styles.navSiteBtn}
                  >
                    <Text style={styles.navSiteBtnText}>{t('Route on Map')}</Text>
                  </Pressable>
                ) : null}

                <Text style={styles.separationBanner}>
                  {t('AI readings, community notes, and expert reviews are kept separate.')}
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tabsRow}
                >
                  {(
                    [
                      ['overview', 'Passports'],
                      ['ai', 'AI Reading'],
                      ['community', 'Community'],
                      ['expert', 'Expert'],
                    ] as const
                  ).map(([key, label]) => {
                    const selected = activeLayer === key;
                    return (
                      <Pressable
                        key={key}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        onPress={() => setActiveLayer(key)}
                        style={[styles.tabBtn, selected && styles.tabBtnSelected]}
                      >
                        <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                          {t(label)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {activeLayer === 'overview' ? (
                  <View style={styles.layerBox}>
                    <Text style={styles.sectionTitle}>{t('Linked observations')}</Text>
                    {payload.observations.length ? (
                      payload.observations.map((obs) => (
                        <Pressable
                          key={obs.passport_id}
                          accessibilityRole="link"
                          onPress={() => openPassport(obs.passport_id)}
                          style={styles.listRow}
                        >
                          <Text style={styles.rowTitle}>
                            {obs.possible_name || t(obs.observation_subcategory) || obs.passport_id}
                          </Text>
                          <Text style={styles.metaLine}>
                            {obs.passport_id} · {t(obs.observation_category)} · {t(obs.confidence)} ·{' '}
                            {t(obs.evidence_state.replaceAll('_', ' '))}
                          </Text>
                        </Pressable>
                      ))
                    ) : (
                      <Text style={styles.muted}>{t('No public observations linked yet.')}</Text>
                    )}

                    {payload.nearby.length > 0 ? (
                      <>
                        <Text style={styles.sectionTitle}>{t('Nearby within 25 km')}</Text>
                        {payload.nearby.slice(0, 6).map((near) => (
                          <Pressable
                            key={near.passport_id}
                            accessibilityRole="link"
                            onPress={() => openPassport(near.passport_id)}
                            style={styles.listRow}
                          >
                            <Text style={styles.rowTitle}>
                              {near.possible_name || t(near.observation_category)}
                            </Text>
                            <Text style={styles.metaLine}>
                              {near.passport_id} · {t(`${near.distance_km} km away`)}
                            </Text>
                          </Pressable>
                        ))}
                      </>
                    ) : null}
                  </View>
                ) : null}

                {activeLayer === 'ai' ? (
                  <View style={styles.layerBox}>
                    <Text style={styles.sectionTitle}>{t('Layer 1 · AI Preliminary Interpretation')}</Text>
                    {payload.ai_interpretation ? (
                      <>
                        <Text style={styles.metaLine}>
                          {t(`Source Passport: ${payload.ai_interpretation.passport_id}`)} ·{' '}
                          {t(payload.ai_interpretation.primary_classification)} ·{' '}
                          {t(
                            `Confidence: ${payload.ai_interpretation.confidence} (${Math.round(
                              payload.ai_interpretation.confidence_score * 100
                            )}%)`
                          )}
                        </Text>
                        {payload.ai_interpretation.possible_name ? (
                          <Text style={styles.rowTitle}>
                            {t(`Possible name: ${payload.ai_interpretation.possible_name}`)}
                          </Text>
                        ) : null}
                        <Text style={styles.bodyText}>{payload.ai_interpretation.reasoning}</Text>
                        {payload.ai_interpretation.observed_features.map((feat, i) => (
                          <Text key={`${i}-${feat}`} style={styles.bodyText}>
                            •  {feat}
                          </Text>
                        ))}
                        {payload.ai_interpretation.limitations.length > 0 ? (
                          <View style={styles.subGroup}>
                            <Text style={styles.subLabel}>{t('Limitations')}</Text>
                            {payload.ai_interpretation.limitations.map((lim, i) => (
                              <Text key={`${i}-${lim}`} style={styles.muted}>
                                •  {lim}
                              </Text>
                            ))}
                          </View>
                        ) : null}
                        <Text style={styles.warningNote}>{t(payload.ai_interpretation.disclaimer)}</Text>
                      </>
                    ) : (
                      <Text style={styles.muted}>
                        {t('No AI interpretation block is recorded for this site yet.')}
                      </Text>
                    )}
                  </View>
                ) : null}

                {activeLayer === 'community' ? (
                  <View style={styles.layerBox}>
                    <Text style={styles.sectionTitle}>{t('Layer 2 · Community Record & Timeline')}</Text>
                    <Text style={styles.metaLine}>
                      {t(`${payload.community.investigation_count} investigations`)} ·{' '}
                      {t(`${payload.community.question_count} questions`)} ·{' '}
                      {t(`${payload.community.evidence_count} evidence items`)} ·{' '}
                      {t(`${payload.community.visit_count} visits`)} · {t(`${payload.community.vote_count} votes`)}
                    </Text>
                    <Text style={styles.warningNote}>{t(payload.community.note)}</Text>

                    <View style={styles.visitBox}>
                      <Text style={styles.subLabel}>{t('Log today’s visit')}</Text>
                      <TextInput
                        accessibilityLabel={t('Optional field visit notes')}
                        placeholder={t('Field notes (optional)')}
                        placeholderTextColor={colors.muted}
                        value={visitNotes}
                        onChangeText={setVisitNotes}
                        maxLength={400}
                        style={styles.input}
                      />
                      <Pressable
                        accessibilityRole="button"
                        disabled={visitMutation.isPending}
                        onPress={() => visitMutation.mutate()}
                        style={[styles.primaryBtn, visitMutation.isPending && styles.disabled]}
                      >
                        <Text style={styles.primaryBtnText}>
                          {t(visitMutation.isPending ? 'Saving…' : 'Log Visit')}
                        </Text>
                      </Pressable>
                      {visitFeedback ? <Text style={styles.metaLine}>{visitFeedback}</Text> : null}
                    </View>

                    <Text style={styles.subLabel}>{t('Timeline')}</Text>
                    {payload.timeline.length ? (
                      payload.timeline.slice(0, 15).map((entry, idx) => (
                        <View key={`${entry.ref_id}-${idx}`} style={styles.listRow}>
                          <Text style={styles.bodyText}>{entry.summary}</Text>
                          <Text style={styles.metaLine}>
                            {t(entry.event_type)} · {new Date(entry.event_at).toLocaleDateString(dateLocale)}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.muted}>{t('No events yet.')}</Text>
                    )}
                  </View>
                ) : null}

                {activeLayer === 'expert' ? (
                  <View style={styles.layerBox}>
                    <Text style={styles.sectionTitle}>{t('Expert Review')}</Text>
                    {payload.expert_review ? (
                      <>
                        <Text style={styles.rowTitle}>
                          {payload.expert_review.reviewer_label} · {t(payload.expert_review.status)}
                        </Text>
                        <Text style={styles.metaLine}>
                          {t(`Reviewed ${new Date(payload.expert_review.created_at).toLocaleDateString(dateLocale)}`)}
                          {payload.expert_review.expert_confidence
                            ? ` · ${t(`Confidence: ${payload.expert_review.expert_confidence}`)}`
                            : ''}
                        </Text>
                        {payload.expert_review.expert_rock_name ||
                        payload.expert_review.expert_classification ? (
                          <Text style={styles.bodyText}>
                            {t(
                              `Assessment: ${[
                                payload.expert_review.expert_classification,
                                payload.expert_review.expert_rock_name,
                              ]
                                .filter(Boolean)
                                .join(' — ')}`
                            )}
                          </Text>
                        ) : null}
                        {payload.expert_review.expert_notes ? (
                          <Text style={styles.bodyText}>{payload.expert_review.expert_notes}</Text>
                        ) : null}
                        {payload.expert_review.scientific_remarks ? (
                          <Text style={styles.muted}>
                            {payload.expert_review.scientific_remarks}
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={styles.muted}>{t('No expert review yet.')}</Text>
                    )}
                  </View>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    setReportTarget({
                      targetType: 'site',
                      targetId: payload.site.site_id,
                      label: `${payload.site.site_code} — ${payload.site.title}`,
                    })
                  }
                  style={styles.reportBtn}
                >
                  <Text style={styles.reportBtnText}>{t('Report site')}</Text>
                </Pressable>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <ReportContentModal
        visible={Boolean(reportTarget)}
        target={reportTarget}
        onClose={() => setReportTarget(null)}
      />
    </Modal>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.48)',
      justifyContent: 'flex-end',
    },
    sheet: {
      width: '100%',
      alignSelf: 'center',
      maxHeight: '92%',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderTopWidth: 1,
      borderColor: colors.line,
      padding: spacing.md,
      gap: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      paddingBottom: spacing.sm,
    },
    headerText: { flex: 1, gap: 2 },
    eyebrow: { color: colors.earth, fontSize: 12, fontWeight: '700' },
    title: { color: colors.ink, fontSize: 18, fontWeight: '800' },
    closeBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
    closeText: { color: colors.forest, fontWeight: '700' },
    body: { gap: spacing.sm, paddingBottom: spacing.md },
    center: { padding: spacing.lg, alignItems: 'center', gap: 10 },
    metaLine: { color: colors.muted, fontSize: 12, lineHeight: 18 },
    bodyText: { color: colors.ink, fontSize: 14, lineHeight: 20 },
    muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
    navSiteBtn: {
      alignSelf: 'flex-start',
      minHeight: 42,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.forest,
      backgroundColor: colors.canvas,
      justifyContent: 'center',
    },
    navSiteBtnText: {
      color: colors.forest,
      fontSize: 13,
      fontWeight: '700',
    },
    separationBanner: {
      color: colors.warning,
      backgroundColor: colors.surfaceContainerHigh,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 10,
      borderRadius: 12,
      fontSize: 12,
      lineHeight: 18,
    },
    tabsRow: { gap: 8, paddingVertical: 4 },
    tabBtn: {
      minHeight: 44,
      paddingHorizontal: 13,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.canvas,
      justifyContent: 'center',
    },
    tabBtnSelected: {
      borderColor: colors.forest,
      backgroundColor: colors.forest,
    },
    tabText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
    tabTextSelected: { color: colors.surface, fontWeight: '700' },
    layerBox: {
      paddingTop: 8,
      gap: 8,
    },
    sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
    subGroup: { gap: 4, marginTop: 4 },
    subLabel: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 4 },
    listRow: {
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      gap: 3,
    },
    rowTitle: { color: colors.forest, fontSize: 14, fontWeight: '700' },
    warningNote: { color: colors.warning, fontSize: 12, lineHeight: 18 },
    visitBox: {
      padding: spacing.sm,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.canvas,
      gap: 8,
    },
    input: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      backgroundColor: colors.surface,
      color: colors.ink,
      paddingHorizontal: 12,
      fontSize: 14,
    },
    primaryBtn: {
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: colors.forest,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { color: colors.surface, fontWeight: '800', fontSize: 13 },
    disabled: { opacity: 0.5 },
    reportBtn: {
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 6,
    },
    reportBtnText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  });
}
