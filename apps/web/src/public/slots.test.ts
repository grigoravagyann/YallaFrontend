import { describe, expect, it } from 'vitest';
import type { DaySlot } from '@yalla/api';
import {
  PARTY_MAX,
  bookingDays,
  dayPartOf,
  defaultChoice,
  defaultSelection,
  nearestChoice,
  needsNextDay,
  partyBounds,
  serviceDayChoices,
  serviceDayOf,
  slotInstant,
  slotProblem,
  timeChoices,
  timeOptions,
  type TimeChoice,
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
    // Not answered: nothing is known to confirm at once, or to wait (review S5).
    expect(choices.every((choice) => choice.confirmsAtOnce === null)).toBe(true);
    expect(choices.every((choice) => choice.date === '2026-10-20')).toBe(true);
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
    const date = '2026-10-20';
    expect(choices).toEqual([
      { date, time: '18:00', state: 'free', mustFreeByUtc: null, confirmsAtOnce: true },
      { date, time: '18:15', state: 'busy', mustFreeByUtc: null, confirmsAtOnce: false },
      { date, time: '18:30', state: 'requestable', mustFreeByUtc: null, confirmsAtOnce: false },
      {
        date,
        time: '18:45',
        state: 'free',
        mustFreeByUtc: '2026-10-20T15:25:00.000Z',
        confirmsAtOnce: true,
      },
    ]);
  });

  it('moves a selection off a struck time to the nearest that can be had', () => {
    const choices = [choice('18:00'), choice('18:15', 'busy'), choice('18:30', 'requestable')];
    expect(nearestChoice(choices, '18:15')?.time).toBe('18:30');
    expect(nearestChoice(choices, '18:00')?.time).toBe('18:00');
    expect(nearestChoice([choice('18:15', 'busy')], '18:15')).toBeNull();
  });
});

/** A time chip's choice: `free` confirms at once unless said otherwise. */
function choice(
  time: string,
  state: TimeChoice['state'] = 'free',
  confirmsAtOnce: boolean | null = state === 'free',
  date = '2026-10-20',
): TimeChoice {
  return { date, time, state, mustFreeByUtc: null, confirmsAtOnce };
}

/**
 * The time the page puts the visitor on (public-page HANDOFF §3, user decision
 * 2026-10-20): the first time that confirms at once, and an on-request one only
 * when the day has nothing else. The first slot past the lead used to be it,
 * so a visitor opening the page tonight started on the approval path.
 */
describe('the default time', () => {
  it('is the first time that confirms at once, past earlier on-request ones', () => {
    const picked = defaultChoice([
      choice('18:00', 'busy'),
      choice('18:15', 'requestable'),
      // Free, but the venue answers first: short notice, or a party above the limit.
      choice('18:30', 'free', false),
      choice('18:45'),
      choice('19:00'),
    ]);
    expect(picked?.time).toBe('18:45');
  });

  it('falls back to the first on-request time when nothing confirms at once', () => {
    const picked = defaultChoice([
      choice('18:00', 'busy'),
      choice('18:15', 'free', false),
      choice('18:30', 'requestable'),
    ]);
    expect(picked?.time).toBe('18:15');
  });

  it('prefers the part of the day the visitor is in, and confirming at once over the part', () => {
    const day = [
      choice('12:00', 'free', false),
      choice('12:15'),
      choice('19:00', 'busy'),
      choice('19:15', 'free', false),
      choice('19:30'),
    ];
    expect(defaultChoice(day, 'evening')?.time).toBe('19:30');
    expect(defaultChoice(day, 'day')?.time).toBe('12:15');
    // An evening with only on-request times: the day's confirming one comes first.
    expect(defaultChoice(day.slice(0, 4), 'evening')?.time).toBe('12:15');
    // Nothing confirms anywhere: the evening's first on-request time.
    expect(
      defaultChoice([choice('12:00', 'free', false), choice('19:15', 'free', false)], 'evening')
        ?.time,
    ).toBe('19:15');
  });

  it('is nothing when every time is full', () => {
    expect(defaultChoice([choice('18:00', 'busy'), choice('18:15', 'busy')])).toBeNull();
    expect(defaultChoice([])).toBeNull();
  });

  it("marks a time the venue answers first as not confirming at once, from the server's day", () => {
    const choices = timeChoices({
      date: '2026-10-20',
      day: {
        branchId: 'b',
        date: '2026-10-20',
        partySize: 2,
        stepMinutes: 15,
        unavailableReason: null,
        slots: [
          {
            time: '18:00',
            slotUtc: '2026-10-20T14:00:00.000Z',
            isAvailable: true,
            requiresApproval: true,
            freeTableCount: 3,
            unavailableReason: null,
          },
          {
            time: '18:15',
            slotUtc: '2026-10-20T14:15:00.000Z',
            isAvailable: true,
            requiresApproval: false,
            freeTableCount: 3,
            unavailableReason: null,
          },
        ],
      },
      weeklyHours: [],
      turnTimeMinutes: 90,
      timeZoneId: YEREVAN,
    });
    expect(choices.map((entry) => [entry.time, entry.state, entry.confirmsAtOnce])).toEqual([
      ['18:00', 'free', false],
      ['18:15', 'free', true],
    ]);
    expect(defaultChoice(choices)?.time).toBe('18:15');
  });
});

describe('the parts of the day', () => {
  it('puts the afternoon in the day and the evening and the small hours in the evening', () => {
    expect(dayPartOf('09:00')).toBe('day');
    expect(dayPartOf('16:45')).toBe('day');
    expect(dayPartOf('17:00')).toBe('evening');
    expect(dayPartOf('23:45')).toBe('evening');
    expect(dayPartOf('00:30')).toBe('evening');
    expect(dayPartOf('05:00')).toBe('day');
  });
});

describe('the day chips', () => {
  it("are a week from the branch's today, and the rest of a longer window is behind 'other day'", () => {
    const days = bookingDays('2026-10-20', 14);
    expect(days.chips).toEqual([
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
    ]);
    expect(days.last).toBe('2026-11-03');
    expect(days.more).toBe(true);
  });

  it('stop at the end of a short window, with no other day to reach', () => {
    const days = bookingDays('2026-10-20', 3);
    expect(days.chips).toEqual(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
    expect(days.last).toBe('2026-10-23');
    expect(days.more).toBe(false);
  });

  it('are today alone for a venue that only books the same day', () => {
    expect(bookingDays('2026-10-20', 0)).toEqual({
      chips: ['2026-10-20'],
      last: '2026-10-20',
      more: false,
    });
  });
});

describe('the party stepper', () => {
  it('runs from one to the largest table, never past the page top', () => {
    expect(partyBounds(6)).toEqual({ min: 1, max: 6 });
    expect(partyBounds(14)).toEqual({ min: 1, max: PARTY_MAX });
    expect(PARTY_MAX).toBe(10);
  });

  it('runs to the page top while the tables are unknown', () => {
    expect(partyBounds(null)).toEqual({ min: 1, max: PARTY_MAX });
  });
});

/**
 * The service day (review B1). The backend files a booking under the day its
 * opening block began: 00:30 on Friday inside Thursday's 18:00–02:00 is
 * Thursday night's. A date's own 00:00–02:00 slots are the night before — so a
 * day chip shows its own evening and then its night past midnight, and never
 * opens on the previous night's 00:00.
 */
describe('the service day of a late-closing venue', () => {
  const LATE = ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({
    day,
    blocks: [{ opensAt: '18:00', closesAt: '02:00' }],
  }));
  const rules = { weeklyHours: LATE, turnTimeMinutes: 90, timeZoneId: YEREVAN } as const;

  it('files the small hours under the night they belong to', () => {
    expect(serviceDayOf('2026-10-23', '00:30', LATE, YEREVAN)).toBe('2026-10-22');
    expect(serviceDayOf('2026-10-22', '19:00', LATE, YEREVAN)).toBe('2026-10-22');
    // Outside every block: its own calendar day.
    expect(serviceDayOf('2026-10-22', '12:00', LATE, YEREVAN)).toBe('2026-10-22');
    // A block that closes at midnight does not run past it.
    const MIDNIGHT = [{ day: 4, blocks: [{ opensAt: '18:00', closesAt: '00:00' }] }] as const;
    expect(needsNextDay('2026-10-22', MIDNIGHT, YEREVAN)).toBe(false);
    expect(needsNextDay('2026-10-22', LATE, YEREVAN)).toBe(true);
  });

  it("opens a day on its own evening, never on the night before's 00:00", () => {
    const choices = serviceDayChoices({
      serviceDate: '2026-10-22',
      day: undefined,
      nextDay: undefined,
      ...rules,
    });
    expect(choices[0]).toMatchObject({ date: '2026-10-22', time: '18:00' });
    // Its own night runs on past midnight, on the next calendar date.
    expect(choices.at(-1)).toMatchObject({ date: '2026-10-23', time: '00:30' });
    expect(choices.some((entry) => entry.date === '2026-10-22' && entry.time === '00:00')).toBe(
      false,
    );
    expect(defaultChoice(choices, 'evening')).toMatchObject({ date: '2026-10-22', time: '18:00' });
    expect(defaultChoice(choices, 'day')).toMatchObject({ date: '2026-10-22', time: '18:00' });
  });

  it("takes both server days: this date's evening, the next date's small hours", () => {
    const slot = (date: string, time: string, extra: Partial<DaySlot> = {}): DaySlot => ({
      time,
      slotUtc: new Date(`${date}T${time}:00+04:00`).toISOString(),
      isAvailable: true,
      requiresApproval: false,
      freeTableCount: 2,
      unavailableReason: null,
      ...extra,
    });
    const day = (date: string, slots: DaySlot[]) => ({
      branchId: 'b',
      date,
      partySize: 2,
      stepMinutes: 15,
      unavailableReason: null,
      slots,
    });
    const choices = serviceDayChoices({
      serviceDate: '2026-10-22',
      // The 22nd's own 00:00 is Wednesday night's, and confirms at once.
      day: day('2026-10-22', [
        slot('2026-10-22', '00:00'),
        slot('2026-10-22', '18:00', { requiresApproval: true }),
        slot('2026-10-22', '18:15'),
      ]),
      nextDay: day('2026-10-23', [
        slot('2026-10-23', '00:15', {
          isAvailable: false,
          freeTableCount: 0,
          unavailableReason: 'alreadyBooked',
        }),
        slot('2026-10-23', '18:00'),
      ]),
      ...rules,
    });
    expect(choices.map((entry) => `${entry.date} ${entry.time} ${entry.state}`)).toEqual([
      '2026-10-22 18:00 free',
      '2026-10-22 18:15 free',
      '2026-10-23 00:15 busy',
    ]);
    expect(defaultChoice(choices)).toMatchObject({ date: '2026-10-22', time: '18:15' });
  });

  it('moves a struck time to the nearest across midnight, by the clock of the night', () => {
    const choices = [
      choice('23:30', 'busy', false, '2026-10-22'),
      choice('23:45', 'free', true, '2026-10-22'),
      choice('00:00', 'free', true, '2026-10-23'),
    ];
    expect(nearestChoice(choices, '23:30', '2026-10-22')).toMatchObject({ time: '23:45' });
    expect(nearestChoice(choices, '00:15', '2026-10-23')).toMatchObject({ time: '00:00' });
    // 23:30 and 00:00 are both a quarter hour from a struck 23:45: the later one,
    // which is after midnight — not 00:00 read as the start of the evening.
    const around = [
      choice('23:30', 'free', true, '2026-10-22'),
      choice('23:45', 'busy', false, '2026-10-22'),
      choice('00:00', 'free', true, '2026-10-23'),
    ];
    expect(nearestChoice(around, '23:45', '2026-10-22')).toMatchObject({
      date: '2026-10-23',
      time: '00:00',
    });
  });
});
