import type { FloorTable, TableAvailability } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import type { OpeningHours, PlaceRoom, TablePhotoMarker } from '../places/model';
import {
  PARTY_MAX,
  anyRequestIn,
  initialPartySize,
  partyFits,
  preferredTable,
  resolveChosenTable,
  slotRoomsFor,
  soonCandidateFor,
} from './formRules';
import { positiveInt } from './params';

const YEREVAN = 'Asia/Yerevan';

function marker(tableId: string, extra: Partial<TablePhotoMarker> = {}): TablePhotoMarker {
  return {
    tableId,
    label: tableId,
    status: 'free',
    isBookable: true,
    capacityMin: 2,
    capacityMax: 4,
    x: 0.5,
    y: 0.5,
    ...extra,
  };
}

function availability(tableId: string, extra: Partial<TableAvailability> = {}): TableAvailability {
  return {
    tableId,
    tableLabel: tableId,
    floorAreaName: null,
    seats: 4,
    isBookable: true,
    unavailableReason: null,
    window: null,
    freeCancellationUntilUtc: null,
    requiresApproval: false,
    ...extra,
  };
}

function floorTable(id: string, photoId: string | null): FloorTable {
  return {
    id,
    label: id,
    seats: 4,
    floorAreaId: null,
    floorAreaName: null,
    floorAreaDisplayOrder: 0,
    isBookable: true,
    state: 'free',
    nextReservationStartUtc: null,
    pin: photoId ? { photoId, x: 0.2, y: 0.3 } : null,
  };
}

const photo = (photoId: string, tables: readonly TablePhotoMarker[] = []) => ({
  photoId,
  url: `https://api/${photoId}/f`,
  thumbUrl: `https://api/${photoId}/t`,
  width: 1600,
  height: 1200,
  tables,
});

describe('positiveInt', () => {
  it('reads a whole number above zero', () => {
    expect(positiveInt('4')).toBe(4);
  });

  it('refuses nothing, zero, negatives, fractions and words', () => {
    expect(positiveInt(undefined)).toBeNull();
    expect(positiveInt('0')).toBeNull();
    expect(positiveInt('-2')).toBeNull();
    expect(positiveInt('2.5')).toBeNull();
    expect(positiveInt('four')).toBeNull();
  });
});

describe('resolveChosenTable', () => {
  const tables = [marker('t1', { label: '7', capacityMin: 2, capacityMax: 6 }), marker('t2')];

  it('is nothing until a table is picked', () => {
    expect(resolveChosenTable(null, {}, tables)).toBeNull();
  });

  it("takes the route's label and seats for the table the diner came with", () => {
    const chosen = resolveChosenTable(
      't1',
      { tableId: 't1', tableLabel: 'Window', capacityMin: '3', capacityMax: '5' },
      tables,
    );
    expect(chosen).toMatchObject({
      tableId: 't1',
      label: 'Window',
      capacityMin: 3,
      capacityMax: 5,
    });
    expect(chosen?.live?.tableId).toBe('t1');
  });

  it("reads another table's label and seats from its pin, not the route's", () => {
    const chosen = resolveChosenTable(
      't1',
      { tableId: 't2', tableLabel: 'Window', capacityMin: '3', capacityMax: '5' },
      tables,
    );
    expect(chosen).toMatchObject({ label: '7', capacityMin: 2, capacityMax: 6 });
  });

  it('falls back to one seat up to the largest party for a table on no pin', () => {
    const chosen = resolveChosenTable('gone', {}, tables);
    expect(chosen).toEqual({
      tableId: 'gone',
      label: '',
      capacityMin: 1,
      capacityMax: PARTY_MAX,
      live: null,
    });
  });

  it('never lets the most seats fall under the fewest', () => {
    const chosen = resolveChosenTable(
      't1',
      { tableId: 't1', capacityMin: '6', capacityMax: '2' },
      tables,
    );
    expect(chosen).toMatchObject({ capacityMin: 6, capacityMax: 6 });
  });
});

describe('partyFits', () => {
  it('holds anyone without bounds', () => {
    expect(partyFits(1, null, null)).toBe(true);
    expect(partyFits(40, null, null)).toBe(true);
  });

  it('keeps to the bounds, both included', () => {
    expect(partyFits(2, 2, 4)).toBe(true);
    expect(partyFits(4, 2, 4)).toBe(true);
    expect(partyFits(1, 2, 4)).toBe(false);
    expect(partyFits(5, 2, 4)).toBe(false);
  });
});

describe('initialPartySize', () => {
  it("opens a change on the booking's own party", () => {
    expect(initialPartySize({ partySize: 9 }, { partySize: 3 }, null)).toBe(9);
  });

  it("opens a booking after a declined one on that one's party", () => {
    expect(initialPartySize(null, { partySize: 3 }, null)).toBe(3);
  });

  it('opens on two, or the fewest the chosen table seats, within its most', () => {
    expect(initialPartySize(null, null, null)).toBe(2);
    expect(initialPartySize({ partySize: null }, { partySize: null }, null)).toBe(2);
    expect(initialPartySize(null, null, { capacityMin: 4, capacityMax: 6 })).toBe(4);
    expect(initialPartySize(null, null, { capacityMin: 1, capacityMax: 1 })).toBe(1);
  });
});

describe('preferredTable', () => {
  it('is nothing when no table can be booked', () => {
    expect(preferredTable([availability('a', { isBookable: false })])).toBeNull();
    expect(preferredTable([])).toBeNull();
  });

  it('takes a plain table with no limit before one cut short or requested', () => {
    const chosen = preferredTable([
      availability('requested', { isRequestable: true }),
      availability('cut', { mustFreeByUtc: '2026-10-26T20:00:00Z' }),
      availability('plain'),
    ]);
    expect(chosen?.tableId).toBe('plain');
  });

  it('takes the table the next booking cuts the least when every one is cut short', () => {
    const chosen = preferredTable([
      availability('early', { mustFreeByUtc: '2026-10-26T19:00:00Z' }),
      availability('late', { mustFreeByUtc: '2026-10-26T21:00:00Z' }),
    ]);
    expect(chosen?.tableId).toBe('late');
  });

  it('takes a requestable table only when nothing plain is left', () => {
    const chosen = preferredTable([
      availability('off', { isBookable: false }),
      availability('requested', { isRequestable: true }),
    ]);
    expect(chosen?.tableId).toBe('requested');
  });
});

describe('soonCandidateFor', () => {
  const every = (open: string, close: string): OpeningHours[] =>
    ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({ day, open, close }));
  const place = { hours: every('10:00', '23:00'), timeZoneId: YEREVAN };
  // 19:12 in Yerevan.
  const soonMs = Date.parse('2026-10-26T15:12:00Z');
  const today = '2026-10-26';

  it('offers the instant today while the place is open then, with its clock time', () => {
    const slot = soonCandidateFor({
      isToday: true,
      activeDateKey: today,
      dayRefused: false,
      place,
      soonMs,
    });
    expect(slot?.at.getTime()).toBe(soonMs);
    expect(slot?.key).toBe('19:12');
  });

  it('is nothing on another day, on a refused day, or while the place is shut', () => {
    const base = { activeDateKey: today, dayRefused: false, place, soonMs };
    expect(soonCandidateFor({ ...base, isToday: false })).toBeNull();
    expect(soonCandidateFor({ ...base, isToday: true, dayRefused: true })).toBeNull();
    expect(soonCandidateFor({ ...base, isToday: true, activeDateKey: null })).toBeNull();
    expect(
      soonCandidateFor({
        ...base,
        isToday: true,
        place: { hours: every('10:00', '18:00'), timeZoneId: YEREVAN },
      }),
    ).toBeNull();
  });
});

describe('slotRoomsFor', () => {
  const rooms: readonly PlaceRoom[] = [
    { roomId: 'hall', name: 'Hall', photos: [photo('h1')] },
    { roomId: 'terrace', name: 'Terrace', photos: [photo('t1')] },
  ];

  it('draws nothing until the slot has a plan', () => {
    expect(slotRoomsFor(rooms, undefined, [])).toEqual([]);
  });

  it("pins the slot's tables with its verdicts and leaves out rooms with none", () => {
    const shown = slotRoomsFor(
      rooms,
      [floorTable('a', 'h1'), floorTable('b', 'h1'), floorTable('c', null)],
      [
        availability('a', { isRequestable: true, requiresEarlierGuestConsent: true }),
        availability('b', { isBookable: false, unavailableReason: 'tooSmall' }),
      ],
    );
    expect(shown.map((room) => room.roomId)).toEqual(['hall']);
    const pins = shown[0]?.photos[0]?.tables ?? [];
    expect(pins.map((pin) => [pin.tableId, pin.isBookable, pin.request])).toEqual([
      ['a', true, 'earlierGuest'],
      ['b', false, null],
    ]);
    expect(pins[1]?.unavailableReason).toBe('tooSmall');
  });

  it('asks the venue for a requestable table tonight, and refuses a table with no verdict', () => {
    const shown = slotRoomsFor(
      rooms,
      [floorTable('a', 't1'), floorTable('z', 't1')],
      [availability('a', { isRequestable: true })],
    );
    const pins = shown[0]?.photos[0]?.tables ?? [];
    expect(pins.map((pin) => [pin.tableId, pin.isBookable, pin.request])).toEqual([
      ['a', true, 'venue'],
      ['z', false, null],
    ]);
  });
});

describe('anyRequestIn', () => {
  it('says whether any pin on any photo is a request', () => {
    const plain: readonly PlaceRoom[] = [
      { roomId: 'hall', name: 'Hall', photos: [photo('h1', [marker('a')])] },
    ];
    const asked: readonly PlaceRoom[] = [
      ...plain,
      {
        roomId: 'terrace',
        name: 'Terrace',
        photos: [photo('t1', [marker('b', { request: 'venue' })])],
      },
    ];
    expect(anyRequestIn(plain)).toBe(false);
    expect(anyRequestIn(asked)).toBe(true);
    expect(anyRequestIn([])).toBe(false);
  });
});
