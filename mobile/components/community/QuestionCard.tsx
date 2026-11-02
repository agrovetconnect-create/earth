import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import {
  answerCommunityQuestion,
  fetchCommunityQuestionDetail,
} from '../../services/api';
import { spacing, radius, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import type { PublicQuestionSummary } from '../../types/api';
import { useAppLanguage } from '../../utils/language';
import { userFacingError } from '../../utils/userFacingError';

export function QuestionCard({
  summary,
  ensureToken,
  onFeedback,
  onReport,
}: {
  summary: PublicQuestionSummary;
  ensureToken: () => Promise<string>;
  onFeedback: (msg: string) => void;
  onReport: (target: { targetType: 'question'; targetId: string; label: string }) => void;
}) {
  const { colors } = useAppTheme();
  const { language, t } = useAppLanguage();
  const dateLocale = language === 'fr' ? 'fr-FR' : 'en-US';
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [answerDraft, setAnswerDraft] = useState('');

  const detail = useQuery({
    queryKey: ['community', 'question-detail', summary.public_id],
    queryFn: ({ signal }) => fetchCommunityQuestionDetail(summary.public_id, signal),
    enabled: expanded,
  });

  const answerMutation = useMutation({
    mutationFn: async () =>
      answerCommunityQuestion(summary.public_id, answerDraft, await ensureToken()),
    onSuccess: async () => {
      setAnswerDraft('');
      onFeedback(t('Your answer was added.'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community', 'question-detail', summary.public_id] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'questions'] }),
        queryClient.invalidateQueries({ queryKey: ['community', 'reputation'] }),
      ]);
    },
    onError: (err) => onFeedback(userFacingError(err)),
  });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.metaRow}>
          <Text style={styles.idText}>{summary.public_id}</Text>
          <Text style={styles.metaDivider}>·</Text>
          <Text style={styles.authorText}>{summary.asked_by_handle}</Text>
          {summary.requested_expert && (
            <View style={styles.expertBadge}>
              <Ionicons name="shield-checkmark" size={10} color={colors.primary} />
              <Text style={styles.expertText}>{t('EXPERT')}</Text>
            </View>
          )}
        </View>
        <Text style={styles.question}>{summary.question}</Text>
        {summary.context ? <Text style={styles.context}>{summary.context}</Text> : null}
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => setExpanded(!expanded)}
          style={styles.expandBtn}
        >
          <Ionicons
            name={expanded ? 'chevron-up' : 'chatbubble-outline'}
            size={16}
            color={colors.primary}
          />
          <Text style={styles.expandText}>
            {expanded ? t('Hide') : t(`Answers (${summary.answer_count})`)}
          </Text>
        </Pressable>
        
        <Pressable
          onPress={() =>
            onReport({
              targetType: 'question',
              targetId: summary.public_id,
              label: summary.question,
            })
          }
          style={styles.reportBtn}
        >
          <Text style={styles.reportText}>{t('Report')}</Text>
        </Pressable>
      </View>

      {expanded && (
        <View style={styles.panel}>
          {detail.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ padding: 20 }} />
          ) : (
            <View style={styles.answersList}>
              {detail.data?.answers.map((ans) => (
                <View key={ans.id} style={styles.answerItem}>
                  <View style={styles.answerMeta}>
                    <Text style={styles.answerAuthor}>
                      {ans.contributor_handle}
                      {ans.is_expert ? t(' (Expert)') : ''}
                    </Text>
                    <Text style={styles.answerDate}>
                      {new Date(ans.created_at).toLocaleDateString(dateLocale)}
                    </Text>
                  </View>
                  <Text style={styles.answerBody}>{ans.answer}</Text>
                </View>
              ))}
              {detail.data?.answers.length === 0 && (
                <Text style={styles.emptyText}>{t('No answers yet.')}</Text>
              )}
            </View>
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={t('Add an answer…')}
              placeholderTextColor={colors.onSurfaceFaint}
              value={answerDraft}
              onChangeText={setAnswerDraft}
              multiline
            />
            <Pressable
              disabled={!answerDraft.trim() || answerMutation.isPending}
              onPress={() => answerMutation.mutate()}
              style={[styles.submitBtn, (!answerDraft.trim() || answerMutation.isPending) && styles.disabled]}
            >
              <Ionicons name="send" size={20} color={colors.onPrimary} />
            </Pressable>
          </View>
        </View>
      )}
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
    header: { padding: spacing.md, gap: 8 },
    metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    idText: {
      color: colors.onSurfaceFaint,
      fontSize: 11,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    metaDivider: { color: colors.outline, fontSize: 11 },
    authorText: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
    expertBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    expertText: { color: colors.onPrimaryContainer, fontSize: 9, fontWeight: '800' },
    question: { fontSize: 16, fontWeight: '700', color: colors.onSurface, lineHeight: 22 },
    context: { fontSize: 14, color: colors.onSurfaceFaint, lineHeight: 20 },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    expandBtn: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6 },
    expandText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    reportBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
    reportText: { color: colors.onSurfaceFaint, fontSize: 12 },
    panel: {
      borderTopWidth: 1,
      borderTopColor: colors.outlineSoft,
      backgroundColor: colors.surfaceContainerLow,
      padding: spacing.md,
      gap: spacing.md,
    },
    answersList: { gap: 12 },
    answerItem: { gap: 4 },
    answerMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    answerAuthor: { fontSize: 11, fontWeight: '700', color: colors.onSurfaceVariant },
    answerDate: { fontSize: 10, color: colors.onSurfaceFaint },
    answerBody: { fontSize: 13, color: colors.onSurface, lineHeight: 18 },
    emptyText: { textAlign: 'center', color: colors.onSurfaceFaint, fontSize: 12, paddingVertical: 12 },
    inputRow: { flexDirection: 'row', gap: 8 },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: colors.onSurface,
      fontSize: 14,
    },
    submitBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: { opacity: 0.5 },
  });
}
