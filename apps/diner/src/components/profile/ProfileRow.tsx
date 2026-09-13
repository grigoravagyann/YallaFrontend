import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
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
  /** Briefly tinted, e.g. when the gear button points at the Settings row. */
  readonly highlighted?: boolean;
  /** Draws the hairline under the row. Off for the last row of a card. */
  readonly divider?: boolean;
  readonly accessibilityLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * One line of the Profile list: a leading glyph in a soft square, the label,
 * an optional red count, and — when it opens something — the chevron.
 */
export function ProfileRow({
  icon,
  label,
  onPress,
  badgeCount = 0,
  highlighted = false,
  divider = true,
  accessibilityLabel,
  style,
}: ProfileRowProps) {
  const countLabel = badgeCount > 99 ? '99+' : String(badgeCount);
  const a11yLabel = accessibilityLabel ?? (badgeCount > 0 ? `${label}, ${countLabel}` : label);
  const content = (
    <>
      <View style={styles.iconWell}>
        <Ionicons name={icon} size={iconSize.md} color={colors.primary} />
      </View>
      <Text numberOfLines={1} style={styles.label}>
        {label}
      </Text>
      {badgeCount > 0 ? (
        <View style={styles.count} accessibilityElementsHidden importantForAccessibility="no">
          <Text style={styles.countText}>{countLabel}</Text>
        </View>
      ) : null}
      {onPress ? (
        <Ionicons name={actionIcon.chevron} size={iconSize.md} color={colors.textSubtle} />
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

const WELL = 36;

const styles = StyleSheet.create({
  row: {
    minHeight: layout.controlHeightLarge,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.surfaceMuted },
  iconWell: {
    width: WELL,
    height: WELL,
    borderRadius: radius.small + 2,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.bodyLg, fontWeight: fontWeight.medium, color: colors.text, flex: 1 },
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: space.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { ...typography.caption, fontWeight: fontWeight.bold, color: colors.onPrimary },
});
