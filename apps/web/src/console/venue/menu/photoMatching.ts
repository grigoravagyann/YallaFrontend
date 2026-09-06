import type { AdminMenuItem } from '@yalla/api';

/**
 * Matching thirty dropped photos against eighty dish names.
 *
 * This is the slow half of onboarding. Somebody is sitting in a cafe with the
 * owner, the owner has a phone full of photos, and attaching them one at a time
 * through a file picker is the reason the afternoon runs out before the menu is
 * finished.
 *
 * The rule that shapes everything here: **a wrong match is far worse than no
 * match.** A photo attached to the wrong dish is discovered by a diner, and the
 * venue looks careless in a way nobody can trace back to an import. So a match
 * is only ever *proposed*, every proposal is shown before anything is attached,
 * and anything ambiguous goes to the tray untouched rather than being guessed
 * at. The tray is not a failure state — on a real set of camera filenames it is
 * where most of them land, and placing twelve photos by hand beside a list is
 * still far faster than opening twelve forms.
 */

export type MatchConfidence =
  /** The filename is the dish name. Nothing to confirm beyond a glance. */
  | 'exact'
  /** The same name once case, spacing and punctuation are set aside. */
  | 'normalised'
  /** One is contained in the other, or they are a character or two apart. */
  | 'near';

export interface PhotoMatch {
  readonly fileName: string;
  readonly itemId: string;
  readonly itemName: string;
  readonly confidence: MatchConfidence;
}

export interface MatchResult {
  /** Proposals, best first. **Nothing is attached until somebody confirms.** */
  readonly matches: readonly PhotoMatch[];
  /**
   * Files nothing was proposed for, and files two dishes wanted equally.
   *
   * An ambiguous file is deliberately here rather than resolved by picking the
   * first: two dishes called "Coffee" and "Coffee Frappe" both match
   * `coffee.jpg`, and the tie is a decision only a person has.
   */
  readonly unmatched: readonly string[];
}

/**
 * A filename reduced to the part that could be a dish name.
 *
 * Strips the extension, the `IMG_`/`DSC_`/`PXL_` prefixes every camera adds, a
 * trailing counter, and then everything that is not a letter or a digit —
 * across all three alphabets the product ships, which is why this uses Unicode
 * property escapes rather than `a-z`. `Խաչապուրի (2).JPG` and `khachapuri` are
 * different dishes and must not collapse together; `Khachapuri (2).JPG` and
 * `khachapuri` are the same one and must.
 */
export function normalise(value: string): string {
  return (
    value
      .replace(/\.[^.]+$/u, '')
      .replace(/^(?:img|dsc|dscn|pxl|photo|image|screenshot)[-_\s]*/iu, '')
      // A duplicate counter only: `(2)`, or a one-or-two digit suffix after a
      // separator. Deliberately not any trailing number — a dish called "Beer
      // 500" is a dish, and stripping the 500 would send its photo to the tray.
      .replace(/[-_\s]*\(\d{1,3}\)\s*$|[-_\s]\d{1,2}$/u, '')
      .replace(/[^\p{L}\p{N}]+/gu, '')
      .toLocaleLowerCase()
  );
}

/**
 * How close two normalised strings are, 0 to 1.
 *
 * Containment first, because `khachapuriadjaruli.jpg` for "Khachapuri Adjaruli"
 * is the common shape and no edit-distance threshold catches it without also
 * catching things it should not. Then a bounded Levenshtein for a typo or a
 * transposed pair.
 */
export function similarity(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    // Scaled by how much of the longer string the shorter one accounts for, so
    // `tea` inside `teacakewithhoney` does not read as a strong match.
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }

  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

/** Below this, two names are simply different dishes. */
const NEAR_THRESHOLD = 0.8;

/**
 * Two candidates this close to each other are a tie, and a tie is a person's
 * decision. Picking the first would be right about half the time, which on a
 * menu photo is not a rate anybody would accept if they were told about it.
 */
const AMBIGUITY_MARGIN = 0.05;

export function matchPhotos(
  fileNames: readonly string[],
  items: readonly AdminMenuItem[],
): MatchResult {
  const matches: PhotoMatch[] = [];
  const unmatched: string[] = [];

  const candidates = items.map((item) => ({ item, key: normalise(item.name) }));
  /** One photo per dish per drop: two files claiming one dish is a tie. */
  const claimed = new Set<string>();

  for (const fileName of fileNames) {
    const key = normalise(fileName);
    if (key.length === 0) {
      unmatched.push(fileName);
      continue;
    }

    const scored = candidates
      .filter(({ item }) => !claimed.has(item.id))
      .map(({ item, key: itemKey }) => ({ item, itemKey, score: similarity(key, itemKey) }))
      .filter((candidate) => candidate.score >= NEAR_THRESHOLD)
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const runnerUp = scored[1];

    if (!best) {
      unmatched.push(fileName);
      continue;
    }
    if (runnerUp && best.score - runnerUp.score < AMBIGUITY_MARGIN) {
      unmatched.push(fileName);
      continue;
    }

    claimed.add(best.item.id);
    matches.push({
      fileName,
      itemId: best.item.id,
      itemName: best.item.name,
      confidence:
        // Exact means the filename *is* the name, before normalising: a
        // reviewer can skip past those and read the rest.
        stripExtension(fileName) === best.item.name
          ? 'exact'
          : best.score === 1
            ? 'normalised'
            : 'near',
    });
  }

  return {
    // Strongest first, so the ones worth reading carefully are at the bottom
    // where the eye stops rather than at the top where it starts.
    matches: [...matches].sort((a, b) => rank(a.confidence) - rank(b.confidence)),
    unmatched,
  };
}

function rank(confidence: MatchConfidence): number {
  return confidence === 'exact' ? 0 : confidence === 'normalised' ? 1 : 2;
}

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/u, '');
}

/**
 * Levenshtein distance, two rows at a time.
 *
 * Bounded by the caller's use: these are dish names, so the strings are short
 * and the quadratic cost is irrelevant. Written out rather than pulled in as a
 * dependency because it is fifteen lines and this is the only caller.
 */
function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, substitution);
    }
    previous = current;
  }

  return previous[b.length]!;
}
