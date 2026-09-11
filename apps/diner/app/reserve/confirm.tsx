import { bookingFailure, tableCopy, type CopyLine } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
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
import { QueryLoading } from '../../src/components/QueryState';
import { Text, TextInput } from '../../src/components/Text';
import { refreshRoomAfterLoss } from '../../src/data/bookingCache';
import { useBranchTimeZone } from '../../src/data/orderQueries';
import { useCreateBooking, useSlotFloor, useVenue } from '../../src/data/queries';
import { branchZoneSource } from '../../src/lib/browse';
import { newCommandId } from '../../src/lib/commandId';
import { GUEST_NAME_MAX_LENGTH, canSubmit, confirmState } from '../../src/lib/confirm';
import { useConflict } from '../../src/stores/conflict';
import { useSession } from '../../src/stores/session';

/**
 * A short review, and the one thing the venue needs from the diner: the name to
 * ask for at the door. Changing the party or the time means going back to the
 * plan, because both change which tables are even available.
 */
export default function ConfirmScreen() {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const forward = useLocalSearchParams<{
    branchId: string;
    venueId?: string;
    tableId: string;
    slotUtc: string;
    partySize: string;
  }>();
  const { branchId, venueId, tableId, slotUtc, partySize } = forward;

  /*
   * Route params, treated as untrusted input.
   *
   * These are pushed by the branch screen from state it built, so in the
   * ordinary flow they are always sound. But Expo Router serves deep links, and
   * a hand-made one can carry anything — and `formatDate` below throws on a
   * string it cannot read, during render, in a tree with no error boundary.
   */
  const size = Number.isInteger(Number(partySize)) && Number(partySize) > 0 ? Number(partySize) : 2;
  const slotDate = useMemo(() => {
    if (!slotUtc) return null;
    const parsed = new Date(slotUtc);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [slotUtc]);

  const [errorText, setErrorText] = useState<string | null>(null);
  /** The last attempt may have committed: the button checks rather than books. */
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);

  /**
   * Generated once per screen and reused on every retry — including "Check
   * again" after a dropped connection, which is what makes that safe: the
   * server answers a repeat of the same id with the booking it already made.
   * Replaced only when the server says somebody else has spent it.
   */
  const commandId = useRef(newCommandId());

  // Who the booking is under. The number was confirmed by SMS and is
  // remembered; the name is asked here once and remembered too.
  const phoneE164 = useSession((s) => s.phoneE164);
  const rememberedName = useSession((s) => s.guestName);
  const rememberName = useSession((s) => s.setGuestName);
  const [guestName, setGuestName] = useState(rememberedName ?? '');

  const venueQuery = useVenue(venueId);
  const branch = venueQuery.data?.branches.find((b) => b.id === branchId) ?? null;

  // The branch's own zone — from the card, or asked of the branch. Never guessed.
  const zoneSource = branchZoneSource({
    venueId,
    venueStatus: venueQuery.isSuccess ? 'success' : venueQuery.isError ? 'error' : 'pending',
    zoneFromVenue: branch?.timeZoneId ?? null,
    zoneFromBranch: undefined,
  });
  const zoneQuery = useBranchTimeZone(zoneSource.lookup ? branchId : undefined);
  const timeZoneId = zoneSource.zone ?? zoneQuery.data ?? null;

  /*
   * The table's answer for this slot, from the same slot-aware read the room
   * was drawn from, in the branch's zone. It used to be asked without one, so
   * the gateway converted the slot in a guessed zone — and the room's cached
   * answer is reused rather than asked for again.
   */
  const slotQuery = useSlotFloor({
    branchId: timeZoneId ? branchId : undefined,
    slotUtc: slotUtc ?? '',
    partySize: size,
    timeZoneId: timeZoneId ?? undefined,
    debounceMs: 0,
  });
  const table = useMemo(
    () => slotQuery.data?.tables.find((a) => a.tableId === tableId) ?? null,
    [slotQuery.data, tableId],
  );
  const zone = timeZoneId ?? slotQuery.data?.plan.timeZoneId ?? null;
  const branchName = branch?.name ?? slotQuery.data?.plan.branchName ?? '';

  const state = confirmState({
    offline: isOfflinePaused(slotQuery),
    isLoading:
      slotQuery.isLoading || (!timeZoneId && (venueQuery.isLoading || zoneQuery.isLoading)),
    isError: slotQuery.isError || zoneQuery.isError,
    table,
  });

  const createBooking = useCreateBooking();
  const pending = createBooking.isPending;

  const submit = useCallback(async () => {
    if (!canSubmit({ state, guestName, pending }) || !zone || !phoneE164 || !slotUtc) return;
    setErrorText(null);
    const name = guestName.trim();
    rememberName(name);

    try {
      const booking = await createBooking.mutateAsync({
        commandId: commandId.current,
        branchId: branchId ?? '',
        tableId: tableId ?? '',
        slotUtc,
        timeZoneId: zone,
        partySize: size,
        guestName: name,
        guestPhone: phoneE164,
        channel: 'app',
      });

      router.replace({ pathname: '/reserve/success', params: { bookingId: booking.id } });
    } catch (error) {
      // What kind of failure this was is decided in one shared place, so the
      // web page classifies the same refusal the same way. See `bookingFailure`.
      const failure = bookingFailure(error, zone, locale);

      // Losing the race is an expected outcome, not a failure screen. The room
      // underneath is told to redraw, and the diner is handed back to it with
      // the sheet closed and the reason above the plan.
      if (failure.kind === 'tableTaken') {
        void refreshRoomAfterLoss(queryClient, branchId ?? '');
        useConflict.getState().report(failure.error.tableLabel, failure.error.reason);
        // back(), not replace(): the branch screen underneath is still holding
        // this diner's slot and party size.
        router.back();
        return;
      }

      if (failure.kind === 'commandInUse') commandId.current = newCommandId();
      setOutcomeUnknown(failure.kind === 'unknown');
      setErrorText(t(failure.line.key, failure.line.params));
    }
  }, [
    state,
    guestName,
    pending,
    zone,
    phoneE164,
    slotUtc,
    rememberName,
    createBooking,
    branchId,
    tableId,
    size,
    router,
    queryClient,
    t,
    locale,
  ]);

  // The same assembled copy the sheet showed, so the promise on the review
  // screen is word-for-word the promise the diner accepted a screen earlier.
  const copy =
    table && zone ? tableCopy(table, { partySize: size, timeZoneId: zone, locale }) : null;
  const line = (value: CopyLine): string => t(value.key, value.params);
  const enabled = canSubmit({ state, guestName, pending }) && Boolean(phoneE164);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('confirm.title')}</Text>

        <Row
          label={t('confirm.venue')}
          value={venueQuery.data?.name ? `${venueQuery.data.name} · ${branchName}` : branchName}
        />
        <Row
          label={t('confirm.when')}
          value={
            slotDate && zone
              ? `${formatDate(slotDate, zone, locale)} · ${formatTime(slotDate, zone, locale)}`
              : ''
          }
        />
        <Row label={t('confirm.party')} value={t('booking.guests', { count: size })} />
        <Row label={t('confirm.tableRow')} value={table?.tableLabel ?? ''} />

        <Text style={styles.label}>{t('confirm.nameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={guestName}
          onChangeText={setGuestName}
          placeholder={t('confirm.namePlaceholder')}
          placeholderTextColor={color.mutedForeground}
          maxLength={GUEST_NAME_MAX_LENGTH}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          accessibilityLabel={t('confirm.nameLabel')}
        />

        {/* The table's answer, said as what it is — never an empty block and a
            live button while it is still loading, failed, or gone. */}
        {state === 'loading' ? (
          <QueryLoading label={t('confirm.loading')} />
        ) : state === 'offline' ? (
          <Text style={styles.notice}>{t('net.offline')}</Text>
        ) : state === 'error' ? (
          <View style={styles.noticeBlock}>
            <Text style={styles.notice}>{t('confirm.tableError')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void slotQuery.refetch()}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>{t('net.retry')}</Text>
            </Pressable>
          </View>
        ) : state === 'missing' ? (
          <Text style={styles.notice}>{t('confirm.tableMissing')}</Text>
        ) : state === 'unavailable' && copy?.unavailable ? (
          <Text style={styles.notice} accessibilityRole="alert">
            {line(copy.unavailable)}
          </Text>
        ) : (
          <>
            {/* The window again, so the limit is in front of them at the moment
                of commitment and not only back on the sheet. */}
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
          </>
        )}

        {/* A restored session from before the number was remembered: the
            booking needs it, and the only honest source is confirming it. */}
        {!phoneE164 ? (
          <View style={styles.noticeBlock}>
            <Text style={styles.notice}>{t('confirm.phoneMissing')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace({ pathname: '/verify', params: forward })}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>{t('confirm.verifyNumber')}</Text>
            </Pressable>
          </View>
        ) : null}

        {errorText ? (
          <Text style={styles.error} accessibilityRole="alert">
            {errorText}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !enabled, busy: pending }}
          disabled={!enabled}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.primary,
            pressed && styles.primaryPressed,
            !enabled && styles.primaryDisabled,
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
              {outcomeUnknown
                ? t('confirm.checkAgain')
                : copy?.approval
                  ? t('confirm.requiresApproval')
                  : t('confirm.submit')}
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
  label: { marginTop: space.md, fontSize: fontSize.sm, color: color.mutedForeground },
  input: {
    minHeight: touchTarget.minimum,
    paddingHorizontal: space.md,
    borderRadius: radius.soft,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
    color: color.foreground,
    fontSize: fontSize.md,
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
  noticeBlock: { marginTop: space.lg, gap: space.sm },
  notice: {
    marginTop: space.lg,
    fontSize: fontSize.md,
    lineHeight: lineHeight.md,
    color: color.foreground,
  },
  secondary: {
    minHeight: touchTarget.minimum,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.borderStrong,
  },
  secondaryText: { fontSize: fontSize.md, fontWeight: fontWeight.medium, color: color.foreground },
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
  primaryDisabled: { opacity: 0.45 },
  primaryText: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: color.primaryForeground,
  },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
