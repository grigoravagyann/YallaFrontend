import {
  canEditStaff,
  canIssueSignIn,
  canSetStaffPin,
  isAdminRole,
  type StaffActorRef,
  type StaffMember,
} from '@yalla/api';

export type StaffAction =
  | 'unlock'
  | 'reactivate'
  | 'issueSignIn'
  | 'edit'
  | 'shift'
  | 'resetPin'
  | 'sendNewLink'
  | 'deactivate'
  | 'changeOwnPin';

/**
 * Who is acting: their id, role and — for a branch manager, who touches their
 * own branch's people only — their stored branch.
 */
export type StaffActor = StaffActorRef;

/** The one state a row's pill says, the most actionable first (Staff artboard). */
export type StaffStatus = 'active' | 'awaiting' | 'noSignIn' | 'pinLocked' | 'inactive';

/**
 * The row's pill.
 *
 * A locked PIN comes before a missing sign-in: a waiter locked out mid-rush is
 * the most time-critical thing on the screen, and the row's button is its fix.
 * There is no "PIN set" state: the API says whether a PIN is locked, not
 * whether one exists, and a pill claiming it would be made up.
 */
export function staffStatusOf(member: StaffMember): StaffStatus {
  if (!member.isActive) return 'inactive';
  if (member.isPinLocked) return 'pinLocked';
  if (isAdminRole(member.role) && !member.email) return 'noSignIn';
  if (isAdminRole(member.role) && !member.hasPasswordSignIn) return 'awaiting';
  return 'active';
}

export interface RowActions {
  /** The one button beside the menu: the thing this person most needs now. */
  readonly primary: 'unlock' | 'issueSignIn' | 'sendNewLink' | null;
  /** The ⋮ menu, in the artboard's order; the destructive item last. */
  readonly menu: readonly StaffAction[];
  /** Above the actor's role: the row says so, and offers nothing but an unlock. */
  readonly locked: boolean;
  readonly isSelf: boolean;
}

/**
 * Whether this row is the actor's own and may offer "Change my PIN".
 *
 * The server's `SetPinAsync` refuses a PIN only for somebody else the actor
 * may not manage, so your own is yours (`canSetStaffPin`) — while your own
 * role, branch and deactivation stay refused, which is why this is the one
 * thing your own row offers. A deactivated account has nowhere to use one.
 */
export function canChangeOwnPin(member: StaffMember, actor: StaffActor): boolean {
  return member.id === actor.id && member.isActive && canSetStaffPin(actor, member);
}

export type OwnPinProblem = 'fourDigits' | 'mismatch';

/** What is wrong with a typed PIN and its confirmation, before any call. */
export function ownPinProblem(pin: string, again: string): OwnPinProblem | null {
  if (!/^\d{4}$/u.test(pin)) return 'fourDigits';
  if (pin !== again) return 'mismatch';
  return null;
}

/**
 * What a row offers (Staff artboard), and nothing the server would refuse.
 *
 * - **Somebody deactivated**: Reactivate, and only that — a PIN or a shift does
 *   nothing for a person who cannot sign in.
 * - **The button**: Unlock PIN first — a waiter locked out mid-rush cannot wait
 *   out a timer, and a lockout is cleared per branch rather than per rank, so it
 *   is offered even on a row above the actor's role. Then a sign-in for a
 *   console role that has none ("Give sign-in") or has not opened its link yet
 *   ("New link").
 * - **The menu**: New PIN, Edit, Shift, the sign-in, then Deactivate after a
 *   separator. Editing follows `canEditStaff`; a sign-in follows the stricter
 *   `canIssueSignIn` (an owner may edit a co-owner but not take over their
 *   sign-in).
 * - **Your own row**: your own PIN, typed by you, and your own shifts (the
 *   server lets a person plan their own) — never your own role, branch or
 *   deactivation, which the server refuses.
 */
export function rowActionsFor(
  member: StaffMember,
  actor: StaffActor,
  options: { readonly canUnlock: boolean },
): RowActions {
  const isSelf = member.id === actor.id;
  const editable = canEditStaff(actor, member);
  const issuable = canIssueSignIn(actor, member);
  const status = staffStatusOf(member);
  const unlock = status === 'pinLocked' && options.canUnlock ? ('unlock' as const) : null;

  if (isSelf) {
    return {
      primary: unlock,
      menu: canChangeOwnPin(member, actor) ? ['changeOwnPin', 'shift'] : [],
      locked: false,
      isSelf,
    };
  }

  if (!member.isActive) {
    return { primary: null, menu: editable ? ['reactivate'] : [], locked: !editable, isSelf };
  }

  if (!editable) return { primary: unlock, menu: [], locked: true, isSelf };

  const primary =
    unlock ??
    (issuable && status === 'noSignIn'
      ? 'issueSignIn'
      : issuable && status === 'awaiting'
        ? 'sendNewLink'
        : null);

  const menu: StaffAction[] = ['resetPin', 'edit', 'shift'];
  if (issuable) menu.push(member.email ? 'sendNewLink' : 'issueSignIn');
  menu.push('deactivate');
  return { primary, menu, locked: false, isSelf };
}
