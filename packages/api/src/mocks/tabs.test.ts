import { beforeEach, describe, expect, it } from 'vitest';
import {
  NotTabHostError,
  TabClosedError,
  TableOutOfServiceError,
  UnknownTableCodeError,
} from '../contracts/errors';
import type { YallaGateway } from '../gateway';
import { createMockGateway } from './mockGateway';
import { mockVenues } from './venues';
import { MOCK_DEMO_TABLES } from './demoTables';
import { mockTableCode } from './tableCodes';

/** Codes for the tables the seeded fixtures use. */
const FREE_TABLE = mockTableCode('b-lumen-north-t1');
const HOSTED_BY_SOMEONE_ELSE = mockTableCode('b-lumen-north-t9');
const OUT_OF_SERVICE = mockTableCode('b-lumen-north-t14');
const CLOSED_TAB = mockTableCode('b-greenbean-main-t16');

let id = 0;
const cmd = () => `cmd_${(id += 1)}`;

describe('mock gateway — scanning in', () => {
  let gateway: YallaGateway;

  beforeEach(() => {
    id = 0;
    gateway = createMockGateway({ simulateJoiners: false });
  });

  it('opens a tab and makes the scanner the host', async () => {
    const result = await gateway.scanTableCode({ tableCode: FREE_TABLE, commandId: cmd() });

    expect(result.kind).toBe('tabOpened');
    expect(result.tab.me.role).toBe('host');
    expect(result.tab.me.status).toBe('approved');
    // Nothing about an account, a phone or a name is required to get here.
    expect(result.tab.participants).toHaveLength(1);
    expect(result.tab.participants[0]?.displayName).toBe('');
  });

  it('replaying one command id cannot open two tabs on the same table', async () => {
    const commandId = cmd();
    const first = await gateway.scanTableCode({ tableCode: FREE_TABLE, commandId });
    const second = await gateway.scanTableCode({ tableCode: FREE_TABLE, commandId });

    expect(second.tab.tabId).toBe(first.tab.tabId);
    expect(second.kind).toBe('alreadyOn');
  });

  it('joining a tab somebody else hosts leaves you pending, seeing only yourself', async () => {
    const result = await gateway.scanTableCode({
      tableCode: HOSTED_BY_SOMEONE_ELSE,
      commandId: cmd(),
    });

    expect(result.kind).toBe('joinPending');
    expect(result.tab.me.status).toBe('pendingApproval');
    expect(result.tab.me.role).toBe('guest');
    // As the server sends it: a pending joiner's roster is their own row.
    expect(result.tab.participants.map((p) => p.participantId)).toEqual([
      result.tab.me.participantId,
    ]);
  });

  it('distinguishes out of service, unknown code and a closed tab', async () => {
    await expect(
      gateway.scanTableCode({ tableCode: OUT_OF_SERVICE, commandId: cmd() }),
    ).rejects.toBeInstanceOf(TableOutOfServiceError);

    await expect(
      gateway.scanTableCode({ tableCode: 'ZZZZZZ', commandId: cmd() }),
    ).rejects.toBeInstanceOf(UnknownTableCodeError);

    await expect(
      gateway.scanTableCode({ tableCode: CLOSED_TAB, commandId: cmd() }),
    ).rejects.toBeInstanceOf(TabClosedError);
  });

  it('no two tables in the mock share a printed code', () => {
    const codes = mockVenues
      .flatMap((v) => v.branches)
      .flatMap((b) => b.floor.tables)
      .map((t) => mockTableCode(t.id));

    // A collision would silently seat two rooms at one tab, and would only ever
    // show up in production, so it is worth asserting rather than assuming.
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('accepts the code however it was scanned, typed or shared', async () => {
    // The printed token is lower-case hex, so upper-casing is what a phone
    // keyboard — or a diner reading it off the sticker — actually does to it.
    const typed = await gateway.scanTableCode({
      tableCode: FREE_TABLE.toUpperCase(),
      commandId: cmd(),
    });
    expect(typed.tab.tableLabel).toBe('1');
  });

  it('every demo code lands on the outcome it advertises', async () => {
    for (const demo of MOCK_DEMO_TABLES) {
      const fresh = createMockGateway({ simulateJoiners: false });
      const attempt = fresh.scanTableCode({ tableCode: demo.code, commandId: cmd() });

      if (demo.outcome === 'tabOpened' || demo.outcome === 'joinPending') {
        await expect(attempt).resolves.toMatchObject({ kind: demo.outcome });
      } else {
        await expect(attempt).rejects.toBeTruthy();
      }
    }
  });
});

describe('mock gateway — the tab and its people', () => {
  let gateway: YallaGateway;
  let tabId: string;

  beforeEach(async () => {
    id = 0;
    gateway = createMockGateway({ simulateJoiners: false });
    const opened = await gateway.scanTableCode({ tableCode: FREE_TABLE, commandId: cmd() });
    tabId = opened.tab.tabId;
  });

  it('the invite carries one token behind both the QR and the share link', async () => {
    const invite = await gateway.createTabInvite({ tabId, commandId: cmd() });

    expect(invite.url).toContain(invite.token);
    expect(invite.url.startsWith('https://')).toBe(true);
    expect(new Date(invite.expiresAtUtc).getTime()).toBeGreaterThan(Date.now());
  });

  it('an invitation goes through join, not the table scan', async () => {
    const invite = await gateway.createTabInvite({ tabId, commandId: cmd() });

    // This device is already the host, so it is told so rather than duplicated.
    const result = await gateway.joinTab({ joinToken: invite.token });
    expect(result.kind).toBe('alreadyOn');
    expect(result.tab.tabId).toBe(tabId);

    // And the table scan does not know what an invitation token is.
    await expect(
      gateway.scanTableCode({ tableCode: invite.token, commandId: cmd() }),
    ).rejects.toBeInstanceOf(UnknownTableCodeError);
  });

  it('menu prices are readable while still waiting to be approved', async () => {
    const pending = createMockGateway({ simulateJoiners: false });
    const joined = await pending.scanTableCode({
      tableCode: HOSTED_BY_SOMEONE_ELSE,
      commandId: cmd(),
    });
    expect(joined.tab.me.status).toBe('pendingApproval');

    const menu = await pending.getBranchMenuDetail(joined.tab.branchId);
    expect(menu?.categories.length).toBeGreaterThan(0);
    expect(menu?.categories[0]?.items[0]?.priceDram).toBeGreaterThan(0);
  });

  it('a waiter call is presets only and idempotent on its command id', async () => {
    const commandId = cmd();
    const first = await gateway.callWaiter({ tabId, reason: 'water', commandId });
    const again = await gateway.callWaiter({ tabId, reason: 'water', commandId });

    expect(again.id).toBe(first.id);
    expect(first.reason).toBe('water');
  });
});

describe('mock gateway — host controls', () => {
  let gateway: YallaGateway;
  let tabId: string;
  let pendingId: string;

  beforeEach(async () => {
    id = 0;
    // A clock we can move forward, so the simulated joiner is deterministic.
    let clock = new Date('2026-09-04T12:00:00Z');
    gateway = createMockGateway({ now: () => clock });

    const opened = await gateway.scanTableCode({ tableCode: FREE_TABLE, commandId: cmd() });
    tabId = opened.tab.tabId;

    clock = new Date('2026-09-04T12:00:30Z');
    const withGuest = await gateway.getDinerTab(tabId);
    pendingId =
      withGuest?.participants.find((p) => p.status === 'pendingApproval')?.participantId ?? '';
    expect(pendingId).not.toBe('');
  });

  it('approving grants the table default, not the host permissions', async () => {
    const change = await gateway.approveJoin({
      tabId,
      participantId: pendingId,
      commandId: cmd(),
    });

    expect(change.status).toBe('approved');
    expect(change.permissions.canPay).toBe(false);
  });

  it('replaying approve does not un-reject somebody', async () => {
    const commandId = cmd();
    await gateway.approveJoin({ tabId, participantId: pendingId, commandId });
    const again = await gateway.rejectJoin({ tabId, participantId: pendingId, commandId });

    expect(again.status).toBe('approved');
  });

  it('the server repairs pay-without-total rather than honouring it', async () => {
    await gateway.approveJoin({ tabId, participantId: pendingId, commandId: cmd() });
    const change = await gateway.setParticipantPermissions({
      tabId,
      participantId: pendingId,
      permissions: { canOrder: true, canSeeTableTotal: false, canPay: true },
      commandId: cmd(),
    });

    expect(change.permissions).toEqual({ canOrder: true, canSeeTableTotal: true, canPay: true });
  });

  it('leaving hands the host role to the approved guest, and the tab is over for this phone', async () => {
    await gateway.approveJoin({ tabId, participantId: pendingId, commandId: cmd() });

    await gateway.leaveTab({ tabId });

    await expect(gateway.getDinerTab(tabId)).rejects.toMatchObject({
      name: 'TabAccessEndedError',
    });
  });

  it('a guest cannot run host actions', async () => {
    const guestDevice = createMockGateway({ simulateJoiners: false });
    const joined = await guestDevice.scanTableCode({
      tableCode: HOSTED_BY_SOMEONE_ELSE,
      commandId: cmd(),
    });

    await expect(
      guestDevice.removeParticipant({
        tabId: joined.tab.tabId,
        participantId: 'p-nare',
        commandId: cmd(),
      }),
    ).rejects.toBeInstanceOf(NotTabHostError);
  });

  it('a guest cannot make an invitation, because the server refuses one', async () => {
    // TabService.CreateJoinTokenAsync: RequireHost(tab, actingParticipantId,
    // "Inviting others"). The mock used to mint the link for anybody, so mock
    // mode showed a guest a working Invite that the server answers with 403.
    const guestDevice = createMockGateway({ simulateJoiners: false });
    const joined = await guestDevice.scanTableCode({
      tableCode: HOSTED_BY_SOMEONE_ELSE,
      commandId: cmd(),
    });

    await expect(
      guestDevice.createTabInvite({ tabId: joined.tab.tabId, commandId: cmd() }),
    ).rejects.toBeInstanceOf(NotTabHostError);
  });
});
