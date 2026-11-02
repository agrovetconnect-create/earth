# Splash screen and mobile branding

## Brand assets

The repository did not contain a clear Earth Talk logo. Existing launcher art was generic blue geometric artwork, and the earlier splash asset was a grid/contour illustration. This mobile-only update replaces those images with an original geological-layer symbol made for Earth Talk: a stylized rock section with strata in forest green, clay, moss, and neutral stone. It is not presented as an externally approved corporate logo.

Generated assets live at `mobile/assets/images/`:

- `splash-icon.png` — transparent geological-layer mark for the light native splash background.
- `splash-icon-dark.png` — transparent strata mark with light earth tones for the dark appearance.
- `icon.png` — app launcher icon with forest background.
- `android-icon-foreground.png`, `android-icon-background.png`, and `android-icon-monochrome.png` — Android adaptive icon layers.
- `favicon.png` — mobile web preview icon.

`mobile/scripts/create-brand-assets.mjs` regenerates these PNG assets with Node built-ins only. It does not download or include third-party artwork. The Home screen uses the same `icon.png` and displays the in-app line **“Every rock has a story.”**

## Expo configuration

`mobile/app.json` configures the Expo SDK 58 `expo-splash-screen` plugin, using `splash-icon.png`, a 190 dp image width, `resizeMode: contain`, and `#F5F7F4` background. SDK 58's installed plugin supports the `dark` variant; it uses `splash-icon-dark.png` on `#141B17`, matching the app's dark canvas. The icon and Android adaptive layers point at the app assets above. App name, slug, scheme, version, Android package, and iOS deployment configuration were preserved. Expo SDK 58 plugin configuration was validated by `npm run check:expo` and included in the Android JavaScript export.

The light/dark native splash backgrounds match the two app canvases and hand off via `expo-splash-screen` (`preventAutoHideAsync` -> `hideAsync`) into the full-screen `AnimatedSplashScreen` (`mobile/components/AnimatedSplashScreen.tsx`):

1. **Background Image (`splash-bg.jpg`)**: Full-bleed vertical Rwanda Virunga geological highlands backdrop with a gentle Ken Burns camera drift.
2. **Smooth Multi-Stop Gradient Overlay (`mobile/utils/splashConfig.ts`)**: 36-band smoothstep-interpolated atmospheric gradient from translucent slate-emerald at the top (`rgba(6, 22, 30, 0.24)`) through deep emerald-obsidian behind the logo (`rgba(6, 24, 31, 0.78)`) to grounded nocturnal shadow at the bottom (`rgba(4, 14, 20, 0.94)`).
3. **Choreographed Logo Entrance (`brand-mark.png`)**: Concentric geospatial contour rings, soft emerald-sky aura, spring pin-drop entrance of the official Earth Talk pin-globe emblem with a specular light sweep, and staggered `Earth Talk — DISCOVER EARTH. TOGETHER.` lockup reveal.
4. **Bottom 3-Dot Wave Loader & Transition to Home**: Safe-area-anchored 3-dot sinusoidal wave loader echoing the three conversation dots inside the Earth Talk globe. Respects `AccessibilityInfo.isReduceMotionEnabled()` and cross-dissolves cleanly into the **Home** screen (`/(tabs)/index`) once entrance choreography and auth hydration complete.

## Platform and verification

The splash configuration is consumed by native iOS and Android builds through Expo prebuild/config plugins, while `AnimatedSplashScreen` uses React Native's native-driver `Animated` API (`transform` and `opacity` only) for 60fps execution across iOS, Android, and Expo Web.
