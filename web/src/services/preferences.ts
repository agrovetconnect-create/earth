import { createPersistedStore } from './localStore.js';

/**
 * Reader preferences. What remains after pruning the navigation to the
 * platform's WhatsApp citizen-science core: the language the sidebar chrome is
 * shown in, and whether the map may ask this browser for its position. Both are
 * read by the surfaces they change, so a choice is a real change, not a switch
 * that only redraws itself.
 */

export type Locale = 'en' | 'fr';

export interface LocaleOption {
  id: Locale;
  /** English name, for the accessibility label and the menu's secondary line. */
  label: string;
  /** The language's own name, shown as the primary line. */
  nativeLabel: string;
  /** Path to the language's flag, shown as the row's leading icon. */
  flag: string;
}

export const LOCALES: LocaleOption[] = [
  { id: 'en', label: 'English', nativeLabel: 'English', flag: '/flag-en.svg' },
  { id: 'fr', label: 'French', nativeLabel: 'Français', flag: '/flag-fr.svg' },
];

<<<<<<< HEAD
export function normalizeLocale(value: unknown): Locale {
  if (value === 'en' || value === 'fr') {
    return value;
  }
  return 'en';
}

=======
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export interface Preferences {
  locale: Locale;
  /**
   * Whether this browser may ask for the reader's position at all. When it is
   * off the map's locate and navigation controls refuse instead of prompting,
   * which is a privacy switch rather than a cosmetic one.
   */
  allowLocation: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  locale: 'en',
  allowLocation: true,
};

<<<<<<< HEAD
function deserializePreferences(raw: unknown, fallback: Preferences): Preferences {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const candidate = raw as Record<string, unknown>;
  return {
    locale: normalizeLocale(candidate.locale),
    allowLocation:
      typeof candidate.allowLocation === 'boolean'
        ? candidate.allowLocation
        : fallback.allowLocation,
  };
}

function syncDocumentLanguage(locale: Locale): void {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.lang = locale;
  }
}

export const preferencesStore = createPersistedStore<Preferences>(
  'et.preferences.v1',
  DEFAULT_PREFERENCES,
  { deserialize: deserializePreferences },
);

if (typeof document !== 'undefined') {
  syncDocumentLanguage(preferencesStore.get().locale);
  preferencesStore.subscribe(() => {
    syncDocumentLanguage(preferencesStore.get().locale);
  });
}

=======
export const preferencesStore = createPersistedStore<Preferences>(
  'et.preferences.v1',
  DEFAULT_PREFERENCES,
);

>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
export function usePreferences(): Preferences {
  return preferencesStore.use();
}

export function setPreference<K extends keyof Preferences>(
  key: K,
  value: Preferences[K],
): void {
<<<<<<< HEAD
  preferencesStore.update((previous) => {
    const next = { ...previous, [key]: value };
    if (key === 'locale') {
      next.locale = normalizeLocale(value);
      syncDocumentLanguage(next.locale);
    }
    return next;
  });
=======
  preferencesStore.update((previous) => ({ ...previous, [key]: value }));
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
}

export function clearPreferences(): void {
  preferencesStore.reset();
}