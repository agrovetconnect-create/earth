export type ThemeMode = 'system' | 'light' | 'dark';
export interface Palette {
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

