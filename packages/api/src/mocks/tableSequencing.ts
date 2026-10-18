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
  /** Another booking is asking this one's guest already: one question at a time. */
  readonly isBeingAsked?: boolean | undefined;
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
      /**
       * 11 TableJustBooked, 12 NextBookingTooSoon, 13 EarlierGuestBeingAsked
       * and 8 TableAlreadyBooked (the overlap net) on the server.
       */
      readonly because: 'justBooked' | 'nextTooSoon' | 'earlierGuestBeingAsked' | 'alreadyBooked';
    };

const MINUTE_MS = 60_000;

/**
 * The verdict for a start on a table — `TableSequencing.Judge`, ported line by
 * line so the mock and the server cannot disagree about a table at a time.
 */
export function tableTiming(input: {
  readonly startUtc: string;
  readonly turnMinutes: number;
  /** The live bookings on the table, the one being moved already left out. */
  readonly bookings: readonly SequencedBooking[];
  readonly bufferMinutes?: number;
}): TableTiming {
  const start = Date.parse(input.startUtc);
  const buffer = (input.bufferMinutes ?? TABLE_BUFFER_MINUTES) * MINUTE_MS;
  const naturalEnd = start + input.turnMinutes * MINUTE_MS;

  const live = [...input.bookings].sort(
    (a, b) => Date.parse(a.startUtc) - Date.parse(b.startUtc) || a.id.localeCompare(b.id),
  );
  const before = live.filter((booking) => Date.parse(booking.startUtc) <= start);
  const previous = before[before.length - 1] ?? null;
  const next = live.find((booking) => Date.parse(booking.startUtc) > start) ?? null;

  // Whoever has it before already promised to be gone by this start less the
  // clearing time: neither the ninety minutes nor a question to them applies.
  const previousPromisedInTime =
    previous !== null &&
    previous.promisedFreeByUtc !== null &&
    Date.parse(previous.promisedFreeByUtc) <= start - buffer;

  // 1. Whoever has it before is barely seated.
  if (
    previous &&
    !previousPromisedInTime &&
    start < Date.parse(previous.startUtc) + TABLE_BLOCK_MINUTES * MINUTE_MS
  ) {
    return { kind: 'refused', because: 'justBooked' };
  }

  // 2. Not worth sitting down before the next party.
  const nextStart = next ? Date.parse(next.startUtc) : null;
  if (nextStart !== null && start > nextStart - NEXT_BOOKING_GAP_MINUTES * MINUTE_MS) {
    return { kind: 'refused', because: 'nextTooSoon' };
  }

  // 3. A full sitting would run into the next party: it ends when the table
  //    has to be cleared for them, and the diner says so before booking.
  let end = naturalEnd;
  let mustFreeBy: number | null = null;
  if (nextStart !== null && naturalEnd + buffer > nextStart) {
    const freeBy = nextStart - buffer;
    // A clearing time so long it leaves nothing to sit down for.
    if (freeBy <= start) return { kind: 'refused', because: 'nextTooSoon' };
    mustFreeBy = freeBy;
    end = freeBy;
  }

  // 4. The guest before may still be there: ask them first — unless they have
  //    already promised to be gone in time.
  let asked: SequencedBooking | null = null;
  let askFreeBy: number | null = null;
  if (previous) {
    const needed = start - buffer;
    const mayStillBeThere =
      start < Date.parse(previous.startUtc) + REQUESTABLE_WITHIN_MINUTES * MINUTE_MS ||
      start < Date.parse(previous.endUtc) + buffer;
    if (mayStillBeThere && !previousPromisedInTime) {
      // A clearing time so long it would have them leave before they arrived.
      if (needed <= Date.parse(previous.startUtc))
        return { kind: 'refused', because: 'justBooked' };
      if (previous.isBeingAsked) return { kind: 'refused', because: 'earlierGuestBeingAsked' };
      asked = previous;
      askFreeBy = needed;
    }
  }

  // 5. The original overlap rule over everything else on the table, as a net
  //    under the ones above; the booking being asked is what the question is about.
  for (const booking of live) {
    if (asked && booking.id === asked.id) continue;
    const otherStart = Date.parse(booking.startUtc);
    const otherEnd = Date.parse(booking.endUtc);
    if (start < otherEnd + buffer && otherStart < end + buffer) {
      return { kind: 'refused', because: 'alreadyBooked' };
    }
  }

  const mustFreeByUtc = mustFreeBy !== null ? new Date(mustFreeBy).toISOString() : null;
  const nextStartUtc = nextStart !== null ? new Date(nextStart).toISOString() : null;
  if (asked && askFreeBy !== null) {
    return {
      kind: 'requestable',
      previousId: asked.id,
      freeByUtc: new Date(askFreeBy).toISOString(),
      mustFreeByUtc,
      nextStartUtc,
    };
  }
  return { kind: 'free', mustFreeByUtc, nextStartUtc };
}
