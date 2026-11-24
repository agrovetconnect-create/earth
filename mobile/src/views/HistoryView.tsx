import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Download, History as HistoryIcon, Search, Trash2, X } from 'lucide-react-native';
import {
  clearHistory,
  formatHistoryTime,
  groupHistoryByDay,
  removeHistory,
  historyStore,
} from '../services/history';
import { usePersistedStore } from '../services/localStore';
import { usePreferences } from '../services/preferences';
import { colors, radius, spacing } from '../lib/theme';

/**
 * "History" — a port of the web HistoryView: the local session record, grouped
 * by day, searchable, exportable as CSV, with per-entry removal.
 */

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** The kind of thing the entry is, as on the web. */
function entryKindLabel(entry: { passportId?: string | null; siteId?: string | null; view: string; panel?: string | null }): string {
  if (entry.passportId) return 'Observation';
  if (entry.siteId) return 'Geological site';
  switch (entry.view) {
    case 'explore':
      return 'Explore map';
    case 'sites':
      return 'Geoscience sites';
    case 'community':
      return entry.panel === 'reputation' ? 'Contributions' : 'Investigations';
    case 'mine':
      return 'My Earth Talk';
    case 'my-map':
      return 'My Map';
    case 'research':
      return 'Research analytics';
    case 'reviews':
      return 'Expert reviews';
    case 'validation':
      return 'Field validation';
    case 'moderation':
      return 'Moderation';
    default:
      return 'View';
  }
}

export function HistoryView({
  onOpenObservation,
  onOpenSite,
  onOpenView,
}: {
  onOpenObservation: (passportId: string) => void;
  onOpenSite: (siteId: string) => void;
  onOpenView: (view: import('../services/navigation').View) => void;
}) {
  const entries = usePersistedStore(historyStore);
  const { locale } = usePreferences();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'observation' | 'site' | 'view'>('all');
  const [confirmClear, setConfirmClear] = useState(false);
  const dateLocale = locale === 'fr' ? 'fr-FR' : 'en-US';

  const counts = useMemo(
    () => ({
      all: entries.length,
      observation: entries.filter((e) => Boolean(e.passportId)).length,
      site: entries.filter((e) => Boolean(e.siteId)).length,
      view: entries.filter((e) => !e.passportId && !e.siteId).length,
    }),
    [entries]
  );

  const filtered = useMemo(() => {
    let list = entries;
    if (filter !== 'all') {
      list = list.filter((entry) =>
        filter === 'observation'
          ? Boolean(entry.passportId)
          : filter === 'site'
            ? Boolean(entry.siteId)
            : !entry.passportId && !entry.siteId
      );
    }
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((entry) =>
      [entry.title, entry.panel ?? '', entry.view].some((value) =>
        String(value ?? '').toLowerCase().includes(needle)
      )
    );
  }, [entries, query, filter]);

  const groups = groupHistoryByDay(filtered, dateLocale);

  const handleExportCSV = async () => {
    if (entries.length === 0) return;
    const headers = ['ID', 'Date', 'Time', 'Label', 'Subtitle', 'View'];
    const rows = entries.map((e) => [
      csvEscape(e.id),
      csvEscape(new Date(e.ts).toISOString().split('T')[0]),
      csvEscape(formatHistoryTime(e.ts, dateLocale)),
      csvEscape(e.title),
      csvEscape(e.panel ?? ''),
      csvEscape(e.view),
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const path = `${FileSystem.cacheDirectory}earth_talk_history_${new Date().toISOString().split('T')[0]}.csv`;
    await FileSystem.writeAsStringAsync(path, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/csv' });
    }
  };

  return (
    <>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {/* Card header */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={styles.eyebrowRow}>
              <HistoryIcon size={16} color={colors.primary} />
              <Text style={styles.eyebrow}>Local Session Record</Text>
            </View>
            <Text style={styles.pageTitle}>History</Text>
            <Text style={styles.pageSubtitle}>
              Places and views you have opened, grouped by day, newest first. Stored locally on
              this device.
            </Text>
          </View>
          {entries.length > 0 ? (
            <View style={styles.headerActions}>
              <Pressable
                style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.7 }]}
                accessibilityLabel="Export history as CSV"
                onPress={() => void handleExportCSV()}
              >
                <Download size={14} color={colors.onSurfaceVariant} />
                <Text style={styles.headerButtonText}>Export</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.7 }]} onPress={() => setConfirmClear(true)}>
                <Trash2 size={14} color={colors.onSurfaceVariant} />
                <Text style={styles.headerButtonText}>Clear history</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* Search */}
        {entries.length > 0 ? (
          <View style={styles.searchWrap}>
            <Search size={16} color="#5e5e5e" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search history"
              placeholderTextColor="#80868b"
              accessibilityLabel="Search history"
            />
            {query ? (
              <Pressable
                onPress={() => setQuery('')}
                accessibilityLabel="Clear search"
                hitSlop={6}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <X size={16} color="#5e5e5e" />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Type filter chips, as on the web */}
        {entries.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginTop: spacing.sm }}
            contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}
          >
            {([
              { id: 'all', label: `All (${counts.all})` },
              { id: 'observation', label: `Observations (${counts.observation})` },
              { id: 'site', label: `Sites (${counts.site})` },
              { id: 'view', label: `Views (${counts.view})` },
            ] as const).map((tab) => (
              <Pressable
                key={tab.id}
                onPress={() => setFilter(tab.id)}
                style={({ pressed }) => [
                  styles.filterChip,
                  filter === tab.id && styles.filterChipActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    filter === tab.id && styles.filterChipTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconTile}>
              <HistoryIcon size={26} color="#5e5e5e" />
            </View>
            <Text style={styles.emptyTitle}>
              {entries.length === 0 ? 'No visit history yet' : 'No matching history entries'}
            </Text>
            <Text style={styles.emptyCopy}>
              {entries.length === 0
                ? 'Observations, geological sites, and views you open will appear here. Nothing leaves your browser.'
                : 'Try a different search phrase or switch back to all entries.'}
            </Text>
            {entries.length === 0 ? (
              <Pressable
                style={({ pressed }) => [styles.exploreButton, pressed && { opacity: 0.9 }]}
                onPress={() => onOpenView('explore')}
              >
                <Text style={styles.exploreButtonText}>Explore map</Text>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.resetButton, pressed && { opacity: 0.8 }]}
                onPress={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                <Text style={styles.resetButtonText}>Reset filters</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={{ gap: spacing.lg }}>
            {groups.map((group) => (
              <View key={group.label} style={{ gap: spacing.sm }}>
                <Text style={styles.dayLabel}>{group.label}</Text>
                <View style={styles.groupCard}>
                  {group.entries.map((entry) => (
                    <View key={entry.id} style={styles.row}>
                      <Pressable
                        style={styles.rowButton}
                        onPress={() => {
                          if (entry.passportId) onOpenObservation(entry.passportId);
                          else if (entry.siteId) onOpenSite(entry.siteId);
                          else onOpenView(entry.view);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{entry.title}</Text>
                          <Text style={styles.rowSubtitle} numberOfLines={1}>
                            {entryKindLabel(entry)}
                            {entry.panel &&
                              entry.panel.trim().toLowerCase() !== entry.title.trim().toLowerCase() &&
                              entry.panel.trim().toLowerCase() !== entryKindLabel(entry).toLowerCase()
                                ? ` · ${entry.panel.trim()}`
                                : ''}
                          </Text>
                        </View>
                        <Text style={styles.rowTime}>{formatHistoryTime(entry.ts, dateLocale)}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => removeHistory(entry.id)}
                        accessibilityLabel={`Remove ${entry.title} from history`}
                        style={({ pressed }) => [styles.rowRemove, pressed && { opacity: 0.6 }]}
                        hitSlop={6}
                      >
                        <X size={16} color="#8f8f8f" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>

    {/* Clear-history confirmation, as on the web */}
    <Modal transparent visible={confirmClear} animationType="fade" onRequestClose={() => setConfirmClear(false)}>
      <Pressable style={styles.confirmScrim} onPress={() => setConfirmClear(false)}>
        <Pressable style={styles.confirmCard} onPress={(e) => e.stopPropagation()}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
            <Trash2 size={20} color="#b3261e" />
            <View style={{ flex: 1 }}>
              <Text style={styles.confirmTitle}>Clear visit history?</Text>
              <Text style={styles.confirmCopy}>
                This removes every observation, site, and view from this browser. It cannot be
                undone.
              </Text>
            </View>
          </View>
          <View style={styles.confirmButtons}>
            <Pressable
              style={({ pressed }) => [styles.confirmCancel, pressed && { opacity: 0.8 }]}
              onPress={() => setConfirmClear(false)}
            >
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.confirmDelete, pressed && { opacity: 0.9 }]}
              onPress={() => {
                clearHistory();
                setConfirmClear(false);
                setQuery('');
                setFilter('all');
              }}
            >
              <Text style={styles.confirmDeleteText}>Clear history</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  eyebrow: {
    fontFamily: 'monospace',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.primary,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: '#1f1f1f',
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#5e5e5e',
    marginTop: 4,
    lineHeight: 19,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  headerButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3c4043',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#f8fafd',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.onSurface,
    padding: 0,
  },
  filterChip: {
    height: 32,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(60,64,67,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: {
    backgroundColor: '#d3e3fd',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#444746',
  },
  filterChipTextActive: {
    color: '#041e49',
  },
  emptyCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#dde3ea',
    backgroundColor: '#ffffff',
    paddingHorizontal: spacing.xl,
    paddingVertical: 64,
    alignItems: 'center',
    gap: 4,
  },
  emptyIconTile: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#f1f3f4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  emptyCopy: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: '#5e5e5e',
    textAlign: 'center',
    maxWidth: 340,
  },
  exploreButton: {
    marginTop: spacing.lg,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: '#0b57d0',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  resetButton: {
    marginTop: spacing.lg,
    height: 40,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0b57d0',
  },
  confirmScrim: {
    flex: 1,
    backgroundColor: 'rgba(11,15,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    padding: 20,
  },
  confirmTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  confirmCopy: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: '#5e5e5e',
  },
  confirmButtons: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  confirmCancel: {
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outline,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#3c4043',
  },
  confirmDelete: {
    height: 36,
    borderRadius: radius.full,
    backgroundColor: '#b3261e',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#5e5e5e',
    paddingHorizontal: 4,
  },
  groupCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  rowSubtitle: {
    fontSize: 11,
    color: '#5e5e5e',
    marginTop: 2,
  },
  rowTime: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#8f8f8f',
  },
  rowRemove: {
    marginRight: 12,
    padding: 6,
    borderRadius: radius.sm,
  },
});
