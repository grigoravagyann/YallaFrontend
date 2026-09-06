/**
 * A name to the slug that goes in a URL.
 *
 * Lifted here from a third copy. It already existed identically in
 * `CreateVenueRoute` and `consoleMock`, and `consoleHttpGateway` now needs it
 * too: the backend requires a branch slug on create and does not derive one,
 * which is what made every venue creation fail.
 *
 * Non-ASCII collapses to a separator rather than transliterating. An Armenian
 * venue name gives an empty slug, which the create form catches and asks for
 * explicitly — a wrong transliteration baked into a permanent public URL is
 * worse than being asked.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}
