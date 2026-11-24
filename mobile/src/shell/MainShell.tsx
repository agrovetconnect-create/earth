import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Crosshair,
  Eye,
  EyeOff,
  History as HistoryIcon,
  Maximize2,
  Menu,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  WifiOff,
  X,
} from 'lucide-react-native';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import type { PublicObservationFeature, PublicCategoryCount, ObservationFilters } from '../types/public';
import { categoryLabel, type PublicSiteFeature } from '../types/community';
import { fetchPublicGeoJson, fetchPublicCategories, fetchPublicDistricts } from '../services/publicApi';
import { fetchMyPosts } from '../services/postsApi';
import { fetchSitesGeoJson } from '../services/communityApi';
import { getPublicConfig, type AppDistributionPublicConfig } from '../services/appDistributionApi';
import { refreshSession, useCommunityUser, signOut, hydrateCachedSession } from '../services/communityAuth';
import { usePreferences } from '../services/preferences';
import { useTheme } from '../lib/themeMode';
import {
  addRecentSearch,
  clearRecentSearches,
  removeRecentSearch,
  useRecentSearches,
} from '../services/recentSearches';
import { recordView } from '../services/history';
import { navItemLabel, type View as ShellView } from '../services/navigation';
import { AppMap, DEFAULT_REGION } from '../components/AppMap';
import { MapStyleSelector } from '../components/MapStyleSelector';
import { FilterPanel } from '../components/FilterPanel';
import { Drawer } from '../components/Drawer';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { ObservationSheet } from '../components/ObservationSheet';
import { SitesView } from '../views/SitesView';
import { CommunityView } from '../views/CommunityView';
import { MineView } from '../views/MineView';
import { MyMapView } from '../views/MyMapView';
import { HistoryView } from '../views/HistoryView';
import { GuideView, type GuidePage } from '../views/GuideView';
import {
  CATEGORY_COLORS,
  CATEGORY_COLOR_FALLBACK,
  MAP_TILES,
  colors,
  elevation,
  radius,
  spacing,
  type MapStyle,
} from '../lib/theme';
import { evidenceStateHex } from '../lib/evidenceMeta';

/**
 * The app shell — the web app's narrow-viewport layout: a full-bleed explore
 * map with floating controls, an overlay navigation drawer, and the other
 * sections (sites, community, mine, my map, history, guide, legal) as the
 * "main" surface the drawer switches to.
 */

const CMS_VIEWS: ShellView[] = ['about', 'how-it-works', 'terms', 'privacy'];

/** Website destinations surfaced inside the map search, like the web's `searchPages`. */
const SEARCH_PAGES: { id: ShellView; label: string; subtitle: string; requiresSignIn?: boolean }[] = [
  { id: 'explore', label: 'Explore map', subtitle: 'Every published observation and geoscience site in Rwanda' },
  { id: 'sites', label: 'Geoscience sites', subtitle: 'Grouped localities, and posts without a coordinate' },
  { id: 'community', label: 'Investigations', subtitle: 'Open community investigations' },
  { id: 'mine', label: 'My Earth Talk', subtitle: 'Your posts, questions, answers and comments', requiresSignIn: true },
  { id: 'my-map', label: 'My Map', subtitle: 'Your own observations, including the private ones', requiresSignIn: true },
  { id: 'history', label: 'History', subtitle: 'Places you have opened, grouped by day' },
  { id: 'about', label: 'About & Guide', subtitle: 'Mission, citizen science workflow and how a photo becomes a Geoscience Passport' },
  { id: 'terms', label: 'Legal & Transparency', subtitle: 'Terms of Service, scientific disclaimers and privacy commitments' },
  { id: 'how-it-works', label: 'How it works', subtitle: 'How a photo becomes a Geoscience Passport' },
  { id: 'privacy', label: 'Privacy Policy', subtitle: 'Data protection and contributor privacy commitments' },
];

/** Round ground distances for the scale bar, in metres — from the web map. */
const SCALE_STEPS_METRES = [
  10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000,
];

function formatScaleLabel(metres: number): string {
  return metres >= 1000 ? `${Math.round(metres / 1000)} km` : `${metres} m`;
}

export function MainShell() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const user = useCommunityUser();
  const { preferences } = usePreferences();
  const { dark, palette: t } = useTheme();
  const recentSearches = useRecentSearches();

  const [bootstrapped, setBootstrapped] = useState(false);
  const [view, setView] = useState<ShellView>('explore');
  const [communityPanel, setCommunityPanel] = useState<'investigations'>('investigations');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyle>('map');
  const [filters, setFilters] = useState<ObservationFilters>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPassportId, setSelectedPassportId] = useState<string | null>(null);
  const [geojson, setGeojson] = useState<PublicObservationFeature[] | null>(null);
  const [sites, setSites] = useState<PublicSiteFeature[] | null>(null);
  const [categories, setCategories] = useState<PublicCategoryCount[]>([]);
  const [districts, setDistricts] = useState<{ name: string; observation_count: number }[]>([]);
  const [distribution, setDistribution] = useState<AppDistributionPublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [locating, setLocating] = useState(false);
  const [locateNotice, setLocateNotice] = useState<string | null>(null);
  // Device connectivity, for the small non-blocking banner at the top of the
  // map: it appears when the device goes offline and fades away on reconnect.
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;
  const offlineBannerOpacity = useRef(new Animated.Value(0)).current;
  const [offlineBannerShown, setOfflineBannerShown] = useState(false);
  useEffect(() => {
    if (isOffline) {
      setOfflineBannerShown(true);
      Animated.timing(offlineBannerOpacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    } else {
      Animated.timing(offlineBannerOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() =>
        setOfflineBannerShown(false)
      );
    }
  }, [isOffline, offlineBannerOpacity]);
  // The contributor's own located posts for the map's private overlay —
  // coordinates here may be more precise than the public map is allowed to
  // draw, so they come only from the owner endpoint.
  const [ownerPosts, setOwnerPosts] = useState<Array<{ passport_id: string; latitude: number; longitude: number }>>([]);
  const [showOwn, setShowOwn] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  // Loading is a 3px progress line on the very top edge of the map, the way
  // Google Maps indicates a fetch.
  useEffect(() => {
    if (!loading) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Bootstrap: hydrate the cached signed-in user (so login survives offline
  // and app restarts), then reconcile with the server session and load chrome config.
  useEffect(() => {
    void (async () => {
      await hydrateCachedSession();
      await Promise.all([
        refreshSession().catch(() => null),
        getPublicConfig().then(setDistribution).catch(() => null),
        fetchPublicDistricts().then(setDistricts).catch(() => null),
      ]);
      setBootstrapped(true);
    })();
  }, []);

  // Map + list data; refetches when filters change.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [observations, sitesGeo, categoryCounts] = await Promise.all([
        fetchPublicGeoJson(filters).catch(() => null),
        fetchSitesGeoJson().catch(() => null),
        categories.length ? Promise.resolve(null) : fetchPublicCategories().catch(() => []),
      ]);
      if (cancelled) return;
      setGeojson(observations?.features ?? []);
      setSites(sitesGeo?.features ?? []);
      if (categoryCounts) setCategories(categoryCounts);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const whatsappNumber =
    distribution?.whatsapp?.number ?? process.env.EXPO_PUBLIC_WHATSAPP_NUMBER ?? null;

  // Load the reader's own located posts for the map's private overlay.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setOwnerPosts([]);
      setShowOwn(false);
      return;
    }
    fetchMyPosts()
      .then((posts) => {
        if (cancelled) return;
        setOwnerPosts(
          posts
            .filter(
              (post): post is typeof post & { latitude: number; longitude: number } =>
                typeof post.latitude === 'number' && typeof post.longitude === 'number',
            )
            .map((post) => ({
              passport_id: post.passport_id,
              latitude: post.latitude,
              longitude: post.longitude,
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setOwnerPosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const markers = useMemo(() => {
    if (view !== 'explore') return [];
    const observationMarkers = (geojson ?? []).flatMap((feature): Array<{
      id: string;
      latitude: number;
      longitude: number;
      color: string;
      kind: 'observation' | 'site';
      selected?: boolean;
    }> => {
      const [lon, lat] = feature.geometry.coordinates;
      if (typeof lat !== 'number' || typeof lon !== 'number') return [];
      return [
        {
          id: feature.properties.passport_id,
          latitude: lat,
          longitude: lon,
          // Teardrop pins are tinted by the observation category, exactly as
          // the web map tints them.
          color: CATEGORY_COLORS[feature.properties.observation_category] ?? CATEGORY_COLOR_FALLBACK,
          kind: 'observation' as const,
        },
      ];
    });
    const siteMarkers = (sites ?? []).flatMap((feature) => {
      const [lon, lat] = feature.geometry.coordinates;
      if (typeof lat !== 'number' || typeof lon !== 'number') return [];
      return [
        {
          id: `site-${feature.properties.site_id}`,
          latitude: lat,
          longitude: lon,
          color: evidenceStateHex(feature.properties.highest_evidence_state),
          kind: 'site' as const,
        },
      ];
    });
    // The owner overlay draws on top of the public pins as violet markers,
    // like the web's owner-posts layer. Prefixed ids let both exist at the
    // same coordinate; selection strips the prefix back to the passport.
    const ownerMarkers = showOwn
      ? ownerPosts.map((post) => ({
          id: `owner-${post.passport_id}`,
          latitude: post.latitude,
          longitude: post.longitude,
          color: '#7c3aed',
          kind: 'observation' as const,
        }))
      : [];
    return [...observationMarkers, ...siteMarkers, ...ownerMarkers];
  }, [view, geojson, sites, showOwn, ownerPosts]);

  const handleSelectMarker = useCallback(
    (rawId: string) => {
      const id = rawId.startsWith('owner-') ? rawId.slice(6) : rawId;
      if (id.startsWith('site-')) {
        const siteId = id.slice(5);
        recordView({ view: 'explore', panel: 'site', siteId, title: 'Geoscience site' });
        router.push({ pathname: '/site/[id]', params: { id: siteId } });
        return;
      }
      const feature = (geojson ?? []).find((f) => f.properties.passport_id === id);
      recordView({
        view: 'explore',
        panel: 'post',
        passportId: id,
        title: feature?.properties.post_title ?? feature?.properties.possible_name ?? 'Observation',
      });
      setSelectedPassportId(id);
    },
    [geojson]
  );

  const handleSelectView = useCallback(
    (next: ShellView, panel?: 'investigations') => {
      setDrawerOpen(false);
      setSearchOpen(false);
      setFilterOpen(false);
      setView(next);
      if (panel) setCommunityPanel(panel);
      if (next !== 'explore') {
        recordView({ view: next, title: navItemLabel(next) });
      }
    },
    []
  );

  const resetToRwanda = useCallback(() => {
    mapRef.current?.animateToRegion(DEFAULT_REGION, 800);
  }, []);

  const recenter = useCallback(async () => {
    if (locating) return;
    setLocateNotice(null);
    // The web button refuses to locate while sharing is switched off in
    // preferences, with an inline notice instead of a browser dialog.
    if (!preferences.allowLocation) {
      setLocateNotice('Location sharing is switched off in your preferences.');
      return;
    }
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocateNotice(
          'Location permission was denied. Allow location access for this site so the map can show the way.'
        );
        // A clear, centered prompt for the denied case, with a direct path
        // to the system settings.
        Alert.alert(
          'Location access needed',
          'To show where you are on the map, allow location access for Earth Talk in Settings.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                void Linking.openSettings();
              },
            },
          ],
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current?.animateToRegion(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.0125,
        },
        800
      );
    } catch {
      setLocateNotice('Your location could not be determined right now.');
    } finally {
      setLocating(false);
    }
  }, [locating, preferences.allowLocation]);

  const submitSearch = useCallback(
    (raw: string) => {
      const query = raw.trim();
      if (!query) return;
      addRecentSearch(query);
      setSearchOpen(false);
      const q = query.toLowerCase();

      const passportMatch = (geojson ?? []).find((f) => f.properties.passport_id.toLowerCase() === q);
      if (passportMatch) {
        handleSelectMarker(passportMatch.properties.passport_id);
        return;
      }
      const siteMatch = (sites ?? []).find(
        (s) =>
          s.properties.site_code.toLowerCase() === q ||
          s.properties.title.toLowerCase().includes(q)
      );
      if (siteMatch) {
        recordView({ view: 'explore', panel: 'site', siteId: siteMatch.properties.site_id, title: siteMatch.properties.title });
        router.push({ pathname: '/site/[id]', params: { id: siteMatch.properties.site_id } });
        return;
      }
      // Otherwise treat it as a text filter on the map.
      setView('explore');
      setFilters((prev) => ({ ...prev, search: query }));
    },
    [geojson, sites, handleSelectMarker]
  );

  const openPassport = useCallback((passportId: string) => {
    recordView({ view: 'explore', panel: 'post', passportId, title: 'Observation' });
    router.push({ pathname: '/passport/[id]', params: { id: passportId } });
  }, []);

  const openSite = useCallback((siteId: string) => {
    recordView({ view: 'sites', panel: 'site', siteId, title: 'Geoscience site' });
    router.push({ pathname: '/site/[id]', params: { id: siteId } });
  }, []);

  // -------------------------------------------------------------------------
  // Search autocomplete — a verbatim port of MapSearchOverlay's suggestion
  // logic: one flat list, observations then sites then pages then recents,
  // titles that start with the query sorted first.
  // -------------------------------------------------------------------------

  const suggestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matches = (...values: Array<string | null | undefined>) =>
      values.some((value) => (value ?? '').toLowerCase().includes(query));

    type Suggestion = {
      id: string;
      kind: 'observation' | 'site' | 'page' | 'recent';
      title: string;
      subtitle?: string;
      searchValue: string;
      passportId?: string;
      siteId?: string;
      pageId?: ShellView;
    };

    if (!query) {
      return recentSearches.slice(0, 8).map((item): Suggestion => ({
        id: `recent-${item}`,
        kind: 'recent' as const,
        title: item,
        searchValue: item,
      }));
    }

    const observationSuggestions: Suggestion[] = (geojson ?? [])
      .filter((feature) => {
        const p = feature.properties;
        return matches(
          p.post_title,
          p.possible_name,
          p.primary_interpretation,
          p.passport_id,
          p.district,
          p.observation_category,
          p.observation_subcategory
        );
      })
      .slice(0, 6)
      .map((feature) => {
        const p = feature.properties;
        const subtitle = [p.district, categoryLabel(p.observation_category)].filter(Boolean).join(' · ');
        return {
          id: `observation-${p.passport_id}`,
          kind: 'observation' as const,
          title: p.post_title || p.possible_name || p.primary_interpretation || p.passport_id,
          subtitle,
          searchValue: p.post_title || p.possible_name || p.passport_id,
          passportId: p.passport_id,
        };
      });

    const siteSuggestions: Suggestion[] = (sites ?? [])
      .filter((feature) => {
        const p = feature.properties;
        return matches(p.title, p.site_code, p.description, p.district);
      })
      .slice(0, 5)
      .map((feature) => {
        const p = feature.properties;
        return {
          id: `site-${p.site_id}`,
          kind: 'site' as const,
          title: p.title,
          subtitle: [p.district, 'Geological site'].filter(Boolean).join(' · '),
          searchValue: p.title,
          siteId: p.site_id,
        };
      });

    const pageSuggestions: Suggestion[] = SEARCH_PAGES.filter(
      (page) => !page.requiresSignIn || Boolean(user)
    )
      .filter((page) => page.label.toLowerCase().includes(query))
      .slice(0, 6)
      .map((page) => ({
        id: `page-${page.id}-${page.label}`,
        kind: 'page' as const,
        title: page.label,
        subtitle: page.subtitle || 'Website page',
        searchValue: page.label,
        pageId: page.id,
      }));

    const recentSuggestions: Suggestion[] = recentSearches
      .filter((item) => item.toLowerCase().includes(query) && item.toLowerCase() !== query)
      .slice(0, 4)
      .map((item) => ({
        id: `recent-${item}`,
        kind: 'recent' as const,
        title: item,
        searchValue: item,
      }));

    return [
      ...observationSuggestions,
      ...siteSuggestions,
      ...pageSuggestions,
      ...recentSuggestions,
    ].sort((a, b) => {
      const aStarts = a.title.toLowerCase().startsWith(query) ? 0 : 1;
      const bStarts = b.title.toLowerCase().startsWith(query) ? 0 : 1;
      return aStarts - bStarts;
    });
  }, [searchQuery, geojson, sites, recentSearches, user]);

  const handleSelectSuggestion = useCallback(
    (item: (typeof suggestions)[number]) => {
      if (item.kind === 'observation' && item.passportId) {
        setSearchOpen(false);
        handleSelectMarker(item.passportId);
      } else if (item.kind === 'site' && item.siteId) {
        setSearchOpen(false);
        recordView({ view: 'explore', panel: 'site', siteId: item.siteId, title: item.title });
        router.push({ pathname: '/site/[id]', params: { id: item.siteId } });
      } else if (item.kind === 'page' && item.pageId) {
        setSearchOpen(false);
        handleSelectView(item.pageId);
      } else {
        submitSearch(item.searchValue);
      }
      if (item.kind !== 'page') addRecentSearch(item.searchValue);
    },
    [handleSelectMarker, handleSelectView, submitSearch]
  );

  // Filter badge counts every filter a reader could have set — web verbatim.
  const activeFilterCount = [
    filters.district,
    filters.category,
    filters.classification,
    filters.evidence_state,
    filters.confidence,
    filters.verification,
    filters.has_investigation,
    filters.research_opportunity,
    filters.has_evidence,
    filters.search,
  ].filter((value) => value !== undefined && value !== '' && value !== false).length;

  // Scale bar: pick the first round distance that reads at a sensible width.
  const scaleBar = useMemo(() => {
    const zoom = Math.log2(360 / Math.max(region.longitudeDelta, 1e-6));
    const metresPerPixel = (156543.03392 * Math.cos((region.latitude * Math.PI) / 180)) / 2 ** zoom;
    const step = SCALE_STEPS_METRES.find((metres) => metres / metresPerPixel >= 40) ?? 200000;
    return { width: Math.min(120, Math.max(24, step / metresPerPixel)), label: formatScaleLabel(step) };
  }, [region]);

  const closeOverlays = useCallback(() => {
    setSearchOpen(false);
    setFilterOpen(false);
  }, []);

  const renderView = () => {
    if (CMS_VIEWS.includes(view)) {
      return (
        <GuideView
          page={view as GuidePage}
          onBack={() => handleSelectView('explore')}
          onNavigateTab={handleSelectView}
        />
      );
    }
    switch (view) {
      case 'sites':
        return (
          <SitesView
            onOpenSite={openSite}
            onOpenObservation={openPassport}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        );
      case 'community':
        return (
          <CommunityView
            onSignIn={() => router.push('/login')}
          />
        );
      case 'mine':
        return <MineView onOpenObservation={openPassport} onSignIn={() => router.push('/login')} />;
      case 'my-map':
        return <MyMapView onOpenObservation={openPassport} onSignIn={() => router.push('/login')} />;
      case 'history':
        return (
          <HistoryView
            onOpenObservation={openPassport}
            onOpenSite={openSite}
            onOpenView={(v) => handleSelectView(v)}
          />
        );
      case 'explore':
      default:
        return null;
    }
  };

  const dropdownWidth = Math.min(340, screenWidth - 48);

  return (
    <View style={[styles.root, { backgroundColor: t.surface }]}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={t.surface} />
      {view === 'explore' ? (
        <AppMap
          markers={markers}
          mapStyle={mapStyle}
          initialRegion={DEFAULT_REGION}
          showsUserLocation={preferences.allowLocation}
          onSelectMarker={handleSelectMarker}
          onMapPress={closeOverlays}
          onRegionChangeComplete={setRegion}
          mapRef={mapRef}
        >
          {/* Loading: a 3px progress line on the very top edge of the canvas. */}
          {loading ? (
            <View style={styles.loadingLine} pointerEvents="none">
              <Animated.View style={[styles.loadingLineBar, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }]} />
            </View>
          ) : null}

          {/* Inline geolocation notice (replaces alert dialogs). */}
          {locateNotice ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.noticeWrap,
                { top: insets.top + spacing.sm + 48 + spacing.md },
              ]}
            >
              <View style={[styles.notice, { backgroundColor: t.surfaceContainer, borderColor: t.outlineVariant }, elevation[2]]}>
                <Text style={[styles.noticeText, { color: t.onSurfaceVariant }]}>{locateNotice}</Text>
                <Pressable accessibilityLabel="Dismiss location notice" onPress={() => setLocateNotice(null)}>
                  <X size={14} color={t.onSurfaceVariant} />
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Search row: menu button + search field + filter button, like the
              web map's MapSearchOverlay + MapFilterControl. */}
          <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + spacing.sm }]}>
            <Pressable
              style={({ pressed }) => [styles.menuButton, { backgroundColor: t.surface, borderColor: t.outlineVariant }, elevation[2], pressed && { opacity: 0.85 }]}
              onPress={() => setDrawerOpen(true)}
              accessibilityLabel="Open sidebar"
            >
              <Menu size={20} color={t.onSurfaceVariant} />
            </Pressable>

            <View style={[styles.searchField, { backgroundColor: t.surface, borderColor: t.outlineVariant }, elevation[2]]}>
              <Search size={18} color={dark ? '#9aa0a6' : '#5e5e5e'} />
              <TextInput
                style={[styles.searchInput, { color: t.onSurface }]}
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  setSearchOpen(true);
                }}
                onFocus={() => {
                  setSearchOpen(true);
                  setFilterOpen(false);
                }}
                placeholder="Search everything on the map and website"
                placeholderTextColor={dark ? '#9aa0a6' : '#5f6368'}
                accessibilityLabel="Search observations"
                returnKeyType="search"
                onSubmitEditing={() => submitSearch(searchQuery)}
              />
              {loading ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginHorizontal: 6 }} />
              ) : searchQuery ? (
                <Pressable
                  accessibilityLabel="Clear search"
                  onPress={() => {
                    setSearchQuery('');
                    setFilters((prev) => ({ ...prev, search: undefined }));
                  }}
                  style={styles.searchClear}
                >
                  <X size={16} color={t.onSurfaceVariant} />
                </Pressable>
              ) : null}
              <View style={[styles.searchDivider, { backgroundColor: t.outlineVariant }]} />
              <Pressable
                accessibilityLabel={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'}
                onPress={() => {
                  setFilterOpen((prev) => {
                    const next = !prev;
                    if (next) setSearchOpen(false);
                    return next;
                  });
                }}
                style={[
                  styles.filterButton,
                  (filterOpen || activeFilterCount > 0) && { backgroundColor: t.primaryContainer },
                ]}
              >
                <SlidersHorizontal size={18} color={filterOpen || activeFilterCount > 0 ? t.primary : t.onSurfaceVariant} />
                {activeFilterCount > 0 ? (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>

          {/* Autocomplete dropdown, directly under the field. */}
          {searchOpen && (suggestions.length > 0 || searchQuery.trim()) ? (
            <>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setSearchOpen(false)} />
              <View
                style={[
                  styles.suggestionsPanel,
                  { backgroundColor: t.surfaceContainer, borderColor: t.outlineVariant },
                  elevation[3],
                  { top: insets.top + spacing.sm + 48 + spacing.sm, width: screenWidth - 72 },
                ]}
                accessibilityLabel="Search suggestions"
              >
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
                  {searchQuery.trim() && suggestions.length === 0 && !loading ? (
                    <View style={styles.noResults}>
                      <Text style={[styles.noResultsText, { color: t.onSurfaceVariant }]}>No results found</Text>
                    </View>
                  ) : null}

                  {!searchQuery.trim() && recentSearches.length > 0 ? (
                    <View style={[styles.recentHeader, { backgroundColor: t.surfaceContainerHigh, borderBottomColor: t.outlineVariant }]}>
                      <Text style={[styles.recentHeaderText, { color: t.onSurfaceVariant }]}>RECENT SEARCHES</Text>
                      <Pressable
                        onPress={() => clearRecentSearches()}
                        hitSlop={8}
                      >
                        <Text style={[styles.recentClear, { color: t.primary }]}>Clear all</Text>
                      </Pressable>
                    </View>
                  ) : null}

                  {suggestions.map((item) => {
                    const query = searchQuery.trim().toLowerCase();
                    const index = query ? item.title.toLowerCase().indexOf(query) : -1;
                    const before = index >= 0 ? item.title.slice(0, index) : item.title;
                    const match = index >= 0 ? item.title.slice(index, index + query.length) : '';
                    const after = index >= 0 ? item.title.slice(index + query.length) : '';
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => handleSelectSuggestion(item)}
                        style={({ pressed }) => [
                          styles.suggestionRow,
                          pressed && { backgroundColor: t.primaryContainer },
                        ]}
                      >
                        {item.kind === 'recent' ? (
                          <HistoryIcon size={16} color={dark ? '#9aa0a6' : '#70757a'} />
                        ) : (
                          <Search size={16} color={dark ? '#9aa0a6' : '#70757a'} />
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.suggestionTitle, { color: t.onSurface }]} numberOfLines={1}>
                            {before}
                            {match ? (
                              <Text style={[styles.suggestionMatch, { color: t.primary, backgroundColor: t.primaryContainer }]}>{match}</Text>
                            ) : null}
                            {after}
                          </Text>
                          {item.subtitle ? (
                            <Text style={[styles.suggestionSubtitle, { color: t.onSurfaceVariant }]} numberOfLines={1}>
                              {item.subtitle}
                            </Text>
                          ) : null}
                        </View>
                        {item.kind === 'recent' ? (
                          <Pressable
                            onPress={() => removeRecentSearch(item.searchValue)}
                            hitSlop={8}
                            accessibilityLabel={`Remove "${item.searchValue}" from history`}
                          >
                            <X size={14} color={dark ? '#9aa0a6' : '#70757a'} />
                          </Pressable>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </>
          ) : null}

          {/* Filter dropdown panel, anchored under the field's right edge. */}
          {filterOpen ? (
            <>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterOpen(false)} />
              <View
                style={[
                  styles.filterPanel,
                  { backgroundColor: t.surfaceContainer },
                  elevation[3],
                  { top: insets.top + spacing.sm + 48 + spacing.sm, right: spacing.md, width: dropdownWidth },
                ]}
              >
                <FilterPanel
                  filters={filters}
                  onChange={setFilters}
                  onReset={() => setFilters({})}
                  districts={districts}
                  categories={categories}
                />
              </View>
            </>
          ) : null}

          {/* Google-style map chrome, bottom-left: the style selector. */}
          <View pointerEvents="box-none" style={[styles.styleSelectorWrap, { bottom: insets.bottom + 32, left: 12 }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}>
              <MapStyleSelector
                active={mapStyle}
                onSelect={(next) => {
                  setMapStyle(next);
                }}
              />
            </ScrollView>
          </View>

          {/* Map controls, bottom-right stack like Google Maps: reset to
              Rwanda, show my location, then the zoom buttons. */}
          <View
            pointerEvents="box-none"
            style={[styles.controlStack, { bottom: insets.bottom + 32, right: 12 }]}
          >
            {/* The owner overlay toggle — only when signed in with located posts. */}
            {view === 'explore' && user && ownerPosts.length > 0 ? (
              <Pressable
                accessibilityLabel={showOwn ? 'Hide my private observations' : 'Show my observations on this map'}
                accessibilityState={{ checked: showOwn }}
                onPress={() => setShowOwn((prev) => !prev)}
                style={({ pressed }) => [
                  styles.ownPill,
                  showOwn
                    ? { borderColor: t.primary, backgroundColor: t.primaryContainer }
                    : { borderColor: t.outlineVariant, backgroundColor: t.surface },
                  pressed && { opacity: 0.85 },
                ]}
              >
                {showOwn ? (
                  <Eye size={14} color={dark ? '#8ab4f8' : '#0b57d0'} />
                ) : (
                  <EyeOff size={14} color={dark ? '#9aa0a6' : '#444746'} />
                )}
                <Text style={[styles.ownPillText, { color: dark ? '#8ab4f8' : '#444746' }, showOwn && { color: dark ? '#8ab4f8' : '#0b57d0' }]}>My posts</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityLabel="Reset view to Rwanda"
              onPress={resetToRwanda}
              style={({ pressed }) => [styles.controlButton, { backgroundColor: t.surface, borderColor: t.outlineVariant }, elevation[2], pressed && { opacity: 0.85 }]}
            >
              <Maximize2 size={15} color={t.onSurfaceVariant} />
            </Pressable>

            <Pressable
              accessibilityLabel="Show my location"
              disabled={locating}
              onPress={() => void recenter()}
              style={({ pressed }) => [styles.controlButton, { backgroundColor: t.surface, borderColor: t.outlineVariant }, elevation[2], pressed && { opacity: 0.85 }]}
            >
              <Crosshair
                size={16}
                color={locating ? t.primary : t.onSurfaceVariant}
                {...(locating ? { animation: { iterate: 'infinte' as never } } : {})}
              />
            </Pressable>

            <View style={[styles.zoomGroup, { backgroundColor: t.surface, borderColor: t.outlineVariant }, elevation[2]]}>
              <Pressable
                accessibilityLabel="Zoom in"
                onPress={() =>
                  setRegion((prev) => {
                    const next = {
                      ...prev,
                      latitudeDelta: prev.latitudeDelta / 2,
                      longitudeDelta: prev.longitudeDelta / 2,
                    };
                    mapRef.current?.animateToRegion(next, 300);
                    return next;
                  })
                }
                style={styles.zoomButton}
              >
                <Plus size={16} color={t.onSurfaceVariant} />
              </Pressable>
              <View style={styles.zoomDivider} />
              <Pressable
                accessibilityLabel="Zoom out"
                onPress={() =>
                  setRegion((prev) => {
                    const next = {
                      ...prev,
                      latitudeDelta: prev.latitudeDelta * 2,
                      longitudeDelta: prev.longitudeDelta * 2,
                    };
                    mapRef.current?.animateToRegion(next, 300);
                    return next;
                  })
                }
                style={styles.zoomButton}
              >
                <Minus size={16} color={t.onSurfaceVariant} />
              </Pressable>
            </View>
          </View>

          {/* Attribution (web Section 65): the scale bar heads the line, and
              the source follows the active layer. */}
          <View
            pointerEvents="none"
            style={[styles.attributionRow, { bottom: insets.bottom + 4, right: 12 }]}
          >
            <View style={styles.scaleBarWrap}>
              <View style={[styles.scaleBar, { width: Math.round(scaleBar.width) }]} />
              <Text style={mapStyle === 'satellite' ? styles.attributionLight : styles.attributionText}>
                {scaleBar.label}
              </Text>
            </View>
            <Text
              style={mapStyle === 'satellite' ? [styles.attributionText, styles.attributionLight, styles.attributionShadow] : styles.attributionText}
              numberOfLines={1}
            >
              {MAP_TILES[mapStyle].attribution} · Earth Talk GeoAI
            </Text>
          </View>

          {/* Offline banner: small, non-blocking, pinned below the status bar;
              fades in when the device loses internet and fades away on reconnect. */}
          {offlineBannerShown ? (
            <Animated.View
              pointerEvents="none"
              accessibilityLiveRegion="polite"
              style={[styles.offlineBanner, { top: insets.top + 8, opacity: offlineBannerOpacity }]}
            >
              <WifiOff size={14} color="#fbbf24" />
              <Text style={styles.offlineBannerText} numberOfLines={2}>
                No internet connection — map tiles and live data are unavailable
              </Text>
            </Animated.View>
          ) : null}
        </AppMap>
      ) : (
        <View style={{ flex: 1, backgroundColor: t.surfaceContainer }}>
          {/* The web narrow header appears only for the panel views that have
              no sticky header of their own. */}
          {(view === 'community' || view === 'mine' || view === 'my-map') ? (
            <View style={[styles.viewHeader, { backgroundColor: t.surface, borderBottomColor: t.outlineVariant, paddingTop: insets.top }]}>
              <Pressable
                style={({ pressed }) => [styles.headerMenuButton, pressed && { opacity: 0.85 }]}
                onPress={() => setDrawerOpen(true)}
                accessibilityLabel="Open sidebar"
              >
                <Menu size={16} color={t.onSurfaceVariant} />
              </Pressable>
              <Text style={[styles.viewHeaderTitle, { color: t.onSurface }]} numberOfLines={1}>
                {view === 'community' && 'Community Discovery'}
                {view === 'mine' && 'My Earth Talk'}
                {view === 'my-map' && 'My Map'}
              </Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }}>{renderView()}</View>
        </View>
      )}

      <Drawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeView={view}
        activePanel={view === 'community' ? communityPanel : null}
        onSelectView={handleSelectView}
        onSignIn={() => {
          setDrawerOpen(false);
          router.push('/login');
        }}
        onSignOut={() => {
          setDrawerOpen(false);
          // Centered confirmation before an irreversible-feeling action: the
          // offline session cached on this device is cleared on sign-out.
          Alert.alert(
            'Sign out of Earth Talk?',
            'Your signed-in session is kept on this device so you can keep exploring offline. Signing out clears it, and you will need to sign in again to post, answer or save.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Sign out',
                style: 'destructive',
                onPress: () => {
                  void signOut();
                },
              },
            ],
          );
        }}
        onSubmitObservation={() => {
          setDrawerOpen(false);
          router.push('/submit');
        }}
        distribution={distribution}
        whatsappNumber={whatsappNumber}
      />

      <ObservationSheet passportId={selectedPassportId} onClose={() => setSelectedPassportId(null)} />

      {/* Offline status pill, pinned above the bottom edge like the web. */}
      <View pointerEvents="none" style={[styles.offlineWrap, { bottom: 56 + insets.bottom / 2 }]}>
        <OfflineIndicator />
      </View>

      {!bootstrapped ? (
        <View style={[styles.bootstrapVeil, { backgroundColor: t.scrim }]} pointerEvents="none">
          <ActivityIndicator color={t.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  bootstrapVeil: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 30,
  },
  offlineBanner: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '86%',
    zIndex: 40,
    backgroundColor: 'rgba(32,33,36,0.94)',
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  offlineBannerText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  topBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dadce0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    color: colors.onSurface,
    fontSize: 15,
    paddingVertical: 0,
  },
  searchClear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 10,
    backgroundColor: '#dadce0',
  },
  filterButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: '#e8f0fe',
  },
  filterBadge: {
    position: 'absolute',
    top: -1,
    right: -1,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '500',
  },
  suggestionsPanel: {
    position: 'absolute',
    left: 60,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dadce0',
    overflow: 'hidden',
  },
  noResults: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  noResultsText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#5f6368',
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
    backgroundColor: '#f8fafd',
  },
  recentHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: '#5f6368',
  },
  recentClear: {
    fontSize: 11,
    fontWeight: '500',
    color: '#1a73e8',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
  },
  suggestionTitle: {
    fontSize: 13,
    color: '#202124',
  },
  suggestionMatch: {
    fontWeight: '600',
    color: colors.primary,
    backgroundColor: '#e8f0fe',
  },
  suggestionSubtitle: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 16,
    color: '#5f6368',
  },
  filterPanel: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: 16,
    maxHeight: '70%',
  },
  styleSelectorWrap: {
    position: 'absolute',
    maxWidth: 340,
  },
  controlStack: {
    position: 'absolute',
    alignItems: 'flex-end',
    gap: 6,
  },
  ownPill: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e3e3e3',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
  },
  ownPillActive: {
    borderColor: '#0b57d0',
    backgroundColor: '#e8f0fe',
  },
  ownPillText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#444746',
  },
  controlButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomGroup: {
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: 'hidden',
  },
  zoomButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomDivider: {
    height: 1,
    backgroundColor: colors.outlineVariant,
  },
  loadingLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#d3e3fd',
    overflow: 'hidden',
    zIndex: 20,
  },
  loadingLineBar: {
    width: '33%',
    height: '100%',
    backgroundColor: colors.primary,
  },
  noticeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '90%',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  attributionRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
    maxWidth: '100%',
    zIndex: 10,
  },
  scaleBarWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  scaleBar: {
    height: 6,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  attributionText: {
    fontSize: 10,
    color: '#5e5e5e',
  },
  attributionLight: {
    color: '#ffffff',
  },
  attributionShadow: {
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  viewHeader: {
    height: 48 + 24, // 48pt content below the status bar, matching the web h-12 header
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingBottom: 10,
  },
  headerMenuButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dadce0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewHeaderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.onSurface,
    flex: 1,
    marginBottom: 4,
  },
});
