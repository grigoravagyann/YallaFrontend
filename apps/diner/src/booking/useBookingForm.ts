import { isShortNotice, type CopyLine } from '@yalla/api';
import { formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useMemo, useState, type MutableRefObject, type RefObject } from 'react';
import type { ScrollViewInstance } from 'react-native';
import type { BookingChange } from '../components/bookings/changeBooking';
import { useBookingRules } from '../data/queries';
import { useMinuteClock } from '../hooks/useMinuteClock';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { haptics } from '../lib/haptics';
import type { Place, PlaceRoom } from '../places/model';
import { bookingRulesInput } from '../places/navigation';
import { dayRefusalLine, pickSlot } from '../places/slotAvailability';
import { LEAD_MINUTES, WINDOW_DAYS, largerPartySizes } from '../places/slots';
import type { WheelSlot } from '../places/wheelTimes';
import { PARTY_MAX, PARTY_MORE_FROM, initialPartySize } from './formRules';
import type { BookingParams } from './params';
import { useBooker } from './useBooker';
import { useBookingDays } from './useBookingDays';
import { useBookingSubmit } from './useBookingSubmit';
import { useBookingTimes } from './useBookingTimes';
import { useChosenTable } from './useChosenTable';
import { useDayLabel } from './useDayLabel';
import { useSlotTables } from './useSlotTables';
import { useTimeChoices } from './useTimeChoices';

export interface BookingFormInput {
  readonly place: Place;
  /** The rooms, photos and live pins: what the room photos at the slot are drawn on. */
  readonly rooms: readonly PlaceRoom[];
  readonly params: BookingParams;
  /** The booking being changed, or `null` for a new one. */
  readonly change: BookingChange | null;
}

/** The scroller and where "Pick a table" starts in it, held by the form that draws them. */
export interface BookingFormRefs {
  readonly scrollRef: RefObject<ScrollViewInstance | null>;
  // Where "Pick a table" starts in the scroll, so a table taken under the
  // diner's finger can bring them back to the photo.
  readonly pickTop: MutableRefObject<number>;
}

/**
 * Everything the booking form shows and does: the day, the time, the party,
 * the table, who books, and one press to book or move the booking.
 */
export function useBookingForm({
  place,
  rooms,
  params,
  change,
  scrollRef,
  pickTop,
}: BookingFormInput & BookingFormRefs) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const reducedMotion = useReducedMotion();
  const dayLabel = useDayLabel(place.timeZoneId);
  // The booking being changed is left out of every availability read, so its
  // own table reads free at its own time and at the times around it.
  const excludeBookingId = change?.bookingId;

  const { tables, pickedTableId, setPickedTableId, chosenTable, capacityMin, capacityMax, fits } =
    useChosenTable(rooms, params);

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
  const { ownSlotMs, changeDate, anotherTime, openDate, days } = useBookingDays({
    place,
    change,
    dayOf: params.dayOf,
    party: params.party,
    now,
    windowDays,
  });

  // A change opens on what the booking holds, a booking after a declined one
  // on that one's day; a new booking on the defaults.
  const [dateKey, setDateKey] = useState<string | null>(openDate);
  // The time the diner tapped, as an instant; `null` until they tap one.
  const [pickedMs, setPickedMs] = useState<number | null>(null);
  // Never shrunk: a party bigger than the list is shown as chosen as it is.
  const [partySize, setPartySize] = useState(() =>
    initialPartySize(change, anotherTime, chosenTable),
  );
  const [moreOpen, setMoreOpen] = useState(partySize >= PARTY_MORE_FROM);
  const [requests, setRequests] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  // The table went to someone else between the photo and the tap (409): said
  // over the photo, where the next pick is made.
  const [conflictText, setConflictText] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  /** The last refusal was the pause on booking: said once, by the note, while the record says it too. */
  const [pauseRefused, setPauseRefused] = useState(false);
  // The wheel stopped on a busy time and moved on: "No free table at 20:15 — 20:30 suggested".
  const [snapNote, setSnapNote] = useState<string | null>(null);
  const clearErrors = useCallback(() => {
    setErrorText(null);
    setConflictText(null);
    setPauseRefused(false);
  }, []);

  const activeDateKey = dateKey ?? days[0]?.dateKey ?? null;
  const {
    daySlotsQuery,
    nextDateKey,
    nextDaySlotsQuery,
    soonMs,
    soonSlot,
    slots,
    availability,
    shownSlots,
    wheelRows,
  } = useBookingTimes({
    place,
    days,
    activeDateKey,
    now,
    leadMinutes,
    partySize,
    excludeBookingId,
  });

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

  const {
    slotQuery,
    slotAnswer,
    slotTables,
    slotRooms,
    anyRequest,
    chosenAtSlot,
    autoTableId,
    chosenRefusal,
    noTableFits,
    noTableText,
  } = useSlotTables({
    place,
    rooms,
    tables,
    activeSlot,
    slotUtc,
    partySize,
    excludeBookingId,
    chosenTable,
  });

  const booker = useBooker(change, place);
  const { guestName, setGuestName, needsName, mustVerify, pausedUntil } = booker;

  const submit = useBookingSubmit({
    place,
    change,
    activeSlot,
    slotUtc,
    partySize,
    chosenTable,
    autoTableId,
    chosenRefusal,
    slotTables,
    slotAnswer,
    requests,
    guestName,
    verified: booker.verified,
    phoneE164: booker.phoneE164,
    rememberName: booker.rememberName,
    mustVerify,
    pausedUntil,
    setVerifyRefused: booker.setVerifyRefused,
    here: booker.here,
    clearErrors,
    setErrorText,
    setConflictText,
    setOutcomeUnknown,
    setPauseRefused,
    slotQuery,
    daySlotsQuery,
    nextDaySlotsQuery,
    nextDateKey,
    refreshNow,
    wheelRows,
    setPickedMs,
    scrollRef,
    pickTop,
    reducedMotion,
  });
  const { pending, freeByDeclined, setFreeByDeclined, setFreeByAsk } = submit;

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

  const { quick, unlimited } = useTimeChoices({
    place,
    activeDateKey,
    partySize,
    activeMs,
    soonSlot,
    soonMs,
    wheelRows,
    freeByDeclined,
    declinedTableId: chosenTable?.tableId ?? null,
    excludeBookingId,
  });
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
  // Under the times, when any is struck: why — the day's own reason when the
  // whole day is refused, else that a struck time has no free table.
  const lineText = (line: CopyLine) => t(line.key, line.params);
  const struckHint =
    availability.struck.size === 0
      ? null
      : availability.dayReason
        ? lineText(dayRefusalLine(availability.dayReason, partySize))
        : t('book.struckHint');

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

  const selectDay = (key: string) => {
    setDateKey(key);
    setPickedMs(null);
    setSnapNote(null);
    setFreeByDeclined(false);
    clearErrors();
  };
  const selectTable = (tableId: string | null) => {
    // The same pin again, or the photo away from any: leave it to us.
    if (tableId !== null && tableId !== pickedTableId) haptics.select();
    setPickedTableId(tableId === pickedTableId ? null : tableId);
    clearErrors();
  };
  const changeRequests = (value: string) => {
    setRequests(value);
    clearErrors();
  };
  const acceptFreeBy = (agreed: string) => {
    setFreeByAsk(null);
    void submit.confirm(agreed);
  };
  const declineFreeBy = () => {
    setFreeByAsk(null);
    setFreeByDeclined(true);
    // The other times are said at the foot of the form: bring it into view.
    scrollRef.current?.scrollToEnd({ animated: !reducedMotion });
  };

  return {
    days,
    activeDateKey,
    dayLabel,
    selectDay,
    // Times
    shownSlots,
    soonSlot,
    quick,
    leadMinutes,
    activeMs,
    timeLabel,
    pickTime,
    wheelRows,
    spokenTime,
    snapNote,
    requestNote,
    freeByNote,
    slotFailed: activeSlot !== null && !slotAnswer && slotQuery.isError,
    retrySlot: () => void slotQuery.refetch(),
    struckHint,
    changeTimeGone,
    // Party
    partySize,
    moreOpen,
    setMoreOpen,
    moreSizes,
    fits,
    selectParty,
    // Table
    slotRooms,
    pickedTableId,
    anyRequest,
    conflictText,
    selectTable,
    chosenTable,
    chosenRefusal,
    chosenAtSlot,
    noTableFits,
    noTableText,
    // Who and what
    needsName,
    guestName,
    setGuestName,
    requests,
    changeRequests,
    mustVerify,
    pausedUntil,
    errorText,
    pauseRefused,
    unlimited,
    // Book
    bookingsOff,
    ctaLabel: ctaState ?? (change ? t('book.saveChanges') : t('tables.book')),
    ctaAccessibilityLabel: ctaState ?? (summary ? `${ctaAction}, ${summary}` : ctaAction),
    summary,
    canConfirm: submit.canConfirm,
    pending,
    confirm: submit.confirm,
    freeByAsk: submit.freeByAsk,
    freeByDeclined,
    acceptFreeBy,
    declineFreeBy,
  };
}
