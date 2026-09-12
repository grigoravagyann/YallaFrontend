import type { ConsoleBooking, DecideReservationCommand } from './contracts/approvals';
import type {
  EditorFloorArea,
  EditorFloorPlan,
  FloorPlanSaveResult,
  ReplaceFloorPlanCommand,
  TableDeletionResult,
} from './contracts/floorPlan';
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
  WeeklyHours,
} from './contracts/branchSettings';
import type { BranchPublicProfile, BranchPublicProfileInput } from './contracts/publicProfile';
import type {
  CreateStaffInput,
  EnrolmentCode,
  StaffDevice,
  StaffMember,
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
  ConsoleUser,
  ConsoleVenue,
  ConsoleVenueDetail,
  CreateVenueCommand,
  ListVenuesQuery,
  ManagedVenue,
  Page,
  SubscriptionTier,
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
   * venue, owner or manager — and never from the token's branch claim: an
   * owner's token carries none, and a manager created with no branch runs the
   * whole venue. This is the one read the venue section learns its branches
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

  /** Reversible, and mostly about billing. */
  suspendVenue(input: { venueId: string; commandId: string }): Promise<ConsoleVenueDetail>;
  resumeVenue(input: { venueId: string; commandId: string }): Promise<ConsoleVenueDetail>;

  /**
   * Soft delete.
   *
   * @throws {VenueHasOpenTabsError} a table is still mid-service. The error
   * carries which tabs, because "cannot delete" alone is not actionable.
   */
  deleteVenue(input: { venueId: string; commandId: string }): Promise<ConsoleVenueDetail>;

  /** Platform admin only; an owner cannot change what they are paying for. */
  setBranchTier(input: {
    branchId: string;
    tier: SubscriptionTier;
    commandId: string;
  }): Promise<ConsoleVenueDetail>;

  // --- The floor plan editor ------------------------------------------------

  /** Canvas, areas and every table with its geometry and QR token. */
  getFloorPlan(branchId: string): Promise<EditorFloorPlan>;

  /**
   * Replace the whole plan in one call.
   *
   * @throws {FloorPlanInvalidError} a table outside the canvas or a repeated
   * label; the error names them so the editor can highlight both.
   */
  replaceFloorPlan(input: {
    branchId: string;
    command: ReplaceFloorPlanCommand;
  }): Promise<FloorPlanSaveResult>;

  createFloorArea(input: {
    branchId: string;
    name: string;
    displayOrder: number;
  }): Promise<EditorFloorArea>;

  updateFloorArea(input: {
    branchId: string;
    areaId: string;
    name: string;
    displayOrder: number;
  }): Promise<EditorFloorArea>;

  /** The area goes; its tables stay, with no area. */
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

  createCategory(input: {
    branchId: string;
    name: string;
    displayOrder: number;
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

  // --- The reservation policy ---------------------------------------------------

  getReservationPolicy(branchId: string): Promise<ReservationPolicy>;

  /**
   * Replace the policy.
   *
   * Out-of-range values are **refused, never clamped**, and the refusal names
   * the field in prose. The result says how many existing bookings now fall
   * outside the new rules — they are not changed, and somebody has to be told.
   *
   * @throws {PolicyBoundsError} a field is outside its bounds.
   */
  replaceReservationPolicy(input: {
    branchId: string;
    policy: ReservationPolicy;
  }): Promise<PolicyChangeResult>;

  // --- Bookings waiting for approval ------------------------------------------

  /**
   * The branch's bookings in `PendingApproval`, soonest first.
   *
   * **The server has no route for this yet.** The two decisions below are
   * real; the list a manager would decide *from* is not, so the HTTP gateway
   * raises {@link EndpointNotWiredError} and the panel says so rather than
   * showing an empty list as "nothing is waiting". The mock answers from its
   * fixture so the panel can be built and tested against the decisions.
   *
   * @throws {EndpointNotWiredError} over HTTP, until the backend lists them.
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

  // --- Staff ----------------------------------------------------------------

  /*
   * Staff belong to a **venue**, not a branch — an owner works everywhere — so
   * these are addressed by venue while the device methods below are addressed
   * by branch. The two scopes sit on one screen and the difference is real:
   * `branchId` of `null` means every branch of the venue, which is how a
   * floating manager is represented and was unreachable before this screen.
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

  // --- Devices --------------------------------------------------------------

  /** Every tablet enrolled to this branch, revoked ones included. */
  listDevices(branchId: string): Promise<readonly StaffDevice[]>;

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
