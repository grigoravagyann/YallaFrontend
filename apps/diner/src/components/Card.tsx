import type { ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, shadows, space } from '../theme';
import { splitStyle } from './motion/splitStyle';
import { usePressScale } from './motion/usePressScale';

export interface CardProps {
  readonly children: ReactNode;
  /** Makes the whole card a button with a pressed state. */
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  /** 16 all round. Off for photo-first cards that bleed to their edge. */
  readonly padded?: boolean;
  /** `card` (16) by default; `hero` (20) for the photo hero on Explore. */
  readonly radiusToken?: 'card' | 'hero';
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A white surface with soft corners, edged by the 1px hairline. Everything on
 * the white ground that is not a control sits in one.
 */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  padded = true,
  radiusToken = 'card',
  style,
}: CardProps) {
  const base = [styles.card, { borderRadius: radius[radiusToken] }, padded && styles.padded];
  if (!onPress) {
    return <View style={[base, style]}>{children}</View>;
  }
  return (
    <PressableCard
      base={base}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      {children}
    </PressableCard>
  );
}

function PressableCard({
  base,
  onPress,
  accessibilityLabel,
  style,
  children,
}: {
  readonly base: StyleProp<ViewStyle>;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string | undefined;
  readonly style?: StyleProp<ViewStyle>;
  readonly children: ReactNode;
}) {
  const press = usePressScale();
  const placed = splitStyle(style);
  return (
    <Animated.View style={[press.style, placed.outer]}>
      <Pressable
        accessibilityRole="button"
        {...(accessibilityLabel ? { accessibilityLabel } : {})}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [base, pressed && styles.pressed, placed.inner]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // No `overflow: 'hidden'` here: iOS clips the shadow with it. Children that
  // must respect the corners (a photo) clip themselves — see `PhotoImage`.
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  padded: { padding: space.lg },
  pressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
});
