import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
<<<<<<< HEAD
import { radius, spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import type { ObservationSummary } from '../types/api';
import { useAppLanguage } from '../utils/language';
import { observationCardViewModel } from '../utils/observationCard';

export function ObservationCard({
  observation,
  onPress,
}: {
  observation: ObservationSummary;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fields = observationCardViewModel(observation);
  const title = fields.title;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(`Open observation ${title}`)}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{fields.category?.charAt(0).toUpperCase() ?? '◇'}</Text>
          </View>
          <View style={styles.titleArea}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {fields.category}
              {observation.is_demo ? ` · ${t('Demo')}` : ''}
            </Text>
          </View>
        </View>

        {fields.description ? (
          <Text numberOfLines={2} style={styles.description}>
            {fields.description}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.metaRow}>
            <Text style={styles.metaText} numberOfLines={1}>
              {fields.location ? `⌖ ${fields.location}` : t('Unlocated')}
            </Text>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaDate} numberOfLines={1}>
              {fields.date ?? fields.verification}
            </Text>
          </View>
          {fields.evidence ? (
            <View style={styles.evidenceBadge}>
              <Text style={styles.evidenceText}>{fields.evidence.replace(/_/g, ' ')}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    card: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      overflow: 'hidden',
    },
    pressed: {
      backgroundColor: colors.surfaceContainerLow,
    },
    content: {
      padding: spacing.md,
      gap: 8,
    },
    header: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
    },
    badge: {
      width: 38,
      height: 38,
      borderRadius: radius.m,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryContainer,
      flexShrink: 0,
    },
    badgeText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.onPrimaryContainer,
    },
    titleArea: {
      flex: 1,
      flexShrink: 1,
    },
    title: {
      color: colors.onSurface,
      fontSize: 15,
      fontWeight: '700',
      lineHeight: 20,
    },
    subtitle: {
      color: colors.onSurfaceVariant,
      fontSize: 12,
      textTransform: 'capitalize',
      marginTop: 1,
    },
    description: {
      color: colors.onSurface,
      fontSize: 13,
      lineHeight: 18,
    },
    footer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    metaRow: {
      flexDirection: 'row',
      flexShrink: 1,
      gap: 5,
      alignItems: 'center',
    },
    metaText: {
      color: colors.onSurfaceFaint,
      fontSize: 12,
      flexShrink: 1,
    },
    metaDot: {
      color: colors.onSurfaceFaint,
      fontSize: 12,
    },
    metaDate: {
      color: colors.onSurfaceFaint,
      fontSize: 12,
      flexShrink: 0,
    },
    evidenceBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceContainerHigh,
    },
    evidenceText: {
      color: colors.onSurfaceVariant,
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
  });
}
=======
import { spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import type { ObservationSummary } from '../types/api';
import { observationCardViewModel } from '../utils/observationCard';

export function ObservationCard({ observation, onPress }: { observation: ObservationSummary; onPress: () => void }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const fields = observationCardViewModel(observation);
  const title = fields.title;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open observation ${title}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <View style={styles.top}><View style={styles.symbol}><Text style={styles.symbolText}>◇</Text></View><View style={styles.heading}><Text style={styles.title} numberOfLines={2}>{title}</Text><Text style={styles.category}>{fields.category}{observation.is_demo ? ' · Demonstration record' : ''}</Text></View></View>
    {fields.description ? <Text numberOfLines={3} style={styles.description}>{fields.description}</Text> : null}
    <View style={styles.footer}>{fields.location ? <Text style={styles.meta}>⌖ {fields.location}</Text> : <View />}<Text style={styles.meta}>{fields.date ?? fields.verification}</Text></View>
    {fields.evidence ? <Text style={styles.evidence}>Evidence: {fields.evidence}</Text> : null}
  </Pressable>;
}
function createStyles(colors: Palette) { return StyleSheet.create({ card: { backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.line }, pressed: { opacity: 0.82 }, top: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' }, symbol: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.moss }, symbolText: { fontSize: 24, color: colors.forest }, heading: { flex: 1, gap: 4 }, title: { color: colors.ink, fontSize: 16, fontWeight: '700' }, category: { color: colors.muted, fontSize: 12, textTransform: 'capitalize' }, description: { color: colors.ink, lineHeight: 21, marginTop: spacing.md, fontSize: 14 }, footer: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, gap: spacing.sm }, meta: { color: colors.muted, fontSize: 12 }, evidence: { color: colors.muted, fontSize: 12, marginTop: 8, textTransform: 'capitalize' } }); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
