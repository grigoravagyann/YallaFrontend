import type { BranchShifts, ShiftInput, StaffShift } from '../contracts/staff';
import type { components } from '../generated/schema';

type Schemas = components['schemas'];
export type WireStaffShift = Schemas['Yalla.Application.Staff.StaffShiftView'];
export type WireBranchShifts = Schemas['Yalla.Application.Staff.BranchShiftsView'];
type WireShiftBody = Schemas['Yalla.Api.Endpoints.VenueAdminEndpoints.UpdateShiftRequest'];

/** `HH:mm:ss` from the server, `HH:mm` on screen; already `HH:mm` passes through. */
const minutesOnly = (time: string | null | undefined): string | null =>
  time ? time.slice(0, 5) : null;

export function staffShift(wire: WireStaffShift): StaffShift {
  return {
    id: wire.id,
    staffMemberId: wire.staffMemberId,
    branchId: wire.branchId,
    date: wire.date,
    dayOff: wire.dayOff,
    startsAt: wire.dayOff ? null : minutesOnly(wire.startsAt),
    endsAt: wire.dayOff ? null : minutesOnly(wire.endsAt),
    endsNextDay: wire.dayOff ? false : wire.endsNextDay,
    endsAtUtc: wire.dayOff ? null : (wire.endsAtUtc ?? null),
  };
}

export function branchShifts(wire: WireBranchShifts): BranchShifts {
  return {
    branchId: wire.branchId,
    serviceDate: wire.serviceDate,
    from: wire.from,
    to: wire.to,
    onShiftToday: wire.onShiftToday,
    shifts: wire.shifts.map(staffShift),
  };
}

/**
 * The body of a create or an update. A day off sends no times at all: the
 * server refuses "a day off has no times" on `startsAt` when one arrives.
 */
export function shiftBody(shift: ShiftInput): WireShiftBody {
  if (shift.dayOff) return { date: shift.date, dayOff: true };
  return {
    date: shift.date,
    dayOff: false,
    ...(shift.startsAt ? { startsAt: shift.startsAt } : {}),
    ...(shift.endsAt ? { endsAt: shift.endsAt } : {}),
  };
}
