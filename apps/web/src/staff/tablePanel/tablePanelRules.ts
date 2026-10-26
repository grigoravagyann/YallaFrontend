import {
  ON_MY_WAY_WINDOW_HOURS,
  type DerivedTableState,
  type DuePreOrder,
  type StaffTableDetail,
  type TableStatus,
} from '@yalla/api';
import type { DayAndTime } from '@yalla/format';
import type { TFunction } from 'i18next';

/** The server's bound on a party (`[Range(1, 100)]` on every seat request). */
export const MAX_PARTY = 100;
/** "Are you coming?" may be asked from two hours before a booking's start. */
export const ASK_WINDOW_MINUTES = ON_MY_WAY_WINDOW_HOURS * 60;

/** A party size the server takes: 1 to `MAX_PARTY`. */
export function clampParty(size: number): number {
  return Math.max(1, Math.min(MAX_PARTY, size));
}

/** The booked party size, when the server sends it; otherwise the server keeps the booking's. */
export function bookedParty(detail: StaffTableDetail | undefined): { partySize?: number } {
  return detail?.nextReservationPartySize ? { partySize: detail.nextReservationPartySize } : {};
}

/** The physical status a drawn state implies, when no detail row is available. */
export function physicalFrom(state: DerivedTableState): TableStatus {
  switch (state) {
    case 'occupied':
      return 'occupied';
    case 'held':
      return 'held';
    case 'outOfService':
      return 'outOfService';
    default:
      // `reservedSoon` is an overlay on a physically free table. Treating it as
      // anything else would hide "seat a walk-in" on exactly the tables a
      // waiter most often has to seat against a booking.
      return 'free';
  }
}

/**
 * Minutes since the booking was due, once it is: null before its start.
 *
 * Only a booking whose time has come can be a no-show. A table is held for
 * a walk-in on its way too, and the server attaches that hold to whatever is
 * booked next — 22:00, or tomorrow — so "release the booking" is offered for
 * a booking that is due, never for one that is not (review B1).
 */
export function lateMinutes(
  bookingStart: string | null | undefined,
  minutesSince: (utc: string) => number,
): number | null {
  return bookingStart !== null && bookingStart !== undefined && minutesSince(bookingStart) > 0
    ? minutesSince(bookingStart)
    : null;
}

/**
 * "Ask: are you coming?" for the next booking (2026-10-22), when its
 * pre-order card — which asks the same — is not on this panel: from two
 * hours before its start until the start, and after it only while the
 * guest's "running late" has not run out. Not for a booking still awaiting
 * the floor's yes, nor on a table out of service.
 */
export function askWindowOpen(input: {
  readonly reservationId: string | null;
  readonly bookingStart: string | null | undefined;
  readonly preOrderReservationId: string | undefined;
  readonly awaiting: boolean;
  readonly status: TableStatus;
  /** The guest's "running late", in minutes, or `null`. */
  readonly runningLateMinutes: number | null;
  readonly minutesSince: (utc: string) => number;
}): boolean {
  const { reservationId, bookingStart } = input;
  return (
    reservationId !== null &&
    Boolean(bookingStart) &&
    input.preOrderReservationId !== reservationId &&
    !input.awaiting &&
    input.status !== 'outOfService' &&
    input.minutesSince(bookingStart!) >= -ASK_WINDOW_MINUTES &&
    input.minutesSince(bookingStart!) < (input.runningLateMinutes ?? 0)
  );
}

/**
 * The table's next booking, when its pre-order card is on the rail and
 * confirmed: the party may walk in up to two hours early, their food already
 * cooking, and must be seated on the booking so it reaches their tab (live QA
 * 2026-10-21, bug 3).
 */
export function preOrderPartyFor(
  preOrder: DuePreOrder | null | undefined,
  reservationId: string | null,
): DuePreOrder | null {
  return preOrder &&
    reservationId !== null &&
    preOrder.reservationId === reservationId &&
    preOrder.status === 'confirmed'
    ? preOrder
    : null;
}

/** "20 min late", "1 h 39 min late". */
export function lateText(t: TFunction, minutes: number): string {
  if (minutes < 60) return t('table.lateFor', { count: minutes });
  return t('table.lateForHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** The booking's start, dated when it is not today. */
export function nextBookingText(t: TFunction, when: DayAndTime): string {
  if (when.day === 'today') return when.time;
  if (when.day === 'tomorrow') return t('table.nextBookingTomorrow', { time: when.time });
  return t('table.nextBookingOn', { date: when.date, time: when.time });
}
