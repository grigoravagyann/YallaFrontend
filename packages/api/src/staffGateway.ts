import type { Menu } from './contracts/menu';
import type {
  AbandonTabCommand,
  AbandonTabResult,
  AcknowledgeServiceRequestCommand,
  CompCommand,
  FloorChangePage,
  OrderQueueEntry,
  PaymentResult,
  PlaceOrderCommand,
  RecordCashPaymentCommand,
  ServiceRequest,
  SetOrderStatusCommand,
  StaffFloor,
  StaffTab,
  TabEventPage,
  TableActionCommand,
  TableActionResult,
  VoidLineCommand,
} from './contracts/service';

/**
 * Everything the counter screen needs from a data source.
 *
 * A third gateway rather than more methods on the two that exist, and the split
 * is a permission boundary rather than a filing decision. {@link YallaGateway}
 * is what a stranger's phone may ask for and must never be able to void a line;
 * {@link ConsoleGateway} is the owner's admin panel and has no business seating
 * a table. Merging them would put "abandon this tab" one autocomplete away from
 * the diner bundle.
 *
 * Every method is scoped server-side by the caller's token. The branch id comes
 * from {@link ConsoleGateway.getCurrentUser}, never from a route parameter: a
 * waiter has exactly one branch and no way to name another.
 *
 * ## What is wired today
 *
 * The table transitions, the floor, and the tab's participants and totals are
 * real HTTP calls against endpoints that exist. Orders, service requests,
 * payments, adjustments and both sequence streams raise
 * `EndpointNotWiredError` from the HTTP implementation, because the server has
 * not shipped them. They are declared here in full so that wiring them is a
 * change to one file, and so the screens are written against the contract
 * rather than against whatever the mock happens to return.
 */
export interface StaffGateway {
  // --- The floor ----------------------------------------------------------

  /** The room with every table's derived state. The most-called read here. */
  getFloor(branchId: string): Promise<StaffFloor | null>;

  /**
   * One table transition.
   *
   * @throws {ConcurrencyConflictError} 409 — the table moved on. The error
   * carries the server's current state so the caller can decide whether this
   * was a live race or a stale queued command; the two are handled differently
   * and only the caller knows which it is.
   * @throws {InvalidTransitionError} 422 — the transition is not legal from
   * the table's current status.
   */
  applyTableAction(command: TableActionCommand): Promise<TableActionResult>;

  /**
   * Changes since `afterSequence`, for incremental floor updates.
   *
   * @throws {EndpointNotWiredError} until the backend ships the stream.
   */
  getFloorChanges(input: { branchId: string; afterSequence: number }): Promise<FloorChangePage>;

  // --- The tab ------------------------------------------------------------

  /** Totals, participants, lines and shares. Staff see everything. */
  getStaffTab(tabId: string): Promise<StaffTab | null>;

  /** @throws {EndpointNotWiredError} until the backend ships the stream. */
  getTabEvents(input: { tabId: string; afterSequence: number }): Promise<TabEventPage>;

  /** The bill has been asked for. Real today. */
  beginClosing(input: { tabId: string; clientCommandId: string }): Promise<StaffTab>;

  /**
   * Open a tab on an occupied table, so order entry never has to ask.
   *
   * @throws {EndpointNotWiredError} — the open endpoint takes a scanned table
   * code, which a waiter's session does not have.
   */
  openTabForTable(input: {
    branchId: string;
    tableId: string;
    clientCommandId: string;
  }): Promise<StaffTab>;

  // --- Ordering -----------------------------------------------------------

  /** The menu a waiter orders from. @throws {EndpointNotWiredError} */
  getMenu(branchId: string): Promise<Menu | null>;

  /** @throws {EndpointNotWiredError} */
  placeOrder(command: PlaceOrderCommand): Promise<{ orderId: string; wasReplay: boolean }>;

  /** @throws {EndpointNotWiredError} */
  listOrderQueue(branchId: string): Promise<readonly OrderQueueEntry[]>;

  /** @throws {EndpointNotWiredError} */
  setOrderStatus(command: SetOrderStatusCommand): Promise<OrderQueueEntry>;

  // --- Service requests ---------------------------------------------------

  /** @throws {EndpointNotWiredError} */
  listServiceRequests(branchId: string): Promise<readonly ServiceRequest[]>;

  /** @throws {EndpointNotWiredError} */
  acknowledgeServiceRequest(command: AcknowledgeServiceRequestCommand): Promise<ServiceRequest>;

  // --- Money --------------------------------------------------------------

  /** Waiter or above. @throws {EndpointNotWiredError} */
  voidLine(command: VoidLineCommand): Promise<StaffTab>;

  /** Manager only, enforced server-side. @throws {EndpointNotWiredError} */
  compLine(command: CompCommand): Promise<StaffTab>;

  /**
   * Record cash taken.
   *
   * Never queued offline: a payment against a balance the device cannot verify
   * is how a table pays twice. See the queue module.
   *
   * @throws {EndpointNotWiredError}
   */
  recordCashPayment(command: RecordCashPaymentCommand): Promise<PaymentResult>;

  /** Manager only, typed confirmation client-side. @throws {EndpointNotWiredError} */
  abandonTab(command: AbandonTabCommand): Promise<AbandonTabResult>;
}
