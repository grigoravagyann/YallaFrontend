import { BookingsNotAcceptedError, MAX_BOOKING_NOTE, ValidationError } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { bookingRefusal } from './bookingRefusals';

describe('bookingRefusal', () => {
  it('says a branch that takes no app bookings in the same words as the place page', () => {
    const error = Object.assign(Object.create(BookingsNotAcceptedError.prototype), {
      message: 'bookings-not-accepted',
    }) as BookingsNotAcceptedError;

    expect(bookingRefusal(error)).toEqual({ key: 'place.bookingsOff.body', params: {} });
  });

  it('names the note and its limit when the note is too long', () => {
    const error = Object.assign(Object.create(ValidationError.prototype), {
      field: 'Note',
      violations: [],
    }) as ValidationError;

    expect(bookingRefusal(error)).toEqual({
      key: 'booking.note.tooLong',
      params: { max: MAX_BOOKING_NOTE },
    });
  });

  it('leaves every other failure to bookingFailure', () => {
    const other = Object.assign(Object.create(ValidationError.prototype), {
      field: 'guestName',
      violations: [{ field: 'guestName' }],
    }) as ValidationError;

    expect(bookingRefusal(other)).toBeNull();
    expect(bookingRefusal(new Error('network'))).toBeNull();
  });
});
