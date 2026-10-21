import { parseAllergens, type AllergenPreset, type Menu, type OrderQueueEntry } from '@yalla/api';
import type { QueuedCommand } from './commands/types';

/**
 * The kitchen board's arithmetic (floor-tablet `Kitchen` artboard), kept apart
 * from the screen so each rule is tested on its own: the band a ticket is in,
 * the three counts over the board, its two orders, the sender's first name,
 * a dish's allergens, and a "ready" the tablet has queued and not yet sent.
 */

/**
 * Minutes at which a ticket stops being fresh, and at which it is late. The
 * board's own thresholds, and not the calls' (`ageBand`): a call is late at
 * ten, food at twelve.
 */
export const TICKET_WAITING_MINUTES = 6;
export const TICKET_LATE_MINUTES = 12;

export type TicketBand = 'fresh' | 'waiting' | 'late' | 'ready' | 'unsent';

/**
 * The band, from the server's own count of minutes — never the tablet's
 * clock, which on a pass tablet can be twenty minutes out and would paint
 * every ticket late, or none of them.
 *
 * A ticket its waiter has not sent yet is `unsent`, however old: the kitchen
 * cannot act on it, so it is never late and never red on the kitchen's board
 * (live QA 1). It is the waiter's to send, and the floor's rail says so.
 */
export function ticketBand(order: OrderQueueEntry): TicketBand {
  if (order.status === 'ready') return 'ready';
  if (order.status === 'new') return 'unsent';
  const minutes = ticketMinutes(order);
  if (minutes >= TICKET_LATE_MINUTES) return 'late';
  if (minutes >= TICKET_WAITING_MINUTES) return 'waiting';
  return 'fresh';
}

/**
 * A pre-order ticket's minutes from whichever came later, its booking's start
 * or its send (2026-10-21): negative before the start — still to go — and how
 * long the kitchen has had it after. Null for any other ticket.
 *
 * Sent before the start, it is cooked for the booking and ages from the start.
 * Sent after it — the party came late — the kitchen first saw it at the send,
 * so it ages from then like any order, and is not late on arrival (review S4).
 *
 * From the server's own count, as every age on the board: the ticket was
 * placed (sent) at `placedAtUtc` and the server says `waitingMinutes` have
 * passed, so the server's now is their sum, and the tablet's clock is not
 * asked.
 */
export function ticketMinutesFromStart(order: OrderQueueEntry): number | null {
  if (!order.preOrder) return null;
  const placed = Date.parse(order.placedAtUtc);
  const start = Date.parse(order.preOrder.startUtc);
  if (!Number.isFinite(placed) || !Number.isFinite(start)) return null;
  return order.waitingMinutes - Math.max(0, Math.round((start - placed) / 60_000));
}

/**
 * The minutes a ticket's band, timer and "by wait" place are read from: a
 * pre-order's from its start (or send), any other ticket's wait. One number,
 * so a pre-order not due yet never sorts ahead of a late table (review S3).
 */
export function ticketMinutes(order: OrderQueueEntry): number {
  return ticketMinutesFromStart(order) ?? order.waitingMinutes;
}

export interface KitchenCounts {
  readonly fresh: number;
  readonly waiting: number;
  readonly late: number;
}

/**
 * The counts over the board: the tickets cooking. A ready one has left the
 * kitchen, and an unsent one has not reached it.
 */
export function kitchenCounts(orders: readonly OrderQueueEntry[]): KitchenCounts {
  const counts = { fresh: 0, waiting: 0, late: 0 };
  for (const order of orders) {
    const band = ticketBand(order);
    if (band !== 'ready' && band !== 'unsent') counts[band] += 1;
  }
  return counts;
}

/** By wait: cooking first, then what its waiter has still to send, then ready. */
const GROUP: Readonly<Record<OrderQueueEntry['status'], number>> = {
  inKitchen: 0,
  new: 1,
  ready: 2,
  served: 3,
  voided: 3,
};

export type TicketSort = 'age' | 'table';

const byLabel = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * By wait — the minutes the band reads (`ticketMinutes`) — the oldest on the
 * left and the ready ones at the end, where they wait for a waiter and stop
 * competing with what is still cooking; ties by when they were sent. By table, in the order a person counts tables: 2
 * before 12.
 */
export function sortTickets(
  orders: readonly OrderQueueEntry[],
  sort: TicketSort,
): readonly OrderQueueEntry[] {
  const list = [...orders];
  if (sort === 'table') {
    return list.sort((a, b) => byLabel.compare(a.tableLabel, b.tableLabel));
  }
  return list.sort(
    (a, b) =>
      GROUP[a.status] - GROUP[b.status] ||
      ticketMinutes(b) - ticketMinutes(a) ||
      a.placedAtUtc.localeCompare(b.placedAtUtc),
  );
}

/** The sender as the ticket has room for: "Narek", as the artboard writes it. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/u)[0] ?? '';
}

export interface DishAllergens {
  readonly presets: readonly AllergenPreset[];
  /** The venue's own words, as it wrote them. Empty when it used presets only. */
  readonly other: string;
}

/** Each dish's stored allergens by id: built once per menu, read once per line. */
export type AllergenIndex = ReadonlyMap<string, string | null | undefined>;

export function allergenIndex(menu: Menu | null | undefined): AllergenIndex | null {
  if (!menu) return null;
  return new Map(
    menu.sections.flatMap((section) =>
      section.items.map((item) => [item.id, item.allergens] as const),
    ),
  );
}

/**
 * What the dish on a line holds, from the menu the tablet already reads.
 *
 * - The warning, when the venue listed allergens.
 * - Null when the menu says the dish is clean: "none", or nothing written.
 * - `unknown` when the tablet cannot say: no menu yet, a dish the menu does
 *   not have (added or changed since it was read), or a menu cached before
 *   allergens were kept. A missing warning must not look like "no
 *   allergens" (FT4 review S4); the ticket says to check instead.
 */
export function dishAllergens(
  index: AllergenIndex | null,
  menuItemId: string | undefined,
): DishAllergens | null | 'unknown' {
  if (!index || !menuItemId || !index.has(menuItemId)) return 'unknown';
  const stored = index.get(menuItemId);
  if (stored === undefined) return 'unknown';
  if (!stored) return null;
  const parsed = parseAllergens(stored);
  if (parsed.none || (parsed.presets.length === 0 && !parsed.other)) return null;
  return { presets: parsed.presets, other: parsed.other };
}

/**
 * The board's minutes, carried forward while the queue cannot be re-read.
 *
 * Offline, the last read's `waitingMinutes` would freeze, and a ticket at 11
 * minutes would never turn late. The whole minutes since that read are added:
 * a difference on the device's own clock, so a clock that is simply wrong
 * still does not paint the board (FT4 review N5).
 */
export function ageOrders(
  orders: readonly OrderQueueEntry[],
  minutesSinceRead: number,
): readonly OrderQueueEntry[] {
  if (minutesSinceRead <= 0) return orders;
  return orders.map((order) => ({
    ...order,
    waitingMinutes: order.waitingMinutes + minutesSinceRead,
  }));
}

export interface ProjectedOrders {
  readonly orders: readonly OrderQueueEntry[];
  /** Tickets whose drawn status comes from a queued tap, not from the server. */
  readonly pendingOrderIds: ReadonlySet<string>;
}

/**
 * The board with the tablet's unsent moves applied, and every one of them
 * marked — the floor's rule for tables (`optimisticFloor`), for tickets.
 *
 * A cook who taps "Ready" with the wifi down and watches the ticket stay put
 * taps it again, and the second tap is a second move the server refuses once
 * the first lands. So the ticket moves, and says it has not been sent.
 */
export function projectOrders(
  orders: readonly OrderQueueEntry[],
  queue: readonly QueuedCommand[],
): ProjectedOrders {
  const moves = new Map<string, OrderQueueEntry['status']>();
  for (const command of [...queue].sort((a, b) => a.seq - b.seq)) {
    if (command.body.kind !== 'setOrderStatus') continue;
    moves.set(command.body.command.orderId, command.body.command.status);
  }
  if (moves.size === 0) return { orders, pendingOrderIds: new Set() };

  return {
    orders: orders.map((order) => {
      const status = moves.get(order.orderId);
      return status === undefined ? order : { ...order, status };
    }),
    pendingOrderIds: new Set(orders.map((order) => order.orderId).filter((id) => moves.has(id))),
  };
}

/**
 * Tickets that have reached the kitchen since the last read, for the pass
 * tablet's chime. `seen` is null before the first read: what is already on the
 * board when the screen opens is not news. A ticket arrives when it is first
 * seen cooking — sent by its waiter — not when a diner's order is still
 * waiting for one; and a ticket that has been and gone never arrives twice.
 */
export function kitchenArrivals(
  seen: ReadonlySet<string> | null,
  orders: readonly OrderQueueEntry[],
): { readonly seen: ReadonlySet<string>; readonly arrived: readonly OrderQueueEntry[] } {
  const reached = orders.filter((order) => order.status !== 'new');
  const next = new Set(seen ?? []);
  for (const order of reached) next.add(order.orderId);
  if (!seen) return { seen: next, arrived: [] };
  return {
    seen: next,
    arrived: reached.filter((order) => order.status === 'inKitchen' && !seen.has(order.orderId)),
  };
}
