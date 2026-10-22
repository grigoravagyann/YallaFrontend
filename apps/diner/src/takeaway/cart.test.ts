import { TAKEAWAY_LIMITS } from '@yalla/api';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addToCart,
  cartCommand,
  cartFromOrder,
  cartCount,
  cartFor,
  cartTotal,
  dropFromCart,
  emptyCart,
  quantityOf,
  removeFromCart,
  useTakeawayCart,
} from './cart';
import { KHASHLAMA, LULA, PORK, TAN, menuItem } from './testFixtures';

/**
 * The takeaway cart: its own basket for one branch, apart from any table's
 * tray, holding only what the takeaway menu offers, and sending each order
 * under one command id however often it is retried.
 */

afterEach(() => useTakeawayCart.getState().clear());

describe('the cart', () => {
  it('adds a dish, then counts it up, and totals at the menu prices', () => {
    let cart = addToCart(emptyCart, 'b1', PORK);
    cart = addToCart(cart, 'b1', TAN);
    cart = addToCart(cart, 'b1', TAN);
    expect(cart.branchId).toBe('b1');
    expect(quantityOf(cart, 'tan')).toBe(2);
    expect(cartCount(cart)).toBe(3);
    expect(cartTotal(cart)).toBe(4500 + 1200);
  });

  it('never takes a hall-only or sold-out dish', () => {
    expect(addToCart(emptyCart, 'b1', KHASHLAMA).lines).toHaveLength(0);
    const soldOut = menuItem('x', 100, 'X', { isAvailable: false });
    expect(addToCart(emptyCart, 'b1', soldOut).lines).toHaveLength(0);
  });

  it('starts again for another branch', () => {
    const cart = addToCart(addToCart(emptyCart, 'b1', PORK), 'b2', LULA);
    expect(cart.branchId).toBe('b2');
    expect(cart.lines.map((line) => line.item.id)).toEqual(['lula']);
    expect(cartFor(cart, 'b1').lines).toHaveLength(0);
    expect(cartFor(cart, 'b2')).toBe(cart);
  });

  it('removes one at a time, the line going at zero', () => {
    let cart = addToCart(addToCart(emptyCart, 'b1', TAN), 'b1', TAN);
    cart = removeFromCart(cart, 'tan');
    expect(quantityOf(cart, 'tan')).toBe(1);
    cart = removeFromCart(cart, 'tan');
    expect(cart.lines).toHaveLength(0);
  });

  it('holds the per-dish limit the server holds', () => {
    let cart = emptyCart;
    for (let i = 0; i < TAKEAWAY_LIMITS.maxQuantity + 3; i += 1) cart = addToCart(cart, 'b1', TAN);
    expect(quantityOf(cart, 'tan')).toBe(TAKEAWAY_LIMITS.maxQuantity);
  });

  it('drops the dishes the server named, and only those', () => {
    const cart = addToCart(addToCart(emptyCart, 'b1', PORK), 'b1', LULA);
    expect(dropFromCart(cart, ['pork']).lines.map((line) => line.item.id)).toEqual(['lula']);
  });
});

describe('trying a declined order again', () => {
  it("refills the cart from its lines at today's menu, leaving out what is gone", () => {
    const cart = cartFromOrder(
      'b1',
      [PORK, TAN, KHASHLAMA],
      [
        { menuItemId: 'pork', quantity: 1 },
        { menuItemId: 'tan', quantity: 2 },
        { menuItemId: 'khashlama', quantity: 1 },
        { menuItemId: 'gone', quantity: 1 },
      ],
    );
    expect(cart.branchId).toBe('b1');
    expect(cart.lines.map((line) => [line.item.id, line.quantity])).toEqual([
      ['pork', 1],
      ['tan', 2],
    ]);
    expect(cart.pickup).toEqual({ mode: 'asap' });
  });
});

describe('sending it', () => {
  const ids = (() => {
    let n = 0;
    return () => `cmd-${(n += 1)}`;
  })();

  it('says the pickup, the trimmed note and the lines', () => {
    const cart = {
      ...addToCart(addToCart(emptyCart, 'b1', PORK), 'b1', TAN),
      pickup: { mode: 'at' as const, at: '19:30' },
      note: '  no onion  ',
    };
    const { command } = cartCommand(cart, ids);
    expect(command).toMatchObject({
      branchId: 'b1',
      pickup: { at: '19:30' },
      note: 'no onion',
      lines: [
        { menuItemId: 'pork', quantity: 1 },
        { menuItemId: 'tan', quantity: 1 },
      ],
    });
    expect(cartCommand({ ...cart, note: '   ' }, ids).command.note).toBeNull();
    expect(cartCommand({ ...cart, pickup: { mode: 'asap' } }, ids).command.pickup).toEqual({
      asap: true,
    });
  });

  it('retries the same order under the same id, and a changed one under a new id', () => {
    const cart = addToCart(emptyCart, 'b1', PORK);
    const first = cartCommand(cart, ids);
    const again = cartCommand(first.cart, ids);
    expect(again.command.clientCommandId).toBe(first.command.clientCommandId);
    const changed = cartCommand(addToCart(first.cart, 'b1', TAN), ids);
    expect(changed.command.clientCommandId).not.toBe(first.command.clientCommandId);
  });

  it('the store remembers the id between screens and forgets the cart once sent', () => {
    const store = useTakeawayCart.getState();
    store.add('b1', PORK);
    const first = useTakeawayCart.getState().command();
    expect(useTakeawayCart.getState().command().clientCommandId).toBe(first.clientCommandId);
    useTakeawayCart.getState().clear();
    expect(useTakeawayCart.getState().cart).toEqual(emptyCart);
  });
});
