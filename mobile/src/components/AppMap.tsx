import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';
import MapView, { Marker, UrlTile, type Region } from 'react-native-maps';
import { RefreshCw } from 'lucide-react-native';
import { MAP_CONFIG, MAP_TILES, type MapStyle } from '../lib/theme';

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  kind: 'observation' | 'site';
  selected?: boolean;
}

interface AppMapProps {
  markers: MapMarker[];
  mapStyle: MapStyle;
  style?: StyleProp<ViewStyle>;
  initialRegion?: Region;
  region?: Region;
  showsUserLocation?: boolean;
  userLocation?: { latitude: number; longitude: number } | null;
  onSelectMarker?: (id: string) => void;
  onMapPress?: () => void;
  onLongPress?: (coords: { latitude: number; longitude: number }) => void;
  onRegionChangeComplete?: (region: Region) => void;
  mapRef?: React.MutableRefObject<MapView | null>;
  children?: React.ReactNode;
}

/* -------------------------------------------------------------------------- */
/* Native (iOS/Android): react-native-maps with raster UrlTile basemaps.      */
/* -------------------------------------------------------------------------- */

function MarkerDot({ marker }: { marker: MapMarker }) {
  // Google-Maps-style teardrop pin, like the web map: a rotated square with
  // three rounded corners, filled with the category/site colour, white outline
  // and a white "eye" that stays legible on any basemap.
  const head = 30;
  return (
    <View style={styles.markerWrap}>
      {marker.selected ? (
        <View
          style={[
            styles.markerHalo,
            { width: head + 18, height: head + 18, borderRadius: (head + 18) / 2 },
          ]}
        />
      ) : null}
      <View
        style={{
          width: head,
          height: head,
          backgroundColor: marker.color,
          borderWidth: 3,
          borderColor: '#ffffff',
          borderTopLeftRadius: head / 2,
          borderTopRightRadius: head / 2,
          borderBottomRightRadius: head / 2,
          borderBottomLeftRadius: 0,
          transform: [{ rotate: '-45deg' }],
        }}
      >
        <View
          style={{
            position: 'absolute',
            alignSelf: 'center',
            top: head / 2 - 6.5,
            width: 13,
            height: 13,
            borderRadius: 6.5,
            backgroundColor: 'rgba(255,255,255,0.92)',
          }}
        />
      </View>
    </View>
  );
}

function NativeMap({
  markers,
  mapStyle,
  style,
  initialRegion,
  region,
  showsUserLocation,
  onSelectMarker,
  onMapPress,
  onLongPress,
  onRegionChangeComplete,
  mapRef,
  children,
}: AppMapProps) {
  const tile = MAP_TILES[mapStyle];
  const insets = useSafeAreaInsets();
  // Tile layers are plain raster URL tiles, so a failed tile loads as a blank
  // square with no error event to catch. Connectivity is the practical signal:
  // when the device is offline, tiles fail — show a tap-to-retry control in
  // the map corner and refetch (by remounting the tile layer) when connectivity
  // returns or the user taps.
  const netInfo = useNetInfo();
  const online = netInfo.isConnected !== false;
  const [tileEpoch, setTileEpoch] = useState(0);
  const prevOnline = useRef(online);
  useEffect(() => {
    if (!prevOnline.current && online) setTileEpoch((epoch) => epoch + 1);
    prevOnline.current = online;
  }, [online]);
  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={(instance) => {
          if (mapRef) mapRef.current = instance ?? null;
        }}
        style={StyleSheet.absoluteFill}
        // Hide the platform basemap (Google on Android / Apple on iOS) so the
        // only visible tiles are the same raster basemaps the web build uses
        // (CARTO light, OpenStreetMap, Esri imagery/topo) — no Google map or
        // watermark bleeding through underneath.
        mapType="none"
        initialRegion={initialRegion ?? region}
        onRegionChangeComplete={onRegionChangeComplete}
        onPress={onMapPress}
        onLongPress={(event) => {
          onLongPress?.(event.nativeEvent.coordinate);
        }}
        showsUserLocation={showsUserLocation}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        legalLabelInsets={{ bottom: 8, left: 8, top: 0, right: 0 }}
      >
        <UrlTile key={tileEpoch} urlTemplate={tile.url} maximumZ={19} tileSize={256} zIndex={-1} />
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
            anchor={{ x: 0.5, y: 1 }}
            onPress={() => onSelectMarker?.(marker.id)}
            tracksViewChanges={Platform.OS === 'ios' && Boolean(marker.selected)}
          >
            <MarkerDot marker={marker} />
          </Marker>
        ))}
      </MapView>
      {!online ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading map tiles"
          onPress={() => setTileEpoch((epoch) => epoch + 1)}
          style={[styles.tileRetry, { top: insets.top + 12, right: 12 }]}
        >
          <RefreshCw size={13} color="#ffffff" />
          <Text style={styles.tileRetryText}>Retry map tiles</Text>
        </Pressable>
      ) : null}
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Web: react-native-maps has no web build, so the same raster basemaps and   */
/* evidence-coloured markers are rendered with Leaflet, loaded from a CDN.    */
/* -------------------------------------------------------------------------- */

type Leaflet = any;

declare global {
  // eslint-disable-next-line no-var
  var __leafletLoading: Promise<Leaflet> | null;
}

function loadLeaflet(): Promise<Leaflet> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (globalThis.__leafletLoading) return globalThis.__leafletLoading;

  globalThis.__leafletLoading = new Promise<Leaflet>((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      document.head.appendChild(script);
    }
    const started = Date.now();
    const check = () => {
      const L = (window as any).L;
      if (L) resolve(L);
      else if (Date.now() - started > 15000) reject(new Error('Leaflet failed to load'));
      else setTimeout(check, 100);
    };
    check();
  });
  return globalThis.__leafletLoading;
}

function markerIcon(L: Leaflet, marker: MapMarker): any {
  const head = 30;
  const html =
    `<div style="position:relative;width:${head}px;height:${head + 12}px">` +
    (marker.selected
      ? `<div style="position:absolute;left:-9px;top:-3px;width:${head + 18}px;height:${head + 18}px;border-radius:50%;background:rgba(11,87,208,0.18)"></div>`
      : '') +
    `<div style="position:absolute;left:0;top:0;width:${head}px;height:${head}px;background:${marker.color};border:3px solid #ffffff;border-radius:50% 50% 50% 0;transform:rotate(-45deg)"></div>` +
    `<div style="position:absolute;left:${head / 2 - 6.5}px;top:${head / 2 - 6.5}px;width:13px;height:13px;border-radius:50%;background:rgba(255,255,255,0.92)"></div>` +
    `</div>`;
  return L.divIcon({
    className: 'earth-talk-marker',
    html,
    iconSize: [head, head + 12],
    iconAnchor: [head / 2, head + 12],
  });
}

function zoomForRegion(region: Region): number {
  return Math.max(2, Math.min(19, Math.log2(360 / Math.max(region.longitudeDelta, 0.0001))));
}

function WebMap({
  markers,
  mapStyle,
  style,
  initialRegion,
  onSelectMarker,
  onMapPress,
  onLongPress,
  mapRef,
  children,
}: AppMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const handlersRef = useRef({ onSelectMarker, onMapPress, onLongPress });
  handlersRef.current = { onSelectMarker, onMapPress, onLongPress };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void loadLeaflet()
      .then(() => setReady(true))
      .catch(() => setFailed(true));
  }, []);

  // Create the map once Leaflet is available.
  useEffect(() => {
    if (!ready || !containerRef.current || leafletMapRef.current) return;
    const L = (window as any).L;
    const center = initialRegion ?? DEFAULT_REGION;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      center: [center.latitude, center.longitude],
      zoom: zoomForRegion(center),
    });
    const handlers = handlersRef.current;
    map.on('click', () => handlers.onMapPress?.());
    map.on('contextmenu', (event: any) => {
      handlers.onLongPress?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    });
    leafletMapRef.current = map;

    // The native code animates via mapRef.current.animateToRegion; expose the same surface.
    if (mapRef) {
      (mapRef as unknown as { current: unknown }).current = {
        animateToRegion: (region: Region, durationMs?: number) => {
          map.flyTo([region.latitude, region.longitude], zoomForRegion(region), {
            duration: Math.max(0.3, (durationMs ?? 600) / 1000),
          });
        },
      } as unknown as MapView;
    }
    return () => {
      leafletMapRef.current = null;
      tileLayerRef.current = null;
      markerLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Swap basemap when the style changes.
  useEffect(() => {
    if (!ready || !leafletMapRef.current) return;
    const L = (window as any).L;
    if (tileLayerRef.current) {
      leafletMapRef.current.removeLayer(tileLayerRef.current);
    }
    tileLayerRef.current = L.tileLayer(MAP_TILES[mapStyle].url, { maxZoom: 19 });
    tileLayerRef.current.addTo(leafletMapRef.current);
    tileLayerRef.current.bringToBack();
  }, [ready, mapStyle]);

  // Sync markers.
  useEffect(() => {
    if (!ready || !leafletMapRef.current) return;
    const L = (window as any).L;
    if (!markerLayerRef.current) {
      markerLayerRef.current = L.layerGroup().addTo(leafletMapRef.current);
    }
    const layer = markerLayerRef.current;
    layer.clearLayers();
    for (const marker of markers) {
      const leafletMarker = L.marker([marker.latitude, marker.longitude], {
        icon: markerIcon(L, marker),
        keyboard: false,
      });
      leafletMarker.on('click', (event: any) => {
        event.originalEvent?.stopPropagation?.();
        handlersRef.current.onSelectMarker?.(marker.id);
      });
      layer.addLayer(leafletMarker);
    }
  }, [ready, markers]);

  return (
    <View style={[styles.container, style]}>
      {failed ? (
        <View style={[StyleSheet.absoluteFill, styles.fallback]}>
          <ActivityIndicator color="#0b57d0" />
        </View>
      ) : (
        <div
          ref={containerRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#e8ecef' }}
        />
      )}
      {children}
    </View>
  );
}

/** The shared raster-tile map (CARTO light / Esri imagery / Esri topo), with evidence-coloured markers. */
export function AppMap(props: AppMapProps) {
  if (Platform.OS === 'web') {
    return <WebMap {...props} />;
  }
  return <NativeMap {...props} />;
}

export const DEFAULT_REGION: Region = {
  latitude: MAP_CONFIG.center.latitude,
  longitude: MAP_CONFIG.center.longitude,
  latitudeDelta: MAP_CONFIG.zoomLatitudeDelta,
  longitudeDelta: MAP_CONFIG.zoomLongitudeDelta,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e8ecef',
    overflow: 'hidden',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerHalo: {
    position: 'absolute',
    backgroundColor: 'rgba(11, 87, 208, 0.18)',
  },
  tileRetry: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 30,
    backgroundColor: 'rgba(32,33,36,0.94)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  tileRetryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
});
