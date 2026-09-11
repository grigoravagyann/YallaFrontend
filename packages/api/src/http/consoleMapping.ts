import type {
  ConsoleBranch,
  ConsoleVenue,
  ConsoleVenueDetail,
  ManagedBranch,
  ManagedVenue,
  Page,
  SubscriptionTier,
  VenueStatus,
  VenueType,
} from '../contracts/console';
import type { ApprovalTrigger, ConsoleBooking } from '../contracts/approvals';
import type { ReservationStatusCode } from '../contracts/push';
import type { components } from '../generated/schema';

type Schemas = components['schemas'];
type WireReservation = Schemas['Yalla.Application.Reservations.ReservationView'];
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

/** `Yalla.Domain.Enums.VenueType`: 1 Cafe, 2 Restaurant. */
export function venueType(value: number): VenueType {
  return value === 2 ? 'restaurant' : 'cafe';
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

export function venueFromWire(venue: WireVenue): ConsoleVenue {
  return {
    id: venue.venueId,
    name: venue.name,
    slug: venue.slug,
    type: venueType(venue.type),
    status: venueStatus(venue),
    branchCount: venue.branchCount,
    tableCount: venue.tableCount,
    subscriptionTier: subscriptionTier(venue.subscriptionTier),
    // The platform view does not carry a creation timestamp; the screen omits
    // the line rather than inventing one.
    createdAtUtc: null,
    suspendedAtUtc: venue.suspendedAtUtc ?? null,
  };
}

export function branchFromWire(branch: WireBranch): ConsoleBranch {
  return {
    id: branch.branchId,
    venueId: branch.venueId,
    name: branch.name,
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

export function venuePageFromWire(page: WirePage): Page<ConsoleVenue> {
  return {
    items: (page.items ?? []).map(venueFromWire),
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
  };
}
