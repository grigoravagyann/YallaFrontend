import { LeadTimeExceededError, NetworkError, TableTakenError } from '@yalla/api';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { color, fontSize, fontWeight, lineHeight, radius, space, touchTarget } from '@yalla/tokens';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { keys, useCreateBooking, useTableAvailability, useVenue } from '../../src/data/queries';
import { newCommandId } from '../../src/lib/commandId';
import { useConflict } from '../../src/stores/conflict';
import { useSession } from '../../src/stores/session';

/**
 * A short review, not a form. Nothing here is editable — changing the party or
 * the time means going back to the plan, because both change which tables are
 * even available.
 */
export default function ConfirmScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { branchId, venueId, tableId, slotUtc, partySize } = useLocalSearchParams<{
    branchId: string;
    venueId?: string;
    tableId: string;
    slotUtc: string;
    partySize: string;
  }>();

  const size = Number(partySize ?? '2');
  const [errorText, setErrorText] = useState<string | null>(null);

  /**
   * Generated once per screen mount and reused on every retry. This is what
   * makes a flaky connection unable to create two bookings: the backend treats
   * a repeat of the same id as the same command.
   */
  const commandId = useRef(newCommandId()).current;

  const venueQuery = useVenue(venueId);
  const availabilityQuery = useTableAvailability({
    branchId,
    slotUtc: slotUtc ?? '',
    partySize: size,
  });
  const createBooking = useCreateBooking();

  const branch = venueQuery.data?.branches.find((b) => b.id === branchId);
  const timeZoneId = branch?.timeZoneId ?? 'Asia/Yerevan';
  const table = useMemo(
    () => availabilityQuery.data?.find((a) => a.tableId === tableId) ?? null,
    [availabilityQuery.data, tableId],
  );

  const submit = useCallback(async () => {
    if (createBooking.isPending) return; // Belt and braces; the button is disabled too.
    setErrorText(null);

    const token = useSession.getState().verificationToken;
    if (!token) {
      setErrorText(t('confirm.error.generic'));
      return;
    }

    try {
      const booking = await createBooking.mutateAsync({
        commandId,
        branchId: branchId ?? '',
        tableId: tableId ?? '',
        slotUtc: slotUtc ?? '',
        partySize: size,
        verificationToken: token,
      });

      router.replace({ pathname: '/reserve/success', params: { bookingId: booking.id } });
    } catch (error) {
      // Losing the race is an expected outcome, not a failure screen. Take the
      // refreshed floor straight from the 409 payload, push it into the cache
      // so the plan repaints without a round trip, and hand the diner back to
      // the room with the sheet closed.
      if (error instanceof TableTakenError) {
        queryClient.setQueryData(keys.floor(branchId ?? ''), error.floor);
        void queryClient.invalidateQueries({
          queryKey: keys.availability(branchId ?? '', slotUtc ?? '', size),
        });
        useConflict.getState().report(error.tableLabel);
        // back(), not replace(): the branch screen underneath is still holding
        // this diner's slot and party size. Navigating to it afresh would push
        // a second room and lose both.
        router.back();
        return;
      }

      if (error instanceof LeadTimeExceededError) {
        setErrorText(
          t('confirm.error.leadTime', {
            time: formatTime(error.earliestSlotUtc, timeZoneId, locale),
          }),
        );
        return;
      }

      if (error instanceof NetworkError) {
        setErrorText(t('confirm.error.network'));
        return;
      }

      setErrorText(t('confirm.error.generic'));
    }
  }, [
    createBooking,
    commandId,
    branchId,
    tableId,
    slotUtc,
    size,
    router,
    queryClient,
    t,
    timeZoneId,
    locale,
  ]);

  const window = table?.window;
  const pending = createBooking.isPending;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>{t('confirm.title')}</Text>

        <Row
          label={t('confirm.venue')}
          value={`${venueQuery.data?.name ?? ''} · ${branch?.name ?? ''}`}
        />
        <Row
          label={t('confirm.when')}
          value={
            slotUtc
              ? `${formatDate(slotUtc, timeZoneId, locale)} · ${formatTime(slotUtc, timeZoneId, locale)}`
              : ''
          }
        />
        <Row label={t('confirm.party')} value={t('booking.guests', { count: size })} />
        <Row label={t('confirm.tableRow')} value={table?.tableLabel ?? ''} />

        {/* The window again, so the limit is in front of them at the moment of
            commitment and not only back on the sheet. */}
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
              {window.isShorterThanTurnTime ? (
                <Text style={styles.shortWindow}>{t('table.shortWindow')}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.noLimit}>{t('table.noBookingAfter')}</Text>
          )}
        </View>

        {table ? (
          <Text style={styles.cancellation}>
            {t('table.freeCancellation', {
              time: formatTime(table.freeCancellationUntilUtc, timeZoneId, locale),
            })}
          </Text>
        ) : null}

        {table?.requiresApproval ? (
          <Text style={styles.approval}>{t('table.needsApproval')}</Text>
        ) : null}

        {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: pending, busy: pending }}
          disabled={pending}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.primary,
            pressed && styles.primaryPressed,
            pending && styles.primaryDisabled,
          ]}
        >
          {/* No optimistic success: a booking either exists on the server or it
              does not, and telling someone they have a table when they might
              not is the worst possible lie in this app. */}
          {pending ? (
            <View style={styles.pendingRow}>
              <ActivityIndicator color={color.textInverse} />
              <Text style={styles.primaryText}>{t('confirm.submitting')}</Text>
            </View>
          ) : (
            <Text style={styles.primaryText}>
              {table?.requiresApproval ? t('confirm.requiresApproval') : t('confirm.submit')}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: color.background },
  body: { padding: space.xl, gap: space.sm },
  title: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.textPrimary,
    marginBottom: space.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.surfaceMuted,
  },
  rowLabel: { fontSize: fontSize.sm, color: color.textSecondary },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.textPrimary,
  },
  windowBlock: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    gap: space.xxs,
  },
  windowPrimary: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: color.textPrimary,
  },
  shortWindow: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.warning },
  noLimit: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: color.success },
  cancellation: { marginTop: space.sm, fontSize: fontSize.sm, color: color.textSecondary },
  approval: {
    marginTop: space.sm,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.info,
  },
  error: {
    marginTop: space.lg,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.sm,
    color: color.danger,
  },
  footer: {
    padding: space.xl,
    borderTopWidth: 1,
    borderTopColor: color.surfaceMuted,
    backgroundColor: color.surface,
  },
  primary: {
    minHeight: touchTarget.minimum + 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.accent,
  },
  primaryPressed: { backgroundColor: color.accentStrong },
  primaryDisabled: { opacity: 0.6 },
  primaryText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
    color: color.textInverse,
  },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
