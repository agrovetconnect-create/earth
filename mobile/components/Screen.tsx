import { useMemo, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import { useResponsiveLayout } from '../utils/responsive';

export function Screen({
  children,
  scroll = true,
  includeTopInset = true,
  includeBottomInset = false,
  keyboardAvoiding = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  includeTopInset?: boolean;
  includeBottomInset?: boolean;
  keyboardAvoiding?: boolean;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const edges: Edge[] = useMemo(() => {
    const list: Edge[] = ['left', 'right'];
    if (includeTopInset) list.unshift('top');
    if (includeBottomInset) list.push('bottom');
    return list;
  }, [includeTopInset, includeBottomInset]);

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: spacing.sm,
          paddingBottom: includeBottomInset ? spacing.md : spacing.xl,
          maxWidth: layout.contentMaxWidth,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fill}>{children}</View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Text style={styles.eyebrow} numberOfLines={1}>
      {children}
    </Text>
  );
}

export function ScreenTitle({
  eyebrow,
  title,
  children,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title?: string;
  children?: ReactNode;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { colors } = useAppTheme();
  const { isCompactPhone } = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.header}>
      <View style={styles.headerMain}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Text style={[styles.title, isCompactPhone && styles.titleCompact]}>
          {children ?? title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.headerAction}>{action}</View> : null}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.canvas },
    fill: { flex: 1 },
    scrollContent: {
      width: '100%',
      alignSelf: 'center',
      gap: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    headerMain: { flex: 1, flexShrink: 1, gap: 2 },
    headerAction: { flexShrink: 0, paddingTop: 2 },
    eyebrow: {
      color: colors.moss,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    title: {
      color: colors.ink,
      fontSize: 24,
      fontWeight: '800',
      lineHeight: 29,
      flexShrink: 1,
    },
    titleCompact: {
      fontSize: 21,
      lineHeight: 26,
    },
    subtitle: {
      color: colors.onSurfaceVariant,
      fontSize: 13,
      lineHeight: 18,
      flexShrink: 1,
    },
  });
}
