import type {
  BookingStatusCounts,
  BookingSummaryDays,
  ConsoleBranch,
  ConsoleVenue,
  ConsoleVenueDetail,
  ManagedBranch,
  ManagedVenue,
  Page,
  VenueBookingsSummary,
  VenueBranchFeatures,
  VenueReadinessIssue,
  VenueStatus,
  VenueType,
} from '../contracts/console';
import type { ConsoleBooking } from '../contracts/approvals';
import type { ReservationStatusCode } from '../contracts/push';
import type { BranchReadiness } from '../contracts/readiness';
import type {
  ModeratedReview,
  ModeratedReviewPage,
  VenueModeratedReview,
} from '../contracts/reviews';
import type { components } from '../generated/schema';
import {
  approvalExpiry,
  awaitsEarlierGuestAnswer,
  approvalTrigger,
  type WireReservationWithApproval,
} from './approvalMapping';
import { reviewReplyFromWire, reviewSummaryFromWire } from './reviewReplyMapping';
import { cancellationCause, guestRecordFromWire } from './guestRecordMapping';
import { bookingPreOrderFields, type WireBookingPreOrderFields } from './preOrderMapping';
import { venueTypeFromCode } from './venueTypeMapping';
import { branchFeaturesFromWire } from './branchFeatureMapping';

type Schemas = components['schemas'];
export type WireModeratedReview = Schemas['Yalla.Application.Reviews.ModeratedReviewView'];
/** `summary` optional: a server that predates it (VC4 wire §1) sends none. */
type WireModeratedReviewPage = Omit<
  Schemas['Yalla.Application.Reviews.ModeratedReviewPage'],
  'summary'
> & {
  readonly summary?: Schemas['Yalla.Application.Reviews.ModeratedReviewSummary'];
};
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

/** The wire's readiness codes, kebab-case as every problem code is. */
const READINESS_KINDS: Readonly<Record<string, VenueReadinessIssue['kind']>> = {
  'no-tables': 'noTables',
  'no-menu': 'noMenu',
  'incomplete-dishes': 'incompleteDishes',
  'no-hours': 'noHours',
  'no-photo': 'noPhoto',
};

/** One readiness issue, from the code the server spells it with. */
export function readinessIssueFromWire(issue: {
  readonly code: string;
  readonly count?: number | null | undefined;
  readonly branchName?: string | null | undefined;
}): VenueReadinessIssue {
  return {
    // A reason this client does not know yet is still "not ready", never "ready".
    kind: READINESS_KINDS[issue.code] ?? 'other',
    count: typeof issue.count === 'number' ? issue.count : null,
    branchName: issue.branchName ?? null,
  };
}

/** `VenueStatus`: 1 Active, 2 Suspended, 3 Inactive (switched off), 4 Deleted. */
const STATUS_BY_CODE: Readonly<Record<number, VenueStatus>> = {
  1: 'active',
  2: 'suspended',
  3: 'inactive',
  4: 'deleted',
};

/**
 * The venue's state from the server's `status`, or from the flags when a row
 * has none. A deleted venue is also inactive and may be suspended too; the
 * most consequential state wins.
 */
export function venueStatusFromWire(venue: {
  readonly status?: number | undefined;
  readonly isDeleted: boolean;
  readonly isSuspended: boolean;
}): VenueStatus {
  return (
    (venue.status !== undefined ? STATUS_BY_CODE[venue.status] : undefined) ?? venueStatus(venue)
  );
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
  const branchFeatures: VenueBranchFeatures[] = venue.branches.map((branch) => ({
    id: branch.branchId,
    name: branch.name,
    features: branchFeaturesFromWire(branch.features),
  }));
  return {
    id: venue.venueId,
    name: venue.name,
    slug: venue.slug,
    type: venueType(venue.type),
    status: venueStatusFromWire(venue),
    branchCount: venue.branchCount,
    tableCount: venue.tableCount,
    createdAtUtc: venue.createdAtUtc,
    suspendedAtUtc: venue.suspendedAtUtc ?? null,
    // `null` is "no reviews yet", not zero.
    rating: venue.averageRating ?? null,
    reviewCount: venue.reviewCount,
    openTabCount: venue.openTabCount,
    // The server always names the branch; the list says it only when there is a choice.
    readinessIssue: venue.readinessIssue
      ? readinessIssueFromWire({
          ...venue.readinessIssue,
          branchName: venue.branchCount > 1 ? venue.readinessIssue.branchName : null,
        })
      : null,
    coverThumbnailUrl: venue.coverThumbnailUrl ? resolveUrl(venue.coverThumbnailUrl) : null,
    branchFeatures,
    cuisine: venue.cuisine ?? null,
    district: venue.district ?? null,
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
    features: branchFeaturesFromWire(branch.features),
    // Absent says "not asked", which is not the same answer as zero.
    openTabCount: typeof branch.openTabCount === 'number' ? branch.openTabCount : null,
    ...(branch.district !== undefined ? { district: branch.district ?? null } : {}),
  };
}

export function venueDetailFromWire(
  detail: WireDetail,
  resolveUrl: (url: string) => string = (url) => url,
): ConsoleVenueDetail {
  return {
    ...venueFromWire(detail.venue, resolveUrl),
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
    features: branchFeaturesFromWire(branch.features),
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

export function consoleBookingFromWire(
  view: WireReservationWithApproval & WireBookingPreOrderFields,
): ConsoleBooking {
  const {
    preOrder,
    guestConfirmedOnWayAtUtc,
    guestRunningLateMinutes,
    guestRunningLateAtUtc,
    staffAskedOnMyWayAtUtc,
  } = bookingPreOrderFields(view);
  return {
    id: view.id,
    code: view.code,
    branchId: view.branchId,
    guestName: view.guestName,
    guestPhone: view.guestPhone,
    partySize: view.partySize,
    tableLabel: view.tableLabel ?? null,
    localDate: view.localDate,
    localStartTime: view.localStartTime,
    status: RESERVATION_STATUS[view.status] ?? 'unknown',
    awaitingApprovalBecause: approvalTrigger(view.awaitingApprovalBecause),
    approvalExpiresAtUtc: approvalExpiry(view.approvalExpiresAtUtc),
    awaitsEarlierGuestAnswer: awaitsEarlierGuestAnswer(view),
    note: view.note ?? null,
    phoneUnverified: view.phoneUnverified === true,
    guestRecord: guestRecordFromWire(view.guestRecord),
    cancelledBecause: cancellationCause(view.cancelledBecause),
    preOrder,
    guestConfirmedOnWayAtUtc,
    guestRunningLateMinutes,
    guestRunningLateAtUtc,
    staffAskedOnMyWayAtUtc,
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
    bookableTableCount: view.bookableTableCount,
    booksByTimeOnly: view.booksByTimeOnly,
    takingGuests: view.takingGuests,
    missingForGuests: view.missingForGuests ?? [],
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
    hiddenByName: view.hidden && !view.hiddenByPlatform ? view.hiddenByName?.trim() || null : null,
    reply: reviewReplyFromWire(view.reply),
  };
}

export function venueReviewFromWire(view: WireModeratedReview): VenueModeratedReview {
  return {
    ...moderatedReviewFromWire(view),
    reportCount: view.reportCount ?? 0,
    lastReportedAtUtc: view.lastReportedAtUtc ?? null,
  };
}

export function reviewPageFromWire(wire: WireModeratedReviewPage): ModeratedReviewPage {
  return {
    items: (wire.items ?? []).map(venueReviewFromWire),
    total: wire.total ?? 0,
    page: wire.page,
    pageSize: wire.pageSize,
    summary: reviewSummaryFromWire(wire.summary),
  };
}

// --- A venue's bookings, aggregates only ---------------------------------------

type WireVenueBookingsSummary = Schemas['Yalla.Application.Platform.VenueBookingsSummary'];
type WireStatusCounts = Schemas['Yalla.Application.Platform.BookingStatusCounts'];

function statusCounts(wire: WireStatusCounts): BookingStatusCounts {
  return {
    completed: wire.completed,
    upcoming: wire.upcoming,
    pending: wire.pendingApproval,
    cancelled: wire.cancelled,
    noShow: wire.noShow,
  };
}

/** Monday first, from `System.DayOfWeek` (0 is Sunday, and goes last). */
function weekMondayFirst(wire: WireVenueBookingsSummary['byWeekday']): number[] {
  const week = [0, 0, 0, 0, 0, 0, 0];
  for (const entry of wire) {
    const slot = (entry.dayOfWeek + 6) % 7;
    week[slot] = (week[slot] ?? 0) + entry.count;
  }
  return week;
}

/** `GET /api/platform/venues/{venueId}/bookings-summary`. */
export function venueBookingsSummaryFromWire(wire: WireVenueBookingsSummary): VenueBookingsSummary {
  return {
    venueId: wire.venueId,
    days: (wire.days === 7 ? 7 : 30) as BookingSummaryDays,
    total: wire.total,
    byStatus: statusCounts(wire.byStatus),
    byWeekday: weekMondayFirst(wire.byWeekday),
    averagePartySize: typeof wire.averagePartySize === 'number' ? wire.averagePartySize : null,
    byBranch: wire.byBranch.map((branch) => ({
      branchId: branch.branchId,
      name: branch.name,
      total: branch.total,
      todayCount: branch.todayCount,
      completed: branch.completed,
      upcoming: branch.upcoming,
      pending: branch.pendingApproval,
      cancelled: branch.cancelled,
      noShow: branch.noShow,
    })),
  };
}
