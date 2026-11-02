<<<<<<< HEAD
import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AsyncPanel } from '../../components/AsyncPanel';
import { DrawerMenuButton } from '../../components/MobileNavDrawer';
import { ObservationCard } from '../../components/ObservationCard';
import { PhotoSubmissionModal } from '../../components/PhotoSubmissionModal';
import { Eyebrow, Screen } from '../../components/Screen';
import { WhatsAppSubmissionButton } from '../../components/WhatsAppSubmissionButton';
import { useRecentObservations } from '../../hooks/useObservations';
import { radius, spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import { useAppLanguage } from '../../utils/language';
import { observationDetailRoute } from '../../utils/observationNavigation';
import { useResponsiveLayout } from '../../utils/responsive';

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const recent = useRecentObservations();
  const [submissionModalVisible, setSubmissionModalVisible] = useState(false);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View style={styles.brand}>
          <DrawerMenuButton />
          <Image
            accessibilityIgnoresInvertColors
            accessible={false}
            resizeMode="contain"
            source={require('../../assets/images/icon.png')}
            style={styles.brandMark}
          />
          <View style={styles.brandText}>
            <Text style={styles.brandName} numberOfLines={1}>
              Earth Talk
            </Text>
            <Text style={styles.tagline} numberOfLines={1}>
              {t('Field GeoAI')}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Open GeoAI Chat')}
            style={styles.headerBtn}
            onPress={() => router.push('/(tabs)/chat')}
          >
            <Ionicons name="chatbubbles-outline" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Open Profile')}
            style={styles.headerBtn}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Ionicons name="person-outline" size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.hero, layout.isCompactPhone && styles.heroCompact]}>
        <View style={styles.heroContent}>
          <Eyebrow>{t('Field Assistant')}</Eyebrow>
          <Text style={[styles.heroTitle, layout.isCompactPhone && styles.heroTitleCompact]}>
            {t('Identify rocks & landforms')}
          </Text>
          <Text style={styles.heroSubtitle}>
            {t('Snap a specimen, ask GeoAI, or browse Rwanda records.')}
          </Text>
        </View>

        <View style={[styles.heroActions, layout.isCompactPhone && styles.heroActionsStack]}>
          <Link href="/(tabs)/chat" asChild>
            <Pressable accessibilityRole="button" style={styles.heroPrimaryBtn}>
              <Ionicons name="chatbubbles" size={18} color={colors.onPrimary} />
              <Text style={styles.heroPrimaryBtnText} numberOfLines={1}>
                {t('GeoAI Chat')}
              </Text>
            </Pressable>
          </Link>
          <Pressable
            accessibilityRole="button"
            style={styles.heroSecondaryBtn}
            onPress={() => setSubmissionModalVisible(true)}
          >
            <Ionicons name="camera" size={18} color={colors.primary} />
            <Text style={styles.heroSecondaryBtnText} numberOfLines={1}>
              {t('Submit Photo')}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.quickLinks}>
        <Link href="/(tabs)/map" asChild>
          <Pressable style={styles.quickLinkItem}>
            <View style={[styles.quickLinkIcon, { backgroundColor: colors.primaryContainer }]}>
              <Ionicons name="map" size={20} color={colors.primary} />
            </View>
            <Text style={styles.quickLinkLabel} numberOfLines={1}>
              {t('Map')}
            </Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)/sites" asChild>
          <Pressable style={styles.quickLinkItem}>
            <View style={[styles.quickLinkIcon, { backgroundColor: colors.surfaceContainerLow }]}>
              <Ionicons name="location" size={20} color={colors.earth} />
            </View>
            <Text style={styles.quickLinkLabel} numberOfLines={1}>
              {t('Sites')}
            </Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)/explore" asChild>
          <Pressable style={styles.quickLinkItem}>
            <View style={[styles.quickLinkIcon, { backgroundColor: colors.surfaceContainerLow }]}>
              <Ionicons name="compass" size={20} color={colors.warning} />
            </View>
            <Text style={styles.quickLinkLabel} numberOfLines={1}>
              {t('Explore')}
            </Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)/community" asChild>
          <Pressable style={styles.quickLinkItem}>
            <View style={[styles.quickLinkIcon, { backgroundColor: colors.surfaceContainerLow }]}>
              <Ionicons name="people" size={20} color={colors.success} />
            </View>
            <Text style={styles.quickLinkLabel} numberOfLines={1}>
              {t('Community')}
            </Text>
          </Pressable>
        </Link>
        <Link href="/settings" asChild>
          <Pressable style={styles.quickLinkItem}>
            <View style={[styles.quickLinkIcon, { backgroundColor: colors.surfaceContainerLow }]}>
              <Ionicons name="settings" size={20} color={colors.onSurfaceVariant} />
            </View>
            <Text style={styles.quickLinkLabel} numberOfLines={1}>
              {t('Settings')}
            </Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{t('Recent Passports')}</Text>
        <Link href="/(tabs)/explore" asChild>
          <Pressable hitSlop={12}>
            <Text style={styles.seeAllLink}>{t('See all')}</Text>
          </Pressable>
        </Link>
      </View>

      <AsyncPanel
        isLoading={recent.isLoading}
        error={recent.error}
        isEmpty={!recent.data?.data.length}
        onRetry={() => {
          void recent.refetch();
        }}
        emptyTitle={t('No passports yet')}
      />

      <View style={[styles.observationsGrid, layout.isTablet && styles.observationsGridTablet]}>
        {recent.data?.data.slice(0, 4).map((item) => (
          <View key={item.passport_id} style={layout.isTablet ? styles.tabletCell : undefined}>
            <ObservationCard
              observation={item}
              onPress={() => router.push(observationDetailRoute(item.passport_id))}
            />
          </View>
        ))}
      </View>

      <View style={styles.promoCard}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
        <Text style={styles.promoText}>
          {t('Preliminary AI only. Locations stay private until you pin.')}
        </Text>
      </View>

      <WhatsAppSubmissionButton />

      <PhotoSubmissionModal
        visible={submissionModalVisible}
        onClose={() => setSubmissionModalVisible(false)}
        onSuccess={() => {
          void recent.refetch();
        }}
      />
    </Screen>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    headerActions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
    headerBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    brandText: { flex: 1 },
    brandMark: { width: 32, height: 38, flexShrink: 0 },
    brandName: { fontWeight: '800', color: colors.onSurface, fontSize: 17, letterSpacing: -0.3 },
    tagline: { color: colors.onSurfaceFaint, fontSize: 11 },

    hero: {
      padding: spacing.lg,
      backgroundColor: colors.primaryContainer,
      borderRadius: radius.xl,
      gap: spacing.md,
    },
    heroCompact: {
      padding: spacing.md,
    },
    heroContent: { gap: 4 },
    heroTitle: {
      fontSize: 25,
      fontWeight: '800',
      color: colors.onPrimaryContainer,
      letterSpacing: -0.4,
      lineHeight: 30,
    },
    heroTitleCompact: {
      fontSize: 22,
      lineHeight: 27,
    },
    heroSubtitle: {
      fontSize: 14,
      color: colors.onPrimaryContainer,
      opacity: 0.86,
      lineHeight: 20,
    },
    heroActions: { flexDirection: 'row', gap: 10 },
    heroActionsStack: { flexDirection: 'column' },
    heroPrimaryBtn: {
      flex: 1,
      minHeight: 48,
      paddingHorizontal: 14,
      backgroundColor: colors.primary,
      borderRadius: radius.full,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    heroPrimaryBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 14 },
    heroSecondaryBtn: {
      flex: 1,
      minHeight: 48,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outline,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    heroSecondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },

    quickLinks: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 10,
      columnGap: 6,
    },
    quickLinkItem: {
      minWidth: 56,
      flex: 1,
      alignItems: 'center',
      gap: 6,
    },
    quickLinkIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLinkLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.onSurfaceVariant,
    },

    sectionHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 4,
    },
    sectionTitle: {
      color: colors.onSurface,
      fontWeight: '800',
      fontSize: 18,
      letterSpacing: -0.2,
    },
    seeAllLink: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 13,
      paddingVertical: 6,
    },
    observationsGrid: { gap: 4 },
    observationsGridTablet: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    tabletCell: {
      width: '48.8%',
    },

    promoCard: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      borderRadius: radius.m,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      gap: 10,
    },
    promoText: {
      flex: 1,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      lineHeight: 17,
    },
  });
}
=======
import { Link, router } from 'expo-router';
import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AsyncPanel } from '../../components/AsyncPanel';
import { ObservationCard } from '../../components/ObservationCard';
import { Eyebrow, Screen, ScreenTitle } from '../../components/Screen';
import { useRecentObservations } from '../../hooks/useObservations';
import { spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import { WhatsAppSubmissionButton } from '../../components/WhatsAppSubmissionButton';
import { observationDetailRoute } from '../../utils/observationNavigation';

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const recent = useRecentObservations();
  return <Screen>
    <View style={styles.brand}><Image accessibilityIgnoresInvertColors accessible={false} source={require('../../assets/images/icon.png')} style={styles.brandMark} /><View><Text style={styles.brandName}>Earth Talk</Text><Text style={styles.tagline}>Every rock has a story.</Text></View></View>
    <View style={styles.hero}><Eyebrow>Field notes for everyone</Eyebrow><ScreenTitle subtitle="Explore geological observations and learn what the evidence can—and cannot—tell us.">A closer look at Earth</ScreenTitle>
      <View style={styles.actions}><Link href="/(tabs)/explore" asChild><Pressable accessibilityRole="button" style={styles.primary}><Text style={styles.primaryText}>Explore observations</Text></Pressable></Link><Link href="/(tabs)/map" asChild><Pressable accessibilityRole="button" style={styles.secondary}><Text style={styles.secondaryText}>Open map</Text></Pressable></Link></View>
    </View>
    <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Recent observations</Text><Link href="/(tabs)/explore" style={styles.link}>See all</Link></View>
    <AsyncPanel isLoading={recent.isLoading} error={recent.error} isEmpty={!recent.data?.data.length} onRetry={() => { void recent.refetch(); }} emptyTitle="No observations to show yet" emptyMessage="Public observations will appear here when the Earth Talk API returns them." />
    {recent.data?.data.map((item) => <ObservationCard key={item.passport_id} observation={item} onPress={() => router.push(observationDetailRoute(item.passport_id))} />)}
    <View style={styles.note}><Text style={styles.noteTitle}>About AI-assisted interpretations</Text><Text style={styles.noteText}>AI interpretations are preliminary and include uncertainty. They are not a substitute for expert assessment or scientific confirmation.</Text></View>
    <View style={styles.submit}><Text style={styles.submitTitle}>Have a geological observation?</Text><WhatsAppSubmissionButton /></View>
  </Screen>;
}

function createStyles(colors: Palette) { return StyleSheet.create({ brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }, brandMark: { width: 48, height: 48, borderRadius: 16 }, brandName: { fontWeight: '800', color: colors.ink, fontSize: 17 }, tagline: { color: colors.muted, fontSize: 12, marginTop: 2 }, hero: { padding: spacing.lg, backgroundColor: colors.moss, borderRadius: 22, gap: spacing.md }, actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' }, primary: { minHeight: 48, justifyContent: 'center', backgroundColor: colors.forest, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 13 }, primaryText: { color: colors.surface, fontWeight: '700' }, secondary: { minHeight: 48, justifyContent: 'center', backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 13, borderWidth: 1, borderColor: colors.line }, secondaryText: { color: colors.forest, fontWeight: '700' }, sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }, sectionTitle: { color: colors.ink, fontWeight: '800', fontSize: 19 }, link: { color: colors.forest, fontWeight: '700', padding: 8 }, note: { padding: spacing.md, borderRadius: 16, backgroundColor: colors.warningBg, gap: 6 }, noteTitle: { color: colors.warning, fontWeight: '700' }, noteText: { color: colors.ink, fontSize: 13, lineHeight: 19 }, submit: { padding: spacing.md, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: 5 }, submitTitle: { color: colors.ink, fontWeight: '700' }, submitText: { color: colors.muted, fontSize: 13, lineHeight: 19 } }); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
