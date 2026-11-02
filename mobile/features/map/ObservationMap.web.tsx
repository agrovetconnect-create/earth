<<<<<<< HEAD
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { radius, type Palette } from '../../theme/theme';
import { useAppTheme } from '../../theme/theme-provider';
import { useAppLanguage } from '../../utils/language';
import {
  inverseMercatorLatitude,
  mercatorY,
  type BasemapStyle,
  type GeographicCoordinate,
  type MapCamera,
  type ObservationMapProps,
} from './geojson';

function tileUrl(style: BasemapStyle, z: number, x: number, y: number): string {
  const safeX = ((x % (1 << z)) + (1 << z)) % (1 << z);
  if (style === 'satellite') {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${safeX}`;
  }
  if (style === 'terrain') {
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${safeX}`;
  }
  if (style === 'streets') {
    return `https://tile.openstreetmap.org/${z}/${safeX}/${y}.png`;
  }
  return `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${safeX}/${y}.png`;
}

function projectPoint(
  coord: GeographicCoordinate,
  center: MapCamera,
  width: number,
  height: number
): { x: number; y: number } {
  const worldSize = 256 * Math.pow(2, center.zoom);
  const cx = ((center.longitude + 180) / 360) * worldSize;
  const cy = mercatorY(center.latitude) * worldSize;
  const px = ((coord.longitude + 180) / 360) * worldSize;
  const py = mercatorY(coord.latitude) * worldSize;
  return {
    x: width / 2 + (px - cx),
    y: height / 2 + (py - cy),
  };
}

export function ObservationMap({
  items,
  initialCamera,
  cameraCommand,
  basemap = 'map',
  selectedId,
  userLocation,
  routeCoordinates,
  onSelect,
  onCameraChange,
}: ObservationMapProps) {
  const { colors } = useAppTheme();
  const { t } = useAppLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [viewport, setViewport] = useState({ width: 420, height: 680 });
  const [camera, setCamera] = useState<MapCamera>(initialCamera);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  useEffect(() => {
    if (!cameraCommand) return;
    setCamera(cameraCommand.camera);
  }, [cameraCommand]);

  const onLayout = (ev: LayoutChangeEvent) => {
    const { width, height } = ev.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setViewport({ width, height });
    }
  };

  const dragStartRef = useRef<MapCamera>(camera);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
        onPanResponderGrant: () => {
          dragStartRef.current = cameraRef.current;
        },
        onPanResponderMove: (_, gesture) => {
          const start = dragStartRef.current;
          const worldSize = 256 * Math.pow(2, start.zoom);
          const startX = ((start.longitude + 180) / 360) * worldSize;
          const startY = mercatorY(start.latitude) * worldSize;
          const nextX = startX - gesture.dx;
          const nextY = startY - gesture.dy;
          const nextLon = (((nextX / worldSize) * 360 - 180 + 540) % 360) - 180;
          const nextLat = inverseMercatorLatitude(nextY / worldSize);
          const updated: MapCamera = {
            latitude: nextLat,
            longitude: nextLon,
            zoom: start.zoom,
          };
          setCamera(updated);
        },
        onPanResponderRelease: () => {
          onCameraChange?.(cameraRef.current);
        },
      }),
    [onCameraChange]
  );

  const tileGrid = useMemo(() => {
    const z = Math.max(2, Math.min(18, Math.round(camera.zoom)));
    const scale = Math.pow(2, camera.zoom - z);
    const tileDisplaySize = 256 * scale;
    const numTiles = 1 << z;
    const centerTileX = ((camera.longitude + 180) / 360) * numTiles;
    const centerTileY = mercatorY(camera.latitude) * numTiles;

    const halfCols = Math.ceil(viewport.width / tileDisplaySize / 2) + 1;
    const halfRows = Math.ceil(viewport.height / tileDisplaySize / 2) + 1;
    const baseCol = Math.floor(centerTileX);
    const baseRow = Math.floor(centerTileY);

    const tiles: Array<{ key: string; uri: string; left: number; top: number; size: number }> = [];
    for (let dx = -halfCols; dx <= halfCols; dx += 1) {
      for (let dy = -halfRows; dy <= halfRows; dy += 1) {
        const tx = baseCol + dx;
        const ty = baseRow + dy;
        if (ty < 0 || ty >= numTiles) continue;
        const left = viewport.width / 2 + (tx - centerTileX) * tileDisplaySize;
        const top = viewport.height / 2 + (ty - centerTileY) * tileDisplaySize;
        tiles.push({
          key: `${basemap}-${z}-${tx}-${ty}`,
          uri: tileUrl(basemap, z, tx, ty),
          left,
          top,
          size: tileDisplaySize + 0.5,
        });
      }
    }
    return tiles;
  }, [basemap, camera, viewport]);

  const routeSegments = useMemo(() => {
    if (!routeCoordinates || routeCoordinates.length < 2) return [];
    const projected = routeCoordinates.map((pt) =>
      projectPoint(pt, camera, viewport.width, viewport.height)
    );
    const segs: Array<{
      key: string;
      left: number;
      top: number;
      length: number;
      angleDeg: number;
    }> = [];
    const step = Math.max(1, Math.floor(projected.length / 80));
    for (let i = 0; i < projected.length - 1; i += step) {
      const a = projected[i]!;
      const b = projected[Math.min(projected.length - 1, i + step)]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 1) continue;
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      segs.push({
        key: `seg-${i}`,
        left: (a.x + b.x) / 2 - length / 2,
        top: (a.y + b.y) / 2 - 2.5,
        length,
        angleDeg,
      });
    }
    return segs;
  }, [routeCoordinates, camera, viewport]);

  const userPoint = useMemo(() => {
    if (!userLocation) return null;
    return projectPoint(userLocation, camera, viewport.width, viewport.height);
  }, [userLocation, camera, viewport]);

  return (
    <View style={styles.container} onLayout={onLayout} {...panResponder.panHandlers}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {tileGrid.map((tile) => (
          <Image
            key={tile.key}
            source={{ uri: tile.uri }}
            style={{
              position: 'absolute',
              left: tile.left,
              top: tile.top,
              width: tile.size,
              height: tile.size,
            }}
          />
        ))}
      </View>

      {/* Route Polyline Segments */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {routeSegments.map((seg) => (
          <View
            key={seg.key}
            style={[
              styles.routeSegment,
              {
                left: seg.left,
                top: seg.top,
                width: seg.length,
                transform: [{ rotate: `${seg.angleDeg}deg` }],
              },
            ]}
          />
        ))}
      </View>

      {/* Live User GPS Dot */}
      {userPoint && (
        <View
          pointerEvents="none"
          style={[
            styles.userHalo,
            { left: userPoint.x - 14, top: userPoint.y - 14 },
          ]}
        >
          <View style={styles.userDot} />
        </View>
      )}

      {/* Clusters & Observation / Site Markers */}
      {items.map((item) => {
        const pos = projectPoint(item, camera, viewport.width, viewport.height);
        if (
          pos.x < -48 ||
          pos.x > viewport.width + 48 ||
          pos.y < -48 ||
          pos.y > viewport.height + 48
        ) {
          return null;
        }

        if (item.kind === 'cluster') {
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={t(`${item.count} observations grouped`)}
              onPress={() => onSelect(item.id)}
              style={[
                styles.clusterMarker,
                { left: pos.x - 20, top: pos.y - 20 },
              ]}
            >
              <Text style={styles.clusterText}>{item.count}</Text>
            </Pressable>
          );
        }

        const isSelected = selectedId === item.id;
        const isSite = Boolean(item.observation.isSite);
        const isPrivate = Boolean(item.observation.isPrivateOwner);
        const bgColor = isSite
          ? colors.success
          : isPrivate
            ? colors.warning
            : colors.primary;

        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={t(item.observation.title)}
            onPress={() => onSelect(item.id)}
            style={[
              styles.pinMarker,
              {
                left: pos.x - (isSelected ? 20 : 16),
                top: pos.y - (isSelected ? 20 : 16),
                width: isSelected ? 40 : 32,
                height: isSelected ? 40 : 32,
                borderRadius: isSelected ? 20 : 16,
                backgroundColor: bgColor,
                borderColor: colors.surface,
              },
            ]}
          >
            <Ionicons
              name={isSite ? 'flag' : isPrivate ? 'lock-closed' : 'location'}
              size={isSelected ? 20 : 16}
              color={colors.onPrimary}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.surfaceContainerLow,
      overflow: 'hidden',
    },
    routeSegment: {
      position: 'absolute',
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.primary,
    },
    userHalo: {
      position: 'absolute',
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: `${colors.primary}33`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    userDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.primary,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    clusterMarker: {
      position: 'absolute',
      width: 40,
      height: 40,
      borderRadius: radius.full,
      backgroundColor: colors.primary,
      borderWidth: 2.5,
      borderColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
    },
    clusterText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: '800',
    },
    pinMarker: {
      position: 'absolute',
      borderWidth: 2.5,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
    },
  });
}
=======
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/theme-provider';
import type { Palette } from '../../theme/theme';

export function ObservationMap() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={styles.fill}><Text style={styles.text}>Interactive map requires the native Earth Talk app.</Text></View>;
}

function createStyles(colors: Palette) { return StyleSheet.create({ fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.moss }, text: { color: colors.forest, textAlign: 'center', fontWeight: '700' } }); }
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
