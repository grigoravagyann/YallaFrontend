import type { DuePreOrder, DuePreOrders } from '../contracts/preOrder';
import type { AskOnMyWayResult } from '../contracts/onMyWay';
import {
  takeawayNote,
  type BranchTakeawayOrders,
  type StaffTakeawayOrder,
} from '../contracts/takeaway';
import {
  askOnMyWayResultFromWire,
  duePreOrderFromWire,
  duePreOrdersFromWire,
  rethrowPreOrderRefusal,
  type WireAskOnMyWayResult,
  type WireDuePreOrder,
  type WireDuePreOrders,
} from './preOrderMapping';
import {
  branchTakeawayOrdersFromWire,
  rethrowTakeawayRefusal,
  staffTakeawayOrderFromWire,
  takeawayPaymentMethodCode,
  type WireBranchTakeawayOrders,
  type WireStaffTakeawayOrder,
} from './takeawayMapping';
import type {
  BranchConversations,
  ConversationSubjectRef,
  SentMessage,
  StaffConversation,
} from '../contracts/messages';
import {
  branchConversationsFromWire,
  floorMessagesFromWire,
  rethrowMessageRefusal,
  markReadBody,
  sendMessageBody,
  sentMessageFromWire,
  staffConversationFromWire,
  type WireBranchConversations,
  type WireStaffConversation,
  type WireStaffMessageResult,
} from './messagesMapping';
import type { ApiClient } from '../client';
import type { ConsoleBooking } from '../contracts/approvals';
import {
  asNotStarted,
  LineAlreadyPaidError,
  MenuItemUnavailableError,
  OrderGuestUnavailableError,
  PaymentExceedsRemainingError,
  type OrderGuestState,
  type TabNotAcceptingStatus,
  TabNotAcceptingOrdersError,
  TableNotSeatedError,
} from '../contracts/errors';
import type { TabAwaitingAdmission } from '../contracts/admission';
import type { Menu } from '../contracts/menu';
import { admissionRefusal, tabAwaitingAdmissionFromWire } from './admissionMapping';
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
import { voidReasonText } from '../contracts/ordering';
import { ApiError, NotFoundError } from '../errors';
import type { components } from '../generated/schema';
import type {
  ReleaseReservationCommand,
  UndoNoShowResult,
  ReservationReleaseResult,
  StaffGateway,
} from '../staffGateway';
import type { WireReservationWithApproval } from './approvalMapping';
import { awaitingApprovalFromWire, type WireAwaitingApproval } from './awaitingApprovalMapping';
import { consoleBookingFromWire } from './consoleMapping';
import { cancelledByBlockRefusal, undoNoShowRefusal, withRefusal } from './guestRecordMapping';
import { reservationStatus } from './dinerMapping';
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
          tabStatus: TAB_NOT_ACCEPTING[Number(context['status'])] ?? null,
          requestId: error.requestId,
        });
      case 'table-not-seated':
        throw new TableNotSeatedError({
          url: error.url,
          tableId: String(context['tableId'] ?? ''),
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
        const messages = floorMessagesFromWire(data.messages);
        return {
          plan: floorFromState(data),
          details: staffFloorDetails(data),
          lastSequence: data.maxSequence,
          asOfUtc: data.asOfUtc,
          // Guest messages (2026-10-23): the badge and the rail, when the server says.
          ...(messages ? { messages } : {}),
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
      const { data } = await client
        .post<Schemas['Yalla.Application.Reservations.ReservationReleaseResult']>(
          `/api/reservations/${command.reservationId}/release`,
          {
            clientCommandId: command.clientCommandId,
            outcome: RELEASE_OUTCOME[command.outcome],
            ...(command.reason ? { reason: command.reason } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.ReleaseReservationRequest'],
        )
        // A no-show before the booking's start: the panel says when it is due.
        .catch((error: unknown) => {
          throw asNotStarted(error);
        });

      return {
        reservationId: data.reservation.id,
        outcome: data.outcome === 1 ? 'noShow' : 'guestCancelled',
        countsTowardNoShowThreshold: data.countsTowardNoShowThreshold,
        tableId: data.tableId,
        tableLabel: data.tableLabel,
        tableFreed: data.tableFreed,
        wasReplay: data.wasReplay,
        // Wire §0a: only when this no-show blocked its guest.
        guestBlockedUntilUtc: data.guestBlockedUntilUtc ?? null,
      };
    },

    async undoNoShow({ reservationId, clientCommandId, reason }): Promise<UndoNoShowResult> {
      // The booking as it now stands: confirmed again, or as it was when
      // already undone.
      const { data } = await withRefusal(
        client.post<Schemas['Yalla.Application.Reservations.ReservationView']>(
          `/api/reservations/${reservationId}/undo-no-show`,
          {
            clientCommandId,
            ...(reason?.trim() ? { reason: reason.trim() } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.UndoNoShowRequest'],
        ),
        undoNoShowRefusal,
      );
      return {
        reservationId: data.id,
        status: reservationStatus(data.status),
        tableId: data.tableId,
        tableLabel: data.tableLabel,
      };
    },

    // --- Bookings waiting for the floor ------------------------------------

    async listAwaitingApproval(branchId) {
      // The server orders the list, soonest-closing window first; kept as sent.
      const { data } = await client.get<WireAwaitingApproval[]>(
        `/api/branches/${branchId}/reservations/awaiting`,
      );
      return (data ?? []).map(awaitingApprovalFromWire);
    },

    async approveReservation({ reservationId }): Promise<ConsoleBooking> {
      // The empty decision body, as the console sends it: the route binds a
      // JSON document. The 409s — decided already, or too late — pass through
      // as the client's own `ConcurrencyConflictError`, code intact.
      // Cancelled by its guest's no-show block meanwhile: said as that (wire §0a).
      const { data } = await withRefusal(
        client.post<WireReservationWithApproval>(
          `/api/reservations/${reservationId}/approve`,
          {} satisfies Schemas['Yalla.Api.Endpoints.DecideReservationRequest'],
        ),
        cancelledByBlockRefusal,
      );
      return consoleBookingFromWire(data);
    },

    async rejectReservation({ reservationId, reason }): Promise<ConsoleBooking> {
      const { data } = await withRefusal(
        client.post<WireReservationWithApproval>(`/api/reservations/${reservationId}/reject`, {
          reason: reason ?? null,
        } satisfies Schemas['Yalla.Api.Endpoints.DecideReservationRequest']),
        cancelledByBlockRefusal,
      );
      return consoleBookingFromWire(data);
    },

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

    // --- Messages with guests (2026-10-23) -----------------------------------
    //
    // Sends are online only, like the rail's actions; every refusal is read by
    // `messagesMapping.ts`. Kitchen and a platform admin writing get a plain
    // 403 `forbidden`, the client's `ForbiddenError`.

    async listConversations(branchId): Promise<BranchConversations> {
      const { data } = await client.get<WireBranchConversations>(
        `/api/branches/${branchId}/conversations`,
      );
      return branchConversationsFromWire(data);
    },

    async getStaffConversation(subject: ConversationSubjectRef): Promise<StaffConversation | null> {
      try {
        const { data } =
          subject.kind === 'takeaway'
            ? await client.get<WireStaffConversation>(
                `/api/takeaway-orders/${subject.id}/conversation`,
              )
            : await client.get<WireStaffConversation>(
                `/api/reservations/${subject.id}/conversation`,
              );
        return staffConversationFromWire(data, subject);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async sendStaffMessage(command): Promise<SentMessage> {
      const { id } = command.subject;
      const body = sendMessageBody(command);
      try {
        const { data } =
          command.subject.kind === 'takeaway'
            ? await client.post<WireStaffMessageResult>(
                `/api/takeaway-orders/${id}/conversation/messages`,
                body,
              )
            : await client.post<WireStaffMessageResult>(
                `/api/reservations/${id}/conversation/messages`,
                body,
              );
        return sentMessageFromWire(data);
      } catch (error) {
        rethrowMessageRefusal(error);
      }
    },

    async markStaffConversationRead(command): Promise<void> {
      const segment = command.kind === 'takeaway' ? 'takeaway-orders' : 'reservations';
      await client.post(`/api/${segment}/${command.id}/conversation/read`, markReadBody(command));
    },

    // --- Tables waiting to be let in ---------------------------------------

    async listTabsAwaitingAdmission(branchId): Promise<readonly TabAwaitingAdmission[]> {
      // Oldest first, as the server orders it; kept as sent.
      const { data } = await client.get<
        Schemas['Yalla.Application.Tabs.TabAwaitingAdmissionView'][]
      >(`/api/branches/${branchId}/tabs/awaiting-admission`);
      return (data ?? []).map(tabAwaitingAdmissionFromWire);
    },

    async admitTab({ tabId, clientCommandId }): Promise<StaffTab> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabStaffView']>(
          `/api/tabs/${tabId}/admit`,
          { clientCommandId },
        );
        return staffTabFromView(data, client.baseUrl);
      } catch (error) {
        throw admissionRefusal(error, tabId) ?? error;
      }
    },

    async rejectTab({ tabId, clientCommandId, reason }): Promise<StaffTab> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabStaffView']>(
          `/api/tabs/${tabId}/reject`,
          { clientCommandId, reason: reason?.trim() ? reason.trim() : null },
        );
        return staffTabFromView(data, client.baseUrl);
      } catch (error) {
        // `table-state-conflict` passes through as the client's own
        // `ConcurrencyConflictError`: the floor is read again either way.
        throw admissionRefusal(error, tabId) ?? error;
      }
    },

    // --- The tab ------------------------------------------------------------

    async getStaffTab(tabId): Promise<StaffTab | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Tabs.TabStaffView']>(
          `/api/tabs/${tabId}/participants`,
        );
        return staffTabFromView(data, client.baseUrl);
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

    async openTabForStaff({ branchId, tableId, clientCommandId }): Promise<StaffTab> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabStaffView']>(
          `/api/branches/${branchId}/tables/${tableId}/open-tab`,
          { clientCommandId },
        );
        return staffTabFromView(data, client.baseUrl);
      } catch (error) {
        rethrow(error);
      }
    },

    async beginClosing({ tabId, clientCommandId }): Promise<StaffTab> {
      const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabStaffView']>(
        `/api/tabs/${tabId}/closing`,
        { clientCommandId },
      );
      return staffTabFromView(data, client.baseUrl);
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
      return staffTabFromView(data, client.baseUrl);
    },

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
            // The server stores free text and the diner reads it on their phone.
            reason: voidReasonText(command),
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
 * The idempotency key of one group of a legacy order: the caller's id with its
 * last four hex digits replaced by the group's index, as the build that queued
 * it sent it.
 */
/** `TabStatus` on a `tab-not-accepting-orders` refusal. */
const TAB_NOT_ACCEPTING: Readonly<Record<number, TabNotAcceptingStatus>> = {
  2: 'closing',
  3: 'closed',
  4: 'abandoned',
};

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
  if (error.status === 404 && error.code === 'not-found') {
    return new OrderGuestUnavailableError({
      url: error.url,
      status: 404,
      participantId,
      guestState: 'notOnTab',
      field,
      requestId: error.requestId,
    });
  }
  if (error.status === 409 && error.code === 'conflicting-state') {
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
