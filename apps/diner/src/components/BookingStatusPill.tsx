import type { BookingStatus } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, radius, space } from '@yalla/tokens';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';

/**
 * Status treatment, shared by the list and the detail screen so the two cannot
 * disagree.
 *
 * `pendingApproval` is deliberately not a paler `confirmed`: it gets its own
 * colour *and* a dashed border, because someone turning up to a table that was
 * never confirmed is the failure this distinction exists to prevent.
 */
const TREATMENT: Readonly<Record<BookingStatus, { fg: string; bg: string; dashed: boolean }>> = {
  confirmed: { fg: color.success, bg: color.surface, dashed: false },
  pendingApproval: { fg: color.info, bg: color.surface, dashed: true },
  seated: { fg: color.success, bg: color.greenTint, dashed: false },
  completed: { fg: color.mutedForeground, bg: color.greenTint, dashed: false },
  // Which side cancelled is the one thing somebody reading the list wants to know.
  cancelledByDiner: { fg: color.mutedForeground, bg: color.greenTint, dashed: false },
  cancelledByVenue: { fg: color.danger, bg: color.greenTint, dashed: false },
  noShow: { fg: color.danger, bg: color.greenTint, dashed: false },
  unknown: { fg: color.mutedForeground, bg: color.greenTint, dashed: false },
};

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  const { t } = useTranslation('diner');
  const treatment = TREATMENT[status];

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: treatment.bg,
          borderColor: treatment.fg,
          borderStyle: treatment.dashed ? 'dashed' : 'solid',
        },
      ]}
    >
      <Text style={[styles.text, { color: treatment.fg }]}>{t(`bookings.status.${status}`)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  text: { fontSize: fontSize.xs, fontWeight: fontWeight.medium },
});
