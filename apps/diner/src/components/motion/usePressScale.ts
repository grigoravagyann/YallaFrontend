import { useCallback, useState } from 'react';
import { Animated } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/** How small a pressed control gets. */
const PRESSED_SCALE = 0.97;

/**
 * The squeeze every tappable gives back: scale to 0.97 on press-in, a short
 * spring back on release. Spread the handlers onto a `Pressable` and put
 * `style` on an `Animated.View` inside it (the Pressable itself must not be
 * animated, or its hit box shrinks with it).
 *
 * Still for anyone who asked their phone for less motion.
 */
export function usePressScale(): {
  readonly onPressIn: () => void;
  readonly onPressOut: () => void;
  readonly style: { readonly transform: readonly [{ readonly scale: Animated.Value }] };
} {
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const to = useCallback(
    (value: number) => {
      if (reduced) return;
      Animated.spring(scale, {
        toValue: value,
        useNativeDriver: true,
        speed: 40,
        bounciness: 4,
      }).start();
    },
    [reduced, scale],
  );
  const onPressIn = useCallback(() => to(PRESSED_SCALE), [to]);
  const onPressOut = useCallback(() => to(1), [to]);
  return { onPressIn, onPressOut, style: { transform: [{ scale }] } };
}
