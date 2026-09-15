import type { DinerNotification } from '@yalla/api';
import { dinerResources } from '@yalla/i18n/diner';
import { describe, expect, it } from 'vitest';
import { notificationCopy, notificationRoute } from './notifications';

function row(overrides: Partial<DinerNotification> = {}): DinerNotification {
  return {
    notificationId: 'n1',
    kind: 'booking-confirmed',
    params: {},
    branchId: 'b1',
    branchName: 'Lumen Coffee · Cascade',
    reservationId: 'r1',
    tabId: null,
    orderId: null,
    createdAtUtc: '2026-09-14T10:00:00Z',
    read: false,
    ...overrides,
  };
}

function lookup(bundle: unknown, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle);
}

describe('notificationCopy', () => {
  it('names the place from the row, and falls back to the params', () => {
    expect(notificationCopy(row()).params.place).toBe('Lumen Coffee · Cascade');
    expect(
      notificationCopy(row({ branchName: null, params: { venueName: 'Dolmama' } })).params.place,
    ).toBe('Dolmama');
  });

  it('gives a kind this build does not know the generic copy, rather than dropping it', () => {
    expect(notificationCopy(row({ kind: 'table-ready-soon' })).titleKey).toBe(
      'notifications.kind.unknown.title',
    );
  });

  it.each([
    'booking-reminder',
    'booking-confirmed',
    'booking-declined',
    'booking-cancelled-by-venue',
    'order-ready',
    'review-hidden',
    'a-kind-from-a-newer-server',
  ])('has a title and a body in every language for %s', (kind) => {
    const copy = notificationCopy(row({ kind }));
    for (const bundle of [
      dinerResources.en.diner,
      dinerResources.hy.diner,
      dinerResources.ru.diner,
    ]) {
      expect(typeof lookup(bundle, copy.titleKey)).toBe('string');
      expect(typeof lookup(bundle, copy.bodyKey)).toBe('string');
    }
  });
});

describe('notificationRoute', () => {
  it('opens the booking a booking row is about, or its place without one', () => {
    expect(notificationRoute(row())).toEqual({
      pathname: '/booking/[bookingId]',
      params: { bookingId: 'r1' },
    });
    expect(notificationRoute(row({ reservationId: null }))).toEqual({
      pathname: '/place/[placeId]',
      params: { placeId: 'b1' },
    });
  });

  it('opens the order, then the tab, for a ready order', () => {
    expect(notificationRoute(row({ kind: 'order-ready', orderId: 'o1', tabId: 't1' }))).toEqual({
      pathname: '/order/[orderId]',
      params: { orderId: 'o1' },
    });
    expect(notificationRoute(row({ kind: 'order-ready', orderId: null, tabId: 't1' }))).toEqual({
      pathname: '/tab/[tabId]',
      params: { tabId: 't1' },
    });
  });

  it('opens the place for a hidden review, and nothing when a row names nothing', () => {
    expect(notificationRoute(row({ kind: 'review-hidden', reservationId: null }))?.pathname).toBe(
      '/place/[placeId]',
    );
    expect(
      notificationRoute(row({ kind: 'review-hidden', reservationId: null, branchId: null })),
    ).toBeNull();
  });
});
