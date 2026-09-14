import type { components } from './schema';

type Generated = components['schemas'];

/**
 * generated-by-hand
 * =================
 *
 * Wire shapes from the hardening contract (PLAN-90 section 4, K1–K9) and its
 * 2026-09-14 addendum (the K8 moderation extension, K11 favourites, K12
 * notifications) that the committed `swagger.json` does not describe yet: the
 * backend packages that add them (B1–B3, B6) had not merged when the gateways
 * were written against them.
 *
 * **A1b removes this file.** Once `schema.ts` and `swagger.json` are
 * regenerated from a backend with those packages merged:
 *
 * 1. replace every import from here with the generated schema entry (the
 *    comment on each names the contract section it comes from);
 * 2. delete the `& Hand.…Additions` intersections in `http/*Mapping.ts`;
 * 3. drop every `gateway-schema: awaiting-route` marker — the checker fails on
 *    a stale one by itself, which is the reminder;
 * 4. put the bodies that are passed by name only because they carry a field the
 *    old swagger lacks (`note`, `expectedVersion`) back inline, so the checker
 *    reads their keys again.
 *
 * Every field below is the contract's. Where the contract left something
 * unsaid, the gateway reads the field defensively (a missing boolean from a
 * server that predates the change is not taken as `false` when that would
 * switch a feature off) and the comment says so.
 */

// --- K2: account deletion ------------------------------------------------------

/** generated-by-hand (K2). Body of `DELETE /api/diner/me`. */
export interface DeleteDinerAccountRequest {
  password: string | null;
  code: string | null;
}

// --- K6: floor-plan concurrency -------------------------------------------------

/** generated-by-hand (K6). Added to `FloorPlanView` and the save result's `plan`. */
export interface FloorPlanViewAdditions {
  /** Opaque. Absent only from a server that predates K6. */
  version?: string;
}

/** generated-by-hand (K6). `FloorTableInput` with `photoX`/`photoY` removed. */
export type FloorTableInput = Omit<
  Generated['Yalla.Application.BranchSettings.FloorTableInput'],
  'photoX' | 'photoY'
>;

/** generated-by-hand (K6). `ReplaceFloorPlanCommand` with the required `expectedVersion`. */
export interface ReplaceFloorPlanCommand {
  floorWidth: number;
  floorHeight: number;
  areas: Generated['Yalla.Application.BranchSettings.FloorAreaInput'][];
  tables: FloorTableInput[];
  expectedVersion: string;
}

// --- K7: table photo positions ----------------------------------------------------

/** generated-by-hand (K7). */
export interface TablePhotoPositionInput {
  tableId: string;
  photoX: number | null;
  photoY: number | null;
}

/** generated-by-hand (K7). Body of `PUT /api/branches/{branchId}/table-photo-positions`. */
export interface TablePhotoPositionsCommand {
  coverPhotoId: string;
  positions: TablePhotoPositionInput[];
}

/** generated-by-hand (K7). One table in the 200 answer; null keys are omitted on the wire. */
export interface TablePhotoPositionView {
  tableId: string;
  label: string;
  photoX?: number | null;
  photoY?: number | null;
}

/** generated-by-hand (K7). The 200 answer: every active table at the branch. */
export interface TablePhotoPositionsView {
  coverPhotoId: string;
  tables: TablePhotoPositionView[];
}

// --- K8: reviews --------------------------------------------------------------------

/** generated-by-hand (K8). Added to `PublicReviewView`. */
export interface PublicReviewViewAdditions {
  edited?: boolean;
}

/** generated-by-hand (K8). Added to `DinerReviewView`. */
export interface DinerReviewViewAdditions {
  publicAuthorName?: string;
  hidden?: boolean;
}

/**
 * generated-by-hand (K8). One item of `GET /api/platform/branches/{branchId}/reviews`
 * and the 200 answer of `PUT /api/platform/reviews/{reviewId}/visibility`.
 */
export interface PlatformReviewView {
  reviewId: string;
  branchId: string;
  rating: number;
  text?: string | null;
  authorName: string;
  dinerUserId?: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
  hidden: boolean;
  hiddenReason?: string | null;
  hiddenAtUtc?: string | null;
}

/**
 * generated-by-hand (addendum, K8 extension). One item of
 * `GET /api/branches/{branchId}/reviews`: the platform item plus report counts.
 * The contract does not say what `PUT …/reviews/{reviewId}/visibility` answers on
 * the venue route; the gateway reads this shape, the platform route's analogue.
 */
export interface VenueReviewView extends PlatformReviewView {
  reportCount: number;
  lastReportedAtUtc?: string | null;
}

/** generated-by-hand (K8). The paged envelope both moderation lists use. */
export interface ReviewPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** generated-by-hand (K8). Body of both visibility routes. */
export interface ReviewVisibilityRequest {
  hidden: boolean;
  reason: string | null;
}

/** generated-by-hand (addendum). Body of `POST /api/diner/reviews/{reviewId}/report`. */
export interface ReportReviewRequest {
  reason: string;
  note: string | null;
}

// --- K9: booking gate and note --------------------------------------------------------

/**
 * generated-by-hand (K9). Added to `PublicBranchDetail` and `PublicBranchPage`.
 * Absent only from a server that predates the gate — which takes app bookings.
 */
export interface AcceptsAppBookingsAddition {
  acceptsAppBookings?: boolean;
}

/** generated-by-hand (K9). `CreateReservationRequest` with `note`. */
export type CreateReservationRequest = Generated['Yalla.Api.Endpoints.CreateReservationRequest'] & {
  note?: string | null;
};

/** generated-by-hand (K9). Added to `ReservationView`. */
export interface ReservationViewAdditions {
  note?: string | null;
}

// --- K11: favourites --------------------------------------------------------------------

/** generated-by-hand (K11). One entry of `GET /api/diner/favorites`. */
export interface DinerFavoriteView {
  branchId: string;
  createdAtUtc: string;
  listing: Generated['Yalla.Application.Public.PublicBranchListing'];
}

/** generated-by-hand (K11). `GET /api/diner/favorites` and the bulk `PUT`'s answer. */
export interface DinerFavoritesView {
  items: DinerFavoriteView[];
}

/** generated-by-hand (K11). Body of the bulk `PUT /api/diner/favorites`. */
export interface MergeFavoritesRequest {
  branchIds: string[];
}

// --- K12: notifications -------------------------------------------------------------------

/** generated-by-hand (K12). One item of `GET /api/diner/notifications`. */
export interface DinerNotificationView {
  notificationId: string;
  kind: string;
  params?: Record<string, string | number | boolean | null> | null;
  branchId?: string | null;
  branchName?: string | null;
  reservationId?: string | null;
  tabId?: string | null;
  orderId?: string | null;
  createdAtUtc: string;
  read: boolean;
}

/** generated-by-hand (K12). `GET /api/diner/notifications?before=&limit=`. */
export interface DinerNotificationPage {
  items: DinerNotificationView[];
  nextCursor?: string | null;
  unreadCount: number;
}

/** generated-by-hand (K12). Body of `POST /api/diner/notifications/read`. */
export interface MarkNotificationsReadRequest {
  upTo: string | null;
  ids: string[] | null;
}
