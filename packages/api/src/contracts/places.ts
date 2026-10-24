import type { ConversationSummary } from './messages';
import type { SpecialDay } from './branchSettings';
import type { VenueType } from './booking';
import type { Photo } from './menuAdmin';
import type { PublicReviewReply } from './reviews';
import type { DinerTakeawaySummary, PublicTakeawayInfo } from './takeaway';

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

/**
 * Live table state as the photo pins draw it — the staff floor's rule,
 * collapsed to four: free, reserved (soon, or held), occupied, and out of
 * service, which is neither taken nor on offer.
 */
export type MarkerStatus = 'free' | 'reserved' | 'occupied' | 'outOfService';

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
  /**
   * The area of town the venue names for itself — "Kentron", "Arabkir". Shown
   * beside the cuisine on a card; `null` until the venue sets one.
   */
  readonly district: string | null;
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
  /** The venue's public reply under it, signed short; null when it has none. */
  readonly reply: PublicReviewReply | null;
}

export interface BranchTableMarker {
  readonly tableId: string;
  readonly label: string;
  readonly seats: number;
  readonly isBookable: boolean;
  readonly status: MarkerStatus;
  /** 0..1 across the room photo the marker is on. */
  readonly x: number;
  readonly y: number;
}

/** One photo of a room, with the tables pinned on it. */
export interface BranchRoomPhoto {
  readonly photo: Photo;
  readonly tables: readonly BranchTableMarker[];
}

/** A room a diner picks from: Hall, Terrace, VIP. Never without a photo. */
export interface BranchRoom {
  readonly roomId: string;
  readonly name: string;
  readonly displayOrder: number;
  /** In the order the venue chose. */
  readonly photos: readonly BranchRoomPhoto[];
}

/** `GET /api/public/branches/{id}/rooms`: the rooms, lowest `displayOrder` first, with live pins. */
export interface BranchRooms {
  readonly branchId: string;
  readonly asOfUtc: string;
  readonly rooms: readonly BranchRoom[];
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
  /**
   * The special days from the branch's today through the next sixty days,
   * earliest first: each replaces its date's weekly hours. Empty from a server
   * that does not send them yet.
   */
  readonly specialDays: readonly SpecialDay[];
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
  /**
   * How many shown reviews gave each number of stars, **one star first**:
   * always five numbers, adding up to `listing.reviewCount`. The whole
   * branch's spread, whatever page of reviews is in hand.
   */
  readonly ratingCounts: readonly number[];
  /** The same rooms `GET …/rooms` serves. */
  readonly rooms: readonly BranchRoom[];
  /**
   * Whether the place takes takeaway orders from the app, and its preparation
   * time — the "Order to take away" button and the info card (2026-10-22).
   * Whether it is open for orders now is the availability's
   * (`getTakeawayAvailability`). The mapper always fills it (`NO_TAKEAWAY`
   * from a server before takeaway); optional for fixtures written before it.
   */
  readonly takeaway?: PublicTakeawayInfo | undefined;
  readonly asOfUtc: string;
}

export interface BranchReviewPage {
  readonly branchId: string;
  readonly rating: number | null;
  readonly reviewCount: number;
  readonly page: number;
  readonly pageSize: number;
  readonly reviews: readonly BranchReview[];
  /** The whole branch's stars, one star first — the same on every page. See {@link BranchDetail.ratingCounts}. */
  readonly ratingCounts: readonly number[];
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
  /** The venue's reply — shown to its author even while the review is hidden. */
  readonly reply: PublicReviewReply | null;
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

/**
 * The app's words for where an order stands. `inProgress` is a takeaway order
 * sent and not yet answered by the venue; the takeaway's exact status is on
 * {@link DinerOrder.takeaway}.
 */
export type DinerOrderStatus =
  'confirmed' | 'preparing' | 'inProgress' | 'ready' | 'completed' | 'cancelled';

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
  /** The tab it was placed against; `null` on a takeaway order, which has no tab. */
  readonly tabId: string | null;
  readonly branchId: string;
  readonly venueName: string;
  readonly branchName: string;
  readonly coverPhoto: Photo | null;
  /** `dineIn` for an order on a table's tab, `takeaway` for a takeaway order (2026-10-22). */
  readonly kind: 'dineIn' | 'takeaway';
  readonly status: DinerOrderStatus;
  readonly tableLabel: string | null;
  readonly partySize: number | null;
  readonly placedAtUtc: string;
  readonly estimatedReadyAtUtc: string | null;
  /** Non-voided lines, before the service charge. */
  readonly totalAmd: number;
  readonly items: readonly DinerOrderLine[];
  readonly timeline: readonly { readonly status: DinerOrderStatus; readonly atUtc: string }[];
  /**
   * False on a dine-in order: voiding it is a staff action. True on a takeaway
   * order while the venue has not answered it (`cancelTakeawayOrder`).
   */
  readonly canCancel: boolean;
  /**
   * The takeaway order's own facts — code, exact status, pickup and ready
   * times; `null` on dine-in. Optional for fixtures written before takeaway.
   */
  readonly takeaway?: DinerTakeawaySummary | null | undefined;
  /**
   * The takeaway order's thread with the venue (guest messages, 2026-10-23):
   * the Orders-tab card's row. Absent or `null` on dine-in, and when there is
   * no thread and none can be opened.
   */
  readonly messages?: ConversationSummary | null | undefined;
}

export type DinerOrderSegment = 'active' | 'history';
