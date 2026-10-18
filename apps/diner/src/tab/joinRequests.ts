import { waitingToJoin, type RosterPerson } from './roster';

/**
 * The host's join banner, as pure decisions.
 *
 * Somebody who scans a table with an open tab waits on "Waiting for the host"
 * until the host lets them on. The host used to find them only by opening the
 * People screen, so a guest could stand at the table while nobody on the tab
 * knew they were there. The banner puts them at the top of the bill with the
 * answer beside them; this file decides who it is about, what it says, and when
 * the phone taps — once per person who starts waiting, never once per poll.
 */

/** Names spelled out under several people before the rest fold into "+n", as on the people card. */
export const MAX_JOIN_NAMES = 2;

export type JoinBanner =
  | { readonly kind: 'one'; readonly person: RosterPerson }
  | { readonly kind: 'several'; readonly people: readonly RosterPerson[] };

/**
 * Who the banner is about: everyone waiting to join, less the ones the host
 * has just answered.
 *
 * `answered` covers the moment between the server's yes and the tab read that
 * shows it: the roster on screen still says "waiting" until the refetch lands,
 * and offering Approve a second time in that gap reads as the first tap having
 * done nothing.
 */
export function joinBanner(
  people: readonly RosterPerson[],
  answered: ReadonlySet<string> = new Set(),
): JoinBanner | null {
  const waiting = waitingToJoin(people).filter((person) => !answered.has(person.participantId));
  const [first] = waiting;
  if (!first) return null;
  return waiting.length === 1
    ? { kind: 'one', person: first }
    : { kind: 'several', people: waiting };
}

/** The ids of everyone waiting to join. */
export function waitingIds(people: readonly RosterPerson[]): ReadonlySet<string> {
  return new Set(waitingToJoin(people).map((person) => person.participantId));
}

/**
 * Who started waiting since the last look — the people the phone taps for.
 *
 * `previous` is `null` on the first look, and the first look taps for nobody:
 * whoever was already waiting when the screen opened is not news, and the
 * host who tapped a push to get here has already been told.
 */
export function newlyWaiting(
  previous: ReadonlySet<string> | null,
  current: ReadonlySet<string>,
): readonly string[] {
  if (previous === null) return [];
  return [...current].filter((participantId) => !previous.has(participantId));
}

/**
 * The answers still worth remembering: the ones the tab read has not caught up
 * with yet.
 *
 * Once the read shows somebody approved or turned away, their answer has done
 * its job. Kept any longer, it would hide them for good if they came back and
 * asked again. The same set comes back when nothing changed.
 */
export function stillAnswered(
  answered: ReadonlySet<string>,
  waiting: ReadonlySet<string>,
): ReadonlySet<string> {
  const kept = [...answered].filter((participantId) => waiting.has(participantId));
  return kept.length === answered.size ? answered : new Set(kept);
}

/** A translation key and what goes in it. */
export interface JoinCopy {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** The name somebody gave the tab, or `null` for none — spaces are none. */
function givenName(person: RosterPerson): string | null {
  return person.displayName?.trim() || null;
}

/** "Anna wants to join", "A guest wants to join", "3 people want to join". */
export function joinTitle(banner: JoinBanner): JoinCopy {
  if (banner.kind === 'several') {
    return { key: 'tab.joinRequest.several', params: { count: banner.people.length } };
  }
  const name = givenName(banner.person);
  return name
    ? { key: 'tab.joinRequest.one', params: { name } }
    : { key: 'tab.joinRequest.oneUnnamed' };
}

/** The words the line under the title is made of, from the screen's own translations. */
export interface JoinLineCopy {
  /** "Anna, Gor +1". */
  readonly namesMore: (names: string, more: number) => string;
  /** Under one person: they are waiting on the host. */
  readonly waitingOne: string;
  /** Under several with not one name among them. */
  readonly waitingSeveral: string;
}

/**
 * The line under the title.
 *
 * Under one person, that they are waiting on you — their name is already the
 * title. Under several, the first names and a "+n" for everyone else, the way
 * the people card writes the party: an unnamed guest is folded, never listed
 * as "Guest".
 */
export function joinLine(banner: JoinBanner, copy: JoinLineCopy): string {
  if (banner.kind === 'one') return copy.waitingOne;
  const named = banner.people
    .map(givenName)
    .filter((name): name is string => name !== null)
    .slice(0, MAX_JOIN_NAMES);
  if (named.length === 0) return copy.waitingSeveral;
  const names = named.join(', ');
  const more = banner.people.length - named.length;
  return more > 0 ? copy.namesMore(names, more) : names;
}

export type JoinAnswer = 'approved' | 'rejected';

/** The toast after the host answers: who was let on, or that somebody was not. */
export function joinToast(answer: JoinAnswer, people: readonly RosterPerson[]): JoinCopy {
  if (answer === 'rejected') return { key: 'tab.joinRequest.rejected' };
  const [only] = people;
  if (people.length > 1 || !only) {
    return { key: 'tab.joinRequest.approvedAll', params: { count: people.length } };
  }
  const name = givenName(only);
  return name
    ? { key: 'tab.joinRequest.approved', params: { name } }
    : { key: 'tab.joinRequest.approvedUnnamed' };
}
