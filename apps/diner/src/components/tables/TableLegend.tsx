import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { TableStatus } from '../../places/model';
import { colors, radius, space, tableStatusColor, typography } from '../../theme';
import { Text } from '../Text';

const STATUSES: readonly TableStatus[] = ['free', 'reserved', 'occupied'];

export interface TableLegendProps {
  /** `light` text on white; `dark` white text for the fullscreen view. */
  readonly tone?: 'light' | 'dark';
  readonly style?: StyleProp<ViewStyle>;
}

/** ● Free ● Reserved ● Occupied — colour and the word, never one without the other. */
export function TableLegend({ tone = 'light', style }: TableLegendProps) {
  const { t } = useTranslation('diner');
  const color = tone === 'dark' ? colors.onImage : colors.textMuted;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={STATUSES.map((status) => t(`tables.legend.${status}`)).join(', ')}
      style={[styles.row, style]}
    >
      {STATUSES.map((status) => (
        <View key={status} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: tableStatusColor[status] }]} />
          <Text style={[styles.label, { color }]}>{t(`tables.legend.${status}`)}</Text>
        </View>
      ))}
    </View>
  );
}

const DOT = 10;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.lg },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  dot: { width: DOT, height: DOT, borderRadius: radius.pill },
  label: { ...typography.caption },
});
