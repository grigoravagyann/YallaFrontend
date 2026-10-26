import { branchDayKey, instantFromZonedClock, type TimeZone } from '@yalla/format';
import {
  APPROVAL_EXPIRED_CODE,
  type ConsoleBooking,
  type DecideReservationCommand,
} from '../../contracts/approvals';
import { slugify } from '../../slug';
import type {
  ConsoleBranch,
  ConsoleStaffMember,
  ConsoleUser,
  ConsoleVenue,
  BookingStatusCounts,
  BranchBookingsSummary,
  ConsoleVenueDetail,
  ManagedBranch,
  ManagedVenue,
  Page,
  SubscriptionTier,
  UserRole,
  VenueBranchTier,
  VenueReadinessIssue,
  VenueBookingsSummary,
  VenueStatus,
  VenueType,
} from '../../contracts/console';
import { OutOfScopeError } from '../../contracts/errors';
import {
  type ApiError,
  ConcurrencyConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../errors';
import {
  ReservationNotStartedError,
  StaffPermissionError,
  StaffPinTakenError,
  NoShowUndoWindowClosedError,
} from '../../contracts/errors';
import { assignableRoles, branchBindingFor } from '../../contracts/staff';
import type { StaffDevice, StaffMember, StaffShift } from '../../contracts/staff';
import type { BranchPublicProfile } from '../../contracts/publicProfile';
import type { BranchReadiness } from '../../contracts/readiness';
import {
  MAX_MODERATION_TEXT,
  REVIEW_MODERATION_FILTERS,
  summariseReviews,
  type ModeratedReview,
  type ModeratedReviewPage,
  type SetReviewVisibilityCommand,
  type VenueModeratedReview,
  type VenueReviewQuery,
} from '../../contracts/reviews';
import { createMockReviewStore, type MockReviewStore, type StoredReview } from '../reviewStore';
import { invalidRequest, validationFailed, type MockViolation } from '../problems';
import {
  DEFAULT_TAKEAWAY_SETTINGS,
  type TakeawaySettings,
  type TakeawaySettingsInput,
} from '../../contracts/takeaway';
import { type MessageSettings } from '../../contracts/messages';
import { createMockMessageHistory } from '../messageHistory';
import { createMockActivity } from '../activity';
import { addDayKeys, createMockShiftStore } from '../shiftStore';
import { approvalExpiryFor, localDateAndTime } from '../approvalWindow';
import {
  STATUS_AFTER,
  type ConsoleBookingActionCommand,
  type ConsoleBookingActionResult,
  type OverviewBooking,
} from '../../contracts/branchOverview';
import {
  isCancelled,
  seedTodayBookings,
  walkInTable,
  type OverviewTable,
} from '../branchOverviewMock';
import { publicBranchFixtures } from '../publicVenues';
import { type VenueListing } from '../../contracts/listing';
import type { StaffRole } from '../../contracts/console';
import type { VenueSession, VenueStaffProfile } from '../../contracts/venueAccount';
import {
  type NotReadyBranch,
  type OutboxHealth,
  type PlatformActivityEntry,
  type PlatformOverview,
  type VenueCount,
  type VenueTierMix,
} from '../../contracts/platformHome';
import type { AdminMenuCategory, AdminMenuItem, Photo } from '../../contracts/menuAdmin';
import type { SpiceLevel } from '../../contracts/ordering';
import type {
  HoursBlock,
  ReservationPolicy,
  SpecialDay,
  WeeklyHours,
} from '../../contracts/branchSettings';
import {
  SPECIAL_DAY_HORIZON_DAYS,
  WEEK_ORDER,
  defaultPolicyFor,
  toMinutes,
} from '../../contracts/branchSettings';
import { mockBranchMenu, mockPhoto } from '../menuDetail';
import type { EditorFloorArea, EditorFloorPlan, EditorFloorTable } from '../../contracts/floorPlan';
import { createMockReports } from '../reports';
import { mockRegistry, type MockRegistry } from '../mockRegistry';
import { fixtureStaffFor } from '../staffFixture';
import { mockVenues } from '../venues';
import {
  DEFAULT_PRE_ORDER_SETTINGS,
  preOrderDueAtUtc,
  preOrderLockedAtUtc,
  type PreOrder,
  type PreOrderSettings,
  type PreOrderSettingsInput,
} from '../../contracts/preOrder';
import { demoCoverThumbnail, demoVenues } from '../consoleDemoVenues';
import { noShowUndoableUntil, type BookingBlock } from '../../contracts/guestRecord';
import { ProblemCodes } from '../../generated/problemCodes';

/** `PinTakenException.Sentence`, word for word. */
const PIN_TAKEN = 'Somebody who signs in on this tablet already uses that PIN. Choose another.';

/** `StaffMember.BranchManagerNeedsBranch`, word for word. */
const BRANCH_MANAGER_NEEDS_BRANCH = 'A branch manager works at one branch. Choose it.';

/** `StaffMember.GeneralManagerHasNoBranch`, word for word. */
const GENERAL_MANAGER_HAS_NO_BRANCH =
  'A general manager runs every branch, so leave the branch empty.';

export const URL_TAG = 'mock://yalla/console';

/** The branch the activity boards are seeded for (2026-10-24). */
const ACTIVITY_BRANCH = 'b-lumen-north';

/** The boards' three waiters, at one branch: Aram, Lilit and Gor. */
function activityWaiters(venueId: string, branchId: string): StaffMember[] {
  return [
    ['aram', 'Aram Petrosyan', '+37477501001'],
    ['lilit', 'Lilit Avetisyan', '+37477501002'],
    ['gor', 'Gor Melkonyan', '+37477501003'],
  ].map(([key, fullName, phone]) => ({
    id: `${branchId}-act-${key}`,
    venueId,
    branchId,
    fullName: fullName!,
    phone: phone!,
    role: 'waiter',
    isActive: true,
    email: null,
    hasPasswordSignIn: false,
    isPinLocked: false,
  }));
}

// ---------------------------------------------------------------------------
// The menu editor, opening hours and the reservation policy
// ---------------------------------------------------------------------------

/**
 * The stand-in for an item that has no photo yet.
 *
 * The server requires one, so this shape cannot come off the wire — but a mock
 * that refused to represent an unfinished item would make the completeness
 * filter, which is the whole point of the onboarding screen, unreachable. The
 * empty id is what {@link storedItemGaps} keys on.
 */
const NO_PHOTO: Photo = {
  photoId: '',
  thumbnailUrl: '',
  cardUrl: '',
  fullUrl: '',
  width: null,
  height: null,
};

/** Eight megabytes, matching `PhotoRules.MaxUploadBytes`. */
export const MOCK_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** `FieldLengths` on the server, for the listing form. */
export const CUISINE_MAX = 120;

export const ABOUT_MAX = 2000;

export const URL_MAX = 2048;

export const ADDRESS_MAX = 400;

/** Both moderation lists page by 20, the public reviews route's size. */
const REVIEW_PAGE_SIZE = 20;

/** Absolute http or https, as `Uri.TryCreate(…, UriKind.Absolute)` plus the scheme check reads it. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Bookings the policy screen reports as falling outside a tightened rule.
 *
 * Fixed ids rather than a simulation of the booking table: the point of the
 * report is that a number appears and does not go away, and that branch of the
 * screen is unreachable without one.
 */
export const MOCK_AFFECTED_RESERVATIONS: readonly string[] = [
  'res-mock-1',
  'res-mock-2',
  'res-mock-3',
];

/** The labels the server's bounds messages open with. */
export const POLICY_LABELS: Readonly<Record<string, string>> = {
  turnTimeMinutes: 'Turn time',
  bufferMinutes: 'Buffer',
  graceMinutes: 'Grace period',
  lateNudgeAfterMinutes: 'Late nudge delay',
  graceExtensionMinutes: 'Grace extension',
  minLeadMinutes: 'Minimum lead time',
  bookingWindowDays: 'Booking window',
  cancellationDeadlineMinutes: 'Cancellation deadline',
  walkInHoldbackMinutes: 'Walk-in holdback',
  serviceChargePercent: 'Service charge',
};

export interface MockItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceDram: number;
  ingredients: string;
  allergens: string;
  portionSize: string;
  spiceLevel: SpiceLevel;
  prepMinutes: number;
  /** Null for an item seeded incomplete, which is what the to-do list is for. */
  photoId: string | null;
  isAvailable: boolean;
  displayOrder: number;
  /** Excluded from pre-orders by the branch's settings: the dish's own flag, as on the server. */
  excludedFromPreOrder?: boolean;
  /** "Only in the hall": `availableForTakeaway: false` (2026-10-22). */
  notForTakeaway?: boolean;
}

export interface MockCategory {
  id: string;
  name: string;
  displayOrder: number;
  items: MockItem[];
}

/** Two blocks on one day that overlap. Touching is allowed; overlapping is not. */
export function overlapsWithin(blocks: readonly HoursBlock[]): boolean {
  const spans = blocks
    .map((block) => {
      const opens = toMinutes(block.opensAt);
      const closes = toMinutes(block.closesAt);
      if (opens < 0 || closes < 0) return null;
      // A block that crosses midnight is measured forward from its opening, so
      // 22:00–01:00 is 22:00–25:00 and can be compared with an ordinary span.
      return { start: opens, end: closes <= opens ? closes + 1440 : closes };
    })
    .filter((span): span is { start: number; end: number } => span !== null)
    .sort((a, b) => a.start - b.start);

  for (let index = 1; index < spans.length; index += 1) {
    const previous = spans[index - 1]!;
    const current = spans[index]!;
    if (current.start < previous.end) return true;
  }
  return false;
}

export const DEFAULT_PAGE_SIZE = 10;

/** `System.DayOfWeek` names, as the server's opening-hours refusal spells them. */
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface VenueRecord {
  id: string;
  name: string;
  slug: string;
  type: VenueType;
  status: VenueStatus;
  /**
   * Switched off (`isActive` false), apart from a suspension: the server keeps
   * the two separately, and lifting a suspension leaves a switched-off venue off.
   */
  switchedOff?: boolean;
  createdAtUtc: string;
  suspendedAtUtc: string | null;
  branches: ConsoleBranch[];
  staff: ConsoleStaffMember[];
  /**
   * What the venues list shows beside the name for a demo venue
   * (`consoleDemoVenues.ts`): rating, cuisine, district and the cover. Absent
   * for the shared fixture and for created venues, whose list columns are
   * read from the mock's own reviews, listing and public profile instead.
   */
  demo?: {
    readonly rating: number | null;
    readonly reviewCount: number;
    readonly cuisine: string;
    readonly district: string;
    readonly coverThumbnailUrl: string | null;
  };
}

export interface ConsoleMockOptions {
  readonly now?: () => Date;
  readonly latencyMs?: number;
  /**
   * Who the mock says is signed in. Real deployments read this from the token;
   * the console's dev role switcher passes it here so every tier can be
   * walked without an account for each. `manager` is a branch manager, at the
   * first branch of the first venue; `generalManager` runs that whole venue.
   */
  readonly role?: UserRole;
  /**
   * The review store, shared with a diner mock so what a diner writes there is
   * moderated here. Absent: a store seeded with placeholder reviews in every
   * moderation state (reported, hidden by the venue, hidden by the platform).
   */
  readonly reviews?: MockReviewStore;
  /**
   * Where sign-in links and enrolment codes are left for the auth mocks to
   * find, across a reload. The shared browser-backed one when absent.
   */
  readonly registry?: MockRegistry | undefined;
  /**
   * Pre-orders (2026-10-21), for mock mode: Northern Avenue takes them (the
   * gata excluded), and one of its bookings waiting for approval carries one.
   * Off unless asked: every branch then starts at the server's default — off.
   */
  readonly seedPreOrders?: boolean | undefined;
  /**
   * Takeaway (2026-10-22), for mock mode: Northern Avenue takes takeaway
   * orders (staff accept, 20 min, 30 min, 5 at once) and its matnakash eggs
   * are "only in the hall". Off unless asked: every branch starts off.
   */
  readonly seedTakeaway?: boolean | undefined;
  /**
   * Activity history (2026-10-24), for mock mode: Northern Avenue gets the
   * boards' three waiters (Aram, Lilit, Gor) beside its manager, so its
   * History and Results read like the boards. The history itself is always
   * there, made of whoever works at the branch.
   */
  readonly seedActivity?: boolean | undefined;
}

/**
 * The mock platform admin's password, for Settings' "Change password": mock
 * mode signs nobody in, so this is only what the current-password field is
 * checked against. Changing it there changes it for the session.
 */
export const MOCK_PLATFORM_PASSWORD = 'yalla-mock-admin-0000';

/**
 * The mock owner's, general manager's and branch manager's password, for My
 * account's "Change password": checked like the admin's, and changed for the
 * session by a change there.
 */
export const MOCK_VENUE_PASSWORD = 'yalla-mock-venue-0000';

/** The roles that have a My account page: a password sign-in to the venue console. */
const VENUE_ACCOUNT_ROLES: readonly UserRole[] = ['owner', 'generalManager', 'manager'];

/** Monday first: Friday and Saturday are the busy nights. */
const WEEKDAY_SHARE = [0.1, 0.11, 0.11, 0.14, 0.2, 0.21, 0.13];

/** Both tiers across the fixture so the list column is not one repeated value. */
function tierFor(index: number): SubscriptionTier {
  return index % 2 === 0 ? 'paid' : 'free';
}

/**
 * The console mock's world: every venue, branch, menu, booking, review and person it holds, and the helpers the gateway's methods share. One per `createConsoleMockGateway`; the methods, by feature, are in this folder.
 */
export function createConsoleMockContext(options: ConsoleMockOptions = {}) {
  const now = options.now ?? (() => new Date());

  const latency = options.latencyMs ?? 0;

  const role: UserRole = options.role ?? 'platformAdmin';

  const reviewStore = options.reviews ?? createMockReviewStore({ now, seed: true });

  const registry = options.registry ?? mockRegistry;

  /**
   * `multiplier` exists for the reports.
   *
   * The menu report anti-joins a branch's whole menu against the period's order
   * lines and is comfortably the slowest of the five against a real database.
   * Letting the mock answer it as fast as everything else would mean its
   * loading state — the one that will actually be seen in production — is the
   * one nobody ever looks at while building the screen.
   */
  const wait = (multiplier = 1) =>
    latency > 0
      ? new Promise((resolve) => setTimeout(resolve, latency * multiplier))
      : Promise.resolve();

  const venues = new Map<string, VenueRecord>();

  let sequence = 0;

  /** `/api/platform/me`: the one platform admin. The email is fixed by configuration. */
  const admin = {
    staffMemberId: 'u-platform',
    fullName: 'Yalla team',
    email: 'admin@yalla.am',
    password: MOCK_PLATFORM_PASSWORD,
  };

  /**
   * `/api/venue/me*`: the signed-in venue staff member's own account. A name
   * they changed, by their staff id — absent, the role's seeded name stands —
   * so one person's rename never reaches another's row; the other sign-ins are
   * seeded on first read, relative to `now`.
   */
  const venueSelf: {
    names: Map<string, string>;
    password: string;
    others: VenueSession[] | null;
  } = { names: new Map(), password: MOCK_VENUE_PASSWORD, others: null };

  /** The signed-in venue staff member's name: theirs if they changed it, else the seeded one. */
  const selfName = (staffMemberId: string, seeded: string) =>
    venueSelf.names.get(staffMemberId) ?? seeded;

  /** The activity feed, newest first: a short seeded history, then what is done here. */
  const activity: PlatformActivityEntry[] = [];

  let activitySeeded = false;

  /** The venues the fixture ships with; only these come with a staff roster. */
  const FIXTURE_VENUE_IDS = new Set(mockVenues.map((venue) => venue.id));

  // --- The menu, the week and the policy, per branch ---------------------------

  const menus = new Map<string, MockCategory[]>();

  /**
   * Each branch's pre-order switch and minutes (2026-10-21). The exclusions
   * live on the dishes (`excludedFromPreOrder`), as on the server, so a
   * deleted dish needs no clean-up. Absent: off, 30 minutes.
   */
  const preOrderSwitches = new Map<
    string,
    Pick<PreOrderSettingsInput, 'acceptsPreOrders' | 'minutesBefore'>
  >();

  if (options.seedPreOrders) {
    preOrderSwitches.set('b-lumen-north', { acceptsPreOrders: true, minutesBefore: 30 });
  }

  /**
   * Each branch's takeaway settings (2026-10-22). The hall-only dishes live on
   * the dishes (`notForTakeaway`), as on the server. Absent: the default, off.
   */
  const takeawaySettings = new Map<string, TakeawaySettingsInput>();

  if (options.seedTakeaway) {
    takeawaySettings.set('b-lumen-north', {
      enabled: true,
      autoAccept: false,
      prepMinutes: 20,
      lastOrderMinutes: 30,
      maxInProgress: 5,
    });
  }

  /** Each branch's message settings (2026-10-23). Absent: the server's default. */
  const messageSettings = new Map<string, MessageSettings>();

  /**
   * A year of each branch's guest threads (2026-10-24), seeded on first read
   * relative to `now`. Read only: the console never writes or marks read.
   */
  const messageHistory = createMockMessageHistory({
    now,
    branch: (branchId) => {
      const venueId = venueOfBranch(branchId);
      if (venueId === null) return null;
      return {
        timeZoneId: branchTimeZone(branchId),
        venueName: venues.get(venueId)?.name ?? '',
      };
    },
    branchIds: () => allBranches().map((branch) => branch.id),
  });

  /**
   * A month of each branch's activity (2026-10-24), seeded on first read
   * relative to `now`, made of the branch's own people. Read only.
   */
  const branchActivity = createMockActivity({
    now,
    timeZoneOf: (branchId) => (venueOfBranch(branchId) === null ? null : branchTimeZone(branchId)),
    staffAt: (branchId) => {
      const venueId = venueOfBranch(branchId);
      if (venueId === null) return [];
      return staffFor(venueId).filter(
        (member) => member.isActive && (member.branchId === null || member.branchId === branchId),
      );
    },
  });

  function takeawaySettingsOf(branchId: string): TakeawaySettings {
    return { ...DEFAULT_TAKEAWAY_SETTINGS, ...takeawaySettings.get(branchId) };
  }

  function preOrderSettingsOf(branchId: string): PreOrderSettings {
    const switches = preOrderSwitches.get(branchId);
    return {
      ...DEFAULT_PRE_ORDER_SETTINGS,
      ...switches,
      excludedMenuItemIds: menuFor(branchId)
        .flatMap((category) => category.items)
        .filter((item) => item.excludedFromPreOrder === true)
        .map((item) => item.id),
    };
  }

  const hours = new Map<string, WeeklyHours>();

  /** Special days per branch, history included, earliest first. */
  const specialDays = new Map<string, SpecialDay[]>();

  const policies = new Map<string, ReservationPolicy>();

  const profiles = new Map<string, BranchPublicProfile>();

  const photosById = new Map<string, Photo>();

  const uploadedPhotos = new Map<string, Photo>();

  /**
   * photoId → the branch it was uploaded for. The gallery and the cover accept
   * only their own branch's photos; a foreign one is "not found here", as on
   * the server, where `Photos.BranchId` is part of the lookup.
   */
  const photoBranch = new Map<string, string>();

  /** Branches whose reservation policy somebody has saved, for the readiness answer. */
  const policyReviewed = new Set<string>();

  /** Items the fixture pretends have been ordered, so deletion is refused. */
  const orderedItemIds = new Set<string>();

  let mockSequence = 0;

  const nextId = (prefix: string) => `${prefix}-${(mockSequence += 1)}`;

  /**
   * The demo branches' menus, by how many dishes are unfinished
   * (`consoleDemoVenues.ts`). Every other dish there is complete, so the
   * count the Paid refusal quotes is exactly the seeded one: Mountain View's
   * four, and none at Sunset Lounge, which may go Paid.
   */
  const demoMenuGaps = new Map<string, number>();

  /** Demo branches with no opening hours yet. */
  const demoNoHours = new Set<string>();

  /** Bookings in a typical week, per demo branch; the rest are derived from their tables. */
  const demoBookingRate = new Map<string, number>();

  /**
   * A branch's own web address, where the console was given one. A branch
   * named in Armenian slugifies to nothing, so the name cannot stand in for it.
   */
  const branchSlugs = new Map<string, string>();

  const slugOf = (branch: ConsoleBranch) => branchSlugs.get(branch.id) ?? slugify(branch.name);

  /** A branch's menu, seeded from the shared fixture on first read. */
  function menuFor(branchId: string): MockCategory[] {
    const existing = menus.get(branchId);
    if (existing) return existing;

    const gaps = demoMenuGaps.get(branchId);
    let dish = 0;
    const seeded: MockCategory[] = mockBranchMenu(branchId, 'cafe').categories.map(
      (category, categoryIndex) => ({
        id: category.id,
        name: category.name,
        displayOrder: categoryIndex,
        items: category.items.map((item, itemIndex) => {
          const unfinished = gaps === undefined ? null : dish++ < gaps;
          return {
            id: item.id,
            categoryId: category.id,
            name: item.name,
            // A demo menu is finished in every detail but the photo, so its
            // unfinished count is the seeded one and nothing else.
            description: item.description || (unfinished === null ? '' : item.name),
            priceDram: item.priceDram,
            ingredients: item.ingredients || (unfinished === null ? '' : item.name),
            allergens: item.allergens || (unfinished === null ? '' : 'None'),
            portionSize: item.portionSize || (unfinished === null ? '' : '1 portion'),
            spiceLevel: item.spiceLevel,
            prepMinutes: item.prepMinutes > 0 || unfinished === null ? item.prepMinutes : 10,
            // Two seeded items have no photo and one has no allergens, so the
            // completeness filter and its count are reachable on first load —
            // which is the state every real venue is in on day one.
            photoId:
              unfinished === null
                ? itemIndex === 0 && categoryIndex === 0
                  ? null
                  : item.photo.photoId
                : unfinished
                  ? null
                  : item.photo.photoId,
            isAvailable: item.isAvailable,
            displayOrder: itemIndex,
          };
        }),
      }),
    );

    for (const category of seeded) {
      for (const item of category.items) {
        if (item.photoId) {
          photosById.set(item.photoId, mockPhoto(item.id));
          photoBranch.set(item.photoId, branchId);
        }
      }
    }
    // The first item of the second category is "on an order": deleting it
    // deactivates rather than removes, and its category cannot be deleted.
    const ordered = seeded[1]?.items[0];
    if (ordered) orderedItemIds.add(ordered.id);
    // Mock mode's pre-order exclusion (2026-10-21): the gata at Northern Avenue.
    if (options.seedPreOrders && branchId === 'b-lumen-north') {
      for (const item of seeded.flatMap((category) => category.items)) {
        if (item.id === 'gata') item.excludedFromPreOrder = true;
      }
    }
    // Mock mode's hall-only dish (2026-10-22): the matnakash eggs at Northern Avenue.
    if (options.seedTakeaway && branchId === 'b-lumen-north') {
      for (const item of seeded.flatMap((category) => category.items)) {
        if (item.id === 'matnakash-eggs') item.notForTakeaway = true;
      }
    }

    menus.set(branchId, seeded);
    return seeded;
  }

  function sortedMenu(categories: readonly MockCategory[]): readonly AdminMenuCategory[] {
    return [...categories].sort((a, b) => a.displayOrder - b.displayOrder).map(toCategory);
  }

  function toCategory(category: MockCategory): AdminMenuCategory {
    return {
      id: category.id,
      name: category.name,
      displayOrder: category.displayOrder,
      items: [...category.items].sort((a, b) => a.displayOrder - b.displayOrder).map(toItem),
    };
  }

  /**
   * An item with no photo cannot exist on the wire — the server requires one —
   * so the mock's incomplete rows carry a placeholder whose id is empty. The
   * completeness check keys on that, exactly as it does against a real API when
   * a draft has not uploaded one yet.
   */
  function toItem(item: MockItem): AdminMenuItem {
    return {
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      priceDram: item.priceDram,
      ingredients: item.ingredients,
      allergens: item.allergens,
      portionSize: item.portionSize,
      spiceLevel: item.spiceLevel,
      prepMinutes: item.prepMinutes,
      photo: item.photoId ? (photosById.get(item.photoId) ?? mockPhoto(item.photoId)) : NO_PHOTO,
      isAvailable: item.isAvailable,
      availableForPreOrder: item.excludedFromPreOrder !== true,
      availableForTakeaway: item.notForTakeaway !== true,
      displayOrder: item.displayOrder,
    };
  }

  /** The same ids, each once, in any order. */
  function isPermutation(ids: readonly string[], all: readonly string[]): boolean {
    return (
      ids.length === all.length &&
      new Set(ids).size === ids.length &&
      all.every((id) => ids.includes(id))
    );
  }

  function requireCategory(branchId: string, categoryId: string): MockCategory {
    const category = menuFor(branchId).find((candidate) => candidate.id === categoryId);
    if (!category) throw new NotFoundError({ url: `${URL_TAG}/menu/${categoryId}` });
    return category;
  }

  /** `MenuItemCompleteness.Rule`: what a diner needs before a dish may be published. */
  function isIncompleteItem(item: MockItem): boolean {
    return (
      item.photoId === null ||
      !item.description ||
      !item.ingredients ||
      !item.allergens ||
      !item.portionSize ||
      item.prepMinutes <= 0
    );
  }

  function requireItem(branchId: string, itemId: string): MockItem {
    for (const category of menuFor(branchId)) {
      const item = category.items.find((candidate) => candidate.id === itemId);
      if (item) return item;
    }
    throw new NotFoundError({ url: `${URL_TAG}/menu/items/${itemId}` });
  }

  /**
   * The coming New Year, as the Hours artboard draws it: the eve open late
   * into the 1st, the 1st and Christmas (the 6th) closed. Dated from the
   * mock's own clock, so the list is never history.
   */
  function specialDaysFor(branchId: string): SpecialDay[] {
    const existing = specialDays.get(branchId);
    if (existing) return existing;
    const today = branchDayKey(now(), branchTimeZone(branchId) as TimeZone);
    const year = Number(today.slice(0, 4));
    const horizon = shiftDate(today, SPECIAL_DAY_HORIZON_DAYS);
    const seeded: SpecialDay[] = [
      {
        date: `${year}-12-31`,
        note: 'New Year’s Eve',
        blocks: [{ opensAt: '18:00', closesAt: '03:00' }],
      },
      { date: `${year + 1}-01-01`, note: 'New Year', blocks: [] },
      { date: `${year + 1}-01-06`, note: 'Christmas', blocks: [] },
    ].filter((day) => day.date <= horizon);
    specialDays.set(branchId, seeded);
    return seeded;
  }

  /** Each branch's special-days revision: a counter, as the server's is today. */
  const specialVersions = new Map<string, number>();

  function specialVersionFor(branchId: string): number {
    return specialVersions.get(branchId) ?? 0;
  }

  /**
   * The list from the branch's service date on: today's on, and — while last
   * night's special block is still running past midnight — yesterday's first.
   */
  function specialDaysFromServiceDate(branchId: string): SpecialDay[] {
    const zone = branchTimeZone(branchId) as TimeZone;
    const today = branchDayKey(now(), zone);
    const yesterday = shiftDate(today, -1);
    return specialDaysFor(branchId).filter((day) => {
      if (day.date >= today) return true;
      if (day.date !== yesterday) return false;
      return day.blocks.some((block) => {
        if (toMinutes(block.closesAt) > toMinutes(block.opensAt)) return false;
        const [year, month, dayOfMonth] = today.split('-').map(Number) as [number, number, number];
        const minutes = toMinutes(block.closesAt);
        const closes = instantFromZonedClock(
          { year, month, day: dayOfMonth, hour: Math.floor(minutes / 60), minute: minutes % 60 },
          zone,
        );
        return now().getTime() < closes.getTime();
      });
    });
  }

  /** `YYYY-MM-DD` moved by whole days. */
  function shiftDate(dateKey: string, days: number): string {
    return new Date(Date.parse(`${dateKey}T12:00:00Z`) + days * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }

  /** A plausible week: open every day, one late night at the weekend. */
  function hoursFor(branchId: string): WeeklyHours {
    const existing = hours.get(branchId);
    if (existing) return existing;

    const seeded: WeeklyHours = WEEK_ORDER.map((day) => ({
      day,
      blocks: demoNoHours.has(branchId)
        ? []
        : day === 0
          ? // Sunday shut, so the "closed" row is on screen from the first load
            // rather than being a state somebody has to construct.
            []
          : [{ opensAt: '09:00', closesAt: day === 5 || day === 6 ? '01:00' : '23:00' }],
    }));
    hours.set(branchId, seeded);
    return seeded;
  }

  /*
   * Staff and devices, per venue and per branch respectively.
   *
   * Two scopes, because that is what the API has: staff belong to a venue (an
   * owner works everywhere) and a tablet is bolted to one counter.
   */
  const staffByVenue = new Map<string, StaffMember[]>();

  /**
   * The PINs this mock was given, by staff member, as plain values.
   *
   * Kept only to answer `pin-taken` as the server does — the server compares
   * hashes; this compares the digits — and never handed back by any read. The
   * fixture's people have none here, as the development seed gives its people
   * "dev-no-pin-set".
   */
  const pins = new Map<string, string>();

  const devicesByBranch = new Map<string, StaffDevice[]>();

  /**
   * A 409 whose `message` is the server's sentence.
   *
   * The staff routes answer a fact about the target — signs in with a PIN,
   * deactivated, address taken — as `conflicting-state`, which the client
   * already maps to {@link ConcurrencyConflictError}. The detail is the thing a
   * screen shows, so the mock has to carry one the way the wire does.
   */
  function conflict(detail: string): ConcurrencyConflictError {
    return new ConcurrencyConflictError({
      url: URL_TAG,
      problem: {
        type: 'about:blank',
        title: 'Conflicting state',
        status: 409,
        detail,
        code: ProblemCodes.ConflictingState,
        traceId: 'mock',
      },
    });
  }

  /**
   * The 422 the endpoint filter answers before the handler runs.
   *
   * `IssueSignInRequest` carries `[Required][EmailAddress][StringLength(320)]`
   * on its one field, and DataAnnotations run ahead of the service — so this
   * is the first refusal on the route whatever the target is, and it names
   * `email` in `context.field` the way the real 422 does.
   */
  function badAddress(detail: string): ValidationError {
    return new ValidationError({
      url: URL_TAG,
      status: 422,
      problem: {
        type: 'about:blank',
        title: 'Validation failed',
        status: 422,
        detail,
        code: ProblemCodes.ValidationFailed,
        traceId: 'mock',
        context: { field: 'email', fields: [{ field: 'email', message: detail }] },
      },
    });
  }

  /** `FieldLengths.Email` on the server: the most an address may be. */
  const EMAIL_MAX_LENGTH = 320;

  /**
   * `StaffRole` as the server's `StaffPermissionException` spells it. The
   * console's vocabulary is camelCase; the sentence a screen shows is not.
   */
  const SERVER_ROLE: Readonly<Record<StaffRole | 'platformAdmin', string>> = {
    platformAdmin: 'PlatformAdmin',
    owner: 'Owner',
    generalManager: 'GeneralManager',
    manager: 'Manager',
    waiter: 'Waiter',
    kitchen: 'Kitchen',
  };

  /** The server's `RequireCanHoldPassword` refusal: about the person, not the caller. */
  const pinOnly = (role: StaffRole) =>
    `A ${SERVER_ROLE[role]} signs in by tapping a PIN on a tablet a manager enrolled, so they cannot ` +
    'have an email and password. Only an owner or a manager uses the admin panel. ' +
    'Create them without credentials, or give them the Manager role.';

  const ADDRESS_TAKEN =
    'That email address already has an account. Every address signs in to one account, ' +
    'so use a different one - or edit the existing account instead.';

  /**
   * Whether an address already signs in to some account, anywhere.
   *
   * The server's rule is the filtered unique index `UX_StaffMembers_Email`
   * over the whole StaffMembers table, so this looks across every venue —
   * seeding each one first, since a venue's people exist only once asked
   * for. A mock that searched the target's own venue alone accepted the very
   * address the server answers 409 to, and every screen test with a
   * cross-venue duplicate passed against it. The person's own address is
   * fine: re-issuing is the normal way to replace a lost link.
   */
  function addressTaken(address: string, exceptId: string | null): boolean {
    for (const id of venues.keys()) staffFor(id);
    return [...staffByVenue.values()].some((people) =>
      people.some((member) => member.id !== exceptId && member.email === address),
    );
  }

  /** A branch's name, for a feed line about something at it. */
  function branchName(branchId: string): string | null {
    for (const record of venues.values()) {
      const branch = record.branches.find((candidate) => candidate.id === branchId);
      if (branch) return branch.name;
    }
    return null;
  }

  function venueOfBranch(branchId: string): string | null {
    for (const record of venues.values()) {
      if (record.branches.some((branch) => branch.id === branchId)) return record.id;
    }
    return null;
  }

  /**
   * Who the mock is acting as.
   *
   * Derived from the signed-in console user rather than assumed, because every
   * role guard below is about the *actor* — a manager sees a different screen
   * from an owner, and a mock that always acted as an owner would let a
   * manager's picker be wrong with every test still passing.
   */
  function actingStaff(venueId: string): {
    id: string;
    role: StaffRole | 'platformAdmin';
    branchId: string | null;
  } {
    if (role === 'platformAdmin')
      return { id: 'u-platform', role: 'platformAdmin', branchId: null };

    // The seeded person this console role corresponds to, so "you cannot edit
    // yourself" has a real row to point at rather than an id nothing matches.
    // Found by the signed-in user's id, which is that row's id.
    const self = staffFor(venueId).find((member) => member.id === currentUser().id);

    return self
      ? { id: self.id, role: self.role, branchId: self.branchId }
      : { id: `u-${role}`, role: 'owner', branchId: null };
  }

  /** The operation sentence `StaffPermissionException` writes: "{op} requires the {role} role; …". */
  function staffPermission(operation: string, required: StaffRole | 'platformAdmin') {
    const actor = role === 'platformAdmin' ? 'platformAdmin' : (role as StaffRole);
    return new StaffPermissionError({
      url: URL_TAG,
      detail: `${operation} requires the ${SERVER_ROLE[required]} role; the caller is a ${SERVER_ROLE[actor]}.`,
    });
  }

  /** `StaffRoleRules.CoversWholeVenue`, plus the platform tier: every branch of the venue. */
  function reachesWholeVenue(actor: { role: StaffRole | 'platformAdmin' }): boolean {
    return (
      actor.role === 'platformAdmin' || actor.role === 'owner' || actor.role === 'generalManager'
    );
  }

  /**
   * `StaffManagementService.RequireReach`: a branch manager acts on — and puts
   * people at — their own branch, and nowhere else. Null is venue-wide, which
   * is further than they reach. Everyone venue-wide passes.
   */
  function requireReach(
    actor: { role: StaffRole | 'platformAdmin'; branchId: string | null },
    branchId: string | null,
    operation: string,
  ): void {
    if (reachesWholeVenue(actor)) return;
    if (actor.branchId === null || branchId !== actor.branchId) {
      throw staffPermission(operation, 'generalManager');
    }
  }

  /**
   * `StaffMember`'s invariants on the role and the branch, checked as a pair:
   * a branch manager names their one branch, a general manager none. A 422
   * `validation-failed` on `branchId`, with the server's sentence.
   */
  function requireBranchSuitsRole(url: string, staffRole: StaffRole, branchId: string | null) {
    const binding = branchBindingFor(staffRole);
    if (binding === 'required' && branchId === null) {
      throw validationFailed(url, [
        { field: 'branchId', message: BRANCH_MANAGER_NEEDS_BRANCH, bound: 'required' },
      ]);
    }
    if (binding === 'venueWide' && branchId !== null) {
      throw validationFailed(url, [
        { field: 'branchId', message: GENERAL_MANAGER_HAS_NO_BRANCH, bound: 'conflict' },
      ]);
    }
  }

  /**
   * `PinTakenException`'s rule: the PIN is refused when somebody else who signs
   * in on the same tablet already uses it. For a person at a branch that is
   * everyone active at that branch and everyone venue-wide; for a venue-wide
   * person, every active person in the venue. Deactivated people do not count.
   */
  function requirePinFree(
    venueId: string,
    subject: { readonly id: string | null; readonly branchId: string | null },
    pin: string,
  ): void {
    const clash = staffFor(venueId).some(
      (member) =>
        member.id !== subject.id &&
        member.isActive &&
        pins.get(member.id) === pin &&
        (subject.branchId === null ||
          member.branchId === null ||
          member.branchId === subject.branchId),
    );
    if (!clash) return;
    throw new StaffPinTakenError({
      url: URL_TAG,
      detail: PIN_TAKEN,
      problem: {
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: PIN_TAKEN,
        code: ProblemCodes.PinTaken,
        traceId: 'mock',
        context: { field: 'pin' },
      },
    });
  }

  /** A venue's people, seeded from the same names the venue fixture uses. */
  function staffFor(venueId: string): StaffMember[] {
    const existing = staffByVenue.get(venueId);
    if (existing) return existing;

    const record = venues.get(venueId);
    const branches = record?.branches ?? [];

    // Only the fixture venues come with people. `PlatformService.CreateVenueAsync`
    // writes the venue and its first branch and nothing else: a venue made in
    // the console starts with nobody, and its first owner is added afterwards.
    // The mock used to relabel Lumen's roster onto every new venue (QA F1).
    if (!FIXTURE_VENUE_IDS.has(venueId)) {
      const empty: StaffMember[] = [];
      staffByVenue.set(venueId, empty);
      return empty;
    }

    // The same people the mock tablet's roster shows; see `staffFixture.ts`.
    const seeded: StaffMember[] = fixtureStaffFor(venueId, record?.name ?? 'venue', branches);
    // The activity boards' waiters (2026-10-24), at Northern Avenue only.
    if (options.seedActivity && branches.some((branch) => branch.id === ACTIVITY_BRANCH)) {
      seeded.push(...activityWaiters(venueId, ACTIVITY_BRANCH));
    }

    staffByVenue.set(venueId, seeded);
    return seeded;
  }

  // --- Shifts -----------------------------------------------------------------

  /** The branch's "today" for its shift lines: its local date. */
  function shiftServiceDate(branchId: string): string {
    return branchDayKey(now(), branchTimeZone(branchId) as TimeZone);
  }

  /** Who works at a branch for the shift model: its people, and the venue-wide ones. */
  function worksAt(member: StaffMember, branchId: string): boolean {
    return member.branchId === branchId || member.branchId === null;
  }

  /**
   * Today and tomorrow for some of a fixture branch's people, so the shift
   * line and the head count have something to say on a first visit: a day
   * shift, an evening one that ends at midnight, tomorrow's, and a day off.
   */
  const shiftStore = createMockShiftStore({
    url: `${URL_TAG}/shifts`,
    nextId: () => nextId('shift'),
    now,
    history: () => conflict('That shift is over: past shifts are kept as they were.'),
    // A shift counts while its person is active and still works at its branch.
    counts: (shift) => {
      const venueId = venueOfBranch(shift.branchId);
      const member = venueId
        ? staffFor(venueId).find((candidate) => candidate.id === shift.staffMemberId)
        : undefined;
      return Boolean(member?.isActive && worksAt(member, shift.branchId));
    },
    endsAtUtc: (shift) => {
      if (!shift.endsAt) return null;
      const [year, month, day] = addDayKeys(shift.date, shift.endsNextDay ? 1 : 0)
        .split('-')
        .map(Number);
      const [hour, minute] = shift.endsAt.split(':').map(Number);
      return instantFromZonedClock(
        {
          year: year ?? 1970,
          month: month ?? 1,
          day: day ?? 1,
          hour: hour ?? 0,
          minute: minute ?? 0,
        },
        branchTimeZone(shift.branchId) as TimeZone,
      ).toISOString();
    },
    seed: (branchId, today) => {
      const venueId = venueOfBranch(branchId);
      if (!venueId) return [];
      const people = staffFor(venueId).filter(
        (member) => member.isActive && member.branchId === branchId,
      );
      const plans: readonly (Omit<
        StaffShift,
        'id' | 'staffMemberId' | 'branchId' | 'endsAtUtc'
      > | null)[] = [
        { date: today, dayOff: false, startsAt: '10:00', endsAt: '19:00', endsNextDay: false },
        { date: today, dayOff: false, startsAt: '16:00', endsAt: '00:00', endsNextDay: true },
        {
          date: addDayKeys(today, 1),
          dayOff: false,
          startsAt: '11:00',
          endsAt: '19:00',
          endsNextDay: false,
        },
        { date: today, dayOff: true, startsAt: null, endsAt: null, endsNextDay: false },
        null,
      ];
      return people.flatMap((member, index) => {
        const plan = plans[index % plans.length];
        return plan ? [{ ...plan, id: nextId('shift'), staffMemberId: member.id, branchId }] : [];
      });
    },
  });

  /**
   * The shift routes' guard: a console caller at this branch, a person who
   * works here and is active, and either the person themselves or somebody
   * the staff rank rule lets manage them (a branch manager at their own
   * branch only).
   */
  function shiftSubject(branchId: string, staffMemberId: string): StaffMember {
    const url = `${URL_TAG}/branches/${branchId}/shifts`;
    requireManagerAtBranch(branchId, url);
    const venueId = venueOfBranch(branchId);
    const subject = venueId
      ? staffFor(venueId).find((member) => member.id === staffMemberId)
      : undefined;
    if (!venueId || !subject || !worksAt(subject, branchId)) throw new NotFoundError({ url });
    const actor = actingStaff(venueId);
    // A branch manager plans their own branch's people: not another branch,
    // and not a venue-wide waiter, who is further than they reach.
    if (
      actor.role === 'manager' &&
      (actor.branchId !== branchId || (actor.id !== subject.id && subject.branchId !== branchId))
    ) {
      throw staffPermission('Planning shifts at another branch', 'generalManager');
    }
    if (actor.id !== subject.id && !assignableRoles(actor.role).includes(subject.role)) {
      throw new StaffPermissionError({
        url,
        detail: `A ${actor.role} cannot plan a ${subject.role}'s shifts.`,
      });
    }
    if (!subject.isActive)
      throw conflict('Reactivate them first: a deactivated person has no shifts.');
    return subject;
  }

  /** A branch's tablets, including one already killed. */
  function devicesFor(branchId: string): StaffDevice[] {
    const existing = devicesByBranch.get(branchId);
    if (existing) return existing;

    const seeded: StaffDevice[] = [
      {
        id: `${branchId}-device-counter`,
        name: 'Counter tablet',
        branchId,
        enrolledAtUtc: '2026-08-21T08:00:00Z',
        lastSeenAtUtc: new Date(Date.now() - 4 * 60_000).toISOString(),
        isRevoked: false,
        kind: 'tablet',
        boundStaffMember: null,
        revokedAtUtc: null,
      },
      {
        id: `${branchId}-device-old`,
        name: 'Old iPad (left in a taxi)',
        branchId,
        enrolledAtUtc: '2026-07-02T09:30:00Z',
        lastSeenAtUtc: '2026-08-14T22:10:00Z',
        // Revoked and still listed: the list is an audit trail, not a roster.
        isRevoked: true,
        kind: 'tablet',
        boundStaffMember: null,
        revokedAtUtc: '2026-08-15T09:00:00Z',
      },
    ];

    // One waiter's own phone, so the Phones tab of a fixture branch is not
    // empty on first look (the Devices artboard has some paired, some not).
    const venueId = venueOfBranch(branchId);
    const waiter = venueId
      ? staffFor(venueId).find(
          (member) => member.role === 'waiter' && member.isActive && member.branchId === branchId,
        )
      : undefined;
    if (waiter) {
      seeded.push({
        id: `${branchId}-phone-${waiter.id}`,
        name: 'iPhone · Safari',
        branchId,
        enrolledAtUtc: '2026-10-20T15:00:00Z',
        lastSeenAtUtc: new Date(Date.now() - 12 * 60_000).toISOString(),
        isRevoked: false,
        kind: 'phone',
        boundStaffMember: { id: waiter.id, fullName: waiter.fullName, role: waiter.role },
        revokedAtUtc: null,
        platform: 'iphone',
        browser: 'safari',
      });
    }

    devicesByBranch.set(branchId, seeded);
    return seeded;
  }

  /**
   * The phones the mock staff app paired at this branch (`staffAuthMock`'s
   * pairing, from a code `createPhonePairing` issued), as the console's list
   * shows them.
   */
  function pairedPhonesFor(branchId: string): StaffDevice[] {
    const venueId = venueOfBranch(branchId);
    const people = venueId ? staffFor(venueId) : [];
    return registry.devices
      .values()
      .filter((device) => device.kind === 'phone' && device.branchId === branchId)
      .map((device) => {
        const person = people.find((member) => member.id === device.boundStaffMemberId);
        return {
          id: device.deviceId,
          name: device.deviceName,
          branchId,
          enrolledAtUtc: device.enrolledAtUtc,
          lastSeenAtUtc: device.lastSeenAtUtc ?? device.enrolledAtUtc,
          isRevoked: device.revokedAtUtc !== null,
          kind: 'phone' as const,
          boundStaffMember: person
            ? { id: person.id, fullName: person.fullName, role: person.role }
            : null,
          revokedAtUtc: device.revokedAtUtc,
          platform: device.platform ?? null,
          browser: device.browser ?? null,
        };
      });
  }

  /** Every branch in the fixture, flattened once for the report scope lookups. */
  function allBranches(): readonly ConsoleBranch[] {
    return [...venues.values()].flatMap((venue) => venue.branches);
  }

  /*
   * The report generator reads the world rather than inventing one.
   *
   * `menuOf` matters most: the never-ordered list has to name items the menu
   * editor actually has, or the "one tap to act on it" link goes nowhere — and
   * that link is the entire reason the block earns its prominence.
   */
  const reports = createMockReports({
    menuOf: (branchId) =>
      menuFor(branchId).flatMap((category) =>
        category.items.map((item) => ({
          id: item.id,
          name: item.name,
          categoryName: category.name,
          priceDram: item.priceDram,
        })),
      ),
    branchIdsFor: (branchId, rollUpVenue) => {
      if (!rollUpVenue) return [branchId];
      const venue = [...venues.values()].find((record) =>
        record.branches.some((branch) => branch.id === branchId),
      );
      return venue?.branches.map((branch) => branch.id) ?? [branchId];
    },
    timeZoneOf: (branchId) =>
      allBranches().find((branch) => branch.id === branchId)?.timeZoneId ?? 'Asia/Yerevan',
  });

  function policyFor(branchId: string): ReservationPolicy {
    const existing = policies.get(branchId);
    if (existing) return existing;
    const seeded = defaultPolicyFor('cafe');
    policies.set(branchId, seeded);
    return seeded;
  }

  /**
   * A branch's public settings, in the state every real venue starts in: no
   * number published, bookings off until somebody says otherwise, no picture.
   */
  function profileFor(branchId: string): BranchPublicProfile {
    const existing = profiles.get(branchId);
    if (existing) return existing;
    // One world: the switch starts where the public page's fixture has it, so
    // the console cannot say "off" above a page that takes bookings (QA F5).
    // A branch with no fixture starts off, as every real branch does.
    const seeded: BranchPublicProfile = {
      phoneE164: null,
      acceptsWebBookings: publicBranchFixtures[branchId]?.acceptsWebBookings ?? false,
      coverPhoto: null,
    };
    profiles.set(branchId, seeded);
    return seeded;
  }

  /**
   * The diner app listing, empty the way a new branch's is, at the address and
   * pin its own fixture has — so a relocation is a change from *this* branch's
   * place, not from one pin every branch shared. A branch created in the mock
   * has no fixture and starts in central Yerevan.
   */
  const listings = new Map<string, VenueListing>();

  function listingFor(branchId: string): VenueListing {
    const existing = listings.get(branchId);
    if (existing) return existing;
    const fixture = publicBranchFixtures[branchId];
    const located =
      fixture !== undefined && fixture.latitude !== null && fixture.longitude !== null;
    const seeded: VenueListing = {
      cuisine: null,
      about: null,
      priceLevel: null,
      websiteUrl: null,
      amenities: [],
      address: fixture?.addressLine ?? '12 Abovyan Street, Yerevan',
      district: fixture?.district ?? null,
      latitude: located ? fixture.latitude! : 40.1843,
      longitude: located ? fixture.longitude! : 44.5129,
      gallery: [],
    };
    listings.set(branchId, seeded);
    return seeded;
  }

  // --- Bookings waiting for approval ------------------------------------------

  /**
   * Every booking the mock knows about, by id, whatever its state.
   *
   * Kept after a decision rather than deleted, because the server keeps them
   * too: a second approve of the same booking is a 409 naming it as already
   * confirmed, not a 404, and the panel's "somebody else decided first" case
   * depends on that difference.
   */
  const bookings = new Map<string, ConsoleBooking>();

  let bookingsSeeded = false;

  /** `Yalla.Domain.Enums.ReservationStatus` member names, as the 409 spells them. */
  const SERVER_STATUS: Readonly<Record<ConsoleBooking['status'], string>> = {
    pendingApproval: 'PendingApproval',
    confirmed: 'Confirmed',
    seated: 'Seated',
    completed: 'Completed',
    cancelledByDiner: 'CancelledByDiner',
    cancelledByVenue: 'CancelledByVenue',
    noShow: 'NoShow',
    unknown: 'Unknown',
  };

  /**
   * The fixture: the two busy Lumen branches and Tumanyan each have somebody
   * waiting, the rest have nobody. Party sizes over the shipped threshold of
   * eight are what the policy tab's rule stops; the two-top is a diner the
   * rolling no-show threshold caught, which is the other way a booking waits.
   * Lumen North also has a short-notice two-top for this evening, made a
   * minute ago, so the panel's countdown has a window to count down.
   */
  function seedBookings(): void {
    if (bookingsSeeded) return;
    bookingsSeeded = true;

    const tomorrow = new Date(now().getTime() + 24 * 60 * 60 * 1000);
    const localDate = tomorrow.toISOString().slice(0, 10);
    const seed = (
      branchId: string,
      suffix: string,
      guest: {
        name: string;
        phone: string;
        party: number;
        table: string;
        time: string;
        note?: string;
      },
      because: ConsoleBooking['awaitingApprovalBecause'],
      /** How the guest kept their bookings; absent: no proved account behind it. */
      record?: { came: number; noShows?: number; late?: number; takeaway?: number },
    ) => {
      const id = `r-${branchId.replace(/^b-/u, '')}-${suffix}`;
      bookings.set(id, {
        id,
        code: `${branchId.slice(2, 4).toUpperCase()}${suffix.toUpperCase()}${guest.party}`,
        branchId,
        guestName: guest.name,
        guestPhone: guest.phone,
        partySize: guest.party,
        tableLabel: guest.table,
        localDate,
        localStartTime: guest.time,
        status: 'pendingApproval',
        awaitingApprovalBecause: because,
        approvalExpiresAtUtc: null,
        note: guest.note ?? null,
        guestRecord: record
          ? {
              booked: record.came + (record.noShows ?? 0) + (record.late ?? 0),
              came: record.came,
              noShows: record.noShows ?? 0,
              lateCancellations: record.late ?? 0,
              unmarked: 0,
              isNewGuest: record.came + (record.noShows ?? 0) + (record.late ?? 0) === 0,
              takeawayNoShows: record.takeaway ?? 0,
              blockedUntilUtc: null,
            }
          : null,
      });
    };

    // Two hours from now at the branch, asked for a minute ago.
    const soon = new Date(now().getTime() + 2 * 60 * 60_000);
    soon.setUTCMinutes(soon.getUTCMinutes() < 30 ? 0 : 30, 0, 0);
    const madeAt = new Date(now().getTime() - 60_000);
    bookings.set('r-lumen-north-0', {
      id: 'r-lumen-north-0',
      code: 'LUSN2',
      branchId: 'b-lumen-north',
      guestName: 'Mariam Hakobyan',
      guestPhone: '+374 77 45 67 89',
      partySize: 2,
      tableLabel: 'W1',
      ...localDateAndTime(soon.toISOString(), 'Asia/Yerevan'),
      status: 'pendingApproval',
      awaitingApprovalBecause: 'shortNotice',
      approvalExpiresAtUtc: approvalExpiryFor(madeAt, soon.toISOString()),
      note: null,
      guestRecord: {
        booked: 6,
        came: 6,
        noShows: 0,
        lateCancellations: 0,
        unmarked: 0,
        isNewGuest: false,
        takeawayNoShows: 0,
        blockedUntilUtc: null,
      },
    });

    seed(
      'b-lumen-north',
      '1',
      {
        name: 'Ani Grigoryan',
        phone: '+374 91 12 34 56',
        party: 10,
        table: 'W3',
        time: '19:00:00',
        note: 'A birthday. A quiet corner if possible.',
      },
      'largeParty',
      { came: 0 },
    );
    seed(
      'b-lumen-north',
      '2',
      {
        name: 'Davit Hovhannisyan',
        phone: '+374 93 65 43 21',
        party: 2,
        table: 'B1',
        time: '20:30:00',
      },
      'noShowHistory',
      { came: 5, noShows: 2, takeaway: 1 },
    );
    seed(
      'b-lumen-north',
      '3',
      {
        name: 'Narek Avagyan',
        phone: '+374 98 76 54 32',
        party: 4,
        table: 'W2',
        time: '20:00:00',
      },
      'branchApprovesEveryBooking',
      { came: 11, noShows: 1 },
    );
    if (options.seedPreOrders) {
      // Ani's party of ten, waiting for the venue, has chosen dishes ahead.
      const seeded = bookings.get('r-lumen-north-1');
      if (seeded) bookings.set(seeded.id, { ...seeded, preOrder: seededPreOrder(seeded) });
    }
    seed(
      'b-lumen-cascade',
      '1',
      {
        name: 'Lilit Sargsyan',
        phone: '+374 99 11 22 33',
        party: 12,
        table: 'T2',
        time: '18:30:00',
      },
      'largeParty',
    );
    seed(
      'b-tumanyan-main',
      '1',
      {
        name: 'Karen Petrosyan',
        phone: '+374 94 77 88 99',
        party: 9,
        table: 'H4',
        time: '21:00:00',
      },
      'largeParty',
    );
  }

  /** Mock mode's pre-order on a pending booking: two dishes, editable until two hours before. */
  function seededPreOrder(booking: ConsoleBooking): PreOrder {
    const startUtc = new Date(
      `${booking.localDate}T${booking.localStartTime.slice(0, 5)}:00+04:00`,
    ).toISOString();
    const lines = [
      {
        id: 'po-seed-l1',
        menuItemId: 'cappuccino',
        name: 'Cappuccino',
        unitPriceDram: 1200,
        quantity: 6,
        note: null,
      },
      {
        id: 'po-seed-l2',
        menuItemId: 'cheesecake',
        name: 'Cheesecake',
        unitPriceDram: 2200,
        quantity: 2,
        note: 'With candles',
      },
    ].map((line) => ({
      ...line,
      lineTotalDram: line.unitPriceDram * line.quantity,
      availableNow: true,
    }));
    return {
      id: `po-${booking.id}`,
      reservationId: booking.id,
      state: 'editable',
      lines,
      note: 'Coffee as soon as we sit down',
      totalDram: lines.reduce((sum, line) => sum + line.lineTotalDram, 0),
      editableUntilUtc: preOrderLockedAtUtc(startUtc),
      dueAtUtc: preOrderDueAtUtc(startUtc, preOrderSettingsOf(booking.branchId).minutesBefore),
      sentAtUtc: null,
      kitchenStatus: null,
      onTab: false,
      notComingAtUtc: null,
      updatedAtUtc: now().toISOString(),
    };
  }

  /**
   * `ReservationService.RequireManagerForBranchAsync`, as the server applies
   * it: an owner or a general manager may decide anywhere in their own venue,
   * a branch manager only at their branch, a platform admin anywhere. Every refusal is the same 403, with `StaffPermissionException`'s
   * sentence, because the server does not say which rule was hit either.
   */
  function requireManagerForBranch(branchId: string, operation: string): void {
    if (role === 'platformAdmin') return;

    const refusal = () =>
      new ForbiddenError({
        url: `${URL_TAG}/reservations`,
        problem: {
          type: 'about:blank',
          title: 'Forbidden',
          status: 403,
          detail: `${operation} requires the Manager role; the caller is a ${SERVER_ROLE[role]}.`,
          code: ProblemCodes.Forbidden,
          traceId: 'mock',
        },
      });

    if (role !== 'owner' && role !== 'generalManager' && role !== 'manager') throw refusal();

    const venueId = venueOfBranch(branchId);
    if (venueId === null || currentUser().scope.venueId !== venueId) throw refusal();

    const actor = actingStaff(venueId);
    const row = staffFor(venueId).find((member) => member.id === actor.id);
    if (!row || !row.isActive) throw refusal();
    // An owner or a general manager covers every branch; a branch manager theirs.
    if (!reachesWholeVenue(row) && row.branchId !== branchId) throw refusal();
  }

  /**
   * The server's sweep: a short-notice booking whose answer window closed with
   * nobody deciding is declined for want of an answer, and leaves the list.
   */
  function sweepExpired(): void {
    const at = now().getTime();
    for (const booking of bookings.values()) {
      if (
        booking.status === 'pendingApproval' &&
        booking.approvalExpiresAtUtc !== null &&
        at >= new Date(booking.approvalExpiresAtUtc).getTime()
      ) {
        bookings.set(booking.id, {
          ...booking,
          status: 'cancelledByVenue',
          awaitingApprovalBecause: null,
          approvalExpiresAtUtc: null,
        });
      }
    }
  }

  /**
   * Load (404), then the branch rule (403), then the window (409, too late),
   * then the state (409): the server's order.
   */
  function decideBooking(command: DecideReservationCommand, approve: boolean): ConsoleBooking {
    seedBookings();
    const booking = bookings.get(command.reservationId);
    if (!booking) {
      throw new NotFoundError({ url: `${URL_TAG}/reservations/${command.reservationId}` });
    }

    requireManagerForBranch(booking.branchId, approve ? 'Approve a booking' : 'Reject a booking');

    if (
      booking.status === 'pendingApproval' &&
      booking.approvalExpiresAtUtc !== null &&
      now().getTime() >= new Date(booking.approvalExpiresAtUtc).getTime()
    ) {
      sweepExpired();
      throw new ConcurrencyConflictError({
        url: `${URL_TAG}/reservations/${booking.id}`,
        problem: {
          type: 'about:blank',
          title: 'Conflicting state',
          status: 409,
          detail: `The answer window for ${booking.code} has closed; the guest has been told the venue could not confirm in time.`,
          code: APPROVAL_EXPIRED_CODE,
          traceId: 'mock',
        },
      });
    }

    if (booking.status !== 'pendingApproval') {
      throw conflict(
        `Only a pending reservation can be ${approve ? 'confirmed' : 'rejected'}; ${booking.code} is ${SERVER_STATUS[booking.status]}.`,
      );
    }

    const decided: ConsoleBooking = {
      ...booking,
      status: approve ? 'confirmed' : 'cancelledByVenue',
      awaitingApprovalBecause: null,
      approvalExpiresAtUtc: null,
    };
    bookings.set(booking.id, decided);
    return decided;
  }

  // --- Overview -------------------------------------------------------------------

  /** Today's bookings that never waited for approval, per branch, seeded on first read. */
  const todayRows = new Map<string, OverviewBooking[]>();

  function branchTimeZone(branchId: string): string {
    return allBranches().find((branch) => branch.id === branchId)?.timeZoneId ?? 'Asia/Yerevan';
  }

  function overviewTables(branchId: string): OverviewTable[] {
    return floorPlanFor(branchId).tables.map((table) => ({
      id: table.id,
      label: table.label,
      seats: table.seats,
      isActive: table.isActive,
      status: table.status,
    }));
  }

  function todayRowsFor(branchId: string): OverviewBooking[] {
    let rows = todayRows.get(branchId);
    if (!rows) {
      rows = seedTodayBookings({
        branchId,
        timeZoneId: branchTimeZone(branchId),
        now: now(),
        tables: overviewTables(branchId),
        turnTimeMinutes: policyFor(branchId).turnTimeMinutes,
      });
      todayRows.set(branchId, rows);
    }
    return rows;
  }

  /**
   * A booking that went through approval, as a row of today's list: the
   * approvals store is the one place its status lives, so deciding it there
   * moves it here too. A declined one is cancelled by the venue, and the list
   * leaves it out with every cancelled booking.
   */
  function approvalRowsFor(branchId: string): OverviewBooking[] {
    const zone = branchTimeZone(branchId) as TimeZone;
    const today = branchDayKey(now(), zone);
    const plan = floorPlanFor(branchId);
    const turn = policyFor(branchId).turnTimeMinutes;
    return [...bookings.values()]
      .filter((booking) => booking.branchId === branchId && booking.localDate === today)
      .map((booking) => {
        const [year, month, day] = booking.localDate.split('-').map(Number) as [
          number,
          number,
          number,
        ];
        const [hour, minute] = booking.localStartTime.split(':').map(Number) as [number, number];
        const start = instantFromZonedClock({ year, month, day, hour, minute }, zone);
        const table = plan.tables.find((candidate) => candidate.label === booking.tableLabel);
        return {
          id: booking.id,
          code: booking.code,
          status: booking.status,
          startUtc: start.toISOString(),
          endUtc: new Date(start.getTime() + turn * 60_000).toISOString(),
          localDate: booking.localDate,
          localStartTime: booking.localStartTime,
          partySize: booking.partySize,
          guestName: booking.guestName,
          tableId: table?.id ?? `tbl-${branchId}-${booking.tableLabel}`,
          tableLabel: booking.tableLabel,
          tableStatus: booking.status === 'seated' ? 'occupied' : 'free',
          roomName: null,
          channel: 'app',
          changeRequested: false,
          holdExpiresAtUtc: null,
          lateNudgeAtUtc: null,
          lateNudgeSent: null,
        } satisfies OverviewBooking;
      });
  }

  /** The action, as `StaffPermissionException` names it in a refusal. */
  const ACTION_OPERATION: Readonly<Record<ConsoleBookingActionCommand['kind'], string>> = {
    seat: 'Seat a booking',
    noShow: 'Mark a booking as a no-show',
    cancel: 'Release a booking',
    finish: 'Free a table',
    undoNoShow: 'Undo a no-show',
  };

  /**
   * The table routes' answers by `clientCommandId`: a repeat is the first
   * answer again, as on the server. (A release is a replay by the booking's
   * state instead, below.)
   */
  const actionReplies = new Map<string, ConsoleBookingActionResult>();

  function tableRefusal(code: string, detail: string): ApiError {
    const problem = {
      type: 'about:blank',
      title: 'Conflicting state',
      status: 409,
      detail,
      code,
      traceId: 'mock',
    };
    return new ConcurrencyConflictError({ url: `${URL_TAG}/tables`, problem });
  }

  /**
   * The row menu's four actions, with the server's guards in its order: the
   * booking (404), the branch (403), then the state (409, or 422 for a table
   * that cannot take the step). Each moves the booking where its route would,
   * and the table with it.
   *
   * The table routes guard the table, as on the server: seating needs a
   * table nobody sits at (`table-state-conflict`), and finishing names the
   * booking whose sitting ends — a table where somebody else sits now, or
   * nobody, is refused (`table-sitting-changed`).
   */
  /** Guests blocked for no-shows, as the platform admin lists them (review round). */
  const blocks = new Map<string, BookingBlock>();

  let blocksSeeded = false;

  function seedBlocks(): void {
    if (blocksSeeded) return;
    blocksSeeded = true;
    const t = now().getTime();
    const hours = (h: number) => new Date(t + h * 3_600_000).toISOString();
    for (const block of [
      {
        blockId: 'blk-1',
        dinerUserId: 'diner-armen',
        dinerDisplayName: 'Արմեն Դավթյան',
        phoneE164: '+37491555123',
        blockedAtUtc: hours(-20),
        blockedUntilUtc: hours(7 * 24 - 20),
        liftedAtUtc: null,
      },
      {
        blockId: 'blk-2',
        dinerUserId: 'diner-gone',
        dinerDisplayName: null,
        phoneE164: '+37477000222',
        blockedAtUtc: hours(-90),
        blockedUntilUtc: hours(7 * 24 - 90),
        liftedAtUtc: null,
      },
    ] satisfies BookingBlock[]) {
      blocks.set(block.blockId, block);
    }
  }

  function actOnTodayBooking(command: ConsoleBookingActionCommand): ConsoleBookingActionResult {
    const replayed = actionReplies.get(command.clientCommandId);
    if (replayed) return { ...replayed, wasReplay: true };

    seedBookings();
    sweepExpired();
    const own = todayRowsFor(command.branchId);
    const approvals = approvalRowsFor(command.branchId);
    const all = [...own, ...approvals];
    const index = own.findIndex((row) => row.id === command.reservationId);
    const row = all.find((entry) => entry.id === command.reservationId);
    if (!row) {
      throw new NotFoundError({ url: `${URL_TAG}/reservations/${command.reservationId}` });
    }

    requireManagerForBranch(command.branchId, ACTION_OPERATION[command.kind]);

    const live = all.filter((entry) => !isCancelled(entry));
    const sitting = live.find(
      (entry) => entry.status === 'seated' && entry.tableId === command.tableId,
    );
    const walkIn = walkInTable(overviewTables(command.branchId), all);
    const someoneElseSits =
      (sitting !== undefined && sitting.id !== row.id) || walkIn?.id === command.tableId;
    const status = SERVER_STATUS[row.status];

    // Undo a no-show marked by mistake, until 05:00 the next morning: back to
    // confirmed; one already undone answers as it stands; anything else is
    // `conflicting-state` (guest record review round).
    if (command.kind === 'undoNoShow') {
      if (row.status !== 'noShow' && row.status !== 'confirmed') {
        throw conflict(`Only a no-show can be undone; ${row.code} is ${status}.`);
      }
      if (row.status === 'noShow') {
        const until = noShowUndoableUntil(row.startUtc, branchTimeZone(command.branchId));
        if (now().getTime() > until.getTime()) {
          throw new NoShowUndoWindowClosedError({
            url: `${URL_TAG}/reservations/${row.id}/undo-no-show`,
            undoableUntilUtc: until.toISOString(),
          });
        }
        const undone: OverviewBooking = { ...row, status: 'confirmed' };
        if (index >= 0) own[index] = undone;
      }
      return {
        kind: command.kind,
        reservationId: row.id,
        status: 'confirmed',
        wasReplay: row.status === 'confirmed',
        tableLabel: row.tableLabel,
        tableFreed: false,
        outstandingDram: null,
      };
    }

    // A release of a booking already released answers as a replay, whatever
    // the click asked for: the stored outcome, the table untouched (VC2 wire 2.1).
    if (
      command.kind !== 'seat' &&
      command.kind !== 'finish' &&
      (row.status === 'noShow' || row.status === 'cancelledByVenue')
    ) {
      return {
        kind: command.kind,
        reservationId: row.id,
        status: row.status,
        wasReplay: true,
        tableLabel: row.tableLabel,
        tableFreed: false,
        outstandingDram: null,
      };
    }

    if (command.kind === 'finish') {
      // Named booking: freed only while the sitting open there is that
      // booking's — not somebody seated since, not an empty table.
      if (someoneElseSits || sitting === undefined || row.status !== 'seated') {
        throw tableRefusal(
          'table-sitting-changed',
          `Table ${row.tableLabel} is not ${row.code}'s sitting any more.`,
        );
      }
    } else {
      if (row.status !== 'confirmed') {
        throw conflict(
          command.kind === 'seat'
            ? `Only a confirmed reservation can be seated; ${row.code} is ${status}.`
            : `Only a confirmed reservation can be released; ${row.code} is ${status}.`,
        );
      }
      if (command.kind === 'seat' && (someoneElseSits || sitting !== undefined)) {
        throw tableRefusal('table-state-conflict', `Table ${row.tableLabel} is occupied.`);
      }
      // FT2 wire: no no-show before the booking's start; nothing changes.
      if (command.kind === 'noShow' && Date.parse(row.startUtc) > now().getTime()) {
        throw new ReservationNotStartedError({
          url: `${URL_TAG}/reservations/${row.id}/no-show`,
          reservationId: row.id,
          startUtc: row.startUtc,
        });
      }
    }

    const next = STATUS_AFTER[command.kind];
    // A no-show or a cancellation frees the table only when it was held for this booking.
    const tableFreed =
      command.kind === 'finish' || (command.kind !== 'seat' && row.tableStatus === 'held');
    // Seating at another table than the booked one moves the booking there, as on the floor.
    const seatedAt =
      command.kind === 'seat'
        ? overviewTables(command.branchId).find((table) => table.id === command.tableId)
        : undefined;
    const moved: OverviewBooking = {
      ...row,
      ...(seatedAt ? { tableId: seatedAt.id, tableLabel: seatedAt.label } : {}),
      status: next,
      tableStatus: command.kind === 'seat' ? 'occupied' : tableFreed ? 'free' : row.tableStatus,
      holdExpiresAtUtc: null,
    };
    if (index >= 0) own[index] = moved;
    else {
      const stored = bookings.get(row.id);
      if (stored) bookings.set(row.id, { ...stored, status: next });
    }

    const result: ConsoleBookingActionResult = {
      kind: command.kind,
      reservationId: row.id,
      status: next,
      wasReplay: false,
      tableLabel: row.tableLabel,
      tableFreed,
      outstandingDram: null,
    };
    if (command.kind === 'seat' || command.kind === 'finish') {
      actionReplies.set(command.clientCommandId, result);
    }
    return result;
  }

  mockVenues.forEach((venue, venueIndex) => {
    const branches: ConsoleBranch[] = venue.branches.map((branch, branchIndex) => ({
      id: branch.id,
      venueId: venue.id,
      name: branch.name,
      timeZoneId: branch.timeZoneId,
      tableCount: branch.totalTables,
      subscriptionTier: tierFor(venueIndex + branchIndex),
      // One branch in the fixture is mid-service, so "cannot delete, table 7 has
      // an open tab" is a state the screen can actually be driven into.
      openTabCount: venue.id === 'v-lumen' && branchIndex === 0 ? 2 : 0,
    }));

    const staff: ConsoleStaffMember[] = [
      {
        id: `${venue.id}-owner`,
        displayName: 'Aram Sargsyan',
        role: 'owner',
        branchId: null,
      },
      ...branches.map((branch, i) => ({
        id: `${branch.id}-manager`,
        displayName: ['Nare Petrosyan', 'Tigran Avetisyan', 'Lilit Grigoryan'][i % 3] ?? 'Manager',
        role: 'manager' as const,
        branchId: branch.id,
      })),
    ];

    venues.set(venue.id, {
      id: venue.id,
      name: venue.name,
      slug: slugify(venue.name),
      type: venue.type,
      status: venue.id === 'v-tumanyan' ? 'suspended' : 'active',
      createdAtUtc: '2026-06-01T09:00:00Z',
      suspendedAtUtc: venue.id === 'v-tumanyan' ? '2026-08-14T09:00:00Z' : null,
      branches,
      staff,
    });
  });

  // The Venues artboard's world, after the shared fixture: see
  // `consoleDemoVenues.ts` for what each one is there to show.
  for (const demo of demoVenues) {
    for (const seed of demo.branches) {
      demoMenuGaps.set(seed.id, seed.unfinishedDishes);
      if (!seed.hours) demoNoHours.add(seed.id);
      branchSlugs.set(seed.id, seed.slug);
      demoBookingRate.set(seed.id, seed.bookingsPerWeek);
      listings.set(seed.id, {
        ...listingFor(seed.id),
        address: seed.address,
        district: seed.district,
        cuisine: demo.cuisine,
      });
    }
    venues.set(demo.id, {
      id: demo.id,
      name: demo.name,
      slug: demo.slug,
      type: demo.type,
      status: demo.status,
      createdAtUtc: '2026-07-01T09:00:00Z',
      suspendedAtUtc: demo.status === 'suspended' ? '2026-10-02T09:00:00Z' : null,
      branches: demo.branches.map((seed) => ({
        id: seed.id,
        venueId: demo.id,
        name: seed.name,
        timeZoneId: 'Asia/Yerevan',
        tableCount: seed.tableCount,
        subscriptionTier: seed.tier,
        openTabCount: seed.openTabs,
      })),
      staff: [],
      demo: {
        rating: demo.rating,
        reviewCount: demo.reviewCount,
        cuisine: demo.cuisine,
        district: demo.branches[0]?.district ?? '',
        coverThumbnailUrl: demo.cover ? demoCoverThumbnail(demo.name, demo.cover) : null,
      },
    });
  }

  /**
   * The list's readiness line: the first branch with an unmet line, and its
   * first one, in the order a venue is onboarded (tables, menu, hours, cover).
   * Staff, tablets and the policy are on the venue's own checklist, not here.
   */
  function readinessIssueOf(record: VenueRecord): VenueReadinessIssue | null {
    const named = record.branches.length > 1;
    for (const branch of record.branches) {
      const first = branchIssuesOf(record, branch)[0];
      if (first) return { ...first, branchName: named ? branch.name : null };
    }
    return null;
  }

  /**
   * What a guest would find unfinished at one branch, in the server's order
   * (`PlatformRollups.GuestFacingIssues`): tables, the menu, unfinished
   * dishes, the hours, the cover photo.
   */
  function branchIssuesOf(record: VenueRecord, branch: ConsoleBranch): VenueReadinessIssue[] {
    const issues: VenueReadinessIssue[] = [];
    const issue = (kind: VenueReadinessIssue['kind'], count: number | null = null) =>
      issues.push({ kind, count, branchName: null });
    if (branch.tableCount === 0) issue('noTables');
    const items = menuFor(branch.id).flatMap((category) => category.items);
    if (items.length === 0) issue('noMenu');
    const unfinished = items.filter(isIncompleteItem).length;
    if (unfinished > 0) issue('incompleteDishes', unfinished);
    if (!hoursFor(branch.id).some((day) => day.blocks.length > 0)) issue('noHours');
    const covered = record.demo
      ? record.demo.coverThumbnailUrl !== null
      : profileFor(branch.id).coverPhoto !== null;
    if (!covered) issue('noPhoto');
    return issues;
  }

  /** Published reviews across the venue's branches, as the list's rating column reads them. */
  function ratingOf(record: VenueRecord): { rating: number | null; reviewCount: number } {
    if (record.demo) return { rating: record.demo.rating, reviewCount: record.demo.reviewCount };
    const ratings = record.branches.flatMap((branch) =>
      reviewStore.visible(branch.id).map((review) => review.rating),
    );
    if (ratings.length === 0) return { rating: null, reviewCount: 0 };
    const average = ratings.reduce((sum, value) => sum + value, 0) / ratings.length;
    return { rating: Math.round(average * 10) / 10, reviewCount: ratings.length };
  }

  /** The tier the list column shows: the best one any branch is on. */
  /** The server's older rollup: Paid only when every branch is; a mixed venue reads Free. */
  function headlineTier(record: VenueRecord): SubscriptionTier {
    return record.branches.length > 0 &&
      record.branches.every((branch) => branch.subscriptionTier === 'paid')
      ? 'paid'
      : 'free';
  }

  function toRow(record: VenueRecord): ConsoleVenue {
    const first = record.branches[0];
    const listing = first ? listingFor(first.id) : null;
    const cover = first ? profileFor(first.id).coverPhoto : null;
    const branchTiers: VenueBranchTier[] = record.branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      subscriptionTier: branch.subscriptionTier,
    }));
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      type: record.type,
      status: record.status,
      branchCount: record.branches.length,
      tableCount: record.branches.reduce((sum, branch) => sum + branch.tableCount, 0),
      subscriptionTier: headlineTier(record),
      paidBranchCount: record.branches.filter((branch) => branch.subscriptionTier === 'paid')
        .length,
      createdAtUtc: record.createdAtUtc,
      suspendedAtUtc: record.suspendedAtUtc,
      // The list's newer columns, which the mock always reports.
      ...ratingOf(record),
      openTabCount: record.branches.reduce((sum, branch) => sum + (branch.openTabCount ?? 0), 0),
      readinessIssue: readinessIssueOf(record),
      coverThumbnailUrl: record.demo
        ? record.demo.coverThumbnailUrl
        : (cover?.thumbnailUrl ?? null),
      branchTiers,
      cuisine: record.demo ? record.demo.cuisine : (listing?.cuisine ?? null),
      district: record.demo ? record.demo.district : (listing?.district ?? null),
    };
  }

  function toDetail(record: VenueRecord): ConsoleVenueDetail {
    return {
      ...toRow(record),
      // The platform read carries each branch's web address and street address.
      branches: record.branches.map((branch) => ({
        ...branch,
        slug: slugOf(branch),
        address: listingFor(branch.id).address,
      })),
      staff: record.staff,
    };
  }

  /** A small stable number from a string, so the mock's made-up counts never flicker. */
  function hashOf(text: string): number {
    let hash = 7;
    for (const character of text) hash = (hash * 31 + character.charCodeAt(0)) % 100_003;
    return hash;
  }

  /**
   * `PlatformService` venue bookings summary, over a made-up but stable history:
   * a branch books about three times a table a week (a demo branch says its
   * own rate), split by what became of the bookings and by weekday. The
   * counts add up exactly, by status, by branch and by weekday.
   */
  function bookingsSummaryFor(record: VenueRecord, days: 7 | 30): VenueBookingsSummary {
    const split = (total: number): BookingStatusCounts => {
      const upcoming = Math.floor(total * 0.045);
      const pending = Math.min(total - upcoming, Math.floor(total * 0.01) + (total > 0 ? 1 : 0));
      const cancelled = Math.floor(total * 0.085);
      const noShow = Math.floor(total * 0.04);
      return {
        completed: total - upcoming - pending - cancelled - noShow,
        upcoming,
        pending,
        cancelled,
        noShow,
      };
    };
    const byBranch: BranchBookingsSummary[] = record.branches.map((branch) => {
      const perWeek =
        demoBookingRate.get(branch.id) ??
        Math.round(branch.tableCount * (2 + (hashOf(branch.id) % 20) / 10));
      const total = Math.round((perWeek * days) / 7);
      const todayCount = Math.round(perWeek * (WEEKDAY_SHARE[mondayFirst(now())] ?? 0));
      return { branchId: branch.id, name: branch.name, total, todayCount, ...split(total) };
    });
    const total = byBranch.reduce((sum, branch) => sum + branch.total, 0);
    const add = (key: keyof BookingStatusCounts) =>
      byBranch.reduce((sum, branch) => sum + branch[key], 0);
    const byWeekday = WEEKDAY_SHARE.map((share) => Math.floor(total * share));
    // Whatever rounding left over falls on Saturday, the busiest night.
    byWeekday[5] = (byWeekday[5] ?? 0) + total - byWeekday.reduce((a, b) => a + b, 0);
    return {
      venueId: record.id,
      days,
      total,
      byStatus: {
        completed: add('completed'),
        upcoming: add('upcoming'),
        pending: add('pending'),
        cancelled: add('cancelled'),
        noShow: add('noShow'),
      },
      byWeekday,
      averagePartySize:
        total > 0 ? Math.round((2.4 + (hashOf(record.id) % 12) / 10) * 10) / 10 : null,
      byBranch,
    };
  }

  /** 0 Monday … 6 Sunday, in Yerevan. */
  function mondayFirst(date: Date): number {
    const day = new Date(date.getTime() + 4 * 60 * 60 * 1000).getUTCDay();
    return (day + 6) % 7;
  }

  /** `YYYY-MM-DD` in Yerevan, where every mock branch is. */
  function yerevanDate(date: Date): string {
    return new Date(date.getTime() + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function tierMixOf(record: VenueRecord): VenueTierMix {
    const paid = record.branches.filter((branch) => branch.subscriptionTier === 'paid').length;
    if (paid === 0) return 'free';
    return paid === record.branches.length ? 'paid' : 'mixed';
  }

  /** `PlatformOverviewQuery`, over the mock's world: Home in one read. */
  function overviewOf(): PlatformOverview {
    seedBookings();
    const live = [...venues.values()].filter((record) => record.status !== 'deleted');
    const mix = live.map(tierMixOf);
    const count = (wanted: VenueTierMix) => mix.filter((value) => value === wanted).length;

    // Thirty days, oldest first, today last: each branch books at its weekly
    // rate, shared out by weekday, with a stable wobble so no two weeks match.
    const today = now();
    const perDay = Array.from({ length: 30 }, (_, index) => {
      const day = new Date(today.getTime() - (29 - index) * 24 * 60 * 60 * 1000);
      const date = yerevanDate(day);
      const share = WEEKDAY_SHARE[mondayFirst(day)] ?? 0;
      const total = live.reduce(
        (sum, record) =>
          sum +
          record.branches.reduce((branchSum, branch) => {
            const perWeek =
              demoBookingRate.get(branch.id) ??
              Math.round(branch.tableCount * (2 + (hashOf(branch.id) % 20) / 10));
            const wobble = 0.85 + (hashOf(branch.id + date) % 30) / 100;
            return branchSum + Math.round(perWeek * share * wobble);
          }, 0),
        0,
      );
      return { date, count: total };
    });
    const sum = (from: number, to: number) =>
      perDay.slice(from, to).reduce((total, day) => total + day.count, 0);
    const last7Days = sum(23, 30);
    const previous7Days = sum(16, 23);

    const byVenue = (counts: Map<string, number>): VenueCount[] =>
      [...counts.entries()]
        .filter(([, value]) => value > 0)
        .map(([venueId, value]) => ({
          venueId,
          name: venues.get(venueId)?.name ?? venueId,
          count: value,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const pending = new Map<string, number>();
    for (const booking of bookings.values()) {
      if (booking.status !== 'pendingApproval') continue;
      // One whose time has passed is not something anybody can approve.
      const clock =
        booking.localStartTime.length === 5
          ? `${booking.localStartTime}:00`
          : booking.localStartTime;
      const visit = new Date(`${booking.localDate}T${clock}+04:00`).getTime();
      if (!(visit > today.getTime())) continue;
      const venueId = venueOfBranch(booking.branchId);
      if (venueId && venues.get(venueId)?.status !== 'deleted') {
        pending.set(venueId, (pending.get(venueId) ?? 0) + 1);
      }
    }
    const tabs = new Map<string, number>();
    for (const record of live) {
      tabs.set(
        record.id,
        record.branches.reduce((total, branch) => total + (branch.openTabCount ?? 0), 0),
      );
    }
    const counter = (counts: Map<string, number>) => {
      const list = byVenue(counts);
      return { total: list.reduce((total, venue) => total + venue.count, 0), venues: list };
    };

    // Branches a diner can reach, the newest venues first.
    const newest = [...live].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
    const notReady: NotReadyBranch[] = newest
      .filter((record) => record.status === 'active')
      .flatMap((record) =>
        record.branches.flatMap((branch) => {
          const issues = branchIssuesOf(record, branch);
          return issues.length === 0
            ? []
            : [
                {
                  venueId: record.id,
                  venueName: record.name,
                  branchId: branch.id,
                  branchName: branch.name,
                  issues,
                },
              ];
        }),
      );

    return {
      generatedAtUtc: today.toISOString(),
      venues: {
        total: live.length,
        paid: count('paid'),
        mixed: count('mixed'),
        free: count('free'),
        active: live.filter((record) => record.status === 'active').length,
        suspended: live.filter((record) => record.status === 'suspended').length,
        inactive: live.filter((record) => record.status === 'inactive').length,
        deleted: venues.size - live.length,
        branches: live.reduce((total, record) => total + record.branches.length, 0),
        paidBranches: live.reduce(
          (total, record) =>
            total + record.branches.filter((branch) => branch.subscriptionTier === 'paid').length,
          0,
        ),
      },
      bookings: {
        last7Days,
        previous7Days,
        changePercent:
          previous7Days > 0
            ? Math.round(((last7Days - previous7Days) / previous7Days) * 1000) / 10
            : null,
        labelTimeZoneId: 'Asia/Yerevan',
        perDay,
      },
      pendingApprovals: counter(pending),
      openTabs: counter(tabs),
      notReady: { total: notReady.length, branches: notReady.slice(0, 20) },
      recentVenues: newest.slice(0, 5).map((record) => ({
        id: record.id,
        name: record.name,
        slug: record.slug,
        type: record.type,
        status: record.status,
        tierMix: tierMixOf(record),
        branchCount: record.branches.length,
        paidBranchCount: record.branches.filter((branch) => branch.subscriptionTier === 'paid')
          .length,
        createdAtUtc: record.createdAtUtc,
      })),
      outbox: outboxOf(),
    };
  }

  /**
   * Two messages given up on in the last day, as the Main artboard shows: the
   * alert has something to say in mock mode. There is no retry, by decision.
   */
  function outboxOf(): OutboxHealth {
    const at = (minutesAgo: number) =>
      new Date(now().getTime() - minutesAgo * 60 * 1000).toISOString();
    return {
      pending: 0,
      due: 0,
      failed: 0,
      deadLettered: 2,
      sentLastDay: 118,
      deadLetteredLastDay: 2,
      deadLetters: [
        {
          id: 'dead-letter-1',
          type: 'reservation.reminder',
          lastError: 'Telegram did not answer after 3 attempts.',
          attemptCount: 3,
          scheduledForUtc: at(95),
          deadLetteredAtUtc: at(87),
        },
        {
          id: 'dead-letter-2',
          type: 'reservation.decided',
          lastError: 'Forbidden: bot was blocked by the user.',
          attemptCount: 1,
          scheduledForUtc: at(172),
          deadLetteredAtUtc: at(172),
        },
      ],
    };
  }

  /** Writes one feed line, as the server's audit log does in the change's transaction. */
  function log(
    action: string,
    target: { type: string; id: string; name: string | null },
    venue: VenueRecord | null,
    extra: Partial<Pick<PlatformActivityEntry, 'tierTo' | 'staffRole'>> = {},
  ): void {
    seedActivity();
    activity.unshift({
      id: `activity-${activity.length + 1}`,
      atUtc: now().toISOString(),
      action,
      actor: { id: admin.staffMemberId, role: 'platformAdmin', name: admin.fullName },
      target,
      venue: venue ? { id: venue.id, name: venue.name } : null,
      tierTo: extra.tierTo ?? null,
      staffRole: extra.staffRole ?? null,
    });
  }

  /** A short history before anything is done in this session: a feed is never empty on Home. */
  function seedActivity(): void {
    if (activitySeeded) return;
    activitySeeded = true;
    const at = (hoursAgo: number) =>
      new Date(now().getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
    const list = [...venues.values()].filter((record) => record.status !== 'deleted');
    const byAge = [...list].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
    const seeded: PlatformActivityEntry[] = [];
    const entry = (
      hoursAgo: number,
      action: string,
      record: VenueRecord,
      target: { type: string; id: string; name: string | null },
      actor: PlatformActivityEntry['actor'] = {
        id: admin.staffMemberId,
        role: 'platformAdmin',
        name: admin.fullName,
      },
      extra: Partial<Pick<PlatformActivityEntry, 'tierTo' | 'staffRole'>> = {},
    ) =>
      seeded.push({
        id: `activity-seed-${seeded.length + 1}`,
        atUtc: at(hoursAgo),
        action,
        actor,
        target,
        venue: { id: record.id, name: record.name },
        tierTo: extra.tierTo ?? null,
        staffRole: extra.staffRole ?? null,
      });

    const paid = list.find((record) =>
      record.branches.some((branch) => branch.subscriptionTier === 'paid'),
    );
    const paidBranch = paid?.branches.find((branch) => branch.subscriptionTier === 'paid');
    if (paid && paidBranch) {
      entry(
        2.4,
        'branch.tier-change',
        paid,
        { type: 'Branch', id: paidBranch.id, name: paidBranch.name },
        undefined,
        { tierTo: 'paid' },
      );
    }
    const suspended = list.find((record) => record.status === 'suspended');
    if (suspended) {
      entry(20, 'venue.suspend', suspended, {
        type: 'Venue',
        id: suspended.id,
        name: suspended.name,
      });
    }
    const first = list[0];
    if (first) {
      entry(
        27,
        'staff.create',
        first,
        { type: 'StaffMember', id: `${first.id}-new-manager`, name: 'Mariam Avetisyan' },
        { id: `${first.id}-owner`, role: 'owner', name: 'Aram Sargsyan' },
        { staffRole: 'manager' },
      );
    }
    byAge.slice(0, 2).forEach((record, index) => {
      entry(50 + index * 48, 'venue.create', record, {
        type: 'Venue',
        id: record.id,
        name: record.name,
      });
    });
    seeded.sort((a, b) => b.atUtc.localeCompare(a.atUtc));
    activity.push(...seeded);
  }

  function requirePlatformAdmin(url: string): void {
    if (role !== 'platformAdmin') throw new ForbiddenError({ url });
  }

  /** `VenueStaffAccount`: an owner, a general manager or a branch manager, and nobody else. */
  function requireVenueAccount(url: string): void {
    if (!VENUE_ACCOUNT_ROLES.includes(role)) throw new ForbiddenError({ url });
  }

  /** The signed-in venue staff member, as `GET /api/venue/me` answers. */
  function venueProfile(): VenueStaffProfile {
    const user = currentUser();
    const venueId = user.scope.venueId ?? '';
    const row = staffFor(venueId).find((member) => member.id === user.id);
    return {
      staffMemberId: user.id,
      fullName: user.displayName,
      email:
        row?.email ?? `${role.toLowerCase()}@${slugify(venues.get(venueId)?.name ?? 'venue')}.am`,
      role,
      venueId,
      branchId: role === 'manager' ? (user.scope.branchIds[0] ?? null) : null,
    };
  }

  /** The other sign-ins, seeded once: one from last night, one from last week. */
  function otherSessions(): VenueSession[] {
    if (venueSelf.others) return venueSelf.others;
    const ago = (hours: number) => new Date(now().getTime() - hours * 3_600_000).toISOString();
    venueSelf.others = [
      {
        id: 'session-phone',
        signedInAtUtc: ago(5 * 24),
        lastActiveAtUtc: ago(12),
        isCurrent: false,
      },
      {
        id: 'session-laptop',
        signedInAtUtc: ago(9 * 24),
        lastActiveAtUtc: ago(5 * 24),
        isCurrent: false,
      },
    ];
    return venueSelf.others;
  }

  function requireVenue(venueId: string): VenueRecord {
    const record = venues.get(venueId);
    if (!record) throw new OutOfScopeError({ url: URL_TAG });
    return record;
  }

  /**
   * The scope a token of this role would carry — the **claims**, not the
   * coverage. An owner's token names the venue and no branch (live probe,
   * 2026-09-10), and so does a general manager's; the branches they may work
   * on are `getManagedVenue`'s answer, as on the server.
   */
  function currentUser(): ConsoleUser {
    const firstVenue = [...venues.values()][0];
    const homeBranch = firstVenue?.branches[0]?.id;

    /*
     * The user's id is their **stored staff row**, as the token's `sub` is on
     * the server. The staff screen finds "you" by that id and, when nothing
     * matches, falls back to the first person with your role at the branch
     * on screen — which is how a manager's identity followed the branch
     * filter in the mock (QA F4). The ids follow `staffFor`'s naming so the
     * row exists without seeding it here.
     */
    switch (role) {
      case 'platformAdmin':
        return {
          id: admin.staffMemberId,
          displayName: admin.fullName,
          role,
          scope: { venueId: null, branchIds: [] },
        };
      case 'owner': {
        const id = firstVenue ? `${firstVenue.id}-owner` : 'u-owner';
        return {
          id,
          displayName: selfName(id, 'Aram Sargsyan'),
          role,
          scope: { venueId: firstVenue?.id ?? null, branchIds: [] },
        };
      }
      case 'generalManager': {
        // Venue-wide: the row names no branch, so neither does the token.
        const id = firstVenue ? `${firstVenue.id}-general-manager` : 'u-general-manager';
        return {
          id,
          displayName: selfName(id, 'Hasmik Karapetyan'),
          role,
          scope: { venueId: firstVenue?.id ?? null, branchIds: [] },
        };
      }
      case 'manager': {
        // A branch manager's row always names their branch, and so does the token.
        const id = homeBranch ? `${homeBranch}-manager` : 'u-manager';
        return {
          id,
          displayName: selfName(id, 'Nare Petrosyan'),
          role,
          scope: {
            venueId: firstVenue?.id ?? null,
            branchIds: homeBranch ? [homeBranch] : [],
          },
        };
      }
      default:
        // A waiter or a kitchen account is one branch and no more.
        return {
          id: homeBranch
            ? `${homeBranch}-${role === 'waiter' ? 'waiter-1' : 'kitchen'}`
            : `u-${role}`,
          displayName: role === 'waiter' ? 'Gor Hakobyan' : 'Kitchen',
          role,
          scope: {
            venueId: firstVenue?.id ?? null,
            branchIds: homeBranch ? [homeBranch] : [],
          },
        };
    }
  }

  /**
   * The server's scope rule, as `BranchScoped` and `IStaffBranchGuard` apply
   * it: the branch must belong to the token's venue, and a **branch manager**
   * is refused anywhere but the branch their stored row names — read from the
   * row, as the guard reads it, so a reassignment takes effect at once. Owners,
   * general managers and the platform admin cover every branch.
   */
  function requireBranchInVenue(branchId: string): void {
    if (role === 'platformAdmin') return;
    const url = `${URL_TAG}/branches/${branchId}`;
    const venueId = currentUser().scope.venueId;
    if (venueId === null || venueOfBranch(branchId) !== venueId) {
      throw new ForbiddenError({ url });
    }
    if (role === 'manager') {
      const actor = actingStaff(venueId);
      const row = staffFor(venueId).find((member) => member.id === actor.id);
      const home = row ? row.branchId : (currentUser().scope.branchIds[0] ?? null);
      // One with no branch passes nowhere: the server refuses that row outright.
      if (home === null || home !== branchId) throw new ForbiddenError({ url });
    }
  }

  /**
   * `ReportQuery`'s rollup rule: a rollup crosses branches, so the branch
   * policy no longer covers it, and only an owner, a general manager or the
   * platform tier may ask for one. A branch manager setting the parameter is
   * refused rather than given their own branch.
   */
  function requireRollUp(query: { readonly rollUpVenue?: boolean | undefined }): void {
    if (!query.rollUpVenue) return;
    if (role === 'owner' || role === 'generalManager' || role === 'platformAdmin') return;
    throw new ForbiddenError({
      url: `${URL_TAG}/reports`,
      problem: {
        type: 'about:blank',
        title: 'Forbidden',
        status: 403,
        detail: `Reporting across a venue's branches requires the GeneralManager role; the caller is a ${SERVER_ROLE[role]}.`,
        code: ProblemCodes.Forbidden,
        traceId: 'mock',
      },
    });
  }

  /** `ManagerOrAbove` on top of the branch rule: a waiter or kitchen account is refused. */
  function requireManagerAtBranch(branchId: string, url: string): void {
    if (role === 'waiter' || role === 'kitchen') throw new ForbiddenError({ url });
    requireBranchInVenue(branchId);
  }

  // --- Readiness ----------------------------------------------------------------

  /**
   * `BranchReadinessQuery`, over the mock's own state. The policy line counts
   * only once somebody has **saved** the policy: every branch has a default one,
   * and a checklist that ticked on "a policy loads" ticked for nobody.
   */
  function readinessFor(branchId: string): BranchReadiness {
    const active = floorPlanFor(branchId).tables.filter((table) => table.isActive);
    const categories = menuFor(branchId);
    const items = categories.flatMap((category) => category.items);
    const incomplete = items.filter(isIncompleteItem);
    const openDays = hoursFor(branchId).filter((day) => day.blocks.length > 0).length;
    const venueId = venueOfBranch(branchId);
    const staffCount =
      venueId === null
        ? 0
        : staffFor(venueId).filter(
            (member) =>
              member.isActive && (member.branchId === null || member.branchId === branchId),
          ).length;
    const deviceCount = devicesFor(branchId).filter(
      (device) => !device.isRevoked && device.kind !== 'phone',
    ).length;

    const floorPlanDrawn = active.length > 0;
    const tablesLabelled = floorPlanDrawn && active.every((table) => table.label.trim() !== '');
    const menuCategoriesPresent = categories.length > 0;
    const menuComplete = menuCategoriesPresent && items.length > 0 && incomplete.length === 0;
    const openingHoursSet = openDays > 0;
    const reservationPolicyReviewed = policyReviewed.has(branchId);

    const blockers: string[] = [];
    if (!floorPlanDrawn) blockers.push('The floor plan has no tables on it yet.');
    else if (!tablesLabelled) blockers.push('Some tables have no label printed on them.');
    if (!menuCategoriesPresent) blockers.push('The menu has no categories yet.');
    else if (items.length === 0) blockers.push('The menu has categories but no items.');
    else if (incomplete.length > 0) {
      blockers.push(`${incomplete.length} menu item(s) are missing details diners need.`);
    }
    if (!openingHoursSet) blockers.push('Opening hours have not been set.');
    if (!reservationPolicyReviewed) {
      blockers.push('Nobody has reviewed the reservation policy; it is still on the defaults.');
    }
    if (staffCount === 0) blockers.push('No staff work at this branch yet.');
    if (deviceCount === 0) blockers.push('No tablet has been enrolled at this branch.');

    return {
      branchId,
      isReadyForDiners: blockers.length === 0,
      floorPlanDrawn,
      tableCount: active.length,
      tablesLabelled,
      menuCategoriesPresent,
      menuCategoryCount: categories.length,
      menuItemCount: items.length,
      menuComplete,
      incompleteMenuItemCount: incomplete.length,
      incompleteMenuItemIds: incomplete.map((item) => item.id),
      openingHoursSet,
      openingHoursDayCount: openDays,
      reservationPolicyReviewed,
      staffEnrolled: staffCount > 0,
      staffCount,
      deviceEnrolled: deviceCount > 0,
      deviceCount,
      acceptsWebBookings: profileFor(branchId).acceptsWebBookings,
      blockers,
    };
  }

  // --- Review moderation ------------------------------------------------------------

  function toModerated(review: StoredReview): ModeratedReview {
    return {
      reviewId: review.reviewId,
      branchId: review.branchId,
      rating: review.rating,
      text: review.text,
      authorName: review.authorName,
      dinerUserId: review.dinerUserId,
      createdAtUtc: review.createdAtUtc,
      updatedAtUtc: review.updatedAtUtc,
      hidden: review.hidden,
      hiddenReason: review.hiddenReason,
      hiddenAtUtc: review.hiddenAtUtc,
      hiddenByPlatform: review.hiddenBy === 'platform',
      hiddenByName: review.hiddenBy === 'venue' ? review.hiddenByName : null,
      reply: review.reply,
    };
  }

  /**
   * One page of a branch's reviews for moderation, as both moderation routes
   * answer it: `all` newest written first, `reported` by the newest report,
   * `hidden` the hidden ones; each with how often it was reported.
   */
  function moderationPage(
    url: string,
    branchId: string,
    query: VenueReviewQuery,
  ): ModeratedReviewPage {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? REVIEW_PAGE_SIZE;
    const filter = query.filter ?? 'all';
    if (!Number.isInteger(page) || page < 1) {
      throw invalidRequest(url, 'page', 'The page is 1 or more.');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1) {
      throw invalidRequest(url, 'pageSize', 'The page size is 1 or more.');
    }
    if (!REVIEW_MODERATION_FILTERS.includes(filter)) {
      throw invalidRequest(url, 'filter', 'The filter is all, reported or hidden.');
    }
    const everyReview = reviewStore.all(branchId).map(toVenueModerated);
    const rows = everyReview.filter((review) =>
      // A hidden review is not "reported": the platform already acted on it.
      filter === 'reported'
        ? review.reportCount > 0 && !review.hidden
        : filter === 'hidden'
          ? review.hidden
          : true,
    );
    // The server orders the reported filter by the newest report, then the
    // newest written, then the id, all descending.
    if (filter === 'reported') {
      rows.sort(
        (a, b) =>
          (b.lastReportedAtUtc ?? '').localeCompare(a.lastReportedAtUtc ?? '') ||
          b.createdAtUtc.localeCompare(a.createdAtUtc) ||
          b.reviewId.localeCompare(a.reviewId),
      );
    }
    return {
      ...pageOf(rows, page, pageSize),
      // The whole branch, whatever the filter, as the server sends it.
      summary: summariseReviews(
        everyReview,
        (review) => (review as VenueModeratedReview).reportCount,
        now(),
      ),
    };
  }

  function toVenueModerated(review: StoredReview): VenueModeratedReview {
    const reports = reviewStore.reports(review.reviewId);
    return {
      ...toModerated(review),
      reportCount: reports.length,
      lastReportedAtUtc: reports.reduce<string | null>(
        (latest, report) =>
          latest === null || report.createdAtUtc > latest ? report.createdAtUtc : latest,
        null,
      ),
    };
  }

  function pageOf<T>(rows: readonly T[], page: number, pageSize: number): Page<T> {
    return {
      items: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
    };
  }

  /** The body's rules for both visibility routes: a reason to hide, at most 500 characters. */
  function visibilityReason(url: string, command: SetReviewVisibilityCommand): string | null {
    const reason = command.reason?.trim() ?? '';
    const fields: MockViolation[] = [];
    if (command.hidden && reason === '') {
      fields.push({ field: 'reason', message: 'Say why the review is hidden.', bound: 'required' });
    }
    if (reason.length > MAX_MODERATION_TEXT) {
      fields.push({
        field: 'reason',
        message: `At most ${MAX_MODERATION_TEXT} characters.`,
        bound: 'max',
        max: MAX_MODERATION_TEXT,
      });
    }
    if (fields.length > 0) throw validationFailed(url, fields);
    return reason === '' ? null : reason;
  }

  /** `VenueScoped`: the venue in the route must be the token's. */
  function requireVenueInScope(venueId: string): void {
    if (role === 'platformAdmin') return;
    if (currentUser().scope.venueId !== venueId) {
      throw new ForbiddenError({ url: `${URL_TAG}/venues/${venueId}` });
    }
  }

  /**
   * `GET /api/venues/{venueId}/manage`: coverage from the caller's own staff
   * row, which must be active, in this venue, and an owner, a general manager
   * or a branch manager. A branch manager is given their branch alone.
   */
  function managedVenueFor(venueId: string): ManagedVenue {
    const record = venues.get(venueId);

    const toManaged = (branch: ConsoleBranch): ManagedBranch => ({
      ...branch,
      slug: slugOf(branch),
      // The fixture has no inactive branch; the field is on the wire so the
      // screens are exercised against the real shape.
      isActive: true,
    });
    // The server sorts active first, then by name, then by id. With every
    // fixture branch active the first term would never decide, so it is not
    // written: a comparator no test can turn red is a claim, not a rule.
    const sorted = (branches: readonly ConsoleBranch[]) =>
      branches
        .map(toManaged)
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

    if (role === 'platformAdmin') {
      if (!record) throw new NotFoundError({ url: `${URL_TAG}/venues/${venueId}/manage` });
      return {
        id: record.id,
        name: record.name,
        slug: record.slug,
        type: record.type,
        status: record.status,
        branches: sorted(record.branches),
      };
    }

    // ManagerOrAbove, then VenueScoped. A venue user never learns whether a
    // venue that is not theirs exists.
    if (role !== 'owner' && role !== 'generalManager' && role !== 'manager') {
      throw new ForbiddenError({ url: `${URL_TAG}/venues/${venueId}/manage` });
    }
    requireVenueInScope(venueId);
    if (!record) throw new ForbiddenError({ url: `${URL_TAG}/venues/${venueId}/manage` });

    const actor = actingStaff(venueId);
    const row = staffFor(venueId).find((member) => member.id === actor.id);
    if (
      !row ||
      !row.isActive ||
      (row.role !== 'owner' && row.role !== 'generalManager' && row.role !== 'manager')
    ) {
      throw new ForbiddenError({ url: `${URL_TAG}/venues/${venueId}/manage` });
    }

    const covered = reachesWholeVenue(row)
      ? record.branches
      : record.branches.filter((branch) => branch.id === row.branchId);

    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      type: record.type,
      status: record.status,
      branches: sorted(covered),
    };
  }

  // --- The floor plan the editor works on ------------------------------------

  /**
   * Per-branch working state, seeded from the shared fixture the viewer uses.
   *
   * Held here rather than derived on each call so the editor's save is real:
   * you can draw a room, save it, navigate away and come back to it, which is
   * the whole point of having a mock at all.
   */
  const floorPlans = new Map<string, EditorFloorPlan>();

  /**
   * Which tables the mock pretends have been sat at.
   *
   * Tables 1, 7 and 11 in every branch, so the "deactivated rather than
   * deleted" path is reachable without inventing a booking first. It is the
   * path most likely to be got wrong, and the one a person will hit by accident.
   */
  const tablesWithHistory = new Set<string>();

  function hasHistory(tableId: string): boolean {
    return tablesWithHistory.has(tableId);
  }

  function seedFloorPlan(branchId: string): EditorFloorPlan {
    const areaNames = ['Windows', 'Bar', 'Terrace'];
    const areas: EditorFloorArea[] = areaNames.map((name, index) => ({
      id: `area-${branchId}-${index}`,
      name,
      displayOrder: index,
      // Nobody has photographed the rooms yet; the editor's first job.
      photos: [],
    }));

    const tables: EditorFloorTable[] = Array.from({ length: 12 }, (_, i) => {
      const area = areas[Math.floor(i / 4)] ?? areas[0]!;
      const id = `tbl-${branchId}-${i + 1}`;
      if ([1, 7, 11].includes(i + 1)) tablesWithHistory.add(id);
      return {
        id,
        label: String(i + 1),
        seats: i % 4 === 3 ? 4 : 2,
        floorAreaId: area.id,
        isBookable: true,
        isActive: true,
        isDeletable: !tablesWithHistory.has(id),
        status: 'free',
        qrToken: `qr-${branchId}-${i + 1}`,
        pin: null,
      };
    });

    return { branchId, areas, tables, version: '1' };
  }

  function floorPlanFor(branchId: string): EditorFloorPlan {
    let plan = floorPlans.get(branchId);
    if (!plan) {
      plan = seedFloorPlan(branchId);
      floorPlans.set(branchId, plan);
    }
    return plan;
  }

  function bumped(version: string): string {
    return String((Number.parseInt(version, 10) || 0) + 1);
  }

  /** `RequireUnusedAreaNameAsync`: another room's name, ignoring case and spaces at the ends. */
  function requireUnusedAreaName(
    plan: EditorFloorPlan,
    name: string,
    exceptAreaId: string | null,
    url: string,
  ): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const taken = plan.areas.some(
      (area) =>
        area.id !== exceptAreaId &&
        area.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    );
    if (taken) {
      throw validationFailed(url, [
        {
          field: 'name',
          message: `Area names must be unique within a branch. ${trimmed} is already used.`,
          bound: 'conflict',
        },
      ]);
    }
  }

  /** A photo uploaded for this branch, or `undefined`: the server's `Photos.BranchId` lookup. */
  function branchPhoto(branchId: string, photoId: string): Photo | undefined {
    return photoBranch.get(photoId) === branchId ? photosById.get(photoId) : undefined;
  }

  return {
    actingStaff,
    activity,
    actOnTodayBooking,
    ADDRESS_TAKEN,
    addressTaken,
    admin,
    approvalRowsFor,
    badAddress,
    blocks,
    bookings,
    bookingsSummaryFor,
    branchActivity,
    branchName,
    branchPhoto,
    branchSlugs,
    branchTimeZone,
    bumped,
    conflict,
    currentUser,
    decideBooking,
    devicesFor,
    EMAIL_MAX_LENGTH,
    floorPlanFor,
    floorPlans,
    hasHistory,
    hours,
    hoursFor,
    isIncompleteItem,
    isPermutation,
    listingFor,
    listings,
    log,
    managedVenueFor,
    menuFor,
    messageHistory,
    messageSettings,
    moderationPage,
    nextId,
    now,
    orderedItemIds,
    otherSessions,
    outboxOf,
    overviewOf,
    overviewTables,
    pairedPhonesFor,
    photoBranch,
    photosById,
    pinOnly,
    pins,
    policies,
    policyFor,
    policyReviewed,
    preOrderSettingsOf,
    preOrderSwitches,
    profileFor,
    profiles,
    reachesWholeVenue,
    readinessFor,
    registry,
    reports,
    requireBranchInVenue,
    requireBranchSuitsRole,
    requireCategory,
    requireItem,
    requireManagerAtBranch,
    requirePinFree,
    requirePlatformAdmin,
    requireReach,
    requireRollUp,
    requireUnusedAreaName,
    requireVenue,
    requireVenueAccount,
    requireVenueInScope,
    reviewStore,
    role,
    seedActivity,
    seedBlocks,
    seedBookings,
    get sequence() {
      return sequence;
    },
    set sequence(value) {
      sequence = value;
    },
    SERVER_ROLE,
    shiftDate,
    shiftServiceDate,
    shiftStore,
    shiftSubject,
    slugOf,
    sortedMenu,
    specialDays,
    specialDaysFor,
    specialDaysFromServiceDate,
    specialVersionFor,
    specialVersions,
    staffFor,
    staffPermission,
    sweepExpired,
    takeawaySettings,
    takeawaySettingsOf,
    toCategory,
    todayRowsFor,
    toDetail,
    toItem,
    toModerated,
    toRow,
    toVenueModerated,
    uploadedPhotos,
    venueOfBranch,
    venueProfile,
    venues,
    venueSelf,
    visibilityReason,
    wait,
  };
}

export type ConsoleMockContext = ReturnType<typeof createConsoleMockContext>;
