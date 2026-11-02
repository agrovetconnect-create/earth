import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { radius, spacing, type Palette } from '../theme/theme';
import { useAppTheme } from '../theme/theme-provider';
import type { PublicCategory, PublicDistrict } from '../types/api';
import { useAppLanguage } from '../utils/language';
import { useResponsiveLayout } from '../utils/responsive';

export interface RichObservationFilters {
  district?: string;
  category?: string;
  classification?: string;
  evidence_state?: string;
  confidence?: string;
  verification?: string;
  has_investigation?: boolean;
  has_evidence?: boolean;
}

export const ROCK_TYPE_OPTIONS = [
  { value: '', label: 'All Rocks' },
  { value: 'igneous', label: 'Igneous' },
  { value: 'sedimentary', label: 'Sedimentary' },
  { value: 'metamorphic', label: 'Metamorphic' },
  { value: 'unclassified', label: 'Unclassified' },
] as const;

export const EVIDENCE_LADDER_OPTIONS = [
  { value: '', label: 'Any State' },
  { value: 'insufficient_evidence', label: 'Insufficient' },
  { value: 'ai_assisted', label: 'AI-assisted' },
  { value: 'community_supported', label: 'Community' },
  { value: 'community_investigated', label: 'Investigated' },
  { value: 'expert_reviewed', label: 'Expert reviewed' },
  { value: 'scientifically_confirmed', label: 'Confirmed' },
  { value: 'unresolved', label: 'Unresolved' },
  { value: 'rejected', label: 'Rejected' },
] as const;

export const CONFIDENCE_OPTIONS = [
  { value: '', label: 'Any Confidence' },
  { value: 'high', label: 'High' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'low', label: 'Low' },
  { value: 'insufficient', label: 'Insufficient' },
] as const;

export const VERIFICATION_OPTIONS = [
  { value: '', label: 'All Records' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'expert_verified', label: 'Expert Verified' },
] as const;

export function countActiveObservationFilters(filters: RichObservationFilters): number {
  let count = 0;
  if (filters.district) count += 1;
  if (filters.category) count += 1;
  if (filters.classification) count += 1;
  if (filters.evidence_state) count += 1;
  if (filters.confidence) count += 1;
  if (filters.verification) count += 1;
  if (filters.has_investigation) count += 1;
  if (filters.has_evidence) count += 1;
  return count;
}

export function ObservationFilterModal({
  visible,
  onClose,
  filters,
  onChange,
  onReset,
  districts,
  categories,
  sitesMode = false,
}: {
  visible: boolean;
  onClose: () => void;
  filters: RichObservationFilters;
  onChange: (next: RichObservationFilters) => void;
  onReset: () => void;
  districts: PublicDistrict[];
  categories: PublicCategory[];
  sitesMode?: boolean;
}) {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeCount = countActiveObservationFilters(filters);
  const showRockType = !sitesMode && (!filters.category || filters.category === 'rock');

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View
        style={[
          styles.backdrop,
          {
            paddingLeft: layout.sideSafeLeft,
            paddingRight: layout.sideSafeRight,
          },
        ]}
      >
        <View
          style={[
            styles.sheet,
            {
              marginTop: layout.sheetTopMargin,
              maxWidth: layout.sheetMaxWidth,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="options-outline" size={20} color={colors.primary} />
              <Text style={styles.title} numberOfLines={1}>
                {t(sitesMode ? 'Site Filters' : 'Filters')}
              </Text>
              {activeCount > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{activeCount}</Text>
                </View>
              )}
            </View>
            <View style={styles.headerActions}>
              {activeCount > 0 && (
                <Pressable accessibilityRole="button" onPress={onReset} style={styles.resetBtn}>
                  <Ionicons name="refresh" size={14} color={colors.primary} />
                  <Text style={styles.resetText}>{t('Reset')}</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Close')}
                onPress={onClose}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* District */}
            <FilterGroup label={t('District')} colors={colors}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <ChoiceChip
                  label={t('All Districts')}
                  selected={!filters.district}
                  onPress={() => onChange({ ...filters, district: undefined })}
                  colors={colors}
                />
                {districts.map((d) => (
                  <ChoiceChip
                    key={d.name}
                    label={`${d.name} (${d.observation_count})`}
                    selected={filters.district === d.name}
                    onPress={() =>
                      onChange({
                        ...filters,
                        district: filters.district === d.name ? undefined : d.name,
                      })
                    }
                    colors={colors}
                  />
                ))}
              </ScrollView>
            </FilterGroup>

            {/* Category */}
            {categories.length > 0 && (
              <FilterGroup label={t('What was observed')} colors={colors}>
                <View style={styles.wrapGrid}>
                  <ChoiceChip
                    label={t('All Categories')}
                    selected={!filters.category}
                    onPress={() => onChange({ ...filters, category: undefined })}
                    colors={colors}
                  />
                  {categories.map((c) => (
                    <ChoiceChip
                      key={c.category}
                      label={t(`${c.label} (${c.observation_count})`)}
                      selected={filters.category === c.category}
                      onPress={() => {
                        const nextCat = filters.category === c.category ? undefined : c.category;
                        onChange({
                          ...filters,
                          category: nextCat,
                          classification:
                            !nextCat || nextCat === 'rock' ? filters.classification : undefined,
                        });
                      }}
                      colors={colors}
                    />
                  ))}
                </View>
              </FilterGroup>
            )}

            {/* Rock Type */}
            {showRockType && (
              <FilterGroup label={t('Rock type')} colors={colors}>
                <View style={styles.wrapGrid}>
                  {ROCK_TYPE_OPTIONS.map((opt) => (
                    <ChoiceChip
                      key={opt.value || 'all'}
                      label={t(opt.label)}
                      selected={(filters.classification || '') === opt.value}
                      onPress={() =>
                        onChange({ ...filters, classification: opt.value || undefined })
                      }
                      colors={colors}
                    />
                  ))}
                </View>
              </FilterGroup>
            )}

            {/* Evidence State Ladder */}
            <FilterGroup label={t('Evidence state')} colors={colors}>
              <View style={styles.wrapGrid}>
                {EVIDENCE_LADDER_OPTIONS.map((opt) => (
                  <ChoiceChip
                    key={opt.value || 'any'}
                    label={t(opt.label)}
                    selected={(filters.evidence_state || '') === opt.value}
                    onPress={() =>
                      onChange({ ...filters, evidence_state: opt.value || undefined })
                    }
                    colors={colors}
                  />
                ))}
              </View>
            </FilterGroup>

            {sitesMode ? (
              <FilterGroup label={t('Community activity')} colors={colors}>
                <View style={styles.wrapGrid}>
                  <ChoiceChip
                    label={t('Has open investigation')}
                    selected={Boolean(filters.has_investigation)}
                    onPress={() =>
                      onChange({ ...filters, has_investigation: !filters.has_investigation })
                    }
                    colors={colors}
                  />
                  <ChoiceChip
                    label={t('Has community evidence')}
                    selected={Boolean(filters.has_evidence)}
                    onPress={() =>
                      onChange({ ...filters, has_evidence: !filters.has_evidence })
                    }
                    colors={colors}
                  />
                </View>
              </FilterGroup>
            ) : (
              <>
                {/* AI Confidence */}
                <FilterGroup label={t('AI confidence')} colors={colors}>
                  <View style={styles.wrapGrid}>
                    {CONFIDENCE_OPTIONS.map((opt) => (
                      <ChoiceChip
                        key={opt.value || 'all'}
                        label={t(opt.label)}
                        selected={(filters.confidence || '') === opt.value}
                        onPress={() =>
                          onChange({ ...filters, confidence: opt.value || undefined })
                        }
                        colors={colors}
                      />
                    ))}
                  </View>
                </FilterGroup>

                {/* Verification Status */}
                <FilterGroup label={t('Verification status')} colors={colors}>
                  <View style={styles.wrapGrid}>
                    {VERIFICATION_OPTIONS.map((opt) => (
                      <ChoiceChip
                        key={opt.value || 'all'}
                        label={t(opt.label)}
                        selected={(filters.verification || '') === opt.value}
                        onPress={() =>
                          onChange({ ...filters, verification: opt.value || undefined })
                        }
                        colors={colors}
                      />
                    ))}
                  </View>
                </FilterGroup>
              </>
            )}

            <Text style={styles.noteText}>
              {t('AI readings are preliminary until expert review.')}
            </Text>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: layout.bottomSafePadding }]}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.applyBtn}>
              <Text style={styles.applyBtnText}>{t('Apply')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FilterGroup({
  label,
  colors,
  children,
}: {
  label: string;
  colors: Palette;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: colors.onSurfaceVariant,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
  colors,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: Palette;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 36,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: radius.m,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.outlineSoft,
        backgroundColor: selected ? colors.primaryContainer : colors.surfaceContainerLow,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: selected ? '700' : '500',
          color: selected ? colors.onPrimaryContainer : colors.onSurface,
        }}
      >
        {label}
      </Text>
    </Pressable>
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
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderTopWidth: 1,
      borderColor: colors.outlineSoft,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineSoft,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.onSurface,
    },
    countBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    countBadgeText: {
      color: colors.onPrimary,
      fontSize: 11,
      fontWeight: '800',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    resetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceContainerLow,
    },
    resetText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    closeBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      padding: spacing.md,
      gap: spacing.lg,
    },
    chipRow: {
      gap: 8,
      paddingVertical: 2,
    },
    wrapGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    noteText: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.onSurfaceFaint,
      textAlign: 'center',
    },
    footer: {
      padding: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.outlineSoft,
      backgroundColor: colors.surface,
    },
    applyBtn: {
      height: 48,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    applyBtnText: {
      color: colors.onPrimary,
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
