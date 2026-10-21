import type { DerivedTableState, FloorPlanData, FloorTable } from '../contracts/tableFloor';
import type {
  AnswerTableRequestCommand,
  AvailabilityWindowDto,
  Booking,
  BookingStatus,
  BranchPolicy,
  CreateBookingCommand,
  DaySlot,
  DaySlots,
  MyBookings,
  PhoneChallenge,
  PhoneProofChannels,
  RescheduleBookingCommand,
  SlotFloor,
  TableAvailability,
  TableUnavailableReason,
  TelegramChallenge,
  TelegramClaimResult,
  VenueSummary,
  VenueType,
  VerifiedPhone,
} from '../contracts/booking';
import type { Photo } from '../contracts/menuAdmin';
import { ADMITTED, type TabAdmission } from '../contracts/admission';
import {
  MAX_ACTIVE_BOOKINGS_PER_NUMBER,
  NO_SHOW_BLOCK,
  OTHER_VENUE_GAP_MINUTES,
  type GuestRecord,
} from '../contracts/guestRecord';
import type { ExtendHoldOutcome, ReservationState } from '../contracts/push';
import {
  BookingOverlapsOwnError,
  BookingsNotAcceptedError,
  BookingBlockedNoShowsError,
  PhoneHasActiveBookingError,
  ScanTurnedAwayError,
  TabAwaitingAdmissionError,
  CannotReportOwnReviewError,
  InvalidCredentialsError,
  ReviewNeedsVisitError,
  TooManyFavoritesError,
  PhoneNotVerifiedError,
  BookingEndedError,
  BookingNotActiveError,
  BookingNotChangeableError,
  BookingTableOccupiedError,
  BookingNotFoundError,
  BookingRejectedError,
  BookingTooEarlyError,
  TabAccessEndedError,
  ExpiredCodeError,
  FreeByRequiredError,
  HoldAlreadyExtendedError,
  HoldNotActiveError,
  LeadTimeExceededError,
  RateLimitedError,
  SmsUnavailableError,
  TableRequestClosedError,
  TableTakenError,
  TelegramUnavailableError,
  TooManyAttemptsError,
  WrongCodeError,
} from '../contracts/errors';
import type {
  OpenTabByBookingCommand,
  ScanResult,
  ScanTableCommand,
  TabInvite,
  TabParticipantChange,
  TabPermissions,
  TableTab,
  WaiterCall,
  WaiterCallReason,
} from '../contracts/tab';
import {
  MAX_TIP_PERCENT,
  type BillRequest,
  type BillRequestInput,
  type BranchMenu,
  type DinerTabView,
  type PlaceOrderResult,
  type TabEventPage,
  type TabShares,
} from '../contracts/ordering';
import { NotTabHostError } from '../contracts/errors';
import {
  clampBranchSearch,
  type BranchDetail,
  type BranchListing,
  type BranchReview,
  type BranchReviewPage,
  type BranchSearchQuery,
  type BranchRooms,
  type DinerOrder,
  type MyBranchReview,
} from '../contracts/places';
import { SessionRevokedError, ValidationError } from '../errors';
import { parseProblem } from '../problem';
import { MAX_BOOKING_NOTE } from '../contracts/booking';
import { MAX_FAVORITES, type FavoriteBranch } from '../contracts/favorites';
import {
  NOTIFICATION_PAGE_SIZE,
  type DinerNotification,
  type DinerNotificationPage,
  type NotificationPageQuery,
} from '../contracts/notifications';
import {
  MAX_MODERATION_TEXT,
  REVIEW_REPORT_REASONS,
  REVIEW_VISIT_WINDOW_DAYS,
  publicReplyAuthorName,
  type PublicReviewReply,
} from '../contracts/reviews';
import { createMockReviewStore, type MockReviewStore, type StoredReview } from './reviewStore';
import {
  APPROVAL_EXPIRED_CODE,
  EARLIER_GUEST_WINDOW_MINUTES,
  MIN_LEAD_MINUTES,
  SLOT_STEP_MINUTES,
} from '../contracts/approvals';
import { tableTiming, type SequencedBooking, type TableTiming } from './tableSequencing';
import { APPROVAL_WINDOW_MS, approvalExpiryFor, isShortNotice } from './approvalWindow';
import { invalidRequest, requireClientCommandId, validationFailed } from './problems';

/** Great-circle distance in kilometres. */
export function haversineKm(
  a: { readonly latitude: number; readonly longitude: number },
  b: { readonly latitude: number; readonly longitude: number },
): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
import type { DinerPhotoFile, DinerSignInResult } from '../contracts/dinerAccount';
import {
  ConcurrencyConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../errors';
import { branchDayKey, instantFromZonedClock, type TimeZone } from '@yalla/format';
import { localDateTime } from '../http/mapping';
import type { YallaGateway } from '../gateway';
import { PHONE_PROOF_WINDOW_MS, SEEDED_ACCOUNT, createAccountStore } from './accounts';
import { createTabWorld, type TableLocation } from './tabs';
import { createTabOrders } from './tabOrders';
import { mockBranchMenu, publishedBranchMenu, mockMenuItem, mockPhoto } from './menuDetail';
import { coversSitting, openStateFrom } from '../contracts/openState';
import { BOOKING_WINDOW_DAYS } from './publicMock';
import {
  publicBranchDetailFixtures,
  publicBranchFixtures,
  publicVenueFixtures,
} from './publicVenues';
import { publicRooms } from './roomFloors';
import { mockVenues, type Branch as MockBranch, type Venue as MockVenue } from './venues';
import {
  ON_YOUR_WAY_FEED_KIND,
  asksOnYourWay,
  onYourWayFromUtc,
  type OnMyWayResult,
  type PreOrderDraft,
  type PreOrderResult,
  type PreOrderSettingsInput,
} from '../contracts/preOrder';
import {
  createMockPreOrderBook,
  type MockPreOrderBooking,
  type MockPreOrderBranch,
} from './preOrders';

const URL_TAG = 'mock://yalla';

const DEFAULT_POLICY: BranchPolicy = {
  turnMinutes: 90,
  // The fixed rule since booking times: from ten minutes out.
  leadTimeMinutes: MIN_LEAD_MINUTES,
  instantConfirmationMaxPartySize: 6,
  freeCancellationMinutes: 120,
};

/** The server's `MaxAttempts`. Three here let a flow burn a code two tries early. */
const MAX_CODE_ATTEMPTS = 5;
const CODE_TTL_MS = 10 * 60_000;
const RESEND_AFTER_MS = 30_000;
const MAX_CODES_PER_NUMBER = 5;

/** The fixed code the mock accepts, so the flow is testable without SMS. */
const MOCK_CODE = '123456';

/** `FieldLengths.DisplayName` on the server: the longest name a tab takes. */
const DISPLAY_NAME_MAX = 100;

const DAY_MS = 24 * 60 * 60_000;

/** The server's slot spacing on a day view: every quarter hour from midnight. */
const DAY_SLOT_STEP_MINUTES = SLOT_STEP_MINUTES;

/** Where the mock-mode seed puts other guests' bookings: tomorrow evening here. */
const NEIGHBOUR_BRANCH = 'b-lumen-north';
const NEIGHBOUR_TIME = { hour: 20, minute: 0 };

/** Another guest's booking, in the mock's world: somebody the diner never sees. */
interface NeighbourBooking {
  readonly id: string;
  readonly branchId: string;
  readonly tableId: string;
  readonly startUtc: string;
  endUtc: string;
  promisedFreeByUtc: string | null;
  /** Booked in the app (asked by push) or on the web (the floor decides). */
  readonly channel: 'app' | 'web';
  readonly partySize: number;
}

/**
 * `TableShareRequest`: a later booking asking the guest before whether they
 * will have left by `freeByUtc`. The earlier side is one of the diner's own
 * bookings, another guest's, or a mark on the floor with nobody behind it.
 */
interface TableShareRequest {
  readonly id: string;
  readonly earlierId: string;
  readonly laterId: string;
  requestedStartUtc: string;
  freeByUtc: string;
  readonly createdAtUtc: string;
  /** The guest's two hours when they answer in the app; the later booking's start when the floor does. */
  readonly expiresAtUtc: string;
  /**
   * Asked of the guest in the app (push and a card on their booking), or the
   * floor's to decide after ringing them — they booked on the web, have no
   * device, or the later booking needs the floor anyway. Only the first is on
   * the earlier booking, and only the first can be answered from it.
   */
  readonly asksEarlierGuest: boolean;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
  decidedAtUtc: string | null;
  /** The command that answered it, so the same answer again is a replay. */
  answerCommandId: string | null;
  /** When a simulated earlier guest says yes, if one will. */
  answersAt: number | null;
}

/** The statuses a booking holds its table in, as the server's conflict check counts them. */
const HOLDS_TABLE: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'pendingApproval',
  'confirmed',
  'seated',
]);

/**
 * Fixture guests who scanned in signed in to an account with a photo, so a
 * seeded roster has a face on it before anybody uploads one.
 */
const SEEDED_PARTICIPANT_PHOTOS: Readonly<Record<string, Photo>> = {
  'p-nare': mockPhoto('avatar-nare'),
};

/**
 * How long before a booking the mock's reminder lands. The real one is the
 * branch's own setting; this is the mock having to pick one.
 */
const REMINDER_LEAD_MINUTES = 120;

/** A visit that counts toward writing a first review (K8). */
export interface MockVisit {
  readonly dinerUserId: string;
  readonly branchId: string;
  readonly atUtc: string;
}

interface Challenge {
  id: string;
  phoneE164: string;
  code: string;
  expiresAt: number;
  resendAt: number;
  attempts: number;
  burned: boolean;
}

/**
 * The mock, with the one handle a test needs that no screen does: the bot's
 * side of a Telegram verification. Against the real backend the bot confirms
 * a challenge; here the test does.
 */
export interface MockGateway extends YallaGateway {
  /**
   * What the Telegram bot does when the diner shares their contact: the next
   * claim of `challengeId` answers `verified` with this number. Unknown or
   * expired challenges are ignored, as the bot's press of a dead button is.
   */
  confirmTelegramVerification(challengeId: string, phoneE164: string): void;
  /**
   * What the floor does when a guest does not come: the booking is marked a
   * no-show (the venue's `POST /api/reservations/{id}/no-show`). A third
   * no-show on bookings that started within 72 hours blocks the guest for a
   * week and cancels their bookings not started yet — the staff mock is
   * another world, so tests (and mock mode) mark here.
   */
  markNoShowAsVenue(bookingId: string): void;
  /** The floor seats the party: the booking counts as "came" on the guest's record. */
  seatAsVenue(bookingId: string): void;
  /**
   * What a waiter's Admit on the floor tablet does to a tab this world holds:
   * a scan's tab waiting for a waiter may order from now on. The staff mock is
   * another world, so tests (and the simulated waiter) admit from here.
   */
  admitTabAsWaiter(tabId: string): void;
  /** A waiter's Reject: the tab closes, and the people on it are told. */
  rejectTabAsWaiter(tabId: string): void;

  // --- Pre-orders: the venue's side, for tests and mock mode (2026-10-21) ---

  /** The console's pre-order settings for a branch: on/off, minutes before, excluded dishes. */
  setPreOrderSettingsAsVenue(branchId: string, settings: PreOrderSettingsInput): void;
  /** Whether the branch takes pre-orders now: the public page's `policy.acceptsPreOrders`. */
  acceptsPreOrdersAsVenue(branchId: string): boolean;
  /** The kitchen ran out of a dish (or has it again): `isAvailable` on the menu, `availableNow` on lines. */
  setDishSoldOutAsVenue(branchId: string, menuItemId: string, soldOut: boolean): void;
  /** A waiter's "Coming → Send to kitchen": the pre-order reads `sent`, in the kitchen. */
  sendPreOrderAsVenue(bookingId: string): void;
  /** A waiter's "Not coming / no answer". */
  markPreOrderNotComingAsVenue(bookingId: string): void;

  // --- Pre-orders: the manage link's door, for the public mock ---------------
  //
  // The link is the credential: no session, no owner check. The public mock
  // resolves its token to the booking id and calls these.

  replacePreOrderByLink(
    command: PreOrderDraft & { readonly bookingId: string; readonly clientCommandId: string },
  ): Promise<PreOrderResult>;
  clearPreOrderByLink(command: {
    readonly bookingId: string;
    readonly clientCommandId: string;
  }): Promise<PreOrderResult>;
  confirmOnMyWayByLink(bookingId: string): Promise<OnMyWayResult>;
}

/** The waiter the mock acts as when it plays the floor. */
const MOCK_WAITER_ID = 'staff-mock-waiter';
/** …and their name, as a sent pre-order names whoever sent it. */
const MOCK_WAITER_NAME = 'Davit';

/** A pending Telegram challenge: the bot has not confirmed it yet. */
interface TelegramPending {
  expiresAt: number;
  polls: number;
  /** The number the bot confirmed, once it has. */
  phoneE164: string | null;
}

/** The number the mock bot "shares" when the dev UI lets it confirm itself. */
const MOCK_TELEGRAM_PHONE = '+37477123456';
/** The mock's bot. The real one is the backend's to name. */
const MOCK_TELEGRAM_BOT = 'yalla_mock_bot';
/** The mock's poll cadence; the server sends its own. */
const TELEGRAM_POLL_MS = 1500;
/** How many polls the self-confirming mock waits before "the bot" answers. */
const TELEGRAM_AUTO_CONFIRM_AFTER_POLLS = 2;

export interface MockGatewayOptions {
  /** Injectable clock so tests are deterministic. */
  readonly now?: () => Date;
  /**
   * Let a Telegram challenge confirm itself after two polls, so the flow can
   * be walked in the mock-mode UI with no bot. Off in tests, which confirm
   * through {@link MockGateway.confirmTelegramVerification} instead.
   */
  readonly simulateTelegramConfirm?: boolean;
  /**
   * Which ways of proving a number this backend has on, as
   * `GET /api/auth/diner/phone-proof` would say. Both when absent. A channel
   * switched off refuses as the server does: `requestPhoneCode` with
   * `SmsUnavailableError` (the 503 `sms-unavailable`), the Telegram start with
   * `TelegramUnavailableError` (no route at all).
   */
  readonly phoneProofChannels?:
    { readonly sms?: boolean | undefined; readonly telegram?: boolean | undefined } | undefined;
  /** Simulated latency in ms, so loading states are visible in the harness. */
  readonly latencyMs?: number;
  /**
   * Force the next `createBooking` to lose the race, for exercising the 409
   * path without needing a second device.
   */
  readonly simulateTableTaken?: boolean;
  /**
   * Let a guest turn up on a tab you host a few seconds after you open it, so
   * the host controls have something to approve on a single device.
   */
  readonly simulateJoiners?: boolean;
  /**
   * Play the floor for a bill asked for from the pay sheet: a waiter
   * acknowledges it a few seconds later, then takes the cash — the amount and
   * the tip the request named — and closes the tab once nothing is left, so
   * "on its way", the acknowledgement and the receipt's tip row can all be
   * walked on one phone. Follows `simulateJoiners` when absent.
   */
  readonly simulateWaiter?: boolean;
  /**
   * The review store, shared with a console mock so a review written here can
   * be moderated there and a takedown there drops it from the list here. A
   * fresh, empty one when absent. See `reviewStore.ts`.
   */
  readonly reviews?: MockReviewStore;
  /**
   * Visits beyond the ones this gateway watches happen (a seated booking of the
   * diner's). Absent: the seeded account visited Lumen North ten days ago, so
   * writing a review is walkable from the seed.
   */
  readonly visits?: readonly MockVisit[];
  /**
   * How long the floor has to answer a short-notice booking, in the mock.
   * Fifteen minutes, as on the server, when absent; shorter for walking the
   * expiry in the mock-mode app without waiting a quarter of an hour.
   */
  readonly approvalWindowMs?: number | undefined;
  /**
   * Play the floor: the **first** short-notice request this world sees is
   * approved this many milliseconds after it was made, and every later one is
   * left to run out — so the success screen's countdown can be walked to both
   * of its endings in one session. Absent, nobody answers and every one runs
   * out. Mock only.
   */
  readonly simulateVenueApprovalAfterMs?: number | undefined;
  /**
   * A floor that says yes to every short-notice request the moment it lands:
   * such a booking comes back confirmed, as one for another day does. For the
   * tests of what happens to a same-day booking once it is confirmed — the
   * table at arrival, the reminder, the tab — which are not about the asking.
   */
  readonly floorApprovesAtOnce?: boolean | undefined;
  /**
   * Fill tomorrow evening at Northern Avenue with other guests' bookings —
   * every offered table at 20:00, booked alternately in the app and on the web
   * — so the booking screen's struck, requestable and cut-short times can be
   * walked in mock mode. Off unless asked: every test reads an empty evening.
   */
  readonly seedNeighbourBookings?: boolean | undefined;
  /**
   * Northern Avenue as a venue that finished its listing: a cuisine, a price
   * level, about text, a website, amenities and a gallery
   * (`publicBranchDetailFixtures`), and two dozen published reviews, a few
   * answered by the venue — so the public page's header, gallery, reviews and
   * "see all" paging can be walked in mock mode. Off unless asked: every test
   * reads a bare, unreviewed branch. The reviews are ignored when `reviews` is
   * passed.
   */
  readonly showcase?: boolean | undefined;
  /**
   * Another guest who booked in the app answers a request for their table:
   * yes, this many milliseconds after it is made. Absent, nobody answers and
   * the request runs out after two hours. Mock only.
   */
  readonly simulateEarlierGuestAnswerAfterMs?: number | undefined;
  /**
   * The seed the booking codes are minted from. Random when absent, as the
   * server's `ReservationCode.Generate` is: two worlds started fresh must not
   * hand out the same code (QA F6). The persistence layer records the seed it
   * drew and passes it back, so a replayed world keeps the codes it issued.
   */
  readonly codeSeed?: number | undefined;
  /**
   * Play the floor for a scan with no proved number: a waiter lets the table
   * order this many milliseconds after the scan opened its tab. Absent, nobody
   * comes — tests admit through {@link MockGateway.admitTabAsWaiter}.
   */
  readonly simulateAdmissionAfterMs?: number | undefined;
  /** What that waiter decides: admit (the default) or turn the tab away. */
  readonly simulateAdmissionOutcome?: 'admit' | 'reject' | undefined;
  /**
   * What this device's diner has on record from before this world — added to
   * what the world's own bookings count (guest record, 2026-10-20). Mock mode
   * seeds a record so the bookings screen has something to say.
   */
  readonly guestRecord?:
    | {
        readonly came?: number | undefined;
        readonly noShows?: number | undefined;
        readonly lateCancellations?: number | undefined;
        readonly unmarked?: number | undefined;
      }
    | undefined;
  /** This device's diner is blocked for no-shows until then (ISO UTC). */
  readonly blockedUntilUtc?: string | undefined;
  /**
   * Pre-orders (2026-10-21): each named branch's settings, as its console
   * saved them, and the dishes its kitchen ran out of. A branch not named
   * takes the server's default — **off**, 30 minutes, nothing excluded — so a
   * world that does not ask has no pre-orders on offer anywhere.
   */
  readonly preOrders?:
    { readonly branches?: Readonly<Record<string, MockPreOrderBranch>> | undefined } | undefined;
  /**
   * The branch setting: a scan with no proved number waits for a waiter. True
   * when absent, as the server's default; false lets such scans order at once
   * (`notRequired`).
   */
  readonly unverifiedScansNeedAdmission?: boolean | undefined;
}

/** The end and promise of a sitting: the turn, cut to a promise when it is sooner. */
function promiseAt(
  slot: Date,
  promise: string | null,
  turnMinutes: number,
): { readonly endUtc: string; readonly promisedFreeByUtc: string | null } {
  const natural = slot.getTime() + turnMinutes * 60_000;
  const end = promise !== null ? Math.min(natural, Date.parse(promise)) : natural;
  return { endUtc: new Date(end).toISOString(), promisedFreeByUtc: promise };
}

/** Two instants the same moment, however each was written. */
function sameInstant(a: string | null | undefined, b: string): boolean {
  return typeof a === 'string' && Date.parse(a) === Date.parse(b);
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

/**
 * The alphabet the server generates a booking code from — `ReservationCode`.
 *
 * No `0`, `1`, `I`, `L` or `O`: the code gets read aloud at a door. The mock
 * used to mint six *digits*, which contain two characters the server's alphabet
 * excludes — so a mock booking code was a shape no real booking could have, and
 * anything that told a booking code from another kind of code by its shape was
 * untestable here.
 */
const BOOKING_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const BOOKING_CODE_LENGTH = 6;

function reservationCode(seed: number): string {
  let h = Math.imul((seed >>> 0) + 1, 0x9e3779b1) >>> 0;
  let out = '';
  for (let i = 0; i < BOOKING_CODE_LENGTH; i += 1) {
    out += BOOKING_ALPHABET[h % BOOKING_ALPHABET.length] ?? BOOKING_ALPHABET[0];
    h = Math.imul(h ^ (h >>> 7), 0x01000193) >>> 0;
  }
  return out;
}

/** A code as somebody typed it, in the form it is stored — the server's rule. */
function normaliseBookingCode(input: string): string {
  return input.replace(/[\s\p{Pd}]+/gu, '').toUpperCase();
}

/**
 * How long before a booking the branch starts holding its table back.
 *
 * The real number is the branch's own walk-in holdback and the server sends the
 * exact instant it produces, in `context.earliestUtc`. This is the mock having
 * to pick one, not the client knowing it — no screen computes this.
 */
const WALK_IN_HOLDBACK_MINUTES = 30;

export function createMockGateway(options: MockGatewayOptions = {}): MockGateway {
  const options_ = options;
  const now = options.now ?? (() => new Date());
  const latency = options.latencyMs ?? 0;
  const proofChannels: PhoneProofChannels = {
    sms: options.phoneProofChannels?.sms ?? true,
    telegram: options.phoneProofChannels?.telegram ?? true,
  };

  // Mutable in-memory state. A real backend owns all of this.
  const floors = new Map<string, FloorPlanData>();
  const bookings = new Map<string, Booking>();

  /**
   * The pre-orders on this world's bookings (2026-10-21): what the guest
   * chose, what the floor did, the branches' settings — the state derived on
   * every read, as the server derives it. The menu is the diner menu
   * (complete dishes), read when asked.
   */
  const preOrders = createMockPreOrderBook({
    now,
    menu: (branchId) => {
      const type = venueTypeFor(branchId);
      return type ? publishedBranchMenu(mockBranchMenu(branchId, type)) : null;
    },
    branches: options.preOrders?.branches,
  });

  /** A booking as the pre-order book reads it. */
  function preOrderBooking(booking: Booking): MockPreOrderBooking {
    return {
      id: booking.id,
      branchId: booking.branchId,
      status: booking.status,
      startUtc: booking.slotUtc,
      endUtc: booking.endUtc,
    };
  }

  /** The diner's own booking — somebody else's answers 404, as for a move. */
  function ownBooking(url: string, bookingId: string): Booking {
    requireVerifiedPhone(url);
    const booking = bookings.get(bookingId);
    const owner = booking ? (bookingOwners.get(booking.id) ?? null) : null;
    if (!booking || (owner !== null && owner !== signedInAccountId)) {
      throw new NotFoundError({ url });
    }
    return booking;
  }

  /** The booking behind a manage link: the link is the credential. */
  function linkedBooking(url: string, bookingId: string): Booking {
    const booking = bookings.get(bookingId);
    if (!booking) throw new NotFoundError({ url });
    return booking;
  }
  /** pushToken -> deviceId. Idempotent on the token, as the server is. */
  const pushDevices = new Map<string, string>();
  /** reservationId -> the one extension it is allowed, and what claimed it. */
  const holdExtensions = new Map<
    string,
    { readonly clientCommandId: string; readonly outcome: ExtendHoldOutcome }
  >();

  /**
   * A booking narrowed to what the wire actually carries.
   *
   * The mock holds the richer `Booking`; `ReservationView` has six fewer fields
   * (see `contracts/push.ts`). Narrowing here rather than returning the whole
   * thing keeps the mock honest about what a real notification landing can read.
   */
  function toReservationState(booking: Booking): ReservationState {
    const local = localDateTime(booking.slotUtc, booking.timeZoneId);
    return {
      reservationId: booking.id,
      code: booking.code,
      status: booking.status,
      branchId: booking.branchId,
      branchName: booking.branchName,
      tableLabel: booking.tableLabel,
      partySize: booking.partySize,
      startUtc: booking.slotUtc,
      endUtc: booking.endUtc,
      localDate: local.date,
      localStartTime: local.time,
      timeZoneId: booking.timeZoneId,
      cancelledAtUtc: booking.cancelledAtUtc,
      cancelledAfterDeadline: booking.cancelledAfterDeadline,
    };
  }
  const challenges = new Map<string, Challenge>();
  const codesPerNumber = new Map<string, number[]>();
  const telegramChallenges = new Map<string, TelegramPending>();

  /**
   * The accounts, and who is signed in on this device.
   *
   * The real gateway keeps no such thing — the session does, and the server
   * reads the token — but the mock has no token, so "who is `/me`" has to be
   * remembered here. Set by register, login and a passed code; `null` until.
   */
  const accounts = createAccountStore({ now });
  let signedInAccountId: string | null = null;
  /**
   * When this session proved the phone — a passed code or a Telegram claim —
   * or null for a password sign-in. The server carries it on the access token
   * as `phone_proved_at`; the mock has no token, so the session keeps it.
   */
  let sessionPhoneProvedAt: number | null = null;
  /** The server's rule for that proof: ten minutes, and not from the future. */
  function phoneProvedRecently(): boolean {
    const t = now().getTime();
    const proved = sessionPhoneProvedAt;
    return proved !== null && proved <= t + 60_000 && t - proved <= PHONE_PROOF_WINDOW_MS;
  }
  /**
   * Accounts deleted on this device (K2). The mock has no token to revoke, so a
   * session still pointing at one of these answers as the server answers a
   * revoked token, until somebody signs in again.
   */
  const deletedAccounts = new Set<string>();

  /** The signed-in account's id, or the 401 `/api/diner/me` answers a stranger. */
  /**
   * The server's booking gate for password accounts: a signed-in account whose
   * number has not been confirmed by code may not book or open a tab from a
   * booking. A device that only ever verified by code has no unverified account,
   * so it is never refused here.
   */
  function requireVerifiedPhone(url: string): void {
    if (!signedInAccountId) return;
    const profile = accounts.profile(signedInAccountId);
    if (profile && !profile.phoneVerified) throw new PhoneNotVerifiedError({ url });
  }

  // --- Tab admission, the number rules, the guest record (2026-10-20) ------

  /** bookingId -> the proved number the number rules key it on. */
  const bookerPhones = new Map<string, string>();
  /** tabId -> whether it may order yet. Absent: admitted, as every tab before admission. */
  const admissions = new Map<string, TabAdmission>();
  /** When a waiter last turned this phone's scan away: the next half hour of scans is refused. */
  let turnedAwayAt: number | null = null;
  /** A scan from a phone a waiter turned away is refused for this long. */
  const TURNED_AWAY_MS = 30 * 60_000;
  /**
   * Guest key -> when their no-show block ends. The guest is the signed-in
   * account, or this device's diner when nobody is (`DEVICE_GUEST`).
   */
  const blocks = new Map<string, number>();
  const DEVICE_GUEST = 'device';
  /** bookingId -> the guest it counts for in the record and the block. */
  function guestOf(bookingId: string): string {
    return bookingOwners.get(bookingId) ?? DEVICE_GUEST;
  }
  function callerGuest(): string {
    return signedInAccountId ?? DEVICE_GUEST;
  }
  /** Mock mode's seeded block: whoever this world's diner is, signed in or not. */
  const seededBlock = options.blockedUntilUtc ? Date.parse(options.blockedUntilUtc) : undefined;
  function blockOf(guest: string): number | undefined {
    return blocks.get(guest) ?? seededBlock;
  }

  /** The proved number the rules key on: the account's, or the one the web door proved. */
  function numberOf(command: CreateBookingCommand): string | null {
    const profile = signedInAccountId ? accounts.profile(signedInAccountId) : null;
    if (profile) return profile.phoneE164;
    const typed = command.guestPhone.replace(/[\s\-()]/gu, '');
    return typed === '' ? null : typed;
  }

  /** Whether this session's account proved its number: a scan by it is let in at once. */
  function scannerIsProved(): boolean {
    const profile = signedInAccountId ? accounts.profile(signedInAccountId) : null;
    return profile?.phoneVerified === true;
  }

  /** Pending or confirmed, and not over. */
  function isActiveBooking(booking: Booking): boolean {
    return (
      (booking.status === 'pendingApproval' || booking.status === 'confirmed') &&
      Date.parse(booking.endUtc) > now().getTime()
    );
  }

  /** `localStartTime` "19:30" and the day, as the server names a booking in a refusal. */
  function heldOf(booking: Booking) {
    const local = localDateTime(booking.slotUtc, booking.timeZoneId);
    return {
      reservationId: booking.id,
      code: booking.code,
      startUtc: booking.slotUtc,
      localDate: local.date,
      localStartTime: local.time,
      venueName: booking.venueName ?? '',
      branchName: booking.branchName,
    };
  }

  /**
   * At most three active bookings per proved number, at any venue
   * (`phone-has-active-booking`). The refusal names the caller's earliest own
   * one; a legacy booking made without proof never holds the number.
   */
  function refuseFourthActiveBooking(url: string, phone: string | null): void {
    if (!phone) return;
    const held = [...bookings.values()]
      .filter(
        (entry) =>
          bookerPhones.get(entry.id) === phone &&
          isActiveBooking(entry) &&
          entry.phoneUnverified !== true,
      )
      .sort((a, b) => Date.parse(a.slotUtc) - Date.parse(b.slotUtc));
    if (held.length < MAX_ACTIVE_BOOKINGS_PER_NUMBER) return;
    const own = held.find((entry) => guestOf(entry.id) === callerGuest());
    throw new PhoneHasActiveBookingError({
      url,
      maxActiveBookings: MAX_ACTIVE_BOOKINGS_PER_NUMBER,
      held: own ? heldOf(own) : null,
    });
  }

  /** Blocked for no-shows: no booking and no change until the block ends (403). */
  function refuseWhileBlocked(url: string): void {
    const until = blockOf(callerGuest());
    if (until !== undefined && until > now().getTime()) {
      throw new BookingBlockedNoShowsError({ url, blockedUntilUtc: new Date(until).toISOString() });
    }
  }

  /**
   * The guest's record, as the server counts it: their own bookings whose
   * start came within the last twelve months, never a legacy booking made
   * without proof. Came — seated or completed; no-show; a late cancel of
   * theirs; a confirmed one nobody marked counts as booked only. A venue's
   * cancel or decline, a cancel in good time and a pending one count nowhere.
   */
  function guestRecordOf(guest: string): GuestRecord {
    const t = now().getTime();
    const since = t - 365 * 24 * 3_600_000;
    let came = options.guestRecord?.came ?? 0;
    let noShows = options.guestRecord?.noShows ?? 0;
    let late = options.guestRecord?.lateCancellations ?? 0;
    let unmarked = options.guestRecord?.unmarked ?? 0;
    for (const booking of bookings.values()) {
      if (guestOf(booking.id) !== guest || booking.phoneUnverified === true) continue;
      const start = Date.parse(booking.slotUtc);
      if (start > t || start <= since) continue;
      if (booking.status === 'seated' || booking.status === 'completed') came += 1;
      else if (booking.status === 'noShow') noShows += 1;
      else if (booking.status === 'cancelledByDiner' && booking.cancelledAfterDeadline) late += 1;
      else if (booking.status === 'confirmed') unmarked += 1;
    }
    const booked = came + noShows + late + unmarked;
    const until = blockOf(guest);
    return {
      booked,
      came,
      noShows,
      lateCancellations: late,
      unmarked,
      isNewGuest: booked === 0,
      blockedUntilUtc: until !== undefined && until > t ? new Date(until).toISOString() : null,
    };
  }

  /**
   * The venue marks a booking as a no-show. Three no-shows on bookings that
   * started within the last 72 hours block the guest for a week: every booking
   * of theirs not started yet is cancelled (as the venue's, `noShowBlock`) and
   * one feed entry says so. A block in force is not made again.
   */
  function markNoShow(bookingId: string): void {
    const booking = bookings.get(bookingId);
    if (!booking || booking.status === 'noShow') return;
    bookings.set(bookingId, { ...booking, status: 'noShow' });
    const guest = guestOf(bookingId);
    const t = now().getTime();
    noShowsMarked.set(bookingId, t);
    // The guest is told about each one (review round).
    noShowNotices.push({ guest, bookingId, atUtc: new Date(t).toISOString() });
    const windowStart = t - NO_SHOW_BLOCK.windowHours * 3_600_000;
    // What counts toward the block (review round): marked after the start
    // plus the grace, after the guest's last block ended, at most one per
    // venue and day.
    const counted = new Set<string>();
    for (const entry of bookings.values()) {
      const start = Date.parse(entry.slotUtc);
      const marked = noShowsMarked.get(entry.id);
      if (
        guestOf(entry.id) !== guest ||
        entry.status !== 'noShow' ||
        entry.phoneUnverified === true ||
        marked === undefined ||
        marked < start + NO_SHOW_GRACE_MS ||
        start <= windowStart ||
        start > t ||
        start <= (blockEnded.get(guest) ?? 0)
      ) {
        continue;
      }
      counted.add(
        `${entry.venueName ?? entry.branchId}|${localDateTime(entry.slotUtc, entry.timeZoneId).date}`,
      );
    }
    const recent = counted.size;
    const inForce = (blockOf(guest) ?? 0) > t;
    if (recent < NO_SHOW_BLOCK.threshold || inForce) return;
    const until = t + NO_SHOW_BLOCK.blockDays * 24 * 3_600_000;
    blocks.set(guest, until);
    const at = new Date(t).toISOString();
    let cancelledCount = 0;
    for (const entry of [...bookings.values()]) {
      if (guestOf(entry.id) !== guest || Date.parse(entry.slotUtc) <= t) continue;
      if (entry.status !== 'pendingApproval' && entry.status !== 'confirmed') continue;
      bookings.set(entry.id, {
        ...entry,
        status: 'cancelledByVenue',
        cancelledAtUtc: at,
        cancelledAfterDeadline: false,
        cancelledBecause: 'noShowBlock',
        awaitingApprovalBecause: null,
        approvalExpiresAtUtc: null,
      });
      withdrawRequestsFor(entry.id);
      cancelledCount += 1;
    }
    blockNotices.push({
      guest,
      atUtc: at,
      blockedUntilUtc: new Date(until).toISOString(),
      cancelledCount,
    });
  }
  /** bookingId -> when the venue marked it a no-show. */
  const noShowsMarked = new Map<string, number>();
  /** Guest -> when their last block ended: no-shows before it never count again. */
  const blockEnded = new Map<string, number>();
  /** A no-show counts toward the block only when marked after the start and the grace. */
  const NO_SHOW_GRACE_MS = 15 * 60_000;
  /** Each no-show's own feed entry, written when the guest's feed is next read. */
  const noShowNotices: {
    readonly guest: string;
    readonly bookingId: string;
    readonly atUtc: string;
  }[] = [];
  /** The block's one feed entry per block, written into the guest's feed when it is next read. */
  const blockNotices: {
    readonly guest: string;
    readonly atUtc: string;
    readonly blockedUntilUtc: string;
    readonly cancelledCount: number;
  }[] = [];

  /** A waiter let the table order: the tab's stream says so, and ordering opens. */
  /** A waiter's Reject: the tab closes, the people on it are told, the phone is turned away. */
  function turnAway(tabId: string): void {
    if (admissions.get(tabId)?.status !== 'awaiting') return;
    const at = now().toISOString();
    admissions.set(tabId, {
      status: 'rejected',
      admittedBecause: null,
      decidedAtUtc: at,
      decidedByStaffId: MOCK_WAITER_ID,
      tableFreed: true,
    });
    const tab = world.get(tabId);
    if (tab) {
      orders.record(tab, 'tabAdmissionRejected', 'staff', {
        byStaffId: MOCK_WAITER_ID,
        atUtc: at,
        tableFreed: true,
      });
    }
    world.close(tabId);
    turnedAwayAt = now().getTime();
  }

  function admitTab(tabId: string, because: 'waiter' | 'booker'): void {
    const current = admissions.get(tabId);
    if (current?.status !== 'awaiting') return;
    const at = now().toISOString();
    admissions.set(tabId, {
      status: 'admitted',
      admittedBecause: because,
      decidedAtUtc: at,
      decidedByStaffId: because === 'waiter' ? MOCK_WAITER_ID : null,
      tableFreed: null,
    });
    const tab = world.get(tabId);
    if (tab) {
      orders.record(tab, 'tabAdmitted', because === 'waiter' ? 'staff' : 'diner', {
        admittedBecause: because === 'waiter' ? 1 : 4,
        byStaffId: because === 'waiter' ? MOCK_WAITER_ID : null,
        atUtc: at,
      });
    }
  }

  /** The admission a new tab gets: let in at once by a proved scanner, waiting otherwise. */
  function admitOnOpen(tabId: string, because: 'scan' | 'booker'): void {
    if (admissions.has(tabId)) return;
    const at = now().toISOString();
    if (
      because === 'booker' ||
      scannerIsProved() ||
      options.unverifiedScansNeedAdmission === false
    ) {
      admissions.set(tabId, {
        status: 'admitted',
        admittedBecause:
          because === 'booker' ? 'booker' : scannerIsProved() ? 'verifiedHost' : 'notRequired',
        decidedAtUtc: at,
        decidedByStaffId: null,
        tableFreed: null,
      });
      return;
    }
    admissions.set(tabId, {
      status: 'awaiting',
      admittedBecause: null,
      decidedAtUtc: null,
      decidedByStaffId: null,
      tableFreed: null,
    });
    // Mock mode: a waiter comes over and lets the table in — or, to walk
    // that screen, turns it away.
    if (options.simulateAdmissionAfterMs !== undefined) {
      setTimeout(
        () =>
          options.simulateAdmissionOutcome === 'reject'
            ? turnAway(tabId)
            : admitTab(tabId, 'waiter'),
        options.simulateAdmissionAfterMs,
      );
    }
  }

  function admissionOf(tabId: string): TabAdmission {
    return admissions.get(tabId) ?? ADMITTED;
  }

  function me(): string {
    const url = `${URL_TAG}/api/diner/me`;
    if (!signedInAccountId) throw new UnauthorizedError({ url });
    if (deletedAccounts.has(signedInAccountId)) {
      throw new SessionRevokedError({
        url,
        problem: {
          type: 'about:blank',
          title: 'Session revoked',
          status: 401,
          detail: 'This session has ended.',
          code: 'session-revoked',
          traceId: 'mock',
        },
      });
    }
    return signedInAccountId;
  }

  /** Signed in: the tokens the server would issue, with the mock's own strings. */
  function signIn(accountId: string, isNewAccount: boolean): DinerSignInResult {
    signedInAccountId = accountId;
    // A new session proves nothing about the phone until the code paths say so.
    sessionPhoneProvedAt = null;
    return {
      accessToken: `at_${accountId}_${sequence++}`,
      refreshToken: `rt_${accountId}_${sequence++}`,
      expiresInSeconds: 900,
      dinerUserId: accountId,
      isNewAccount,
    };
  }

  /** A name to seed the mock photo from, whichever shape the file came in. */
  function photoSeed(file: DinerPhotoFile): string {
    return 'uri' in file
      ? file.name
      : 'name' in file && typeof file.name === 'string'
        ? file.name
        : 'blob';
  }
  /** commandId -> bookingId. This is what makes createBooking idempotent. */
  const commandLog = new Map<string, string>();
  /**
   * Reschedule command id -> booking id: a replay answers the booking as it
   * stands, the server's `ProcessedCommands`, rather than moving it again.
   */
  const rescheduleLog = new Map<string, string>();
  let simulateTakenOnce = options.simulateTableTaken ?? false;
  let sequence = 1;

  /**
   * Where the next booking code comes from. Seeded per world — randomly unless
   * told — and stepped past any code this world already issued, which is the
   * server's unique index on `Reservations.Code` as a loop.
   */
  let codeState = options.codeSeed ?? Math.floor(Math.random() * 0x7fffffff);
  function mintBookingCode(): string {
    for (;;) {
      codeState = (Math.imul(codeState, 1103515245) + 12345) >>> 0;
      const code = reservationCode(codeState);
      if (![...bookings.values()].some((booking) => booking.code === code)) return code;
    }
  }

  for (const venue of mockVenues) {
    for (const branch of venue.branches) {
      // With the branch's name on it, as the staff floor endpoint sends it,
      // so a screen holding only the room can still say where it is (QA F14).
      floors.set(branch.id, { ...structuredClone(branch.floor), branchName: branch.name });
    }
  }

  // --- Booking times: other guests, and requests for a table -------------------

  const neighbours: NeighbourBooking[] = [];
  const tableRequests = new Map<string, TableShareRequest>();
  let tableRequestSequence = 1;

  /** Every offered table at the seed branch, booked for 20:00 tomorrow by somebody else. */
  function seedNeighbours(): void {
    const found = findBranch(NEIGHBOUR_BRANCH);
    const floor = floors.get(NEIGHBOUR_BRANCH);
    if (!found || !floor) return;
    const zone = found.branch.timeZoneId as TimeZone;
    const tomorrow = branchDayKey(new Date(now().getTime() + DAY_MS), zone);
    const [year, month, day] = tomorrow.split('-').map(Number) as [number, number, number];
    const start = instantFromZonedClock({ year, month, day, ...NEIGHBOUR_TIME }, zone);
    offeredTables(floor).forEach((table, index) => {
      neighbours.push({
        id: `nb-${table.id}`,
        branchId: NEIGHBOUR_BRANCH,
        tableId: table.id,
        startUtc: start.toISOString(),
        endUtc: new Date(start.getTime() + DEFAULT_POLICY.turnMinutes * 60_000).toISOString(),
        promisedFreeByUtc: null,
        channel: index % 2 === 0 ? 'app' : 'web',
        partySize: 2,
      });
    });
  }
  if (options.seedNeighbourBookings) seedNeighbours();

  /**
   * The booking's own view of a pending request for its table, or `null` —
   * and whether it is itself waiting on a guest before's own answer, read off
   * the question it has open rather than kept beside it to go stale.
   */
  function withRequest(booking: Booking): Booking {
    const request = [...tableRequests.values()].find(
      (entry) =>
        entry.earlierId === booking.id && entry.status === 'pending' && entry.asksEarlierGuest,
    );
    const asking = booking.status === 'pendingApproval' ? openRequestOf(booking.id) : null;
    return {
      ...booking,
      // The pre-order, the editor's window and "on my way" — only those with a value.
      ...preOrders.fields(preOrderBooking(booking)),
      awaitsEarlierGuestAnswer: asking?.asksEarlierGuest ?? false,
      incomingTableRequest: request
        ? {
            requestId: request.id,
            requestedStartUtc: request.requestedStartUtc,
            freeByUtc: request.freeByUtc,
            expiresAtUtc: request.expiresAtUtc,
          }
        : null,
    };
  }

  /** The start of whatever the sequencing named as the booking before. */
  function previousStart(table: FloorTable, previousId: string): string | null {
    return (
      liveOnTable(table).find((booking) => booking.id === previousId)?.startUtc ??
      table.nextReservationStartUtc
    );
  }

  /**
   * Whether the guest before can be asked in the app: one of the diner's own
   * bookings, or another guest's made in the app. One booked on the web — or
   * a mark on the floor with nobody behind it — is rung by the floor.
   */
  function reachableInApp(earlierId: string): boolean {
    if (bookings.has(earlierId)) return true;
    return neighbours.find((entry) => entry.id === earlierId)?.channel === 'app';
  }

  /**
   * Whether the guest before answers a requestable table themselves, in the
   * app: they can be reached there and nothing else about the later booking
   * needs a human. Otherwise the floor rings them and decides.
   */
  function answersInApp(
    timing: TableTiming,
    input: { readonly partySize: number; readonly slotUtc: string; readonly timeZoneId: string },
  ): boolean {
    if (timing.kind !== 'requestable') return false;
    const floorAnyway = decideApproval(input).status !== 'confirmed';
    return !floorAnyway && reachableInApp(timing.previousId);
  }

  /**
   * A requestable table on another day: the later booking waits for an answer
   * for two hours, never past its own start or the guest before's — theirs in
   * the app when {@link answersInApp}, otherwise the floor's after ringing
   * them (reservations.md §3e). Today the floor decides instead, by the
   * short-notice rule: `null` then.
   */
  function earlierGuestDecision(
    table: FloorTable,
    timing: TableTiming,
    slotUtc: string,
    timeZoneId: string,
  ): Pick<Booking, 'status' | 'awaitingApprovalBecause' | 'approvalExpiresAtUtc'> | null {
    if (timing.kind !== 'requestable') return null;
    if (isShortNotice({ startUtc: slotUtc, timeZoneId, now: now() })) return null;
    const window = now().getTime() + EARLIER_GUEST_WINDOW_MINUTES * 60_000;
    const before = previousStart(table, timing.previousId);
    return {
      status: 'pendingApproval',
      awaitingApprovalBecause: 'earlierGuestConsent',
      approvalExpiresAtUtc: new Date(
        Math.min(window, Date.parse(slotUtc), before ? Date.parse(before) : window),
      ).toISOString(),
    };
  }

  /**
   * Ask the guest before: the request behind an `earlierGuestConsent` booking.
   * Theirs to answer in the app, or the floor's; open until the later booking's
   * window closes either way.
   */
  function askEarlierGuest(later: Booking, timing: TableTiming): void {
    if (timing.kind !== 'requestable') return;
    const asksEarlierGuest = answersInApp(timing, later);
    const neighbour = neighbours.find((entry) => entry.id === timing.previousId);
    const simulated = options.simulateEarlierGuestAnswerAfterMs;
    const id = `tr-${String(tableRequestSequence++).padStart(4, '0')}`;
    tableRequests.set(id, {
      id,
      earlierId: timing.previousId,
      laterId: later.id,
      requestedStartUtc: later.slotUtc,
      freeByUtc: timing.freeByUtc,
      createdAtUtc: now().toISOString(),
      expiresAtUtc: later.approvalExpiresAtUtc ?? later.slotUtc,
      asksEarlierGuest,
      status: 'pending',
      decidedAtUtc: null,
      answerCommandId: null,
      answersAt:
        asksEarlierGuest && neighbour?.channel === 'app' && simulated !== undefined
          ? now().getTime() + simulated
          : null,
    });
  }

  /** The question a waiting booking has open, if any. */
  function openRequestOf(laterId: string): TableShareRequest | null {
    return (
      [...tableRequests.values()].find(
        (request) => request.laterId === laterId && request.status === 'pending',
      ) ?? null
    );
  }

  /**
   * One diner, two bookings at once at the same branch — refused, as the
   * server's 409 `reservation-overlaps-own`: a signed-in diner's sitting — the
   * full turn from its start — may not overlap one of their own live bookings
   * there, which end where they are stored to (a promise cuts them). Sittings
   * that only touch do not overlap. The booking being moved is not counted
   * against itself. Nobody signed in, nothing to compare with.
   */
  function refuseOverlapWithOwn(
    url: string,
    branchId: string,
    slot: Date,
    turnMinutes: number,
    movingId?: string,
  ): void {
    const accountId = signedInAccountId;
    if (!accountId) return;
    const start = slot.getTime();
    const end = start + turnMinutes * 60_000;
    // At another branch the two need the way between them (guest record, 2026-10-20).
    const gap = OTHER_VENUE_GAP_MINUTES * 60_000;
    const held = [...bookings.values()].find((entry) => {
      if (
        entry.id === movingId ||
        !HOLDS_TABLE.has(entry.status) ||
        bookingOwners.get(entry.id) !== accountId
      ) {
        return false;
      }
      const margin = entry.branchId === branchId ? 0 : gap;
      return Date.parse(entry.slotUtc) < end + margin && start - margin < Date.parse(entry.endUtc);
    });
    if (!held) return;
    throw new BookingOverlapsOwnError({
      url,
      existingReservationId: held.id,
      existingCode: held.code,
      localDate: localDateTime(held.slotUtc, held.timeZoneId).date,
      localStartTime: localDateTime(held.slotUtc, held.timeZoneId).time,
      tableLabel: held.tableLabel,
      venueName: held.venueName ?? null,
      branchName: held.branchName,
    });
  }

  /** The bookings only asking for this one's table: left out of judging its own change. */
  function askersOf(earlierId: string): ReadonlySet<string> {
    return new Set(
      [...tableRequests.values()]
        .filter((request) => request.earlierId === earlierId && request.status === 'pending')
        .map((request) => request.laterId),
    );
  }

  /**
   * The guest before changed (moved, cancelled, declined): each booking waiting
   * on them is judged again with the earlier booking where it now is. Still
   * the booking before within three hours: the question stands. Free now: the
   * request is withdrawn and the booking decided again without it — confirmed
   * when nothing else needs a human. Another booking now runs into it: the
   * floor decides, with no clock. Crowded out: that guest's no — declined.
   */
  function rejudgeAskersOf(earlierId: string, atUtc: string): void {
    for (const request of [...tableRequests.values()]) {
      if (request.earlierId !== earlierId || request.status !== 'pending') continue;
      const later = bookings.get(request.laterId);
      if (
        !later ||
        later.status !== 'pendingApproval' ||
        later.awaitingApprovalBecause !== 'earlierGuestConsent'
      ) {
        request.status = 'withdrawn';
        request.decidedAtUtc = atUtc;
        continue;
      }
      const table = floors.get(later.branchId)?.tables.find((entry) => entry.id === later.tableId);
      if (!table) continue;
      const timing = timingAt(table, new Date(later.slotUtc), later.id);
      if (timing.kind === 'requestable' && timing.previousId === earlierId) continue;
      if (timing.kind === 'refused') {
        decideTableRequest(request, false, atUtc);
        continue;
      }
      request.status = 'withdrawn';
      request.decidedAtUtc = atUtc;
      if (timing.kind === 'requestable') {
        bookings.set(later.id, { ...later, approvalExpiresAtUtc: null });
        continue;
      }
      const decided = decideApproval({
        partySize: later.partySize,
        slotUtc: later.slotUtc,
        timeZoneId: later.timeZoneId,
      });
      // At short notice it is left as it is; otherwise decided again without the question.
      if (decided.awaitingApprovalBecause === 'shortNotice') continue;
      if (decided.status === 'confirmed') changeOrigins.delete(later.id);
      bookings.set(later.id, { ...later, ...decided });
      if (decided.status === 'confirmed') {
        venueDecisions.set(later.id, { approved: true, atUtc, change: null });
      }
    }
  }

  /** Requests for a booking that moved or stopped waiting are let go. */
  function withdrawRequestsFor(laterId: string): void {
    for (const request of tableRequests.values()) {
      if (request.laterId === laterId && request.status === 'pending') request.status = 'withdrawn';
    }
  }

  /**
   * The guest before answered. Yes confirms the later booking and cuts the
   * earlier one to the promise; no declines the later one — or gives a change
   * its old slot back, as a declined short-notice change does.
   */
  function decideTableRequest(request: TableShareRequest, accept: boolean, atUtc: string): void {
    request.status = accept ? 'accepted' : 'declined';
    request.decidedAtUtc = atUtc;

    const later = bookings.get(request.laterId);
    if (later && later.status === 'pendingApproval') {
      const original = changeOrigins.get(later.id);
      changeOrigins.delete(later.id);
      if (accept) {
        bookings.set(later.id, {
          ...later,
          status: 'confirmed',
          awaitingApprovalBecause: null,
          approvalExpiresAtUtc: null,
        });
        venueDecisions.set(later.id, { approved: true, atUtc, change: null });
      } else if (original && originalSlotFree(original)) {
        bookings.set(later.id, {
          ...original,
          status: 'confirmed',
          awaitingApprovalBecause: null,
          approvalExpiresAtUtc: null,
          declinedBecause: null,
        });
        venueDecisions.set(later.id, {
          approved: false,
          atUtc,
          change: { originalKept: true, requestedSlotUtc: later.slotUtc },
        });
        moveFloorMark(later, original);
      } else {
        bookings.set(later.id, {
          ...later,
          status: 'cancelledByVenue',
          awaitingApprovalBecause: null,
          approvalExpiresAtUtc: null,
          declinedBecause: 'earlierGuestDeclined',
          cancelledAtUtc: atUtc,
        });
        venueDecisions.set(later.id, {
          approved: false,
          atUtc,
          change: original ? { originalKept: false, requestedSlotUtc: later.slotUtc } : null,
        });
        moveFloorMark(later, null);
      }
    }

    if (!accept) return;
    const earlier = bookings.get(request.earlierId);
    // The promise is recorded; the end is cut to it only when it is sooner.
    const cutTo = (end: string) =>
      new Date(Math.min(Date.parse(end), Date.parse(request.freeByUtc))).toISOString();
    if (earlier) {
      bookings.set(earlier.id, {
        ...earlier,
        endUtc: cutTo(earlier.endUtc),
        promisedFreeByUtc: request.freeByUtc,
      });
    }
    const neighbour = neighbours.find((entry) => entry.id === request.earlierId);
    if (neighbour) {
      neighbour.endUtc = cutTo(neighbour.endUtc);
      neighbour.promisedFreeByUtc = request.freeByUtc;
    }
  }

  /**
   * Before every call, the floor's answers catch up with the clock: a
   * short-notice request the simulated floor approves, or one whose window
   * closed with nobody answering. On the call rather than on a timer, so a
   * frozen test clock and a replayed journal see exactly what the original
   * world saw.
   */
  const wait = () => {
    settleApprovals();
    return latency > 0 ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve();
  };

  // --- The floor's answer to a short-notice booking -----------------------------

  const approvalWindowMs = options.approvalWindowMs ?? APPROVAL_WINDOW_MS;
  /** How many requests the simulated floor will still approve. One, or none. */
  let venueApprovalsLeft = options.simulateVenueApprovalAfterMs !== undefined ? 1 : 0;
  /** Booking id -> when the simulated floor approves it. */
  const venueApproves = new Map<string, number>();
  /**
   * Booking id -> what the floor decided and when, for the feed. A declined
   * change says what became of the booking it was a change of.
   */
  const venueDecisions = new Map<
    string,
    {
      readonly approved: boolean;
      readonly atUtc: string;
      readonly change: {
        readonly originalKept: boolean;
        readonly requestedSlotUtc: string;
      } | null;
    }
  >();
  /**
   * Booking id -> the confirmed booking a short-notice change was made from.
   * The server keeps the slot a confirmed booking had while its change waits
   * for the floor, and gives it back if the change is not confirmed and the
   * slot is still free.
   */
  const changeOrigins = new Map<string, Booking>();

  /**
   * How a new or moved booking starts out, by the server's rules in its order.
   *
   * Short notice first: a booking for the branch's today, or within six hours,
   * waits for the floor with a window — whatever its size, because the window
   * is what the floor has to see. Then the large-party rule, which waits with
   * no clock. Everything else is confirmed.
   */
  function decideApproval(input: {
    readonly partySize: number;
    readonly slotUtc: string;
    readonly timeZoneId: string;
  }): Pick<Booking, 'status' | 'awaitingApprovalBecause' | 'approvalExpiresAtUtc'> {
    const at = now();
    const shortNotice = isShortNotice({
      startUtc: input.slotUtc,
      timeZoneId: input.timeZoneId,
      now: at,
    });
    if (shortNotice && !options.floorApprovesAtOnce) {
      return {
        status: 'pendingApproval',
        awaitingApprovalBecause: 'shortNotice',
        approvalExpiresAtUtc: approvalExpiryFor(at, input.slotUtc, approvalWindowMs),
      };
    }
    if (input.partySize > DEFAULT_POLICY.instantConfirmationMaxPartySize) {
      return {
        status: 'pendingApproval',
        awaitingApprovalBecause: 'largeParty',
        approvalExpiresAtUtc: null,
      };
    }
    return { status: 'confirmed', awaitingApprovalBecause: null, approvalExpiresAtUtc: null };
  }

  /** The simulated floor takes the first short-notice request it is offered. */
  function offerToFloor(booking: Booking): void {
    if (booking.awaitingApprovalBecause !== 'shortNotice' || venueApprovalsLeft === 0) return;
    venueApprovalsLeft -= 1;
    venueApproves.set(booking.id, now().getTime() + (options.simulateVenueApprovalAfterMs ?? 0));
  }

  function settleApprovals(): void {
    const t = now().getTime();
    // A simulated guest before says yes, inside the window; a request whose
    // booking stopped waiting is let go.
    for (const request of tableRequests.values()) {
      if (request.status !== 'pending') continue;
      const later = bookings.get(request.laterId);
      if (
        !later ||
        later.status !== 'pendingApproval' ||
        later.awaitingApprovalBecause !== 'earlierGuestConsent'
      ) {
        request.status = 'withdrawn';
        continue;
      }
      if (
        request.answersAt !== null &&
        request.answersAt <= t &&
        request.answersAt < Date.parse(request.expiresAtUtc)
      ) {
        decideTableRequest(request, true, new Date(request.answersAt).toISOString());
      }
    }
    for (const booking of bookings.values()) {
      if (booking.status !== 'pendingApproval' || !booking.approvalExpiresAtUtc) continue;
      const closesAt = Date.parse(booking.approvalExpiresAtUtc);
      const approvesAt = venueApproves.get(booking.id);

      if (approvesAt !== undefined && approvesAt <= t && approvesAt < closesAt) {
        venueApproves.delete(booking.id);
        changeOrigins.delete(booking.id);
        bookings.set(booking.id, {
          ...booking,
          status: 'confirmed',
          awaitingApprovalBecause: null,
          approvalExpiresAtUtc: null,
        });
        venueDecisions.set(booking.id, {
          approved: true,
          atUtc: new Date(approvesAt).toISOString(),
          change: null,
        });
      } else if (t >= closesAt) {
        venueApproves.delete(booking.id);
        const original = changeOrigins.get(booking.id);
        changeOrigins.delete(booking.id);
        const at = booking.approvalExpiresAtUtc;
        // The guest before did not answer in their two hours: the request lapses
        // with the booking, which says so in its own words. The floor letting
        // its own two hours to ring them run out is the venue's "no answer".
        const earlierGuest =
          booking.awaitingApprovalBecause === 'earlierGuestConsent' &&
          (openRequestOf(booking.id)?.asksEarlierGuest ?? false);
        for (const request of tableRequests.values()) {
          if (request.laterId === booking.id && request.status === 'pending') {
            request.status = 'expired';
            request.decidedAtUtc = at;
          }
        }

        // A change nobody answered: the booking goes back to the slot it had,
        // confirmed, when that slot is still free — the server's rule.
        if (original && originalSlotFree(original)) {
          bookings.set(booking.id, {
            ...original,
            status: 'confirmed',
            awaitingApprovalBecause: null,
            approvalExpiresAtUtc: null,
            declinedBecause: null,
          });
          venueDecisions.set(booking.id, {
            approved: false,
            atUtc: at,
            change: { originalKept: true, requestedSlotUtc: booking.slotUtc },
          });
          moveFloorMark(booking, original);
          continue;
        }

        // Nobody answered: declined, for want of an answer, at the window's close.
        bookings.set(booking.id, {
          ...booking,
          status: 'cancelledByVenue',
          awaitingApprovalBecause: null,
          approvalExpiresAtUtc: null,
          declinedBecause: earlierGuest ? 'earlierGuestNoAnswer' : 'noAnswer',
          cancelledAtUtc: at,
        });
        venueDecisions.set(booking.id, {
          approved: false,
          atUtc: at,
          change: original ? { originalKept: false, requestedSlotUtc: booking.slotUtc } : null,
        });
        moveFloorMark(booking, null);
      }
    }
  }

  /** Whether the slot a change was made from is still the booking's to have back. */
  function originalSlotFree(original: Booking): boolean {
    const table = floors.get(original.branchId)?.tables.find((t) => t.id === original.tableId);
    if (!table) return false;
    return stateAt(table, new Date(original.slotUtc), DEFAULT_POLICY, original.id) === 'free';
  }

  /** A booking's mark comes off the table it was on, and onto the one it is back on. */
  function moveFloorMark(from: Booking, to: Booking | null): void {
    const floor = floors.get(from.branchId);
    if (!floor) return;
    floors.set(from.branchId, {
      ...floor,
      tables: floor.tables.map((table) => {
        if (to && table.id === to.tableId) {
          return { ...table, state: 'reservedSoon', nextReservationStartUtc: to.slotUtc };
        }
        if (table.id === from.tableId && table.nextReservationStartUtc === from.slotUtc) {
          return { ...table, state: 'free', nextReservationStartUtc: null };
        }
        return table;
      }),
    });
  }

  /**
   * The tab side of the mock backend, sharing this instance's floors so a table
   * taken out of service is out of service for scanning too.
   */
  /** Which kind of place a branch is, for picking its menu. */
  const venueTypeFor = (branchId: string): VenueType | undefined =>
    mockVenues.find((venue) => venue.branches.some((branch) => branch.id === branchId))?.type;

  /**
   * Which account each place on a tab was taken with, `tabId:participantId` →
   * account id. The server links a participant to the diner whose token the
   * scan carried; the roster's photo is that account's.
   */
  const participantAccounts = new Map<string, string>();

  /** This device's place on the tab, linked to whoever is signed in on it. */
  function linkParticipant(tab: TableTab): void {
    if (signedInAccountId && !deletedAccounts.has(signedInAccountId)) {
      participantAccounts.set(`${tab.id}:${tab.yourParticipantId}`, signedInAccountId);
    }
  }

  /**
   * A participant's photo by the server's rule: the profile photo of the
   * account they scanned in with, when that account still exists and has one.
   */
  function participantPhoto(tabId: string, participantId: string): Photo | null {
    const accountId = participantAccounts.get(`${tabId}:${participantId}`);
    if (accountId === undefined) return SEEDED_PARTICIPANT_PHOTOS[participantId] ?? null;
    if (deletedAccounts.has(accountId)) return null;
    return accounts.profile(accountId)?.photo ?? null;
  }

  /**
   * Ordering and the bill, beside the tab world rather than inside it.
   *
   * One instance, shared by every screen this gateway serves, so a diner and a
   * waiter reading the same tab read the same lines and the same total.
   */
  const orders = createTabOrders({
    now: () => new Date(),
    menuItem: (branchId, itemId) => {
      const type = venueTypeFor(branchId);
      return type ? mockMenuItem(branchId, type, itemId) : undefined;
    },
    branchMenu: (branchId) => {
      const type = venueTypeFor(branchId);
      return type ? mockBranchMenu(branchId, type) : null;
    },
    participantPhoto,
  });

  const world = createTabWorld({
    now,
    simulateJoiners: options.simulateJoiners ?? true,
    // As `TabService` writes it: the participant event's members, the status
    // as its wire number. The host's phone refetches the roster off it.
    onJoinRequested: (tab, participantId) => {
      const person = tab.participants.find((entry) => entry.id === participantId);
      if (!person) return;
      orders.record(tab, 'participantJoined', 'diner', {
        participantId: person.id,
        displayName: person.displayName,
        status: 1, // ParticipantStatus.PendingApproval
        canOrder: person.permissions.canOrder,
        canSeeTableTotal: person.permissions.canSeeTableTotal,
        canPay: person.permissions.canPay,
      });
    },
    allTableIds: () => [...floors.values()].flatMap((floor) => floor.tables.map((t) => t.id)),
    locate: (tableId): TableLocation | null => {
      for (const venue of mockVenues) {
        for (const branch of venue.branches) {
          const table = floors.get(branch.id)?.tables.find((t) => t.id === tableId);
          if (!table) continue;
          return {
            venueId: venue.id,
            venueName: venue.name,
            branchId: branch.id,
            branchName: branch.name,
            timeZoneId: branch.timeZoneId,
            table,
          };
        }
      }
      return null;
    },
  });

  /** The tab as this device reads it — what `GET /api/tabs/{id}` answers. */
  function dinerViewOf(tab: TableTab): DinerTabView {
    orders.ensure(tab.id, tab.branchId);
    return orders.dinerView(tab, tab.yourParticipantId, admissionOf(tab.id));
  }

  /** One participant, as a host action left them — `TabParticipantView`. */
  function changeOf(tab: TableTab, participantId: string): TabParticipantChange {
    const person = tab.participants.find((entry) => entry.id === participantId);
    if (!person) throw new NotFoundError({ url: `${URL_TAG}/api/tabs/${tab.id}` });
    return {
      participantId: person.id,
      displayName: person.displayName ?? '',
      role: person.role,
      status:
        person.status === 'active'
          ? 'approved'
          : person.status === 'pending'
            ? 'pendingApproval'
            : 'removed',
      permissions: person.permissions,
    };
  }

  /**
   * A tab this device can still read, or the refusal the server gives a token
   * that is no longer good for it: taken off, turned away, or left.
   */
  function readableTab(tabId: string): TableTab | null {
    const tab = world.get(tabId);
    if (!tab) return null;
    if (
      tab.yourStatus === 'removed' ||
      tab.yourStatus === 'rejected' ||
      tab.yourStatus === 'left'
    ) {
      throw new TabAccessEndedError({ url: `${URL_TAG}/api/tabs/${tabId}`, tabId, status: 403 });
    }
    return tab;
  }

  /**
   * The amounts on a bill request, as the server works them out (diner design
   * gaps, `BillQuote.For`): the scope's balance with the service charge and
   * without the tip, and the tip on the unpaid part of the items (`quoteBill`).
   * The rules first, in the server's order — only with the bill, a whole
   * percent from 0 to 25 — then the whole bill only for somebody shown the
   * table total (a 403 otherwise, the server's `TabPermissionException`), then
   * a scope with nothing left to pay is refused naming `billScope`.
   */
  function billRequestFor(
    tabId: string,
    reason: WaiterCallReason,
    input: BillRequestInput,
  ): BillRequest {
    const url = `${URL_TAG}/api/tabs/${tabId}/service-requests`;
    if (reason !== 'bill') {
      throw validationFailed(url, [
        { field: 'billScope', message: 'Only a request for the bill takes a scope and a tip.' },
      ]);
    }
    if (
      !Number.isInteger(input.tipPercent) ||
      input.tipPercent < 0 ||
      input.tipPercent > MAX_TIP_PERCENT
    ) {
      throw validationFailed(url, [
        {
          field: 'tipPercent',
          message: `A tip is a whole percent from 0 to ${MAX_TIP_PERCENT}.`,
          bound: 'range',
          min: 0,
          max: MAX_TIP_PERCENT,
        },
      ]);
    }
    const tab = readableTab(tabId);
    if (!tab) throw new NotFoundError({ url });
    if (input.scope === 'whole' && !orders.seesTableTotal(tab, tab.yourParticipantId)) {
      throw new ForbiddenError({
        url,
        problem: {
          type: 'about:blank',
          title: 'Forbidden',
          status: 403,
          detail: 'Asking for the whole bill requires somebody who can see the table total.',
          code: 'forbidden',
          traceId: 'mock',
          context: {
            operation: 'Asking for the whole bill',
            requirement: 'somebody who can see the table total',
          },
        },
      });
    }
    const { amountDram, tipDram } = orders.billQuote(
      tab,
      tab.yourParticipantId,
      input.scope,
      input.tipPercent,
    );
    if (amountDram <= 0) {
      throw validationFailed(url, [{ field: 'billScope', message: 'Nothing left to pay.' }]);
    }
    return { scope: input.scope, amountDram, tipPercent: input.tipPercent, tipDram };
  }

  /** The wire's `ServiceRequestPreset`, for the `serviceRequested` event's payload. */
  const SERVICE_PRESET: Readonly<Record<WaiterCallReason, 1 | 2 | 3 | 4>> = {
    napkins: 1,
    water: 2,
    bill: 3,
    other: 4,
  };

  /** How long a mock waiter takes to see a bill request, and then to settle it. */
  const WAITER_ACKNOWLEDGES_AFTER_MS = 5_000;
  const WAITER_SETTLES_AFTER_MS = 12_000;
  const simulateWaiter = options.simulateWaiter ?? options.simulateJoiners ?? true;
  /** Bill requests the mock waiter has already taken the cash for. */
  const servedCalls = new Set<string>();

  /**
   * The floor, played by the mock (`simulateWaiter`): run before every read of
   * a tab and every scan, the way the simulated joiner is run on reads.
   *
   * A bill request from the pay sheet is acknowledged a few seconds after it
   * was raised — the `serviceRequestAcknowledged` event the phone watches for
   * — and a few seconds later the waiter takes the cash: what the request
   * named, never more than the scope still owes, credited to the requester on
   * "my share" and to the table on the whole bill, with the tip beside it.
   * Once nothing is left the tab closes, the table is free for the next scan,
   * and the phone reads the receipt. A request replaced by a newer one is
   * never served.
   *
   * Every tab, not only the one read: a reload replays the journal, which
   * holds the scans and the requests but not the reads that served them, so
   * a scan has to find the floor already served or it would land back on a
   * tab about to close.
   */
  function serveFloor(): void {
    if (!simulateWaiter) return;
    const waiting = new Set(
      world
        .calls()
        .filter((call) => call.reason === 'bill' && call.bill && !servedCalls.has(call.id))
        .map((call) => call.tabId),
    );
    for (const tabId of waiting) serveTable(tabId);
  }

  function serveTable(tabId: string): void {
    const tab = world.get(tabId);
    if (!tab || tab.status !== 'open') return;
    const at = now().getTime();

    for (const entry of world.floorCalls(tabId)) {
      const { call } = entry;
      if (call.reason !== 'bill' || !call.bill || entry.supersededAtUtc !== null) continue;
      if (servedCalls.has(call.id)) continue;
      const age = at - Date.parse(call.requestedAtUtc);

      if (age >= WAITER_ACKNOWLEDGES_AFTER_MS && world.acknowledgeCall(call.id)) {
        orders.record(tab, 'serviceRequestAcknowledged', 'staff', { serviceRequestId: call.id });
      }
      if (age < WAITER_SETTLES_AFTER_MS) continue;

      servedCalls.add(call.id);
      const requester = entry.requestedByParticipantId;
      const owed = orders.billQuote(tab, requester, call.bill.scope, 0).amountDram;
      const amountDram = Math.min(call.bill.amountDram, owed, orders.remaining(tab));
      if (amountDram > 0) {
        orders.pay(
          tab,
          amountDram,
          call.bill.tipDram,
          call.bill.scope === 'mine' ? requester : null,
        );
      }
      if (orders.remaining(tab) <= 0) {
        world.close(tabId);
        orders.record(tab, 'tabClosed', 'staff', null);
        return;
      }
    }
  }

  /** A 409 whose `message` is the server's sentence and whose `code` is its slug. */
  function conflict(url: string, code: string, detail: string): ConcurrencyConflictError {
    return new ConcurrencyConflictError({
      url,
      problem: {
        type: 'about:blank',
        title: 'Conflicting state',
        status: 409,
        detail,
        code,
        traceId: 'mock',
      },
    });
  }

  function findBranch(branchId: string): { venue: MockVenue; branch: MockBranch } | null {
    for (const venue of mockVenues) {
      const branch = venue.branches.find((b) => b.id === branchId);
      if (branch) return { venue, branch };
    }
    return null;
  }

  /**
   * A venue as `/api/public/venues` would publish it, or `null` when it would
   * not appear at all.
   *
   * Four rules, each the server's:
   * - keyed by the venue's **slug** — the card carries no venue id;
   * - a branch that is not live (suspended) is **left out**, and a venue with
   *   nothing left is left out with it;
   * - open-now comes from the branch's **week of hours at this gateway's
   *   clock**, not from instants frozen on the day the fixtures were written —
   *   on every other day those read every venue as closed;
   * - the free count is **bookable** tables nobody is at, the same set the
   *   server counts, so a bar stool out of the booking pool is not "free".
   */
  function toVenueSummary(venue: MockVenue): VenueSummary | null {
    const venueId = publicVenueFixtures[venue.id]?.slug ?? venue.id;
    const branches = venue.branches.flatMap((b) => {
      const fixture = publicBranchFixtures[b.id];
      if (!fixture || fixture.status !== 'live') return [];
      const floor = floors.get(b.id);
      return [
        {
          id: b.id,
          slug: fixture.slug,
          venueId,
          venueName: venue.name,
          name: b.name,
          addressLine: fixture.addressLine,
          timeZoneId: b.timeZoneId,
          openState: openStateFrom(fixture.weeklyHours, now(), b.timeZoneId),
          freeTables: floor
            ? floor.tables.filter((t) => t.state === 'free' && t.isBookable).length
            : b.freeTables,
        },
      ];
    });
    return branches.length > 0
      ? { id: venueId, name: venue.name, type: venue.type, branches }
      : null;
  }

  function publishedVenues(): readonly VenueSummary[] {
    return mockVenues.flatMap((venue) => {
      const summary = toVenueSummary(venue);
      return summary ? [summary] : [];
    });
  }

  /**
   * Every booked start on a table: the floor's own mark — a fixture's booking,
   * or the last one this mock took there — and every booking this mock holds
   * on it.
   *
   * `excludeBookingId` is left out, both the booking and the mark it left: the
   * server's `excludeReservationId`, so a diner moving their own booking does
   * not collide with it. The mark alone used to be the whole answer, which
   * forgot a table's earlier booking the moment a later one was made.
   */
  function liveOnTable(table: FloorTable, excludeBookingId?: string): SequencedBooking[] {
    const excluded = excludeBookingId ? bookings.get(excludeBookingId) : undefined;
    const live: SequencedBooking[] = [];
    const starts = new Set<number>();
    for (const booking of bookings.values()) {
      if (booking.tableId !== table.id || booking.id === excludeBookingId) continue;
      if (!HOLDS_TABLE.has(booking.status)) continue;
      live.push({
        id: booking.id,
        startUtc: booking.slotUtc,
        endUtc: booking.endUtc,
        promisedFreeByUtc: booking.promisedFreeByUtc ?? null,
      });
      starts.add(Date.parse(booking.slotUtc));
    }
    // Other guests' bookings, from the mock-mode seed.
    for (const neighbour of neighbours) {
      if (neighbour.tableId !== table.id) continue;
      live.push({
        id: neighbour.id,
        startUtc: neighbour.startUtc,
        endUtc: neighbour.endUtc,
        promisedFreeByUtc: neighbour.promisedFreeByUtc,
      });
      starts.add(Date.parse(neighbour.startUtc));
    }
    // The mark a fixture or the floor left: a booking nobody here can name.
    const mark = table.nextReservationStartUtc;
    if (
      mark &&
      !starts.has(Date.parse(mark)) &&
      !(excluded?.tableId === table.id && excluded.slotUtc === mark)
    ) {
      live.push({
        id: `mark-${table.id}`,
        startUtc: mark,
        endUtc: new Date(Date.parse(mark) + DEFAULT_POLICY.turnMinutes * 60_000).toISOString(),
        promisedFreeByUtc: null,
      });
    }
    return live;
  }

  /**
   * Where a start sits among the table's bookings — the rules in
   * `tableSequencing.ts` — and one more the server keeps: one question to one
   * guest at a time. While another booking is asking the guest before, the
   * table is refused at those times (`EarlierGuestBeingAsked`).
   */
  function timingAt(
    table: FloorTable,
    slot: Date,
    excludeBookingId?: string,
    leaveOut: ReadonlySet<string> = new Set(),
  ): TableTiming {
    const live = liveOnTable(table, excludeBookingId)
      .filter((booking) => !leaveOut.has(booking.id))
      .map((booking) => ({
        ...booking,
        isBeingAsked: [...tableRequests.values()].some(
          (request) =>
            request.status === 'pending' &&
            request.earlierId === booking.id &&
            request.laterId !== excludeBookingId,
        ),
      }));
    return tableTiming({
      startUtc: slot.toISOString(),
      turnMinutes: DEFAULT_POLICY.turnMinutes,
      bookings: live,
    });
  }

  /** Derive the window for one table at a slot. */
  function windowFor(
    table: FloorTable,
    slotUtc: string,
    policy: BranchPolicy,
    excludeBookingId?: string,
  ): AvailabilityWindowDto {
    // Only a booking that starts *after* the requested slot bounds it. One
    // earlier in the day is behind the diner and bounds nothing.
    const slot = Date.parse(slotUtc);
    const next =
      liveOnTable(table, excludeBookingId)
        .map((booking) => booking.startUtc)
        .filter((start) => Date.parse(start) > slot)
        .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;
    if (!next) {
      // No later booking. This is a real advantage and the UI says so.
      return {
        fromUtc: slotUtc,
        untilUtc: null,
        nextBookingStartUtc: null,
        minutes: null,
        isShorterThanTurnTime: false,
      };
    }
    const minutes = minutesBetween(new Date(slotUtc), new Date(next));
    return {
      fromUtc: slotUtc,
      untilUtc: next,
      nextBookingStartUtc: next,
      minutes,
      isShorterThanTurnTime: minutes < policy.turnMinutes,
    };
  }

  /*
   * How far ahead a slot can be and still have the *physical* state of the room
   * in its answer.
   *
   * The backend's rule, mirrored: beyond a few minutes out, "somebody is
   * sitting there" tells you nothing about the slot — they will have finished
   * and gone — so physical status is dropped entirely and only bookings decide.
   * Keeping it is what made a table occupied by tonight's walk-ins render
   * unavailable for a booking three days away.
   */
  const PHYSICAL_HORIZON_MINUTES = 20;

  /** Does the requested sitting collide with one already booked here? */
  function collidesWithBooking(
    table: FloorTable,
    slot: Date,
    _policy: BranchPolicy,
    excludeBookingId?: string,
  ): boolean {
    // Refused by the sequencing rules: inside the 90 minutes after a booking,
    // or later than 45 minutes before the next one. Requestable is not refused.
    return timingAt(table, slot, excludeBookingId).kind === 'refused';
  }

  /**
   * The table's state **at the requested slot**, not now.
   *
   * The single most important line in this mock. It used to return `table.state`
   * unchanged for every slot, which meant the fixtures answered "now" however
   * far ahead the question was — so the defect the diner surfaces had was
   * faithfully reproduced by the doubles that were supposed to catch it, and
   * five prompts of tests passed over it.
   */
  function stateAt(
    table: FloorTable,
    slot: Date,
    policy: BranchPolicy,
    excludeBookingId?: string,
  ): DerivedTableState {
    // Not a session. A table taken out of service stays out of service.
    if (table.state === 'outOfService') return 'outOfService';

    const minutesOut = minutesBetween(now(), slot);
    if (minutesOut <= PHYSICAL_HORIZON_MINUTES) {
      if (table.state === 'occupied' || table.state === 'held') return table.state;
    }

    return collidesWithBooking(table, slot, policy, excludeBookingId) ? 'reservedSoon' : 'free';
  }

  /**
   * A rule that refuses the whole request, before any table is considered.
   *
   * Reported once rather than on forty tables, and it is what a surface shows
   * instead of an empty room when somebody picks a slot that has already
   * happened.
   */
  function branchRejection(
    branchId: string,
    slot: Date,
    policy: BranchPolicy,
  ): TableUnavailableReason | null {
    const minutesOut = minutesBetween(now(), slot);
    if (minutesOut < policy.leadTimeMinutes) return 'pastLeadTime';
    if (minutesOut > BOOKING_WINDOW_DAYS * 24 * 60) return 'tooFarAhead';
    // `ReservationService.Validate`, after the timing rules: the whole sitting
    // must fall inside the branch's opening hours
    // (`ReservationRules.CheckOpeningHours`, `reservation-outside-opening-hours`,
    // which the client reads as `closed`). The mock offered 03:00 (QA F5).
    const found = findBranch(branchId);
    const fixture = publicBranchFixtures[branchId];
    if (
      found &&
      fixture &&
      !coversSitting(
        fixture.weeklyHours,
        slot,
        new Date(slot.getTime() + policy.turnMinutes * 60_000),
        found.branch.timeZoneId,
      )
    ) {
      return 'closed';
    }
    return null;
  }

  function reasonFor(
    table: FloorTable,
    state: DerivedTableState,
    partySize: number,
  ): TableUnavailableReason | null {
    if (!table.isBookable) return 'notBookable';
    if (state === 'outOfService') return 'outOfService';
    if (state === 'held') return 'held';
    // Physically occupied, which only survives projection near enough to now.
    if (state === 'occupied') return 'occupied';
    // Empty at this moment and spoken for at the one asked about. A different
    // sentence, and a different next step: pick another time, not another table.
    if (state === 'reservedSoon') return 'alreadyBooked';
    if (table.seats < partySize) return 'tooSmall';
    return null;
  }

  function availabilityFor(
    branchId: string,
    slotUtc: string,
    partySize: number,
    excludeBookingId?: string,
  ): readonly TableAvailability[] {
    return availabilityWithTiming(branchId, slotUtc, partySize, excludeBookingId).map(
      (answer) => answer.table,
    );
  }

  /** The tables' answers, each with whether it is only requestable. */
  function availabilityWithTiming(
    branchId: string,
    slotUtc: string,
    partySize: number,
    excludeBookingId?: string,
  ): readonly { readonly table: TableAvailability; readonly requestable: boolean }[] {
    const found = findBranch(branchId);
    const floor = floors.get(branchId);
    if (!found || !floor) return [];
    const shortNotice = isShortNotice({
      startUtc: slotUtc,
      timeZoneId: found.branch.timeZoneId,
      now: now(),
    });
    // The same answer for every table at this time, so asked once: the zone
    // arithmetic behind it is the slow part of a day of slots.
    const waits = needsApproval(branchId, slotUtc, partySize);
    const policy = DEFAULT_POLICY;
    const slot = new Date(slotUtc);
    const rejection = branchRejection(branchId, slot, policy);

    const freeCancellationUntilUtc = new Date(
      slot.getTime() - policy.freeCancellationMinutes * 60_000,
    ).toISOString();

    // Only tables pinned on a photo of their own room are offered, as the
    // server does: a diner books by tapping a pin.
    return offeredTables(floor).map((table) => {
      const state = stateAt(table, slot, policy, excludeBookingId);
      // A branch-level refusal applies to every table and outranks whatever the
      // table itself would have said.
      const reason = rejection ?? reasonFor(table, state, partySize);
      const timing = reason === null ? timingAt(table, slot, excludeBookingId) : null;
      const requestable = timing?.kind === 'requestable';
      return {
        requestable,
        table: {
          tableId: table.id,
          tableLabel: table.label,
          floorAreaName: table.floorAreaName,
          seats: table.seats,
          isBookable: reason === null,
          unavailableReason: reason,
          window: reason === null ? windowFor(table, slotUtc, policy, excludeBookingId) : null,
          freeCancellationUntilUtc,
          // Another day, a requestable table waits for the guest before; today
          // the short-notice rule already makes every booking wait.
          // A table that can only be asked for waits for somebody's yes.
          requiresApproval: waits || requestable,
          isRequestable: requestable,
          // Another day, the guest before is the one asked; tonight, the floor.
          requiresEarlierGuestConsent: requestable && !shortNotice,
          mustFreeByUtc: timing && timing.kind !== 'refused' ? timing.mustFreeByUtc : null,
        },
      };
    });
  }

  /**
   * Whether a booking at this slot will wait for the venue, as the server
   * says it before the diner commits: the slot is at short notice, or the
   * party is over the instant-confirmation size. One answer for the table read
   * and the day's slots, as on the server.
   */
  function needsApproval(branchId: string, slotUtc: string, partySize: number): boolean {
    if (partySize > DEFAULT_POLICY.instantConfirmationMaxPartySize) return true;
    if (options.floorApprovesAtOnce) return false;
    const timeZoneId = findBranch(branchId)?.branch.timeZoneId;
    return timeZoneId !== undefined && isShortNotice({ startUtc: slotUtc, timeZoneId, now: now() });
  }

  /** The tables a diner may be offered: pinned on a photo of their own room. */
  function offeredTables(floor: FloorPlanData): readonly FloorTable[] {
    const rooms = findBranch(floor.branchId)?.branch.rooms ?? [];
    return floor.tables.filter((table) => {
      if (!table.pin) return false;
      const room = rooms.find((candidate) => candidate.roomId === table.floorAreaId);
      return room?.photos.some((photo) => photo.photoId === table.pin?.photoId) ?? false;
    });
  }

  /** The room as it will be at the slot, drawn from the same projection. */
  function slotFloorFor(
    branchId: string,
    slotUtc: string,
    partySize: number,
    excludeBookingId?: string,
  ): SlotFloor | null {
    const floor = floors.get(branchId);
    if (!floor) return null;

    const policy = DEFAULT_POLICY;
    const slot = new Date(slotUtc);
    const tables = availabilityFor(branchId, slotUtc, partySize, excludeBookingId);
    const answers = new Map(tables.map((table) => [table.tableId, table]));

    return {
      plan: {
        ...floor,
        tables: offeredTables(floor).map((table) => ({
          ...table,
          state: stateAt(table, slot, policy, excludeBookingId),
          // The server's decision for this slot and party, not the table's
          // standing configuration — so the drawn room and the sheet agree.
          isBookable: answers.get(table.id)?.isBookable ?? false,
        })),
      },
      tables,
      rejection: branchRejection(branchId, slot, policy),
      slotUtc,
      partySize,
    };
  }

  /**
   * Why no table is free at a slot, in one word: `alreadyBooked` when bookings
   * took any of them — the reason a diner can act on, by picking another time
   * — and otherwise the reason most tables gave. The server's rule for a day
   * slot (`TableAlreadyBooked`, or the most common table reason).
   */
  function slotReason(tables: readonly TableAvailability[]): TableUnavailableReason | null {
    const counts = new Map<TableUnavailableReason, number>();
    for (const table of tables) {
      if (table.unavailableReason === null) continue;
      counts.set(table.unavailableReason, (counts.get(table.unavailableReason) ?? 0) + 1);
    }
    if (counts.has('alreadyBooked')) return 'alreadyBooked';
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  /**
   * Every half hour of one day in the branch's calendar, each answered by
   * {@link availabilityFor} — the very projection the room is drawn from, so a
   * time offered here opens a room with a free table in it and a struck one
   * opens a room with none.
   *
   * The server's shape: a time whose whole sitting does not fit one opening
   * block is left out; one that does but is too soon or too far ahead is
   * listed, unavailable, with its reason. The day carries a reason of its own
   * when there is nothing to list (shut) or when every time was refused for the
   * same request-level reason (a day in the past, a day beyond the window).
   */
  function daySlotsFor(
    branchId: string,
    date: string,
    partySize: number,
    excludeBookingId?: string,
  ): DaySlots | null {
    const found = findBranch(branchId);
    if (!found || !floors.has(branchId)) return null;

    const policy = DEFAULT_POLICY;
    const zone = found.branch.timeZoneId;
    const fixture = publicBranchFixtures[branchId];
    const [year, month, day] = date.split('-').map(Number) as [number, number, number];
    const slots: DaySlot[] = [];

    for (let minutes = 0; minutes < 24 * 60; minutes += DAY_SLOT_STEP_MINUTES) {
      const hour = Math.floor(minutes / 60);
      const minute = minutes % 60;
      const start = instantFromZonedClock({ year, month, day, hour, minute }, zone);
      const end = new Date(start.getTime() + policy.turnMinutes * 60_000);
      if (fixture && !coversSitting(fixture.weeklyHours, start, end, zone)) continue;

      const slotUtc = start.toISOString();
      const answers = availabilityWithTiming(branchId, slotUtc, partySize, excludeBookingId);
      const tables = answers.map((answer) => answer.table);
      const bookable = answers.filter((answer) => answer.table.isBookable);
      const plain = bookable.filter((answer) => !answer.requestable);
      // Only tables somebody booked shortly before: on offer, as a request.
      const requestable = bookable.length > 0 && plain.length === 0;
      // Every table on offer cut short: the latest of their times is the best one.
      const everyCut = bookable.map((answer) => answer.table.mustFreeByUtc ?? null);
      const mustFreeByUtc =
        bookable.length > 0 && everyCut.every((cut) => cut !== null)
          ? new Date(Math.max(...everyCut.map((cut) => Date.parse(cut!)))).toISOString()
          : null;
      // Read off the tables, which asked the time-level rules once already.
      const waits = plain.length > 0 ? plain[0]!.table.requiresApproval : requestable;
      slots.push({
        time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        slotUtc,
        isAvailable: bookable.length > 0,
        requiresApproval: bookable.length > 0 ? waits : needsApproval(branchId, slotUtc, partySize),
        // Free outright; the requestable ones are counted apart.
        freeTableCount: plain.length,
        unavailableReason: bookable.length > 0 ? null : slotReason(tables),
        requestable,
        requestableTableCount: bookable.length - plain.length,
        mustFreeByUtc,
      });
    }

    const requestLevel: readonly TableUnavailableReason[] = ['pastLeadTime', 'tooFarAhead'];
    const first = slots[0]?.unavailableReason ?? null;
    const wholeDay =
      slots.length === 0
        ? 'closed'
        : first !== null &&
            requestLevel.includes(first) &&
            slots.every((slot) => slot.unavailableReason === first)
          ? first
          : null;

    return {
      branchId,
      date,
      partySize,
      stepMinutes: DAY_SLOT_STEP_MINUTES,
      unavailableReason: wholeDay,
      slots,
    };
  }

  /**
   * The refusals that come before any table, as the server applies them to a
   * new booking and a moved one alike: too soon — which names the earliest
   * time that works — then every other branch-wide rule.
   */
  function refuseAtBranch(branchId: string, slot: Date, partySize: number): void {
    const policy = DEFAULT_POLICY;
    const rejection = branchRejection(branchId, slot, policy);
    if (rejection === 'pastLeadTime') {
      throw new LeadTimeExceededError({
        url: URL_TAG,
        leadTimeMinutes: policy.leadTimeMinutes,
        earliestSlotUtc: new Date(now().getTime() + policy.leadTimeMinutes * 60_000).toISOString(),
      });
    }
    if (rejection) {
      throw new BookingRejectedError({ url: URL_TAG, reason: rejection, partySize });
    }
  }

  /** Lost to somebody else: the 409, with the room at that slot as the server's carries it. */
  function tableTaken(input: {
    branchId: string;
    table: FloorTable;
    slotUtc: string;
    partySize: number;
    refusal: TableUnavailableReason | null;
    excludeBookingId?: string;
  }): TableTakenError {
    return new TableTakenError({
      url: URL_TAG,
      tableId: input.table.id,
      tableLabel: input.table.label,
      reason: input.refusal === 'occupied' ? 'occupied' : 'alreadyBooked',
      floor:
        slotFloorFor(input.branchId, input.slotUtc, input.partySize, input.excludeBookingId)
          ?.plan ?? null,
    });
  }

  // --- Places ----------------------------------------------------------------

  /**
   * Reviews live in a store a console mock can share, so a review written here
   * is moderated there. One per diner per branch, as the unique index says.
   */
  const reviewStore = options.reviews ?? createMockReviewStore({ now, showcase: options.showcase });

  /** The reply as diners read it: signed short, by the same rule as their names. */
  function publicReply(review: StoredReview): PublicReviewReply | null {
    return review.reply
      ? { ...review.reply, authorName: publicReplyAuthorName(review.reply.authorName) }
      : null;
  }

  function toPublicReview(review: StoredReview): BranchReview {
    return {
      reviewId: review.reviewId,
      authorName: review.authorName,
      rating: review.rating,
      text: review.text,
      createdAtUtc: review.createdAtUtc,
      updatedAtUtc: review.updatedAtUtc,
      edited: review.updatedAtUtc !== review.createdAtUtc,
      reply: publicReply(review),
    };
  }

  function toMyReview(review: StoredReview): MyBranchReview {
    return {
      reviewId: review.reviewId,
      branchId: review.branchId,
      rating: review.rating,
      text: review.text,
      createdAtUtc: review.createdAtUtc,
      updatedAtUtc: review.updatedAtUtc,
      publicAuthorName: review.authorName,
      hidden: review.hidden,
      reply: publicReply(review),
    };
  }

  /**
   * K9's gate: the online-bookings switch on and the reservation policy
   * reviewed. The fixture's public-page switch stands for the first; the diner
   * mock has no policy for anybody to review, so every live fixture counts as
   * reviewed, and a branch with the switch off refuses app bookings.
   */
  function acceptsAppBookings(branchId: string): boolean {
    const fixture = publicBranchFixtures[branchId];
    return fixture?.status === 'live' && fixture.acceptsWebBookings;
  }

  /** Booking id → the account that made it, for the visit rule and the feed. */
  const bookingOwners = new Map<string, string>();

  const visits: MockVisit[] = options.visits
    ? [...options.visits]
    : [
        {
          dinerUserId: SEEDED_ACCOUNT.id,
          branchId: 'b-lumen-north',
          atUtc: new Date(now().getTime() - 10 * DAY_MS).toISOString(),
        },
      ];

  /**
   * K8's eligibility: a seated or completed booking of the diner's at the
   * branch, or a visit handed in through the options, within 180 days.
   *
   * A table scan is not one, for the real gateway's reason: the scan goes out
   * with no diner token, so the server never links that participant to an
   * account. "I'm at my table" does, and it seats the booking, which counts.
   */
  function hasVisit(accountId: string, branchId: string): boolean {
    const t = now().getTime();
    const recent = (atUtc: string) => t - Date.parse(atUtc) <= REVIEW_VISIT_WINDOW_DAYS * DAY_MS;
    const seated = [...bookings.values()].some(
      (booking) =>
        booking.branchId === branchId &&
        bookingOwners.get(booking.id) === accountId &&
        (booking.status === 'seated' || booking.status === 'completed') &&
        recent(booking.slotUtc),
    );
    return (
      seated ||
      visits.some(
        (visit) =>
          visit.dinerUserId === accountId && visit.branchId === branchId && recent(visit.atUtc),
      )
    );
  }

  // --- Favourites (K11) --------------------------------------------------------

  /** accountId → branchId → when it was saved. */
  const favorites = new Map<
    string,
    Map<string, { readonly atUtc: string; readonly order: number }>
  >();
  let favoriteOrder = 0;

  function favoritesOf(accountId: string) {
    let saved = favorites.get(accountId);
    if (!saved) {
      saved = new Map();
      favorites.set(accountId, saved);
    }
    return saved;
  }

  /** A branch as the public list would show it, or `null` when it is not listed. */
  function liveListing(
    branchId: string,
    position?: BranchSearchQuery['position'],
  ): BranchListing | null {
    const found = findBranch(branchId);
    return found ? listingFor(found.venue, found.branch, position) : null;
  }

  /** Newest first; a branch that has gone inactive is left out, as the server leaves it out. */
  function favoriteList(
    accountId: string,
    position: BranchSearchQuery['position'],
  ): FavoriteBranch[] {
    return [...favoritesOf(accountId).entries()]
      .sort(([, a], [, b]) => b.atUtc.localeCompare(a.atUtc) || b.order - a.order)
      .flatMap(([branchId, entry]) => {
        const listing = liveListing(branchId, position);
        return listing ? [{ branchId, createdAtUtc: entry.atUtc, listing }] : [];
      });
  }

  // --- The notifications feed (K12) ---------------------------------------------

  const feeds = new Map<string, DinerNotification[]>();
  /** `account:review` → the review's `hideCount` its last `review-hidden` row announced. */
  const announcedHides = new Map<string, number>();
  /** `account:review` → the review's `replyCount` its last `review-replied` row announced. */
  const announcedReplies = new Map<string, number>();
  let notificationOrder = 0;

  /**
   * The diner's feed, brought up to date with what has happened — the rows the
   * server's producers would have written as it happened.
   *
   * Only what this mock can observe is produced: a reminder once a booking of
   * the diner's is within two hours of starting, and `review-hidden` once a
   * review of theirs is taken down (by a console mock sharing the store), and
   * the floor's answer to a short-notice request — the simulated approval, or
   * the window running out. The venue's other decisions and order-ready never
   * happen in the diner mock, so no row for them is invented.
   */
  function feedOf(accountId: string): DinerNotification[] {
    const feed = feeds.get(accountId) ?? [];
    feeds.set(accountId, feed);
    const t = now().getTime();
    const add = (row: Omit<DinerNotification, 'notificationId' | 'read'>) => {
      feed.push({ ...row, notificationId: `ntf-${(notificationOrder += 1)}`, read: false });
    };

    for (const booking of bookings.values()) {
      if (bookingOwners.get(booking.id) !== accountId || booking.status !== 'confirmed') continue;
      const remindAt = Date.parse(booking.slotUtc) - REMINDER_LEAD_MINUTES * 60_000;
      if (t < remindAt || t >= Date.parse(booking.endUtc)) continue;
      if (feed.some((row) => row.kind === 'booking-reminder' && row.reservationId === booking.id)) {
        continue;
      }
      add({
        kind: 'booking-reminder',
        params: {
          venueName: booking.venueName,
          branchName: booking.branchName,
          tableLabel: booking.tableLabel,
          partySize: booking.partySize,
          startUtc: booking.slotUtc,
          timeZoneId: booking.timeZoneId,
        },
        branchId: booking.branchId,
        branchName: booking.branchName,
        reservationId: booking.id,
        tabId: null,
        orderId: null,
        createdAtUtc: new Date(remindAt).toISOString(),
      });
    }

    // A no-show block: one entry for the whole block.
    for (const notice of blockNotices) {
      if (notice.guest !== accountId) continue;
      const already = feed.some(
        (row) =>
          row.kind === 'bookings-blocked-no-shows' &&
          row.params['blockedUntilUtc'] === notice.blockedUntilUtc,
      );
      if (already) continue;
      add({
        kind: 'bookings-blocked-no-shows',
        params: {
          blockedUntilUtc: notice.blockedUntilUtc,
          blockedUntilLocalDate: localDateTime(notice.blockedUntilUtc, 'Asia/Yerevan').date,
          cancelledCount: String(notice.cancelledCount),
        },
        branchId: null,
        branchName: null,
        reservationId: null,
        tabId: null,
        orderId: null,
        createdAtUtc: notice.atUtc,
      });
    }

    // Each no-show, as the venue marked it.
    for (const notice of noShowNotices) {
      const booking = bookings.get(notice.bookingId);
      if (notice.guest !== accountId || !booking) continue;
      if (feed.some((row) => row.kind === 'booking-no-show' && row.reservationId === booking.id)) {
        continue;
      }
      const local = localDateTime(booking.slotUtc, booking.timeZoneId);
      add({
        kind: 'booking-no-show',
        params: {
          venueName: booking.venueName,
          branchName: booking.branchName,
          date: local.date,
          time: local.time,
          partySize: String(booking.partySize),
          reservationCode: booking.code,
        },
        branchId: booking.branchId,
        branchName: booking.branchName,
        reservationId: booking.id,
        tabId: null,
        orderId: null,
        createdAtUtc: notice.atUtc,
      });
    }

    // "Are you on your way?" (pre-orders): 45 minutes before a booking with a
    // pre-order not sent or cancelled, the guest not having answered.
    for (const booking of bookings.values()) {
      if (bookingOwners.get(booking.id) !== accountId) continue;
      if (
        feed.some((row) => row.kind === ON_YOUR_WAY_FEED_KIND && row.reservationId === booking.id)
      ) {
        continue;
      }
      const read = withRequest(booking);
      // Not sent when a waiter already marked the party not coming (the link
      // still asks: `onYourWayAsked`).
      if (read.preOrder?.state === 'notComing') continue;
      if (!asksOnYourWay({ ...read, startUtc: booking.slotUtc }, now())) continue;
      const local = localDateTime(booking.slotUtc, booking.timeZoneId);
      add({
        kind: ON_YOUR_WAY_FEED_KIND,
        params: {
          venueName: booking.venueName,
          branchName: booking.branchName,
          date: local.date,
          time: local.time,
          partySize: String(booking.partySize),
          reservationCode: booking.code,
        },
        branchId: booking.branchId,
        branchName: booking.branchName,
        reservationId: booking.id,
        tabId: null,
        orderId: null,
        createdAtUtc: onYourWayFromUtc(booking.slotUtc),
      });
    }

    // What the floor answered a short-notice request: yes, or nobody in time.
    for (const [reservationId, decision] of venueDecisions) {
      const booking = bookings.get(reservationId);
      if (!booking || bookingOwners.get(reservationId) !== accountId) continue;
      const kind = decision.approved ? 'booking-confirmed' : 'booking-declined';
      if (feed.some((row) => row.kind === kind && row.reservationId === reservationId)) continue;
      // As the server writes them: text, and `date`/`time` the booking as it
      // now stands — back at its old slot, when a declined change kept it.
      const local = localDateTime(booking.slotUtc, booking.timeZoneId);
      const requested = decision.change
        ? localDateTime(decision.change.requestedSlotUtc, booking.timeZoneId)
        : null;
      add({
        kind,
        params: {
          venueName: booking.venueName,
          branchName: booking.branchName,
          tableLabel: booking.tableLabel,
          partySize: booking.partySize,
          startUtc: booking.slotUtc,
          timeZoneId: booking.timeZoneId,
          date: local.date,
          time: local.time,
          ...(decision.approved
            ? {}
            : {
                // The apology rather than a refusal: nobody answered in time.
                expired: 'true',
                wasChange: decision.change ? 'true' : 'false',
                originalKept: decision.change?.originalKept ? 'true' : 'false',
                ...(requested
                  ? { requestedDate: requested.date, requestedTime: requested.time }
                  : {}),
              }),
        },
        branchId: booking.branchId,
        branchName: booking.branchName,
        reservationId,
        tabId: null,
        orderId: null,
        createdAtUtc: decision.atUtc,
      });
    }

    for (const venue of mockVenues) {
      for (const branch of venue.branches) {
        const review = reviewStore.mine(branch.id, accountId);
        if (!review?.hidden || !review.hiddenAtUtc) continue;
        const hiddenAt = review.hiddenAtUtc;
        // One row per takedown, as the server writes it on the shown → hidden
        // transition only. A new reason or the platform taking over changes
        // `hiddenAtUtc` but is not a second takedown.
        const key = `${accountId}:${review.reviewId}`;
        if ((announcedHides.get(key) ?? 0) >= review.hideCount) continue;
        announcedHides.set(key, review.hideCount);
        add({
          kind: 'review-hidden',
          params: { reviewId: review.reviewId, venueName: venue.name, branchName: branch.name },
          branchId: branch.id,
          branchName: branch.name,
          reservationId: null,
          tabId: null,
          orderId: null,
          createdAtUtc: hiddenAt,
        });
      }
    }

    // The venue's first answer to a review of the diner's: one row per reply
    // written from none, never per edit. A reply taken back takes its row
    // with it while the row is unread, as the server's DELETE does.
    for (const venue of mockVenues) {
      for (const branch of venue.branches) {
        const review = reviewStore.mine(branch.id, accountId);
        if (!review) continue;
        const key = `${accountId}:${review.reviewId}`;
        if (!review.reply) {
          const unread = feed.findIndex(
            (row) =>
              row.kind === 'review-replied' &&
              !row.read &&
              row.params['reviewId'] === review.reviewId,
          );
          if (unread >= 0) feed.splice(unread, 1);
          continue;
        }
        if ((announcedReplies.get(key) ?? 0) >= review.replyCount) continue;
        announcedReplies.set(key, review.replyCount);
        add({
          kind: 'review-replied',
          params: { reviewId: review.reviewId, venueName: venue.name, branchName: branch.name },
          branchId: branch.id,
          branchName: branch.name,
          reservationId: null,
          tabId: null,
          orderId: null,
          createdAtUtc: review.reply.createdAtUtc,
        });
      }
    }

    const order = (row: DinerNotification) => Number(row.notificationId.slice(4));
    feed.sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc) || order(b) - order(a));
    return feed;
  }

  function notificationPage(
    accountId: string,
    query: NotificationPageQuery | undefined,
  ): DinerNotificationPage {
    const feed = feedOf(accountId);
    const limit = Math.min(50, Math.max(1, Math.trunc(query?.limit ?? NOTIFICATION_PAGE_SIZE)));
    const before = query?.before ?? null;
    const cursorAt = before === null ? -1 : feed.findIndex((row) => row.notificationId === before);
    // An unknown cursor is an empty page, not the first one again: starting
    // over would show the newest rows twice at the bottom of the list.
    const start = before === null ? 0 : cursorAt + 1;
    const rows = before !== null && cursorAt === -1 ? [] : feed.slice(start, start + limit);
    const more = rows.length === limit && start + limit < feed.length;
    return {
      items: rows,
      nextCursor: more ? rows[rows.length - 1]!.notificationId : null,
      unreadCount: feed.filter((row) => !row.read).length,
    };
  }

  /** The finished listing's extras, only in the showcase (see `MockGatewayOptions.showcase`). */
  function listingExtras(branchId: string) {
    return options.showcase ? publicBranchDetailFixtures[branchId] : undefined;
  }

  function listingFor(
    venue: MockVenue,
    branch: MockBranch,
    position: BranchSearchQuery['position'],
  ): BranchListing | null {
    const fixture = publicBranchFixtures[branch.id];
    if (!fixture || fixture.status !== 'live') return null;
    const own = reviewStore.visible(branch.id);
    const average =
      own.length > 0
        ? Math.round((own.reduce((sum, r) => sum + r.rating, 0) / own.length) * 10) / 10
        : null;
    const located = fixture.latitude !== null && fixture.longitude !== null;
    const floor = floors.get(branch.id);
    return {
      branchId: branch.id,
      venueId: venue.id,
      venueSlug: publicVenueFixtures[venue.id]?.slug ?? venue.id,
      branchSlug: fixture.slug,
      venueName: venue.name,
      branchName: branch.name,
      venueType: venue.type,
      cuisine: listingExtras(branch.id)?.cuisine ?? null,
      priceLevel: listingExtras(branch.id)?.priceLevel ?? null,
      address: fixture.addressLine,
      district: fixture.district,
      latitude: located ? fixture.latitude : null,
      longitude: located ? fixture.longitude : null,
      distanceKm:
        position && located
          ? Math.round(
              haversineKm(position, {
                latitude: fixture.latitude!,
                longitude: fixture.longitude!,
              }) * 10,
            ) / 10
          : null,
      timeZoneId: branch.timeZoneId,
      isOpenNow: openStateFrom(fixture.weeklyHours, now(), branch.timeZoneId).isOpen,
      freeTableCount: floor?.tables.filter((t) => t.state === 'free').length ?? 0,
      rating: average,
      reviewCount: own.length,
      badges: [],
      coverPhoto: publicVenueFixtures[venue.id]?.coverPhoto ?? null,
    };
  }

  function listings(query: BranchSearchQuery | undefined): BranchListing[] {
    // Cut as the HTTP gateway cuts it, so a long search behaves the same in mock mode.
    const needle = clampBranchSearch(query?.query).toLowerCase();
    const found = mockVenues.flatMap((venue) =>
      venue.branches.flatMap((branch) => {
        const listing = listingFor(venue, branch, query?.position);
        if (!listing) return [];
        if (query?.venueType && listing.venueType !== query.venueType) return [];
        if (needle) {
          // The district too, as the server's search now matches it.
          const haystack =
            `${listing.venueName} ${listing.branchName} ${listing.address} ${listing.district ?? ''}`.toLowerCase();
          if (!haystack.includes(needle)) return [];
        }
        return [listing];
      }),
    );
    return query?.position
      ? found.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      : found.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }

  /** The shown reviews per star, one star first, as the server counts them. */
  function starCounts(reviews: readonly { readonly rating: number }[]): number[] {
    return [1, 2, 3, 4, 5].map((stars) => reviews.filter((r) => r.rating === stars).length);
  }

  function reviewUrl(branchId: string): string {
    return `${URL_TAG}/api/diner/branches/${branchId}/review`;
  }

  return {
    async listBranches(query) {
      await wait();
      return listings(query);
    },

    async searchBranches(query) {
      await wait();
      return listings(query);
    },

    async getBranchDetail(branchId, position): Promise<BranchDetail | null> {
      await wait();
      const found = findBranch(branchId);
      const listing = found ? listingFor(found.venue, found.branch, position) : null;
      const fixture = publicBranchFixtures[branchId];
      if (!listing || !fixture) return null;
      const extras = listingExtras(branchId);
      return {
        listing,
        about: extras?.about ?? publicVenueFixtures[listing.venueId]?.description ?? null,
        websiteUrl: extras?.websiteUrl ?? null,
        phoneE164: fixture.phoneE164,
        amenities: extras?.amenities ?? [],
        specialDays: [],
        openingHours: fixture.weeklyHours.flatMap((entry) =>
          entry.blocks.map((block) => ({
            day: entry.day,
            opensAt: block.opensAt,
            closesAt: block.closesAt,
            closesNextDay: block.closesAt <= block.opensAt,
          })),
        ),
        gallery: extras?.gallery ?? [],
        tableCount: floors.get(branchId)?.tables.length ?? 0,
        acceptsWebBookings: fixture.acceptsWebBookings,
        acceptsAppBookings: acceptsAppBookings(branchId),
        // Newest first written, hidden reviews left out (K8).
        recentReviews: reviewStore.visible(branchId).slice(0, 3).map(toPublicReview),
        ratingCounts: starCounts(reviewStore.visible(branchId)),
        // The same rooms `getBranchRooms` serves, with live pins.
        rooms: found ? publicRooms(found.branch.rooms, floors.get(branchId)?.tables ?? []) : [],
        asOfUtc: now().toISOString(),
      };
    },

    async getBranchReviews({ branchId, page = 1 }): Promise<BranchReviewPage | null> {
      await wait();
      const url = `${URL_TAG}/api/public/branches/${branchId}/reviews`;
      if (!Number.isInteger(page) || page < 1) {
        throw invalidRequest(url, 'page', 'The page is 1 or more.');
      }
      if (!findBranch(branchId)) return null;
      const visible = reviewStore.visible(branchId);
      const pageSize = 20;
      const count = visible.length;
      return {
        branchId,
        rating:
          count > 0
            ? Math.round((visible.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
            : null,
        reviewCount: count,
        page,
        pageSize,
        reviews: visible.slice((page - 1) * pageSize, page * pageSize).map(toPublicReview),
        ratingCounts: starCounts(visible),
      };
    },

    async getBranchRooms(branchId): Promise<BranchRooms | null> {
      await wait();
      const found = findBranch(branchId);
      if (!found) return null;
      return {
        branchId,
        asOfUtc: now().toISOString(),
        rooms: publicRooms(found.branch.rooms, floors.get(branchId)?.tables ?? []),
      };
    },

    async getMyBranchReview(branchId) {
      await wait();
      // Asked first, so a stranger is refused even for a branch nobody reviewed.
      const accountId = me();
      const review = reviewStore.mine(branchId, accountId);
      return review ? toMyReview(review) : null;
    },

    async saveMyBranchReview({ branchId, rating, text }) {
      await wait();
      const accountId = me();
      requireVerifiedPhone(reviewUrl(branchId));
      if (!findBranch(branchId)) throw new NotFoundError({ url: reviewUrl(branchId) });
      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!Number.isInteger(rating) || rating < 1 || rating > 5 || trimmed.length > 1000) {
        throw new ValidationError({
          url: reviewUrl(branchId),
          status: 422,
          problem: parseProblem({
            type: 'validation-failed',
            title: 'Validation failed',
            status: 422,
            code: 'validation-failed',
            context: {
              fields: [
                ...(Number.isInteger(rating) && rating >= 1 && rating <= 5
                  ? []
                  : [
                      {
                        field: 'rating',
                        message: 'Rating must be 1 to 5.',
                        bound: 'range',
                        min: 1,
                        max: 5,
                      },
                    ]),
                ...(trimmed.length > 1000
                  ? [
                      {
                        field: 'text',
                        message: 'At most 1000 characters.',
                        bound: 'max',
                        max: 1000,
                      },
                    ]
                  : []),
              ],
            },
          }),
        });
      }
      // K8: a first review needs a visit; revising one never does.
      if (!reviewStore.mine(branchId, accountId) && !hasVisit(accountId, branchId)) {
        throw new ReviewNeedsVisitError({ url: reviewUrl(branchId) });
      }
      // The same stars and text again change nothing, `updatedAtUtc` included.
      const saved = reviewStore.save({
        branchId,
        dinerUserId: accountId,
        displayName: accounts.profile(accountId)?.displayName ?? null,
        rating,
        text: trimmed === '' ? null : trimmed,
        atUtc: now().toISOString(),
      });
      return toMyReview(saved);
    },

    /**
     * The server's order: the body is validated, then the review is looked up
     * (a hidden one is as good as absent), then the diner's own is refused. A
     * second report by the same diner is accepted and changes nothing.
     */
    async reportReview({ reviewId, reason, note }) {
      await wait();
      const url = `${URL_TAG}/api/diner/reviews/${reviewId}/report`;
      const accountId = me();
      const trimmed = typeof note === 'string' ? note.trim() : '';
      const fields = [
        ...((REVIEW_REPORT_REASONS as readonly string[]).includes(reason)
          ? []
          : [{ field: 'reason', message: `Known reasons: ${REVIEW_REPORT_REASONS.join(', ')}.` }]),
        ...(trimmed.length > MAX_MODERATION_TEXT
          ? [
              {
                field: 'note',
                message: `At most ${MAX_MODERATION_TEXT} characters.`,
                bound: 'max',
                max: MAX_MODERATION_TEXT,
              },
            ]
          : []),
      ];
      if (fields.length > 0) throw validationFailed(url, fields);

      const review = reviewStore.find(reviewId);
      if (!review || review.hidden) throw new NotFoundError({ url });
      if (review.dinerUserId === accountId) throw new CannotReportOwnReviewError({ url });

      reviewStore.report({
        reviewId,
        dinerUserId: accountId,
        reason,
        note: trimmed === '' ? null : trimmed,
        createdAtUtc: now().toISOString(),
      });
    },

    // --- Favourites (K11) ------------------------------------------------------

    async listFavorites(position) {
      await wait();
      return favoriteList(me(), position);
    },

    async addFavorite(branchId) {
      await wait();
      const url = `${URL_TAG}/api/diner/favorites/${branchId}`;
      const accountId = me();
      if (!liveListing(branchId)) throw new NotFoundError({ url });
      const saved = favoritesOf(accountId);
      if (saved.has(branchId)) return;
      if (saved.size >= MAX_FAVORITES) throw new TooManyFavoritesError({ url, max: MAX_FAVORITES });
      saved.set(branchId, { atUtc: now().toISOString(), order: (favoriteOrder += 1) });
    },

    async removeFavorite(branchId) {
      await wait();
      favoritesOf(me()).delete(branchId);
    },

    /**
     * Adds what is missing and never removes. A place that is no longer listed
     * is skipped rather than failing the whole upload: the hearts were made
     * while signed out, possibly weeks ago, and one closed café must not cost
     * the diner the rest. Nothing is written when the result would pass the cap.
     */
    async mergeFavorites(branchIds, position) {
      await wait();
      const url = `${URL_TAG}/api/diner/favorites`;
      const accountId = me();
      if (branchIds.length > MAX_FAVORITES) {
        throw validationFailed(url, [
          {
            field: 'branchIds',
            message: `At most ${MAX_FAVORITES} places at once.`,
            bound: 'max',
            max: MAX_FAVORITES,
          },
        ]);
      }
      const saved = favoritesOf(accountId);
      const missing = [...new Set(branchIds)].filter((id) => !saved.has(id) && liveListing(id));
      if (saved.size + missing.length > MAX_FAVORITES) {
        throw new TooManyFavoritesError({ url, max: MAX_FAVORITES });
      }
      for (const id of missing) {
        saved.set(id, { atUtc: now().toISOString(), order: (favoriteOrder += 1) });
      }
      return favoriteList(accountId, position);
    },

    // --- The notifications feed (K12) --------------------------------------------

    async listNotifications(query) {
      await wait();
      return notificationPage(me(), query);
    },

    async getUnreadNotificationCount() {
      await wait();
      return notificationPage(me(), { limit: 1 }).unreadCount;
    },

    async markNotificationsRead(command) {
      await wait();
      const feed = feedOf(me());
      if (command.upTo !== undefined) {
        const index = feed.findIndex((row) => row.notificationId === command.upTo);
        // Everything up to it is everything at it and older; the feed is newest first.
        if (index >= 0) {
          for (let i = index; i < feed.length; i += 1) feed[i] = { ...feed[i]!, read: true };
        }
        return;
      }
      // Ids that are not this diner's are ignored, never revealed.
      const ids = new Set(command.ids ?? []);
      for (let i = 0; i < feed.length; i += 1) {
        if (ids.has(feed[i]!.notificationId)) feed[i] = { ...feed[i]!, read: true };
      }
    },

    async listDinerOrders(): Promise<readonly DinerOrder[]> {
      await wait();
      me();
      // The mock keeps no per-diner order history; the app's Orders tab runs on
      // its own mock repository. An honest empty list, not invented receipts.
      return [];
    },

    async getDinerOrder(): Promise<DinerOrder | null> {
      await wait();
      me();
      return null;
    },

    async listVenues() {
      await wait();
      return publishedVenues();
    },

    async getVenue(venueId) {
      await wait();
      // By the published id (the slug) or the venue's own id: the places list
      // the diner app builds from the fixture carries the latter, and a lookup
      // that knew only the slug left the confirm screen's "Where" row empty
      // (QA F14).
      const own = mockVenues.find((venue) => venue.id === venueId);
      const published = own ? (publicVenueFixtures[own.id]?.slug ?? own.id) : venueId;
      return publishedVenues().find((venue) => venue.id === published) ?? null;
    },

    async getBookingRules({ venueSlug, branchSlug }) {
      await wait();
      const venue = mockVenues.find((v) => publicVenueFixtures[v.id]?.slug === venueSlug);
      const branch = venue?.branches.find((b) => publicBranchFixtures[b.id]?.slug === branchSlug);
      return branch
        ? {
            bookingWindowDays: BOOKING_WINDOW_DAYS,
            minLeadMinutes: DEFAULT_POLICY.leadTimeMinutes,
            acceptsAppBookings: acceptsAppBookings(branch.id),
          }
        : null;
    },

    async getFloorPlan(branchId) {
      await wait();
      return floors.get(branchId) ?? null;
    },

    async getBranchTimeZone(branchId) {
      await wait();
      return findBranch(branchId)?.branch.timeZoneId ?? null;
    },

    async getTableAvailability({ branchId, slotUtc, partySize }) {
      await wait();
      return availabilityFor(branchId, slotUtc, partySize);
    },

    async getSlotFloor({ branchId, slotUtc, partySize, excludeBookingId }) {
      await wait();
      return slotFloorFor(branchId, slotUtc, partySize, excludeBookingId);
    },

    async getDaySlots({ branchId, date, partySize, excludeBookingId }) {
      await wait();
      return daySlotsFor(branchId, date, partySize, excludeBookingId);
    },

    async getPhoneProofChannels() {
      await wait();
      return { ...proofChannels };
    },

    async requestPhoneCode(phoneE164, _options) {
      await wait();
      if (!proofChannels.sms) {
        throw new SmsUnavailableError({ url: `${URL_TAG}/api/auth/diner/request-code` });
      }
      const stamps = (codesPerNumber.get(phoneE164) ?? []).filter(
        (t) => now().getTime() - t < 60 * 60_000,
      );
      if (stamps.length >= MAX_CODES_PER_NUMBER) {
        throw new RateLimitedError({
          url: URL_TAG,
          retryAtUtc: new Date((stamps[0] ?? now().getTime()) + 60 * 60_000).toISOString(),
        });
      }
      stamps.push(now().getTime());
      codesPerNumber.set(phoneE164, stamps);

      const id = `ch_${sequence++}`;
      const challenge: Challenge = {
        id,
        phoneE164,
        code: MOCK_CODE,
        expiresAt: now().getTime() + CODE_TTL_MS,
        resendAt: now().getTime() + RESEND_AFTER_MS,
        attempts: 0,
        burned: false,
      };
      challenges.set(id, challenge);

      return {
        challengeId: id,
        phoneE164,
        expiresAtUtc: new Date(challenge.expiresAt).toISOString(),
        resendAvailableAtUtc: new Date(challenge.resendAt).toISOString(),
        maxAttempts: MAX_CODE_ATTEMPTS,
        // Mirrors the real backend outside production. The UI additionally
        // gates rendering on __DEV__.
        devCode: MOCK_CODE,
      } satisfies PhoneChallenge;
    },

    async startTelegramVerification(options) {
      await wait();
      if (!proofChannels.telegram) {
        throw new TelegramUnavailableError({ url: `${URL_TAG}/api/auth/diner/telegram/start` });
      }
      const id = `tg_${sequence++}`;
      const expiresAt = now().getTime() + CODE_TTL_MS;
      telegramChallenges.set(id, { expiresAt, polls: 0, phoneE164: null });
      void options;
      return {
        challengeId: id,
        deepLinkUrl: `https://t.me/${MOCK_TELEGRAM_BOT}?start=${id}`,
        expiresAtUtc: new Date(expiresAt).toISOString(),
        pollAfterMs: TELEGRAM_POLL_MS,
      } satisfies TelegramChallenge;
    },

    async claimTelegramVerification(challengeId, options) {
      await wait();
      const pending = telegramChallenges.get(challengeId);
      // Unknown and aged out are the same answer: the server has nothing to
      // claim, and the screen offers a fresh start either way.
      if (!pending || now().getTime() > pending.expiresAt) {
        telegramChallenges.delete(challengeId);
        throw new ExpiredCodeError({ url: URL_TAG });
      }
      pending.polls += 1;
      if (
        pending.phoneE164 === null &&
        options_.simulateTelegramConfirm &&
        pending.polls > TELEGRAM_AUTO_CONFIRM_AFTER_POLLS
      ) {
        pending.phoneE164 = MOCK_TELEGRAM_PHONE;
      }
      if (pending.phoneE164 === null) return { state: 'pending' } satisfies TelegramClaimResult;

      telegramChallenges.delete(challengeId);
      // As a passed code: the account behind the number is verified and
      // signed in, or made.
      const { accountId, isNewAccount } = accounts.verifyPhone(
        pending.phoneE164,
        options?.localeCode,
        signedInAccountId,
      );
      signIn(accountId, isNewAccount);
      sessionPhoneProvedAt = now().getTime();
      return {
        state: 'verified',
        verified: {
          verificationToken: `vt_${pending.phoneE164}_${sequence++}`,
          phoneE164: pending.phoneE164,
        },
      } satisfies TelegramClaimResult;
    },

    markNoShowAsVenue(bookingId) {
      markNoShow(bookingId);
    },

    seatAsVenue(bookingId) {
      const booking = bookings.get(bookingId);
      if (booking) bookings.set(bookingId, { ...booking, status: 'seated' });
    },

    admitTabAsWaiter(tabId) {
      admitTab(tabId, 'waiter');
    },

    rejectTabAsWaiter(tabId) {
      turnAway(tabId);
    },

    // --- Pre-orders (2026-10-21) ------------------------------------------

    async replacePreOrder(command): Promise<PreOrderResult> {
      await wait();
      const url = `${URL_TAG}/api/reservations/${command.reservationId}/pre-order`;
      return preOrders.replace({
        url,
        booking: preOrderBooking(ownBooking(url, command.reservationId)),
        draft: command,
        clientCommandId: command.clientCommandId,
        actor: callerGuest(),
      });
    },

    async clearPreOrder({ reservationId, clientCommandId }): Promise<PreOrderResult> {
      await wait();
      const url = `${URL_TAG}/api/reservations/${reservationId}/pre-order/clear`;
      return preOrders.clear({
        url,
        booking: preOrderBooking(ownBooking(url, reservationId)),
        clientCommandId,
        actor: callerGuest(),
      });
    },

    async confirmOnMyWay(reservationId): Promise<OnMyWayResult> {
      await wait();
      const url = `${URL_TAG}/api/reservations/${reservationId}/on-my-way`;
      return preOrders.confirmOnMyWay(url, preOrderBooking(ownBooking(url, reservationId)));
    },

    async replacePreOrderByLink(command): Promise<PreOrderResult> {
      await wait();
      const url = `${URL_TAG}/api/public/bookings/pre-order`;
      return preOrders.replace({
        url,
        booking: preOrderBooking(linkedBooking(url, command.bookingId)),
        draft: command,
        clientCommandId: command.clientCommandId,
        // The link's holder: whoever has it acts for the booking itself.
        actor: `link:${command.bookingId}`,
      });
    },

    async clearPreOrderByLink({ bookingId, clientCommandId }): Promise<PreOrderResult> {
      await wait();
      const url = `${URL_TAG}/api/public/bookings/pre-order/clear`;
      return preOrders.clear({
        url,
        booking: preOrderBooking(linkedBooking(url, bookingId)),
        clientCommandId,
        actor: `link:${bookingId}`,
      });
    },

    async confirmOnMyWayByLink(bookingId): Promise<OnMyWayResult> {
      await wait();
      const url = `${URL_TAG}/api/public/bookings/on-my-way`;
      return preOrders.confirmOnMyWay(url, preOrderBooking(linkedBooking(url, bookingId)));
    },

    setPreOrderSettingsAsVenue(branchId, settings) {
      preOrders.setSettings(branchId, settings);
    },

    acceptsPreOrdersAsVenue(branchId) {
      return preOrders.settings(branchId).acceptsPreOrders;
    },

    setDishSoldOutAsVenue(branchId, menuItemId, soldOut) {
      preOrders.setSoldOut(branchId, menuItemId, soldOut);
    },

    sendPreOrderAsVenue(bookingId) {
      preOrders.markSent(bookingId, MOCK_WAITER_NAME);
    },

    markPreOrderNotComingAsVenue(bookingId) {
      preOrders.markNotComing(bookingId, MOCK_WAITER_NAME);
    },

    confirmTelegramVerification(challengeId, phoneE164) {
      const pending = telegramChallenges.get(challengeId);
      if (pending && now().getTime() <= pending.expiresAt) pending.phoneE164 = phoneE164;
    },

    async verifyPhoneCode({ challengeId, code, localeCode }) {
      await wait();
      const challenge = challenges.get(challengeId);
      if (!challenge) throw new ExpiredCodeError({ url: URL_TAG });
      if (challenge.burned) throw new TooManyAttemptsError({ url: URL_TAG });
      if (now().getTime() > challenge.expiresAt) throw new ExpiredCodeError({ url: URL_TAG });

      if (code !== challenge.code) {
        challenge.attempts += 1;
        // As the server does: the count goes down on each wrong try, the last
        // one reports zero, and after that the code answers "too many".
        const remaining = Math.max(0, MAX_CODE_ATTEMPTS - challenge.attempts);
        if (remaining === 0) challenge.burned = true;
        throw new WrongCodeError({ url: URL_TAG, attemptsRemaining: remaining });
      }

      challenges.delete(challengeId);
      // As the server does since accounts: a registered number is marked
      // verified and that account signed in; an unknown one gets an account.
      const { accountId, isNewAccount } = accounts.verifyPhone(
        challenge.phoneE164,
        localeCode,
        signedInAccountId,
      );
      signIn(accountId, isNewAccount);
      sessionPhoneProvedAt = now().getTime();
      return {
        verificationToken: `vt_${challenge.phoneE164}_${sequence++}`,
        phoneE164: challenge.phoneE164,
      } satisfies VerifiedPhone;
    },

    // --- The account --------------------------------------------------------

    async registerDiner(command) {
      await wait();
      return signIn(accounts.register(command), true);
    },

    async loginDiner(command) {
      await wait();
      return signIn(accounts.login(command), false);
    },

    async getDinerProfile() {
      await wait();
      const profile = accounts.profile(me());
      if (!profile) throw new UnauthorizedError({ url: `${URL_TAG}/api/diner/me` });
      return profile;
    },

    async updateDinerProfile(command) {
      await wait();
      return accounts.update(me(), command);
    },

    async setDinerPassword(command) {
      await wait();
      accounts.setPassword(me(), command, { phoneProvedAt: sessionPhoneProvedAt });
    },

    async uploadDinerPhoto(file) {
      await wait();
      return accounts.setPhoto(me(), photoSeed(file));
    },

    async removeDinerPhoto() {
      await wait();
      accounts.removePhoto(me());
    },

    /**
     * K2, in the server's order: `VerifiedDiner` first, then the confirmation
     * the account needs (the password when it has one, otherwise a code for its
     * own number — or nothing, when this session proved the phone in the last
     * ten minutes), then everything erased at once. The bookings stay for the
     * venue with nobody linked; the session answers `session-revoked` after.
     */
    async deleteDinerAccount({ password, code }) {
      await wait();
      const url = `${URL_TAG}/api/diner/me`;
      const accountId = me();
      const profile = accounts.profile(accountId);
      if (!profile) throw new UnauthorizedError({ url });
      if (!profile.phoneVerified) throw new PhoneNotVerifiedError({ url });

      if (profile.hasPassword) {
        if (!password) {
          throw validationFailed(url, [
            { field: 'password', message: 'Confirm with your password.', bound: 'required' },
          ]);
        }
        if (!accounts.passwordMatches(accountId, password)) {
          throw new InvalidCredentialsError({ url });
        }
      } else if (!code) {
        // A code or Telegram sign-in a moment ago is the proof a code here would
        // be — and with SMS off, the only one an account with no password has.
        if (!phoneProvedRecently()) {
          throw validationFailed(url, [
            {
              field: 'code',
              message:
                "Enter the code sent to the account's number, or prove the number with Telegram again, to delete it.",
              bound: 'required',
            },
          ]);
        }
      } else {
        const t = now().getTime();
        const challenge = [...challenges.values()].find(
          (entry) => entry.phoneE164 === profile.phoneE164 && !entry.burned && t <= entry.expiresAt,
        );
        if (!challenge || challenge.code !== code) throw new InvalidCredentialsError({ url });
        challenges.delete(challenge.id);
      }

      reviewStore.deleteByDiner(accountId);
      favorites.delete(accountId);
      feeds.delete(accountId);
      for (const [bookingId, owner] of bookingOwners) {
        if (owner === accountId) bookingOwners.delete(bookingId);
      }
      for (let i = visits.length - 1; i >= 0; i -= 1) {
        if (visits[i]!.dinerUserId === accountId) visits.splice(i, 1);
      }
      accounts.remove(accountId);
      deletedAccounts.add(accountId);
    },

    async createBooking(command: CreateBookingCommand) {
      await wait();
      const url = `${URL_TAG}/api/reservations`;
      // The body binds first: a command id that is not a GUID never reaches the rules.
      requireClientCommandId(url, command.commandId);
      // The request's own validation runs before anything else, as on the server.
      const note = typeof command.note === 'string' ? command.note.trim() : '';
      if (note.length > MAX_BOOKING_NOTE) {
        throw validationFailed(url, [
          {
            field: 'note',
            message: `At most ${MAX_BOOKING_NOTE} characters.`,
            bound: 'max',
            max: MAX_BOOKING_NOTE,
          },
        ]);
      }
      // No booking without a proved number (guest record, 2026-10-20).
      requireVerifiedPhone(url);

      // Idempotency first: a retry of the same command must not book twice.
      const existingId = commandLog.get(command.commandId);
      if (existingId) {
        const existing = bookings.get(existingId);
        if (existing) return withRequest(existing);
      }
      // Three no-shows in three days: no booking until the week is over.
      refuseWhileBlocked(url);

      const found = findBranch(command.branchId);
      const floor = floors.get(command.branchId);
      // A 404, as the server answers an unknown branch or table.
      if (!found || !floor) throw new NotFoundError({ url: `${URL_TAG}/api/reservations` });
      const policy = DEFAULT_POLICY;

      // `ReservationService.RequireWebBookingsAccepted`: a branch that never
      // agreed to take bookings from its public page does not take them — a
      // 409 `web-bookings-not-accepted`, before the app gate and every table
      // rule. The mock booked through a page whose switch was off (QA F5).
      if (
        command.channel === 'web' &&
        !(publicBranchFixtures[command.branchId]?.acceptsWebBookings ?? false)
      ) {
        throw conflict(
          url,
          'web-bookings-not-accepted',
          `${found.branch.name} does not take bookings from its public page. ` +
            'Contact the venue directly to book a table.',
        );
      }

      // K9: the app channel needs the switch on and a reviewed policy.
      if (command.channel === 'app' && !acceptsAppBookings(command.branchId)) {
        throw new BookingsNotAcceptedError({ url, branchId: command.branchId });
      }

      const table = floor.tables.find((t) => t.id === command.tableId);
      if (!table) throw new NotFoundError({ url: `${URL_TAG}/api/reservations` });

      const slot = new Date(command.slotUtc);

      // The branch-wide rules first, as the server applies them. Lead time:
      // the slot may have become too soon while they were deciding.
      refuseAtBranch(command.branchId, slot, command.partySize);

      // Judged at the slot being booked, not at now — the same projection the
      // availability answer used. Judging it at now would refuse a Saturday
      // booking because somebody is sitting there this evening.
      const refusal = reasonFor(table, stateAt(table, slot, policy), command.partySize);

      // Lost to somebody else — the two 409s. Every other refusal is a rule,
      // a 422, and says which rule; it is not "taken".
      const taken =
        simulateTakenOnce ||
        refusal === 'occupied' ||
        refusal === 'alreadyBooked' ||
        refusal === 'held';
      if (taken) {
        const simulated = simulateTakenOnce && refusal === null;
        simulateTakenOnce = false;
        if (simulated) {
          // Somebody else booked it for this slot, in the mock's world, so the
          // refreshed room and the next availability read are honest.
          floors.set(command.branchId, {
            ...floor,
            tables: floor.tables.map((t) =>
              t.id === table.id
                ? { ...t, state: 'reservedSoon', nextReservationStartUtc: command.slotUtc }
                : t,
            ),
          });
        }

        throw tableTaken({
          branchId: command.branchId,
          table,
          slotUtc: command.slotUtc,
          partySize: command.partySize,
          refusal,
        });
      }
      if (refusal) {
        throw new BookingRejectedError({
          url: URL_TAG,
          reason: refusal,
          partySize: command.partySize,
        });
      }

      // The server's order after the table: the diner's own evening, here or
      // too close to it elsewhere (an overlap says so, with the booking), then
      // at most three active bookings per proved number.
      refuseOverlapWithOwn(url, command.branchId, slot, policy.turnMinutes);
      const phone = numberOf(command);
      refuseFourthActiveBooking(url, phone);

      // Booking times: a sitting the next booking cuts short is taken only with
      // the promise to free the table by then — the very instant, or a 422.
      const timing = timingAt(table, slot);
      const cut = timing.kind === 'refused' ? null : timing.mustFreeByUtc;
      if (cut && !sameInstant(command.acceptsFreeByUtc, cut)) {
        throw new FreeByRequiredError({
          url,
          requiredFreeByUtc: cut,
          nextBookingStartUtc: timing.kind === 'refused' ? null : timing.nextStartUtc,
        });
      }

      // A table somebody booked shortly before, another day: the guest before is
      // asked. Every other booking is decided as it always was.
      const decision =
        earlierGuestDecision(table, timing, command.slotUtc, found.branch.timeZoneId) ??
        decideApproval({
          partySize: command.partySize,
          slotUtc: command.slotUtc,
          timeZoneId: found.branch.timeZoneId,
        });

      const id = `bk_${sequence++}`;
      const booking: Booking = {
        id,
        code: mintBookingCode(),
        ...decision,
        venueName: found.venue.name,
        branchId: found.branch.id,
        branchName: found.branch.name,
        timeZoneId: found.branch.timeZoneId,
        tableId: table.id,
        tableLabel: table.label,
        roomId: table.floorAreaId,
        roomName: table.floorAreaName,
        partySize: command.partySize,
        slotUtc: command.slotUtc,
        // Cut to the promise when the next booking made it shorter.
        endUtc: cut ?? new Date(slot.getTime() + policy.turnMinutes * 60_000).toISOString(),
        freeCancellationUntilUtc: new Date(
          slot.getTime() - policy.freeCancellationMinutes * 60_000,
        ).toISOString(),
        cancelledAtUtc: null,
        cancelledAfterDeadline: false,
        note: note === '' ? null : note,
        declinedBecause: null,
        phoneUnverified: false,
        promisedFreeByUtc: cut,
        // The mock issues one for every booking, so the manage-booking page is
        // walkable from the app's own flow too. See `publicMock.ts` for what
        // the token is and, more importantly, what it is not.
        manageToken: `mbk_${id}`,
      };

      bookings.set(id, booking);
      commandLog.set(command.commandId, id);
      if (phone) bookerPhones.set(id, phone);
      offerToFloor(booking);
      if (booking.awaitingApprovalBecause === 'earlierGuestConsent')
        askEarlierGuest(booking, timing);
      if (signedInAccountId && !deletedAccounts.has(signedInAccountId)) {
        bookingOwners.set(id, signedInAccountId);
      }

      // Reflect the booking on the floor so a second attempt sees it gone.
      floors.set(command.branchId, {
        ...floor,
        tables: floor.tables.map((t) =>
          t.id === table.id
            ? { ...t, state: 'reservedSoon', nextReservationStartUtc: command.slotUtc }
            : t,
        ),
      });

      return withRequest(booking);
    },

    /**
     * Split by the server's rule, not by the clock against the start: upcoming
     * is a booking whose sitting has not ended and which still holds a table.
     */
    async listBookings(): Promise<MyBookings> {
      await wait();
      const t = now().getTime();
      const holdsTable = (b: Booking) =>
        b.status === 'confirmed' || b.status === 'pendingApproval' || b.status === 'seated';
      const all = [...bookings.values()];
      const upcoming = all
        .filter((b) => holdsTable(b) && Date.parse(b.endUtc) > t)
        .sort((a, b) => Date.parse(a.slotUtc) - Date.parse(b.slotUtc));
      const past = all
        .filter((b) => !upcoming.includes(b))
        .sort((a, b) => Date.parse(b.slotUtc) - Date.parse(a.slotUtc));
      // A later guest's request rides on the booking it is for; the diner's own
      // record comes beside the lists.
      return {
        upcoming: upcoming.map(withRequest),
        past: past.map(withRequest),
        guestRecord: guestRecordOf(callerGuest()),
      };
    },

    async getBooking(bookingId) {
      await wait();
      const booking = bookings.get(bookingId);
      return booking ? withRequest(booking) : null;
    },

    async answerTableRequest(answer: AnswerTableRequestCommand): Promise<Booking> {
      await wait();
      const url = `${URL_TAG}/api/reservations/${answer.bookingId}/table-requests/${answer.requestId}/answer`;
      requireClientCommandId(url, answer.commandId);
      // Their own booking only; anybody else's answers as one that does not exist.
      const booking = bookings.get(answer.bookingId);
      const owner = booking ? (bookingOwners.get(booking.id) ?? null) : null;
      if (!booking || (owner !== null && owner !== signedInAccountId)) {
        throw new NotFoundError({ url });
      }
      const request = tableRequests.get(answer.requestId);
      // A question the floor is deciding is not this guest's to answer: as if absent.
      if (!request || request.earlierId !== booking.id || !request.asksEarlierGuest) {
        throw new NotFoundError({ url });
      }
      if (request.status !== 'pending') {
        // The same answer again is the answer it was: a lock-screen button
        // tapped twice on a bad connection is not a second answer.
        if (request.answerCommandId === answer.commandId) {
          return withRequest(bookings.get(booking.id) ?? booking);
        }
        throw new TableRequestClosedError({ url, requestId: request.id });
      }
      request.answerCommandId = answer.commandId;
      decideTableRequest(request, answer.accept, now().toISOString());
      return withRequest(bookings.get(booking.id) ?? booking);
    },

    // --- Notifications --------------------------------------------------------
    //
    // The mock has no push channel and cannot pretend to: a token it accepted
    // would never receive anything. What it *can* do honestly is behave like the
    // registration endpoint and hold reservation state, so the routing, the
    // stale-action rule and the one-extension rule are all walkable without a
    // phone in your hand.

    async registerPushDevice({ pushToken }) {
      await wait();
      // Idempotent on the token, as the server is: the app calls this on every
      // launch and on rotation.
      let deviceId = pushDevices.get(pushToken);
      if (!deviceId) {
        deviceId = `device-${pushDevices.size + 1}`;
        pushDevices.set(pushToken, deviceId);
      }
      return { deviceId };
    },

    async getReservationState(reservationId) {
      await wait();
      const booking = bookings.get(reservationId);
      return booking ? toReservationState(booking) : null;
    },

    async cancelReservation({ reservationId }) {
      const booking = await this.cancelBooking(reservationId);
      return toReservationState(booking);
    },

    async extendReservationHold({ reservationId, clientCommandId }) {
      await wait();
      requireClientCommandId(
        `${URL_TAG}/api/reservations/${reservationId}/extend-hold`,
        clientCommandId,
      );
      const booking = bookings.get(reservationId);
      if (!booking) throw new NotFoundError({ url: `${URL_TAG}/api/reservations` });
      // As the server now refuses it: nothing is held before the start, and
      // only a confirmed booking holds a table. Nothing is spent.
      if (booking.status !== 'confirmed' || now().getTime() < Date.parse(booking.slotUtc)) {
        throw new HoldNotActiveError({ url: URL_TAG, reservationId });
      }

      const previous = holdExtensions.get(reservationId);
      if (previous) {
        // The same command again is a replay, not a second attempt: a
        // notification is tappable twice and the second tap is not an error.
        if (previous.clientCommandId === clientCommandId) {
          return { ...previous.outcome, wasReplay: true };
        }
        // A genuinely second attempt. The one extension is spent.
        throw new HoldAlreadyExtendedError({ url: URL_TAG, reservationId });
      }

      const minutes = 15;
      const outcome = {
        reservationId,
        holdExpiresAtUtc: new Date(now().getTime() + minutes * 60_000).toISOString(),
        extensionMinutes: minutes,
        extensionsRemaining: 0,
        wasReplay: false,
      };
      holdExtensions.set(reservationId, { clientCommandId, outcome });
      return outcome;
    },

    async cancelBooking(bookingId) {
      await wait();
      const booking = bookings.get(bookingId);
      if (!booking) throw new NotFoundError({ url: `${URL_TAG}/api/reservations` });

      // Already cancelled is the outcome asked for, as the real gateway reads
      // it back. Anything else that no longer holds a table is refused, as the
      // server refuses it.
      if (booking.status === 'cancelledByDiner' || booking.status === 'cancelledByVenue') {
        return withRequest(booking);
      }
      if (booking.status !== 'confirmed' && booking.status !== 'pendingApproval') {
        throw new ConcurrencyConflictError({ url: `${URL_TAG}/api/reservations` });
      }

      // Never refuses for lateness: a late cancellation is far better for the
      // venue than a no-show. It is only recorded as late.
      const at = now();
      const cancelled: Booking = {
        ...booking,
        status: 'cancelledByDiner',
        cancelledAtUtc: at.toISOString(),
        cancelledAfterDeadline: at.getTime() > Date.parse(booking.freeCancellationUntilUtc),
      };
      bookings.set(bookingId, cancelled);
      rejudgeAskersOf(bookingId, at.toISOString());
      withdrawRequestsFor(bookingId);

      const floor = floors.get(booking.branchId);
      if (floor) {
        floors.set(booking.branchId, {
          ...floor,
          tables: floor.tables.map((t) =>
            t.id === booking.tableId ? { ...t, state: 'free', nextReservationStartUtc: null } : t,
          ),
        });
      }

      return withRequest(cancelled);
    },

    /**
     * Move a booking, by the server's rules: the diner's own, waiting or
     * confirmed and not started; every gate a new booking meets, with the
     * collision check leaving this booking out; the status decided afresh; the
     * code, the id and the manage link kept. A replay of the command answers
     * the booking as it now stands.
     */
    async rescheduleBooking(command: RescheduleBookingCommand): Promise<Booking> {
      // As it stood before the floor's answers catch up with the clock: the
      // server refuses a change to a request whose answer window has closed,
      // whatever its sweep has made of it yet.
      const before = bookings.get(command.bookingId);
      await wait();
      const url = `${URL_TAG}/api/reservations/${command.bookingId}/reschedule`;
      requireClientCommandId(url, command.commandId);
      requireVerifiedPhone(url);

      const replayed = rescheduleLog.get(command.commandId);
      const current = replayed !== undefined ? bookings.get(replayed) : undefined;
      if (current) return withRequest(current);
      // Blocked for no-shows: no change either, one rule everywhere.
      refuseWhileBlocked(url);

      if (
        before?.status === 'pendingApproval' &&
        before.approvalExpiresAtUtc &&
        now().getTime() >= Date.parse(before.approvalExpiresAtUtc)
      ) {
        throw conflict(
          url,
          APPROVAL_EXPIRED_CODE,
          `The answer window for ${before.code} has closed; it can no longer be changed.`,
        );
      }

      // Somebody else's booking answers exactly as one that does not exist.
      const booking = bookings.get(command.bookingId);
      const owner = booking ? (bookingOwners.get(booking.id) ?? null) : null;
      if (!booking || (owner !== null && owner !== signedInAccountId)) {
        throw new NotFoundError({ url });
      }

      const started = now().getTime() >= Date.parse(booking.slotUtc);
      if ((booking.status !== 'pendingApproval' && booking.status !== 'confirmed') || started) {
        throw new BookingNotChangeableError({ url, reservationId: booking.id });
      }
      // The kitchen has its pre-order: the booking stays where it is (it may
      // still be cancelled). Otherwise "not coming" goes with the old time.
      preOrders.beforeMove(url, booking.id);

      const floor = floors.get(booking.branchId);
      const table = floor?.tables.find((t) => t.id === command.tableId);
      if (!floor || !table) throw new NotFoundError({ url });
      const policy = DEFAULT_POLICY;
      const slot = new Date(command.slotUtc);

      refuseAtBranch(booking.branchId, slot, command.partySize);
      refuseOverlapWithOwn(url, booking.branchId, slot, policy.turnMinutes, booking.id);

      /*
       * A confirmed booking keeping its table and start, its party not
       * growing, is never judged again by the table-sequencing rules: nothing
       * the venue said yes to got harder to keep. Only a party sitting into it
       * now still refuses it.
       */
      const keeps =
        booking.status === 'confirmed' &&
        sameInstant(command.slotUtc, booking.slotUtc) &&
        table.id === booking.tableId &&
        command.partySize <= booking.partySize;
      // At the new slot, leaving this booking out — so keeping the same table
      // half an hour later is not a collision with itself.
      const judged = reasonFor(table, stateAt(table, slot, policy, booking.id), command.partySize);
      const refusal = keeps && judged === 'alreadyBooked' ? null : judged;
      if (refusal === 'occupied' || refusal === 'alreadyBooked' || refusal === 'held') {
        throw tableTaken({
          branchId: booking.branchId,
          table,
          slotUtc: command.slotUtc,
          partySize: command.partySize,
          refusal,
          excludeBookingId: booking.id,
        });
      }
      if (refusal) {
        throw new BookingRejectedError({ url, reason: refusal, partySize: command.partySize });
      }

      // The same promise as for a new booking, at the new table and time — not
      // asked again of a booking that already made exactly it for the same
      // table and start (a change of party size alone), nor of one the rules
      // do not judge again. Bookings only asking for this one's table are left
      // out of judging it: the guest before is not made to promise a time, nor
      // refused, because somebody would like their table.
      const askers = askersOf(booking.id);
      const timing = timingAt(table, slot, booking.id, askers);
      const cut = keeps || timing.kind === 'refused' ? null : timing.mustFreeByUtc;
      const samePlace =
        table.id === booking.tableId && sameInstant(command.slotUtc, booking.slotUtc);
      const promisedAlready =
        cut !== null && samePlace && sameInstant(booking.promisedFreeByUtc ?? null, cut);
      if (cut && !promisedAlready && !sameInstant(command.acceptsFreeByUtc, cut)) {
        throw new FreeByRequiredError({
          url,
          requiredFreeByUtc: cut,
          nextBookingStartUtc: timing.kind === 'refused' ? null : timing.nextStartUtc,
        });
      }

      // Re-decided like a new booking, except that a confirmed one the floor
      // already said yes to stays confirmed while its start and table hold and
      // its party does not grow — nothing the floor agreed to has changed.
      const decided = keeps
        ? {
            status: 'confirmed' as const,
            awaitingApprovalBecause: null,
            approvalExpiresAtUtc: null,
          }
        : (earlierGuestDecision(table, timing, command.slotUtc, booking.timeZoneId) ??
          decideApproval({
            partySize: command.partySize,
            slotUtc: command.slotUtc,
            timeZoneId: booking.timeZoneId,
          }));
      /*
       * A waiting booking that moves never gets a later deadline than it had:
       * moved from the guest before's two hours into tonight it gets tonight's
       * fifteen minutes, moved around while it waits on the same guest the two
       * hours do not restart, and moving is no way to buy the floor more time.
       * A move to a wait with no clock has none.
       */
      const waitingWindow =
        booking.status === 'pendingApproval' ? (booking.approvalExpiresAtUtc ?? null) : null;
      const decision =
        decided.approvalExpiresAtUtc && waitingWindow
          ? {
              ...decided,
              approvalExpiresAtUtc: new Date(
                Math.min(
                  Date.parse(decided.approvalExpiresAtUtc),
                  Date.parse(waitingWindow),
                  Date.parse(command.slotUtc),
                ),
              ).toISOString(),
            }
          : decided;
      /*
       * Still asking the same guest the same way, it keeps the same question —
       * retimed to the new start, no second push, no new card. Otherwise
       * whatever it was asking is withdrawn and asked afresh.
       */
      const open = openRequestOf(booking.id);
      const sameQuestion =
        open !== null &&
        decision.awaitingApprovalBecause === 'earlierGuestConsent' &&
        timing.kind === 'requestable' &&
        timing.previousId === open.earlierId &&
        open.asksEarlierGuest ===
          answersInApp(timing, {
            partySize: command.partySize,
            slotUtc: command.slotUtc,
            timeZoneId: booking.timeZoneId,
          });
      // A confirmed booking moved into short notice — or onto a table the guest
      // before is asked about — keeps the slot it had until the answer; a
      // change of a change keeps the first one.
      if (
        decision.awaitingApprovalBecause === 'shortNotice' ||
        decision.awaitingApprovalBecause === 'earlierGuestConsent'
      ) {
        if (booking.status === 'confirmed') changeOrigins.set(booking.id, booking);
      } else {
        changeOrigins.delete(booking.id);
      }
      if (sameQuestion && timing.kind === 'requestable') {
        open.requestedStartUtc = command.slotUtc;
        open.freeByUtc = timing.freeByUtc;
      } else {
        withdrawRequestsFor(booking.id);
      }
      const moved: Booking = {
        ...booking,
        ...decision,
        tableId: table.id,
        tableLabel: table.label,
        roomId: table.floorAreaId,
        roomName: table.floorAreaName,
        partySize: command.partySize,
        slotUtc: command.slotUtc,
        // A promise is kept where the booking stays (a yes to a later guest
        // included), and never lengthens the sitting.
        ...promiseAt(
          slot,
          cut ?? (samePlace ? (booking.promisedFreeByUtc ?? null) : null),
          policy.turnMinutes,
        ),
        freeCancellationUntilUtc: new Date(
          slot.getTime() - policy.freeCancellationMinutes * 60_000,
        ).toISOString(),
      };
      bookings.set(booking.id, moved);
      rescheduleLog.set(command.commandId, booking.id);
      if (moved.awaitingApprovalBecause === 'earlierGuestConsent' && !sameQuestion) {
        askEarlierGuest(moved, timing);
      }
      // The guest before moved: whoever was asking for their table is judged again.
      if (askers.size > 0) rejudgeAskersOf(booking.id, now().toISOString());

      // The marks move with it: off the old table, onto the new one.
      floors.set(booking.branchId, {
        ...floor,
        tables: floor.tables.map((t) => {
          if (t.id === table.id) {
            return { ...t, state: 'reservedSoon', nextReservationStartUtc: command.slotUtc };
          }
          if (t.id === booking.tableId && t.nextReservationStartUtc === booking.slotUtc) {
            return { ...t, state: 'free', nextReservationStartUtc: null };
          }
          return t;
        }),
      });

      // The reminder moves too: one not yet read is withdrawn, and the feed
      // writes a fresh one when the new time comes round.
      for (const feed of feeds.values()) {
        for (let i = feed.length - 1; i >= 0; i -= 1) {
          const row = feed[i]!;
          if (row.kind === 'booking-reminder' && row.reservationId === booking.id && !row.read) {
            feed.splice(i, 1);
          }
        }
      }

      return withRequest(moved);
    },

    // --- Scanning in and the shared tab -----------------------------------

    async scanTableCode(command: ScanTableCommand): Promise<ScanResult> {
      await wait();
      requireClientCommandId(`${URL_TAG}/api/tabs/open`, command.commandId);
      // A waiter just turned this phone away: half an hour before it may scan again.
      if (turnedAwayAt !== null && now().getTime() - turnedAwayAt < TURNED_AWAY_MS) {
        throw new ScanTurnedAwayError({
          url: `${URL_TAG}/api/tabs/open`,
          retryAfterUtc: new Date(turnedAwayAt + TURNED_AWAY_MS).toISOString(),
        });
      }
      serveFloor();
      const result = world.scan(command);
      // A tab this scan opened waits for a waiter unless the scanner proved
      // their number. Joining somebody's tab changes nothing about it.
      if (result.kind === 'tabOpened') admitOnOpen(result.tab.id, 'scan');
      linkParticipant(result.tab);
      return { kind: result.kind, tab: dinerViewOf(result.tab) };
    },

    /**
     * "I'm at my table" — the booking code where the table's token goes.
     *
     * The rules are the server's, in the server's order: whose booking it is,
     * what state it is in, whether the table is being held for it yet. Only
     * then is it the scan, on the table the booking names.
     */
    async openTabByBooking(command: OpenTabByBookingCommand): Promise<ScanResult> {
      await wait();

      const url = `${URL_TAG}/api/tabs/open-by-booking`;
      requireVerifiedPhone(url);
      // After the policy, as there: VerifiedDiner answers before the body is bound.
      requireClientCommandId(url, command.commandId);
      serveFloor();
      const wanted = normaliseBookingCode(command.bookingCode);
      /*
       * Over this diner's own bookings — which *is* the ownership rule, not an
       * approximation of it. Everything in here was made by this device, so a
       * stranger's code is simply absent and gets the answer a code nobody
       * holds gets. That sameness is the point: six characters read out at a
       * door must never confirm that somebody else's booking exists.
       */
      const booking = [...bookings.values()].find((b) => b.code === wanted);
      if (!booking) throw new BookingNotFoundError({ url });

      const facts = {
        url,
        reservationId: booking.id,
        startUtc: booking.slotUtc,
        endUtc: booking.endUtc,
      };

      if (booking.status === 'completed') throw new BookingEndedError(facts);
      if (booking.status !== 'confirmed' && booking.status !== 'seated') {
        throw new BookingNotActiveError({ ...facts, status: booking.status });
      }

      // A seated party is not clock-checked: the venue already put them at the
      // table, and the sitting holds it until staff free it.
      if (booking.status === 'confirmed') {
        const t = now().getTime();
        const earliest = Date.parse(booking.slotUtc) - WALK_IN_HOLDBACK_MINUTES * 60_000;
        if (t < earliest) {
          throw new BookingTooEarlyError({
            ...facts,
            earliestUtc: new Date(earliest).toISOString(),
          });
        }
        // Late is not ended: until the sitting is over the table is theirs.
        if (t >= Date.parse(booking.endUtc)) throw new BookingEndedError(facts);
      }

      // Never a stranger's tab: another party still seated there is refused,
      // and a member of staff frees the table. A replay is the booker's own.
      if (world.occupiedByAnotherParty(booking.tableId, booking.id)) {
        throw new BookingTableOccupiedError({ ...facts, tableLabel: booking.tableLabel });
      }

      const result = world.openAtTable({
        tableId: booking.tableId,
        commandId: command.commandId,
        reservationId: booking.id,
        ...(command.displayName ? { displayName: command.displayName } : {}),
      });

      /*
       * Seated *as the booking*, which is the difference between a floor that
       * knows the party arrived and one that goes on treating a table of people
       * eating as a no-show waiting to happen.
       */
      bookings.set(booking.id, { ...booking, status: 'seated' });

      // The booker is let in: on a tab they opened, and on one a scan opened
      // at their sitting that was waiting for a waiter.
      if (result.kind === 'tabOpened') admitOnOpen(result.tab.id, 'booker');
      else admitTab(result.tab.id, 'booker');

      linkParticipant(result.tab);
      return { kind: result.kind, tab: dinerViewOf(result.tab) };
    },

    async joinTab(command): Promise<ScanResult> {
      await wait();
      serveFloor();
      const result = world.join(command);
      linkParticipant(result.tab);
      return { kind: result.kind, tab: dinerViewOf(result.tab) };
    },

    async leaveTab({ tabId }) {
      await wait();
      world.leave(tabId);
    },

    async createTabInvite(input): Promise<TabInvite> {
      await wait();
      return world.invite(input);
    },

    async setTabDisplayName(tabId, displayName): Promise<TabParticipantChange> {
      await wait();
      const url = `${URL_TAG}/api/tabs/${tabId}/display-name`;
      const tab = readableTab(tabId);
      if (!tab) throw new TabAccessEndedError({ url, tabId, status: 403 });
      // `Guard.NotBlank(displayName, FieldLengths.DisplayName)`: a 400 naming it.
      const name = displayName.trim();
      if (name === '' || name.length > DISPLAY_NAME_MAX) {
        throw invalidRequest(url, 'displayName', `A name is 1 to ${DISPLAY_NAME_MAX} characters.`);
      }
      const updated = world.setDisplayName({ tabId, displayName: name });
      return changeOf(updated, updated.yourParticipantId);
    },

    async approveJoin(input): Promise<TabParticipantChange> {
      await wait();
      return changeOf(world.approve(input), input.participantId);
    },

    async rejectJoin(input): Promise<TabParticipantChange> {
      await wait();
      return changeOf(world.reject(input), input.participantId);
    },

    async removeParticipant(input): Promise<TabParticipantChange> {
      await wait();
      return changeOf(world.remove(input), input.participantId);
    },

    async setParticipantPermissions(input: {
      tabId: string;
      participantId: string;
      permissions: TabPermissions;
      commandId: string;
    }): Promise<TabParticipantChange> {
      await wait();
      return changeOf(world.setPermissions(input), input.participantId);
    },

    async callWaiter(input: {
      tabId: string;
      reason: WaiterCallReason;
      commandId: string;
      bill?: BillRequestInput | undefined;
    }): Promise<WaiterCall> {
      await wait();
      // A repeated command id is the same request, answered as it was — not
      // priced again against a bill that may have moved since.
      const replayed = world.findCall(input.commandId);
      if (replayed) return replayed;
      // Water and napkins, yes — the waiter coming over is how the table gets
      // let in. Never the bill: nothing is on a tab nobody admitted.
      if (input.reason === 'bill' && admissionOf(input.tabId).status === 'awaiting') {
        throw new TabAwaitingAdmissionError({
          url: `${URL_TAG}/api/tabs/${input.tabId}/service-requests`,
          tabId: input.tabId,
        });
      }
      const bill = input.bill ? billRequestFor(input.tabId, input.reason, input.bill) : null;
      const tab = world.get(input.tabId);
      const call = world.call({
        tabId: input.tabId,
        reason: input.reason,
        commandId: input.commandId,
        bill,
        ...(tab ? { participantId: tab.yourParticipantId } : {}),
      });
      // On the tab's stream as the server puts it there: who asked and what
      // for, and no amounts — those reach the floor, not the other phones.
      if (tab) {
        orders.record(tab, 'serviceRequested', 'diner', {
          serviceRequestId: call.id,
          preset: SERVICE_PRESET[input.reason],
          note: null,
          requestedByParticipantId: tab.yourParticipantId,
          billScope: bill ? (bill.scope === 'whole' ? 1 : 2) : null,
          tipPercent: bill?.tipPercent ?? null,
        });
      }
      return call;
    },

    // --- Ordering and the bill ---------------------------------------------

    async getBranchMenuDetail(branchId): Promise<BranchMenu | null> {
      await wait();
      const type = venueTypeFor(branchId);
      // Complete items only. The server applies this and the mock did not, so
      // a screen built against the mock was being handed items with empty
      // allergen lists that production would never send.
      return type
        ? preOrders.decorateMenu(publishedBranchMenu(mockBranchMenu(branchId, type)))
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
