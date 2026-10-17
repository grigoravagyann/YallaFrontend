import { useEffect, useState } from 'react';
import { Animated, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Text } from '../Text';

export interface CountUpProps {
  /** The number to show; a change rolls the display from the last value to it. */
  readonly value: number;
  /** Turns the in-between number into the string on screen (currency, grouping). */
  readonly format: (value: number) => string;
  /** Set in the display serif, like the other big figures. */
  readonly display?: boolean;
  readonly style?: StyleProp<TextStyle>;
  readonly accessibilityLabel?: string;
}

const ROLL_MS = 700;

/**
 * A figure that rolls to its new value instead of jumping — the bill total
 * when the kitchen adds a line. The first render shows the value at once; only
 * changes roll. A JS-driven value: text cannot be animated on the UI thread,
 * and seven hundred milliseconds of a dozen updates is nothing.
 */
export function CountUp({
  value,
  format,
  display = false,
  style,
  accessibilityLabel,
}: CountUpProps) {
  const reduced = useReducedMotion();
  const [animated] = useState(() => new Animated.Value(value));
  const [shown, setShown] = useState(value);

  // The display follows the animated value; subscribed once for the life of the figure.
  useEffect(() => {
    const id = animated.addListener(({ value: current }) => setShown(current));
    return () => animated.removeListener(id);
  }, [animated]);

  // A new value rolls there (instantly under reduced motion); the same value is a no-op.
  useEffect(() => {
    const run = Animated.timing(animated, {
      toValue: value,
      duration: reduced ? 0 : ROLL_MS,
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [animated, reduced, value]);

  return (
    <Text display={display} style={style} accessibilityLabel={accessibilityLabel ?? format(value)}>
      {format(Math.round(shown))}
    </Text>
  );
}
