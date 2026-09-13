/**
 * A food order the diner placed — at a table, or to take away.
 *
 * Distinct from a *booking* (a held table) and from the live *tab* under
 * `src/tab`: this is the receipt-shaped record the Orders tab lists, with a
 * status that moves forward and a timeline that remembers when.
 */

export type OrderKind = 'dineIn' | 'takeaway';

export type OrderStatus =
  'confirmed' | 'preparing' | 'inProgress' | 'ready' | 'completed' | 'cancelled';

/** Which colour family a status pill uses. Resolved to actual colours by the theme. */
export type StatusTone = 'success' | 'warning' | 'info' | 'neutral' | 'error';

export interface OrderItem {
  readonly id: string;
  readonly name: string;
  readonly quantity: number;
  /** Whole dram, per unit. */
  readonly unitPriceDram: number;
  readonly note?: string;
}

export interface OrderTimelineEntry {
  readonly status: OrderStatus;
  /** ISO-8601 UTC instant. */
  readonly at: string;
}

export interface Order {
  readonly id: string;
  /** The branch id — the same id a `Place` carries. */
  readonly placeId: string;
  /** Denormalised so the list renders without a second read per card. */
  readonly placeName: string;
  readonly placePhoto: string;
  readonly kind: OrderKind;
  readonly status: OrderStatus;
  /** Dine-in only. */
  readonly tableLabel?: string;
  readonly partySize?: number;
  /** ISO-8601 UTC instant. */
  readonly placedAt: string;
  readonly items: readonly OrderItem[];
  /** Whole dram. */
  readonly totalDram: number;
  /** Oldest first. The last entry is the current status. */
  readonly timeline: readonly OrderTimelineEntry[];
}

// ---------------------------------------------------------------------------
// Helpers. Pure, tested in `model.test.ts`.
// ---------------------------------------------------------------------------

const ACTIVE_STATUSES: ReadonlySet<OrderStatus> = new Set([
  'confirmed',
  'preparing',
  'inProgress',
  'ready',
]);

/**
 * An order still "active" by status but placed this long ago has been
 * forgotten by the venue too; it drops into History so it cannot sit on top of
 * the Active tab for a week.
 */
export const ACTIVE_WINDOW_MS = 24 * 60 * 60_000;

export function isActiveStatus(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function isActiveOrder(order: Order, now: Date): boolean {
  if (!isActiveStatus(order.status)) return false;
  const placed = new Date(order.placedAt).getTime();
  return now.getTime() - placed < ACTIVE_WINDOW_MS;
}

const byPlacedAtDesc = (a: Order, b: Order): number =>
  new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime();

export interface SplitOrders {
  /** Newest first. */
  readonly active: readonly Order[];
  /** Newest first. */
  readonly history: readonly Order[];
}

/** The two segments of the Orders tab. */
export function splitOrders(orders: readonly Order[], now: Date): SplitOrders {
  const active: Order[] = [];
  const history: Order[] = [];
  for (const order of orders) {
    (isActiveOrder(order, now) ? active : history).push(order);
  }
  return { active: active.sort(byPlacedAtDesc), history: history.sort(byPlacedAtDesc) };
}

/** Confirmed and Ready read green, the kitchen states orange/blue, the finished ones grey/red. */
export function orderStatusTone(status: OrderStatus): StatusTone {
  switch (status) {
    case 'confirmed':
    case 'ready':
      return 'success';
    case 'preparing':
      return 'warning';
    case 'inProgress':
      return 'info';
    case 'completed':
      return 'neutral';
    case 'cancelled':
      return 'error';
  }
}

/** The `diner` namespace key for a status label. */
export function orderStatusKey(status: OrderStatus): `orders.status.${OrderStatus}` {
  return `orders.status.${status}`;
}

/** A diner can only cancel before the kitchen has started. */
export function canCancelOrder(order: Order): boolean {
  return order.status === 'confirmed';
}

/** Tracking is for a takeaway still on its way to "ready". */
export function canTrackOrder(order: Order): boolean {
  return (
    order.kind === 'takeaway' && (order.status === 'preparing' || order.status === 'inProgress')
  );
}

/** Sum of the lines, whole dram. */
export function orderItemsTotal(items: readonly OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPriceDram, 0);
}
