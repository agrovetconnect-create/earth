import { createPersistedStore, usePersistedStore } from './localStore';

/**
 * User preferences for Earth Talk mobile (locale + location consent),
 * persisted under the same key as the web app.
 */

export type Locale = 'en' | 'fr';

export interface Preferences {
  locale: Locale;
  allowLocation: boolean;
  /** When true, photos are credited to the prefix only, without the contributor's name. */
  photoCreditNameHidden: boolean;
  /** Theme: follow the phone (auto), or force light / dark. */
  themeMode: 'system' | 'light' | 'dark';
  /** Credit strip text scale (1 = the web's default size, 0.7–1.6). */
  creditTextScale: number;
  /** Credit line prefix — one of CREDIT_PREFIX_OPTIONS. */
  creditPrefix: string;
}

const PREFERENCES_KEY = 'et.preferences.v1';

const DEFAULT_PREFERENCES: Preferences = {
  locale: 'en',
  allowLocation: false,
  photoCreditNameHidden: false,
  themeMode: 'system',
  creditTextScale: 1,
  creditPrefix: 'Earth Talk GeoAI',
};

/** Preset phrases for the credit strip's first half of line 2. */
export const CREDIT_PREFIX_OPTIONS = [
  'Earth Talk GeoAI',
  'Earth Talk',
  'Earth Talk Field Observation',
  'Rwanda GeoAI',
] as const;

export const preferencesStore = createPersistedStore<Preferences>(
  PREFERENCES_KEY,
  DEFAULT_PREFERENCES
);

export function usePreferences(): {
  preferences: Preferences;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  setAllowLocation: (allow: boolean) => void;
  setPhotoCreditNameHidden: (hidden: boolean) => void;
  setThemeMode: (mode: Preferences['themeMode']) => void;
  setCreditTextScale: (scale: number) => void;
  setCreditPrefix: (prefix: string) => void;
  ready: boolean;
} {
  const preferences = usePersistedStore(preferencesStore);
  return {
    preferences,
    locale: preferences.locale,
    setLocale: (locale) => preferencesStore.set({ ...preferencesStore.get(), locale }),
    setAllowLocation: (allowLocation) =>
      preferencesStore.set({ ...preferencesStore.get(), allowLocation }),
    setPhotoCreditNameHidden: (photoCreditNameHidden) =>
      preferencesStore.set({ ...preferencesStore.get(), photoCreditNameHidden }),
    setThemeMode: (themeMode) =>
      preferencesStore.set({ ...preferencesStore.get(), themeMode }),
    setCreditTextScale: (creditTextScale) =>
      preferencesStore.set({ ...preferencesStore.get(), creditTextScale }),
    setCreditPrefix: (creditPrefix) =>
      preferencesStore.set({ ...preferencesStore.get(), creditPrefix }),
    ready: true,
  };
}
