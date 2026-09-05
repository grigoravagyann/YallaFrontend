import { formatDate, formatTime, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { color, elevation, fontSize, fontWeight, radius, space, touchTarget } from '@yalla/tokens';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  /** Branch IANA zone — every label here is rendered in it, never the device's. */
  readonly timeZoneId: string;
  readonly locale: Locale;
}

const PARTY_SIZES = [1, 2, 3, 4, 5, 6, 8] as const;
const DAY_OFFSETS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Round an instant up to the next half hour — the sensible default slot. */
export function nextHalfHour(from: Date): Date {
  const next = new Date(from);
  next.setUTCSeconds(0, 0);
  const minutes = next.getUTCMinutes();
  next.setUTCMinutes(minutes < 30 ? 30 : 60);
  return next;
}

/** Half-hourly slots for the day containing `around`, in UTC. */
function slotsForDay(around: Date): Date[] {
  const start = new Date(around);
  start.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: 48 }, (_, i) => new Date(start.getTime() + i * 30 * 60_000));
}

/**
 * Date / time / party size, held above the floor plan.
 *
 * These three drive what the plan shows — party size filters which tables are
 * selectable, and the slot decides which tables count as `reservedSoon` — so
 * they live in screen state and are passed down rather than being picked
 * inside the plan.
 */
export function BookingContextBar({ value, onChange, timeZoneId, locale }: BookingContextBarProps) {
  const { t } = useTranslation('diner');
  const [open, setOpen] = useState<'date' | 'time' | 'party' | null>(null);

  const today = new Date();
  const isToday =
    formatDate(value.slotUtc, timeZoneId, locale) === formatDate(today, timeZoneId, locale);

  return (
    <View style={styles.bar}>
      <Field
        label={t('booking.date')}
        value={isToday ? t('booking.today') : formatDate(value.slotUtc, timeZoneId, locale)}
        onPress={() => setOpen('date')}
      />
      <Field
        label={t('booking.time')}
        value={formatTime(value.slotUtc, timeZoneId, locale)}
        onPress={() => setOpen('time')}
      />
      <Field
        label={t('booking.partySize')}
        value={String(value.partySize)}
        onPress={() => setOpen('party')}
      />

      <PickerSheet
        visible={open === 'date'}
        title={t('booking.pickDate')}
        onClose={() => setOpen(null)}
        options={DAY_OFFSETS.map((offset) => {
          const day = new Date(value.slotUtc.getTime() + offset * 86_400_000);
          return {
            key: String(offset),
            label: offset === 0 ? t('booking.today') : formatDate(day, timeZoneId, locale),
            onSelect: () => {
              const next = new Date(value.slotUtc.getTime() + offset * 86_400_000);
              onChange({ ...value, slotUtc: next });
            },
          };
        })}
      />

      <PickerSheet
        visible={open === 'time'}
        title={t('booking.pickTime')}
        onClose={() => setOpen(null)}
        options={slotsForDay(value.slotUtc).map((slot) => ({
          key: slot.toISOString(),
          label: formatTime(slot, timeZoneId, locale),
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
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} numberOfLines={1}>
        {value}
      </Text>
    </Pressable>
  );
}

interface Option {
  readonly key: string;
  readonly label: string;
  readonly onSelect: () => void;
}

function PickerSheet({
  visible,
  title,
  options,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly Option[];
  onClose: () => void;
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
          {options.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              onPress={() => {
                option.onSelect();
                onClose();
              }}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            >
              <Text style={styles.optionText}>{option.label}</Text>
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
  bar: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  field: {
    flex: 1,
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.paper,
  },
  fieldPressed: { backgroundColor: color.border },
  fieldLabel: { fontSize: fontSize.xs, color: color.mutedForeground },
  fieldValue: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.foreground,
  },
  backdrop: { flex: 1, backgroundColor: '#00000055' },
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
  option: {
    minHeight: touchTarget.minimum,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  optionPressed: { backgroundColor: color.paper },
  optionText: { fontSize: fontSize.md, color: color.foreground },
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
