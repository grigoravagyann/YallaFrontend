import type { PreOrderResult, OnMyWayResult } from '../../contracts/preOrder';
import type { RunningLateResult, AskOnMyWayResult } from '../../contracts/onMyWay';
import { type DinerMockContext, MOCK_WAITER_NAME, URL_TAG, type MockGateway } from './context';

/** Pre-orders and on-my-way, by account and by manage link, and the venue's side. */
export function preOrdersMethods(
  ctx: DinerMockContext,
): Pick<
  MockGateway,
  | 'replacePreOrder'
  | 'clearPreOrder'
  | 'confirmOnMyWay'
  | 'reportRunningLate'
  | 'reportRunningLateByLink'
  | 'askOnMyWayAsVenue'
  | 'replacePreOrderByLink'
  | 'clearPreOrderByLink'
  | 'confirmOnMyWayByLink'
  | 'setPreOrderSettingsAsVenue'
  | 'acceptsPreOrdersAsVenue'
  | 'setDishSoldOutAsVenue'
  | 'sendPreOrderAsVenue'
  | 'markPreOrderNotComingAsVenue'
> {
  const {
    answerInThread,
    bookingOwners,
    callerGuest,
    conversations,
    deletedAccounts,
    linkedBooking,
    ownBooking,
    preOrderBooking,
    preOrders,
    wait,
  } = ctx;
  return {
    // --- Pre-orders (2026-10-21) ------------------------------------------

    async replacePreOrder(command): Promise<PreOrderResult> {
      await wait();
      const url = `${URL_TAG}/api/reservations/${command.reservationId}/pre-order`;
      return preOrders.replace({
        url,
        booking: preOrderBooking(ownBooking(url, command.reservationId)),
        draft: command,
        clientCommandId: command.clientCommandId,
        actor: callerGuest(),
      });
    },

    async clearPreOrder({ reservationId, clientCommandId }): Promise<PreOrderResult> {
      await wait();
      const url = `${URL_TAG}/api/reservations/${reservationId}/pre-order/clear`;
      return preOrders.clear({
        url,
        booking: preOrderBooking(ownBooking(url, reservationId)),
        clientCommandId,
        actor: callerGuest(),
      });
    },

    async confirmOnMyWay(reservationId): Promise<OnMyWayResult> {
      await wait();
      const url = `${URL_TAG}/api/reservations/${reservationId}/on-my-way`;
      const booking = ownBooking(url, reservationId);
      const result = preOrders.confirmOnMyWay(url, preOrderBooking(booking));
      if (!result.wasReplay) answerInThread(booking, { kind: 'coming', lateMinutes: null });
      return result;
    },

    async reportRunningLate({ reservationId, minutes }): Promise<RunningLateResult> {
      await wait();
      const url = `${URL_TAG}/api/reservations/${reservationId}/running-late`;
      const booking = ownBooking(url, reservationId);
      const result = preOrders.reportRunningLate(url, preOrderBooking(booking), minutes);
      answerInThread(booking, { kind: 'late', lateMinutes: result.guestRunningLateMinutes });
      return result;
    },

    async reportRunningLateByLink({ bookingId, minutes }): Promise<RunningLateResult> {
      await wait();
      const url = `${URL_TAG}/api/public/bookings/running-late`;
      const booking = linkedBooking(url, bookingId);
      const result = preOrders.reportRunningLate(url, preOrderBooking(booking), minutes);
      answerInThread(booking, { kind: 'late', lateMinutes: result.guestRunningLateMinutes });
      return result;
    },

    askOnMyWayAsVenue(bookingId): AskOnMyWayResult {
      const url = `${URL_TAG}/api/reservations/${bookingId}/ask-on-my-way`;
      const booking = linkedBooking(url, bookingId);
      const owner = bookingOwners.get(bookingId);
      const result = preOrders.askOnMyWay(
        url,
        preOrderBooking(booking),
        owner !== undefined && !deletedAccounts.has(owner),
      );
      // The ask is a message in the booking's thread, with the asker's name.
      conversations.appendAsk({ kind: 'reservation', id: bookingId }, MOCK_WAITER_NAME);
      return result;
    },

    async replacePreOrderByLink(command): Promise<PreOrderResult> {
      await wait();
      const url = `${URL_TAG}/api/public/bookings/pre-order`;
      return preOrders.replace({
        url,
        booking: preOrderBooking(linkedBooking(url, command.bookingId)),
        draft: command,
        clientCommandId: command.clientCommandId,
        // The link's holder: whoever has it acts for the booking itself.
        actor: `link:${command.bookingId}`,
      });
    },

    async clearPreOrderByLink({ bookingId, clientCommandId }): Promise<PreOrderResult> {
      await wait();
      const url = `${URL_TAG}/api/public/bookings/pre-order/clear`;
      return preOrders.clear({
        url,
        booking: preOrderBooking(linkedBooking(url, bookingId)),
        clientCommandId,
        actor: `link:${bookingId}`,
      });
    },

    async confirmOnMyWayByLink(bookingId): Promise<OnMyWayResult> {
      await wait();
      const url = `${URL_TAG}/api/public/bookings/on-my-way`;
      const booking = linkedBooking(url, bookingId);
      const result = preOrders.confirmOnMyWay(url, preOrderBooking(booking));
      if (!result.wasReplay) answerInThread(booking, { kind: 'coming', lateMinutes: null });
      return result;
    },

    setPreOrderSettingsAsVenue(branchId, settings) {
      preOrders.setSettings(branchId, settings);
    },

    acceptsPreOrdersAsVenue(branchId) {
      return preOrders.settings(branchId).acceptsPreOrders;
    },

    setDishSoldOutAsVenue(branchId, menuItemId, soldOut) {
      preOrders.setSoldOut(branchId, menuItemId, soldOut);
    },

    sendPreOrderAsVenue(bookingId) {
      preOrders.markSent(bookingId, MOCK_WAITER_NAME);
    },

    markPreOrderNotComingAsVenue(bookingId) {
      preOrders.markNotComing(bookingId, MOCK_WAITER_NAME);
    },
  };
}
