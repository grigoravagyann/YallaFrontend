import { describe, expect, it } from 'vitest';
import { OrderGuestUnavailableError } from '../contracts/errors';
import { ValidationError } from '../errors';
import { tableDetail } from '../contracts/service';
import { createStaffMockGateway, type StaffMockOptions } from './staffMock';

/**
 * Who each line is for, in the staff mock (FT3 wire). The mock refuses what
 * the server refuses, so mock mode cannot teach the tablet a send the real API
 * would turn down.
 */

const BRANCH = 'b1';

async function seeded(extraGuests?: StaffMockOptions['extraGuests']) {
  const gateway = createStaffMockGateway({
    latencyMs: 0,
    branchId: BRANCH,
    ...(extraGuests ? { extraGuests } : {}),
  });
  const floor = (await gateway.getFloor(BRANCH))!;
  const tabId = floor.plan.tables
    .map((table) => tableDetail(floor, table.id)?.openTabId)
    .find(Boolean)!;
  const tab = (await gateway.getStaffTab(tabId))!;
  const menu = (await gateway.getMenu(BRANCH))!;
  const items = menu.sections.flatMap((section) => section.items).filter((i) => i.isAvailable);
  const linesBefore = (await gateway.getTabLines({ branchId: BRANCH, tabId })).length;
  return { gateway, tabId, tab, items, linesBefore };
}

describe('a round with a different guest on each line', () => {
  it('is one order: the shared line names nobody, each guest line names its guest', async () => {
    const { gateway, tabId, tab, items, linesBefore } = await seeded();
    const [anahit, karen] = tab.participants;
    const queueBefore = (await gateway.listOrderQueue(BRANCH)).length;

    await gateway.placeOrder({
      tabId,
      clientCommandId: '11111111-1111-4111-8111-111111111111',
      lines: [
        { menuItemId: items[0]!.id, quantity: 2, isShared: true, participantId: null },
        { menuItemId: items[1]!.id, quantity: 1, isShared: false, participantId: anahit!.id },
        { menuItemId: items[2]!.id, quantity: 1, isShared: false, participantId: karen!.id },
      ],
    });

    expect(await gateway.listOrderQueue(BRANCH)).toHaveLength(queueBefore + 1);
    const lines = (await gateway.getTabLines({ branchId: BRANCH, tabId })).slice(linesBefore);
    expect(lines.map((line) => line.orderId).every((id) => id === lines[0]!.orderId)).toBe(true);
    expect(lines.map((line) => [line.isShared, line.onBehalfOfParticipantId])).toEqual([
      [true, null],
      [false, anahit!.id],
      [false, karen!.id],
    ]);
    // A guest's line is theirs, not the table's.
    expect(lines.map((line) => line.isTableAttributed)).toEqual([false, false, false]);
  });

  it('attributes a line that names nobody and is not shared to the table', async () => {
    const { gateway, tabId, items, linesBefore } = await seeded();
    await gateway.placeOrder({
      tabId,
      clientCommandId: '22222222-2222-4222-8222-222222222222',
      lines: [{ menuItemId: items[0]!.id, quantity: 1, isShared: false, participantId: null }],
    });
    const [line] = (await gateway.getTabLines({ branchId: BRANCH, tabId })).slice(linesBefore);
    expect(line).toMatchObject({ isTableAttributed: true, onBehalfOfParticipantId: null });
  });
});

describe('a send the server would refuse whole', () => {
  it('refuses a shared line that names a guest, naming the field', async () => {
    const { gateway, tabId, tab, items, linesBefore } = await seeded();
    const error = await gateway
      .placeOrder({
        tabId,
        clientCommandId: '33333333-3333-4333-8333-333333333333',
        lines: [
          { menuItemId: items[0]!.id, quantity: 1, isShared: false, participantId: null },
          {
            menuItemId: items[1]!.id,
            quantity: 1,
            isShared: true,
            participantId: tab.participants[0]!.id,
          },
        ],
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe('items[1].participantId');
    expect(await gateway.getTabLines({ branchId: BRANCH, tabId })).toHaveLength(linesBefore);
  });

  it('refuses a guest who is not on the tab (404)', async () => {
    const { gateway, tabId, items, linesBefore } = await seeded();
    const error = await gateway
      .placeOrder({
        tabId,
        clientCommandId: '44444444-4444-4444-8444-444444444444',
        lines: [{ menuItemId: items[0]!.id, quantity: 1, isShared: false, participantId: 'p-x' }],
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OrderGuestUnavailableError);
    expect((error as OrderGuestUnavailableError).status).toBe(404);
    expect(await gateway.getTabLines({ branchId: BRANCH, tabId })).toHaveLength(linesBefore);
  });

  it('refuses a guest still waiting for the host, and one taken off (409)', async () => {
    const { gateway, tabId, tab, items, linesBefore } = await seeded([
      { displayName: 'Davit', status: 'pendingApproval' },
      { displayName: 'Lilit', status: 'removed' },
    ]);
    const davit = tab.participants.find((person) => person.displayName === 'Davit')!;
    const lilit = tab.participants.find((person) => person.displayName === 'Lilit')!;
    // Neither is offered to order for.
    expect(davit.canOrderNow).toBe(false);
    expect(lilit.canOrderNow).toBe(false);

    for (const [index, person] of [davit, lilit].entries()) {
      const error = await gateway
        .placeOrder({
          tabId,
          clientCommandId: `55555555-5555-4555-8555-55555555555${index}`,
          lines: [
            { menuItemId: items[0]!.id, quantity: 1, isShared: true, participantId: null },
            { menuItemId: items[1]!.id, quantity: 1, isShared: false, participantId: person.id },
          ],
        })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(OrderGuestUnavailableError);
      expect((error as OrderGuestUnavailableError).status).toBe(409);
    }
    expect(await gateway.getTabLines({ branchId: BRANCH, tabId })).toHaveLength(linesBefore);
  });

  it('answers a retry with the original order before checking anything', async () => {
    const { gateway, tabId, tab, items } = await seeded();
    const command = {
      tabId,
      clientCommandId: '66666666-6666-4666-8666-666666666666',
      lines: [
        {
          menuItemId: items[0]!.id,
          quantity: 1,
          isShared: false,
          participantId: tab.participants[1]!.id,
        },
      ],
    };
    const first = await gateway.placeOrder(command);
    const again = await gateway.placeOrder({
      ...command,
      lines: [{ ...command.lines[0]!, participantId: 'p-gone' }],
    });
    expect(again).toMatchObject({ orderId: first.orderId, wasReplay: true });
  });
});

describe('the time on each line of the staff tab', () => {
  it("is its order's, the seeded round's and a round placed later alike", async () => {
    const { gateway, tabId, tab, items } = await seeded();
    // As `TabLineView.orderedAtUtc`: the time the line's order was placed.
    expect(tab.lines.length).toBeGreaterThan(0);
    const seededAt = tab.lines[0]!.placedAtUtc;
    expect(seededAt).not.toBeNull();
    expect(tab.lines.every((line) => line.placedAtUtc === seededAt)).toBe(true);
    // The bill shows it beside "open since": never a round from before the tab opened.
    expect(Date.parse(seededAt!)).toBeGreaterThanOrEqual(Date.parse(tab.openedAtUtc));

    const placed = await gateway.placeOrder({
      tabId,
      clientCommandId: '77777777-7777-4777-8777-777777777777',
      lines: [{ menuItemId: items[0]!.id, quantity: 1, isShared: false, participantId: null }],
    });
    const after = (await gateway.getStaffTab(tabId))!;
    const fresh = after.lines.filter((line) => line.orderId === placed.orderId);
    expect(fresh.map((line) => line.placedAtUtc)).toEqual([placed.placedAtUtc]);
  });
});
