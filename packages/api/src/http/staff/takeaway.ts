import {
  takeawayNote,
  type BranchTakeawayOrders,
  type StaffTakeawayOrder,
} from '../../contracts/takeaway';
import {
  branchTakeawayOrdersFromWire,
  rethrowTakeawayRefusal,
  staffTakeawayOrderFromWire,
  takeawayPaymentMethodCode,
  type WireBranchTakeawayOrders,
  type WireStaffTakeawayOrder,
} from '../takeawayMapping';
import type { StaffGateway } from '../../staffGateway';
import type { StaffHttpContext } from './context';

export function takeawayMethods(
  ctx: StaffHttpContext,
): Pick<
  StaffGateway,
  | 'listTakeawayOrders'
  | 'acceptTakeawayOrder'
  | 'declineTakeawayOrder'
  | 'markTakeawayOrderReady'
  | 'collectTakeawayOrder'
  | 'markTakeawayOrderNoShow'
> {
  const { client } = ctx;
  return {
    // --- Takeaway at the counter (2026-10-22) --------------------------------
    //
    // Online only, like the rail's actions. A move already made answers 200
    // `wasReplay` (two tablets, one answer); a move the order is not in the
    // state for is `takeaway-status-conflict`, read by `takeawayMapping.ts`.

    async listTakeawayOrders(branchId): Promise<BranchTakeawayOrders> {
      const { data } = await client.get<WireBranchTakeawayOrders>(
        `/api/branches/${branchId}/takeaway-orders`,
      );
      return branchTakeawayOrdersFromWire(data ?? {});
    },

    async acceptTakeawayOrder({ orderId, readyAtUtc }): Promise<StaffTakeawayOrder> {
      try {
        const { data } = await client.post<WireStaffTakeawayOrder>(
          `/api/takeaway-orders/${orderId}/accept`,
          { readyAt: readyAtUtc },
        );
        return staffTakeawayOrderFromWire(data);
      } catch (error) {
        rethrowTakeawayRefusal(error);
      }
    },

    async declineTakeawayOrder({ orderId, reason }): Promise<StaffTakeawayOrder> {
      try {
        const { data } = await client.post<WireStaffTakeawayOrder>(
          `/api/takeaway-orders/${orderId}/decline`,
          { reason: takeawayNote(reason) },
        );
        return staffTakeawayOrderFromWire(data);
      } catch (error) {
        rethrowTakeawayRefusal(error);
      }
    },

    async markTakeawayOrderReady(orderId): Promise<StaffTakeawayOrder> {
      try {
        const { data } = await client.post<WireStaffTakeawayOrder>(
          `/api/takeaway-orders/${orderId}/ready`,
        );
        return staffTakeawayOrderFromWire(data);
      } catch (error) {
        rethrowTakeawayRefusal(error);
      }
    },

    async collectTakeawayOrder({ orderId, method }): Promise<StaffTakeawayOrder> {
      try {
        const { data } = await client.post<WireStaffTakeawayOrder>(
          `/api/takeaway-orders/${orderId}/collect`,
          { method: takeawayPaymentMethodCode(method) },
        );
        return staffTakeawayOrderFromWire(data);
      } catch (error) {
        rethrowTakeawayRefusal(error);
      }
    },

    async markTakeawayOrderNoShow(orderId): Promise<StaffTakeawayOrder> {
      try {
        const { data } = await client.post<WireStaffTakeawayOrder>(
          `/api/takeaway-orders/${orderId}/no-show`,
        );
        return staffTakeawayOrderFromWire(data);
      } catch (error) {
        rethrowTakeawayRefusal(error);
      }
    },
  };
}
