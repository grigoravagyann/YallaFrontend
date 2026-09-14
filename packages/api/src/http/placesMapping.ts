import type { VenueType } from '../contracts/booking';
import type { Photo } from '../contracts/menuAdmin';
import type {
  BranchBadge,
  BranchDetail,
  BranchListing,
  BranchOpeningBlock,
  BranchReview,
  BranchReviewPage,
  BranchTableMarker,
  BranchTableMarkers,
  DinerOrder,
  DinerOrderStatus,
  MarkerStatus,
  MyBranchReview,
} from '../contracts/places';
import type { FavoriteBranch } from '../contracts/favorites';
import type { DinerNotification, DinerNotificationPage } from '../contracts/notifications';
import type * as Hand from '../generated/handwritten';
import type { components } from '../generated/schema';
import { absolutePhoto } from './photoUrl';
import { photo } from './venueSettingsMapping';

type Schemas = components['schemas'];

export type WireBranchListing = Schemas['Yalla.Application.Public.PublicBranchListing'];
// `& Hand.…` — fields from the hardening contract the committed swagger lacks.
// generated-by-hand: A1b drops the intersections after regenerating.
export type WireBranchDetail = Schemas['Yalla.Application.Public.PublicBranchDetail'] &
  Hand.AcceptsAppBookingsAddition;
export type WireReviewPage = Omit<
  Schemas['Yalla.Application.Public.PublicReviewPage'],
  'reviews'
> & {
  reviews?: WireReview[];
};
export type WireReview = Schemas['Yalla.Application.Public.PublicReviewView'] &
  Hand.PublicReviewViewAdditions;
export type WireTableMarker = Schemas['Yalla.Application.Public.PublicTableMarker'];
export type WireTableMarkers = Schemas['Yalla.Application.Public.PublicTableMarkers'];
export type WireDinerReview = Schemas['Yalla.Application.Diners.DinerReviewView'] &
  Hand.DinerReviewViewAdditions;
export type WireDinerOrder = Schemas['Yalla.Application.Diners.DinerOrderView'];

type WirePhoto = Schemas['Yalla.Application.Media.PhotoView'];

/**
 * The wire omits null keys rather than writing them, and a generated type
 * that says `number` for a field the backend documents as "absent until set"
 * is not a promise the key is there. Every optional-in-practice field is read
 * through this, so a missing key and an explicit null land as the same `null`.
 */
function orNull<T>(value: T | null | undefined): T | null {
  return value === undefined || value === null ? null : value;
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** `VenueType`: 1 Cafe, 2 Restaurant. Anything else is read as a restaurant, the wider kind. */
export function venueTypeFromCode(code: number): VenueType {
  return code === 1 ? 'cafe' : 'restaurant';
}

export function venueTypeCode(type: VenueType): 1 | 2 {
  return type === 'cafe' ? 1 : 2;
}

/**
 * `DerivedTableState` onto the photo's three colours: 1 Free → free;
 * 2 ReservedSoon, 3 Held → reserved; 4 Occupied, 5 OutOfService → occupied.
 */
export function markerStatusFromState(state: number): MarkerStatus {
  if (state === 1) return 'free';
  if (state === 2 || state === 3) return 'reserved';
  return 'occupied';
}

const BADGES: ReadonlySet<string> = new Set<BranchBadge>(['popular', 'new']);

const ORDER_STATUSES: ReadonlySet<string> = new Set<DinerOrderStatus>([
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'cancelled',
]);

/**
 * An app status string, or the kitchen code's reading of it when the string
 * is one this build does not know. `TabOrderStatus`: 1 New, 2 InKitchen,
 * 3 Ready, 4 Served, 5 Voided.
 */
function orderStatus(value: string, kitchenStatus?: number): DinerOrderStatus {
  if (ORDER_STATUSES.has(value)) return value as DinerOrderStatus;
  switch (kitchenStatus) {
    case 2:
      return 'preparing';
    case 3:
      return 'ready';
    case 4:
      return 'completed';
    case 5:
      return 'cancelled';
    default:
      return 'confirmed';
  }
}

function photoFrom(baseUrl: string, view: WirePhoto | null | undefined): Photo | null {
  return view ? absolutePhoto(baseUrl, photo(view)) : null;
}

/** `"09:00:00"` → `"09:00"`. Already-short values pass through. */
export function clockFromTimeOnly(value: string): string {
  return value.length >= 5 ? value.slice(0, 5) : value;
}

export function branchListingFromWire(wire: WireBranchListing, baseUrl: string): BranchListing {
  const latitude = finite(wire.latitude);
  const longitude = finite(wire.longitude);
  // Coordinates are a pair or nothing: half a position is no position.
  const located = latitude !== null && longitude !== null;
  return {
    branchId: wire.branchId,
    venueId: wire.venueId,
    venueSlug: wire.venueSlug,
    branchSlug: wire.branchSlug,
    venueName: wire.venueName,
    branchName: wire.branchName,
    venueType: venueTypeFromCode(wire.venueType),
    cuisine: orNull(wire.cuisine)?.trim() || null,
    priceLevel: finite(wire.priceLevel),
    address: wire.address ?? '',
    latitude: located ? latitude : null,
    longitude: located ? longitude : null,
    distanceKm: finite(wire.distanceKm),
    timeZoneId: wire.timeZoneId,
    isOpenNow: Boolean(wire.isOpenNow),
    freeTableCount: wire.freeTableCount ?? 0,
    // A review count of zero has no average, whatever a stray field says.
    rating: (wire.reviewCount ?? 0) > 0 ? finite(wire.rating) : null,
    reviewCount: wire.reviewCount ?? 0,
    badges: (wire.badges ?? []).filter((badge): badge is BranchBadge => BADGES.has(badge)),
    coverPhoto: photoFrom(baseUrl, wire.coverPhoto),
  };
}

export function branchReviewFromWire(wire: WireReview): BranchReview {
  return {
    reviewId: wire.reviewId,
    authorName: wire.authorName,
    rating: wire.rating,
    text: orNull(wire.text),
    createdAtUtc: wire.createdAtUtc,
    updatedAtUtc: wire.updatedAtUtc,
    // The server's flag (K8). A server that predates it never sends one, and
    // there a revision is exactly a later `updatedAtUtc`.
    edited: wire.edited ?? wire.updatedAtUtc !== wire.createdAtUtc,
  };
}

export function tableMarkerFromWire(wire: WireTableMarker): BranchTableMarker | null {
  const x = finite(wire.photoX);
  const y = finite(wire.photoY);
  // A table the manager has not placed has nowhere to be drawn.
  if (x === null || y === null) return null;
  return {
    tableId: wire.tableId,
    label: wire.label,
    seats: wire.seats,
    isBookable: wire.isBookable,
    status: markerStatusFromState(wire.state),
    x,
    y,
  };
}

function markersFrom(wires: readonly WireTableMarker[] | undefined): BranchTableMarker[] {
  return (wires ?? [])
    .map(tableMarkerFromWire)
    .filter((marker): marker is BranchTableMarker => marker !== null);
}

export function tableMarkersFromWire(wire: WireTableMarkers, baseUrl: string): BranchTableMarkers {
  return {
    branchId: wire.branchId,
    photo: photoFrom(baseUrl, wire.photo),
    asOfUtc: wire.asOfUtc,
    tables: markersFrom(wire.tables),
  };
}

export function branchDetailFromWire(wire: WireBranchDetail, baseUrl: string): BranchDetail {
  return {
    listing: branchListingFromWire(wire.listing, baseUrl),
    about: orNull(wire.about),
    websiteUrl: orNull(wire.websiteUrl),
    phoneE164: orNull(wire.phoneE164),
    amenities: wire.amenities ?? [],
    openingHours: (wire.openingHours ?? []).map((block): BranchOpeningBlock => ({
      day: block.day as BranchOpeningBlock['day'],
      opensAt: clockFromTimeOnly(block.opensAt),
      closesAt: clockFromTimeOnly(block.closesAt),
      closesNextDay: Boolean(block.closesNextDay),
    })),
    gallery: (wire.gallery ?? []).map((view) => absolutePhoto(baseUrl, photo(view))),
    tableCount: wire.tableCount ?? 0,
    acceptsWebBookings: Boolean(wire.acceptsWebBookings),
    // A boolean is never omitted, so an absent one is a server from before the
    // K9 gate, which takes app bookings. Reading it as false would hide Book on
    // every place against that server.
    acceptsAppBookings: wire.acceptsAppBookings ?? true,
    recentReviews: (wire.recentReviews ?? []).map(branchReviewFromWire),
    tableMarkers: markersFrom(wire.tableMarkers),
    asOfUtc: wire.asOfUtc,
  };
}

export function reviewPageFromWire(wire: WireReviewPage): BranchReviewPage {
  return {
    branchId: wire.branchId,
    rating: (wire.reviewCount ?? 0) > 0 ? finite(wire.rating) : null,
    reviewCount: wire.reviewCount ?? 0,
    page: wire.page,
    pageSize: wire.pageSize,
    reviews: (wire.reviews ?? []).map(branchReviewFromWire),
  };
}

export function myReviewFromWire(wire: WireDinerReview): MyBranchReview {
  return {
    reviewId: wire.reviewId,
    branchId: wire.branchId,
    rating: wire.rating,
    text: orNull(wire.text),
    createdAtUtc: wire.createdAtUtc,
    updatedAtUtc: wire.updatedAtUtc,
    publicAuthorName: orNull(wire.publicAuthorName),
    hidden: Boolean(wire.hidden),
  };
}

// --- Favourites (K11) and the notifications feed (K12) ------------------------

export function favoriteFromWire(wire: Hand.DinerFavoriteView, baseUrl: string): FavoriteBranch {
  return {
    branchId: wire.branchId,
    createdAtUtc: wire.createdAtUtc,
    listing: branchListingFromWire(wire.listing, baseUrl),
  };
}

export function favoritesFromWire(
  wire: Hand.DinerFavoritesView | null | undefined,
  baseUrl: string,
): FavoriteBranch[] {
  return (wire?.items ?? []).map((item) => favoriteFromWire(item, baseUrl));
}

export function notificationFromWire(wire: Hand.DinerNotificationView): DinerNotification {
  return {
    notificationId: wire.notificationId,
    kind: wire.kind,
    params: wire.params ?? {},
    branchId: orNull(wire.branchId),
    branchName: orNull(wire.branchName),
    reservationId: orNull(wire.reservationId),
    tabId: orNull(wire.tabId),
    orderId: orNull(wire.orderId),
    createdAtUtc: wire.createdAtUtc,
    read: Boolean(wire.read),
  };
}

export function notificationPageFromWire(wire: Hand.DinerNotificationPage): DinerNotificationPage {
  return {
    items: (wire.items ?? []).map(notificationFromWire),
    nextCursor: orNull(wire.nextCursor),
    unreadCount: wire.unreadCount ?? 0,
  };
}

export function dinerOrderFromWire(wire: WireDinerOrder, baseUrl: string): DinerOrder {
  return {
    orderId: wire.orderId,
    tabId: wire.tabId,
    branchId: wire.branchId,
    venueName: wire.venueName,
    branchName: wire.branchName,
    coverPhoto: photoFrom(baseUrl, wire.coverPhoto),
    kind: 'dineIn',
    status: orderStatus(wire.status, wire.kitchenStatus),
    tableLabel: orNull(wire.tableLabel),
    partySize: finite(wire.partySize),
    placedAtUtc: wire.placedAtUtc,
    estimatedReadyAtUtc: orNull(wire.estimatedReadyAtUtc),
    totalAmd: wire.totalAmd ?? 0,
    items: (wire.items ?? []).map((item) => ({
      lineId: item.lineId,
      name: item.name,
      quantity: item.quantity,
      unitPriceAmd: item.unitPriceAmd,
      lineTotalAmd: item.lineTotalAmd,
      note: orNull(item.note),
      isVoided: Boolean(item.isVoided),
    })),
    timeline: (wire.timeline ?? []).map((entry) => ({
      status: orderStatus(entry.status),
      atUtc: entry.atUtc,
    })),
    // The server says false, always; nothing here may promise more.
    canCancel: false,
  };
}
