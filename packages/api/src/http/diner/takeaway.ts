import type { TakeawayAvailability, TakeawayOrder } from '../../contracts/takeaway';
import {
  placeTakeawayOrderBody,
  rethrowTakeawayRefusal,
  takeawayAvailabilityFromWire,
  takeawayOrderFromWire,
  type WireTakeawayAvailability,
  type WireTakeawayOrder,
} from '../takeawayMapping';
import { NotFoundError } from '../../errors';
import type { YallaGateway } from '../../gateway';
import type { DinerOrder } from '../../contracts/places';
import { dinerOrderFromWire, type WireDinerOrder } from '../placesMapping';
import type { DinerHttpContext } from './context';

export function takeawayMethods(
  ctx: DinerHttpContext,
): Pick<
  YallaGateway,
  | 'listDinerOrders'
  | 'getDinerOrder'
  | 'getTakeawayAvailability'
  | 'placeTakeawayOrder'
  | 'getTakeawayOrder'
  | 'cancelTakeawayOrder'
> {
  const { client } = ctx;
  return {
    // --- The diner's orders -----------------------------------------------------

    async listDinerOrders(segment): Promise<readonly DinerOrder[]> {
      const { data } = await client.get<WireDinerOrder[]>('/api/diner/orders', {
        ...(segment ? { query: { status: segment } } : {}),
      });
      return (data ?? []).map((wire) => dinerOrderFromWire(wire, client.baseUrl));
    },

    async getDinerOrder(orderId): Promise<DinerOrder | null> {
      try {
        const { data } = await client.get<WireDinerOrder>(
          `/api/diner/orders/${encodeURIComponent(orderId)}`,
        );
        return dinerOrderFromWire(data, client.baseUrl);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    // --- Takeaway (2026-10-22) --------------------------------------------------
    //
    // The diner's own orders only; somebody else's answers 404, as for an id
    // that is no order. Every refusal is read by `takeawayMapping.ts`.

    async getTakeawayAvailability(branchId): Promise<TakeawayAvailability> {
      const { data } = await client.get<WireTakeawayAvailability>(
        `/api/diner/branches/${encodeURIComponent(branchId)}/takeaway`,
      );
      return takeawayAvailabilityFromWire(data);
    },

    async placeTakeawayOrder(command): Promise<TakeawayOrder> {
      try {
        const { data } = await client.post<WireTakeawayOrder>(
          '/api/diner/takeaway-orders',
          placeTakeawayOrderBody(command),
        );
        return takeawayOrderFromWire(data);
      } catch (error) {
        rethrowTakeawayRefusal(error);
      }
    },

    async getTakeawayOrder(orderId): Promise<TakeawayOrder | null> {
      try {
        const { data } = await client.get<WireTakeawayOrder>(
          `/api/diner/takeaway-orders/${encodeURIComponent(orderId)}`,
        );
        return takeawayOrderFromWire(data);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async cancelTakeawayOrder(orderId): Promise<TakeawayOrder> {
      try {
        // No body: only while sent; after that it is a phone call.
        const { data } = await client.post<WireTakeawayOrder>(
          `/api/diner/takeaway-orders/${encodeURIComponent(orderId)}/cancel`,
        );
        return takeawayOrderFromWire(data);
      } catch (error) {
        rethrowTakeawayRefusal(error);
      }
    },
  };
}
