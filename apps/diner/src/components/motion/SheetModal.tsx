import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, radius, shadows, space } from '../../theme';

export interface SheetModalProps {
  readonly visible: boolean;
  /** The backdrop tap and Android back. Omit to make the sheet modal until its own button closes it. */
  readonly onRequestClose?: () => void;
  /** What a screen reader calls the backdrop button. */
  readonly closeLabel: string;
  /** The dialog's name. */
  readonly accessibilityLabel: string;
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

/** The veil fades; the sheet rises. Separate timings, so the sheet never drags a grey box up with it. */
const BACKDROP_IN_MS = 200;
const BACKDROP_OUT_MS = 180;
const SHEET_IN_MS = 340;
const SHEET_OUT_MS = 220;
/** Far enough to start below any phone's bottom edge. */
const SHEET_TRAVEL = 560;

/**
 * Every bottom sheet in the app: a dark veil that fades, a sheet that rises
 * from the bottom edge and settles, a grabber, the safe-area padding, and the
 * way back out. Mounted the moment it is asked for and unmounted only once the
 * way out has played, so both directions are seen.
 */
export function SheetModal({
  visible,
  onRequestClose,
  closeLabel,
  accessibilityLabel,
  children,
  style,
}: SheetModalProps) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [backdrop] = useState(() => new Animated.Value(0));
  const [rise] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (!mounted) return;
    const animation = Animated.parallel([
      Animated.timing(backdrop, {
        toValue: visible ? 1 : 0,
        duration: reduced ? 0 : visible ? BACKDROP_IN_MS : BACKDROP_OUT_MS,
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: visible ? 1 : 0,
        duration: reduced ? 0 : visible ? SHEET_IN_MS : SHEET_OUT_MS,
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [visible, mounted, backdrop, rise, reduced]);

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [SHEET_TRAVEL, 0] });

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onRequestClose ?? (() => undefined)}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
        <Pressable
          style={styles.fill}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onRequestClose}
          disabled={!onRequestClose}
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + space.xl, transform: [{ translateY }] },
          style,
        ]}
      >
        <View style={styles.grabber} />
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  fill: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    borderTopLeftRadius: radius.sheet + 4,
    borderTopRightRadius: radius.sheet + 4,
    backgroundColor: colors.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    gap: space.md,
    ...shadows.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    marginBottom: space.xs,
  },
});
