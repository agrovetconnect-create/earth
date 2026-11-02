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
import { compareObservations } from '../services/api';
import { spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import type { ObservationComparisonResponse } from '../types/api';
import { useAppLanguage } from '../utils/language';
import { useResponsiveLayout } from '../utils/responsive';
import { userFacingError } from '../utils/userFacingError';

export function ComparePassportsModal({
  visible,
  initialPassportA = '',
  initialPassportB = '',
  onClose,
}: {
  visible: boolean;
  initialPassportA?: string;
  initialPassportB?: string;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [passportA, setPassportA] = useState(initialPassportA);
  const [passportB, setPassportB] = useState(initialPassportB);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ObservationComparisonResponse | null>(null);

  useEffect(() => {
    if (visible) {
      setPassportA(initialPassportA);
      setPassportB(initialPassportB);
      setError('');
      setResult(null);
      if (initialPassportA.trim() && initialPassportB.trim()) {
        void runCompare(initialPassportA, initialPassportB);
      }
    }
  }, [visible, initialPassportA, initialPassportB]);

  const runCompare = async (aRaw: string, bRaw: string) => {
    const a = aRaw.trim().toUpperCase();
    const b = bRaw.trim().toUpperCase();
    if (!a || !b) {
      setError(t('Enter two Passport IDs.'));
      return;
    }
    if (a === b) {
      setError(t('Choose two different Passports.'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await compareObservations(a, b);
      setResult(response);
    } catch (err) {
      setResult(null);
      setError(userFacingError(err));
    } finally {
      setLoading(false);
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
              <Text style={styles.eyebrow}>{t('Side-by-side')}</Text>
              <Text style={styles.title}>{t('Compare Passports')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Close comparison dialog')}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>{t('Close')}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.note}>
              {t('Compare two public passports without merging records.')}
            </Text>

            <View style={[styles.inputsRow, layout.isCompactPhone && styles.inputsRowStack]}>
              <View style={styles.inputCol}>
                <Text style={styles.label}>{t('Passport A')}</Text>
                <TextInput
                  accessibilityLabel={t('First Geoscience Passport ID')}
                  placeholder="ET-RW-000001"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="characters"
                  value={passportA}
                  onChangeText={setPassportA}
                  style={styles.input}
                />
              </View>
              <View style={styles.inputCol}>
                <Text style={styles.label}>{t('Passport B')}</Text>
                <TextInput
                  accessibilityLabel={t('Second Geoscience Passport ID')}
                  placeholder="ET-RW-000002"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="characters"
                  value={passportB}
                  onChangeText={setPassportB}
                  style={styles.input}
                />
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Compare selected Geoscience Passports')}
              disabled={loading || !passportA.trim() || !passportB.trim()}
              onPress={() => {
                void runCompare(passportA, passportB);
              }}
              style={[
                styles.primaryBtn,
                (loading || !passportA.trim() || !passportB.trim()) && styles.disabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.surface} />
              ) : (
                <Text style={styles.primaryBtnText}>{t('Compare')}</Text>
              )}
            </Pressable>

            {error ? (
              <Text accessibilityRole="alert" style={styles.errorText}>
                {error}
              </Text>
            ) : null}

            {result ? (
              <View style={styles.resultsWrap}>
                <View style={styles.tableHeader}>
                  <Text style={styles.colLabel}>{passportA.trim().toUpperCase()}</Text>
                  <Text style={styles.colLabel}>{passportB.trim().toUpperCase()}</Text>
                </View>
                {result.comparison.map((row) => (
                  <View key={row.label} style={styles.rowCard}>
                    <Text style={styles.rowLabel}>{t(row.label)}</Text>
                    <View style={styles.valuesRow}>
                      <Text style={styles.valText}>{row.valueA ? t(row.valueA) : '—'}</Text>
                      <Text style={styles.valText}>{row.valueB ? t(row.valueB) : '—'}</Text>
                    </View>
                    <Text style={styles.rowNote}>{t(row.note)}</Text>
                  </View>
                ))}
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>{t(result.expertSeparationNote)}</Text>
                </View>
              </View>
            ) : null}
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
      maxHeight: '90%',
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
    note: { color: colors.muted, fontSize: 13, lineHeight: 18 },
    inputsRow: { flexDirection: 'row', gap: 10 },
    inputsRowStack: { flexDirection: 'column' },
    inputCol: { flex: 1, gap: 4 },
    label: { color: colors.ink, fontSize: 13, fontWeight: '700' },
    input: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 12,
      backgroundColor: colors.canvas,
      color: colors.ink,
      paddingHorizontal: 12,
      fontSize: 14,
    },
    primaryBtn: {
      minHeight: 46,
      borderRadius: 12,
      backgroundColor: colors.forest,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    primaryBtnText: { color: colors.surface, fontWeight: '800' },
    disabled: { opacity: 0.5 },
    errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
    resultsWrap: { gap: 10, marginTop: 6 },
    tableHeader: {
      flexDirection: 'row',
      gap: 10,
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
    },
    colLabel: { flex: 1, color: colors.forest, fontWeight: '800', fontSize: 13 },
    rowCard: {
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.line,
      gap: 5,
    },
    rowLabel: { color: colors.ink, fontWeight: '700', fontSize: 13 },
    valuesRow: { flexDirection: 'row', gap: 10 },
    valText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20 },
    rowNote: { color: colors.muted, fontSize: 12, lineHeight: 17 },
    warningBox: {
      padding: spacing.sm,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerHigh,
    },
    warningText: { color: colors.warning, fontSize: 12, lineHeight: 18 },
  });
}
