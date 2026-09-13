import { Ionicons } from '@expo/vector-icons';
import { bookingFailure, unavailableCopy } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { formatTime, intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { Chip } from '../../src/components/Chip';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { IconButton } from '../../src/components/IconButton';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Skeleton } from '../../src/components/Skeleton';
import { Text, TextInput } from '../../src/components/Text';
import { PlaceSummaryCard } from '../../src/components/place/PlaceSummaryCard';
import { useCapacityLabel } from '../../src/components/tables/TableMarker';
import { useDinerProfile } from '../../src/data/accountQueries';
import { useCreateBooking, useSlotFloor } from '../../src/data/queries';
import { newCommandId } from '../../src/lib/commandId';
import { GUEST_NAME_MAX_LENGTH } from '../../src/lib/confirm';
import { placeKeys, usePlace, usePlaceTables } from '../../src/places/hooks';
import type { Place, TablePhotoMarker } from '../../src/places/model';
import { dayOptions, tablesForParty, timeSlots, type DayOption } from '../../src/places/slots';
import { useBookingNotes } from '../../src/stores/bookingNotes';
import { useSession } from '../../src/stores/session';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  space,
  tabularNumbers,
  typography,
} from '../../src/theme';

/** The party sizes offered as chips; the last one opens the larger sizes. */
const PARTY_SIZES = [2, 3, 4] as const;
const PARTY_MORE_FROM = 5;
const PARTY_MAX = 12;
const DAYS_AHEAD = 7;
const SLOT_COLUMNS = 3;
const REQUEST_MAX_LENGTH = 500;

// A type alias, not an interface: `useLocalSearchParams` wants an implicit
// index signature, which only object literal types carry.
type BookingParams = {
  placeId: string;
  tableId?: string;
  tableLabel?: string;
  capacityMin?: string;
  capacityMax?: string;
};

function positiveInt(value: string | undefined): number | null {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Date, time, party size, the table if one was tapped on the photo, and one
 * press to confirm.
 *
 * A verified number is asked for here and nowhere earlier: a diner without one
 * is handed to `/auth/login` with the same forward params the floor plan uses, and
 * comes out on the existing confirm screen. A verified diner books from here.
 */
export default function BookingScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const params = useLocalSearchParams<BookingParams>();
  const placeQuery = usePlace(params.placeId);
  const tablesQuery = usePlaceTables(params.placeId);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  if (placeQuery.isLoading) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header onBack={back} />
        <View style={styles.skeleton}>
          <Skeleton height={88} borderRadius={radius.card} />
          <Skeleton width="30%" height={18} />
          <Skeleton height={64} borderRadius={radius.chip} />
          <Skeleton width="30%" height={18} />
          <Skeleton height={40} borderRadius={radius.chip} />
          <Skeleton height={40} borderRadius={radius.chip} />
        </View>
      </Screen>
    );
  }

  if (placeQuery.isError || isOfflinePaused(placeQuery)) {
    const notAvailable = placeQuery.error?.name === 'PlaceApiNotImplementedError';
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header onBack={back} />
        <ErrorState
          offline={isOfflinePaused(placeQuery)}
          {...(notAvailable
            ? { title: t('net.notAvailable'), body: t('net.notAvailableBody') }
            : {})}
          onRetry={() => void placeQuery.refetch()}
          style={styles.centered}
        />
      </Screen>
    );
  }

  const place = placeQuery.data ?? null;
  if (!place) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header onBack={back} />
        <EmptyState
          icon={actionIcon.error}
          title={t('floorPlan.notFound')}
          action={{ label: t('floorPlan.back'), onPress: back }}
          style={styles.centered}
        />
      </Screen>
    );
  }

  return (
    <BookingForm
      place={place}
      tables={tablesQuery.data ?? place.tables}
      params={params}
      onBack={back}
    />
  );
}

interface BookingFormProps {
  readonly place: Place;
  readonly tables: readonly TablePhotoMarker[];
  readonly params: BookingParams;
  readonly onBack: () => void;
}

function BookingForm({ place, tables, params, onBack }: BookingFormProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const capacityLabel = useCapacityLabel();

  // The table from the photo, if the diner came from one.
  const chosenTable = useMemo(() => {
    if (!params.tableId) return null;
    const live = tables.find((table) => table.tableId === params.tableId);
    const min = positiveInt(params.capacityMin) ?? live?.capacityMin ?? 1;
    const max = positiveInt(params.capacityMax) ?? live?.capacityMax ?? PARTY_MAX;
    return {
      tableId: params.tableId,
      label: params.tableLabel ?? live?.label ?? '',
      capacityMin: min,
      capacityMax: Math.max(min, max),
      live: live ?? null,
    };
  }, [params.tableId, params.tableLabel, params.capacityMin, params.capacityMax, tables]);
  const capacityMin = chosenTable?.capacityMin ?? null;
  const capacityMax = chosenTable?.capacityMax ?? null;
  const fits = (size: number): boolean =>
    (capacityMin === null || size >= capacityMin) && (capacityMax === null || size <= capacityMax);

  // "Now", read once: the slot list must not reshuffle under a finger.
  const now = useMemo(() => new Date(), []);
  const days = useMemo(
    () => dayOptions(now, place.timeZoneId, DAYS_AHEAD),
    [now, place.timeZoneId],
  );

  const [dateKey, setDateKey] = useState<string | null>(null);
  const [slotKey, setSlotKey] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(() => {
    const min = chosenTable?.capacityMin ?? PARTY_SIZES[0];
    return Math.min(Math.max(min, PARTY_SIZES[0]), chosenTable?.capacityMax ?? PARTY_MAX);
  });
  const [moreOpen, setMoreOpen] = useState(partySize >= PARTY_MORE_FROM);
  const [requests, setRequests] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);

  const activeDateKey = dateKey ?? days[0]?.dateKey ?? null;
  const slots = useMemo(
    () => (activeDateKey ? timeSlots(place, activeDateKey, now) : []),
    [place, activeDateKey, now],
  );
  // The tapped slot while it is still on offer, else the first of the day.
  const activeSlot = slots.find((slot) => slot.key === slotKey) ?? slots[0] ?? null;
  const slotUtc = activeSlot?.at.toISOString() ?? '';

  /*
   * The room **as it will be at the slot**, from the same read the floor plan
   * and the confirm screen use. The photo's markers say who is sitting where
   * right now; a table free tonight is not necessarily free tomorrow at eight,
   * and one occupied now may well be. So the tapped table is checked against
   * the slot, and with no table tapped the first one the server would take is
   * booked — never the first one that happens to be empty this minute.
   */
  const slotQuery = useSlotFloor({
    branchId: activeSlot ? place.id : undefined,
    slotUtc,
    partySize,
    timeZoneId: place.timeZoneId,
  });
  const slotTables = slotQuery.data?.tables;
  const chosenAtSlot = useMemo(
    () => slotTables?.find((table) => table.tableId === chosenTable?.tableId) ?? null,
    [slotTables, chosenTable?.tableId],
  );
  const autoTableId = useMemo(() => {
    if (chosenTable) return null;
    if (slotTables) return slotTables.find((table) => table.isBookable)?.tableId ?? null;
    // No slot answer yet (or none possible): the photo's own free tables, so
    // the button is not dead while the server is thinking.
    return tablesForParty(tables, partySize)[0]?.tableId ?? null;
  }, [chosenTable, slotTables, tables, partySize]);

  // Why the tapped table cannot be had at this slot, if it cannot.
  const chosenRefusal: string | null = useMemo(() => {
    if (!chosenTable) return null;
    if (chosenAtSlot) {
      if (chosenAtSlot.isBookable) return null;
      const line = unavailableCopy(chosenAtSlot.unavailableReason, partySize);
      return t(line.key, line.params);
    }
    if (slotQuery.data && !chosenAtSlot) return t('confirm.tableMissing');
    // No slot answer yet: the photo's live state is the best available word.
    if (chosenTable.live && chosenTable.live.status !== 'free') return t('tables.notBookable');
    return null;
  }, [chosenTable, chosenAtSlot, slotQuery.data, partySize, t]);

  // Who books. The number is verified by SMS; the name is remembered from the
  // first booking and asked for once here when it is not.
  const signedIn = useSession((s) => s.signedIn);
  const phoneE164 = useSession((s) => s.phoneE164);
  const rememberedName = useSession((s) => s.guestName);
  const rememberName = useSession((s) => s.setGuestName);
  const saveNote = useBookingNotes((s) => s.setNote);
  const [guestName, setGuestName] = useState(rememberedName ?? '');
  // A diner who still has to confirm their number gives the name on the confirm
  // screen after the SMS, so it is neither required nor asked twice here.
  const verified = signedIn && Boolean(phoneE164);
  const needsName = verified && !rememberedName;
  /*
   * An account whose number has never passed the SMS code cannot book. Known
   * from the profile before the tap, or from the server's refusal after it
   * (the backstop); either way Confirm becomes the Verify step, until the
   * refreshed profile says the number is verified.
   */
  // Read here so the check does not depend on the Profile tab having been opened.
  useDinerProfile();
  const profilePhoneVerified = useSession((s) => s.profile?.phoneVerified);
  const [verifyRefused, setVerifyRefused] = useState(false);
  const mustVerify =
    verified &&
    (profilePhoneVerified === false || (verifyRefused && profilePhoneVerified !== true));

  // One id per screen, reused on every retry — see `confirm.tsx`.
  const commandId = useRef(newCommandId());
  const createBooking = useCreateBooking();
  const pending = createBooking.isPending;

  const targetTableId = chosenTable?.tableId ?? autoTableId;
  const noTableFits = !chosenTable && autoTableId === null;

  const canConfirm =
    activeSlot !== null &&
    targetTableId !== null &&
    chosenRefusal === null &&
    !pending &&
    (!verified || guestName.trim().length > 0);

  const confirm = useCallback(async () => {
    if (!activeSlot || !targetTableId || pending || chosenRefusal) return;
    setErrorText(null);
    const note = requests.trim();
    const forward = {
      branchId: place.id,
      venueId: place.venueId,
      tableId: targetTableId,
      slotUtc,
      partySize: String(partySize),
      ...(note ? { requests: note } : {}),
    };

    // Not verified, or verified on a restored session that never stored the
    // number: log in (the SMS step), then the existing confirm screen — with
    // whatever name was typed here already remembered for it.
    if (!verified || !phoneE164) {
      const typed = guestName.trim();
      if (typed) rememberName(typed);
      router.push({ pathname: '/auth/login', params: forward });
      return;
    }

    const name = guestName.trim();
    if (!name) return;
    rememberName(name);

    // The code flow, with the booking in hand: it lands on `/reserve/confirm`.
    if (mustVerify) {
      router.push({ pathname: '/auth/code', params: forward });
      return;
    }

    try {
      const booking = await createBooking.mutateAsync({
        commandId: commandId.current,
        branchId: place.id,
        tableId: targetTableId,
        slotUtc,
        timeZoneId: place.timeZoneId,
        partySize,
        guestName: name,
        guestPhone: phoneE164,
        channel: 'app',
      });
      // The request goes with the booking on this phone — see `stores/bookingNotes`.
      if (note) saveNote(booking.id, note);
      void queryClient.invalidateQueries({ queryKey: placeKeys.tables(place.id) });
      router.replace({ pathname: '/reserve/success', params: { bookingId: booking.id } });
    } catch (error) {
      const failure = bookingFailure(error, place.timeZoneId, locale);
      if (failure.kind === 'tableTaken') {
        // The photo underneath and the slot answer are told to redraw; the
        // diner picks again.
        void queryClient.invalidateQueries({ queryKey: placeKeys.tables(place.id) });
        void slotQuery.refetch();
      }
      // Nothing was booked; the command id stays for the retry.
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
    mustVerify,
    activeSlot,
    targetTableId,
    pending,
    chosenRefusal,
    requests,
    place.id,
    place.venueId,
    place.timeZoneId,
    slotUtc,
    partySize,
    verified,
    phoneE164,
    guestName,
    rememberName,
    router,
    createBooking,
    saveNote,
    queryClient,
    slotQuery,
    locale,
    t,
  ]);

  const selectParty = useCallback((size: number) => {
    setPartySize(size);
    setErrorText(null);
  }, []);

  const moreSizes = useMemo(() => {
    const top = Math.min(PARTY_MAX, capacityMax ?? PARTY_MAX);
    return Array.from(
      { length: Math.max(0, top - PARTY_MORE_FROM + 1) },
      (_, i) => PARTY_MORE_FROM + i,
    ).filter(fits);
    // `fits` reads the same two bounds this depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacityMin, capacityMax]);
  const moreAllowed = moreSizes.length > 0;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Header onBack={onBack} />
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PlaceSummaryCard place={place} />

          <SectionHeader label={t('book.date')} icon={actionIcon.calendar} style={styles.section} />
          <DayStrip
            days={days}
            selectedKey={activeDateKey}
            timeZoneId={place.timeZoneId}
            onSelect={(key) => {
              setDateKey(key);
              setSlotKey(null);
              setErrorText(null);
            }}
          />

          <SectionHeader label={t('book.time')} icon={actionIcon.time} style={styles.section} />
          {slots.length === 0 ? (
            <Text style={styles.empty}>{t('book.noSlots')}</Text>
          ) : (
            <SlotGrid
              slots={slots}
              selectedKey={activeSlot?.key ?? null}
              onSelect={(key) => {
                setSlotKey(key);
                setErrorText(null);
              }}
              format={(at) => formatTime(at, place.timeZoneId, locale)}
            />
          )}

          <SectionHeader
            label={t('book.partySize')}
            icon={actionIcon.people}
            style={styles.section}
          />
          <View style={styles.chips}>
            {PARTY_SIZES.map((size) => (
              <Chip
                key={size}
                label={String(size)}
                shape="rounded"
                selected={!moreOpen && partySize === size}
                // A table for four to six is not a table for two, any more
                // than a table for two is a table for six.
                disabled={!fits(size)}
                onPress={() => {
                  setMoreOpen(false);
                  selectParty(size);
                }}
              />
            ))}
            <Chip
              label={t('book.partySizeMore', { count: PARTY_MORE_FROM })}
              shape="rounded"
              selected={moreOpen}
              disabled={!moreAllowed}
              onPress={() => {
                setMoreOpen(true);
                if (partySize < PARTY_MORE_FROM) selectParty(moreSizes[0] ?? PARTY_MORE_FROM);
              }}
            />
          </View>
          {moreOpen && moreSizes.length > 0 ? (
            <View style={[styles.chips, styles.moreChips]}>
              {moreSizes.map((size) => (
                <Chip
                  key={size}
                  label={String(size)}
                  shape="rounded"
                  size="sm"
                  selected={partySize === size}
                  onPress={() => selectParty(size)}
                />
              ))}
            </View>
          ) : null}

          {chosenTable ? (
            <>
              <SectionHeader
                label={t('book.selectedTable')}
                icon={actionIcon.table}
                style={styles.section}
              />
              <Card style={styles.tableCard}>
                <View style={styles.tableIcon}>
                  <Ionicons name={actionIcon.table} size={iconSize.md} color={colors.primary} />
                </View>
                <Text numberOfLines={1} style={styles.tableText}>
                  {`${t('tables.table', { label: chosenTable.label })} · ${capacityLabel(chosenTable)}`}
                </Text>
              </Card>
              {chosenRefusal ? (
                <Text accessibilityRole="alert" style={styles.warning}>
                  {chosenRefusal}
                </Text>
              ) : null}
            </>
          ) : noTableFits ? (
            <Text accessibilityRole="alert" style={styles.warning}>
              {t('book.noTableForParty', { count: partySize })}
            </Text>
          ) : null}

          {needsName ? (
            <>
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
            </>
          ) : null}

          <SectionHeader
            label={t('book.specialRequests')}
            icon={actionIcon.note}
            hint={t('book.optional')}
            style={styles.section}
          />
          <TextInput
            style={[styles.input, styles.requests]}
            value={requests}
            onChangeText={setRequests}
            placeholder={t('book.requestPlaceholder')}
            placeholderTextColor={colors.textSubtle}
            multiline
            maxLength={REQUEST_MAX_LENGTH}
            textAlignVertical="top"
            accessibilityLabel={t('book.specialRequests')}
          />
          {/* Honest about where the words go: the reservation API carries no
              note yet, so the request stays on this booking, on this phone. */}
          <Text style={styles.hint}>{t('book.requestHint')}</Text>

          {mustVerify ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {t('confirm.error.phoneNotVerified')}
            </Text>
          ) : null}

          {errorText ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {errorText}
            </Text>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
          <Button
            label={
              pending
                ? t('confirm.submitting')
                : mustVerify
                  ? t('confirm.verifyMyNumber')
                  : outcomeUnknown
                    ? t('confirm.checkAgain')
                    : t('book.confirm')
            }
            size="large"
            disabled={!canConfirm}
            onPress={() => void confirm()}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation('diner');
  return (
    <View style={styles.header}>
      <IconButton
        icon={actionIcon.back}
        accessibilityLabel={t('floorPlan.back')}
        variant="ghost"
        onPress={onBack}
      />
      <Text display numberOfLines={1} style={styles.title} accessibilityRole="header">
        {t('book.title')}
      </Text>
    </View>
  );
}

interface DayStripProps {
  readonly days: readonly DayOption[];
  readonly selectedKey: string | null;
  readonly timeZoneId: string;
  readonly onSelect: (dateKey: string) => void;
}

/** "Tue 22" cards in a row; the selected one is brown. */
function DayStrip({ days, selectedKey, timeZoneId, onSelect }: DayStripProps) {
  const { locale } = useLocale();
  const weekday = useMemo(
    () => new Intl.DateTimeFormat(intlTag(locale), { weekday: 'short', timeZone: timeZoneId }),
    [locale, timeZoneId],
  );
  const full = useMemo(
    () =>
      new Intl.DateTimeFormat(intlTag(locale), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: timeZoneId,
      }),
    [locale, timeZoneId],
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.dayStrip}
    >
      {days.map((day) => {
        const selected = day.dateKey === selectedKey;
        return (
          <Pressable
            key={day.dateKey}
            accessibilityRole="button"
            accessibilityLabel={full.format(day.date)}
            accessibilityState={{ selected }}
            onPress={() => onSelect(day.dateKey)}
            style={({ pressed }) => [
              styles.day,
              selected ? styles.daySelected : styles.dayIdle,
              pressed && (selected ? styles.daySelectedPressed : styles.dayIdlePressed),
            ]}
          >
            <Text style={[styles.dayName, selected && styles.onPrimary]}>
              {weekday.format(day.date)}
            </Text>
            <Text style={[styles.dayNumber, selected && styles.onPrimary]}>
              {String(day.dayOfMonth)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

interface SlotGridProps {
  readonly slots: readonly { key: string; at: Date }[];
  readonly selectedKey: string | null;
  readonly onSelect: (key: string) => void;
  readonly format: (at: Date) => string;
}

/** Three slot chips per row; the selected one is brown. */
function SlotGrid({ slots, selectedKey, onSelect, format }: SlotGridProps) {
  const [width, setWidth] = useState(0);
  const column = width > 0 ? (width - space.sm * (SLOT_COLUMNS - 1)) / SLOT_COLUMNS : undefined;
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.slotGrid}>
      {slots.map((slot) => (
        <Chip
          key={slot.key}
          label={format(slot.at)}
          shape="rounded"
          selected={slot.key === selectedKey}
          onPress={() => onSelect(slot.key)}
          style={[styles.slot, column !== undefined && { width: column }]}
        />
      ))}
    </View>
  );
}

const DAY_WIDTH = 60;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  title: { ...typography.heading, color: colors.text, flexShrink: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.sm,
    paddingBottom: space.xl,
  },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm, gap: space.md },
  section: { marginTop: space.xl, marginBottom: space.md },

  dayStrip: { gap: space.sm },
  day: {
    width: DAY_WIDTH,
    paddingVertical: space.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.chip,
    borderWidth: 1,
  },
  dayIdle: { backgroundColor: colors.surface, borderColor: colors.border },
  dayIdlePressed: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderStrong },
  daySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  daySelectedPressed: {
    backgroundColor: colors.primaryPressed,
    borderColor: colors.primaryPressed,
  },
  dayName: { ...typography.caption, fontWeight: fontWeight.medium, color: colors.textMuted },
  dayNumber: { ...typography.h3, ...tabularNumbers, color: colors.text },
  onPrimary: { color: colors.onPrimary },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  slot: { alignSelf: 'auto', paddingHorizontal: space.sm },
  empty: { ...typography.body, color: colors.textMuted },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  moreChips: { marginTop: space.sm },

  tableCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  tableIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.small,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableText: {
    ...typography.body,
    fontWeight: fontWeight.medium,
    color: colors.text,
    flexShrink: 1,
  },
  warning: {
    ...typography.body,
    color: colors.warning,
    marginTop: space.md,
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
  requests: { minHeight: 96 },
  hint: { ...typography.caption, color: colors.textSubtle, marginTop: space.sm },
  error: { ...typography.body, color: colors.error, marginTop: space.lg },

  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
