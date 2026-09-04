import type { TableAvailability } from '@yalla/api';
import { formatTime, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose} // Android hardware back closes the sheet.
    >
      {/* Backdrop is only lightly tinted so the floor plan stays readable. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('table.close')} />

      {availability ? (
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>
              {availability.floorAreaName
                ? t('table.titleWithArea', {
                    label: availability.tableLabel,
                    area: availability.floorAreaName,
                  })
                : t('table.title', { label: availability.tableLabel })}
            </Text>
            <Text style={styles.seats}>{t('table.seats', { count: availability.seats })}</Text>

            {availability.isBookable ? (
              <BookableBody
                availability={availability}
                timeZoneId={timeZoneId}
                locale={locale}
                onReserve={onReserve}
              />
            ) : (
              // One line, no action. Explaining why beats a dead button.
              <Text style={styles.unavailable}>
                {t(`table.unavailable.${availability.unavailableReason ?? 'notBookable'}`, {
                  count: partySize,
                })}
              </Text>
            )}
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

function BookableBody({
  availability,
  timeZoneId,
  locale,
  onReserve,
}: {
  availability: TableAvailability;
  timeZoneId: string;
  locale: Locale;
  onReserve: (tableId: string) => void;
}) {
  const { t } = useTranslation('diner');
  const window = availability.window;

  return (
    <>
      {/*
        The window comes BEFORE the action, always. This product does not ask
        people how long they intend to stay — the limit is told up front so a
        diner who needs longer can close this and pick a table with no limit.
      */}
      <View style={styles.windowBlock}>
        {window && window.untilUtc ? (
          <>
            <Text style={styles.windowPrimary}>
              {t('table.heldForYou', {
                range: `${formatTime(window.fromUtc, timeZoneId, locale)} – ${formatTime(
                  window.untilUtc,
                  timeZoneId,
                  locale,
                )}`,
              })}
            </Text>
            {window.nextBookingStartUtc ? (
              <Text style={styles.windowSecondary}>
                {t('table.nextBooking', {
                  time: formatTime(window.nextBookingStartUtc, timeZoneId, locale),
                })}
              </Text>
            ) : null}
            {window.isShorterThanTurnTime ? (
              // Makes the comparison easy rather than leaving it implied.
              <Text style={styles.shortWindow}>{t('table.shortWindow')}</Text>
            ) : null}
          </>
        ) : (
          // Not a null state — an advantage, and a reason to pick this table.
          <Text style={styles.noLimit}>{t('table.noBookingAfter')}</Text>
        )}
      </View>

      <Text style={styles.cancellation}>
        {t('table.freeCancellation', {
          time: formatTime(availability.freeCancellationUntilUtc, timeZoneId, locale),
        })}
      </Text>

      {availability.requiresApproval ? (
        <Text style={styles.approval}>{t('table.needsApproval')}</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => onReserve(availability.tableId)}
        style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
      >
        <Text style={styles.primaryText}>
          {t('table.reserve', { label: availability.tableLabel })}
        </Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000033' },
  sheet: {
    maxHeight: '62%',
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
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
    color: color.textPrimary,
  },
  seats: { fontSize: fontSize.sm, color: color.textSecondary },
  windowBlock: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.background,
    gap: space.xxs,
  },
  windowPrimary: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.semibold,
    color: color.textPrimary,
  },
  windowSecondary: { fontSize: fontSize.sm, color: color.textSecondary },
  shortWindow: {
    marginTop: space.xs,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.warning,
  },
  noLimit: {
    fontSize: fontSize.lg,
    lineHeight: lineHeight.lg,
    fontWeight: fontWeight.semibold,
    color: color.success,
  },
  cancellation: {
    marginTop: space.md,
    fontSize: fontSize.sm,
    color: color.textSecondary,
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
    color: color.textSecondary,
  },
  primary: {
    marginTop: space.xl,
    minHeight: touchTarget.minimum + 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.accent,
  },
  primaryPressed: { backgroundColor: color.accentStrong },
  primaryText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: color.textInverse,
  },
});
