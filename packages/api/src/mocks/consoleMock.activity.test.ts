import { describe, expect, it } from 'vitest';
import {
  defaultActivityFilters,
  performanceRange,
  type ActivityEntry,
  type ActivityFilters,
} from '../contracts/activity';
import { ForbiddenError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * Activity history and staff results in the console mock (2026-10-24): the
 * boards' day at Northern Avenue, filtered and paged as the server would, a
 * bill's timeline with who did what, and results that add up.
 */

const NORTH = 'b-lumen-north';
/** 18:38 in Yerevan: the board's last entry (18:36) is two minutes ago. */
const NOW = new Date('2026-10-24T14:38:00Z');
const TODAY = '2026-10-24';
const ARAM = `${NORTH}-act-aram`;
const LILIT = `${NORTH}-act-lilit`;

const failing = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

function gateway(role: 'owner' | 'manager' | 'waiter' = 'owner') {
  return createConsoleMockGateway({ latencyMs: 0, role, now: () => NOW, seedActivity: true });
}

function filters(overrides: Partial<ActivityFilters> = {}): ActivityFilters {
  return { ...defaultActivityFilters(TODAY), ...overrides };
}

async function wholeDay(overrides: Partial<ActivityFilters> = {}): Promise<ActivityEntry[]> {
  const mock = gateway();
  const out: ActivityEntry[] = [];
  let cursor: string | null = null;
  do {
    const page = await mock.listActivity(NORTH, { ...filters(overrides), cursor, limit: 20 });
    out.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

const clock = (entry: ActivityEntry) =>
  new Date(Date.parse(entry.occurredAtUtc) + 4 * 3_600_000).toISOString().slice(11, 16);

describe('the History feed', () => {
  it('opens on the boards’ day, newest first, with who, what and from where', async () => {
    const page = await gateway().listActivity(NORTH, filters());
    const [first, second] = page.items;
    expect(first).toMatchObject({
      action: 'message.sent',
      actor: { kind: 'staff', staffMemberId: ARAM, name: 'Aram Petrosyan' },
      guestName: 'Անի Մարտիրոսյան',
      tableLabel: '6',
    });
    expect(clock(first!)).toBe('18:36');
    expect(second).toMatchObject({ action: 'booking.approved', guestName: 'Լիլիթ Մանուկյան' });
    const times = page.items.map((entry) => Date.parse(entry.occurredAtUtc));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(times.every((time) => time <= NOW.getTime())).toBe(true);
  });

  it('carries the discount, the void with its reason, SHURJ’s decline and the price change', async () => {
    const day = await wholeDay();
    const discount = day.find((entry) => entry.action === 'order.discounted')!;
    expect(discount).toMatchObject({
      isMoney: true,
      tableLabel: '2',
      reason: 'Մշտական հյուր',
      params: { percent: 10 },
      device: { label: 'Սրահի պլանշետ', isConsole: false },
    });
    expect(discount.before).toEqual({ amountAmd: 18_400 });
    expect(discount.after).toEqual({ amountAmd: 16_560 });

    const voided = day.find((entry) => entry.action === 'order.lineVoided')!;
    expect(voided).toMatchObject({
      tableLabel: '4',
      reason: 'Հյուրը փոխեց պատվերը',
      amountAmd: 4_800,
      device: { isConsole: true },
    });

    const auto = day.find((entry) => entry.action === 'booking.autoDeclined')!;
    expect(auto.actor.kind).toBe('system');
    expect(auto.params['minutes']).toBe(15);

    const price = day.find((entry) => entry.action === 'settings.menuPrice')!;
    expect(price).toMatchObject({ before: { priceAmd: 600 }, after: { priceAmd: 700 } });
  });

  it('filters by person, by SHURJ, by kind and by table, guest, code or dish', async () => {
    const lilit = await wholeDay({ who: { kind: 'staff', staffMemberId: LILIT } });
    expect(lilit.length).toBeGreaterThan(0);
    expect(lilit.every((entry) => entry.actor.staffMemberId === LILIT)).toBe(true);

    const system = await wholeDay({ who: { kind: 'system' } });
    expect(system.map((entry) => entry.action)).toEqual(['booking.autoDeclined']);

    const money = await wholeDay({ category: 'payment' });
    expect(money.every((entry) => entry.category === 'payment')).toBe(true);

    const table4 = await wholeDay({ q: '4' });
    expect(table4.every((entry) => entry.tableLabel === '4')).toBe(true);
    expect(table4.map((entry) => entry.action)).toContain('table.transferred');

    expect((await wholeDay({ q: 't482' })).map((entry) => entry.params['code'])).toEqual(['T-482']);
    expect((await wholeDay({ q: 'Անի' })).length).toBeGreaterThan(1);
    expect((await wholeDay({ q: 'խորոված' })).some((entry) => entry.tableLabel === '4')).toBe(true);
  });

  it('pages by cursor without repeating or skipping', async () => {
    const mock = gateway();
    const first = await mock.listActivity(NORTH, { ...filters(), limit: 10 });
    expect(first.items).toHaveLength(10);
    const second = await mock.listActivity(NORTH, {
      ...filters(),
      limit: 10,
      cursor: first.nextCursor,
    });
    const ids = [...first.items, ...second.items].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(20);
    expect((await wholeDay()).slice(0, 20).map((entry) => entry.id)).toEqual(ids);
  });

  it('refuses a future day, a long search and a cursor it never issued, by name', async () => {
    const error = await failing(
      gateway().listActivity(NORTH, {
        ...filters({ date: '2026-10-25', q: 'x'.repeat(61) }),
        cursor: 'nope',
      }),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).violations.map((violation) => violation.field)).toEqual([
      'date',
      'q',
      'cursor',
    ]);
  });

  it('is read by a manager and above only', async () => {
    expect(await failing(gateway('waiter').listActivity(NORTH, filters()))).toBeInstanceOf(
      ForbiddenError,
    );
    expect((await gateway('manager').listActivity(NORTH, filters())).items.length).toBeGreaterThan(
      0,
    );
  });

  it('writes the same filters as a CSV with a BOM', async () => {
    const file = await gateway().exportActivityCsv(NORTH, filters({ category: 'payment' }));
    const bytes = new Uint8Array(await file.bytes.arrayBuffer());
    const text = await file.bytes.text();
    expect(file.fileName).toBe(`activity-${TODAY}.csv`);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text).toContain('payment.cash');
    expect(text).not.toContain('booking.approved');
  });
});

describe('a bill’s timeline (the Check board)', () => {
  it('shows table 4 seated by Lilit, handed to Aram, a dish voided by the manager, paid in cash', async () => {
    const mock = gateway();
    const day = await wholeDay({ q: '4' });
    const seated = day.find((entry) => entry.action === 'table.seated')!;
    const timeline = (await mock.getActivityTimeline(NORTH, {
      type: 'tab',
      id: seated.subject.id!,
    }))!;
    expect(timeline).toMatchObject({
      tableLabel: '4',
      partySize: 4,
      server: { staffMemberId: ARAM },
      totals: {
        itemsAmd: 21_300,
        serviceChargeAmd: 1_000,
        paidAmd: 22_300,
        tipAmd: 2_000,
        paidBy: 'cash',
      },
    });
    expect(timeline.entries.map((entry) => [clock(entry), entry.action])).toEqual([
      ['17:12', 'table.seated'],
      ['17:15', 'order.sent'],
      ['17:40', 'table.transferred'],
      ['17:44', 'order.sent'],
      ['17:52', 'order.ready'],
      ['18:02', 'table.callClaimed'],
      ['18:15', 'order.lineVoided'],
      ['18:16', 'table.callClaimed'],
      ['18:20', 'payment.cash'],
    ]);
    const pork = timeline.items.find((item) => item.voided)!;
    expect(pork).toMatchObject({
      name: 'Խոզի խորոված',
      addedBy: { staffMemberId: ARAM },
      voidReason: 'Հյուրը փոխեց պատվերը',
    });
    expect(timeline.items.filter((item) => item.addedBy?.staffMemberId === LILIT)).toHaveLength(2);
  });

  it('answers null for a subject the branch does not have', async () => {
    expect(await gateway().getActivityTimeline(NORTH, { type: 'tab', id: 'nope' })).toBeNull();
  });
});

describe('staff results', () => {
  it('lists the waiters and the manager, with totals that add up', async () => {
    const result = await gateway().getStaffPerformance(NORTH, performanceRange('today', TODAY));
    const ids = result.rows.map((row) => row.staffMemberId);
    expect(ids).toEqual(expect.arrayContaining([ARAM, LILIT, `${NORTH}-act-gor`]));
    const sum = (key: 'salesAmd' | 'tables' | 'tipsAmd' | 'cashAmd') =>
      result.rows.reduce((total, row) => total + row[key], 0);
    expect(result.totals.salesAmd).toBe(sum('salesAmd'));
    expect(result.totals.tables).toBe(sum('tables'));
    expect(result.totals.tipsAmd).toBe(sum('tipsAmd'));
    expect(result.totals.cashAmd).toBe(sum('cashAmd'));
  });

  it('gives a transferred table’s earlier dishes to the earlier waiter and the rest to the new one', async () => {
    const result = await gateway().getStaffPerformance(NORTH, performanceRange('today', TODAY));
    const aram = result.rows.find((row) => row.staffMemberId === ARAM)!;
    const lilit = result.rows.find((row) => row.staffMemberId === LILIT)!;
    // Lilit: table 3 (7 400), table 4 before the transfer (12 000), table 1 (6 200).
    expect(lilit.salesAmd).toBe(7_400 + 12_000 + 6_200);
    // Aram counts table 4 as his: it ended with him, with its tip.
    expect(aram.tables).toBeGreaterThanOrEqual(3);
    expect(aram.tipsAmd).toBe(1_000 + 2_000);
    // Calls: 40, 55, 31, 80, 31 seconds — the median is 40.
    expect(aram.callMedianSeconds).toBe(40);
    expect(aram.callsClaimed).toBe(5);
  });

  it('opens one person’s page with sales by day and lists that page on', async () => {
    const mock = gateway();
    const range = performanceRange('month', TODAY);
    const page = (await mock.getStaffMemberPerformance(NORTH, ARAM, range))!;
    expect(page.name).toBe('Aram Petrosyan');
    expect(page.daily).toHaveLength(30);
    expect(page.daily.at(-1)!.date).toBe(TODAY);
    expect(page.recent.orders.items.length).toBe(20);
    expect(page.recent.orders.total).toBeGreaterThan(20);
    const next = await mock.listStaffRecent(NORTH, ARAM, {
      ...range,
      list: 'orders',
      cursor: page.recent.orders.nextCursor!,
    });
    const ids = [...page.recent.orders.items, ...next.items].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(page.recent.calls.items[0]?.responseSeconds).toBe(31);
  });

  it('answers null for somebody who is not on the branch', async () => {
    expect(
      await gateway().getStaffMemberPerformance(NORTH, 'nobody', performanceRange('today', TODAY)),
    ).toBeNull();
  });
});
