import { ReservationNotStartedError } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { bookingActionFailureText } from './bookingActionFailure';

const copy = {
  moved: 'moved',
  tableTaken: 'tableTaken',
  sittingChanged: 'sittingChanged',
  tableCannot: 'tableCannot',
  notStarted: 'notStarted',
  forbidden: 'forbidden',
  gone: 'gone',
  offline: 'offline',
  generic: 'generic',
};

describe('a row action refused', () => {
  it('says a no-show waits for the booking to start, not that somebody moved it (FT2 wire)', () => {
    const error = new ReservationNotStartedError({
      url: '/api/reservations/r-1/no-show',
      startUtc: '2026-10-21T15:00:00Z',
    });
    expect(bookingActionFailureText(error, copy)).toBe('notStarted');
  });
});
