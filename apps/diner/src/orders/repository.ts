import { usingMockData } from '../data/gateway';
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
// HTTP — rejects until the backend has order endpoints.
// ---------------------------------------------------------------------------

export function createHttpOrderRepository(): OrderRepository {
  const refuse = (operation: string) => Promise.reject(new OrderApiNotImplementedError(operation));
  return {
    list: () => refuse('list'),
    getById: () => refuse('getById'),
    cancel: () => refuse('cancel'),
  };
}

export const orderRepository: OrderRepository = usingMockData
  ? createMockOrderRepository()
  : createHttpOrderRepository();
