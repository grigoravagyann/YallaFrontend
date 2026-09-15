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

  it('refreshes the booking, the list and its live state for a push about a booking', () => {
    const keys = queryKeysForPush({ kind: 'reservation-reminder', reservationId: 'r1' });

    expect(keys).toContainEqual(['bookings']);
    expect(keys).toContainEqual(['booking', 'r1']);
    expect(keys).toContainEqual(['reservationState', 'r1']);
    expect(keys).not.toContainEqual(['dinerOrders']);
  });

  it('always refreshes the notifications feed and its badge, even for an empty payload', () => {
    expect(queryKeysForPush(undefined)).toEqual([['notifications']]);
    expect(queryKeysForPush({ kind: '', orderId: '' })).toEqual([['notifications']]);
  });
});
