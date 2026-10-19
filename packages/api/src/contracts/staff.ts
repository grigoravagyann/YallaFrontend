import type { StaffRole } from './console';

/**
 * Staff accounts and the devices they sign in on.
 *
 * Two different scopes on one screen, and the difference is not cosmetic:
 * **staff belong to a venue and devices belong to a branch.** An owner works
 * everywhere, so `StaffMember.branchId` is nullable and null means every branch
 * of the venue — that is how a general manager is represented. A tablet is
 * bolted to one counter, so a device is always branch-bound.
 */

export interface StaffMember {
  readonly id: string;
  readonly venueId: string | null;
  /**
   * The one branch they work at, or **null for every branch of the venue**.
   *
   * Null is a real assignment rather than a missing value: it is how an owner
   * who works the floor, or a general manager, is represented. A branch
   * manager always names their branch.
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

/**
 * A freshly issued admin-panel sign-in, returned **once**.
 *
 * Nobody types a password for somebody else. The person who hired a manager
 * or owner issues this, hands the link over the way everything in this product
 * travels — pasted into a chat — and the recipient opens it and chooses a
 * password of their own. The server keeps the token's hash and no read ever
 * returns it, so `resetLink` exists only here: a lost link is replaced by
 * issuing another, which retires this one. Good for 24 hours and one use.
 */
export interface StaffSignInLink {
  readonly staffMemberId: string;
  /** The address, as stored: trimmed and lowercased. */
  readonly email: string;
  /** The one copy. Never cached, stored, logged or put in a URL of our own. */
  readonly resetLink: string;
  readonly expiresAtUtc: string;
  /**
   * True when they already had a password. It keeps working until the link is
   * used, at which point it is replaced and every session they had open ends.
   */
  readonly replacedExistingSignIn: boolean;
}

/**
 * Whether a role signs in to the admin panel at all.
 *
 * The server's rule, mirrored: a waiter or kitchen hand taps a PIN on a tablet
 * a manager enrolled and never holds an email or password, because a password
 * mints a venue-scoped identity their PIN on the floor deliberately does not
 * reach. Only an owner, a general manager and a branch manager get a sign-in
 * badge, an email field, or a link.
 */
export function isAdminRole(role: StaffRole): boolean {
  return role === 'owner' || role === 'generalManager' || role === 'manager';
}

// ---------------------------------------------------------------------------
// Who may create whom
// ---------------------------------------------------------------------------

/**
 * The roles an actor may assign — the server's `StaffRoleRules.MayAssign`,
 * case for case, in rank order.
 *
 * The server enforces this from the acting staff member's *stored* role, and
 * the UI has to match rather than approximate. Building the picker from this
 * means a manager never sees Manager or Owner as options at all — which is the
 * requirement. Rendering everything and validating on submit offers an action
 * the server will refuse, and being refused something you were offered reads as
 * a broken product rather than as a rule. The reverse is as bad: this list was
 * once stricter than the server's and an owner could not add a co-owner, an
 * action the product means to allow.
 *
 * `platformAdmin` is absent from every list on purpose — as a role that can be
 * *assigned*. A platform admin has no venue and no branch, so creating one from
 * inside a venue's staff screen is a category error; if they are creatable at
 * all it belongs under `/platform`. That is separate from what a platform admin
 * may assign to others, which is every venue role, owner included.
 */
export function assignableRoles(actor: StaffRole | 'platformAdmin'): readonly StaffRole[] {
  switch (actor) {
    // Every venue role; the only actor who can give a new venue its first owner.
    case 'platformAdmin':
      return ['owner', 'generalManager', 'manager', 'waiter', 'kitchen'];
    // Owner included: a co-owner is a normal thing for a family business.
    case 'owner':
      return ['owner', 'generalManager', 'manager', 'waiter', 'kitchen'];
    // Branch managers and floor staff, at any branch. Never an owner, and
    // never a peer: a general manager cannot mint another general manager.
    case 'generalManager':
      return ['manager', 'waiter', 'kitchen'];
    // Floor staff only, and nobody at or above them: a branch manager cannot
    // mint a peer, and only hires for their own branch.
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
 * Who is acting, as far as the staff rules care.
 *
 * `branchId` is the actor's stored home branch. It matters for one role only:
 * a branch manager may touch the people of their own branch and nobody else's
 * (the server's staff service checks it from the stored rows). Left out, a
 * branch manager is taken to hold no branch the subject could share — refusing
 * rather than offering something the server would refuse.
 */
export interface StaffActorRef {
  readonly id: string;
  readonly role: StaffRole | 'platformAdmin';
  readonly branchId?: string | null | undefined;
}

/** The branch rule on top of the rank rule: a branch manager stays at their branch. */
function withinActorsBranch(actor: StaffActorRef, subject: StaffMember): boolean {
  if (actor.role !== 'manager') return true;
  return subject.branchId !== null && subject.branchId === (actor.branchId ?? undefined);
}

/**
 * Whether `actor` may edit `subject` at all.
 *
 * Two rules, both the server's. `MayManage` is the `MayAssign` table — you may
 * touch the people you could have created, so an owner edits a co-owner and a
 * manager cannot touch another manager. And **nobody edits themselves through
 * this form**: the server lets a person change their own name and phone but
 * refuses their own role, branch and deactivation, and this form carries all
 * of those, so offering it to oneself would offer a save the server refuses.
 * That is also what keeps a venue out of its own lockout — an owner cannot
 * demote or deactivate the last owner-level account, themselves.
 */
export function canEditStaff(actor: StaffActorRef, subject: StaffMember): boolean {
  if (actor.id === subject.id) return false;
  return assignableRoles(actor.role).includes(subject.role) && withinActorsBranch(actor, subject);
}

/**
 * Whether `actor` may set `subject`'s PIN: the server's `SetPinAsync`.
 *
 * Wider than `canEditStaff` by exactly one case — yourself. The server refuses
 * a PIN only for somebody else the actor may not manage, so your own PIN is
 * yours to change even though your own role, branch and deactivation are not.
 */
export function canSetStaffPin(actor: StaffActorRef, subject: StaffMember): boolean {
  if (actor.id === subject.id) return true;
  return assignableRoles(actor.role).includes(subject.role) && withinActorsBranch(actor, subject);
}

/**
 * Seniority, most senior first — the server's `StaffRoleRules.Seniority`, not
 * anything derived from the order of a union or a list.
 */
const SENIORITY: Readonly<Record<StaffRole | 'platformAdmin', number>> = {
  platformAdmin: 0,
  owner: 1,
  generalManager: 2,
  manager: 3,
  waiter: 4,
  kitchen: 5,
};

/** Strictly higher in the hierarchy: the server's `StaffRoleRules.Outranks`. */
export function outranks(
  actor: StaffRole | 'platformAdmin',
  other: StaffRole | 'platformAdmin',
): boolean {
  return SENIORITY[actor] < SENIORITY[other];
}

/**
 * Whether `actor` may issue an admin-panel sign-in for `subject`.
 *
 * Stricter than editing, as the server has it: a sign-in is the whole account,
 * so it needs the actor to strictly *outrank* the subject. An owner may edit a
 * co-owner but may not take over their sign-in; only a platform admin repairs
 * an owner. Never for oneself, never for a PIN-only role, and never for a
 * deactivated person — the server refuses all three, and a refused action is
 * not offered.
 */
export function canIssueSignIn(actor: StaffActorRef, subject: StaffMember): boolean {
  if (actor.id === subject.id) return false;
  if (!isAdminRole(subject.role) || !subject.isActive) return false;
  return outranks(actor.role, subject.role);
}

/**
 * Whether the branch field is a choice or a fact.
 *
 * A branch manager holds one branch and everyone they create works at it, so
 * the field is fixed and no selector is shown — a control with one option
 * invites somebody to go looking for the others. An owner and a general
 * manager pick any branch of their venue, or all of them where the role
 * allows it (see {@link branchBindingFor}).
 */
export function canChooseBranch(actor: StaffRole | 'platformAdmin'): boolean {
  return actor === 'owner' || actor === 'generalManager' || actor === 'platformAdmin';
}

/**
 * How a role is bound to a branch — the server's rule for the *person*, not
 * the actor:
 *
 * - `required`: a branch manager works at one branch, and the server refuses
 *   one with none (422 `validation-failed` on `branchId`). No "All branches".
 * - `venueWide`: a general manager runs every branch, and the server refuses
 *   one with a branch. No branch picker at all.
 * - `either`: one branch, or every branch of the venue (null).
 */
export type BranchBinding = 'required' | 'venueWide' | 'either';

export function branchBindingFor(role: StaffRole): BranchBinding {
  switch (role) {
    case 'manager':
      return 'required';
    case 'generalManager':
      return 'venueWide';
    case 'owner':
    case 'waiter':
    case 'kitchen':
      return 'either';
  }
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

/**
 * One person's shift at one branch, or their day off (HANDOFF section 6: the
 * minimal shift model).
 *
 * A shift is a **date** — the branch's local date it starts on — with a start
 * and an end time in the branch's zone. An end at or before the start runs
 * past midnight: `endsNextDay`. A person may work two shifts on one date (a
 * split shift) as long as they do not overlap; a day off excludes any shift
 * on that date. The server checks overlaps across every branch of the venue.
 */
export interface StaffShift {
  readonly id: string;
  readonly staffMemberId: string;
  readonly branchId: string;
  /** `YYYY-MM-DD`, the branch-local date the shift starts on. */
  readonly date: string;
  /** "Day off": no times. */
  readonly dayOff: boolean;
  /** `HH:mm` in the branch's zone; null on a day off. */
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  /**
   * Ends on the next date. True for an end of exactly 00:00 as well, which is
   * drawn "16:00–00:00" without "(next day)", as the opening hours draw it.
   */
  readonly endsNextDay: boolean;
  /**
   * When it ends, as an instant; null on a day off. A shift dated before the
   * service day is history once this has passed, and the server refuses to
   * change or remove it — one still running (last night's 18:00–02:00 at
   * 00:30) may still be corrected.
   */
  readonly endsAtUtc: string | null;
}

/** A branch's shifts over a window, with the counts the Staff page heads with. */
export interface BranchShifts {
  readonly branchId: string;
  /**
   * The branch's "today": its local date, or yesterday while last night's
   * opening still runs past midnight — the Overview's service day.
   */
  readonly serviceDate: string;
  readonly from: string;
  readonly to: string;
  /** Distinct active people with a working shift at this branch on `serviceDate`. */
  readonly onShiftToday: number;
  /** Active people only, by date, then start (days off first). */
  readonly shifts: readonly StaffShift[];
}

/** A shift as the editor writes it: the whole shift; the person never changes. */
export interface ShiftInput {
  readonly date: string;
  readonly dayOff: boolean;
  /** `HH:mm`; null on a day off. */
  readonly startsAt: string | null;
  readonly endsAt: string | null;
}

/** The longest shift the server takes, in minutes (16 hours). */
export const SHIFT_MAX_MINUTES = 960;

/** How far ahead a shift may be planned, in days after the service date. */
export const SHIFT_HORIZON_DAYS = 92;
