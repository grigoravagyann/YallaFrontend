import { onTab, type RosterPerson } from './roster';

/**
 * The people card's stack of faces and the line beside it, as pure functions.
 *
 * The stack shows the first few people on the tab who have a name (you always
 * do, as "You"); everyone else — unnamed guests, and anyone past the stack —
 * folds into one "+n" chip. The line beside it names exactly the faces shown
 * and ends in the same "+n", so the two never disagree: "Anna, Gor +1".
 */

/** Two faces and a chip, as the design draws it: past that it stops being a glance. */
export const MAX_AVATARS = 2;

export interface AvatarStack {
  readonly shown: readonly RosterPerson[];
  /** Everyone else on the tab, in the "+n" chip. */
  readonly folded: number;
}

export function avatarStack(
  people: readonly RosterPerson[],
  max: number = MAX_AVATARS,
): AvatarStack {
  const here = onTab(people);
  const shown = here.filter((person) => person.displayName?.trim() || person.isYou).slice(0, max);
  return { shown, folded: here.length - shown.length };
}

/** The name on a face: the one given on the tab, or "You" for this phone. */
export function stackName(person: RosterPerson, youName: string): string {
  return person.displayName?.trim() || youName;
}

/** The first character as a person sees it, never half of a surrogate pair. */
export function initialOf(name: string): string {
  return (Array.from(name.trim())[0] ?? '').toLocaleUpperCase();
}

/** The words the line is made of, from the screen's own translations. */
export interface PeopleLineCopy {
  /** "You" — this phone, when it has no name on the tab. */
  readonly youName: string;
  /** "3 people on this tab", plural-aware. */
  readonly headCount: (count: number) => string;
  /** "Anna, Gor +1". */
  readonly namesMore: (names: string, more: number) => string;
}

/**
 * "Anna, Gor +1" — the faces' names and the fold. With no named face at all,
 * the plural head count ("3 people on this tab"); with nobody on the tab, empty.
 */
export function peopleLine(people: readonly RosterPerson[], copy: PeopleLineCopy): string {
  const { shown, folded } = avatarStack(people);
  if (shown.length === 0) return folded > 0 ? copy.headCount(folded) : '';
  const names = shown.map((person) => stackName(person, copy.youName)).join(', ');
  return folded > 0 ? copy.namesMore(names, folded) : names;
}
