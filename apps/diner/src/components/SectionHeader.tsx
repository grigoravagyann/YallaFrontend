import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fontWeight, iconSize, space, typography, type IoniconName } from '../theme';
import { Text } from './Text';

export interface SectionHeaderProps {
  readonly label: string;
  /** Small brown glyph before the label — the calendar before "Date". */
  readonly icon?: IoniconName;
  /** Quieter suffix after the label, e.g. "(optional)". */
  readonly hint?: string;
  /** Anything pinned to the right edge — a "See all" text button. */
  readonly trailing?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Names a block of a screen: Date, Time, Party Size, Tables right now.
 */
export function SectionHeader({ label, icon, hint, trailing, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      {icon ? <Ionicons name={icon} size={iconSize.md} color={colors.primary} /> : null}
      <Text accessibilityRole="header" numberOfLines={1} style={styles.label}>
        {label}
        {hint ? <Text style={styles.hint}>{` ${hint}`}</Text> : null}
      </Text>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  label: { ...typography.bodyLg, fontWeight: fontWeight.bold, color: colors.text, flexShrink: 1 },
  hint: { ...typography.body, fontWeight: fontWeight.regular, color: colors.textMuted },
  trailing: { marginLeft: 'auto' },
});
