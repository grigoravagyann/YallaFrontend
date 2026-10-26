import { describe, expect, it } from 'vitest';
import { OrderGuestUnavailableError, TabNotAcceptingOrdersError } from '../contracts/errors';
import { ConcurrencyConflictError, NotFoundError, ValidationError } from '../errors';
import type { components } from '../generated/schema';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createStaffHttpGateway } from './staffHttpGateway';
import { tabLine } from './staffMapping';

/**
 * Who each line is for (floor tablet gap 3, FT3 wire).
 *
 * The draft on the tablet names a guest per line. The wire used to take one
 * guest per order, so the gateway split a draft into one order per guest —
 * several kitchen tickets for one round. `items[i].participantId` makes it one
 * send, one order, one ticket.
 */

type OrderWire = components['schemas']['Yalla.Application.Ordering.OrderView'];
type LineWire = components['schemas']['Yalla.Application.Ordering.OrderLineView'];

const TAB = '7d0c0000-0000-4000-8000-000000000001';
const NARINE = '5a1e0000-0000-4000-8000-0000000000a1';
const ARAM = '5a1e0000-0000-4000-8000-0000000000a2';
const COMMAND = '3f2b9c10-6d1e-4c1a-9d43-2f6c7f0b1234';
const ROUTE = `POST /api/tabs/${TAB}/staff-orders`;

const ORDER: OrderWire = {
  orderId: 'o-1',
  tabId: TAB,
  status: 1,
  placedAtUtc: '2026-10-19T17:00:00Z',
  wasReplay: false,
  lines: [],
  tableTotalVisible: true,
  tabEventSequence: 7,
} as unknown as OrderWire;

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return { gateway: createStaffHttpGateway(backend.client()), backend };
}

const round = {
  tabId: TAB,
  clientCommandId: COMMAND,
  shape: 2,
  lines: [
    { menuItemId: 'latte', quantity: 2, isShared: true, participantId: null },
    { menuItemId: 'steak', quantity: 1, isShared: false, participantId: NARINE, note: 'Medium' },
    { menuItemId: 'coffee', quantity: 1, isShared: false, participantId: ARAM },
    { menuItemId: 'water', quantity: 1, isShared: false, participantId: null },
  ],
} as const;

describe('a round with a different guest on each line', () => {
  it('goes as one order, each line naming its own guest', async () => {
    const { gateway, backend } = gatewayOver({ [ROUTE]: { status: 201, body: ORDER } });

    await gateway.placeOrder(round);

    expect(backend.requests).toHaveLength(1);
    expect(backend.requests[0]!.body).toEqual({
      clientCommandId: expect.any(String),
      items: [
        { menuItemId: 'latte', quantity: 2, isShared: true },
        {
          menuItemId: 'steak',
          quantity: 1,
          isShared: false,
          participantId: NARINE,
          note: 'Medium',
        },
        { menuItemId: 'coffee', quantity: 1, isShared: false, participantId: ARAM },
        { menuItemId: 'water', quantity: 1, isShared: false },
      ],
    });
    // No order-wide guest: every line says its own.
    expect(backend.requests[0]!.body).not.toHaveProperty('onBehalfOfParticipantId');
  });

  it('never names a guest on a shared line, whatever the draft says', async () => {
    const { gateway, backend } = gatewayOver({ [ROUTE]: { status: 201, body: ORDER } });

    await gateway.placeOrder({
      tabId: TAB,
      clientCommandId: COMMAND,
      shape: 2,
      lines: [{ menuItemId: 'wine', quantity: 1, isShared: true, participantId: NARINE }],
    });

    const items = (backend.requests[0]!.body as { items: Record<string, unknown>[] }).items;
    expect(items[0]).toEqual({ menuItemId: 'wine', quantity: 1, isShared: true });
  });

  it('keeps the same idempotency key on a retry', async () => {
    const { gateway, backend } = gatewayOver({ [ROUTE]: { status: 201, body: ORDER } });

    await gateway.placeOrder(round);
    await gateway.placeOrder(round);

    const keys = backend.requests.map(
      (request) => (request.body as { clientCommandId: string }).clientCommandId,
    );
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  });
});

describe('a send that names a guest who cannot be named', () => {
  it('says so when the guest is not on the tab (404 with the guest named)', async () => {
    const { gateway } = gatewayOver({
      [ROUTE]: problemReply(404, 'not-found', {
        field: 'items[1].participantId',
        participantId: NARINE,
      }),
    });
    const error = await gateway.placeOrder(round).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OrderGuestUnavailableError);
    expect(error).toMatchObject({ participantId: NARINE, guestState: 'notOnTab' });
  });

  it('says which: not let on yet, or taken off (409 with the guest named)', async () => {
    for (const [participantStatus, guestState] of [
      [1, 'pending'],
      [3, 'removed'],
    ] as const) {
      const { gateway } = gatewayOver({
        [ROUTE]: problemReply(409, 'conflicting-state', {
          field: 'items[2].participantId',
          participantId: ARAM,
          participantStatus,
        }),
      });
      const error = await gateway.placeOrder(round).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(OrderGuestUnavailableError);
      expect(error).toMatchObject({ participantId: ARAM, guestState });
      // Not a table race: nothing here may be swallowed as one.
      expect(error).not.toBeInstanceOf(ConcurrencyConflictError);
    }
  });

  it('does not blame a guest for a 404 or 409 that names none, even when the send named one', async () => {
    // A dish deleted from a cached menu, or one on another branch's menu.
    const missing = gatewayOver({ [ROUTE]: problemReply(404, 'not-found', {}) });
    const notFound = await missing.gateway.placeOrder(round).catch((caught: unknown) => caught);
    expect(notFound).not.toBeInstanceOf(OrderGuestUnavailableError);
    expect(notFound).toBeInstanceOf(NotFoundError);
    const other = gatewayOver({ [ROUTE]: problemReply(409, 'conflicting-state', {}) });
    const conflict = await other.gateway.placeOrder(round).catch((caught: unknown) => caught);
    expect(conflict).not.toBeInstanceOf(OrderGuestUnavailableError);
  });

  it('says why a tab takes no orders: bill asked for, paid and closed, or written off', async () => {
    for (const [status, tabStatus] of [
      [2, 'closing'],
      [3, 'closed'],
      [4, 'abandoned'],
    ] as const) {
      const { gateway } = gatewayOver({
        [ROUTE]: problemReply(409, 'tab-not-accepting-orders', { tabId: TAB, status }),
      });
      const error = await gateway.placeOrder(round).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(TabNotAcceptingOrdersError);
      expect((error as TabNotAcceptingOrdersError).tabStatus).toBe(tabStatus);
    }
  });

  it('leaves the same answers alone when the send named nobody', async () => {
    const nobody = {
      tabId: TAB,
      clientCommandId: COMMAND,
      shape: 2,
      lines: [{ menuItemId: 'latte', quantity: 1, isShared: true, participantId: null }],
    } as const;
    const missing = gatewayOver({ [ROUTE]: problemReply(404, 'not-found', {}) });
    expect(
      await missing.gateway.placeOrder(nobody).catch((caught: unknown) => caught),
    ).toBeInstanceOf(NotFoundError);
    const moved = gatewayOver({ [ROUTE]: problemReply(409, 'conflicting-state', {}) });
    expect(
      await moved.gateway.placeOrder(nobody).catch((caught: unknown) => caught),
    ).toBeInstanceOf(ConcurrencyConflictError);
  });

  it('keeps a shared line naming a guest a plain refusal (400)', async () => {
    const { gateway } = gatewayOver({
      [ROUTE]: problemReply(400, 'invalid-request', { field: 'items[1].participantId' }),
    });
    const error = await gateway.placeOrder(round).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe('items[1].participantId');
  });
});

describe('a line read back', () => {
  const line: LineWire = {
    lineId: 'l-1',
    menuItemId: 'steak',
    name: 'Steak',
    unitPriceAmd: 9800,
    quantity: 1,
    lineTotalAmd: 9800,
    isShared: false,
    isTableAttributed: false,
    sharedWithParticipantIds: [],
  };
  const order = { orderId: 'o-1', placedAtUtc: '2026-10-19T17:00:00Z', status: 2 };

  it('carries the guest it is for', () => {
    expect(
      tabLine({ ...line, onBehalfOfParticipantId: NARINE }, order).onBehalfOfParticipantId,
    ).toBe(NARINE);
  });

  it('is nobody’s when the server leaves the member out', () => {
    expect(tabLine(line, order).onBehalfOfParticipantId).toBeNull();
  });
});

describe('the dish photos order entry shows', () => {
  it('come with the staff menu, as absolute links', async () => {
    const BRANCH = 'b-1';
    const { gateway } = gatewayOver({
      [`GET /api/branches/${BRANCH}/menu`]: {
        body: {
          branchId: BRANCH,
          categories: [
            {
              id: 'c1',
              name: 'Grill',
              displayOrder: 1,
              items: [
                {
                  id: 'm1',
                  categoryId: 'c1',
                  name: 'Khorovats',
                  description: 'Pork on the bone',
                  priceAmd: 4500,
                  photo: {
                    photoId: 'p1',
                    thumbnailUrl: '/api/photos/p1/thumbnail',
                    cardUrl: '/api/photos/p1/card',
                    fullUrl: 'https://cdn.example/p1.jpg',
                  },
                  ingredients: 'Pork',
                  allergens: '',
                  portionSize: '300 g',
                  spiceLevel: 0,
                  prepMinutes: 20,
                  isAvailable: true,
                  isComplete: true,
                  missingFields: [],
                  availableForPreOrder: true,
                  availableForTakeaway: true,
                  displayOrder: 1,
                },
              ],
            },
          ],
        },
      },
    });

    const menu = await gateway.getMenu(BRANCH);
    const photo = menu?.sections[0]?.items[0]?.photo;
    expect(photo?.thumbnailUrl).toBe('https://api.test.yalla.am/api/photos/p1/thumbnail');
  });
});

describe('an order the previous build queued (review S3)', () => {
  // The old build sent a draft as one order per guest: group 0 under the id
  // with its last four hex digits 0000, group 1 under 0001, each naming its
  // guest at the order level. Group 0 landed; group 1 was still queued.
  const legacy = {
    tabId: TAB,
    clientCommandId: COMMAND,
    lines: [
      { menuItemId: 'latte', quantity: 2, isShared: true, participantId: null },
      { menuItemId: 'steak', quantity: 1, isShared: false, participantId: NARINE },
    ],
  } as const;

  it('replays the old way, one order per guest, so the group that never landed still does', async () => {
    const backend = fakeBackend({
      [ROUTE]: (request) => {
        const body = request.body as { clientCommandId: string };
        // The server has group 0 already and replays it.
        return body.clientCommandId.endsWith('0000')
          ? { status: 201, body: { ...ORDER, orderId: 'o-group-0', wasReplay: true } }
          : { status: 201, body: { ...ORDER, orderId: 'o-group-1' } };
      },
    });
    const gateway = createStaffHttpGateway(backend.client());

    await gateway.placeOrder(legacy);

    expect(backend.requests).toHaveLength(2);
    expect(backend.requests.map((request) => request.body)).toEqual([
      {
        clientCommandId: `${COMMAND.slice(0, -4)}0000`,
        items: [{ menuItemId: 'latte', quantity: 2, isShared: true }],
      },
      {
        clientCommandId: `${COMMAND.slice(0, -4)}0001`,
        items: [{ menuItemId: 'steak', quantity: 1, isShared: false }],
        onBehalfOfParticipantId: NARINE,
      },
    ]);
  });

  it('sends a new-shape order as one, with each line naming its guest', async () => {
    const { gateway, backend } = gatewayOver({ [ROUTE]: { status: 201, body: ORDER } });
    await gateway.placeOrder({ ...legacy, shape: 2 });
    expect(backend.requests).toHaveLength(1);
  });
});
