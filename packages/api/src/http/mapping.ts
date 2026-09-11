import type {
  DerivedTableState,
  FloorPlanData,
  FloorTable,
  TableShape,
} from '@yalla/floorplan/types';
import type {
  AvailabilityWindowDto,
  SlotFloor,
  TableAvailability,
  TableUnavailableReason,
} from '../contracts/booking';
import type { components } from '../generated/schema';

type Schemas = components['schemas'];
type FloorState = Schemas['Yalla.Application.Floor.BranchFloorState'];
type FloorTableState = Schemas['Yalla.Application.Floor.TableFloorState'];
type Availability = Schemas['Yalla.Application.Reservations.BranchAvailability'];
type AvailabilityTable = Schemas['Yalla.Application.Reservations.TableAvailability'];

/**
 * Wire shapes to screen shapes, in one place.
 *
 * The backend speaks in integer enums and per-endpoint views; the screens are
 * typed against `FloorPlanData` and `TableAvailability`. Every conversion lives
 * here so that a renamed enum member is one edit, and so the generated types
 * are the only place the wire format is spelled out.
 */

// --- Enums ------------------------------------------------------------------
// Values: 1 Free, 2 ReservedSoon, 3 Held, 4 Occupied, 5 OutOfService.
const DERIVED_STATE: Readonly<Record<number, DerivedTableState>> = {
  1: 'free',
  2: 'reservedSoon',
  3: 'held',
  4: 'occupied',
  5: 'outOfService',
};

export function derivedTableState(value: number): DerivedTableState {
  return DERIVED_STATE[value] ?? 'outOfService';
}

// Values: 1 Rectangle, 2 Round.
export function tableShape(value: number): TableShape {
  return value === 2 ? 'round' : 'rectangle';
}

/**
 * `Yalla.Domain.Occupancy.ReservationRejectionReason` onto the screen's
 * vocabulary. Values: 1 LeadTimeTooShort, 2 OutsideBookingWindow,
 * 3 OutsideOpeningHours, 4 PartyExceedsCapacity, 5 SeatOverhangExceeded,
 * 6 TableNotBookable, 7 TableOutOfService, 8 TableAlreadyBooked,
 * 9 LocalTimeDoesNotExist, 10 TableCurrentlyOccupied.
 */
export function unavailableReason(
  reason: number | null | undefined,
  state: DerivedTableState,
): TableUnavailableReason | null {
  switch (reason) {
    case 1:
      return 'pastLeadTime';
    case 2:
      return 'tooFarAhead';
    case 3:
      return 'closed';
    case 4:
      return 'tooSmall';
    // Overhang is the opposite complaint: the party is too small for the
    // table, not too large for it.
    case 5:
      return 'tooLarge';
    case 6:
      return 'notBookable';
    case 7:
      return 'outOfService';
    /*
     * `TableAlreadyBooked` covers two situations a diner must not be told
     * apart wrongly: somebody is sitting there *right now*, and the slot they
     * asked about collides with a booking. The server separates them in the
     * state it derived **for the requested instant** — `occupied` only survives
     * into a slot that is essentially now — so this reads that rather than
     * assuming the near case. Assuming it is what told a diner asking about
     * Saturday that someone was sitting at the table.
     */
    case 8:
      switch (state) {
        case 'held':
          return 'held';
        case 'occupied':
          return 'occupied';
        default:
          return 'alreadyBooked';
      }
    case 9:
      return 'invalidTime';
    /*
     * `TableCurrentlyOccupied`: an open sitting, projected forward by the turn
     * time, overlaps the slot. Its own member on the server so the diner can be
     * told somebody is sitting there now — and that the table may free up
     * early. It was unmapped, so every table with a walk-in read
     * "Not available at that time: unknown:10."
     */
    case 10:
      return 'occupied';
    default:
      /*
       * A rule this build has no word for. Carried rather than dropped: a
       * dropped reason falls through to a guess made from the table's state,
       * and a guess is how a diner asking about Saturday is told somebody is
       * sitting at the table right now. An unfamiliar reason shown as itself is
       * worse copy and better information.
       */
      return reason == null ? null : `unknown:${reason}`;
  }
}

// --- Floor --------------------------------------------------------------------

interface TableGeometry {
  readonly tableId: string;
  readonly label: string;
  readonly seats: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDegrees: number;
  readonly shape: number;
  readonly floorAreaName?: string | null;
  readonly floorAreaDisplayOrder: number;
  readonly isBookable: boolean;
  readonly state: number;
  readonly nextReservationStartUtc?: string | null;
}

function toFloorTable(table: TableGeometry, occupiedSinceUtc: string | null): FloorTable {
  return {
    id: table.tableId,
    label: table.label,
    seats: table.seats,
    x: table.x,
    y: table.y,
    width: table.width,
    height: table.height,
    rotationDegrees: table.rotationDegrees,
    shape: tableShape(table.shape),
    floorAreaName: table.floorAreaName ?? null,
    isBookable: table.isBookable,
    state: derivedTableState(table.state),
    nextReservationStartUtc: table.nextReservationStartUtc ?? null,
    occupiedSinceUtc,
  };
}

/** Area order first, then label, so the plan draws in by area. */
function byArea<T extends TableGeometry>(tables: readonly T[]): T[] {
  return [...tables].sort(
    (a, b) =>
      a.floorAreaDisplayOrder - b.floorAreaDisplayOrder ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

/** The staff floor: `GET /api/branches/{id}/tables/floor`. */
export function floorFromState(state: FloorState): FloorPlanData {
  return {
    branchId: state.branchId,
    branchName: state.branchName,
    canvasWidth: state.floorWidth,
    canvasHeight: state.floorHeight,
    timeZoneId: state.timeZoneId,
    tables: byArea(state.tables).map((table: FloorTableState) =>
      toFloorTable(table, table.seatedAtUtc ?? null),
    ),
  };
}

/**
 * The diner floor, derived from the availability answer.
 *
 * The floor endpoint is staff-only, and the availability endpoint already
 * carries every table's geometry and derived state for the slot asked about.
 * One anonymous round trip gives a diner both the room and the answer.
 */
export function floorFromAvailability(availability: Availability): FloorPlanData {
  return {
    branchId: availability.branchId,
    branchName: availability.branchName,
    canvasWidth: availability.floorWidth,
    canvasHeight: availability.floorHeight,
    timeZoneId: availability.timeZoneId,
    tables: byArea(availability.tables).map((table: AvailabilityTable) =>
      toFloorTable(table, null),
    ),
  };
}

// --- Availability -------------------------------------------------------------

export function availabilityFromResponse(response: Availability): readonly TableAvailability[] {
  // A branch-level refusal — too soon, shut, too far out — applies to every table.
  const branchReason = response.unavailableReason ?? null;

  return byArea(response.tables).map((table) => {
    const state = derivedTableState(table.state);
    const reason = unavailableReason(table.unavailableReason ?? branchReason, state);
    const available = table.isAvailable && branchReason === null;

    // The window moved into its own node on the wire, and `isShorterThanTurnTime`
    // moved with it: the server compares against the branch's own turn time,
    // which is the comparison the client used to make with a number it happened
    // to have. Reading the server's answer means the two cannot disagree.
    const source = table.window ?? null;
    const window: AvailabilityWindowDto | null =
      available && source
        ? {
            fromUtc: source.availableFromUtc,
            untilUtc: source.availableUntilUtc ?? null,
            nextBookingStartUtc: table.nextReservationStartUtc ?? null,
            minutes: source.windowMinutes ?? null,
            isShorterThanTurnTime: source.isShorterThanTurnTime,
          }
        : null;

    return {
      tableId: table.tableId,
      tableLabel: table.label,
      floorAreaName: table.floorAreaName ?? null,
      seats: table.seats,
      isBookable: available,
      /*
       * The server's answer, or — only when it gave none — one derived from the
       * state it sent. The order matters and used to be the other way round for
       * any reason code this client could not name: an unmapped code became
       * `null` and was then replaced by a guess from the table's state, so a
       * refusal the server was specific about arrived as "someone is sitting
       * there now". A reason is never overwritten by an inference now.
       */
      unavailableReason: available ? null : (reason ?? fallbackReason(state)),
      window,
      // The server's deadline, by the rule that marks a cancellation late.
      // Absent when no slot could be computed, and then nothing is promised.
      freeCancellationUntilUtc: response.cancellationDeadlineUtc ?? null,
      requiresApproval: table.requiresApproval,
    };
  });
}

/**
 * The room and its answer for one slot, from the one response that carries both.
 *
 * `floorFromAvailability` above builds the same geometry, but from a call made
 * with no date or time — "now" — which is the shape the diner surfaces were
 * drawing the room from while asking about a slot three days out. This keeps
 * the two together so they cannot be sourced from different questions again.
 *
 * The plan's `isBookable` carries the **server's** decision for this slot and
 * party, not the table's standing configuration. That is what makes the drawn
 * room agree with the sheet: a ten-top the venue will not give to a party of
 * two is refused by the server with `tooLarge`, and a client re-deriving
 * selectability from `seats >= partySize` would draw it as pickable.
 */
export function slotFloorFromResponse(response: Availability): SlotFloor {
  const tables = availabilityFromResponse(response);
  const answers = new Map(tables.map((table) => [table.tableId, table]));
  const rejection = unavailableReason(response.unavailableReason ?? null, 'free');

  const plan: FloorPlanData = {
    branchId: response.branchId,
    branchName: response.branchName,
    canvasWidth: response.floorWidth,
    canvasHeight: response.floorHeight,
    timeZoneId: response.timeZoneId,
    tables: byArea(response.tables).map((table: AvailabilityTable) => ({
      ...toFloorTable(table, null),
      // The server decided this, for this slot and this party size.
      isBookable: answers.get(table.tableId)?.isBookable ?? false,
    })),
  };

  return {
    plan,
    tables,
    rejection,
    slotUtc: response.requestedStartUtc,
    partySize: response.partySize,
  };
}

function fallbackReason(state: DerivedTableState): TableUnavailableReason {
  switch (state) {
    case 'held':
      return 'held';
    case 'outOfService':
      return 'outOfService';
    case 'occupied':
    case 'reservedSoon':
      return 'occupied';
    case 'free':
      return 'notBookable';
  }
}

// --- Time --------------------------------------------------------------------

/**
 * A UTC instant as the branch's wall-clock date and time, which is what the
 * availability and reservation endpoints take. Never the device's zone: a
 * tourist's phone is on Moscow time and the cafe is not.
 */
export function localDateTime(
  slotUtc: string | Date,
  timeZoneId: string,
): { date: string; time: string } {
  const instant = typeof slotUtc === 'string' ? new Date(slotUtc) : slotUtc;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZoneId,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}
