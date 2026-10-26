import { MenuItemUnavailableError, TabNotAcceptingOrdersError } from '../../contracts/errors';
import { ApiError, NotFoundError } from '../../errors';
import type { YallaGateway } from '../../gateway';
import type {
  BranchMenu,
  DinerTabView,
  PlaceOrderResult,
  TabEventPage,
  TabShares,
} from '../../contracts/ordering';
import type { components } from '../../generated/schema';
import { admissionRefusal } from '../admissionMapping';
import { dinerTab, settlementModeCode } from '../dinerMapping';
import { branchMenu, placeOrderResult, tabEventPage, tabShares } from '../staffMapping';
import { ProblemCodes } from '../../generated/problemCodes';
import type { DinerHttpContext } from './context';

type Schemas = components['schemas'];

export function orderingMethods(
  ctx: DinerHttpContext,
): Pick<
  YallaGateway,
  | 'getBranchMenuDetail'
  | 'getDinerTab'
  | 'getTabEvents'
  | 'placeOrder'
  | 'getTabShares'
  | 'setSettlementMode'
> {
  const { client, tabAuth, ended, hostError } = ctx;
  /** A server-relative photo url, made absolute so a phone can load it. */
  function absolute(url: string): string {
    if (!url.startsWith('/')) return url;
    try {
      return new URL(
        url,
        client.baseUrl.endsWith('/') ? client.baseUrl : `${client.baseUrl}/`,
      ).toString();
    } catch {
      return url;
    }
  }

  function withAbsolutePhotos(menu: BranchMenu): BranchMenu {
    return {
      ...menu,
      categories: menu.categories.map((category) => ({
        ...category,
        items: category.items.map((item) => ({
          ...item,
          photo: {
            ...item.photo,
            thumbnailUrl: absolute(item.photo.thumbnailUrl),
            cardUrl: absolute(item.photo.cardUrl),
            fullUrl: absolute(item.photo.fullUrl),
          },
        })),
      })),
    };
  }

  /**
   * The two refusals an ordering screen has to say something specific about.
   *
   * Both are 409s, and both are the *normal* outcome of a race rather than a
   * failure: a dish sold out while the tray was open, or a waiter marked the
   * tab closing while somebody was mid-tray. Generic error copy on either one
   * leaves the diner with no idea what to do next, which on the sold-out case
   * is "pick something else" and on the closing case is "go and look at the
   * bill". Everything else keeps the client's generic mapping.
   */
  function rethrowOrdering(error: unknown, tabId: string): never {
    if (!(error instanceof ApiError) || !error.problem) throw error;
    const context = error.problem.context ?? {};
    // A waiter has not let the table order yet: said as itself, not a race.
    const admission = admissionRefusal(error, tabId);
    if (admission) throw admission;

    switch (error.problem.code) {
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
          requestId: error.requestId,
        });
      default:
        throw error;
    }
  }

  return {
    // --- Ordering and the bill ---------------------------------------------
    //
    // Real, all six. Every shape is built by `dinerMapping.ts` from
    // `generated/schema.ts`, so a renamed server field is a compile error here
    // rather than an `undefined` on a bill somebody is about to pay.

    async getBranchMenuDetail(branchId): Promise<BranchMenu | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Menus.BranchMenuView']>(
          `/api/branches/${branchId}/menu`,
        );
        // The client's own clock, and labelled as such: `BranchMenuView` carries
        // no timestamp, so a cached-menu banner can only honestly say when this
        // device read it. Photo urls come back server-relative, and a phone has
        // no page origin to resolve them against.
        return withAbsolutePhotos(branchMenu(data, new Date().toISOString()));
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getDinerTab(tabId): Promise<DinerTabView | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Tabs.TabView']>(
          `/api/tabs/${tabId}`,
          await tabAuth(tabId),
        );
        return dinerTab(data, new Date().toISOString(), client.baseUrl);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw ended(error, tabId, [401, 403]);
      }
    },

    async getTabEvents({ tabId, afterSequence }): Promise<TabEventPage> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Ordering.TabEventPage']>(
          `/api/tabs/${tabId}/events`,
          { ...(await tabAuth(tabId)), query: { afterSequence } },
        );
        return tabEventPage(data);
      } catch (error) {
        throw ended(error, tabId, [401, 403]);
      }
    },

    /**
     * One order for the whole tray.
     *
     * Naming a guest — `onBehalfOfParticipantId`, or a line's `participantId` —
     * is staff-only on the wire (a phone gets 403), and a diner's lines are
     * their own by construction. `isShared` is the only per-line attribution a
     * phone can send.
     */
    async placeOrder(command): Promise<PlaceOrderResult> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Ordering.OrderView']>(
          `/api/tabs/${command.tabId}/orders`,
          {
            clientCommandId: command.clientCommandId,
            items: command.lines.map((line) => ({
              menuItemId: line.menuItemId,
              quantity: line.quantity,
              isShared: line.isShared,
              ...(line.note ? { note: line.note } : {}),
            })),
          } satisfies Schemas['Yalla.Api.Endpoints.PlaceOrderRequest'],
          await tabAuth(command.tabId),
        );
        return placeOrderResult(data);
      } catch (error) {
        // A 403 stays a 403: it is the ordering policy (pending, not allowed,
        // bill asked for), and the tray refetches the tab to say which.
        rethrowOrdering(ended(error, command.tabId), command.tabId);
      }
    },

    async getTabShares(tabId): Promise<TabShares | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Ordering.TabSharesView']>(
          `/api/tabs/${tabId}/shares`,
          await tabAuth(tabId),
        );
        // No `hostParticipantId` on this response, so `isHost` is reported false
        // rather than guessed. The screen marks the host from the tab read.
        return tabShares(data);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw ended(error, tabId, [401, 403]);
      }
    },

    async setSettlementMode(command): Promise<DinerTabView> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabView']>(
          `/api/tabs/${command.tabId}/settlement-mode`,
          /*
           * `settlementMode`, not `mode`, and no command id. This body was
           * `{ mode, clientCommandId }`: the server binds
           * `SetSettlementModeRequest.settlementMode` and declares nothing else,
           * so the mode never arrived and the request was refused for a missing
           * required field. Found by check-gateway-schema.
           */
          { settlementMode: settlementModeCode(command.mode) },
          await tabAuth(command.tabId),
        );
        return dinerTab(data, new Date().toISOString(), client.baseUrl);
      } catch (error) {
        throw hostError(error, command.tabId);
      }
    },
  };
}
