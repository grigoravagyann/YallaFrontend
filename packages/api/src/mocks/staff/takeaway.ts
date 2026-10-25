import type {
  BranchTakeawayOrders,
  AcceptTakeawayOrderCommand,
  StaffTakeawayOrder,
  DeclineTakeawayOrderCommand,
  CollectTakeawayOrderCommand,
} from '../../contracts/takeaway';
import type { StaffGateway } from '../../staffGateway';
import { type StaffMockContext } from './context';

/** Takeaway at the counter. */
export function takeawayMethods(
  ctx: StaffMockContext,
): Pick<
  StaffGateway,
  | 'listTakeawayOrders'
  | 'acceptTakeawayOrder'
  | 'declineTakeawayOrder'
  | 'markTakeawayOrderReady'
  | 'collectTakeawayOrder'
  | 'markTakeawayOrderNoShow'
> {
  const { FLOOR_BRANCH, requireSession, settle, staffName, takeawayBook } = ctx;
  return {
    // --- Takeaway at the counter (2026-10-22) --------------------------------

    async listTakeawayOrders(): Promise<BranchTakeawayOrders> {
      requireSession('/api/branches/takeaway-orders');
      return settle(takeawayBook.branchOrders(FLOOR_BRANCH));
    },

    async acceptTakeawayOrder({
      orderId,
      readyAtUtc,
    }: AcceptTakeawayOrderCommand): Promise<StaffTakeawayOrder> {
      const url = `/api/takeaway-orders/${orderId}/accept`;
      requireSession(url);
      return settle(takeawayBook.accept(url, orderId, readyAtUtc, staffName));
    },

    async declineTakeawayOrder({
      orderId,
      reason,
    }: DeclineTakeawayOrderCommand): Promise<StaffTakeawayOrder> {
      const url = `/api/takeaway-orders/${orderId}/decline`;
      requireSession(url);
      return settle(takeawayBook.decline(url, orderId, reason));
    },

    async markTakeawayOrderReady(orderId): Promise<StaffTakeawayOrder> {
      const url = `/api/takeaway-orders/${orderId}/ready`;
      requireSession(url);
      return settle(takeawayBook.ready(url, orderId));
    },

    async collectTakeawayOrder({
      orderId,
      method,
    }: CollectTakeawayOrderCommand): Promise<StaffTakeawayOrder> {
      const url = `/api/takeaway-orders/${orderId}/collect`;
      requireSession(url);
      return settle(takeawayBook.collect(url, orderId, method));
    },

    async markTakeawayOrderNoShow(orderId): Promise<StaffTakeawayOrder> {
      const url = `/api/takeaway-orders/${orderId}/no-show`;
      requireSession(url);
      return settle(takeawayBook.noShow(url, orderId));
    },
  };
}
