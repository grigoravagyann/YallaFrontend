import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import type { components } from '../generated/schema';
import {
  activityActorKind,
  activityCategory,
  activityEntryFromWire,
  activityParams,
  activityParamsFor,
  csvFileName,
} from './activityMapping';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, type FakeRoute } from './fakeBackend.testkit';
import { createStaffHttpGateway } from './staffHttpGateway';
import { serviceRequest } from './staffMapping';

/**
 * Activity history and staff results over HTTP (2026-10-24), against the
 * hand-written wire: the query strings, the tolerant reads (an enum as its
 * word or its 1-based number, `before`/`after`/`summary` as objects or JSON
 * text), and the floor's two writes.
 */

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

const ENTRY = {
  id: 'a-1',
  occurredAtUtc: '2026-10-24T14:31:00Z',
  actorKind: 'Staff',
  staffMemberId: 's-nare',
  actorName: 'Նարե Սարգսյան',
  deviceId: 'd-hall',
  deviceLabel: 'Սրահի պլանշետ',
  category: 'order',
  action: 'order.discounted',
  subjectType: 'Tab',
  subjectId: 'tab-2',
  tableLabel: '2',
  amountAmd: 1840,
  isMoney: true,
  beforeJson: '{"amountAmd":18400}',
  afterJson: '{"amountAmd":16560}',
  reason: 'Մշտական հյուր',
  summary: { percent: 10, nested: { dropped: true } },
};

const DAY = {
  date: '2026-10-24',
  who: { kind: 'everyone' as const },
  category: 'all' as const,
  q: '',
};

describe('reading an entry', () => {
  it('reads every field, JSON text and objects alike, and drops what is not a plain value', () => {
    expect(activityEntryFromWire(ENTRY)).toEqual({
      id: 'a-1',
      occurredAtUtc: '2026-10-24T14:31:00Z',
      actor: { kind: 'staff', staffMemberId: 's-nare', name: 'Նարե Սարգսյան' },
      device: { id: 'd-hall', label: 'Սրահի պլանշետ', isConsole: false },
      category: 'order',
      action: 'order.discounted',
      subject: { type: 'tab', id: 'tab-2' },
      tableLabel: '2',
      guestName: null,
      amountAmd: 1840,
      isMoney: true,
      before: { amountAmd: 18400 },
      after: { amountAmd: 16560 },
      reason: 'Մշտական հյուր',
      params: { percent: 10 },
    });
  });

  it('reads enums as words or 1-based numbers, and a missing category from the action', () => {
    expect(activityActorKind('platform-admin')).toBe('platformAdmin');
    expect(activityActorKind(3)).toBe('system');
    expect(activityActorKind(2)).toBe('diner');
    expect(activityCategory(4)).toBe('payment');
    expect(activityCategory(null, 'takeaway.accepted')).toBe('takeaway');
    expect(activityParams('not json')).toBeNull();
  });

  it('marks a console session: a staff entry with no device', () => {
    const entry = activityEntryFromWire({ ...ENTRY, deviceId: null, deviceLabel: 'Console' });
    expect(entry.device).toEqual({ id: null, label: 'Console', isConsole: true });
    const system = activityEntryFromWire({
      ...ENTRY,
      actorKind: 'System',
      deviceId: null,
      deviceLabel: null,
    });
    expect(system.actor).toEqual({ kind: 'system', staffMemberId: null, name: 'Նարե Սարգսյան' });
    expect(system.device.isConsole).toBe(false);
  });
});

describe('the feed', () => {
  it('sends the day always, the rest only when set', async () => {
    const { gateway, backend } = consoleOver({
      'GET /api/branches/b-1/activity': { body: { items: [ENTRY, { id: '' }], nextCursor: 'c2' } },
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
        body: '﻿occurredAtUtc,action\r\n',
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': "attachment; filename*=UTF-8''activity-2026-10-24.csv",
        },
      },
    });
    const file = await gateway.exportActivityCsv('b-1', { ...DAY, category: 'payment' });
    expect(file.fileName).toBe('activity-2026-10-24.csv');
    expect(await file.bytes.text()).toContain('occurredAtUtc,action');
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
  it('sorts the entries oldest first and reads the lines with who added and voided them', async () => {
    const { gateway } = consoleOver({
      'GET /api/branches/b-1/activity/subjects/tab/tab-4': {
        body: {
          subjectType: 'Tab',
          subjectId: 'tab-4',
          tableLabel: '4',
          partySize: 4,
          serverStaffMemberId: 's-aram',
          serverName: 'Արամ',
          totals: {
            itemsAmd: 21300,
            paidAmd: 22300,
            tipAmd: 2000,
            serviceChargeAmd: 1000,
            paidBy: 'Cash',
          },
          entries: [
            { ...ENTRY, id: 'late', occurredAtUtc: '2026-10-24T14:20:00Z' },
            { ...ENTRY, id: 'early', occurredAtUtc: '2026-10-24T13:12:00Z' },
          ],
          items: [
            {
              lineId: 'l-1',
              name: 'Խոզի խորոված',
              quantity: 1,
              amountAmd: 4800,
              addedByStaffMemberId: 's-aram',
              addedByName: 'Արամ',
              voided: true,
              voidedByStaffMemberId: 's-nare',
              voidedByName: 'Նարե',
              voidReason: 'Հյուրը փոխեց պատվերը',
            },
            { lineId: 'l-2', name: 'Թան', quantity: 3, amountAmd: 2100 },
          ],
        },
      },
    });
    const timeline = (await gateway.getActivityTimeline('b-1', { type: 'tab', id: 'tab-4' }))!;
    expect(timeline.entries.map((entry) => entry.id)).toEqual(['early', 'late']);
    expect(timeline.server).toEqual({ staffMemberId: 's-aram', name: 'Արամ' });
    expect(timeline.totals).toMatchObject({ paidBy: 'cash', discountAmd: 0 });
    expect(timeline.items[0]).toMatchObject({
      voided: true,
      voidedBy: { staffMemberId: 's-nare', name: 'Նարե' },
      addedBy: { staffMemberId: 's-aram', name: 'Արամ' },
    });
    // Ordered from the guest's phone: nobody on the staff added it.
    expect(timeline.items[1]!.addedBy).toBeNull();
  });

  it('answers null for a 404', async () => {
    const { gateway } = consoleOver({});
    expect(await gateway.getActivityTimeline('b-1', { type: 'reservation', id: 'r-1' })).toBeNull();
  });
});

describe('staff results', () => {
  it('reads the rows and the totals, a role as its code or its word', async () => {
    const { gateway, backend } = consoleOver({
      'GET /api/branches/b-1/staff-performance': {
        body: {
          rows: [
            {
              staffMemberId: 's-aram',
              name: 'Արամ',
              role: 3,
              tables: 9,
              guests: 26,
              salesAmd: 214600,
              tipsAmd: 18000,
              callClaimMedianSeconds: 48,
              callClaims: 12,
              messageReplyMedianSeconds: null,
              approvals: 4,
              cashAmd: 132000,
              cashCount: 6,
              discountCompCount: 1,
            },
            { staffMemberId: 's-nare', name: 'Նարե', role: 'Manager' },
          ],
          totals: { tables: 9, salesAmd: 214600 },
        },
      },
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
      averageCheckAmd: Math.round(214600 / 9),
      callMedianSeconds: 48,
      replyMedianSeconds: null,
      cashBills: 6,
      discountsAndComps: 1,
    });
    expect(result.rows[1]).toMatchObject({ role: 'manager', tables: 0, averageCheckAmd: null });
    expect(result).toMatchObject({ from: '2026-10-24', to: '2026-10-24' });
  });

  it('reads one person, and asks for one more page of one list with its cursor', async () => {
    const { gateway, backend } = consoleOver({
      'GET /api/branches/b-1/staff/s-aram/performance': (request) => ({
        body: request.query.get('list')
          ? {
              recent: {
                orders: { items: [{ ...ENTRY, id: 'o-21', responseSeconds: 12 }], total: 21 },
              },
            }
          : {
              name: 'Արամ',
              role: 'Waiter',
              figures: { salesAmd: 100 },
              daily: [
                { date: '2026-10-24', salesAmd: 100 },
                { date: '2026-10-23T00:00:00', salesAmd: 50 },
              ],
              recent: { orders: { items: [ENTRY], total: 21, nextCursor: 'a-1' } },
            },
      }),
    });
    const range = { from: '2026-10-23', to: '2026-10-24' };
    const page = (await gateway.getStaffMemberPerformance('b-1', 's-aram', range))!;
    expect(page.daily.map((day) => day.date)).toEqual(['2026-10-23', '2026-10-24']);
    expect(page.recent.orders).toMatchObject({ total: 21, nextCursor: 'a-1' });
    expect(page.recent.calls).toEqual({ items: [], total: 0, nextCursor: null });
    const more = await gateway.listStaffRecent('b-1', 's-aram', {
      ...range,
      list: 'orders',
      cursor: 'a-1',
    });
    expect(more.items[0]).toMatchObject({ id: 'o-21', responseSeconds: 12 });
    expect(Object.fromEntries(backend.requests[1]!.query.entries())).toEqual({
      ...range,
      list: 'orders',
      cursor: 'a-1',
    });
  });
});

describe('the floor', () => {
  type RequestWire = components['schemas']['Yalla.Application.Ordering.ServiceRequestView'];
  const REQUEST: RequestWire = {
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
        },
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
    });
  });
});
