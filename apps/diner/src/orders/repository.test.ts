import type { DinerOrder } from '@yalla/api';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as RepositoryModule from './repository';

/**
 * The HTTP order repository against a fake gateway. The assertions are about
 * the gateway calls made, so the mock repository — which makes none — fails
 * them.
 */

vi.mock('expo-constants', () => ({ default: { expoConfig: null, expoGoConfig: null } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(() => Promise.resolve(null)),
  setItemAsync: vi.fn(() => Promise.resolve()),
  deleteItemAsync: vi.fn(() => Promise.resolve()),
}));

type Repository = typeof RepositoryModule;
let repository: Repository;

beforeAll(async () => {
  vi.stubEnv('EXPO_PUBLIC_DATA_SOURCE', 'real');
  vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://localhost:5086');
  repository = await import('./repository');
});

afterEach(() => {
  vi.clearAllMocks();
});

const ORDER: DinerOrder = {
  orderId: 'o1',
  tabId: 'tab',
  branchId: 'b1',
  venueName: 'Lumen Coffee',
  branchName: 'Cascade',
  coverPhoto: null,
  kind: 'dineIn',
  status: 'preparing',
  tableLabel: '5',
  partySize: 2,
  placedAtUtc: '2026-09-14T09:00:00Z',
  estimatedReadyAtUtc: null,
  totalAmd: 2400,
  items: [
    {
      lineId: 'l1',
      name: 'Flat white',
      quantity: 2,
      unitPriceAmd: 1200,
      lineTotalAmd: 2400,
      note: null,
      isVoided: false,
    },
  ],
  timeline: [{ status: 'confirmed', atUtc: '2026-09-14T09:00:00Z' }],
  canCancel: false,
};

function fakeGateway() {
  return {
    listDinerOrders: vi.fn(() => Promise.resolve([ORDER])),
    getDinerOrder: vi.fn((id: string) => Promise.resolve(id === 'o1' ? ORDER : null)),
  };
}

describe('createHttpOrderRepository', () => {
  it("lists the diner's orders from the orders route, both segments", async () => {
    const gateway = fakeGateway();
    const orders = repository.createHttpOrderRepository(gateway);

    const list = await orders.list();

    expect(gateway.listDinerOrders).toHaveBeenCalledWith();
    expect(list.map((order) => [order.id, order.status])).toEqual([['o1', 'preparing']]);
  });

  it('answers null for an unknown or somebody else’s order', async () => {
    const gateway = fakeGateway();
    const orders = repository.createHttpOrderRepository(gateway);

    expect((await orders.getById('o1'))?.placeId).toBe('b1');
    expect(await orders.getById('not-mine')).toBeNull();
    expect(gateway.getDinerOrder).toHaveBeenCalledWith('not-mine');
  });

  it('refuses a cancel without making any request: a diner cannot void an order', async () => {
    const gateway = fakeGateway();
    const orders = repository.createHttpOrderRepository(gateway);

    await expect(orders.cancel('o1')).rejects.toBeInstanceOf(repository.OrderNotCancellableError);

    expect(gateway.listDinerOrders).not.toHaveBeenCalled();
    expect(gateway.getDinerOrder).not.toHaveBeenCalled();
  });

  it('passes a failed read on, rather than answering "no orders"', async () => {
    const failure = new Error('unauthorized');
    const orders = repository.createHttpOrderRepository({
      listDinerOrders: () => Promise.reject(failure),
      getDinerOrder: () => Promise.reject(failure),
    });

    await expect(orders.list()).rejects.toBe(failure);
    await expect(orders.getById('o1')).rejects.toBe(failure);
  });
});

/** A takeaway order as `GET /api/diner/orders` lists it (2026-10-22). */
const TAKEAWAY: DinerOrder = {
  ...ORDER,
  orderId: 't1',
  tabId: null,
  kind: 'takeaway',
  status: 'preparing',
  tableLabel: null,
  partySize: null,
  canCancel: false,
  takeaway: {
    code: 'T-482',
    status: 'accepted',
    pickupAsap: true,
    requestedPickupUtc: '2026-09-14T09:20:00Z',
    readyAtUtc: '2026-09-14T09:25:00Z',
    itemCount: 2,
  },
};

describe('takeaway orders (2026-10-22)', () => {
  it('carry their code, status and times onto the card', async () => {
    const orders = repository.createHttpOrderRepository({
      listDinerOrders: () => Promise.resolve([TAKEAWAY]),
      getDinerOrder: () => Promise.resolve(TAKEAWAY),
    });
    const [order] = await orders.list();
    expect(order?.kind).toBe('takeaway');
    expect(order?.takeaway?.code).toBe('T-482');
    expect(order?.takeaway?.status).toBe('accepted');
    expect((await orders.list())[0]).not.toHaveProperty('tableLabel');
  });

  it("in mock mode come from the gateway mock, in place of the seeds' own", async () => {
    const orders = repository.createMockOrderRepository({
      latencyMs: 0,
      takeaway: {
        listDinerOrders: () => Promise.resolve([TAKEAWAY]),
        getDinerOrder: (id: string) => Promise.resolve(id === 't1' ? TAKEAWAY : null),
      },
    });
    const list = await orders.list();
    const takeaways = list.filter((order) => order.kind === 'takeaway');
    expect(takeaways.map((order) => order.id)).toEqual(['t1']);
    expect(list.some((order) => order.kind === 'dineIn')).toBe(true);
    expect((await orders.getById('t1'))?.takeaway?.code).toBe('T-482');
    expect(await orders.getById('nope')).toBeNull();
  });
});

describe('which order repository the app runs on', () => {
  it('is the HTTP one when EXPO_PUBLIC_DATA_SOURCE=real', () => {
    expect(repository.orderRepositorySource).toBe('http');
  });
});
