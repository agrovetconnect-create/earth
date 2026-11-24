import { RWANDA_DISTRICTS } from './public-location.js';

/**
 * Zero-dependency binary JPEG EXIF GPS & capture timestamp extractor.
 *
 * When a geologist or citizen observer photographs an outcrop in the field with
 * their phone's native camera (without opening Earth Talk at that moment, or
 * while offline in a valley) and uploads the photo hours or days later from
 * home, the camera's WGS84 coordinates and capture timestamp live inside the
 * JPEG APP1 (`0xFFE1` -> `Exif\0\0`) TIFF IFD structure.
 *
 * Recovering those coordinates directly from the image bytes prevents the #1
 * citizen-science location error: accidentally pinning the contributor's home
 * or office GPS instead of the actual rock outcrop.
 */

export interface ExtractedExifGps {
  hasGps: boolean;
  latitude: number | null;
  longitude: number | null;
  altitudeMeters: number | null;
  accuracyMeters: number | null;
  capturedAt: string | null;
  withinRwanda: boolean;
  suggestedDistrict: string | null;
}

const EMPTY_EXIF: ExtractedExifGps = {
  hasGps: false,
  latitude: null,
  longitude: null,
  altitudeMeters: null,
  accuracyMeters: null,
  capturedAt: null,
  withinRwanda: false,
  suggestedDistrict: null,
};

function haversineKmSimple(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinRwandaBounds(latitude: number, longitude: number): boolean {
  return latitude >= -2.95 && latitude <= -0.95 && longitude >= 28.8 && longitude <= 30.95;
}

export function nearestRwandaDistrict(latitude: number, longitude: number): string | null {
  if (!isWithinRwandaBounds(latitude, longitude)) return null;
  let bestDistrict: string | null = null;
  let bestDist = Infinity;
  for (const [key, center] of Object.entries(RWANDA_DISTRICTS)) {
    const dist = haversineKmSimple(latitude, longitude, center.latitude, center.longitude);
    if (dist < bestDist) {
      bestDist = dist;
      bestDistrict = key;
    }
  }
  return bestDistrict;
}

export function distanceBetweenPointsKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return haversineKmSimple(lat1, lon1, lat2, lon2);
}

function normalizeExifTimestamp(raw: string): string | null {
  const cleaned = raw.replace(/\0+$/, '').trim();
  if (!cleaned) return null;
  // Standard EXIF format: "YYYY:MM:DD HH:MM:SS"
  const m = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}:\d{2}:\d{2})/.exec(cleaned);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}`;
  }
  return cleaned.slice(0, 32);
}

/**
 * Extracts embedded EXIF GPS coordinates, altitude, horizontal accuracy, and
 * original capture timestamp from raw JPEG bytes.
 */
export function extractExifGpsFromBuffer(input: Uint8Array | Buffer): ExtractedExifGps {
  if (!input || input.length < 16) return EMPTY_EXIF;

  const bytes =
    input instanceof Uint8Array
      ? input
      : new Uint8Array(input);

  // Must start with JPEG SOI (0xFF 0xD8)
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return EMPTY_EXIF;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }
    // SOS or EOI: end of metadata headers
    if (marker === 0xda || marker === 0xd9) break;

    if (offset + 4 > bytes.length) break;
    const segmentLength = view.getUint16(offset + 2, false);
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) break;

    // APP1 (0xFFE1) with "Exif\0\0"
    if (
      marker === 0xe1 &&
      segmentLength >= 14 &&
      bytes[offset + 4] === 0x45 && // E
      bytes[offset + 5] === 0x78 && // x
      bytes[offset + 6] === 0x69 && // i
      bytes[offset + 7] === 0x66 && // f
      bytes[offset + 8] === 0x00 &&
      bytes[offset + 9] === 0x00
    ) {
      const tiffStart = offset + 10;
      const tiffEnd = offset + 2 + segmentLength;
      return parseTiffExif(bytes, view, tiffStart, tiffEnd);
    }

    offset += 2 + segmentLength;
  }

  return EMPTY_EXIF;
}

function parseTiffExif(
  bytes: Uint8Array,
  view: DataView,
  tiffStart: number,
  tiffEnd: number
): ExtractedExifGps {
  if (tiffStart + 8 > tiffEnd) return EMPTY_EXIF;

  const byteOrder = view.getUint16(tiffStart, false);
  const littleEndian = byteOrder === 0x4949; // 'II'
  if (!littleEndian && byteOrder !== 0x4d4d) {
    return EMPTY_EXIF;
  }

  const magic = view.getUint16(tiffStart + 2, littleEndian);
  if (magic !== 42) return EMPTY_EXIF;

  const ifd0Rel = view.getUint32(tiffStart + 4, littleEndian);
  const ifd0Offset = tiffStart + ifd0Rel;
  if (ifd0Offset + 2 > tiffEnd) return EMPTY_EXIF;

  const readAscii = (valOffset: number, count: number): string => {
    if (count <= 0 || valOffset < tiffStart || valOffset + count > tiffEnd) return '';
    let out = '';
    for (let i = 0; i < count; i++) {
      const ch = bytes[valOffset + i];
      if (ch === 0) break;
      out += String.fromCharCode(ch);
    }
    return out.trim();
  };

  const readRational = (valOffset: number): number | null => {
    if (valOffset < tiffStart || valOffset + 8 > tiffEnd) return null;
    const num = view.getUint32(valOffset, littleEndian);
    const den = view.getUint32(valOffset + 4, littleEndian);
    if (den === 0) return null;
    return num / den;
  };

  const readDmsRationals = (valOffset: number, count: number): number | null => {
    if (count < 3 || valOffset < tiffStart || valOffset + 24 > tiffEnd) return null;
    const deg = readRational(valOffset);
    const min = readRational(valOffset + 8);
    const sec = readRational(valOffset + 16);
    if (deg === null || min === null || sec === null) return null;
    const decimal = deg + min / 60 + sec / 3600;
    return Number.isFinite(decimal) ? decimal : null;
  };

  const typeSize = (type: number): number => {
    switch (type) {
      case 1: // BYTE
      case 2: // ASCII
      case 7: // UNDEFINED
        return 1;
      case 3: // SHORT
        return 2;
      case 4: // LONG
        return 4;
      case 5: // RATIONAL
      case 10: // SRATIONAL
        return 8;
      default:
        return 0;
    }
  };

  const valueAddress = (entryOffset: number, type: number, count: number): number => {
    const totalBytes = typeSize(type) * count;
    if (totalBytes <= 4) {
      return entryOffset + 8;
    }
    return tiffStart + view.getUint32(entryOffset + 8, littleEndian);
  };

  let dateTimeIfd0: string | null = null;
  let exifIfdPointer: number | null = null;
  let gpsIfdPointer: number | null = null;

  const ifd0Count = view.getUint16(ifd0Offset, littleEndian);
  for (let i = 0; i < ifd0Count; i++) {
    const entry = ifd0Offset + 2 + i * 12;
    if (entry + 12 > tiffEnd) break;
    const tag = view.getUint16(entry, littleEndian);
    const type = view.getUint16(entry + 2, littleEndian);
    const count = view.getUint32(entry + 4, littleEndian);

    if (tag === 0x0132 && type === 2) {
      dateTimeIfd0 = normalizeExifTimestamp(readAscii(valueAddress(entry, type, count), count));
    } else if (tag === 0x8769 && (type === 4 || type === 3)) {
      const ptr =
        type === 4
          ? view.getUint32(entry + 8, littleEndian)
          : view.getUint16(entry + 8, littleEndian);
      exifIfdPointer = tiffStart + ptr;
    } else if (tag === 0x8825 && (type === 4 || type === 3)) {
      const ptr =
        type === 4
          ? view.getUint32(entry + 8, littleEndian)
          : view.getUint16(entry + 8, littleEndian);
      gpsIfdPointer = tiffStart + ptr;
    }
  }

  let capturedAt: string | null = dateTimeIfd0;

  if (exifIfdPointer !== null && exifIfdPointer + 2 <= tiffEnd) {
    const exifCount = view.getUint16(exifIfdPointer, littleEndian);
    for (let i = 0; i < exifCount; i++) {
      const entry = exifIfdPointer + 2 + i * 12;
      if (entry + 12 > tiffEnd) break;
      const tag = view.getUint16(entry, littleEndian);
      const type = view.getUint16(entry + 2, littleEndian);
      const count = view.getUint32(entry + 4, littleEndian);
      if ((tag === 0x9003 || tag === 0x9004) && type === 2) {
        const dt = normalizeExifTimestamp(readAscii(valueAddress(entry, type, count), count));
        if (dt) {
          capturedAt = dt;
          if (tag === 0x9003) break;
        }
      }
    }
  }

  let latRef = 'N';
  let lonRef = 'E';
  let altRef = 0;
  let rawLat: number | null = null;
  let rawLon: number | null = null;
  let rawAlt: number | null = null;
  let rawHPosError: number | null = null;

  if (gpsIfdPointer !== null && gpsIfdPointer + 2 <= tiffEnd) {
    const gpsCount = view.getUint16(gpsIfdPointer, littleEndian);
    for (let i = 0; i < gpsCount; i++) {
      const entry = gpsIfdPointer + 2 + i * 12;
      if (entry + 12 > tiffEnd) break;
      const tag = view.getUint16(entry, littleEndian);
      const type = view.getUint16(entry + 2, littleEndian);
      const count = view.getUint32(entry + 4, littleEndian);
      const addr = valueAddress(entry, type, count);

      if (tag === 0x0001 && type === 2) {
        const ref = readAscii(addr, count).toUpperCase();
        if (ref === 'S' || ref === 'N') latRef = ref;
      } else if (tag === 0x0002 && type === 5) {
        rawLat = readDmsRationals(addr, count);
      } else if (tag === 0x0003 && type === 2) {
        const ref = readAscii(addr, count).toUpperCase();
        if (ref === 'W' || ref === 'E') lonRef = ref;
      } else if (tag === 0x0004 && type === 5) {
        rawLon = readDmsRationals(addr, count);
      } else if (tag === 0x0005 && type === 1 && addr < tiffEnd) {
        altRef = bytes[addr] ?? 0;
      } else if (tag === 0x0006 && type === 5) {
        rawAlt = readRational(addr);
      } else if (tag === 0x001f && type === 5) {
        rawHPosError = readRational(addr);
      }
    }
  }

  if (rawLat === null || rawLon === null) {
    return {
      ...EMPTY_EXIF,
      capturedAt,
    };
  }

  const latitude = Number((latRef === 'S' ? -Math.abs(rawLat) : Math.abs(rawLat)).toFixed(6));
  const longitude = Number((lonRef === 'W' ? -Math.abs(rawLon) : Math.abs(rawLon)).toFixed(6));

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return {
      ...EMPTY_EXIF,
      capturedAt,
    };
  }

  const altitudeMeters =
    rawAlt !== null && Number.isFinite(rawAlt)
      ? Number((altRef === 1 ? -Math.abs(rawAlt) : rawAlt).toFixed(1))
      : null;

  const accuracyMeters =
    rawHPosError !== null && Number.isFinite(rawHPosError) && rawHPosError > 0
      ? Number(rawHPosError.toFixed(1))
      : null;

  const withinRwanda = isWithinRwandaBounds(latitude, longitude);
  const suggestedDistrict = nearestRwandaDistrict(latitude, longitude);

  return {
    hasGps: true,
    latitude,
    longitude,
    altitudeMeters,
    accuracyMeters,
    capturedAt,
    withinRwanda,
    suggestedDistrict,
  };
}

/**
 * Builds a minimal standards-compliant JPEG buffer (>= 240 bytes) containing
 * an APP1 EXIF TIFF structure with GPSLatitude, GPSLongitude, GPSAltitude, and
 * DateTimeOriginal. Useful for automated tests and simulator verification.
 */
export function buildExifJpegBuffer(params: {
  latitude: number;
  longitude: number;
  altitudeMeters?: number;
  capturedAt?: string; // "YYYY:MM:DD HH:MM:SS"
}): Buffer {
  const latRef = params.latitude < 0 ? 'S' : 'N';
  const lonRef = params.longitude < 0 ? 'W' : 'E';
  const absLat = Math.abs(params.latitude);
  const absLon = Math.abs(params.longitude);

  const toDms = (val: number): [number, number, number] => {
    const deg = Math.floor(val);
    const minFloat = (val - deg) * 60;
    const min = Math.floor(minFloat);
    const secMillis = Math.round((minFloat - min) * 60 * 10000);
    return [deg, min, secMillis];
  };

  const [latD, latM, latS10000] = toDms(absLat);
  const [lonD, lonM, lonS10000] = toDms(absLon);
  const altMeters = Math.max(0, Math.round((params.altitudeMeters ?? 1850) * 10));
  const dateStr = (params.capturedAt ?? '2026:10:20 14:30:00').padEnd(19, ' ').slice(0, 19) + '\0';

  // Build little-endian TIFF buffer
  // Layout inside TIFF:
  // 0..7: TIFF header ('II', 42, offset=8)
  // 8..49: IFD0 (count=3: 0x0132 DateTime, 0x8825 GPSIFDPointer, next=0) -> 2 + 2*12 + 4 = 30 bytes (8..37)
  // 38..57: DateTime ASCII (20 bytes)
  // 58..135: GPS IFD (count=6: 0x0001 LatRef, 0x0002 Lat, 0x0003 LonRef, 0x0004 Lon, 0x0005 AltRef, 0x0006 Alt, next=0) -> 2 + 6*12 + 4 = 78 bytes (58..135)
  // 136..159: Lat 3 rationals (24 bytes)
  // 160..183: Lon 3 rationals (24 bytes)
  // 184..191: Alt 1 rational (8 bytes)
  const tiff = Buffer.alloc(196, 0);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4); // IFD0 at 8

  // IFD0: 2 entries
  tiff.writeUInt16LE(2, 8);
  // Entry 0: DateTime (0x0132), ASCII (2), count=20, offset=38
  tiff.writeUInt16LE(0x0132, 10);
  tiff.writeUInt16LE(2, 12);
  tiff.writeUInt32LE(20, 14);
  tiff.writeUInt32LE(38, 18);
  // Entry 1: GPSIFDPointer (0x8825), LONG (4), count=1, value=58
  tiff.writeUInt16LE(0x8825, 22);
  tiff.writeUInt16LE(4, 24);
  tiff.writeUInt32LE(1, 26);
  tiff.writeUInt32LE(58, 30);
  // Next IFD = 0
  tiff.writeUInt32LE(0, 34);

  // DateTime string at 38
  tiff.write(dateStr, 38, 'ascii');

  // GPS IFD at 58: 6 entries
  tiff.writeUInt16LE(6, 58);
  const writeGpsEntry = (idx: number, tag: number, type: number, count: number, valOrOffset: number) => {
    const pos = 60 + idx * 12;
    tiff.writeUInt16LE(tag, pos);
    tiff.writeUInt16LE(type, pos + 2);
    tiff.writeUInt32LE(count, pos + 4);
    tiff.writeUInt32LE(valOrOffset, pos + 8);
  };

  // 0: GPSLatitudeRef (0x0001), ASCII(2), count=2, inline bytes
  writeGpsEntry(0, 0x0001, 2, 2, latRef.charCodeAt(0));
  // 1: GPSLatitude (0x0002), RATIONAL(5), count=3, offset=136
  writeGpsEntry(1, 0x0002, 5, 3, 136);
  // 2: GPSLongitudeRef (0x0003), ASCII(2), count=2, inline bytes
  writeGpsEntry(2, 0x0003, 2, 2, lonRef.charCodeAt(0));
  // 3: GPSLongitude (0x0004), RATIONAL(5), count=3, offset=160
  writeGpsEntry(3, 0x0004, 5, 3, 160);
  // 4: GPSAltitudeRef (0x0005), BYTE(1), count=1, inline 0
  writeGpsEntry(4, 0x0005, 1, 1, 0);
  // 5: GPSAltitude (0x0006), RATIONAL(5), count=1, offset=184
  writeGpsEntry(5, 0x0006, 5, 1, 184);
  tiff.writeUInt32LE(0, 60 + 6 * 12);

  // Latitude rationals at 136
  tiff.writeUInt32LE(latD, 136);
  tiff.writeUInt32LE(1, 140);
  tiff.writeUInt32LE(latM, 144);
  tiff.writeUInt32LE(1, 148);
  tiff.writeUInt32LE(latS10000, 152);
  tiff.writeUInt32LE(10000, 156);

  // Longitude rationals at 160
  tiff.writeUInt32LE(lonD, 160);
  tiff.writeUInt32LE(1, 164);
  tiff.writeUInt32LE(lonM, 168);
  tiff.writeUInt32LE(1, 172);
  tiff.writeUInt32LE(lonS10000, 176);
  tiff.writeUInt32LE(10000, 180);

  // Altitude rational at 184
  tiff.writeUInt32LE(altMeters, 184);
  tiff.writeUInt32LE(10, 188);

  const exifHeader = Buffer.from('Exif\0\0', 'ascii');
  const app1PayloadLen = 2 + exifHeader.length + tiff.length;
  const app1Header = Buffer.alloc(4);
  app1Header[0] = 0xff;
  app1Header[1] = 0xe1;
  app1Header.writeUInt16BE(app1PayloadLen, 2);

  const soi = Buffer.from([0xff, 0xd8]);
  const dummyImageScan = Buffer.concat([Buffer.alloc(48, 0x11), Buffer.from([0xff, 0xd9])]);

  return Buffer.concat([soi, app1Header, exifHeader, tiff, dummyImageScan]);
}
