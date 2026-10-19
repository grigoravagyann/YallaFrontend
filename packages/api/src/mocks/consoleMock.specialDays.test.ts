import { describe, expect, it } from 'vitest';
import { ConcurrencyConflictError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * The mock's special days answer as the server does (VC3 wire §1, round 2):
 * a versioned list from the service date on, replaced whole against the
 * version it was read at, past entries ignored, every refusal named at once.
 */

const BRANCH = 'b-lumen-cascade';
/** 19 October 2026, noon in Yerevan. */
const NOW = new Date('2026-10-19T08:00:00Z');

function gateway(now: Date = NOW) {
  return createConsoleMockGateway({ latencyMs: 0, role: 'owner', now: () => now });
}

describe('special days in the mock', () => {
  it('opens on the coming New Year, as the Hours artboard draws it, at version 0', async () => {
    const list = await gateway().getSpecialDays(BRANCH);
    expect(list.version).toBe('0');
    expect(list.days.map((day) => [day.date, day.blocks.length])).toEqual([
      ['2026-12-31', 1],
      ['2027-01-01', 0],
      ['2027-01-06', 0],
    ]);
  });

  it('replaces the list whole against its version, and moves the version on', async () => {
    const mock = gateway();
    const { version } = await mock.getSpecialDays(BRANCH);
    const saved = await mock.replaceSpecialDays({
      branchId: BRANCH,
      expectedVersion: version,
      days: [
        {
          date: '2027-03-08',
          note: ' Women’s day ',
          blocks: [{ opensAt: '12:00', closesAt: '18:00' }],
        },
        { date: '2026-11-01', note: null, blocks: [] },
      ],
    });
    expect(saved.version).not.toBe(version);
    expect(saved.days.map((day) => day.date)).toEqual(['2026-11-01', '2027-03-08']);
    expect(saved.days[1]?.note).toBe('Women’s day');
    expect(await mock.getSpecialDays(BRANCH)).toEqual({ version: saved.version, days: saved.days });
  });

  it('refuses a save against a version somebody else moved on, and writes nothing', async () => {
    const mock = gateway();
    const { version, days } = await mock.getSpecialDays(BRANCH);
    await mock.replaceSpecialDays({ branchId: BRANCH, expectedVersion: version, days: [] });

    const failure = await mock
      .replaceSpecialDays({ branchId: BRANCH, expectedVersion: version, days })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConcurrencyConflictError);
    expect((await mock.getSpecialDays(BRANCH)).days).toEqual([]);
  });

  it('ignores a past entry, and names every other problem under days, all at once', async () => {
    const mock = gateway();
    const { version } = await mock.getSpecialDays(BRANCH);
    const failure = await mock
      .replaceSpecialDays({
        branchId: BRANCH,
        expectedVersion: version,
        days: [
          { date: '2026-10-18', note: 'x'.repeat(80), blocks: [] },
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
      ['days[1].date', 'max'],
      ['days[3].date', 'conflict'],
      ['days[4].blocks[1].opensAt', 'conflict'],
    ]);

    const saved = await mock.replaceSpecialDays({
      branchId: BRANCH,
      expectedVersion: version,
      days: [
        { date: '2026-10-18', note: null, blocks: [] },
        { date: '2026-11-02', note: null, blocks: [] },
      ],
    });
    expect(saved.days.map((day) => day.date)).toEqual(['2026-11-02']);
  });

  it("starts with last night's entry while its block still runs past midnight", async () => {
    let clock = NOW;
    const mock = createConsoleMockGateway({ latencyMs: 0, role: 'owner', now: () => clock });
    // Seeded in October: the coming New Year.
    await mock.getSpecialDays(BRANCH);

    // 01:00 on 1 January in Yerevan, inside the 31st's 18:00–03:00.
    clock = new Date('2026-12-31T21:00:00Z');
    expect((await mock.getSpecialDays(BRANCH)).days[0]?.date).toBe('2026-12-31');

    // 04:00: the night is over, and the list starts today.
    clock = new Date('2027-01-01T00:00:00Z');
    expect((await mock.getSpecialDays(BRANCH)).days[0]?.date).toBe('2027-01-01');
  });

  it('puts the special day on the overview, and its hours in the pill', async () => {
    // New Year's Eve, at lunch: the week says open, the special day says 18:00.
    const mock = gateway(new Date('2026-12-31T08:00:00Z'));
    const overview = await mock.getBranchOverview(BRANCH);
    expect(overview.hours.specialDay?.note).toBe('New Year’s Eve');
    expect(overview.hours.isOpen).toBe(false);
    expect(overview.hours.opensAt?.slice(0, 5)).toBe('18:00');
  });
});

describe("the menu's round 2 in the mock", () => {
  it('puts a new category and a new dish last when no order is sent', async () => {
    const mock = gateway();
    const before = await mock.getAdminMenu(BRANCH);
    const category = await mock.createCategory({ branchId: BRANCH, name: 'Tea' });
    expect(category.displayOrder).toBeGreaterThan(Math.max(...before.map((c) => c.displayOrder)));

    const first = before[0]!;
    const dish = await mock.createMenuItem({
      branchId: BRANCH,
      item: {
        categoryId: first.id,
        name: 'Doppio',
        description: '',
        priceDram: 900,
        ingredients: '',
        allergens: '',
        portionSize: '',
        spiceLevel: 'notSpicy',
        prepMinutes: null,
        photoId: null,
      },
    });
    expect(dish.displayOrder).toBeGreaterThan(Math.max(...first.items.map((i) => i.displayOrder)));
  });

  it("takes a dish's photo off, leaving it unfinished", async () => {
    const mock = gateway();
    const withPhoto = (await mock.getAdminMenu(BRANCH))
      .flatMap((category) => category.items)
      .find((item) => item.photo.photoId)!;
    const item = await mock.removeMenuItemPhoto({ branchId: BRANCH, itemId: withPhoto.id });
    expect(item.photo.photoId).toBe('');
  });
});
