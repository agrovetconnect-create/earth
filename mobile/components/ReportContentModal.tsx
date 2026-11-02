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
import { useAuth } from '../auth/AuthProvider';
import { fileCommunityAbuseReport } from '../services/api';
import { getContributorToken } from '../services/contributorToken';
import { spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import {
  ABUSE_REPORT_REASONS,
  type AbuseReportReason,
  type AbuseReportTargetType,
} from '../types/api';
import { useAppLanguage } from '../utils/language';
import { useResponsiveLayout } from '../utils/responsive';
import { userFacingError } from '../utils/userFacingError';

const REASON_LABELS: Record<AbuseReportReason, string> = {
  incorrect_information: 'Incorrect claim',
  privacy_concern: 'Privacy concern',
  misleading_claim: 'Misleading mineral claim',
  commercial_or_spam: 'Spam or promotion',
  abusive_content: 'Abusive language',
  duplicate_record: 'Duplicate record',
  sensitive_location: 'Sensitive location',
  safety_principles: 'Safety concern',
  other: 'Other',
};

export interface ReportTarget {
  targetType: AbuseReportTargetType;
  targetId: string;
  label: string;
  observationPassportId?: string | null;
}

export function ReportContentModal({
  visible,
  target,
  onClose,
}: {
  visible: boolean;
  target: ReportTarget | null;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const auth = useAuth();
  const [reason, setReason] = useState<AbuseReportReason>('incorrect_information');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    if (visible) {
      setReason('incorrect_information');
      setDetails('');
      setError('');
      setConfirmation('');
      setSubmitting(false);
    }
  }, [visible, target?.targetId]);

  const submit = async () => {
    if (!target || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const contributorToken = await getContributorToken().catch(() => null);
      const response = await fileCommunityAbuseReport(
        {
          target_type: target.targetType,
          target_id: target.targetId,
          reason_code: reason,
          details: details.trim() || null,
          observation_passport_id: target.observationPassportId ?? null,
        },
        contributorToken,
        auth.token
      );
      setConfirmation(`${t(response.message)} ${t('Ref:')} ${response.report.public_id}`);
    } catch (err) {
      setError(userFacingError(err));
    } finally {
      setSubmitting(false);
    }
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
              <Text style={styles.eyebrow}>{t('Moderation')}</Text>
              <Text style={styles.title}>{t('Report')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Close report dialog')}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>{t('Close')}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {target ? (
              <Text style={styles.targetNote} numberOfLines={2}>
                {t(target.targetType)}: {target.label}
              </Text>
            ) : null}

            {confirmation ? (
              <View style={styles.successBox}>
                <Text style={styles.successTitle}>{t('Report sent')}</Text>
                <Text style={styles.successBody}>{confirmation}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={onClose}
                  style={styles.primaryBtn}
                >
                  <Text style={styles.primaryBtnText}>{t('Done')}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.label}>{t('Reason')}</Text>
                <View style={styles.reasonList}>
                  {ABUSE_REPORT_REASONS.map((code) => {
                    const selected = reason === code;
                    return (
                      <Pressable
                        key={code}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        onPress={() => setReason(code)}
                        style={[styles.reasonOption, selected && styles.reasonSelected]}
                      >
                        <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>
                          {t(REASON_LABELS[code])}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.label}>{t('Details (optional)')}</Text>
                <TextInput
                  accessibilityLabel={t('Optional report details')}
                  placeholder={t('Add context for moderators...')}
                  placeholderTextColor={colors.muted}
                  value={details}
                  onChangeText={setDetails}
                  multiline
                  maxLength={1000}
                  editable={!submitting}
                  style={styles.input}
                />

                {error ? (
                  <Text accessibilityRole="alert" style={styles.errorText}>
                    {error}
                  </Text>
                ) : null}

                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={onClose}
                    disabled={submitting}
                    style={styles.secondaryBtn}
                  >
                    <Text style={styles.secondaryBtnText}>{t('Cancel')}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Submit moderation report')}
                    onPress={() => {
                      void submit();
                    }}
                    disabled={submitting || !target}
                    style={[styles.primaryBtn, (submitting || !target) && styles.disabled]}
                  >
                    {submitting ? (
                      <ActivityIndicator color={colors.surface} />
                    ) : (
                      <Text style={styles.primaryBtnText}>{t('Submit')}</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
      maxHeight: '88%',
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
    headerText: { gap: 2, flex: 1 },
    eyebrow: { color: colors.earth, fontSize: 12, fontWeight: '700' },
    title: { color: colors.ink, fontSize: 18, fontWeight: '800' },
    closeBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
    closeText: { color: colors.forest, fontWeight: '700' },
    body: { gap: spacing.sm, paddingBottom: spacing.md },
    targetNote: { color: colors.muted, fontSize: 13, lineHeight: 18 },
    label: { color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 4 },
    reasonList: { gap: 6 },
    reasonOption: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.canvas,
    },
    reasonSelected: {
      borderColor: colors.forest,
      backgroundColor: colors.moss,
    },
    reasonText: { color: colors.ink, fontSize: 13 },
    reasonTextSelected: { color: colors.forest, fontWeight: '700' },
    input: {
      minHeight: 76,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      backgroundColor: colors.canvas,
      color: colors.ink,
      padding: 12,
      textAlignVertical: 'top',
    },
    errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
    secondaryBtn: {
      flex: 1,
      minHeight: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: { color: colors.ink, fontWeight: '700' },
    primaryBtn: {
      flex: 1,
      minHeight: 46,
      borderRadius: 12,
      backgroundColor: colors.forest,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    primaryBtnText: { color: colors.surface, fontWeight: '800' },
    disabled: { opacity: 0.5 },
    successBox: {
      padding: spacing.md,
      borderRadius: 14,
      backgroundColor: colors.moss,
      gap: 10,
    },
    successTitle: { color: colors.forest, fontSize: 16, fontWeight: '800' },
    successBody: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  });
}
