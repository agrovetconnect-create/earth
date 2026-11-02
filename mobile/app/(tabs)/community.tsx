import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthProvider';
import { MessageState } from '../../components/AsyncState';
import { InvestigationCard } from '../../components/community/InvestigationCard';
import { QuestionCard } from '../../components/community/QuestionCard';
import { DrawerMenuButton } from '../../components/MobileNavDrawer';
import { ReportContentModal, type ReportTarget } from '../../components/ReportContentModal';
import { Screen, ScreenTitle } from '../../components/Screen';
import { WhatsAppSubmissionButton } from '../../components/WhatsAppSubmissionButton';
import {
  useCommunityQuestions,
  useInvestigations,
} from '../../hooks/useObservations';
import {
  askCommunityQuestion,
  castInvestigationVote,
  createObservationComment,
  fetchMyDiscussionQuestions,
  fetchMyReputation,
  openCommunityInvestigation,
  toggleInvestigationChecklist,
} from '../../services/api';
import { getContributorToken } from '../../services/contributorToken';
import { radius, spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import type { CommunityInvestigation } from '../../types/api';
import { runOnce } from '../../utils/actionLock';
import { useAppLanguage } from '../../utils/language';
import { observationDetailRoute } from '../../utils/observationNavigation';
import { useResponsiveLayout } from '../../utils/responsive';
import { userFacingError } from '../../utils/userFacingError';

type CommunityTab = 'investigations' | 'questions' | 'my_questions' | 'reputation';

function splitListInput(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function CommunityScreen() {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const auth = useAuth();
  const params = useLocalSearchParams<{ panel?: string }>();

  const [activeTab, setActiveTab] = useState<CommunityTab>('investigations');
  const [contributorToken, setContributorToken] = useState<string>('');
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [feedback, setFeedback] = useState('');
  const writeLocks = useRef(new Set<string>());

  // Open new investigation state
  const [showNewInv, setShowNewInv] = useState(false);
  const [invQuestion, setInvQuestion] = useState('');
  const [invContext, setInvContext] = useState('');
  const [invCategory, setInvCategory] = useState('');
  const [invOptionsText, setInvOptionsText] = useState('');
  const [invChecklistText, setInvChecklistText] = useState('');
  const [invPassportId, setInvPassportId] = useState('');
  const [invResearchInterest, setInvResearchInterest] = useState(false);

  // Ask question state
  const [showAskForm, setShowAskForm] = useState(false);
  const [askText, setAskText] = useState('');
  const [askContext, setAskContext] = useState('');
  const [askExpert, setAskExpert] = useState(false);

  // My discussion threads reply state
  const [threadReplies, setThreadReplies] = useState<Record<string, string>>({});

  useEffect(() => {
    if (
      params.panel === 'investigations' ||
      params.panel === 'questions' ||
      params.panel === 'my_questions' ||
      params.panel === 'reputation'
    ) {
      setActiveTab(params.panel);
    }
  }, [params.panel]);

  useEffect(() => {
    void getContributorToken()
      .then((tok) => setContributorToken(tok))
      .catch(() => undefined);
  }, []);

  const investigations = useInvestigations(contributorToken || null);
  const questions = useCommunityQuestions();

  const myDiscussions = useQuery({
    queryKey: ['account', 'discussions', auth.user?.public_user_id],
    queryFn: ({ signal }) => fetchMyDiscussionQuestions(auth.token!, signal),
    enabled: activeTab === 'my_questions' && Boolean(auth.user && auth.token),
  });

  const reputation = useQuery({
    queryKey: ['community', 'reputation', contributorToken || 'guest'],
    queryFn: ({ signal }) => fetchMyReputation(contributorToken, signal),
    enabled: activeTab === 'reputation',
  });

  const ensureToken = async (): Promise<string> => {
    if (contributorToken) return contributorToken;
    const tok = await getContributorToken();
    setContributorToken(tok);
    return tok;
  };

  const createInvestigationMutation = useMutation({
    mutationFn: async () => {
      const tok = await ensureToken();
      return openCommunityInvestigation(
        {
          question: invQuestion,
          context: invContext.trim() || null,
          category: invCategory.trim() || null,
          options: splitListInput(invOptionsText),
          checklist: splitListInput(invChecklistText),
          passportId: invPassportId.trim() || null,
          researchInterest: invResearchInterest,
        },
        tok
      );
    },
    onSuccess: async () => {
      setInvQuestion('');
      setInvContext('');
      setInvCategory('');
      setInvOptionsText('');
      setInvChecklistText('');
      setInvPassportId('');
      setInvResearchInterest(false);
      setShowNewInv(false);
      setFeedback(t('Community investigation opened.'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community', 'investigations'] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'reputation'] }),
      ]);
    },
    onError: (err) => setFeedback(userFacingError(err)),
  });

  const voteMutation = useMutation({
    mutationFn: async ({ item, option }: { item: CommunityInvestigation; option: string }) =>
      castInvestigationVote(item.public_id, option, await ensureToken()),
    onSuccess: async (result) => {
      setFeedback(result.message);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community', 'investigations'] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'reputation'] }),
      ]);
    },
    onError: (error) => setFeedback(userFacingError(error)),
  });

  const checklistMutation = useMutation({
    mutationFn: async ({
      publicId,
      itemId,
      checked,
    }: {
      publicId: string;
      itemId: string;
      checked: boolean;
    }) => toggleInvestigationChecklist(publicId, itemId, checked, await ensureToken()),
    onSuccess: async (res) => {
      setFeedback(res.message);
      await queryClient.invalidateQueries({ queryKey: ['community', 'investigations'] });
    },
    onError: (err) => setFeedback(userFacingError(err)),
  });

  const askQuestionMutation = useMutation({
    mutationFn: async () => {
      const tok = await ensureToken();
      return askCommunityQuestion(
        {
          question: askText,
          context: askContext.trim() || null,
          requestedExpert: askExpert,
        },
        tok
      );
    },
    onSuccess: async () => {
      setAskText('');
      setAskContext('');
      setAskExpert(false);
      setShowAskForm(false);
      setFeedback(t('Your question was published to the community.'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community', 'questions'] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'reputation'] }),
      ]);
    },
    onError: (err) => setFeedback(userFacingError(err)),
  });

  const replyThreadMutation = useMutation({
    mutationFn: async ({
      passportId,
      commentId,
      body,
    }: {
      passportId: string;
      commentId: string;
      body: string;
    }) => {
      if (!auth.token) throw new Error(t('Sign in required.'));
      return createObservationComment(passportId, body, auth.token, commentId);
    },
    onSuccess: async (_, vars) => {
      setThreadReplies((prev) => ({ ...prev, [vars.commentId]: '' }));
      setFeedback(t('Reply posted to thread.'));
      await queryClient.invalidateQueries({ queryKey: ['account', 'discussions'] });
    },
    onError: (err) => setFeedback(userFacingError(err)),
  });

  const refreshing =
    investigations.isRefetching ||
    questions.isRefetching ||
    myDiscussions.isRefetching ||
    reputation.isRefetching;

  const refreshAll = () => {
    void Promise.all([
      investigations.refetch(),
      questions.refetch(),
      ...(activeTab === 'my_questions' && auth.token ? [myDiscussions.refetch()] : []),
      ...(activeTab === 'reputation' ? [reputation.refetch()] : []),
    ]);
  };

  return (
    <Screen scroll={false} keyboardAvoiding>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: layout.horizontalPadding,
            maxWidth: layout.contentMaxWidth,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.topRow}>
          <DrawerMenuButton />
        </View>

        <ScreenTitle
          eyebrow={t('Field network')}
          subtitle={t('Investigations, Q&A, threads, and impact.')}
        >
          {t('Community')}
        </ScreenTitle>

        {feedback ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setFeedback('')}
            style={styles.feedback}
          >
            <Text style={styles.feedbackText}>{t(feedback)}</Text>
            <Ionicons name="close" size={16} color={colors.onSurface} />
          </Pressable>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
        >
          {(
            [
              ['investigations', 'Investigate'],
              ['questions', 'Q&A'],
              ['my_questions', 'My Threads'],
              ['reputation', 'Impact'],
            ] as const
          ).map(([tabKey, label]) => {
            const selected = activeTab === tabKey;
            return (
              <Pressable
                key={tabKey}
                onPress={() => setActiveTab(tabKey)}
                style={[styles.tabBtn, selected && styles.tabBtnSelected]}
              >
                <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{t(label)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 1. Investigations */}
        {activeTab === 'investigations' ? (
          <View style={styles.section}>
            <Pressable
              onPress={() => setShowNewInv(!showNewInv)}
              style={styles.composerTrigger}
            >
              <Ionicons
                name={showNewInv ? 'close-circle' : 'add-circle'}
                size={22}
                color={colors.primary}
              />
              <Text style={styles.composerTriggerText}>
                {showNewInv ? t('Cancel') : t('New investigation')}
              </Text>
            </Pressable>

            {showNewInv ? (
              <View style={styles.formCard}>
                <Text style={styles.formLabel}>{t('Question')}</Text>
                <TextInput
                  placeholder={t('e.g. Columnar jointing at Musanze?')}
                  placeholderTextColor={colors.onSurfaceFaint}
                  value={invQuestion}
                  onChangeText={setInvQuestion}
                  multiline
                  style={styles.multilineInput}
                />
                <Text style={styles.formLabel}>{t('Context (optional)')}</Text>
                <TextInput
                  placeholder={t('Orientation, host rock...')}
                  placeholderTextColor={colors.onSurfaceFaint}
                  value={invContext}
                  onChangeText={setInvContext}
                  style={styles.input}
                />
                <Text style={styles.formLabel}>{t('Category & Passport ID (optional)')}</Text>
                <View style={[styles.dualRow, layout.isCompactPhone && styles.dualRowStack]}>
                  <TextInput
                    placeholder={t('Category (rock)')}
                    placeholderTextColor={colors.onSurfaceFaint}
                    value={invCategory}
                    onChangeText={setInvCategory}
                    style={[styles.input, { flex: 1 }]}
                  />
                  <TextInput
                    placeholder="ET-RW-..."
                    placeholderTextColor={colors.onSurfaceFaint}
                    value={invPassportId}
                    onChangeText={setInvPassportId}
                    style={[styles.input, { flex: 1 }]}
                  />
                </View>
                <Text style={styles.formLabel}>{t('Voting options (comma-separated)')}</Text>
                <TextInput
                  placeholder={t('Columnar basalt, Jointing...')}
                  placeholderTextColor={colors.onSurfaceFaint}
                  value={invOptionsText}
                  onChangeText={setInvOptionsText}
                  style={styles.input}
                />
                <Text style={styles.formLabel}>{t('Checklist (comma-separated)')}</Text>
                <TextInput
                  placeholder={t('Grain close-up, Scale coin...')}
                  placeholderTextColor={colors.onSurfaceFaint}
                  value={invChecklistText}
                  onChangeText={setInvChecklistText}
                  style={styles.input}
                />
                <Pressable
                  onPress={() => setInvResearchInterest(!invResearchInterest)}
                  style={styles.checkboxRow}
                >
                  <Ionicons
                    name={invResearchInterest ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={styles.checkboxLabel}>{t('Flag for research')}</Text>
                </Pressable>
                <Pressable
                  disabled={!invQuestion.trim() || createInvestigationMutation.isPending}
                  onPress={() => createInvestigationMutation.mutate()}
                  style={[
                    styles.submitBtn,
                    (!invQuestion.trim() || createInvestigationMutation.isPending) &&
                      styles.disabled,
                  ]}
                >
                  {createInvestigationMutation.isPending ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text style={styles.submitBtnText}>{t('Publish')}</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {investigations.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : investigations.error ? (
              <MessageState
                title={t('Could not load')}
                message={userFacingError(investigations.error)}
                onRetry={() => void investigations.refetch()}
              />
            ) : (investigations.data?.rows.length ?? 0) === 0 ? (
              <Text style={styles.emptyText}>{t('No open investigations.')}</Text>
            ) : (
              investigations.data?.rows.map((item) => (
                <InvestigationCard
                  key={item.public_id}
                  item={item}
                  pending={voteMutation.isPending || checklistMutation.isPending}
                  ensureToken={ensureToken}
                  onFeedback={setFeedback}
                  onReport={(target) => setReportTarget(target)}
                  onVote={(option) => {
                    void runOnce(writeLocks.current, `vote:${item.public_id}`, () =>
                      voteMutation.mutateAsync({ item, option })
                    ).catch(() => undefined);
                  }}
                  onToggleCheck={(itemId, checked) => {
                    void runOnce(writeLocks.current, `check:${item.public_id}:${itemId}`, () =>
                      checklistMutation.mutateAsync({
                        publicId: item.public_id,
                        itemId,
                        checked,
                      })
                    ).catch(() => undefined);
                  }}
                />
              ))
            )}
          </View>
        ) : null}

        {/* 2. Community Q&A */}
        {activeTab === 'questions' ? (
          <View style={styles.section}>
            <Pressable
              onPress={() => setShowAskForm(!showAskForm)}
              style={styles.composerTrigger}
            >
              <Ionicons
                name={showAskForm ? 'close-circle' : 'help-circle'}
                size={22}
                color={colors.primary}
              />
              <Text style={styles.composerTriggerText}>
                {showAskForm ? t('Cancel') : t('Ask a question')}
              </Text>
            </Pressable>

            {showAskForm ? (
              <View style={styles.formCard}>
                <Text style={styles.formLabel}>{t('Question')}</Text>
                <TextInput
                  placeholder={t('e.g. Mica vs sulphide luster?')}
                  placeholderTextColor={colors.onSurfaceFaint}
                  value={askText}
                  onChangeText={setAskText}
                  multiline
                  style={styles.multilineInput}
                />
                <Text style={styles.formLabel}>{t('Context (optional)')}</Text>
                <TextInput
                  placeholder={t('Locality, host rock...')}
                  placeholderTextColor={colors.onSurfaceFaint}
                  value={askContext}
                  onChangeText={setAskContext}
                  style={styles.input}
                />
                <Pressable
                  onPress={() => setAskExpert(!askExpert)}
                  style={styles.checkboxRow}
                >
                  <Ionicons
                    name={askExpert ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={styles.checkboxLabel}>{t('Request expert review')}</Text>
                </Pressable>
                <Pressable
                  disabled={!askText.trim() || askQuestionMutation.isPending}
                  onPress={() => askQuestionMutation.mutate()}
                  style={[
                    styles.submitBtn,
                    (!askText.trim() || askQuestionMutation.isPending) && styles.disabled,
                  ]}
                >
                  {askQuestionMutation.isPending ? (
                    <ActivityIndicator color={colors.onPrimary} />
                  ) : (
                    <Text style={styles.submitBtnText}>{t('Post Question')}</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {questions.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : questions.error ? (
              <MessageState
                title={t('Could not load')}
                message={userFacingError(questions.error)}
                onRetry={() => void questions.refetch()}
              />
            ) : (questions.data?.rows.length ?? 0) === 0 ? (
              <Text style={styles.emptyText}>{t('No questions yet.')}</Text>
            ) : (
              questions.data?.rows.map((q) => (
                <QuestionCard
                  key={q.public_id}
                  summary={q}
                  ensureToken={ensureToken}
                  onFeedback={setFeedback}
                  onReport={(target) => setReportTarget(target)}
                />
              ))
            )}
          </View>
        ) : null}

        {/* 3. My Questions & Discussion Threads (matching web MyQuestionsPanel.tsx) */}
        {activeTab === 'my_questions' ? (
          <View style={styles.section}>
            {!auth.user ? (
              <View style={styles.repCard}>
                <Text style={styles.repTitle}>{t('Sign in required')}</Text>
                <Text style={styles.noteBody}>
                  {t('Sign in to view and reply to your passport threads.')}
                </Text>
                <Pressable
                  onPress={() => router.push('/(tabs)/profile')}
                  style={styles.submitBtn}
                >
                  <Text style={styles.submitBtnText}>{t('Sign in')}</Text>
                </Pressable>
              </View>
            ) : myDiscussions.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : myDiscussions.error ? (
              <MessageState
                title={t('Could not load')}
                message={userFacingError(myDiscussions.error)}
                onRetry={() => void myDiscussions.refetch()}
              />
            ) : (myDiscussions.data?.data.length ?? 0) === 0 ? (
              <Text style={styles.emptyText}>{t('No threads yet.')}</Text>
            ) : (
              myDiscussions.data?.data.map((thread) => (
                <View key={thread.comment_id} style={styles.threadCard}>
                  <Pressable
                    onPress={() => router.push(observationDetailRoute(thread.passport_id))}
                    style={styles.threadHeader}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.formLabel}>{thread.passport_id}</Text>
                      <Text style={styles.threadPostTitle} numberOfLines={1}>
                        {thread.post_title}
                      </Text>
                    </View>
                    <Ionicons name="open-outline" size={18} color={colors.primary} />
                  </Pressable>

                  <Text style={styles.threadBody}>{thread.body}</Text>

                  {thread.replies.length > 0 && (
                    <View style={styles.threadReplies}>
                      {thread.replies.map((rep) => (
                        <View key={rep.comment_id} style={styles.threadReplyItem}>
                          <Text style={styles.achLabel}>
                            {rep.author.display_name || rep.author.public_user_id}
                          </Text>
                          <Text style={styles.noteBody}>{rep.body}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.inlineReplyRow}>
                    <TextInput
                      placeholder={t('Reply to thread…')}
                      placeholderTextColor={colors.onSurfaceFaint}
                      value={threadReplies[thread.comment_id] ?? ''}
                      onChangeText={(txt) =>
                        setThreadReplies((prev) => ({ ...prev, [thread.comment_id]: txt }))
                      }
                      style={[styles.input, { flex: 1, height: 42 }]}
                    />
                    <Pressable
                      disabled={
                        !(threadReplies[thread.comment_id] ?? '').trim() ||
                        replyThreadMutation.isPending
                      }
                      onPress={() =>
                        replyThreadMutation.mutate({
                          passportId: thread.passport_id,
                          commentId: thread.comment_id,
                          body: threadReplies[thread.comment_id] ?? '',
                        })
                      }
                      style={[
                        styles.inlineSendBtn,
                        (!(threadReplies[thread.comment_id] ?? '').trim() ||
                          replyThreadMutation.isPending) &&
                          styles.disabled,
                      ]}
                    >
                      <Ionicons name="send" size={16} color={colors.onPrimary} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : null}

        {/* 4. Contributions / Reputation */}
        {activeTab === 'reputation' ? (
          <View style={styles.section}>
            {reputation.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
            ) : reputation.data ? (
              <View style={styles.repCard}>
                <View style={styles.repHeader}>
                  <View style={styles.repAvatar}>
                    <Ionicons name="medal-outline" size={30} color={colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.repTitle}>{reputation.data.public_handle}</Text>
                    <Text style={styles.repMeta}>
                      {t('Community Contributor')} ·{' '}
                      {t(`${reputation.data.districts_represented} districts`)}
                    </Text>
                  </View>
                </View>

                <View style={styles.statsGrid}>
                  <Stat label={t('Posts')} value={reputation.data.observations_count} colors={colors} />
                  <Stat label={t('Evidence')} value={reputation.data.evidence_count} colors={colors} />
                  <Stat label={t('Votes')} value={reputation.data.votes_count} colors={colors} />
                  <Stat
                    label={t('Visits')}
                    value={reputation.data.visits_count}
                    colors={colors}
                  />
                </View>

                {reputation.data.achievements.length > 0 && (
                  <View style={styles.achievements}>
                    <Text style={styles.sectionLabel}>{t('Milestones')}</Text>
                    {reputation.data.achievements.map((ach) => (
                      <View key={ach.id} style={styles.achItem}>
                        <Ionicons
                          name={ach.earned ? 'ribbon' : 'ellipse-outline'}
                          size={18}
                          color={ach.earned ? colors.success : colors.outline}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.achLabel}>{t(ach.label)}</Text>
                          <Text style={styles.achDesc}>{t(ach.description)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={styles.disclaimerText}>{t(reputation.data.disclaimer)}</Text>
              </View>
            ) : (
              <MessageState
                title={t('Impact unavailable')}
                message={t('Check your connection and retry.')}
                onRetry={() => {
                  void reputation.refetch();
                }}
              />
            )}
          </View>
        ) : null}

        <Text style={styles.footerNote}>
          {t('Votes and answers reflect field views, not lab confirmation.')}
        </Text>

        <WhatsAppSubmissionButton variant="participate" />
      </ScrollView>

      <ReportContentModal
        visible={Boolean(reportTarget)}
        target={reportTarget}
        onClose={() => setReportTarget(null)}
      />
    </Screen>
  );
}

function Stat({ label, value, colors }: { label: string; value: number; colors: Palette }) {
  return (
    <View
      style={{
        flexGrow: 1,
        minWidth: '45%',
        alignItems: 'center',
        backgroundColor: colors.surfaceContainerLow,
        padding: 12,
        borderRadius: radius.m,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.onSurface }}>{value}</Text>
      <Text
        style={{
          fontSize: 10,
          fontWeight: '700',
          color: colors.onSurfaceFaint,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    content: { width: '100%', alignSelf: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    feedback: {
      backgroundColor: colors.surfaceContainerHigh,
      padding: 12,
      borderRadius: radius.m,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    feedbackText: { flex: 1, color: colors.onSurface, fontSize: 13, fontWeight: '600' },
    tabScroll: { gap: 8, paddingVertical: 2 },
    tabBtn: {
      paddingHorizontal: 14,
      minHeight: 42,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBtnSelected: {
      backgroundColor: colors.primaryContainer,
      borderColor: colors.primary,
    },
    tabText: { fontSize: 13, fontWeight: '600', color: colors.onSurfaceVariant },
    tabTextSelected: { color: colors.onPrimaryContainer, fontWeight: '700' },
    section: { gap: spacing.md },
    composerTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: spacing.md,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      backgroundColor: colors.surface,
    },
    composerTriggerText: { fontSize: 15, fontWeight: '700', color: colors.primary },
    formCard: {
      padding: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      gap: 12,
    },
    formLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.onSurfaceFaint,
      textTransform: 'uppercase',
    },
    input: {
      height: 46,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.m,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      paddingHorizontal: 12,
      color: colors.onSurface,
    },
    multilineInput: {
      minHeight: 80,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.m,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.onSurface,
      textAlignVertical: 'top',
    },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    checkboxLabel: { fontSize: 14, color: colors.onSurface },
    submitBtn: {
      height: 48,
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 15 },
    disabled: { opacity: 0.5 },
    emptyText: {
      textAlign: 'center',
      color: colors.onSurfaceFaint,
      fontSize: 14,
      paddingVertical: 36,
    },
    threadCard: {
      padding: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      gap: 10,
    },
    threadHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
    },
    threadPostTitle: { fontSize: 15, fontWeight: '700', color: colors.primary },
    threadBody: { fontSize: 14, color: colors.onSurface, lineHeight: 20 },
    threadReplies: {
      paddingLeft: 12,
      borderLeftWidth: 2,
      borderLeftColor: colors.outlineSoft,
      gap: 8,
    },
    threadReplyItem: { gap: 2 },
    inlineReplyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    inlineSendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    repCard: {
      padding: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      gap: 20,
    },
    repHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    repAvatar: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    repTitle: { fontSize: 19, fontWeight: '800', color: colors.onSurface },
    repMeta: { fontSize: 13, color: colors.onSurfaceFaint },
    dualRow: { flexDirection: 'row', gap: 8 },
    dualRowStack: { flexDirection: 'column' },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    achievements: { gap: 10 },
    sectionLabel: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.onSurfaceFaint,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    achItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    achLabel: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
    achDesc: { fontSize: 12, color: colors.onSurfaceFaint },
    disclaimerText: {
      fontSize: 11,
      color: colors.onSurfaceFaint,
      fontStyle: 'italic',
      lineHeight: 16,
    },
    noteBody: { color: colors.onSurfaceVariant, fontSize: 13, lineHeight: 18 },
    footerNote: { color: colors.onSurfaceFaint, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  });
}
