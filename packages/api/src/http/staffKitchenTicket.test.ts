import { describe, expect, it } from 'vitest';
import { fakeBackend } from './fakeBackend.testkit';
import { createStaffHttpGateway } from './staffHttpGateway';

/**
 * Who sent a kitchen ticket, and what the dish holds (floor tablet gap 2, FT4
 * wire).
 *
 * `KitchenOrderView.placedByName` is the waiter's name as the PIN roster shows
 * it, and is **absent** — not null — when a diner ordered from the app. The
 * ticket says «Հավելվածից» then, so the mapping must turn "absent" into a
 * plain null rather than `undefined` leaking through. The queue's lines keep
 * the dish's id, so the board can warn about its allergens from the menu.
 */

const BRANCH = 'b-1';
const ORDERS = `GET /api/branches/${BRANCH}/orders`;

/** The wire as the FT4 backend writes it: a phone's ticket has no `placedByName` at all. */
const WAITER_TICKET = {
  orderId: 'o-1',
  tabId: 'tab-1',
  tableLabel: '4',
  status: 2,
  placedAtUtc: '2026-10-19T14:28:00Z',
  estimatedReadyAtUtc: '2026-10-19T14:43:00Z',
  waitingMinutes: 14,
  lines: [
    {
      lineId: 'l-1',
      orderId: 'o-1',
      menuItemId: 'm-steak',
      name: 'Steak',
      quantity: 2,
      unitPriceAmd: 9_800,
      lineTotalAmd: 19_600,
      isShared: true,
      isTableAttributed: false,
      sharedWithParticipantIds: [],
      note: 'Medium',
    },
    {
      lineId: 'l-1b',
      orderId: 'o-1',
      menuItemId: 'm-wine',
      name: 'Wine',
      quantity: 1,
      unitPriceAmd: 3_000,
      lineTotalAmd: 3_000,
      isShared: false,
      isTableAttributed: false,
      sharedWithParticipantIds: [],
      onBehalfOfParticipantId: 'p-narine',
    },
  ],
  placedByName: 'Narek Hakobyan',
};

const PHONE_TICKET = {
  ...WAITER_TICKET,
  orderId: 'o-2',
  tableLabel: '8',
  status: 1,
  lines: [{ ...WAITER_TICKET.lines[0]!, lineId: 'l-2', orderId: 'o-2', note: null }],
  placedByName: undefined,
};

function gatewayOver(routes: Parameters<typeof fakeBackend>[0]) {
  return createStaffHttpGateway(fakeBackend(routes).client());
}

describe('a kitchen ticket says who sent it', () => {
  it('names the waiter who keyed it in, and says nobody for a diner from the app', async () => {
    const gateway = gatewayOver({ [ORDERS]: { body: [WAITER_TICKET, PHONE_TICKET] } });

    const [waiter, phone] = await gateway.listOrderQueue(BRANCH);

    expect(waiter?.placedByName).toBe('Narek Hakobyan');
    // Absent on the wire is null here, never undefined.
    expect(phone?.placedByName).toBeNull();
  });

  it('carries the sender on the ticket a move answers with, too', async () => {
    const gateway = gatewayOver({
      'POST /api/orders/o-1/status': { body: { ...WAITER_TICKET, status: 3 } },
    });

    const moved = await gateway.setOrderStatus({
      orderId: 'o-1',
      status: 'ready',
      clientCommandId: 'c-1',
    });

    expect(moved.status).toBe('ready');
    expect(moved.placedByName).toBe('Narek Hakobyan');
  });

  it("keeps each line's dish, so the board can look its allergens up", async () => {
    const gateway = gatewayOver({ [ORDERS]: { body: [WAITER_TICKET] } });

    const [ticket] = await gateway.listOrderQueue(BRANCH);

    expect(ticket?.lines[0]).toEqual({
      lineId: 'l-1',
      menuItemId: 'm-steak',
      name: 'Steak',
      quantity: 2,
      note: 'Medium',
      // Absent on the wire for a shared line.
      onBehalfOfParticipantId: null,
    });
    expect(ticket?.lines[1]?.onBehalfOfParticipantId).toBe('p-narine');
  });
});

describe('the staff menu carries allergens', () => {
  it('keeps what the venue wrote, and null where it wrote nothing', async () => {
    const dish = (id: string, allergens: string) => ({
      id,
      categoryId: 'c1',
      name: id,
      description: '',
      priceAmd: 1_000,
      // The staff menu keeps only dishes fit to show, and those have a photo.
      photo: { photoId: `p-${id}`, thumbnailUrl: '/t', cardUrl: '/c', fullUrl: '/f' },
      ingredients: 'Things',
      allergens,
      portionSize: '100 g',
      spiceLevel: 0,
      prepMinutes: 5,
      isAvailable: true,
      isComplete: true,
      displayOrder: 1,
    });
    const gateway = gatewayOver({
      [`GET /api/branches/${BRANCH}/menu`]: {
        body: {
          branchId: BRANCH,
          categories: [
            {
              id: 'c1',
              name: 'Grill',
              displayOrder: 1,
              items: [dish('trout', 'fish'), dish('tolma', ''), dish('water', 'none')],
            },
          ],
        },
      },
    });

    const items = (await gateway.getMenu(BRANCH))?.sections[0]?.items ?? [];

    expect(items.map((item) => item.allergens)).toEqual(['fish', null, 'none']);
  });
});
