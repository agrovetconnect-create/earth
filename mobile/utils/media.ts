const SAFE_DATA_IMAGE_RE = /^data:image\/(?:jpeg|jpg|png|webp|heic);base64,[A-Za-z0-9+/=\s]+$/i;

export function safeMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (SAFE_DATA_IMAGE_RE.test(trimmed)) return trimmed.replace(/\s+/g, '');
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && process.env.NODE_ENV !== 'production')
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

