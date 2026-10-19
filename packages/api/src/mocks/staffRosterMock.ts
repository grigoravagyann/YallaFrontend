import { branchDayKey, zonedParts, type TimeZone } from '@yalla/format';
import { DeviceRevokedError } from '../contracts/errors';
import type { StaffMember } from '../contracts/staff';
import type { StaffRosterEntry, StaffRosterShift } from '../contracts/staffAuth';

const HOUR = 60 * 60_000;

/** How far ahead the next shift is looked for: exactly twelve hours counts. */
const LOOKAHEAD = 12 * HOUR;

/** Where an enrolled tablet is bound, as far as the roster rule cares. */
export interface MockRosterDevice {
  readonly venueId: string;
  readonly branchId: string;
}

/** One working shift, as instants. Days off are not shifts here. */
export interface MockRosterShift {
  readonly staffMemberId: string;
  readonly branchId: string;
  readonly startsAtUtc: string;
  readonly endsAtUtc: string;
}

/** The shifts a roster read is judged against, and when and where it is read. */
export interface MockRosterShifts {
  readonly now: Date;
  /** The branch's zone: "today" and the wall clock are its. */
  readonly timeZone: string;
  readonly shifts: readonly MockRosterShift[];
}

/**
 * The backend's roster rule, in memory: active, same venue, and a branch that
 * is either every branch (null) or the device's own. Sorted by name, as the
 * server sorts it.
 *
 * With `shifts`, each person also carries the FT2 shift fields: the shift at
 * this branch running now, else the next one starting within twelve hours
 * (across midnight: at 23:50, tomorrow's 00:10), else none. Running is decided
 * on the instants. Shifts never take anybody off the list.
 */
export function mockStaffRoster(
  staff: readonly StaffMember[],
  device: MockRosterDevice,
  shifts?: MockRosterShifts,
): StaffRosterEntry[] {
  return staff
    .filter(
      (member) =>
        member.isActive &&
        member.venueId === device.venueId &&
        (member.branchId === null || member.branchId === device.branchId),
    )
    .map((member) => {
      const reported = shifts ? reportedShift(member.id, device.branchId, shifts) : null;
      return {
        staffMemberId: member.id,
        fullName: member.fullName,
        role: member.role,
        onShiftNow: reported?.running ?? false,
        shift: reported?.shift ?? null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function reportedShift(
  staffMemberId: string,
  branchId: string,
  { now, timeZone, shifts }: MockRosterShifts,
): { running: boolean; shift: StaffRosterShift } | null {
  const zone = timeZone as TimeZone;
  const at = now.getTime();
  const mine = shifts
    .filter((shift) => shift.staffMemberId === staffMemberId && shift.branchId === branchId)
    .sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));

  const running = mine.find(
    (shift) => Date.parse(shift.startsAtUtc) <= at && at < Date.parse(shift.endsAtUtc),
  );
  const next = mine.find((shift) => {
    const ahead = Date.parse(shift.startsAtUtc) - at;
    return ahead > 0 && ahead <= LOOKAHEAD;
  });
  const chosen = running ?? next;
  if (!chosen) return null;

  const clock = (iso: string) => {
    const parts = zonedParts(new Date(iso), zone);
    return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  };
  return {
    running: chosen === running,
    shift: {
      startsAt: clock(chosen.startsAtUtc),
      endsAt: clock(chosen.endsAtUtc),
      endsNextDay: branchDayKey(chosen.endsAtUtc, zone) !== branchDayKey(chosen.startsAtUtc, zone),
      startsAtUtc: chosen.startsAtUtc,
      endsAtUtc: chosen.endsAtUtc,
    },
  };
}

/**
 * Shifts for a branch's own people around `now`, so the PIN gate's "on shift
 * first" shows in mock mode at any hour: by name, one on shift, one starting
 * in two hours, one with none, and another on shift. Venue-wide people (the owner, the general manager) get none, as the
 * console mock's shift seed gives them none.
 */
export function mockRosterShiftsAround(
  staff: readonly StaffMember[],
  branchId: string,
  now: Date,
): MockRosterShift[] {
  const hour = Math.floor(now.getTime() / HOUR) * HOUR;
  const plans: readonly (readonly [number, number] | null)[] = [[-3, 8], [2, 6], null, [-1, 9]];
  return staff
    .filter((member) => member.isActive && member.branchId === branchId)
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .flatMap((member, index) => {
      const plan = plans[index % plans.length];
      if (!plan) return [];
      const [fromHours, lengthHours] = plan;
      const start = hour + fromHours * HOUR;
      return [
        {
          staffMemberId: member.id,
          branchId,
          startsAtUtc: new Date(start).toISOString(),
          endsAtUtc: new Date(start + lengthHours * HOUR).toISOString(),
        },
      ];
    });
}

export interface StaffRosterMockOptions {
  readonly staff: readonly StaffMember[];
  readonly devices: readonly (MockRosterDevice & { readonly deviceToken: string })[];
}

/**
 * `GET /api/auth/staff/roster` against a fixed set of people and tablets.
 *
 * A token that names no device is refused the way `/device` refuses it — the
 * tablet is revoked or was never enrolled, and the two are the same answer.
 */
export function createStaffRosterMock(options: StaffRosterMockOptions) {
  return {
    async getRoster(deviceToken: string): Promise<readonly StaffRosterEntry[]> {
      const device = options.devices.find((entry) => entry.deviceToken === deviceToken);
      if (!device) throw new DeviceRevokedError({ url: '/api/auth/staff/roster' });
      return mockStaffRoster(options.staff, device);
    },
  };
}
