import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import { unavailableCopy } from '../contracts/reservation';
import {
  availabilityFromResponse,
  derivedTableState,
  floorFromAvailability,
  floorFromState,
  localDateTime,
  slotFloorFromResponse,
  unavailableReason,
} from './mapping';

type Schemas = components['schemas'];

const table = (
  over: Partial<Schemas['Yalla.Application.Reservations.TableAvailability']> = {},
): Schemas['Yalla.Application.Reservations.TableAvailability'] => ({
  tableId: 't1',
  label: '7',
  seats: 4,
  x: 10,
  y: 20,
  width: 90,
  height: 90,
  rotationDegrees: 0,
  shape: 2,
  floorAreaName: 'Terrace',
  floorAreaDisplayOrder: 1,
  isBookable: true,
  isAvailable: true,
  requiresApproval: false,
  physicalStatus: 1,
  state: 1,
  ...over,
});

const availability = (
  tables: Schemas['Yalla.Application.Reservations.TableAvailability'][],
  over: Partial<Schemas['Yalla.Application.Reservations.BranchAvailability']> = {},
): Schemas['Yalla.Application.Reservations.BranchAvailability'] => ({
  asOfUtc: '2026-09-05T15:00:00Z',
  branchId: 'b1',
  branchName: 'Yerevan Centre',
  bufferMinutes: 15,
  floorWidth: 1000,
  floorHeight: 700,
  localDate: '2026-09-05',
  localTime: '19:30',
  partySize: 2,
  requestedStartUtc: '2026-09-05T15:30:00Z',
  requestedEndUtc: '2026-09-05T17:00:00Z',
  tables,
  timeZoneId: 'Asia/Yerevan',
  turnTimeMinutes: 90,
  ...over,
});

describe('enums', () => {
  it('maps the derived state integers onto the renderer vocabulary', () => {
    expect([1, 2, 3, 4, 5].map(derivedTableState)).toEqual([
      'free',
      'reservedSoon',
      'held',
      'occupied',
      'outOfService',
    ]);
  });

  it('gives every rejection reason its own answer, using the state for "already booked"', () => {
    expect(unavailableReason(1, 'free')).toBe('pastLeadTime');
    expect(unavailableReason(2, 'free')).toBe('tooFarAhead');
    expect(unavailableReason(3, 'free')).toBe('closed');
    expect(unavailableReason(4, 'free')).toBe('tooSmall');
    expect(unavailableReason(6, 'free')).toBe('notBookable');
    expect(unavailableReason(7, 'outOfService')).toBe('outOfService');
    expect(unavailableReason(8, 'held')).toBe('held');
    expect(unavailableReason(8, 'occupied')).toBe('occupied');
    /*
     * The one that mattered. `TableAlreadyBooked` at a *future* slot is not
     * somebody sitting at the table — the room is empty and the table is
     * spoken for. This used to fall through to `occupied`, so a diner asking
     * about Saturday was told there were people at it and walked over to look.
     */
    expect(unavailableReason(8, 'reservedSoon')).toBe('alreadyBooked');
    expect(unavailableReason(8, 'free')).toBe('alreadyBooked');
    expect(unavailableReason(9, 'free')).toBe('invalidTime');
    expect(unavailableReason(null, 'free')).toBeNull();
  });

  it('calls a ten-top refused to a couple too LARGE, not too small', () => {
    // Observed against the live backend: reason 5 is SeatOverhangExceeded, the
    // party being far smaller than the table. Folding it into `tooSmall` told
    // a diner a ten-seater was "too small for 2".
    expect(unavailableReason(5, 'free')).toBe('tooLarge');
  });
});

describe('floor', () => {
  it('builds a floor plan from the anonymous availability answer, ordered by area', () => {
    const plan = floorFromAvailability(
      availability([
        table({ tableId: 'b', label: '2', floorAreaDisplayOrder: 1 }),
        table({ tableId: 'a', label: '1', floorAreaDisplayOrder: 0, shape: 1 }),
      ]),
    );
    expect(plan.canvasWidth).toBe(1000);
    expect(plan.timeZoneId).toBe('Asia/Yerevan');
    expect(plan.tables.map((t) => t.id)).toEqual(['a', 'b']);
    expect(plan.tables[0]?.shape).toBe('rectangle');
    expect(plan.tables[1]?.shape).toBe('round');
  });

  it('carries who was seated when from the staff floor view', () => {
    const state: Schemas['Yalla.Application.Floor.BranchFloorState'] = {
      asOfUtc: '2026-09-05T15:00:00Z',
      branchId: 'b1',
      branchName: 'Yerevan Centre',
      maxSequence: 41,
      floorWidth: 1000,
      floorHeight: 700,
      timeZoneId: 'Asia/Yerevan',
      tables: [
        {
          tableId: 't1',
          label: '7',
          seats: 4,
          x: 0,
          y: 0,
          width: 90,
          height: 90,
          rotationDegrees: 0,
          shape: 1,
          floorAreaDisplayOrder: 0,
          isBookable: true,
          physicalStatus: 4,
          state: 4,
          rowVersion: 'AAAAAAAAB9E=',
          seatedAtUtc: '2026-09-05T14:10:00Z',
        },
      ],
    };
    const plan = floorFromState(state);
    expect(plan.tables[0]?.state).toBe('occupied');
    expect(plan.tables[0]?.occupiedSinceUtc).toBe('2026-09-05T14:10:00Z');
  });
});

describe('availability', () => {
  it('turns a bookable table into a window and flags a short one', () => {
    const [row] = availabilityFromResponse(
      availability([
        table({
          // The window is its own node now, and the server decides whether it
          // is shorter than the branch's turn time rather than the client.
          window: {
            availableFromUtc: '2026-09-05T15:30:00Z',
            availableFromLocal: '19:30:00',
            availableUntilUtc: '2026-09-05T16:30:00Z',
            availableUntilLocal: '20:30:00',
            windowMinutes: 60,
            hasNoLaterBooking: false,
            isShorterThanTurnTime: true,
          },
          nextReservationStartUtc: '2026-09-05T16:45:00Z',
        }),
      ]),
    );
    expect(row?.unavailableReason).toBeNull();
    expect(row?.window?.minutes).toBe(60);
    expect(row?.window?.isShorterThanTurnTime).toBe(true);
    expect(row?.window?.nextBookingStartUtc).toBe('2026-09-05T16:45:00Z');
  });

  it('applies a branch-level refusal to every table', () => {
    // Reason 3 is OutsideOpeningHours: the branch is shut, so no table is
    // offered and every row says so for the same reason.
    const rows = availabilityFromResponse(
      availability([table(), table({ tableId: 't2' })], { unavailableReason: 3 }),
    );
    expect(rows.every((row) => row.window === null)).toBe(true);
    expect(rows.every((row) => row.unavailableReason === 'closed')).toBe(true);
  });

  it('falls back to the table state when the backend gives no reason', () => {
    const [row] = availabilityFromResponse(
      availability([table({ isAvailable: false, state: 3, physicalStatus: 2 })]),
    );
    expect(row?.unavailableReason).toBe('held');
  });
});

describe('localDateTime', () => {
  it('renders a UTC instant in the branch zone, never the device zone', () => {
    expect(localDateTime('2026-09-05T20:30:00Z', 'Asia/Yerevan')).toEqual({
      date: '2026-09-06',
      time: '00:30',
    });
    expect(localDateTime('2026-09-05T20:30:00Z', 'UTC')).toEqual({
      date: '2026-09-05',
      time: '20:30',
    });
  });
});

describe('a reason this build has no word for', () => {
  /*
   * Test 5 of the brief: the reason shown is the server's, never one inferred
   * from the table's state.
   *
   * The backend can add a refusal rule in a release this client was not built
   * against. What used to happen then was the worst of the options: the unknown
   * code mapped to `null`, `null` fell through to a guess made from the derived
   * state, and a diner was told something specific and wrong. An unfamiliar
   * reason carried verbatim is worse copy and strictly better information.
   */
  const UNMAPPED = 97;

  it('is carried rather than replaced by a guess from the table state', () => {
    const [row] = availabilityFromResponse(
      availability([
        table({
          isAvailable: false,
          unavailableReason: UNMAPPED as never,
          // Deliberately a state the client *does* have a confident story for.
          // If the inference were still in play it would win and say "someone
          // is sitting here right now".
          state: 4,
          physicalStatus: 4,
        }),
      ]),
    );

    expect(row?.isBookable).toBe(false);
    expect(row?.unavailableReason).toBe(`unknown:${UNMAPPED}`);
    expect(row?.unavailableReason).not.toBe('occupied');
  });

  it('still falls back to the state when the server named no reason at all', () => {
    // The fallback is not gone, it is just no longer allowed to overrule an
    // answer. A refusal with no reason attached is the one case where reading
    // the state is all anybody can do.
    const [row] = availabilityFromResponse(
      // `state: 3` is Held. `physicalStatus` is deliberately left at its
      // default: a hold is a claim on a slot, not a physical state of the
      // table, and the wire type does not admit 3 for it.
      availability([table({ isAvailable: false, state: 3 })]),
    );
    expect(row?.unavailableReason).toBe('held');
  });

  it('reaches the copy layer as itself', () => {
    const line = unavailableCopy(`unknown:${UNMAPPED}`, 2);
    expect(line.key).toBe('table.unavailable.other');
    expect(line.params.reason).toBe(`unknown:${UNMAPPED}`);
  });

  it('routes a known reason to that reason own sentence', () => {
    expect(unavailableCopy('alreadyBooked', 2).key).toBe('table.unavailable.alreadyBooked');
    expect(unavailableCopy('occupied', 2).key).toBe('table.unavailable.occupied');
  });
});

describe('slotFloorFromResponse', () => {
  it('carries the server verdict onto the drawn room, not the standing config', () => {
    /*
     * A ten-top the venue will not give to a couple. `isBookable` on the wire
     * is the table's *configuration* — it takes bookings — while `isAvailable`
     * is the answer for this party at this slot. Drawing from the former is how
     * a table the server has already refused renders pickable, and the diner
     * finds out after choosing it.
     */
    const floor = slotFloorFromResponse(
      availability([
        table({
          tableId: 'big',
          seats: 10,
          isBookable: true,
          isAvailable: false,
          unavailableReason: 5,
        }),
        table({ tableId: 'ok', seats: 2, isBookable: true, isAvailable: true }),
      ]),
    );

    expect(floor.plan.tables.find((t) => t.id === 'big')?.isBookable).toBe(false);
    expect(floor.plan.tables.find((t) => t.id === 'ok')?.isBookable).toBe(true);
    expect(floor.tables.find((t) => t.tableId === 'big')?.unavailableReason).toBe('tooLarge');
  });

  it('reports a whole-request refusal once, with the room intact', () => {
    const floor = slotFloorFromResponse(
      availability([table({ isAvailable: false })], { unavailableReason: 3 }),
    );

    expect(floor.rejection).toBe('closed');
    expect(floor.plan.tables).toHaveLength(1);
    expect(floor.slotUtc).toBe('2026-09-05T15:30:00Z');
    expect(floor.partySize).toBe(2);
  });

  it('leaves rejection null when the request itself was fine', () => {
    expect(slotFloorFromResponse(availability([table({})])).rejection).toBeNull();
  });
});
