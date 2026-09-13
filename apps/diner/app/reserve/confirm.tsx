import { bookingFailure, tableCopy, type CopyLine } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { IconButton } from '../../src/components/IconButton';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Skeleton } from '../../src/components/Skeleton';
import { Text, TextInput } from '../../src/components/Text';
import { refreshRoomAfterLoss } from '../../src/data/bookingCache';
import { useBranchTimeZone } from '../../src/data/orderQueries';
import { useCreateBooking, useSlotFloor, useVenue } from '../../src/data/queries';
import { branchZoneSource } from '../../src/lib/browse';
import { newCommandId } from '../../src/lib/commandId';
import { GUEST_NAME_MAX_LENGTH, canSubmit, confirmState } from '../../src/lib/confirm';
import { useBookingNotes } from '../../src/stores/bookingNotes';
import { useConflict } from '../../src/stores/conflict';
import { useSession } from '../../src/stores/session';
import { actionIcon, colors, fontWeight, layout, radius, space, typography } from '../../src/theme';

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
  const insets = useSafeAreaInsets();
  const forward = useLocalSearchParams<{
    branchId: string;
    venueId?: string;
    tableId: string;
    slotUtc: string;
    partySize: string;
    /** The special request typed on the booking screen, carried through verification. */
    requests?: string;
  }>();
  const { branchId, venueId, tableId, slotUtc, partySize, requests } = forward;

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
  /**
   * The server refused because the account's number is not verified yet. Gone
   * once the refreshed profile says it is, so tapping Confirm again is the retry.
   */
  const [verifyRefused, setVerifyRefused] = useState(false);
  const profilePhoneVerified = useSession((s) => s.profile?.phoneVerified);
  const mustVerify = verifyRefused && profilePhoneVerified !== true;
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
  const saveNote = useBookingNotes((s) => s.setNote);
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

      // The request typed before the SMS detour, kept against the booking it
      // was made for. See `stores/bookingNotes`.
      if (requests) saveNote(booking.id, requests);
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

      // Nothing was booked, and the command id stays: the retry after
      // verifying is the same command.
      if (failure.kind === 'phoneNotVerified') {
        setVerifyRefused(true);
        setOutcomeUnknown(false);
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
    requests,
    saveNote,
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

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <IconButton
            icon={actionIcon.back}
            accessibilityLabel={t('floorPlan.back')}
            variant="ghost"
            onPress={back}
          />
          <Text display numberOfLines={1} style={styles.title} accessibilityRole="header">
            {t('confirm.title')}
          </Text>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.rows}>
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
            <Row label={t('confirm.tableRow')} value={table?.tableLabel ?? ''} last />
          </Card>

          <SectionHeader label={t('confirm.nameLabel')} style={styles.section} />
          <TextInput
            style={styles.input}
            value={guestName}
            onChangeText={setGuestName}
            placeholder={t('confirm.namePlaceholder')}
            placeholderTextColor={colors.textSubtle}
            maxLength={GUEST_NAME_MAX_LENGTH}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            accessibilityLabel={t('confirm.nameLabel')}
          />

          {requests ? (
            <>
              <SectionHeader
                label={t('book.specialRequests')}
                icon={actionIcon.note}
                style={styles.section}
              />
              <Card style={styles.requestCard}>
                <Text style={styles.request}>{requests}</Text>
              </Card>
            </>
          ) : null}

          {/* The table's answer, said as what it is — never an empty block and a
              live button while it is still loading, failed, or gone. */}
          <SectionHeader label={t('confirm.window')} style={styles.section} />
          {state === 'loading' ? (
            <Card style={styles.windowCard}>
              <Skeleton width="60%" height={20} />
              <Skeleton width="80%" height={14} />
              <Text style={styles.loading}>{t('confirm.loading')}</Text>
            </Card>
          ) : state === 'offline' ? (
            <Card style={styles.windowCard}>
              <Text style={styles.notice}>{t('net.offline')}</Text>
            </Card>
          ) : state === 'error' ? (
            <Card style={styles.windowCard}>
              <Text style={styles.notice}>{t('confirm.tableError')}</Text>
              <Button
                label={t('net.retry')}
                variant="outline"
                fullWidth={false}
                onPress={() => void slotQuery.refetch()}
              />
            </Card>
          ) : state === 'missing' ? (
            <Card style={styles.windowCard}>
              <Text style={styles.notice}>{t('confirm.tableMissing')}</Text>
            </Card>
          ) : state === 'unavailable' && copy?.unavailable ? (
            <Card style={styles.windowCard}>
              <Text style={styles.notice} accessibilityRole="alert">
                {line(copy.unavailable)}
              </Text>
            </Card>
          ) : (
            <Card style={styles.windowCard}>
              {/* The window again, so the limit is in front of them at the moment
                  of commitment and not only back on the sheet. */}
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
              {copy?.freeCancellation ? (
                <Text style={styles.cancellation}>{line(copy.freeCancellation)}</Text>
              ) : null}
              {copy?.approval ? <Text style={styles.approval}>{line(copy.approval)}</Text> : null}
            </Card>
          )}

          {/* A restored session from before the number was remembered: the
              booking needs it, and the only honest source is confirming it. */}
          {!phoneE164 ? (
            <Card style={styles.windowCard}>
              <Text style={styles.notice}>{t('confirm.phoneMissing')}</Text>
              <Button
                label={t('confirm.verifyNumber')}
                variant="outline"
                fullWidth={false}
                onPress={() => router.replace({ pathname: '/auth/login', params: forward })}
              />
            </Card>
          ) : null}

          {/* Opened with no booking params on purpose: the code flow then goes
              back to this very screen, with its command id, instead of
              replacing itself with a second confirm screen. */}
          {mustVerify ? (
            <Card style={[styles.windowCard, styles.verifyCard]}>
              <Text style={styles.notice} accessibilityRole="alert">
                {t('confirm.error.phoneNotVerified')}
              </Text>
              <Button
                label={t('confirm.verifyMyNumber')}
                onPress={() => router.push('/auth/code')}
              />
            </Card>
          ) : null}

          {errorText ? (
            <Text style={styles.error} accessibilityRole="alert">
              {errorText}
            </Text>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          {/* No optimistic success: a booking either exists on the server or it
              does not, and telling someone they have a table when they might
              not is the worst possible lie in this app. */}
          <Button
            label={
              pending
                ? t('confirm.submitting')
                : outcomeUnknown
                  ? t('confirm.checkAgain')
                  : copy?.approval
                    ? t('confirm.requiresApproval')
                    : t('confirm.submit')
            }
            size="large"
            disabled={!enabled}
            onPress={() => void submit()}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Row({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  title: { ...typography.heading, color: colors.text, flexShrink: 1 },
  body: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xl,
  },
  section: { marginTop: space.xl, marginBottom: space.md },
  rows: { paddingVertical: space.xs },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.lg,
    paddingVertical: space.sm + 2,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { ...typography.body, color: colors.textMuted },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    ...typography.body,
    fontWeight: fontWeight.medium,
    color: colors.text,
  },
  input: {
    minHeight: layout.controlHeight,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    ...typography.body,
  },
  requestCard: { padding: space.md },
  request: { ...typography.body, color: colors.text },
  windowCard: { gap: space.sm },
  verifyCard: { marginTop: space.lg },
  loading: { ...typography.caption, color: colors.textMuted },
  windowPrimary: { ...typography.h3, color: colors.text },
  shortWindow: { ...typography.caption, color: colors.warning },
  noLimit: { ...typography.h3, color: colors.success },
  cancellation: { ...typography.caption, color: colors.textMuted },
  approval: { ...typography.caption, color: colors.info },
  notice: { ...typography.body, color: colors.text },
  error: { ...typography.body, color: colors.error, marginTop: space.lg },
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
