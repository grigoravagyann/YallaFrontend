import { isBookingBlocked, type BookingFailure, type CopyLine, type GuestRecord } from '@yalla/api';
import { formatDate, formatTime, type Locale, type TimeZone } from '@yalla/format';
import { deviceTimeZone } from '../deviceTimeZone';

/**
 * The guest's own record (guest record, 2026-10-20): how they kept their
 * bookings over the last twelve months, at every venue — exactly what a venue
 * they book with sees beside the booking, counts only — and the week's pause
 * on booking after three no-shows in three days.
 */

/** The record as lines: how often they came, then whatever else there is to say. */
export interface RecordCopy {
  /** "You came 11 out of 12 bookings", or the neutral line for a new guest. */
  readonly main: CopyLine;
  /** Missed bookings, late cancellations, unmarked ones — each only when there are any. */
  readonly extras: readonly CopyLine[];
}

/**
 * `null` when the server sent no record (an older server): nothing is said,
 * never "new guest" for a record that is not there. A new guest reads as
 * neutral — never a warning.
 */
export function recordCopy(record: GuestRecord | null | undefined): RecordCopy | null {
  if (!record) return null;
  if (record.isNewGuest) return { main: { key: 'bookings.record.new', params: {} }, extras: [] };
  const extras: CopyLine[] = [];
  if (record.noShows > 0) {
    extras.push({ key: 'bookings.record.noShows', params: { count: record.noShows } });
  }
  if (record.lateCancellations > 0) {
    extras.push({
      key: 'bookings.record.lateCancellations',
      params: { count: record.lateCancellations },
    });
  }
  // Their time came and nobody on the floor marked them: said, so the
  // counts add up to the bookings, but never as the guest's fault.
  if (record.unmarked > 0) {
    extras.push({ key: 'bookings.record.unmarked', params: { count: record.unmarked } });
  }
  return {
    // Plural by the bookings: "out of 1 booking", "out of 12 bookings".
    main: { key: 'bookings.record.came', params: { came: record.came, count: record.booked } },
    extras,
  };
}

/** When the pause on booking ends, ISO UTC — or `null` when booking is open at `now`. */
export function blockedUntil(record: GuestRecord | null | undefined, now: Date): string | null {
  return record && isBookingBlocked(record, now) ? record.blockedUntilUtc : null;
}

/**
 * "You can't book until 27 Oct 2026, 13:30, because of three missed bookings
 * in three days." — the very sentence the server's 403 is said with
 * (`bookingFailure`), so the gate before the tap and the refusal after it agree.
 */
export function blockedLine(untilUtc: string, timeZoneId: TimeZone, locale: Locale): CopyLine {
  return {
    key: 'confirm.error.blockedNoShows',
    params: {
      date: formatDate(untilUtc, timeZoneId, locale),
      time: formatTime(untilUtc, timeZoneId, locale),
    },
  };
}

/**
 * The server's 403 for a paused guest, said on the phone's clock like the
 * bookings tab, the note by Book and the feed (review round 2): the shared
 * `bookingFailure` words it on the branch's clock, which the pause does not
 * belong to. `null` for any other failure, or a pause with no end said.
 */
export function pauseRefusalLine(
  failure: BookingFailure,
  locale: Locale,
  timeZoneId: TimeZone = deviceTimeZone(),
): CopyLine | null {
  if (failure.kind !== 'blockedNoShows' || !failure.error.blockedUntilUtc) return null;
  return blockedLine(failure.error.blockedUntilUtc, timeZoneId, locale);
}
