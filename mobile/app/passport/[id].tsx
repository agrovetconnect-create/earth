import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { PublicObservationDetail } from '../../src/types/public';
import { fetchPublicObservation } from '../../src/services/publicApi';
import { cacheJson, offlineCacheKey, readCachedJson } from '../../src/services/offlineCache';
import { PassportContent } from '../../src/components/PassportContent';
import { openWhatsApp } from '../../src/services/whatsapp';
import { colors, radius, spacing } from '../../src/lib/theme';

/**
 * The full Geoscience Passport page — the web's GeosciencePassportModal,
 * presented as a full-screen route on mobile.
 */
export default function PassportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [observation, setObservation] = useState<PublicObservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // True when the record on screen came from the on-device copy saved during a
  // previous online visit.
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setFromCache(false);
    const cacheKey = offlineCacheKey.passport(id);
    fetchPublicObservation(id)
      .then((detail) => {
        if (cancelled) return;
        if (detail) {
          // Keep a device copy so this passport can be reopened offline later.
          void cacheJson(cacheKey, detail);
        }
        setObservation(detail);
        setNotFound(!detail);
      })
      .catch(() => {
        // Offline or the server is unreachable: fall back to the last saved
        // copy of this passport, if it was opened here before.
        void readCachedJson<PublicObservationDetail>(cacheKey).then((cached) => {
          if (cancelled) return;
          if (cached) {
            setObservation(cached);
            setFromCache(true);
            setNotFound(false);
          } else {
            setNotFound(true);
          }
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const openWhatsAppFlow = () => {
    const number = process.env.EXPO_PUBLIC_WHATSAPP_NUMBER ?? '';
    const message = 'Hello Earth Talk! I have a field observation to share.';
    void openWhatsApp(number, message);
  };

  // Loading and error states sit clear of the notch and always offer a way
  // back to the map — a load failure is never a dead end.
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={[styles.centerState, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ fontSize: 14, color: '#5e5e5e' }}>Loading Geoscience Passport data…</Text>
      </View>
    );
  }

  if (notFound || !observation) {
    return (
      <View style={[styles.centerState, { paddingTop: insets.top }]}>
        <Text style={{ fontSize: 14, color: '#5e5e5e', textAlign: 'center', paddingHorizontal: 32 }}>
          This Geoscience Passport could not be loaded. It may have been removed.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <ChevronLeft size={16} color={colors.primary} />
          <Text style={styles.closeButtonText}>Back to the map</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      {fromCache ? (
        <View pointerEvents="none" style={[styles.offlineNotice, { top: insets.top + 56 }]}>
          <Text style={styles.offlineNoticeText}>Saved copy — shown offline</Text>
        </View>
      ) : null}
      <PassportContent
        observation={observation}
        onClose={() => router.back()}
        onOpenWhatsApp={openWhatsAppFlow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: '#ffffff',
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#ffffff',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  offlineNotice: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 50,
    backgroundColor: 'rgba(32,33,36,0.92)',
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  offlineNoticeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#fbbf24',
  },
});
