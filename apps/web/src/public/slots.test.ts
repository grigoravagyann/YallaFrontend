import { describe, expect, it } from 'vitest';
import type { DaySlot } from '@yalla/api';
import {
  defaultSelection,
  nearestChoice,
  slotInstant,
  slotProblem,
  timeChoices,
  timeOptions,
} from './slots';

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

/**
 * The page used to open on the next half hour, which at 01:21 with a 30-minute
 * lead is 01:30 — inside the lead, so the first thing a stranger saw was "Too
 * soon to book this table" on a room they had not touched. The default is now
 * the first slot the venue would actually accept.
 */
describe('the slot the page opens on', () => {
  const FRIDAY_HOURS = [
    { day: 4, blocks: [{ opensAt: '09:00', closesAt: '23:59' }] },
    { day: 5, blocks: [{ opensAt: '09:00', closesAt: '01:00' }] },
  ] as const;

  it("skips to this morning's opening when it is 01:21 and the venue opens at 09:00", () => {
    const picked = defaultSelection(YEREVAN, new Date('2026-10-15T21:21:00Z'), {
      minLeadMinutes: 30,
      weeklyHours: FRIDAY_HOURS,
    });
    expect(picked).toEqual({ date: '2026-10-16', time: '09:00', partySize: 2 });
  });

  it('clears the lead time when the venue is open: 20:11 with 30 minutes lead is 20:45', () => {
    const picked = defaultSelection(YEREVAN, new Date('2026-10-16T16:11:00Z'), {
      minLeadMinutes: 30,
      weeklyHours: FRIDAY_HOURS,
    });
    // Rounded up to the quarter hour the backend reasons in.
    expect(picked).toEqual({ date: '2026-10-16', time: '20:45', partySize: 2 });
  });

  it("rolls to the next day's opening once tonight's last slot has gone", () => {
    // Friday 00:50 — the Thursday row closed at 23:59; Friday opens at 09:00.
    const picked = defaultSelection(YEREVAN, new Date('2026-10-15T20:50:00Z'), {
      minLeadMinutes: 30,
      weeklyHours: FRIDAY_HOURS,
    });
    expect(picked).toEqual({ date: '2026-10-16', time: '09:00', partySize: 2 });
  });

  it('never opens on a slot whose sitting would run past closing (QA 2026-10-16, P-B6)', () => {
    // Friday 22:35, open until 01:00, 30 minutes lead, two-hour sittings: 23:30
    // would end at 01:30, which the server refuses as closed.
    const picked = defaultSelection(YEREVAN, new Date('2026-10-16T18:35:00Z'), {
      minLeadMinutes: 30,
      turnTimeMinutes: 120,
      weeklyHours: [...FRIDAY_HOURS, { day: 6, blocks: [{ opensAt: '10:00', closesAt: '01:00' }] }],
    });
    expect(picked).toEqual({ date: '2026-10-17', time: '10:00', partySize: 2 });
  });

  it('keeps tonight when the sitting still fits before closing', () => {
    const picked = defaultSelection(YEREVAN, new Date('2026-10-16T17:35:00Z'), {
      minLeadMinutes: 30,
      turnTimeMinutes: 90,
      weeklyHours: FRIDAY_HOURS,
    });
    expect(picked).toEqual({ date: '2026-10-16', time: '22:15', partySize: 2 });
  });

  it('looks past a shut weekend for the next sitting', () => {
    // Friday 23:40: nothing fits tonight, and the next open day is Thursday.
    const picked = defaultSelection(YEREVAN, new Date('2026-10-16T19:40:00Z'), {
      minLeadMinutes: 30,
      turnTimeMinutes: 120,
      weeklyHours: FRIDAY_HOURS,
    });
    expect(picked).toEqual({ date: '2026-10-22', time: '09:00', partySize: 2 });
  });

  it('still clears the lead time when no hours are published', () => {
    const picked = defaultSelection(YEREVAN, new Date('2026-10-16T16:11:00Z'), {
      minLeadMinutes: 30,
      weeklyHours: [],
    });
    expect(picked.time).toBe('20:45');
  });
});

describe('the time select', () => {
  const HOURS = [{ day: 2, blocks: [{ opensAt: '18:00', closesAt: '21:00' }] }] as const;

  it('offers every quarter hour of a day when nothing else is known', () => {
    const all = timeOptions();
    expect(all).toHaveLength(96);
    expect(all.slice(0, 3)).toEqual(['00:00', '00:15', '00:30']);
  });

  it('offers the quarter hours whose sitting fits the hours while the day has not answered', () => {
    // Tuesday 2026-10-20, open 18:00 to 21:00, ninety-minute sittings: 19:30 is the last.
    const choices = timeChoices({
      date: '2026-10-20',
      day: undefined,
      weeklyHours: HOURS,
      turnTimeMinutes: 90,
      timeZoneId: YEREVAN,
    });
    expect(choices.map((choice) => choice.time)).toEqual([
      '18:00',
      '18:15',
      '18:30',
      '18:45',
      '19:00',
      '19:15',
      '19:30',
    ]);
    expect(choices.every((choice) => choice.state === 'free')).toBe(true);
  });

  it("takes the server's day once it has answered: struck, requestable, cut short, absent", () => {
    const slot = (time: string, extra: Partial<DaySlot> = {}): DaySlot => ({
      time,
      slotUtc: new Date(`2026-10-20T${time}:00+04:00`).toISOString(),
      isAvailable: true,
      requiresApproval: false,
      freeTableCount: 2,
      unavailableReason: null,
      ...extra,
    });
    const choices = timeChoices({
      date: '2026-10-20',
      day: {
        branchId: 'b',
        date: '2026-10-20',
        partySize: 2,
        stepMinutes: 15,
        unavailableReason: null,
        slots: [
          slot('18:00'),
          slot('18:15', {
            isAvailable: false,
            freeTableCount: 0,
            unavailableReason: 'alreadyBooked',
          }),
          slot('18:30', { requestable: true, requiresApproval: true }),
          slot('18:45', { mustFreeByUtc: '2026-10-20T15:25:00.000Z' }),
          // Too soon already: gone, not struck.
          slot('17:45', {
            isAvailable: false,
            freeTableCount: 0,
            unavailableReason: 'pastLeadTime',
          }),
        ],
      },
      weeklyHours: HOURS,
      turnTimeMinutes: 90,
      timeZoneId: YEREVAN,
    });
    expect(choices).toEqual([
      { time: '18:00', state: 'free', mustFreeByUtc: null },
      { time: '18:15', state: 'busy', mustFreeByUtc: null },
      { time: '18:30', state: 'requestable', mustFreeByUtc: null },
      { time: '18:45', state: 'free', mustFreeByUtc: '2026-10-20T15:25:00.000Z' },
    ]);
  });

  it('moves a selection off a struck time to the nearest that can be had', () => {
    const choices = [
      { time: '18:00', state: 'free', mustFreeByUtc: null },
      { time: '18:15', state: 'busy', mustFreeByUtc: null },
      { time: '18:30', state: 'requestable', mustFreeByUtc: null },
    ] as const;
    expect(nearestChoice(choices, '18:15')?.time).toBe('18:30');
    expect(nearestChoice(choices, '18:00')?.time).toBe('18:00');
    expect(
      nearestChoice([{ time: '18:15', state: 'busy', mustFreeByUtc: null }], '18:15'),
    ).toBeNull();
  });
});
