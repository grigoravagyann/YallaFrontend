import type { Booking } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  anotherTimeRoute,
  canChangeBooking,
  changeBookingRoute,
  isUnchanged,
  parseAnotherTimeParams,
  parseChangeParams,
} from './changeBooking';

const BOOKING = {
  id: 'r-1',
  branchId: 'b-lumen-north',
  status: 'confirmed',
  // 19:30 on 18 October in Yerevan.
  slotUtc: '2026-10-18T15:30:00Z',
  timeZoneId: 'Asia/Yerevan',
  partySize: 4,
  tableId: 't-4',
  tableLabel: '4',
} as Booking;

describe('canChangeBooking', () => {
  const before = new Date('2026-10-18T12:00:00Z');

  it('allows a waiting or confirmed booking that has not started', () => {
    expect(canChangeBooking(BOOKING, before)).toBe(true);
    expect(canChangeBooking({ ...BOOKING, status: 'pendingApproval' }, before)).toBe(true);
  });

  it('refuses once it has started, or once it is anything else', () => {
    expect(canChangeBooking(BOOKING, new Date('2026-10-18T15:30:00Z'))).toBe(false);
    for (const status of ['seated', 'completed', 'cancelledByDiner', 'noShow'] as const) {
      expect(canChangeBooking({ ...BOOKING, status }, before)).toBe(false);
    }
  });

  it('never offers to move a booking made by time only — cancel and book again', () => {
    expect(canChangeBooking({ ...BOOKING, bookedWithoutTable: true }, before)).toBe(false);
    expect(canChangeBooking({ ...BOOKING, tableLabel: null }, before)).toBe(false);
  });

  it('closes once the booking is inside the branch’s lead time', () => {
    // 45 minutes before the 19:30 start.
    const soon = new Date('2026-10-18T14:45:00Z');
    expect(canChangeBooking(BOOKING, soon, 30)).toBe(true);
    // Exactly the lead away is still a time the picker offers.
    expect(canChangeBooking(BOOKING, soon, 45)).toBe(true);
    expect(canChangeBooking(BOOKING, soon, 60)).toBe(false);
    // No lead: only the start closes it.
    expect(canChangeBooking(BOOKING, new Date('2026-10-18T15:29:00Z'), 0)).toBe(true);
  });
});

describe('changeBookingRoute', () => {
  it('opens the booking screen on the booking’s own instant, party and table', () => {
    expect(changeBookingRoute(BOOKING)).toEqual({
      pathname: '/book/[placeId]',
      params: {
        placeId: 'b-lumen-north',
        bookingId: 'r-1',
        slotUtc: '2026-10-18T15:30:00Z',
        party: '4',
        tableId: 't-4',
        tableLabel: '4',
      },
    });
  });

  it('carries a late-night booking as its instant, not as a date and a clock', () => {
    // 00:30 on the 19th in Yerevan: the evening of the 18th at a bar. A
    // calendar date and "00:30" could not say which night it is.
    const late = changeBookingRoute({ ...BOOKING, slotUtc: '2026-10-18T20:30:00Z' });
    expect(late.params.slotUtc).toBe('2026-10-18T20:30:00Z');
    expect(late.params).not.toHaveProperty('date');
    expect(late.params).not.toHaveProperty('time');
  });
});

describe('parseChangeParams', () => {
  it('is a fresh booking without a booking id', () => {
    expect(parseChangeParams({})).toBeNull();
    expect(parseChangeParams({ bookingId: ' ', slotUtc: '2026-10-18T15:30:00Z' })).toBeNull();
  });

  it('reads back exactly what changeBookingRoute wrote', () => {
    expect(parseChangeParams(changeBookingRoute(BOOKING).params)).toEqual({
      bookingId: 'r-1',
      slotUtc: '2026-10-18T15:30:00.000Z',
      partySize: 4,
      tableId: 't-4',
    });
  });

  it('reads an instant with an offset as the same instant', () => {
    expect(
      parseChangeParams({ bookingId: 'r-1', slotUtc: '2026-10-18T19:30:00+04:00' })?.slotUtc,
    ).toBe('2026-10-18T15:30:00.000Z');
  });

  it('leaves a param that does not read right unknown, rather than guessing', () => {
    expect(
      parseChangeParams({
        bookingId: 'r-1',
        slotUtc: '2026-10-18',
        party: '0',
        tableId: '',
      }),
    ).toEqual({ bookingId: 'r-1', slotUtc: null, partySize: null, tableId: null });
    // A clock without a zone is no instant.
    expect(
      parseChangeParams({ bookingId: 'r-1', slotUtc: '2026-10-18T19:30:00' })?.slotUtc,
    ).toBeNull();
    expect(parseChangeParams({ bookingId: 'r-1', slotUtc: 'tonight' })?.slotUtc).toBeNull();
    expect(parseChangeParams({ bookingId: 'r-1', party: '2.5' })?.partySize).toBeNull();
  });
});

describe('isUnchanged', () => {
  const original = parseChangeParams(changeBookingRoute(BOOKING).params)!;
  const same = { slotUtc: '2026-10-18T15:30:00.000Z', partySize: 4, tableId: 't-4' };

  it('is unchanged only when the instant, party and table are all the same', () => {
    expect(isUnchanged(original, same)).toBe(true);
    // The same instant written another way is the same time.
    expect(isUnchanged(original, { ...same, slotUtc: '2026-10-18T19:30:00+04:00' })).toBe(true);
    expect(isUnchanged(original, { ...same, slotUtc: '2026-10-19T15:30:00.000Z' })).toBe(false);
    expect(isUnchanged(original, { ...same, slotUtc: '2026-10-18T16:00:00.000Z' })).toBe(false);
    expect(isUnchanged(original, { ...same, partySize: 2 })).toBe(false);
    expect(isUnchanged(original, { ...same, tableId: 't-5' })).toBe(false);
  });

  it('tells two nights’ 00:30 apart', () => {
    // 00:30 on the 19th, and 00:30 on the 18th: the same clock reading.
    const late = parseChangeParams({
      bookingId: 'r-1',
      slotUtc: '2026-10-18T20:30:00Z',
      party: '4',
      tableId: 't-4',
    })!;
    expect(isUnchanged(late, { ...same, slotUtc: '2026-10-17T20:30:00Z' })).toBe(false);
    expect(isUnchanged(late, { ...same, slotUtc: '2026-10-18T20:30:00Z' })).toBe(true);
  });

  it('counts no time chosen, or a time the route could not say, as a change', () => {
    expect(isUnchanged(original, { ...same, slotUtc: null })).toBe(false);
    const blind = parseChangeParams({ bookingId: 'r-1' })!;
    expect(isUnchanged(blind, same)).toBe(false);
  });
});

describe('anotherTimeRoute', () => {
  it('opens a new booking at the same place, on the declined booking’s day and party', () => {
    expect(anotherTimeRoute(BOOKING)).toEqual({
      pathname: '/book/[placeId]',
      params: { placeId: 'b-lumen-north', dayOf: '2026-10-18T15:30:00Z', party: '4' },
    });
  });

  it('carries no booking, time or table: it is a new booking, not a change', () => {
    const { params } = anotherTimeRoute(BOOKING);
    expect(params).not.toHaveProperty('bookingId');
    expect(params).not.toHaveProperty('slotUtc');
    expect(params).not.toHaveProperty('tableId');
    expect(parseChangeParams(params)).toBeNull();
  });
});

describe('parseAnotherTimeParams', () => {
  it('reads the day’s instant and the party back', () => {
    expect(parseAnotherTimeParams({ dayOf: '2026-10-18T15:30:00Z', party: '4' })).toEqual({
      dayOfUtc: '2026-10-18T15:30:00.000Z',
      partySize: 4,
    });
  });

  it('leaves unknown what does not read as itself, and is nothing in change mode', () => {
    expect(parseAnotherTimeParams({ dayOf: '2026-10-18', party: 'four' })).toEqual({
      dayOfUtc: null,
      partySize: null,
    });
    expect(parseAnotherTimeParams({})).toBeNull();
    expect(
      parseAnotherTimeParams({ bookingId: 'r-1', dayOf: '2026-10-18T15:30:00Z', party: '4' }),
    ).toBeNull();
  });
});
