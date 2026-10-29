import type { DaySlots } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import type { PlaceRoom } from '../places/model';
import { guestsLeftAt, isBookedByTime, placesLeftLine, roomsWithoutPins } from './byTime';

describe('isBookedByTime', () => {
  it('takes the booking rules once they have answered, the place until then', () => {
    expect(isBookedByTime({ bookingMode: 'timeOnly' }, undefined)).toBe(true);
    expect(isBookedByTime({}, undefined)).toBe(false);
    expect(isBookedByTime({ bookingMode: 'chooseTable' }, { bookingMode: 'timeOnly' })).toBe(true);
    expect(isBookedByTime({ bookingMode: 'timeOnly' }, { bookingMode: 'chooseTable' })).toBe(false);
  });
});

describe('guestsLeftAt', () => {
  const day = (date: string, slots: [string, number | null][]): DaySlots => ({
    branchId: 'b-1',
    date,
    partySize: 2,
    stepMinutes: 15,
    unavailableReason: null,
    slots: slots.map(([slotUtc, guestsLeft]) => ({
      time: slotUtc.slice(11, 16),
      slotUtc,
      isAvailable: true,
      requiresApproval: false,
      freeTableCount: 0,
      unavailableReason: null,
      guestsLeft,
    })),
  });

  it('reads the time from whichever day lists it, by its instant', () => {
    const today = day('2026-10-16', [['2026-10-16T15:00:00Z', 4]]);
    const tomorrow = day('2026-10-17', [['2026-10-16T20:30:00Z', 9]]);
    expect(guestsLeftAt([today, tomorrow], Date.parse('2026-10-16T15:00:00.000Z'))).toBe(4);
    expect(guestsLeftAt([today, tomorrow], Date.parse('2026-10-16T20:30:00Z'))).toBe(9);
  });

  it('is null with no time, no answer, or a count in tables', () => {
    const tables = day('2026-10-16', [['2026-10-16T15:00:00Z', null]]);
    expect(guestsLeftAt([tables], null)).toBeNull();
    expect(guestsLeftAt([undefined, null], Date.parse('2026-10-16T15:00:00Z'))).toBeNull();
    expect(guestsLeftAt([tables], Date.parse('2026-10-16T15:00:00Z'))).toBeNull();
  });
});

describe('placesLeftLine', () => {
  it('says how many only when the time is nearly full', () => {
    expect(placesLeftLine(3)).toEqual({ key: 'book.byTime.placesLeft', params: { count: 3 } });
    expect(placesLeftLine(6)).not.toBeNull();
    expect(placesLeftLine(7)).toBeNull();
    expect(placesLeftLine(0)).toBeNull();
    expect(placesLeftLine(null)).toBeNull();
  });
});

describe('roomsWithoutPins', () => {
  it('keeps every room and photo, and takes every pin off', () => {
    const rooms: PlaceRoom[] = [
      {
        roomId: 'hall',
        name: 'Hall',
        photos: [
          {
            photoId: 'p1',
            url: 'https://img/p1.jpg',
            thumbUrl: 'https://img/p1-t.jpg',
            width: 1200,
            height: 800,
            tables: [
              {
                tableId: 't1',
                label: '1',
                status: 'free',
                isBookable: true,
                capacityMin: 1,
                capacityMax: 4,
                x: 0.5,
                y: 0.5,
              },
            ],
          },
        ],
      },
    ];
    const shown = roomsWithoutPins(rooms);
    expect(shown.map((room) => room.name)).toEqual(['Hall']);
    expect(shown[0]!.photos.map((photo) => [photo.photoId, photo.tables.length])).toEqual([
      ['p1', 0],
    ]);
  });
});
