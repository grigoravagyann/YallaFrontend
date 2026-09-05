/**
 * The floor plan read model, matching the backend exactly.
 *
 * The backend stores only *physical* table state and derives the reservation
 * overlay server-side. The client receives `state` already derived and must
 * never compute it: "is this table reserved soon?" depends on the branch clock,
 * the booking's grace period and the venue's turn policy, none of which the
 * client knows.
 */

/**
 * The five states a table can be in, as derived by the backend.
 *
 * Note this is the *derived* state, not a physical one. `reservedSoon` means
 * the table is physically empty but has a booking close enough that seating a
 * walk-in would collide with it.
 */
export type DerivedTableState = 'free' | 'reservedSoon' | 'held' | 'occupied' | 'outOfService';

export type TableShape = 'rectangle' | 'round';

export interface FloorTable {
  readonly id: string;
  /** Owner-authored, e.g. "7". Never generated. */
  readonly label: string;
  readonly seats: number;
  /** Floor-plan units, top-left origin. Not pixels — see {@link computeFloorLayout}. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Clockwise degrees, applied about the table's centre. */
  readonly rotationDegrees: number;
  readonly shape: TableShape;
  /** Grouping label, e.g. "Windows". `null` for a single-room venue. */
  readonly floorAreaName: string | null;
  /** False for tables the venue never takes bookings for (staff pass, service station). */
  readonly isBookable: boolean;
  readonly state: DerivedTableState;
  /** ISO-8601 UTC. Present when `state` is `reservedSoon`; drives the availability window. */
  readonly nextReservationStartUtc: string | null;
  /**
   * ISO-8601 UTC when the party was seated. Not in the original backend
   * contract, but staff mode has to show how long an occupied table has been
   * sitting and that cannot be derived client-side. Optional so a backend that
   * does not send it simply renders no duration rather than a wrong one.
   */
  readonly occupiedSinceUtc?: string | null;
}

/**
 * A fixed feature of the room — a door, the bar counter — drawn so the room is
 * orientable. Purely optional: if the branch data has none we draw none rather
 * than inventing landmarks that are not there.
 */
export type FloorFeatureKind = 'entrance' | 'bar' | 'wall' | 'kitchen';

export interface FloorFeature {
  readonly id: string;
  readonly kind: FloorFeatureKind;
  /** Floor-plan units, same space as tables. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDegrees?: number;
}

export interface FloorPlanData {
  readonly branchId: string;
  /**
   * The branch's own name, when the source carries it.
   *
   * The staff floor endpoint returns it with the room, which is the only way a
   * waiter's screen can title itself: a waiter's token cannot read the venue
   * catalogue, and a second request that 403s is a worse answer than the name
   * already in hand. Optional so a plan built from availability, or from a
   * fixture, simply has none.
   */
  readonly branchName?: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** IANA zone, e.g. "Asia/Yerevan". Every time shown must be rendered in this. */
  readonly timeZoneId: string;
  readonly tables: readonly FloorTable[];
  /**
   * Not in the original backend contract; optional so a branch without mapped
   * features simply renders none.
   */
  readonly features?: readonly FloorFeature[];
}

/** Who is looking at the plan. Drives selectability, dimming and hit-target size. */
export type FloorPlanMode = 'diner' | 'staff';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
