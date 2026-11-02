import { useCallback, useEffect, useState } from 'react';
import { lookupMobileFrench } from './frDictionary.ts';

export const LANGUAGE_STORAGE_KEY = 'earth-talk-language-v1';

export type AppLanguage = 'en' | 'fr';

let currentLanguage: AppLanguage = 'en';
let initialized = false;
const listeners = new Set<(lang: AppLanguage) => void>();

export function normalizeAppLanguage(value: unknown): AppLanguage {
  return value === 'fr' ? 'fr' : 'en';
}

export function translateAppText(
  locale: AppLanguage,
  label: string,
  vars?: Record<string, string | number>
): string {
  if (!label) return label;
  if (locale === 'en') {
    if (!vars) return label;
    return label.replace(/\{(\w+)\}/g, (_, key: string) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : `{${key}}`
    );
  }
  return lookupMobileFrench(label, vars);
}

export function translateNavLabel(locale: AppLanguage, label: string): string {
  return translateAppText(locale, label);
}

async function ensureLanguageLoaded(): Promise<AppLanguage> {
  if (initialized) return currentLanguage;
  try {
    const mod = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = mod?.default;
    if (AsyncStorage?.getItem) {
      const saved = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      currentLanguage = normalizeAppLanguage(saved);
    }
  } catch {
    // Fallback to in-memory default
  }
  initialized = true;
  return currentLanguage;
}

export async function setAppLanguagePreference(next: AppLanguage): Promise<void> {
  const normalized = normalizeAppLanguage(next);
  currentLanguage = normalized;
  initialized = true;
  listeners.forEach((listener) => listener(normalized));
  try {
    const mod = await import('@react-native-async-storage/async-storage').catch(() => null);
    const AsyncStorage = mod?.default;
    if (AsyncStorage?.setItem) {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    }
  } catch {
    // Ignore storage write failure
  }
}

export function getCurrentAppLanguage(): AppLanguage {
  return currentLanguage;
}

export function useAppLanguage(): {
  language: AppLanguage;
  setLanguage: (next: AppLanguage) => void;
  t: (label: string, vars?: Record<string, string | number>) => string;
} {
  const [language, setLanguageState] = useState<AppLanguage>(currentLanguage);

  useEffect(() => {
    let active = true;
    const onChange = (next: AppLanguage) => {
      if (active) setLanguageState(next);
    };
    listeners.add(onChange);
    void ensureLanguageLoaded().then((loaded) => {
      if (active) setLanguageState(loaded);
    });
    return () => {
      active = false;
      listeners.delete(onChange);
    };
  }, []);

  const setLanguage = useCallback((next: AppLanguage) => {
    void setAppLanguagePreference(next);
  }, []);

  const t = useCallback(
    (label: string, vars?: Record<string, string | number>) =>
      translateAppText(language, label, vars),
    [language]
  );

  return { language, setLanguage, t };
}
