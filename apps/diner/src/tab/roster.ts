import type { DinerTabView, TabPermissions, TabRosterEntry } from '@yalla/api';

/**
 * Who is at the table, as the tab read describes it.
 *
 * The server's roster carries no "is this you" flag and names its statuses
 * `approved`, `pendingApproval` and `removed`. This phone is whoever
 * `me.participantId` names.
 */

export interface RosterPerson extends TabRosterEntry {
  /** True for the participant on this phone. From `me.participantId`, never guessed. */
  readonly isYou: boolean;
}

export function roster(view: Pick<DinerTabView, 'participants' | 'me'>): readonly RosterPerson[] {
  return view.participants.map((person) => ({
    ...person,
    isYou: person.participantId === view.me.participantId,
  }));
}

/** On the tab in any meaningful sense: approved by the host. */
export function onTab(people: readonly RosterPerson[]): readonly RosterPerson[] {
  return people.filter((person) => person.status === 'approved');
}

/** At the table and asking to be let on. */
export function waitingToJoin(people: readonly RosterPerson[]): readonly RosterPerson[] {
  return people.filter((person) => person.status === 'pendingApproval');
}

/**
 * The three switches for one person.
 *
 * The roster carries no flags, so a host learns someone's permissions only from
 * the answer to a host action. When this phone has not been told, the editor
 * starts from the table default — the total hidden when the tab hides it, and
 * paying off — and says so; nothing is sent until the host saves all three.
 */
export function permissionDraft(
  known: TabPermissions | undefined,
  hideTotalFromGuests: boolean,
): { readonly permissions: TabPermissions; readonly known: boolean } {
  if (known) return { permissions: known, known: true };
  return {
    permissions: { canOrder: true, canSeeTableTotal: !hideTotalFromGuests, canPay: false },
    known: false,
  };
}
