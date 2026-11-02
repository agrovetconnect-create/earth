import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthProvider';
import { DrawerMenuButton } from '../../components/MobileNavDrawer';
import {
  countActiveObservationFilters,
  ObservationFilterModal,
  type RichObservationFilters,
} from '../../components/ObservationFilterModal';
import { ObservationImage } from '../../components/ObservationImage';
import { Screen } from '../../components/Screen';
import { SiteExplorerModal } from '../../components/SiteExplorerModal';
import {
  cameraForObservations,
  createMapRenderItems,
  filterMapObservations,
  haversineDistanceKm,
  parsePublicMapData,
  validateGeographicCoordinate,
  type BasemapStyle,
  type GeographicCoordinate,
  type MapCamera,
  type MapObservation,
} from '../../features/map/geojson';
import { ObservationMap } from '../../features/map/ObservationMap';
import {
  useCategories,
  useDistricts,
  useMapData,
  useSitesGeoJson,
} from '../../hooks/useObservations';
import { fetchMyObservations } from '../../services/api';
import {
  addRecentMapSearch,
  clearRecentMapSearches,
  getRecentMapSearches,
  removeRecentMapSearch,
} from '../../services/history';
import {
  getMobileOfflineStats,
  saveMobileOfflinePack,
  type MobileOfflineStats,
} from '../../services/offlineCache';
import { radius, spacing, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import type { GeoJsonCollection } from '../../types/api';
import { useAppLanguage } from '../../utils/language';
import { observationDetailRoute } from '../../utils/observationNavigation';
import { useResponsiveLayout } from '../../utils/responsive';
import { userFacingError } from '../../utils/userFacingError';

const androidMapsConfigured = Constants.expoConfig?.extra?.androidMapsConfigured === true;

type MapLayerMode = 'explore' | 'observations' | 'sites' | 'my_map';

interface NavRouteState {
  target: GeographicCoordinate;
  label: string;
  passportId?: string;
  distanceKm: number;
  durationMin: number;
  coordinates: GeographicCoordinate[];
  isFallbackRoute: boolean;
  usedFallbackOrigin: boolean;
}

import * as Location from 'expo-location';

const BASEMAP_OPTIONS: Array<{ value: BasemapStyle; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'map', label: 'Map', icon: 'map-outline' },
  { value: 'streets', label: 'Streets', icon: 'navigate-outline' },
  { value: 'satellite', label: 'Satellite', icon: 'planet-outline' },
  { value: 'terrain', label: 'Terrain', icon: 'analytics-outline' },
];

function parseSitesToMapPoints(collection: GeoJsonCollection | undefined): MapObservation[] {
  if (!collection) return [];
  const points: MapObservation[] = [];
  for (const feat of collection.features) {
    if (
      !feat.geometry ||
      feat.geometry.type !== 'Point' ||
      !Array.isArray(feat.geometry.coordinates) ||
      feat.geometry.coordinates.length !== 2
    ) {
      continue;
    }
    const [lon, lat] = feat.geometry.coordinates;
    const coord = validateGeographicCoordinate(lat, lon);
    const props = feat.properties;
    if (!coord || !props) continue;
    const siteId =
      typeof props.site_id === 'string'
        ? props.site_id
        : typeof props.id === 'string'
          ? props.id
          : '';
    if (!siteId) continue;
    const title =
      typeof props.title === 'string' && props.title.trim()
        ? props.title.trim()
        : 'Geological site';
    const siteCode = typeof props.site_code === 'string' ? props.site_code : '';
    const obsCount =
      typeof props.observation_count === 'number' ? props.observation_count : undefined;
    points.push({
      id: `site:${siteId}`,
      ...coord,
      category: 'site',
      subcategory: siteCode,
      title,
      description: typeof props.description === 'string' ? props.description : null,
      district: typeof props.district === 'string' ? props.district : null,
      createdAt: null,
      evidenceState:
        typeof props.highest_evidence_state === 'string' ? props.highest_evidence_state : null,
      imageUrl: null,
      isSite: true,
      observationCount: obsCount,
    });
  }
  return points;
}

export default function MapScreen() {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const auth = useAuth();
  const params = useLocalSearchParams<{
    mode?: string;
    lat?: string;
    lng?: string;
    label?: string;
    passportId?: string;
  }>();

  const [layer, setLayer] = useState<MapLayerMode>('explore');
  const [showMyPostsOverlay, setShowMyPostsOverlay] = useState(false);
  const [basemap, setBasemap] = useState<BasemapStyle>('map');
  const [basemapPickerOpen, setBasemapPickerOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filters, setFilters] = useState<RichObservationFilters>({});

  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedClusterItems, setSelectedClusterItems] = useState<MapObservation[] | null>(null);
  const [explorerSiteId, setExplorerSiteId] = useState<string | null>(null);

  const [userLocation, setUserLocation] = useState<GeographicCoordinate | null>(null);
  const [locatingGps, setLocatingGps] = useState(false);
  const [navRoute, setNavRoute] = useState<NavRouteState | null>(null);

  const [camera, setCamera] = useState<MapCamera>({
    latitude: -1.9403,
    longitude: 29.8739,
    zoom: 7.4,
  });
  const cameraRef = useRef(camera);
  const [cameraCommand, setCameraCommand] = useState<{ id: number; camera: MapCamera }>();
  const [mapFailed, setMapFailed] = useState(false);
  const [mapGeneration, setMapGeneration] = useState(0);
  const [searchTimer, setSearchTimer] = useState<ReturnType<typeof setTimeout>>();
  const [savingOffline, setSavingOffline] = useState(false);
  const [offlineStats, setOfflineStats] = useState<MobileOfflineStats | null>(null);
  const [mapNotice, setMapNotice] = useState<string | null>(null);

  // Sync URL navigation params (e.g. ?mode=my_map or ?lat=...&lng=...&label=...)
  useEffect(() => {
    if (params.mode === 'my_map') setLayer('my_map');
    else if (params.mode === 'sites') setLayer('sites');
    else if (params.mode === 'observations') setLayer('observations');
    else if (params.mode === 'explore') setLayer('explore');
  }, [params.mode]);

  useEffect(() => {
    void getRecentMapSearches().then(setRecentSearches);
  }, [searchFocused]);

  const categoriesQuery = useCategories();
  const districtsQuery = useDistricts();

  const effectiveRockType =
    !filters.category || filters.category === 'rock' ? filters.classification : undefined;

  const obsQuery = useMapData(
    {
      category: filters.category,
      classification: effectiveRockType,
      evidence_state: filters.evidence_state,
      confidence: filters.confidence,
      verification: filters.verification,
      district: filters.district,
      search: submittedSearch,
    },
    layer === 'explore' || layer === 'observations'
  );

  const sitesQuery = useSitesGeoJson(
    filters.district,
    layer === 'explore' || layer === 'sites'
  );

  const myObsQuery = useQuery({
    queryKey: ['account', 'observations', auth.user?.public_user_id],
    queryFn: ({ signal }) => fetchMyObservations(auth.token!, signal),
    enabled: (layer === 'my_map' || showMyPostsOverlay) && Boolean(auth.user && auth.token),
  });

  const parsedObs = useMemo(
    () => (obsQuery.data ? parsePublicMapData(obsQuery.data) : null),
    [obsQuery.data]
  );

  const sitePoints = useMemo(
    () => parseSitesToMapPoints(sitesQuery.data),
    [sitesQuery.data]
  );

  const ownerPoints = useMemo<MapObservation[]>(() => {
    const rows = myObsQuery.data?.data ?? [];
    return rows
      .map((row): MapObservation | null => {
        const coord = validateGeographicCoordinate(row.latitude, row.longitude);
        if (!coord) return null;
        return {
          id: row.passport_id,
          ...coord,
          category: row.observation_category,
          subcategory: row.is_public ? t('Public') : t('Private'),
          title: row.title || row.passport_id,
          description: t(`Location precision: ${row.location_precision}`),
          district: null,
          createdAt: row.created_at,
          evidenceState: null,
          imageUrl: null,
          isPrivateOwner: !row.is_public,
        };
      })
      .filter((x): x is MapObservation => x !== null);
  }, [myObsQuery.data, t]);

  const activePoints = useMemo<MapObservation[]>(() => {
    const filteredSites = sitePoints.filter((s) => {
      if (filters.evidence_state && s.evidenceState !== filters.evidence_state) return false;
      if (!submittedSearch) return true;
      const needle = submittedSearch.toLowerCase();
      return (
        s.title.toLowerCase().includes(needle) ||
        s.subcategory.toLowerCase().includes(needle) ||
        (s.district ?? '').toLowerCase().includes(needle)
      );
    });

    if (layer === 'sites') return filteredSites;

    if (layer === 'my_map') {
      return filterMapObservations(ownerPoints, filters.category ?? '', '', '', {
        search: submittedSearch,
      });
    }

    const filteredPublicObs = filterMapObservations(
      parsedObs?.observations ?? [],
      filters.category ?? '',
      effectiveRockType ?? '',
      filters.evidence_state ?? '',
      {
        district: filters.district,
        confidence: filters.confidence,
        verification: filters.verification,
        search: submittedSearch,
      }
    );

    if (layer === 'observations') {
      return filteredPublicObs;
    }

    // Default 'explore' mode: simultaneous Public Observations + Geoscience Sites (+ optional My Posts)
    const combined = [...filteredPublicObs, ...filteredSites];
    if (showMyPostsOverlay && ownerPoints.length > 0) {
      const seen = new Set(combined.map((p) => p.id));
      for (const own of ownerPoints) {
        if (!seen.has(own.id)) combined.push(own);
      }
    }
    return combined;
  }, [
    layer,
    sitePoints,
    ownerPoints,
    parsedObs,
    filters,
    effectiveRockType,
    submittedSearch,
    showMyPostsOverlay,
  ]);

  const renderItems = useMemo(
    () => createMapRenderItems(activePoints, camera.zoom),
    [activePoints, camera.zoom]
  );

  const selected = activePoints.find((item) => item.id === selectedId);
  const androidUnavailable = Platform.OS === 'android' && !androidMapsConfigured;
  const onMapFailure = useCallback(() => setMapFailed(true), []);

  const moveCamera = useCallback((next: MapCamera) => {
    cameraRef.current = next;
    setCamera(next);
    setCameraCommand((previous) => ({ id: (previous?.id ?? 0) + 1, camera: next }));
  }, []);

  // Build route when navigated with ?lat=...&lng=...
  const buildRouteToTarget = useCallback(
    async (target: GeographicCoordinate, label: string, passportId?: string) => {
      let usedFallbackOrigin = false;
      const resolveOrigin = (): Promise<GeographicCoordinate> =>
        new Promise(async (resolve) => {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            usedFallbackOrigin = true;
            resolve({ latitude: -1.9441, longitude: 30.0619 }); // Kigali center fallback
            return;
          }

          try {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            const live = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            };
            setUserLocation(live);
            resolve(live);
          } catch {
            usedFallbackOrigin = true;
            resolve({ latitude: -1.9441, longitude: 30.0619 });
          }
        });

      const origin = await resolveOrigin();
      const straightKm = haversineDistanceKm(origin, target);
      let coords: GeographicCoordinate[] = [origin, target];
      let distanceKm = straightKm;
      let durationMin = Math.max(1, Math.round((straightKm / 40) * 60));
      let isFallbackRoute = true;

      try {
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${target.longitude},${target.latitude}?overview=full&geometries=geojson`
        );
        if (res.ok) {
          const json = (await res.json()) as {
            routes?: Array<{
              distance?: number;
              duration?: number;
              geometry?: { coordinates?: Array<[number, number]> };
            }>;
          };
          const route = json.routes?.[0];
          if (route?.geometry?.coordinates && route.geometry.coordinates.length >= 2) {
            const parsedCoords = route.geometry.coordinates
              .map(([lon, lat]) => validateGeographicCoordinate(lat, lon))
              .filter((c): c is GeographicCoordinate => c !== null);
            if (parsedCoords.length >= 2) {
              coords = parsedCoords;
              isFallbackRoute = false;
              if (typeof route.distance === 'number') distanceKm = route.distance / 1000;
              if (typeof route.duration === 'number') durationMin = Math.max(1, Math.round(route.duration / 60));
            }
          }
        }
      } catch {
        // Fallback to straight-line route already set
      }

      setNavRoute({
        target,
        label,
        passportId,
        distanceKm,
        durationMin,
        coordinates: coords,
        isFallbackRoute,
        usedFallbackOrigin,
      });

      const midLat = (origin.latitude + target.latitude) / 2;
      const midLon = (origin.longitude + target.longitude) / 2;
      const span = Math.max(
        Math.abs(origin.latitude - target.latitude),
        Math.abs(origin.longitude - target.longitude),
        0.04
      );
      const fitZoom = Math.max(6, Math.min(13, Math.log2(360 / span) - 1.2));
      moveCamera({ latitude: midLat, longitude: midLon, zoom: fitZoom });
    },
    [moveCamera, userLocation]
  );

  useEffect(() => {
    const latNum = params.lat ? parseFloat(params.lat) : NaN;
    const lngNum = params.lng ? parseFloat(params.lng) : NaN;
    const valid = validateGeographicCoordinate(latNum, lngNum);
    if (valid) {
      void buildRouteToTarget(valid, params.label || t('Selected Outcrop'), params.passportId);
    }
  }, [params.lat, params.lng, params.label, params.passportId, buildRouteToTarget, t]);

  useEffect(() => {
    if (navRoute) return;
    if (obsQuery.isFetching || sitesQuery.isFetching || myObsQuery.isFetching) return;
    if (activePoints.length === 0) return;
    const nextCamera = cameraForObservations(activePoints);
    moveCamera(nextCamera);
    setSelectedId(null);
    setSelectedClusterItems(null);
  }, [
    layer,
    obsQuery.dataUpdatedAt,
    sitesQuery.dataUpdatedAt,
    myObsQuery.dataUpdatedAt,
    navRoute,
    activePoints,
    moveCamera,
  ]);

  useEffect(
    () => () => {
      if (searchTimer) clearTimeout(searchTimer);
    },
    [searchTimer]
  );

  useEffect(() => {
    void getMobileOfflineStats()
      .then((s) => setOfflineStats(s))
      .catch(() => {});
  }, [obsQuery.dataUpdatedAt, sitesQuery.dataUpdatedAt]);

  const handleSaveOfflinePack = async () => {
    if (savingOffline) return;
    setSavingOffline(true);
    try {
      const updated = await saveMobileOfflinePack({
        camera: cameraRef.current,
        observationsGeoJson: obsQuery.data ?? null,
        sitesGeoJson: sitesQuery.data ?? null,
      });
      setOfflineStats(updated);
      setMapNotice(
        t(`Offline pack saved (${updated.cachedObservations} posts, ${updated.cachedSites} sites).`)
      );
    } catch {
      setMapNotice(t('Could not save offline pack.'));
    } finally {
      setSavingOffline(false);
    }
  };

  const handleLocateMe = async () => {
    setLocatingGps(true);
    setMapNotice(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocatingGps(false);
        setMapNotice(t('Location permission denied.'));
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coord = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setUserLocation(coord);
      moveCamera({ ...coord, zoom: 13 });
    } catch {
      setMapNotice(t('Could not read GPS.'));
    } finally {
      setLocatingGps(false);
    }
  };

  const updateSearch = (value: string) => {
    setSearch(value);
    if (searchTimer) clearTimeout(searchTimer);
    setSearchTimer(setTimeout(() => setSubmittedSearch(value.trim().slice(0, 100)), 350));
  };

  const applySearchSuggestion = (queryText: string) => {
    setSearch(queryText);
    setSubmittedSearch(queryText.trim());
    setSearchFocused(false);
    void addRecentMapSearch(queryText).then(setRecentSearches);
  };

  const selectMarker = (id: string) => {
    setSearchFocused(false);
    setBasemapPickerOpen(false);
    const item = renderItems.find((candidate) => candidate.id === id);
    if (!item) return;
    setSelectedId(id);
    if (item.kind === 'cluster') {
      setSelectedClusterItems(item.observations);
      const zoom = Math.min(20, cameraRef.current.zoom + 2.5);
      moveCamera({ latitude: item.latitude, longitude: item.longitude, zoom });
    } else {
      setSelectedClusterItems(null);
    }
  };

  const onCameraChange = useCallback((next: MapCamera) => {
    cameraRef.current = next;
    setCamera((previous) => (Math.abs(previous.zoom - next.zoom) >= 0.35 ? next : previous));
  }, []);

  const handleOpenItem = (item: MapObservation) => {
    if (item.id.startsWith('site:')) {
      setExplorerSiteId(item.id.slice('site:'.length));
      return;
    }
    router.push(observationDetailRoute(item.id));
  };

  const mapUnavailable = androidUnavailable || mapFailed;
  const activeLoading =
    obsQuery.isLoading || sitesQuery.isLoading || (layer === 'my_map' && myObsQuery.isLoading);
  const activeQueryError =
    layer === 'my_map'
      ? myObsQuery.error
      : layer === 'sites'
        ? sitesQuery.error
        : layer === 'observations'
          ? obsQuery.error
          : obsQuery.error && sitesQuery.error
            ? obsQuery.error
            : null;

  const activeFilterCount = countActiveObservationFilters(filters);

  // Autocomplete suggestions matching web MapSearchOverlay.tsx
  const autocomplete = useMemo(() => {
    const q = search.trim().toLowerCase();
    const districts = districtsQuery.data ?? [];
    if (!q) {
      return {
        districts: districts.slice(0, 4),
        sites: [] as MapObservation[],
        recents: recentSearches.slice(0, 5),
      };
    }
    const matchedDistricts = districts
      .filter((d) => d.name.toLowerCase().includes(q))
      .slice(0, 4);
    const matchedSites = sitePoints
      .filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.subcategory.toLowerCase().includes(q) ||
          (s.district ?? '').toLowerCase().includes(q)
      )
      .slice(0, 4);
    const matchedRecents = recentSearches
      .filter((r) => r.toLowerCase().includes(q) && r.toLowerCase() !== q)
      .slice(0, 3);
    return { districts: matchedDistricts, sites: matchedSites, recents: matchedRecents };
  }, [search, districtsQuery.data, sitePoints, recentSearches]);

  return (
    <Screen scroll={false}>
      <View style={styles.container}>
        {!mapUnavailable ? (
          <ObservationMap
            key={`${layer}-${mapGeneration}`}
            items={renderItems}
            initialCamera={camera}
            cameraCommand={cameraCommand}
            basemap={basemap}
            selectedId={selectedId}
            userLocation={userLocation}
            routeCoordinates={navRoute?.coordinates ?? null}
            onSelect={selectMarker}
            onFailure={onMapFailure}
            onCameraChange={onCameraChange}
          />
        ) : (
          <View style={styles.mapFallback}>
            <Ionicons name="map-outline" size={36} color={colors.primary} />
            <Text style={styles.fallbackTitle}>{t('Map view unavailable')}</Text>
            <Pressable
              onPress={() => {
                setMapFailed(false);
                setMapGeneration((v) => v + 1);
              }}
              style={styles.retryBtn}
            >
              <Text style={styles.retryBtnText}>{t('Retry Map')}</Text>
            </Pressable>
          </View>
        )}

        {/* Floating Top Search + Menu + Filter Overlay */}
        <View
          style={[
            styles.floatingHeader,
            {
              left: layout.horizontalPadding,
              right: layout.horizontalPadding,
              maxWidth: layout.mapOverlayMaxWidth,
            },
          ]}
        >
          <View style={styles.searchBar}>
            <DrawerMenuButton compact />
            <TextInput
              value={search}
              onChangeText={updateSearch}
              onFocus={() => setSearchFocused(true)}
              onSubmitEditing={() => {
                if (search.trim()) {
                  void addRecentMapSearch(search.trim()).then(setRecentSearches);
                }
                setSearchFocused(false);
              }}
              placeholder={t(
                layer === 'sites'
                  ? 'Search sites'
                  : layer === 'my_map'
                    ? 'Search my posts'
                    : 'Search rocks, IDs, districts'
              )}
              placeholderTextColor={colors.onSurfaceFaint}
              style={styles.searchInput}
              returnKeyType="search"
            />
            {activeLoading && <ActivityIndicator size="small" color={colors.primary} />}
            {search.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Clear search')}
                onPress={() => {
                  setSearch('');
                  setSubmittedSearch('');
                }}
                style={styles.iconBtn}
              >
                <Ionicons name="close-circle" size={18} color={colors.onSurfaceFaint} />
              </Pressable>
            )}
            <View style={styles.searchDivider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Open observation filters')}
              onPress={() => {
                setSearchFocused(false);
                setFilterModalOpen(true);
              }}
              style={styles.filterBtn}
            >
              <Ionicons
                name="options-outline"
                size={20}
                color={activeFilterCount > 0 ? colors.primary : colors.onSurfaceVariant}
              />
              {activeFilterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Search Autocomplete Dropdown */}
          {searchFocused &&
            (autocomplete.recents.length > 0 ||
              autocomplete.districts.length > 0 ||
              autocomplete.sites.length > 0) && (
              <View style={styles.autocompleteCard}>
                {autocomplete.recents.length > 0 && (
                  <View style={styles.autoSection}>
                    <View style={styles.autoHeaderRow}>
                      <Text style={styles.autoSectionLabel}>{t('Recent searches')}</Text>
                      <Pressable
                        onPress={() => {
                          void clearRecentMapSearches().then(setRecentSearches);
                        }}
                      >
                        <Text style={styles.clearLink}>{t('Clear all')}</Text>
                      </Pressable>
                    </View>
                    {autocomplete.recents.map((item) => (
                      <View key={`recent-${item}`} style={styles.autoRow}>
                        <Pressable
                          style={styles.autoRowMain}
                          onPress={() => applySearchSuggestion(item)}
                        >
                          <Ionicons name="time-outline" size={16} color={colors.onSurfaceFaint} />
                          <Text style={styles.autoTitle} numberOfLines={1}>
                            {item}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            void removeRecentMapSearch(item).then(setRecentSearches);
                          }}
                          hitSlop={8}
                        >
                          <Ionicons name="close" size={16} color={colors.onSurfaceFaint} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}

                {autocomplete.districts.length > 0 && (
                  <View style={styles.autoSection}>
                    <Text style={styles.autoSectionLabel}>
                      {t(search.trim() ? 'Rwanda Districts' : 'Popular Districts')}
                    </Text>
                    {autocomplete.districts.map((d) => (
                      <Pressable
                        key={`dist-${d.name}`}
                        style={styles.autoRow}
                        onPress={() => {
                          setFilters((prev) => ({ ...prev, district: d.name }));
                          setSearchFocused(false);
                          void addRecentMapSearch(d.name).then(setRecentSearches);
                        }}
                      >
                        <Ionicons name="location-outline" size={16} color={colors.primary} />
                        <Text style={styles.autoTitle}>{t(`${d.name} District`)}</Text>
                        <Text style={styles.autoMeta}>{t(`${d.observation_count} obs`)}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {autocomplete.sites.length > 0 && (
                  <View style={styles.autoSection}>
                    <Text style={styles.autoSectionLabel}>{t('Geoscience Sites')}</Text>
                    {autocomplete.sites.map((site) => (
                      <Pressable
                        key={site.id}
                        style={styles.autoRow}
                        onPress={() => {
                          setSearchFocused(false);
                          moveCamera({
                            latitude: site.latitude,
                            longitude: site.longitude,
                            zoom: 12,
                          });
                          setSelectedId(site.id);
                        }}
                      >
                        <Ionicons name="flag-outline" size={16} color={colors.success} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.autoTitle} numberOfLines={1}>
                            {site.title}
                          </Text>
                          <Text style={styles.autoSub}>
                            {t(site.subcategory)} · {site.district ?? 'Rwanda'}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}

          {/* Layer & Overlay Strip */}
          {!searchFocused && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.layerStrip}
            >
              <LayerChip
                label={t('All')}
                active={layer === 'explore'}
                onPress={() => setLayer('explore')}
                colors={colors}
              />
              <LayerChip
                label={t('Passports')}
                active={layer === 'observations'}
                onPress={() => setLayer('observations')}
                colors={colors}
              />
              <LayerChip
                label={t('Sites')}
                active={layer === 'sites'}
                onPress={() => setLayer('sites')}
                colors={colors}
              />
              <LayerChip
                label={t('My Map')}
                active={layer === 'my_map'}
                onPress={() => setLayer('my_map')}
                colors={colors}
              />
              {auth.user && layer === 'explore' && (
                <LayerChip
                  label={t(showMyPostsOverlay ? '✓ Mine' : 'Mine')}
                  active={showMyPostsOverlay}
                  onPress={() => setShowMyPostsOverlay((v) => !v)}
                  colors={colors}
                />
              )}
              <LayerChip
                label={t('Site List')}
                active={false}
                onPress={() => router.push('/(tabs)/sites')}
                colors={colors}
              />
            </ScrollView>
          )}

          {(mapNotice || activeQueryError) && !searchFocused && (
            <View style={styles.noticeBanner}>
              <Ionicons
                name={activeQueryError ? 'alert-circle-outline' : 'information-circle-outline'}
                size={16}
                color={activeQueryError ? colors.danger : colors.primary}
              />
              <Text style={styles.noticeText} numberOfLines={3}>
                {activeQueryError ? userFacingError(activeQueryError) : mapNotice}
              </Text>
              {activeQueryError ? (
                <Pressable
                  onPress={() => {
                    void obsQuery.refetch();
                    void sitesQuery.refetch();
                    if (layer === 'my_map') void myObsQuery.refetch();
                  }}
                >
                  <Text style={styles.clearLink}>{t('Retry')}</Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => setMapNotice(null)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={colors.onSurfaceVariant} />
                </Pressable>
              )}
            </View>
          )}
        </View>

        {/* Basemap Style Popover */}
        {basemapPickerOpen && (
          <View style={styles.basemapMenu}>
            <Text style={styles.basemapMenuTitle}>{t('Map Type')}</Text>
            {BASEMAP_OPTIONS.map((opt) => {
              const active = basemap === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    setBasemap(opt.value);
                    setBasemapPickerOpen(false);
                  }}
                  style={[styles.basemapOption, active && styles.basemapOptionActive]}
                >
                  <Text
                    style={[
                      styles.basemapOptionText,
                      active && styles.basemapOptionTextActive,
                    ]}
                  >
                    {t(opt.label)}
                  </Text>
                  {active && <Ionicons name="checkmark" size={16} color={colors.primary} />}
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Right Floating Map Controls */}
        <View style={styles.sideControls}>
          <ControlButton
            icon="layers-outline"
            active={basemapPickerOpen}
            onPress={() => setBasemapPickerOpen((v) => !v)}
            colors={colors}
          />
          <ControlButton
            icon="locate-outline"
            loading={locatingGps}
            active={Boolean(userLocation)}
            onPress={handleLocateMe}
            colors={colors}
          />
          <ControlButton
            icon="scan-outline"
            onPress={() =>
              moveCamera(
                activePoints.length > 0
                  ? cameraForObservations(activePoints)
                  : { latitude: -1.9403, longitude: 29.8739, zoom: 7.4 }
              )
            }
            colors={colors}
          />
          <ControlButton
            icon={
              (offlineStats?.cachedTiles ?? 0) > 0 ? 'cloud-done' : 'cloud-download-outline'
            }
            onPress={() => void handleSaveOfflinePack()}
            loading={savingOffline}
            colors={colors}
          />
          <View style={styles.zoomStack}>
            <ControlButton
              icon="add"
              onPress={() =>
                moveCamera({
                  ...cameraRef.current,
                  zoom: Math.min(20, cameraRef.current.zoom + 1),
                })
              }
              noMargin
              noBorder
              colors={colors}
            />
            <View style={styles.zoomDivider} />
            <ControlButton
              icon="remove"
              onPress={() =>
                moveCamera({
                  ...cameraRef.current,
                  zoom: Math.max(2.5, cameraRef.current.zoom - 1),
                })
              }
              noMargin
              noBorder
              colors={colors}
            />
          </View>
        </View>

        {/* Active Navigation Route Card */}
        {navRoute && (
          <View
            style={[
              styles.routeCard,
              {
                left: layout.horizontalPadding,
                right: layout.horizontalPadding,
                maxWidth: layout.mapOverlayMaxWidth,
              },
            ]}
          >
            <View style={styles.routeCardInfo}>
              <Ionicons name="navigate-circle" size={26} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.routeTitle}>
                  {navRoute.label}
                </Text>
                <Text style={styles.routeMeta}>
                  {navRoute.distanceKm.toFixed(1)} km · ~{navRoute.durationMin} min{' '}
                  {t(navRoute.isFallbackRoute ? '(direct)' : 'drive')}
                  {navRoute.usedFallbackOrigin ? ` · ${t('from Kigali')}` : ''}
                </Text>
              </View>
              {navRoute.passportId && (
                <Pressable
                  onPress={() => router.push(observationDetailRoute(navRoute.passportId!))}
                  style={styles.routeOpenBtn}
                >
                  <Text style={styles.routeOpenText}>{t('Open')}</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Clear route')}
                onPress={() => setNavRoute(null)}
                style={styles.iconBtn}
              >
                <Ionicons name="close" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
          </View>
        )}

        {/* Bottom Status Bar */}
        <View
          style={[
            styles.bottomBar,
            {
              left: layout.horizontalPadding,
              right: layout.horizontalPadding,
              maxWidth: layout.mapOverlayMaxWidth,
            },
          ]}
        >
          <Text style={styles.countText}>
            {t(`${activePoints.length} ${activePoints.length === 1 ? 'record' : 'records'}`)}
          </Text>
          <View style={styles.privacyBadge}>
            <Ionicons name="shield-checkmark" size={12} color={colors.success} />
            <Text style={styles.privacyText}>{t('Privacy active')}</Text>
          </View>
        </View>

        {/* Selection Previews */}
        {selectedClusterItems ? (
          <View
            style={[
              styles.previewPanel,
              {
                left: layout.horizontalPadding,
                right: layout.horizontalPadding,
                maxWidth: layout.mapOverlayMaxWidth,
              },
            ]}
          >
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>
                {t(`${selectedClusterItems.length} at this spot`)}
              </Text>
              <Pressable onPress={() => setSelectedClusterItems(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
            <FlatList
              horizontal
              data={selectedClusterItems}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => (
                <Pressable onPress={() => handleOpenItem(item)} style={styles.clusterCard}>
                  <Text numberOfLines={1} style={styles.clusterCardTitle}>
                    {item.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.clusterCardMeta}>
                    {t(item.isSite ? `Site · ${item.subcategory}` : item.category.replace(/_/g, ' '))}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        ) : selected ? (
          <ObservationPreview
            observation={selected}
            onClose={() => setSelectedId(null)}
            onDetails={() => handleOpenItem(selected)}
            onNavigate={() =>
              void buildRouteToTarget(
                { latitude: selected.latitude, longitude: selected.longitude },
                selected.title,
                selected.isSite ? undefined : selected.id
              )
            }
            colors={colors}
            styles={styles}
            overlayStyle={{
              left: layout.horizontalPadding,
              right: layout.horizontalPadding,
              maxWidth: layout.mapOverlayMaxWidth,
            }}
          />
        ) : null}

        {layer === 'my_map' && !auth.user && (
          <View style={[styles.blocker, { maxWidth: 360, alignSelf: 'center' }]}>
            <Ionicons name="lock-closed" size={30} color={colors.primary} />
            <Text style={styles.blockerTitle}>{t('Sign in required')}</Text>
            <Text style={styles.blockerText}>{t('Sign in to view your personal map.')}</Text>
            <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>{t('Sign in')}</Text>
            </Pressable>
          </View>
        )}

        <ObservationFilterModal
          visible={filterModalOpen}
          onClose={() => setFilterModalOpen(false)}
          filters={filters}
          onChange={setFilters}
          onReset={() => setFilters({})}
          districts={districtsQuery.data ?? []}
          categories={categoriesQuery.data ?? []}
        />

        <SiteExplorerModal
          visible={Boolean(explorerSiteId)}
          siteId={explorerSiteId}
          onClose={() => setExplorerSiteId(null)}
        />
      </View>
    </Screen>
  );
}

function LayerChip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: Palette;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={{
        minHeight: 38,
        paddingHorizontal: 14,
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.outlineSoft,
        backgroundColor: active ? colors.primary : colors.surface,
        justifyContent: 'center',
        elevation: 2,
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: active ? colors.onPrimary : colors.onSurfaceVariant,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ControlButton({
  icon,
  onPress,
  loading,
  active,
  noMargin,
  noBorder,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  loading?: boolean;
  active?: boolean;
  noMargin?: boolean;
  noBorder?: boolean;
  colors: Palette;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 44,
        height: 44,
        borderRadius: noBorder ? 0 : radius.m,
        borderWidth: noBorder ? 0 : 1,
        borderColor: active ? colors.primary : colors.outlineSoft,
        backgroundColor: active ? colors.primaryContainer : colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: noMargin ? 0 : 8,
        elevation: noBorder ? 0 : 3,
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons
          name={icon}
          size={21}
          color={active ? colors.onPrimaryContainer : colors.onSurfaceVariant}
        />
      )}
    </Pressable>
  );
}

function ObservationPreview({
  observation,
  onClose,
  onDetails,
  onNavigate,
  colors,
  styles,
  overlayStyle,
}: {
  observation: MapObservation;
  onClose: () => void;
  onDetails: () => void;
  onNavigate: () => void;
  colors: Palette;
  styles: ReturnType<typeof createStyles>;
  overlayStyle?: { left: number; right: number; maxWidth?: number };
}) {
  const { t } = useAppLanguage();
  return (
    <View style={[styles.previewPanel, overlayStyle]}>
      <View style={styles.previewHeader}>
        {observation.imageUrl ? (
          <View style={styles.previewThumb}>
            <ObservationImage uri={observation.imageUrl} label={observation.title} />
          </View>
        ) : null}
        <View style={styles.previewInfo}>
          <Text style={styles.previewEyebrow}>
            {observation.isSite
              ? t(`Site · ${observation.subcategory}`)
              : `${observation.id} · ${t(observation.category.replace(/_/g, ' '))}`}
          </Text>
          <Text style={styles.previewTitle} numberOfLines={2}>
            {observation.title}
          </Text>
          <Text style={styles.previewMeta} numberOfLines={1}>
            {observation.district ?? 'Rwanda'}
            {observation.evidenceState
              ? ` · ${t(observation.evidenceState.replace(/_/g, ' '))}`
              : ''}
            {typeof observation.observationCount === 'number'
              ? ` · ${t(`${observation.observationCount} obs`)}`
              : ''}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      <View style={styles.previewActionRow}>
        <Pressable onPress={onNavigate} style={styles.secondaryActionBtn}>
          <Ionicons name="navigate-outline" size={16} color={colors.primary} />
          <Text style={styles.secondaryActionText}>{t('Route')}</Text>
        </Pressable>
        <Pressable onPress={onDetails} style={[styles.primaryBtn, { flex: 1 }]}>
          <Text style={styles.primaryBtnText}>
            {t(observation.isSite ? 'Open Site' : 'Passport')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.canvas },
    mapFallback: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.surfaceContainerLow,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    fallbackTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.onSurface,
    },
    retryBtn: {
      paddingHorizontal: 16,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      justifyContent: 'center',
    },
    retryBtnText: {
      color: colors.onPrimary,
      fontWeight: '700',
      fontSize: 13,
    },
    floatingHeader: {
      position: 'absolute',
      top: 12,
      left: 12,
      right: 12,
      gap: 8,
      zIndex: 20,
    },
    searchBar: {
      height: 48,
      backgroundColor: colors.surface,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      elevation: 4,
      gap: 6,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.onSurface,
      paddingVertical: 0,
    },
    searchDivider: {
      width: 1,
      height: 22,
      backgroundColor: colors.outlineSoft,
    },
    filterBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    filterBadgeText: {
      color: colors.onPrimary,
      fontSize: 10,
      fontWeight: '800',
    },
    iconBtn: { padding: 4 },
    autocompleteCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      padding: 12,
      gap: 12,
      elevation: 6,
    },
    autoSection: { gap: 4 },
    autoHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    autoSectionLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.onSurfaceFaint,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      paddingHorizontal: 4,
    },
    clearLink: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    autoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderRadius: radius.s,
    },
    autoRowMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    autoTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.onSurface,
    },
    autoSub: {
      fontSize: 11,
      color: colors.onSurfaceFaint,
    },
    autoMeta: {
      fontSize: 11,
      color: colors.onSurfaceFaint,
      fontWeight: '600',
    },
    layerStrip: { gap: 8, paddingRight: 12 },
    noticeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.m,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      elevation: 4,
    },
    noticeText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
      color: colors.onSurface,
    },
    basemapMenu: {
      position: 'absolute',
      top: 120,
      right: 64,
      width: 152,
      backgroundColor: colors.surface,
      borderRadius: radius.m,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      padding: 8,
      gap: 2,
      zIndex: 25,
      elevation: 6,
    },
    basemapMenuTitle: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.onSurfaceFaint,
      textTransform: 'uppercase',
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    basemapOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: radius.s,
    },
    basemapOptionActive: {
      backgroundColor: colors.primaryContainer,
    },
    basemapOptionText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.onSurface,
    },
    basemapOptionTextActive: {
      color: colors.onPrimaryContainer,
      fontWeight: '700',
    },
    sideControls: {
      position: 'absolute',
      top: 116,
      right: 12,
      zIndex: 15,
    },
    zoomStack: {
      borderRadius: radius.m,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      backgroundColor: colors.surface,
      elevation: 3,
      overflow: 'hidden',
    },
    zoomDivider: {
      height: 1,
      backgroundColor: colors.outlineSoft,
      marginHorizontal: 8,
    },
    routeCard: {
      position: 'absolute',
      bottom: 52,
      left: 12,
      right: 12,
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      borderWidth: 1,
      borderColor: colors.primary,
      padding: 12,
      elevation: 5,
      zIndex: 16,
    },
    routeCardInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    routeTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.onSurface,
    },
    routeMeta: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
      marginTop: 1,
    },
    routeOpenBtn: {
      paddingHorizontal: 12,
      height: 32,
      borderRadius: radius.full,
      backgroundColor: colors.primaryContainer,
      justifyContent: 'center',
    },
    routeOpenText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.onPrimaryContainer,
    },
    bottomBar: {
      position: 'absolute',
      bottom: 10,
      left: 12,
      right: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: colors.surface,
      borderRadius: radius.s,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    countText: { fontSize: 12, color: colors.onSurfaceVariant, fontWeight: '600' },
    privacyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    privacyText: { fontSize: 11, color: colors.success, fontWeight: '700' },
    previewPanel: {
      position: 'absolute',
      bottom: 52,
      left: 12,
      right: 12,
      backgroundColor: colors.surface,
      borderRadius: radius.l,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      elevation: 6,
      gap: 12,
      zIndex: 20,
    },
    previewHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    previewThumb: {
      width: 64,
      height: 64,
      borderRadius: radius.m,
      overflow: 'hidden',
      backgroundColor: colors.surfaceContainerLow,
    },
    previewInfo: { flex: 1, gap: 2 },
    previewEyebrow: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
    },
    previewTitle: { fontSize: 16, fontWeight: '700', color: colors.onSurface },
    previewMeta: { fontSize: 12, color: colors.onSurfaceVariant },
    previewActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    secondaryActionBtn: {
      height: 44,
      paddingHorizontal: 16,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.outline,
      backgroundColor: colors.surfaceContainerLow,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    secondaryActionText: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 13,
    },
    primaryBtn: {
      height: 44,
      paddingHorizontal: 18,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      color: colors.onPrimary,
      fontWeight: '700',
      fontSize: 14,
    },
    clusterCard: {
      width: 156,
      padding: 12,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.m,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    clusterCardTitle: { fontSize: 13, fontWeight: '700', color: colors.onSurface },
    clusterCardMeta: { fontSize: 11, color: colors.onSurfaceVariant, marginTop: 2 },
    blocker: {
      position: 'absolute',
      top: '28%',
      left: 32,
      right: 32,
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.lg,
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
      elevation: 8,
      zIndex: 25,
    },
    blockerTitle: { fontSize: 18, fontWeight: '800', color: colors.onSurface },
    blockerText: {
      textAlign: 'center',
      color: colors.onSurfaceVariant,
      fontSize: 14,
      lineHeight: 20,
    },
  });
}
