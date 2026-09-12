import { nextHalfHour } from '@yalla/api';
import { branchDayKey, formatDate, formatTime, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { color, elevation, fontSize, fontWeight, radius, space, touchTarget } from '@yalla/tokens';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNow } from '../hooks/useNow';
import {
  DEFAULT_BOOKING_WINDOW_DAYS,
  PARTY_SIZES,
  dayOptions,
  timeOptions,
} from '../lib/bookingSlots';
import { Text } from './Text';

/** The three values the floor plan filters and annotates on. */
export interface BookingContext {
  /** Instant of the requested slot, UTC. */
  readonly slotUtc: Date;
  readonly partySize: number;
}

export interface BookingContextBarProps {
  readonly value: BookingContext;
  readonly onChange: (next: BookingContext) => void;
  /** Branch IANA zone — every label and every slot here is in it, never the device's. */
  readonly timeZoneId: string;
  readonly locale: Locale;
  /** How far ahead the branch takes bookings; the default when unknown. */
  readonly windowDays?: number | undefined;
  /** The branch's lead time; slots inside it are not offered. */
  readonly leadMinutes?: number | undefined;
}

/**
 * Re-exported, not defined here.
 *
 * The public web page defaults its slot the same way and must land on the same
 * instant, so the rule moved into `@yalla/api` when the second caller appeared.
 * The re-export stays because every screen in this app imports it from here.
 */
export { nextHalfHour };

/**
 * Date / time / party size, held above the floor plan.
 *
 * These three drive what the plan shows — party size filters which tables are
 * selectable, and the slot decides which tables count as `reservedSoon` — so
 * they live in screen state and are passed down rather than being picked
 * inside the plan.
 *
 * The choices come from `lib/bookingSlots`, in the branch's own day: dates
 * from branch-local today to the end of the booking window, times from that
 * day's midnight with anything already past or inside the lead time left out.
 */
export function BookingContextBar({
  value,
  onChange,
  timeZoneId,
  locale,
  windowDays,
  leadMinutes,
}: BookingContextBarProps) {
  const { t } = useTranslation('diner');
  const [open, setOpen] = useState<'date' | 'time' | 'party' | null>(null);
  // A clock that ticks, so "Today" and the list of times left do not freeze at
  // whenever the screen was opened.
  const now = useNow(60_000);

  const days = dayOptions({
    now,
    selected: value.slotUtc,
    timeZoneId,
    windowDays: windowDays ?? DEFAULT_BOOKING_WINDOW_DAYS,
    leadMinutes,
  });
  const selectedDay = days.find((day) => day.isSelected) ?? null;
  const times = timeOptions({
    dateKey: branchDayKey(value.slotUtc, timeZoneId),
    now,
    timeZoneId,
    leadMinutes: leadMinutes ?? 0,
  });

  const dayLabel = (day: { isToday: boolean; isTomorrow: boolean; slotUtc: Date }): string =>
    day.isToday
      ? t('booking.today')
      : day.isTomorrow
        ? t('booking.tomorrow')
        : formatDate(day.slotUtc, timeZoneId, locale);

  const selectedTime = value.slotUtc.getTime();

  return (
    <View style={styles.bar}>
      <Field
        label={t('booking.date')}
        value={selectedDay ? dayLabel(selectedDay) : formatDate(value.slotUtc, timeZoneId, locale)}
        onPress={() => setOpen('date')}
      />
      <Field
        label={t('booking.time')}
        value={formatTime(value.slotUtc, timeZoneId, locale)}
        onPress={() => setOpen('time')}
      />
      <Field
        label={t('booking.partySize')}
        value={t('booking.guests', { count: value.partySize })}
        onPress={() => setOpen('party')}
      />

      <PickerSheet
        visible={open === 'date'}
        title={t('booking.pickDate')}
        onClose={() => setOpen(null)}
        options={days.map((day) => ({
          key: day.dateKey,
          label: dayLabel(day),
          selected: day.isSelected,
          onSelect: () => onChange({ ...value, slotUtc: day.slotUtc }),
        }))}
      />

      <PickerSheet
        visible={open === 'time'}
        title={t('booking.pickTime')}
        onClose={() => setOpen(null)}
        empty={t('booking.noTimesLeft')}
        options={times.map((slot) => ({
          key: slot.toISOString(),
          label: formatTime(slot, timeZoneId, locale),
          selected: slot.getTime() === selectedTime,
          onSelect: () => onChange({ ...value, slotUtc: slot }),
        }))}
      />

      <PickerSheet
        visible={open === 'party'}
        title={t('booking.pickPartySize')}
        onClose={() => setOpen(null)}
        options={PARTY_SIZES.map((size) => ({
          key: String(size),
          label: t('booking.guests', { count: size }),
          selected: size === value.partySize,
          onSelect: () => onChange({ ...value, partySize: size }),
        }))}
      />
    </View>
  );
}

function Field({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
    >
      {/* The value alone. Three pills reading "Today", "19:30", "2 guests"
          need no captions; the label survives for the screen reader. */}
      <Text style={styles.fieldValue} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

interface Option {
  readonly key: string;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

function PickerSheet({
  visible,
  title,
  options,
  onClose,
  empty,
}: {
  visible: boolean;
  title: string;
  options: readonly Option[];
  onClose: () => void;
  /** Said when there is nothing left to pick, rather than an empty sheet. */
  empty?: string;
}) {
  const { t } = useTranslation('diner');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose} // Android hardware back closes the sheet.
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{title}</Text>
        <ScrollView style={styles.sheetScroll}>
          {options.length === 0 && empty ? <Text style={styles.empty}>{empty}</Text> : null}
          {options.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected: option.selected }}
              onPress={() => {
                option.onSelect();
                onClose();
              }}
              style={({ pressed }) => [
                styles.option,
                option.selected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
            >
              <Text style={[styles.optionText, option.selected && styles.optionTextSelected]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.close}>
          <Text style={styles.closeText}>{t('booking.done')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // On the paper, not in a white band: the plan is the screen and the bar is
  // three controls above it, not a header.
  bar: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  field: {
    flex: 1,
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderInteractive,
    backgroundColor: color.surface,
  },
  fieldPressed: { backgroundColor: color.greenTint },
  fieldValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: color.foreground,
  },
  backdrop: { flex: 1, backgroundColor: color.scrim },
  sheet: {
    maxHeight: '60%',
    backgroundColor: color.surface,
    ...elevation.sheet.native,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: space.lg,
  },
  sheetTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: color.foreground,
    marginBottom: space.md,
  },
  sheetScroll: { flexGrow: 0 },
  empty: {
    paddingVertical: space.md,
    fontSize: fontSize.md,
    color: color.mutedForeground,
  },
  option: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  optionSelected: { backgroundColor: color.greenTint },
  optionPressed: { backgroundColor: color.paper },
  optionText: { fontSize: fontSize.md, color: color.foreground },
  optionTextSelected: { fontWeight: fontWeight.bold, color: color.primaryInk },
  close: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
    borderRadius: radius.pill,
    backgroundColor: color.primaryOnFloorPlan,
  },
  closeText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.primaryForeground,
  },
});
