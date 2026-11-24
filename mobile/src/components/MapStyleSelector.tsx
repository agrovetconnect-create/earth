import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { type MapStyle } from '../lib/theme';

/**
 * Google-Maps-style map style selector, matching the web's MapStyleSelector:
 * collapsed it is a 96x96 card with a dark frame and the active layer's label;
 * tapping expands it into a horizontal white panel of four options
 * (Map, Satellite, Streets, Terrain), diagram tiles above labels, the active
 * one highlighted. Choosing a tile dismisses the panel.
 */

const ENTRIES: readonly { id: MapStyle; label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'streets', label: 'Streets' },
  { id: 'terrain', label: 'Terrain' },
];

/** Diagrams, not screenshots: a stylised picture of what each layer shows,
 *  redrawn from the web component's SVG art. */
function StyleArt({ style }: { style: MapStyle }) {
  if (style === 'streets') {
    return (
      <Svg viewBox="0 0 64 64" style={styles.art}>
        <Rect width={64} height={64} fill="#f2efe9" />
        <Rect x={3} y={4} width={19} height={15} rx={3} fill="#b7e0b0" />
        <Rect x={44} y={42} width={17} height={18} rx={3} fill="#b7e0b0" />
        <Path d="M-2 57 C14 51 34 62 66 53" stroke="#9cc6ea" strokeWidth={7} fill="none" />
        <Path d="M-2 33 L66 27" stroke="#ffd54f" strokeWidth={9} />
        <Path d="M-2 33 L66 27" stroke="#fcedc0" strokeWidth={6.5} />
        <Path d="M40 -2 L34 66" stroke="#ffd54f" strokeWidth={8} />
        <Path d="M40 -2 L34 66" stroke="#fcedc0" strokeWidth={5.5} />
        <Path d="M-2 13 L66 16" stroke="#ffffff" strokeWidth={5} />
        <Path d="M-2 13 L66 16" stroke="#f2efe9" strokeWidth={3} />
        <Path d="M-2 47 L66 44" stroke="#ffffff" strokeWidth={4} />
        <Path d="M-2 47 L66 44" stroke="#f2efe9" strokeWidth={2.4} />
        <Circle cx={52} cy={14} r={2.2} fill="#7a7365" />
        <Circle cx={12} cy={52} r={2.2} fill="#7a7365" />
      </Svg>
    );
  }
  if (style === 'terrain') {
    return (
      <Svg viewBox="0 0 64 64" style={styles.art}>
        <Rect width={64} height={64} fill="#f6f0dd" />
        <Path d="M0 50 C16 38 30 54 48 42 C56 36 60 40 64 38 L64 64 L0 64 Z" fill="#d7e5bb" />
        <Path
          d="M0 34 C18 22 32 40 50 28 C58 22 62 26 64 24"
          fill="none"
          stroke="#cbb98f"
          strokeWidth={1.2}
        />
        <Path
          d="M0 24 C18 12 34 30 52 18 C60 12 62 16 64 14"
          fill="none"
          stroke="#cbb98f"
          strokeWidth={1.2}
        />
        <Path d="M0 14 C20 4 36 20 54 8" fill="none" stroke="#cbb98f" strokeWidth={1.2} />
        <Path d="M2 60 C22 50 40 60 64 48" fill="none" stroke="#ffffff" strokeWidth={3.5} />
      </Svg>
    );
  }
  if (style === 'satellite') {
    return (
      <Svg viewBox="0 0 64 64" style={styles.art}>
        <Rect width={64} height={64} fill="#5b7d4a" />
        <Rect width={26} height={20} fill="#3f5c34" />
        <Rect x={30} y={18} width={16} height={12} rx={1} fill="#7c5f3b" />
        <Rect x={12} y={38} width={20} height={14} fill="#8f6a3d" />
        <Rect x={42} y={44} width={22} height={20} fill="#46693b" />
        <Path d="M0 12 L64 8" stroke="#2c4023" strokeWidth={2} opacity={0.6} />
      </Svg>
    );
  }
  return (
    <Svg viewBox="0 0 64 64" style={styles.art}>
      <Rect width={64} height={64} fill="#eef1f4" />
      <Rect x={3} y={4} width={19} height={15} rx={3} fill="#b7e0b0" />
      <Rect x={43} y={43} width={18} height={17} rx={3} fill="#b7e0b0" />
      <Path d="M-2 57 C14 51 34 62 66 53" stroke="#9cc6ea" strokeWidth={7} fill="none" />
      <Path d="M-2 33 L66 27" stroke="#dadce0" strokeWidth={8} />
      <Path d="M-2 33 L66 27" stroke="#ffffff" strokeWidth={6} />
      <Path d="M40 -2 L34 66" stroke="#dadce0" strokeWidth={7} />
      <Path d="M40 -2 L34 66" stroke="#ffffff" strokeWidth={5} />
      <Path d="M-2 13 L66 16" stroke="#dadce0" strokeWidth={5} />
      <Path d="M-2 13 L66 16" stroke="#ffffff" strokeWidth={3.5} />
    </Svg>
  );
}

export function MapStyleSelector({
  active,
  onSelect,
}: {
  active: MapStyle;
  onSelect: (id: MapStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeLabel = ENTRIES.find((entry) => entry.id === active)?.label ?? 'Map';

  const choose = (id: MapStyle) => {
    onSelect(id);
    setOpen(false);
  };

  if (!open) {
    return (
      <Pressable
        accessibilityLabel={`Map type, currently ${activeLabel}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.collapsed, pressed && { opacity: 0.92 }]}
      >
        <StyleArt style={active} />
        <View style={styles.collapsedBand} pointerEvents="none" />
        <Text style={styles.collapsedLabel}>{activeLabel}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.panel} accessibilityLabel="Map style">
      {ENTRIES.map((entry) => {
        const isActive = active === entry.id;
        return (
          <Pressable
            key={entry.id}
            onPress={() => choose(entry.id)}
            style={({ pressed }) => [
              styles.tile,
              isActive && styles.tileActive,
              pressed && { opacity: 0.85 },
            ]}
          >
            <View style={styles.tileArt}>
              <StyleArt style={entry.id} />
            </View>
            <Text style={[styles.tileLabel, { color: isActive ? '#1f1f1f' : '#5e5e5e' }, isActive && { fontWeight: '500' }]}>
              {entry.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  collapsed: {
    width: 96,
    height: 96,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: '#202124',
    overflow: 'hidden',
    backgroundColor: '#eef1f4',
  },
  collapsedBand: {
    ...StyleSheet.absoluteFillObject,
    top: undefined,
    bottom: 0,
    height: 32,
    backgroundColor: 'rgba(0,0,0,0.55)',
    opacity: 0.9,
  },
  collapsedLabel: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  panel: {
    height: 96,
    maxWidth: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  tile: {
    width: 72,
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  tileActive: {
    backgroundColor: '#e8f0fe',
  },
  tileArt: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dadce0',
    overflow: 'hidden',
  },
  tileLabel: {
    fontSize: 11,
    lineHeight: 11,
  },
  art: {
    width: '100%',
    height: '100%',
  },
});
