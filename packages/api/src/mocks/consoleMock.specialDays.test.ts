import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * The mock's special days answer as the server does (VC3 wire §1): the list
 * from the branch's today on, replaced whole, every refusal named at once.
 */

const BRANCH = 'b-lumen-cascade';
/** 19 October 2026, noon in Yerevan. */
const NOW = new Date('2026-10-19T08:00:00Z');

function gateway() {
  return createConsoleMockGateway({ latencyMs: 0, role: 'owner', now: () => NOW });
}

describe('special days in the mock', () => {
  it('opens on the coming New Year, as the Hours artboard draws it', async () => {
    const days = await gateway().getSpecialDays(BRANCH);
    expect(days.map((day) => [day.date, day.blocks.length])).toEqual([
      ['2026-12-31', 1],
      ['2027-01-01', 0],
      ['2027-01-06', 0],
    ]);
  });

  it('replaces the list whole and answers with it, earliest first', async () => {
    const mock = gateway();
    const saved = await mock.replaceSpecialDays({
      branchId: BRANCH,
      days: [
        {
          date: '2027-03-08',
          note: ' Women’s day ',
          blocks: [{ opensAt: '12:00', closesAt: '18:00' }],
        },
        { date: '2026-11-01', note: null, blocks: [] },
      ],
    });
    expect(saved.days.map((day) => day.date)).toEqual(['2026-11-01', '2027-03-08']);
    expect(saved.days[1]?.note).toBe('Women’s day');
    expect(await mock.getSpecialDays(BRANCH)).toEqual(saved.days);
  });

  it('refuses a past date, one past the horizon, a date twice and an overlap, all at once', async () => {
    const failure = await gateway()
      .replaceSpecialDays({
        branchId: BRANCH,
        days: [
          { date: '2026-10-18', note: null, blocks: [] },
          { date: '2027-12-01', note: null, blocks: [] },
          { date: '2026-12-24', note: null, blocks: [] },
          { date: '2026-12-24', note: null, blocks: [] },
          {
            date: '2026-12-25',
            note: null,
            blocks: [
              { opensAt: '10:00', closesAt: '15:00' },
              { opensAt: '14:00', closesAt: '20:00' },
            ],
          },
        ],
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).violations.map((v) => [v.field, v.bound])).toEqual([
      ['[0].date', 'min'],
      ['[1].date', 'max'],
      ['[3].date', 'conflict'],
      ['[4].blocks[1].opensAt', 'conflict'],
    ]);
  });

  it('puts the special day on the overview, and its hours in the pill', async () => {
    const mock = createConsoleMockGateway({
      latencyMs: 0,
      role: 'owner',
      // New Year's Eve, at lunch: the week says open, the special day says 18:00.
      now: () => new Date('2026-12-31T08:00:00Z'),
    });
    const overview = await mock.getBranchOverview(BRANCH);
    expect(overview.hours.specialDay?.note).toBe('New Year’s Eve');
    expect(overview.hours.isOpen).toBe(false);
    expect(overview.hours.opensAt?.slice(0, 5)).toBe('18:00');
  });
});
