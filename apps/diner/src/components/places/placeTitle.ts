import type { Place } from '../../places/model';

/** A place's name as a card sets it: the venue as the title, the branch on its own line. */
export interface PlaceTitle {
  /** "Lavash Restaurant" — the title line. */
  readonly venue: string;
  /** "Northern Avenue", or `null` when the branch has no name of its own. */
  readonly branch: string | null;
  /** "Lavash Restaurant · Northern Avenue" — one string, for an accessibility label. */
  readonly label: string;
}

/**
 * The venue and the branch, split for two lines.
 *
 * One line of "Lavash Restaurant · Northern Avenue" truncated at 375 pt to
 * "Lavash Restaurant · Nor…", which is exactly the part that tells two
 * branches of one venue apart. So the venue is the title and the branch gets
 * a line of its own; a screen reader still hears both as one name.
 *
 * A branch named like its venue (the only branch, usually) or left blank adds
 * no line, the same rule as `placeName` in the HTTP mapping.
 */
export function placeTitle(place: Pick<Place, 'name' | 'venueName' | 'branchName'>): PlaceTitle {
  const venue = place.venueName.trim() || place.name.trim();
  const rawBranch = place.branchName.trim();
  const branch =
    rawBranch && rawBranch.toLocaleLowerCase() !== venue.toLocaleLowerCase() ? rawBranch : null;
  return { venue, branch, label: branch ? `${venue} · ${branch}` : venue };
}
