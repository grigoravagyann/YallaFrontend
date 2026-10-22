import { describe, expect, it, vi } from 'vitest';
import { invalidateForPush, queryKeysForPush } from './invalidation';

/**
 * The push-received listener's half: whatever a push is about is read again at
 * once, so the banner and the screen under it agree.
 */
describe('invalidateForPush', () => {
  it("refreshes the diner's orders when an order is ready", () => {
    const queryClient = { invalidateQueries: vi.fn(() => Promise.resolve()) };

    invalidateForPush(queryClient, { kind: 'order-ready', orderId: 'o1', tabId: 't1' });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['dinerOrders'] });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['notifications'] });
  });

  it('refreshes the orders for any push about a tab or an order', () => {
    expect(queryKeysForPush({ kind: 'participant-approved', tabId: 't1' })).toContainEqual([
      'dinerOrders',
    ]);
    expect(queryKeysForPush({ kind: 'something-new', orderId: 'o1' })).toContainEqual([
      'dinerOrders',
    ]);
  });

  it('reads the tab a push is about again, so the host finds the joiner already there', () => {
    // `['dinerTab', id]` is `orderKeys.dinerTab(id)`: the tab read that carries
    // the roster the join banner is drawn from.
    expect(queryKeysForPush({ kind: 'tabJoinRequested', tabId: 't1' })).toContainEqual([
      'dinerTab',
      't1',
    ]);
    expect(queryKeysForPush({ kind: 'order-ready', tabId: 't1' })).toContainEqual([
      'dinerTab',
      't1',
    ]);
    expect(queryKeysForPush({ kind: 'something-new', orderId: 'o1' })).not.toContainEqual(
      expect.arrayContaining(['dinerTab']),
    );
  });

  it('refreshes the booking, the list and its live state for a push about a booking', () => {
    const keys = queryKeysForPush({ kind: 'reservation-reminder', reservationId: 'r1' });

    expect(keys).toContainEqual(['bookings']);
    expect(keys).toContainEqual(['booking', 'r1']);
    expect(keys).toContainEqual(['reservationState', 'r1']);
    expect(keys).not.toContainEqual(['dinerOrders']);
  });

  it('refreshes the booking a short-notice request ran out on, so it says why at once', () => {
    const keys = queryKeysForPush({
      kind: 'reservation-decided',
      reservationId: 'r1',
      approved: 'false',
      expired: 'true',
    });
    expect(keys).toContainEqual(['booking', 'r1']);
    expect(keys).toContainEqual(['bookings']);
    expect(keys).toContainEqual(['notifications']);
  });

  it('reads a booking again whose change was declined: it is confirmed at its old slot now', () => {
    const keys = queryKeysForPush({
      kind: 'reservation-decided',
      reservationId: 'r1',
      approved: 'false',
      expired: 'false',
      wasChange: 'true',
      originalKept: 'true',
    });
    expect(keys).toContainEqual(['booking', 'r1']);
    expect(keys).toContainEqual(['reservationState', 'r1']);
    expect(keys).toContainEqual(['bookings']);
  });

  it('always refreshes the notifications feed and its badge, even for an empty payload', () => {
    expect(queryKeysForPush(undefined)).toEqual([['notifications']]);
    expect(queryKeysForPush({ kind: '', orderId: '' })).toEqual([['notifications']]);
  });
});

describe('invalidateForPush, the pause on booking', () => {
  it('reads the bookings list again for the pause and its end, which name no booking', () => {
    for (const kind of ['bookings-blocked-no-shows', 'bookings-unblocked']) {
      expect(queryKeysForPush({ kind, blockedUntilUtc: '2026-10-27T09:30:00Z' })).toContainEqual([
        'bookings',
      ]);
    }
  });
});

describe('invalidateForPush, a takeaway order (2026-10-22)', () => {
  it('reads the order and the Orders tab again', () => {
    const keys = queryKeysForPush({ kind: 'takeaway-ready', orderId: 'tw-1' });
    expect(keys).toContainEqual(['takeaway', 'order', 'tw-1']);
    expect(keys).toContainEqual(['dinerOrders']);
  });

  it('leaves the takeaway reads alone for any other order push', () => {
    expect(queryKeysForPush({ kind: 'order-ready', orderId: 'o1' })).not.toContainEqual([
      'takeaway',
      'order',
      'o1',
    ]);
  });
});
