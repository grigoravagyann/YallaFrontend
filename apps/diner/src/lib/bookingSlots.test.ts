import { describe, expect, it } from 'vitest';
import { PARTY_SIZES, dayOptions, timeOptions } from './bookingSlots';

const YEREVAN = 'Asia/Yerevan';

describe('the date picker', () => {
  // 00:30 on the 12th in Yerevan, while it is still the 11th in UTC.
  const NOW = new Date('2026-09-11T20:30:00Z');
  // 19:30 on the 15th, Yerevan.
  const PICKED = new Date('2026-09-15T15:30:00Z');

  it("starts from the branch's today, whatever day is already picked", () => {
    const days = dayOptions({ now: NOW, selected: PICKED, timeZoneId: YEREVAN, windowDays: 14 });

    expect(days[0]?.dateKey).toBe('2026-09-12');
    expect(days[0]?.isToday).toBe(true);
    expect(days[1]?.isTomorrow).toBe(true);
    // The pick is marked where it is, not relabelled "Today".
    expect(days.find((day) => day.isSelected)?.dateKey).toBe('2026-09-15');
    expect(days.filter((day) => day.isToday)).toHaveLength(1);
  });

  it('keeps the picked time of day when moving to another day', () => {
    const days = dayOptions({ now: NOW, selected: PICKED, timeZoneId: YEREVAN, windowDays: 14 });
    expect(days[2]?.slotUtc.toISOString()).toBe('2026-09-14T15:30:00.000Z');
  });

  it('stops at the booking window', () => {
    expect(
      dayOptions({ now: NOW, selected: PICKED, timeZoneId: YEREVAN, windowDays: 3 }),
    ).toHaveLength(3);
  });
});

describe('the time picker', () => {
  it("lists the branch's own day, from its midnight", () => {
    const slots = timeOptions({
      dateKey: '2026-09-20',
      now: new Date('2026-09-01T00:00:00Z'),
      timeZoneId: YEREVAN,
      leadMinutes: 0,
    });

    expect(slots).toHaveLength(48);
    // 00:00 in Yerevan is 20:00 the day before in UTC.
    expect(slots[0]?.toISOString()).toBe('2026-09-19T20:00:00.000Z');
    expect(slots[47]?.toISOString()).toBe('2026-09-20T19:30:00.000Z');
  });

  it('offers nothing already past or inside the lead time', () => {
    const slots = timeOptions({
      dateKey: '2026-09-20',
      // 14:05 in Yerevan, with a 30-minute lead: 14:35 is the earliest.
      now: new Date('2026-09-20T10:05:00Z'),
      timeZoneId: YEREVAN,
      leadMinutes: 30,
    });

    expect(slots[0]?.toISOString()).toBe('2026-09-20T11:00:00.000Z');
  });
});

describe('the party size', () => {
  it('can say seven, and goes past eight', () => {
    expect(PARTY_SIZES).toContain(7);
    expect(Math.max(...PARTY_SIZES)).toBeGreaterThanOrEqual(12);
  });
});
