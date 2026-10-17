import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { TableStatus } from '../../places/model';
import { colors, radius, space, tableStatusColor, typography } from '../../theme';
import { Text } from '../Text';

const STATUSES: readonly TableStatus[] = ['free', 'reserved', 'occupied', 'outOfService'];

export interface TableLegendProps {
  /** `light` muted text on the ground; `dark` white text for the fullscreen photo view. */
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
          <View
            style={[
              styles.dot,
              MARK[status] && styles.dotMarked,
              { backgroundColor: tableStatusColor[status] },
            ]}
          >
            {/* The same corner mark the pin carries, in small. */}
            {MARK[status] ? (
              <View style={styles.mark}>
                <Ionicons name={MARK[status]!} size={6} color={colors.onImage} />
              </View>
            ) : null}
          </View>
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

const MARK: Partial<Record<TableStatus, 'close' | 'time-outline'>> = {
  occupied: 'close',
  reserved: 'time-outline',
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.lg },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  dot: { width: DOT, height: DOT, borderRadius: radius.pill },
  /** Room for the corner mark, so it never touches the word. */
  dotMarked: { marginRight: space.xs },
  mark: {
    position: 'absolute',
    top: -5,
    right: -6,
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.onImage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The unfit pin in small: the free colour as a dashed ring, never a fill.
  hollow: { borderWidth: 1.5, borderStyle: 'dashed' },
  label: { ...typography.caption },
});
