import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Mountain } from 'lucide-react-native';
import { colors, radius, spacing, type } from '../src/lib/theme';

export default function NotFoundScreen() {
  return (
    <View style={styles.root}>
      <View style={styles.badge}>
        <Mountain size={28} color={colors.onPrimary} />
      </View>
      <Text style={[type.title, { color: colors.onSurface, marginTop: spacing.lg }]}>Page not found</Text>
      <Text style={[type.body, { color: colors.onSurfaceVariant, textAlign: 'center', marginTop: spacing.sm }]}>
        This page does not exist in Earth Talk. Head back to the map to keep exploring Rwanda's geoscience.
      </Text>
      <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]} onPress={() => router.replace('/')}>
        <Text style={[type.body, { color: colors.onPrimary, fontWeight: '600' }]}>Back to the map</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 13,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xl,
  },
});
