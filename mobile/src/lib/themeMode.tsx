import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { colors, darkColors, type ThemePalette } from './theme';
import { usePreferences, type Preferences } from '../services/preferences';

/**
 * Theme mode: 'system' follows the phone's appearance (auto), 'light' and
 * 'dark' force one. Resolved dark state + the active palette come from the
 * context; surfaces read `useTheme()` instead of the static light tokens.
 */

export type ThemeMode = Preferences['themeMode'];

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  dark: boolean;
  palette: ThemePalette;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  setMode: () => undefined,
  dark: false,
  palette: colors,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { preferences, setThemeMode } = usePreferences();
  const scheme = useColorScheme();

  const value = useMemo<ThemeContextValue>(() => {
    const dark =
      preferences.themeMode === 'dark' ||
      (preferences.themeMode === 'system' && scheme === 'dark');
    return {
      mode: preferences.themeMode,
      setMode: setThemeMode,
      dark,
      palette: dark ? darkColors : colors,
    };
  }, [preferences.themeMode, scheme, setThemeMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
