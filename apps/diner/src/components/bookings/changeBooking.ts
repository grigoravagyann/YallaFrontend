import type { Booking } from '@yalla/api';
import { branchDayKey, zonedParts } from '@yalla/format';

/**
 * Changing a booking in place: the booking screen opened on an existing
 * booking, everything prefilled, and one press that moves it — same code,
 * same booking — instead of a cancellation and a stranger.
 */

/**
 * What the server accepts: a booking still waiting for the venue or confirmed,
 * and not yet started. Offering Change on anything else is a button the server
 * refuses with `reservation-not-changeable`.
 */
export function canChangeBooking(booking: Pick<Booking, 'status' | 'slotUtc'>, now: Date): boolean {
  return (
    (booking.status === 'confirmed' || booking.status === 'pendingApproval') &&
    now.getTime() < Date.parse(booking.slotUtc)
  );
}

/** `HH:mm` of an instant on the branch's wall clock — the booking screen's slot key. */
function clockIn(instant: string, timeZoneId: string): string {
  const { hour, minute } = zonedParts(new Date(instant), timeZoneId);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * The route to change `booking`: `/book/[placeId]` with the booking and what
 * it holds now, so the screen opens on exactly that — its day, its time, its
 * party and its table.
 */
export function changeBookingRoute(booking: Booking) {
  return {
    pathname: '/book/[placeId]' as const,
    params: {
      placeId: booking.branchId,
      bookingId: booking.id,
      date: branchDayKey(booking.slotUtc, booking.timeZoneId),
      time: clockIn(booking.slotUtc, booking.timeZoneId),
      party: String(booking.partySize),
      tableId: booking.tableId,
      tableLabel: booking.tableLabel,
    },
  };
}

/** The booking being changed and what it holds, as the route carried it. */
export interface BookingChange {
  readonly bookingId: string;
  /** `YYYY-MM-DD` in the branch's calendar, or `null` when the route did not say. */
  readonly date: string | null;
  /** `HH:mm` on the branch's clock. */
  readonly time: string | null;
  readonly partySize: number | null;
  readonly tableId: string | null;
}

/** The route's change-mode params; strings, as every route param is. */
export interface ChangeParams {
  readonly bookingId?: string | undefined;
  readonly date?: string | undefined;
  readonly time?: string | undefined;
  readonly party?: string | undefined;
  readonly tableId?: string | undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/u;

/**
 * Change mode, or `null` for a fresh booking (no `bookingId`). A param that
 * does not read as what it should be is left unknown rather than guessed: the
 * screen then starts from its usual default for that choice.
 */
export function parseChangeParams(params: ChangeParams): BookingChange | null {
  const bookingId = params.bookingId?.trim();
  if (!bookingId) return null;
  const party = Number(params.party);
  return {
    bookingId,
    date: params.date && DATE_RE.test(params.date) ? params.date : null,
    time: params.time && TIME_RE.test(params.time) ? params.time : null,
    partySize: params.party !== undefined && Number.isInteger(party) && party > 0 ? party : null,
    tableId: params.tableId?.trim() || null,
  };
}

/** What the screen would send now. */
export interface ChangeChoice {
  readonly date: string | null;
  readonly time: string | null;
  readonly partySize: number;
  readonly tableId: string | null;
}

/**
 * Nothing to save: the same day, time, party and table the booking already
 * has. "Save changes" stays off, so a tap cannot send a move to where the
 * booking already is.
 */
export function isUnchanged(original: BookingChange, current: ChangeChoice): boolean {
  return (
    original.date === current.date &&
    original.time === current.time &&
    original.partySize === current.partySize &&
    original.tableId === current.tableId
  );
}
