import type { StaffRole } from './console';

/**
 * Staff accounts and the devices they sign in on.
 *
 * Two different scopes on one screen, and the difference is not cosmetic:
 * **staff belong to a venue and devices belong to a branch.** An owner works
 * everywhere, so `StaffMember.branchId` is nullable and null means every branch
 * of the venue — that is how a floating manager is represented. A tablet is
 * bolted to one counter, so a device is always branch-bound.
 */

export interface StaffMember {
  readonly id: string;
  readonly venueId: string | null;
  /**
   * The one branch they work at, or **null for every branch of the venue**.
   *
   * Null is a real assignment rather than a missing value: it is how an owner
   * who works the floor, or a manager who covers three sites, is represented.
   * Nothing in the product could reach that state before this screen existed.
   */
  readonly branchId: string | null;
  readonly fullName: string;
  readonly phone: string;
  readonly role: StaffRole;
  readonly isActive: boolean;
  /** Set only for people who sign in to the admin panel. */
  readonly email: string | null;
  readonly hasPasswordSignIn: boolean;
  /**
   * Too many wrong PINs in a row. The most time-critical thing on the screen —
   * a waiter locked out mid-rush cannot be made to wait out a timer.
   */
  readonly isPinLocked: boolean;
}

export interface CreateStaffInput {
  readonly fullName: string;
  readonly phone: string;
  readonly role: StaffRole;
  /** Four digits. Never stored, never logged, never put in a URL. */
  readonly pin: string;
  /** `null` assigns them to every branch of the venue. */
  readonly branchId: string | null;
  /** Admin-panel sign-in, for managers and owners. Absent for floor staff. */
  readonly email?: string | undefined;
  readonly password?: string | undefined;
}

/**
 * A patch. Only the fields present are applied.
 *
 * `branchId` is the exception and needs `setBranch` alongside it, because
 * "make them venue-wide" is `null` and "leave the branch alone" is also the
 * absence of a value. Without the flag the two are indistinguishable on the
 * wire, and the first one is unreachable.
 */
export interface UpdateStaffInput {
  readonly fullName?: string | undefined;
  readonly phone?: string | undefined;
  readonly role?: StaffRole | undefined;
  readonly setBranch?: boolean | undefined;
  readonly branchId?: string | null | undefined;
  readonly isActive?: boolean | undefined;
}

/**
 * A tablet bound to one branch.
 *
 * Revoked devices stay in the list, so it is an audit trail rather than a
 * roster: "which tablet was this done from, and was it still ours" is a
 * question somebody asks after the fact.
 */
export interface StaffDevice {
  readonly id: string;
  readonly name: string;
  readonly branchId: string;
  readonly enrolledAtUtc: string;
  readonly lastSeenAtUtc: string | null;
  readonly isRevoked: boolean;
}

/**
 * A one-time enrolment code, returned **once**.
 *
 * Only its hash is stored, so a manager who loses it issues another rather than
 * looking it up. Good for 24 hours and exactly one redemption — codes get read
 * out across a bar and will be overheard, and single use is what makes that
 * survivable: a second redemption fails and the manager sees a tablet in the
 * list they did not enrol.
 */
export interface EnrolmentCode {
  readonly code: string;
  readonly expiresAtUtc: string;
  readonly branchId: string;
}

// ---------------------------------------------------------------------------
// Who may create whom
// ---------------------------------------------------------------------------

/**
 * The roles an actor may assign, **strictly below their own**.
 *
 * The server enforces this from the acting staff member's *stored* role, and
 * the UI has to match rather than approximate. Building the picker from this
 * means a manager never sees Manager or Owner as options at all — which is the
 * requirement. Rendering everything and validating on submit offers an action
 * the server will refuse, and being refused something you were offered reads as
 * a broken product rather than as a rule.
 *
 * `platformAdmin` is absent from every list on purpose. A platform admin has no
 * venue and no branch, so creating one from inside a venue's staff screen is a
 * category error; if they are creatable at all it belongs under `/platform`.
 */
export function assignableRoles(actor: StaffRole | 'platformAdmin'): readonly StaffRole[] {
  switch (actor) {
    case 'platformAdmin':
    case 'owner':
      return ['manager', 'waiter', 'kitchen'];
    case 'manager':
      return ['waiter', 'kitchen'];
    // A waiter or kitchen hand reaches no part of this screen. Listed so the
    // switch is exhaustive rather than defaulting something into existence.
    case 'waiter':
    case 'kitchen':
      return [];
  }
}

/**
 * Whether `actor` may edit `subject` at all.
 *
 * Two rules, both the server's. Nobody edits somebody at or above their own
 * rank — a manager cannot demote another manager — and **nobody edits
 * themselves**, which is what stops an owner removing their own last
 * owner-level account and locking the venue out of its own console.
 */
export function canEditStaff(
  actor: { readonly id: string; readonly role: StaffRole | 'platformAdmin' },
  subject: StaffMember,
): boolean {
  if (actor.id === subject.id) return false;
  return assignableRoles(actor.role).includes(subject.role);
}

/**
 * Whether the branch field is a choice or a fact.
 *
 * A manager holds one branch and everyone they create works at it, so the field
 * is fixed and no selector is shown — a control with one option invites
 * somebody to go looking for the others. An owner picks any branch of their
 * venue, or all of them.
 */
export function canChooseBranch(actor: StaffRole | 'platformAdmin'): boolean {
  return actor === 'owner' || actor === 'platformAdmin';
}
