/**
 * EXIF Location Extractor for Mobile Field Photos
 * Parses embedded WGS84 GPS latitude, longitude, altitude, and capture timestamp
 * directly from JPEG APP1 (Exif) binary metadata when a contributor selects a
 * photo taken earlier outside the app.
 */

export interface ExtractedLocation {
  latitude: number;
  longitude: number;
  altitudeMetres?: number | null;
  accuracyMetres?: number;
  capturedAt?: string | null;
  withinRwanda?: boolean;
  inferredDistrict?: string | null;
  hasCoordinates: boolean;
}

const RWANDA_DISTRICT_CENTROIDS: ReadonlyArray<{
  district: string;
  lat: number;
  lng: number;
}> = [
  { district: 'Bugesera', lat: -2.21, lng: 30.15 },
  { district: 'Burera', lat: -1.49, lng: 29.83 },
  { district: 'Gakenke', lat: -1.69, lng: 29.79 },
  { district: 'Gasabo', lat: -1.89, lng: 30.13 },
  { district: 'Gatsibo', lat: -1.59, lng: 30.45 },
  { district: 'Gicumbi', lat: -1.62, lng: 30.06 },
  { district: 'Gisagara', lat: -2.62, lng: 29.85 },
  { district: 'Huye', lat: -2.59, lng: 29.74 },
  { district: 'Kamonyi', lat: -2.01, lng: 29.9 },
  { district: 'Karongi', lat: -2.07, lng: 29.35 },
  { district: 'Kayonza', lat: -1.9, lng: 30.65 },
  { district: 'Kicukiro', lat: -1.99, lng: 30.12 },
  { district: 'Kirehe', lat: -2.26, lng: 30.72 },
  { district: 'Muhanga', lat: -2.08, lng: 29.75 },
  { district: 'Musanze', lat: -1.5, lng: 29.63 },
  { district: 'Ngoma', lat: -2.18, lng: 30.47 },
  { district: 'Ngororero', lat: -1.87, lng: 29.57 },
  { district: 'Nyabihu', lat: -1.65, lng: 29.51 },
  { district: 'Nyagatare', lat: -1.3, lng: 30.33 },
  { district: 'Nyamagabe', lat: -2.47, lng: 29.56 },
  { district: 'Nyamasheke', lat: -2.35, lng: 29.15 },
  { district: 'Nyanza', lat: -2.35, lng: 29.75 },
  { district: 'Nyarugenge', lat: -1.95, lng: 30.06 },
  { district: 'Nyaruguru', lat: -2.7, lng: 29.53 },
  { district: 'Rubavu', lat: -1.68, lng: 29.33 },
  { district: 'Ruhango', lat: -2.23, lng: 29.78 },
  { district: 'Rulindo', lat: -1.74, lng: 29.98 },
  { district: 'Rusizi', lat: -2.52, lng: 28.9 },
  { district: 'Rutsiro', lat: -1.94, lng: 29.33 },
  { district: 'Rwamagana', lat: -1.95, lng: 30.43 },
];

/**
 * Validates and normalizes latitude and longitude
 */
export function validateWGS84Coordinates(
  lat: number | null | undefined,
  lon: number | null | undefined
): ExtractedLocation {
  if (
    lat === null ||
    lat === undefined ||
    lon === null ||
    lon === undefined ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return { latitude: 0, longitude: 0, hasCoordinates: false };
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { latitude: 0, longitude: 0, hasCoordinates: false };
  }

  const latitude = Number(lat.toFixed(6));
  const longitude = Number(lon.toFixed(6));
  const withinRwanda = isWithinRwandaBounds(latitude, longitude);

  return {
    latitude,
    longitude,
    withinRwanda,
    inferredDistrict: withinRwanda ? nearestRwandaDistrict(latitude, longitude) : null,
    hasCoordinates: true,
  };
}

/**
 * Checks if coordinates lie within Rwanda geographic bounds
 */
export function isWithinRwandaBounds(latitude: number, longitude: number): boolean {
  return latitude >= -2.9 && latitude <= -1.0 && longitude >= 28.8 && longitude <= 30.9;
}

/**
 * Haversine great-circle distance in kilometres
 */
export function distanceBetweenKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(3));
}

export function nearestRwandaDistrict(latitude: number, longitude: number): string | null {
  if (!isWithinRwandaBounds(latitude, longitude)) return null;
  let bestDistrict: string | null = null;
  let bestDist = Infinity;
  for (const item of RWANDA_DISTRICT_CENTROIDS) {
    const d = distanceBetweenKm(latitude, longitude, item.lat, item.lng);
    if (d < bestDist) {
      bestDist = d;
      bestDistrict = item.district;
    }
  }
  return bestDistrict;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const sanitized = clean.replace(/[^A-Za-z0-9+/=]/g, '');
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Int16Array(128).fill(-1);
  for (let i = 0; i < table.length; i++) lookup[table.charCodeAt(i)] = i;

  const out: number[] = [];
  for (let i = 0; i < sanitized.length; i += 4) {
    const c0 = lookup[sanitized.charCodeAt(i)] ?? -1;
    const c1 = lookup[sanitized.charCodeAt(i + 1)] ?? -1;
    const c2 =
      sanitized[i + 2] === '=' || i + 2 >= sanitized.length
        ? -2
        : (lookup[sanitized.charCodeAt(i + 2)] ?? -1);
    const c3 =
      sanitized[i + 3] === '=' || i + 3 >= sanitized.length
        ? -2
        : (lookup[sanitized.charCodeAt(i + 3)] ?? -1);
    if (c0 < 0 || c1 < 0) break;
    out.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) {
      out.push(((c1 & 0x0f) << 4) | (c2 >> 2));
      if (c3 >= 0) out.push(((c2 & 0x03) << 6) | c3);
    }
  }
  return new Uint8Array(out);
}

function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0;
    const b2 = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    output += chars[(triplet >> 18) & 0x3f];
    output += chars[(triplet >> 12) & 0x3f];
    output += i + 1 < bytes.length ? chars[(triplet >> 6) & 0x3f] : '=';
    output += i + 2 < bytes.length ? chars[triplet & 0x3f] : '=';
  }
  return output;
}

/**
 * Extracts embedded EXIF GPS coordinates and DateTimeOriginal from JPEG bytes.
 */
export function extractExifFromBytes(bytes: Uint8Array): ExtractedLocation {
  const empty: ExtractedLocation = { latitude: 0, longitude: 0, hasCoordinates: false };
  if (bytes.length < 24 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return empty;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const segLen = view.getUint16(offset + 2, false);
    if (segLen < 2 || offset + 2 + segLen > bytes.length) break;

    if (
      marker === 0xe1 &&
      segLen >= 14 &&
      bytes[offset + 4] === 0x45 &&
      bytes[offset + 5] === 0x78 &&
      bytes[offset + 6] === 0x69 &&
      bytes[offset + 7] === 0x66 &&
      bytes[offset + 8] === 0x00 &&
      bytes[offset + 9] === 0x00
    ) {
      const tiffStart = offset + 10;
      const tiffEnd = offset + 2 + segLen;
      const endian = (bytes[tiffStart] << 8) | bytes[tiffStart + 1];
      const le = endian === 0x4949 ? true : endian === 0x4d4d ? false : null;
      if (le === null) return empty;
      if (view.getUint16(tiffStart + 2, le) !== 42) return empty;

      const u16 = (pos: number) => view.getUint16(pos, le);
      const u32 = (pos: number) => view.getUint32(pos, le);

      const readAscii = (valOffset: number, count: number): string => {
        let s = '';
        for (let i = 0; i < count && valOffset + i < tiffEnd; i++) {
          const ch = bytes[valOffset + i];
          if (ch === 0) break;
          s += String.fromCharCode(ch);
        }
        return s.trim();
      };

      const readRationals = (valOffset: number, count: number): number[] | null => {
        if (valOffset + count * 8 > tiffEnd) return null;
        const vals: number[] = [];
        for (let i = 0; i < count; i++) {
          const num = u32(valOffset + i * 8);
          const den = u32(valOffset + i * 8 + 4);
          if (den === 0) return null;
          vals.push(num / den);
        }
        return vals;
      };

      const ifd0Offset = tiffStart + u32(tiffStart + 4);
      if (ifd0Offset + 2 > tiffEnd) return empty;

      let gpsIfdRel = 0;
      let exifIfdRel = 0;
      let dateTimeStr: string | null = null;

      const ifd0Count = u16(ifd0Offset);
      for (let i = 0; i < ifd0Count; i++) {
        const entry = ifd0Offset + 2 + i * 12;
        if (entry + 12 > tiffEnd) break;
        const tag = u16(entry);
        const type = u16(entry + 2);
        const count = u32(entry + 4);
        if (tag === 0x8825) {
          gpsIfdRel = u32(entry + 8);
        } else if (tag === 0x8769) {
          exifIfdRel = u32(entry + 8);
        } else if (tag === 0x0132 && type === 2) {
          const ptr = count <= 4 ? entry + 8 : tiffStart + u32(entry + 8);
          dateTimeStr = readAscii(ptr, count);
        }
      }

      if (exifIfdRel > 0 && tiffStart + exifIfdRel + 2 <= tiffEnd) {
        const exifBase = tiffStart + exifIfdRel;
        const exifCount = u16(exifBase);
        for (let i = 0; i < exifCount; i++) {
          const entry = exifBase + 2 + i * 12;
          if (entry + 12 > tiffEnd) break;
          const tag = u16(entry);
          const type = u16(entry + 2);
          const count = u32(entry + 4);
          if ((tag === 0x9003 || tag === 0x9004) && type === 2) {
            const ptr = count <= 4 ? entry + 8 : tiffStart + u32(entry + 8);
            const dt = readAscii(ptr, count);
            if (dt) dateTimeStr = dt;
          }
        }
      }

      if (gpsIfdRel === 0 || tiffStart + gpsIfdRel + 2 > tiffEnd) return empty;

      const gpsBase = tiffStart + gpsIfdRel;
      const gpsCount = u16(gpsBase);
      let latRef = 'N';
      let lonRef = 'E';
      let latDms: number[] | null = null;
      let lonDms: number[] | null = null;
      let altRef = 0;
      let altVal: number | null = null;

      for (let i = 0; i < gpsCount; i++) {
        const entry = gpsBase + 2 + i * 12;
        if (entry + 12 > tiffEnd) break;
        const tag = u16(entry);
        const type = u16(entry + 2);
        const count = u32(entry + 4);
        if (tag === 0x0001 && type === 2) {
          latRef = readAscii(entry + 8, Math.min(count, 4)).toUpperCase() || 'N';
        } else if (tag === 0x0002 && type === 5 && count === 3) {
          latDms = readRationals(tiffStart + u32(entry + 8), 3);
        } else if (tag === 0x0003 && type === 2) {
          lonRef = readAscii(entry + 8, Math.min(count, 4)).toUpperCase() || 'E';
        } else if (tag === 0x0004 && type === 5 && count === 3) {
          lonDms = readRationals(tiffStart + u32(entry + 8), 3);
        } else if (tag === 0x0005) {
          altRef = bytes[entry + 8] ?? 0;
        } else if (tag === 0x0006 && type === 5 && count === 1) {
          const r = readRationals(tiffStart + u32(entry + 8), 1);
          if (r && r.length === 1) altVal = r[0];
        }
      }

      if (!latDms || !lonDms) return empty;
      let lat = latDms[0] + latDms[1] / 60 + latDms[2] / 3600;
      let lon = lonDms[0] + lonDms[1] / 60 + lonDms[2] / 3600;
      if (latRef.startsWith('S')) lat = -lat;
      if (lonRef.startsWith('W')) lon = -lon;
      if (lat === 0 && lon === 0) return empty;

      const validated = validateWGS84Coordinates(lat, lon);
      if (!validated.hasCoordinates) return empty;

      let capturedIso: string | null = null;
      if (dateTimeStr) {
        const m = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(dateTimeStr);
        if (m) capturedIso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
      }

      return {
        ...validated,
        altitudeMetres:
          altVal !== null && Number.isFinite(altVal)
            ? Number((altRef === 1 ? -altVal : altVal).toFixed(1))
            : null,
        capturedAt: capturedIso,
      };
    }

    offset += 2 + segLen;
  }

  return empty;
}

export function extractExifFromBase64(base64: string): ExtractedLocation {
  try {
    return extractExifFromBytes(base64ToUint8Array(base64));
  } catch {
    return { latitude: 0, longitude: 0, hasCoordinates: false };
  }
}

/**
 * Builds a valid geotagged JPEG fixture with embedded EXIF GPS (Musanze volcanic outcrop)
 * so contributors or automated tests can verify earlier-photo EXIF GPS recovery.
 */
export function buildSampleExifJpegBase64(
  latitude = -1.5008,
  longitude = 29.6342,
  capturedDateExif = '2026:03:18 09:42:15'
): string {
  const latRef = latitude < 0 ? 'S' : 'N';
  const lonRef = longitude < 0 ? 'W' : 'E';
  const absLat = Math.abs(latitude);
  const absLon = Math.abs(longitude);

  const toDms = (deg: number): Array<[number, number]> => {
    const d = Math.floor(deg);
    const minFull = (deg - d) * 60;
    const m = Math.floor(minFull);
    const secScaled = Math.round((minFull - m) * 60 * 10000);
    return [
      [d, 1],
      [m, 1],
      [secScaled, 10000],
    ];
  };

  const latDms = toDms(absLat);
  const lonDms = toDms(absLon);

  const tiff = new Uint8Array(200);
  const view = new DataView(tiff.buffer);
  tiff[0] = 0x4d;
  tiff[1] = 0x4d;
  view.setUint16(2, 42, false);
  view.setUint32(4, 8, false);

  // IFD0 at 8: 2 entries (DateTime 0x0132, GPSIFDPointer 0x8825)
  view.setUint16(8, 2, false);
  view.setUint16(10, 0x0132, false);
  view.setUint16(12, 2, false);
  view.setUint32(14, 20, false);
  view.setUint32(18, 38, false);

  view.setUint16(22, 0x8825, false);
  view.setUint16(24, 4, false);
  view.setUint32(26, 1, false);
  view.setUint32(30, 58, false);
  view.setUint32(34, 0, false);

  const dtStr = capturedDateExif.slice(0, 19);
  for (let i = 0; i < dtStr.length; i++) tiff[38 + i] = dtStr.charCodeAt(i);
  tiff[38 + dtStr.length] = 0;

  // GPS IFD at 58: 4 entries
  view.setUint16(58, 4, false);
  view.setUint16(60, 0x0001, false);
  view.setUint16(62, 2, false);
  view.setUint32(64, 2, false);
  tiff[68] = latRef.charCodeAt(0);
  tiff[69] = 0;

  view.setUint16(72, 0x0002, false);
  view.setUint16(74, 5, false);
  view.setUint32(76, 3, false);
  view.setUint32(80, 112, false);

  view.setUint16(84, 0x0003, false);
  view.setUint16(86, 2, false);
  view.setUint32(88, 2, false);
  tiff[92] = lonRef.charCodeAt(0);
  tiff[93] = 0;

  view.setUint16(96, 0x0004, false);
  view.setUint16(98, 5, false);
  view.setUint32(100, 3, false);
  view.setUint32(104, 136, false);
  view.setUint32(108, 0, false);

  latDms.forEach(([num, den], idx) => {
    view.setUint32(112 + idx * 8, num, false);
    view.setUint32(112 + idx * 8 + 4, den, false);
  });
  lonDms.forEach(([num, den], idx) => {
    view.setUint32(136 + idx * 8, num, false);
    view.setUint32(136 + idx * 8 + 4, den, false);
  });

  const app1PayloadLen = 2 + 6 + tiff.length;
  const jpeg = new Uint8Array(2 + 2 + app1PayloadLen + 32);
  const jView = new DataView(jpeg.buffer);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg[2] = 0xff;
  jpeg[3] = 0xe1;
  jView.setUint16(4, app1PayloadLen, false);
  jpeg[6] = 0x45;
  jpeg[7] = 0x78;
  jpeg[8] = 0x69;
  jpeg[9] = 0x66;
  jpeg[10] = 0x00;
  jpeg[11] = 0x00;
  jpeg.set(tiff, 12);
  const tail = 12 + tiff.length;
  for (let i = 0; i < 30; i++) jpeg[tail + i] = (i * 11 + 3) & 0xff;
  jpeg[jpeg.length - 2] = 0xff;
  jpeg[jpeg.length - 1] = 0xd9;

  return bytesToBase64(jpeg);
}

