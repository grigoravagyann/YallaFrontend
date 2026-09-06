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

  getVenue(venueId: string): Promise<ConsoleVenueDetail | null>;

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
