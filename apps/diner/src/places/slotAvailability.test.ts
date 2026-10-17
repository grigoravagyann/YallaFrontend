import type { DaySlot, DaySlots } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { dayRefusalLine, pickSlot, slotAvailability } from './slotAvailability';
import type { TimeSlot } from './slots';

const YEREVAN = 'Asia/Yerevan';

/** 18:30 … 20:30 on 18 October 2026 in Yerevan (UTC+4). */
const SLOTS: readonly TimeSlot[] = ['18:30', '19:00', '19:30', '20:00', '20:30'].map((key) => ({
  key,
  at: new Date(`2026-10-18T${key}:00+04:00`),
}));

function daySlot(time: string, isAvailable: boolean): DaySlot {
  return {
    time,
    slotUtc: new Date(`2026-10-18T${time}:00+04:00`).toISOString(),
    isAvailable,
    requiresApproval: false,
    freeTableCount: isAvailable ? 2 : 0,
    unavailableReason: isAvailable ? null : 'alreadyBooked',
  };
}

function day(slots: readonly DaySlot[], unavailableReason: DaySlots['unavailableReason'] = null) {
  return {
    branchId: 'b1',
    date: '2026-10-18',
    partySize: 2,
    stepMinutes: 30,
    unavailableReason,
    slots,
  } satisfies DaySlots;
}

const FULL_AT_EIGHT = day(SLOTS.map((slot) => daySlot(slot.key, slot.key !== '20:00')));

describe('slotAvailability', () => {
  it('strikes nothing while the day has not answered, or when it failed', () => {
    expect(slotAvailability(SLOTS, [undefined], YEREVAN)).toEqual({
      struck: new Set(),
      dayReason: null,
    });
    expect(slotAvailability(SLOTS, [null], YEREVAN).struck.size).toBe(0);
  });

  it('strikes the times with no free table, and only those', () => {
    const { struck, dayReason } = slotAvailability(SLOTS, [FULL_AT_EIGHT], YEREVAN);
    expect([...struck]).toEqual(['20:00']);
    expect(dayReason).toBeNull();
  });

  it('strikes every time when the whole day is refused, and says why', () => {
    const { struck, dayReason } = slotAvailability(SLOTS, [day([], 'closed')], YEREVAN);
    expect([...struck]).toEqual(SLOTS.map((slot) => slot.key));
    expect(dayReason).toBe('closed');
  });

  it('strikes a time the server left out: its sitting does not fit the hours', () => {
    // The server lists only times whose whole sitting fits before closing.
    const early = day(SLOTS.slice(0, 3).map((slot) => daySlot(slot.key, true)));
    expect([...slotAvailability(SLOTS, [early], YEREVAN).struck]).toEqual(['20:00', '20:30']);
  });

  it('leaves a time after midnight alone: it is the next date, which this answer is not', () => {
    // A bar open until 02:00: tonight's 00:30 is on the 19th. The 18th's answer
    // lists the 18th's own 00:30 — last night's — which must not decide it.
    const late: TimeSlot = { key: '00:30', at: new Date('2026-10-19T00:30:00+04:00') };
    const answer = day([
      { ...daySlot('20:00', true) },
      {
        ...daySlot('00:30', false),
        slotUtc: new Date('2026-10-18T00:30:00+04:00').toISOString(),
      },
    ]);
    expect(slotAvailability([SLOTS[3]!, late], [answer], YEREVAN).struck.size).toBe(0);
    // A refused date does not strike the next date's times either.
    const refused = slotAvailability([late], [day([], 'pastLeadTime')], YEREVAN);
    expect(refused).toEqual({ struck: new Set(), dayReason: null });
  });

  it('judges a time after midnight by the next date’s answer when there is one', () => {
    const late: TimeSlot = { key: '01:30', at: new Date('2026-10-19T01:30:00+04:00') };
    // The 19th lists 00:00 and 00:30 only: a 01:30 sitting runs past the 02:00 close.
    const next = {
      ...day([]),
      date: '2026-10-19',
      slots: ['00:00', '00:30'].map((time) => ({
        ...daySlot(time, true),
        slotUtc: new Date(`2026-10-19T${time}:00+04:00`).toISOString(),
      })),
    };
    const { struck } = slotAvailability([SLOTS[3]!, late], [FULL_AT_EIGHT, next], YEREVAN);
    expect([...struck]).toEqual(['20:00', '01:30']);
  });

  it('matches a time by its instant when the clock reading differs in form', () => {
    const answer = day([{ ...daySlot('19:00', false), time: '19:00:00' }]);
    expect(slotAvailability(SLOTS.slice(1, 2), [answer], YEREVAN).struck.has('19:00')).toBe(true);
  });
});

describe('pickSlot', () => {
  const struck = new Set(['18:30', '20:00']);

  it('keeps the diner’s pick while it can still be had', () => {
    expect(pickSlot(SLOTS, struck, '19:30')?.key).toBe('19:30');
  });

  it('falls back to the first time that can be had, never a struck one', () => {
    // The default (no pick) and a pick that has just been struck alike.
    expect(pickSlot(SLOTS, struck, null)?.key).toBe('19:00');
    expect(pickSlot(SLOTS, struck, '20:00')?.key).toBe('19:00');
    // A pick that is not on today's list any more.
    expect(pickSlot(SLOTS, struck, '23:00')?.key).toBe('19:00');
  });

  it('chooses nothing when every time is struck', () => {
    expect(pickSlot(SLOTS, new Set(SLOTS.map((slot) => slot.key)), '19:00')).toBeNull();
    expect(pickSlot([], new Set(), null)).toBeNull();
  });
});

describe('dayRefusalLine', () => {
  it('says a refused day in the day’s words', () => {
    expect(dayRefusalLine('closed', 2).key).toBe('book.dayUnavailable.closed');
    expect(dayRefusalLine('tooFarAhead', 2).key).toBe('book.dayUnavailable.tooFarAhead');
    expect(dayRefusalLine('pastLeadTime', 2).key).toBe('book.noSlots');
  });

  it('falls back to the table’s words for any other reason', () => {
    expect(dayRefusalLine('alreadyBooked', 2).key).toBe('table.unavailable.alreadyBooked');
  });
});
