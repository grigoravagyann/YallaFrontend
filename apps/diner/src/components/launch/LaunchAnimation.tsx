import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import LOGO from '../../../assets/images/splash-icon.png';
import { LAUNCH_GROUND, LAUNCH_INK, LAUNCH_LOGO_SIZE, MARK_STROKES } from './mark';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// The native splash is plain cream, so nothing jumps when this takes over.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** When each stroke starts and how long it draws, in ms — they overlap, one hand drawing. */
const DRAW_TIMING = {
  fork: { delay: 0, duration: 520 },
  plate: { delay: 360, duration: 760 },
  inner: { delay: 640, duration: 640 },
  knife: { delay: 900, duration: 600 },
} as const;
/** The drawn lines give way to the logo itself, wordmark and all. */
const REVEAL_AT = 1450;
const REVEAL_MS = 380;
/** Held whole for a beat, then the app shows through. */
const HOLD_MS = 260;
const FADE_OUT_MS = 320;

export interface LaunchAnimationProps {
  /** The app has what it needs for its first screen; the curtain may lift once the logo is drawn. */
  readonly appReady: boolean;
}

/**
 * The opening: on the logo's cream, the fork, the plate and the knife are drawn
 * in one burgundy line as in the logo, the full logo (with the SHURJ wordmark)
 * settles in, and the app fades up from underneath. Shown once per launch. With
 * Reduce Motion on, the logo simply appears and fades.
 */
export function LaunchAnimation({ appReady }: LaunchAnimationProps) {
  const [gone, setGone] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [progress] = useState(() =>
    Object.fromEntries(MARK_STROKES.map((s) => [s.id, new Animated.Value(0)])),
  );
  const [reveal] = useState(() => new Animated.Value(0));
  const [curtain] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let cancelled = false;
    void SplashScreen.hideAsync().catch(() => undefined);
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          reveal.setValue(1);
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
          Animated.timing(reveal, {
            toValue: 1,
            delay: REVEAL_AT,
            duration: REVEAL_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (!cancelled) setDrawn(true);
        });
      });
    return () => {
      cancelled = true;
    };
  }, [progress, reveal]);

  useEffect(() => {
    if (!drawn || !appReady) return;
    Animated.timing(curtain, {
      toValue: 0,
      delay: HOLD_MS,
      duration: FADE_OUT_MS,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start(() => setGone(true));
  }, [drawn, appReady, curtain]);

  if (gone) return null;

  const lines = reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View
      testID="launch-animation"
      pointerEvents={drawn && appReady ? 'none' : 'auto'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.curtain, { opacity: curtain }]}
    >
      <View style={styles.logo}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: lines }]}>
          <Svg width="100%" height="100%" viewBox="0 0 1024 1024">
            {MARK_STROKES.map((stroke) => {
              const offset = progress[stroke.id]!.interpolate({
                inputRange: [0, 1],
                outputRange: [stroke.length, 0],
              });
              const common = {
                fill: 'none',
                stroke: LAUNCH_INK,
                strokeWidth: 5,
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
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: reveal }]}>
          <Image source={LOGO} style={styles.image} resizeMode="contain" />
        </Animated.View>
      </View>
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
