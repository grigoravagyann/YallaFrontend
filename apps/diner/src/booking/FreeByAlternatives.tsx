import { useTranslation } from '@yalla/i18n';
import { StyleSheet, View } from 'react-native';
import { Chip } from '../components/Chip';
import { Text } from '../components/Text';
import { Rise } from '../components/motion/Rise';
import { haptics } from '../lib/haptics';
import type { WheelSlot } from '../places/wheelTimes';
import { colors, radius, space, typography } from '../theme';

/** Said no to freeing the table in time: another table or time — the ones with no limit. */
export function FreeByAlternatives({
  times,
  timeLabel,
  onPick,
}: {
  readonly times: readonly WheelSlot[];
  readonly timeLabel: (at: number) => string;
  readonly onPick: (at: number) => void;
}) {
  const { t } = useTranslation('diner');
  return (
    <Rise>
      <View accessibilityRole="alert" style={styles.freeByOther}>
        <Text style={styles.freeByOtherText}>
          {t(times.length > 0 ? 'book.freeBy.other' : 'book.freeBy.otherNoTimes')}
        </Text>
        {times.length > 0 ? (
          <View style={styles.quick}>
            {times.map((row) => (
              <Chip
                key={row.at}
                shape="rounded"
                size="sm"
                label={timeLabel(row.at)}
                onPress={() => {
                  haptics.select();
                  onPick(row.at);
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Rise>
  );
}

const styles = StyleSheet.create({
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.xs },
  freeByOther: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.tile,
    backgroundColor: colors.warningSoft,
  },
  freeByOtherText: { ...typography.body, color: colors.warningInk },
});
