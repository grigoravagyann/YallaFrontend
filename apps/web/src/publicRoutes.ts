/**
 * Which URLs belong to the public branch page, and which to the console.
 *
 * One origin serves three different products — the venue console, the counter
 * screen and a page a stranger opens from a WhatsApp message — and this module
 * is the only place that decides which. It holds no React and no CSS so that
 * `main.tsx` can ask the question *before* importing either app, which is what
 * makes the split a real code split rather than a routing decision inside one
 * enormous bundle.
 *
 * ## Why the public page gets the root of the URL space
 *
 * `/{venueSlug}/{branchSlug}` is short, printable, guessable and fits in an
 * Instagram bio. Every alternative — `/v/`, `/p/`, `/place/` — costs a venue
 * three characters on a card and buys nothing. The price is that the console
 * has to live under reserved words, which is the list below.
 *
 * A venue slug is therefore not allowed to be one of them. That is a rule the
 * *backend* has to enforce at slug-assignment time; a venue that manages to
 * claim `staff` would be unreachable, and this file cannot fix that after the
 * fact. Until then the reserved list is short and boring on purpose.
 */

/**
 * First path segments the console and the counter screen own.
 *
 * `assets` and `fonts` are here because the dev server and the built site both
 * serve files from them, and a venue slug that shadowed one would break its own
 * page's stylesheet.
 */
export const RESERVED_FIRST_SEGMENTS: readonly string[] = [
  'assets',
  'dev',
  'fonts',
  'platform',
  'sign-in',
  'staff',
  'venue',
];

/**
 * Is this path a public branch page?
 *
 * The root is not: `/` is the console's own landing, and a public page always
 * names a venue. Everything else that is not reserved is treated as a venue
 * slug — including a slug that does not exist, which resolves to the public
 * "we could not find that place" page rather than to the console's refusal. A
 * stranger who mistypes a link should be told the link is wrong, not shown a
 * sign-in form for a product they have never heard of.
 */
export function isPublicPath(pathname: string): boolean {
  const first = pathname.split('/').filter(Boolean)[0];
  if (!first) return false;
  return !RESERVED_FIRST_SEGMENTS.includes(first.toLowerCase());
}
