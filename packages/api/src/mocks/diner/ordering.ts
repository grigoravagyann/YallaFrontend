import type {
  BranchMenu,
  DinerTabView,
  TabEventPage,
  PlaceOrderResult,
  TabShares,
} from '../../contracts/ordering';
import { publishedBranchMenu, mockBranchMenu } from '../menuDetail';
import { NotFoundError, ForbiddenError } from '../../errors';
import { requireClientCommandId } from '../problems';
import { TabAwaitingAdmissionError, NotTabHostError } from '../../contracts/errors';
import { type DinerMockContext, URL_TAG, type MockGateway } from './context';

/** Ordering and the bill. */
export function orderingMethods(
  ctx: DinerMockContext,
): Pick<
  MockGateway,
  | 'getBranchMenuDetail'
  | 'getDinerTab'
  | 'getTabEvents'
  | 'placeOrder'
  | 'getTabShares'
  | 'setSettlementMode'
> {
  const {
    dinerViewOf,
    orders,
    preOrders,
    readableTab,
    serveFloor,
    takeaway,
    venueTypeFor,
    wait,
    world,
  } = ctx;
  return {
    // --- Ordering and the bill ---------------------------------------------

    async getBranchMenuDetail(branchId): Promise<BranchMenu | null> {
      await wait();
      const type = venueTypeFor(branchId);
      // Complete items only. The server applies this and the mock did not, so
      // a screen built against the mock was being handed items with empty
      // allergen lists that production would never send.
      return type
        ? takeaway.decorateMenu(
            preOrders.decorateMenu(publishedBranchMenu(mockBranchMenu(branchId, type))),
          )
        : null;
    },

    async getDinerTab(tabId): Promise<DinerTabView | null> {
      await wait();
      serveFloor();
      const tab = readableTab(tabId);
      return tab ? dinerViewOf(tab) : null;
    },

    async getTabEvents({ tabId, afterSequence }): Promise<TabEventPage> {
      await wait();
      serveFloor();
      const tab = world.get(tabId);
      if (tab) orders.ensure(tab.id, tab.branchId);
      return orders.events(tabId, afterSequence);
    },

    async placeOrder(command): Promise<PlaceOrderResult> {
      await wait();
      const tab = readableTab(command.tabId);
      if (!tab) throw new NotFoundError({ url: `/api/tabs/${command.tabId}/orders` });
      // The command id binds first, as on the server: a malformed one is a 400
      // before any rule.
      requireClientCommandId(
        `${URL_TAG}/api/tabs/${command.tabId}/orders`,
        command.clientCommandId,
      );
      // The ordering policy, as the server applies it: a bare 403 for anybody
      // not approved, not allowed to order, or on a tab no longer open. Past
      // it, a tab a waiter has not let in is the service's 409.
      const view = dinerViewOf(tab);
      if (
        view.admission.status === 'awaiting' &&
        view.me.status === 'approved' &&
        view.me.canOrder &&
        view.status === 'open'
      ) {
        throw new TabAwaitingAdmissionError({
          url: `${URL_TAG}/api/tabs/${command.tabId}/orders`,
          tabId: command.tabId,
        });
      }
      if (!view.me.canOrderNow) {
        throw new ForbiddenError({ url: `${URL_TAG}/api/tabs/${command.tabId}/orders` });
      }
      // No clock gate: a seated party keeps ordering after closing time,
      // because the tab decides and last orders is Mark closing (the server's
      // OrderingTests pin it; docs/tabs.md "Ordering after closing time").
      return orders.place(tab, command);
    },

    async getTabShares(tabId): Promise<TabShares | null> {
      await wait();
      serveFloor();
      const tab = world.get(tabId);
      return tab ? orders.shares(tab, tab.yourParticipantId) : null;
    },

    async setSettlementMode(command): Promise<DinerTabView> {
      await wait();
      const tab = world.get(command.tabId);
      if (!tab) throw new NotFoundError({ url: `/api/tabs/${command.tabId}/settlement-mode` });
      if (tab.yourRole !== 'host') {
        throw new NotTabHostError({ url: `/api/tabs/${command.tabId}/settlement-mode` });
      }
      orders.setSettlementMode(tab, command.mode);
      return dinerViewOf(tab);
    },
  };
}
