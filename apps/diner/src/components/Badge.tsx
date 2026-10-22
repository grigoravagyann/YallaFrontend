import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  actionIcon,
  badgeColors,
  badgeVariants,
  fontWeight,
  radius,
  space,
  typography,
  type BadgeTone,
  type BadgeVariant,
} from '../theme';
import { Text } from './Text';

export type { BadgeTone, BadgeVariant } from '../theme';

/**
 * The colours live in `src/theme/badges.ts`, so the contrast test can hold
 * every variant in both tones without rendering one.
 */
export { badgeVariants };

export interface BadgeProps {
  readonly variant: BadgeVariant;
  /** `solid` on photos and in the table bar; `soft` on white cards. */
  readonly tone?: BadgeTone;
  /** A small status dot before the label ("● Free"). */
  readonly dot?: boolean;
  /**
   * `status` is the order and booking pill: 24 high, 12px label, no border —
   * Preparing, Served, Awaiting confirmation.
   */
  readonly size?: 'sm' | 'md' | 'status';
  /** Replaces the variant's translated label — e.g. a count. */
  readonly label?: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function Badge({
  variant,
  tone = 'solid',
  dot = false,
  size = 'md',
  label,
  style,
}: BadgeProps) {
  const { t } = useTranslation('diner');
  const { background, foreground, edge } = badgeColors(variant, tone);
  const text = label ?? t(badgeVariants[variant].labelKey);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={text}
      style={[
        styles.base,
        size === 'sm' ? styles.sm : size === 'status' ? styles.status : styles.md,
        { backgroundColor: background },
        edge ? { borderWidth: 1, borderColor: edge } : null,
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: foreground }]} /> : null}
      {variant === 'popular' && !dot ? (
        <Ionicons name={actionIcon.star} size={size === 'sm' ? 11 : 13} color={foreground} />
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.label, size !== 'md' && styles.labelSm, { color: foreground }]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    gap: space.xs + 2,
  },
  md: { paddingHorizontal: space.md - 2, paddingVertical: space.xs + 1 },
  sm: { paddingHorizontal: space.sm + 2, paddingVertical: 3 },
  status: { height: 24, paddingHorizontal: space.sm + 2, gap: 6, borderRadius: 12 },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  label: { ...typography.caption, fontWeight: fontWeight.bold },
  labelSm: { fontSize: 12, lineHeight: 16 },
});
