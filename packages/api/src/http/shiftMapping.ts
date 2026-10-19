import type { BranchShifts, ShiftInput, StaffShift } from '../contracts/staff';

/*
 * The shift wire, written by hand from the backend's VC5 wire until
 * `generated/schema.ts` carries `Yalla.Application.Staff.StaffShiftView` —
 * then these two types become `components['schemas'][…]` like their
 * neighbours. The API omits null properties, so everything nullable is
 * optional here.
 */
export interface WireStaffShift {
  readonly id: string;
  readonly staffMemberId: string;
  readonly branchId: string;
  readonly date: string;
  readonly dayOff: boolean;
  /** `HH:mm:ss`; absent on a day off. */
  readonly startsAt?: string | null;
  readonly endsAt?: string | null;
  readonly endsNextDay: boolean;
}

export interface WireBranchShifts {
  readonly branchId: string;
  readonly serviceDate: string;
  readonly from: string;
  readonly to: string;
  readonly onShiftToday: number;
  readonly shifts: readonly WireStaffShift[];
}

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
export function shiftBody(shift: ShiftInput): {
  date: string;
  dayOff: boolean;
  startsAt?: string;
  endsAt?: string;
} {
  if (shift.dayOff) return { date: shift.date, dayOff: true };
  return {
    date: shift.date,
    dayOff: false,
    ...(shift.startsAt ? { startsAt: shift.startsAt } : {}),
    ...(shift.endsAt ? { endsAt: shift.endsAt } : {}),
  };
}
