import type {
  AwaitingApproval,
  ConsoleBooking,
  DecideReservationCommand,
} from './contracts/approvals';
import type {
  AdmitTabCommand,
  RejectTabCommand,
  TabAwaitingAdmission,
} from './contracts/admission';
import type { DuePreOrder, DuePreOrders, PreOrderStaffCommand } from './contracts/preOrder';
import type { AskOnMyWayResult } from './contracts/onMyWay';
import type {
  BranchConversations,
  ConversationSubjectRef,
  MarkConversationReadCommand,
  SendMessageCommand,
  SentMessage,
  StaffConversation,
} from './contracts/messages';
import type {
  AcceptTakeawayOrderCommand,
  BranchTakeawayOrders,
  CollectTakeawayOrderCommand,
  DeclineTakeawayOrderCommand,
  StaffTakeawayOrder,
} from './contracts/takeaway';
import type { ReservationStatusCode } from './contracts/push';
import type { Menu } from './contracts/menu';
import type {
  ClaimServiceRequestCommand,
  TabTransferResult,
  TransferTabCommand,
} from './contracts/activity';
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
  OpenTabForStaffCommand,
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

  /**
   * Undo a no-show marked by mistake, until 05:00 the next morning (guest
   * record review round, 2026-10-20). Confirmed again; if that leaves the guest
   * under the no-show block's threshold, their block is lifted (nothing they
   * lost comes back) and they are told.
   *
   * @throws {NoShowUndoWindowClosedError} 409 `no-show-undo-window-closed`.
   * @throws {ConcurrencyConflictError} 409 `conflicting-state` — not a no-show.
   */
  undoNoShow(command: UndoNoShowCommand): Promise<UndoNoShowResult>;

  // --- Bookings waiting for the floor ------------------------------------

  /**
   * The branch's bookings waiting for somebody on the floor to say yes or no,
   * soonest-closing window first, each with the table around it: who booked
   * it before (and their number, to ring), who after, and who is sitting
   * there now.
   *
   * `GET /api/branches/{branchId}/reservations/awaiting` — waiter or above, at
   * this branch only. Polled while the floor is open: a short-notice booking
   * has fifteen minutes, and nobody is going to refresh.
   */
  listAwaitingApproval(branchId: string): Promise<readonly AwaitingApproval[]>;

  /**
   * `POST /api/reservations/{id}/approve`. Confirmed, and the diner is told.
   *
   * Waiter or above, confined to the booking's branch.
   *
   * @throws {ConcurrencyConflictError} 409 — the booking is not pending any
   * more (somebody decided first), or `reservation-approval-expired`: the
   * answer window or the start passed before the tap landed. Tell the two apart
   * with `isApprovalExpired`.
   */
  approveReservation(command: DecideReservationCommand): Promise<ConsoleBooking>;

  /**
   * `POST /api/reservations/{id}/reject`, with the optional reason recorded on
   * the booking and never shown to the diner. Same guards as approve.
   */
  rejectReservation(command: DecideReservationCommand): Promise<ConsoleBooking>;

  // --- Tables waiting to be let in (2026-10-20) ---------------------------

  /**
   * The tabs a scan opened with no proved number, waiting for a waiter,
   * oldest first. `GET /api/branches/{branchId}/tabs/awaiting-admission` —
   * waiter or above, this branch only. Read again on a change-stream `signal`.
   */
  listTabsAwaitingAdmission(branchId: string): Promise<readonly TabAwaitingAdmission[]>;

  /**
   * Let the table order. Online only, never queued. An admitted tab answers as
   * it is.
   *
   * @throws {TabAdmissionDecidedError} 409 — another waiter rejected it first.
   */
  admitTab(command: AdmitTabCommand): Promise<StaffTab>;

  /**
   * Turn the tab away: it closes, its calls are answered, and the table is
   * freed when the scan seated it (`admission.tableFreed`). Online only.
   *
   * @throws {TabAdmissionDecidedError} 409 — another waiter admitted it first.
   * @throws {ConcurrencyConflictError} 409 `table-state-conflict` — a waiter
   * changed the table at the same moment; read the floor again.
   */
  rejectTab(command: RejectTabCommand): Promise<StaffTab>;

  // --- Pre-orders on the "Հիմա" rail (2026-10-21) --------------------------

  /**
   * The branch's pre-order cards — `GET /api/branches/{branchId}/pre-orders/due`,
   * waiter or above at this branch (a cook is refused). A confirmed booking's
   * card from its `dueAtUtc` until its end; a seated party's until the
   * pre-order is on their tab. Read again at `nextDueAtUtc` and on the change
   * stream's `preOrderChanged` and `bookingChanged`.
   */
  listDuePreOrders(branchId: string): Promise<DuePreOrders>;

  /**
   * "Coming → Send to kitchen" — `POST /api/reservations/{id}/pre-order/send`.
   * Online only. Not seated yet: a held kitchen ticket at once (`tabId`
   * absent on the queue), the first order on their tab when they sit; seated:
   * straight onto the tab. A second tap or tablet answers `wasReplay`.
   *
   * @throws {PreOrderNotSendableError} not confirmed or seated, before the
   * start less two hours, or after its end.
   * @throws {TabNotAcceptingOrdersError} the party's tab is closing.
   * @throws {TableBusyError} the table was busy — tap again.
   * @throws {NotFoundError} the booking has no pre-order.
   */
  sendPreOrder(command: PreOrderStaffCommand): Promise<DuePreOrder>;

  /**
   * "Not coming / no answer" — `POST /api/reservations/{id}/pre-order/not-coming`.
   * Nothing is sent; the card stays and Send stays allowed until the end.
   *
   * @throws {PreOrderAlreadySentError} it was sent already.
   * @throws {PreOrderNotSendableError} not confirmed, or before the start less two hours.
   */
  markPreOrderNotComing(command: PreOrderStaffCommand): Promise<DuePreOrder>;

  /**
   * "Ask: are you coming?" (2026-10-22) —
   * `POST /api/reservations/{id}/ask-on-my-way`, waiter or above at the
   * booking's branch. Sends the automatic question's push and feed entry now.
   * `notified: false` when no live account stands behind the booking: call.
   *
   * @throws {AskOnMyWayTooEarlyError} more than two hours before the start.
   * @throws {AskOnMyWayNotOpenError} not confirmed, or started.
   * @throws {GuestAlreadyAnsweredError} the guest said on my way or late.
   * @throws {AskOnMyWayAskedRecentlyError} asked within fifteen minutes.
   */
  askOnMyWay(reservationId: string): Promise<AskOnMyWayResult>;

  // --- Takeaway at the counter (2026-10-22) ------------------------------

  /**
   * The counter — `GET /api/branches/{branchId}/takeaway-orders`, waiter or
   * above at the branch: the active orders (sent, accepted, ready; each sent
   * one with its answer countdown) and today's finished ones. Polled: takeaway
   * writes nothing to the change stream.
   */
  listTakeawayOrders(branchId: string): Promise<BranchTakeawayOrders>;

  /**
   * "Accept" with the ready time — `POST /api/takeaway-orders/{id}/accept`.
   * The order goes to the kitchen and the guest is told the time.
   *
   * @throws {TakeawayStatusConflictError} not sent any more.
   * @throws {ValidationError} `readyAt` in the past or more than 12 h on.
   */
  acceptTakeawayOrder(command: AcceptTakeawayOrderCommand): Promise<StaffTakeawayOrder>;

  /**
   * "Decline" — `POST /api/takeaway-orders/{id}/decline`; the reason is shown
   * to the guest.
   *
   * @throws {TakeawayStatusConflictError} not sent any more.
   */
  declineTakeawayOrder(command: DeclineTakeawayOrderCommand): Promise<StaffTakeawayOrder>;

  /**
   * "Ready" — `POST /api/takeaway-orders/{id}/ready`, the kitchen (Kitchen
   * role allowed) or the floor. The guest is told to come.
   *
   * @throws {TakeawayStatusConflictError} not accepted.
   */
  markTakeawayOrderReady(orderId: string): Promise<StaffTakeawayOrder>;

  /**
   * "Paid, handed over" — `POST /api/takeaway-orders/{id}/collect` with cash
   * or card. The amount recorded is the total; no receipt is issued here.
   *
   * @throws {TakeawayStatusConflictError} not ready.
   */
  collectTakeawayOrder(command: CollectTakeawayOrderCommand): Promise<StaffTakeawayOrder>;

  /**
   * "No-show" — `POST /api/takeaway-orders/{id}/no-show`, from thirty minutes
   * after ready (`noShowFromUtc`).
   *
   * @throws {TakeawayNoShowTooEarlyError} less than thirty minutes after ready.
   * @throws {TakeawayStatusConflictError} not ready.
   */
  markTakeawayOrderNoShow(orderId: string): Promise<StaffTakeawayOrder>;

  // --- Messages with guests (2026-10-23) -----------------------------------

  /**
   * The inbox — `GET /api/branches/{branchId}/conversations`, waiter or above
   * at the branch: open threads and ones with a message in the last 24 hours,
   * unanswered first, with the badge's count and the branch's templates and
   * reminder. Polled: guest messages push nothing to the tablet.
   */
  listConversations(branchId: string): Promise<BranchConversations>;

  /**
   * One thread with who wrote each venue message —
   * `GET /api/reservations/{id}/conversation` or
   * `/api/takeaway-orders/{id}/conversation`. `null` for an unknown subject.
   */
  getStaffConversation(subject: ConversationSubjectRef): Promise<StaffConversation | null>;

  /**
   * Write to the guest — `POST …/conversation/messages`. Online only.
   * Idempotent on `clientCommandId` (`wasReplay`).
   *
   * @throws {ConversationClosedError} the thread closed.
   * @throws {WaitersCannotWriteError} the venue lets only managers write.
   * @throws {ForbiddenError} kitchen, or a platform admin (reads only).
   * @throws {ValidationError} `text` blank or over 500 after trim.
   */
  sendStaffMessage(command: SendMessageCommand): Promise<SentMessage>;

  /**
   * "The venue has read it" — `POST …/conversation/read`; anybody's read
   * counts for the venue. Up to `upToUtc` (the newest message the screen
   * showed), else now.
   */
  markStaffConversationRead(command: MarkConversationReadCommand): Promise<void>;

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

  /**
   * Open the tab on a seated table for a party that is not going to scan — no
   * phone, or no wish to use one. Answers with the tab already there when a
   * guest scanned first or this is a second tap. Online only: it is not one of
   * the floor commands the tablet queues.
   *
   * Throws `TableNotSeatedError` when nobody is sitting at the table.
   */
  openTabForStaff(command: OpenTabForStaffCommand): Promise<StaffTab>;

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
   * One draft is one order and one kitchen ticket: each line names its own
   * guest (`OrderItemRequest.participantId`), a shared line nobody. A command
   * an earlier build queued (no `shape`) is replayed the way that build sent
   * it — one request per guest, under ids derived from the caller's — so a
   * group that never landed still does.
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

  /**
   * "I'm on it" (2026-10-24): the caller takes the call, and every tablet
   * shows their name — `POST /api/branches/{branchId}/calls/{callId}/claim`.
   * The first claim wins: claiming a call somebody already took answers it
   * as it stands, with their name. Online only.
   */
  claimServiceRequest(command: ClaimServiceRequestCommand): Promise<ServiceRequest>;

  /**
   * Give the table to another waiter from now on — `POST
   * /api/tabs/{tabId}/transfer`. The table's waiter or a manager and above;
   * the target serves at this branch. What was done before stays with the
   * earlier person. Online only.
   *
   * @throws {ForbiddenError} not the table's waiter nor a manager.
   * @throws {ValidationError} the target cannot take tables here.
   */
  transferTab(command: TransferTabCommand): Promise<TabTransferResult>;

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
  /**
   * Set only when this no-show blocked its guest — the third in three days —
   * until when (and again on a replay of that same no-show). Tell the waiter.
   */
  readonly guestBlockedUntilUtc?: string | null | undefined;
}

/**
 * Undo a no-show marked by mistake — `POST /api/reservations/{id}/undo-no-show`,
 * waiter or above at the booking's branch, until 05:00 the next morning on the
 * branch's clock ({@link noShowUndoableUntil}). Online only, never queued.
 */
export interface UndoNoShowCommand {
  readonly reservationId: string;
  /** One per tap, reused on a retry. */
  readonly clientCommandId: string;
  /** For the audit row; at most 500 characters. Never required. */
  readonly reason?: string | undefined;
}

/** The booking after the undo: confirmed again (or as it stands, when already undone). */
export interface UndoNoShowResult {
  readonly reservationId: string;
  readonly status: ReservationStatusCode;
  readonly tableId: string;
  readonly tableLabel: string;
}
