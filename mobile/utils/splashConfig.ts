export interface RgbaStop {
  /** Position between 0 (top) and 1 (bottom). */
  offset: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Multi-stop atmospheric gradient calibrated for the Rwanda Virunga highlands
 * background photograph:
 * - Top: translucent slate-emerald veil preserving golden-hour volcanic peaks
 * - Center: rich emerald-obsidian contrast stage behind the Earth Talk logo
 * - Bottom: deep grounded nocturnal earth scrim anchoring the 3-dot wave loader
 */
export const SPLASH_GRADIENT_STOPS: readonly RgbaStop[] = [
  { offset: 0.0, r: 6, g: 22, b: 30, a: 0.24 },
  { offset: 0.34, r: 7, g: 28, b: 35, a: 0.54 },
  { offset: 0.64, r: 6, g: 24, b: 31, a: 0.78 },
  { offset: 1.0, r: 4, g: 14, b: 20, a: 0.94 },
] as const;

export const SPLASH_TIMING = {
  /** Minimum showcase duration (ms) so the logo entrance completes gracefully. */
  minDisplayMs: 2400,
  /** Reduced-motion showcase duration (ms). */
  reducedMotionMinDisplayMs: 650,
  /** Upper bound (ms) waiting on session hydration so offline startup never hangs. */
  maxHydrationWaitMs: 3600,
  /** Exit cross-dissolve duration (ms) into Home. */
  exitDurationMs: 450,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Generates `bandCount` smoothly interpolated RGBA color strings from top to bottom
 * so the splash gradient renders identically across iOS, Android, and Web without
 * color banding or extra native binary dependencies.
 */
export function buildSplashGradientBands(
  bandCount = 36,
  stops: readonly RgbaStop[] = SPLASH_GRADIENT_STOPS
): string[] {
  const safeCount = Math.max(2, Math.floor(bandCount));
  if (stops.length === 0) {
    return Array.from({ length: safeCount }, () => 'rgba(6, 22, 30, 0.72)');
  }
  if (stops.length === 1) {
    const only = stops[0]!;
    const color = `rgba(${Math.round(only.r)}, ${Math.round(only.g)}, ${Math.round(only.b)}, ${only.a.toFixed(3)})`;
    return Array.from({ length: safeCount }, () => color);
  }

  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  const bands: string[] = [];

  for (let index = 0; index < safeCount; index += 1) {
    const t = index / (safeCount - 1);
    let lower = sorted[0]!;
    let upper = sorted[sorted.length - 1]!;

    for (let s = 0; s < sorted.length - 1; s += 1) {
      const current = sorted[s]!;
      const next = sorted[s + 1]!;
      if (t >= current.offset && t <= next.offset) {
        lower = current;
        upper = next;
        break;
      }
    }

    const span = upper.offset - lower.offset;
    const localT = span <= 0 ? 0 : clamp((t - lower.offset) / span, 0, 1);
    // Smoothstep easing prevents visible mach bands at stop transitions
    const smoothT = localT * localT * (3 - 2 * localT);

    const r = Math.round(lower.r + (upper.r - lower.r) * smoothT);
    const g = Math.round(lower.g + (upper.g - lower.g) * smoothT);
    const b = Math.round(lower.b + (upper.b - lower.b) * smoothT);
    const a = clamp(lower.a + (upper.a - lower.a) * smoothT, 0, 1);

    bands.push(`rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`);
  }

  return bands;
}
