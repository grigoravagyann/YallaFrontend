import type { StaffRole } from '../contracts/console';
import type {
  CreateStaffInput,
  EnrolmentCode,
  PhonePairingCode,
  StaffDevice,
  StaffDeviceBrowser,
  StaffDevicePlatform,
  StaffMember,
  StaffSignInLink,
  UpdateStaffInput,
} from '../contracts/staff';
import type { components } from '../generated/schema';

type Schemas = components['schemas'];
type WireStaff = Schemas['Yalla.Application.Staff.StaffMemberView'];
type WireDevice = Schemas['Yalla.Application.Auth.StaffDeviceSummary'];
type WireCode = Schemas['Yalla.Application.Auth.DeviceEnrolmentCodeResult'];
type WirePhonePairing = Schemas['Yalla.Application.Auth.PhonePairingCodeResult'];
type WireSignInLink = Schemas['Yalla.Application.Staff.StaffSignInLink'];

/**
 * Staff and device wire shapes to screen shapes.
 *
 * `Yalla.Domain.Enums.StaffRole` is an integer on the wire — 0 Unknown,
 * 1 Owner, 2 Manager (a branch manager), 3 Waiter, 4 Kitchen, 5 PlatformAdmin,
 * 6 GeneralManager — and the console speaks in names. The numbers say nothing
 * about rank: 6 sits between 1 and 2 (see `outranks`).
 *
 * The conversion lives here and in `auth/endpoints`, and nowhere else.
 */

const ROLE_BY_CODE: Readonly<Record<number, StaffRole>> = {
  1: 'owner',
  6: 'generalManager',
  2: 'manager',
  3: 'waiter',
  4: 'kitchen',
};

const CODE_BY_ROLE: Readonly<Record<StaffRole, number>> = {
  owner: 1,
  generalManager: 6,
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
    // `StaffDeviceKind`: 2 a personal phone; 1, or a server from before phones, a tablet.
    kind: wire.kind === 2 ? 'phone' : 'tablet',
    boundStaffMember: wire.boundStaffMember
      ? {
          id: wire.boundStaffMember.id,
          fullName: wire.boundStaffMember.fullName,
          role: staffRole(wire.boundStaffMember.role),
        }
      : null,
    revokedAtUtc: wire.revokedAtUtc ?? null,
    platform: staffDevicePlatform(wire.platform),
    browser: staffDeviceBrowser(wire.browser),
  };
}

type WirePlatform = Schemas['Yalla.Domain.Enums.StaffDevicePlatform'];
type WireBrowser = Schemas['Yalla.Domain.Enums.StaffDeviceBrowser'];

/** `StaffDevicePlatform`: pinned integers, never renumbered. */
const PLATFORM_CODES: Readonly<Record<StaffDevicePlatform, WirePlatform>> = {
  other: 1,
  iphone: 2,
  ipad: 3,
  android: 4,
  windows: 5,
  mac: 6,
  linux: 7,
};

/** `StaffDeviceBrowser`: pinned integers, never renumbered. */
const BROWSER_CODES: Readonly<Record<StaffDeviceBrowser, WireBrowser>> = {
  safari: 1,
  chrome: 2,
  edge: 3,
  firefox: 4,
  opera: 5,
  samsungInternet: 6,
};

/** A phone's platform from the wire; null for none, and for a number this client does not know. */
export function staffDevicePlatform(code: number | null | undefined): StaffDevicePlatform | null {
  const found = Object.entries(PLATFORM_CODES).find(([, value]) => value === code);
  return found ? (found[0] as StaffDevicePlatform) : null;
}

/** A phone's browser from the wire; null for none, and for a number this client does not know. */
export function staffDeviceBrowser(code: number | null | undefined): StaffDeviceBrowser | null {
  const found = Object.entries(BROWSER_CODES).find(([, value]) => value === code);
  return found ? (found[0] as StaffDeviceBrowser) : null;
}

export function staffDevicePlatformCode(platform: StaffDevicePlatform): WirePlatform {
  return PLATFORM_CODES[platform];
}

export function staffDeviceBrowserCode(browser: StaffDeviceBrowser): WireBrowser {
  return BROWSER_CODES[browser];
}

/** Field for field: the code is shown once, so a renamed member must fail here. */
export function phonePairingCode(wire: WirePhonePairing): PhonePairingCode {
  return {
    code: wire.code,
    expiresAtUtc: wire.expiresAtUtc,
    pairingUrl: wire.pairingUrl,
    staffMemberId: wire.staffMemberId,
    branchId: wire.branchId,
  };
}

export function enrolmentCode(wire: WireCode): EnrolmentCode {
  return { code: wire.code, expiresAtUtc: wire.expiresAtUtc, branchId: wire.branchId };
}

/**
 * Field for field, and named so a renamed wire member fails here at test time
 * rather than as an `undefined` in the dialog that shows the one copy.
 */
export function staffSignInLink(wire: WireSignInLink): StaffSignInLink {
  return {
    staffMemberId: wire.staffMemberId,
    email: wire.email,
    resetLink: wire.resetLink,
    expiresAtUtc: wire.expiresAtUtc,
    replacedExistingSignIn: wire.replacedExistingSignIn,
  };
}
