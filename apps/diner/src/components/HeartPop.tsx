import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../lib/haptics';

export interface HeartPopProps {
  /**
   * Bumped by the screen each time the person taps to save. Only a change
   * plays the pop — never the first render, never favourites arriving from the
   * server or from storage, never an unsave.
   */
  readonly popKey: number;
  readonly children: ReactNode;
  /** Placement — the wrapper is what sits on the photo. */
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The little celebration when a place is saved: the heart dips, swells past
 * its size and settles. The caller gives the light tap in the hand (see
 * `useSavePop`), so the pop and the buzz both follow the press itself.
 * Anyone who asked their phone for less motion gets the tap without the bounce.
 */
export function HeartPop({ popKey, children, style }: HeartPopProps) {
  const reducedMotion = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  // The key last played, so a reduced-motion change never replays an old pop.
  const played = useRef(0);

  useEffect(() => {
    if (popKey === played.current) return;
    played.current = popKey;
    if (reducedMotion) return;
    scale.setValue(1);
    const pop = Animated.sequence([
      Animated.timing(scale, { toValue: 0.78, duration: 90, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 16 }),
    ]);
    pop.start();
    return () => {
      // Interrupted (another tap, the screen going away): settle at full size
      // rather than freeze mid-dip.
      pop.stop();
      scale.setValue(1);
    };
  }, [popKey, reducedMotion, scale]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

/**
 * The press side of the pop: call `onSavePress(saving)` from the heart's
 * `onPress`, with whether this tap is saving (not unsaving). A save gives one
 * light tap in the hand and bumps the key `HeartPop` animates on.
 */
export function useSavePop(): {
  readonly popKey: number;
  readonly onSavePress: (saving: boolean) => void;
} {
  const [popKey, setPopKey] = useState(0);
  const onSavePress = useCallback((saving: boolean) => {
    if (!saving) return;
    haptics.tap();
    setPopKey((key) => key + 1);
  }, []);
  return { popKey, onSavePress };
}
