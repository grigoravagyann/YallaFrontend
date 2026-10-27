/**
 * Signing a tablet in, and signing a person in on it.
 *
 * Two credentials with two lifetimes, and keeping them apart is the whole
 * design:
 *
 * - **The device token** is minted once, during venue onboarding, from a code a
 *   manager reads out. It is long-lived, it is bound to one branch, and it can
 *   do exactly one thing — offer a PIN. An enrolled tablet with nobody signed
 *   in cannot seat a table.
 * - **The session token** is minted every shift from four digits. It carries the
 *   person, their role and the tablet's branch, and it dies after thirty
 *   minutes of inactivity.
 *
 * Nothing here takes an email. A waiter never types one, and a screen that
 * offers the field teaches them there is another way in.
 */

import type { BranchFeature } from './branchFeatures';
import type { UserRole } from './console';
import type { StaffDeviceBrowser, StaffDevicePlatform } from './staff';

/** What a tablet gets back for a redeemed enrolment code. */
export interface DeviceEnrolment {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly branchId: string;
  /** Long-lived bearer token identifying the tablet. */
  readonly deviceToken: string;
  /** When the device token expires and the tablet must be enrolled again. */
  readonly expiresAtUtc: string;
}

/**
 * What this device is bound to, in words.
 *
 * A tablet on a counter should say where it thinks it is. Without this a
 * browser enrolled months ago shows a keypad with no indication of which branch
 * it will act on, and a laptop bound to the wrong one is first noticed in an
 * audit row.
 */
export interface EnrolledDevice {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly branchId: string;
  readonly branchName: string;
  /** The venue, for a chain where two branches share a branch name. */
  readonly venueName: string;
  readonly enrolledAtUtc: string;
  readonly lastSeenAtUtc: string | null;
  /**
   * A shared floor tablet, or one person's own phone (`GET /api/auth/staff/device`
   * `kind`). Absent reads as a tablet: every device before phones was one.
   */
  readonly kind?: StaffDeviceKind | undefined;
  /** On a phone, the one person whose PIN opens it; null or absent on a tablet. */
  readonly boundStaffMember?: BoundStaffMember | null | undefined;
  /**
   * The features the platform allows at the branch, for the PIN screen: a
   * phone whose branch has staff phones off says so before a PIN is typed.
   * Absent from an older server, or a device read that could not be made.
   */
  readonly features?: readonly BranchFeature[] | undefined;
}

/**
 * What an enrolled device is: the counter's shared tablet, or a personal phone
 * bound to one person (`StaffDeviceKind` 1 and 2 on the wire).
 */
export type StaffDeviceKind = 'tablet' | 'phone';

/** The person a phone belongs to: the only name its PIN screen shows. */
export interface BoundStaffMember {
  readonly id: string;
  readonly fullName: string;
  readonly role: UserRole;
}

/** A personal phone, whatever the device's `kind` says. */
export function isPhoneDevice(
  device: Pick<EnrolledDevice, 'kind'> | null | undefined,
): device is EnrolledDevice & { readonly kind: 'phone' } {
  return device?.kind === 'phone';
}

/**
 * The characters an enrolment code is drawn from: the server's
 * `Secrets.ReadableAlphabet`. No I, L, O or U and no 0 or 1, so a code read
 * across a bar never needs "letter O, not zero".
 */
export const ENROLMENT_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

/** How many characters a code has: `Secrets.NewEnrolmentCode`. */
export const ENROLMENT_CODE_LENGTH = 10;

/**
 * A code as the server hashed it: upper case, readable characters only.
 *
 * The server hashes exactly what it is sent, so "h7kq2-mxp9d" typed on a
 * keyboard without caps would never match "H7KQ2MXP9D". Characters outside the
 * alphabet are dropped rather than refused: a dash, a space or a pasted line
 * break is formatting, and a letter O was never part of any code.
 */
export function normalizeEnrolmentCode(raw: string): string {
  return Array.from(raw.toUpperCase())
    .filter((c) => ENROLMENT_CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, ENROLMENT_CODE_LENGTH);
}

export interface EnrolDeviceCommand {
  /** The one-time code a manager generated for this branch. */
  readonly code: string;
  /**
   * A stable identifier this browser minted for itself, kept in IndexedDB.
   *
   * Not an account. It is what lets a re-enrolment after a wipe be recognised
   * as the same tablet rather than appearing twice in the manager's list.
   */
  readonly deviceId: string;
  /** What the tablet should be called in the admin panel — "Bar", "Terrace". */
  readonly deviceName: string;
}

/** A staff member's session on a tablet, opened by a PIN. */
export interface StaffSessionIdentity {
  readonly staffMemberId: string;
  /** Shown on the tablet so the waiter can see whose session is open. */
  readonly fullName: string;
  readonly role: UserRole;
  /** The branch this session may act on, and only this one. */
  readonly branchId: string;
  /**
   * The features the platform allows at that branch, read again on every
   * renewal: the floor hides takeaway, messages, tabs and the kitchen when
   * they are off, and a phone whose branch loses staff phones is signed out.
   */
  readonly features: readonly BranchFeature[];
}

export interface StaffSessionTokens {
  readonly accessToken: string;
  /** Rotates on every use; dies after thirty minutes of inactivity. */
  readonly renewalToken: string;
  readonly expiresInSeconds: number;
}

export interface StaffSignInResult {
  readonly identity: StaffSessionIdentity;
  readonly tokens: StaffSessionTokens;
}

/**
 * One name on the PIN screen, from `GET /api/auth/staff/roster`.
 *
 * Active people of the device's venue whose branch is this one or every
 * branch, sorted by name by the server. Nothing beyond what a tile needs: the
 * tablet is a shared device, and a phone number on it is a phone number on a
 * counter.
 */
export interface StaffRosterEntry {
  readonly staffMemberId: string;
  readonly fullName: string;
  readonly role: UserRole;
  /**
   * A shift at this branch was running when the roster was read. The PIN gate
   * lists these people first; it never hides or refuses anybody else.
   *
   * True *at the moment of the read* (`startsAtUtc <= now < endsAtUtc` on
   * the server): a gate left open re-reads it against the clock with
   * {@link isOnShiftAt}.
   */
  readonly onShiftNow: boolean;
  /**
   * The shift the server reports: the one running now, else the next one to
   * start within twelve hours at this branch (across midnight: at 23:50,
   * tomorrow's 00:10). Null when there is none — their shifts are over, start
   * further ahead, are elsewhere, or they are off.
   */
  readonly shift: StaffRosterShift | null;
}

/** A roster entry's shift, as `GET /api/branches/{id}/shifts` words it. */
export interface StaffRosterShift {
  /** `HH:mm`, the branch's wall clock. */
  readonly startsAt: string;
  /** `HH:mm`; at or before `startsAt` means after midnight. */
  readonly endsAt: string;
  /** Ends on the next date, including at exactly 00:00. */
  readonly endsNextDay: boolean;
  readonly startsAtUtc: string;
  readonly endsAtUtc: string;
}

/**
 * Whether the person is on shift at `now`, from the shift's own instants.
 *
 * The roster's `onShiftNow` is the server's answer at the read; a PIN gate
 * left open over a shift change must not keep listing the lunch waiter first
 * at nine at night, nor the evening one last once they have started. With no
 * shift to time, the read is all there is.
 */
export function isOnShiftAt(entry: StaffRosterEntry, now: Date): boolean {
  if (!entry.shift) return entry.onShiftNow;
  const at = now.getTime();
  return Date.parse(entry.shift.startsAtUtc) <= at && at < Date.parse(entry.shift.endsAtUtc);
}

export interface PinSignInCommand {
  /** Whose PIN is being tapped. */
  readonly staffMemberId: string;
  /** The digits. Never logged, never stored, never put in a query string. */
  readonly pin: string;
}

/**
 * Why the tablet is back on the PIN screen.
 *
 * `idle` and `expired` are separated because only one of them is the waiter's
 * fault, and neither is phrased as an error: locking after a rush is the screen
 * working.
 */
export type StaffSignOutReason =
  /** The waiter tapped sign out, or handed the tablet over. */
  | 'signedOut'
  /** Thirty minutes with nobody touching it. */
  | 'idle'
  /** The renewal handle was refused: the shift cap ran out, or the tablet was revoked. */
  | 'expired'
  /**
   * A phone whose branch no longer has staff phones (2026-10-27): the platform
   * switched them off. Not the person's doing, and a PIN will not fix it.
   */
  | 'phoneOff'
  /**
   * A kitchen account at a branch whose kitchen screen the platform switched
   * off (2026-10-27): every call it makes is refused, so it is not left on a
   * board that cannot load. Waiters and managers still sign in.
   */
  | 'kitchenOff';

/** Where the device token and the renewal handle live between launches. */
export interface StaffCredentialStorage {
  readDeviceId(): Promise<string | null>;
  writeDeviceId(deviceId: string): Promise<void>;
  readDeviceToken(): Promise<string | null>;
  writeDeviceToken(token: string): Promise<void>;
  clearDeviceToken(): Promise<void>;
  readRenewalToken(): Promise<string | null>;
  writeRenewalToken(token: string): Promise<void>;
  clearRenewalToken(): Promise<void>;
}

// --- Personal phones -----------------------------------------------------------

/**
 * Where a pairing QR points: the staff app's pairing page, the code in the
 * fragment (`pairingUrl` is `<origin>/staff/pair#code=XXXXX-XXXXX`) so it never
 * reaches a server log.
 */
export const PHONE_PAIRING_PATH = '/staff/pair';

/** How long a pairing code lives: ten minutes, one use (`StaffEnrolmentCode.PhonePairingLifetime`). */
export const PHONE_PAIRING_MINUTES = 10;

/**
 * Who a pairing code is for, read before the PIN (`POST
 * /api/auth/staff/phone-pair/preview`) so the phone can ask "is this you?".
 * Reading it spends nothing.
 */
export interface PhonePairingPreview {
  readonly staffMemberId: string;
  readonly fullName: string;
  readonly role: UserRole;
  readonly branchId: string;
  readonly branchName: string;
  readonly venueName: string;
  readonly expiresAtUtc: string;
}

export interface PairPhoneCommand {
  /** The manager's code, from the QR or typed; case and the dash do not matter. */
  readonly code: string;
  /** The person's own PIN, the one they tap on the tablet. */
  readonly pin: string;
  /** This browser's stable id, as a tablet's `deviceId`: pairing again reuses the phone. */
  readonly clientDeviceId: string;
  /**
   * Its platform and browser in English, "iPhone · Safari": what an older
   * console shows, and the name History keeps.
   */
  readonly deviceName: string;
  /** The same as parts, for the console to word in its reader's language. */
  readonly platform?: StaffDevicePlatform | undefined;
  readonly browser?: StaffDeviceBrowser | null | undefined;
}

/** A paired phone: the device credential, and the person signed in on it. */
export interface PhonePairing {
  readonly device: DeviceEnrolment;
  readonly session: StaffSignInResult;
}

/**
 * The code in whatever a QR or a paste carried: a pairing URL (`#code=` in its
 * fragment, or `?code=` should a chat app have moved it), or the code itself.
 * Normalised as the server hashes it; `null` when nothing code-shaped is there.
 */
export function pairingCodeFrom(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;
  let candidate = raw;
  const fromUrl = /[#?&]code=([^&#\s]+)/u.exec(raw);
  if (fromUrl?.[1]) {
    try {
      candidate = decodeURIComponent(fromUrl[1]);
    } catch {
      candidate = fromUrl[1];
    }
  } else if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(raw)) {
    // A URL with no code in it is some other QR code, not a mistyped code.
    return null;
  }
  const code = normalizeEnrolmentCode(candidate);
  return code.length === ENROLMENT_CODE_LENGTH ? code : null;
}

/** "K7Q2M9XW4P" as it is read out: "K7Q2M-9XW4P". */
export function formatPairingCode(code: string): string {
  const clean = normalizeEnrolmentCode(code);
  return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}
