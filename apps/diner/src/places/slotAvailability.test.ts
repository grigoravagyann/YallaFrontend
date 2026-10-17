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

/** The instant of `HH:mm` on the 18th, as the availability sets hold it. */
const ms = (time: string) => Date.parse(`2026-10-18T${time}:00+04:00`);
/** The clock readings of a set of instants on the 18th, for readable expectations. */
const clocks = (set: ReadonlySet<number>) =>
  SLOTS.filter((slot) => set.has(slot.at.getTime())).map((slot) => slot.key);

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
const NOTHING = { struck: new Set<number>(), hidden: new Set<number>() };

describe('slotAvailability', () => {
  it('strikes and hides nothing while the day has not answered, or when it failed', () => {
    expect(slotAvailability(SLOTS, [undefined], YEREVAN)).toEqual({
      struck: new Set(),
      hidden: new Set(),
      dayReason: null,
    });
    const failed = slotAvailability(SLOTS, [null], YEREVAN);
    expect(failed.struck.size + failed.hidden.size).toBe(0);
  });

  it('strikes the times listed with no free table, and only those', () => {
    const { struck, hidden, dayReason } = slotAvailability(SLOTS, [FULL_AT_EIGHT], YEREVAN);
    expect(clocks(struck)).toEqual(['20:00']);
    expect(hidden.size).toBe(0);
    expect(dayReason).toBeNull();
  });

  it('strikes every time when the whole day is refused, and says why', () => {
    const { struck, hidden, dayReason } = slotAvailability(SLOTS, [day([], 'closed')], YEREVAN);
    expect(clocks(struck)).toEqual(SLOTS.map((slot) => slot.key));
    // Refused, not left out: drawn and struck, with the day's words.
    expect(hidden.size).toBe(0);
    expect(dayReason).toBe('closed');
  });

  it('hides a time the server left out — its sitting does not fit the hours — not strikes it', () => {
    // The server lists only times whose whole sitting fits before closing; of
    // those, 19:00 has no free table.
    const early = day([daySlot('18:30', true), daySlot('19:00', false), daySlot('19:30', true)]);
    const { struck, hidden, dayReason } = slotAvailability(SLOTS, [early], YEREVAN);
    expect(clocks(hidden)).toEqual(['20:00', '20:30']);
    expect(clocks(struck)).toEqual(['19:00']);
    expect(dayReason).toBeNull();
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
    const judged = slotAvailability([SLOTS[3]!, late], [answer], YEREVAN);
    expect(judged.struck.size + judged.hidden.size).toBe(0);
    // A refused date does not strike the next date's times either.
    const refused = slotAvailability([late], [day([], 'pastLeadTime')], YEREVAN);
    expect(refused).toEqual({ struck: new Set(), hidden: new Set(), dayReason: null });
  });

  it('judges a time after midnight by the next date’s answer when there is one', () => {
    const half: TimeSlot = { key: '00:30', at: new Date('2026-10-19T00:30:00+04:00') };
    const late: TimeSlot = { key: '01:30', at: new Date('2026-10-19T01:30:00+04:00') };
    // The 19th lists 00:00 and 00:30 (taken): a 01:30 sitting runs past the 02:00 close.
    const on19th = (time: string, isAvailable: boolean) => ({
      ...daySlot(time, isAvailable),
      slotUtc: new Date(`2026-10-19T${time}:00+04:00`).toISOString(),
    });
    const next = {
      ...day([]),
      date: '2026-10-19',
      slots: [on19th('00:00', true), on19th('00:30', false)],
    };
    const { struck, hidden } = slotAvailability(
      [SLOTS[3]!, half, late],
      [FULL_AT_EIGHT, next],
      YEREVAN,
    );
    expect([...struck]).toEqual([ms('20:00'), half.at.getTime()]);
    expect([...hidden]).toEqual([late.at.getTime()]);
  });

  it('matches a time by its instant when the clock reading differs in form', () => {
    const answer = day([{ ...daySlot('19:00', false), time: '19:00:00' }]);
    expect(slotAvailability(SLOTS.slice(1, 2), [answer], YEREVAN).struck.has(ms('19:00'))).toBe(
      true,
    );
  });
});

describe('pickSlot', () => {
  const struck = { struck: new Set([ms('18:30'), ms('20:00')]), hidden: new Set<number>() };

  it('keeps the wanted time while it can be had, a new booking or a change alike', () => {
    expect(pickSlot(SLOTS, struck, ms('19:30'), true)?.key).toBe('19:30');
    expect(pickSlot(SLOTS, struck, ms('19:30'), false)?.key).toBe('19:30');
  });

  it('starts a new booking on the first time that can be had', () => {
    expect(pickSlot(SLOTS, struck, null, true)?.key).toBe('19:00');
    expect(pickSlot(SLOTS, NOTHING, null, true)?.key).toBe('18:30');
  });

  it('moves a new booking to the nearest time that can be had, the later on a tie', () => {
    // 20:00 is struck: 19:30 and 20:30 are both half an hour away.
    expect(pickSlot(SLOTS, struck, ms('20:00'), true)?.key).toBe('20:30');
    // 18:30 is struck: 19:00 is the nearest, not the first of the day.
    expect(pickSlot(SLOTS, struck, ms('18:30'), true)?.key).toBe('19:00');
    // A wanted time hidden since is gone just the same.
    const hidden = { struck: new Set<number>(), hidden: new Set([ms('20:30')]) };
    expect(pickSlot(SLOTS, hidden, ms('20:30'), true)?.key).toBe('20:00');
    // A time no longer on the list at all: the nearest that is, not the first.
    expect(pickSlot(SLOTS, struck, ms('23:00'), true)?.key).toBe('20:30');
  });

  it('never substitutes a time in a change: nothing is chosen', () => {
    expect(pickSlot(SLOTS, struck, ms('20:00'), false)).toBeNull();
    expect(pickSlot(SLOTS, struck, ms('23:00'), false)).toBeNull();
    expect(pickSlot(SLOTS, NOTHING, null, false)).toBeNull();
    const hidden = { struck: new Set<number>(), hidden: new Set([ms('20:30')]) };
    expect(pickSlot(SLOTS, hidden, ms('20:30'), false)).toBeNull();
  });

  it('chooses nothing when every time is struck', () => {
    const all = {
      struck: new Set(SLOTS.map((slot) => slot.at.getTime())),
      hidden: new Set<number>(),
    };
    expect(pickSlot(SLOTS, all, ms('19:00'), true)).toBeNull();
    expect(pickSlot([], NOTHING, null, true)).toBeNull();
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
