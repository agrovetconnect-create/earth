import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MessageState } from '../../components/AsyncState';
import { ComparePassportsModal } from '../../components/ComparePassportsModal';
import { DrawerMenuButton } from '../../components/MobileNavDrawer';
import { ObservationCard } from '../../components/ObservationCard';
import {
  countActiveObservationFilters,
  EVIDENCE_LADDER_OPTIONS,
  ObservationFilterModal,
  type RichObservationFilters,
} from '../../components/ObservationFilterModal';
import { Eyebrow, Screen, ScreenTitle } from '../../components/Screen';
import {
  useCategories,
  useDistricts,
  useObservations,
  usePublicStats,
  useUnlocatedObservations,
} from '../../hooks/useObservations';
import { radius, spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import { useAppLanguage } from '../../utils/language';
import { observationDetailRoute } from '../../utils/observationNavigation';
import { useResponsiveLayout } from '../../utils/responsive';
import { userFacingError } from '../../utils/userFacingError';

const ROCK_TYPE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'igneous', label: 'Igneous' },
  { value: 'sedimentary', label: 'Sedimentary' },
  { value: 'metamorphic', label: 'Metamorphic' },
  { value: 'unclassified', label: 'Unclassified' },
];

const QUICK_EVIDENCE_OPTIONS: readonly { value: string; label: string }[] =
  EVIDENCE_LADDER_OPTIONS.filter((opt) => opt.value !== '');

export default function ExploreScreen() {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [richFilters, setRichFilters] = useState<RichObservationFilters>({});
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [scope, setScope] = useState<'all' | 'unlocated'>('all');

  const [compareOpen, setCompareOpen] = useState(false);
  const [comparePickA, setComparePickA] = useState('');
  const [comparePickB, setComparePickB] = useState('');

  const categories = useCategories();
  const districts = useDistricts();
  const stats = usePublicStats();

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryFilters = useMemo(
    () => ({
      search,
      category: richFilters.category || undefined,
      classification:
        (!richFilters.category || richFilters.category === 'rock') && richFilters.classification
          ? richFilters.classification
          : undefined,
      evidence_state: richFilters.evidence_state || undefined,
      confidence: richFilters.confidence || undefined,
      verification: richFilters.verification || undefined,
      district: richFilters.district || undefined,
    }),
    [search, richFilters]
  );

  const observedChipList = useMemo(() => {
    if (categories.data && categories.data.length > 0) {
      return categories.data.map((c) => ({
        value: c.category,
        label: `${t(c.label)} (${c.observation_count})`,
      }));
    }
    return [];
  }, [categories.data, t]);

  const allQuery = useObservations(queryFilters);
  const unlocatedQuery = useUnlocatedObservations(queryFilters, scope === 'unlocated');
  const activeQuery = scope === 'unlocated' ? unlocatedQuery : allQuery;

  const observations = useMemo(() => {
    const raw = activeQuery.data?.pages.flatMap((page) => page.data) ?? [];
    return raw.filter((item) => {
      if (richFilters.confidence && item.confidence !== richFilters.confidence) return false;
      if (richFilters.verification && item.verification_status !== richFilters.verification) {
        return false;
      }
      return true;
    });
  }, [activeQuery.data, richFilters.confidence, richFilters.verification]);

  const activeFilterCount = countActiveObservationFilters(richFilters);

  const handleToggleCompare = (passportId: string) => {
    if (!comparePickA || comparePickA === passportId) {
      setComparePickA(comparePickA === passportId ? '' : passportId);
      return;
    }
    setComparePickB(passportId);
    setCompareOpen(true);
  };

  return (
    <Screen scroll={false}>
      <View
        style={[
          styles.pageWrap,
          {
            paddingHorizontal: layout.horizontalPadding,
            maxWidth: layout.contentMaxWidth,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.topRow}>
            <DrawerMenuButton />
            <View style={{ flex: 1 }}>
              <Eyebrow>{t('Public archive')}</Eyebrow>
              <ScreenTitle
                subtitle={
                  stats.data
                    ? t(
                        `${stats.data.total_observations} records · ${stats.data.verified_observations} verified · ${stats.data.recent_observations} new`
                      )
                    : t('Browse & compare public passports.')
                }
              >
                {t('Explore')}
              </ScreenTitle>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(tabs)/sites')}
              style={styles.sitesBtn}
            >
              <Ionicons name="location-outline" size={16} color={colors.primary} />
              <Text style={styles.sitesBtnText}>{t('Sites')}</Text>
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchContainer}>
              <Ionicons
                name="search"
                size={18}
                color={colors.onSurfaceVariant}
                style={styles.searchIcon}
              />
              <TextInput
                accessibilityLabel={t('Search observations')}
                placeholder={t('Search rocks, districts, IDs…')}
                placeholderTextColor={colors.onSurfaceFaint}
                value={searchInput}
                onChangeText={setSearchInput}
                returnKeyType="search"
                style={styles.search}
                clearButtonMode="while-editing"
              />
              {searchInput.length > 0 && (
                <Pressable onPress={() => setSearchInput('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.onSurfaceFaint} />
                </Pressable>
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Open all observation filters')}
              onPress={() => setFilterModalOpen(true)}
              style={[
                styles.filterBtn,
                activeFilterCount > 0 && {
                  backgroundColor: colors.primaryContainer,
                  borderColor: colors.primary,
                },
              ]}
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={activeFilterCount > 0 ? colors.onPrimaryContainer : colors.onSurface}
              />
              {activeFilterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scopeRow}
          >
            <Pressable
              accessibilityRole="tab"
              onPress={() => setScope('all')}
              style={[styles.scopeBtn, scope === 'all' && styles.scopeBtnSelected]}
            >
              <Text style={[styles.scopeText, scope === 'all' && styles.scopeTextSelected]}>
                {t('All')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              onPress={() => setScope('unlocated')}
              style={[styles.scopeBtn, scope === 'unlocated' && styles.scopeBtnSelected]}
            >
              <Text style={[styles.scopeText, scope === 'unlocated' && styles.scopeTextSelected]}>
                {t('Unlocated')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setCompareOpen(true)}
              style={styles.scopeBtn}
            >
              <Text style={styles.scopeText}>
                {comparePickA ? t(`Compare (${comparePickA})`) : t('Compare')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(tabs)/map')}
              style={styles.scopeBtn}
            >
              <Text style={styles.scopeText}>{t('Map')}</Text>
            </Pressable>

            <FilterChip
              label={t('Observed')}
              selected={Boolean(richFilters.category)}
              activeLabel={t((richFilters.category || '').replace(/_/g, ' '))}
              onPress={() => setRichFilters((prev) => ({ ...prev, category: undefined }))}
              options={observedChipList}
              onSelect={(val) => {
                setRichFilters((prev) => ({
                  ...prev,
                  category: val,
                  classification: val === 'rock' ? prev.classification : undefined,
                }));
              }}
            />
            {(!richFilters.category || richFilters.category === 'rock') && (
              <FilterChip
                label={t('Rock')}
                selected={Boolean(richFilters.classification)}
                activeLabel={richFilters.classification ? t(richFilters.classification) : undefined}
                onPress={() => setRichFilters((prev) => ({ ...prev, classification: undefined }))}
                options={ROCK_TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
                onSelect={(val) => setRichFilters((prev) => ({ ...prev, classification: val }))}
              />
            )}
            <FilterChip
              label={t('Evidence')}
              selected={Boolean(richFilters.evidence_state)}
              activeLabel={t((richFilters.evidence_state || '').replace(/_/g, ' '))}
              onPress={() => setRichFilters((prev) => ({ ...prev, evidence_state: undefined }))}
              options={QUICK_EVIDENCE_OPTIONS.map((o) => ({ value: o.value, label: t(o.label) }))}
              onSelect={(val) => setRichFilters((prev) => ({ ...prev, evidence_state: val }))}
            />
            <FilterChip
              label={t('District')}
              selected={Boolean(richFilters.district)}
              activeLabel={richFilters.district}
              onPress={() => setRichFilters((prev) => ({ ...prev, district: undefined }))}
              options={districts.data?.map((d) => ({ value: d.name, label: d.name })) ?? []}
              onSelect={(val) => setRichFilters((prev) => ({ ...prev, district: val }))}
            />
          </ScrollView>
        </View>

        {activeQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>{t('Loading…')}</Text>
          </View>
        ) : activeQuery.error && observations.length === 0 ? (
          <View style={styles.empty}>
            <MessageState
              title={t('Could not load records')}
              message={userFacingError(activeQuery.error)}
              onRetry={() => {
                void activeQuery.refetch();
              }}
            />
          </View>
        ) : observations.length === 0 ? (
          <View style={styles.empty}>
            <MessageState
              title={search || activeFilterCount > 0 ? t('No matches') : t('No records yet')}
              message={search || activeFilterCount > 0 ? t('Try clearing filters.') : undefined}
            />
          </View>
        ) : (
          <FlatList
            key={layout.isTablet ? 'explore-2col' : 'explore-1col'}
            numColumns={layout.isTablet ? 2 : 1}
            columnWrapperStyle={layout.isTablet ? styles.columnWrap : undefined}
            style={styles.flatList}
            data={observations}
            keyExtractor={(item) => item.passport_id}
            renderItem={({ item }) => (
              <View style={[styles.cardWrap, layout.isTablet && styles.cardWrapTablet]}>
                <ObservationCard
                  observation={item}
                  onPress={() => router.push(observationDetailRoute(item.passport_id))}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleToggleCompare(item.passport_id)}
                  style={styles.compareRowBtn}
                >
                  <Text style={styles.compareRowText} numberOfLines={1}>
                    {comparePickA === item.passport_id
                      ? t('Picked · tap 2nd passport')
                      : comparePickA
                        ? t(`Compare vs ${comparePickA}`)
                        : t('Compare')}
                  </Text>
                </Pressable>
              </View>
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={activeQuery.isRefetching && !activeQuery.isFetchingNextPage}
                onRefresh={() => {
                  void activeQuery.refetch();
                }}
                tintColor={colors.primary}
              />
            }
            onEndReached={() => {
              if (activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
                void activeQuery.fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.4}
          />
        )}
      </View>

      <ObservationFilterModal
        visible={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        filters={richFilters}
        onChange={setRichFilters}
        onReset={() => setRichFilters({})}
        districts={districts.data ?? []}
        categories={categories.data ?? []}
      />

      <ComparePassportsModal
        visible={compareOpen}
        initialPassportA={comparePickA}
        initialPassportB={comparePickB}
        onClose={() => {
          setCompareOpen(false);
          setComparePickB('');
        }}
      />
    </Screen>
  );
}

function FilterChip({
  label,
  selected,
  activeLabel,
  onPress,
  options,
  onSelect,
}: {
  label: string;
  selected: boolean;
  activeLabel?: string;
  onPress: () => void;
  options: readonly { value: string; label: string }[];
  onSelect: (val: string) => void;
}) {
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ position: 'relative' }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => (selected ? onPress() : setOpen(!open))}
        style={[
          chipStyles.chip,
          { backgroundColor: selected ? colors.primaryContainer : colors.surface },
          { borderColor: selected ? colors.primary : colors.outlineSoft },
        ]}
      >
        <Text
          style={[
            chipStyles.text,
            { color: selected ? colors.onPrimaryContainer : colors.onSurface },
          ]}
        >
          {selected ? activeLabel : label}
        </Text>
        <Ionicons
          name={selected ? 'close' : 'chevron-down'}
          size={14}
          color={selected ? colors.onPrimaryContainer : colors.onSurfaceVariant}
        />
      </Pressable>

      {open && (
        <View
          style={[
            chipStyles.dropdown,
            { backgroundColor: colors.surface, borderColor: colors.outlineSoft },
          ]}
        >
          <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
            {options.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => {
                  onSelect(opt.value);
                  setOpen(false);
                }}
                style={[chipStyles.option, { borderBottomColor: colors.outlineSoft }]}
              >
                <Text style={[chipStyles.optionText, { color: colors.onSurface }]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  text: { fontSize: 12, fontWeight: '600' },
  dropdown: {
    position: 'absolute',
    top: 40,
    left: 0,
    minWidth: 170,
    borderRadius: radius.m,
    borderWidth: 1,
    elevation: 4,
    zIndex: 100,
    overflow: 'hidden',
  },
  option: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 0.5 },
  optionText: { fontSize: 13 },
});

function createStyles(colors: Palette) {
  return StyleSheet.create({
    pageWrap: {
      flex: 1,
      width: '100%',
      alignSelf: 'center',
    },
    header: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      gap: 10,
      zIndex: 10,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    sitesBtn: {
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
    sitesBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.primary,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    searchContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.full,
      paddingHorizontal: 14,
      height: 44,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    searchIcon: { marginRight: 8 },
    search: {
      flex: 1,
      color: colors.onSurface,
      fontSize: 14,
      paddingVertical: 0,
    },
    filterBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadge: {
      position: 'absolute',
      top: -2,
      right: -2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    filterBadgeText: {
      color: colors.onPrimary,
      fontSize: 10,
      fontWeight: '800',
    },
    scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
    scopeBtn: {
      paddingHorizontal: 12,
      height: 36,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    scopeBtnSelected: {
      backgroundColor: colors.primaryContainer,
      borderColor: colors.primary,
    },
    scopeText: { color: colors.onSurfaceVariant, fontSize: 12, fontWeight: '700' },
    scopeTextSelected: { color: colors.onPrimaryContainer },
    flatList: { flex: 1 },
    list: { paddingTop: 6, paddingBottom: spacing.xl, gap: 4 },
    columnWrap: { gap: spacing.sm },
    cardWrap: { marginBottom: 4 },
    cardWrapTablet: { flex: 1 },
    compareRowBtn: {
      minHeight: 32,
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingBottom: 6,
    },
    compareRowText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    muted: { color: colors.onSurfaceFaint, fontSize: 13 },
    empty: { paddingVertical: spacing.lg },
  });
}
