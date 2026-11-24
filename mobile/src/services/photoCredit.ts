import * as Location from 'expo-location';
import { inferNearestRwandaDistrict } from '../utils/exifGps';

/**
 * The photo credit strip — the same caption the web build burns into
 * downloaded media (ObservationSideCard.downloadMedia): line 1 carries the
 * place names and coordinates, line 2 credits the platform and, unless the
 * contributor hides it, their display name.
 */

export interface CreditLines {
  line1: string;
  line2: string;
}

export interface CreditInput {
  latitude?: number | null;
  longitude?: number | null;
  /** Reverse-geocoded place names (district, sector, cell…), best first. */
  placeParts?: string[];
  /** Signed-in contributor's display name, when they agreed to show it. */
  contributorName?: string | null;
  /** The platform prefix on line 2 — the reader's chosen phrasing. */
  prefix?: string;
}

/** Builds the two credit lines exactly in the web's format. */
export function formatCreditLines(input: CreditInput): CreditLines {
  const hasCoords =
    typeof input.latitude === 'number' &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude);

  const parts = ['Rwanda', ...(input.placeParts ?? []).filter(Boolean)];
  const place = parts.filter((part, index) => parts.indexOf(part) === index).join(' · ') ||
    'Location kept private';
  const coords = hasCoords
    ? `lat ${input.latitude!.toFixed(4)}, lng ${input.longitude!.toFixed(4)}`
    : 'lat & lng withheld';
  const line1 = `${place} - ${coords}`;

  const name = input.contributorName?.trim();
  const prefix = input.prefix?.trim() || 'Earth Talk GeoAI';
  const line2 = name ? `${prefix} - Contributed by ${name}` : prefix;

  return { line1, line2 };
}

/**
 * Reverse-geocodes coordinates into Rwanda place names. Returns [] when the
 * geocoder is unavailable (offline, no result) — the caller then falls back to
 * the nearest known Rwanda district or to coordinates only.
 */
export async function reverseGeocodeParts(
  latitude: number,
  longitude: number
): Promise<string[]> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    const feature = results[0];
    if (!feature) return [];
    return [feature.subregion, feature.district, feature.city, feature.region]
      .filter((part): part is string => typeof part === 'string' && part.length > 0);
  } catch {
    return [];
  }
}

/** District fallback when the geocoder has nothing. */
export function nearestDistrictPart(latitude: number, longitude: number): string[] {
  const district = inferNearestRwandaDistrict(latitude, longitude);
  return district ? [`${district} District`] : [];
}
