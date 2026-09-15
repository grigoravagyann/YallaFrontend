/**
 * The name a person goes by on a shared tab.
 *
 * A participant with no name is shown to the host as the server's placeholder,
 * "Guest 3" (`TabService.NameOrDefault`), and everybody else at the table sees
 * the same. So the phone sends the name it already knows on the way in — the
 * account's, or the one typed on this phone before — and asks only the people
 * it knows nothing about.
 */

/** `FieldLengths.DisplayName`; the server refuses the whole scan over it. */
export const TAB_NAME_MAX = 100;

/** What the server calls an unnamed participant. */
const SERVER_PLACEHOLDER = /^Guest \d+$/u;

/**
 * Trimmed, within the server's length, or `null` when nothing is left.
 *
 * Cut by characters as a person sees them, never through a surrogate pair, and
 * counted in UTF-16 units as the server counts them. An over-long name must
 * never ride along on a scan: the server would refuse the scan, not the name.
 */
export function tidyTabName(raw: string | null | undefined): string | null {
  const name = (raw ?? '').trim();
  if (!name) return null;
  if (name.length <= TAB_NAME_MAX) return name;
  let cut = '';
  for (const character of Array.from(name)) {
    if (cut.length + character.length > TAB_NAME_MAX) break;
    cut += character;
  }
  return cut.trim() || null;
}

/** The account's name first, then the one remembered on this phone; `null` for neither. */
export function nameForTab(
  profileName: string | null | undefined,
  rememberedName: string | null | undefined,
): string | null {
  return tidyTabName(profileName) ?? tidyTabName(rememberedName);
}

/**
 * Whether this participant already has a name of their own.
 *
 * False for a blank name (the mock's unnamed participant) and for the server's
 * "Guest N" placeholder — the two cases worth asking about.
 */
export function hasOwnTabName(displayName: string | null | undefined): boolean {
  const name = (displayName ?? '').trim();
  return name !== '' && !SERVER_PLACEHOLDER.test(name);
}
