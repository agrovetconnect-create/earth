/**
 * Rwanda district geo helpers (Expo port of the web's utils/exifGps.ts).
 *
 * The web build parsed JPEG EXIF bytes directly in the browser; on React
 * Native the image picker already exposes the GPS tags of the picked asset,
 * so only the pure geo helpers and the picker-EXIF reader live here.
 */

export interface RwandaDistrictCenter {
  name: string;
  lat: number;
  lng: number;
}

export const RWANDA_DISTRICT_CENTERS: ReadonlyArray<RwandaDistrictCenter> = [
  { name: 'Bugesera', lat: -2.208, lng: 30.145 },
  { name: 'Burera', lat: -1.483, lng: 29.832 },
  { name: 'Gakenke', lat: -1.694, lng: 29.786 },
  { name: 'Gasabo', lat: -1.889, lng: 30.132 },
  { name: 'Gatsibo', lat: -1.608, lng: 30.454 },
  { name: 'Gicumbi', lat: -1.617, lng: 30.117 },
  { name: 'Gisagara', lat: -2.617, lng: 29.845 },
  { name: 'Huye', lat: -2.597, lng: 29.739 },
  { name: 'Kamonyi', lat: -2.004, lng: 29.898 },
  { name: 'Karongi', lat: -2.148, lng: 29.392 },
  { name: 'Kayonza', lat: -1.911, lng: 30.651 },
  { name: 'Kicukiro', lat: -1.999, lng: 30.125 },
  { name: 'Kirehe', lat: -2.262, lng: 30.731 },
  { name: 'Muhanga', lat: -2.084, lng: 29.753 },
  { name: 'Musanze', lat: -1.499, lng: 29.635 },
  { name: 'Ngoma', lat: -2.177, lng: 30.496 },
  { name: 'Ngororero', lat: -1.869, lng: 29.627 },
  { name: 'Nyabihu', lat: -1.652, lng: 29.507 },
  { name: 'Nyagatare', lat: -1.298, lng: 30.328 },
  { name: 'Nyamagabe', lat: -2.473, lng: 29.469 },
  { name: 'Nyamasheke', lat: -2.357, lng: 29.146 },
  { name: 'Nyanza', lat: -2.352, lng: 29.751 },
  { name: 'Nyarugenge', lat: -1.954, lng: 30.061 },
  { name: 'Nyaruguru', lat: -2.712, lng: 29.526 },
  { name: 'Rubavu', lat: -1.681, lng: 29.329 },
  { name: 'Ruhango', lat: -2.228, lng: 29.782 },
  { name: 'Rulindo', lat: -1.737, lng: 29.988 },
  { name: 'Rusizi', lat: -2.53, lng: 29.008 },
  { name: 'Rutsiro', lat: -1.936, lng: 29.326 },
  { name: 'Rwamagana', lat: -1.949, lng: 30.435 },
];

export function distanceBetweenKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinRwanda(lat: number, lng: number): boolean {
  return lat >= -2.95 && lat <= -1.0 && lng >= 28.8 && lng <= 30.95;
}

export function inferNearestRwandaDistrict(lat: number, lng: number): string | null {
  if (!isWithinRwanda(lat, lng)) return null;
  let best: string | null = null;
  let bestKm = Infinity;
  for (const d of RWANDA_DISTRICT_CENTERS) {
    const km = distanceBetweenKm(lat, lng, d.lat, d.lng);
    if (km < bestKm) {
      bestKm = km;
      best = d.name;
    }
  }
  return best;
}

/**
 * Reads GPS coordinates out of an expo-image-picker asset's EXIF payload.
 * iOS nests them under a "{GPS}" key; Android exposes flat GPS* fields.
 */
export function pickerGpsFromExif(exif: unknown): { latitude: number; longitude: number } | null {
  if (!exif || typeof exif !== 'object') return null;
  const record = exif as Record<string, unknown>;

  const toNumber = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const gps = record['{GPS}'];
  if (gps && typeof gps === 'object') {
    const g = gps as Record<string, unknown>;
    const lat = toNumber(g.Latitude ?? g.GPSLatitude);
    const lng = toNumber(g.Longitude ?? g.GPSLongitude);
    if (lat !== null && lng !== null) return { latitude: lat, longitude: lng };
  }

  const flatLat = toNumber(record.GPSLatitude ?? record.gpsLatitude);
  const flatLng = toNumber(record.GPSLongitude ?? record.gpsLongitude);
  if (flatLat !== null && flatLng !== null) {
    const latRef = String(record.GPSLatitudeRef ?? record.gpsLatitudeRef ?? '').toUpperCase();
    const lngRef = String(record.GPSLongitudeRef ?? record.gpsLongitudeRef ?? '').toUpperCase();
    return {
      latitude: latRef === 'S' ? -flatLat : flatLat,
      longitude: lngRef === 'W' ? -flatLng : flatLng,
    };
  }

  return null;
}
