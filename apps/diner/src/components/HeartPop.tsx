import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../lib/haptics';

export interface HeartPopProps {
  /** The place is saved. Turning on plays the pop; turning off is quiet. */
  readonly active: boolean;
  readonly children: ReactNode;
  /** Placement — the wrapper is what sits on the photo. */
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The little celebration when a place is saved: the heart dips, swells past
 * its size and settles, with one light tap in the hand.
 *
 * Only a change to `active` plays it — a card that renders already saved is
 * still. Removing a favourite gets no flourish, and anyone who asked their
 * phone for less motion gets the tap without the bounce.
 */
export function HeartPop({ active, children, style }: HeartPopProps) {
  const reducedMotion = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const previous = useRef(active);

  useEffect(() => {
    const turnedOn = active && !previous.current;
    previous.current = active;
    if (!turnedOn) return;
    haptics.tap();
    if (reducedMotion) return;
    scale.setValue(1);
    const pop = Animated.sequence([
      Animated.timing(scale, { toValue: 0.78, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 14,
        bounciness: 16,
      }),
    ]);
    pop.start();
    return () => pop.stop();
  }, [active, reducedMotion, scale]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
