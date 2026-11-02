import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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
import { MessageState } from '../../components/AsyncState';
import { DrawerMenuButton } from '../../components/MobileNavDrawer';
import { ObservationCard } from '../../components/ObservationCard';
import {
  countActiveObservationFilters,
  ObservationFilterModal,
  type RichObservationFilters,
} from '../../components/ObservationFilterModal';
import { Eyebrow, Screen, ScreenTitle } from '../../components/Screen';
import { SiteExplorerModal } from '../../components/SiteExplorerModal';
import { WhatsAppSubmissionButton } from '../../components/WhatsAppSubmissionButton';
import {
  useCategories,
  useDistricts,
  useResearchOpportunities,
  useSites,
  useUnlocatedObservations,
} from '../../hooks/useObservations';
import { radius, spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import { useAppLanguage } from '../../utils/language';
import { observationDetailRoute } from '../../utils/observationNavigation';
import { useResponsiveLayout } from '../../utils/responsive';
import { userFacingError } from '../../utils/userFacingError';

export default function SitesScreen() {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<RichObservationFilters>({});
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [explorerSiteId, setExplorerSiteId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const districts = useDistricts();
  const categories = useCategories();
  const sites = useSites(filters.district);
  const opportunities = useResearchOpportunities();
  const unlocated = useUnlocatedObservations(
    {
      search: search || undefined,
      district: filters.district,
      category: filters.category,
      classification:
        (!filters.category || filters.category === 'rock') && filters.classification
          ? filters.classification
          : undefined,
      evidence_state: filters.evidence_state,
      confidence: filters.confidence,
      verification: filters.verification,
    },
    true
  );

  const filteredSites = useMemo(() => {
    const rows = sites.data?.rows ?? [];
    const needle = search.toLowerCase();
    return rows.filter((site) => {
      if (filters.evidence_state && site.highest_evidence_state !== filters.evidence_state) {
        return false;
      }
      if (filters.has_investigation && (site.investigation_count ?? 0) <= 0) {
        return false;
      }
      if (filters.has_evidence && (site.evidence_count ?? 0) <= 0) {
        return false;
      }
      if (!needle) return true;
      return (
        site.title.toLowerCase().includes(needle) ||
        site.site_code.toLowerCase().includes(needle) ||
        (site.district ?? '').toLowerCase().includes(needle) ||
        (site.description ?? '').toLowerCase().includes(needle)
      );
    });
  }, [sites.data?.rows, search, filters]);

  const refreshing =
    sites.isRefetching || unlocated.isRefetching || opportunities.isRefetching;

  const refreshAll = () => {
    void Promise.all([sites.refetch(), unlocated.refetch(), opportunities.refetch()]);
  };

  const unlocatedItems = unlocated.data?.pages.flatMap((p) => p.data) ?? [];
  const activeFilterCount = countActiveObservationFilters(filters);

  return (
    <Screen scroll={false}>
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
        <View style={styles.topBar}>
          <DrawerMenuButton />
          <View style={styles.titleBlock}>
            <Eyebrow>{t('Localities')}</Eyebrow>
            <ScreenTitle subtitle={t('Grouped sites & unlocated posts.')}>{t('Sites')}</ScreenTitle>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/(tabs)/map', params: { mode: 'sites' } })}
            style={styles.mapSwitchBtn}
          >
            <Ionicons name="map-outline" size={16} color={colors.primary} />
            <Text style={styles.mapSwitchText}>{t('Map')}</Text>
          </Pressable>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.onSurfaceVariant} />
          <TextInput
            accessibilityLabel={t('Search sites, districts or posts')}
            placeholder={t('Search sites or districts…')}
            placeholderTextColor={colors.onSurfaceFaint}
            value={searchInput}
            onChangeText={setSearchInput}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {searchInput.length > 0 && (
            <Pressable onPress={() => setSearchInput('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.onSurfaceFaint} />
            </Pressable>
          )}
          <View style={styles.searchDivider} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Filter sites and unlocated posts')}
            onPress={() => setFilterModalOpen(true)}
            style={styles.filterBtn}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={activeFilterCount > 0 ? colors.primary : colors.onSurfaceVariant}
            />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </Pressable>
        </View>

        {(districts.data?.length ?? 0) > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <Pressable
              onPress={() => setFilters((prev) => ({ ...prev, district: undefined }))}
              style={[styles.filterChip, !filters.district && styles.filterChipSelected]}
            >
              <Text style={[styles.filterText, !filters.district && styles.filterTextSelected]}>
                {t('All')}
              </Text>
            </Pressable>
            {districts.data?.map((d) => {
              const selected = filters.district === d.name;
              return (
                <Pressable
                  key={d.name}
                  onPress={() =>
                    setFilters((prev) => ({
                      ...prev,
                      district: selected ? undefined : d.name,
                    }))
                  }
                  style={[styles.filterChip, selected && styles.filterChipSelected]}
                >
                  <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                    {d.name} ({d.observation_count})
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t(`Published Sites (${filteredSites.length})`)}</Text>
            <Text style={styles.sectionSubtitle}>{t('3-layer AI, community, and expert records.')}</Text>
          </View>

          {sites.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : sites.error && filteredSites.length === 0 ? (
            <MessageState
              title={t('Sites unavailable')}
              message={userFacingError(sites.error)}
              onRetry={() => void sites.refetch()}
            />
          ) : filteredSites.length > 0 ? (
            filteredSites.map((site) => (
              <Pressable
                key={site.site_id}
                style={styles.siteCard}
                onPress={() => setExplorerSiteId(site.site_id)}
              >
                <View style={styles.siteInfo}>
                  <Text style={styles.siteCode}>
                    {site.site_code}
                    {site.district ? ` · ${site.district}` : ''}
                  </Text>
                  <Text style={styles.siteTitle}>{site.title}</Text>
                  {site.description ? (
                    <Text style={styles.siteDesc} numberOfLines={2}>
                      {site.description}
                    </Text>
                  ) : null}
                  <Text style={styles.siteMetrics}>
                    {t(`${site.observation_count ?? 0} obs`)} ·{' '}
                    {t(`${site.visit_count ?? 0} visits`)} · {site.investigation_count ?? 0}{' '}
                    {t('inv')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.outline} />
              </Pressable>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('No matching sites.')}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('Unlocated Posts')}</Text>
            <Text style={styles.sectionSubtitle}>{t('Shared without public map coordinates.')}</Text>
          </View>

          {unlocated.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : unlocated.error ? (
            <MessageState
              title={t('Could not load posts')}
              message={userFacingError(unlocated.error)}
              onRetry={() => void unlocated.refetch()}
            />
          ) : unlocatedItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('No unlocated posts.')}</Text>
            </View>
          ) : (
            <>
              {unlocatedItems.map((obs) => (
                <ObservationCard
                  key={obs.passport_id}
                  observation={obs}
                  onPress={() => router.push(observationDetailRoute(obs.passport_id))}
                />
              ))}
              {unlocated.hasNextPage && (
                <Pressable
                  disabled={unlocated.isFetchingNextPage}
                  onPress={() => void unlocated.fetchNextPage()}
                  style={styles.loadMoreBtn}
                >
                  <Text style={styles.loadMoreText}>
                    {unlocated.isFetchingNextPage ? t('Loading…') : t('Load more')}
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('Research Flags')}</Text>
            <Text style={styles.sectionSubtitle}>{t('Sites prioritized by community activity.')}</Text>
          </View>

          {opportunities.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : opportunities.error ? (
            <MessageState
              title={t('Could not load flags')}
              message={userFacingError(opportunities.error)}
              onRetry={() => void opportunities.refetch()}
            />
          ) : (opportunities.data?.items.length ?? 0) === 0 ? (
            <Text style={styles.emptyText}>{t('No active flags.')}</Text>
          ) : (
            opportunities.data?.items.slice(0, 6).map((opp) => {
              const canOpen = Boolean(opp.site_id || opp.public_id);
              return (
                <Pressable
                  key={opp.opportunity_id}
                  disabled={!canOpen}
                  onPress={() => {
                    if (opp.site_id) {
                      setExplorerSiteId(opp.site_id);
                    } else if (opp.basis === 'observation' && opp.public_id) {
                      router.push(observationDetailRoute(opp.public_id));
                    } else {
                      router.push({ pathname: '/(tabs)/community', params: { panel: 'investigations' } });
                    }
                  }}
                  style={styles.flagCard}
                >
                  <View style={styles.flagIcon}>
                    <Ionicons name="flask-outline" size={18} color={colors.warning} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.flagTitle}>{opp.question}</Text>
                    <Text style={styles.flagMeta}>
                      {opp.district ? opp.district : 'Rwanda'} ·{' '}
                      {t(`${opp.observation_count} obs`)} · {t(`${opp.evidence_count} notes`)}
                    </Text>
                  </View>
                  {canOpen && (
                    <Ionicons name="chevron-forward" size={18} color={colors.outline} />
                  )}
                </Pressable>
              );
            })
          )}
        </View>

        <WhatsAppSubmissionButton />
      </ScrollView>

      <ObservationFilterModal
        visible={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters({})}
        districts={districts.data ?? []}
        categories={categories.data ?? []}
        sitesMode
      />

      <SiteExplorerModal
        visible={Boolean(explorerSiteId)}
        siteId={explorerSiteId}
        onClose={() => setExplorerSiteId(null)}
      />
    </Screen>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    content: {
      width: '100%',
      alignSelf: 'center',
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl,
      gap: spacing.md,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    titleBlock: { flex: 1 },
    mapSwitchBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      height: 44,
      paddingHorizontal: 12,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    mapSwitchText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
    },
    searchBar: {
      height: 44,
      backgroundColor: colors.surface,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.onSurface,
      paddingVertical: 0,
    },
    searchDivider: {
      width: 1,
      height: 20,
      backgroundColor: colors.outlineSoft,
    },
    filterBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    filterBadgeText: {
      color: colors.onPrimary,
      fontSize: 10,
      fontWeight: '800',
    },
    section: { gap: 10 },
    sectionHeader: { gap: 2 },
    sectionTitle: {
      color: colors.onSurface,
      fontWeight: '800',
      fontSize: 17,
      letterSpacing: -0.2,
    },
    sectionSubtitle: { color: colors.onSurfaceFaint, fontSize: 12, lineHeight: 17 },
    filterRow: { flexDirection: 'row', paddingVertical: 2 },
    filterChip: {
      minHeight: 36,
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      marginRight: 8,
      backgroundColor: colors.surface,
    },
    filterChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterText: { fontSize: 12, fontWeight: '700', color: colors.onSurfaceVariant },
    filterTextSelected: { color: colors.onPrimary },
    siteCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      gap: 12,
    },
    siteInfo: { flex: 1, gap: 3 },
    siteCode: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.primary,
      textTransform: 'uppercase',
    },
    siteTitle: { fontSize: 15, fontWeight: '700', color: colors.onSurface },
    siteDesc: { fontSize: 13, color: colors.onSurfaceVariant, lineHeight: 18 },
    siteMetrics: { fontSize: 12, color: colors.onSurfaceFaint, marginTop: 2 },
    emptyCard: {
      padding: spacing.md,
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.l,
    },
    emptyText: { color: colors.onSurfaceFaint, fontSize: 13, textAlign: 'center' },
    loadMoreBtn: {
      height: 44,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outline,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadMoreText: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 13,
    },
    flagCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
      backgroundColor: colors.surface,
      borderRadius: radius.m,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    flagIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flagTitle: { fontSize: 14, fontWeight: '700', color: colors.onSurface },
    flagMeta: { fontSize: 11, color: colors.onSurfaceFaint },
  });
}
