import {
  ExtensionsNotOfferedError,
  HoldAlreadyExtendedError,
  HoldNotActiveError,
  isOffline,
  type Booking,
  type BookingStatus,
} from '@yalla/api';

/**
 * What a booking's detail screen offers, decided from the booking's real state.
 */

/**
 * Only a booking that still holds a table can be cancelled — what the server
 * accepts. Offering Cancel on a finished or missed booking is a button the
 * server refuses.
 */
export function canCancel(status: BookingStatus): boolean {
  return status === 'confirmed' || status === 'pendingApproval';
}

/**
 * "Keep my table" is for a diner running late: a confirmed booking whose time
 * has come and not yet gone.
 *
 * Offered on every confirmed booking, it let a tap three days early spend the
 * one extension and ping the floor; the server now refuses that, and the
 * screen does not offer it.
 */
export function canKeepTable(
  booking: Pick<Booking, 'status' | 'slotUtc' | 'endUtc'>,
  now: Date,
): boolean {
  const t = now.getTime();
  return (
    booking.status === 'confirmed' &&
    t >= Date.parse(booking.slotUtc) &&
    t < Date.parse(booking.endUtc)
  );
}

/**
 * "I'm at my table" — opening the tab on the table this booking holds.
 *
 * Offered on a confirmed booking until its sitting ends, and on a seated one
 * whatever the clock says, because the venue has already put that party at the
 * table and the sitting holds it until staff free it.
 *
 * Deliberately *not* narrowed to a window before the start, the way "keep my
 * table" is. The instant the table starts being held is the branch's own
 * walk-in holdback, which is not on the wire and which the client must not
 * guess: a number invented here would hide the button from a diner the server
 * would have let in. So the button is offered, and a diner who is early is told
 * the time it opens — the server's own instant, in the branch's zone.
 */
export function canOpenTabForBooking(
  booking: Pick<Booking, 'status' | 'endUtc'>,
  now: Date,
): boolean {
  if (booking.status === 'seated') return true;
  return booking.status === 'confirmed' && now.getTime() < Date.parse(booking.endUtc);
}

/** Each refusal of "keep my table", as its own sentence. */
export function keepTableFailureKey(error: unknown): string {
  if (error instanceof HoldAlreadyExtendedError) return 'push.actions.alreadyExtended';
  if (error instanceof HoldNotActiveError) return 'push.actions.holdNotActive';
  if (error instanceof ExtensionsNotOfferedError) return 'push.actions.extensionsNotOffered';
  if (isOffline(error)) return 'push.actions.offline';
  return 'push.actions.failed';
}
