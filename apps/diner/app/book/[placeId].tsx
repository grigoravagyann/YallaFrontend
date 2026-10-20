import { Ionicons } from '@expo/vector-icons';
import {
  LeadTimeExceededError,
  MAX_BOOKING_NOTE,
  bookingFailure,
  isShortNotice,
  unavailableCopy,
  type CopyLine,
  type TableAvailability,
} from '@yalla/api';
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
import { Button } from '../../src/components/Button';
import { Chip } from '../../src/components/Chip';
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
  parseAnotherTimeParams,
  parseChangeParams,
  type BookingChange,
} from '../../src/components/bookings/changeBooking';
import { FreeBySheet } from '../../src/components/bookings/FreeBySheet';
import { placeArea, placeTitle } from '../../src/components/places/placeTitle';
import { BookCta, CtaFooter } from '../../src/components/place/BookCta';
import { ChoiceGrid, type ChoiceGridOption } from '../../src/components/place/ChoiceGrid';
import { TimeWheel } from '../../src/components/place/TimeWheel';
import { RoomPhotosView } from '../../src/components/tables/RoomPhotosView';
import { TableLegend } from '../../src/components/tables/TableLegend';
import { useCapacityLabel } from '../../src/components/tables/TableMarker';
import { useDinerProfile } from '../../src/data/accountQueries';
import { useMinuteClock } from '../../src/hooks/useMinuteClock';
import {
  bookingRefusal,
  changeFailureLine,
  overlapsOwnLine,
  proofLifts,
  unprovedFailureLine,
} from '../../src/data/bookingRefusals';
import {
  keys,
  useBookingRules,
  useCreateBooking,
  useDaySlots,
  useRescheduleBooking,
  useSlotFloor,
  useSlotFloors,
} from '../../src/data/queries';
import { useReducedMotion } from '../../src/hooks/useReducedMotion';
import { newCommandId } from '../../src/lib/commandId';
import { GUEST_NAME_MAX_LENGTH, freeByAnswered, freeByNeeded } from '../../src/lib/confirm';
import { placeKeys, usePlace, usePlaceRooms } from '../../src/places/hooks';
import { shiftDateKey, type Place, type PlaceRoom } from '../../src/places/model';
import { roomsAtSlot, slotRefusal } from '../../src/places/rooms';
import { bookingRulesInput } from '../../src/places/navigation';
import {
  answerFor,
  dayRefusalLine,
  pickSlot,
  slotAvailability,
  slotFloorVerdict,
  unlimitedAt,
  wheelSlots,
  withSoon,
} from '../../src/places/slotAvailability';
import {
  firstOfferedFrom,
  quickTimes,
  soonInstant,
  type WheelSlot,
} from '../../src/places/wheelTimes';
import {
  LEAD_MINUTES,
  SLOT_MINUTES,
  WINDOW_DAYS,
  clockOf,
  dayOptions,
  largerPartySizes,
  stripDateFor,
  tablesForParty,
  timeSlots,
  windowReaching,
  type DayOption,
  type TimeSlot,
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
/** The gap between a row of choices, and four days in view at once. */
const SLOT_GAP = 6;
/** The quick chips after "In 10 min": the nearest free times. */
const QUICK_TIMES = 3;
/** After a "no" to freeing the table by a time: how many nearby times are asked about. */
const PROBE_TIMES = 6;
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
   * Change mode: the booking being moved, and the instant (ISO) and party it
   * holds now — with `tableId`, its table. See `changeBookingRoute`.
   */
  bookingId?: string;
  slotUtc?: string;
  /** With a new booking: its party, from a declined one (see `anotherTimeRoute`). */
  party?: string;
  /** A new booking after a declined one: the instant whose day to open on. */
  dayOf?: string;
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
  const { bookingId, slotUtc, party, tableId } = params;
  const change = useMemo(
    () => parseChangeParams({ bookingId, slotUtc, party, tableId }),
    [bookingId, slotUtc, party, tableId],
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

  /*
   * "Now", re-read each minute and when the app comes back to the front: read
   * once, a screen left open went on offering today's first time and "in 10
   * min" after the lead time had passed them. Only a new minute re-renders,
   * so the times do not reshuffle under a finger between readings.
   */
  const [now, refreshNow] = useMinuteClock();
  /*
   * The booking being changed, by its instant: the strip day whose times hold
   * it (a bar's 00:30 is the evening before's), and the instant itself, which
   * is what is chosen — never a clock reading another night shares.
   */
  const ownSlotUtc = change?.slotUtc ?? null;
  const ownSlotMs = ownSlotUtc ? Date.parse(ownSlotUtc) : null;
  const changeDate = useMemo(
    () =>
      ownSlotUtc ? stripDateFor(place, ownSlotUtc, branchDayKey(now, place.timeZoneId)) : null,
    [ownSlotUtc, place, now],
  );
  // After a declined booking, its day and party: the time is chosen again.
  const anotherTime = useMemo(
    () => (change ? null : parseAnotherTimeParams({ dayOf: params.dayOf, party: params.party })),
    [change, params.dayOf, params.party],
  );
  // Its strip day — not one gone by, which opens on the first.
  const anotherDate = useMemo(() => {
    if (!anotherTime?.dayOfUtc) return null;
    const today = branchDayKey(now, place.timeZoneId);
    const key = stripDateFor(place, anotherTime.dayOfUtc, today);
    return key >= today ? key : null;
  }, [anotherTime, place, now]);
  // The day a booking opens on may lie beyond the window the strip starts
  // with — seven days until the branch's rules load: a change's own day, or a
  // declined booking's. Either is always on it.
  const openDate = changeDate ?? anotherDate;
  const days = useMemo(
    () =>
      dayOptions(
        now,
        place.timeZoneId,
        windowReaching(now, place.timeZoneId, windowDays, openDate),
      ),
    [now, place.timeZoneId, windowDays, openDate],
  );

  // A change opens on what the booking holds, a booking after a declined one
  // on that one's day; a new booking on the defaults.
  const [dateKey, setDateKey] = useState<string | null>(openDate);
  // The time the diner tapped, as an instant; `null` until they tap one.
  const [pickedMs, setPickedMs] = useState<number | null>(null);
  // Never shrunk: a party bigger than the list is shown as chosen as it is.
  const [partySize, setPartySize] = useState(() => {
    if (change?.partySize) return change.partySize;
    if (anotherTime?.partySize) return anotherTime.partySize;
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
  /** The last refusal is one proving the number lifts: "Verify my number" beside it. */
  const [proofOffer, setProofOffer] = useState(false);
  const clearErrors = useCallback(() => {
    setErrorText(null);
    setConflictText(null);
    setProofOffer(false);
  }, []);

  const activeDateKey = dateKey ?? days[0]?.dateKey ?? null;
  // The quarter hours the place is open, from the lead time on.
  const gridSlots = useMemo(
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
    activeDateKey &&
    gridSlots.some((slot) => branchDayKey(slot.at, place.timeZoneId) !== activeDateKey)
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
  const dayAvailability = useMemo(
    () => slotAvailability(gridSlots, [dayAnswer, nextDayAnswer], place.timeZoneId),
    [gridSlots, dayAnswer, nextDayAnswer, place.timeZoneId],
  );

  /*
   * "In 10 min · 19:15": today, the lead time from now rounded up to five
   * minutes, while the place is open then. Not one of the day's quarter
   * hours, so the room at that minute judges it — the very read the booking
   * is made against — and it joins the wheel only once that room says a table
   * can be had.
   */
  const isToday = days[0]?.isToday === true && activeDateKey === days[0].dateKey;
  const soonMs = useMemo(() => soonInstant(now, leadMinutes), [now, leadMinutes]);
  // Not on a day the server refused outright: shut, or nothing left today.
  const dayRefused = dayAnswer?.unavailableReason != null;
  const soonCandidate = useMemo((): TimeSlot | null => {
    if (!isToday || !activeDateKey || dayRefused) return null;
    const open = timeSlots(place, activeDateKey, new Date(0), 0).some(
      (slot) => slot.at.getTime() <= soonMs && soonMs < slot.at.getTime() + SLOT_MINUTES * 60_000,
    );
    if (!open) return null;
    const at = new Date(soonMs);
    return { key: clockOf(at, place.timeZoneId), at };
  }, [isToday, activeDateKey, dayRefused, place, soonMs]);
  const soonQuery = useSlotFloor({
    branchId: soonCandidate ? place.id : undefined,
    slotUtc: soonCandidate?.at.toISOString() ?? '',
    partySize,
    timeZoneId: place.timeZoneId,
    excludeBookingId,
  });
  const soonAnswer = soonCandidate && !soonQuery.isError ? soonQuery.data : undefined;
  const soonVerdict = useMemo(
    () =>
      soonCandidate && soonAnswer?.slotUtc && Date.parse(soonAnswer.slotUtc) === soonMs
        ? slotFloorVerdict(soonAnswer)
        : null,
    [soonCandidate, soonAnswer, soonMs],
  );
  const soonSlot =
    soonCandidate && soonVerdict && soonVerdict.state !== 'busy' ? soonCandidate : null;
  const merged = useMemo(
    () => withSoon(gridSlots, dayAvailability, soonSlot, soonVerdict),
    [gridSlots, dayAvailability, soonSlot, soonVerdict],
  );
  const slots = merged.slots;
  const availability = merged.availability;
  // The times the venue offers at all: one the server leaves out is not drawn.
  const shownSlots = useMemo(
    () => slots.filter((slot) => !availability.hidden.has(slot.at.getTime())),
    [slots, availability.hidden],
  );
  /*
   * The wheel's rows: every time on offer, free, requestable or busy (drawn
   * struck). Each is matched by its instant: a late night's 00:30 is not the
   * evening's own.
   */
  const wheelRows = useMemo(() => wheelSlots(shownSlots, availability), [shownSlots, availability]);
  /*
   * The tapped time while it can be had. Before a tap, a change wants the
   * booking's own time and a new booking the first time that can be had.
   * A new booking whose time is gone gets the nearest one that can be; a
   * change never gets a time nobody chose — nothing is chosen, and it says so.
   */
  const wantedMs = pickedMs ?? (change ? ownSlotMs : null);
  const activeSlot = pickSlot(slots, availability, wantedMs, change === null);
  const slotUtc = activeSlot?.at.toISOString() ?? '';
  // The time a change was opened on, or the one tapped since, is not on offer.
  const changeTimeGone =
    change !== null &&
    activeSlot === null &&
    (pickedMs !== null || (ownSlotMs !== null && activeDateKey === changeDate));

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
  const slotShown = activeSlot ? slotQuery.data : undefined;
  /*
   * What the screen decides on — the table a press books, whether it needs a
   * promise, why it cannot be had — is only ever this time's answer: the last
   * one stays drawn while the next loads, and Confirm waits for it.
   */
  const slotAnswer = useMemo(
    () => answerFor(slotShown, slotUtc ? Date.parse(slotUtc) : null, partySize),
    [slotShown, slotUtc, partySize],
  );
  const slotTables = slotAnswer?.tables;
  /*
   * The rooms as they will be at the slot: every pin coloured by its state
   * then, and bookable only where the server would give it to this party.
   */
  const shownPlan = slotShown?.plan.tables;
  const shownTables = slotShown?.tables;
  const slotRooms = useMemo(() => {
    if (!shownPlan) return [];
    const verdicts = new Map((shownTables ?? []).map((table) => [table.tableId, table]));
    return roomsAtSlot(
      rooms,
      shownPlan,
      (tableId) => verdicts.get(tableId)?.isBookable ?? false,
      (tableId) => verdicts.get(tableId)?.unavailableReason ?? null,
      (tableId) => {
        const verdict = verdicts.get(tableId);
        if (!verdict?.isRequestable) return null;
        return verdict.requiresEarlierGuestConsent ? 'earlierGuest' : 'venue';
      },
    ).filter((room) => room.photos.some((photo) => photo.tables.length > 0));
  }, [rooms, shownPlan, shownTables]);
  // The legend explains the question-mark pin only when one is on the photos.
  const anyRequest = useMemo(
    () =>
      slotRooms.some((room) =>
        room.photos.some((photo) => photo.tables.some((table) => Boolean(table.request))),
      ),
    [slotRooms],
  );
  const chosenAtSlot = useMemo(
    () => slotTables?.find((table) => table.tableId === chosenTable?.tableId) ?? null,
    [slotTables, chosenTable?.tableId],
  );
  const autoTableId = useMemo(() => {
    if (chosenTable) return null;
    if (slotTables) return preferredTable(slotTables)?.tableId ?? null;
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
    // This time's answer is on its way: nothing said until it is here.
    if (slotShown) return null;
    // No slot answer yet: the photo's live state is the best available word.
    if (chosenTable.live && chosenTable.live.status !== 'free') return t('tables.notBookable');
    return null;
  }, [chosenTable, chosenAtSlot, slotAnswer, slotShown, partySize, t]);

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
   * An account whose number has never been proved books all the same
   * (unverified guests, 2026-10-20): the venue may confirm it first, and the
   * screen says so and offers proving it with Telegram for instant
   * confirmation. Only the server's refusal (a deactivated account) turns
   * Confirm into the Verify step, until the refreshed profile says verified.
   */
  // Read here so the check does not depend on the Profile tab having been opened.
  useDinerProfile();
  const profilePhoneVerified = useSession((s) => s.profile?.phoneVerified);
  const [verifyRefused, setVerifyRefused] = useState(false);
  // Not for a change: the booking was made on a verified number, and the code
  // flow ends on the confirm screen, which makes a new booking.
  const mustVerify = !change && verified && verifyRefused && profilePhoneVerified !== true;
  /** Books without a proved number: said before the tap, and its refusals offer proving it. */
  const accountUnproved = !change && verified && profilePhoneVerified === false;

  // One id per screen, reused on every retry — see `confirm.tsx`.
  const commandId = useRef(newCommandId());
  const createBooking = useCreateBooking();
  const reschedule = useRescheduleBooking();
  const pending = createBooking.isPending || reschedule.isPending;

  const targetTableId = chosenTable?.tableId ?? autoTableId;
  // The booking-times answer for the table that one press books.
  const targetAtSlot = useMemo(
    () => slotTables?.find((table) => table.tableId === targetTableId) ?? null,
    [slotTables, targetTableId],
  );
  // Must the diner promise to free it by a time? Asked before sending.
  const targetFreeBy = targetAtSlot?.isBookable ? (targetAtSlot.mustFreeByUtc ?? null) : null;
  /*
   * The server's time, once a refusal named it, for the time, table and party
   * it was said for — newer than the room, so it wins over it until one of
   * them changes (see `freeByNeeded`).
   */
  const freeByKey = `${slotUtc}|${targetTableId ?? ''}|${partySize}`;
  const [serverFreeBy, setServerFreeBy] = useState<{
    readonly key: string;
    readonly freeByUtc: string;
  } | null>(null);
  const neededFreeBy = freeByNeeded({
    server: serverFreeBy?.key === freeByKey ? serverFreeBy.freeByUtc : null,
    table: targetFreeBy,
  });
  const [freeByAsk, setFreeByAsk] = useState<{
    readonly freeByUtc: string;
    readonly nextStartUtc: string | null;
  } | null>(null);
  // Said "no" to the question: another table or time, and which have no limit.
  const [freeByDeclined, setFreeByDeclined] = useState(false);
  // The wheel stopped on a busy time and moved on: "No free table at 20:15 — 20:30 suggested".
  const [snapNote, setSnapNote] = useState<string | null>(null);
  // Said only for a time that can be had: a struck one already says why.
  const noTableFits = activeSlot !== null && !chosenTable && autoTableId === null;
  // A change that would move the booking to where it already is.
  const unchanged =
    change !== null &&
    isUnchanged(change, {
      slotUtc: activeSlot ? slotUtc : null,
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
    // Never on the last time's answer, kept on screen while this one's loads.
    slotAnswer !== undefined &&
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
    (error: unknown, slotUtc: string) => {
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
      // A booking landed after the room was read: the table now needs the
      // promise, or a different one. Asked again, with the server's time.
      if (failure.kind === 'freeByRequired') {
        void slotQuery.refetch();
        setOutcomeUnknown(false);
        if (failure.requiredFreeByUtc) {
          setServerFreeBy({ key: freeByKey, freeByUtc: failure.requiredFreeByUtc });
          setFreeByAsk({
            freeByUtc: failure.requiredFreeByUtc,
            nextStartUtc:
              failure.nextBookingStartUtc ?? targetAtSlot?.window?.nextBookingStartUtc ?? null,
          });
        } else {
          setErrorText(t(failure.line.key, failure.line.params));
        }
        return;
      }
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
      /*
       * Time passed while the diner chose: the clock is read again, the day's
       * times with it, and a new booking moves on to the first time the
       * server still books — said, not silently. A change keeps nothing it
       * did not choose: its time is gone, and it says so.
       */
      if (failure.kind === 'leadTime') {
        refreshNow();
        void daySlotsQuery.refetch();
        if (nextDateKey) void nextDaySlotsQuery.refetch();
        if (!change && error instanceof LeadTimeExceededError) {
          const earliest = Date.parse(error.earliestSlotUtc);
          const next = Number.isNaN(earliest) ? null : firstOfferedFrom(wheelRows, earliest);
          setPickedMs(next ? next.at : null);
        }
      }
      // Nothing was booked; the command id stays for the retry.
      if (failure.kind === 'phoneNotVerified' && !change) {
        setVerifyRefused(true);
        setOutcomeUnknown(false);
        return;
      }
      // The diner's own booking at that time: named, with its day when it is
      // on another one — for a change as for a new booking.
      if (failure.kind === 'overlapsOwn') {
        const own = overlapsOwnLine(failure.error, slotUtc, place.timeZoneId, locale);
        setOutcomeUnknown(false);
        setErrorText(t(own.key, own.params));
        return;
      }
      if (failure.kind === 'commandInUse') commandId.current = newCommandId();
      setOutcomeUnknown(failure.kind === 'unknown');
      // A limit on booking without a proved number: proving it is offered.
      setProofOffer(!change && proofLifts(failure, accountUnproved));
      const line: CopyLine = change
        ? changeFailureLine(failure)
        : unprovedFailureLine(failure, accountUnproved);
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
      accountUnproved,
      setFreeByAsk,
      setServerFreeBy,
      setPickedMs,
      targetAtSlot,
      freeByKey,
      refreshNow,
      wheelRows,
    ],
  );

  const confirm = useCallback(
    async (acceptsFreeByUtc: string | null = null) => {
      if (!activeSlot || !targetTableId || pending || chosenRefusal) return;
      clearErrors();
      setFreeByDeclined(false);

      /*
       * A booking follows on the table: asked first, never sent without a yes
       * to that very instant — the server's once it named one — and what goes
       * is the instant the diner agreed to.
       */
      if (!freeByAnswered(acceptsFreeByUtc, neededFreeBy)) {
        setFreeByAsk({
          freeByUtc: neededFreeBy!,
          nextStartUtc: targetAtSlot?.window?.nextBookingStartUtc ?? null,
        });
        return;
      }
      const promise = neededFreeBy && acceptsFreeByUtc ? { acceptsFreeByUtc } : {};

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
            ...promise,
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
          fail(error, slotUtc);
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
        // The promise travels through the SMS detour to the confirm screen.
        ...promise,
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
          ...promise,
        });
        void queryClient.invalidateQueries({ queryKey: placeKeys.rooms(place.id) });
        router.replace({ pathname: '/reserve/success', params: { bookingId: booking.id } });
      } catch (error) {
        fail(error, slotUtc);
      }
    },
    [
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
      neededFreeBy,
      targetAtSlot,
      setFreeByAsk,
      setFreeByDeclined,
    ],
  );

  const selectParty = useCallback(
    (size: number) => {
      setPartySize(size);
      clearErrors();
    },
    [clearErrors],
  );

  // The booking being changed keeps its own size on offer, however large.
  const keepSize = change?.partySize ?? null;
  const moreSizes = useMemo(
    () =>
      largerPartySizes(
        PARTY_MORE_FROM,
        Math.min(PARTY_MAX, capacityMax ?? PARTY_MAX),
        fits,
        keepSize,
      ),
    // `fits` reads the same two bounds this depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capacityMin, capacityMax, keepSize],
  );
  const moreAllowed = moreSizes.length > 0;

  const activeMs = activeSlot ? activeSlot.at.getTime() : null;
  const timeLabel = (at: number) => formatTime(new Date(at), place.timeZoneId, locale);

  /*
   * What the chosen time comes with, under the wheel and in what a screen
   * reader hears: only as a request (the guest before, another day; the
   * floor, today), and by when the table must be free.
   */
  // The server's rule, by the instant: a bar's 00:30 on tonight's strip is
  // tomorrow, and twelve hours off is not short notice.
  const shortNotice =
    activeSlot !== null && isShortNotice({ startUtc: slotUtc, timeZoneId: place.timeZoneId, now });
  const requestNote =
    activeMs !== null && availability.requestable.has(activeMs)
      ? t(shortNotice ? 'booking.approval.why' : 'table.requestable.earlierGuest')
      : null;
  const slotFreeBy = activeMs !== null ? (availability.mustFreeBy.get(activeMs) ?? null) : null;
  const freeByNote = slotFreeBy
    ? t('table.mustFreeBy', { time: formatTime(slotFreeBy, place.timeZoneId, locale) })
    : null;
  const spokenTime =
    activeMs !== null
      ? [timeLabel(activeMs), requestNote, freeByNote].filter(Boolean).join(', ')
      : // Nothing chosen: none can be had that day, or (a change) its own is gone.
        t(wheelRows.some((row) => row.state !== 'busy') ? 'book.wheel.none' : 'book.wheel.nothing');

  /*
   * The quick chips: "In 10 min" today, then the nearest free times — after it
   * today, around the time the day opened on any other day. Anchored once per
   * day and party, so the chips do not run after the wheel.
   */
  const anchorKey = `${activeDateKey ?? ''}|${partySize}`;
  const [anchor, setAnchor] = useState<{ readonly key: string; readonly at: number } | null>(null);
  // Adjusted while rendering, as React has state follow a changed input.
  if (activeMs !== null && anchor?.key !== anchorKey) setAnchor({ key: anchorKey, at: activeMs });
  const anchorAt = soonSlot ? soonMs : anchor?.key === anchorKey ? anchor.at : activeMs;
  const quick = useMemo(
    () =>
      anchorAt === null
        ? []
        : quickTimes(wheelRows, anchorAt, QUICK_TIMES, soonSlot ? soonMs : null),
    [wheelRows, anchorAt, soonSlot, soonMs],
  );
  const pickTime = (at: number, snappedFrom: WheelSlot | null = null) => {
    setPickedMs(at);
    clearErrors();
    setFreeByDeclined(false);
    setSnapNote(
      snappedFrom
        ? t('book.wheel.snapped', { busy: snappedFrom.label, time: timeLabel(at) })
        : null,
    );
  };
  /*
   * After a "no" to the promise: the nearest free times, each asked of the
   * room, and offered when the chosen table — or, with none chosen, any
   * table — has no limit then (see `unlimitedAt`). Asked only after a no.
   */
  const probeRows = useMemo(
    () =>
      freeByDeclined && activeMs !== null
        ? quickTimes(
            wheelRows.filter((row) => row.state === 'free'),
            activeMs,
            PROBE_TIMES,
            activeMs,
          )
        : [],
    [freeByDeclined, wheelRows, activeMs],
  );
  const probeSlotUtcs = useMemo(
    () => probeRows.map((row) => new Date(row.at).toISOString()),
    [probeRows],
  );
  const probes = useSlotFloors({
    branchId: probeRows.length > 0 ? place.id : undefined,
    slotUtcs: probeSlotUtcs,
    partySize,
    timeZoneId: place.timeZoneId,
    excludeBookingId,
  });
  const declinedTableId = chosenTable?.tableId ?? null;
  const unlimited =
    activeMs === null
      ? []
      : quickTimes(
          probeRows.filter((row, i) =>
            unlimitedAt(answerFor(probes[i]?.data, row.at, partySize), declinedTableId),
          ),
          activeMs,
          QUICK_TIMES,
          activeMs,
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
              setPickedMs(null);
              setSnapNote(null);
              setFreeByDeclined(false);
              clearErrors();
            }}
          />

          {shownSlots.length === 0 ? (
            <Text style={styles.empty}>{t('book.noSlots')}</Text>
          ) : (
            <View style={styles.times}>
              {/* "In 10 min · 19:15" today, and the nearest free times. */}
              {soonSlot || quick.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.quickRow}
                  accessibilityLabel={t('book.quick.title')}
                >
                  {soonSlot ? (
                    <Chip
                      shape="rounded"
                      size="sm"
                      icon={actionIcon.time}
                      label={t('book.quick.soon', {
                        minutes: leadMinutes,
                        time: timeLabel(soonSlot.at.getTime()),
                      })}
                      selected={activeMs === soonSlot.at.getTime()}
                      onPress={() => {
                        haptics.select();
                        pickTime(soonSlot.at.getTime());
                      }}
                    />
                  ) : null}
                  {quick.map((row) => (
                    <Chip
                      key={row.at}
                      shape="rounded"
                      size="sm"
                      label={timeLabel(row.at)}
                      selected={activeMs === row.at}
                      onPress={() => {
                        haptics.select();
                        pickTime(row.at);
                      }}
                    />
                  ))}
                </ScrollView>
              ) : null}
              <TimeWheel
                slots={wheelRows}
                value={activeMs}
                onChange={(at, how) => pickTime(at, how.snappedFrom)}
                accessibilityLabel={t('book.time')}
                accessibilityValueText={spokenTime}
                accessibilityHint={t('book.wheel.hint')}
              />
              {snapNote ? (
                <Text accessibilityRole="alert" style={styles.snapNote}>
                  {snapNote}
                </Text>
              ) : null}
              {requestNote ? <Text style={styles.slotNote}>{requestNote}</Text> : null}
              {freeByNote ? <Text style={styles.slotNote}>{freeByNote}</Text> : null}
              {/* This time's tables could not be read: Confirm waits, and says why. */}
              {activeSlot && !slotAnswer && slotQuery.isError ? (
                <View accessibilityRole="alert" style={styles.slotError}>
                  <Text style={styles.slotNote}>{t('confirm.tableError')}</Text>
                  <Chip
                    shape="rounded"
                    size="sm"
                    label={t('net.retry')}
                    onPress={() => void slotQuery.refetch()}
                  />
                </View>
              ) : null}
              {struckHint ? <Text style={styles.struckHint}>{struckHint}</Text> : null}
            </View>
          )}
          {/* A change whose time is gone: nothing is chosen for it, and why. */}
          {changeTimeGone ? (
            <Rise>
              <View accessibilityRole="alert" style={styles.timeGone}>
                <Ionicons name={actionIcon.time} size={iconSize.sm} color={colors.warningInk} />
                <Text style={styles.timeGoneText}>{t('book.changeTimeUnavailable')}</Text>
              </View>
            </Rise>
          ) : null}

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
              <TableLegend partyFit request={anyRequest} style={styles.legend} />
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
              ) : chosenAtSlot?.isBookable ? (
                <>
                  {chosenAtSlot.isRequestable ? (
                    <Text style={styles.slotNote}>
                      {t(
                        chosenAtSlot.requiresEarlierGuestConsent
                          ? 'table.requestable.earlierGuest'
                          : 'booking.approval.why',
                      )}
                    </Text>
                  ) : null}
                  {chosenAtSlot.mustFreeByUtc ? (
                    <Text style={styles.slotNote}>
                      {t('table.mustFreeBy', {
                        time: formatTime(chosenAtSlot.mustFreeByUtc, place.timeZoneId, locale),
                      })}
                    </Text>
                  ) : null}
                </>
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

          {/* No proved number: the venue may confirm first; Telegram makes it instant. */}
          {accountUnproved ? (
            <View style={styles.unproved}>
              {proofOffer ? null : (
                <Text style={styles.unprovedText}>{t('confirm.unverifiedNote')}</Text>
              )}
              <Button
                label={t('confirm.verifyMyNumber')}
                variant={proofOffer ? 'outline' : 'text'}
                fullWidth={false}
                onPress={() => router.push('/auth/code')}
              />
            </View>
          ) : null}

          {/* Said no to freeing the table in time: another table or time. */}
          {freeByDeclined ? (
            <Rise>
              <View accessibilityRole="alert" style={styles.freeByOther}>
                <Text style={styles.freeByOtherText}>
                  {t(unlimited.length > 0 ? 'book.freeBy.other' : 'book.freeBy.otherNoTimes')}
                </Text>
                {unlimited.length > 0 ? (
                  <View style={styles.quick}>
                    {unlimited.map((row) => (
                      <Chip
                        key={row.at}
                        shape="rounded"
                        size="sm"
                        label={timeLabel(row.at)}
                        onPress={() => {
                          haptics.select();
                          pickTime(row.at);
                        }}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            </Rise>
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

      {/* "There is a booking at 21:30. Will you free the table by 21:25?" */}
      {freeByAsk ? (
        <FreeBySheet
          visible
          freeByUtc={freeByAsk.freeByUtc}
          nextStartUtc={freeByAsk.nextStartUtc}
          timeZoneId={place.timeZoneId}
          busy={pending}
          onAccept={() => {
            const agreed = freeByAsk.freeByUtc;
            setFreeByAsk(null);
            void confirm(agreed);
          }}
          onDecline={() => {
            setFreeByAsk(null);
            setFreeByDeclined(true);
            // The other times are said at the foot of the form: bring it into view.
            scrollRef.current?.scrollToEnd({ animated: !reducedMotion });
          }}
        />
      ) : null}
    </Screen>
  );
}

/**
 * The table one press books when the diner tapped none: one that is free with
 * no limit and nobody's request first, then the one the next booking cuts the
 * least, then a requestable one — so a table that would need a promise or an
 * answer is never chosen while a plain one is to be had.
 */
function preferredTable(tables: readonly TableAvailability[]): TableAvailability | null {
  const bookable = tables.filter((table) => table.isBookable);
  const plain = bookable.filter((table) => !table.isRequestable);
  return (
    plain.find((table) => !table.mustFreeByUtc) ??
    [...plain].sort(
      (a, b) => Date.parse(b.mustFreeByUtc ?? '') - Date.parse(a.mustFreeByUtc ?? ''),
    )[0] ??
    bookable[0] ??
    null
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
 * "Book a Table" — or "Change booking" — over the venue and where it is, the
 * same area line the place card shows: "Lavash Restaurant · Northern Avenue ·
 * Kentron".
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
  const venue = place ? placeTitle(place).venue : null;
  // The branch and the district; the branch alone, or the street, without one.
  // It carries the branch, so two branches of one venue never sound alike.
  const where = place ? placeArea(place) || null : null;
  const heard = [title, venue, where];
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
              // The web build reads only the aria prop: the chosen day, said.
              aria-selected={selected}
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
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.xs },
  quickRow: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs },
  snapNote: { ...typography.caption, color: colors.warningInk, paddingHorizontal: space.xs },
  slotNote: { ...typography.caption, color: colors.infoInk, paddingHorizontal: space.xs },
  slotError: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  freeByOther: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.tile,
    backgroundColor: colors.warningSoft,
  },
  freeByOtherText: { ...typography.body, color: colors.warningInk },
  timeGone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginTop: -space.sm,
    paddingHorizontal: space.xs,
  },
  timeGoneText: { ...typography.caption, flex: 1, color: colors.warningInk },

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
  unproved: { gap: space.xs, alignItems: 'flex-start' },
  unprovedText: { ...typography.caption, color: colors.infoInk },
  bookingsOff: { gap: space.xs, paddingVertical: space.xs },
  bookingsOffTitle: { ...typography.body, fontWeight: fontWeight.bold, color: colors.text },
  bookingsOffBody: { ...typography.body, color: colors.textMuted },
});
