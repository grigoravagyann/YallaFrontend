import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '@yalla/i18n';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip } from '../components/Chip';
import { Text } from '../components/Text';
import { Rise } from '../components/motion/Rise';
import { TimeWheel } from '../components/place/TimeWheel';
import { haptics } from '../lib/haptics';
import type { TimeSlot } from '../places/slots';
import type { WheelSlot } from '../places/wheelTimes';
import { actionIcon, colors, iconSize, space, typography } from '../theme';
import { SLOT_GAP } from './formRules';
import { bookingStyles } from './bookingStyles';

export interface TimePickerProps {
  /** Whether the day has any time on offer at all. */
  readonly hasSlots: boolean;
  /** "In 10 min" today, when the room at that minute has a table. */
  readonly soonSlot: TimeSlot | null;
  /** The nearest free times, as chips. */
  readonly quick: readonly WheelSlot[];
  readonly leadMinutes: number;
  /** The chosen time, as an instant. */
  readonly activeMs: number | null;
  readonly timeLabel: (at: number) => string;
  readonly onPick: (at: number, snappedFrom?: WheelSlot | null) => void;
  readonly wheelRows: readonly WheelSlot[];
  /** What a screen reader hears of the chosen time. */
  readonly spokenTime: string;
  readonly snapNote: string | null;
  readonly requestNote: string | null;
  readonly freeByNote: string | null;
  /** By time only, a nearly full time: "3 places left". */
  readonly placesNote?: string | null;
  /** This time's tables could not be read. */
  readonly slotFailed: boolean;
  readonly onRetrySlot: () => void;
  readonly struckHint: string | null;
}

/**
 * The times of the chosen day: "In 10 min" and the nearest free times as
 * chips, the wheel under them, and what the chosen time comes with.
 */
export function TimePicker({
  hasSlots,
  soonSlot,
  quick,
  leadMinutes,
  activeMs,
  timeLabel,
  onPick,
  wheelRows,
  spokenTime,
  snapNote,
  requestNote,
  freeByNote,
  placesNote = null,
  slotFailed,
  onRetrySlot,
  struckHint,
}: TimePickerProps) {
  const { t } = useTranslation('diner');
  if (!hasSlots) return <Text style={styles.empty}>{t('book.noSlots')}</Text>;
  return (
    <View style={styles.times}>
      {/* "In 10 min · 19:15" today, and the nearest free times. */}
      {soonSlot || quick.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
          accessibilityLabel={t('book.quick.title')}
        >
          {soonSlot ? (
            <Chip
              shape="rounded"
              size="sm"
              icon={actionIcon.time}
              label={t('book.quick.soon', {
                minutes: leadMinutes,
                time: timeLabel(soonSlot.at.getTime()),
              })}
              selected={activeMs === soonSlot.at.getTime()}
              onPress={() => {
                haptics.select();
                onPick(soonSlot.at.getTime());
              }}
            />
          ) : null}
          {quick.map((row) => (
            <Chip
              key={row.at}
              shape="rounded"
              size="sm"
              label={timeLabel(row.at)}
              selected={activeMs === row.at}
              onPress={() => {
                haptics.select();
                onPick(row.at);
              }}
            />
          ))}
        </ScrollView>
      ) : null}
      <TimeWheel
        slots={wheelRows}
        value={activeMs}
        onChange={(at, how) => onPick(at, how.snappedFrom)}
        accessibilityLabel={t('book.time')}
        accessibilityValueText={spokenTime}
        accessibilityHint={t('book.wheel.hint')}
      />
      {snapNote ? (
        <Text accessibilityRole="alert" style={styles.snapNote}>
          {snapNote}
        </Text>
      ) : null}
      {requestNote ? <Text style={bookingStyles.slotNote}>{requestNote}</Text> : null}
      {freeByNote ? <Text style={bookingStyles.slotNote}>{freeByNote}</Text> : null}
      {placesNote ? <Text style={bookingStyles.slotNote}>{placesNote}</Text> : null}
      {/* This time's tables could not be read: Confirm waits, and says why. */}
      {slotFailed ? (
        <View accessibilityRole="alert" style={styles.slotError}>
          <Text style={bookingStyles.slotNote}>{t('confirm.tableError')}</Text>
          <Chip shape="rounded" size="sm" label={t('net.retry')} onPress={onRetrySlot} />
        </View>
      ) : null}
      {struckHint ? <Text style={styles.struckHint}>{struckHint}</Text> : null}
    </View>
  );
}

/** A change whose time is gone: nothing is chosen for it, and why. */
export function ChangeTimeGoneNote() {
  const { t } = useTranslation('diner');
  return (
    <Rise>
      <View accessibilityRole="alert" style={styles.timeGone}>
        <Ionicons name={actionIcon.time} size={iconSize.sm} color={colors.warningInk} />
        <Text style={styles.timeGoneText}>{t('book.changeTimeUnavailable')}</Text>
      </View>
    </Rise>
  );
}

const styles = StyleSheet.create({
  empty: { ...typography.body, color: colors.textMuted },
  // The design's 6 between the times and the hint under them.
  times: { gap: SLOT_GAP },
  struckHint: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: space.xs,
  },
  quickRow: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs },
  snapNote: { ...typography.caption, color: colors.warningInk, paddingHorizontal: space.xs },
  slotError: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  timeGone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: -space.sm,
    paddingHorizontal: space.xs,
  },
  timeGoneText: { ...typography.caption, flex: 1, color: colors.warningInk },
});
