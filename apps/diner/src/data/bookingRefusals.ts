import {
  BookingNotChangeableError,
  BookingsNotAcceptedError,
  MAX_BOOKING_NOTE,
  ValidationError,
  isApprovalExpired,
  type BookingFailure,
  type CopyLine,
} from '@yalla/api';

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
