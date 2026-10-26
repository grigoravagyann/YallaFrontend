import { branchDayKey } from '@yalla/format';
import { useMemo } from 'react';
import { parseAnotherTimeParams, type BookingChange } from '../components/bookings/changeBooking';
import type { Place } from '../places/model';
import { dayOptions, stripDateFor, windowReaching } from '../places/slots';

/**
 * The day strip, and the day a booking opens on: a change's own, a declined
 * booking's, else the first.
 */
export function useBookingDays({
  place,
  change,
  dayOf,
  party,
  now,
  windowDays,
}: {
  readonly place: Place;
  readonly change: BookingChange | null;
  readonly dayOf: string | undefined;
  readonly party: string | undefined;
  readonly now: Date;
  readonly windowDays: number;
}) {
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
    () => (change ? null : parseAnotherTimeParams({ dayOf, party })),
    [change, dayOf, party],
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
  return { ownSlotMs, changeDate, anotherTime, openDate, days };
}
