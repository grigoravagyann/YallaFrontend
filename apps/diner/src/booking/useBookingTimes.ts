import { branchDayKey } from '@yalla/format';
import { useMemo } from 'react';
import { useDaySlots, useSlotFloor } from '../data/queries';
import { shiftDateKey, type Place } from '../places/model';
import {
  slotAvailability,
  slotFloorVerdict,
  wheelSlots,
  withSoon,
} from '../places/slotAvailability';
import { timeSlots, type DayOption } from '../places/slots';
import { soonInstant } from '../places/wheelTimes';
import { soonCandidateFor } from './formRules';

/**
 * The chosen day's times: the quarter hours the place is open from the lead
 * time on, struck or hidden by the server's day of slots, with "In 10 min"
 * today once the room at that minute says a table can be had.
 */
export function useBookingTimes({
  place,
  days,
  activeDateKey,
  now,
  leadMinutes,
  partySize,
  excludeBookingId,
}: {
  readonly place: Place;
  readonly days: readonly DayOption[];
  readonly activeDateKey: string | null;
  readonly now: Date;
  readonly leadMinutes: number;
  readonly partySize: number;
  readonly excludeBookingId: string | undefined;
}) {
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
  const soonCandidate = useMemo(
    () => soonCandidateFor({ isToday, activeDateKey, dayRefused, place, soonMs }),
    [isToday, activeDateKey, dayRefused, place, soonMs],
  );
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

  return {
    daySlotsQuery,
    nextDateKey,
    nextDaySlotsQuery,
    soonMs,
    soonSlot,
    slots,
    availability,
    shownSlots,
    wheelRows,
  };
}
