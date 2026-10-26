import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, offSchema, type FakeRoute } from './fakeBackend.testkit';

/**
 * The menu's order and completeness over HTTP (VC3 wire §2): one PUT per
 * reorder carrying the whole list, and `missingFields` derived by the server.
 */

function gatewayOver(routes: Record<string, FakeRoute>) {
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

/** `missingFields: null` leaves the field out, as a server from before it did. */
const item = (id: string, displayOrder: number, missingFields: string[] | null = []) => ({
  id,
  categoryId: 'c-1',
  name: id,
  priceAmd: 900,
  spiceLevel: 0,
  isAvailable: true,
  isComplete: !missingFields?.length,
  displayOrder,
  availableForPreOrder: true,
  availableForTakeaway: true,
  ...(missingFields ? { missingFields } : {}),
});

describe('the menu order over HTTP', () => {
  it('sends every category once, first to last, and reads the menu back in that order', async () => {
    const { gateway, backend } = gatewayOver({
      'PUT /api/branches/b-1/menu/categories/order': {
        body: [
          { id: 'c-2', name: 'Pastry', displayOrder: 0, items: [] },
          { id: 'c-1', name: 'Coffee', displayOrder: 1, items: [] },
        ],
      },
    });

    const menu = await gateway.reorderMenuCategories({
      branchId: 'b-1',
      categoryIds: ['c-2', 'c-1'],
    });

    expect(backend.requests).toHaveLength(1);
    expect(backend.requests[0]?.body).toEqual({ categoryIds: ['c-2', 'c-1'] });
    expect(menu.map((category) => category.id)).toEqual(['c-2', 'c-1']);
  });

  it("sends a category's every dish once, and takes that category back", async () => {
    const { gateway, backend } = gatewayOver({
      'PUT /api/branches/b-1/menu/categories/c-1/items/order': {
        body: {
          id: 'c-1',
          name: 'Coffee',
          displayOrder: 0,
          items: [item('i-2', 0), item('i-1', 1)],
        },
      },
    });

    const category = await gateway.reorderMenuItems({
      branchId: 'b-1',
      categoryId: 'c-1',
      itemIds: ['i-2', 'i-1'],
    });

    expect(backend.requests[0]?.body).toEqual({ itemIds: ['i-2', 'i-1'] });
    expect(category.items.map((entry) => entry.id)).toEqual(['i-2', 'i-1']);
  });

  it("reads the server's missing fields in the client's names, and none when it sends none", async () => {
    const { gateway } = gatewayOver({
      'GET /api/branches/b-1/menu/manage': offSchema(
        {
          body: [
            {
              id: 'c-1',
              name: 'Coffee',
              displayOrder: 0,
              items: [item('i-1', 0, ['photo', 'allergens']), item('i-2', 1, null)],
            },
          ],
        },
        'i-2 comes from a server before missingFields, which the client must survive',
      ),
    });

    const [coffee] = await gateway.getAdminMenu('b-1');
    expect(coffee?.items[0]?.missingFields).toEqual(['photoId', 'allergens']);
    // A server from before the field: the client derives it, from the same rule.
    expect(coffee?.items[1]?.missingFields).toBeUndefined();
  });
});
