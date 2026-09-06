import { describe, expect, it } from 'vitest';
import { defaultSelection, slotInstant, slotProblem } from './slots';

/**
 * The parse that used to white-screen the public branch page.
 *
 * `slotInstant` split on `-` and handed whatever `Number` produced to
 * `instantFromZonedClock`. An empty date gave `NaN` for the year, which became
 * an Invalid Date, which threw `RangeError: Invalid time value` inside
 * `Intl.DateTimeFormat.formatToParts` — during render, in a tree with no error
 * boundary anywhere in the app.
 *
 * A `type="date"` input is empty between a clear and the next keystroke, and
 * stays empty for as long as somebody leaves it that way. So the crash was one
 * tap away on the one surface that is opened by strangers from a link, on a
 * phone, with no reason to try again.
 */

const YEREVAN = 'Asia/Yerevan';

describe('a selection that cannot be resolved', () => {
  const cases: ReadonlyArray<readonly [string, { date: string; time: string }]> = [
    ['an empty date — the one that shipped', { date: '', time: '20:00' }],
    ['an empty time', { date: '2026-09-08', time: '' }],
    ['both empty', { date: '', time: '' }],
    ['a partial date, mid-typing', { date: '2026-09', time: '20:00' }],
    ['a year alone', { date: '2026', time: '20:00' }],
    ['a partial time', { date: '2026-09-08', time: '20' }],
    ['text where a date goes', { date: 'tomorrow', time: '20:00' }],
    ['a 13th month', { date: '2026-13-01', time: '20:00' }],
    ['the 30th of February', { date: '2026-02-30', time: '20:00' }],
    ['a 25th hour', { date: '2026-09-08', time: '25:00' }],
    ['a 61st minute', { date: '2026-09-08', time: '20:61' }],
  ];

  for (const [name, selection] of cases) {
    it(`returns null rather than throwing for ${name}`, () => {
      const input = { ...selection, partySize: 2 };

      // Never throws. That is the whole contract: no caller has to catch, and
      // no render can be interrupted.
      expect(() => slotInstant(input, YEREVAN)).not.toThrow();
      expect(slotInstant(input, YEREVAN)).toBeNull();
      expect(slotProblem(input)).not.toBeNull();
    });
  }

  it('names which half is wrong, because they fall back differently', () => {
    // A missing date falls back to today; a missing time to the next slot.
    expect(slotProblem({ date: '', time: '20:00', partySize: 2 })).toBe('date');
    expect(slotProblem({ date: '2026-09-08', time: '', partySize: 2 })).toBe('time');
  });

  it('refuses 2026-02-30 rather than silently making it the 2nd of March', () => {
    // A date control can produce one, and rolling over would book a diner onto
    // a day they did not pick.
    expect(slotInstant({ date: '2026-02-30', time: '20:00', partySize: 2 }, YEREVAN)).toBeNull();
    expect(
      slotInstant({ date: '2028-02-29', time: '20:00', partySize: 2 }, YEREVAN),
    ).not.toBeNull();
  });
});

describe('a selection that can', () => {
  it('resolves in the branch zone, not the device one', () => {
    // 20:00 in Yerevan is 16:00 UTC. A tourist's phone on Moscow time must not
    // move it.
    const instant = slotInstant({ date: '2026-09-08', time: '20:00', partySize: 2 }, YEREVAN);
    expect(instant).not.toBeNull();
    expect(instant!.toISOString()).toBe('2026-09-08T16:00:00.000Z');
  });

  it('always resolves the page default', () => {
    // The fallback every caller leans on. If this could be null the guard would
    // have nowhere to fall back to.
    const selection = defaultSelection(YEREVAN, new Date('2026-09-08T09:13:00Z'));
    expect(slotProblem(selection)).toBeNull();
    expect(slotInstant(selection, YEREVAN)).not.toBeNull();
  });

  it('accepts midnight and the last slot of the day', () => {
    expect(
      slotInstant({ date: '2026-09-08', time: '00:00', partySize: 2 }, YEREVAN),
    ).not.toBeNull();
    expect(
      slotInstant({ date: '2026-09-08', time: '23:30', partySize: 2 }, YEREVAN),
    ).not.toBeNull();
  });
});
