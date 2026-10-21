import { describe, expect, it } from 'vitest';
import { PreOrderAlreadySentError, PreOrderNotSendableError } from '../contracts/errors';
import { NotFoundError, UnauthorizedError } from '../errors';
import { createStaffMockGateway, type StaffMockOptions } from './staffMock';

/**
 * Pre-orders on the floor tablet's mock (PO wire §4–5, 2026-10-21): the rail
 * from `minutesBefore` until the booking ends, the next card's time, Send →
 * a held kitchen ticket that becomes the first order on the tab when the
 * party sits (same id, locked prices), Not coming (still sendable), the two
 * tablets' replay, the windows, and signal 6 on the change stream.
 */

const START = Date.parse('2026-10-22T14:00:00.000Z');
const BRANCH = 'branch-cafe-01';
const at = (minutes: number) => new Date(START + minutes * 60_000).toISOString();

function floor(options: StaffMockOptions = {}) {
  let clock = START;
  const gateway = createStaffMockGateway({
    now: () => new Date(clock),
    branchId: BRANCH,
    preOrderMinutesBefore: 30,
    preOrderSeeds: [
      {
        reservationId: 'res-po-anna',
        code: 'K7Q2LM',
        tableId: 't5',
        startsInMinutes: 40,
        guestName: 'Anna',
        guestPhone: '+37499111222',
        partySize: 2,
        lines: [
          { menuItemId: 'cappuccino', quantity: 2, note: 'oat milk' },
          { menuItemId: 'croissant', quantity: 1 },
        ],
        note: 'Salad first',
        guestConfirmedOnWay: true,
      },
      {
        reservationId: 'res-po-davit',
        code: 'P4X9RT',
        tableId: 't8',
        startsInMinutes: 90,
        guestName: 'Davit',
        guestPhone: '+37491000111',
        partySize: 2,
        lines: [{ menuItemId: 'espresso', quantity: 2 }],
      },
    ],
    ...options,
  });
  return {
    gateway,
    travel(minutes: number) {
      clock = START + minutes * 60_000;
    },
  };
}

const command = (reservationId: string) => ({
  reservationId,
  clientCommandId: crypto.randomUUID(),
});

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('the rail', () => {
  it('shows a card from minutesBefore, with the next one to come', async () => {
    const { gateway, travel } = floor();

    const early = await gateway.listDuePreOrders(BRANCH);
    expect(early.items).toEqual([]);
    expect(early.nextDueAtUtc).toBe(at(10));

    travel(10);
    const due = await gateway.listDuePreOrders(BRANCH);
    expect(due.nextDueAtUtc).toBe(at(60));
    expect(due.items).toHaveLength(1);
    expect(due.items[0]).toMatchObject({
      reservationId: 'res-po-anna',
      code: 'K7Q2LM',
      tableId: 't5',
      tableLabel: '5',
      roomName: 'Windows',
      startUtc: at(40),
      partySize: 2,
      status: 'confirmed',
      guestName: 'Anna',
      guestPhone: '+37499111222',
      dueAtUtc: at(10),
      sentByName: null,
      notComingByName: null,
      tabId: null,
      wasReplay: false,
    });
    expect(due.items[0]?.guestConfirmedOnWayAtUtc).not.toBeNull();
    expect(due.items[0]?.localStartTime).toMatch(/^\d{2}:\d{2}$/u);
    expect(due.items[0]?.preOrder).toMatchObject({
      state: 'locked',
      note: 'Salad first',
      totalDram: 2 * 1200 + 1100,
      lines: [
        { menuItemId: 'cappuccino', quantity: 2, unitPriceDram: 1200, note: 'oat milk' },
        { menuItemId: 'croissant', quantity: 1, unitPriceDram: 1100 },
      ],
    });
  });

  it('keeps a card until the booking ends, then it goes', async () => {
    const { gateway, travel } = floor();
    travel(40 + 104);
    expect(
      (await gateway.listDuePreOrders(BRANCH)).items.map((card) => card.reservationId),
    ).toContain('res-po-anna');
    travel(40 + 105);
    expect(
      (await gateway.listDuePreOrders(BRANCH)).items.map((card) => card.reservationId),
    ).not.toContain('res-po-anna');
  });

  it('answers 401 with nobody signed in', async () => {
    const { gateway } = floor({ signedIn: () => false });
    expect(await caught(gateway.listDuePreOrders(BRANCH))).toBeInstanceOf(UnauthorizedError);
  });
});

describe('Send to kitchen', () => {
  it('before they sit: a held ticket at once, then the first order on their tab, same id', async () => {
    const { gateway, travel } = floor();
    travel(15);

    const sent = await gateway.sendPreOrder(command('res-po-anna'));
    expect(sent).toMatchObject({
      wasReplay: false,
      sentByName: 'Ani Hakobyan',
      tabId: null,
      preOrder: { state: 'sent', kitchenStatus: 'inKitchen', onTab: false },
    });
    const preOrderId = sent.preOrder.id;

    const queue = await gateway.listOrderQueue(BRANCH);
    const ticket = queue.find((entry) => entry.orderId === preOrderId);
    expect(ticket).toMatchObject({
      tabId: null,
      tableLabel: '5',
      status: 'inKitchen',
      preOrder: { reservationId: 'res-po-anna', startUtc: at(40), partySize: 2, guestName: 'Anna' },
      lines: [
        { menuItemId: 'cappuccino', quantity: 2, note: 'oat milk' },
        { menuItemId: 'croissant', quantity: 1 },
      ],
    });
    await gateway.setOrderStatus({
      orderId: preOrderId,
      status: 'ready',
      clientCommandId: crypto.randomUUID(),
    });

    travel(38);
    const seated = await gateway.applyTableAction({
      branchId: BRANCH,
      tableId: 't5',
      kind: 'seatReservation',
      reservationId: 'res-po-anna',
      partySize: 2,
      clientCommandId: crypto.randomUUID(),
    } as Parameters<typeof gateway.applyTableAction>[0]);
    expect(seated.tabId).not.toBeNull();

    const onTab = (await gateway.listOrderQueue(BRANCH)).find(
      (entry) => entry.orderId === preOrderId,
    );
    expect(onTab).toMatchObject({
      tabId: seated.tabId,
      status: 'ready',
      preOrder: { reservationId: 'res-po-anna' },
    });
    const lines = await gateway.getTabLines({ branchId: BRANCH, tabId: seated.tabId! });
    expect(lines.filter((line) => line.orderId === preOrderId)).toMatchObject([
      { menuItemId: 'cappuccino', quantity: 2, unitPriceDram: 1200, isTableAttributed: true },
      { menuItemId: 'croissant', quantity: 1, unitPriceDram: 1100, isTableAttributed: true },
    ]);

    // On the tab: the card goes.
    const rail = await gateway.listDuePreOrders(BRANCH);
    expect(rail.items.map((card) => card.reservationId)).not.toContain('res-po-anna');
  });

  it('after they sit: straight onto their tab', async () => {
    const { gateway, travel } = floor();
    travel(35);
    const seated = await gateway.applyTableAction({
      branchId: BRANCH,
      tableId: 't5',
      kind: 'seatReservation',
      reservationId: 'res-po-anna',
      partySize: 2,
      clientCommandId: crypto.randomUUID(),
    } as Parameters<typeof gateway.applyTableAction>[0]);

    const seatedCard = (await gateway.listDuePreOrders(BRANCH)).items.find(
      (card) => card.reservationId === 'res-po-anna',
    );
    expect(seatedCard?.status).toBe('seated');

    expect(seated.tabId).toBeNull();

    // A tab is opened for the sitting, as "Open tab" would: nobody on it yet.
    const sent = await gateway.sendPreOrder(command('res-po-anna'));
    expect(sent).toMatchObject({ preOrder: { state: 'sent', onTab: true } });
    expect(sent.tabId).not.toBeNull();
    const ticket = (await gateway.listOrderQueue(BRANCH)).find(
      (entry) => entry.orderId === sent.preOrder.id,
    );
    expect(ticket?.tabId).toBe(sent.tabId);
    expect((await gateway.getStaffTab(sent.tabId!))?.participants).toEqual([]);
  });

  it('two tablets: one ticket, the second answer a replay', async () => {
    const { gateway, travel } = floor();
    travel(15);
    const first = await gateway.sendPreOrder(command('res-po-anna'));
    const second = await gateway.sendPreOrder(command('res-po-anna'));
    expect(second.wasReplay).toBe(true);
    const tickets = (await gateway.listOrderQueue(BRANCH)).filter(
      (entry) => entry.orderId === first.preOrder.id,
    );
    expect(tickets).toHaveLength(1);
  });

  it('refuses before the start less two hours, and with no pre-order', async () => {
    const { gateway } = floor({
      preOrderSeeds: [
        {
          reservationId: 'res-po-later',
          tableId: 't9',
          startsInMinutes: 200,
          guestName: 'Mariam',
          lines: [{ menuItemId: 'espresso', quantity: 1 }],
        },
      ],
    });
    const early = await caught(gateway.sendPreOrder(command('res-po-later')));
    expect(early).toBeInstanceOf(PreOrderNotSendableError);
    expect(early).toMatchObject({ sendableFromUtc: at(80), bookingStatus: 'confirmed' });
    expect(await caught(gateway.sendPreOrder(command('res-none')))).toBeInstanceOf(NotFoundError);
  });
});

describe('Not coming / no answer', () => {
  it('keeps the card, still sendable; refused once sent', async () => {
    const { gateway, travel } = floor();
    travel(15);

    const marked = await gateway.markPreOrderNotComing(command('res-po-anna'));
    expect(marked).toMatchObject({
      notComingByName: 'Ani Hakobyan',
      preOrder: { state: 'notComing' },
      wasReplay: false,
    });
    expect((await gateway.markPreOrderNotComing(command('res-po-anna'))).wasReplay).toBe(true);
    expect((await gateway.listDuePreOrders(BRANCH)).items[0]?.preOrder.state).toBe('notComing');

    const sent = await gateway.sendPreOrder(command('res-po-anna'));
    expect(sent.preOrder.state).toBe('sent');
    expect(await caught(gateway.markPreOrderNotComing(command('res-po-anna')))).toBeInstanceOf(
      PreOrderAlreadySentError,
    );
  });
});

describe('the change stream', () => {
  it('writes signal 6 for the booking on a send and on a mark', async () => {
    const { gateway, travel } = floor();
    travel(15);
    const before = (await gateway.getFloorChanges({ branchId: BRANCH, afterSequence: 0 }))
      .lastSequence;

    await gateway.markPreOrderNotComing(command('res-po-anna'));
    await gateway.sendPreOrder(command('res-po-anna'));

    const page = await gateway.getFloorChanges({ branchId: BRANCH, afterSequence: before });
    expect(
      page.changes.map((change) => [change.signal, change.reservationId, change.tableId]),
    ).toEqual([
      ['preOrderChanged', 'res-po-anna', 't5'],
      ['preOrderChanged', 'res-po-anna', 't5'],
    ]);
    expect(page.changes.every((change) => change.fromStatus === change.toStatus)).toBe(true);
  });
});

describe('mock mode', () => {
  it('seeds a rail worth walking: confirmed, to call, sent and held, and one to come', async () => {
    const gateway = createStaffMockGateway({
      now: () => new Date(START),
      branchId: BRANCH,
      seedPreOrders: true,
    });
    const rail = await gateway.listDuePreOrders(BRANCH);
    expect(rail.items.length).toBeGreaterThanOrEqual(3);
    expect(rail.items.some((card) => card.guestConfirmedOnWayAtUtc !== null)).toBe(true);
    expect(rail.items.some((card) => card.guestConfirmedOnWayAtUtc === null)).toBe(true);
    expect(rail.items.some((card) => card.preOrder.state === 'sent')).toBe(true);
    expect(rail.items.some((card) => card.preOrder.lines.some((line) => !line.availableNow))).toBe(
      true,
    );
    expect(rail.nextDueAtUtc).not.toBeNull();
    const held = (await gateway.listOrderQueue(BRANCH)).filter(
      (entry) => entry.tabId === null && entry.preOrder,
    );
    expect(held).toHaveLength(1);
  });
});
