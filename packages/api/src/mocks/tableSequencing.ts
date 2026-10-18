import {
  NEXT_BOOKING_GAP_MINUTES,
  REQUESTABLE_WITHIN_MINUTES,
  TABLE_BLOCK_MINUTES,
  TABLE_BUFFER_MINUTES,
} from '../contracts/approvals';

/**
 * Table sequencing — when one more booking fits on a table that already has
 * some — as the server's `ReservationRules` decide it, for every mock.
 *
 * Pure, and the only copy: the diner mock's availability, its day of slots,
 * a new booking and a moved one all ask this, so a time the day view offers is
 * never refused by the room it opens, and the floor tablet's mock reads the
 * same. The rules, for a start S on one table:
 *
 * 1. **Just booked.** S within {@link TABLE_BLOCK_MINUTES} after the latest
 *    booking that starts at or before it: refused.
 * 2. **Before the next one.** S later than {@link NEXT_BOOKING_GAP_MINUTES}
 *    before the next booking: refused. A sitting (plus the clearing time) that
 *    would run into it is cut to its start less {@link TABLE_BUFFER_MINUTES},
 *    and the diner agrees to that before sending.
 * 3. **After the one before.** Until {@link REQUESTABLE_WITHIN_MINUTES} after
 *    it starts — or while it would still be sitting — the table is only
 *    requestable: the earlier guest (another day) or the floor (today)
 *    decides. Not when that guest already promised to be gone in time.
 * 4. Otherwise free.
 */

export interface SequencedBooking {
  readonly id: string;
  readonly startUtc: string;
  /** When the table is free of it: its booked end, or the time it promised. */
  readonly endUtc: string;
  /** The time its guest promised to be gone by, if they did. */
  readonly promisedFreeByUtc: string | null;
}

export type TableTiming =
  | {
      readonly kind: 'free';
      /** The next booking cuts the sitting to this; `null` when it does not. */
      readonly mustFreeByUtc: string | null;
      readonly nextStartUtc: string | null;
    }
  | {
      readonly kind: 'requestable';
      /** The booking before, whose guest (or the floor) is asked. */
      readonly previousId: string;
      /** What they are asked to be gone by: S less the clearing time. */
      readonly freeByUtc: string;
      readonly mustFreeByUtc: string | null;
      readonly nextStartUtc: string | null;
    }
  | {
      readonly kind: 'refused';
      /** 11 TableJustBooked, 12 NextBookingTooSoon, 13 EarlierGuestBeingAsked on the server. */
      readonly because: 'justBooked' | 'nextTooSoon' | 'earlierGuestBeingAsked';
    };

const MINUTE_MS = 60_000;

export function tableTiming(input: {
  readonly startUtc: string;
  readonly turnMinutes: number;
  /** The live bookings on the table, the one being moved already left out. */
  readonly bookings: readonly SequencedBooking[];
  readonly bufferMinutes?: number;
}): TableTiming {
  const start = Date.parse(input.startUtc);
  const buffer = (input.bufferMinutes ?? TABLE_BUFFER_MINUTES) * MINUTE_MS;

  let previous: SequencedBooking | null = null;
  let next: SequencedBooking | null = null;
  for (const booking of input.bookings) {
    const at = Date.parse(booking.startUtc);
    if (at <= start) {
      if (!previous || at > Date.parse(previous.startUtc)) previous = booking;
    } else if (!next || at < Date.parse(next.startUtc)) {
      next = booking;
    }
  }

  if (previous && start < Date.parse(previous.startUtc) + TABLE_BLOCK_MINUTES * MINUTE_MS) {
    return { kind: 'refused', because: 'justBooked' };
  }

  const nextStart = next ? Date.parse(next.startUtc) : null;
  if (nextStart !== null && start > nextStart - NEXT_BOOKING_GAP_MINUTES * MINUTE_MS) {
    return { kind: 'refused', because: 'nextTooSoon' };
  }

  const mustFreeByUtc =
    nextStart !== null && start + input.turnMinutes * MINUTE_MS + buffer > nextStart
      ? new Date(nextStart - buffer).toISOString()
      : null;
  const nextStartUtc = nextStart !== null ? new Date(nextStart).toISOString() : null;

  if (previous) {
    const promise = previous.promisedFreeByUtc ? Date.parse(previous.promisedFreeByUtc) : null;
    const promisedInTime = promise !== null && promise + buffer <= start;
    const withinWindow =
      start < Date.parse(previous.startUtc) + REQUESTABLE_WITHIN_MINUTES * MINUTE_MS;
    const stillSitting = Date.parse(previous.endUtc) + buffer > start;
    if (!promisedInTime && (withinWindow || stillSitting)) {
      return {
        kind: 'requestable',
        previousId: previous.id,
        freeByUtc: new Date(start - buffer).toISOString(),
        mustFreeByUtc,
        nextStartUtc,
      };
    }
  }

  return { kind: 'free', mustFreeByUtc, nextStartUtc };
}
