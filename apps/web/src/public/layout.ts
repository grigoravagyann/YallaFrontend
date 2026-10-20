/**
 * The branch page's two breakpoints (public-page HANDOFF §3).
 *
 * `WIDE_QUERY`: two columns from 960px, the content on the left and the
 * booking column on the right. Below it the booking column sits between the
 * header and the room.
 *
 * `STICKY_QUERY`: the booking column stays in view as the page scrolls — but
 * only when the window is also tall enough to hold it. On a short wide window
 * (a 1280×600 laptop, a landscape tablet) a sticky column capped at the
 * window's height became a cramped box scrolling inside the page, with the
 * date and time scrolled out of sight; there it flows with the page instead,
 * and the booking panel opens under the room as it does on a phone.
 *
 * `public.css` uses both strings verbatim, and `publicStyles.test.ts` holds
 * them together.
 */
export const WIDE_QUERY = '(min-width: 60rem)';
export const STICKY_QUERY = '(min-width: 60rem) and (min-height: 44rem)';

/**
 * Does the booking column stay beside the room right now?
 *
 * Read when a booking panel opens, to decide which column it opens in — and
 * only then: not watched, and not read again while a panel is open, so a
 * resized window never remounts a panel somebody is halfway through. No
 * `matchMedia` (an old browser, a test) is a phone.
 */
export function isBookingColumnSticky(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(STICKY_QUERY).matches
  );
}

/**
 * The height the sticky booking column may take: the window less the top bar
 * and the column's margin above and below (`public.css`: the bar, then
 * `--space-xl` twice).
 */
export function stickyColumnRoom(): number {
  const style = getComputedStyle(document.documentElement);
  const bar = parseFloat(style.getPropertyValue('--console-size-public-bar')) || 60;
  const gap = parseFloat(style.getPropertyValue('--space-xl')) || 24;
  return window.innerHeight - bar - 2 * gap;
}
