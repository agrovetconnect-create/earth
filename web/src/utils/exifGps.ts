/**
 * Client-side EXIF GPS & Timestamp Extractor + Offline Field Draft Store (Web)
 *
 * When a contributor photographs an outcrop using their native phone or field
 * camera without opening Earth Talk, the JPEG APP1 segment embeds WGS84 GPS
 * coordinates and the original capture timestamp (`DateTimeOriginal`).
 * Parsing these bytes directly in the browser lets the contributor verify
 * where the photo was actually taken before uploading or pinning.
 */

export interface BrowserExifGps {
  found: boolean;
  latitude: number | null;
  longitude: number | null;
  altitudeMeters: number | null;
  accuracyMeters: number | null;
  capturedAt: string | null;
  inferredDistrict: string | null;
  withinRwanda: boolean;
}

export const RWANDA_DISTRICT_CENTERS: ReadonlyArray<{
  name: string;
  lat: number;
  lng: number;
}> = [
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

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  const end = Math.min(view.byteLength, offset + length);
  for (let i = offset; i < end; i++) {
    const code = view.getUint8(i);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out.trim();
}

function normalizeExifTimestamp(raw: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

export function extractExifGpsFromArrayBuffer(arrayBuffer: ArrayBuffer): BrowserExifGps {
  const empty: BrowserExifGps = {
    found: false,
    latitude: null,
    longitude: null,
    altitudeMeters: null,
    accuracyMeters: null,
    capturedAt: null,
    inferredDistrict: null,
    withinRwanda: false,
  };

  const view = new DataView(arrayBuffer);
  if (view.byteLength < 14 || view.getUint8(0) !== 0xff || view.getUint8(1) !== 0xd8) {
    return empty;
  }

  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) break;
    const segLen = view.getUint16(offset + 2, false);
    if (segLen < 2 || offset + 2 + segLen > view.byteLength) break;

    if (
      marker === 0xe1 &&
      segLen >= 10 &&
      readAscii(view, offset + 4, 4) === 'Exif' &&
      view.getUint8(offset + 8) === 0 &&
      view.getUint8(offset + 9) === 0
    ) {
      return parseTiffBlock(view, offset + 10, offset + 2 + segLen);
    }

    offset += 2 + segLen;
  }

  return empty;
}

function parseTiffBlock(view: DataView, tiffStart: number, tiffEnd: number): BrowserExifGps {
  const empty: BrowserExifGps = {
    found: false,
    latitude: null,
    longitude: null,
    altitudeMeters: null,
    accuracyMeters: null,
    capturedAt: null,
    inferredDistrict: null,
    withinRwanda: false,
  };

  if (tiffStart + 8 > tiffEnd) return empty;
  const endian = String.fromCharCode(view.getUint8(tiffStart), view.getUint8(tiffStart + 1));
  if (endian !== 'II' && endian !== 'MM') return empty;
  const le = endian === 'II';

  const u16 = (pos: number) => (pos + 2 <= tiffEnd ? view.getUint16(pos, le) : null);
  const u32 = (pos: number) => (pos + 4 <= tiffEnd ? view.getUint32(pos, le) : null);
  const rat = (pos: number) => {
    if (pos + 8 > tiffEnd) return null;
    const num = view.getUint32(pos, le);
    const den = view.getUint32(pos + 4, le);
    if (den === 0) return null;
    const val = num / den;
    return Number.isFinite(val) ? val : null;
  };

  if (u16(tiffStart + 2) !== 42) return empty;
  const ifd0Rel = u32(tiffStart + 4);
  if (ifd0Rel === null) return empty;

  const ifd0Pos = tiffStart + ifd0Rel;
  const count0 = u16(ifd0Pos);
  if (count0 === null) return empty;

  let gpsIfdRel: number | null = null;
  let exifIfdRel: number | null = null;
  let dateTime0: string | null = null;

  for (let i = 0; i < count0; i++) {
    const entry = ifd0Pos + 2 + i * 12;
    if (entry + 12 > tiffEnd) break;
    const tag = u16(entry);
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    if (tag === null || type === null || count === null) continue;

    if (tag === 0x8825) {
      gpsIfdRel = u32(entry + 8);
    } else if (tag === 0x8769) {
      exifIfdRel = u32(entry + 8);
    } else if (tag === 0x0132 && type === 2 && count > 0) {
      const strPos = count <= 4 ? entry + 8 : tiffStart + (u32(entry + 8) ?? 0);
      if (strPos + count <= tiffEnd) {
        dateTime0 = normalizeExifTimestamp(readAscii(view, strPos, count));
      }
    }
  }

  let dateTimeOrig: string | null = null;
  if (exifIfdRel !== null) {
    const exifPos = tiffStart + exifIfdRel;
    const exifCount = u16(exifPos);
    if (exifCount !== null) {
      for (let i = 0; i < exifCount; i++) {
        const entry = exifPos + 2 + i * 12;
        if (entry + 12 > tiffEnd) break;
        const tag = u16(entry);
        const type = u16(entry + 2);
        const count = u32(entry + 4);
        if ((tag === 0x9003 || tag === 0x9004) && type === 2 && count && count > 0) {
          const strPos = count <= 4 ? entry + 8 : tiffStart + (u32(entry + 8) ?? 0);
          if (strPos + count <= tiffEnd) {
            const parsed = normalizeExifTimestamp(readAscii(view, strPos, count));
            if (parsed) {
              dateTimeOrig = parsed;
              if (tag === 0x9003) break;
            }
          }
        }
      }
    }
  }

  const capturedAt = dateTimeOrig ?? dateTime0;
  if (gpsIfdRel === null) {
    return { ...empty, capturedAt };
  }

  const gpsPos = tiffStart + gpsIfdRel;
  const gpsCount = u16(gpsPos);
  if (gpsCount === null) return { ...empty, capturedAt };

  let latRef = 'N';
  let lngRef = 'E';
  let altRef = 0;
  let latDms: [number, number, number] | null = null;
  let lngDms: [number, number, number] | null = null;
  let altVal: number | null = null;
  let hErrVal: number | null = null;

  for (let i = 0; i < gpsCount; i++) {
    const entry = gpsPos + 2 + i * 12;
    if (entry + 12 > tiffEnd) break;
    const tag = u16(entry);
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    if (tag === null || type === null || count === null) continue;

    if (tag === 0x0001 && type === 2) {
      const ref = readAscii(view, entry + 8, Math.min(count, 4)).toUpperCase();
      if (ref.startsWith('S') || ref.startsWith('N')) latRef = ref[0]!;
    } else if (tag === 0x0002 && type === 5 && count >= 3) {
      const valRel = u32(entry + 8);
      if (valRel !== null) {
        const d = rat(tiffStart + valRel);
        const m = rat(tiffStart + valRel + 8);
        const s = rat(tiffStart + valRel + 16);
        if (d !== null && m !== null && s !== null) latDms = [d, m, s];
      }
    } else if (tag === 0x0003 && type === 2) {
      const ref = readAscii(view, entry + 8, Math.min(count, 4)).toUpperCase();
      if (ref.startsWith('W') || ref.startsWith('E')) lngRef = ref[0]!;
    } else if (tag === 0x0004 && type === 5 && count >= 3) {
      const valRel = u32(entry + 8);
      if (valRel !== null) {
        const d = rat(tiffStart + valRel);
        const m = rat(tiffStart + valRel + 8);
        const s = rat(tiffStart + valRel + 16);
        if (d !== null && m !== null && s !== null) lngDms = [d, m, s];
      }
    } else if (tag === 0x0005 && type === 1) {
      altRef = view.getUint8(entry + 8);
    } else if (tag === 0x0006 && type === 5 && count >= 1) {
      const valRel = u32(entry + 8);
      if (valRel !== null) altVal = rat(tiffStart + valRel);
    } else if (tag === 0x001f && type === 5 && count >= 1) {
      const valRel = u32(entry + 8);
      if (valRel !== null) hErrVal = rat(tiffStart + valRel);
    }
  }

  if (!latDms || !lngDms) return { ...empty, capturedAt };

  const rawLat = (latDms[0] + latDms[1] / 60 + latDms[2] / 3600) * (latRef === 'S' ? -1 : 1);
  const rawLng = (lngDms[0] + lngDms[1] / 60 + lngDms[2] / 3600) * (lngRef === 'W' ? -1 : 1);
  if (
    !Number.isFinite(rawLat) ||
    !Number.isFinite(rawLng) ||
    rawLat < -90 ||
    rawLat > 90 ||
    rawLng < -180 ||
    rawLng > 180 ||
    (rawLat === 0 && rawLng === 0)
  ) {
    return { ...empty, capturedAt };
  }

  const latitude = Number(rawLat.toFixed(6));
  const longitude = Number(rawLng.toFixed(6));
  const within = isWithinRwanda(latitude, longitude);
  return {
    found: true,
    latitude,
    longitude,
    altitudeMeters: altVal !== null ? Number((altRef === 1 ? -altVal : altVal).toFixed(1)) : null,
    accuracyMeters: hErrVal !== null && hErrVal > 0 ? Number(hErrVal.toFixed(1)) : null,
    capturedAt,
    inferredDistrict: within ? inferNearestRwandaDistrict(latitude, longitude) : null,
    withinRwanda: within,
  };
}

// ---------------------------------------------------------------------------
// Offline Field Observation Draft Queue (for low-signal field sites)
// ---------------------------------------------------------------------------
export interface WebOfflineFieldDraft {
  id: string;
  savedAt: string;
  title: string;
  caption: string;
  primaryMediaCaption?: string;
  specimenContext?: string;
  hasScaleReference?: boolean;
  hasFreshSurface?: boolean;
  primaryFileName: string;
  primaryMimeType: string;
  primaryBase64: string;
  latitude: string;
  longitude: string;
  district: string;
  sector?: string;
  cell?: string;
  village?: string;
  locationNote?: string;
  locationSourceLabel: string;
  supportingMedia: Array<{
    fileName: string;
    mimeType: string;
    base64: string;
    kind: 'image' | 'video';
    caption: string;
  }>;
}

const OFFLINE_DRAFTS_KEY = 'earth_talk_web_offline_drafts_v1';

export function listWebOfflineDrafts(): WebOfflineFieldDraft[] {
  try {
    const raw = localStorage.getItem(OFFLINE_DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WebOfflineFieldDraft[]) : [];
  } catch {
    return [];
  }
}

export function saveWebOfflineDraft(draft: Omit<WebOfflineFieldDraft, 'id' | 'savedAt'>): WebOfflineFieldDraft {
  const existing = listWebOfflineDrafts();
  const entry: WebOfflineFieldDraft = {
    ...draft,
    id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    savedAt: new Date().toISOString(),
  };
  const next = [entry, ...existing].slice(0, 8);
  localStorage.setItem(OFFLINE_DRAFTS_KEY, JSON.stringify(next));
  return entry;
}

export function removeWebOfflineDraft(id: string): WebOfflineFieldDraft[] {
  const next = listWebOfflineDrafts().filter((d) => d.id !== id);
  try {
    localStorage.setItem(OFFLINE_DRAFTS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors on removal
  }
  return next;
}
