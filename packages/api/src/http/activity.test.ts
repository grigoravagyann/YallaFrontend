import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { transferRefusalOf } from '../contracts/activity';
import type { components } from '../generated/schema';
import {
  activityActorKind,
  activityCategory,
  activityEntryFromWire,
  activityParams,
  activityParamsFor,
  activitySubjectSegment,
  activitySubjectType,
  csvFileName,
  type WireActivityItem,
} from './activityMapping';
import { floorChangeSignal } from './admissionMapping';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, type FakeRoute } from './fakeBackend.testkit';
import { createStaffHttpGateway } from './staffHttpGateway';
import { serviceRequest } from './staffMapping';

/**
 * Activity history and staff results over HTTP (2026-10-24), against the
 * generated wire (Yalla `docs/activity.md`): the query strings, every value a
 * string; the server's lowercase words; a booking's `summary.extra` and an
 * order's `summary.lines`; the floor's two writes and their refusals.
 */

type Schemas = components['schemas'];

function consoleOver(routes: Record<string, FakeRoute>) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  const gateway = createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
    auth,
    identity: createMemoryIdentityStore(),
  });
  return { gateway, backend };
}

const ENTRY: WireActivityItem = {
  id: 'a-1',
  occurredAtUtc: '2026-10-24T14:31:00Z',
  local: '2026-10-24 18:31',
  actorKind: 'staff',
  staffMemberId: 's-nare',
  actorName: 'Նարե Սարգսյան',
  deviceId: 'd-hall',
  deviceLabel: 'Սրահի պլանշետ',
  deviceKind: 'tablet',
  category: 'payment',
  action: 'payment.discount',
  subjectType: 'tab',
  subjectId: 'tab-2',
  tableSessionId: 'ts-2',
  tableLabel: '2',
  amountAmd: 1840,
  isMoney: true,
  before: { totalAmd: 18400 },
  after: { totalAmd: 16560 },
  reason: 'Մշտական հյուր',
  summary: {
    adjustmentId: 'adj-1',
    percent: 10,
    amountAmd: null,
    totalBeforeAmd: 18400,
    totalAfterAmd: 16560,
    nested: { dropped: true },
  },
};

const DAY = {
  date: '2026-10-24',
  who: { kind: 'everyone' as const },
  category: 'all' as const,
  q: '',
};

describe('reading an entry', () => {
  it('reads every field and drops what is not a plain value', () => {
    expect(activityEntryFromWire(ENTRY)).toEqual({
      id: 'a-1',
      occurredAtUtc: '2026-10-24T14:31:00Z',
      local: '2026-10-24 18:31',
      actor: { kind: 'staff', staffMemberId: 's-nare', name: 'Նարե Սարգսյան' },
      device: {
        id: 'd-hall',
        label: 'Սրահի պլանշետ',
        isConsole: false,
        kind: 'tablet',
        ownerName: null,
      },
      category: 'payment',
      action: 'payment.discount',
      subject: { type: 'tab', id: 'tab-2', code: null },
      tableSessionId: 'ts-2',
      tableLabel: '2',
      guestName: null,
      itemNames: null,
      amountAmd: 1840,
      isMoney: true,
      before: { totalAmd: 18400 },
      after: { totalAmd: 16560 },
      reason: 'Մշտական հյուր',
      params: {
        adjustmentId: 'adj-1',
        percent: 10,
        amountAmd: null,
        totalBeforeAmd: 18400,
        totalAfterAmd: 16560,
      },
      lines: [],
      seconds: null,
    });
  });

  it('flattens a booking’s extra, reads an order’s lines and the seconds', () => {
    const booking = activityEntryFromWire({
      ...ENTRY,
      category: 'booking',
      action: 'booking.auto-declined',
      actorKind: 'system',
      subjectType: 'reservation',
      subjectCode: 'B-1042',
      summary: {
        localDate: '2026-10-24',
        localTime: '21:30',
        partySize: 3,
        status: 7,
        extra: { declineReason: 2, deadlineUtc: '2026-10-24T14:12:00Z' },
      },
    });
    expect(booking.params).toEqual({
      localDate: '2026-10-24',
      localTime: '21:30',
      partySize: 3,
      status: 7,
      'extra.declineReason': 2,
      'extra.deadlineUtc': '2026-10-24T14:12:00Z',
    });
    expect(booking.subject).toEqual({ type: 'reservation', id: 'tab-2', code: 'B-1042' });
    const order = activityEntryFromWire({
      ...ENTRY,
      action: 'order.sent',
      itemNames: 'Խաշլամա, Թան',
      seconds: 48,
      summary: {
        items: 3,
        lines: [{ name: 'Խաշլամա', quantity: 2 }, { name: 'Թան', quantity: 1 }, { quantity: 4 }],
      },
    });
    expect(order.lines).toEqual([
      { name: 'Խաշլամա', quantity: 2 },
      { name: 'Թան', quantity: 1 },
    ]);
    expect(order.itemNames).toBe('Խաշլամա, Թան');
    expect(order.seconds).toBe(48);
    expect(order.params).toEqual({ items: 3 });
  });

  it('reads the server’s words, and falls back for one it does not know', () => {
    expect(activityActorKind('guest')).toBe('guest');
    expect(activityActorKind('platform')).toBe('platform');
    expect(activityActorKind('robot')).toBe('system');
    expect(activityCategory('device')).toBe('device');
    expect(activityCategory(null, 'takeaway.accepted')).toBe('takeaway');
    expect(activitySubjectType('menu-item')).toBe('menuItem');
    expect(activitySubjectType('service-request')).toBe('serviceRequest');
    expect(activitySubjectType('table-session')).toBe('tableSession');
    expect(activitySubjectType('staff')).toBe('staffMember');
    expect(activitySubjectType('wormhole')).toBe('other');
    expect(activitySubjectSegment('takeaway')).toBe('takeawayOrder');
    expect(activityParams('not an object')).toBeNull();
  });

  it('marks a console session: a staff entry with no device, labelled Console', () => {
    const entry = activityEntryFromWire({
      ...ENTRY,
      deviceId: null,
      deviceLabel: 'Console',
      deviceKind: 'console',
    });
    expect(entry.device).toEqual({
      id: null,
      label: 'Console',
      isConsole: true,
      kind: 'console',
      ownerName: null,
    });
    // An older server says only the label.
    const { deviceKind: _absent, ...older } = { ...ENTRY, deviceId: null, deviceLabel: 'Console' };
    expect(activityEntryFromWire(older).device).toEqual({
      id: null,
      label: 'Console',
      isConsole: true,
      kind: null,
      ownerName: null,
    });
    const system = activityEntryFromWire({
      ...ENTRY,
      actorKind: 'system',
      staffMemberId: null,
      actorName: null,
      deviceId: null,
      deviceLabel: null,
      deviceKind: null,
    });
    expect(system.actor).toEqual({ kind: 'system', staffMemberId: null, name: '' });
    expect(system.device.isConsole).toBe(false);
    expect(system.device.kind).toBeNull();
  });

  it("keeps a phone's person beside its English label, and only for a phone", () => {
    const phone = activityEntryFromWire({
      ...ENTRY,
      deviceId: 'd-phone',
      deviceLabel: "Aram's phone",
      deviceKind: 'phone',
      deviceOwnerName: 'Aram Petrosyan',
    });
    expect(phone.device).toEqual({
      id: 'd-phone',
      label: "Aram's phone",
      isConsole: false,
      kind: 'phone',
      ownerName: 'Aram Petrosyan',
    });
    // A word this client does not know is no kind; a person on a tablet is nobody.
    const odd = activityEntryFromWire({
      ...ENTRY,
      deviceKind: 'kiosk',
      deviceOwnerName: 'Aram Petrosyan',
    });
    expect(odd.device.kind).toBeNull();
    expect(odd.device.ownerName).toBeNull();
  });
});

describe('the feed', () => {
  it('sends the day always, the rest only when set, every value a string', async () => {
    const { gateway, backend } = consoleOver({
      'GET /api/branches/b-1/activity': {
        body: {
          items: [ENTRY, { ...ENTRY, id: '' }],
          nextCursor: 'c2',
          from: '2026-10-24',
          to: '2026-10-24',
        },
      },
    });
    const page = await gateway.listActivity('b-1', DAY);
    await gateway.listActivity('b-1', {
      ...DAY,
      who: { kind: 'staff', staffMemberId: 's-aram' },
      category: 'payment',
      q: '  T-482 ',
      cursor: 'c2',
    });
    await gateway.listActivity('b-1', { ...DAY, who: { kind: 'system' } });
    const queries = backend.requests.map((request) => Object.fromEntries(request.query.entries()));
    expect(queries).toEqual([
      { date: '2026-10-24', limit: '50' },
      {
        date: '2026-10-24',
        staffMemberId: 's-aram',
        category: 'payment',
        q: 'T-482',
        cursor: 'c2',
        limit: '50',
      },
      { date: '2026-10-24', actorKind: 'system', limit: '50' },
    ]);
    expect(page.items.map((entry) => entry.id)).toEqual(['a-1']);
    expect(page.nextCursor).toBe('c2');
  });

  it('downloads the server’s CSV under the name it gave', async () => {
    const { gateway, backend } = consoleOver({
      'GET /api/branches/b-1/activity.csv': {
        body: '﻿local,actorKind,action\r\n',
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition':
            "attachment; filename*=UTF-8''activity-2026-10-24-to-2026-10-24.csv",
        },
      },
    });
    const file = await gateway.exportActivityCsv('b-1', { ...DAY, category: 'payment' });
    expect(file.fileName).toBe('activity-2026-10-24-to-2026-10-24.csv');
    expect(await file.bytes.text()).toContain('local,actorKind,action');
    expect(Object.fromEntries(backend.requests[0]!.query.entries())).toEqual({
      date: '2026-10-24',
      category: 'payment',
    });
  });

  it('names a file from either form of the header, or falls back', () => {
    expect(csvFileName('attachment; filename="x.csv"', 'f.csv')).toBe('x.csv');
    expect(csvFileName(null, 'f.csv')).toBe('f.csv');
  });

  it('writes nothing it was not given', () => {
    expect(activityParamsFor(DAY)).toEqual({ date: '2026-10-24' });
  });
});

describe('a timeline', () => {
  const TIMELINE: Schemas['Yalla.Application.Activity.ActivityTimeline'] = {
    subjectType: 'tab',
    subjectId: 'tab-4',
    tab: {
      tabId: 'tab-4',
      tableSessionId: 'ts-4',
      tableLabel: '4',
      partySize: 4,
      openedAtUtc: '2026-10-24T13:12:30Z',
      seatedAtUtc: '2026-10-24T13:12:00Z',
      closedAtUtc: '2026-10-24T14:20:00Z',
      status: 3,
      subtotalAmd: 21300,
      serviceChargeAmd: 1000,
      totalAmd: 22300,
      paidAmd: 22300,
      tipsAmd: 2000,
      servers: [
        { staffMemberId: 's-aram', name: 'Արամ', fromUtc: '2026-10-24T13:40:00Z' },
        { staffMemberId: 's-lilit', name: 'Լիլիթ', fromUtc: '2026-10-24T13:12:00Z' },
      ],
    },
    lines: [
      {
        lineId: 'l-1',
        orderId: 'o-2',
        name: 'Խոզի խորոված',
        quantity: 1,
        unitPriceAmd: 4800,
        lineTotalAmd: 0,
        addedAtUtc: '2026-10-24T13:44:00Z',
        addedByStaffMemberId: 's-aram',
        addedByName: 'Արամ',
        addedByGuest: false,
        serverStaffMemberId: 's-aram',
        voidedAtUtc: '2026-10-24T14:15:00Z',
        voidedByStaffMemberId: 's-nare',
        voidedByName: 'Նարե',
        voidReason: 'Հյուրը փոխեց պատվերը',
      },
      {
        lineId: 'l-2',
        orderId: 'o-3',
        name: 'Թան',
        quantity: 3,
        unitPriceAmd: 700,
        lineTotalAmd: 2100,
        addedAtUtc: '2026-10-24T13:50:00Z',
        addedByName: 'Անի',
        addedByGuest: true,
      },
    ],
    entries: [
      { ...ENTRY, id: 'late', occurredAtUtc: '2026-10-24T14:20:00Z' },
      { ...ENTRY, id: 'early', occurredAtUtc: '2026-10-24T13:12:00Z' },
    ],
    people: [
      { staffMemberId: 's-lilit', name: 'Լիլիթ' },
      { staffMemberId: 's-aram', name: 'Արամ' },
    ],
  };

  it('reads the bill’s header, its waiters in turn, its lines and its entries oldest first', async () => {
    const { gateway, backend } = consoleOver({
      'GET /api/branches/b-1/activity/subjects/tab/tab-4': { body: TIMELINE },
    });
    const timeline = (await gateway.getActivityTimeline('b-1', { type: 'tab', id: 'tab-4' }))!;
    expect(backend.requests).toHaveLength(1);
    expect(timeline.entries.map((entry) => entry.id)).toEqual(['early', 'late']);
    expect(timeline.tab).toMatchObject({
      tableLabel: '4',
      status: 'closed',
      totalAmd: 22300,
      tipsAmd: 2000,
    });
    expect(timeline.tab!.servers.map((turn) => turn.staffMemberId)).toEqual(['s-lilit', 's-aram']);
    expect(timeline.booking).toBeNull();
    expect(timeline.lines[0]).toMatchObject({
      voided: true,
      voidedBy: { staffMemberId: 's-nare', name: 'Նարե' },
      addedBy: { staffMemberId: 's-aram', name: 'Արամ' },
    });
    // Ordered from the guest's phone: named, but nobody on the staff.
    expect(timeline.lines[1]).toMatchObject({
      addedByGuest: true,
      addedBy: { staffMemberId: null, name: 'Անի' },
      voided: false,
    });
    expect(timeline.people.map((one) => one.name)).toEqual(['Լիլիթ', 'Արամ']);
  });

  it('asks for a takeaway order under the route’s own word', async () => {
    const { gateway } = consoleOver({
      'GET /api/branches/b-1/activity/subjects/takeawayOrder/tk-1': {
        body: {
          subjectType: 'takeawayOrder',
          subjectId: 'tk-1',
          takeaway: {
            orderId: 'tk-1',
            code: 'T-482',
            guestName: 'Կարեն',
            status: 4,
            totalAmd: 5400,
            paidAmd: 5400,
            paymentMethod: 1,
            createdAtUtc: '2026-10-24T14:21:00Z',
            collectedAtUtc: '2026-10-24T14:50:00Z',
          },
          lines: [],
          entries: [],
          people: [],
        },
      },
    });
    const timeline = (await gateway.getActivityTimeline('b-1', { type: 'takeaway', id: 'tk-1' }))!;
    expect(timeline.subject).toEqual({ type: 'takeaway', id: 'tk-1' });
    expect(timeline.takeaway).toMatchObject({ code: 'T-482', paymentMethod: 'cash' });
  });

  it('answers null for a 404', async () => {
    const { gateway } = consoleOver({});
    expect(await gateway.getActivityTimeline('b-1', { type: 'reservation', id: 'r-1' })).toBeNull();
  });
});

describe('staff results', () => {
  const ROW: Schemas['Yalla.Application.Activity.StaffPerformanceRow'] = {
    staffMemberId: 's-aram',
    name: 'Արամ',
    role: 3,
    isActive: true,
    tables: 9,
    guests: 26,
    salesAmd: 214600,
    averageCheckAmd: 23844,
    tipsAmd: 18000,
    callsClaimed: 12,
    callClaimMedianSeconds: 48,
    messagesAnswered: 3,
    approvals: 4,
    declines: 1,
    cashAmd: 132000,
    cashPayments: 6,
    discounts: 1,
    comps: 2,
    adjustmentsAmd: 3100,
    voids: 1,
  };
  const ZEROS = {
    tables: 0,
    guests: 0,
    salesAmd: 0,
    averageCheckAmd: 0,
    tipsAmd: 0,
    callsClaimed: 0,
    messagesAnswered: 0,
    approvals: 0,
    declines: 0,
    cashAmd: 0,
    cashPayments: 0,
    discounts: 0,
    comps: 0,
    adjustmentsAmd: 0,
    voids: 0,
  };

  it('reads the rows and the totals the server counted once', async () => {
    const report: Schemas['Yalla.Application.Activity.StaffPerformanceReport'] = {
      branchId: 'b-1',
      from: '2026-10-24',
      to: '2026-10-24',
      staff: [ROW, { ...ZEROS, staffMemberId: 's-nare', name: 'Նարե', role: 2, isActive: true }],
      totals: {
        ...ZEROS,
        tables: 9,
        salesAmd: 220000,
        averageCheckAmd: 24444,
        unattributedSalesAmd: 5400,
        takeawayAmd: 9500,
      },
    };
    const { gateway, backend } = consoleOver({
      'GET /api/branches/b-1/staff-performance': { body: report },
    });
    const result = await gateway.getStaffPerformance('b-1', {
      from: '2026-10-24',
      to: '2026-10-24',
    });
    expect(Object.fromEntries(backend.requests[0]!.query.entries())).toEqual({
      from: '2026-10-24',
      to: '2026-10-24',
    });
    expect(result.rows[0]).toMatchObject({
      role: 'waiter',
      averageCheckAmd: 23844,
      callMedianSeconds: 48,
      replyMedianSeconds: null,
      declines: 1,
      cashPayments: 6,
      discounts: 1,
      comps: 2,
      voids: 1,
    });
    // Nothing to average is said as nothing, not the server's 0.
    expect(result.rows[1]).toMatchObject({ role: 'manager', tables: 0, averageCheckAmd: null });
    expect(result.totals).toMatchObject({
      salesAmd: 220000,
      unattributedSalesAmd: 5400,
      takeawayAmd: 9500,
    });
  });

  it('reads one person, and pages one of their lists by list and cursor', async () => {
    const person = (list: string, items: WireActivityItem[], nextCursor?: string) => ({
      branchId: 'b-1',
      from: '2026-10-23',
      to: '2026-10-24',
      kpis: ROW,
      dailySales: [
        { date: '2026-10-24', salesAmd: 100, tables: 1 },
        { date: '2026-10-23', salesAmd: 50, tables: 1 },
      ],
      recent: { list, items, ...(nextCursor ? { nextCursor } : {}) },
    });
    const { gateway, backend } = consoleOver({
      'GET /api/branches/b-1/staff/s-aram/performance': (request) => ({
        body:
          request.query.get('list') === 'calls'
            ? person('calls', [{ ...ENTRY, id: 'c-1', action: 'table.call-claimed', seconds: 31 }])
            : person('orders', [ENTRY], 'cur-1'),
      }),
    });
    const range = { from: '2026-10-23', to: '2026-10-24' };
    const page = (await gateway.getStaffMemberPerformance('b-1', 's-aram', range))!;
    expect(page).toMatchObject({ name: 'Արամ', role: 'waiter', isActive: true });
    expect(page.figures.salesAmd).toBe(214600);
    expect(page.daily.map((day) => [day.date, day.tables])).toEqual([
      ['2026-10-23', 1],
      ['2026-10-24', 1],
    ]);
    expect(page.recent).toMatchObject({ list: 'orders', nextCursor: 'cur-1' });
    const calls = await gateway.listStaffRecent('b-1', 's-aram', {
      ...range,
      list: 'calls',
      cursor: null,
    });
    expect(calls).toMatchObject({ list: 'calls', nextCursor: null });
    expect(calls.items[0]).toMatchObject({ id: 'c-1', seconds: 31 });
    await gateway.listStaffRecent('b-1', 's-aram', { ...range, list: 'orders', cursor: 'cur-1' });
    const queries = backend.requests.map((request) => Object.fromEntries(request.query.entries()));
    expect(queries).toEqual([
      range,
      { ...range, list: 'calls', limit: '20' },
      { ...range, list: 'orders', limit: '20', cursor: 'cur-1' },
    ]);
  });
  it('reads My results from the staff session, the branch named only when asked', async () => {
    const backend = fakeBackend({
      'GET /api/staff/me/performance': (request) => ({
        body: {
          branchId: 'b-1',
          from: request.query.get('from') ?? '',
          to: request.query.get('to') ?? '',
          kpis: ROW,
          dailySales: [{ date: '2026-10-24', salesAmd: 100, tables: 1 }],
          recent: {
            list: request.query.get('list') ?? 'orders',
            items: [{ ...ENTRY, id: 'm-1', action: 'message.sent', seconds: 95 }],
          },
        },
      }),
    });
    const staff = createStaffHttpGateway(backend.client());
    const range = { from: '2026-10-24', to: '2026-10-24' };
    const mine = await staff.getMyPerformance({ ...range, list: 'messages', limit: 5 });
    expect(mine).toMatchObject({ name: 'Արամ', from: '2026-10-24', to: '2026-10-24' });
    expect(mine.figures.salesAmd).toBe(214600);
    expect(mine.recent).toMatchObject({ list: 'messages', nextCursor: null });
    expect(mine.recent.items[0]).toMatchObject({ id: 'm-1', seconds: 95 });
    await staff.getMyPerformance({ ...range, branchId: 'b-2', limit: 500 });
    const queries = backend.requests.map((request) => Object.fromEntries(request.query.entries()));
    expect(queries).toEqual([
      { ...range, list: 'messages', limit: '5' },
      // An owner names the branch; the limit is the server's 1 to 100.
      { ...range, branchId: 'b-2', limit: '100' },
    ]);
  });
  it('reads My results in one request: the figures, the chart and every list', async () => {
    const page = (list: string, items: unknown[], nextCursor?: string) => ({
      list,
      items,
      ...(nextCursor ? { nextCursor } : {}),
    });
    const backend = fakeBackend({
      'GET /api/staff/me/results': (request) => ({
        body: {
          branchId: 'b-1',
          from: request.query.get('from') ?? '',
          to: request.query.get('to') ?? '',
          kpis: ROW,
          dailySales: [
            { date: '2026-10-24', salesAmd: 100, tables: 1 },
            { date: '2026-10-23', salesAmd: 0, tables: 0 },
          ],
          recent: {
            orders: page('orders', [{ ...ENTRY, id: 'o-1' }], 'cur-o'),
            messages: page('messages', [
              { ...ENTRY, id: 'm-1', action: 'message.sent', seconds: 95 },
            ]),
            bookings: page('bookings', []),
            cash: page('cash', []),
            // A list the server named oddly still lands where it was asked for.
            calls: page('nonsense', [{ ...ENTRY, id: 'c-1', seconds: 31 }]),
          },
        },
      }),
    });
    const staff = createStaffHttpGateway(backend.client());
    const range = { from: '2026-10-24', to: '2026-10-24' };
    const mine = await staff.getMyResults({ ...range, limit: 5 });
    expect(mine).toMatchObject({ name: 'Արամ', from: '2026-10-24', to: '2026-10-24' });
    expect(mine.figures.salesAmd).toBe(214600);
    expect(mine.daily.map((day) => day.date)).toEqual(['2026-10-23', '2026-10-24']);
    expect(mine.recent.orders).toMatchObject({ list: 'orders', nextCursor: 'cur-o' });
    expect(mine.recent.messages.items[0]).toMatchObject({ id: 'm-1', seconds: 95 });
    expect(mine.recent.bookings).toEqual({ list: 'bookings', items: [], nextCursor: null });
    expect(mine.recent.calls).toMatchObject({ list: 'calls', nextCursor: null });
    expect(mine.recent.calls.items[0]).toMatchObject({ id: 'c-1', seconds: 31 });
    await staff.getMyResults({ ...range, branchId: 'b-2', limit: 0 });
    await staff.getMyResults(range);
    expect(backend.requests.map((request) => request.path)).toEqual([
      '/api/staff/me/results',
      '/api/staff/me/results',
      '/api/staff/me/results',
    ]);
    const queries = backend.requests.map((request) => Object.fromEntries(request.query.entries()));
    expect(queries).toEqual([
      { ...range, limit: '5' },
      // An owner names the branch; the limit is the server's 1 to 100; absent, the server's 10.
      { ...range, branchId: 'b-2', limit: '1' },
      range,
    ]);
  });
});

describe('the floor', () => {
  const REQUEST: Schemas['Yalla.Application.Ordering.ServiceRequestView'] = {
    serviceRequestId: 'sr-1',
    tabId: 'tab-4',
    tableLabel: '4',
    preset: 3,
    createdAtUtc: '2026-10-24T14:15:29Z',
    waitingMinutes: 0,
    tabEventSequence: 4,
  };

  it('claims a call on the branch’s route and reads who took it', async () => {
    const backend = fakeBackend({
      'POST /api/branches/b-1/calls/sr-1/claim': {
        body: {
          ...REQUEST,
          claimedByStaffMemberId: 's-aram',
          claimedByName: 'Արամ',
          claimedAtUtc: '2026-10-24T14:16:00Z',
        },
      },
    });
    const claimed = await createStaffHttpGateway(backend.client()).claimServiceRequest({
      branchId: 'b-1',
      requestId: 'sr-1',
    });
    expect(claimed).toMatchObject({
      claimedByStaffMemberId: 's-aram',
      claimedByName: 'Արամ',
      claimedAtUtc: '2026-10-24T14:16:00Z',
    });
    // An unclaimed call carries none of the three.
    expect(serviceRequest(REQUEST)).not.toHaveProperty('claimedByName');
  });

  it('transfers a tab with the target and the command id', async () => {
    const backend = fakeBackend({
      'POST /api/tabs/tab-4/transfer': {
        body: {
          tabId: 'tab-4',
          serverStaffMemberId: 's-aram',
          serverName: 'Արամ',
          previousServerStaffMemberId: 's-lilit',
          previousServerName: 'Լիլիթ',
          transferredAtUtc: '2026-10-24T13:40:00Z',
          tableSessionId: 'ts-4',
          tableLabel: '4',
          wasReplay: false,
        } satisfies Schemas['Yalla.Application.Activity.TableTransferResult'],
      },
    });
    const result = await createStaffHttpGateway(backend.client()).transferTab({
      tabId: 'tab-4',
      toStaffMemberId: 's-aram',
      clientCommandId: 'cmd-1',
    });
    expect(backend.requests[0]!.body).toEqual({
      toStaffMemberId: 's-aram',
      clientCommandId: 'cmd-1',
    });
    expect(result).toEqual({
      tabId: 'tab-4',
      server: { staffMemberId: 's-aram', name: 'Արամ' },
      previousServer: { staffMemberId: 's-lilit', name: 'Լիլիթ' },
      transferredAtUtc: '2026-10-24T13:40:00Z',
      tableSessionId: 'ts-4',
      tableLabel: '4',
      wasReplay: false,
    });
  });

  it('lists who the table can go to, in the server’s order, and drops a row with no id', async () => {
    const backend = fakeBackend({
      'GET /api/tabs/tab-4/transfer-targets': {
        body: {
          items: [
            { staffMemberId: 's-aram', name: 'Արամ', role: 3, onShiftNow: true, openTables: 3 },
            { staffMemberId: 's-nare', name: 'Նարե', role: 2, onShiftNow: false, openTables: 0 },
            { staffMemberId: '', name: 'Nobody', role: 3, onShiftNow: true, openTables: 0 },
          ],
        } satisfies Schemas['Yalla.Application.Activity.TransferTargetsView'],
      },
    });
    const targets = await createStaffHttpGateway(backend.client()).listTransferTargets('tab-4');
    expect(targets).toEqual([
      { staffMemberId: 's-aram', name: 'Արամ', role: 'waiter', onShiftNow: true, openTables: 3 },
      { staffMemberId: 's-nare', name: 'Նարե', role: 'manager', onShiftNow: false, openTables: 0 },
    ]);
  });

  it('reads the change stream’s TableTransferred (7) by name', () => {
    expect(floorChangeSignal(7)).toBe('tableTransferred');
  });

  it('reads the change stream’s TabWrittenOff (9) by name', () => {
    expect(floorChangeSignal(9)).toBe('tabWrittenOff');
  });

  it('says why a transfer was refused: the target, or a bill that is over', async () => {
    const problem = (status: number, code: string, context: Record<string, unknown>) => ({
      status,
      body: { type: 'about:blank', title: 'Refused', status, code, detail: code, context },
      headers: { 'content-type': 'application/problem+json' },
    });
    const backend = fakeBackend({
      'POST /api/tabs/tab-1/transfer': problem(422, 'transfer-target-ineligible', {
        staffMemberId: 's-kitchen',
        reason: 'does-not-serve',
      }),
      'POST /api/tabs/tab-2/transfer': problem(409, 'tab-not-transferable', {
        tabId: 'tab-2',
        status: 3,
      }),
    });
    const staff = createStaffHttpGateway(backend.client());
    const refused = (tabId: string) =>
      staff
        .transferTab({ tabId, toStaffMemberId: 's-kitchen', clientCommandId: 'cmd' })
        .then(() => null)
        .catch((error: unknown) => transferRefusalOf(error));
    expect(await refused('tab-1')).toEqual({ kind: 'ineligible', reason: 'does-not-serve' });
    expect(await refused('tab-2')).toEqual({ kind: 'notTransferable' });
  });
});
