import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, iconSize, layout, radius, shadows, type IoniconName } from '../theme';

export type IconButtonVariant = 'surface' | 'translucent' | 'primary' | 'ghost';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps {
  readonly icon: IoniconName;
  readonly onPress: () => void;
  /** Required: an icon alone says nothing to a screen reader. */
  readonly accessibilityLabel: string;
  /** `sm` 36 · `md` 44 · `lg` 52. Small ones keep a 44pt hit area via `hitSlop`. */
  readonly size?: IconButtonSize;
  /**
   * `surface` — white with a thin border, on cream (the map button on Explore).
   * `translucent` — a dark glass circle with a white glyph, on photos.
   * `primary` — brown fill, white glyph (the "my location" button).
   * `ghost` — no background; a bare glyph that still gets a 44pt target.
   */
  readonly variant?: IconButtonVariant;
  /** `circle` by default; `square` uses the tile radius (the map button). */
  readonly shape?: 'circle' | 'square';
  /** Overrides the variant's glyph colour — a red filled heart, say. */
  readonly iconColor?: string;
  readonly disabled?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

const SIZE: Record<IconButtonSize, number> = { sm: 36, md: layout.touchTarget, lg: 52 };
const GLYPH: Record<IconButtonSize, number> = { sm: iconSize.md, md: iconSize.lg, lg: iconSize.lg };

const glyphColor: Record<IconButtonVariant, string> = {
  surface: colors.text,
  translucent: colors.onImage,
  primary: colors.onPrimary,
  ghost: colors.text,
};

/**
 * A single glyph you can press: back, heart, share, map, locate, zoom.
 */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 'md',
  variant = 'surface',
  shape = 'circle',
  iconColor,
  disabled = false,
  style,
}: IconButtonProps) {
  const side = SIZE[size];
  const slop = Math.max(0, (layout.touchTarget - side) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={slop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { width: side, height: side, borderRadius: shape === 'circle' ? radius.pill : radius.tile },
        styles[variant],
        pressed && pressedStyles[variant],
        disabled && styles.disabled,
        style,
      ]}
    >
      <Ionicons name={icon} size={GLYPH[size]} color={iconColor ?? glyphColor[variant]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 },
  surface: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  translucent: { backgroundColor: colors.glass },
  primary: { backgroundColor: colors.primary, ...shadows.float },
  ghost: { backgroundColor: 'transparent' },
});

const pressedStyles: Record<IconButtonVariant, ViewStyle> = {
  surface: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong },
  translucent: { backgroundColor: colors.overlayDark },
  primary: { backgroundColor: colors.primaryPressed },
  ghost: { backgroundColor: colors.primarySoft },
};
