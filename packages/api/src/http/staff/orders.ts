import {
  OrderGuestUnavailableError,
  OrderNotVoidableError,
  type OrderGuestState,
} from '../../contracts/errors';
import type { Menu } from '../../contracts/menu';
import type {
  OrderQueueEntry,
  PlaceOrderCommand,
  PlaceOrderLine,
  PlaceOrderResult,
  SetOrderStatusCommand,
} from '../../contracts/ordering';
import { ApiError, NotFoundError } from '../../errors';
import type { components } from '../../generated/schema';
import type { StaffGateway } from '../../staffGateway';
import { menuFrom, orderQueueEntry, orderStatusCode, placeOrderResult } from '../staffMapping';
import { ProblemCodes } from '../../generated/problemCodes';
import { type StaffHttpContext, rethrow } from './context';

type Schemas = components['schemas'];
type KitchenOrder = Schemas['Yalla.Application.Ordering.KitchenOrderView'];

/** `ParticipantStatus` on a guest refusal: 1 pending approval, 3 removed. */
const GUEST_STATE: Readonly<Record<number, OrderGuestState>> = { 1: 'pending', 3: 'removed' };

/**
 * A staff order refused because of a guest it named, or null. Only a refusal
 * that carries `context.participantId` is about a guest: the same 404 and 409
 * without it are a dish or the tab, and must not be blamed on anybody.
 */
function guestRefusal(error: unknown): OrderGuestUnavailableError | null {
  if (!(error instanceof ApiError) || !error.problem) return null;
  const context = error.problem.context ?? {};
  const participantId = context['participantId'];
  if (typeof participantId !== 'string' || participantId === '') return null;
  const field = typeof context['field'] === 'string' ? context['field'] : null;
  if (error.status === 404 && error.code === ProblemCodes.NotFound) {
    return new OrderGuestUnavailableError({
      url: error.url,
      status: 404,
      participantId,
      guestState: 'notOnTab',
      field,
      requestId: error.requestId,
    });
  }
  if (error.status === 409 && error.code === ProblemCodes.ConflictingState) {
    return new OrderGuestUnavailableError({
      url: error.url,
      status: 409,
      participantId,
      guestState: GUEST_STATE[Number(context['participantStatus'])] ?? null,
      field,
      requestId: error.requestId,
    });
  }
  return null;
}

/**
 * The idempotency key of one group of a legacy order: the caller's id with its
 * last four hex digits replaced by the group's index, as the build that queued
 * it sent it.
 */
function derivedCommandId(base: string, index: number): string {
  return `${base.slice(0, -4)}${index.toString(16).padStart(4, '0')}`;
}

/**
 * The idempotency key an order goes with: the key the per-guest split gave its
 * first group, so a draft that build sent as a single group and this one
 * retries lands on the order already placed.
 */
function orderCommandId(base: string): string {
  return derivedCommandId(base, 0);
}

export function ordersMethods(
  ctx: StaffHttpContext,
): Pick<
  StaffGateway,
  'getMenu' | 'placeOrder' | 'listOrderQueue' | 'listOrdersByStatus' | 'setOrderStatus'
> {
  const { client, branchOrders } = ctx;
  /**
   * A command queued by a build from before per-line guests: one order per
   * guest, each under the id it was first sent with. Replayed exactly as that
   * build sent it, so the server matches every group it already has and places
   * the ones it does not. Sent in a single order instead, the replay of the
   * first group would answer for all of it and the rest would never reach the
   * kitchen.
   */
  async function placeLegacyOrder(command: PlaceOrderCommand): Promise<PlaceOrderResult> {
    const groups = new Map<string, PlaceOrderLine[]>();
    for (const line of command.lines) {
      const key = line.participantId ?? '';
      groups.set(key, [...(groups.get(key) ?? []), line]);
    }
    let last: PlaceOrderResult | null = null;
    for (const [index, [key, lines]] of [...groups.entries()].entries()) {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Ordering.OrderView']>(
          `/api/tabs/${command.tabId}/staff-orders`,
          {
            clientCommandId: derivedCommandId(command.clientCommandId, index),
            items: lines.map((line) => ({
              menuItemId: line.menuItemId,
              quantity: line.quantity,
              isShared: line.isShared,
              ...(line.note ? { note: line.note } : {}),
            })),
            ...(key ? { onBehalfOfParticipantId: key } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.PlaceOrderRequest'],
        );
        last = placeOrderResult(data);
      } catch (error) {
        rethrow(error);
      }
    }
    return last!;
  }

  return {
    // --- Ordering -----------------------------------------------------------

    async getMenu(branchId): Promise<Menu | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Menus.BranchMenuView']>(
          `/api/branches/${branchId}/menu`,
        );
        return menuFrom(data, new Date().toISOString(), client.baseUrl);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async placeOrder(command: PlaceOrderCommand): Promise<PlaceOrderResult> {
      if (command.lines.length === 0) throw new Error('placeOrder was called with no lines.');
      if (command.shape !== 2) return placeLegacyOrder(command);

      // One send, one order, one kitchen ticket: each line names its own guest.
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Ordering.OrderView']>(
          `/api/tabs/${command.tabId}/staff-orders`,
          {
            clientCommandId: orderCommandId(command.clientCommandId),
            items: command.lines.map((line) => ({
              menuItemId: line.menuItemId,
              quantity: line.quantity,
              isShared: line.isShared,
              // A shared line is the table's and names nobody: the server refuses
              // both together, so the draft can never send them both.
              ...(!line.isShared && line.participantId
                ? { participantId: line.participantId }
                : {}),
              ...(line.note ? { note: line.note } : {}),
            })),
          } satisfies Schemas['Yalla.Api.Endpoints.PlaceOrderRequest'],
        );
        return placeOrderResult(data);
      } catch (error) {
        // Only a refusal naming the guest is about the guest (FT3 wire, S7).
        const guest = guestRefusal(error);
        if (guest) throw guest;
        return rethrow(error);
      }
    },

    async listOrderQueue(branchId): Promise<readonly OrderQueueEntry[]> {
      return (await branchOrders(branchId)).map(orderQueueEntry);
    },

    async listOrdersByStatus({ branchId, status }): Promise<readonly OrderQueueEntry[]> {
      return (await branchOrders(branchId, status)).map(orderQueueEntry);
    },

    async setOrderStatus(command: SetOrderStatusCommand): Promise<OrderQueueEntry> {
      try {
        const { data } = await client.post<KitchenOrder>(`/api/orders/${command.orderId}/status`, {
          status: orderStatusCode(command.status),
        } satisfies Schemas['Yalla.Api.Endpoints.MoveOrderStatusRequest']);
        return orderQueueEntry(data);
      } catch (error) {
        // An order the rail no longer lets go — voided already, or gone on to
        // ready or served — is a 409 `conflicting-state` about the order, not
        // a table race, so a void names it.
        if (
          command.status === 'voided' &&
          error instanceof ApiError &&
          error.code === ProblemCodes.ConflictingState
        ) {
          throw new OrderNotVoidableError({
            url: error.url,
            orderId: command.orderId,
            requestId: error.requestId,
          });
        }
        // Voiding a whole order voids its lines (2026-10-25), so a tab paid
        // against refuses it as it refuses one line: `line-already-paid`, a
        // 409 that is not a race. Anything else is as it was.
        return rethrow(error);
      }
    },
  };
}
