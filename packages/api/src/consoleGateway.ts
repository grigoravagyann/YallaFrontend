import type {
  EditorFloorArea,
  EditorFloorPlan,
  FloorPlanSaveResult,
  ReplaceFloorPlanCommand,
  TableDeletionResult,
} from './contracts/floorPlan';
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
}
