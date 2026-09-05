import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import {
  availabilityFromResponse,
  derivedTableState,
  floorFromAvailability,
  floorFromState,
  localDateTime,
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
  limitedByNextBooking: false,
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
          availableFromUtc: '2026-09-05T15:30:00Z',
          availableUntilUtc: '2026-09-05T16:30:00Z',
          availableMinutes: 60,
          limitedByNextBooking: true,
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
