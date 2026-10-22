import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors, fontWeight, layout, radius, shadows, space } from '../../theme';
import { usePressScale } from '../motion/usePressScale';
import { Text } from '../Text';

export interface BookCtaProps {
  readonly label: string;
  /** A quieter second line under the label — "Table 4 · Tomorrow 19:00 · 2 guests". */
  readonly caption?: string;
  /** What a screen reader hears; the label when not given. */
  readonly accessibilityLabel?: string;
  /** The calendar with a heart before the label. */
  readonly glyph?: boolean;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly onPress: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The one brand pill a booking screen is built around: Book a Table on a
 * place, Book (with what is being booked under it) on the booking screen.
 */
export function BookCta({
  label,
  caption,
  accessibilityLabel,
  glyph = false,
  disabled = false,
  busy = false,
  onPress,
  style,
}: BookCtaProps) {
  const press = usePressScale();
  return (
    <Animated.View style={[press.style, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled, busy }}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.pill,
          caption ? styles.tall : null,
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <View style={styles.line}>
          {glyph ? (
            <View aria-hidden>
              <CalendarHeartGlyph size={18} color={colors.onPrimary} />
            </View>
          ) : null}
          <Text numberOfLines={1} style={styles.label}>
            {label}
          </Text>
        </View>
        {caption ? (
          <Text numberOfLines={1} style={styles.caption}>
            {caption}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export interface CtaFooterProps {
  readonly children: ReactNode;
  /** The device's bottom inset; the footer adds its own breathing room under it. */
  readonly bottomInset: number;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
}

/**
 * The bottom of a booking screen: the ground fades in over the last of the
 * scrolled content, then holds solid behind the button.
 */
export function CtaFooter({ children, bottomInset, onLayout }: CtaFooterProps) {
  return (
    <View
      pointerEvents="box-none"
      onLayout={onLayout}
      style={[styles.footer, { paddingBottom: bottomInset + space.lg }]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[colors.backgroundClear, colors.background]}
        style={styles.fade}
      />
      {children}
    </View>
  );
}

/** The design's calendar with a heart in it, drawn in one stroke. Decorative. */
export function CalendarHeartGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Rect x={3} y={5} width={18} height={16} rx={3} />
      <Path d="M8 3v4" />
      <Path d="M16 3v4" />
      <Path d="M3 10h18" />
      <Path d="M12 18.2s-3-1.8-3-3.8a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2-3 3.8-3 3.8z" />
    </Svg>
  );
}

/** How far the fade reaches up over the content above the button. */
const FADE = 28;

const styles = StyleSheet.create({
  pill: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandEdge,
    ...shadows.brand,
  },
  tall: { minHeight: layout.controlHeightLarge, paddingVertical: space.xs },
  pressed: { backgroundColor: colors.brandPressed },
  disabled: { opacity: 0.35 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { fontSize: 15, lineHeight: 20, fontWeight: fontWeight.bold, color: colors.onPrimary },
  caption: { fontSize: 12.5, lineHeight: 16, color: colors.onPrimary },
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    backgroundColor: colors.background,
  },
  fade: { position: 'absolute', left: 0, right: 0, top: -FADE, height: FADE },
});
