import { Linking } from 'react-native';

/**
 * WhatsApp deep links. The web build opened wa.me links in a new tab; the
 * mobile app hands them to the OS (WhatsApp or the browser).
 */

export async function openWhatsApp(number: string, message: string): Promise<void> {
  const digits = number.replace(/[^\d]/g, '');
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  await Linking.openURL(url).catch(() => undefined);
}

export async function openExternalUrl(url: string): Promise<void> {
  await Linking.openURL(url).catch(() => undefined);
}
