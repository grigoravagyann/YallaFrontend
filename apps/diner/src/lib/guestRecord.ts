import { isBookingBlocked, type CopyLine, type GuestRecord } from '@yalla/api';
import { formatDate, formatTime, YEREVAN, type Locale, type TimeZone } from '@yalla/format';

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
 * The phone's own zone, for a time that belongs to no branch — the end of the
 * guest's pause on the bookings tab. The polyfills hand the device's zone to
 * `Intl` (see `deviceTimeZone.ts`); Yerevan where it cannot say.
 */
export function phoneTimeZone(): TimeZone {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || YEREVAN;
  } catch {
    return YEREVAN;
  }
}
