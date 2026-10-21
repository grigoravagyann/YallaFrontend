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

import type { UserRole } from './console';

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
  | 'expired';

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
