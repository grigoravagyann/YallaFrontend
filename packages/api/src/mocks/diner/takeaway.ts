import type { DinerOrder } from '../../contracts/places';
import {
  isTakeawayActive,
  type TakeawayAvailability,
  type TakeawayOrder,
} from '../../contracts/takeaway';
import { NotFoundError } from '../../errors';
import { type DinerMockContext, MOCK_WAITER_NAME, URL_TAG, type MockGateway } from './context';

/** Takeaway: the diner's orders, availability, placing and cancelling, and the venue's side for tests and the demo. */
export function takeawayMethods(
  ctx: DinerMockContext,
): Pick<
  MockGateway,
  | 'listDinerOrders'
  | 'getDinerOrder'
  | 'getTakeawayAvailability'
  | 'placeTakeawayOrder'
  | 'getTakeawayOrder'
  | 'cancelTakeawayOrder'
  | 'setTakeawaySettingsAsVenue'
  | 'setDishForTakeawayAsVenue'
  | 'acceptTakeawayAsVenue'
  | 'declineTakeawayAsVenue'
  | 'markTakeawayReadyAsVenue'
  | 'collectTakeawayAsVenue'
  | 'markTakeawayNoShowAsVenue'
> {
  const {
    accounts,
    findBranch,
    markTakeawayNoShow,
    me,
    messagesOf,
    now,
    refuseWhileBlocked,
    requireVerifiedPhone,
    takeaway,
    wait,
  } = ctx;
  return {
    async listDinerOrders(segment): Promise<readonly DinerOrder[]> {
      await wait();
      // The mock keeps no dine-in order history (the app's Orders tab runs on
      // its own mock repository for those); the takeaway orders this diner
      // placed are real here (2026-10-22), the ones still moving first.
      const orders = takeaway
        .dinerOrders(me())
        .map((order) => ({ ...order, ...messagesOf({ kind: 'takeaway', id: order.orderId }) }));
      if (!segment) return orders;
      return orders.filter(
        (order) =>
          (order.takeaway ? isTakeawayActive(order.takeaway.status) : false) ===
          (segment === 'active'),
      );
    },

    async getDinerOrder(orderId): Promise<DinerOrder | null> {
      await wait();
      const order = takeaway.dinerOrders(me()).find((entry) => entry.orderId === orderId);
      return order ? { ...order, ...messagesOf({ kind: 'takeaway', id: order.orderId }) } : null;
    },

    // --- Takeaway (2026-10-22) --------------------------------------------------

    async getTakeawayAvailability(branchId): Promise<TakeawayAvailability> {
      await wait();
      me();
      if (!findBranch(branchId)) {
        throw new NotFoundError({ url: `${URL_TAG}/api/diner/branches/${branchId}/takeaway` });
      }
      return takeaway.availability(branchId);
    },

    async placeTakeawayOrder(command): Promise<TakeawayOrder> {
      await wait();
      const url = `${URL_TAG}/api/diner/takeaway-orders`;
      const accountId = me();
      // A proved phone, as for booking: the venue may call the number.
      requireVerifiedPhone(url);
      // Blocked for no-shows: no takeaway either - the booking's own 403.
      refuseWhileBlocked(url);
      if (!findBranch(command.branchId)) throw new NotFoundError({ url });
      const profile = accounts.profile(accountId);
      return takeaway.place({
        url,
        command,
        actor: accountId,
        guestName: profile?.displayName ?? profile?.username ?? 'Guest',
        guestPhone: profile?.phoneE164 ?? '',
      });
    },

    async getTakeawayOrder(orderId): Promise<TakeawayOrder | null> {
      await wait();
      return takeaway.guestOrder(orderId, me());
    },

    async cancelTakeawayOrder(orderId): Promise<TakeawayOrder> {
      await wait();
      const url = `${URL_TAG}/api/diner/takeaway-orders/${orderId}/cancel`;
      return takeaway.cancel(url, orderId, me());
    },

    setTakeawaySettingsAsVenue(branchId, settings) {
      takeaway.setSettings(
        `${URL_TAG}/api/branches/${branchId}/takeaway-settings`,
        branchId,
        settings,
      );
    },

    setDishForTakeawayAsVenue(branchId, menuItemId, available) {
      takeaway.setAvailableForTakeaway(branchId, menuItemId, available);
    },

    acceptTakeawayAsVenue(orderId, readyAtUtc) {
      const record = takeaway.record(orderId);
      if (!record) return;
      takeaway.accept(
        `${URL_TAG}/api/takeaway-orders/${orderId}/accept`,
        orderId,
        readyAtUtc ??
          new Date(Math.max(Date.parse(record.requestedPickupUtc), now().getTime())).toISOString(),
        MOCK_WAITER_NAME,
      );
    },

    declineTakeawayAsVenue(orderId, reason) {
      takeaway.decline(`${URL_TAG}/api/takeaway-orders/${orderId}/decline`, orderId, reason);
    },

    markTakeawayReadyAsVenue(orderId) {
      takeaway.ready(`${URL_TAG}/api/takeaway-orders/${orderId}/ready`, orderId);
    },

    collectTakeawayAsVenue(orderId, method) {
      takeaway.collect(`${URL_TAG}/api/takeaway-orders/${orderId}/collect`, orderId, method);
    },

    markTakeawayNoShowAsVenue(orderId) {
      markTakeawayNoShow(orderId);
    },
  };
}
