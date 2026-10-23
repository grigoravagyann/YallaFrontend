import type { Photo } from '../contracts/menuAdmin';
import type {
  BranchBadge,
  BranchDetail,
  BranchListing,
  BranchOpeningBlock,
  BranchReview,
  BranchReviewPage,
  BranchRoom,
  BranchRooms,
  BranchTableMarker,
  DinerOrder,
  DinerOrderStatus,
  MarkerStatus,
  MyBranchReview,
} from '../contracts/places';
import type { FavoriteBranch } from '../contracts/favorites';
import type { DinerNotification, DinerNotificationPage } from '../contracts/notifications';
import type { components } from '../generated/schema';
import { specialDaysFromWire } from './venueSettingsMapping';
import { absolutePhoto } from './photoUrl';
import { photo } from './venueSettingsMapping';
import { venueTypeFromCode } from './venueTypeMapping';

import { publicReplyFromWire } from './reviewReplyMapping';
import { dinerTakeawaySummaryFromWire, publicTakeawayInfoFromWire } from './takeawayMapping';
import { conversationSummaryFromWire, type WireMessagesSummaryField } from './messagesMapping';
export { venueTypeCode, venueTypeFromCode } from './venueTypeMapping';

type Schemas = components['schemas'];

export type WireBranchListing = Schemas['Yalla.Application.Public.PublicBranchListing'];
export type WireBranchDetail = Schemas['Yalla.Application.Public.PublicBranchDetail'];
export type WireReviewPage = Omit<
  Schemas['Yalla.Application.Public.PublicReviewPage'],
  'reviews'
> & {
  reviews?: WireReview[];
};
export type WireReview = Schemas['Yalla.Application.Public.PublicReviewView'];
export type WireTableMarker = Schemas['Yalla.Application.Public.PublicTableMarker'];
export type WireRoom = Schemas['Yalla.Application.Public.PublicRoom'];
export type WireRooms = Schemas['Yalla.Application.Public.PublicBranchRooms'];
export type WireDinerReview = Schemas['Yalla.Application.Diners.DinerReviewView'];
export type WireDinerOrder = Schemas['Yalla.Application.Diners.DinerOrderView'];
export type WireFavorite = Schemas['Yalla.Application.Diners.DinerFavoriteView'];
export type WireFavoriteList = Schemas['Yalla.Application.Diners.DinerFavoriteList'];
export type WireNotification = Schemas['Yalla.Application.Diners.DinerNotificationView'];
export type WireNotificationPage = Schemas['Yalla.Application.Diners.DinerNotificationPage'];

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

/**
 * `DerivedTableState` onto the photo's four colours: 1 Free → free;
 * 2 ReservedSoon, 3 Held → reserved; 4 Occupied → occupied; 5 OutOfService →
 * outOfService. Anything newer reads as occupied: never offered.
 */
export function markerStatusFromState(state: number): MarkerStatus {
  if (state === 1) return 'free';
  if (state === 2 || state === 3) return 'reserved';
  if (state === 5) return 'outOfService';
  return 'occupied';
}

const BADGES: ReadonlySet<string> = new Set<BranchBadge>(['popular', 'new']);

const ORDER_STATUSES: ReadonlySet<string> = new Set<DinerOrderStatus>([
  'confirmed',
  'preparing',
  'inProgress',
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
    district: orNull(wire.district)?.trim() || null,
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
    reply: publicReplyFromWire(wire.reply),
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

function roomFromWire(wire: WireRoom, baseUrl: string): BranchRoom {
  return {
    roomId: wire.roomId,
    name: wire.name,
    displayOrder: wire.displayOrder,
    photos: (wire.photos ?? []).map((entry) => ({
      photo: absolutePhoto(baseUrl, photo(entry.photo)),
      tables: markersFrom(entry.tables),
    })),
  };
}

function roomsFrom(wires: readonly WireRoom[] | undefined, baseUrl: string): BranchRoom[] {
  return (
    [...(wires ?? [])]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((room) => roomFromWire(room, baseUrl))
      // A room with no photo is not listed by the server; one that arrives empty is not either.
      .filter((room) => room.photos.length > 0)
  );
}

export function branchRoomsFromWire(wire: WireRooms, baseUrl: string): BranchRooms {
  return {
    branchId: wire.branchId,
    asOfUtc: wire.asOfUtc,
    rooms: roomsFrom(wire.rooms, baseUrl),
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
    specialDays: specialDaysFromWire(wire.specialDays ?? []),
    gallery: (wire.gallery ?? []).map((view) => absolutePhoto(baseUrl, photo(view))),
    tableCount: wire.tableCount ?? 0,
    acceptsWebBookings: Boolean(wire.acceptsWebBookings),
    // A boolean is never omitted, so an absent one is a server from before the
    // K9 gate, which takes app bookings. Reading it as false would hide Book on
    // every place against that server.
    acceptsAppBookings: wire.acceptsAppBookings ?? true,
    recentReviews: (wire.recentReviews ?? []).map(branchReviewFromWire),
    ratingCounts: ratingCountsFromWire(wire.ratingCounts),
    rooms: roomsFrom(wire.rooms, baseUrl),
    // Takeaway (2026-10-22): absent — a server from before it — is none.
    takeaway: publicTakeawayInfoFromWire(wire.takeaway),
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
    ratingCounts: ratingCountsFromWire(wire.ratingCounts),
  };
}

/**
 * The stars per review, one star first, as exactly five whole counts. Missing
 * places — an older server, a short list — are zero, and so is anything that
 * is not a count: a bar must never be drawn from a negative or a fraction.
 */
export function ratingCountsFromWire(wire: readonly number[] | null | undefined): number[] {
  return [0, 1, 2, 3, 4].map((index) => {
    const value = wire?.[index];
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
  });
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
    reply: publicReplyFromWire(wire.reply),
  };
}

// --- Favourites (K11) and the notifications feed (K12) ------------------------

export function favoriteFromWire(wire: WireFavorite, baseUrl: string): FavoriteBranch {
  return {
    branchId: wire.branchId,
    createdAtUtc: wire.createdAtUtc,
    listing: branchListingFromWire(wire.listing, baseUrl),
  };
}

export function favoritesFromWire(
  wire: WireFavoriteList | null | undefined,
  baseUrl: string,
): FavoriteBranch[] {
  return (wire?.items ?? []).map((item) => favoriteFromWire(item, baseUrl));
}

export function notificationFromWire(wire: WireNotification): DinerNotification {
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

export function notificationPageFromWire(wire: WireNotificationPage): DinerNotificationPage {
  return {
    items: (wire.items ?? []).map(notificationFromWire),
    nextCursor: orNull(wire.nextCursor),
    unreadCount: wire.unreadCount ?? 0,
  };
}

export function dinerOrderFromWire(wire: WireDinerOrder, baseUrl: string): DinerOrder {
  const isTakeaway = wire.kind === 'takeaway';
  const takeaway = isTakeaway ? dinerTakeawaySummaryFromWire(wire.takeaway) : null;
  return {
    orderId: wire.orderId,
    // Absent on a takeaway order, which has no tab.
    tabId: orNull(wire.tabId)?.trim() || null,
    branchId: wire.branchId,
    venueName: wire.venueName,
    branchName: wire.branchName,
    coverPhoto: photoFrom(baseUrl, wire.coverPhoto),
    // A kind this build does not know reads as dine-in, as before takeaway.
    kind: isTakeaway ? 'takeaway' : 'dineIn',
    status: orderStatus(wire.status, wire.kitchenStatus),
    // Empty and 0 on a takeaway order: no table, no party.
    tableLabel: orNull(wire.tableLabel)?.trim() || null,
    partySize: isTakeaway ? null : finite(wire.partySize),
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
    // The server's answer: false on dine-in, true on a takeaway order while
    // the venue has not answered it. Nothing here may promise more.
    canCancel: wire.canCancel === true,
    takeaway,
    // Guest messages (2026-10-23): a takeaway order's thread, on the order or
    // beside its takeaway facts — only when there is one.
    ...(isTakeaway ? orderMessages(wire) : {}),
  };
}

function orderMessages(wire: WireDinerOrder) {
  const messages = conversationSummaryFromWire(
    (wire as WireMessagesSummaryField).messages ??
      (wire.takeaway as WireMessagesSummaryField | null | undefined)?.messages,
  );
  return messages ? { messages } : {};
}
