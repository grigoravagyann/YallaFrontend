import type { FloorTable, StaffTableDetail } from '@yalla/api';
import { i18next } from '@yalla/i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { tableCardText, tableTone } from './tableCard';

/**
 * The words on a table card, from what the floor read carries (the Main
 * artboard's `stOf`). Pure, so every state and every edge of "long" is pinned
 * without a tablet.
 */

const NOW = new Date('2026-10-19T15:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const minutesOn = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

function table(overrides: Partial<FloorTable> = {}): FloorTable {
  return {
    id: 't4',
    label: '4',
    seats: 4,
    floorAreaId: 'bar',
    floorAreaName: 'Bar',
    floorAreaDisplayOrder: 0,
    isBookable: true,
    state: 'free',
    nextReservationStartUtc: null,
    occupiedSinceUtc: null,
    pin: null,
    ...overrides,
  };
}

function detail(overrides: Partial<StaffTableDetail> = {}): StaffTableDetail {
  return {
    tableId: 't4',
    label: '4',
    seats: 4,
    physicalStatus: 'free',
    currentSessionId: null,
    seatedAtUtc: null,
    partySize: null,
    nextReservationId: null,
    nextReservationStartUtc: null,
    nextReservationPartySize: null,
    freeUntilUtc: null,
    openTabId: null,
    rowVersion: 'v1',
    ...overrides,
  };
}

function card(t: FloorTable, d?: StaffTableDetail, debt: string | null = null) {
  return tableCardText({
    table: t,
    detail: d,
    debt,
    now: NOW,
    t: i18next.t.bind(i18next),
    // The clock as a plain HH:MM in UTC is enough to see which instant was used.
    time: (iso) => iso.slice(11, 16),
    minutesSince: (iso) => Math.round((NOW.getTime() - Date.parse(iso)) / 60_000),
  });
}

beforeAll(async () => {
  await initConsoleTestI18n();
  await i18next.loadNamespaces(['staff', 'common']);
  i18next.setDefaultNamespace('staff');
});

describe('a free table', () => {
  it('says free and nothing else', () => {
    expect(card(table())).toEqual({ state: 'Free', sub: null, long: false });
  });

  it('says it is walk-ins only when the venue never books it', () => {
    expect(card(table({ isBookable: false })).sub).toBe('walk-ins only');
  });

  it('says what is still owed after it was freed, before anything else', () => {
    expect(card(table({ isBookable: false }), undefined, '֏ 12,400').sub).toBe(
      '֏ 12,400 still owed',
    );
  });
});

describe('a booked or held table', () => {
  it('says in green that the next guest is on their way, so nobody calls (2026-10-21)', () => {
    const t = table({ state: 'reservedSoon', nextReservationStartUtc: '2026-10-19T15:30:00Z' });
    const onTheWay = detail({ nextReservationGuestConfirmedOnWayAtUtc: '2026-10-19T15:02:00Z' });
    expect(card(t, onTheWay)).toMatchObject({ flag: 'On their way', flagTone: 'ok' });
    // Good news wins the one flag over a number not verified; the panel says both.
    expect(card(t, { ...onTheWay, nextReservationPhoneUnverified: true })).toMatchObject({
      flag: 'On their way',
      flagTone: 'ok',
    });
    expect(card(t, detail({ nextReservationPhoneUnverified: true }))).toMatchObject({
      flag: 'number not verified',
      flagTone: 'warn',
    });
    // Not on a table whose party is already sitting.
    expect(
      card(table({ state: 'occupied', occupiedSinceUtc: minutesAgo(10) }), onTheWay).flag,
    ).toBeUndefined();
  });

  it('says when the booking is, and the party when the server sends it', () => {
    const t = table({ state: 'reservedSoon', nextReservationStartUtc: '2026-10-19T15:30:00Z' });
    expect(card(t, detail({ nextReservationPartySize: 3 }))).toEqual({
      state: 'Reserved 15:30',
      sub: '3 guests',
      long: false,
    });
  });

  it('says in words that a booking whose time has passed is late (live QA)', () => {
    const t = table({ state: 'reservedSoon', nextReservationStartUtc: minutesAgo(99) });
    expect(card(t, detail({ nextReservationPartySize: 2 }))).toEqual({
      state: 'Late · booked 13:21',
      sub: '2 guests',
      long: false,
      late: true,
    });
    // At the minute itself it is not late yet.
    expect(
      card(table({ state: 'reservedSoon', nextReservationStartUtc: minutesAgo(0) })).late,
    ).toBeFalsy();
  });

  it('says a held table is running late, with the booking time from the detail first', () => {
    const t = table({ state: 'held', nextReservationStartUtc: '2026-10-19T14:30:00Z' });
    expect(card(t, detail({ nextReservationStartUtc: '2026-10-19T14:45:00Z' }))).toEqual({
      state: 'Held · running late',
      sub: 'booked for 14:45',
      long: false,
    });
    expect(card(t).sub).toBe('booked for 14:30');
    expect(card(table({ state: 'held' })).sub).toBeNull();
  });
});

describe('an occupied table', () => {
  const seated = (since: number) =>
    table({ state: 'occupied', occupiedSinceUtc: minutesAgo(since) });

  it('says how long the party has sat, and how many', () => {
    expect(card(seated(48), detail({ partySize: 2 }))).toEqual({
      state: 'Seated 48 min',
      sub: '2 guests',
      long: false,
    });
  });

  it('says "occupied" when the server sent no seating time', () => {
    expect(card(table({ state: 'occupied' })).state).toBe('Occupied');
  });

  it('is long once the next booking needs the table and the party sat down before that', () => {
    const result = card(seated(130), detail({ freeUntilUtc: minutesAgo(10) }));
    expect(result).toMatchObject({ state: 'Seated 130 min · long', long: true });
  });

  it('is long once the party is past the time it promised to leave by', () => {
    const result = card(seated(90), detail({ sittingPromisedFreeByUtc: minutesAgo(1) }));
    expect(result.long).toBe(true);
  });

  it('is not long while both times are still ahead', () => {
    const result = card(
      seated(90),
      detail({ freeUntilUtc: minutesOn(20), sittingPromisedFreeByUtc: minutesOn(5) }),
    );
    expect(result).toMatchObject({ state: 'Seated 90 min', long: false });
  });

  // A walk-in seated after the turnaround had already begun has not overstayed
  // anything: the booking is the one at risk, which the waiter chose.
  it('is not long for a party that sat down after the next booking needed the table', () => {
    const result = card(seated(5), detail({ freeUntilUtc: minutesAgo(10) }));
    expect(result).toMatchObject({ state: 'Seated 5 min', long: false });
  });
});

describe('an out-of-service table', () => {
  it('says so, in its own tone', () => {
    expect(card(table({ state: 'outOfService' }))).toEqual({
      state: 'Out of service',
      sub: null,
      long: false,
    });
    expect(tableTone('outOfService')).toBe('out');
    expect(tableTone('held')).toBe('held');
  });
});
