import { requireOptionalNativeModule } from 'expo-modules-core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import { useAppLanguage } from '../../utils/language';
import type { ObservationMapProps } from './geojson';
import { ObservationMap as TileObservationMap } from './ObservationMap.web';

type ExpoMapsModule = typeof import('expo-maps');

/**
 * expo-maps is a native module and is not bundled inside Expo Go. Loading it
 * unconditionally throws during route discovery and takes every route down
 * with it, so the module is resolved only when the native side actually
 * exists. When it does not, the cross-platform tile map is used instead.
 */
const expoMaps: ExpoMapsModule | null = (() => {
  try {
    return requireOptionalNativeModule('ExpoMaps') ? require('expo-maps') : null;
  } catch {
    return null;
  }
})();

export function ObservationMap(props: ObservationMapProps) {
  if (!expoMaps) {
    return <TileObservationMap {...props} />;
  }
  return <NativeObservationMap {...props} />;
}

function NativeObservationMap({
  items,
  initialCamera,
  cameraCommand,
  basemap = 'map',
  userLocation,
  routeCoordinates,
  onSelect,
  onFailure,
  onCameraChange,
}: ObservationMapProps) {
  const maps = expoMaps as ExpoMapsModule;
  const { AppleMaps, GoogleMaps } = maps;
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const appleRef = useRef<import('expo-maps').AppleMaps.MapView>(null);
  const googleRef = useRef<import('expo-maps').GoogleMaps.MapView>(null);
  const [ready, setReady] = useState(false);

  const initial = {
    coordinates: { latitude: initialCamera.latitude, longitude: initialCamera.longitude },
    zoom: initialCamera.zoom,
  };

  useEffect(() => {
    if (!cameraCommand) return;
    const camera = {
      coordinates: {
        latitude: cameraCommand.camera.latitude,
        longitude: cameraCommand.camera.longitude,
      },
      zoom: cameraCommand.camera.zoom,
    };
    if (Platform.OS === 'ios') appleRef.current?.setCameraPosition(camera);
    else googleRef.current?.setCameraPosition({ ...camera, duration: 350 });
  }, [cameraCommand]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ready) onFailure();
    }, 15_000);
    return () => clearTimeout(timer);
  }, [ready, onFailure]);

  const onMapReady = () => setReady(true);

  const appleMapType =
    basemap === 'satellite'
      ? AppleMaps.MapType.IMAGERY
      : basemap === 'terrain'
        ? AppleMaps.MapType.HYBRID
        : AppleMaps.MapType.STANDARD;

  const googleMapType =
    basemap === 'satellite'
      ? GoogleMaps.MapType.SATELLITE
      : basemap === 'terrain'
        ? GoogleMaps.MapType.TERRAIN
        : GoogleMaps.MapType.NORMAL;

  const polylines =
    routeCoordinates && routeCoordinates.length >= 2
      ? [
          {
            id: 'active-route',
            coordinates: routeCoordinates,
            color: colors.primary,
            width: 5,
          },
        ]
      : [];

  if (Platform.OS === 'ios') {
    const markers = [
      ...items.map((item) => ({
        id: item.id,
        coordinates: { latitude: item.latitude, longitude: item.longitude },
        systemImage:
          item.kind === 'cluster'
            ? 'square.grid.2x2.fill'
            : item.observation.isSite
              ? 'flag.circle.fill'
              : 'mappin.circle.fill',
        title:
          item.kind === 'cluster'
            ? t(`${item.count} observations`)
            : t(item.observation.title),
        tintColor:
          item.kind === 'cluster'
            ? colors.primary
            : item.observation.isSite
              ? colors.success
              : item.observation.isPrivateOwner
                ? colors.warning
                : colors.earth,
      })),
      ...(userLocation
        ? [
            {
              id: '__user_gps__',
              coordinates: userLocation,
              systemImage: 'location.circle.fill',
              title: t('Your location'),
              tintColor: colors.primary,
            },
          ]
        : []),
    ];

    return (
      <View style={styles.fill}>
        <AppleMaps.View
          ref={appleRef}
          style={styles.fill}
          cameraPosition={initial}
          properties={{ mapType: appleMapType }}
          markers={markers}
          polylines={polylines}
          onMarkerClick={(event) => {
            onMapReady();
            if (event.id && event.id !== '__user_gps__') onSelect(event.id);
          }}
          onCameraMove={(event) => {
            onMapReady();
            const latitude = event.coordinates.latitude;
            const longitude = event.coordinates.longitude;
            if (typeof latitude === 'number' && typeof longitude === 'number') {
              onCameraChange?.({ latitude, longitude, zoom: event.zoom });
            }
          }}
          onMapClick={onMapReady}
        />
        {!ready ? (
          <View pointerEvents="none" style={styles.status}>
            <Text style={styles.statusText}>{t('Opening map…')}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (Platform.OS === 'android') {
    const markers = [
      ...items.map((item) => ({
        id: item.id,
        coordinates: { latitude: item.latitude, longitude: item.longitude },
        title:
          item.kind === 'cluster'
            ? t(`${item.count} observations`)
            : t(item.observation.title),
        snippet:
          item.kind === 'cluster'
            ? t('Tap to inspect records')
            : item.observation.isSite
              ? t(`Geoscience Site · ${item.observation.subcategory}`)
              : t(item.observation.category),
        showCallout: true,
      })),
      ...(userLocation
        ? [
            {
              id: '__user_gps__',
              coordinates: userLocation,
              title: t('Your location'),
              snippet: t('Live GPS'),
              showCallout: false,
            },
          ]
        : []),
    ];

    return (
      <View style={styles.fill}>
        <GoogleMaps.View
          ref={googleRef}
          style={styles.fill}
          cameraPosition={initial}
          markers={markers}
          polylines={polylines}
          onMapLoaded={onMapReady}
          onCameraMove={(event) => {
            onMapReady();
            const latitude = event.coordinates.latitude;
            const longitude = event.coordinates.longitude;
            if (typeof latitude === 'number' && typeof longitude === 'number') {
              onCameraChange?.({ latitude, longitude, zoom: event.zoom });
            }
          }}
          onMapClick={onMapReady}
          onMarkerClick={(event) => {
            onMapReady();
            if (event.id && event.id !== '__user_gps__') onSelect(event.id);
          }}
          properties={{
            mapType: googleMapType,
            minZoomPreference: 2.5,
            maxZoomPreference: 20,
          }}
          uiSettings={{
            compassEnabled: true,
            zoomControlsEnabled: false,
            myLocationButtonEnabled: false,
            zoomGesturesEnabled: true,
            scrollGesturesEnabled: true,
          }}
        />
        {!ready ? (
          <View pointerEvents="none" style={styles.status}>
            <Text style={styles.statusText}>{t('Opening map…')}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.fallback}>
      <Text style={styles.statusText}>{t('Native maps are available on iOS and Android builds.')}</Text>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    fill: { ...StyleSheet.absoluteFillObject },
    status: {
      position: 'absolute',
      top: 12,
      alignSelf: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.outlineSoft,
    },
    statusText: { color: colors.ink, fontWeight: '600' },
    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.canvas,
    },
  });
}
