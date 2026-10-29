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
 * Activity history and staff results in the console mock (2026-10-24), in the
 * backend's words (Yalla `docs/activity.md`): the boards' day at Northern
 * Avenue, filtered and paged as the server would, a bill's timeline with who
 * did what, and results counted by the server's rules.
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
      seconds: 180,
      local: '2026-10-24 18:36',
    });
    expect(clock(first!)).toBe('18:36');
    expect(second).toMatchObject({ action: 'booking.approved', guestName: 'Լիլիթ Մանուկյան' });
    const times = page.items.map((entry) => Date.parse(entry.occurredAtUtc));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(times.every((time) => time <= NOW.getTime())).toBe(true);
  });

  it('carries the discount, the void with its reason, Time to Eat’s decline and the price change', async () => {
    const day = await wholeDay();
    const discount = day.find((entry) => entry.action === 'payment.discount')!;
    expect(discount).toMatchObject({
      category: 'payment',
      isMoney: true,
      tableLabel: '2',
      reason: 'Մշտական հյուր',
      amountAmd: 1_840,
      params: { percent: 10, totalBeforeAmd: 18_400, totalAfterAmd: 16_560 },
      device: { label: 'Սրահի պլանշետ', isConsole: false },
    });
    expect(discount.before).toEqual({ totalAmd: 18_400 });
    expect(discount.after).toEqual({ totalAmd: 16_560 });

    const voided = day.find((entry) => entry.action === 'order.line-voided')!;
    expect(voided).toMatchObject({
      tableLabel: '4',
      reason: 'Հյուրը փոխեց պատվերը',
      amountAmd: 4_800,
      itemNames: 'Խոզի խորոված',
      params: { name: 'Խոզի խորոված', quantity: 1 },
      device: { isConsole: true, label: 'Console' },
    });

    const auto = day.find((entry) => entry.action === 'booking.auto-declined')!;
    expect(auto.actor.kind).toBe('system');
    expect(auto.params['extra.declineReason']).toBe(2);

    const price = day.find((entry) => entry.action === 'settings.menu-price')!;
    expect(price).toMatchObject({ before: { priceAmd: 600 }, after: { priceAmd: 700 } });

    const late = day.find((entry) => entry.action === 'booking.guest-answered')!;
    expect(late).toMatchObject({
      actor: { kind: 'guest' },
      params: { 'extra.answer': 'late', 'extra.minutes': 15 },
    });
    const order = day.find((entry) => entry.action === 'order.sent' && entry.tableLabel === '4')!;
    expect(order.lines.length).toBeGreaterThan(0);
  });

  it('filters by person, by Time to Eat, by kind and by table, guest, code or dish', async () => {
    const lilit = await wholeDay({ who: { kind: 'staff', staffMemberId: LILIT } });
    expect(lilit.length).toBeGreaterThan(0);
    expect(lilit.every((entry) => entry.actor.staffMemberId === LILIT)).toBe(true);

    const system = await wholeDay({ who: { kind: 'system' } });
    // Newest first: the automatic decline, then a tablet connected with a manager's code.
    expect(system.map((entry) => entry.action)).toEqual([
      'booking.auto-declined',
      'device.enrolled',
    ]);

    const money = await wholeDay({ category: 'payment' });
    expect(money.every((entry) => entry.category === 'payment')).toBe(true);

    const table4 = await wholeDay({ q: '4' });
    expect(table4.every((entry) => entry.tableLabel === '4')).toBe(true);
    expect(table4.map((entry) => entry.action)).toContain('table.transferred');

    expect((await wholeDay({ q: 't482' })).map((entry) => entry.action)).toEqual([
      'takeaway.accepted',
      'takeaway.placed',
    ]);
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

  it('writes the same filters as the server’s CSV, with a BOM', async () => {
    const file = await gateway().exportActivityCsv(NORTH, filters({ category: 'payment' }));
    const bytes = new Uint8Array(await file.bytes.arrayBuffer());
    const text = await file.bytes.text();
    expect(file.fileName).toBe(`activity-${TODAY}-to-${TODAY}.csv`);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text.replace(String.fromCharCode(0xfeff), '').split('\r\n')[0]).toBe(
      'local,actorKind,actorName,deviceLabel,category,action,subjectType,subjectId,subjectCode,' +
        'tableLabel,guestName,items,amountAmd,isMoney,seconds,reason,before,after,summary',
    );
    expect(text).toContain('payment.cash');
    expect(text).not.toContain('booking.approved');
  });
});

describe('a bill’s timeline (the Check board)', () => {
  it('shows table 4 seated by Lilit, handed to Aram, a dish voided by the manager, paid in cash', async () => {
    const mock = gateway();
    const day = await wholeDay({ q: '4' });
    const opened = day.find((entry) => entry.action === 'table.tab-opened')!;
    const timeline = (await mock.getActivityTimeline(NORTH, {
      type: 'tab',
      id: opened.subject.id!,
    }))!;
    expect(timeline.tab).toMatchObject({
      tableLabel: '4',
      partySize: 4,
      status: 'closed',
      subtotalAmd: 21_300,
      serviceChargeAmd: 1_000,
      totalAmd: 22_300,
      paidAmd: 22_300,
      tipsAmd: 2_000,
    });
    expect(timeline.tab!.servers.map((turn) => turn.staffMemberId)).toEqual([LILIT, ARAM]);
    expect(timeline.entries.map((entry) => [clock(entry), entry.action])).toEqual([
      ['17:12', 'table.seated'],
      ['17:12', 'table.tab-opened'],
      ['17:15', 'order.sent'],
      ['17:40', 'table.transferred'],
      ['17:44', 'order.sent'],
      ['17:52', 'order.ready'],
      ['18:02', 'table.call-claimed'],
      ['18:15', 'order.line-voided'],
      ['18:16', 'table.call-claimed'],
      ['18:20', 'payment.cash'],
    ]);
    const pork = timeline.lines.find((line) => line.voided)!;
    expect(pork).toMatchObject({
      name: 'Խոզի խորոված',
      lineTotalAmd: 0,
      addedBy: { staffMemberId: ARAM },
      serverStaffMemberId: ARAM,
      voidReason: 'Հյուրը փոխեց պատվերը',
    });
    expect(timeline.lines.filter((line) => line.addedBy?.staffMemberId === LILIT)).toHaveLength(2);
    expect(timeline.people.map((one) => one.staffMemberId)).toEqual(
      expect.arrayContaining([LILIT, ARAM]),
    );
  });

  it('opens a takeaway order and a booking with their headers', async () => {
    const mock = gateway();
    const [accepted] = await wholeDay({ q: 'T-482' });
    const order = (await mock.getActivityTimeline(NORTH, {
      type: 'takeaway',
      id: accepted!.subject.id!,
    }))!;
    expect(order.takeaway).toMatchObject({ code: 'T-482', status: 2 });
    expect(order.entries.map((entry) => entry.action)).toEqual([
      'takeaway.placed',
      'takeaway.accepted',
    ]);
    const [auto] = await wholeDay({ who: { kind: 'system' } });
    const booking = (await mock.getActivityTimeline(NORTH, {
      type: 'reservation',
      id: auto!.subject.id!,
    }))!;
    expect(booking.booking).toMatchObject({ guestName: 'Արման Գևորգյան', localTime: '21:30' });
  });

  it('answers null for a subject the branch does not have', async () => {
    expect(await gateway().getActivityTimeline(NORTH, { type: 'tab', id: 'nope' })).toBeNull();
  });
});

describe('staff results', () => {
  it('lists the waiters and the manager, with totals counted once', async () => {
    const result = await gateway().getStaffPerformance(NORTH, performanceRange('today', TODAY));
    const ids = result.rows.map((row) => row.staffMemberId);
    expect(ids).toEqual(expect.arrayContaining([ARAM, LILIT, `${NORTH}-act-gor`]));
    const sum = (key: 'salesAmd' | 'tables' | 'tipsAmd' | 'cashAmd') =>
      result.rows.reduce((total, row) => total + row[key], 0);
    // Four bills closed today; table 4 was two waiters' but is one table.
    expect(result.totals.tables).toBe(4);
    expect(sum('tables')).toBe(5);
    expect(result.totals.salesAmd).toBe(9_600 + 7_400 + 22_300 + 9_100);
    expect(result.totals.salesAmd).toBe(sum('salesAmd'));
    expect(result.totals.tipsAmd).toBe(sum('tipsAmd'));
    expect(result.totals.cashAmd).toBe(sum('cashAmd'));
    expect(result.totals).toMatchObject({ takeawayAmd: 4_100, unattributedSalesAmd: 0 });
    expect(result.totals.averageCheckAmd).toBe(Math.round(48_400 / 4));
  });

  it('splits a transferred table’s bill by whose dishes they were, the tip to the closer', async () => {
    const result = await gateway().getStaffPerformance(NORTH, performanceRange('today', TODAY));
    const aram = result.rows.find((row) => row.staffMemberId === ARAM)!;
    const lilit = result.rows.find((row) => row.staffMemberId === LILIT)!;
    const nare = result.rows.find((row) => row.role === 'manager')!;
    // Table 4's 22 300 over Lilit's 12 000 of dishes and Aram's 9 300, largest remainder.
    expect(lilit.salesAmd).toBe(7_400 + 12_563);
    expect(aram.salesAmd).toBe(9_600 + 9_737);
    expect(aram.tables).toBe(2);
    expect(aram.tipsAmd).toBe(1_000 + 2_000);
    // Cash at tables, and T-478 at the counter.
    expect(aram).toMatchObject({ cashAmd: 9_600 + 22_300 + 4_100, cashPayments: 3 });
    // Calls: 40, 55, 31, 80, 31 seconds — the median is 40.
    expect(aram.callMedianSeconds).toBe(40);
    expect(aram.callsClaimed).toBe(5);
    expect(aram).toMatchObject({ approvals: 2, declines: 1 });
    expect(nare).toMatchObject({ discounts: 1, comps: 0, adjustmentsAmd: 1_840, voids: 1 });
    expect(result.rows.some((row) => row.role === 'kitchen')).toBe(false);
  });

  it('opens one person’s page with sales by day and pages a list', async () => {
    const mock = gateway();
    const range = performanceRange('month', TODAY);
    const page = (await mock.getStaffMemberPerformance(NORTH, ARAM, range))!;
    expect(page.name).toBe('Aram Petrosyan');
    expect(page.daily).toHaveLength(30);
    expect(page.daily.at(-1)!.date).toBe(TODAY);
    expect(page.recent.list).toBe('orders');
    expect(page.recent.items.length).toBe(20);
    expect(page.recent.nextCursor).not.toBeNull();
    const next = await mock.listStaffRecent(NORTH, ARAM, {
      ...range,
      list: 'orders',
      cursor: page.recent.nextCursor,
    });
    const ids = [...page.recent.items, ...next.items].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const calls = await mock.listStaffRecent(NORTH, ARAM, {
      ...range,
      list: 'calls',
      cursor: null,
    });
    expect(calls.items[0]?.seconds).toBe(31);
    const today = (await mock.getStaffMemberPerformance(
      NORTH,
      ARAM,
      performanceRange('today', TODAY),
    ))!;
    // A week ending on the day, at least.
    expect(today.daily).toHaveLength(7);
  });

  it('answers null for somebody who is not on the branch', async () => {
    expect(
      await gateway().getStaffMemberPerformance(NORTH, 'nobody', performanceRange('today', TODAY)),
    ).toBeNull();
  });
});
