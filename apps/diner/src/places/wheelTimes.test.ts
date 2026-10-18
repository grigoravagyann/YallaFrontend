import { describe, expect, it } from 'vitest';
import {
  firstOfferedFrom,
  minuteIn,
  nearestOffered,
  quickTimes,
  settleOn,
  soonInstant,
  stepOffered,
  wheelHours,
  wheelPosition,
  type WheelSlot,
} from './wheelTimes';

/**
 * The time wheel's arithmetic, pure: which hours the left column shows (the
 * branch's own, after midnight included), which minutes each has, where a busy
 * time settles, one step up or down for a screen reader, and the quick chips.
 */

const MINUTE = 60_000;
/** 2026-10-20 17:00 Yerevan, as an instant. */
const BASE = Date.parse('2026-10-20T13:00:00.000Z');

/** Quarter hours from 17:00 local for `count` steps, with the states given by label. */
function day(count: number, states: Readonly<Record<string, WheelSlot['state']>> = {}) {
  return Array.from({ length: count }, (_, i): WheelSlot => {
    const minutes = 17 * 60 + i * 15;
    const label = `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    return { at: BASE + i * 15 * MINUTE, label, state: states[label] ?? 'free' };
  });
}

describe('the hour column', () => {
  it('lists the open hours in service order, those after midnight last', () => {
    // 17:00 to 01:45: a bar that closes at three.
    const hours = wheelHours(day(36));
    expect(hours.map((hour) => hour.label)).toEqual([
      '17',
      '18',
      '19',
      '20',
      '21',
      '22',
      '23',
      '00',
      '01',
    ]);
    expect(hours[7]!.slots.map((slot) => slot.label)).toEqual(['00:00', '00:15', '00:30', '00:45']);
  });

  it('starts an hour where the times start — 19:20 from now, then the quarter hours', () => {
    const soon = {
      at: BASE + 2 * 60 * MINUTE + 20 * MINUTE,
      label: '19:20',
      state: 'free' as const,
    };
    const rest = day(16).filter((slot) => slot.at > soon.at);
    const hours = wheelHours([soon, ...rest]);
    expect(hours[0]).toMatchObject({ label: '19' });
    expect(hours[0]!.slots.map((slot) => slot.label)).toEqual(['19:20', '19:30', '19:45']);
  });

  it('leaves out an hour with no times at all, and marks one whose every time is busy', () => {
    const lunchAndDinner = day(16).filter((slot) => !slot.label.startsWith('18'));
    const hours = wheelHours(
      lunchAndDinner.map((slot) =>
        slot.label.startsWith('19') ? { ...slot, state: 'busy' as const } : slot,
      ),
    );
    expect(hours.map((hour) => hour.label)).toEqual(['17', '19', '20']);
    expect(hours.map((hour) => hour.busy)).toEqual([false, true, false]);
  });

  it('finds a time by its instant, not its clock reading', () => {
    const hours = wheelHours(day(36));
    expect(wheelPosition(hours, BASE + 29 * 15 * MINUTE)).toEqual({ hour: 7, minute: 1 }); // 00:15
    expect(wheelPosition(hours, BASE + 7 * MINUTE)).toBeNull();
  });
});

describe('the minute column', () => {
  it('keeps the minute when the hour changes, or takes the nearest one that hour has', () => {
    const hours = wheelHours(day(16));
    expect(minuteIn(hours[1]!, '30')?.label).toBe('18:30');
    const soon: WheelSlot = { at: BASE + 20 * MINUTE, label: '17:20', state: 'free' };
    const first = wheelHours([soon, ...day(16).filter((slot) => slot.at > soon.at)])[0]!;
    expect(minuteIn(first, '00')?.label).toBe('17:20');
    expect(minuteIn(first, '45')?.label).toBe('17:45');
  });
});

describe('a busy time', () => {
  const slots = day(16, { '19:00': 'busy', '19:15': 'busy', '19:30': 'requestable' });

  it('settles on the nearest time that can be had, saying which it left', () => {
    expect(settleOn(slots, BASE + 2 * 60 * MINUTE)).toEqual({
      slot: slots[7], // 18:45 is a quarter hour from 19:00, 19:30 half an hour…
      snappedFrom: slots[8],
    });
    // …and 19:15 is nearer 19:30, which is requestable — on offer, so taken.
    expect(settleOn(slots, BASE + 2 * 60 * MINUTE + 15 * MINUTE).slot?.label).toBe('19:30');
  });

  it('settles where it is when the time can be had', () => {
    expect(settleOn(slots, slots[3]!.at)).toEqual({ slot: slots[3], snappedFrom: null });
  });

  it('prefers the later of two equally near times', () => {
    const tie = day(5, { '17:30': 'busy' });
    expect(nearestOffered(tie, tie[2]!.at)?.label).toBe('17:45');
  });

  it('has nowhere to settle when nothing can be had', () => {
    const full = day(4, { '17:00': 'busy', '17:15': 'busy', '17:30': 'busy', '17:45': 'busy' });
    expect(settleOn(full, full[1]!.at)).toEqual({ slot: null, snappedFrom: full[1] });
  });
});

describe('one step, for a screen reader', () => {
  const slots = day(16, { '19:00': 'busy', '19:15': 'busy' });

  it('moves to the next time that can be had, past the busy ones', () => {
    expect(stepOffered(slots, slots[7]!.at, 1)?.label).toBe('19:30');
    expect(stepOffered(slots, slots[10]!.at, -1)?.label).toBe('18:45');
  });

  it('stops at either end', () => {
    expect(stepOffered(slots, slots[15]!.at, 1)).toBeNull();
    expect(stepOffered(slots, slots[0]!.at, -1)).toBeNull();
  });
});

describe('the quick chips', () => {
  it('rounds "in ten minutes" up to the next five', () => {
    expect(new Date(soonInstant(new Date('2026-10-20T15:03:00.000Z'), 10)).toISOString()).toBe(
      '2026-10-20T15:15:00.000Z',
    );
    expect(new Date(soonInstant(new Date('2026-10-20T15:06:10.000Z'), 10)).toISOString()).toBe(
      '2026-10-20T15:20:00.000Z',
    );
    expect(new Date(soonInstant(new Date('2026-10-20T15:05:00.000Z'), 10)).toISOString()).toBe(
      '2026-10-20T15:15:00.000Z',
    );
  });

  it('offers the free times nearest the anchor, in time order, never a busy one', () => {
    const slots = day(16, { '19:00': 'busy' });
    expect(quickTimes(slots, slots[8]!.at, 3).map((slot) => slot.label)).toEqual([
      '18:45',
      '19:15',
      '19:30',
    ]);
    // Leaving out the one the "in 10 min" chip already offers.
    expect(quickTimes(slots, slots[0]!.at, 2, slots[0]!.at).map((slot) => slot.label)).toEqual([
      '17:15',
      '17:30',
    ]);
  });
});

describe('after "too soon now"', () => {
  it('is the first time on offer from the earliest the server still books', () => {
    const slots = day(8, { '17:30': 'busy', '17:45': 'requestable' });
    // Earliest 17:20: 17:30 is busy, 17:45 can be asked for.
    expect(firstOfferedFrom(slots, BASE + 20 * MINUTE)?.label).toBe('17:45');
    expect(firstOfferedFrom(slots, BASE + 15 * MINUTE)?.label).toBe('17:15');
    expect(firstOfferedFrom(slots, BASE + 8 * 15 * MINUTE)).toBeNull();
  });
});
