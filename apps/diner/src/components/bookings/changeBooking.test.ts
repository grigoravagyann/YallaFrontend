import type { Booking } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  canChangeBooking,
  changeBookingRoute,
  isUnchanged,
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
});

describe('changeBookingRoute', () => {
  it('opens the booking screen on the booking’s own day, time, party and table', () => {
    expect(changeBookingRoute(BOOKING)).toEqual({
      pathname: '/book/[placeId]',
      params: {
        placeId: 'b-lumen-north',
        bookingId: 'r-1',
        // In the branch's calendar and clock, not the phone's.
        date: '2026-10-18',
        time: '19:30',
        party: '4',
        tableId: 't-4',
        tableLabel: '4',
      },
    });
  });

  it('reads the branch’s calendar across midnight UTC', () => {
    // 01:30 on the 19th in Yerevan is still the 18th in UTC.
    const late = changeBookingRoute({ ...BOOKING, slotUtc: '2026-10-18T21:30:00Z' });
    expect(late.params.date).toBe('2026-10-19');
    expect(late.params.time).toBe('01:30');
  });
});

describe('parseChangeParams', () => {
  it('is a fresh booking without a booking id', () => {
    expect(parseChangeParams({})).toBeNull();
    expect(parseChangeParams({ bookingId: ' ', date: '2026-10-18' })).toBeNull();
  });

  it('reads back exactly what changeBookingRoute wrote', () => {
    expect(parseChangeParams(changeBookingRoute(BOOKING).params)).toEqual({
      bookingId: 'r-1',
      date: '2026-10-18',
      time: '19:30',
      partySize: 4,
      tableId: 't-4',
    });
  });

  it('leaves a param that does not read right unknown, rather than guessing', () => {
    expect(
      parseChangeParams({
        bookingId: 'r-1',
        date: '18.10.2026',
        time: '25:00',
        party: '0',
        tableId: '',
      }),
    ).toEqual({ bookingId: 'r-1', date: null, time: null, partySize: null, tableId: null });
    expect(parseChangeParams({ bookingId: 'r-1', party: '2.5' })?.partySize).toBeNull();
  });
});

describe('isUnchanged', () => {
  const original = parseChangeParams(changeBookingRoute(BOOKING).params)!;
  const same = { date: '2026-10-18', time: '19:30', partySize: 4, tableId: 't-4' };

  it('is unchanged only when the day, time, party and table are all the same', () => {
    expect(isUnchanged(original, same)).toBe(true);
    expect(isUnchanged(original, { ...same, date: '2026-10-19' })).toBe(false);
    expect(isUnchanged(original, { ...same, time: '20:00' })).toBe(false);
    expect(isUnchanged(original, { ...same, partySize: 2 })).toBe(false);
    expect(isUnchanged(original, { ...same, tableId: 't-5' })).toBe(false);
  });

  it('counts a choice the route could not say as a change', () => {
    const blind = parseChangeParams({ bookingId: 'r-1' })!;
    expect(isUnchanged(blind, same)).toBe(false);
  });
});
