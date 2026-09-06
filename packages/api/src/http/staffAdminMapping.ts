import type { StaffRole } from '../contracts/console';
import type {
  CreateStaffInput,
  EnrolmentCode,
  StaffDevice,
  StaffMember,
  UpdateStaffInput,
} from '../contracts/staff';
import type { components } from '../generated/schema';

type Schemas = components['schemas'];
type WireStaff = Schemas['Yalla.Application.Staff.StaffMemberView'];
type WireDevice = Schemas['Yalla.Application.Auth.StaffDeviceSummary'];
type WireCode = Schemas['Yalla.Application.Auth.DeviceEnrolmentCodeResult'];

/**
 * Staff and device wire shapes to screen shapes.
 *
 * `Yalla.Domain.Enums.StaffRole` is an integer on the wire — 0 PlatformAdmin,
 * 1 Owner, 2 Manager, 3 Waiter, 4 Kitchen — and the console speaks in names.
 * The conversion lives here and in `auth/endpoints`, and nowhere else.
 */

const ROLE_BY_CODE: Readonly<Record<number, StaffRole>> = {
  1: 'owner',
  2: 'manager',
  3: 'waiter',
  4: 'kitchen',
};

const CODE_BY_ROLE: Readonly<Record<StaffRole, number>> = {
  owner: 1,
  manager: 2,
  waiter: 3,
  kitchen: 4,
};

/**
 * An unrecognised code becomes `kitchen`, the least-privileged role the console
 * knows, so a value this build has not met shows the smallest screen rather
 * than the largest. The server decides what is actually permitted regardless.
 */
export function staffRole(code: number): StaffRole {
  return ROLE_BY_CODE[code] ?? 'kitchen';
}

export function staffRoleCode(role: StaffRole): number {
  return CODE_BY_ROLE[role];
}

export function staffMember(wire: WireStaff): StaffMember {
  return {
    id: wire.id,
    venueId: wire.venueId ?? null,
    // Null is an assignment — every branch of the venue — not a missing value.
    branchId: wire.branchId ?? null,
    fullName: wire.fullName,
    phone: wire.phone,
    role: staffRole(wire.role),
    isActive: wire.isActive,
    email: wire.email ?? null,
    hasPasswordSignIn: wire.hasPasswordSignIn,
    isPinLocked: wire.isPinLocked,
  };
}

export function createStaffBody(input: CreateStaffInput) {
  return {
    fullName: input.fullName,
    phone: input.phone,
    role: staffRoleCode(input.role),
    pin: input.pin,
    // Sent as an explicit null for "every branch of the venue". Omitting it
    // would read as "no opinion" and the server would keep its default.
    branchId: input.branchId,
    ...(input.email ? { email: input.email } : {}),
    ...(input.password ? { password: input.password } : {}),
  };
}

/**
 * Only the fields being changed, plus the branch flag.
 *
 * `setBranch` exists because `branchId: null` means "venue-wide" and the
 * *absence* of `branchId` means "leave it alone" — indistinguishable on the
 * wire without a flag, and the first one would be unreachable.
 */
export function updateStaffBody(patch: UpdateStaffInput) {
  return {
    ...(patch.fullName === undefined ? {} : { fullName: patch.fullName }),
    ...(patch.phone === undefined ? {} : { phone: patch.phone }),
    ...(patch.role === undefined ? {} : { role: staffRoleCode(patch.role) }),
    ...(patch.isActive === undefined ? {} : { isActive: patch.isActive }),
    ...(patch.setBranch ? { setBranch: true, branchId: patch.branchId ?? null } : {}),
  };
}

export function staffDevice(wire: WireDevice): StaffDevice {
  return {
    id: wire.id,
    name: wire.name,
    branchId: wire.branchId,
    enrolledAtUtc: wire.enrolledAtUtc,
    lastSeenAtUtc: wire.lastSeenAtUtc ?? null,
    isRevoked: wire.isRevoked,
  };
}

export function enrolmentCode(wire: WireCode): EnrolmentCode {
  return { code: wire.code, expiresAtUtc: wire.expiresAtUtc, branchId: wire.branchId };
}
