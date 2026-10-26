import type { ApiClient } from '../../client';
import {
  LineAlreadyPaidError,
  MenuItemUnavailableError,
  PaymentExceedsRemainingError,
  type TabNotAcceptingStatus,
  TabNotAcceptingOrdersError,
  TableNotSeatedError,
} from '../../contracts/errors';
import type { OrderStatus } from '../../contracts/ordering';
import { ApiError } from '../../errors';
import type { components } from '../../generated/schema';
import { orderStatusCode } from '../staffMapping';
import { ProblemCodes } from '../../generated/problemCodes';

type Schemas = components['schemas'];
type KitchenOrder = Schemas['Yalla.Application.Ordering.KitchenOrderView'];

/** `TabStatus` on a `tab-not-accepting-orders` refusal. */
const TAB_NOT_ACCEPTING: Readonly<Record<number, TabNotAcceptingStatus>> = {
  2: 'closing',
  3: 'closed',
  4: 'abandoned',
};

/**
 * The problem documents this screen has to act on, as typed errors.
 *
 * Only the four it branches on. Everything else keeps the client's generic
 * mapping, because a screen that switches on a code it does not handle
 * specially is a screen with a dead branch in it.
 */
export function rethrow(error: unknown): never {
  if (!(error instanceof ApiError) || !error.problem) throw error;
  const context = error.problem.context ?? {};

  switch (error.problem.code) {
    case ProblemCodes.PaymentExceedsRemaining:
      throw new PaymentExceedsRemainingError({
        url: error.url,
        tabId: String(context['tabId'] ?? ''),
        remainingDram: Number(context['remainingAmd'] ?? 0),
        requestedDram: Number(context['requestedAmd'] ?? 0),
        requestId: error.requestId,
      });
    case ProblemCodes.MenuItemUnavailable:
      throw new MenuItemUnavailableError({
        url: error.url,
        itemName: String(context['itemName'] ?? ''),
        requestId: error.requestId,
      });
    case ProblemCodes.TabNotAcceptingOrders:
      throw new TabNotAcceptingOrdersError({
        url: error.url,
        tabId: String(context['tabId'] ?? ''),
        tabStatus: TAB_NOT_ACCEPTING[Number(context['status'])] ?? null,
        requestId: error.requestId,
      });
    case ProblemCodes.TableNotSeated:
      throw new TableNotSeatedError({
        url: error.url,
        tableId: String(context['tableId'] ?? ''),
        requestId: error.requestId,
      });
    case ProblemCodes.LineAlreadyPaid:
      throw new LineAlreadyPaidError({
        url: error.url,
        lineId: String(context['lineId'] ?? context['tabOrderLineId'] ?? ''),
        requestId: error.requestId,
      });
    default:
      throw error;
  }
}

/**
 * What every staff feature file shares: the client and the branch order read.
 */
export function createStaffHttpContext(client: ApiClient) {
  async function branchOrders(
    branchId: string,
    status?: OrderStatus,
  ): Promise<readonly KitchenOrder[]> {
    const { data } = await client.get<KitchenOrder[]>(`/api/branches/${branchId}/orders`, {
      ...(status ? { query: { status: orderStatusCode(status) } } : {}),
    });
    return data ?? [];
  }

  return { client, branchOrders };
}

export type StaffHttpContext = ReturnType<typeof createStaffHttpContext>;
