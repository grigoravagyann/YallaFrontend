import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, radius, type IoniconName } from '../../theme';

export interface SuccessMarkProps {
  /** `success` is the green check; `pending` the blue clock. */
  readonly tone?: 'success' | 'pending';
  readonly icon?: IoniconName;
  readonly size?: number;
  readonly style?: StyleProp<ViewStyle>;
}

const POP_MS = 520;
const DRAW_MS = 420;

/**
 * The big green circle that pops onto a success screen, its check drawn in a
 * beat later. Decorative: the heading beside it says what happened.
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
    const run = Animated.sequence([
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 14 }),
      Animated.timing(draw, { toValue: 1, duration: DRAW_MS, useNativeDriver: true }),
    ]);
    run.start();
    return () => run.stop();
  }, [draw, pop, reduced]);

  const fill: readonly [string, string] =
    tone === 'success' ? [colors.success, colors.successStrong] : [colors.info, colors.infoStrong];
  const glyph = icon ?? (tone === 'success' ? 'checkmark' : 'time-outline');
  const glyphColor = tone === 'success' ? colors.onSuccessStrong : colors.onInfoStrong;
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const glyphScale = draw.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.circle,
        { width: size, height: size, opacity: pop, transform: [{ scale }] },
        tone === 'success' ? styles.glowSuccess : styles.glowPending,
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
  glowPending: {
    shadowColor: colors.info,
    shadowOpacity: 0.45,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
});

// Keeps the duration in one place for the screens that stagger after the mark.
export const SUCCESS_MARK_MS = POP_MS + DRAW_MS;
