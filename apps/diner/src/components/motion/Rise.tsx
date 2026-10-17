import { useEffect, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface RiseProps {
  readonly children: ReactNode;
  /** Milliseconds before this block starts — stagger a column of cards by `index * RISE_STAGGER_MS`. */
  readonly delay?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/** The gap between one card's rise and the next one's. */
export const RISE_STAGGER_MS = 45;
/** Past this many, cards appear at once: a long list should not take a second to settle. */
export const RISE_STAGGER_CAP = 8;
const RISE_MS = 420;
const RISE_FROM = 12;

/** The delay for the `index`th item of a staggered list. */
export function riseDelay(index: number): number {
  return Math.min(index, RISE_STAGGER_CAP) * RISE_STAGGER_MS;
}

/**
 * A block that fades in while drifting up 12px — the entrance every screen's
 * content makes, and every card in a list, one after the other.
 *
 * Plays once, on mount. Under reduced motion the block is simply there.
 */
export function Rise({ children, delay = 0, style }: RiseProps) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(reduced ? 1 : 0));

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: RISE_MS,
      delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, reduced]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [RISE_FROM, 0] });
  return (
    <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
