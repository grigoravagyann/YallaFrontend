import type { DuePreOrders, PreOrderStaffCommand, DuePreOrder } from '../../contracts/preOrder';
import type { AskOnMyWayResult } from '../../contracts/onMyWay';
import { NotFoundError } from '../../errors';
import type { StaffGateway } from '../../staffGateway';
import { type StaffMockContext } from './context';

/** Pre-orders on the rail and asking a booking whether it is on its way. */
export function preOrdersMethods(
  ctx: StaffMockContext,
): Pick<
  StaffGateway,
  'listDuePreOrders' | 'sendPreOrder' | 'markPreOrderNotComing' | 'askOnMyWay'
> {
  const {
    conversations,
    dueRail,
    markNotComingNow,
    now,
    preOrderBook,
    preOrderBookingOf,
    preOrderChanged,
    requireSession,
    reservations,
    sendPreOrderNow,
    settle,
    staffName,
  } = ctx;
  return {
    // --- Tables waiting to be let in ---------------------------------------

    // --- Pre-orders on the rail (2026-10-21) --------------------------------

    async listDuePreOrders(): Promise<DuePreOrders> {
      requireSession('/api/branches/pre-orders/due');
      return settle(dueRail(now()));
    },

    async sendPreOrder(command: PreOrderStaffCommand): Promise<DuePreOrder> {
      return settle(sendPreOrderNow(command));
    },

    async markPreOrderNotComing(command: PreOrderStaffCommand): Promise<DuePreOrder> {
      return settle(markNotComingNow(command));
    },

    // --- "Ask: are you coming?" (2026-10-22) ---------------------------------

    async askOnMyWay(reservationId): Promise<AskOnMyWayResult> {
      const url = `/api/reservations/${reservationId}/ask-on-my-way`;
      requireSession(url);
      const reservation = reservations.get(reservationId);
      if (!reservation) throw new NotFoundError({ url });
      // A phone behind it stands in for a live account: the app is told.
      const notified = reservation.guestPhone.trim() !== '';
      const answer = preOrderBook.askOnMyWay(url, preOrderBookingOf(reservation), notified);
      preOrderChanged(reservation.id, now());
      // The ask is a message in the booking's thread, with the asker's name.
      conversations.appendAsk({ kind: 'reservation', id: reservation.id }, staffName);
      return settle(answer);
    },
  };
}
