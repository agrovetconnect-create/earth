import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MapPin, MapPinned, Search } from 'lucide-react-native';
import type { PublicSiteFeature } from '../types/community';
import { categoryLabel } from '../types/community';
import {
  EVIDENCE_STATE_LABELS,
  type EvidenceState,
} from '../types/community';
import { fetchSitesGeoJson } from '../services/communityApi';
import { fetchUnlocatedObservations } from '../services/publicApi';
import type { PublicObservationSummary } from '../types/public';
import { colors, radius, spacing, type } from '../lib/theme';
import { recordView } from '../services/history';
import { evidenceStateHex } from '../lib/evidenceMeta';
import { NO_EVIDENCE_HEX } from '../lib/theme';

/**
 * "Geoscience sites" — the web sites page: the published site cards (SitesPanel
 * design) plus the section for published posts without a map location.
 */

export function SitesView({
  onOpenSite,
  onOpenObservation,
  searchQuery,
  onSearchChange,
}: {
  onOpenSite: (siteId: string) => void;
  onOpenObservation: (passportId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}) {
  const [sites, setSites] = useState<PublicSiteFeature[] | null>(null);
  const [unlocated, setUnlocated] = useState<PublicObservationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [geo, unlocatedResult] = await Promise.all([
        fetchSitesGeoJson(),
        fetchUnlocatedObservations({}, 1, 20).catch(() => null),
      ]);
      setSites(geo.features);
      setUnlocated(unlocatedResult?.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sites.');
      setSites((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredSites = useMemo(() => {
    const all = sites ?? [];
    if (!searchQuery.trim()) return all;
    const q = searchQuery.trim().toLowerCase();
    return all.filter(
      (feature) =>
        feature.properties.title.toLowerCase().includes(q) ||
        (feature.properties.district ?? '').toLowerCase().includes(q) ||
        feature.properties.site_code.toLowerCase().includes(q)
    );
  }, [sites, searchQuery]);

  const filteredUnlocated = useMemo(() => {
    const all = unlocated ?? [];
    if (!searchQuery.trim()) return all;
    const q = searchQuery.trim().toLowerCase();
    return all.filter(
      (o) =>
        (o.post_title ?? o.possible_name ?? o.primary_interpretation ?? '').toLowerCase().includes(q) ||
        (o.district ?? '').toLowerCase().includes(q) ||
        o.passport_id.toLowerCase().includes(q)
    );
  }, [unlocated, searchQuery]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.primary} />}
    >
      <View style={styles.searchField}>
        <Search size={18} color="#8f8f8f" />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search sites, districts or posts"
          placeholderTextColor="#8f8f8f"
        />
      </View>

      {sites === null ? (
        <View style={{ paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.sm }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[type.bodySmall, { color: '#746D66' }]}>Loading published posts…</Text>
        </View>
      ) : error ? (
        <Text style={[type.body, { color: colors.danger, padding: spacing.lg }]}>{error}</Text>
      ) : (
        <>
          {/* Published geological sites — the SitesPanel card design */}
          <View style={styles.sectionHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Published geological sites</Text>
              <Text style={styles.sectionSubtitle}>
                Verified study locations and outcrop clusters across Rwanda
              </Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{filteredSites.length}</Text>
            </View>
          </View>

          {filteredSites.length === 0 ? (
            <View style={styles.emptySites}>
              <View style={styles.emptyBadge}>
                <MapPinned size={28} color={colors.primary} strokeWidth={1.5} />
              </View>
              <Text style={styles.emptyTitle}>No sites found</Text>
              <Text style={styles.emptyBody}>
                No geological sites have been published yet in this area.
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              {filteredSites.map((feature) => {
                const p = feature.properties;
                const state = p.highest_evidence_state as EvidenceState | null;
                const badgeColor = state ? evidenceStateHex(state) : NO_EVIDENCE_HEX;
                const label = state ? EVIDENCE_STATE_LABELS[state] : 'Nothing established';
                return (
                  <Pressable
                    key={p.site_id}
                    onPress={() => {
                      recordView({ view: 'sites', panel: 'site', siteId: p.site_id, title: p.title });
                      onOpenSite(p.site_id);
                    }}
                    style={({ pressed }) => [styles.siteCard, pressed && { opacity: 0.9 }]}
                  >
                    <View style={[styles.siteColorBar, { backgroundColor: badgeColor }]} />
                    <View style={styles.siteBody}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.siteTitle} numberOfLines={2}>{p.title}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <View style={styles.codeChip}>
                              <Text style={styles.codeChipText}>{p.site_code}</Text>
                            </View>
                            <Text style={styles.siteDistrict}>
                              {p.district ? `${p.district} District` : 'Rwanda'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.mapChip}>
                          <MapPinned size={14} color={colors.primary} />
                          <Text style={styles.mapChipText}>Map</Text>
                        </View>
                      </View>

                      {p.description ? (
                        <Text style={styles.siteDescription} numberOfLines={2}>{p.description}</Text>
                      ) : null}

                      <View style={styles.siteFooter}>
                        <View
                          style={[
                            styles.evidencePill,
                            { backgroundColor: `${badgeColor}15` },
                          ]}
                        >
                          <View style={[styles.evidenceDot, { backgroundColor: badgeColor }]} />
                          <Text style={[styles.evidenceText, { color: badgeColor }]}>{label}</Text>
                        </View>
                        <Text style={styles.observationCount}>
                          {p.observation_count} {p.observation_count === 1 ? 'observation' : 'observations'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Posts without a published location */}
          {filteredUnlocated.length > 0 ? (
            <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.md }}>
                <Text style={styles.sectionTitle}>Observations without a map location</Text>
                <Text style={[type.bodySmall, { fontFamily: 'monospace', color: '#5e5e5e' }]}>
                  {filteredUnlocated.length} listed
                </Text>
              </View>
              <Text style={styles.sectionSubtitle}>
                These observations are public but the contributor kept the precise place private.
              </Text>
              {filteredUnlocated.map((o) => (
                <Pressable
                  key={o.passport_id}
                  style={({ pressed }) => [styles.unlocatedRow, pressed && { opacity: 0.8 }]}
                  onPress={() => onOpenObservation(o.passport_id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.unlocatedTitle} numberOfLines={1}>
                      {o.post_title ?? o.possible_name ?? o.primary_interpretation ?? o.passport_id}
                    </Text>
                    <Text style={styles.unlocatedMeta} numberOfLines={1}>
                      {[
                        categoryLabel(o.observation_category),
                        o.district ? `${o.district} District` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <MapPin size={14} color="#8f8f8f" />
                </Pressable>
              ))}
            </View>
          ) : null}

          {filteredSites.length === 0 && filteredUnlocated.length === 0 ? (
            <View style={styles.empty}>
              <MapPin size={28} color={colors.onSurfaceVariant} />
              <Text style={[type.body, { color: colors.onSurfaceVariant, marginTop: spacing.sm }]}>
                No sites match your search.
              </Text>
              <Pressable onPress={() => onSearchChange('')} style={styles.retryButton}>
                <Text style={[type.bodySmall, { color: colors.primary, fontWeight: '600' }]}>Clear search</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl * 3,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.lg,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f1f1f',
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#5e5e5e',
    marginTop: 2,
  },
  countPill: {
    borderRadius: radius.full,
    backgroundColor: '#e8f0fe',
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  countText: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
  },
  siteCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  siteColorBar: {
    height: 6,
    width: '100%',
  },
  siteBody: {
    padding: 14,
    gap: 10,
  },
  siteTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f1f1f',
    lineHeight: 19,
  },
  codeChip: {
    backgroundColor: '#f0f4f9',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  codeChipText: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  siteDistrict: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#5e5e5e',
  },
  mapChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.sm,
    backgroundColor: '#f0f4f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mapChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  siteDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: '#3c4043',
  },
  siteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: spacing.sm,
  },
  evidencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  evidenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  evidenceText: {
    fontSize: 11,
    fontWeight: '500',
  },
  observationCount: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: '500',
    color: '#5e5e5e',
  },
  emptySites: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: spacing.lg,
  },
  emptyBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: '#e8f0fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  emptyBody: {
    fontSize: 11,
    lineHeight: 16,
    color: '#5e5e5e',
    textAlign: 'center',
    marginTop: 4,
  },
  unlocatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#ffffff',
  },
  unlocatedTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  unlocatedMeta: {
    fontSize: 11,
    color: '#5e5e5e',
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.xs,
  },
  retryButton: {
    padding: spacing.sm,
  },
});
