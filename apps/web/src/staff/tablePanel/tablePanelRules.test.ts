import type { DuePreOrder, StaffTableDetail } from '@yalla/api';
import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import {
  ASK_WINDOW_MINUTES,
  MAX_PARTY,
  askWindowOpen,
  bookedParty,
  clampParty,
  lateMinutes,
  lateText,
  nextBookingText,
  physicalFrom,
  preOrderPartyFor,
} from './tablePanelRules';

/** A `t` that says which key it was asked for, and with what. */
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key) as unknown as TFunction;

const START = '2026-10-26T19:00:00Z';
/** A clock on which the booking started `minutes` ago (negative: still ahead). */
const since = (minutes: number) => (utc: string) => (utc === START ? minutes : 0);

describe('clampParty', () => {
  it('keeps a party between one and the server bound', () => {
    expect(clampParty(0)).toBe(1);
    expect(clampParty(-3)).toBe(1);
    expect(clampParty(6)).toBe(6);
    expect(clampParty(MAX_PARTY + 1)).toBe(MAX_PARTY);
  });
});

describe('bookedParty', () => {
  it("sends the booking's party only when the server said it", () => {
    expect(bookedParty({ nextReservationPartySize: 4 } as StaffTableDetail)).toEqual({
      partySize: 4,
    });
    expect(bookedParty({ nextReservationPartySize: null } as StaffTableDetail)).toEqual({});
    expect(bookedParty(undefined)).toEqual({});
  });
});

describe('physicalFrom', () => {
  it('reads the physical status from the drawn state, a booking soon being a free table', () => {
    expect(physicalFrom('occupied')).toBe('occupied');
    expect(physicalFrom('held')).toBe('held');
    expect(physicalFrom('outOfService')).toBe('outOfService');
    expect(physicalFrom('reservedSoon')).toBe('free');
    expect(physicalFrom('free')).toBe('free');
  });
});

describe('lateMinutes', () => {
  it('is the minutes since the start, once the booking is due', () => {
    expect(lateMinutes(START, since(12))).toBe(12);
  });

  it('is nothing before the start, at it, or with no booking', () => {
    expect(lateMinutes(START, since(-5))).toBeNull();
    expect(lateMinutes(START, since(0))).toBeNull();
    expect(lateMinutes(null, since(12))).toBeNull();
    expect(lateMinutes(undefined, since(12))).toBeNull();
  });
});

describe('askWindowOpen', () => {
  const base = {
    reservationId: 'r1',
    bookingStart: START,
    preOrderReservationId: undefined,
    awaiting: false,
    status: 'free' as const,
    runningLateMinutes: null,
  };

  it('opens two hours before the start and closes at it', () => {
    expect(askWindowOpen({ ...base, minutesSince: since(-ASK_WINDOW_MINUTES) })).toBe(true);
    expect(askWindowOpen({ ...base, minutesSince: since(-1) })).toBe(true);
    expect(askWindowOpen({ ...base, minutesSince: since(-ASK_WINDOW_MINUTES - 1) })).toBe(false);
    expect(askWindowOpen({ ...base, minutesSince: since(0) })).toBe(false);
  });

  it("stays open after the start while the guest's running late has not run out", () => {
    const late = { ...base, runningLateMinutes: 15 };
    expect(askWindowOpen({ ...late, minutesSince: since(14) })).toBe(true);
    expect(askWindowOpen({ ...late, minutesSince: since(15) })).toBe(false);
  });

  it('is not offered beside its pre-order card, for an awaiting booking or a broken table', () => {
    const now = since(-30);
    expect(askWindowOpen({ ...base, minutesSince: now })).toBe(true);
    expect(askWindowOpen({ ...base, preOrderReservationId: 'r1', minutesSince: now })).toBe(false);
    expect(askWindowOpen({ ...base, preOrderReservationId: 'r2', minutesSince: now })).toBe(true);
    expect(askWindowOpen({ ...base, awaiting: true, minutesSince: now })).toBe(false);
    expect(askWindowOpen({ ...base, status: 'outOfService', minutesSince: now })).toBe(false);
    expect(askWindowOpen({ ...base, reservationId: null, minutesSince: now })).toBe(false);
    expect(askWindowOpen({ ...base, bookingStart: null, minutesSince: now })).toBe(false);
  });
});

describe('preOrderPartyFor', () => {
  const preOrder = { reservationId: 'r1', status: 'confirmed' } as DuePreOrder;

  it("is the pre-order of this table's confirmed next booking", () => {
    expect(preOrderPartyFor(preOrder, 'r1')).toBe(preOrder);
  });

  it("is nothing for another booking's, an unconfirmed one, or none", () => {
    expect(preOrderPartyFor(preOrder, 'r2')).toBeNull();
    expect(preOrderPartyFor(preOrder, null)).toBeNull();
    expect(preOrderPartyFor({ ...preOrder, status: 'pendingApproval' }, 'r1')).toBeNull();
    expect(preOrderPartyFor(null, 'r1')).toBeNull();
    expect(preOrderPartyFor(undefined, 'r1')).toBeNull();
  });
});

describe('lateText', () => {
  it('says minutes under an hour, and hours and minutes from one', () => {
    expect(lateText(t, 20)).toBe('table.lateFor {"count":20}');
    expect(lateText(t, 60)).toBe('table.lateForHours {"hours":1,"minutes":0}');
    expect(lateText(t, 99)).toBe('table.lateForHours {"hours":1,"minutes":39}');
  });
});

describe('nextBookingText', () => {
  it('is a bare time today, and dated on any other day', () => {
    expect(nextBookingText(t, { day: 'today', time: '20:00', date: 'Mon 26 Oct' })).toBe('20:00');
    expect(nextBookingText(t, { day: 'tomorrow', time: '20:00', date: 'Tue 27 Oct' })).toBe(
      'table.nextBookingTomorrow {"time":"20:00"}',
    );
    expect(nextBookingText(t, { day: 'other', time: '20:00', date: 'Sun 1 Nov' })).toBe(
      'table.nextBookingOn {"date":"Sun 1 Nov","time":"20:00"}',
    );
  });
});
