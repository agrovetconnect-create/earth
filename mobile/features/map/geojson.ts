import type { GeoJsonCollection, GeoJsonFeature } from '../../types/api';

export type BasemapStyle = 'map' | 'streets' | 'satellite' | 'terrain';

export interface GeographicCoordinate {
  latitude: number;
  longitude: number;
}

export interface MapObservation extends GeographicCoordinate {
  id: string;
  category: string;
  subcategory: string;
  title: string;
  description: string | null;
  district: string | null;
  createdAt: string | null;
  evidenceState: string | null;
  classification?: string | null;
  confidence?: string | null;
  verificationStatus?: string | null;
  imageUrl: string | null;
  isSite?: boolean;
  isPrivateOwner?: boolean;
  observationCount?: number;
}

export interface MapCluster extends GeographicCoordinate {
  kind: 'cluster';
  id: string;
  count: number;
  observations: MapObservation[];
}

export interface MapObservationMarker extends GeographicCoordinate {
  kind: 'observation';
  id: string;
  observation: MapObservation;
}

export type MapRenderItem = MapCluster | MapObservationMarker;

export interface ParsedMapData {
  observations: MapObservation[];
  invalidFeatureCount: number;
  demonstrationFeatureCount: number;
}

export interface MapCamera extends GeographicCoordinate {
  zoom: number;
}

export interface ObservationMapProps {
  items: MapRenderItem[];
  initialCamera: MapCamera;
  cameraCommand?: { id: number; camera: MapCamera };
  basemap?: BasemapStyle;
  selectedId?: string | null;
  userLocation?: GeographicCoordinate | null;
  routeCoordinates?: GeographicCoordinate[] | null;
  onSelect: (id: string) => void;
  onFailure: () => void;
  onCameraChange?: (camera: MapCamera) => void;
}

/** Coordinates arrive in GeoJSON Point order [longitude, latitude]. */
export function validateGeographicCoordinate(
  latitude: unknown,
  longitude: unknown
): GeographicCoordinate | null {
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function parseFeature(feature: GeoJsonFeature): MapObservation | null {
  if (
    !feature.geometry ||
    feature.geometry.type !== 'Point' ||
    !Array.isArray(feature.geometry.coordinates) ||
    feature.geometry.coordinates.length !== 2
  ) {
    return null;
  }
  const [longitude, latitude] = feature.geometry.coordinates;
  const coordinate = validateGeographicCoordinate(latitude, longitude);
  const properties = feature.properties;
  if (
    !coordinate ||
    !properties ||
    typeof properties.passport_id !== 'string' ||
    !properties.passport_id.trim() ||
    typeof properties.observation_category !== 'string' ||
    !properties.observation_category.trim()
  ) {
    return null;
  }
  const subcategory =
    typeof properties.observation_subcategory === 'string' ? properties.observation_subcategory : '';
  const postTitle =
    typeof properties.post_title === 'string' && properties.post_title.trim()
      ? properties.post_title.trim()
      : typeof properties.title === 'string' && properties.title.trim()
        ? properties.title.trim()
        : '';
  const possibleName =
    typeof properties.possible_name === 'string' ? properties.possible_name.trim() : '';
  const category = properties.observation_category;
  return {
    id: properties.passport_id,
    ...coordinate,
    category: category.trim(),
    subcategory,
    title:
      postTitle ||
      possibleName ||
      [category, subcategory].filter(Boolean).join(' · ') ||
      'Geological observation',
    description:
      typeof properties.primary_interpretation === 'string'
        ? properties.primary_interpretation
        : null,
    district:
      typeof properties.district === 'string' && properties.district.trim()
        ? properties.district
        : null,
    createdAt:
      typeof properties.created_at === 'string' && !Number.isNaN(Date.parse(properties.created_at))
        ? properties.created_at
        : null,
    evidenceState:
      typeof properties.evidence_state === 'string' && properties.evidence_state.trim()
        ? properties.evidence_state
        : null,
    ...(typeof properties.classification === 'string' && properties.classification.trim()
      ? { classification: properties.classification.trim() }
      : typeof properties.primary_classification === 'string' &&
          properties.primary_classification.trim()
        ? { classification: properties.primary_classification.trim() }
        : {}),
    ...(typeof properties.confidence === 'string' && properties.confidence.trim()
      ? { confidence: properties.confidence.trim() }
      : {}),
    ...(typeof properties.verification_status === 'string' && properties.verification_status.trim()
      ? { verificationStatus: properties.verification_status.trim() }
      : {}),
    imageUrl: typeof properties.primary_media_url === 'string' ? properties.primary_media_url : null,
  };
}

/** Drops demonstrations and invalid/unlocated geometries; neither can create a map marker. */
export function parsePublicMapData(collection: GeoJsonCollection): ParsedMapData {
  const observations: MapObservation[] = [];
  let invalidFeatureCount = 0;
  let demonstrationFeatureCount = 0;
  for (const feature of collection.features) {
    if (feature.properties?.is_demo === true) {
      demonstrationFeatureCount += 1;
      continue;
    }
    const observation = parseFeature(feature);
    if (observation) observations.push(observation);
    else invalidFeatureCount += 1;
  }
  return { observations, invalidFeatureCount, demonstrationFeatureCount };
}

export function filterMapObservations(
  observations: MapObservation[],
  category: string,
  classification = '',
  evidenceState = '',
  extra?: {
    district?: string;
    confidence?: string;
    verification?: string;
    search?: string;
  }
): MapObservation[] {
  const needle = extra?.search?.trim().toLowerCase() ?? '';
  return observations.filter((observation) => {
    if (category && observation.category !== category) return false;
    if (
      classification &&
      !observation.isSite &&
      !observation.isPrivateOwner &&
      (observation.classification ?? '').toLowerCase() !== classification.toLowerCase()
    ) {
      return false;
    }
    if (evidenceState && observation.evidenceState !== evidenceState) return false;
    if (extra?.district && (observation.district ?? '').toLowerCase() !== extra.district.toLowerCase()) {
      return false;
    }
    if (
      extra?.confidence &&
      !observation.isSite &&
      !observation.isPrivateOwner &&
      (observation.confidence ?? '').toLowerCase() !== extra.confidence.toLowerCase()
    ) {
      return false;
    }
    if (
      extra?.verification &&
      !observation.isSite &&
      !observation.isPrivateOwner &&
      (observation.verificationStatus ?? '').toLowerCase() !== extra.verification.toLowerCase()
    ) {
      return false;
    }
    if (needle) {
      const hay = [
        observation.id,
        observation.title,
        observation.category,
        observation.subcategory,
        observation.district ?? '',
        observation.description ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function normalizedLongitude(longitude: number): number {
  return (((longitude + 180) % 360) + 360) % 360;
}

/** Centers the smallest longitude arc, including records spanning the date line. */
function longitudeArcCenter(longitudes: number[]): { center: number; span: number } {
  const sorted = longitudes.map(normalizedLongitude).sort((a, b) => a - b);
  if (sorted.length === 1) return { center: ((sorted[0]! + 180) % 360) - 180, span: 0 };
  let largestGap = -1;
  let arcStart = sorted[0]!;
  let arcEnd = sorted[0]!;
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]!;
    const next = index === sorted.length - 1 ? sorted[0]! + 360 : sorted[index + 1]!;
    const gap = next - current;
    if (gap > largestGap) {
      largestGap = gap;
      arcStart = next;
      arcEnd = current + 360;
    }
  }
  const center = ((normalizedLongitude((arcStart + arcEnd) / 2) + 180) % 360) - 180;
  return { center, span: Math.max(0, 360 - largestGap) };
}

/** Rwanda is only the neutral starting view when the API has no map-safe points. */
export function cameraForObservations(observations: MapObservation[]): MapCamera {
  if (!observations.length) return { latitude: -1.9403, longitude: 29.8739, zoom: 6.5 };
  const latitudes = observations.map((item) => item.latitude);
  const longitudes = observations.map((item) => item.longitude);
  const longitude = longitudeArcCenter(longitudes);
  let minLatitude = 90;
  let maxLatitude = -90;
  for (const latitude of latitudes) {
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  }
  const latitudeSpan = maxLatitude - minLatitude;
  if (observations.length === 1) {
    return { latitude: minLatitude, longitude: longitudes[0]!, zoom: 8.5 };
  }
  const span = Math.max(latitudeSpan, longitude.span, 0.05);
  const zoom = Math.max(2.5, Math.min(8.5, Math.log2(360 / span) - 0.5));
  return { latitude: (minLatitude + maxLatitude) / 2, longitude: longitude.center, zoom };
}

export function mercatorY(latitude: number): number {
  const bounded = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = (bounded * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
}

export function inverseMercatorLatitude(y: number): number {
  const clamped = Math.max(0, Math.min(1, y));
  const n = Math.PI - 2 * Math.PI * clamped;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Clusters at native-map zoom into 64px grid cells; cluster counts use real valid points. */
export function createMapRenderItems(observations: MapObservation[], zoom: number): MapRenderItem[] {
  if (observations.length < 2) {
    return observations.map((observation) => ({
      kind: 'observation',
      id: observation.id,
      latitude: observation.latitude,
      longitude: observation.longitude,
      observation,
    }));
  }
  const worldPixels = 256 * 2 ** Math.max(0, zoom);
  const cellSize = 64;
  const columns = Math.max(1, Math.ceil(worldPixels / cellSize));
  const groups = new Map<string, MapObservation[]>();
  for (const observation of observations) {
    const x = (normalizedLongitude(observation.longitude) / 360) * worldPixels;
    const y = mercatorY(observation.latitude) * worldPixels;
    const column = Math.floor(x / cellSize) % columns;
    const row = Math.floor(y / cellSize);
    const key = `${column}:${row}`;
    const group = groups.get(key);
    if (group) group.push(observation);
    else groups.set(key, [observation]);
  }
  return [...groups.entries()].map(([key, group]): MapRenderItem => {
    if (group.length === 1) {
      const observation = group[0]!;
      return {
        kind: 'observation',
        id: observation.id,
        latitude: observation.latitude,
        longitude: observation.longitude,
        observation,
      };
    }
    const longitude = longitudeArcCenter(group.map((item) => item.longitude)).center;
    const latitude = group.reduce((sum, item) => sum + item.latitude, 0) / group.length;
    return {
      kind: 'cluster',
      id: `cluster:${key}`,
      latitude,
      longitude,
      count: group.length,
      observations: group,
    };
  });
}

export function findMapRenderItem(items: MapRenderItem[], id: string): MapRenderItem | undefined {
  return items.find((item) => item.id === id);
}

export function haversineDistanceKm(a: GeographicCoordinate, b: GeographicCoordinate): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
