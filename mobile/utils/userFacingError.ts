import { ApiError } from '../services/api.ts';
import { getCurrentAppLanguage, translateAppText } from './language.ts';

/** Maps backend/client errors to short messages without exposing raw server internals. */
export function userFacingError(error: unknown): string {
  const lang = getCurrentAppLanguage();
  if (!(error instanceof ApiError)) {
    return translateAppText(lang, 'Something went wrong. Please try again.');
  }
  switch (error.kind) {
    case 'configuration':
      return translateAppText(lang, 'The Earth Talk API is not configured correctly. Check the mobile setup.');
    case 'network':
      return translateAppText(lang, 'Could not reach Earth Talk. Check your connection and try again.');
    case 'timeout':
      return translateAppText(lang, 'The request took too long. Try again.');
    case 'unauthorized':
      return translateAppText(lang, 'This action needs a valid sign-in or contributor session.');
    case 'forbidden':
      return translateAppText(lang, 'You do not have permission to do that.');
    case 'not-found':
      return translateAppText(lang, 'This public record is unavailable.');
    case 'rate-limit':
      return translateAppText(lang, 'Too many requests. Wait a moment and try again.');
    case 'server':
      return translateAppText(lang, 'Earth Talk is temporarily unavailable. Try again later.');
    case 'malformed':
      return translateAppText(lang, 'Earth Talk returned an unexpected response. Please retry.');
    default:
      return translateAppText(lang, 'The request could not be completed. Please try again.');
  }
}
