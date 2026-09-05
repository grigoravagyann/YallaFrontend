import type {
  DerivedTableState,
  FloorPlanData,
  FloorTable,
  TableShape,
} from '@yalla/floorplan/types';
import type {
  AvailabilityWindowDto,
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
 * 9 LocalTimeDoesNotExist.
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
    case 8:
      return state === 'held' ? 'held' : 'occupied';
    case 9:
      return 'invalidTime';
    default:
      return null;
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

    const window: AvailabilityWindowDto | null = available
      ? {
          fromUtc: table.availableFromUtc ?? response.requestedStartUtc,
          untilUtc: table.availableUntilUtc ?? null,
          nextBookingStartUtc: table.nextReservationStartUtc ?? null,
          minutes: table.availableMinutes ?? null,
          isShorterThanTurnTime:
            table.availableMinutes !== null &&
            table.availableMinutes !== undefined &&
            table.availableMinutes < response.turnTimeMinutes,
        }
      : null;

    return {
      tableId: table.tableId,
      tableLabel: table.label,
      floorAreaName: table.floorAreaName ?? null,
      seats: table.seats,
      isBookable: table.isBookable,
      unavailableReason: available ? null : (reason ?? fallbackReason(state)),
      window,
      // The backend does not report a free-cancellation deadline on the
      // availability view; the slot start is the honest floor for it until the
      // reservation policy lands in the contract. See the README's "what the
      // generated types disagreed with" note.
      freeCancellationUntilUtc: response.requestedStartUtc,
      requiresApproval: table.requiresApproval,
    };
  });
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
