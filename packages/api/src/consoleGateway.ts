import type { ConsoleBooking, DecideReservationCommand } from './contracts/approvals';
import type { BookingBlock, LiftBookingBlockCommand } from './contracts/guestRecord';
import type { PreOrderSettings, PreOrderSettingsInput } from './contracts/preOrder';
import type { TakeawaySettings, TakeawaySettingsInput } from './contracts/takeaway';
import type {
  ConversationSubjectRef,
  MessageSettings,
  MessageSettingsInput,
  StaffConversation,
} from './contracts/messages';
import type { MessageHistoryPage, MessageHistoryQuery } from './contracts/messageHistory';
import type {
  BranchOverview,
  ConsoleBookingActionCommand,
  ConsoleBookingActionResult,
} from './contracts/branchOverview';
import type { VenueListing, VenueListingInput } from './contracts/listing';
import type {
  EditorFloorArea,
  EditorFloorPlan,
  FloorPlanSaveResult,
  ReplaceFloorPlanCommand,
  TableDeletionResult,
} from './contracts/floorPlan';
import type { BranchReadiness } from './contracts/readiness';
import type {
  ModeratedReview,
  ModeratedReviewPage,
  SetReviewVisibilityCommand,
  VenueModeratedReview,
  VenueReviewQuery,
} from './contracts/reviews';
import type {
  AdminMenuCategory,
  AdminMenuItem,
  CreateMenuItemInput,
  MenuItemDeletion,
  Photo,
  UpdateMenuItemInput,
} from './contracts/menuAdmin';
import type {
  PolicyChangeResult,
  ReservationPolicy,
  ReservationPolicyDefaults,
  SpecialDay,
  SpecialDaysList,
  SpecialDaysSaved,
  WeeklyHours,
} from './contracts/branchSettings';
import type { BranchPublicProfile, BranchPublicProfileInput } from './contracts/publicProfile';
import type {
  ChangePlatformPasswordCommand,
  OutboxHealth,
  PlatformPasswordChanged,
  PlatformActivityEntry,
  PlatformActivityQuery,
  PlatformAdminProfile,
  PlatformOverview,
} from './contracts/platformHome';
import type { OtherSessionsEnded, VenueSession, VenueStaffProfile } from './contracts/venueAccount';
import type {
  BranchShifts,
  CreateStaffInput,
  EnrolmentCode,
  PhonePairingCode,
  ShiftInput,
  StaffDevice,
  StaffMember,
  StaffShift,
  StaffSignInLink,
  UpdateStaffInput,
} from './contracts/staff';
import type {
  MenuReport,
  OccupancyReport,
  ReportExport,
  ReportQuery,
  ReportSection,
  ReservationReport,
  RevenueReport,
  StaffReport,
} from './contracts/reports';
import type {
  AddBranchCommand,
  BookingSummaryDays,
  ConsoleUser,
  ConsoleVenue,
  ConsoleVenueDetail,
  CreateVenueCommand,
  ListVenuesQuery,
  ManagedVenue,
  Page,
  SubscriptionTier,
  UpdateVenueCommand,
  VenueBookingsSummary,
} from './contracts/console';

/**
 * Everything the web console needs from a data source.
 *
 * Separate from {@link YallaGateway} on purpose: that one describes what a
 * diner's phone needs, and nothing in it should be able to suspend a venue.
 * Both are implemented twice — once against mock data, once over HTTP — and
 * both are swapped in exactly one module.
 *
 * Every method here is scoped **server-side** by the caller's token. The client
 * never passes a venue or branch id it did not receive from
 * {@link getCurrentUser} or from a list the server already filtered.
 */
export interface ConsoleGateway {
  /**
   * Who is signed in, with the scope their token grants.
   *
   * The navigation is built from this. A waiter's router has no platform route
   * at all — not a hidden one — so there is nothing to reveal by editing CSS or
   * typing a URL.
   */
  getCurrentUser(): Promise<ConsoleUser>;

  // --- Platform -----------------------------------------------------------
  /** Paged, searchable. Suspended venues are included; the team needs to see them. */
  listVenues(query: ListVenuesQuery): Promise<Page<ConsoleVenue>>;

  /**
   * The platform tier's view of one venue: `GET /api/platform/venues/{id}`,
   * **platform admin only**. Every owner and manager is answered 403, which is
   * why no venue screen may read its branches from here — see
   * {@link getManagedVenue}.
   *
   * @throws {ForbiddenError} the caller is not a platform admin.
   */
  getVenue(venueId: string): Promise<ConsoleVenueDetail | null>;

  // --- The venue, for the people who run it ------------------------------------

  /**
   * The venue the caller manages, with the branches their staff row covers.
   *
   * `GET /api/venues/{venueId}/manage`, `ManagerOrAbove` and `VenueScoped`. The
   * server reads coverage from the caller's own stored row — active, in this
   * venue, an owner, a general manager or a branch manager — and never from the
   * token's branch claim: an owner's token carries none, and neither does a
   * general manager's, who runs the whole venue. A branch manager is given
   * their own branch alone. This is the one read the venue section learns its branches
   * from; the client never widens or narrows the answer.
   *
   * @throws {ForbiddenError} a waiter or kitchen account, another venue's
   * staff, or a caller whose row no longer qualifies.
   * @throws {NotFoundError} no such venue — reachable by the platform admin only.
   */
  getManagedVenue(venueId: string): Promise<ManagedVenue>;

  /**
   * @throws {SlugTakenError} the web address is already in use.
   */
  createVenue(command: CreateVenueCommand): Promise<ConsoleVenueDetail>;

  /**
   * Name, web address and type. Platform admin only.
   *
   * @throws {SlugTakenError} the web address belongs to another venue.
   */
  updateVenue(command: UpdateVenueCommand): Promise<ConsoleVenueDetail>;

  /**
   * Another branch, on the Free tier and an empty floor, like a venue's first.
   * Answers with the whole venue so the screen replaces its copy.
   *
   * @throws {SlugTakenError} the venue already has a branch at that address.
   */
  addBranch(command: AddBranchCommand): Promise<ConsoleVenueDetail>;

  /** Reversible, and mostly about billing. */
  suspendVenue(input: { venueId: string; commandId: string }): Promise<ConsoleVenueDetail>;
  resumeVenue(input: { venueId: string; commandId: string }): Promise<ConsoleVenueDetail>;

  /**
   * Soft delete.
   *
   * @throws {VenueDeletionBlockedError} a table is still mid-service or a
   * booking is still to come. The error carries which tables and which
   * booking codes, because "cannot delete" alone is not actionable.
   */
  deleteVenue(input: { venueId: string; commandId: string }): Promise<ConsoleVenueDetail>;

  /**
   * Undo a soft delete: the venue comes back as it was, suspended if it was
   * suspended. What the list's "Undo" after a delete and its "Restore" on a
   * deleted row call. Platform admin only.
   *
   * `POST /api/platform/venues/{venueId}/restore`. A venue that is not deleted
   * is answered as it is: an Undo pressed twice is not an error.
   *
   * @throws {ConcurrencyConflictError} its web address was taken while it was
   * deleted (409 `conflicting-state`, naming the venue that has it).
   */
  restoreVenue(input: { venueId: string; commandId: string }): Promise<ConsoleVenueDetail>;

  /**
   * A venue's bookings over the last 7 or 30 days, aggregates only: counts by
   * status, by branch and by weekday, and the average party. Platform admin
   * only; never a guest's name or phone.
   *
   * `GET /api/platform/venues/{venueId}/bookings-summary?days=7|30`.
   */
  getVenueBookingsSummary(input: {
    venueId: string;
    days: BookingSummaryDays;
  }): Promise<VenueBookingsSummary>;

  // --- Home and Settings (platform admin only) ------------------------------

  /** `GET /api/platform/overview`: Home in one read. */
  getPlatformOverview(): Promise<PlatformOverview>;

  /**
   * `GET /api/platform/outbox`: the counts and the messages given up on, for
   * Home's "Details". There is no retry, by decision.
   */
  getOutboxHealth(): Promise<OutboxHealth>;

  /** `GET /api/platform/activity`: the newest audit rows, newest first. */
  listPlatformActivity(query?: PlatformActivityQuery): Promise<readonly PlatformActivityEntry[]>;

  /**
   * `GET /api/platform/booking-blocks`: guests blocked from booking for
   * no-shows, the blocks in force, newest first (guest record review round).
   */
  listBookingBlocks(): Promise<readonly BookingBlock[]>;

  /**
   * `POST /api/platform/booking-blocks/{blockId}/lift` with a reason (3–500
   * characters). The guest may book again and is told; what the block
   * cancelled stays cancelled.
   *
   * @throws {ValidationError} 400 — the reason is missing or out of bounds.
   * @throws {ConcurrencyConflictError} 409 `conflicting-state` — the block had already ended.
   */
  liftBookingBlock(command: LiftBookingBlockCommand): Promise<BookingBlock>;

  /** `GET /api/platform/me`. */
  getPlatformProfile(): Promise<PlatformAdminProfile>;

  /**
   * `PATCH /api/platform/me`: the admin's own name. The email is fixed.
   *
   * @throws {ValidationError} `fullName` blank or over 200 characters.
   */
  updatePlatformProfile(input: { fullName: string }): Promise<PlatformAdminProfile>;

  /**
   * `POST /api/platform/me/password`. Every other sign-in ends; this one stays.
   *
   * @throws {ValidationError} one 422 naming each field: `currentPassword`
   * missing (`required`) or wrong (`conflict`), `newPassword` missing or
   * shorter than 12 (`min`). A wrong current password is a form error, not a 401.
   */
  changePlatformPassword(command: ChangePlatformPasswordCommand): Promise<PlatformPasswordChanged>;

  // --- My account, for an owner, a general manager or a branch manager ----

  /**
   * `GET /api/venue/me`: the signed-in venue staff member. Owners, general
   * managers and branch managers with a password sign-in only.
   *
   * @throws {ForbiddenError} the platform admin (who has `/api/platform/me`),
   * or a tablet session.
   */
  getVenueProfile(): Promise<VenueStaffProfile>;

  /**
   * `PATCH /api/venue/me`: their own name. The email is not theirs to change.
   *
   * @throws {ValidationError} `fullName` blank (`required`) or over 200 characters (`max`).
   */
  updateVenueProfile(input: { fullName: string }): Promise<VenueStaffProfile>;

  /**
   * `POST /api/venue/me/password`. Every session of the account ends; the
   * answer is a fresh pair for this browser, adopted at once so it stays
   * signed in.
   *
   * @throws {ValidationError} one 422 naming each field, as the platform's.
   * @throws {TooManyRequestsError} 10 wrong current passwords in 15 minutes.
   */
  changeVenuePassword(command: ChangePlatformPasswordCommand): Promise<PlatformPasswordChanged>;

  /** `GET /api/venue/me/sessions`: the current sign-in first, then the most recently active. */
  listVenueSessions(): Promise<readonly VenueSession[]>;

  /**
   * `POST /api/venue/me/sessions/sign-out-others`. This browser's access token
   * dies with the others' but its refresh token is kept, so the next request
   * renews it (the client's `session-revoked` refresh).
   *
   * @throws {SignInUnknownError} 409 `sign-in-unknown`: the token names no
   * sign-in to keep, and nothing changed. Signing in again fixes it.
   */
  signOutOtherVenueSessions(): Promise<OtherSessionsEnded>;

  /** Platform admin only; an owner cannot change what they are paying for. */
  setBranchTier(input: {
    branchId: string;
    tier: SubscriptionTier;
    commandId: string;
  }): Promise<ConsoleVenueDetail>;

  // --- The rooms editor -----------------------------------------------------

  /** Rooms with their photos, every table with its pin and QR token, and the plan's `version`. */
  getFloorPlan(branchId: string): Promise<EditorFloorPlan>;

  /**
   * Replace rooms, their photos and every table's pin in one call, against the
   * `version` the editor loaded (K6). A photo dropped from every room, or
   * moved to another room, takes its tables off it (with a warning); a
   * bookable table with no pin is saved with a warning that diners are not
   * offered it. Rooms match by id first, then by name among the unclaimed.
   *
   * @throws {FloorPlanChangedError} somebody saved the plan since it was
   * loaded; nothing was written. Carries the server's `currentVersion`.
   * @throws {FloorPlanInvalidError} `floor-plan-invalid`: a missing or
   * repeated label or room name, a table matched twice, or one room id sent
   * by two entries.
   * @throws {ValidationError} `validation-failed`: more than ten photos in a
   * room (`areas[i].photoIds`, `max`), a photo twice or in two rooms
   * (`areas[i].photoIds[j]`, `conflict`), half a pin (`tables[i].photoId|photoX|photoY`,
   * `required`), a coordinate outside 0–1 (`range`), a pin on another room's
   * photo (`tables[i].photoId`, `conflict`), or a missing `expectedVersion`.
   * @throws {NotFoundError} a photo that was not uploaded for this branch.
   */
  replaceFloorPlan(input: {
    branchId: string;
    command: ReplaceFloorPlanCommand;
  }): Promise<FloorPlanSaveResult>;

  /**
   * What the branch still needs before it can take diners,
   * `GET /api/branches/{branchId}/readiness`. The onboarding checklist renders
   * this answer and derives nothing on its own.
   */
  getBranchReadiness(branchId: string): Promise<BranchReadiness>;

  /**
   * Add a room with no photos. Like the rename and the delete below, it moves
   * the plan's `version`: an editor holding the plan must reload it, or its
   * next save is a `FloorPlanChangedError`.
   *
   * @throws {ValidationError} `name`, bound `conflict`: another room has the
   * name (ignoring case and spaces at the ends).
   */
  createFloorArea(input: {
    branchId: string;
    name: string;
    displayOrder: number;
  }): Promise<EditorFloorArea>;

  /** Moves the plan's `version`; refuses another room's name like {@link createFloorArea}. */
  updateFloorArea(input: {
    branchId: string;
    areaId: string;
    name: string;
    displayOrder: number;
  }): Promise<EditorFloorArea>;

  /** The room and its photos go; its tables stay, with no room and no pin. Moves the `version`. */
  deleteFloorArea(input: { branchId: string; areaId: string }): Promise<void>;

  /**
   * Delete a table that has never been used, or deactivate one that has.
   * The result says which happened, and the editor shows it either way.
   */
  deleteTable(input: { branchId: string; tableId: string }): Promise<TableDeletionResult>;

  /**
   * Replace a compromised QR code. The one thing that changes a `qrToken`, and
   * the printed sticker on that table stops working the moment it lands.
   */
  regenerateTableQr(input: { tableId: string }): Promise<{ qrToken: string }>;
  // --- The menu editor --------------------------------------------------------

  /**
   * Every category with every item, including unavailable ones.
   *
   * `GET /api/branches/{id}/menu/manage`, not the diner's `/menu`. The two
   * return the same shape and only this one is reachable for a **suspended**
   * venue — a manager fixing their menu during a suspension needs to see it,
   * and the diner route refuses on purpose.
   */
  getAdminMenu(branchId: string): Promise<readonly AdminMenuCategory[]>;

  /** `displayOrder` absent: last (VC3 wire §2, "create lands last"). */
  createCategory(input: {
    branchId: string;
    name: string;
    displayOrder?: number | undefined;
  }): Promise<AdminMenuCategory>;

  updateCategory(input: {
    branchId: string;
    categoryId: string;
    name?: string | undefined;
    displayOrder?: number | undefined;
  }): Promise<AdminMenuCategory>;

  /**
   * Remove a category **and its items**.
   *
   * There is no reassignment: the items go with it. The screen therefore has to
   * say how many, because "delete category" is a very different decision when
   * it takes fourteen dishes with it.
   *
   * @throws {CategoryInUseError} 409 — one of its items appears on an order, so
   * nothing is deleted. The way through is to mark those items unavailable.
   */
  deleteCategory(input: { branchId: string; categoryId: string }): Promise<void>;

  createMenuItem(input: { branchId: string; item: CreateMenuItemInput }): Promise<AdminMenuItem>;

  updateMenuItem(input: {
    branchId: string;
    itemId: string;
    patch: UpdateMenuItemInput;
  }): Promise<AdminMenuItem>;

  /** "We're out of khachapuri tonight." Separate from delete, and reversible. */
  setMenuItemAvailability(input: {
    branchId: string;
    itemId: string;
    isAvailable: boolean;
  }): Promise<AdminMenuItem>;

  /**
   * Delete an item, or deactivate one that appears on an order.
   *
   * The result says which happened. An item referenced by an order line cannot
   * go — the reference has to survive — so it is marked unavailable instead,
   * and the screen shows the server's own sentence rather than a success.
   */
  deleteMenuItem(input: { branchId: string; itemId: string }): Promise<MenuItemDeletion>;

  /**
   * `DELETE …/menu/items/{id}/photo`: the one field the PATCH cannot clear.
   * The dish comes back without a photo, unfinished and off the diner's menu
   * until it has one again; the picture itself is kept for a while (it may be
   * used elsewhere), so setting its id again undoes this.
   */
  removeMenuItemPhoto(input: { branchId: string; itemId: string }): Promise<AdminMenuItem>;

  /**
   * `PUT …/menu/categories/order`: **every** category of the branch, each
   * once, first to last; the answer is the whole menu with display orders
   * 0..n-1. One transaction under the branch lock, so two consoles reordering
   * at once get one whole order, never a mix (VC3 wire §2).
   *
   * @throws {ValidationError} 422 on `categoryIds` (`conflict`): the list
   * misses one, repeats one or names another branch's — a stale menu, so
   * reload and retry.
   */
  reorderMenuCategories(input: {
    branchId: string;
    categoryIds: readonly string[];
  }): Promise<readonly AdminMenuCategory[]>;

  /**
   * `PUT …/menu/categories/{id}/items/order`: every item of that category,
   * each once, first to last; the answer is that category in its new order.
   *
   * @throws {ValidationError} 422 on `itemIds` (`conflict`), as above.
   */
  reorderMenuItems(input: {
    branchId: string;
    categoryId: string;
    itemIds: readonly string[];
  }): Promise<AdminMenuCategory>;

  // --- Photos ------------------------------------------------------------------

  /**
   * Upload one photo and get its three variants back.
   *
   * Multipart, one `file` part. The bytes are **sniffed rather than trusted**,
   * so a `.jpg` that is really a HEIC is refused with that said plainly — the
   * file name and the declared content type are both attacker-controlled and
   * neither is consulted.
   *
   * Uploading the same image twice returns the first photo and writes nothing,
   * with `wasDeduplicated` set. Reported rather than hidden: an upload that
   * wrote nothing looks like a failure.
   *
   * @throws {UnsupportedImageError} not a JPEG, PNG or WebP, or too large.
   */
  uploadPhoto(input: {
    branchId: string;
    file: Blob;
    fileName: string;
    /** 0–1, for the progress bar. These are phone photos and they are large. */
    onProgress?: ((fraction: number) => void) | undefined;
    signal?: AbortSignal | undefined;
  }): Promise<PhotoUpload>;

  // --- Opening hours ------------------------------------------------------------

  getOpeningHours(branchId: string): Promise<WeeklyHours>;

  /**
   * Replace the whole week, atomically.
   *
   * Every block for every day, in one call. `closesNextDay` is derived
   * server-side and is not accepted from a client, so it is not sent.
   *
   * @throws {OverlappingHoursError} two blocks on one day overlap; the error
   * names the days.
   */
  replaceOpeningHours(input: { branchId: string; week: WeeklyHours }): Promise<WeeklyHours>;

  /**
   * `GET …/opening-hours/exceptions`: the special days — holidays, closures,
   * different hours on one date — from the branch's service date on, earliest
   * first, with the list's version. Each replaces that date's weekly blocks
   * entirely; an entry before today is last night's, still running, and
   * read-only.
   */
  getSpecialDays(branchId: string): Promise<SpecialDaysList>;

  /**
   * `PUT …/opening-hours/exceptions`: the **whole** list from the branch's
   * today on, against the version it was read at; entries before today are
   * history and are ignored. The console adds or removes one day at a time by
   * sending the list with that change, and takes the answer as the new list.
   *
   * @throws {ConcurrencyConflictError} 409 `concurrent-update`: saved by
   * somebody else since `expectedVersion` (or the branch lock timed out).
   * Nothing was written; read the list again and re-apply the change.
   * @throws {ValidationError} 422 `validation-failed`, naming `days[i].date`
   * (`max` past the horizon, `conflict` a date twice), `days[i].note` (`max`
   * 60), `days[i].blocks` (`max` 4) or a block that overlaps another or has no
   * length. Nothing is saved.
   */
  replaceSpecialDays(input: {
    branchId: string;
    expectedVersion: string;
    days: readonly SpecialDay[];
  }): Promise<SpecialDaysSaved>;

  // --- The public page ------------------------------------------------------------

  getPublicProfile(branchId: string): Promise<BranchPublicProfile>;

  /**
   * Replace the public settings, including the venue card's picture.
   *
   * @throws {ValidationError} `phoneE164` is not E.164; the error names the field.
   * @throws {NotFoundError} `coverPhotoId` was not uploaded for this branch.
   */
  updatePublicProfile(input: {
    branchId: string;
    profile: BranchPublicProfileInput;
  }): Promise<BranchPublicProfile>;

  // --- The diner app listing ------------------------------------------------------

  getBranchListing(branchId: string): Promise<VenueListing>;

  /**
   * Replace the listing: cuisine, about, price level, website, amenities, the
   * map pin with its street address, and the ordered gallery. Tables are
   * pinned on room photos through {@link replaceFloorPlan}.
   *
   * Refused in the server's order, and nothing is written for any refusal:
   * half a coordinate or an address without coordinates (422), more than 12 or
   * repeated gallery photos (422 `galleryPhotoIds`), a gallery photo not
   * uploaded for this branch (404), the other fields (422, all at once), then a
   * move by somebody who may not move the branch (403).
   *
   * @throws {ValidationError} 422 naming the bad fields in `violations`, each with its `bound`.
   * @throws {NotFoundError} a gallery photo was not uploaded for this branch.
   * @throws {RelocationNotAllowedError} a manager changed the pin or the
   * address; only an owner or a platform admin may (K5).
   */
  updateBranchListing(input: {
    branchId: string;
    listing: VenueListingInput;
  }): Promise<VenueListing>;

  // --- The reservation policy ---------------------------------------------------

  getReservationPolicy(branchId: string): Promise<ReservationPolicy>;

  /**
   * What this branch's policy ships with, and the server's editing bounds:
   * `GET /api/branches/{id}/reservation-policy/defaults`. Same access as the
   * policy itself.
   */
  getReservationPolicyDefaults(branchId: string): Promise<ReservationPolicyDefaults>;

  /**
   * Replace the policy.
   *
   * Out-of-range values are **refused, never clamped**, and the refusal names
   * the field in prose. The result says how many existing bookings now fall
   * outside the new rules — they are not changed, and somebody has to be told.
   *
   * @throws {PolicyBoundsError} a field is outside its bounds (a `422
   * validation-failed` naming it, or the older 400 in prose).
   */
  replaceReservationPolicy(input: {
    branchId: string;
    policy: ReservationPolicy;
  }): Promise<PolicyChangeResult>;

  // --- Pre-orders (2026-10-21) ------------------------------------------------

  /**
   * Whether the branch takes pre-orders, when the waiter's card appears, and
   * which dishes are excluded — with the bounds and the product's fixed
   * numbers. `GET /api/branches/{branchId}/pre-order-settings`, manager or
   * above at the branch. Default: off, 30 minutes, none excluded.
   *
   * @throws {ForbiddenError} not a manager of this branch.
   */
  getPreOrderSettings(branchId: string): Promise<PreOrderSettings>;

  /**
   * Save all three — `PUT /api/branches/{branchId}/pre-order-settings`.
   * `excludedMenuItemIds` is the **whole** list. Turning it off keeps
   * existing pre-orders working; new ones and edits are refused. Every
   * dish's `availableForPreOrder` follows, so the menu is read again.
   *
   * @throws {ValidationError} `minutesBefore` outside 5–120, or an excluded id
   * not on this branch's menu (`excludedMenuItemIds`).
   */
  savePreOrderSettings(input: {
    readonly branchId: string;
    readonly settings: PreOrderSettingsInput;
  }): Promise<PreOrderSettings>;

  // --- Takeaway (2026-10-22) --------------------------------------------------

  /**
   * The branch's takeaway settings with their bounds —
   * `GET /api/branches/{branchId}/takeaway-settings`, manager or above at the
   * branch. Default: off, staff accept, 20 min, 30 min, 5 at once.
   *
   * @throws {ForbiddenError} not a manager of this branch.
   */
  getTakeawaySettings(branchId: string): Promise<TakeawaySettings>;

  /**
   * Save all five — `PUT /api/branches/{branchId}/takeaway-settings`. The
   * per-dish "for takeaway" switch is the menu item's
   * (`updateMenuItem({ patch: { availableForTakeaway } })`).
   *
   * @throws {ValidationError} every field out of bounds or off its step, named
   * (`prepMinutes`, `lastOrderMinutes`, `maxInProgress`).
   */
  saveTakeawaySettings(input: {
    readonly branchId: string;
    readonly settings: TakeawaySettingsInput;
  }): Promise<TakeawaySettings>;

  // --- Messages with guests (2026-10-23) ----------------------------------------

  /**
   * The branch's message settings — `GET /api/branches/{branchId}/message-settings`,
   * manager or above at the branch. Default: guests may write, waiters may
   * write, the app's default templates, remind after 3 minutes.
   *
   * @throws {ForbiddenError} not a manager of this branch.
   */
  getMessageSettings(branchId: string): Promise<MessageSettings>;

  /**
   * Save all four — `PUT /api/branches/{branchId}/message-settings`.
   *
   * @throws {ValidationError} every bad field named (`templates`,
   * `templates[i]`, `remindAfterMinutes`); see `messageSettingsViolations`.
   */
  saveMessageSettings(input: {
    readonly branchId: string;
    readonly settings: MessageSettingsInput;
  }): Promise<MessageSettings>;

  // --- Message history (2026-10-24) ---------------------------------------------

  /**
   * The branch's guest threads from the last twelve months, newest last
   * message first, a page at a time — `GET
   * /api/branches/{branchId}/conversations/history`, manager or above at the
   * branch (a branch manager their own; a platform admin may read). Read
   * only: nothing is marked read.
   *
   * @throws {ValidationError} every bad parameter named (`from`, `to`,
   * `kind`, `q`, `limit`, `cursor`); see `messageHistoryViolations`.
   * @throws {ForbiddenError} not a manager of this branch.
   */
  listMessageHistory(branchId: string, query: MessageHistoryQuery): Promise<MessageHistoryPage>;

  /**
   * One thread as the floor reads it, with who wrote each venue message —
   * `GET /api/reservations/{id}/conversation` or
   * `/api/takeaway-orders/{id}/conversation`, with the console's own
   * session. A GET never marks read. `null` for a subject that is gone (or a
   * thread the sweep deleted).
   *
   * @throws {ForbiddenError} not a manager of the subject's branch.
   */
  getStaffConversation(subject: ConversationSubjectRef): Promise<StaffConversation | null>;

  // --- Bookings waiting for approval ------------------------------------------

  /**
   * The branch's bookings in `PendingApproval`, soonest first, each with the
   * diner's `note` for the venue.
   *
   * `GET /api/branches/{branchId}/reservations?status=1` — `ManagerOrAbove`
   * and `BranchScoped`, so a manager whose home branch is another one is
   * refused (K4). The server caps the list at 200 and orders it by the
   * branch's own day and start time; the order is kept.
   *
   * @throws {ForbiddenError} not a manager of this branch.
   */
  listPendingReservations(branchId: string): Promise<readonly ConsoleBooking[]>;

  /**
   * `POST /api/reservations/{id}/approve`. Confirmed, and the diner is told.
   *
   * `ManagerOrAbove` at the route; the branch half is the service's: a manager
   * or owner *with* a home branch may decide only at that branch, one with no
   * branch anywhere in their venue. A 403 for the wrong branch and a 409 for a
   * booking that is not pending both carry the server's sentence as `message`.
   *
   * @throws {ForbiddenError} not a manager of this booking's branch.
   * @throws {ConcurrencyConflictError} the booking was not pending.
   */
  approveReservation(command: DecideReservationCommand): Promise<ConsoleBooking>;

  /**
   * `POST /api/reservations/{id}/reject`. Becomes `CancelledByVenue`, with
   * the reason recorded, and the diner is told. Same guards as approve.
   */
  rejectReservation(command: DecideReservationCommand): Promise<ConsoleBooking>;

  // --- Overview -----------------------------------------------------------------

  /**
   * The branch's today in one read: bookings by status, people in the room,
   * open tabs, revenue against the same weekday last week, booked people per
   * hour, and every booking of the day.
   *
   * `GET /api/branches/{branchId}/overview` — `ManagerOrAbove` and
   * `BranchScoped`, with the stored-row check: an owner or general manager at
   * any branch of their venue, a branch manager at their own only.
   *
   * @throws {ForbiddenError} not a manager of this branch.
   */
  getBranchOverview(branchId: string): Promise<BranchOverview>;

  /**
   * One of the Overview row menu's actions on a booking of today: seat it,
   * mark it a no-show, call it off for the venue, or finish its sitting. See
   * `ConsoleBookingActionKind` for the route each one is.
   *
   * @throws {ForbiddenError} not a manager of this booking's branch.
   * @throws {ConcurrencyConflictError} the booking or its table is not in a
   * state the action applies to — somebody else acted first; the server's
   * sentence is the message.
   */
  actOnBooking(command: ConsoleBookingActionCommand): Promise<ConsoleBookingActionResult>;

  // --- Review moderation ------------------------------------------------------

  /**
   * A branch's reviews for the platform team, hidden ones included, with how
   * often diners reported each — `GET /api/platform/branches/{branchId}/reviews
   * ?filter=all|reported|hidden`. 20 a page by default.
   *
   * @throws {ForbiddenError} not a platform admin.
   */
  listPlatformBranchReviews(
    branchId: string,
    query?: VenueReviewQuery,
  ): Promise<ModeratedReviewPage>;

  /**
   * Set a review's reports aside and leave the review as it is: the platform
   * read them and found nothing to take down. Audited.
   *
   * `POST /api/platform/reviews/{reviewId}/dismiss-reports`, no body. Nothing
   * un-dismisses: the console defers the call until its Undo is out of reach.
   *
   * @throws {NotFoundError} no such review.
   * @throws {ForbiddenError} not a platform admin.
   */
  dismissReviewReports(reviewId: string): Promise<VenueModeratedReview>;

  /**
   * Undo a dismissal: the reports it set aside count again. What the toast's
   * Undo after "Dismiss reports" calls. Platform admin only.
   *
   * `POST /api/platform/reviews/{reviewId}/restore-reports`, no body — being
   * added by the backend with the review fixes.
   *
   * @throws {NotFoundError} no such review.
   * @throws {ForbiddenError} not a platform admin.
   */
  restoreReviewReports(reviewId: string): Promise<VenueModeratedReview>;

  /**
   * The platform takes a venue's reply down — `DELETE
   * /api/platform/reviews/{reviewId}/reply` (VC4 wire, review round 1). Shown
   * or hidden review alike; nothing to remove is not an error. Audited, and
   * on the platform's activity feed. The platform never writes a reply.
   *
   * @throws {NotFoundError} no such review.
   * @throws {ForbiddenError} not a platform admin.
   */
  removePlatformReviewReply(reviewId: string): Promise<VenueModeratedReview>;

  /**
   * The platform's takedown, `PUT /api/platform/reviews/{reviewId}/visibility`.
   * Audited. A review the platform hides cannot be restored by the venue; one
   * the venue hid can be restored here.
   *
   * @throws {ValidationError} hiding with no reason, or one over 500 characters.
   * @throws {NotFoundError} no such review.
   * @throws {ForbiddenError} not a platform admin.
   */
  setReviewVisibility(
    reviewId: string,
    command: SetReviewVisibilityCommand,
  ): Promise<ModeratedReview>;

  /**
   * A branch's reviews for its owner or manager, with how often diners reported
   * each — `GET /api/branches/{branchId}/reviews?filter=all|reported|hidden`.
   *
   * @throws {ForbiddenError} not a manager of this branch.
   */
  listVenueBranchReviews(branchId: string, query?: VenueReviewQuery): Promise<ModeratedReviewPage>;

  /**
   * The venue's own hide or restore, with a reason,
   * `PUT /api/branches/{branchId}/reviews/{reviewId}/visibility`. Audited.
   *
   * @throws {ReviewHiddenByPlatformError} restoring a review the platform hid.
   * @throws {ValidationError} hiding with no reason, or one over 500 characters.
   * @throws {NotFoundError} no such review at this branch.
   * @throws {ForbiddenError} not a manager of this branch.
   */
  setVenueReviewVisibility(
    branchId: string,
    reviewId: string,
    command: SetReviewVisibilityCommand,
  ): Promise<VenueModeratedReview>;

  /**
   * Write the venue's one public reply under a review, or replace its text —
   * `PUT /api/branches/{branchId}/reviews/{reviewId}/reply` (VC4 wire §1). The
   * owner, a general manager, or the branch's own manager; signed with their
   * name and role. The first reply tells the reviewer in the diner app's feed.
   *
   * @throws {ValidationError} no text, or over {@link MAX_REVIEW_REPLY} once trimmed.
   * @throws {ReviewHiddenNoReplyError} the review is hidden.
   * @throws {NotFoundError} no such review at this branch.
   * @throws {ForbiddenError} not the venue's owner or manager here (the platform included).
   */
  replyToReview(branchId: string, reviewId: string, text: string): Promise<VenueModeratedReview>;

  /**
   * Take the reply down — `DELETE …/reviews/{reviewId}/reply`. What Undo after
   * a first reply calls; it also takes back the reviewer's unread notice.
   * Nothing to remove is not an error.
   */
  removeReviewReply(branchId: string, reviewId: string): Promise<VenueModeratedReview>;

  // --- Staff ----------------------------------------------------------------

  /*
   * Staff belong to a **venue**, not a branch — an owner works everywhere — so
   * these are addressed by venue while the device methods below are addressed
   * by branch. The two scopes sit on one screen and the difference is real:
   * `branchId` of `null` means every branch of the venue, which is how an owner
   * who works the floor or a general manager is represented.
   *
   * Every role guard is enforced server-side from the acting staff member's
   * *stored* role. The client builds its pickers from `assignableRoles` so it
   * never offers an action the server will refuse; it does not re-implement the
   * check, and it does not rely on having made it.
   */
  listStaff(venueId: string): Promise<readonly StaffMember[]>;

  /**
   * @throws {StaffPermissionError} the role asked for is at or above the
   * caller's own.
   */
  createStaff(input: { venueId: string; staff: CreateStaffInput }): Promise<StaffMember>;

  /**
   * @throws {StaffPermissionError} changing your own role, or editing somebody
   * you could not have created.
   */
  updateStaff(input: {
    venueId: string;
    staffMemberId: string;
    patch: UpdateStaffInput;
  }): Promise<StaffMember>;

  /**
   * Set or reset a PIN. Four digits.
   *
   * The PIN travels in the body and is shown to the manager exactly once, on a
   * screen built to be read aloud across a counter. It is never returned by any
   * read, never logged, never put in a URL and never stored anywhere on the
   * client — a PIN that can be looked up later is a PIN that ends up written on
   * the till.
   */
  setStaffPin(input: { venueId: string; staffMemberId: string; pin: string }): Promise<StaffMember>;

  /**
   * Give a manager or owner their admin-panel sign-in.
   *
   * Stores the address and returns a link the person opens to choose their own
   * password — the reset endpoint that consumes it is the only thing that ever
   * sets one. The link is returned **once**: the server keeps the token's hash
   * and never logs it, so a lost link is replaced by issuing another, which
   * retires the earlier unused one. Good for 24 hours and exactly one use.
   *
   * Somebody who already has a password keeps it, and their open sessions,
   * until the link is used. Their sign-in *address* changes the moment this
   * answers, which is why the screen confirms a changed address first.
   *
   * @throws {StaffPermissionError} issuing for yourself, a peer, or somebody
   * above you — an owner issues for managers, a platform admin for owners.
   * @throws {NotFoundError} no such staff member in this venue.
   * @throws {ConcurrencyConflictError} a waiter or kitchen hand (they sign in
   * with a PIN), a deactivated person, or an address that already has an
   * account. `message` carries the server's sentence.
   * @throws {ValidationError} `email` missing or not an address; `field` names it.
   */
  issueStaffSignIn(input: {
    venueId: string;
    staffMemberId: string;
    email: string;
  }): Promise<StaffSignInLink>;

  /**
   * Unlock somebody who mistyped their PIN too many times.
   *
   * Branch-addressed rather than venue-addressed, following the endpoint. This
   * is the path that actually gets used mid-service: a waiter who fat-fingered
   * a PIN during a rush cannot be made to wait out a timer.
   */
  clearPinLockout(input: { branchId: string; staffMemberId: string }): Promise<void>;

  // --- Shifts ---------------------------------------------------------------

  /**
   * A branch's shifts and days off over a window, with today's head count —
   * `GET /api/branches/{branchId}/shifts?from&to`. Both dates optional: the
   * server answers from the branch's service day for two weeks. Active people
   * only; a window over 92 days is a 422 on `to`.
   */
  listBranchShifts(input: {
    branchId: string;
    from?: string | undefined;
    to?: string | undefined;
  }): Promise<BranchShifts>;

  /**
   * Plan a shift or a day off for somebody at this branch.
   *
   * Written by whoever may manage that person (the staff rank rule; a branch
   * manager at their own branch only), or by the person themselves.
   *
   * @throws {ValidationError} a date before the service day or past 92 days,
   *   no times on a working shift, an end equal to the start or over 16 hours,
   *   an overlap with another of their shifts at any branch (`startsAt`), or a
   *   day off on a date that has a shift (`date`) — each in `violations`.
   * @throws {StaffPermissionError} the person is not the caller's to plan.
   * @throws {ConcurrencyConflictError} the person is deactivated. Two writes
   *   for one person wait for each other on the server, so of two overlapping
   *   shifts saved at once the second is the 422 on `startsAt`.
   */
  createShift(input: {
    branchId: string;
    staffMemberId: string;
    shift: ShiftInput;
  }): Promise<StaffShift>;

  /** The whole shift again; the person does not change. Same refusals as create. */
  updateShift(input: { branchId: string; shiftId: string; shift: ShiftInput }): Promise<StaffShift>;

  /** Gone. The undo is a create with the same values (a new id). */
  deleteShift(input: { branchId: string; shiftId: string }): Promise<void>;

  // --- Devices --------------------------------------------------------------

  /**
   * Every device enrolled to this branch, revoked ones included: `kind`
   * narrows it to the tablets or the personal phones (`?kind=1|2`); absent,
   * the server answers both.
   */
  listDevices(branchId: string, kind?: 'tablet' | 'phone'): Promise<readonly StaffDevice[]>;

  /**
   * A ten-minute, single-use code that pairs one person's own phone, returned
   * **once**. A newer one for the same person supersedes it. Kitchen staff are
   * refused with {@link KitchenPhoneNotAllowedError}.
   */
  createPhonePairing(input: { branchId: string; staffMemberId: string }): Promise<PhonePairingCode>;

  /**
   * Mint a one-time enrolment code, returned **once**.
   *
   * Only its hash is stored, so "regenerate" is genuinely a new code rather
   * than a second look at the old one.
   */
  createEnrolmentCode(branchId: string): Promise<EnrolmentCode>;

  /**
   * Kill a tablet. Permanent, and effective on its next request rather than
   * when its token expires.
   */
  revokeDevice(input: { branchId: string; deviceId: string }): Promise<void>;

  // --- Reports ------------------------------------------------------------------

  /*
   * Five separate reads, not one.
   *
   * They are separate on the wire and they stay separate here, because they are
   * separate queries of very different cost — the menu report anti-joins the
   * branch's whole menu to find what never sold — and an owner who wants
   * tonight's covers should not wait on that. Each section of the screen loads,
   * fails and retries on its own; one slow or broken report must not blank the
   * page around it.
   *
   * Every range is in the **branch's local dates**, and every number arrives
   * with its own comparison against the previous equivalent period already
   * computed. The client neither converts the dates nor divides for the
   * percentage: doing either is how a screen ends up disagreeing with the CSV
   * exported from the same request.
   *
   * @throws {ReportRangeTooLongError} the range exceeds `REPORT_MAX_DAYS`.
   */
  getOccupancyReport(query: ReportQuery): Promise<OccupancyReport>;
  getReservationReport(query: ReportQuery): Promise<ReservationReport>;
  getRevenueReport(query: ReportQuery): Promise<RevenueReport>;
  getMenuReport(query: ReportQuery): Promise<MenuReport>;
  getStaffReport(query: ReportQuery): Promise<StaffReport>;

  /**
   * One section's CSV, **as the server wrote it**.
   *
   * Bytes off the wire, never rows re-derived from the JSON on screen. The
   * export is what an owner forwards to their accountant, and a client that
   * built its own would eventually round, localise or order something
   * differently from the server — at which point two documents claiming to be
   * the same report disagree, and the one with a spreadsheet open beside it
   * wins the argument.
   */
  exportReport(input: ReportQuery & { section: ReportSection }): Promise<ReportExport>;
}

/** What one upload produced. */
export interface PhotoUpload {
  readonly photo: Photo;
  /** True when these exact bytes were already stored and nothing was written. */
  readonly wasDeduplicated: boolean;
  /** Total across the three variants. */
  readonly bytesStored: number;
}
