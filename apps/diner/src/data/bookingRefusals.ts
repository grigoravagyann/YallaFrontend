import {
  BookingNotChangeableError,
  type BookingOverlapsOwnError,
  BookingsNotAcceptedError,
  MAX_BOOKING_NOTE,
  ValidationError,
  isApprovalExpired,
  type BookingFailure,
  type CopyLine,
} from '@yalla/api';
import {
  branchDayKey,
  formatDayAndTime,
  instantFromZonedClock,
  type Locale,
  type TimeZone,
} from '@yalla/format';

/**
 * The refusals a booking can meet that `bookingFailure` does not name, because
 * they came with later contracts:
 *
 * - the branch is not taking bookings from the app — the same words the place
 *   page shows in place of Book, not "something went wrong" (K9);
 * - the note to the venue is too long — which field, and the limit (K9);
 * - a booking being changed can no longer move: only one waiting for the
 *   venue, or confirmed and not yet started, can;
 * - a booking waiting on a short-notice answer cannot be moved once its
 *   answer window has closed — too late to change, not a table rule.
 *
 * `null` for anything else: `bookingFailure` decides those.
 */
export function bookingRefusal(error: unknown): CopyLine | null {
  if (error instanceof BookingsNotAcceptedError)
    return { key: 'place.bookingsOff.body', params: {} };
  if (error instanceof BookingNotChangeableError)
    return { key: 'book.changeError.notChangeable', params: {} };
  if (isApprovalExpired(error)) return { key: 'book.changeError.approvalExpired', params: {} };
  if (
    error instanceof ValidationError &&
    (error.field?.toLowerCase() === 'note' ||
      error.violations.some((violation) => violation.field.toLowerCase() === 'note'))
  ) {
    return { key: 'booking.note.tooLong', params: { max: MAX_BOOKING_NOTE } };
  }
  return null;
}

/**
 * `bookingFailure`'s line for an account that has not proved its number. A
 * number already booked by somebody else holds such an account back — but
 * proving the number lifts that (a stranger's unproved booking never holds a
 * proved account), so the sentence offers it. Every other line as it is.
 */
export function unprovedFailureLine(failure: BookingFailure, accountUnproved: boolean): CopyLine {
  if (failure.kind === 'phoneHasActiveBooking' && !failure.error.held && accountUnproved) {
    return { key: 'confirm.error.phoneHasBookingVerify', params: {} };
  }
  return failure.line;
}

/**
 * Whether proving the number lifts this refusal, for an account that has not:
 * the party cap, the venue's queue, the network's hour, and a number somebody
 * else booked. The screen offers "Verify my number" beside it.
 */
export function proofLifts(failure: BookingFailure, accountUnproved: boolean): boolean {
  if (!accountUnproved) return false;
  switch (failure.kind) {
    case 'verifiedPhoneRequired':
    case 'deviceHasActiveBooking':
    case 'unverifiedPartyTooLarge':
    case 'unverifiedQueueFull':
    case 'rateLimited':
      return true;
    case 'phoneHasActiveBooking':
      return failure.error.held === null;
    default:
      return false;
  }
}

/**
 * `bookingFailure`'s line for a change rather than a new booking. Two of its
 * lines are about a booking being made — "Nothing was booked" — which, said of
 * a booking that already exists, reads as if it were gone; those get words of
 * their own. Every other line (the table taken, too soon, a rule) is as true
 * of a move as of a new booking.
 */
export function changeFailureLine(failure: BookingFailure): CopyLine {
  if (failure.kind === 'generic') return { key: 'book.changeError.generic', params: {} };
  if (failure.kind === 'unknown') return { key: 'book.changeError.unknownOutcome', params: {} };
  return failure.line;
}

/**
 * "You already have a booking here at 19:30 (table 2)" — and its day as well
 * when that is not the day being booked: last night's 23:30 sitting runs into
 * a booking for 00:15, and "at 23:30" alone reads as tonight's. `localDate`
 * is the booking held's day on the branch's clock, as the server said it.
 */
export function overlapsOwnLine(
  error: BookingOverlapsOwnError,
  slotUtc: string,
  timeZoneId: TimeZone,
  locale: Locale,
): CopyLine {
  const { localStartTime: time, tableLabel: table } = error;
  if (!time) return { key: 'confirm.error.generic', params: {} };
  const date = otherBranchDay(error.localDate, slotUtc, timeZoneId, locale);
  if (date) {
    return table
      ? { key: 'confirm.error.overlapsOwnOn', params: { date, time, table } }
      : { key: 'confirm.error.overlapsOwnOnPlain', params: { date, time } };
  }
  return table
    ? { key: 'confirm.error.overlapsOwn', params: { time, table } }
    : { key: 'confirm.error.overlapsOwnPlain', params: { time } };
}

/** `localDate` ("2026-10-20") as the branch writes a day, or `null` when it is the day of `slotUtc`. */
function otherBranchDay(
  localDate: string | null,
  slotUtc: string,
  timeZoneId: TimeZone,
  locale: Locale,
): string | null {
  const parts = localDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!parts || localDate === branchDayKey(slotUtc, timeZoneId)) return null;
  const noon = instantFromZonedClock(
    { year: Number(parts[1]), month: Number(parts[2]), day: Number(parts[3]), hour: 12, minute: 0 },
    timeZoneId,
  );
  return formatDayAndTime(noon, timeZoneId, locale).date;
}
