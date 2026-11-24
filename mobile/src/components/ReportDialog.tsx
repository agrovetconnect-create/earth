import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, Flag, Loader2, X, ChevronDown } from 'lucide-react-native';
import { reportContent } from '../services/postsApi';
import {
  ABUSE_REPORT_REASON_LABEL,
  ABUSE_REPORT_REASONS,
  type AbuseReportReason,
  type AbuseReportTargetType,
} from '../types/communityPosts';
import { colors, radius, spacing, type as typeScale } from '../lib/theme';

/**
 * Report a post, a question or a comment — a port of the web ReportDialog.
 *
 * A report is an allegation. This dialog is deliberately plain: it gathers a
 * reason and optional detail, files the report, and says so. It never hides the
 * content and never suggests the report has been upheld.
 */
export function ReportDialog({
  isOpen,
  onClose,
  targetType,
  targetId,
  observationPassportId,
  targetLabel,
}: {
  isOpen: boolean;
  onClose: () => void;
  targetType: AbuseReportTargetType;
  targetId: string;
  /** The reported observation's passport id, when the target sits on a post. */
  observationPassportId?: string | null;
  /** A short label for what is being reported, shown to the reader. */
  targetLabel?: string;
}) {
  const [reason, setReason] = useState<AbuseReportReason>('incorrect_information');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicId, setPublicId] = useState<string | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason('incorrect_information');
      setDetails('');
      setSubmitting(false);
      setError(null);
      setPublicId(null);
      setReasonOpen(false);
    }
  }, [isOpen, targetId]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await reportContent({
        target_type: targetType,
        target_id: targetId,
        reason_code: reason,
        details: details.trim() || null,
        observation_passport_id: observationPassportId ?? null,
      });
      setPublicId(result.report.public_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Your report could not be filed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }} pointerEvents="box-none">
          <View style={styles.dialog}>
            <View style={styles.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Flag size={20} color="#b3261e" />
                <Text style={styles.headerTitle}>Report</Text>
              </View>
              <Pressable accessibilityLabel="Close" onPress={onClose} hitSlop={8}>
                <X size={20} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>

            {publicId ? (
              <View style={{ padding: spacing.xl, gap: spacing.md }}>
                <Text style={styles.bodyCopy}>
                  Thank you. Your report has been recorded for review under reference{' '}
                  <Text style={styles.referenceId}>{publicId}</Text>.
                </Text>
                <Text style={styles.bodyCopySmall}>
                  A report is an allegation. It does not by itself change what is shown, and it is
                  never counted as community agreement.
                </Text>
                <Pressable style={({ pressed }) => [styles.cancelButton, pressed && { opacity: 0.8 }]} onPress={onClose}>
                  <Text style={styles.cancelText}>Close</Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 480 }}>
                <View style={{ padding: spacing.xl, paddingTop: spacing.lg }}>
                  <Text style={styles.bodyCopy}>
                    Reporting{' '}
                    {targetLabel ? (
                      <Text style={styles.targetInline}>{targetLabel}</Text>
                    ) : (
                      'this content'
                    )}
                    . Tell us what is wrong. Anyone can report, signed in or not.
                  </Text>

                  <Text style={styles.fieldLabel}>Reason</Text>
                  <Pressable style={styles.select} onPress={() => setReasonOpen(true)}>
                    <Text style={styles.selectValue} numberOfLines={2}>
                      {ABUSE_REPORT_REASON_LABEL[reason]}
                    </Text>
                    <ChevronDown size={16} color={colors.onSurfaceVariant} />
                  </Pressable>

                  {reasonOpen
                    ? ABUSE_REPORT_REASONS.map((option) => (
                        <Pressable
                          key={option}
                          style={({ pressed }) => [
                            styles.optionRow,
                            option === reason && styles.optionRowActive,
                            pressed && { opacity: 0.8 },
                          ]}
                          onPress={() => {
                            setReason(option);
                            setReasonOpen(false);
                          }}
                        >
                          <Text style={[styles.optionLabel, option === reason && { color: colors.primary, fontWeight: '500' }]}>
                            {ABUSE_REPORT_REASON_LABEL[option]}
                          </Text>
                          {option === reason ? <Check size={16} color={colors.primary} /> : null}
                        </Pressable>
                      ))
                    : null}

                  <Text style={styles.fieldLabel}>Details (optional)</Text>
                  <TextInput
                    style={[styles.detailsInput, { height: 88 }]}
                    value={details}
                    onChangeText={setDetails}
                    placeholder="Add anything that helps a reviewer understand the problem."
                    placeholderTextColor={colors.outline}
                    multiline
                    textAlignVertical="top"
                  />

                  {error ? <Text style={styles.errorText}>{error}</Text> : null}

                  <Pressable
                    disabled={submitting}
                    style={({ pressed }) => [
                      styles.fileButton,
                      pressed && { opacity: 0.9 },
                      submitting && { opacity: 0.5 },
                    ]}
                    onPress={() => void submit()}
                  >
                    {submitting ? (
                      <Loader2 size={16} color="#ffffff" />
                    ) : (
                      <Flag size={16} color="#ffffff" />
                    )}
                    <Text style={styles.fileButtonText}>{submitting ? 'Filing…' : 'File report'}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(11,11,12,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  dialog: {
    width: '100%',
    maxWidth: 448,
    maxHeight: '90%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.onSurface,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.05,
    textTransform: 'uppercase',
    color: colors.onSurfaceVariant,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  select: {
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectValue: {
    flex: 1,
    fontSize: 13,
    color: colors.onSurface,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    marginTop: 2,
  },
  optionRowActive: {
    backgroundColor: '#e8f0fe',
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
  },
  detailsInput: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
    padding: 10,
    fontSize: 13,
    color: colors.onSurface,
  },
  errorText: {
    marginTop: spacing.md,
    fontSize: 12,
    color: colors.danger,
  },
  fileButton: {
    marginTop: spacing.lg,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  fileButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  referenceId: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.primary,
  },
  bodyCopy: {
    ...typeScale.bodySmall,
    color: colors.onSurfaceVariant,
    marginTop: spacing.md,
    lineHeight: 18,
  },
  bodyCopySmall: {
    ...typeScale.bodySmall,
    color: colors.onSurfaceVariant,
    lineHeight: 18,
  },
  targetInline: {
    fontWeight: '600',
    color: '#1f1f1f',
  },
  cancelButton: {
    marginTop: spacing.lg,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 13,
    color: colors.onSurface,
  },
});
