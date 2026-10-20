import {
  BookingBlockedNoShowsError,
  NEW_GUEST_RECORD,
  bookingFailure,
  type GuestRecord,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { blockedLine, blockedUntil, pauseRefusalLine, recordCopy } from './guestRecord';

/**
 * The guest's own record on the phone (guest record, 2026-10-20): how they
 * kept their bookings over twelve months — what every venue they book with
 * sees — and the week's pause after three no-shows in three days.
 */

const record = (overrides: Partial<GuestRecord> = {}): GuestRecord => ({
  booked: 12,
  came: 11,
  noShows: 0,
  lateCancellations: 0,
  unmarked: 0,
  isNewGuest: false,
  blockedUntilUtc: null,
  ...overrides,
});

describe('the record line', () => {
  it('says nothing when the server sent no record', () => {
    expect(recordCopy(null)).toBeNull();
    expect(recordCopy(undefined)).toBeNull();
  });

  it('is a neutral line for a new guest, never a warning', () => {
    expect(recordCopy(NEW_GUEST_RECORD)).toEqual({
      main: { key: 'bookings.record.new', params: {} },
      extras: [],
    });
  });

  it('says how often the guest came, out of how many — plural by the bookings', () => {
    expect(recordCopy(record())).toEqual({
      main: { key: 'bookings.record.came', params: { came: 11, count: 12 } },
      extras: [],
    });
    expect(recordCopy(record({ booked: 1, came: 1 }))?.main.params).toEqual({ came: 1, count: 1 });
  });

  it('adds missed bookings, late cancellations and unmarked ones only when there are any', () => {
    expect(
      recordCopy(record({ came: 8, noShows: 1, lateCancellations: 2, unmarked: 1 }))?.extras,
    ).toEqual([
      { key: 'bookings.record.noShows', params: { count: 1 } },
      { key: 'bookings.record.lateCancellations', params: { count: 2 } },
      { key: 'bookings.record.unmarked', params: { count: 1 } },
    ]);
    expect(recordCopy(record({ came: 10, lateCancellations: 2 }))?.extras).toEqual([
      { key: 'bookings.record.lateCancellations', params: { count: 2 } },
    ]);
  });
});

describe('the no-show pause', () => {
  const now = new Date('2026-10-20T12:00:00Z');

  it('holds while its end is ahead, and not once it has passed or when there is none', () => {
    expect(blockedUntil(record({ blockedUntilUtc: '2026-10-27T09:30:00Z' }), now)).toBe(
      '2026-10-27T09:30:00Z',
    );
    expect(blockedUntil(record({ blockedUntilUtc: '2026-10-20T11:59:00Z' }), now)).toBeNull();
    expect(blockedUntil(record(), now)).toBeNull();
    expect(blockedUntil(null, now)).toBeNull();
  });

  it('is said with its end, day and time, in the zone given', () => {
    const line = blockedLine('2026-10-27T09:30:00Z', 'Asia/Yerevan', 'en');
    expect(line.key).toBe('confirm.error.blockedNoShows');
    expect(line.params['time']).toBe('13:30');
    expect(String(line.params['date'])).toMatch(/27/u);
  });

  // Review round 2 (N4): the server's 403, said on the phone's clock like
  // the note and the banner — not the venue's, as the shared copy has it.
  it('words the server’s refusal on the phone’s clock, and leaves any other failure be', () => {
    const refused = bookingFailure(
      new BookingBlockedNoShowsError({ url: '/x', blockedUntilUtc: '2026-10-27T09:30:00Z' }),
      'Asia/Yerevan',
      'en',
    );
    expect(pauseRefusalLine(refused, 'en', 'UTC')?.params['time']).toBe('09:30');
    expect(pauseRefusalLine(refused, 'en', 'Asia/Yerevan')?.params['time']).toBe('13:30');
    expect(
      pauseRefusalLine(bookingFailure(new Error('x'), 'Asia/Yerevan', 'en'), 'en', 'UTC'),
    ).toBeNull();
    const plain = bookingFailure(
      new BookingBlockedNoShowsError({ url: '/x', blockedUntilUtc: null }),
      'Asia/Yerevan',
      'en',
    );
    expect(pauseRefusalLine(plain, 'en', 'UTC')).toBeNull();
  });
});
