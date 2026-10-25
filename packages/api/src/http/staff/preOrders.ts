import type { DuePreOrder, DuePreOrders } from '../../contracts/preOrder';
import type { AskOnMyWayResult } from '../../contracts/onMyWay';
import {
  askOnMyWayResultFromWire,
  duePreOrderFromWire,
  duePreOrdersFromWire,
  rethrowPreOrderRefusal,
  type WireAskOnMyWayResult,
  type WireDuePreOrder,
  type WireDuePreOrders,
} from '../preOrderMapping';
import type { StaffGateway } from '../../staffGateway';
import type { StaffHttpContext } from './context';

export function preOrdersMethods(
  ctx: StaffHttpContext,
): Pick<
  StaffGateway,
  'listDuePreOrders' | 'sendPreOrder' | 'markPreOrderNotComing' | 'askOnMyWay'
> {
  const { client } = ctx;
  return {
    // --- Pre-orders on the rail (2026-10-21) --------------------------------

    async listDuePreOrders(branchId): Promise<DuePreOrders> {
      // Soonest first, then by table, as the server orders it; kept as sent.
      const { data } = await client.get<WireDuePreOrders>(
        `/api/branches/${branchId}/pre-orders/due`,
      );
      return duePreOrdersFromWire(data ?? {});
    },

    async sendPreOrder({ reservationId, clientCommandId }): Promise<DuePreOrder> {
      try {
        const { data } = await client.post<WireDuePreOrder>(
          `/api/reservations/${reservationId}/pre-order/send`,
          { clientCommandId },
        );
        return duePreOrderFromWire(data);
      } catch (error) {
        rethrowPreOrderRefusal(error);
      }
    },

    async markPreOrderNotComing({ reservationId, clientCommandId }): Promise<DuePreOrder> {
      try {
        const { data } = await client.post<WireDuePreOrder>(
          `/api/reservations/${reservationId}/pre-order/not-coming`,
          { clientCommandId },
        );
        return duePreOrderFromWire(data);
      } catch (error) {
        rethrowPreOrderRefusal(error);
      }
    },

    // --- "Ask: are you coming?" (2026-10-22) ---------------------------------

    async askOnMyWay(reservationId): Promise<AskOnMyWayResult> {
      try {
        // No body. Each refusal is its own 409, read by `preOrderMapping.ts`.
        const { data } = await client.post<WireAskOnMyWayResult>(
          `/api/reservations/${reservationId}/ask-on-my-way`,
        );
        return askOnMyWayResultFromWire(data);
      } catch (error) {
        rethrowPreOrderRefusal(error);
      }
    },
  };
}
