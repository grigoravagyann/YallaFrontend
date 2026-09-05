import type { FloorPlanData } from '@yalla/floorplan/types';
import type {
  Booking,
  CreateBookingCommand,
  PhoneChallenge,
  TableAvailability,
  VenueSummary,
  VerifiedPhone,
} from './contracts/booking';
import type { Menu } from './contracts/menu';
import type {
  BranchMenu,
  DinerTabView,
  PlaceOrderCommand,
  PlaceOrderResult,
  SetSettlementModeCommand,
  TabEventPage,
  TabShares,
} from './contracts/unshipped';
import type {
  ScanResult,
  ScanTableCommand,
  TabInvite,
  TabPermissions,
  TableTab,
  WaiterCall,
  WaiterCallReason,
} from './contracts/tab';

/**
 * Everything the diner app needs from a data source.
 *
 * Components are typed against this and never against a mock. There are two
 * implementations — `createMockGateway` and `createHttpGateway` — and switching
 * between them is a change to `resolveGateway` alone.
 *
 * Every method may throw the typed errors in `contracts/errors`; the ones that
 * are *expected outcomes* rather than failures are documented per method.
 */
export interface YallaGateway {
  // --- Browse -------------------------------------------------------------
  /**
   * @throws {EndpointNotWiredError} from the HTTP gateway while the backend has
   * no venue catalogue endpoint. The screen shows "not available yet", not a
   * generic error, because the fix is on a different team.
   */
  listVenues(): Promise<readonly VenueSummary[]>;
  getVenue(venueId: string): Promise<VenueSummary | null>;

  /** Current floor state for a branch. */
  getFloorPlan(branchId: string): Promise<FloorPlanData | null>;

  /**
   * Per-table availability for a specific slot and party size.
   *
   * Separate from `getFloorPlan` because availability depends on *when* and
   * *how many*, while the floor itself does not. The backend derives both the
   * window and the "too small / occupied" reasons — the client must not.
   *
   * `timeZoneId` is the branch's zone. The backend asks in wall-clock terms,
   * so the UTC slot is converted in that zone and never in the device's.
   */
  getTableAvailability(input: {
    branchId: string;
    slotUtc: string;
    partySize: number;
    timeZoneId?: string | undefined;
  }): Promise<readonly TableAvailability[]>;

  // --- Phone verification -------------------------------------------------
  /**
   * Send a 6-digit code.
   *
   * @throws {RateLimitedError} when too many codes were requested for a number.
   */
  requestPhoneCode(phoneE164: string): Promise<PhoneChallenge>;

  /**
   * Exchange a code for a verification token. Against the real backend this
   * is the diner sign-in: it also starts the token session.
   *
   * @throws {WrongCodeError} wrong digits; carries attempts remaining.
   * @throws {ExpiredCodeError} the challenge aged out.
   * @throws {TooManyAttemptsError} the challenge is burned.
   */
  verifyPhoneCode(input: { challengeId: string; code: string }): Promise<VerifiedPhone>;

  // --- Booking ------------------------------------------------------------
  /**
   * Create a booking. Idempotent on `commandId`: replaying the same command
   * returns the same booking rather than making a second one.
   *
   * A party over the branch's instant-confirmation limit yields a booking with
   * status `pendingApproval` — a normal result, not an error.
   *
   * @throws {TableTakenError} someone else got there first; carries the
   * refreshed floor so the UI can re-render immediately.
   * @throws {LeadTimeExceededError} the slot became too soon while deciding.
   */
  createBooking(command: CreateBookingCommand): Promise<Booking>;

  listBookings(): Promise<readonly Booking[]>;
  getBooking(bookingId: string): Promise<Booking | null>;

  /**
   * Cancel a booking. Never refuses: cancelling late is far better for the
   * venue than a no-show, so lateness is a message, not a block.
   */
  cancelBooking(bookingId: string): Promise<Booking>;

  // --- Scanning in and the shared tab -------------------------------------
  /**
   * Exchange a scanned (or typed) table code for a tab.
   *
   * Needs no account and no verified phone — someone walked in off the street,
   * sat down and scanned. Idempotent on `command.commandId`, which is what stops
   * a double scan or a retry after a timeout from opening two tabs on one table.
   *
   * Opening a new tab makes you the host; landing on an existing one makes you
   * a pending joiner. Both are successes and both come back in {@link ScanResult}.
   *
   * @throws {TableOutOfServiceError} the table exists but is not in service.
   * @throws {UnknownTableCodeError} nothing matches the code.
   * @throws {TabClosedError} the tab on that table was already closed and paid.
   */
  scanTableCode(command: ScanTableCommand): Promise<ScanResult>;

  /** The tab as this device sees it, including who is pending. */
  getTab(tabId: string): Promise<TableTab | null>;

  /** Leave voluntarily. Always available, including while still pending. */
  leaveTab(input: { tabId: string; commandId: string }): Promise<void>;

  /**
   * The branch's menu with prices.
   *
   * Readable by anyone at the table, pending joiners included: prices are how
   * someone works out what their own order would cost, and hiding them from a
   * person who has not been approved yet serves nobody.
   */
  getBranchMenu(branchId: string): Promise<Menu | null>;

  /**
   * Mint (or re-mint) the invite for a tab.
   *
   * The QR and the share link carry the same token, so calling this again is a
   * refresh rather than a second invite. Idempotent on `commandId` so a double
   * tap does not churn the token out from under a guest mid-scan.
   */
  createTabInvite(input: { tabId: string; commandId: string }): Promise<TabInvite>;

  // --- Host controls ------------------------------------------------------
  /**
   * All four host actions return the whole refreshed tab rather than a partial
   * update. The participants list is small, and a screen that re-renders from
   * one authoritative object cannot drift from the server the way a locally
   * patched list can.
   *
   * @throws {NotTabHostError} the caller is not the host.
   */
  approveJoin(input: {
    tabId: string;
    participantId: string;
    commandId: string;
  }): Promise<TableTab>;
  rejectJoin(input: { tabId: string; participantId: string; commandId: string }): Promise<TableTab>;
  removeParticipant(input: {
    tabId: string;
    participantId: string;
    commandId: string;
  }): Promise<TableTab>;

  /**
   * Set one participant's permissions.
   *
   * The server rejects `canPay` without `canSeeTableTotal`; the client must
   * never send that pair. See `normalizeTabPermissions`.
   */
  setParticipantPermissions(input: {
    tabId: string;
    participantId: string;
    permissions: TabPermissions;
    commandId: string;
  }): Promise<TableTab>;

  /** The table default applied to everyone approved from now on. */
  setTabDefaultPermissions(input: {
    tabId: string;
    permissions: TabPermissions;
    commandId: string;
  }): Promise<TableTab>;

  /**
   * Raise a hand, in software. Presets only, no free text, no reply expected.
   *
   * @throws {EndpointNotWiredError} from the HTTP gateway until the backend
   * ships this endpoint. Screens must surface that rather than pretending the
   * call landed — a diner who thinks a waiter is coming and is wrong is worse
   * off than one who was told to raise a hand.
   */
  callWaiter(input: {
    tabId: string;
    reason: WaiterCallReason;
    commandId: string;
  }): Promise<WaiterCall>;

  // --- Ordering and the bill ----------------------------------------------

  /**
   * The menu with everything a diner needs before ordering.
   *
   * Separate from {@link getBranchMenu}, which is the price-only shape the
   * pending-approval screen has used since scanning shipped. This one carries
   * the ingredients, allergens, portion size, spice level and prep time that the
   * backend made required fields precisely so nobody has to ask a waiter.
   *
   * @throws {EndpointNotWiredError} until the backend ships it.
   */
  getBranchMenuDetail(branchId: string): Promise<BranchMenu | null>;

  /**
   * The tab as this participant is allowed to see it.
   *
   * The permission rule lives on the server and arrives applied: a participant
   * whose host has hidden the total gets their own lines and no aggregate at
   * all, which {@link TabMoney} makes unrepresentable as a zero.
   *
   * @throws {EndpointNotWiredError} until the backend ships it.
   */
  getDinerTab(tabId: string): Promise<DinerTabView | null>;

  /**
   * Everything that happened on the tab after `afterSequence`.
   *
   * Drives the live bill through `@yalla/realtime`'s sequence stream. An event
   * says *that* something changed; the money is refetched, never reconstructed
   * from payloads, because the arithmetic on the server is the one that is right.
   *
   * @throws {EndpointNotWiredError} until the backend ships it.
   */
  getTabEvents(input: { tabId: string; afterSequence: number }): Promise<TabEventPage>;

  /**
   * Place one order for everything in the tray.
   *
   * One call, not one per item: five items arriving as five tickets is a mess in
   * the kitchen and unreadable on the counter panel. Idempotent on
   * `clientCommandId`, so a retry after a lost response cannot double the round.
   *
   * @throws {EndpointNotWiredError} until the backend ships it.
   */
  placeOrder(command: PlaceOrderCommand): Promise<PlaceOrderResult>;

  /**
   * Who owes what, with shared items and the service charge apportioned.
   *
   * @throws {EndpointNotWiredError} until the backend ships it.
   */
  getTabShares(tabId: string): Promise<TabShares | null>;

  /**
   * The host picks how the bill will be split. Changeable until the first
   * payment lands, which the server enforces.
   *
   * @throws {NotTabHostError} the caller is not the host.
   * @throws {EndpointNotWiredError} until the backend ships it.
   */
  setSettlementMode(command: SetSettlementModeCommand): Promise<DinerTabView>;
}
