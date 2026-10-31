/**
 * What a branch still needs before it can take diners —
 * `GET /api/branches/{branchId}/readiness`, `BranchReadinessView`.
 *
 * The console renders the onboarding checklist from this answer and derives
 * nothing itself. A client-side guess ("a policy loads, so it was reviewed")
 * was how the checklist ticked a step no human had looked at: every branch
 * ships with a default policy, and only the server knows whether somebody has
 * saved it.
 */
export interface BranchReadiness {
  readonly branchId: string;
  /** Every blocking line satisfied. `acceptsWebBookings` is reported, not blocking. */
  readonly isReadyForDiners: boolean;

  /** At least one active table on the canvas. */
  readonly floorPlanDrawn: boolean;
  readonly tableCount: number;
  /** Every active table has a label. */
  readonly tablesLabelled: boolean;

  readonly menuCategoriesPresent: boolean;
  readonly menuCategoryCount: number;
  readonly menuItemCount: number;
  /** Categories present, at least one item, and no incomplete items. */
  readonly menuComplete: boolean;
  readonly incompleteMenuItemCount: number;
  readonly incompleteMenuItemIds: readonly string[];

  readonly openingHoursSet: boolean;
  readonly openingHoursDayCount: number;

  /** Somebody has **saved** the reservation policy at least once. */
  readonly reservationPolicyReviewed: boolean;

  readonly staffEnrolled: boolean;
  readonly staffCount: number;
  readonly deviceEnrolled: boolean;
  readonly deviceCount: number;

  /** Active tables a diner can book: bookable and pinned on a room photo. */
  readonly bookableTableCount: number;
  /**
   * Every required line done — a bookable table, opening hours, staff, a
   * tablet or staff phone — so diners see the branch and can book it. Without
   * it the branch is hidden from the diner app and the public page.
   */
  readonly takingGuests: boolean;
  /**
   * The required lines still missing, in checklist order: `no-tables` or
   * `no-bookable-table`, `no-hours`, `no-staff`, `no-device`.
   */
  readonly missingForGuests: readonly string[];

  /** The public-page booking switch. On the checklist, deliberately not a blocker. */
  readonly acceptsWebBookings: boolean;

  /** One English sentence per unmet line, for logs and support. Screens use their own copy. */
  readonly blockers: readonly string[];
}
