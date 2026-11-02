import { ApiError } from '../services/api.ts';
<<<<<<< HEAD
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
=======

/** Maps backend/client errors to short messages without exposing raw server internals. */
export function userFacingError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  switch (error.kind) {
    case 'configuration': return 'The Earth Talk API is not configured correctly. Check the mobile setup.';
    case 'network': return 'Could not reach Earth Talk. Check your connection and try again.';
    case 'timeout': return 'The request took too long. Try again.';
    case 'unauthorized': return 'This action needs a valid sign-in or contributor session.';
    case 'forbidden': return 'You do not have permission to do that.';
    case 'not-found': return 'This public record is unavailable.';
    case 'rate-limit': return 'Too many requests. Wait a moment and try again.';
    case 'server': return 'Earth Talk is temporarily unavailable. Try again later.';
    case 'malformed': return 'Earth Talk returned an unexpected response. Please retry.';
    default: return 'The request could not be completed. Please try again.';
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
  }
}
