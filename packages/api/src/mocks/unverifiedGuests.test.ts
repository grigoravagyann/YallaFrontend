import { describe, expect, it, vi } from 'vitest';
import { ScanTurnedAwayError, TabAwaitingAdmissionError } from '../contracts/errors';
import { SEEDED_ACCOUNT } from './accounts';
import { createMockGateway, type MockGateway, type MockGatewayOptions } from './mockGateway';
import { mockTableCode } from './tableCodes';

/**
 * Tab admission in the diner's mock (2026-10-20): the same rules the server
 * enforces. A tab a scan opened without a proved number waits for a waiter: no
 * order and no bill until admitted, water and napkins meanwhile. (The booking
 * half of that day went with the guest record: `guestRecord.test.ts`.)
 */

const NORTH = 'b-lumen-north';
/** Monday 19 October 2026, 12:00 in Yerevan. */
const NOW = '2026-10-19T08:00:00.000Z';

function world(options: MockGatewayOptions = {}): MockGateway {
  return createMockGateway({
    latencyMs: 0,
    simulateJoiners: false,
    simulateWaiter: false,
    now: () => new Date(NOW),
    codeSeed: 5,
    ...options,
  });
}

async function proved(gateway: MockGateway): Promise<void> {
  await gateway.loginDiner({
    identifier: SEEDED_ACCOUNT.username,
    password: SEEDED_ACCOUNT.password,
  });
  const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('a tab a scan opened without a proved number', () => {
  async function scanned(gateway: MockGateway) {
    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode(`${NORTH}-t4`),
      commandId: crypto.randomUUID(),
    });
    expect(scan.kind).toBe('tabOpened');
    return scan.tab;
  }

  const order = (gateway: MockGateway, tabId: string, participantId: string) =>
    gateway.placeOrder({
      tabId,
      clientCommandId: crypto.randomUUID(),
      lines: [{ menuItemId: 'cappuccino', quantity: 1, isShared: false, participantId }],
    });

  it('lets mock mode play a waiter who admits, or one who turns the table away', async () => {
    // The mock's waiter comes on a timer: the clock is the test's, not the machine's.
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const admits = world({ simulateAdmissionAfterMs: 5_000 });
    const turnsAway = world({
      simulateAdmissionAfterMs: 5_000,
      simulateAdmissionOutcome: 'reject',
    });
    let admitted: Awaited<ReturnType<typeof scanned>>;
    let rejected: Awaited<ReturnType<typeof scanned>>;
    try {
      admitted = await scanned(admits);
      rejected = await scanned(turnsAway);
      vi.advanceTimersByTime(5_000);
    } finally {
      vi.useRealTimers();
    }

    expect((await admits.getDinerTab(admitted.tabId))?.admission).toMatchObject({
      status: 'admitted',
      admittedBecause: 'waiter',
    });
    expect((await turnsAway.getDinerTab(rejected.tabId))?.admission).toMatchObject({
      status: 'rejected',
      tableFreed: true,
    });
  });

  it('waits for a waiter: no order, no bill, but water', async () => {
    const gateway = world();
    const tab = await scanned(gateway);

    expect(tab.admission.status).toBe('awaiting');
    expect(tab.me.canOrderNow).toBe(false);
    expect(await caught(order(gateway, tab.tabId, tab.me.participantId))).toBeInstanceOf(
      TabAwaitingAdmissionError,
    );
    expect(
      await caught(
        gateway.callWaiter({
          tabId: tab.tabId,
          reason: 'bill',
          commandId: crypto.randomUUID(),
          bill: { scope: 'whole', tipPercent: 0 },
        }),
      ),
    ).toBeInstanceOf(TabAwaitingAdmissionError);
    await expect(
      gateway.callWaiter({ tabId: tab.tabId, reason: 'water', commandId: crypto.randomUUID() }),
    ).resolves.toMatchObject({ reason: 'water' });
  });

  it('orders once a waiter admits it, and the stream says so', async () => {
    const gateway = world();
    const tab = await scanned(gateway);

    gateway.admitTabAsWaiter(tab.tabId);

    const read = (await gateway.getDinerTab(tab.tabId))!;
    expect(read.admission).toMatchObject({ status: 'admitted', admittedBecause: 'waiter' });
    expect(read.me.canOrderNow).toBe(true);
    const events = await gateway.getTabEvents({ tabId: tab.tabId, afterSequence: 0 });
    expect(events.events.map((event) => event.type)).toContain('tabAdmitted');
    await expect(order(gateway, tab.tabId, tab.me.participantId)).resolves.toMatchObject({
      tabId: tab.tabId,
    });
  });

  it('is closed when a waiter turns it away', async () => {
    const gateway = world();
    const tab = await scanned(gateway);

    gateway.rejectTabAsWaiter(tab.tabId);

    const events = await gateway.getTabEvents({ tabId: tab.tabId, afterSequence: 0 });
    expect(events.events.map((event) => event.type)).toContain('tabAdmissionRejected');
    const read = await gateway.getDinerTab(tab.tabId);
    expect(read?.admission.status ?? 'rejected').toBe('rejected');

    // The phone a waiter just turned away is refused a new scan for a while.
    const again = await caught(
      gateway.scanTableCode({
        tableCode: mockTableCode(`${NORTH}-t5`),
        commandId: crypto.randomUUID(),
      }),
    );
    expect(again).toBeInstanceOf(ScanTurnedAwayError);
    expect((again as ScanTurnedAwayError).retryAfterUtc).toBeTruthy();
  });

  it('orders at once where the branch lets unverified scans in', async () => {
    const gateway = world({ unverifiedScansNeedAdmission: false });
    const tab = await scanned(gateway);

    expect(tab.admission).toMatchObject({ status: 'admitted', admittedBecause: 'notRequired' });
    expect(tab.me.canOrderNow).toBe(true);
  });

  it('lets a proved scanner order at once', async () => {
    const gateway = world();
    await proved(gateway);
    const tab = await scanned(gateway);

    expect(tab.admission).toMatchObject({ status: 'admitted', admittedBecause: 'verifiedHost' });
    expect(tab.me.canOrderNow).toBe(true);
  });
});
