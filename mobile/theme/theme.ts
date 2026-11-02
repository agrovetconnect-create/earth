export type ThemeMode = 'system' | 'light' | 'dark';
export interface Palette {
<<<<<<< HEAD
  primary: string; primaryHover: string; primaryPressed: string; primaryContainer: string; primaryContainerHover: string;
  onPrimary: string; onPrimaryContainer: string;
  surface: string; surfaceContainer: string; surfaceContainerLow: string; surfaceContainerHigh: string; surfaceVariant: string;
  onSurface: string; onSurfaceVariant: string; onSurfaceFaint: string;
  outline: string; outlineSoft: string;
  success: string; warning: string; danger: string;
  earth: string;
  // Legacy aliases for backward compatibility during migration
  forest: string; moss: string; ink: string; muted: string; line: string; canvas: string;
}
export const lightColors: Palette = {
  primary: '#0b57d0', primaryHover: '#0842a0', primaryPressed: '#062e6f', primaryContainer: '#d3e3fd', primaryContainerHover: '#c2d7fc',
  onPrimary: '#ffffff', onPrimaryContainer: '#041e49',
  surface: '#ffffff', surfaceContainer: '#f8fafd', surfaceContainerLow: '#f0f4f9', surfaceContainerHigh: '#e9eef6', surfaceVariant: '#e1e3e1',
  onSurface: '#1f1f1f', onSurfaceVariant: '#444746', onSurfaceFaint: '#5e5e5e',
  outline: '#c7c7c7', outlineSoft: '#e3e3e3',
  success: '#188038', warning: '#e37400', danger: '#c5221f',
  earth: '#795548',
  // Aliases
  forest: '#0b57d0', moss: '#f0f4f9', ink: '#1f1f1f', muted: '#5e5e5e', line: '#e3e3e3', canvas: '#f8fafd',
};
export const darkColors: Palette = {
  primary: '#a8c7fa', primaryHover: '#7cacf8', primaryPressed: '#5c9cf7', primaryContainer: '#0842a0', primaryContainerHover: '#0b57d0',
  onPrimary: '#062e6f', onPrimaryContainer: '#d3e3fd',
  surface: '#1f1f1f', surfaceContainer: '#131314', surfaceContainerLow: '#1e1f20', surfaceContainerHigh: '#28292a', surfaceVariant: '#444746',
  onSurface: '#e3e3e3', onSurfaceVariant: '#c4c7c5', onSurfaceFaint: '#8e918f',
  outline: '#8e918f', outlineSoft: '#444746',
  success: '#34a853', warning: '#fbbc04', danger: '#ea4335',
  earth: '#d7ccc8',
  // Aliases
  forest: '#a8c7fa', moss: '#1e1f20', ink: '#e3e3e3', muted: '#8e918f', line: '#444746', canvas: '#131314',
};
export const colors = lightColors;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { s: 8, m: 12, l: 16, xl: 24, full: 9999 } as const;

=======
  forest: string; forestDark: string; moss: string; earth: string; ink: string; muted: string;
  line: string; canvas: string; surface: string; warning: string; warningBg: string; error: string; errorBg: string;
}
export const lightColors: Palette = {
  forest: '#205B46', forestDark: '#174634', moss: '#E7F0E8', earth: '#A56A3B',
  ink: '#202923', muted: '#69736D', line: '#E2E8E3', canvas: '#F5F7F4', surface: '#FFFFFF',
  warning: '#8B5D18', warningBg: '#FBF2E0', error: '#9D3D35', errorBg: '#FBECE9',
};
export const darkColors: Palette = {
  forest: '#91C8A8', forestDark: '#B7DCC5', moss: '#263A30', earth: '#D6A476',
  ink: '#F0F4F0', muted: '#B0BDB4', line: '#39473D', canvas: '#141B17', surface: '#202923',
  warning: '#E3BB73', warningBg: '#3A3020', error: '#F0A39B', errorBg: '#3A2524',
};
/** Backward-compatible light palette for non-screen utilities. Use useAppTheme for UI. */
export const colors = lightColors;
export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 30, xxl: 40 } as const;
>>>>>>> 59b7875b1e82e599dde26993d8f3b9e4c8192bed
