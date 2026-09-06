import { bookingFailure, tableCopy, type CopyLine } from '@yalla/api';
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
  View,
} from 'react-native';
import { Text } from '../../src/components/Text';
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

  /*
   * Route params, treated as untrusted input.
   *
   * These are pushed by the branch screen from state it built, so in the
   * ordinary flow they are always sound. But Expo Router serves deep links, and
   * a hand-made one can carry anything — and `formatDate` below throws
   * `InvalidInstantError` on a string it cannot read, during render, in a tree
   * with no error boundary. That is the same failure the public page had when
   * its date input was cleared: unreadable input reaching a formatter.
   *
   * So both are parsed once, here, and the screen renders what it can.
   */
  const size = Number.isInteger(Number(partySize)) && Number(partySize) > 0 ? Number(partySize) : 2;

  const slotDate = useMemo(() => {
    if (!slotUtc) return null;
    const parsed = new Date(slotUtc);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [slotUtc]);
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
      // What kind of failure this was is decided in one shared place, so the
      // web page classifies the same 409 the same way. See `bookingFailure`.
      const failure = bookingFailure(error, timeZoneId, locale);

      // Losing the race is an expected outcome, not a failure screen. Take the
      // refreshed floor straight from the 409 payload, push it into the cache
      // so the plan repaints without a round trip, and hand the diner back to
      // the room with the sheet closed.
      if (failure.kind === 'tableTaken') {
        queryClient.setQueryData(keys.floor(branchId ?? ''), failure.error.floor);
        void queryClient.invalidateQueries({
          queryKey: keys.availability(branchId ?? '', slotUtc ?? '', size),
        });
        useConflict.getState().report(failure.error.tableLabel);
        // back(), not replace(): the branch screen underneath is still holding
        // this diner's slot and party size. Navigating to it afresh would push
        // a second room and lose both.
        router.back();
        return;
      }

      setErrorText(t(failure.line.key, failure.line.params));
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

  // The same assembled copy the sheet showed, so the promise on the review
  // screen is word-for-word the promise the diner accepted a screen earlier.
  const copy = table ? tableCopy(table, { partySize: size, timeZoneId, locale }) : null;
  const line = (value: CopyLine): string => t(value.key, value.params);
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
            slotDate
              ? `${formatDate(slotDate, timeZoneId, locale)} · ${formatTime(slotDate, timeZoneId, locale)}`
              : ''
          }
        />
        <Row label={t('confirm.party')} value={t('booking.guests', { count: size })} />
        <Row label={t('confirm.tableRow')} value={table?.tableLabel ?? ''} />

        {/* The window again, so the limit is in front of them at the moment of
            commitment and not only back on the sheet. */}
        <View style={styles.windowBlock}>
          {copy?.window ? (
            <>
              <Text style={copy.window.isBounded ? styles.windowPrimary : styles.noLimit}>
                {line(copy.window.primary)}
              </Text>
              {copy.window.shortWindow ? (
                <Text style={styles.shortWindow}>{line(copy.window.shortWindow)}</Text>
              ) : null}
            </>
          ) : null}
        </View>

        {copy?.freeCancellation ? (
          <Text style={styles.cancellation}>{line(copy.freeCancellation)}</Text>
        ) : null}

        {copy?.approval ? <Text style={styles.approval}>{line(copy.approval)}</Text> : null}

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
              <ActivityIndicator color={color.primaryForeground} />
              <Text style={styles.primaryText}>{t('confirm.submitting')}</Text>
            </View>
          ) : (
            <Text style={styles.primaryText}>
              {copy?.approval ? t('confirm.requiresApproval') : t('confirm.submit')}
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
  safeArea: { flex: 1, backgroundColor: color.paper },
  body: { padding: space.xl, gap: space.sm },
  title: {
    fontSize: fontSize.xxl,
    lineHeight: lineHeight.xxl,
    fontWeight: fontWeight.bold,
    color: color.foreground,
    marginBottom: space.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  rowLabel: { fontSize: fontSize.sm, color: color.mutedForeground },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.foreground,
  },
  windowBlock: {
    marginTop: space.lg,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: color.surface,
    gap: space.xs,
  },
  windowPrimary: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: color.foreground,
  },
  shortWindow: { fontSize: fontSize.sm, lineHeight: lineHeight.sm, color: color.warning },
  noLimit: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: color.success },
  cancellation: { marginTop: space.sm, fontSize: fontSize.sm, color: color.mutedForeground },
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
    borderTopColor: color.border,
    backgroundColor: color.surface,
  },
  primary: {
    minHeight: touchTarget.minimum + 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  primaryPressed: { backgroundColor: color.primaryPressed },
  primaryDisabled: { opacity: 0.6 },
  primaryText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.primaryForeground,
  },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
