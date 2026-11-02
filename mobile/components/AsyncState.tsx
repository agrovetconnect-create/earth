import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
<<<<<<< HEAD
import { useAppLanguage } from '../utils/language';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translatedLabel = t(label);
  return (
    <View style={styles.box} accessibilityRole="progressbar" accessibilityLabel={translatedLabel}>
      <ActivityIndicator color={colors.forest} />
      <Text style={styles.body}>{translatedLabel}</Text>
    </View>
  );
}

export function MessageState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message?: string;
  onRetry?: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const translatedTitle = t(title);
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <Text style={styles.title}>{translatedTitle}</Text>
      {message ? <Text style={styles.body}>{t(message)}</Text> : null}
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(`Retry: ${title}`)}
          hitSlop={8}
          onPress={onRetry}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{t('Retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    box: {
      padding: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
    },
    title: {
      color: colors.ink,
      fontWeight: '700',
      fontSize: 15,
      textAlign: 'center',
    },
    body: {
      color: colors.muted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
    },
    button: {
      marginTop: 6,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 18,
      backgroundColor: colors.forest,
      minHeight: 44,
      justifyContent: 'center',
    },
    buttonText: {
      color: colors.surface,
      fontWeight: '700',
      fontSize: 13,
      textAlign: 'center',
    },
  });
}
=======

export function LoadingState({ label = 'Loading Earth Talk…' }: { label?: string }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.box} accessibilityRole="progressbar" accessibilityLabel={label}><ActivityIndicator color={colors.forest} /><Text style={styles.body}>{label}</Text></View>;
}
export function MessageState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.box} accessibilityLiveRegion="polite"><Text style={styles.title}>{title}</Text><Text style={styles.body}>{message}</Text>{onRetry ? <Pressable accessibilityRole="button" accessibilityLabel={`Retry: ${title}`} hitSlop={8} onPress={onRetry} style={styles.button}><Text style={styles.buttonText}>Try again</Text></Pressable> : null}</View>;
}
function createStyles(colors: Palette) { return StyleSheet.create({ box: { padding: spacing.xl, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.line }, title: { color: colors.ink, fontWeight: '700', fontSize: 17, textAlign: 'center' }, body: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' }, button: { marginTop: 4, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 18, backgroundColor: colors.forest, minHeight: 44, justifyContent: 'center' }, buttonText: { color: colors.surface, fontWeight: '700', textAlign: 'center' } }); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
