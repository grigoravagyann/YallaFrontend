import { tableCopy, type CopyLine, type TableAvailability, type TableCopy } from '@yalla/api';
import type { Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { color, elevation, fontSize, fontWeight, lineHeight, radius, space } from '@yalla/tokens';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Text } from './Text';

export interface TableSheetProps {
  readonly availability: TableAvailability | null;
  readonly partySize: number;
  readonly timeZoneId: string;
  readonly locale: Locale;
  readonly onReserve: (tableId: string) => void;
  readonly onClose: () => void;
}

/**
 * Bottom sheet over the floor plan.
 *
 * Deliberately a transparent modal rather than a pushed screen: the diner is
 * choosing *between* tables and needs to keep seeing the room while they read
 * the window. Covering the plan would turn a comparison into a memory test.
 */
export function TableSheet({
  availability,
  partySize,
  timeZoneId,
  locale,
  onReserve,
  onClose,
}: TableSheetProps) {
  const { t } = useTranslation('diner');
  const open = availability !== null;

  // Every sentence on this sheet comes from one call, shared with the confirm
  // screen and with the public web page. See `contracts/reservation.ts`.
  const copy = availability ? tableCopy(availability, { partySize, timeZoneId, locale }) : null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose} // Android hardware back closes the sheet.
    >
      {/* Backdrop is only lightly tinted so the floor plan stays readable. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('table.close')} />

      {availability && copy ? (
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={styles.content}>
            <Text display style={styles.title}>
              {t(copy.title.key, copy.title.params)}
            </Text>
            <Text style={styles.seats}>{t(copy.seats.key, copy.seats.params)}</Text>

            {copy.unavailable ? (
              // One line, no action. Explaining why beats a dead button.
              <Text style={styles.unavailable}>
                {t(copy.unavailable.key, copy.unavailable.params)}
              </Text>
            ) : (
              <BookableBody copy={copy} tableId={availability.tableId} onReserve={onReserve} />
            )}
            {/* The way out, said. Tapping the room behind the sheet also works,
                but a sheet with one button and no visible exit reads as a trap. */}
            <Button
              label={t('table.pickAnother')}
              variant="text"
              onPress={onClose}
              style={styles.pickAnother}
            />
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

function BookableBody({
  copy,
  tableId,
  onReserve,
}: {
  copy: TableCopy;
  tableId: string;
  onReserve: (tableId: string) => void;
}) {
  const { t } = useTranslation('diner');
  const line = (value: CopyLine): string => t(value.key, value.params);

  return (
    <>
      {/*
        The window comes BEFORE the action, always. This product does not ask
        people how long they intend to stay — the limit is told up front so a
        diner who needs longer can close this and pick a table with no limit.
      */}
      <View style={styles.windowBlock}>
        {copy.window ? (
          <>
            <Text style={copy.window.isBounded ? styles.windowPrimary : styles.noLimit}>
              {line(copy.window.primary)}
            </Text>
            {copy.window.nextBooking ? (
              <Text style={styles.windowSecondary}>{line(copy.window.nextBooking)}</Text>
            ) : null}
            {copy.window.shortWindow ? (
              // Makes the comparison easy rather than leaving it implied.
              <Text style={styles.shortWindow}>{line(copy.window.shortWindow)}</Text>
            ) : null}
          </>
        ) : null}
      </View>

      {copy.freeCancellation ? (
        <Text style={styles.cancellation}>{line(copy.freeCancellation)}</Text>
      ) : null}

      {copy.approval ? <Text style={styles.approval}>{line(copy.approval)}</Text> : null}

      <Button
        label={line(copy.reserve)}
        onPress={() => onReserve(tableId)}
        style={styles.reserve}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: color.scrim },
  sheet: {
    maxHeight: '70%',
    backgroundColor: color.surface,
    // The one elevation in the product: this genuinely floats over the room.
    ...elevation.sheet.native,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingBottom: space.xl,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.border,
    marginVertical: space.sm,
  },
  content: { paddingHorizontal: space.xl, gap: space.xs },
  title: {
    fontSize: fontSize.xl,
    lineHeight: lineHeight.xl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  seats: { fontSize: fontSize.sm, color: color.mutedForeground },
  windowBlock: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: color.paper,
    gap: space.xs,
  },
  windowPrimary: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  windowSecondary: { fontSize: fontSize.sm, color: color.mutedForeground },
  shortWindow: {
    marginTop: space.xs,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.warningInk,
  },
  noLimit: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.bold,
    color: color.successInk,
  },
  cancellation: {
    marginTop: space.md,
    fontSize: fontSize.sm,
    color: color.mutedForeground,
  },
  approval: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.info,
  },
  unavailable: {
    marginTop: space.lg,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    color: color.mutedForeground,
  },
  // The beige fill with its ink label; `primaryOnFloorPlan` is the same value.
  reserve: { marginTop: space.xl },
  pickAnother: { marginTop: space.xs },
});
