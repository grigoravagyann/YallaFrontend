import {
  canEditStaff,
  canIssueSignIn,
  canSetStaffPin,
  type StaffMember,
  type StaffRole,
} from '@yalla/api';

export type StaffAction =
  | 'unlock'
  | 'reactivate'
  | 'issueSignIn'
  | 'edit'
  | 'resetPin'
  | 'sendNewLink'
  | 'deactivate'
  | 'changeOwnPin';

export interface StaffActor {
  readonly id: string;
  readonly role: StaffRole | 'platformAdmin';
}

export interface CardActions {
  /** The one button the card shows: the thing this person most needs now. */
  readonly primary: StaffAction | null;
  /** Everything else the actor may do, behind "More". */
  readonly overflow: readonly StaffAction[];
  /** The actor may not edit this person. */
  readonly notYours: boolean;
  readonly isSelf: boolean;
}

/**
 * Whether this card is the actor's own and may offer "Change my PIN".
 *
 * The server's `SetPinAsync` refuses a PIN only for somebody else the actor
 * may not manage, so your own is yours (`canSetStaffPin`) — while your own
 * role, branch and deactivation stay refused, which is why this is the one
 * action your own card gains. A deactivated account has nowhere to use one.
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
 * What a card offers, in the order it matters.
 *
 * The same rules the table's action cell had, now ranked so one of them can
 * be the card's button:
 *
 * 1. **Reactivate** — the only useful thing to do for somebody deactivated.
 * 2. **Unlock** — a waiter locked out mid-rush cannot wait out a timer, so it
 *    comes before anything else for somebody active, and it is offered
 *    whatever the edit rights (a lockout is cleared per branch, not per rank).
 * 3. **Issue sign-in** — a manager with no address cannot sign in at all.
 * 4. **Edit**.
 *
 * The rest — New PIN, Send new link, Deactivate — go in the menu. Nothing is
 * offered that the server would refuse: editing follows `canEditStaff` and a
 * sign-in follows the stricter `canIssueSignIn` (an owner may edit a co-owner
 * but not take over their sign-in).
 */
export function actionsFor(
  member: StaffMember,
  actor: StaffActor,
  options: { readonly canUnlock: boolean },
): CardActions {
  const isSelf = member.id === actor.id;
  const editable = canEditStaff(actor, member);
  const issuable = canIssueSignIn(actor, member);

  const ranked: StaffAction[] = [];
  // For somebody deactivated, bringing them back comes before anything else,
  // an unlock included: a PIN does nothing for a person who cannot sign in.
  if (editable && !member.isActive) ranked.push('reactivate');
  if (member.isPinLocked && options.canUnlock) ranked.push('unlock');
  // Your own card: your PIN and nothing else (see `canChangeOwnPin`).
  if (canChangeOwnPin(member, actor)) ranked.push('changeOwnPin');
  if (editable) {
    if (issuable && !member.email) ranked.push('issueSignIn');
    ranked.push('edit', 'resetPin');
    if (issuable && member.email) ranked.push('sendNewLink');
    if (member.isActive) ranked.push('deactivate');
  }

  return {
    primary: ranked[0] ?? null,
    overflow: ranked.slice(1),
    notYours: !editable,
    isSelf,
  };
}
