import {
  BookingsNotAcceptedError,
  MAX_BOOKING_NOTE,
  ValidationError,
  type CopyLine,
} from '@yalla/api';

/**
 * The two refusals a booking can meet that `bookingFailure` does not name,
 * because they came with the hardening contract (K9):
 *
 * - the branch is not taking bookings from the app — the same words the place
 *   page shows in place of Book, not "something went wrong";
 * - the note to the venue is too long — which field, and the limit.
 *
 * `null` for anything else: `bookingFailure` decides those.
 */
export function bookingRefusal(error: unknown): CopyLine | null {
  if (error instanceof BookingsNotAcceptedError)
    return { key: 'place.bookingsOff.body', params: {} };
  if (
    error instanceof ValidationError &&
    (error.field?.toLowerCase() === 'note' ||
      error.violations.some((violation) => violation.field.toLowerCase() === 'note'))
  ) {
    return { key: 'booking.note.tooLong', params: { max: MAX_BOOKING_NOTE } };
  }
  return null;
}
