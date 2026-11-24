import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { EVIDENCE_STATES } from '../types/community';
import { evidenceStateHex, evidenceStateLabel } from '../lib/evidenceMeta';
import { colors, radius, spacing, type, elevation } from '../lib/theme';

/** The evidence-ladder legend, collapsed to one row until expanded. */
export function MapLegend() {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={[styles.wrap, elevation[2]]}>
      <Pressable
        onPress={() => setExpanded((prev) => !prev)}
        style={({ pressed }) => [styles.header, pressed && { opacity: 0.8 }]}
        accessibilityLabel="Evidence state legend"
      >
        <Text style={[type.label, { color: colors.onSurfaceVariant }]}>Evidence states</Text>
        {expanded ? (
          <ChevronUp size={14} color={colors.onSurfaceVariant} />
        ) : (
          <ChevronDown size={14} color={colors.onSurfaceVariant} />
        )}
      </Pressable>
      {expanded ? (
        <View style={styles.list}>
          {EVIDENCE_STATES.map((state) => (
            <View key={state} style={styles.row}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: evidenceStateHex(state) }} />
              <Text style={[type.bodySmall, { color: colors.onSurface, marginLeft: spacing.sm }]}>
                {evidenceStateLabel(state)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignSelf: 'center',
    maxWidth: 260,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
