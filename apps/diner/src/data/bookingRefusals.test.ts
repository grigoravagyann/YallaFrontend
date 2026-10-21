import {
  BookingNotChangeableError,
  BookingOverlapsOwnError,
  ConcurrencyConflictError,
  BookingsNotAcceptedError,
  MAX_BOOKING_NOTE,
  PreOrderAlreadySentError,
  ValidationError,
  bookingFailure,
  type BookingFailure,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { bookingRefusal, changeFailureLine, overlapsOwnLine } from './bookingRefusals';

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

  it('says a change of a request whose answer window has closed is too late', () => {
    const error = new ConcurrencyConflictError({
      url: '/api/reservations/r1/reschedule',
      problem: {
        type: 'about:blank',
        title: 'Too late to answer this booking',
        status: 409,
        detail: 'The answer window for LM7Q closed at 18:15.',
        code: 'reservation-approval-expired',
        traceId: 't',
      },
    });

    expect(bookingRefusal(error)).toEqual({
      key: 'book.changeError.approvalExpired',
      params: {},
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

  it('says a pre-order already in the kitchen, and to call the venue', () => {
    const error = new PreOrderAlreadySentError({ url: '/api/reservations/r-1/reschedule' });
    expect(changeFailureLine(bookingFailure(error, 'Asia/Yerevan', 'en'), error)).toEqual({
      key: 'book.changeError.preOrderSent',
      params: {},
    });
  });

  it('keeps every other line, which is as true of a move as of a new booking', () => {
    const busy: BookingFailure = { kind: 'busy', line: { key: 'confirm.error.busy', params: {} } };
    expect(changeFailureLine(busy)).toEqual({ key: 'confirm.error.busy', params: {} });
  });
});

describe('overlapsOwnLine', () => {
  const overlap = (localDate: string | null, tableLabel: string | null = '2') =>
    new BookingOverlapsOwnError({
      url: '/api/reservations',
      existingReservationId: 'r-own',
      localStartTime: '23:30',
      localDate,
      tableLabel,
    });
  // 00:15 on the 21st in Yerevan: last night's 23:30 sitting overlaps it.
  const slotUtc = '2026-10-20T20:15:00Z';
  const zone = 'Asia/Yerevan';

  it('names the time and table when the booking held is on the same day', () => {
    expect(overlapsOwnLine(overlap('2026-10-21'), slotUtc, zone, 'en')).toEqual({
      key: 'confirm.error.overlapsOwn',
      params: { time: '23:30', table: '2' },
    });
    expect(overlapsOwnLine(overlap(null), slotUtc, zone, 'en').key).toBe(
      'confirm.error.overlapsOwn',
    );
  });

  it('names its day too when it is on another one', () => {
    const line = overlapsOwnLine(overlap('2026-10-20'), slotUtc, zone, 'en');
    expect(line.key).toBe('confirm.error.overlapsOwnOn');
    expect(line.params).toMatchObject({ time: '23:30', table: '2' });
    expect(String(line.params['date'])).toMatch(/20/u);
    expect(overlapsOwnLine(overlap('2026-10-20', null), slotUtc, zone, 'en').key).toBe(
      'confirm.error.overlapsOwnOnPlain',
    );
  });

  it('says the time alone, or the generic line, when that is all it has', () => {
    expect(overlapsOwnLine(overlap('2026-10-21', null), slotUtc, zone, 'en')).toEqual({
      key: 'confirm.error.overlapsOwnPlain',
      params: { time: '23:30' },
    });
    const noTime = new BookingOverlapsOwnError({
      url: '/api/reservations',
      existingReservationId: null,
      localStartTime: null,
      tableLabel: null,
    });
    expect(overlapsOwnLine(noTime, slotUtc, zone, 'en').key).toBe('confirm.error.generic');
  });
});

/*
 * Guest record (2026-10-20): no two of one guest's sittings overlap anywhere,
 * and at another venue they need half an hour between them — so the refusal
 * names the other place, with its day when that is another one.
 */
describe('overlapsOwnLine, a booking held at another place', () => {
  const elsewhere = (localDate: string | null, branchName = 'Main') =>
    new BookingOverlapsOwnError({
      url: '/api/reservations',
      existingReservationId: 'r-aram',
      localStartTime: '23:30',
      localDate,
      tableLabel: '4',
      venueName: 'Café Aram',
      branchName,
    });
  const slotUtc = '2026-10-20T20:15:00Z';
  const zone = 'Asia/Yerevan';
  const here = { venueName: 'Lumen Coffee', branchName: 'Northern Avenue' };

  it('names the venue and the time, never a table there', () => {
    expect(overlapsOwnLine(elsewhere('2026-10-21'), slotUtc, zone, 'en', here)).toEqual({
      key: 'confirm.error.overlapsOwnElsewhere',
      params: { venue: 'Café Aram', time: '23:30' },
    });
  });

  it('names its day too when it is on another one', () => {
    const line = overlapsOwnLine(elsewhere('2026-10-20'), slotUtc, zone, 'en', here);
    expect(line.key).toBe('confirm.error.overlapsOwnElsewhereOn');
    expect(line.params).toMatchObject({ venue: 'Café Aram', time: '23:30' });
    expect(String(line.params['date'])).toMatch(/20/u);
  });

  it('names the branch when it is another branch of the venue being booked', () => {
    const line = overlapsOwnLine(elsewhere('2026-10-21', 'Cascade'), slotUtc, zone, 'en', {
      venueName: 'Café Aram',
      branchName: 'Main',
    });
    expect(line).toEqual({
      key: 'confirm.error.overlapsOwnElsewhere',
      params: { venue: 'Café Aram, Cascade', time: '23:30' },
    });
  });

  it('says "here" for the place being booked, and when the place is not known', () => {
    expect(
      overlapsOwnLine(elsewhere('2026-10-21'), slotUtc, zone, 'en', {
        venueName: 'Café Aram',
        branchName: 'Main',
      }).key,
    ).toBe('confirm.error.overlapsOwn');
    expect(overlapsOwnLine(elsewhere('2026-10-21'), slotUtc, zone, 'en').key).toBe(
      'confirm.error.overlapsOwn',
    );
  });
});
