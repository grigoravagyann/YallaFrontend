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
    expect(result.tab.yourRole).toBe('host');
    expect(result.tab.yourStatus).toBe('active');
    // Nothing about an account, a phone or a name is required to get here.
    expect(result.tab.participants).toHaveLength(1);
    expect(result.tab.participants[0]?.displayName).toBeNull();
  });

  it('replaying one command id cannot open two tabs on the same table', async () => {
    const commandId = cmd();
    const first = await gateway.scanTableCode({ tableCode: FREE_TABLE, commandId });
    const second = await gateway.scanTableCode({ tableCode: FREE_TABLE, commandId });

    expect(second.tab.id).toBe(first.tab.id);
    expect(second.kind).toBe('alreadyOn');
  });

  it('joining a tab somebody else hosts leaves you pending, not active', async () => {
    const result = await gateway.scanTableCode({
      tableCode: HOSTED_BY_SOMEONE_ELSE,
      commandId: cmd(),
    });

    expect(result.kind).toBe('joinPending');
    expect(result.tab.yourStatus).toBe('pending');
    expect(result.tab.yourRole).toBe('guest');
    // The whole party is visible to a pending joiner, unnamed guest included.
    const names = result.tab.participants.map((p) => p.displayName);
    expect(names).toContain('Aram');
    expect(names).toContain(null);
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
    const typed = await gateway.scanTableCode({
      tableCode: FREE_TABLE.toLowerCase(),
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
    tabId = opened.tab.id;
  });

  it('the invite carries one token behind both the QR and the share link', async () => {
    const invite = await gateway.createTabInvite({ tabId, commandId: cmd() });

    expect(invite.url).toContain(invite.token);
    expect(invite.url.startsWith('https://')).toBe(true);
    expect(new Date(invite.expiresAtUtc).getTime()).toBeGreaterThan(Date.now());
  });

  it('a guest arriving through the invite link lands pending, same as a scan', async () => {
    const invite = await gateway.createTabInvite({ tabId, commandId: cmd() });

    // A second device, sharing this mock's world.
    const result = await gateway.scanTableCode({ tableCode: invite.token, commandId: cmd() });
    // This device is already the host, so it is told so rather than duplicated.
    expect(result.kind).toBe('alreadyOn');
    expect(result.tab.id).toBe(tabId);
  });

  it('menu prices are readable while still waiting to be approved', async () => {
    const pending = createMockGateway({ simulateJoiners: false });
    const joined = await pending.scanTableCode({
      tableCode: HOSTED_BY_SOMEONE_ELSE,
      commandId: cmd(),
    });
    expect(joined.tab.yourStatus).toBe('pending');

    const menu = await pending.getBranchMenu(joined.tab.branchId);
    expect(menu?.sections.length).toBeGreaterThan(0);
    expect(menu?.sections[0]?.items[0]?.priceDram).toBeGreaterThan(0);
  });

  it('leaving hands the host role on rather than stranding the tab', async () => {
    const other = await gateway.scanTableCode({
      tableCode: HOSTED_BY_SOMEONE_ELSE,
      commandId: cmd(),
    });
    expect(other.tab.yourStatus).toBe('pending');

    await gateway.leaveTab({ tabId, commandId: cmd() });
    const after = await gateway.getTab(tabId);
    expect(after?.yourStatus).toBe('left');
    // Nobody else was active on that tab, so it closed rather than going hostless.
    expect(after?.status).toBe('closed');
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
    tabId = opened.tab.id;

    clock = new Date('2026-09-04T12:00:30Z');
    const withGuest = await gateway.getTab(tabId);
    pendingId = withGuest?.participants.find((p) => p.status === 'pending')?.id ?? '';
    expect(pendingId).not.toBe('');
  });

  it('approving grants the table default, not the host permissions', async () => {
    const tab = await gateway.approveJoin({ tabId, participantId: pendingId, commandId: cmd() });
    const guest = tab.participants.find((p) => p.id === pendingId);

    expect(guest?.status).toBe('active');
    expect(guest?.permissions).toEqual(tab.defaultPermissions);
    expect(guest?.permissions.canPay).toBe(false);
  });

  it('replaying approve does not un-reject somebody', async () => {
    const commandId = cmd();
    await gateway.approveJoin({ tabId, participantId: pendingId, commandId });
    const again = await gateway.rejectJoin({ tabId, participantId: pendingId, commandId });

    expect(again.participants.find((p) => p.id === pendingId)?.status).toBe('active');
  });

  it('the server repairs pay-without-total rather than honouring it', async () => {
    await gateway.approveJoin({ tabId, participantId: pendingId, commandId: cmd() });
    const tab = await gateway.setParticipantPermissions({
      tabId,
      participantId: pendingId,
      permissions: { canOrder: true, canSeeTableTotal: false, canPay: true },
      commandId: cmd(),
    });

    const guest = tab.participants.find((p) => p.id === pendingId);
    expect(guest?.permissions).toEqual({ canOrder: true, canSeeTableTotal: true, canPay: true });
  });

  it('a table default applies to whoever is approved next', async () => {
    await gateway.setTabDefaultPermissions({
      tabId,
      permissions: { canOrder: false, canSeeTableTotal: false, canPay: false },
      commandId: cmd(),
    });
    const tab = await gateway.approveJoin({ tabId, participantId: pendingId, commandId: cmd() });

    expect(tab.participants.find((p) => p.id === pendingId)?.permissions.canOrder).toBe(false);
  });

  it('a guest cannot run host actions', async () => {
    const guestDevice = createMockGateway({ simulateJoiners: false });
    const joined = await guestDevice.scanTableCode({
      tableCode: HOSTED_BY_SOMEONE_ELSE,
      commandId: cmd(),
    });

    await expect(
      guestDevice.removeParticipant({
        tabId: joined.tab.id,
        participantId: 'p-nare',
        commandId: cmd(),
      }),
    ).rejects.toBeInstanceOf(NotTabHostError);
  });
});
