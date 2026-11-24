/**
 * The single place that builds and opens the Earth Talk WhatsApp link.
 *
 * The business number comes from the public app-distribution config and is
 * passed in by the caller. Without a number, the link points at WhatsApp's
 * "share/pick a chat" surface instead of a broken deep link.
 */

export const WHATSAPP_START_MESSAGE = 'START';
/** Sent when a signed-in contributor opens My Earth Talk from WhatsApp. */
export const WHATSAPP_MY_EARTH_TALK_MESSAGE = 'MY EARTH TALK';

/** The `wa.me` deep link for a message, with or without a configured number. */
export function whatsAppUrl(
  message: string = WHATSAPP_START_MESSAGE,
  customNumber?: string,
): string {
  const text = encodeURIComponent(message);
  const resolvedNumber = String(customNumber ?? '').replace(/\D/g, '');
  return resolvedNumber
    ? `https://wa.me/${resolvedNumber}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

/**
 * Opens WhatsApp in a new tab. Returns false when the browser blocks the popup,
 * so the caller can fall back to showing the guide card with a real link.
 *
 * The window is opened without the `noopener` feature string on purpose. Per the
 * HTML spec a browser returns `null` from `window.open` whenever `noopener` is
 * requested, which made a successful navigation indistinguishable from a blocked
 * popup and caused the caller to stack the guide card on top of an already-open
 * WhatsApp tab. The opener reference is severed manually instead, immediately
 * after a successful open, which keeps the same protection without losing the
 * ability to detect a blocked popup.
 */
export function openWhatsApp(
  message: string = WHATSAPP_START_MESSAGE,
  customNumber?: string,
): boolean {
  if (typeof window === 'undefined') return false;
  const opened = window.open(whatsAppUrl(message, customNumber), '_blank');
  if (!opened) return false;
  try {
    opened.opener = null;
  } catch {
    // A cross-origin window may refuse the assignment; the tab is already open.
  }
  return true;
}
