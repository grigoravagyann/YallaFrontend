import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  radius,
  space,
  typography,
  type IoniconName,
} from '../../theme';
import { Text } from '../Text';

export interface ProfileRowProps {
  readonly icon: IoniconName;
  readonly label: string;
  /**
   * Where the row goes. Without one the row is drawn as a plain line — no
   * chevron, no pressed state, announced as disabled — rather than a button
   * that leads nowhere.
   */
  readonly onPress?: () => void;
  /** A red count on the right — unread notifications. Hidden at zero. */
  readonly badgeCount?: number;
  /** The current choice behind the row, quiet on the right — "Հայերեն" on Settings. */
  readonly value?: string;
  /** `danger` inks the glyph and label red — Delete account. */
  readonly tone?: 'default' | 'danger';
  /** Briefly tinted, e.g. when the gear button points at the Settings row. */
  readonly highlighted?: boolean;
  /** Draws the hairline under the row. Off for the last row of a card. */
  readonly divider?: boolean;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/** The row's height: a list a thumb runs down, not a form. */
const ROW_HEIGHT = 54;

/**
 * One line of the Profile list: an amber glyph, the label, an optional value
 * or red count, and — when it opens something — the chevron.
 */
export function ProfileRow({
  icon,
  label,
  onPress,
  badgeCount = 0,
  value,
  tone = 'default',
  highlighted = false,
  divider = true,
  accessibilityLabel,
  style,
}: ProfileRowProps) {
  const countLabel = badgeCount > 99 ? '99+' : String(badgeCount);
  const a11yLabel =
    accessibilityLabel ??
    (badgeCount > 0 ? `${label}, ${countLabel}` : value ? `${label}, ${value}` : label);
  const danger = tone === 'danger';
  const content = (
    <>
      <Ionicons name={icon} size={iconSize.md} color={danger ? colors.errorInk : colors.primary} />
      <Text numberOfLines={1} style={[styles.label, danger && styles.labelDanger]}>
        {label}
      </Text>
      {value ? (
        <Text numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {badgeCount > 0 ? (
        <View style={styles.count} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={styles.countText}>{countLabel}</Text>
        </View>
      ) : null}
      {onPress ? (
        <Ionicons name={actionIcon.chevron} size={iconSize.sm} color={colors.textMuted} />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled: true }}
        style={[styles.row, divider && styles.divider, highlighted && styles.pressed, style]}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && styles.divider,
        (pressed || highlighted) && styles.pressed,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md + 2,
    paddingVertical: space.sm,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { opacity: 0.7 },
  label: { ...typography.body, color: colors.text, flex: 1 },
  labelDanger: { color: colors.errorInk },
  value: { ...typography.caption, fontSize: 12.5, color: colors.textMuted, flexShrink: 1 },
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: space.xs + 2,
    borderRadius: radius.pill,
    // The ink as a fill: white on the bright red is 4.3:1, on this 6.5.
    backgroundColor: colors.errorStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { ...typography.caption, fontWeight: fontWeight.bold, color: colors.onErrorStrong },
});
