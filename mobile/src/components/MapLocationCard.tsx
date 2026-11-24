import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { evidenceStateHex, evidenceStateLabel } from '../lib/evidenceMeta';
import { categoryLabel } from '../types/community';
import { colors, radius, spacing, type, elevation } from '../lib/theme';

/**
 * The observation card from the web map — a compact one-line row for map pins
 * and a comfortable card for lists, with the evidence-state pill.
 */

export interface MapLocationCardData {
  title: string;
  passportId: string | null;
  category?: string | null;
  district?: string | null;
  evidenceState?: string | null;
  mediaUrl?: string | null;
  distanceKm?: number | null;
}

function EvidencePill({ state }: { state: string | null }) {
  const hex = evidenceStateHex(state);
  return (
    <View style={[styles.pill, { backgroundColor: `${hex}26`, borderColor: `${hex}59` }]}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hex }} />
      <Text style={[type.label, { color: colors.onSurface, marginLeft: 6 }]} numberOfLines={1}>
        {evidenceStateLabel(state)}
      </Text>
    </View>
  );
}

export function MapLocationCard({
  data,
  compact = false,
  onPress,
  style,
}: {
  data: MapLocationCardData;
  compact?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (compact) {
    return (
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [
          styles.compactRow,
          pressed && { opacity: 0.75 },
          style,
        ]}
      >
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: evidenceStateHex(data.evidenceState),
            marginRight: spacing.sm,
          }}
        />
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { color: colors.onSurface, fontWeight: '600' }]} numberOfLines={1}>
            {data.title}
          </Text>
          {data.district || data.category ? (
            <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
              {[data.category ? categoryLabel(data.category) : null, data.district]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </View>
        {data.distanceKm !== null && data.distanceKm !== undefined ? (
          <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
            {data.distanceKm >= 1 ? `${data.distanceKm.toFixed(0)} km` : `${(data.distanceKm * 1000).toFixed(0)} m`}
          </Text>
        ) : null}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        elevation[1],
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
        style,
      ]}
    >
      {data.mediaUrl ? (
        <Image source={{ uri: data.mediaUrl }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <MapPin size={20} color={colors.onSurfaceVariant} />
        </View>
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[type.body, { color: colors.onSurface, fontWeight: '600' }]} numberOfLines={2}>
          {data.title}
        </Text>
        <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
          {[data.category ? categoryLabel(data.category) : null, data.district]
            .filter(Boolean)
            .join(' · ') || 'Rwanda'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <EvidencePill state={data.evidenceState ?? null} />
          {data.passportId ? (
            <Text style={[type.label, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
              {data.passportId}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.outlineVariant,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceContainerHigh,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
});
