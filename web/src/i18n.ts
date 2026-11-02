import { usePreferences, type Locale } from './services/preferences.js';
import { lookupWebFrench } from './frDictionary.js';

/**
 * The translation layer for Earth Talk Web.
 *
 * Supports English ('en') and French ('fr'). Record content keeps the language
 * its author wrote it in, while UI chrome, navigation, filters, modals, and guides
 * translate cleanly.
 */

export function translate(
  locale: Locale,
  text: string,
  vars?: Record<string, string | number>
): string {
  if (locale === 'en') {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (_, key: string) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`
    );
  }
  return lookupWebFrench(text, vars);
}

/** A locale-bound translator that re-renders when the language changes. */
export function useTranslator(): (text: string, vars?: Record<string, string | number>) => string {
  const { locale } = usePreferences();
  return (text: string, vars?: Record<string, string | number>) => translate(locale, text, vars);
}

export function useLocale(): {
  locale: Locale;
  dateLocale: string;
  t: (text: string, vars?: Record<string, string | number>) => string;
} {
  const { locale } = usePreferences();
  const t = useTranslator();
  const dateLocale = locale === 'fr' ? 'fr-FR' : 'en-US';
  return { locale, dateLocale, t };
}
