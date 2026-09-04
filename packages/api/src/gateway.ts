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
   */
  getTableAvailability(input: {
    branchId: string;
    slotUtc: string;
    partySize: number;
  }): Promise<readonly TableAvailability[]>;

  // --- Phone verification -------------------------------------------------
  /**
   * Send a 6-digit code.
   *
   * @throws {RateLimitedError} when too many codes were requested for a number.
   */
  requestPhoneCode(phoneE164: string): Promise<PhoneChallenge>;

  /**
   * Exchange a code for a verification token.
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
}
