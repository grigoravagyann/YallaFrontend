import type { Menu } from './contracts/menu';
import type { StaffFloor, TableActionCommand, TableActionResult } from './contracts/service';
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
  PlaceOrderResult,
  ReassignHostCommand,
  RecordCashPaymentCommand,
  ServiceRequest,
  SetOrderStatusCommand,
  StaffTab,
  TabAdjustment,
  TabLine,
  VoidLineCommand,
} from './contracts/ordering';

/**
 * Everything the counter screen needs from a data source.
 *
 * A third gateway rather than more methods on the two that exist, and the split
 * is a permission boundary rather than a filing decision. `YallaGateway` is what
 * a stranger's phone may ask for and must never be able to void a line;
 * `ConsoleGateway` is the owner's admin panel and has no business seating a
 * table. Merging them would put "abandon this tab" one autocomplete away from
 * the diner bundle.
 *
 * Every method is scoped server-side by the caller's token. The branch id comes
 * from the staff session, never from a route parameter: a waiter has exactly
 * one branch and no way to name another.
 *
 * ## Two things a staff token cannot do
 *
 * Both are the server's shape rather than an omission here, and both are why
 * some methods below look indirect:
 *
 * - **It cannot read a tab.** `GET /api/tabs/{tabId}`, `/shares` and `/events`
 *   are all `TabParticipant`-scoped, and a staff principal fails that policy by
 *   construction. `GET /api/tabs/{tabId}/participants` is the only staff-side
 *   tab read, and it carries participants and totals and nothing else. Hence
 *   {@link StaffGateway.getTabLines}, which assembles a tab's lines out of the
 *   branch's own order queue.
 * - **It cannot open a tab.** `POST /api/tabs/open` takes the QR token printed
 *   on the table, which a waiter's session does not have. There is deliberately
 *   no `openTabForTable` here: a method that could only ever fail is worse than
 *   its absence, which the screens can see at compile time.
 */
export interface StaffGateway {
  // --- The floor ----------------------------------------------------------

  /** The room with every table's derived state. The most-called read here. */
  getFloor(branchId: string): Promise<StaffFloor | null>;

  /**
   * One table transition.
   *
   * @throws {ConcurrencyConflictError} 409 — either somebody won the race
   * (`table-state-conflict`) or a queued command's precondition no longer holds
   * (`precondition-failed`). The error carries the server's current state, and
   * for the second case which half of the precondition failed; the two are
   * handled differently and only the caller knows which it is.
   * @throws {InvalidTransitionError} 422 — the transition is not legal from
   * the table's current status.
   */
  applyTableAction(command: TableActionCommand): Promise<TableActionResult>;

  /** Changes since `afterSequence`, for incremental floor updates. */
  getFloorChanges(input: { branchId: string; afterSequence: number }): Promise<FloorChangePage>;

  /**
   * Let a booking go, and say whether it counts against the diner.
   *
   * Two outcomes, never one with a default. A single "release" button gets
   * tapped for both cases, and the no-show threshold then punishes the people
   * who phoned to cancel.
   */
  releaseReservation(command: ReleaseReservationCommand): Promise<ReservationReleaseResult>;

  // --- The tab ------------------------------------------------------------

  /**
   * Participants and totals. Staff see everything; the host's visibility flags
   * do not apply to them.
   *
   * The returned tab has `linesKnown: false`. This call does not fetch lines,
   * because it runs whenever a panel is open and the lines cost three
   * branch-wide reads.
   */
  getStaffTab(tabId: string): Promise<StaffTab | null>;

  /**
   * One tab's lines, assembled from the branch's order queue.
   *
   * Three reads — outstanding, served, voided — because `GET
   * /api/branches/{id}/orders` returns only outstanding orders unless asked for
   * a status, and a bill missing everything already served is not a bill.
   */
  getTabLines(input: { branchId: string; tabId: string }): Promise<readonly TabLine[]>;

  /** The bill has been asked for. The tab stops taking new items. */
  beginClosing(input: { tabId: string; clientCommandId: string }): Promise<StaffTab>;

  /** Hand the tab to somebody else at the table. */
  reassignHost(command: ReassignHostCommand): Promise<StaffTab>;

  // --- Ordering -----------------------------------------------------------

  /** The menu a waiter orders from. */
  getMenu(branchId: string): Promise<Menu | null>;

  /**
   * Key in a spoken order.
   *
   * `PlaceOrderRequest` carries one `onBehalfOfParticipantId` for the whole
   * order and the draft attributes per line, so an order naming two people is
   * sent as two requests. Each carries a `clientCommandId` derived
   * deterministically from the caller's, so a replay is still idempotent.
   */
  placeOrder(command: PlaceOrderCommand): Promise<PlaceOrderResult>;

  listOrderQueue(branchId: string): Promise<readonly OrderQueueEntry[]>;

  /** Orders in one status. `served` and `voided` are not on the default queue. */
  listOrdersByStatus(input: {
    branchId: string;
    status: OrderStatus;
  }): Promise<readonly OrderQueueEntry[]>;

  setOrderStatus(command: SetOrderStatusCommand): Promise<OrderQueueEntry>;

  // --- Service requests ---------------------------------------------------

  listServiceRequests(branchId: string): Promise<readonly ServiceRequest[]>;

  acknowledgeServiceRequest(command: AcknowledgeServiceRequestCommand): Promise<ServiceRequest>;

  // --- Money --------------------------------------------------------------

  /**
   * Take a line off the bill. Waiter or above.
   *
   * Answers with the whole order's lines as they now stand, which is what the
   * endpoint returns — the voided line included, at zero.
   *
   * @throws {LineAlreadyPaidError} 409 — the tab has been paid against, so this
   * would be a refund, which is a different thing with its own rail.
   */
  voidLine(command: VoidLineCommand): Promise<readonly TabLine[]>;

  /** A discount or a comp. Manager only, enforced server-side. */
  compLine(command: CompCommand): Promise<TabAdjustment>;

  /**
   * Record cash taken.
   *
   * Never queued offline and never retried: a payment against a balance the
   * device cannot verify is how a table pays twice. See the queue module.
   *
   * @throws {PaymentExceedsRemainingError} 409 — more was offered than is owed,
   * with the real balance on the error. Refresh and show it; do not retry.
   */
  recordCashPayment(command: RecordCashPaymentCommand): Promise<PaymentResult>;

  /** Manager only, typed confirmation client-side. */
  abandonTab(command: AbandonTabCommand): Promise<AbandonTabResult>;
}

/** Why a booking was let go. The two are never collapsed into one button. */
export type ReleaseOutcome =
  /** Nobody came. Counts against the diner. */
  | 'noShow'
  /** They let us know. Does not. */
  | 'guestCancelled';

export interface ReleaseReservationCommand {
  readonly reservationId: string;
  readonly outcome: ReleaseOutcome;
  /** Free text for the audit row. Never required of the waiter. */
  readonly reason?: string | undefined;
  readonly clientCommandId: string;
}

/** What releasing did. `Yalla.Application.Reservations.ReservationReleaseResult`. */
export interface ReservationReleaseResult {
  readonly reservationId: string;
  readonly outcome: ReleaseOutcome;
  /** Whether this one goes on the diner's record. Stated by the server, not inferred. */
  readonly countsTowardNoShowThreshold: boolean;
  readonly tableId: string;
  readonly tableLabel: string;
  /**
   * True when the table was held for this booking and has been freed. False
   * when somebody else is sitting there — the release still stands, and the
   * floor is left telling the truth.
   */
  readonly tableFreed: boolean;
  readonly wasReplay: boolean;
}
