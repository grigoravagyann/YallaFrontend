import { describe, expect, it } from 'vitest';
import { tableDetail } from '../contracts/service';
import { createStaffMockGateway, type StaffMockOptions } from './staffMock';

/**
 * The kitchen's tickets in the staff mock (floor tablet gap 2, FT4 wire): who
 * sent each one, the dish behind each line, and — in mock mode only — a pass
 * busy enough to show the board's states.
 */

const BRANCH = 'b1';

function mock(options: StaffMockOptions = {}) {
  return createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, ...options });
}

async function openTab(gateway: ReturnType<typeof mock>): Promise<string> {
  const floor = (await gateway.getFloor(BRANCH))!;
  return floor.plan.tables.map((table) => tableDetail(floor, table.id)?.openTabId).find(Boolean)!;
}

describe('who sent a ticket', () => {
  it("names the tablet's waiter on an order placed from the tablet", async () => {
    const gateway = mock({ staffName: 'Narek Hakobyan' });
    const tabId = await openTab(gateway);
    const menu = (await gateway.getMenu(BRANCH))!;
    const dish = menu.sections[0]!.items.find((item) => item.isAvailable)!;
    const id = '22222222-2222-4222-8222-222222222222';

    await gateway.placeOrder({
      tabId,
      clientCommandId: id,
      lines: [{ menuItemId: dish.id, quantity: 1, isShared: true, participantId: null }],
    });

    const ticket = (await gateway.listOrderQueue(BRANCH)).find((order) => order.orderId === id);
    expect(ticket?.placedByName).toBe('Narek Hakobyan');
    // The line keeps its dish, as the server's does.
    expect(ticket?.lines[0]?.menuItemId).toBe(dish.id);
  });

  it('says the same on the ticket a move answers with', async () => {
    const gateway = mock();
    const [ticket] = await gateway.listOrderQueue(BRANCH);

    const moved = await gateway.setOrderStatus({
      orderId: ticket!.orderId,
      status: 'ready',
      clientCommandId: 'c-1',
    });

    expect(moved.placedByName).toBe(ticket!.placedByName);
    expect(moved.placedByName).toBeTruthy();
  });
});

describe('the menu', () => {
  it("carries each dish's allergens, as the venue wrote them", async () => {
    const menu = (await mock().getMenu(BRANCH))!;
    const byId = new Map(
      menu.sections.flatMap((section) => section.items).map((item) => [item.id, item]),
    );

    expect(byId.get('gata')?.allergens).toBe('Gluten, milk, egg');
    expect(byId.get('espresso')?.allergens).toBe('None');
  });
});

describe('a busy pass, for mock mode', () => {
  it('is off unless asked for, so tests read the room as it always was', async () => {
    expect(await mock().listOrderQueue(BRANCH)).toHaveLength(1);
  });

  it('has more than four tickets, late ones, notes, one from the app and one ready', async () => {
    const queue = await mock({ seedKitchen: true }).listOrderQueue(BRANCH);

    expect(queue.length).toBeGreaterThan(4);
    expect(queue.some((order) => order.waitingMinutes >= 12 && order.status === 'inKitchen')).toBe(
      true,
    );
    expect(queue.some((order) => order.lines.some((line) => line.note))).toBe(true);
    expect(queue.some((order) => order.placedByName === null)).toBe(true);
    expect(queue.some((order) => order.status === 'ready')).toBe(true);
    expect(queue.some((order) => order.status === 'new')).toBe(true);
  });
});

describe('a queued table move with no precondition (FT4 review B1)', () => {
  it('is refused with a 400, as the server refuses it, and a live one without is not', async () => {
    const { ValidationError } = await import('../errors');
    const gateway = mock();
    const base = { branchId: BRANCH, partySize: 2 } as const;

    await expect(
      gateway.applyTableAction({
        ...base,
        kind: 'seatWalkIn',
        tableId: 't4',
        clientCommandId: 'q-1',
        queued: true,
        precondition: null,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const live = await gateway.applyTableAction({
      ...base,
      kind: 'seatWalkIn',
      tableId: 't4',
      clientCommandId: 'q-2',
      queued: false,
      precondition: null,
    });
    expect(live.toStatus).toBe('occupied');
  });
});
