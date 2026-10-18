import type {
  BookingStatusCounts,
  BookingSummaryDays,
  ConsoleBranch,
  ConsoleVenue,
  ConsoleVenueDetail,
  ManagedBranch,
  ManagedVenue,
  Page,
  SubscriptionTier,
  VenueBookingsSummary,
  VenueBranchTier,
  VenueReadinessIssue,
  VenueStatus,
  VenueType,
} from '../contracts/console';
import type { ApprovalTrigger, ConsoleBooking } from '../contracts/approvals';
import type { ReservationStatusCode } from '../contracts/push';
import type { BranchReadiness } from '../contracts/readiness';
import type { ModeratedReview, VenueModeratedReview } from '../contracts/reviews';
import type { components } from '../generated/schema';
import { venueTypeFromCode } from './venueTypeMapping';

type Schemas = components['schemas'];
type WireReservation = Schemas['Yalla.Application.Reservations.ReservationView'];
type WireModeratedReview = Schemas['Yalla.Application.Reviews.ModeratedReviewView'];
type WireModeratedReviewPage = Schemas['Yalla.Application.Reviews.ModeratedReviewPage'];
type WireVenue = Schemas['Yalla.Application.Platform.VenueSummary'];
type WireBranch = Schemas['Yalla.Application.Platform.BranchSummary'];
type WireDetail = Schemas['Yalla.Application.Platform.VenueDetail'];

/**
 * OpenAPI names a closed generic after its CLR type, so the paged wrapper is
 * spelled `PagedResult\`1[[Yalla.Application.Platform.VenueSummary, …]]`.
 * Naming it once here keeps that mouthful out of the gateway.
 */
type WirePage =
  Schemas['Yalla.Application.Platform.PagedResult`1[[Yalla.Application.Platform.VenueSummary, Yalla.Application, Version=1.0.0.0, Culture=neutral, PublicKeyToken=null]]'];

/**
 * The platform wire shapes to the console's contract types.
 *
 * The backend answers with integer enums, `venueId`/`branchId` keys and three
 * separate booleans where the console reads one status. Every conversion is
 * here so a screen never sees a wire shape, and so a renamed field is one edit.
 */

/** `Yalla.Domain.Enums.VenueType`: 1 Cafe, 2 Restaurant, 3 Bar — the one shared decoder. */
export function venueType(value: number): VenueType {
  return venueTypeFromCode(value);
}

/** `Yalla.Domain.Enums.SubscriptionTier`: 1 Free, 2 Paid. */
export function subscriptionTier(value: number): SubscriptionTier {
  return value === 2 ? 'paid' : 'free';
}

/**
 * Three booleans to one status, deleted first.
 *
 * A deleted venue is also inactive and may also be suspended; the console shows
 * one badge, and the most consequential state has to win or a soft-deleted
 * venue reads as merely suspended.
 */
export function venueStatus(venue: { isDeleted: boolean; isSuspended: boolean }): VenueStatus {
  if (venue.isDeleted) return 'deleted';
  if (venue.isSuspended) return 'suspended';
  return 'active';
}

/**
 * The venues list's newer columns, which `GET /api/platform/venues` is being
 * extended with alongside the console redesign. Not in `generated/schema.ts`
 * yet; every one is optional on the wire, and read only when present.
 *
 * Remove this type once the schema is regenerated with them, and read the
 * fields off {@link WireVenue} directly — a name that differs from the one
 * written here will then fail the typecheck rather than silently map nothing.
 */
interface WireVenueListColumns {
  readonly averageRating?: number | null;
  readonly reviewCount?: number;
  readonly openTabCount?: number;
  readonly readinessIssue?: {
    readonly code: string;
    readonly count?: number | null;
    readonly branchName?: string | null;
  } | null;
  readonly coverThumbnailUrl?: string | null;
  readonly branches?: readonly {
    readonly branchId: string;
    readonly name: string;
    readonly subscriptionTier: number;
  }[];
  readonly cuisine?: string | null;
  readonly district?: string | null;
}

/** The wire's readiness codes, kebab-case as every problem code is. */
const READINESS_KINDS: Readonly<Record<string, VenueReadinessIssue['kind']>> = {
  'no-tables': 'noTables',
  'no-menu': 'noMenu',
  'incomplete-dishes': 'incompleteDishes',
  'no-hours': 'noHours',
  'no-photo': 'noPhoto',
};

function readinessIssueFromWire(
  issue: NonNullable<WireVenueListColumns['readinessIssue']>,
): VenueReadinessIssue {
  return {
    // A reason this client does not know yet is still "not ready", never "ready".
    kind: READINESS_KINDS[issue.code] ?? 'other',
    count: typeof issue.count === 'number' ? issue.count : null,
    branchName: issue.branchName ?? null,
  };
}

/**
 * One venue row. `resolveUrl` makes the cover thumbnail's server-relative
 * link absolute against the API (see `photoUrl.ts`); without it the link is
 * kept as it came.
 */
export function venueFromWire(
  venue: WireVenue,
  resolveUrl: (url: string) => string = (url) => url,
): ConsoleVenue {
  const extra = venue as WireVenue & WireVenueListColumns;
  const has = (key: keyof WireVenueListColumns) => Object.hasOwn(extra, key);
  const branchTiers: VenueBranchTier[] | undefined = extra.branches?.map((branch) => ({
    id: branch.branchId,
    name: branch.name,
    subscriptionTier: subscriptionTier(branch.subscriptionTier),
  }));
  return {
    id: venue.venueId,
    name: venue.name,
    slug: venue.slug,
    type: venueType(venue.type),
    status: venueStatus(venue),
    branchCount: venue.branchCount,
    tableCount: venue.tableCount,
    subscriptionTier: subscriptionTier(venue.subscriptionTier),
    paidBranchCount: venue.paidBranchCount,
    // The platform view does not carry a creation timestamp; the screen omits
    // the line rather than inventing one.
    createdAtUtc: null,
    suspendedAtUtc: venue.suspendedAtUtc ?? null,
    // Absent stays absent: "not reported" must not read as zero or as none.
    ...(has('averageRating') ? { rating: extra.averageRating ?? null } : {}),
    ...(typeof extra.reviewCount === 'number' ? { reviewCount: extra.reviewCount } : {}),
    ...(typeof extra.openTabCount === 'number' ? { openTabCount: extra.openTabCount } : {}),
    ...(has('readinessIssue')
      ? {
          readinessIssue: extra.readinessIssue
            ? readinessIssueFromWire(extra.readinessIssue)
            : null,
        }
      : {}),
    ...(has('coverThumbnailUrl')
      ? { coverThumbnailUrl: extra.coverThumbnailUrl ? resolveUrl(extra.coverThumbnailUrl) : null }
      : {}),
    ...(branchTiers ? { branchTiers } : {}),
    ...(has('cuisine') ? { cuisine: extra.cuisine ?? null } : {}),
    ...(has('district') ? { district: extra.district ?? null } : {}),
  };
}

export function branchFromWire(branch: WireBranch): ConsoleBranch {
  return {
    id: branch.branchId,
    venueId: branch.venueId,
    name: branch.name,
    slug: branch.slug,
    address: branch.address,
    timeZoneId: branch.timeZoneId,
    tableCount: branch.tableCount,
    subscriptionTier: subscriptionTier(branch.subscriptionTier),
    // Open tabs are not part of this view. `null` says "not asked", which is
    // not the same answer as zero.
    openTabCount: null,
  };
}

export function venueDetailFromWire(detail: WireDetail): ConsoleVenueDetail {
  return {
    ...venueFromWire(detail.venue),
    branches: detail.branches.map(branchFromWire),
    // Staff come from a separate venue-scoped endpoint. `null` is "not loaded";
    // an empty array here would render as "nobody has been added yet".
    staff: null,
  };
}

/** `GET /api/venues/{venueId}/manage`: the venue as its own owners and managers may read it. */
export type WireManagedBranch = Schemas['Yalla.Application.Venues.ManagedBranchView'];
export type WireManagedVenue = Schemas['Yalla.Application.Venues.ManagedVenueView'];

export function managedBranchFromWire(branch: WireManagedBranch): ManagedBranch {
  return {
    id: branch.branchId,
    venueId: branch.venueId,
    name: branch.name,
    slug: branch.slug,
    timeZoneId: branch.timeZoneId,
    isActive: branch.isActive,
    tableCount: branch.tableCount,
    subscriptionTier: subscriptionTier(branch.subscriptionTier),
    openTabCount: null,
  };
}

/** The order is the server's: active first, then by name. It is kept, not re-sorted. */
export function managedVenueFromWire(venue: WireManagedVenue): ManagedVenue {
  return {
    id: venue.venueId,
    name: venue.name,
    slug: venue.slug,
    type: venueType(venue.type),
    status: venueStatus(venue),
    branches: venue.branches.map(managedBranchFromWire),
  };
}

export function venuePageFromWire(
  page: WirePage,
  resolveUrl?: (url: string) => string,
): Page<ConsoleVenue> {
  return {
    items: (page.items ?? []).map((venue) => venueFromWire(venue, resolveUrl)),
    total: page.totalCount,
    page: page.page,
    pageSize: page.pageSize,
  };
}

// --- Bookings waiting for approval ------------------------------------------

/**
 * `ReservationStatus`: 1 PendingApproval, 2 Confirmed, 4 Seated, 5 Completed,
 * 6 CancelledByDiner, 7 CancelledByVenue, 8 NoShow. There is no 3 — a retired
 * member, and mapping it would resurrect a state the server removed.
 */
const RESERVATION_STATUS: Readonly<Record<number, ReservationStatusCode>> = {
  1: 'pendingApproval',
  2: 'confirmed',
  4: 'seated',
  5: 'completed',
  6: 'cancelledByDiner',
  7: 'cancelledByVenue',
  8: 'noShow',
};

/** `ApprovalTrigger`: 1 BranchApprovesEveryBooking, 2 LargeParty, 3 NoShowHistory. */
const APPROVAL_TRIGGER: Readonly<Record<number, ApprovalTrigger>> = {
  1: 'branchApprovesEveryBooking',
  2: 'largeParty',
  3: 'noShowHistory',
};

export function consoleBookingFromWire(view: WireReservation): ConsoleBooking {
  return {
    id: view.id,
    code: view.code,
    branchId: view.branchId,
    guestName: view.guestName,
    guestPhone: view.guestPhone,
    partySize: view.partySize,
    tableLabel: view.tableLabel,
    localDate: view.localDate,
    localStartTime: view.localStartTime,
    status: RESERVATION_STATUS[view.status] ?? 'unknown',
    awaitingApprovalBecause:
      view.awaitingApprovalBecause === null || view.awaitingApprovalBecause === undefined
        ? null
        : (APPROVAL_TRIGGER[view.awaitingApprovalBecause] ?? 'unknown'),
    note: view.note ?? null,
  };
}

// --- Readiness ------------------------------------------------------------------

type WireReadiness = Schemas['Yalla.Application.BranchSettings.BranchReadinessView'];

export function readinessFromWire(view: WireReadiness): BranchReadiness {
  return {
    branchId: view.branchId,
    isReadyForDiners: view.isReadyForDiners,
    floorPlanDrawn: view.floorPlanDrawn,
    tableCount: view.tableCount,
    tablesLabelled: view.tablesLabelled,
    menuCategoriesPresent: view.menuCategoriesPresent,
    menuCategoryCount: view.menuCategoryCount,
    menuItemCount: view.menuItemCount,
    menuComplete: view.menuComplete,
    incompleteMenuItemCount: view.incompleteMenuItemCount,
    incompleteMenuItemIds: view.incompleteMenuItemIds ?? [],
    openingHoursSet: view.openingHoursSet,
    openingHoursDayCount: view.openingHoursDayCount,
    reservationPolicyReviewed: view.reservationPolicyReviewed,
    staffEnrolled: view.staffEnrolled,
    staffCount: view.staffCount,
    deviceEnrolled: view.deviceEnrolled,
    deviceCount: view.deviceCount,
    acceptsWebBookings: view.acceptsWebBookings,
    blockers: view.blockers ?? [],
  };
}

// --- Review moderation ------------------------------------------------------------

export function moderatedReviewFromWire(view: WireModeratedReview): ModeratedReview {
  return {
    reviewId: view.reviewId,
    branchId: view.branchId,
    rating: view.rating,
    text: view.text ?? null,
    authorName: view.authorName,
    dinerUserId: view.dinerUserId ?? null,
    createdAtUtc: view.createdAtUtc,
    updatedAtUtc: view.updatedAtUtc,
    hidden: Boolean(view.hidden),
    hiddenReason: view.hiddenReason ?? null,
    hiddenAtUtc: view.hiddenAtUtc ?? null,
    hiddenByPlatform: Boolean(view.hidden) && Boolean(view.hiddenByPlatform),
  };
}

export function venueReviewFromWire(view: WireModeratedReview): VenueModeratedReview {
  return {
    ...moderatedReviewFromWire(view),
    reportCount: view.reportCount ?? 0,
    lastReportedAtUtc: view.lastReportedAtUtc ?? null,
  };
}

export function reviewPageFromWire<T>(
  wire: WireModeratedReviewPage,
  map: (item: WireModeratedReview) => T,
): Page<T> {
  return {
    items: (wire.items ?? []).map(map),
    total: wire.total ?? 0,
    page: wire.page,
    pageSize: wire.pageSize,
  };
}

// --- A venue's bookings, aggregates only ---------------------------------------

/**
 * `GET /api/platform/venues/{venueId}/bookings-summary`, being built with the
 * console redesign: not in `generated/schema.ts` yet. Once it is, replace this
 * with the generated type so a renamed field fails the typecheck.
 */
interface WireStatusCounts {
  readonly completed: number;
  readonly upcoming: number;
  readonly pendingApproval: number;
  readonly cancelled: number;
  readonly noShow: number;
}

export interface WireVenueBookingsSummary {
  readonly venueId: string;
  readonly days: number;
  readonly total: number;
  readonly byStatus: WireStatusCounts;
  /** `System.DayOfWeek` (0 is Sunday) with a count each, or seven counts Monday first. */
  readonly byWeekday: readonly ({ readonly dayOfWeek: number; readonly count: number } | number)[];
  readonly averagePartySize: number | null;
  readonly byBranch: readonly (WireStatusCounts & {
    readonly branchId: string;
    readonly name: string;
    readonly total: number;
  })[];
}

function statusCounts(wire: WireStatusCounts): BookingStatusCounts {
  return {
    completed: wire.completed,
    upcoming: wire.upcoming,
    pending: wire.pendingApproval,
    cancelled: wire.cancelled,
    noShow: wire.noShow,
  };
}

/** Monday first, whichever of the two shapes the week arrived in. */
function weekMondayFirst(wire: WireVenueBookingsSummary['byWeekday']): number[] {
  const week = [0, 0, 0, 0, 0, 0, 0];
  wire.forEach((entry, index) => {
    if (typeof entry === 'number') {
      if (index < 7) week[index] = entry;
      return;
    }
    // System.DayOfWeek: Sunday is 0 and goes last.
    const slot = (entry.dayOfWeek + 6) % 7;
    week[slot] = (week[slot] ?? 0) + entry.count;
  });
  return week;
}

export function venueBookingsSummaryFromWire(wire: WireVenueBookingsSummary): VenueBookingsSummary {
  return {
    venueId: wire.venueId,
    days: (wire.days === 7 ? 7 : 30) as BookingSummaryDays,
    total: wire.total,
    byStatus: statusCounts(wire.byStatus),
    byWeekday: weekMondayFirst(wire.byWeekday ?? []),
    averagePartySize: typeof wire.averagePartySize === 'number' ? wire.averagePartySize : null,
    byBranch: (wire.byBranch ?? []).map((branch) => ({
      branchId: branch.branchId,
      name: branch.name,
      total: branch.total,
      ...statusCounts(branch),
    })),
  };
}
