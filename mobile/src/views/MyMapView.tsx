import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Eye, Lock, Map as MapIcon, Telescope } from 'lucide-react-native';
import type { MyPostSummary } from '../types/communityPosts';
import { fetchMyPosts } from '../services/postsApi';
import { useCommunityUser } from '../services/communityAuth';
import { CATEGORY_COLORS, colors, radius, spacing, type } from '../lib/theme';
import { AppMap, DEFAULT_REGION } from '../components/AppMap';
import { usePreferences } from '../services/preferences';

/**
 * "My Map" — the contributor's own observations on the map.
 *
 * This is the one place a private observation is drawn at its true point. The
 * map is built from the owner-only endpoint, the public layers are supplied
 * empty, and nothing here is ever shown to another reader. A private post is
 * labelled as private rather than hidden, so the map tells the truth about what
 * only its owner can see. Port of the web MyMapView.
 */

export function MyMapView({
  onOpenObservation,
  onSignIn,
}: {
  onOpenObservation: (passportId: string) => void;
  onSignIn: () => void;
}) {
  const user = useCommunityUser();
  const { preferences } = usePreferences();
  const [posts, setPosts] = useState<MyPostSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setFailed(false);
    try {
      setPosts(await fetchMyPosts());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user?.public_user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPosts([]);
    if (user) void load();
  }, [user, load]);

  if (!user) {
    return (
      <View style={styles.gateContent}>
        <View style={[styles.gateCard, styles.cardBorder]}>
          <MapIcon size={32} color="#0b57d0" />
          <Text style={[textStyles.gateTitle, { marginTop: spacing.md }]}>My Map</Text>
          <Pressable
            style={({ pressed }) => [
              styles.signInButton,
              pressed && { opacity: 0.85 },
            ]}
            onPress={onSignIn}
          >
            <Text style={[type.body, { color: colors.onPrimary, fontWeight: '600' }]}>
              Sign in to Earth Talk
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const located = posts.filter(
    (post): post is MyPostSummary & { latitude: number; longitude: number } =>
      typeof post.latitude === 'number' && typeof post.longitude === 'number',
  );

  const markers = located.map((post) => ({
    id: post.passport_id,
    latitude: post.latitude,
    longitude: post.longitude,
    color: CATEGORY_COLORS[post.observation_category] ?? '#78716c',
    kind: 'observation' as const,
  }));

  if (failed) {
    return (
      <View style={styles.centerState}>
        <Text style={[type.body, { color: '#5e5e5e', textAlign: 'center' }]}>
          Your observations could not be loaded.
        </Text>
        <Pressable onPress={() => void load()} style={{ marginTop: spacing.md }}>
          <Text style={[type.body, { color: '#0b57d0' }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (posts.length === 0 && !loading) {
    return (
      <View style={styles.centerState}>
        <Telescope size={28} color="#8f8f8f" />
        <Text
          style={[
            type.body,
            { color: '#5e5e5e', textAlign: 'center', marginTop: spacing.md, lineHeight: 20 },
          ]}
        >
          You have not recorded any observations yet. Send a photo to the Earth Talk WhatsApp
          number, and it will appear here.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.mapWrap}>
        <AppMap
          markers={markers}
          mapStyle="map"
          initialRegion={DEFAULT_REGION}
          showsUserLocation={preferences.allowLocation}
        />
        {located.length === 0 && !loading ? (
          <View style={styles.mapOverlay} pointerEvents="none">
            <Text style={textStyles.mapOverlayText}>
              None of your observations has a coordinate to place on the map yet.
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && posts.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.xl }} />
        ) : null}
        {posts.map((post) => {
          const isOnMap = typeof post.latitude === 'number' && typeof post.longitude === 'number';
          return (
            <Pressable
              key={post.passport_id}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#f0f4f9' }]}
              onPress={() => onOpenObservation(post.passport_id)}
            >
              <Text style={textStyles.rowTitle} numberOfLines={1}>
                {post.title}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4, flexWrap: 'wrap' }}>
                <View
                  style={[
                    styles.visibilityPill,
                    post.is_public ? styles.pillPublic : styles.pillPrivate,
                  ]}
                >
                  {post.is_public ? (
                    <Eye size={12} color="#0b57d0" />
                  ) : (
                    <Lock size={12} color="#6d28d9" />
                  )}
                  <Text
                    style={[
                      textStyles.pillText,
                      { color: post.is_public ? '#0b57d0' : '#6d28d9' },
                    ]}
                  >
                    {post.is_public ? 'Public' : 'Private'}
                  </Text>
                </View>
                <Text style={textStyles.rowMeta}>{post.observation_category}</Text>
                {!isOnMap ? <Text style={textStyles.noCoordinate}>No coordinate</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const textStyles = StyleSheet.create({
  gateTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f1f1f',
    textAlign: 'center',
  },
  mapOverlayText: {
    fontSize: 12,
    color: '#5e5e5e',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1f1f1f',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '500',
  },
  rowMeta: {
    fontSize: 11,
    color: '#5e5e5e',
  },
  noCoordinate: {
    fontSize: 11,
    color: '#9f6108',
  },
});

const styles = StyleSheet.create({
  gateContent: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  gateCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.xxl,
    alignItems: 'center',
  },
  cardBorder: {
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  signInButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  mapWrap: {
    height: 300,
    borderBottomWidth: 1,
    borderBottomColor: '#e3e3e3',
  },
  mapOverlay: {
    position: 'absolute',
    top: spacing.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl * 3,
    gap: spacing.sm,
  },
  row: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    backgroundColor: '#ffffff',
    padding: spacing.md,
  },
  visibilityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  pillPublic: {
    backgroundColor: '#e8f0fe',
  },
  pillPrivate: {
    backgroundColor: '#ede9fe',
  },
});
