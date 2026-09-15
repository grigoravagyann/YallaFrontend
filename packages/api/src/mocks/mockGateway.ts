import type { DerivedTableState, FloorPlanData, FloorTable } from '@yalla/floorplan/types';
import type {
  AvailabilityWindowDto,
  Booking,
  BookingStatus,
  BranchPolicy,
  CreateBookingCommand,
  MyBookings,
  PhoneChallenge,
  SlotFloor,
  TableAvailability,
  TableUnavailableReason,
  VenueSummary,
  VerifiedPhone,
} from '../contracts/booking';
import type { ExtendHoldOutcome, ReservationState } from '../contracts/push';
import {
  BookingsNotAcceptedError,
  CannotReportOwnReviewError,
  InvalidCredentialsError,
  ReviewNeedsVisitError,
  TooManyFavoritesError,
  PhoneNotVerifiedError,
  BookingEndedError,
  BookingNotActiveError,
  BookingTableOccupiedError,
  BookingNotFoundError,
  BookingRejectedError,
  BookingTooEarlyError,
  TabAccessEndedError,
  ExpiredCodeError,
  HoldAlreadyExtendedError,
  HoldNotActiveError,
  LeadTimeExceededError,
  RateLimitedError,
  TableTakenError,
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
import type {
  BranchMenu,
  DinerTabView,
  PlaceOrderResult,
  TabEventPage,
  TabShares,
} from '../contracts/ordering';
import { NotTabHostError } from '../contracts/errors';
import {
  clampBranchSearch,
  type BranchDetail,
  type BranchListing,
  type BranchReview,
  type BranchReviewPage,
  type BranchSearchQuery,
  type BranchTableMarkers,
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
} from '../contracts/reviews';
import { createMockReviewStore, type MockReviewStore, type StoredReview } from './reviewStore';
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
import { localDateTime } from '../http/mapping';
import type { YallaGateway } from '../gateway';
import { SEEDED_ACCOUNT, createAccountStore } from './accounts';
import { createTabWorld, type TableLocation } from './tabs';
import { createTabOrders } from './tabOrders';
import { mockBranchMenu, publishedBranchMenu, mockMenuItem } from './menuDetail';
import { openStateFrom } from './openState';
import { BOOKING_WINDOW_DAYS } from './publicMock';
import { publicBranchFixtures, publicVenueFixtures } from './publicVenues';
import { mockVenues, type Branch as MockBranch, type Venue as MockVenue } from './venues';

const URL_TAG = 'mock://yalla';

const DEFAULT_POLICY: BranchPolicy = {
  turnMinutes: 90,
  leadTimeMinutes: 15,
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

export interface MockGatewayOptions {
  /** Injectable clock so tests are deterministic. */
  readonly now?: () => Date;
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
  let h = Math.imul(seed + 1, 0x9e3779b1) >>> 0;
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

export function createMockGateway(options: MockGatewayOptions = {}): YallaGateway {
  const now = options.now ?? (() => new Date());
  const latency = options.latencyMs ?? 0;

  // Mutable in-memory state. A real backend owns all of this.
  const floors = new Map<string, FloorPlanData>();
  const bookings = new Map<string, Booking>();
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
  let simulateTakenOnce = options.simulateTableTaken ?? false;
  let sequence = 1;

  for (const venue of mockVenues) {
    for (const branch of venue.branches) {
      floors.set(branch.id, structuredClone(branch.floor));
    }
  }

  const wait = () => (latency > 0 ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve());

  /**
   * The tab side of the mock backend, sharing this instance's floors so a table
   * taken out of service is out of service for scanning too.
   */
  /** Which kind of place a branch is, for picking its menu. */
  const venueTypeFor = (branchId: string): 'cafe' | 'restaurant' | undefined =>
    mockVenues.find((venue) => venue.branches.some((branch) => branch.id === branchId))?.type;

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
  });

  const world = createTabWorld({
    now,
    simulateJoiners: options.simulateJoiners ?? true,
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
    return orders.dinerView(tab, tab.yourParticipantId);
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

  /** Derive the window for one table at a slot. */
  function windowFor(
    table: FloorTable,
    slotUtc: string,
    policy: BranchPolicy,
  ): AvailabilityWindowDto {
    // Only a booking that starts *after* the requested slot bounds it. One
    // earlier in the day is behind the diner and bounds nothing.
    const next =
      table.nextReservationStartUtc && new Date(table.nextReservationStartUtc) > new Date(slotUtc)
        ? table.nextReservationStartUtc
        : null;
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

  /** Does the requested sitting collide with the one already booked here? */
  function collidesWithBooking(table: FloorTable, slot: Date, policy: BranchPolicy): boolean {
    const next = table.nextReservationStartUtc;
    if (!next) return false;

    const booked = new Date(next);
    const requestedEnd = new Date(slot.getTime() + policy.turnMinutes * 60_000);
    const bookedEnd = new Date(booked.getTime() + policy.turnMinutes * 60_000);

    // Overlap in either direction, which is what makes "free now, booked at
    // 20:00" refuse a 20:00 request and allow a 15:00 one.
    return slot < bookedEnd && booked < requestedEnd;
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
  function stateAt(table: FloorTable, slot: Date, policy: BranchPolicy): DerivedTableState {
    // Not a session. A table taken out of service stays out of service.
    if (table.state === 'outOfService') return 'outOfService';

    const minutesOut = minutesBetween(now(), slot);
    if (minutesOut <= PHYSICAL_HORIZON_MINUTES) {
      if (table.state === 'occupied' || table.state === 'held') return table.state;
    }

    return collidesWithBooking(table, slot, policy) ? 'reservedSoon' : 'free';
  }

  /**
   * A rule that refuses the whole request, before any table is considered.
   *
   * Reported once rather than on forty tables, and it is what a surface shows
   * instead of an empty room when somebody picks a slot that has already
   * happened.
   */
  function branchRejection(slot: Date, policy: BranchPolicy): TableUnavailableReason | null {
    const minutesOut = minutesBetween(now(), slot);
    if (minutesOut < policy.leadTimeMinutes) return 'pastLeadTime';
    if (minutesOut > BOOKING_WINDOW_DAYS * 24 * 60) return 'tooFarAhead';
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
  ): readonly TableAvailability[] {
    const found = findBranch(branchId);
    const floor = floors.get(branchId);
    if (!found || !floor) return [];
    const policy = DEFAULT_POLICY;
    const slot = new Date(slotUtc);
    const rejection = branchRejection(slot, policy);

    const freeCancellationUntilUtc = new Date(
      slot.getTime() - policy.freeCancellationMinutes * 60_000,
    ).toISOString();

    return floor.tables.map((table) => {
      const state = stateAt(table, slot, policy);
      // A branch-level refusal applies to every table and outranks whatever the
      // table itself would have said.
      const reason = rejection ?? reasonFor(table, state, partySize);
      return {
        tableId: table.id,
        tableLabel: table.label,
        floorAreaName: table.floorAreaName,
        seats: table.seats,
        isBookable: reason === null,
        unavailableReason: reason,
        window: reason === null ? windowFor(table, slotUtc, policy) : null,
        freeCancellationUntilUtc,
        requiresApproval: partySize > policy.instantConfirmationMaxPartySize,
      };
    });
  }

  /** The room as it will be at the slot, drawn from the same projection. */
  function slotFloorFor(branchId: string, slotUtc: string, partySize: number): SlotFloor | null {
    const floor = floors.get(branchId);
    if (!floor) return null;

    const policy = DEFAULT_POLICY;
    const slot = new Date(slotUtc);
    const tables = availabilityFor(branchId, slotUtc, partySize);
    const answers = new Map(tables.map((table) => [table.tableId, table]));

    return {
      plan: {
        ...floor,
        tables: floor.tables.map((table) => ({
          ...table,
          state: stateAt(table, slot, policy),
          // The server's decision for this slot and party, not the table's
          // standing configuration — so the drawn room and the sheet agree.
          isBookable: answers.get(table.id)?.isBookable ?? false,
        })),
      },
      tables,
      rejection: branchRejection(slot, policy),
      slotUtc,
      partySize,
    };
  }

  // --- Places ----------------------------------------------------------------

  /**
   * Reviews live in a store a console mock can share, so a review written here
   * is moderated there. One per diner per branch, as the unique index says.
   */
  const reviewStore = options.reviews ?? createMockReviewStore({ now });

  function toPublicReview(review: StoredReview): BranchReview {
    return {
      reviewId: review.reviewId,
      authorName: review.authorName,
      rating: review.rating,
      text: review.text,
      createdAtUtc: review.createdAtUtc,
      updatedAtUtc: review.updatedAtUtc,
      edited: review.updatedAtUtc !== review.createdAtUtc,
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
  let notificationOrder = 0;

  /**
   * The diner's feed, brought up to date with what has happened — the rows the
   * server's producers would have written as it happened.
   *
   * Only what this mock can observe is produced: a reminder once a booking of
   * the diner's is within two hours of starting, and `review-hidden` once a
   * review of theirs is taken down (by a console mock sharing the store). The
   * venue's decisions and order-ready never happen in the diner mock, so no row
   * for them is invented.
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
      cuisine: null,
      priceLevel: null,
      address: fixture.addressLine,
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
          const haystack =
            `${listing.venueName} ${listing.branchName} ${listing.address}`.toLowerCase();
          if (!haystack.includes(needle)) return [];
        }
        return [listing];
      }),
    );
    return query?.position
      ? found.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      : found.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
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
      return {
        listing,
        about: publicVenueFixtures[listing.venueId]?.description ?? null,
        websiteUrl: null,
        phoneE164: fixture.phoneE164,
        amenities: [],
        openingHours: fixture.weeklyHours.flatMap((entry) =>
          entry.blocks.map((block) => ({
            day: entry.day,
            opensAt: block.opensAt,
            closesAt: block.closesAt,
            closesNextDay: block.closesAt <= block.opensAt,
          })),
        ),
        gallery: [],
        tableCount: floors.get(branchId)?.tables.length ?? 0,
        acceptsWebBookings: fixture.acceptsWebBookings,
        acceptsAppBookings: acceptsAppBookings(branchId),
        // Newest first written, hidden reviews left out (K8).
        recentReviews: reviewStore.visible(branchId).slice(0, 3).map(toPublicReview),
        // The mock floor has no photo positions, so nothing is placed on a photo.
        tableMarkers: [],
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
      };
    },

    async getBranchTableMarkers(branchId): Promise<BranchTableMarkers | null> {
      await wait();
      if (!findBranch(branchId)) return null;
      return { branchId, photo: null, asOfUtc: now().toISOString(), tables: [] };
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
      return publishedVenues().find((venue) => venue.id === venueId) ?? null;
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

    async getSlotFloor({ branchId, slotUtc, partySize }) {
      await wait();
      return slotFloorFor(branchId, slotUtc, partySize);
    },

    async requestPhoneCode(phoneE164, _options) {
      await wait();
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
      accounts.setPassword(me(), command);
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
     * own number), then everything erased at once. The bookings stay for the
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
      } else {
        if (!code) {
          throw validationFailed(url, [
            {
              field: 'code',
              message: 'Confirm with the code sent to your phone.',
              bound: 'required',
            },
          ]);
        }
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
      requireVerifiedPhone(url);

      // Idempotency first: a retry of the same command must not book twice.
      const existingId = commandLog.get(command.commandId);
      if (existingId) {
        const existing = bookings.get(existingId);
        if (existing) return existing;
      }

      const found = findBranch(command.branchId);
      const floor = floors.get(command.branchId);
      // A 404, as the server answers an unknown branch or table.
      if (!found || !floor) throw new NotFoundError({ url: `${URL_TAG}/api/reservations` });
      const policy = DEFAULT_POLICY;

      // K9: the app channel needs the switch on and a reviewed policy.
      if (command.channel === 'app' && !acceptsAppBookings(command.branchId)) {
        throw new BookingsNotAcceptedError({ url, branchId: command.branchId });
      }

      const table = floor.tables.find((t) => t.id === command.tableId);
      if (!table) throw new NotFoundError({ url: `${URL_TAG}/api/reservations` });

      const slot = new Date(command.slotUtc);

      // The branch-wide rules first, as the server applies them. Lead time:
      // the slot may have become too soon while they were deciding.
      const rejection = branchRejection(slot, policy);
      if (rejection === 'pastLeadTime') {
        throw new LeadTimeExceededError({
          url: URL_TAG,
          leadTimeMinutes: policy.leadTimeMinutes,
          earliestSlotUtc: new Date(
            now().getTime() + policy.leadTimeMinutes * 60_000,
          ).toISOString(),
        });
      }
      if (rejection) {
        throw new BookingRejectedError({
          url: URL_TAG,
          reason: rejection,
          partySize: command.partySize,
        });
      }

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

        throw new TableTakenError({
          url: URL_TAG,
          tableId: table.id,
          tableLabel: table.label,
          reason: refusal === 'occupied' ? 'occupied' : 'alreadyBooked',
          // The room at this slot, as the server's 409 carries it.
          floor: slotFloorFor(command.branchId, command.slotUtc, command.partySize)?.plan ?? null,
        });
      }
      if (refusal) {
        throw new BookingRejectedError({
          url: URL_TAG,
          reason: refusal,
          partySize: command.partySize,
        });
      }

      const status: BookingStatus =
        command.partySize > policy.instantConfirmationMaxPartySize
          ? 'pendingApproval'
          : 'confirmed';

      const id = `bk_${sequence}`;
      const booking: Booking = {
        id,
        code: reservationCode(sequence++),
        status,
        venueName: found.venue.name,
        branchId: found.branch.id,
        branchName: found.branch.name,
        timeZoneId: found.branch.timeZoneId,
        tableId: table.id,
        tableLabel: table.label,
        partySize: command.partySize,
        slotUtc: command.slotUtc,
        endUtc: new Date(slot.getTime() + policy.turnMinutes * 60_000).toISOString(),
        freeCancellationUntilUtc: new Date(
          slot.getTime() - policy.freeCancellationMinutes * 60_000,
        ).toISOString(),
        cancelledAtUtc: null,
        cancelledAfterDeadline: false,
        note: note === '' ? null : note,
        // The mock issues one for every booking, so the manage-booking page is
        // walkable from the app's own flow too. See `publicMock.ts` for what
        // the token is and, more importantly, what it is not.
        manageToken: `mbk_${id}`,
      };

      bookings.set(id, booking);
      commandLog.set(command.commandId, id);
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

      return booking;
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
      return { upcoming, past };
    },

    async getBooking(bookingId) {
      await wait();
      return bookings.get(bookingId) ?? null;
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
        return booking;
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

      const floor = floors.get(booking.branchId);
      if (floor) {
        floors.set(booking.branchId, {
          ...floor,
          tables: floor.tables.map((t) =>
            t.id === booking.tableId ? { ...t, state: 'free', nextReservationStartUtc: null } : t,
          ),
        });
      }

      return cancelled;
    },

    // --- Scanning in and the shared tab -----------------------------------

    async scanTableCode(command: ScanTableCommand): Promise<ScanResult> {
      await wait();
      requireClientCommandId(`${URL_TAG}/api/tabs/open`, command.commandId);
      const result = world.scan(command);
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

      return { kind: result.kind, tab: dinerViewOf(result.tab) };
    },

    async joinTab(command): Promise<ScanResult> {
      await wait();
      const result = world.join(command);
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
    }): Promise<WaiterCall> {
      await wait();
      return world.call(input);
    },

    // --- Ordering and the bill ---------------------------------------------

    async getBranchMenuDetail(branchId): Promise<BranchMenu | null> {
      await wait();
      const type = venueTypeFor(branchId);
      // Complete items only. The server applies this and the mock did not, so
      // a screen built against the mock was being handed items with empty
      // allergen lists that production would never send.
      return type ? publishedBranchMenu(mockBranchMenu(branchId, type)) : null;
    },

    async getDinerTab(tabId): Promise<DinerTabView | null> {
      await wait();
      const tab = readableTab(tabId);
      return tab ? dinerViewOf(tab) : null;
    },

    async getTabEvents({ tabId, afterSequence }): Promise<TabEventPage> {
      await wait();
      const tab = world.get(tabId);
      if (tab) orders.ensure(tab.id, tab.branchId);
      return orders.events(tabId, afterSequence);
    },

    async placeOrder(command): Promise<PlaceOrderResult> {
      await wait();
      const tab = readableTab(command.tabId);
      if (!tab) throw new NotFoundError({ url: `/api/tabs/${command.tabId}/orders` });
      // The ordering policy, as the server applies it: a bare 403 for anybody
      // not approved, not allowed to order, or on a tab no longer open.
      if (!dinerViewOf(tab).me.canOrderNow) {
        throw new ForbiddenError({ url: `${URL_TAG}/api/tabs/${command.tabId}/orders` });
      }
      requireClientCommandId(
        `${URL_TAG}/api/tabs/${command.tabId}/orders`,
        command.clientCommandId,
      );
      return orders.place(tab, command);
    },

    async getTabShares(tabId): Promise<TabShares | null> {
      await wait();
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
      return orders.dinerView(tab, tab.yourParticipantId);
    },
  };
}
