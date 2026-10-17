import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  colors,
  iconSize,
  radius,
  shadows,
  space,
  typography,
  type IoniconName,
} from '../../theme';
import { Text } from '../Text';

interface ToastState {
  readonly text: string | null;
  readonly icon: IoniconName;
  readonly stamp: number;
  readonly show: (text: string, icon?: IoniconName) => void;
  readonly hide: () => void;
}

/**
 * One line said from the top of the screen and gone again — "The waiter was
 * told", "Booking cancelled". A store, so a screen can say it from anywhere and
 * the host draws it; the newest message replaces the one before.
 */
export const useToast = create<ToastState>((set) => ({
  text: null,
  icon: 'checkmark',
  stamp: 0,
  show: (text, icon = 'checkmark') => set({ text, icon, stamp: Date.now() }),
  hide: () => set({ text: null }),
}));

const SHOW_MS = 3600;
const IN_MS = 420;
const OUT_MS = 260;

/**
 * Draws the current toast. Mount once near the top of a screen (or the root
 * layout): absolute, under the status bar, above everything.
 */
export function ToastHost() {
  const { text, icon, stamp, hide } = useToast();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (!text) return;
    setShown(text);
    progress.setValue(0);
    const run = Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: reduced ? 0 : IN_MS,
        useNativeDriver: true,
      }),
      Animated.delay(SHOW_MS),
      Animated.timing(progress, {
        toValue: 0,
        duration: reduced ? 0 : OUT_MS,
        useNativeDriver: true,
      }),
    ]);
    run.start(({ finished }) => {
      if (finished) {
        setShown(null);
        hide();
      }
    });
    return () => run.stop();
  }, [text, stamp, progress, reduced, hide]);

  if (!shown) return null;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityRole="alert"
      style={[
        styles.toast,
        { top: insets.top + space.md, opacity: progress, transform: [{ translateY }] },
      ]}
    >
      <Ionicons name={icon} size={iconSize.md} color={colors.onPrimary} />
      <Text numberOfLines={2} style={styles.text}>
        {shown}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandEdge,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    zIndex: 10,
    ...shadows.float,
  },
  text: { ...typography.body, color: colors.onPrimary, flexShrink: 1 },
});
