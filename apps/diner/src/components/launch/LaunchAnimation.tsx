import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import MARK from '../../../assets/images/splash-mark.png';
import WORDMARK from '../../../assets/images/splash-wordmark.png';
import { LAUNCH_GROUND, LAUNCH_INK, LAUNCH_LOGO_SIZE, MARK_DROP, MARK_STROKES } from './mark';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// The native splash is bare white, so nothing jumps when this takes over.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** When each stroke starts and how long it draws, in ms: they overlap, one hand drawing. */
const DRAW_TIMING = {
  fork: { delay: 0, duration: 460 },
  plate: { delay: 300, duration: 640 },
  inner: { delay: 520, duration: 560 },
  knife: { delay: 760, duration: 520 },
} as const;
/**
 * The drawn lines hand over to the logo's own mark. Quick, so the traced line
 * and the real one are never both on screen long enough to read as a double.
 */
const SETTLE_AT = 1220;
const SETTLE_MS = 180;
/** Then the wordmark rises into place under it. */
const WORDMARK_AT = 1260;
const WORDMARK_MS = 420;
const WORDMARK_RISE = 10;
/** Held whole for a beat, then the logo eases forward as the app shows through. */
const HOLD_MS = 220;
const EXIT_MS = 300;
const EXIT_SCALE = 1.06;

export interface LaunchAnimationProps {
  /** The app has what it needs for its first screen; the curtain may lift once the logo is drawn. */
  readonly appReady: boolean;
}

/**
 * The opening: on white, the fork, the plate and the knife are drawn in one
 * burgundy line as in the logo; the line gives way to the logo's own mark, the
 * SHURJ wordmark rises in beneath it, and the app fades up from underneath as
 * the logo eases forward. Shown once per launch. With Reduce Motion on, the
 * logo simply appears and fades.
 */
export function LaunchAnimation({ appReady }: LaunchAnimationProps) {
  const [gone, setGone] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [progress] = useState(() =>
    Object.fromEntries(MARK_STROKES.map((s) => [s.id, new Animated.Value(0)])),
  );
  const [settle] = useState(() => new Animated.Value(0));
  const [wordmark] = useState(() => new Animated.Value(0));
  const [exit] = useState(() => new Animated.Value(0));
  const [waiting] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let cancelled = false;
    void SplashScreen.hideAsync().catch(() => undefined);
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          settle.setValue(1);
          wordmark.setValue(1);
          setDrawn(true);
          return;
        }
        Animated.parallel([
          ...MARK_STROKES.map((stroke) =>
            Animated.timing(progress[stroke.id]!, {
              toValue: 1,
              delay: DRAW_TIMING[stroke.id].delay,
              duration: DRAW_TIMING[stroke.id].duration,
              easing: Easing.inOut(Easing.cubic),
              useNativeDriver: false,
            }),
          ),
          Animated.timing(settle, {
            toValue: 1,
            delay: SETTLE_AT,
            duration: SETTLE_MS,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(wordmark, {
            toValue: 1,
            delay: WORDMARK_AT,
            duration: WORDMARK_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (!cancelled) setDrawn(true);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [progress, settle, wordmark]);

  // Drawn but the app is still loading: the logo breathes gently, so it never looks frozen.
  useEffect(() => {
    if (!drawn || appReady) return;
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(waiting, {
          toValue: 0.72,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(waiting, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    breathe.start();
    return () => {
      breathe.stop();
      Animated.timing(waiting, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    };
  }, [drawn, appReady, waiting]);

  useEffect(() => {
    if (!drawn || !appReady) return;
    Animated.timing(exit, {
      toValue: 1,
      delay: HOLD_MS,
      duration: EXIT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => setGone(true));
  }, [drawn, appReady, exit]);

  if (gone) return null;

  const lines = settle.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const curtain = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const forward = exit.interpolate({ inputRange: [0, 1], outputRange: [1, EXIT_SCALE] });
  const rise = wordmark.interpolate({ inputRange: [0, 1], outputRange: [WORDMARK_RISE, 0] });
  // Drawn alone on the optical centre, the mark lifts as the wordmark arrives.
  const lift = wordmark.interpolate({ inputRange: [0, 1], outputRange: [MARK_DROP, 0] });

  return (
    <Animated.View
      testID="launch-animation"
      pointerEvents={drawn && appReady ? 'none' : 'auto'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.curtain, { opacity: curtain }]}
    >
      <Animated.View style={[styles.logo, { opacity: waiting, transform: [{ scale: forward }] }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: lift }] }]}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: lines }]}>
            <Svg width="100%" height="100%" viewBox="0 0 1024 1024">
              {MARK_STROKES.map((stroke) => {
                const offset = progress[stroke.id]!.interpolate({
                  inputRange: [0, 1],
                  outputRange: [stroke.length, 0],
                });
                // A round cap draws a dot even for a zero-length dash: hidden until the line starts.
                const shown = progress[stroke.id]!.interpolate({
                  inputRange: [0, 0.03],
                  outputRange: [0, 1],
                  extrapolate: 'clamp',
                });
                const common = {
                  opacity: shown,
                  fill: 'none',
                  stroke: LAUNCH_INK,
                  strokeWidth: 6,
                  strokeLinecap: 'round' as const,
                  strokeLinejoin: 'round' as const,
                  strokeDasharray: [stroke.length, stroke.length],
                  strokeDashoffset: offset,
                };
                return stroke.kind === 'circle' ? (
                  <AnimatedCircle
                    key={stroke.id}
                    cx={stroke.cx}
                    cy={stroke.cy}
                    r={stroke.r}
                    {...common}
                  />
                ) : (
                  <AnimatedPath key={stroke.id} d={stroke.d} {...common} />
                );
              })}
            </Svg>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: settle }]}>
            <Image source={MARK} style={styles.image} resizeMode="contain" />
          </Animated.View>
        </Animated.View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: wordmark, transform: [{ translateY: rise }] },
          ]}
        >
          <Image source={WORDMARK} style={styles.image} resizeMode="contain" />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  curtain: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: LAUNCH_GROUND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: LAUNCH_LOGO_SIZE, height: LAUNCH_LOGO_SIZE },
  image: { width: '100%', height: '100%' },
});
