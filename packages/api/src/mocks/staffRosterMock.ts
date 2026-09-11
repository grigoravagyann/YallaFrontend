import { DeviceRevokedError } from '../contracts/errors';
import type { StaffMember } from '../contracts/staff';
import type { StaffRosterEntry } from '../contracts/staffAuth';

/** Where an enrolled tablet is bound, as far as the roster rule cares. */
export interface MockRosterDevice {
  readonly venueId: string;
  readonly branchId: string;
}

/**
 * The backend's roster rule, in memory: active, same venue, and a branch that
 * is either every branch (null) or the device's own. Sorted by name, as the
 * server sorts it.
 */
export function mockStaffRoster(
  staff: readonly StaffMember[],
  device: MockRosterDevice,
): StaffRosterEntry[] {
  return staff
    .filter(
      (member) =>
        member.isActive &&
        member.venueId === device.venueId &&
        (member.branchId === null || member.branchId === device.branchId),
    )
    .map((member) => ({
      staffMemberId: member.id,
      fullName: member.fullName,
      role: member.role,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
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
