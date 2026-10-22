import {
  TAKEAWAY_LIMITS,
  isTakeawayable,
  newCommandId,
  takeawayNote,
  type MenuItemDetail,
  type PlaceTakeawayOrderCommand,
  type TakeawayPickup,
} from '@yalla/api';
import { create } from 'zustand';

/**
 * The takeaway cart (2026-10-22): what the guest picked from a place's menu to
 * take away, and when they will come for it.
 *
 * Its own thing, apart from a table's tray (`src/order/tray.ts`): a tray
 * belongs to a tab and goes to the kitchen of the table the guest is sitting
 * at; a cart belongs to nobody's table, is paid at the counter, and must never
 * be confused with one. One cart at a time, for one branch — picking a dish
 * at another place starts a new one.
 *
 * Like the tray it lives for as long as the app runs and nowhere else: a cart
 * found again tomorrow is food decided against today.
 */

export interface TakeawayCartLine {
  readonly item: MenuItemDetail;
  readonly quantity: number;
}

/** "As soon as possible", or a quarter hour today ("19:30" on the branch's clock). */
export type CartPickup = { readonly mode: 'asap' } | { readonly mode: 'at'; readonly at: string };

export interface TakeawayCart {
  /** The branch these dishes are from; `null` while empty. */
  readonly branchId: string | null;
  /** In the order they were first added. */
  readonly lines: readonly TakeawayCartLine[];
  readonly pickup: CartPickup;
  /** The guest's note for the venue, as typed. */
  readonly note: string;
  /**
   * The id the last send went out under, and what it sent. A retry of the
   * same order reuses it — the server answers a replay with the order the
   * first try made, so a send that timed out cannot place two. Anything
   * changed is a new order and a new id.
   */
  readonly sent: { readonly commandId: string; readonly fingerprint: string } | null;
}

export const emptyCart: TakeawayCart = {
  branchId: null,
  lines: [],
  pickup: { mode: 'asap' },
  note: '',
  sent: null,
};

/** The cart for this branch, or an empty one when it holds another's dishes. */
export function cartFor(cart: TakeawayCart, branchId: string | null | undefined): TakeawayCart {
  return branchId && cart.branchId === branchId
    ? cart
    : { ...emptyCart, branchId: branchId ?? null };
}

/** How many of this dish are in the cart. */
export function quantityOf(cart: TakeawayCart, menuItemId: string): number {
  return cart.lines.find((line) => line.item.id === menuItemId)?.quantity ?? 0;
}

/** Every dish counted — "4 items". */
export function cartCount(cart: TakeawayCart): number {
  return cart.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** What is paid at the counter, at the menu's prices now (the server snapshots its own). */
export function cartTotal(cart: TakeawayCart): number {
  return cart.lines.reduce((sum, line) => sum + line.quantity * line.item.priceDram, 0);
}

/**
 * One more of a dish. A dish the takeaway menu does not offer — sold out, or
 * only in the hall — is never added; neither is one past the per-dish or the
 * whole-order limit the server holds. A dish from another branch starts a new
 * cart.
 */
export function addToCart(
  cart: TakeawayCart,
  branchId: string,
  item: MenuItemDetail,
): TakeawayCart {
  if (!isTakeawayable(item)) return cart;
  const base = cart.branchId === branchId ? cart : { ...emptyCart, branchId };
  if (cartCount(base) >= TAKEAWAY_LIMITS.maxTotalQuantity) return base;
  const current = quantityOf(base, item.id);
  if (current >= TAKEAWAY_LIMITS.maxQuantity) return base;
  if (current === 0 && base.lines.length >= TAKEAWAY_LIMITS.maxLines) return base;
  const lines =
    current === 0
      ? [...base.lines, { item, quantity: 1 }]
      : base.lines.map((line) =>
          line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
  return { ...base, lines };
}

/** One fewer; the line goes at zero. */
export function removeFromCart(cart: TakeawayCart, menuItemId: string): TakeawayCart {
  const lines = cart.lines
    .map((line) => (line.item.id === menuItemId ? { ...line, quantity: line.quantity - 1 } : line))
    .filter((line) => line.quantity > 0);
  return { ...cart, lines };
}

/** The dishes the server named as not orderable, taken out — nothing else changes. */
export function dropFromCart(cart: TakeawayCart, menuItemIds: readonly string[]): TakeawayCart {
  const gone = new Set(menuItemIds);
  return { ...cart, lines: cart.lines.filter((line) => !gone.has(line.item.id)) };
}

/**
 * A cart again from an order that did not go through — "Choose another time"
 * on a declined order: its dishes, at today's menu, for the same branch. A
 * dish no longer on the takeaway menu is left out; the pickup is chosen anew.
 */
export function cartFromOrder(
  branchId: string,
  menuItems: readonly MenuItemDetail[],
  lines: readonly { readonly menuItemId: string; readonly quantity: number }[],
): TakeawayCart {
  let cart: TakeawayCart = { ...emptyCart, branchId };
  for (const line of lines) {
    const item = menuItems.find((candidate) => candidate.id === line.menuItemId);
    if (!item) continue;
    for (let i = 0; i < line.quantity; i += 1) cart = addToCart(cart, branchId, item);
  }
  return cart;
}

export function pickupOf(pickup: CartPickup): TakeawayPickup {
  return pickup.mode === 'asap' ? { asap: true } : { at: pickup.at };
}

/** Everything that makes two sends the same order. */
export function cartFingerprint(cart: TakeawayCart): string {
  return JSON.stringify([
    cart.branchId,
    cart.lines.map((line) => [line.item.id, line.quantity]),
    pickupOf(cart.pickup),
    takeawayNote(cart.note),
  ]);
}

/**
 * The command for the cart as it stands, and the cart remembering it: the
 * last send's id when nothing has changed since, a fresh one otherwise.
 */
export function cartCommand(
  cart: TakeawayCart,
  makeId: () => string = newCommandId,
): { readonly command: PlaceTakeawayOrderCommand; readonly cart: TakeawayCart } {
  const fingerprint = cartFingerprint(cart);
  const commandId =
    cart.sent && cart.sent.fingerprint === fingerprint ? cart.sent.commandId : makeId();
  return {
    command: {
      branchId: cart.branchId ?? '',
      pickup: pickupOf(cart.pickup),
      note: takeawayNote(cart.note),
      lines: cart.lines.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity })),
      clientCommandId: commandId,
    },
    cart: { ...cart, sent: { commandId, fingerprint } },
  };
}

interface CartStore {
  readonly cart: TakeawayCart;
  readonly add: (branchId: string, item: MenuItemDetail) => void;
  readonly remove: (menuItemId: string) => void;
  readonly drop: (menuItemIds: readonly string[]) => void;
  readonly setPickup: (pickup: CartPickup) => void;
  readonly setNote: (note: string) => void;
  /** The command to send now, remembered for a retry of the same cart. */
  readonly command: () => PlaceTakeawayOrderCommand;
  /** After the server took the order: the cart is spent. */
  readonly clear: () => void;
  /** A whole cart at once — an order tried again ({@link cartFromOrder}). */
  readonly restore: (cart: TakeawayCart) => void;
}

export const useTakeawayCart = create<CartStore>((set, get) => ({
  cart: emptyCart,
  add: (branchId, item) => set(({ cart }) => ({ cart: addToCart(cart, branchId, item) })),
  remove: (menuItemId) => set(({ cart }) => ({ cart: removeFromCart(cart, menuItemId) })),
  drop: (menuItemIds) => set(({ cart }) => ({ cart: dropFromCart(cart, menuItemIds) })),
  setPickup: (pickup) => set(({ cart }) => ({ cart: { ...cart, pickup } })),
  setNote: (note) => set(({ cart }) => ({ cart: { ...cart, note } })),
  command: () => {
    const next = cartCommand(get().cart);
    set({ cart: next.cart });
    return next.command;
  },
  clear: () => set({ cart: emptyCart }),
  restore: (cart) => set({ cart }),
}));
