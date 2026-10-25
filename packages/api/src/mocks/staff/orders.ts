import type { Menu } from '../../contracts/menu';
import type {
  PlaceOrderCommand,
  PlaceOrderResult,
  OrderQueueEntry,
  SetOrderStatusCommand,
} from '../../contracts/ordering';
import {
  TabNotAcceptingOrdersError,
  OrderGuestUnavailableError,
  LineAlreadyPaidError,
} from '../../contracts/errors';
import { ValidationError, NotFoundError } from '../../errors';
import type { StaffGateway } from '../../staffGateway';
import {
  type StaffMockContext,
  iso,
  minutesFrom,
  type MockOrder,
  WHOLE_ORDER_VOID_REASON,
} from './context';

/** The menu, placing orders and the kitchen queue. */
export function ordersMethods(
  ctx: StaffMockContext,
): Pick<
  StaffGateway,
  'getMenu' | 'placeOrder' | 'listOrderQueue' | 'listOrdersByStatus' | 'setOrderStatus'
> {
  const {
    FLOOR_BRANCH,
    approvedOn,
    id,
    kitchenMoved,
    menu,
    menuItems,
    now,
    options,
    orderEntry,
    orders,
    pushEvent,
    requireSession,
    requireTab,
    settle,
    tabs,
    takeawayBook,
    totalsFor,
  } = ctx;
  return {
    async getMenu(): Promise<Menu | null> {
      return settle(menu);
    },

    async placeOrder(command: PlaceOrderCommand): Promise<PlaceOrderResult> {
      requireSession(`/api/tabs/${command.tabId}/staff-orders`);
      const tab = requireTab(command.tabId);
      const at = now();

      const duplicate = orders.get(command.clientCommandId);
      if (duplicate) {
        return settle({
          orderId: duplicate.id,
          tabId: tab.id,
          status: duplicate.status,
          placedAtUtc: duplicate.placedAtUtc,
          estimatedReadyAtUtc: null,
          wasReplay: true,
          totals: totalsFor(tab),
        });
      }

      const order: MockOrder = {
        // The command id *is* the order id here, which is how the replay above
        // works without a second log. The server keys its own idempotency table
        // the same way.
        id: command.clientCommandId,
        tabId: tab.id,
        tableLabel: tab.tableLabel,
        // A waiter's order is in the kitchen the moment it is sent, as on the server.
        status: 'inKitchen',
        placedAtUtc: iso(at),
        lineIds: [],
        placedByName: options.staffName ?? 'Ani Hakobyan',
      };

      // A tab that takes no more orders says why, as the server's `context.status`.
      if (tab.status !== 'open') {
        throw new TabNotAcceptingOrdersError({
          url: `/api/tabs/${tab.id}/staff-orders`,
          tabId: tab.id,
          tabStatus: tab.status,
        });
      }
      // A waiter's order on a waiting tab is taken, and admits nothing: only
      // Admit lets the table in (review round, 2026-10-20).

      // Refused whole, as on the server: nothing is placed when one line is wrong.
      command.lines.forEach((line, index) => {
        if (!line.participantId) return;
        const url = `/api/tabs/${tab.id}/staff-orders`;
        // A shared line is the table's; naming a guest on it contradicts itself.
        if (line.isShared) {
          throw new ValidationError({
            url,
            status: 400,
            problem: {
              type: 'about:blank',
              title: 'Invalid request',
              status: 400,
              detail: 'A shared line belongs to the table and cannot name a guest.',
              code: 'invalid-request',
              traceId: 'mock',
              context: { field: `items[${index}].participantId` },
            },
          });
        }
        const named = tab.participants.find((person) => person.id === line.participantId);
        const field = `items[${index}].participantId`;
        if (!named) {
          throw new OrderGuestUnavailableError({
            url,
            status: 404,
            participantId: line.participantId,
            guestState: 'notOnTab',
            field,
          });
        }
        if (named.status !== 'approved') {
          throw new OrderGuestUnavailableError({
            url,
            status: 409,
            participantId: named.id,
            guestState: named.status === 'removed' ? 'removed' : 'pending',
            field,
          });
        }
      });

      for (const line of command.lines) {
        const item = menuItems.get(line.menuItemId);
        if (!item) continue;
        const lineId = id('line');
        const owner = line.isShared ? null : line.participantId;
        tab.lines.push({
          id: lineId,
          orderId: order.id,
          menuItemId: item.id,
          name: item.name,
          quantity: line.quantity,
          unitPriceDram: item.priceDram,
          lineTotalDram: item.priceDram * line.quantity,
          note: line.note ?? null,
          isShared: line.isShared,
          // As the server: a line nobody owns and nobody shares is the table's,
          // and says the waiter did not know.
          isTableAttributed: !line.isShared && owner === null,
          ownerParticipantId: owner,
          // Null even here, because `OrderLineView` carries neither and the
          // panel must not be built against something the wire never sends.
          participantId: null,
          orderedByName: null,
          onBehalfOfParticipantId: owner,
          /*
           * Snapshotted now, and zero when the line does not split.
           *
           * The count is `sharedWithParticipantIds.length` on the wire, so an
           * owned line is 0 rather than "everyone currently here". Reporting
           * the roster size for every line was the mock's own version of the
           * bug its comment warns about — it just made the error on the
           * *unshared* lines instead of the late-arriving ones.
           */
          sharedWithCount: owner === null ? approvedOn(tab).length : 0,
          status: 'active',
          voidReason: null,
          voidedByName: null,
          placedAtUtc: iso(at),
          orderStatus: 'inKitchen',
        });
        order.lineIds.push(lineId);
      }

      orders.set(order.id, order);
      pushEvent(tab, 'orderPlaced', at);
      pushEvent(tab, 'orderStatusChanged', at);

      return settle({
        orderId: order.id,
        tabId: tab.id,
        status: 'inKitchen',
        placedAtUtc: order.placedAtUtc,
        estimatedReadyAtUtc: minutesFrom(at, 15),
        wasReplay: false,
        totals: totalsFor(tab),
      });
    },

    async listOrderQueue(): Promise<readonly OrderQueueEntry[]> {
      // Accepted and ready takeaway orders ride beside the tabs' tickets with
      // the TAKEAWAY band (2026-10-22); a collected one leaves the screen.
      return settle(
        [
          ...[...orders.values()]
            .filter((order) => order.status !== 'served' && order.status !== 'voided')
            .map(orderEntry),
          ...takeawayBook.kitchenTickets(FLOOR_BRANCH),
        ].sort((a, b) => b.placedAtUtc.localeCompare(a.placedAtUtc)),
      );
    },

    async listOrdersByStatus({ status }): Promise<readonly OrderQueueEntry[]> {
      return settle(
        [...orders.values()]
          .filter((order) => order.status === status)
          .sort((a, b) => b.placedAtUtc.localeCompare(a.placedAtUtc))
          .map(orderEntry),
      );
    },

    async setOrderStatus(command: SetOrderStatusCommand): Promise<OrderQueueEntry> {
      requireSession(`/api/orders/${command.orderId}/status`);
      const order = orders.get(command.orderId);
      if (!order) throw new NotFoundError({ url: `/api/orders/${command.orderId}` });
      const tab = order.tabId ? tabs.get(order.tabId) : undefined;
      // As the server (2026-10-25): voiding a whole order voids every line of
      // it still on the bill, and is refused, as one line's void is, once the
      // tab has been paid against and the void would take money off it.
      if (command.status === 'voided' && tab) {
        const live = tab.lines.filter(
          (line) => line.orderId === order.id && line.status !== 'voided' && line.lineTotalDram > 0,
        );
        if (live.length > 0 && tab.paidDram > 0) {
          throw new LineAlreadyPaidError({
            url: `/api/orders/${command.orderId}/status`,
            lineId: live[0]!.id,
          });
        }
        tab.lines.forEach((line, index) => {
          if (line.orderId !== order.id || line.status === 'voided') return;
          tab.lines[index] = {
            ...line,
            status: 'voided',
            lineTotalDram: 0,
            voidReason: WHOLE_ORDER_VOID_REASON,
          };
        });
        if (live.length > 0) pushEvent(tab, 'lineVoided', now());
      }
      order.status = command.status;
      if (tab) pushEvent(tab, 'orderStatusChanged', now());
      // A pre-order's ticket: its card reads the kitchen's progress (signal 6).
      if (order.preOrderReservationId) kitchenMoved(order.preOrderReservationId, command.status);
      return settle(orderEntry(order));
    },
  };
}
