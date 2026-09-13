import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fontWeight, radius, space, typography } from '../theme';
import { Text } from './Text';

export type BadgeVariant =
  | 'open'
  | 'closed'
  | 'popular'
  | 'new'
  | 'reserved'
  | 'occupied'
  | 'free'
  | 'confirmed'
  | 'preparing'
  | 'inProgress'
  | 'ready'
  | 'completed'
  | 'cancelled';

export type BadgeTone = 'solid' | 'soft';

interface BadgeSpec {
  /** Base colour: the fill when solid, the text and dot when soft. */
  readonly color: string;
  /** Tinted fill when soft. */
  readonly soft: string;
  /** Key in the `diner` namespace. */
  readonly labelKey: string;
}

/**
 * What each badge means, and the one colour it is allowed to be.
 *
 * Open / Free / Confirmed / Ready are green; Reserved / Preparing / In progress
 * are orange; Occupied / Cancelled are red; Closed / Completed are grey;
 * Popular is the brown and New the blue. Availability (Open / Closed) and
 * content (Popular / New) are separate variants so a card can carry both.
 */
export const badgeVariants: Record<BadgeVariant, BadgeSpec> = {
  open: { color: colors.success, soft: colors.successSoft, labelKey: 'place.status.open' },
  closed: { color: colors.neutralBadge, soft: colors.neutralSoft, labelKey: 'place.status.closed' },
  popular: { color: colors.primary, soft: colors.primarySoft, labelKey: 'place.badge.popular' },
  new: { color: colors.info, soft: colors.infoSoft, labelKey: 'place.badge.new' },
  free: { color: colors.success, soft: colors.successSoft, labelKey: 'tables.status.free' },
  reserved: { color: colors.warning, soft: colors.warningSoft, labelKey: 'tables.status.reserved' },
  occupied: { color: colors.error, soft: colors.errorSoft, labelKey: 'tables.status.occupied' },
  confirmed: {
    color: colors.success,
    soft: colors.successSoft,
    labelKey: 'orders.status.confirmed',
  },
  preparing: {
    color: colors.warning,
    soft: colors.warningSoft,
    labelKey: 'orders.status.preparing',
  },
  inProgress: {
    color: colors.warning,
    soft: colors.warningSoft,
    labelKey: 'orders.status.inProgress',
  },
  ready: { color: colors.success, soft: colors.successSoft, labelKey: 'orders.status.ready' },
  completed: {
    color: colors.neutralBadge,
    soft: colors.neutralSoft,
    labelKey: 'orders.status.completed',
  },
  cancelled: { color: colors.error, soft: colors.errorSoft, labelKey: 'orders.status.cancelled' },
};

export interface BadgeProps {
  readonly variant: BadgeVariant;
  /** `solid` on photos and in the table bar; `soft` on white cards. */
  readonly tone?: BadgeTone;
  /** A small status dot before the label ("● Free"). */
  readonly dot?: boolean;
  readonly size?: 'sm' | 'md';
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
  const spec = badgeVariants[variant];
  const solid = tone === 'solid';
  const background = solid ? spec.color : spec.soft;
  const foreground = solid ? colors.onImage : spec.color;
  const text = label ?? t(spec.labelKey);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={text}
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: background },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: foreground }]} /> : null}
      {variant === 'popular' && !dot ? (
        <Ionicons name="star" size={size === 'sm' ? 11 : 13} color={foreground} />
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.label, size === 'sm' && styles.labelSm, { color: foreground }]}
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
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  label: { ...typography.caption, fontWeight: fontWeight.bold },
  labelSm: { fontSize: 12, lineHeight: 16 },
});
