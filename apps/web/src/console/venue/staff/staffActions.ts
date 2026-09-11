import { canEditStaff, canIssueSignIn, type StaffMember, type StaffRole } from '@yalla/api';

export type StaffAction =
  'unlock' | 'reactivate' | 'issueSignIn' | 'edit' | 'resetPin' | 'sendNewLink' | 'deactivate';

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
