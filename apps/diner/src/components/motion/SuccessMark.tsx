import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, radius, type IoniconName } from '../../theme';

export interface SuccessMarkProps {
  /**
   * `success` is the green check; `pending` the burgundy clock; `declined` the red
   * cross, for a request the venue could not take.
   */
  readonly tone?: 'success' | 'pending' | 'declined';
  readonly icon?: IoniconName;
  readonly size?: number;
  readonly style?: StyleProp<ViewStyle>;
}

const POP_MS = 520;
const DRAW_MS = 420;
/** When the glyph starts drawing: as the pop lands, on the clock. */
const DRAW_DELAY_MS = 280;

/**
 * The big green circle that pops onto a success screen, its check drawn in a
 * beat later. Decorative: the heading beside it says what happened.
 *
 * The glyph runs **beside** the pop, on a delay, never after it. It used to
 * wait for the pop's spring to come to rest — and a spring advances at most
 * 64 ms of its own time per frame, so wherever frames were sparse (a hidden or
 * throttled tab, a phone busy reading the booking again) it rested seconds
 * late or never, and the screen showed a plain coloured circle with no check,
 * clock or cross in it. A timing lands by the wall clock however few frames it
 * gets.
 */
export function SuccessMark({ tone = 'success', icon, size = 88, style }: SuccessMarkProps) {
  const reduced = useReducedMotion();
  const [pop] = useState(() => new Animated.Value(reduced ? 1 : 0));
  const [draw] = useState(() => new Animated.Value(reduced ? 1 : 0));

  useEffect(() => {
    if (reduced) {
      pop.setValue(1);
      draw.setValue(1);
      return;
    }
    const run = Animated.parallel([
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 14 }),
      Animated.timing(draw, {
        toValue: 1,
        duration: DRAW_MS,
        delay: DRAW_DELAY_MS,
        useNativeDriver: true,
      }),
    ]);
    run.start();
    return () => run.stop();
  }, [draw, pop, reduced]);

  const fill: readonly [string, string] =
    tone === 'success'
      ? [colors.success, colors.successStrong]
      : tone === 'declined'
        ? [colors.error, colors.errorStrong]
        : [colors.info, colors.infoStrong];
  const glyph =
    icon ?? (tone === 'success' ? 'checkmark' : tone === 'declined' ? 'close' : 'time-outline');
  const glyphColor =
    tone === 'success'
      ? colors.onSuccessStrong
      : tone === 'declined'
        ? colors.onErrorStrong
        : colors.onInfoStrong;
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const glyphScale = draw.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.circle,
        { width: size, height: size, opacity: pop, transform: [{ scale }] },
        tone === 'success'
          ? styles.glowSuccess
          : tone === 'declined'
            ? styles.glowDeclined
            : styles.glowPending,
        style,
      ]}
    >
      <LinearGradient colors={fill} style={styles.fill} />
      <Animated.View style={{ opacity: draw, transform: [{ scale: glyphScale }] }}>
        <Ionicons name={glyph} size={size / 2} color={glyphColor} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  fill: { ...StyleSheet.absoluteFill, borderRadius: radius.pill },
  glowSuccess: {
    shadowColor: colors.success,
    shadowOpacity: 0.45,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  glowDeclined: {
    shadowColor: colors.error,
    shadowOpacity: 0.35,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  glowPending: {
    shadowColor: colors.info,
    shadowOpacity: 0.45,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
});

// Keeps the duration in one place for the screens that stagger after the mark.
export const SUCCESS_MARK_MS = Math.max(POP_MS, DRAW_DELAY_MS + DRAW_MS);
