import type { FloorPlanData } from '@yalla/floorplan/types';
import type {
  Booking,
  BookingRules,
  CreateBookingCommand,
  MyBookings,
  PhoneChallenge,
  SlotFloor,
  TableAvailability,
  VenueSummary,
  VerifiedPhone,
} from './contracts/booking';
import type { Menu } from './contracts/menu';
import type {
  CancelReservationCommand,
  ExtendHoldCommand,
  ExtendHoldOutcome,
  RegisterPushDeviceCommand,
  ReservationState,
} from './contracts/push';
import type {
  BranchMenu,
  DinerTabView,
  PlaceOrderCommand,
  PlaceOrderResult,
  SetSettlementModeCommand,
  TabEventPage,
  TabShares,
} from './contracts/ordering';
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
   * Every published venue, from `GET /api/public/venues`.
   *
   * Keyed by slug; see {@link VenueSummary}. A suspended venue or an inactive
   * branch is simply absent, exactly as it is from the public list.
   */
  listVenues(): Promise<readonly VenueSummary[]>;
  /** One venue by the id the list gave it, or `null` when it is no longer listed. */
  getVenue(venueId: string): Promise<VenueSummary | null>;

  /**
   * How far ahead and how soon a branch takes bookings.
   *
   * @returns `null` when no published branch has those slugs.
   */
  getBookingRules(input: { venueSlug: string; branchSlug: string }): Promise<BookingRules | null>;

  /** Current floor state for a branch. */
  getFloorPlan(branchId: string): Promise<FloorPlanData | null>;

  /**
   * The branch's IANA zone.
   *
   * Its own method because **no tab endpoint carries it**. `TabView` has no
   * `timeZoneId`; the only diner-reachable source is
   * `GET /api/branches/{id}/availability`, which is anonymous and returns it
   * alongside the floor. Every time a tab screen renders — a kitchen estimate,
   * a last-updated stamp — goes through this, never through the device's zone:
   * a tourist's phone on Moscow time would put an Armenian kitchen three hours
   * out.
   *
   * Cached hard by the caller. A branch does not move.
   */
  getBranchTimeZone(branchId: string): Promise<string | null>;

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

  /**
   * The room **as it will be at a slot**, with the answer for every table.
   *
   * This is what the two booking surfaces render, and it replaces the pair they
   * used to call: `getFloorPlan` for the geometry and state, plus
   * `getTableAvailability` for the overlay. `getFloorPlan` asks about *now*, so
   * a diner picking Saturday at 20:00 was shown tables greyed out for tonight's
   * walk-ins and shown as free the ones already booked at 20:00 — the exact
   * question this product exists to answer, answered about the wrong moment.
   *
   * One request, not two. The endpoint already returns the geometry alongside
   * the answer, and two calls could disagree about the room in between.
   *
   * @returns `null` when there is no such branch. A slot the branch refuses
   * outright — in the past, beyond the booking window, outside opening hours —
   * is **not** null: it comes back with `rejection` set and the room intact, so
   * a surface can say why instead of showing an empty room.
   */
  getSlotFloor(input: {
    branchId: string;
    slotUtc: string;
    partySize: number;
    timeZoneId?: string | undefined;
  }): Promise<SlotFloor | null>;

  // --- Phone verification -------------------------------------------------
  /**
   * Send a 6-digit code.
   *
   * `localeCode` is the diner's language, so the SMS arrives in it.
   *
   * @throws {RateLimitedError} when too many codes were requested for a number.
   */
  requestPhoneCode(
    phoneE164: string,
    options?: { readonly localeCode?: string | undefined },
  ): Promise<PhoneChallenge>;

  /**
   * Exchange a code for a verification token. Against the real backend this
   * is the diner sign-in: it also starts the token session.
   *
   * @throws {WrongCodeError} wrong digits; carries attempts remaining.
   * @throws {ExpiredCodeError} the challenge aged out.
   * @throws {TooManyAttemptsError} the challenge is burned.
   */
  verifyPhoneCode(input: {
    challengeId: string;
    code: string;
    localeCode?: string | undefined;
  }): Promise<VerifiedPhone>;

  // --- Booking ------------------------------------------------------------
  /**
   * Create a booking. Idempotent on `commandId`: replaying the same command
   * returns the same booking rather than making a second one.
   *
   * A party over the branch's instant-confirmation limit yields a booking with
   * status `pendingApproval` — a normal result, not an error.
   *
   * @throws {TableTakenError} someone else got there first — or somebody sat
   * down there — with the room from the 409 when it came.
   * @throws {LeadTimeExceededError} the slot became too soon while deciding.
   * @throws {BookingRejectedError} a rule refused it; carries the reason.
   * @throws {BookingBusyError} the table was locked; tap again, same command.
   */
  createBooking(command: CreateBookingCommand): Promise<Booking>;

  /** The caller's bookings, split upcoming and past by the server's own rule. */
  listBookings(): Promise<MyBookings>;
  getBooking(bookingId: string): Promise<Booking | null>;

  /**
   * Cancel a booking. Lateness is a message, not a block: cancelling late is
   * far better for the venue than a no-show. Only a booking that no longer
   * holds a table — seated, finished, already cancelled — has nothing to
   * cancel, and an already-cancelled one is reported as the success it is.
   */
  cancelBooking(bookingId: string): Promise<Booking>;

  // --- Notifications ------------------------------------------------------

  /**
   * Register this phone for push.
   *
   * Idempotent on the token, server-side: the app calls it on launch and on
   * every rotation, and a row per launch would mean one diner with a hundred
   * devices and a hundred copies of every message.
   */
  registerPushDevice(command: RegisterPushDeviceCommand): Promise<{ deviceId: string }>;

  /**
   * The current state of one booking, read when a notification lands on it.
   *
   * Deliberately narrower than {@link getBooking} — see {@link ReservationState}
   * for why the rich contract cannot be built from the wire. This one is real.
   */
  getReservationState(reservationId: string): Promise<ReservationState | null>;

  /**
   * Cancel, from the reminder's own action button.
   *
   * The whole reason the reminder exists: cancelling has to be easier than not
   * showing up. A booking that is already cancelled is reported as success —
   * see {@link CancelReservationCommand}.
   */
  cancelReservation(command: CancelReservationCommand): Promise<ReservationState>;

  /**
   * Keep the table a little longer, from the late nudge's action button.
   *
   * @throws {HoldAlreadyExtendedError} the one extension is spent.
   * @throws {HoldNotActiveError} the booking has not started, so there is no
   * held table to keep yet. Nothing was spent.
   * @throws {ExtensionsNotOfferedError} the branch does not hold tables late.
   */
  extendReservationHold(command: ExtendHoldCommand): Promise<ExtendHoldOutcome>;

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
