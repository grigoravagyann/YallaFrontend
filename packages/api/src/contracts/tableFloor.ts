/**
 * The branch's tables as the staff floor and the booking screens read them.
 *
 * There is no drawn floor plan any more: a branch is a set of rooms with
 * photos, and a table is a pin on one of its own room's photos. So a table
 * carries its room (id, name and the room's display order, for grouping) and
 * its pin, and no geometry. The client receives `state` already derived and
 * must never compute it: "is this table reserved soon?" depends on the branch
 * clock, the booking's grace period and the venue's turn policy, none of which
 * the client knows.
 */

/**
 * The five states a table can be in, as derived by the backend.
 *
 * Note this is the *derived* state, not a physical one. `reservedSoon` means
 * the table is physically empty but has a booking close enough that seating a
 * walk-in would collide with it.
 */
export type DerivedTableState = 'free' | 'reservedSoon' | 'held' | 'occupied' | 'outOfService';

/** Where a table sits: one of its room's photos, and fractions of it (0 left/top to 1). */
export interface TablePin {
  readonly photoId: string;
  readonly x: number;
  readonly y: number;
}

export interface FloorTable {
  readonly id: string;
  /** Owner-authored, e.g. "7". Never generated. */
  readonly label: string;
  readonly seats: number;
  /** The room it is in. `null` for a table in no room. */
  readonly floorAreaId: string | null;
  /** The room's name, e.g. "Terrace". `null` for a table in no room. */
  readonly floorAreaName: string | null;
  /** The room's place in the venue's order, lowest first. */
  readonly floorAreaDisplayOrder: number;
  /** False for tables the venue never takes bookings for (staff pass, service station). */
  readonly isBookable: boolean;
  readonly state: DerivedTableState;
  /** ISO-8601 UTC. Present when `state` is `reservedSoon`; drives the availability window. */
  readonly nextReservationStartUtc: string | null;
  /**
   * ISO-8601 UTC when the party was seated. Staff mode shows how long an
   * occupied table has been sitting. Optional so a source that does not send
   * it simply renders no duration rather than a wrong one.
   */
  readonly occupiedSinceUtc?: string | null;
  /** The table's pin on a room photo, or `null` when it is on no photo. */
  readonly pin: TablePin | null;
}

export interface FloorPlanData {
  readonly branchId: string;
  /**
   * The branch's own name, when the source carries it.
   *
   * The staff floor endpoint returns it, which is the only way a waiter's
   * screen can title itself: a waiter's token cannot read the venue catalogue.
   */
  readonly branchName?: string;
  /** IANA zone, e.g. "Asia/Yerevan". Every time shown must be rendered in this. */
  readonly timeZoneId: string;
  /** Room display order first, then label. */
  readonly tables: readonly FloorTable[];
}

/** Room display order first, then label, numerically: "2" before "10". */
export function byRoomThenLabel<
  T extends { readonly floorAreaDisplayOrder: number; readonly label: string },
>(tables: readonly T[]): T[] {
  return [...tables].sort(
    (a, b) =>
      a.floorAreaDisplayOrder - b.floorAreaDisplayOrder ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

/**
 * One room's tables, in room order then label, for a list.
 *
 * Tables in no room come last, under a `null` room.
 */
export interface FloorRoomGroup<T extends FloorTable = FloorTable> {
  readonly roomId: string | null;
  readonly roomName: string | null;
  readonly tables: readonly T[];
}

export function groupByRoom<T extends FloorTable>(tables: readonly T[]): FloorRoomGroup<T>[] {
  const sorted = [...tables].sort((a, b) => {
    const aNone = a.floorAreaId === null && a.floorAreaName === null ? 1 : 0;
    const bNone = b.floorAreaId === null && b.floorAreaName === null ? 1 : 0;
    return (
      aNone - bNone ||
      a.floorAreaDisplayOrder - b.floorAreaDisplayOrder ||
      (a.floorAreaName ?? '').localeCompare(b.floorAreaName ?? '') ||
      // Two rooms with the same order and name stay apart rather than interleave.
      (a.floorAreaId ?? '').localeCompare(b.floorAreaId ?? '') ||
      a.label.localeCompare(b.label, undefined, { numeric: true })
    );
  });
  // By id, or by name for a room with no id: an id and a name never collide.
  const keyOf = (roomId: string | null, roomName: string | null) =>
    roomId !== null ? `id:${roomId}` : `name:${roomName ?? ''}`;
  const groups: { roomId: string | null; roomName: string | null; tables: T[] }[] = [];
  for (const table of sorted) {
    const last = groups[groups.length - 1];
    if (
      last &&
      keyOf(last.roomId, last.roomName) === keyOf(table.floorAreaId, table.floorAreaName)
    ) {
      last.tables.push(table);
    } else {
      groups.push({ roomId: table.floorAreaId, roomName: table.floorAreaName, tables: [table] });
    }
  }
  return groups;
}
