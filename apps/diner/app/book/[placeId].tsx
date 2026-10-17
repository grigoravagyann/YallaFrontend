import { Ionicons } from '@expo/vector-icons';
import { MAX_BOOKING_NOTE, bookingFailure, unavailableCopy, type CopyLine } from '@yalla/api';
import { isOfflinePaused } from '@yalla/api/react';
import { branchDayKey, formatTime, intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { IconButton } from '../../src/components/IconButton';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { Skeleton } from '../../src/components/Skeleton';
import { Text, TextInput } from '../../src/components/Text';
import { Rise } from '../../src/components/motion/Rise';
import { SlidingChoice, type SlidingOption } from '../../src/components/motion/SlidingChoice';
import { useToast } from '../../src/components/motion/Toast';
import {
  isUnchanged,
  parseChangeParams,
  type BookingChange,
} from '../../src/components/bookings/changeBooking';
import { placeArea, placeTitle } from '../../src/components/places/placeTitle';
import { BookCta, CtaFooter } from '../../src/components/place/BookCta';
import { ChoiceGrid, type ChoiceGridOption } from '../../src/components/place/ChoiceGrid';
import { RoomPhotosView } from '../../src/components/tables/RoomPhotosView';
import { TableLegend } from '../../src/components/tables/TableLegend';
import { useCapacityLabel } from '../../src/components/tables/TableMarker';
import { useDinerProfile } from '../../src/data/accountQueries';
import { bookingRefusal, changeFailureLine } from '../../src/data/bookingRefusals';
import {
  keys,
  useBookingRules,
  useCreateBooking,
  useDaySlots,
  useRescheduleBooking,
  useSlotFloor,
} from '../../src/data/queries';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { newCommandId } from '../../src/lib/commandId';
import { GUEST_NAME_MAX_LENGTH } from '../../src/lib/confirm';
import { placeKeys, usePlace, usePlaceRooms } from '../../src/places/hooks';
import { shiftDateKey, type Place, type PlaceRoom } from '../../src/places/model';
import { roomsAtSlot, slotRefusal } from '../../src/places/rooms';
import { bookingRulesInput } from '../../src/places/navigation';
import { dayRefusalLine, pickSlot, slotAvailability } from '../../src/places/slotAvailability';
import {
  LEAD_MINUTES,
  WINDOW_DAYS,
  dayOptions,
  tablesForParty,
  timeSlots,
  windowReaching,
  type DayOption,
} from '../../src/places/slots';
import { haptics } from '../../src/lib/haptics';
import { useSession } from '../../src/stores/session';
import {
  actionIcon,
  colors,
  fontWeight,
  iconSize,
  layout,
  radius,
  shadows,
  space,
  typography,
} from '../../src/theme';

/** The party sizes offered as chips; the last one opens the larger sizes. */
const PARTY_SIZES = [2, 3, 4] as const;
const PARTY_MORE_FROM = 5;
const PARTY_MAX = 12;
/** The design's five times to a row, and four days in view at once. */
const SLOT_COLUMNS = 5;
const SLOT_GAP = 6;
const DAYS_IN_VIEW = 4;
const DAY_GAP = space.sm;
/** The party pill: four 44pt choices with 4 between them. */
const PARTY_CELL = layout.touchTarget;
const PARTY_GAP = space.xs;
const PARTY_PILL_WIDTH = PARTY_CELL * 4 + PARTY_GAP * 3;

// A type alias, not an interface: `useLocalSearchParams` wants an implicit
// index signature, which only object literal types carry.
type BookingParams = {
  placeId: string;
  tableId?: string;
  tableLabel?: string;
  capacityMin?: string;
  capacityMax?: string;
  /**
   * Change mode: the booking being moved, and the day (`YYYY-MM-DD`), time
   * (`HH:mm`) and party it holds now — with `tableId`, its table. See
   * `changeBookingRoute`.
   */
  bookingId?: string;
  date?: string;
  time?: string;
  party?: string;
};

function positiveInt(value: string | undefined): number | null {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Date, time, party size, the table — tapped on a room photo here or on the
 * place's page, or left to the server — and one press to confirm.
 *
 * A verified number is asked for here and nowhere earlier: a diner without one
 * is handed to `/auth/login` with the same forward params the branch screen
 * uses, and comes out on the existing confirm screen. A verified diner books from here.
 *
 * With a `bookingId` the same screen changes that booking instead: opened on
 * its day, time, party and table, the diner's own table free at its own time,
 * and "Save changes" moving it — same code, same booking.
 */
export default function BookingScreen() {
  const { t } = useTranslation('diner');
  const router = useRouter();
  const params = useLocalSearchParams<BookingParams>();
  const { bookingId, date, time, party, tableId } = params;
  const change = useMemo(
    () => parseChangeParams({ bookingId, date, time, party, tableId }),
    [bookingId, date, time, party, tableId],
  );
  const title = change ? t('book.changeTitle') : t('book.title');
  const placeQuery = usePlace(params.placeId);
  const roomsQuery = usePlaceRooms(params.placeId);

  const back = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  if (placeQuery.isLoading) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header title={title} onBack={back} />
        <View style={styles.skeleton}>
          <Skeleton height={layout.touchTarget} borderRadius={radius.pill} />
          <Skeleton height={layout.touchTarget} borderRadius={radius.pill} />
          <Skeleton height={56} borderRadius={radius.card} />
          <Skeleton width="40%" height={20} />
          <Skeleton height={240} borderRadius={radius.card + 2} />
        </View>
      </Screen>
    );
  }

  if (placeQuery.isError || isOfflinePaused(placeQuery)) {
    return (
      <Screen edges={['top', 'left', 'right', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header title={title} onBack={back} />
        <ErrorState
          offline={isOfflinePaused(placeQuery)}
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
        <Header title={title} onBack={back} />
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
      rooms={roomsQuery.data ?? place.rooms}
      params={params}
      change={change}
      title={title}
      onBack={back}
    />
  );
}

interface BookingFormProps {
  readonly place: Place;
  /** The rooms, photos and live pins: what the room photos at the slot are drawn on. */
  readonly rooms: readonly PlaceRoom[];
  readonly params: BookingParams;
  /** The booking being changed, or `null` for a new one. */
  readonly change: BookingChange | null;
  readonly title: string;
  readonly onBack: () => void;
}

function BookingForm({ place, rooms, params, change, title, onBack }: BookingFormProps) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const capacityLabel = useCapacityLabel();
  const reducedMotion = useReducedMotion();
  const showToast = useToast((state) => state.show);
  const dayLabel = useDayLabel(place.timeZoneId);
  // The booking being changed is left out of every availability read, so its
  // own table reads free at its own time and at the times around it.
  const excludeBookingId = change?.bookingId;
  const scrollRef = useRef<ScrollView>(null);
  // Where "Pick a table" starts in the scroll, so a table taken under the
  // diner's finger can bring them back to the photo.
  const pickTop = useRef(0);

  // Every pin's live state, for the moment before the slot has answered.
  const tables = useMemo(
    () => rooms.flatMap((room) => room.photos.flatMap((photo) => photo.tables)),
    [rooms],
  );

  // The table from a photo: the one the diner came with, or one tapped here.
  const [pickedTableId, setPickedTableId] = useState<string | null>(params.tableId ?? null);
  const chosenTable = useMemo(() => {
    if (!pickedTableId) return null;
    const live = tables.find((table) => table.tableId === pickedTableId);
    // The route's figures are for the table the diner arrived with only.
    const fromRoute = pickedTableId === params.tableId;
    const min = (fromRoute ? positiveInt(params.capacityMin) : null) ?? live?.capacityMin ?? 1;
    const max =
      (fromRoute ? positiveInt(params.capacityMax) : null) ?? live?.capacityMax ?? PARTY_MAX;
    return {
      tableId: pickedTableId,
      label: (fromRoute ? params.tableLabel : undefined) ?? live?.label ?? '',
      capacityMin: min,
      capacityMax: Math.max(min, max),
      live: live ?? null,
    };
  }, [
    pickedTableId,
    params.tableId,
    params.tableLabel,
    params.capacityMin,
    params.capacityMax,
    tables,
  ]);
  const capacityMin = chosenTable?.capacityMin ?? null;
  const capacityMax = chosenTable?.capacityMax ?? null;
  const fits = (size: number): boolean =>
    (capacityMin === null || size >= capacityMin) && (capacityMax === null || size <= capacityMax);

  /*
   * How far ahead and how soon this branch takes bookings, read from its public
   * page by slug. The defaults stand in only while that loads (or for a place
   * with no slugs); the pickers then offer exactly the branch's window and lead,
   * so a diner is never offered a day or a time the server will refuse.
   */
  const rulesQuery = useBookingRules(bookingRulesInput(place));
  const windowDays = rulesQuery.data?.bookingWindowDays ?? WINDOW_DAYS;
  const leadMinutes = rulesQuery.data?.minLeadMinutes ?? LEAD_MINUTES;
  // Known from the place's page, or from the rules: the app cannot book here (K9).
  const bookingsOff =
    place.acceptsAppBookings === false || rulesQuery.data?.acceptsAppBookings === false;

  // "Now", read once: the slot list must not reshuffle under a finger.
  const now = useMemo(() => new Date(), []);
  // A booking being changed may lie beyond the window the strip starts with;
  // its own day is always on it.
  const changeDate = change?.date ?? null;
  const days = useMemo(
    () =>
      dayOptions(
        now,
        place.timeZoneId,
        windowReaching(now, place.timeZoneId, windowDays, changeDate),
      ),
    [now, place.timeZoneId, windowDays, changeDate],
  );

  // A change opens on what the booking holds; a new booking on the defaults.
  const [dateKey, setDateKey] = useState<string | null>(change?.date ?? null);
  const [slotKey, setSlotKey] = useState<string | null>(change?.time ?? null);
  const [partySize, setPartySize] = useState(() => {
    if (change?.partySize) return Math.min(change.partySize, PARTY_MAX);
    const min = chosenTable?.capacityMin ?? PARTY_SIZES[0];
    return Math.min(Math.max(min, PARTY_SIZES[0]), chosenTable?.capacityMax ?? PARTY_MAX);
  });
  const [moreOpen, setMoreOpen] = useState(partySize >= PARTY_MORE_FROM);
  const [requests, setRequests] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  // The table went to someone else between the photo and the tap (409): said
  // over the photo, where the next pick is made.
  const [conflictText, setConflictText] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const clearErrors = useCallback(() => {
    setErrorText(null);
    setConflictText(null);
  }, []);

  const activeDateKey = dateKey ?? days[0]?.dateKey ?? null;
  const slots = useMemo(
    () => (activeDateKey ? timeSlots(place, activeDateKey, now, leadMinutes) : []),
    [place, activeDateKey, now, leadMinutes],
  );
  /*
   * Which of those times nobody can have, for this party, from the server's
   * day of slots: struck, named so, never chosen. Nothing is struck while it
   * loads or when it fails — the room the diner opens still says whether a
   * table is free.
   */
  const daySlotsQuery = useDaySlots({
    branchId: place.id,
    date: activeDateKey ?? undefined,
    partySize,
    excludeBookingId,
  });
  // A late venue's times after midnight are the next date's, and only that
  // date's answer can say whether they can be had.
  const nextDateKey =
    activeDateKey && slots.some((slot) => branchDayKey(slot.at, place.timeZoneId) !== activeDateKey)
      ? shiftDateKey(activeDateKey, 1)
      : undefined;
  const nextDaySlotsQuery = useDaySlots({
    branchId: place.id,
    date: nextDateKey,
    partySize,
    excludeBookingId,
  });
  const dayAnswer = daySlotsQuery.isError ? null : daySlotsQuery.data;
  const nextDayAnswer = nextDaySlotsQuery.isError || !nextDateKey ? null : nextDaySlotsQuery.data;
  const availability = useMemo(
    () => slotAvailability(slots, [dayAnswer, nextDayAnswer], place.timeZoneId),
    [slots, dayAnswer, nextDayAnswer, place.timeZoneId],
  );
  // The tapped slot while it can still be had, else the first that can.
  const activeSlot = pickSlot(slots, availability.struck, slotKey);
  const slotUtc = activeSlot?.at.toISOString() ?? '';

  /*
   * The rooms **as they will be at the slot**, from the same read the branch
   * screen and the confirm screen use. The place page's pins say who is
   * sitting where right now; a table free tonight is not necessarily free tomorrow at eight,
   * and one occupied now may well be. So the tapped table is checked against
   * the slot, and with no table tapped the first one the server would take is
   * booked — never the first one that happens to be empty this minute.
   */
  const slotQuery = useSlotFloor({
    branchId: activeSlot ? place.id : undefined,
    slotUtc,
    partySize,
    timeZoneId: place.timeZoneId,
    excludeBookingId,
  });
  // With every time struck there is no slot, and the last slot's room (kept
  // on screen between answers) is not drawn as if it were this one's.
  const slotAnswer = activeSlot ? slotQuery.data : undefined;
  const slotTables = slotAnswer?.tables;
  /*
   * The rooms as they will be at the slot: every pin coloured by its state
   * then, and bookable only where the server would give it to this party.
   */
  const slotPlan = slotAnswer?.plan.tables;
  const slotRooms = useMemo(() => {
    if (!slotPlan) return [];
    const verdicts = new Map((slotTables ?? []).map((table) => [table.tableId, table]));
    return roomsAtSlot(
      rooms,
      slotPlan,
      (tableId) => verdicts.get(tableId)?.isBookable ?? false,
      (tableId) => verdicts.get(tableId)?.unavailableReason ?? null,
    ).filter((room) => room.photos.some((photo) => photo.tables.length > 0));
  }, [rooms, slotPlan, slotTables]);
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
    if (slotAnswer && !chosenAtSlot) return t('confirm.tableMissing');
    // No slot answer yet: the photo's live state is the best available word.
    if (chosenTable.live && chosenTable.live.status !== 'free') return t('tables.notBookable');
    return null;
  }, [chosenTable, chosenAtSlot, slotAnswer, partySize, t]);

  // Who books. The number is verified by SMS; the name is remembered from the
  // first booking and asked for once here when it is not.
  const signedIn = useSession((s) => s.signedIn);
  const phoneE164 = useSession((s) => s.phoneE164);
  const rememberedName = useSession((s) => s.guestName);
  const rememberName = useSession((s) => s.setGuestName);
  const [guestName, setGuestName] = useState(rememberedName ?? '');
  // A diner who still has to confirm their number gives the name on the confirm
  // screen after the SMS, so it is neither required nor asked twice here.
  const verified = signedIn && Boolean(phoneE164);
  // A booking being changed already has its name.
  const needsName = !change && verified && !rememberedName;
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
  // Not for a change: the booking was made on a verified number, and the code
  // flow ends on the confirm screen, which makes a new booking.
  const mustVerify =
    !change &&
    verified &&
    (profilePhoneVerified === false || (verifyRefused && profilePhoneVerified !== true));

  // One id per screen, reused on every retry — see `confirm.tsx`.
  const commandId = useRef(newCommandId());
  const createBooking = useCreateBooking();
  const reschedule = useRescheduleBooking();
  const pending = createBooking.isPending || reschedule.isPending;

  const targetTableId = chosenTable?.tableId ?? autoTableId;
  // Said only for a time that can be had: a struck one already says why.
  const noTableFits = activeSlot !== null && !chosenTable && autoTableId === null;
  // A change that would move the booking to where it already is.
  const unchanged =
    change !== null &&
    isUnchanged(change, {
      date: activeDateKey,
      time: activeSlot?.key ?? null,
      partySize,
      tableId: targetTableId,
    });
  // Shut at that time (or too soon, too far ahead): the time is the problem,
  // not the party, and the banner says so rather than "try another party size".
  const slotClosed = useMemo(() => (slotAnswer ? slotRefusal(slotAnswer) : null), [slotAnswer]);
  const noTableText = useMemo(() => {
    if (!slotClosed) return t('book.noTableForParty', { count: partySize });
    const line = unavailableCopy(slotClosed, partySize);
    return t(line.key, line.params);
  }, [slotClosed, partySize, t]);

  const canConfirm =
    activeSlot !== null &&
    targetTableId !== null &&
    chosenRefusal === null &&
    !pending &&
    !unchanged &&
    (change !== null || !verified || guestName.trim().length > 0);

  /**
   * A failed create or change, said where the diner acts on it: a lost table
   * over the photo, everything else under the form.
   */
  const fail = useCallback(
    (error: unknown) => {
      // Not taking app bookings, a note over the limit, a booking that can no
      // longer move: said in their own words.
      const refusal = bookingRefusal(error);
      if (refusal) {
        setOutcomeUnknown(false);
        setErrorText(t(refusal.key, refusal.params));
        if (change) {
          // Whatever the booking became, its own screen should say it.
          void queryClient.invalidateQueries({ queryKey: keys.booking(change.bookingId) });
          void queryClient.invalidateQueries({ queryKey: keys.bookings });
        }
        return;
      }
      const failure = bookingFailure(error, place.timeZoneId, locale);
      if (failure.kind === 'tableTaken') {
        // The photo underneath and the slot answer are told to redraw; the
        // diner picks again, with the day, time and party kept.
        void queryClient.invalidateQueries({ queryKey: placeKeys.rooms(place.id) });
        void slotQuery.refetch();
        void daySlotsQuery.refetch();
        if (nextDateKey) void nextDaySlotsQuery.refetch();
        setOutcomeUnknown(false);
        setConflictText(t(failure.line.key, failure.line.params));
        scrollRef.current?.scrollTo({
          y: Math.max(0, pickTop.current - space.sm),
          animated: !reducedMotion,
        });
        return;
      }
      // Nothing was booked; the command id stays for the retry.
      if (failure.kind === 'phoneNotVerified' && !change) {
        setVerifyRefused(true);
        setOutcomeUnknown(false);
        return;
      }
      if (failure.kind === 'commandInUse') commandId.current = newCommandId();
      setOutcomeUnknown(failure.kind === 'unknown');
      const line: CopyLine = change ? changeFailureLine(failure) : failure.line;
      setErrorText(t(line.key, line.params));
    },
    [
      change,
      queryClient,
      place.id,
      place.timeZoneId,
      locale,
      slotQuery,
      daySlotsQuery,
      nextDaySlotsQuery,
      nextDateKey,
      t,
      reducedMotion,
      setVerifyRefused,
    ],
  );

  const confirm = useCallback(async () => {
    if (!activeSlot || !targetTableId || pending || chosenRefusal) return;
    clearErrors();

    // Change mode: move the booking, then back to it with a word of what happened.
    if (change) {
      if (unchanged) return;
      try {
        const moved = await reschedule.mutateAsync({
          bookingId: change.bookingId,
          commandId: commandId.current,
          tableId: targetTableId,
          slotUtc,
          timeZoneId: place.timeZoneId,
          partySize,
        });
        void queryClient.invalidateQueries({ queryKey: placeKeys.rooms(place.id) });
        haptics.success();
        // A bigger party may go back to waiting for the venue: said so.
        const waiting = moved.status === 'pendingApproval';
        showToast(
          t(waiting ? 'book.changeSent' : 'book.changed'),
          waiting ? actionIcon.time : 'checkmark',
        );
        // Back to the booking: the detail it came from, or in place of this
        // screen when it came from the list.
        router.dismissTo({ pathname: '/booking/[bookingId]', params: { bookingId: moved.id } });
      } catch (error) {
        fail(error);
      }
      return;
    }

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
        // The note goes to the venue with the booking (K9).
        note: note || null,
      });
      void queryClient.invalidateQueries({ queryKey: placeKeys.rooms(place.id) });
      router.replace({ pathname: '/reserve/success', params: { bookingId: booking.id } });
    } catch (error) {
      fail(error);
    }
  }, [
    change,
    unchanged,
    reschedule,
    showToast,
    fail,
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
    queryClient,
    t,
    clearErrors,
  ]);

  const selectParty = useCallback(
    (size: number) => {
      setPartySize(size);
      clearErrors();
    },
    [clearErrors],
  );

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

  // A struck time is drawn and named — "20:00, no free tables" — never chosen.
  // One that can be had is named by its time alone.
  const slotOptions = useMemo<readonly ChoiceGridOption[]>(
    () =>
      slots.map((slot) => {
        const label = formatTime(slot.at, place.timeZoneId, locale);
        return availability.struck.has(slot.key)
          ? {
              value: slot.key,
              label,
              disabled: true,
              accessibilityLabel: t('book.slotFull', { time: label }),
            }
          : { value: slot.key, label };
      }),
    [slots, availability.struck, place.timeZoneId, locale, t],
  );
  // Under the times, when any is struck: why — the day's own reason when the
  // whole day is refused, else that a struck time has no free table.
  const lineText = (line: CopyLine) => t(line.key, line.params);
  const struckHint =
    availability.struck.size === 0
      ? null
      : availability.dayReason
        ? lineText(dayRefusalLine(availability.dayReason, partySize))
        : t('book.struckHint');

  // A table for four to six is not a table for two, any more than a table
  // for two is a table for six: sizes the chosen table cannot seat are struck.
  const partyOptions: readonly SlidingOption<string>[] = [
    ...PARTY_SIZES.map((size) => ({
      value: String(size),
      label: String(size),
      disabled: !fits(size),
    })),
    {
      value: MORE,
      label: t('book.partySizeMore', { count: PARTY_MORE_FROM }),
      disabled: !moreAllowed,
    },
  ];
  const moreOptions: readonly ChoiceGridOption[] = moreSizes.map((size) => ({
    value: String(size),
    label: String(size),
  }));

  // "Table 4 · Tomorrow 19:00 · 2 guests": what one press of Book books.
  const activeDay = days.find((day) => day.dateKey === activeDateKey) ?? null;
  const summary =
    activeSlot && activeDay
      ? t('book.summary', {
          table: chosenTable?.label
            ? t('tables.table', { label: chosenTable.label })
            : t('book.anyTable'),
          day: dayLabel(activeDay),
          time: formatTime(activeSlot.at, place.timeZoneId, locale),
          guests: t('booking.guests', { count: partySize }),
        })
      : undefined;
  // What one press does: book, or move the booking being changed.
  const ctaAction = change ? t('book.saveChanges') : t('book.confirm');
  // The button's state, when it is anything but "book it".
  const ctaState = pending
    ? change
      ? t('book.saving')
      : t('confirm.submitting')
    : mustVerify
      ? t('confirm.verifyMyNumber')
      : outcomeUnknown
        ? t('confirm.checkAgain')
        : null;

  const conflict = conflictText ? (
    <Rise>
      <View accessibilityRole="alert" style={styles.conflict}>
        <Ionicons name={actionIcon.error} size={iconSize.md - 2} color={colors.errorInk} />
        <Text style={styles.conflictText}>{conflictText}</Text>
      </View>
    </Rise>
  ) : null;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Header title={title} onBack={onBack} place={place} />
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <DayStrip
            days={days}
            selectedKey={activeDateKey}
            timeZoneId={place.timeZoneId}
            label={dayLabel}
            onSelect={(key) => {
              setDateKey(key);
              setSlotKey(null);
              clearErrors();
            }}
          />

          {slots.length === 0 ? (
            <Text style={styles.empty}>{t('book.noSlots')}</Text>
          ) : (
            <View style={styles.times}>
              <ChoiceGrid
                options={slotOptions}
                value={activeSlot?.key ?? null}
                onChange={(key) => {
                  haptics.select();
                  setSlotKey(key);
                  clearErrors();
                }}
                columns={SLOT_COLUMNS}
                gap={SLOT_GAP}
                accessibilityLabel={t('book.time')}
              />
              {struckHint ? <Text style={styles.struckHint}>{struckHint}</Text> : null}
            </View>
          )}

          {/* Guests: one glass row, the label and the sizes as radios. */}
          <View style={styles.partyCard}>
            <View style={styles.partyRow}>
              <Text numberOfLines={1} style={styles.partyLabel}>
                {t('book.partySize')}
              </Text>
              <SlidingChoice
                options={partyOptions}
                value={moreOpen ? MORE : String(partySize)}
                onChange={(value) => {
                  if (value === MORE) {
                    setMoreOpen(true);
                    if (partySize < PARTY_MORE_FROM) {
                      selectParty(moreSizes[0] ?? PARTY_MORE_FROM);
                    }
                    return;
                  }
                  setMoreOpen(false);
                  selectParty(Number(value));
                }}
                columns={partyOptions.length}
                gap={PARTY_GAP}
                accessibilityLabel={t('book.partySize')}
                style={styles.partyChoice}
              />
            </View>
            {moreOpen && moreSizes.length > 0 ? (
              <ChoiceGrid
                options={moreOptions}
                value={String(partySize)}
                onChange={(value) => selectParty(Number(value))}
                columns={4}
                gap={SLOT_GAP}
                accessibilityLabel={t('book.partySize')}
                style={styles.moreChoice}
              />
            ) : null}
          </View>

          {slotRooms.length > 0 ? (
            <View
              onLayout={(event) => {
                pickTop.current = event.nativeEvent.layout.y;
              }}
            >
              <RoomPhotosView
                rooms={slotRooms}
                selectedTableId={pickedTableId}
                // A table the slot will not give this party is drawn, not offered.
                partySize={partySize}
                title={
                  <Text display accessibilityRole="header" numberOfLines={1} style={styles.pick}>
                    {t('book.pickTable')}
                  </Text>
                }
                notice={
                  <>
                    <Text style={styles.pickHint}>{t('book.pickTableHint')}</Text>
                    {conflict}
                  </>
                }
                photoStyle={styles.roomPhoto}
                onSelect={(tableId) => {
                  // The same pin again, or the photo away from any: leave it to us.
                  if (tableId !== null && tableId !== pickedTableId) haptics.select();
                  setPickedTableId(tableId === pickedTableId ? null : tableId);
                  clearErrors();
                }}
              />
              <TableLegend partyFit style={styles.legend} />
            </View>
          ) : (
            // No photo to draw it over: the conflict still has to be said.
            conflict
          )}

          {chosenTable ? (
            <View>
              <View style={styles.tableCard}>
                <View style={styles.tableIcon}>
                  <Ionicons name={actionIcon.table} size={iconSize.md} color={colors.primary} />
                </View>
                <View style={styles.tableBody}>
                  <Text style={styles.tableCaption}>{t('book.selectedTable')}</Text>
                  <View style={styles.tableLine}>
                    {chosenTable.label ? (
                      <Text numberOfLines={1} style={styles.tableText}>
                        {t('tables.table', { label: chosenTable.label })}
                      </Text>
                    ) : null}
                    <Text numberOfLines={1} style={styles.tableSeats}>
                      {capacityLabel(chosenTable)}
                    </Text>
                  </View>
                </View>
              </View>
              {chosenRefusal ? (
                <Text accessibilityRole="alert" style={styles.warning}>
                  {chosenRefusal}
                </Text>
              ) : null}
            </View>
          ) : noTableFits ? (
            <Text accessibilityRole="alert" style={styles.warning}>
              {noTableText}
            </Text>
          ) : null}

          {needsName ? (
            <View style={styles.field}>
              <SectionHeader label={t('confirm.nameLabel')} />
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
            </View>
          ) : null}

          {/* The note went to the venue with the booking; a change moves the
              booking and leaves the note as it was. */}
          {change ? null : (
            <View style={styles.field}>
              <SectionHeader
                label={t('booking.note.title')}
                icon={actionIcon.note}
                hint={t('book.optional')}
              />
              <TextInput
                style={[styles.input, styles.requests]}
                value={requests}
                onChangeText={(value) => {
                  setRequests(value);
                  clearErrors();
                }}
                placeholder={t('booking.note.placeholder')}
                placeholderTextColor={colors.textSubtle}
                multiline
                maxLength={MAX_BOOKING_NOTE}
                textAlignVertical="top"
                accessibilityLabel={t('booking.note.title')}
              />
              {/* Honest about where the words go: to the venue, with the booking. */}
              <Text style={styles.hint}>{t('booking.note.hint')}</Text>
            </View>
          )}

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

        <CtaFooter bottomInset={insets.bottom}>
          {bookingsOff ? (
            // Where the app cannot book, the button is not offered at all; the
            // same words the place page shows say why.
            <View style={styles.bookingsOff} accessibilityRole="summary">
              <Text style={styles.bookingsOffTitle}>{t('place.bookingsOff.title')}</Text>
              <Text style={styles.bookingsOffBody}>{t('place.bookingsOff.body')}</Text>
            </View>
          ) : (
            <BookCta
              label={ctaState ?? (change ? t('book.saveChanges') : t('tables.book'))}
              {...(summary ? { caption: summary } : {})}
              // The action first (what e2e and a screen reader key on), then
              // the summary the caption shows, so it is heard as well as seen.
              accessibilityLabel={ctaState ?? (summary ? `${ctaAction}, ${summary}` : ctaAction)}
              disabled={!canConfirm}
              busy={pending}
              onPress={() => void confirm()}
            />
          )}
        </CtaFooter>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** The value of the "5+" radio: it opens the larger sizes under the row. */
const MORE = 'more';

/** "Today", "Tomorrow", then "Sat 18" in the place's zone and the diner's language. */
function useDayLabel(timeZoneId: string): (day: DayOption) => string {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const short = useMemo(
    () =>
      new Intl.DateTimeFormat(intlTag(locale), {
        weekday: 'short',
        day: 'numeric',
        timeZone: timeZoneId,
      }),
    [locale, timeZoneId],
  );
  return useCallback(
    (day: DayOption) =>
      day.isToday
        ? t('booking.today')
        : day.isTomorrow
          ? t('booking.tomorrow')
          : short.format(day.date),
    [short, t],
  );
}

/**
 * "Book a Table" — or "Change booking" — over the venue and where it is:
 * the district the venue set, else the branch (or the street), as the place
 * card says it.
 */
function Header({
  title,
  onBack,
  place,
}: {
  title: string;
  onBack: () => void;
  place?: Pick<Place, 'name' | 'venueName' | 'branchName' | 'address' | 'district'> | undefined;
}) {
  const { t } = useTranslation('diner');
  const venue = place ? place.venueName.trim() || place.name : null;
  // The district; without one, the branch, else the street.
  const where = place ? placeArea(place) || null : null;
  // Heard with the branch as well, so two branches of one venue never sound alike.
  const branch = place ? placeTitle(place).branch : null;
  const heard = [title, venue, branch !== where ? branch : null, where];
  return (
    <View style={styles.header}>
      <IconButton
        icon={actionIcon.back}
        accessibilityLabel={t('floorPlan.back')}
        variant="surface"
        onPress={onBack}
      />
      <View
        style={styles.titleBlock}
        accessible
        accessibilityRole="header"
        accessibilityLabel={heard.filter(Boolean).join(', ')}
      >
        <Text display numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {venue ? (
          <Text numberOfLines={1} style={styles.subline}>
            {[venue, where].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

interface DayStripProps {
  readonly days: readonly DayOption[];
  readonly selectedKey: string | null;
  readonly timeZoneId: string;
  readonly label: (day: DayOption) => string;
  readonly onSelect: (dateKey: string) => void;
}

/**
 * Four equal day cells in view, the rest a swipe away, with one brand thumb
 * that slides under the chosen day. Each cell is a button named by the whole
 * date ("Saturday, 18 October"), which is what a screen reader should say.
 */
function DayStrip({ days, selectedKey, timeZoneId, label, onSelect }: DayStripProps) {
  const { locale } = useLocale();
  const reduced = useReducedMotion();
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
  const [width, setWidth] = useState(0);
  const cell = width > 0 ? (width - DAY_GAP * (DAYS_IN_VIEW - 1)) / DAYS_IN_VIEW : 0;
  const index = days.findIndex((day) => day.dateKey === selectedKey);
  const [x] = useState(() => new Animated.Value(0));
  // The first placement is a jump; only a new choice slides.
  const placed = useRef(false);

  useEffect(() => {
    if (cell <= 0 || index < 0) return;
    const to = index * (cell + DAY_GAP);
    if (reduced || !placed.current) {
      x.setValue(to);
      placed.current = true;
      return;
    }
    Animated.spring(x, { toValue: to, useNativeDriver: true, speed: 16, bounciness: 7 }).start();
  }, [cell, index, reduced, x]);

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayStrip}
      >
        {cell > 0 && index >= 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.dayThumb, { width: cell, transform: [{ translateX: x }] }]}
          />
        ) : null}
        {days.map((day) => {
          const selected = day.dateKey === selectedKey;
          return (
            <Pressable
              key={day.dateKey}
              accessibilityRole="button"
              accessibilityLabel={full.format(day.date)}
              accessibilityState={{ selected }}
              onPress={() => {
                if (selected) return;
                haptics.select();
                onSelect(day.dateKey);
              }}
              style={({ pressed }) => [
                styles.day,
                { width: cell > 0 ? cell : DAY_FALLBACK },
                !selected && styles.dayIdle,
                pressed && !selected && styles.dayPressed,
              ]}
            >
              <Text numberOfLines={1} style={[styles.dayLabel, selected && styles.dayLabelOn]}>
                {label(day)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A day cell's width before the strip has been measured. */
const DAY_FALLBACK = 84;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  title: { fontSize: 20, lineHeight: 26, fontWeight: fontWeight.bold, color: colors.text },
  titleBlock: { flexShrink: 1 },
  subline: { ...typography.caption, color: colors.textMuted },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: space.xs,
    paddingBottom: space.xl,
    gap: space.lg,
  },
  skeleton: { paddingHorizontal: layout.screenPadding, paddingTop: space.sm, gap: space.lg },

  // Room above and below for the thumb's glow, which the scroller would clip.
  dayStrip: { gap: DAY_GAP, paddingVertical: space.xs },
  dayThumb: {
    position: 'absolute',
    top: space.xs,
    left: 0,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandEdge,
    ...shadows.brand,
  },
  day: {
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    borderRadius: radius.pill,
  },
  dayIdle: { backgroundColor: colors.surface },
  dayPressed: { backgroundColor: colors.surfaceMuted },
  dayLabel: { fontSize: 12.5, lineHeight: 16, color: colors.textMuted },
  dayLabelOn: { fontWeight: fontWeight.bold, color: colors.onPrimary },

  empty: { ...typography.body, color: colors.textMuted },
  // The design's 6 between the times and the hint under them.
  times: { gap: SLOT_GAP },
  struckHint: {
    ...typography.caption,
    color: colors.textMuted,
    paddingHorizontal: space.xs,
  },

  partyCard: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    paddingLeft: space.md + 2,
    paddingRight: space.xs + 2,
    paddingVertical: space.xs + 2,
    gap: space.sm,
  },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  partyLabel: { flex: 1, fontSize: 13.5, lineHeight: 18, color: colors.text },
  partyChoice: { width: PARTY_PILL_WIDTH },
  moreChoice: { marginRight: space.sm, marginBottom: space.xs },

  pick: { fontSize: 16, lineHeight: 22, fontWeight: fontWeight.bold, color: colors.text },
  pickHint: { ...typography.caption, color: colors.textMuted },
  roomPhoto: { borderRadius: radius.card + 2 },
  legend: { marginTop: space.md },
  conflict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  conflictText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.errorInk },

  tableCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
  },
  tableIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableBody: { flex: 1, gap: 2 },
  tableCaption: { ...typography.caption, color: colors.textMuted },
  tableLine: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  tableText: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text, flexShrink: 1 },
  tableSeats: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  warning: { ...typography.body, color: colors.warningInk, marginTop: space.sm },

  field: { gap: space.sm },
  input: {
    minHeight: layout.controlHeight,
    paddingHorizontal: space.md + 2,
    paddingVertical: space.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    ...typography.body,
  },
  requests: { minHeight: 96 },
  hint: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.body, color: colors.errorInk },
  bookingsOff: { gap: space.xs, paddingVertical: space.xs },
  bookingsOffTitle: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  bookingsOffBody: { ...typography.body, color: colors.textMuted },
});
