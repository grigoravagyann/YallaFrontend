import { useEffect, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, radius, shadows, space } from '../theme';

export interface BottomSheetCardProps {
  readonly visible: boolean;
  readonly children: ReactNode;
  /** Extra distance above the safe edge — room for a legend row under the card. */
  readonly bottomOffset?: number;
  /** 16 all round by default. */
  readonly padded?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

const SLIDE_FROM = 48;
const IN_MS = 220;
const OUT_MS = 160;

/**
 * One card that slides up from the bottom edge — the selected place on the
 * map, the selected table on the photo. Not a modal: nothing dims, the thing
 * behind it stays tappable, and it leaves the way it came.
 */
export function BottomSheetCard({
  visible,
  children,
  bottomOffset = 0,
  padded = true,
  style,
}: BottomSheetCardProps) {
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));
  const [mounted, setMounted] = useState(visible);
  // Mount the moment `visible` turns on (state adjusted during render, so the
  // card exists for the slide-in); unmount only after the slide-out finishes.
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? IN_MS : OUT_MS,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, progress]);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [SLIDE_FROM, 0] });

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        styles.card,
        padded && styles.padded,
        { bottom: insets.bottom + space.lg + bottomOffset },
        { opacity: progress, transform: [{ translateY }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    ...shadows.float,
  },
  padded: { padding: space.lg },
});
