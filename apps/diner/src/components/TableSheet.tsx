import { tableCopy, type CopyLine, type TableAvailability, type TableCopy } from '@yalla/api';
import type { Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { colors, radius, space, typography } from '../theme';
import { Button } from './Button';
import { SheetModal } from './motion/SheetModal';
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
 * Bottom sheet over the room photos.
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
  // The last table shown, kept while the sheet slides away: closing clears
  // `availability` at once, and an emptied sheet would drop out of sight
  // before its own way out had played.
  const [shown, setShown] = useState(availability);
  if (availability !== null && availability !== shown) setShown(availability);
  const table = availability ?? shown;

  // Every sentence on this sheet comes from one call, shared with the confirm
  // screen and with the public web page. See `contracts/reservation.ts`.
  const copy = table ? tableCopy(table, { partySize, timeZoneId, locale }) : null;
  const title = copy ? t(copy.title.key, copy.title.params) : '';

  return (
    <SheetModal
      visible={open}
      // The backdrop and Android's hardware back both close the sheet.
      onRequestClose={onClose}
      closeLabel={t('table.close')}
      accessibilityLabel={title}
      style={styles.sheet}
    >
      {table && copy ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Text display style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.seats}>{t(copy.seats.key, copy.seats.params)}</Text>

          {copy.unavailable ? (
            // One line, no action. Explaining why beats a dead button.
            <Text style={styles.unavailable}>
              {t(copy.unavailable.key, copy.unavailable.params)}
            </Text>
          ) : (
            <BookableBody copy={copy} tableId={table.tableId} onReserve={onReserve} />
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
      ) : null}
    </SheetModal>
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
        size="large"
        onPress={() => onReserve(tableId)}
        style={styles.reserve}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sheet: { maxHeight: '70%' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { paddingHorizontal: space.xs, gap: space.xs },
  title: { ...typography.heading, color: colors.text },
  seats: { ...typography.body, color: colors.textMuted },
  windowBlock: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.background,
    gap: space.xs,
  },
  windowPrimary: { ...typography.h3, color: colors.text },
  windowSecondary: { ...typography.caption, color: colors.textMuted },
  shortWindow: { marginTop: space.xs, ...typography.caption, color: colors.warningInk },
  noLimit: { ...typography.h3, color: colors.successInk },
  cancellation: { marginTop: space.md, ...typography.caption, color: colors.textMuted },
  approval: { marginTop: space.sm, ...typography.caption, color: colors.infoInk },
  unavailable: { marginTop: space.lg, ...typography.body, color: colors.textMuted },
  reserve: { marginTop: space.xl },
  pickAnother: { marginTop: space.xs },
});
