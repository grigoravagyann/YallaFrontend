import { useEffect, useRef, useState } from 'react';
import { Animated, type StyleProp, type TextStyle } from 'react-native';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Text } from '../Text';

export interface CountUpProps {
  /** The number to show; a change rolls the display from the last value to it. */
  readonly value: number;
  /** Turns the in-between number into the string on screen (currency, grouping). */
  readonly format: (value: number) => string;
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
export function CountUp({ value, format, style, accessibilityLabel }: CountUpProps) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const animated = useRef(new Animated.Value(value)).current;
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    const from = previous.current;
    previous.current = value;
    if (reduced) {
      setShown(value);
      return;
    }
    animated.setValue(from);
    const id = animated.addListener(({ value: current }) => setShown(current));
    const run = Animated.timing(animated, {
      toValue: value,
      duration: ROLL_MS,
      useNativeDriver: false,
    });
    run.start(() => {
      animated.removeListener(id);
      setShown(value);
    });
    return () => {
      run.stop();
      animated.removeListener(id);
    };
  }, [animated, reduced, value]);

  return (
    <Text style={style} accessibilityLabel={accessibilityLabel ?? format(value)}>
      {format(Math.round(shown))}
    </Text>
  );
}
