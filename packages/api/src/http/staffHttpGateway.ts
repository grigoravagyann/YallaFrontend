import type { ApiClient } from '../client';
import {
  LineAlreadyPaidError,
  MenuItemUnavailableError,
  PaymentExceedsRemainingError,
  TabNotAcceptingOrdersError,
} from '../contracts/errors';
import type { Menu } from '../contracts/menu';
import type {
  StaffFloor,
  TableActionCommand,
  TableActionKind,
  TableActionResult,
} from '../contracts/service';
import type {
  AbandonTabCommand,
  AbandonTabResult,
  AcknowledgeServiceRequestCommand,
  CompCommand,
  FloorChangePage,
  OrderQueueEntry,
  OrderStatus,
  PaymentResult,
  PlaceOrderCommand,
  PlaceOrderLine,
  PlaceOrderResult,
  ReassignHostCommand,
  RecordCashPaymentCommand,
  ServiceRequest,
  SetOrderStatusCommand,
  StaffTab,
  TabAdjustment,
  TabLine,
  VoidLineCommand,
} from '../contracts/ordering';
import { ApiError, NotFoundError } from '../errors';
import type { components } from '../generated/schema';
import type {
  ReleaseReservationCommand,
  ReservationReleaseResult,
  StaffGateway,
} from '../staffGateway';
import { floorFromState } from './mapping';
import {
  adjustment,
  adjustmentKindCode,
  floorChangePage,
  menuFrom,
  orderQueueEntry,
  orderStatusCode,
  paymentResult,
  placeOrderResult,
  serviceRequest,
  staffFloorDetails,
  staffTabFromView,
  tabLine,
  tabLinesFromOrders,
  tableActionResult,
} from './staffMapping';

type Schemas = components['schemas'];
type KitchenOrder = Schemas['Yalla.Application.Ordering.KitchenOrderView'];

/** The path segment each action posts to. One place, so none can drift. */
const ACTION_PATHS: Readonly<Record<TableActionKind, string>> = {
  seatWalkIn: 'seat-walk-in',
  seatReservation: 'seat-reservation',
  seatHeldParty: 'seat-held-party',
  hold: 'hold',
  releaseHold: 'release-hold',
  freeTable: 'free',
  outOfService: 'out-of-service',
  returnToService: 'return-to-service',
};

/** The wire's `TableStatus`, for a precondition. Inverse of `tableStatus`. */
const STATUS_CODE: Readonly<Record<string, 1 | 2 | 4 | 5>> = {
  free: 1,
  held: 2,
  occupied: 4,
  outOfService: 5,
};

/** `Yalla.Application.Reservations.ReleaseOutcome`: 1 NoShow, 2 GuestCancelled. */
const RELEASE_OUTCOME: Readonly<Record<'noShow' | 'guestCancelled', 1 | 2>> = {
  noShow: 1,
  guestCancelled: 2,
};

/**
 * The counter screen's real data source.
 *
 * Every method here is a request. Nothing raises `EndpointNotWiredError` any
 * more: the endpoints the previous version reported as missing all shipped, and
 * the two a staff token genuinely cannot call are absent from `StaffGateway`
 * rather than present and failing.
 *
 * There is still no fallback to the mock when the backend is unreachable. A
 * tablet that quietly starts inventing orders and balances would look exactly
 * like one that is working, on the screen where that costs the most.
 */
export function createStaffHttpGateway(client: ApiClient): StaffGateway {
  /**
   * The problem documents this screen has to act on, as typed errors.
   *
   * Only the four it branches on. Everything else keeps the client's generic
   * mapping, because a screen that switches on a code it does not handle
   * specially is a screen with a dead branch in it.
   */
  function rethrow(error: unknown): never {
    if (!(error instanceof ApiError) || !error.problem) throw error;
    const context = error.problem.context ?? {};

    switch (error.problem.code) {
      case 'payment-exceeds-remaining':
        throw new PaymentExceedsRemainingError({
          url: error.url,
          tabId: String(context['tabId'] ?? ''),
          remainingDram: Number(context['remainingAmd'] ?? 0),
          requestedDram: Number(context['requestedAmd'] ?? 0),
          requestId: error.requestId,
        });
      case 'menu-item-unavailable':
        throw new MenuItemUnavailableError({
          url: error.url,
          itemName: String(context['itemName'] ?? ''),
          requestId: error.requestId,
        });
      case 'tab-not-accepting-orders':
        throw new TabNotAcceptingOrdersError({
          url: error.url,
          tabId: String(context['tabId'] ?? ''),
          requestId: error.requestId,
        });
      case 'line-already-paid':
        throw new LineAlreadyPaidError({
          url: error.url,
          lineId: String(context['lineId'] ?? context['tabOrderLineId'] ?? ''),
          requestId: error.requestId,
        });
      default:
        throw error;
    }
  }

  async function branchOrders(
    branchId: string,
    status?: OrderStatus,
  ): Promise<readonly KitchenOrder[]> {
    const { data } = await client.get<KitchenOrder[]>(`/api/branches/${branchId}/orders`, {
      ...(status ? { query: { status: orderStatusCode(status) } } : {}),
    });
    return data ?? [];
  }

  return {
    // --- The floor ----------------------------------------------------------

    async getFloor(branchId): Promise<StaffFloor | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Floor.BranchFloorState']>(
          `/api/branches/${branchId}/tables/floor`,
        );
        return {
          plan: floorFromState(data),
          details: staffFloorDetails(data),
          lastSequence: data.maxSequence,
          asOfUtc: data.asOfUtc,
        };
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async applyTableAction(command: TableActionCommand): Promise<TableActionResult> {
      const path = `/api/branches/${command.branchId}/tables/${command.tableId}/${
        ACTION_PATHS[command.kind]
      }`;

      // Each endpoint takes only the fields its own command needs. Sending a
      // party size to `release-hold` would be rejected by model binding, so the
      // body is assembled per action rather than spread wholesale.
      const body: Record<string, unknown> = {
        clientCommandId: command.clientCommandId,
        queued: command.queued ?? false,
      };

      // Both halves of the precondition, together. Status alone would let a
      // queued command land on a table that went occupied and back to free
      // while it waited — a sitting that has already ended.
      if (command.precondition) {
        body['expectedFromStatus'] = STATUS_CODE[command.precondition.expectedFromStatus];
        if (command.precondition.rowVersion !== null) {
          body['expectedRowVersion'] = command.precondition.rowVersion;
        }
      }

      if (command.reason !== undefined) body['reason'] = command.reason;
      if (command.kind === 'seatWalkIn' || command.kind === 'seatHeldParty') {
        body['partySize'] = command.partySize;
      }
      if (command.kind === 'seatReservation') {
        body['reservationId'] = command.reservationId;
        if (command.partySize !== undefined) body['partySize'] = command.partySize;
      }
      if (command.kind === 'seatHeldParty' && command.reservationId !== undefined) {
        body['reservationId'] = command.reservationId;
      }

      const { data } = await client.post<
        Schemas['Yalla.Application.Tables.TableStateChangeResult']
      >(path, body);
      return tableActionResult(data);
    },

    async getFloorChanges({ branchId, afterSequence }): Promise<FloorChangePage> {
      const { data } = await client.get<Schemas['Yalla.Application.Floor.BranchChangePage']>(
        `/api/branches/${branchId}/tables/changes`,
        { query: { afterSequence } },
      );
      return floorChangePage(data);
    },

    async releaseReservation(
      command: ReleaseReservationCommand,
    ): Promise<ReservationReleaseResult> {
      const { data } = await client.post<
        Schemas['Yalla.Application.Reservations.ReservationReleaseResult']
      >(`/api/reservations/${command.reservationId}/release`, {
        clientCommandId: command.clientCommandId,
        outcome: RELEASE_OUTCOME[command.outcome],
        ...(command.reason ? { reason: command.reason } : {}),
      } satisfies Schemas['Yalla.Api.Endpoints.ReleaseReservationRequest']);

      return {
        reservationId: data.reservation.id,
        outcome: data.outcome === 1 ? 'noShow' : 'guestCancelled',
        countsTowardNoShowThreshold: data.countsTowardNoShowThreshold,
        tableId: data.tableId,
        tableLabel: data.tableLabel,
        tableFreed: data.tableFreed,
        wasReplay: data.wasReplay,
      };
    },

    // --- The tab ------------------------------------------------------------

    async getStaffTab(tabId): Promise<StaffTab | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Tabs.TabStaffView']>(
          `/api/tabs/${tabId}/participants`,
        );
        return staffTabFromView(data);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getTabLines({ branchId, tabId }): Promise<readonly TabLine[]> {
      // Outstanding, then the two statuses the default read leaves out. In
      // parallel: three sequential branch reads is a visible pause on a panel a
      // waiter opens mid-conversation.
      const [outstanding, served, voided] = await Promise.all([
        branchOrders(branchId),
        branchOrders(branchId, 'served'),
        branchOrders(branchId, 'voided'),
      ]);
      return tabLinesFromOrders([...outstanding, ...served, ...voided], tabId);
    },

    async beginClosing({ tabId, clientCommandId }): Promise<StaffTab> {
      const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabStaffView']>(
        `/api/tabs/${tabId}/closing`,
        { clientCommandId },
      );
      return staffTabFromView(data);
    },

    async reassignHost(command: ReassignHostCommand): Promise<StaffTab> {
      const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabStaffView']>(
        `/api/tabs/${command.tabId}/reassign-host`,
        /*
         * `ReassignHostRequest` declares `newHostParticipantId` and nothing
         * else. The `clientCommandId` this used to send was dropped on the floor
         * by the serialiser, so the idempotency it implied was never real.
         */
        { newHostParticipantId: command.newHostParticipantId },
      );
      return staffTabFromView(data);
    },

    // --- Ordering -----------------------------------------------------------

    async getMenu(branchId): Promise<Menu | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Menus.BranchMenuView']>(
          `/api/branches/${branchId}/menu`,
        );
        return menuFrom(data, new Date().toISOString());
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async placeOrder(command: PlaceOrderCommand): Promise<PlaceOrderResult> {
      const groups = groupByParticipant(command.lines);

      // Sequential, not parallel. Two orders arriving at once on the same tab is
      // a race the client has no reason to create, and the last answer carries
      // the totals after all of them — which is the number the caller wants.
      let last: PlaceOrderResult | null = null;
      for (const [index, group] of groups.entries()) {
        try {
          const { data } = await client.post<Schemas['Yalla.Application.Ordering.OrderView']>(
            `/api/tabs/${command.tabId}/staff-orders`,
            {
              clientCommandId: derivedCommandId(command.clientCommandId, index),
              items: group.lines.map((line) => ({
                menuItemId: line.menuItemId,
                quantity: line.quantity,
                isShared: line.isShared,
                ...(line.note ? { note: line.note } : {}),
              })),
              ...(group.participantId ? { onBehalfOfParticipantId: group.participantId } : {}),
            } satisfies Schemas['Yalla.Api.Endpoints.PlaceOrderRequest'],
          );
          last = placeOrderResult(data);
        } catch (error) {
          rethrow(error);
        }
      }

      if (!last) throw new Error('placeOrder was called with no lines.');
      return last;
    },

    async listOrderQueue(branchId): Promise<readonly OrderQueueEntry[]> {
      return (await branchOrders(branchId)).map(orderQueueEntry);
    },

    async listOrdersByStatus({ branchId, status }): Promise<readonly OrderQueueEntry[]> {
      return (await branchOrders(branchId, status)).map(orderQueueEntry);
    },

    async setOrderStatus(command: SetOrderStatusCommand): Promise<OrderQueueEntry> {
      const { data } = await client.post<KitchenOrder>(`/api/orders/${command.orderId}/status`, {
        status: orderStatusCode(command.status),
      } satisfies Schemas['Yalla.Api.Endpoints.MoveOrderStatusRequest']);
      return orderQueueEntry(data);
    },

    // --- Service requests ---------------------------------------------------

    async listServiceRequests(branchId): Promise<readonly ServiceRequest[]> {
      const { data } = await client.get<Schemas['Yalla.Application.Ordering.ServiceRequestView'][]>(
        `/api/branches/${branchId}/service-requests`,
      );
      return (data ?? []).map(serviceRequest);
    },

    async acknowledgeServiceRequest(
      command: AcknowledgeServiceRequestCommand,
    ): Promise<ServiceRequest> {
      const { data } = await client.post<Schemas['Yalla.Application.Ordering.ServiceRequestView']>(
        `/api/service-requests/${command.requestId}/acknowledge`,
        { clientCommandId: command.clientCommandId },
      );
      return serviceRequest(data);
    },

    // --- Money --------------------------------------------------------------

    async voidLine(command: VoidLineCommand): Promise<readonly TabLine[]> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Ordering.OrderView']>(
          `/api/tabs/${command.tabId}/lines/${command.lineId}/void`,
          {
            // The server stores free text and the diner reads it on their phone,
            // so the preset is sent as a sentence rather than as a slug —
            // `guestChangedMind` is a developer's word on somebody's bill. A
            // waiter's own typed detail wins.
            reason: command.detail?.trim() || VOID_REASON_TEXT[command.reason],
            clientCommandId: command.clientCommandId,
          } satisfies Schemas['Yalla.Api.Endpoints.VoidLineRequest'],
        );
        return data.lines.map((line) =>
          tabLine(line, {
            orderId: data.orderId,
            placedAtUtc: data.placedAtUtc,
            status: data.status,
          }),
        );
      } catch (error) {
        return rethrow(error);
      }
    },

    async compLine(command: CompCommand): Promise<TabAdjustment> {
      const { data } = await client.post<Schemas['Yalla.Application.Ordering.AdjustmentView']>(
        `/api/tabs/${command.tabId}/adjustments`,
        {
          clientCommandId: command.clientCommandId,
          kind: adjustmentKindCode(command.kind),
          reason: command.reason,
          ...(command.lineId ? { tabOrderLineId: command.lineId } : {}),
          ...(command.percent !== null ? { percent: command.percent } : {}),
          ...(command.amountDram !== null ? { amountAmd: command.amountDram } : {}),
        } satisfies Schemas['Yalla.Api.Endpoints.AddAdjustmentRequest'],
      );
      return adjustment(data);
    },

    async recordCashPayment(command: RecordCashPaymentCommand): Promise<PaymentResult> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Ordering.CashPaymentView']>(
          `/api/tabs/${command.tabId}/payments/cash`,
          {
            amountAmd: command.amountDram,
            tipAmd: command.tipDram,
            clientCommandId: command.clientCommandId,
            ...(command.participantId ? { tabParticipantId: command.participantId } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.RecordCashRequest'],
        );
        return paymentResult(data);
      } catch (error) {
        return rethrow(error);
      }
    },

    async abandonTab(command: AbandonTabCommand): Promise<AbandonTabResult> {
      const { data } = await client.post<Schemas['Yalla.Application.Ordering.TabTotalsSnapshot']>(
        `/api/tabs/${command.tabId}/abandon`,
        { reason: command.reason } satisfies Schemas['Yalla.Api.Endpoints.AbandonTabRequest'],
      );

      const totals = {
        subtotalDram: data.subtotalAmd,
        serviceChargeDram: data.serviceChargeAmd,
        totalDram: data.totalAmd,
        paidDram: data.paidAmd,
        remainingDram: data.remainingAmd,
      };
      // The endpoint answers with the tab's totals, so what was written off is
      // that snapshot's remaining balance. There is no `wasReplay` on it.
      return { tabId: command.tabId, writtenOffDram: totals.remainingDram, totals };
    },
  };
}

/**
 * The English the server stores for each preset void reason.
 *
 * The diner reads this string on their phone. Sending the slug would put
 * `guestChangedMind` on a bill somebody is looking at, and the server has no
 * vocabulary to translate it back.
 */
const VOID_REASON_TEXT: Readonly<Record<VoidLineCommand['reason'], string>> = {
  wrongItem: 'Wrong item',
  guestChangedMind: 'Guest changed their mind',
  kitchenError: 'Kitchen error',
  spilled: 'Spilled',
  other: 'Removed by staff',
};

interface OrderGroup {
  readonly participantId: string | null;
  readonly lines: readonly PlaceOrderLine[];
}

/**
 * One group per person named on the draft, plus one for the table.
 *
 * Insertion-ordered, so the same draft always produces the same groups in the
 * same order — which is what makes {@link derivedCommandId} stable across a
 * replay.
 */
function groupByParticipant(lines: readonly PlaceOrderLine[]): readonly OrderGroup[] {
  const groups = new Map<string, PlaceOrderLine[]>();
  for (const line of lines) {
    const key = line.participantId ?? '';
    const existing = groups.get(key);
    if (existing) existing.push(line);
    else groups.set(key, [line]);
  }
  return [...groups.entries()].map(([key, grouped]) => ({
    participantId: key === '' ? null : key,
    lines: grouped,
  }));
}

/**
 * A stable per-group idempotency key.
 *
 * The last four hex digits of the caller's own id are replaced with the group
 * index. Every group therefore gets a distinct Guid, the same one on every
 * replay, and — because the caller's value itself is never reused — a draft
 * whose id happens to end `0001` cannot collide with its own second group.
 */
function derivedCommandId(base: string, index: number): string {
  return `${base.slice(0, -4)}${index.toString(16).padStart(4, '0')}`;
}
