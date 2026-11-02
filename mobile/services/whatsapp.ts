import { requestAuthCode, verifyAuthCode, fetchAuthSession, signOutAuthSession } from './api.ts';
import { setStoredContributorToken, getStoredContributorToken, clearStoredContributorToken } from './contributorToken.ts';

/**
 * Mobile WhatsApp Service
 * Provides comprehensive WhatsApp integration for mobile app users:
 * - Direct WhatsApp deep-linking & conversation launcher
 * - Native WhatsApp OTP verification auth flow
 * - WhatsApp sharing link builder
 * - Pre-configured message templates
 */

export const WHATSAPP_MESSAGES = {
  START: 'START',
  HELP: 'HELP',
  MY_EARTH_TALK: 'MY_EARTH_TALK',
  COMMUNITY: 'COMMUNITY',
} as const;

/** Get configured WhatsApp recipient phone number */
export function getConfiguredWhatsAppNumber(): string {
  const envNumber = process.env.EXPO_PUBLIC_WHATSAPP_NUMBER || '';
  return envNumber.replace(/\D/g, '');
}

/** Check if WhatsApp phone number is configured */
export function isWhatsAppConfigured(): boolean {
  const digits = getConfiguredWhatsAppNumber();
  return digits.length >= 7 && digits.length <= 15;
}

/** Build WhatsApp deep-link URL for native WhatsApp app or web fallback */
export function buildWhatsAppUrl(messageText: string = WHATSAPP_MESSAGES.START): string {
  const phone = getConfiguredWhatsAppNumber();
  const encodedText = encodeURIComponent(messageText);
  if (phone) {
    return `https://wa.me/${phone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

/** Open WhatsApp conversation directly from mobile app */
export async function openWhatsApp(messageText: string = WHATSAPP_MESSAGES.START): Promise<boolean> {
  const url = buildWhatsAppUrl(messageText);
  try {
    const RN = await import('react-native').catch(() => null);
    if (RN?.Linking && typeof RN.Linking.openURL === 'function') {
      await RN.Linking.openURL(url);
      return true;
    }
  } catch {
    // fallback
  }
  return true;
}

/** Build WhatsApp shareable URL for an observation passport */
export function buildObservationWhatsAppShareUrl(passportId: string, title?: string): string {
  const text = title
    ? `Check out this geological observation on Earth Talk: "${title}" (Passport: ${passportId})`
    : `Check out this Geoscience Passport on Earth Talk: ${passportId}`;
  return buildWhatsAppUrl(text);
}

/** Request WhatsApp OTP authentication code for user phone number */
export async function sendWhatsAppOtp(phone: string) {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 7) {
    throw new Error('Please enter a valid phone number with country code.');
  }
  return requestAuthCode(cleaned);
}

/** Verify WhatsApp OTP code and save session token */
export async function confirmWhatsAppOtp(phone: string, code: string) {
  const cleanedPhone = phone.replace(/\D/g, '');
  const cleanedCode = code.trim();
  if (cleanedCode.length < 4) {
    throw new Error('Please enter the verification code sent to your WhatsApp.');
  }
  const result = await verifyAuthCode(cleanedPhone, cleanedCode);
  if (result?.token) {
    await setStoredContributorToken(result.token);
  }
  return result;
}

/** Get active mobile WhatsApp authenticated user session */
export async function getActiveWhatsAppUser() {
  const token = await getStoredContributorToken();
  if (!token) return null;
  try {
    const session = await fetchAuthSession(token);
    return session.authenticated ? session.user : null;
  } catch {
    return null;
  }
}

/** Sign out WhatsApp user session on mobile */
export async function signOutWhatsAppUser() {
  const token = await getStoredContributorToken();
  if (token) {
    try {
      await signOutAuthSession(token);
    } catch {
      // safe fallback
    }
  }
  await clearStoredContributorToken();
}
