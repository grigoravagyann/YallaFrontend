import type { FloorTable, PublicRoom } from '@yalla/api';

/**
 * The room's answer for one slot, read the way the visitor sees it: which
 * tables are offered, which can be taken, how many each room has free, and
 * which one "Choose for me" takes.
 *
 * All of it is the client reading `SlotFloor` — the same answer the pins are
 * drawn from — so the table chosen for the visitor is always one they could
 * have tapped themselves (public-page HANDOFF §3: no new endpoint).
 */

/**
 * The room whose photo carries the table's pin — the room the table is drawn
 * in. `null` for a table on no photo, which the page never offers.
 */
export function roomOf(table: FloorTable, rooms: readonly PublicRoom[]): PublicRoom | null {
  const photoId = table.pin?.photoId;
  if (!photoId) return null;
  return rooms.find((room) => room.photos.some((photo) => photo.photoId === photoId)) ?? null;
}

/**
 * The server gives this party the table at the slot, and nobody has it then.
 *
 * `isBookable` on the slot's plan is the server's decision for this slot and
 * party (`slotFloorFromResponse`), so a table too small or kept for larger
 * parties is never pickable, whatever its seat count says.
 */
export function isPickable(table: FloorTable): boolean {
  return table.isBookable && table.state === 'free';
}

/**
 * Each room's free tables, by room id: the ones a visitor can take when the
 * venue books on the web, every free one when it does not (the room is then a
 * picture of now).
 */
export function freeCountByRoom(
  tables: readonly FloorTable[],
  rooms: readonly PublicRoom[],
  bookable: boolean,
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const room of rooms) counts[room.roomId] = 0;
  for (const table of tables) {
    const room = roomOf(table, rooms);
    if (!room) continue;
    if (bookable ? isPickable(table) : table.state === 'free') counts[room.roomId]! += 1;
  }
  return counts;
}

/**
 * The most seats at any table the page offers, or `null` when there is none.
 * `offline`: tables the venue never books online (`notBookable`), which no
 * party size will ever get here — a twelve-top kept for the phone must not
 * lift the stepper (review N2).
 */
export function largestOfferedTable(
  tables: readonly FloorTable[],
  rooms: readonly PublicRoom[],
  offline: ReadonlySet<string> = new Set(),
): number | null {
  let largest: number | null = null;
  for (const table of tables) {
    if (!roomOf(table, rooms) || offline.has(table.id)) continue;
    largest = Math.max(largest ?? 0, table.seats);
  }
  return largest;
}

const byLabel = (a: FloorTable, b: FloorTable) =>
  a.label.localeCompare(b.label, undefined, { numeric: true });

/** A seat for everyone before a squeeze, then the fewest seats, then the label. */
const byFit = (partySize: number) => (a: FloorTable, b: FloorTable) =>
  Number(a.seats < partySize) - Number(b.seats < partySize) || a.seats - b.seats || byLabel(a, b);

/**
 * Every table the visitor could take at the slot, the best fit first — what
 * the Book sheet offers when the one being booked was just taken (Book
 * artboard, taken). The same pickable rule and order as "Choose for me",
 * across all rooms at once.
 */
export function freeTablesInOrder(
  tables: readonly FloorTable[],
  rooms: readonly PublicRoom[],
  partySize: number,
): FloorTable[] {
  return tables
    .filter((table) => isPickable(table) && roomOf(table, rooms) !== null)
    .sort(byFit(partySize));
}

/**
 * "Choose for me": the smallest free table that fits the party, in the room
 * on screen first, then the other rooms in the venue's order. `null` when no
 * room has one.
 *
 * "Fits" is the server's word (`isPickable`). Among those, a table with a seat
 * for everyone comes before one the venue would squeeze the party round, then
 * the fewest seats — a two-top for two rather than the six-top somebody else's
 * party needs — and the label settles a tie.
 */
export function pickTableFor(input: {
  readonly tables: readonly FloorTable[];
  readonly rooms: readonly PublicRoom[];
  readonly partySize: number;
  /** The room on screen. `null`: the venue's order from the first. */
  readonly currentRoomId: string | null;
}): FloorTable | null {
  const { tables, rooms, partySize, currentRoomId } = input;
  const current = rooms.find((room) => room.roomId === currentRoomId);
  const order = current ? [current, ...rooms.filter((room) => room !== current)] : rooms;

  for (const room of order) {
    const candidates = tables
      .filter((table) => isPickable(table) && roomOf(table, rooms) === room)
      .sort(byFit(partySize));
    if (candidates[0]) return candidates[0];
  }
  return null;
}
