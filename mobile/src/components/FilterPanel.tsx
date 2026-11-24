import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, RotateCcw, SlidersHorizontal, X } from 'lucide-react-native';
import type { ObservationFilters } from '../types/public';
import { EVIDENCE_STATES, EVIDENCE_STATE_RANK, type EvidenceState } from '../types/community';
import { colors, radius, spacing } from '../lib/theme';

/**
 * Observation filters, a direct port of the web FilterPanel (variant "bare"):
 * the same fields, in the same order, with the same option labels. Every
 * change applies immediately — the web panel has no Apply button either.
 */

const ROCK_TYPES = [
  { value: 'igneous', label: 'Igneous (e.g. Granite, Basalt)' },
  { value: 'sedimentary', label: 'Sedimentary (e.g. Sandstone, Shale)' },
  { value: 'metamorphic', label: 'Metamorphic (e.g. Quartzite, Gneiss, Schist)' },
  { value: 'unclassified', label: 'Unclassified / Veins' },
];

/** The qualifier each rung adds to the canonical label — verbatim from the web. */
const EVIDENCE_LEVEL_QUALIFIERS: Record<EvidenceState, string> = {
  insufficient_evidence: 'Insufficient evidence (cannot tell)',
  ai_assisted: 'AI-assisted reading',
  community_supported: 'Community supported',
  community_investigated: 'Community investigated',
  expert_reviewed: 'Expert reviewed',
  scientifically_confirmed: 'Scientifically confirmed',
  unresolved: 'Unresolved (under dispute)',
  rejected: 'Rejected',
};

/** Ordered for display, so the strongest evidence is not the first option. */
const EVIDENCE_LEVELS = [...EVIDENCE_STATES]
  .sort((a, b) => EVIDENCE_STATE_RANK[a] - EVIDENCE_STATE_RANK[b])
  .map((state) => ({ value: state, label: EVIDENCE_LEVEL_QUALIFIERS[state] }));

const CONFIDENCE_LEVELS = [
  { value: 'high', label: 'High (0.80 – 1.00)' },
  { value: 'moderate', label: 'Moderate (0.60 – 0.79)' },
  { value: 'low', label: 'Low (0.30 – 0.59)' },
  { value: 'insufficient', label: 'Insufficient' },
];

const VERIFICATION_STATUSES = [
  { value: 'unverified', label: 'AI-assisted / Unverified' },
  { value: 'expert_verified', label: 'Expert Verified' },
];

interface Option {
  value: string;
  label: string;
}

function Select({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = value
    ? options.find((option) => option.value === value)?.label ?? value
    : allLabel;

  return (
    <View style={styles.field}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Pressable style={({ pressed }) => [styles.select, pressed && { opacity: 0.85 }]} onPress={() => setOpen(true)}>
        <Text style={styles.selectValue} numberOfLines={1}>
          {current}
        </Text>
        <ChevronDown size={16} color={colors.onSurfaceVariant} />
      </Pressable>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.optionScrim}>
          <View style={styles.optionSheet}>
            <View style={styles.optionHeader}>
              <Text style={styles.optionTitle}>{label}</Text>
              <Pressable accessibilityLabel="Close" onPress={() => setOpen(false)}>
                <X size={20} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
            {[
              { value: '', label: allLabel },
              ...options,
            ].map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value || 'all'}
                  style={({ pressed }) => [
                    styles.optionRow,
                    selected && styles.optionRowActive,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionLabel, selected && { color: colors.primary, fontWeight: '500' }]} numberOfLines={2}>
                    {option.label}
                  </Text>
                  {selected ? <Check size={16} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function FilterPanel({
  filters,
  onChange,
  onReset,
  districts,
  categories = [],
}: {
  filters: ObservationFilters;
  onChange: (filters: ObservationFilters) => void;
  onReset: () => void;
  districts: { name: string; observation_count: number }[];
  categories?: { category: string; label: string; observation_count: number }[];
}) {
  const hasActiveFilters = Boolean(
    filters.district ||
      filters.category ||
      filters.classification ||
      filters.evidence_state ||
      filters.confidence ||
      filters.verification ||
      filters.search
  );

  // The rock-type filter only means anything for rock records.
  const showRockTypeFilter = !filters.category || filters.category === 'rock';

  return (
    <View>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <SlidersHorizontal size={16} color={colors.onSurfaceVariant} />
          <Text style={styles.headerTitle}>Filters</Text>
        </View>
        {hasActiveFilters ? (
          <Pressable
            accessibilityLabel="Reset filters"
            onPress={onReset}
            style={({ pressed }) => [styles.reset, pressed && { opacity: 0.7 }]}
          >
            <RotateCcw size={14} color={colors.primary} />
            <Text style={styles.resetLabel}>Reset</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ gap: spacing.md + 2 }}>
        <Select
          label="District"
          value={filters.district ?? ''}
          allLabel="All Districts in Rwanda"
          options={districts.map((d) => ({ value: d.name, label: `${d.name} (${d.observation_count})` }))}
          onChange={(v) => onChange({ ...filters, district: v || undefined })}
        />

        {categories.length > 0 ? (
          <Select
            label="What was observed"
            value={filters.category ?? ''}
            allLabel="All Categories"
            options={categories.map((c) => ({
              value: c.category,
              label: `${c.label} (${c.observation_count})`,
            }))}
            onChange={(v) =>
              // Changing category clears the rock type, because a rock type
              // chosen for the previous category would silently exclude
              // every record.
              onChange({
                ...filters,
                category: v || undefined,
                subcategory: undefined,
                classification: v === 'rock' ? filters.classification : undefined,
              })
            }
          />
        ) : null}

        {showRockTypeFilter ? (
          <Select
            label="Rock type"
            value={filters.classification ?? ''}
            allLabel="All Rock Types"
            options={ROCK_TYPES}
            onChange={(v) => onChange({ ...filters, classification: v || undefined })}
          />
        ) : null}

        <Select
          label="Evidence state"
          value={filters.evidence_state ?? ''}
          allLabel="Any Evidence State"
          options={EVIDENCE_LEVELS}
          onChange={(v) => onChange({ ...filters, evidence_state: v || undefined })}
        />

        <Select
          label="AI confidence"
          value={filters.confidence ?? ''}
          allLabel="All Confidence Levels"
          options={CONFIDENCE_LEVELS}
          onChange={(v) => onChange({ ...filters, confidence: v || undefined })}
        />

        <Select
          label="Verification state"
          value={filters.verification ?? ''}
          allLabel="All Records"
          options={VERIFICATION_STATUSES}
          onChange={(v) => onChange({ ...filters, verification: v || undefined })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {},
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.05,
    textTransform: 'uppercase',
    color: colors.onSurfaceVariant,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.onSurface,
  },
  reset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  resetLabel: {
    fontSize: 12,
    color: colors.primary,
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
  optionScrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  optionSheet: {
    maxHeight: '70%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xl,
  },
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.onSurface,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  optionRowActive: {
    backgroundColor: '#e8f0fe',
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
  },
});
