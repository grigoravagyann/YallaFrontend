import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { TableStatus } from '../../places/model';
import { colors, radius, space, tableStatusColor, typography } from '../../theme';
import { Text } from '../Text';

const STATUSES: readonly TableStatus[] = ['free', 'reserved', 'occupied', 'outOfService'];

export interface TableLegendProps {
  /** `light` text on white; `dark` white text for the fullscreen view. */
  readonly tone?: 'light' | 'dark';
  /**
   * Booking for a party: also explain the hollow, dashed pin of a free table
   * the party does not fit (QA 20261016T2 B3).
   */
  readonly partyFit?: boolean;
  readonly style?: StyleProp<ViewStyle>;
}

/** ● Free ● Reserved ● Occupied ● Out of service — colour and the word, never one without the other. */
export function TableLegend({ tone = 'light', partyFit = false, style }: TableLegendProps) {
  const { t } = useTranslation('diner');
  const color = tone === 'dark' ? colors.onImage : colors.textMuted;
  const words = STATUSES.map((status) => t(`tables.legend.${status}`));
  if (partyFit) words.push(t('tables.legend.notForParty'));
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={words.join(', ')}
      style={[styles.row, style]}
    >
      {STATUSES.map((status) => (
        <View key={status} style={styles.item}>
          <View style={[styles.dot, { backgroundColor: tableStatusColor[status] }]} />
          <Text style={[styles.label, { color }]}>{t(`tables.legend.${status}`)}</Text>
        </View>
      ))}
      {partyFit ? (
        <View style={styles.item}>
          <View style={[styles.dot, styles.hollow, { borderColor: tableStatusColor.free }]} />
          <Text style={[styles.label, { color }]}>{t('tables.legend.notForParty')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const DOT = 10;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.lg },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  dot: { width: DOT, height: DOT, borderRadius: radius.pill },
  // The unfit pin in small: the free colour as a dashed ring, never a fill.
  hollow: { borderWidth: 1.5, borderStyle: 'dashed' },
  label: { ...typography.caption },
});
