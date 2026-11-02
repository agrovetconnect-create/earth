import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppLanguage } from '../utils/language';
import { buildSplashGradientBands, SPLASH_TIMING } from '../utils/splashConfig';

interface AnimatedSplashScreenProps {
  /** True once initial auth/storage hydration is ready. */
  appReady: boolean;
  /** Called as soon as the splash background is ready so native OS splash can hide seamlessly. */
  onBackgroundReady?: () => void;
  /** Called once the exit transition finishes so the overlay unmounts cleanly onto Home. */
  onFinish: () => void;
}

const DOT_COLORS = ['#FFFFFF', '#6EE7B7', '#93C5FD'] as const;

export function AnimatedSplashScreen({
  appReady,
  onBackgroundReady,
  onFinish,
}: AnimatedSplashScreenProps) {
  const { t } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compactHeight = height < 640;
  const gradientBands = useMemo(() => buildSplashGradientBands(36), []);

  const [reduceMotion, setReduceMotion] = useState(false);
  const [minDurationElapsed, setMinDurationElapsed] = useState(false);
  const [forceProceed, setForceProceed] = useState(false);

  const notifiedBgReadyRef = useRef(false);
  const exitStartedRef = useRef(false);

  // Master container exit values
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const containerScale = useRef(new Animated.Value(1)).current;

  // Full-bleed background Ken Burns camera drift
  const bgScale = useRef(new Animated.Value(1.12)).current;
  const bgTranslateY = useRef(new Animated.Value(-10)).current;

  // Geospatial contour rings & luminous aura behind the Earth Talk emblem
  const auraOpacity = useRef(new Animated.Value(0)).current;
  const auraScale = useRef(new Animated.Value(0.82)).current;
  const ring1Scale = useRef(new Animated.Value(0.45)).current;
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  const ring2Scale = useRef(new Animated.Value(0.45)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;

  // Earth Talk Pin-Globe Emblem entrance, hover & specular sheen sweep
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.66)).current;
  const logoTranslateY = useRef(new Animated.Value(-32)).current;
  const logoFloatY = useRef(new Animated.Value(0)).current;
  const sheenTranslateX = useRef(new Animated.Value(-180)).current;
  const sheenOpacity = useRef(new Animated.Value(0)).current;

  // Brand wordmark & subtitle choreography
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(16)).current;
  const dividerScaleX = useRef(new Animated.Value(0.15)).current;
  const dividerOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslateY = useRef(new Animated.Value(10)).current;

  // Bottom 3-dot wave loader
  const loaderOpacity = useRef(new Animated.Value(0)).current;
  const loaderTranslateY = useRef(new Animated.Value(12)).current;
  const dot1Phase = useRef(new Animated.Value(0)).current;
  const dot2Phase = useRef(new Animated.Value(0)).current;
  const dot3Phase = useRef(new Animated.Value(0)).current;

  const notifyBackgroundReady = useCallback(() => {
    if (notifiedBgReadyRef.current) return;
    notifiedBgReadyRef.current = true;
    onBackgroundReady?.();
  }, [onBackgroundReady]);

  // Safety fallback so native splash hides even if image onLoadEnd doesn't fire in web/test runtimes
  useEffect(() => {
    const fallbackTimer = setTimeout(notifyBackgroundReady, 380);
    return () => clearTimeout(fallbackTimer);
  }, [notifyBackgroundReady]);

  // Detect system Reduce Motion preference
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active) setReduceMotion(Boolean(enabled));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Minimum showcase timer + max hydration safety cap
  useEffect(() => {
    const minWait = reduceMotion
      ? SPLASH_TIMING.reducedMotionMinDisplayMs
      : SPLASH_TIMING.minDisplayMs;

    const minTimer = setTimeout(() => {
      setMinDurationElapsed(true);
    }, minWait);

    const maxWaitTimer = setTimeout(() => {
      setForceProceed(true);
    }, SPLASH_TIMING.maxHydrationWaitMs);

    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxWaitTimer);
    };
  }, [reduceMotion]);

  // Choreographed motion-graphics entrance + continuous 3-dot wave loader
  useEffect(() => {
    if (reduceMotion) {
      bgScale.setValue(1);
      bgTranslateY.setValue(0);
      auraOpacity.setValue(0.9);
      auraScale.setValue(1);
      logoOpacity.setValue(1);
      logoScale.setValue(1);
      logoTranslateY.setValue(0);
      titleOpacity.setValue(1);
      titleTranslateY.setValue(0);
      dividerOpacity.setValue(1);
      dividerScaleX.setValue(1);
      subtitleOpacity.setValue(1);
      subtitleTranslateY.setValue(0);
      loaderOpacity.setValue(1);
      loaderTranslateY.setValue(0);
      return;
    }

    const runningLoops: Animated.CompositeAnimation[] = [];

    // 1. Background slow aerial Ken Burns settle
    const bgMotion = Animated.parallel([
      Animated.timing(bgScale, {
        toValue: 1,
        duration: 2600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(bgTranslateY, {
        toValue: 0,
        duration: 2600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    // 2. Concentric geospatial contour rings + soft luminous aura
    const ringPulse1 = Animated.sequence([
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(ring1Opacity, {
          toValue: 0.85,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ring1Scale, {
          toValue: 1.52,
          duration: 1150,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(220),
          Animated.timing(ring1Opacity, {
            toValue: 0,
            duration: 930,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);

    const ringPulse2 = Animated.sequence([
      Animated.delay(280),
      Animated.parallel([
        Animated.timing(ring2Opacity, {
          toValue: 0.7,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ring2Scale, {
          toValue: 1.68,
          duration: 1200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(220),
          Animated.timing(ring2Opacity, {
            toValue: 0,
            duration: 980,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ]);

    const auraIntro = Animated.parallel([
      Animated.timing(auraOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(auraScale, {
        toValue: 1,
        damping: 14,
        stiffness: 95,
        mass: 0.9,
        useNativeDriver: true,
      }),
    ]);

    const auraBreath = Animated.loop(
      Animated.sequence([
        Animated.timing(auraScale, {
          toValue: 1.08,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(auraScale, {
          toValue: 0.96,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    // 3. Earth Talk Pin-Globe Emblem pin-drop & specular light sweep
    const logoEntrance = Animated.sequence([
      Animated.delay(110),
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          damping: 12,
          stiffness: 130,
          mass: 0.85,
          useNativeDriver: true,
        }),
        Animated.spring(logoTranslateY, {
          toValue: 0,
          damping: 13,
          stiffness: 135,
          mass: 0.85,
          useNativeDriver: true,
        }),
      ]),
    ]);

    const sheenSweep = Animated.sequence([
      Animated.delay(680),
      Animated.parallel([
        Animated.sequence([
          Animated.timing(sheenOpacity, {
            toValue: 0.85,
            duration: 180,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(sheenOpacity, {
            toValue: 0,
            duration: 460,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(sheenTranslateX, {
          toValue: 190,
          duration: 640,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);

    const logoGentleFloat = Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloatY, {
          toValue: -4,
          duration: 1350,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(logoFloatY, {
          toValue: 0,
          duration: 1350,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    // 4. Brand Wordmark + Divider + Tagline
    const typographyEntrance = Animated.sequence([
      Animated.delay(380),
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(dividerOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(dividerScaleX, {
          toValue: 1,
          duration: 380,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(subtitleTranslateY, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);

    // 5. Bottom 3-dot wave loader entrance & staggered sinusoidal wave loop
    const loaderIntro = Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(loaderOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(loaderTranslateY, {
          toValue: 0,
          duration: 420,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]);

    const createDotWave = (phase: Animated.Value, delayMs: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delayMs),
          Animated.timing(phase, {
            toValue: 1,
            duration: 340,
            easing: Easing.out(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(phase, {
            toValue: 0,
            duration: 340,
            easing: Easing.in(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, 360 - delayMs)),
        ])
      );

    const dot1Loop = createDotWave(dot1Phase, 0);
    const dot2Loop = createDotWave(dot2Phase, 140);
    const dot3Loop = createDotWave(dot3Phase, 280);

    bgMotion.start();
    ringPulse1.start();
    ringPulse2.start();
    auraIntro.start(({ finished }) => {
      if (finished) {
        runningLoops.push(auraBreath);
        auraBreath.start();
      }
    });
    logoEntrance.start(({ finished }) => {
      if (finished) {
        runningLoops.push(logoGentleFloat);
        logoGentleFloat.start();
      }
    });
    sheenSweep.start();
    typographyEntrance.start();
    loaderIntro.start();

    runningLoops.push(dot1Loop, dot2Loop, dot3Loop);
    dot1Loop.start();
    dot2Loop.start();
    dot3Loop.start();

    return () => {
      bgMotion.stop();
      ringPulse1.stop();
      ringPulse2.stop();
      auraIntro.stop();
      logoEntrance.stop();
      sheenSweep.stop();
      typographyEntrance.stop();
      loaderIntro.stop();
      for (const loop of runningLoops) {
        loop.stop();
      }
    };
  }, [
    auraOpacity,
    auraScale,
    bgScale,
    bgTranslateY,
    dividerOpacity,
    dividerScaleX,
    dot1Phase,
    dot2Phase,
    dot3Phase,
    loaderOpacity,
    loaderTranslateY,
    logoFloatY,
    logoOpacity,
    logoScale,
    logoTranslateY,
    reduceMotion,
    ring1Opacity,
    ring1Scale,
    ring2Opacity,
    ring2Scale,
    sheenOpacity,
    sheenTranslateX,
    subtitleOpacity,
    subtitleTranslateY,
    titleOpacity,
    titleTranslateY,
  ]);

  // Smooth cross-dissolve into Home once minimum animation duration + app hydration complete
  useEffect(() => {
    const canExit = (minDurationElapsed && appReady) || forceProceed;
    if (!canExit || exitStartedRef.current) return;
    exitStartedRef.current = true;

    Animated.parallel([
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: reduceMotion ? 180 : SPLASH_TIMING.exitDurationMs,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(containerScale, {
        toValue: reduceMotion ? 1 : 1.045,
        duration: reduceMotion ? 180 : SPLASH_TIMING.exitDurationMs,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinish();
    });
  }, [appReady, containerOpacity, containerScale, forceProceed, minDurationElapsed, onFinish, reduceMotion]);

  const dotPhases = [dot1Phase, dot2Phase, dot3Phase] as const;
  const combinedLogoY = Animated.add(logoTranslateY, logoFloatY);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={t('Loading Earth Talk')}
      pointerEvents="auto"
      style={[
        styles.root,
        {
          opacity: containerOpacity,
          transform: [{ scale: containerScale }],
        },
      ]}
    >
      {/* Layer 1: Full-bleed Rwanda geological highlands background photograph */}
      <Animated.Image
        accessibilityIgnoresInvertColors
        accessible={false}
        source={require('../assets/images/splash-bg.jpg')}
        resizeMode="cover"
        onLoadEnd={notifyBackgroundReady}
        onError={notifyBackgroundReady}
        style={[
          styles.backgroundImage,
          {
            transform: [{ scale: bgScale }, { translateY: bgTranslateY }],
          },
        ]}
      />

      {/* Layer 2: Smooth multi-stop vertical gradient overlay */}
      <View pointerEvents="none" style={styles.gradientOverlay}>
        {gradientBands.map((bgColor, idx) => (
          <View key={idx} style={[styles.gradientBand, { backgroundColor: bgColor }]} />
        ))}
      </View>

      {/* Layer 3: Center animated Earth Talk logo stage */}
      <View
        style={[
          styles.centerStage,
          {
            paddingTop: Math.max(insets.top, 8) + (compactHeight ? 8 : 20),
            paddingLeft: Math.max(insets.left, 24),
            paddingRight: Math.max(insets.right, 24),
          },
        ]}
      >
        <View style={[styles.emblemStage, compactHeight && styles.emblemStageCompact]}>
          {/* Geospatial contour ripple rings */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.contourRing,
              styles.contourRingPrimary,
              {
                opacity: ring1Opacity,
                transform: [{ scale: ring1Scale }],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.contourRing,
              styles.contourRingSecondary,
              {
                opacity: ring2Opacity,
                transform: [{ scale: ring2Scale }],
              },
            ]}
          />

          {/* Ambient emerald-sky halo behind the mark */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.auraGlow,
              {
                opacity: auraOpacity,
                transform: [{ scale: auraScale }],
              },
            ]}
          />

          {/* Earth Talk Pin-Globe Emblem */}
          <Animated.View
            style={[
              styles.emblemWrapper,
              {
                opacity: logoOpacity,
                transform: [{ translateY: combinedLogoY }, { scale: logoScale }],
              },
            ]}
          >
            <Image
              accessibilityIgnoresInvertColors
              accessible={false}
              source={require('../assets/images/icon.png')}
              resizeMode="contain"
              style={styles.emblemImage}
            />

            {/* Specular light sweep across the emblem */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.sheenBar,
                {
                  opacity: sheenOpacity,
                  transform: [{ translateX: sheenTranslateX }, { rotate: '22deg' }],
                },
              ]}
            />
          </Animated.View>
        </View>

        {/* Brand Wordmark & Subtitle matching Earth Talk lockup */}
        <Animated.View
          style={[
            styles.wordmarkRow,
            {
              opacity: titleOpacity,
              transform: [{ translateY: titleTranslateY }],
            },
          ]}
        >
          <Text style={styles.wordmarkEarth}>Earth</Text>
          <Text style={styles.wordmarkTalk}> Talk</Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.accentDivider,
            {
              opacity: dividerOpacity,
              transform: [{ scaleX: dividerScaleX }],
            },
          ]}
        />

        <Animated.Text
          style={[
            styles.subtitle,
            {
              opacity: subtitleOpacity,
              transform: [{ translateY: subtitleTranslateY }],
            },
          ]}
        >
          {t('DISCOVER EARTH. TOGETHER.')}
        </Animated.Text>
      </View>

      {/* Layer 4: Bottom 3-dot wave loader anchored in thumb/safe zone before entering Home */}
      <Animated.View
        style={[
          styles.bottomFooter,
          {
            paddingBottom: Math.max(insets.bottom, 16) + (compactHeight ? 12 : 24),
            paddingLeft: Math.max(insets.left, 24),
            paddingRight: Math.max(insets.right, 24),
            opacity: loaderOpacity,
            transform: [{ translateY: loaderTranslateY }],
          },
        ]}
      >
        <View style={styles.dotsCapsule}>
          {dotPhases.map((phase, index) => {
            const dotTranslateY = phase.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -7],
            });
            const dotScale = phase.interpolate({
              inputRange: [0, 1],
              outputRange: [0.86, 1.24],
            });
            const dotOpacity = phase.interpolate({
              inputRange: [0, 1],
              outputRange: [0.45, 1],
            });

            return (
              <Animated.View
                key={index}
                style={[
                  styles.loaderDot,
                  {
                    backgroundColor: DOT_COLORS[index],
                    opacity: reduceMotion ? 0.9 : dotOpacity,
                    transform: reduceMotion
                      ? []
                      : [{ translateY: dotTranslateY }, { scale: dotScale }],
                  },
                ]}
              />
            );
          })}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#06161E',
    zIndex: 9999,
    elevation: 9999,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'column',
  },
  gradientBand: {
    flex: 1,
    width: '100%',
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emblemStage: {
    width: 196,
    height: 196,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emblemStageCompact: {
    width: 140,
    height: 140,
    marginBottom: 6,
    transform: [{ scale: 0.78 }],
  },
  auraGlow: {
    position: 'absolute',
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: 'rgba(52, 168, 83, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(167, 243, 208, 0.22)',
  },
  contourRing: {
    position: 'absolute',
    width: 144,
    height: 144,
    borderRadius: 72,
    borderWidth: 1.25,
  },
  contourRingPrimary: {
    borderColor: 'rgba(110, 231, 183, 0.42)',
  },
  contourRingSecondary: {
    borderColor: 'rgba(147, 197, 253, 0.34)',
  },
  emblemWrapper: {
    width: 132,
    height: 158,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  emblemImage: {
    width: 126,
    height: 151,
  },
  sheenBar: {
    position: 'absolute',
    top: -30,
    bottom: -30,
    width: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.26)',
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  wordmarkEarth: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  wordmarkTalk: {
    fontSize: 40,
    fontWeight: '800',
    color: '#4ADE80',
    letterSpacing: -0.8,
  },
  accentDivider: {
    width: 48,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(110, 231, 183, 0.58)',
    marginTop: 10,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: 'rgba(241, 245, 249, 0.88)',
    letterSpacing: 3.1,
    textAlign: 'center',
  },
  bottomFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  dotsCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  loaderDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
});
