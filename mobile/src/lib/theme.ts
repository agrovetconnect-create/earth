/**
 * Design tokens for Earth Talk mobile, taken verbatim from the web app's
 * Google Material 3 theme (`web/src/theme.css`).
 */

export const colors = {
  primary: '#0b57d0',
  onPrimary: '#ffffff',
  primaryContainer: '#d3e3fd',
  onPrimaryContainer: '#041e49',
  surface: '#ffffff',
  surfaceContainer: '#f8fafd',
  surfaceContainerHigh: '#f0f4f9',
  surfaceDim: '#eef1f5',
  onSurface: '#1f1f1f',
  onSurfaceVariant: '#444746',
  outline: '#c7c7c7',
  outlineVariant: '#e3e3e3',
  success: '#188038',
  successContainer: '#e6f4ea',
  warning: '#e37400',
  warningContainer: '#fef7e0',
  danger: '#c5221f',
  dangerContainer: '#fce8e6',
  scrim: 'rgba(0, 0, 0, 0.4)',
  inverseSurface: '#303030',
  inverseOnSurface: '#f2f2f2',
  inversePrimary: '#a8c7fa',
  link: '#0b57d0',
} as const;

export type ThemePalette = { -readonly [K in keyof typeof colors]: string };

/** Dark counterpart of the web palette — a Material 3 dark scheme built on
 *  the same blue, for the app's dark / follow-the-phone themes. */
export const darkColors: ThemePalette = {
  primary: '#a8c7fa',
  onPrimary: '#062e6f',
  primaryContainer: '#0842a0',
  onPrimaryContainer: '#d3e3fd',
  surface: '#131314',
  surfaceContainer: '#1b1b1d',
  surfaceContainerHigh: '#232326',
  surfaceDim: '#0e0e10',
  onSurface: '#e3e3e6',
  onSurfaceVariant: '#a9abb0',
  outline: '#8e9095',
  outlineVariant: '#3c3e42',
  success: '#6dd58c',
  successContainer: '#0f3d22',
  warning: '#ffb648',
  warningContainer: '#4a3200',
  danger: '#f2b8b5',
  dangerContainer: '#5c1a18',
  scrim: 'rgba(0, 0, 0, 0.6)',
  inverseSurface: '#e3e3e6',
  inverseOnSurface: '#303030',
  inversePrimary: '#0b57d0',
  link: '#a8c7fa',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const elevation = {
  1: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  2: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  3: {
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

export const type = {
  display: { fontSize: 28, fontWeight: '400' as const, lineHeight: 34 },
  title: { fontSize: 20, fontWeight: '600' as const, lineHeight: 26 },
  titleSmall: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
} as const;

/** Rwanda bounds/centre shared with the web map config. */
export const MAP_CONFIG = {
  center: { latitude: -1.9403, longitude: 29.8739 },
  zoomLatitudeDelta: 3.2,
  zoomLongitudeDelta: 2.05,
  bounds: {
    ne: { latitude: -1.04, longitude: 30.9 },
    sw: { latitude: -2.85, longitude: 28.85 },
  },
} as const;

export type MapStyle = 'map' | 'satellite' | 'streets' | 'terrain';

/** Raster basemaps approximating the web MapLibre styles: Map, Satellite,
 *  Streets, Terrain — the same four entries the web style selector offers. */
export const MAP_TILES: Record<MapStyle, { url: string; label: string; attribution: string }> = {
  map: {
    label: 'Map',
    url: 'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  },
  streets: {
    label: 'Streets',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
  },
  terrain: {
    label: 'Terrain',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Terrain © Esri, USGS, NOAA',
  },
};

/**
 * Observation-category marker colours, copied verbatim from the web app's
 * `MapView.tsx` so a pin and a panel badge can never disagree.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  rock: '#ea580c',
  mineral: '#7c3aed',
  fossil: '#b45309',
  geological_structure: '#0f766e',
  geological_layer: '#0369a1',
  geomorphology: '#15803d',
  volcanic_feature: '#c2410c',
  hydrogeological_feature: '#0e7490',
  mining_observation: '#a16207',
  engineering_geology: '#4d7c0f',
  other_geoscience: '#334155',
  unknown: '#64748b',
  insufficient_image: '#94a3b8',
  non_geoscience: '#cbd5e1',
};

/** Fallback for a category this build has never seen (web: stone-500). */
export const CATEGORY_COLOR_FALLBACK = '#78716c';

/** Neutral colour for a site with no established evidence state. */
export const NO_EVIDENCE_HEX = '#94a3b8';
