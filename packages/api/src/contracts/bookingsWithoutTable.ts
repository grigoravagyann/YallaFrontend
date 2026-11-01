import type { GuestRecord } from './guestRecord';

/**
 * Booking by time only, on the floor (2026-10-29).
 *
 * A branch whose reservation policy is `TimeOnly` takes a time, a party and an
 * optional wish in the note — "by the window", "the smoking room" — and no
 * table. The venue chooses the table when the party arrives: the waiter seats
 * the booking at any free table with `seat-reservation`, and the server gives
 * it that table from then on (`Reservation.AssignTable`). Until then the
 * booking is on no table's tile, so the floor lists it on its own.
 */

/** A confirmed booking nobody has seated yet, and so on no table. */
export interface BookingWithoutTable {
  readonly id: string;
  /** The short code the guest quotes at the door. */
  readonly code: string;
  readonly guestName: string;
  /** E.164, for a `tel:` link; empty when the server sends none. */
  readonly guestPhone: string;
  readonly partySize: number;
  readonly startUtc: string;
  /** Start plus the branch's turn time: past it the booking has nothing to seat. */
  readonly endUtc: string;
  /** The branch's own day, `YYYY-MM-DD`. */
  readonly localDate: string;
  /** Wall clock at the branch, `HH:mm:ss`. */
  readonly localStartTime: string;
  /**
   * The guest's wish — "by the window" — or `null`. At such a branch it is the
   * one thing the guest could say about where they sit, so the floor shows it
   * first, before it chooses a table.
   */
  readonly note: string | null;
  /** Booked without a proved number: "number not verified" beside it. */
  readonly phoneUnverified: boolean;
  /** The guest's record; `null` when no proved account is behind the booking. */
  readonly guestRecord: GuestRecord | null;
  /** The guest said "yes, on my way". */
  readonly guestConfirmedOnWayAtUtc: string | null;
  /** "I'm running late": 10, 15 or 30 minutes, the guest's latest answer. */
  readonly guestRunningLateMinutes: number | null;
  /**
   * Where the booking came from (2026-10-31): `staff` for one a member of
   * staff took by hand, whose taker is then named. Absent from an older server.
   */
  readonly channel?: 'app' | 'web' | 'staff' | 'unknown' | undefined;
  /** Who took it, for a staff-taken booking: "Ընդունեց՝ {name}". */
  readonly takenByName?: string | null | undefined;
}

/**
 * Whether a booking still waits for a table: not yet over. One that ended
 * unseated is the no-show question's, not the door's.
 */
export function stillToSeat(booking: Pick<BookingWithoutTable, 'endUtc'>, now: Date): boolean {
  const end = Date.parse(booking.endUtc);
  return Number.isNaN(end) || end > now.getTime();
}
