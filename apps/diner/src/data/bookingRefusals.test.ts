import {
  BookingNotChangeableError,
  BookingsNotAcceptedError,
  MAX_BOOKING_NOTE,
  ValidationError,
  bookingFailure,
  type BookingFailure,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { bookingRefusal, changeFailureLine } from './bookingRefusals';

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

  it('says a booking that can no longer move in words of its own', () => {
    const error = new BookingNotChangeableError({
      url: '/api/reservations/r1/reschedule',
      reservationId: 'r1',
    });

    expect(bookingRefusal(error)).toEqual({ key: 'book.changeError.notChangeable', params: {} });
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

describe('changeFailureLine', () => {
  it('never says "nothing was booked" of a booking that already exists', () => {
    const generic = bookingFailure(new Error('teapot'), 'Asia/Yerevan', 'en');
    expect(generic.kind).toBe('generic');
    expect(changeFailureLine(generic)).toEqual({ key: 'book.changeError.generic', params: {} });

    const unknown: BookingFailure = {
      kind: 'unknown',
      line: { key: 'confirm.error.unknownOutcome', params: {} },
    };
    expect(changeFailureLine(unknown)).toEqual({
      key: 'book.changeError.unknownOutcome',
      params: {},
    });
  });

  it('keeps every other line, which is as true of a move as of a new booking', () => {
    const busy: BookingFailure = { kind: 'busy', line: { key: 'confirm.error.busy', params: {} } };
    expect(changeFailureLine(busy)).toEqual({ key: 'confirm.error.busy', params: {} });
  });
});
