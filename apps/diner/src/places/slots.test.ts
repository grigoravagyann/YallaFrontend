import { describe, expect, it } from 'vitest';
import type { OpeningHours, Place } from './model';
import {
  LEAD_MINUTES,
  WINDOW_DAYS,
  bookableTables,
  dayOptions,
  largerPartySizes,
  stripDateFor,
  tablesForParty,
  timeSlots,
  windowReaching,
} from './slots';

const YEREVAN = 'Asia/Yerevan';

function every(open: string, close: string): OpeningHours[] {
  return ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({ day, open, close }));
}

const place = (hours: readonly OpeningHours[]): Pick<Place, 'hours' | 'timeZoneId'> => ({
  hours,
  timeZoneId: YEREVAN,
});

describe('dayOptions', () => {
  // 00:30 on Saturday the 12th in Yerevan, still Friday the 11th in UTC.
  const NOW = new Date('2026-09-11T20:30:00Z');

  it("starts on the place's today, not the device's UTC day", () => {
    const days = dayOptions(NOW, YEREVAN);
    expect(days).toHaveLength(7);
    expect(days[0]?.dateKey).toBe('2026-09-12');
    expect(days[0]?.isToday).toBe(true);
    expect(days[0]?.weekday).toBe(6);
    expect(days[0]?.dayOfMonth).toBe(12);
    expect(days[1]?.isTomorrow).toBe(true);
    expect(days[6]?.dateKey).toBe('2026-09-18');
  });

  it('gives each day its local midnight as an instant', () => {
    const [today] = dayOptions(NOW, YEREVAN, 1);
    // Midnight in Yerevan is 20:00 UTC the evening before.
    expect(today?.date.toISOString()).toBe('2026-09-11T20:00:00.000Z');
  });

  it('clamps the count to something a strip can show', () => {
    expect(dayOptions(NOW, YEREVAN, 0)).toHaveLength(1);
    expect(dayOptions(NOW, YEREVAN, 3)).toHaveLength(3);
  });

  it("offers only the branch's own window: three days, not the default week", () => {
    const days = dayOptions(NOW, YEREVAN, 3);
    expect(days.map((day) => day.dateKey)).toEqual(['2026-09-12', '2026-09-13', '2026-09-14']);
    expect(dayOptions(NOW, YEREVAN)).toHaveLength(WINDOW_DAYS);
  });
});

describe('timeSlots', () => {
  it('cuts quarter-hour slots from opening up to, but not including, closing', () => {
    const slots = timeSlots(
      place(every('10:00', '12:00')),
      '2026-09-20',
      new Date('2026-09-01T00:00:00Z'),
    );
    expect(slots.map((slot) => slot.key)).toEqual([
      '10:00',
      '10:15',
      '10:30',
      '10:45',
      '11:00',
      '11:15',
      '11:30',
      '11:45',
    ]);
    // 10:00 in Yerevan (UTC+4) is 06:00 UTC.
    expect(slots[0]?.at.toISOString()).toBe('2026-09-20T06:00:00.000Z');
  });

  it('drops anything already past or inside the 10-minute lead', () => {
    // 14:05 in Yerevan. 14:15 is 10 minutes away: just in. 14:00 is gone.
    const now = new Date('2026-09-20T10:05:00Z');
    const slots = timeSlots(place(every('08:00', '23:00')), '2026-09-20', now);
    expect(slots[0]?.key).toBe('14:15');
    expect(slots.at(-1)?.key).toBe('22:45');
    // 14:06: 14:15 is nine minutes away, too soon; 14:30 is the first.
    const later = timeSlots(
      place(every('08:00', '23:00')),
      '2026-09-20',
      new Date('2026-09-20T10:06:00Z'),
    );
    expect(later[0]?.key).toBe('14:30');
  });

  it("keeps to the branch's own lead: nothing sooner than two hours when it asks for 120 minutes", () => {
    // 14:05 in Yerevan. With a 120-minute lead the first slot is 16:15, not 14:15.
    const now = new Date('2026-09-20T10:05:00Z');
    const hours = place(every('08:00', '23:00'));

    expect(timeSlots(hours, '2026-09-20', now, 120)[0]?.key).toBe('16:15');
    expect(timeSlots(hours, '2026-09-20', now)[0]?.key).toBe('14:15');
    expect(timeSlots(hours, '2026-09-20', now, LEAD_MINUTES)[0]?.key).toBe('14:15');
    // A 180-minute lead, as set in the console: nothing before 17:05 is offered.
    const later = timeSlots(hours, '2026-09-20', now, 180);
    expect(later[0]?.key).toBe('17:15');
    expect(later.every((slot) => slot.at.getTime() >= now.getTime() + 180 * 60_000)).toBe(true);
  });

  it('returns nothing for a day the place is shut', () => {
    const weekdaysOnly: OpeningHours[] = every('09:00', '22:00').filter((h) => h.day !== 0);
    // 2026-09-20 is a Sunday.
    expect(timeSlots(place(weekdaysOnly), '2026-09-20', new Date('2026-09-01T00:00:00Z'))).toEqual(
      [],
    );
  });

  it('returns nothing once the day is over', () => {
    const slots = timeSlots(
      place(every('08:00', '22:00')),
      '2026-09-20',
      // 21:51 in Yerevan: 22:00 is closing, so nothing is left.
      new Date('2026-09-20T17:51:00Z'),
    );
    expect(slots).toEqual([]);
  });

  it('runs past midnight when the place closes after it', () => {
    const slots = timeSlots(
      place(every('20:00', '01:00')),
      '2026-09-20',
      new Date('2026-09-01T00:00:00Z'),
    );
    expect(slots.map((slot) => slot.key)).toEqual([
      '20:00',
      '20:15',
      '20:30',
      '20:45',
      '21:00',
      '21:15',
      '21:30',
      '21:45',
      '22:00',
      '22:15',
      '22:30',
      '22:45',
      '23:00',
      '23:15',
      '23:30',
      '23:45',
      '00:00',
      '00:15',
      '00:30',
      '00:45',
    ]);
    // 00:45 is on the 21st in Yerevan — 20:45 UTC on the 20th.
    expect(slots.at(-1)?.at.toISOString()).toBe('2026-09-20T20:45:00.000Z');
  });

  it('uses the hours of the day asked for, not of today', () => {
    const hours: OpeningHours[] = [
      ...every('09:00', '18:00').filter((h) => h.day !== 6),
      { day: 6, open: '11:00', close: '15:00' },
    ];
    // Asked on a Monday about the coming Saturday.
    const slots = timeSlots(place(hours), '2026-09-19', new Date('2026-09-14T06:00:00Z'));
    expect(slots[0]?.key).toBe('11:00');
    expect(slots.at(-1)?.key).toBe('14:45');
  });

  it('offers both services of a split day, and nothing in the gap', () => {
    // Listed dinner first, as nothing guarantees the order blocks arrive in.
    const split: OpeningHours[] = [
      { day: 0, open: '18:00', close: '21:00' },
      { day: 0, open: '12:00', close: '14:00' },
    ];
    // 2026-09-20 is a Sunday.
    const all = timeSlots(place(split), '2026-09-20', new Date('2026-09-01T00:00:00Z'));
    expect(all.map((slot) => slot.key)).toEqual([
      '12:00',
      '12:15',
      '12:30',
      '12:45',
      '13:00',
      '13:15',
      '13:30',
      '13:45',
      '18:00',
      '18:15',
      '18:30',
      '18:45',
      '19:00',
      '19:15',
      '19:30',
      '19:45',
      '20:00',
      '20:15',
      '20:30',
      '20:45',
    ]);

    // 15:00 in Yerevan: lunch is over, dinner is still to come.
    const afterLunch = timeSlots(place(split), '2026-09-20', new Date('2026-09-20T11:00:00Z'));
    expect(afterLunch[0]?.key).toBe('18:00');
  });
});

describe('tables', () => {
  const at = { x: 0.1, y: 0.1, isBookable: true };
  const tables = [
    { ...at, tableId: 'a', label: '1', status: 'free', capacityMin: 2, capacityMax: 4 },
    { ...at, tableId: 'b', label: '2', status: 'reserved', capacityMin: 2, capacityMax: 4 },
    { ...at, tableId: 'c', label: '3', status: 'occupied', capacityMin: 2, capacityMax: 2 },
    { ...at, tableId: 'd', label: '4', status: 'free', capacityMin: 6, capacityMax: 8 },
    { ...at, tableId: 'e', label: '5', status: 'outOfService', capacityMin: 2, capacityMax: 4 },
    // A staff pass: free, and never offered.
    {
      ...at,
      tableId: 'f',
      label: '6',
      status: 'free',
      capacityMin: 2,
      capacityMax: 4,
      isBookable: false,
    },
  ] as const;

  it('only free tables the venue takes bookings for can be booked', () => {
    expect(bookableTables(tables).map((t) => t.label)).toEqual(['1', '4']);
  });

  it('fits the party to a free table', () => {
    expect(tablesForParty(tables, 3).map((t) => t.label)).toEqual(['1']);
    expect(tablesForParty(tables, 7).map((t) => t.label)).toEqual(['4']);
    expect(tablesForParty(tables, 5)).toEqual([]);
  });
});

describe('windowReaching', () => {
  // 00:30 on Saturday the 12th in Yerevan, still Friday the 11th in UTC.
  const NOW = new Date('2026-09-11T20:30:00Z');

  it('keeps the window when the date is already on it, or there is none', () => {
    expect(windowReaching(NOW, YEREVAN, 7, null)).toBe(7);
    expect(windowReaching(NOW, YEREVAN, 7, '2026-09-12')).toBe(7);
    expect(windowReaching(NOW, YEREVAN, 7, '2026-09-18')).toBe(7);
  });

  it('reaches a day further out, counted in the place’s calendar', () => {
    // The 19th is eight days from the 12th: day one is today.
    expect(windowReaching(NOW, YEREVAN, 7, '2026-09-19')).toBe(8);
    const days = dayOptions(NOW, YEREVAN, windowReaching(NOW, YEREVAN, 7, '2026-09-25'));
    expect(days.at(-1)?.dateKey).toBe('2026-09-25');
  });
});

describe('stripDateFor', () => {
  // A bar open 17:00–02:00 every night, and a café open 09:00–22:00.
  const bar = place(every('17:00', '02:00'));
  const cafe = place(every('09:00', '22:00'));
  const TODAY = '2026-10-17';

  it('puts a booking after midnight on the evening before, whose times hold it', () => {
    // 00:30 on the 19th in Yerevan.
    expect(stripDateFor(bar, '2026-10-18T20:30:00Z', TODAY)).toBe('2026-10-18');
    expect(stripDateFor(bar, '2026-10-18T21:30:00Z', TODAY)).toBe('2026-10-18');
  });

  it('keeps an evening booking on its own date', () => {
    // 20:00 on the 18th.
    expect(stripDateFor(bar, '2026-10-18T16:00:00Z', TODAY)).toBe('2026-10-18');
    expect(stripDateFor(cafe, '2026-10-18T06:00:00Z', TODAY)).toBe('2026-10-18');
  });

  it('counts a time inside the lead or already gone as on its day all the same', () => {
    // Today's 17:30, with "now" any time: the day is the booking's, not the picker's.
    expect(stripDateFor(bar, '2026-10-17T13:30:00Z', TODAY)).toBe(TODAY);
  });

  it('never picks a day before today, which the strip does not have', () => {
    // 00:30 today belongs to last night's strip; today's is the one shown.
    expect(stripDateFor(bar, '2026-10-16T20:30:00Z', TODAY)).toBe(TODAY);
  });

  it('falls back to the calendar date when the hours no longer hold the time', () => {
    // 23:00 at a café that closes at 22:00.
    expect(stripDateFor(cafe, '2026-10-18T19:00:00Z', TODAY)).toBe('2026-10-18');
  });
});

describe('largerPartySizes', () => {
  const any = () => true;

  it('lists the sizes the chosen table seats, from five up to the top', () => {
    expect(largerPartySizes(5, 8, any)).toEqual([5, 6, 7, 8]);
    expect(largerPartySizes(5, 8, (size) => size <= 6)).toEqual([5, 6]);
    expect(largerPartySizes(5, 4, any)).toEqual([]);
  });

  it('keeps the size of the booking being changed, however large, in its place', () => {
    expect(largerPartySizes(5, 12, any, 15)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 15]);
    // One the table's figures would refuse is still the booking's own.
    expect(largerPartySizes(5, 8, (size) => size <= 6, 7)).toEqual([5, 6, 7]);
    // Already there, or one of the small sizes the radios carry: nothing added.
    expect(largerPartySizes(5, 8, any, 6)).toEqual([5, 6, 7, 8]);
    expect(largerPartySizes(5, 8, any, 3)).toEqual([5, 6, 7, 8]);
  });
});
