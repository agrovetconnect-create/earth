/** Shared display formatters (dates, coordinates, counts). */

/** Verbatim from the web: `formatCapitalized`. */
export function formatCapitalized(text?: string | null): string {
  if (!text) return 'Unknown';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function formatDate(iso: string | Date | null | undefined, dateLocale = 'en-US'): string {
  if (!iso) return '—';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string | Date | null | undefined, dateLocale = 'en-US'): string {
  if (!iso) return '—';
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(dateLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRelative(iso: string | number | null | undefined): string {
  if (!iso) return '';
  const then = typeof iso === 'number' ? iso : new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.round(months / 12)} y ago`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  return value.toLocaleString('en-US');
}

export function formatCoords(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return '—';
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number | null {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const d = 2 * R * Math.asin(Math.sqrt(h));
  return Number.isFinite(d) ? d : null;
}

export function confidenceLabel(confidence: string | null | undefined): string {
  if (!confidence) return 'Unknown confidence';
  return confidence.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Verbatim from the web: the friendly passport-id chip label. */
export function formatPassportId(id?: string | null): string {
  if (!id) return '';
  const cleaned = id.replace(/^(?:ET-(?:INV-)?(?:DEMO-|RW-)?|RT-)/i, '');
  return `Field #${cleaned}`;
}

/** Verbatim from the web. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Verbatim from the web's ObservationSideCard `formatRelativeTime`. */
export function formatRelativeTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return formatDate(iso);
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatDate(iso);
}
