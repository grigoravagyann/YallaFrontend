import { describe, expect, it } from 'vitest';
import { createMockOrders } from './mockOrders';
import {
  canCancelOrder,
  canTrackOrder,
  isActiveOrder,
  orderItemsTotal,
  orderStatusKey,
  orderStatusTone,
  splitOrders,
  type Order,
} from './model';

const NOW = new Date('2026-09-13T10:00:00Z');

function order(
  id: string,
  status: Order['status'],
  placedAt: string,
  kind: Order['kind'] = 'dineIn',
): Order {
  return {
    id,
    placeId: 'b-x',
    placeName: 'X',
    placePhoto: 'https://images.unsplash.com/x',
    kind,
    status,
    placedAt,
    items: [],
    totalDram: 0,
    timeline: [{ status, at: placedAt }],
  };
}

describe('splitOrders', () => {
  it('puts the moving orders first and the finished ones in history, newest first', () => {
    const orders = [
      order('old-done', 'completed', '2026-09-10T12:00:00Z'),
      order('ready', 'ready', '2026-09-13T08:00:00Z'),
      order('cancelled', 'cancelled', '2026-09-12T12:00:00Z'),
      order('confirmed', 'confirmed', '2026-09-13T09:45:00Z'),
      order('preparing', 'preparing', '2026-09-13T09:00:00Z'),
    ];
    const { active, history } = splitOrders(orders, NOW);
    expect(active.map((o) => o.id)).toEqual(['confirmed', 'preparing', 'ready']);
    expect(history.map((o) => o.id)).toEqual(['cancelled', 'old-done']);
  });

  it('drops a stale "active" order into history after a day', () => {
    const stale = order('stale', 'ready', '2026-09-11T08:00:00Z');
    expect(isActiveOrder(stale, NOW)).toBe(false);
    expect(splitOrders([stale], NOW).history).toHaveLength(1);
  });

  it('does not mutate its input', () => {
    const orders = [
      order('b', 'confirmed', '2026-09-13T09:00:00Z'),
      order('a', 'confirmed', '2026-09-13T09:30:00Z'),
    ];
    splitOrders(orders, NOW);
    expect(orders.map((o) => o.id)).toEqual(['b', 'a']);
  });

  it('splits the mock into three and three', () => {
    const { active, history } = splitOrders(createMockOrders(NOW), NOW);
    expect(active.map((o) => o.status)).toEqual(['confirmed', 'preparing', 'ready']);
    expect(history.map((o) => o.status)).toEqual(['completed', 'cancelled', 'completed']);
  });
});

describe('status helpers', () => {
  it('maps each status to a tone the theme knows', () => {
    expect(orderStatusTone('confirmed')).toBe('success');
    expect(orderStatusTone('ready')).toBe('success');
    expect(orderStatusTone('preparing')).toBe('warning');
    expect(orderStatusTone('inProgress')).toBe('info');
    expect(orderStatusTone('completed')).toBe('neutral');
    expect(orderStatusTone('cancelled')).toBe('error');
  });

  it('names the i18n key', () => {
    expect(orderStatusKey('inProgress')).toBe('orders.status.inProgress');
  });

  it('allows cancelling only before the kitchen starts', () => {
    expect(canCancelOrder(order('a', 'confirmed', '2026-09-13T09:00:00Z'))).toBe(true);
    expect(canCancelOrder(order('a', 'preparing', '2026-09-13T09:00:00Z'))).toBe(false);
  });

  it('tracks a takeaway on its way, never a table order', () => {
    expect(canTrackOrder(order('a', 'preparing', '2026-09-13T09:00:00Z', 'takeaway'))).toBe(true);
    expect(canTrackOrder(order('a', 'ready', '2026-09-13T09:00:00Z', 'takeaway'))).toBe(false);
    expect(canTrackOrder(order('a', 'preparing', '2026-09-13T09:00:00Z', 'dineIn'))).toBe(false);
  });

  it('totals the lines in whole dram', () => {
    expect(
      orderItemsTotal([
        { id: '1', name: 'a', quantity: 2, unitPriceDram: 1300 },
        { id: '2', name: 'b', quantity: 1, unitPriceDram: 900 },
      ]),
    ).toBe(3500);
    for (const mock of createMockOrders(NOW)) {
      expect(mock.totalDram).toBe(orderItemsTotal(mock.items));
      expect(Number.isInteger(mock.totalDram)).toBe(true);
      expect(mock.timeline.at(-1)?.status).toBe(mock.status);
    }
  });
});
