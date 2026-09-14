import type { YallaGateway } from '@yalla/api';
import { gateway, usingMockData } from '../data/gateway';
import { orderFromApi } from './httpMapping';
import { createMockOrders } from './mockOrders';
import { canCancelOrder, type Order } from './model';

/**
 * Where the Orders tab gets its orders. Same shape as `places/repository.ts`:
 * a mock that holds state in memory, and an HTTP stub for the backend.
 */

export interface OrderRepository {
  /** Every order of this diner, in no particular order — `splitOrders` sorts. */
  list(): Promise<readonly Order[]>;
  /** `null` when the id is unknown. */
  getById(orderId: string): Promise<Order | null>;
  /** Cancels a confirmed order and returns it. Rejects when it is past cancelling. */
  cancel(orderId: string): Promise<Order>;
}

export class OrderApiNotImplementedError extends Error {
  constructor(operation: string) {
    super(`not implemented: orders.${operation}`);
    this.name = 'OrderApiNotImplementedError';
  }
}

/** The kitchen has the order already, or it is already finished. */
export class OrderNotCancellableError extends Error {
  constructor(readonly orderId: string) {
    super(`order ${orderId} cannot be cancelled`);
    this.name = 'OrderNotCancellableError';
  }
}

export class OrderNotFoundError extends Error {
  constructor(readonly orderId: string) {
    super(`order ${orderId} not found`);
    this.name = 'OrderNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Mock
// ---------------------------------------------------------------------------

export interface MockOrderRepositoryOptions {
  readonly latencyMs?: number;
  readonly now?: () => Date;
  readonly seed?: readonly Order[];
}

function wait(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockOrderRepository(
  options: MockOrderRepositoryOptions = {},
): OrderRepository {
  const latencyMs = options.latencyMs ?? 350;
  const now = options.now ?? (() => new Date());
  let orders: readonly Order[] = options.seed ?? createMockOrders(now());

  return {
    async list() {
      await wait(latencyMs);
      return orders;
    },
    async getById(orderId) {
      await wait(latencyMs);
      return orders.find((order) => order.id === orderId) ?? null;
    },
    async cancel(orderId) {
      await wait(latencyMs);
      const current = orders.find((order) => order.id === orderId);
      if (!current) throw new OrderNotFoundError(orderId);
      if (!canCancelOrder(current)) throw new OrderNotCancellableError(orderId);
      const cancelled: Order = {
        ...current,
        status: 'cancelled',
        timeline: [...current.timeline, { status: 'cancelled', at: now().toISOString() }],
      };
      orders = orders.map((order) => (order.id === orderId ? cancelled : order));
      return cancelled;
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP — `GET /api/diner/orders` and `/{id}` through the gateway.
// ---------------------------------------------------------------------------

export function createHttpOrderRepository(
  source: Pick<YallaGateway, 'listDinerOrders' | 'getDinerOrder'> = gateway,
): OrderRepository {
  return {
    // A 401 is passed on, not turned into "no orders" or "not found": orders
    // live on the account, so the screen's answer to it is a way to sign in.
    async list() {
      // Both segments: `splitOrders` applies the 24-hour window itself.
      return (await source.listDinerOrders()).map(orderFromApi);
    },
    async getById(orderId) {
      const order = await source.getDinerOrder(orderId);
      return order ? orderFromApi(order) : null;
    },
    // The domain has no diner cancel — voiding is staff-only — so there is no
    // endpoint to call and no request is made.
    cancel: (orderId) => Promise.reject(new OrderNotCancellableError(orderId)),
  };
}

export const orderRepository: OrderRepository = usingMockData
  ? createMockOrderRepository()
  : createHttpOrderRepository();
