import type { VenueType } from './booking';
import type { Photo } from './menuAdmin';

/**
 * Diner browse, reviews and the diner's own orders, as the gateway hands them
 * over: the wire's shapes with its integers named, missing keys made explicit
 * `null`s and every photo link already absolute.
 *
 * Nothing here is derived that the server did not say. A branch with no
 * reviews has `rating: null`, not 0; one with no coordinates has
 * `latitude: null`, not Yerevan centre. Screens decide what "unknown" looks
 * like, and they can only do that honestly if it arrives as unknown.
 */

export type BranchBadge = 'popular' | 'new';

/** Live table state as the photo markers draw it — the staff floor's rule, collapsed to three. */
export type MarkerStatus = 'free' | 'reserved' | 'occupied';

/** One entry of `GET /api/public/branches` and `/search`. */
export interface BranchListing {
  readonly branchId: string;
  readonly venueId: string;
  readonly venueSlug: string;
  readonly branchSlug: string;
  readonly venueName: string;
  readonly branchName: string;
  readonly venueType: VenueType;
  readonly cuisine: string | null;
  /** 1–4. */
  readonly priceLevel: number | null;
  readonly address: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  /** Only when the caller sent a position. */
  readonly distanceKm: number | null;
  readonly timeZoneId: string;
  readonly isOpenNow: boolean;
  readonly freeTableCount: number;
  /** Average, one decimal. `null` until the first review. */
  readonly rating: number | null;
  readonly reviewCount: number;
  readonly badges: readonly BranchBadge[];
  readonly coverPhoto: Photo | null;
}

export interface BranchOpeningBlock {
  /** 0 = Sunday … 6 = Saturday. */
  readonly day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** `HH:mm`, the branch's wall clock. */
  readonly opensAt: string;
  readonly closesAt: string;
  /** `closesAt` is after midnight. */
  readonly closesNextDay: boolean;
}

export interface BranchReview {
  readonly reviewId: string;
  readonly authorName: string;
  /** 1–5. */
  readonly rating: number;
  readonly text: string | null;
  /** First written. The lists are ordered by this, newest first (K8). */
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
  /** Revised since it was first written. An identical save does not count. */
  readonly edited: boolean;
}

export interface BranchTableMarker {
  readonly tableId: string;
  readonly label: string;
  readonly seats: number;
  readonly isBookable: boolean;
  readonly status: MarkerStatus;
  /** 0..1 across the cover photo. */
  readonly x: number;
  readonly y: number;
}

export interface BranchTableMarkers {
  readonly branchId: string;
  /** The photo the coordinates refer to — the cover. `null` when there is none. */
  readonly photo: Photo | null;
  readonly asOfUtc: string;
  readonly tables: readonly BranchTableMarker[];
}

/** `GET /api/public/branches/{id}`. */
export interface BranchDetail {
  readonly listing: BranchListing;
  readonly about: string | null;
  readonly websiteUrl: string | null;
  readonly phoneE164: string | null;
  /** Keys: `outdoorSeating`, `wifi`, `parking`, `cardPayment`, `vegan`. */
  readonly amenities: readonly string[];
  readonly openingHours: readonly BranchOpeningBlock[];
  /** Ordered, beyond the cover. */
  readonly gallery: readonly Photo[];
  readonly tableCount: number;
  readonly acceptsWebBookings: boolean;
  /**
   * Whether a booking from the app is taken (K9): the online-bookings switch is
   * on **and** somebody has reviewed the reservation policy. When false, the
   * place page explains instead of offering Book.
   */
  readonly acceptsAppBookings: boolean;
  /** Newest three, hidden reviews left out. */
  readonly recentReviews: readonly BranchReview[];
  readonly tableMarkers: readonly BranchTableMarker[];
  readonly asOfUtc: string;
}

export interface BranchReviewPage {
  readonly branchId: string;
  readonly rating: number | null;
  readonly reviewCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly reviews: readonly BranchReview[];
}

/** The signed-in diner's own review of one branch. */
export interface MyBranchReview {
  readonly reviewId: string;
  readonly branchId: string;
  readonly rating: number;
  readonly text: string | null;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
  /**
   * The name the review is shown under, by the server's rule — "Posted as
   * Anahit S." `null` only from a server that predates K8.
   */
  readonly publicAuthorName: string | null;
  /** Taken down by the venue or the platform: the diner still sees it, nobody else does. */
  readonly hidden: boolean;
}

export interface SubmitBranchReviewCommand {
  readonly branchId: string;
  /** Whole stars, 1–5. */
  readonly rating: number;
  /** ≤ 1000 characters. Blank or absent clears it. */
  readonly text?: string | null | undefined;
}

/** The server's cap on `q`, after trimming; a longer one is refused with a 400. */
export const MAX_BRANCH_SEARCH_LENGTH = 100;

/**
 * A search as the server will take it: trimmed, then cut to
 * {@link MAX_BRANCH_SEARCH_LENGTH}, so a pasted paragraph searches on its start
 * instead of failing the whole list.
 */
export function clampBranchSearch(query: string | undefined): string {
  return (query ?? '').trim().slice(0, MAX_BRANCH_SEARCH_LENGTH).trim();
}

export interface BranchSearchQuery {
  /** Trimmed and cut to {@link MAX_BRANCH_SEARCH_LENGTH} before it is sent. */
  readonly query?: string | undefined;
  readonly venueType?: VenueType | undefined;
  /** Both or neither: adds `distanceKm` and sorts nearest first. */
  readonly position?: { readonly latitude: number; readonly longitude: number } | undefined;
}

// ---------------------------------------------------------------------------
// The diner's orders
// ---------------------------------------------------------------------------

export type DinerOrderStatus = 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';

export interface DinerOrderLine {
  readonly lineId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPriceAmd: number;
  readonly lineTotalAmd: number;
  readonly note: string | null;
  readonly isVoided: boolean;
}

export interface DinerOrder {
  readonly orderId: string;
  readonly tabId: string;
  readonly branchId: string;
  readonly venueName: string;
  readonly branchName: string;
  readonly coverPhoto: Photo | null;
  /** Always `dineIn` today: every order is on a table's tab. */
  readonly kind: 'dineIn';
  readonly status: DinerOrderStatus;
  readonly tableLabel: string | null;
  readonly partySize: number | null;
  readonly placedAtUtc: string;
  readonly estimatedReadyAtUtc: string | null;
  /** Non-voided lines, before the service charge. */
  readonly totalAmd: number;
  readonly items: readonly DinerOrderLine[];
  readonly timeline: readonly { readonly status: DinerOrderStatus; readonly atUtc: string }[];
  /** Always false: the domain has no diner cancel. */
  readonly canCancel: boolean;
}

export type DinerOrderSegment = 'active' | 'history';
