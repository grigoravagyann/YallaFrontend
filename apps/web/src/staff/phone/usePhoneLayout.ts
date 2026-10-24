import { useSyncExternalStore } from 'react';

/**
 * When `/staff` wears the phone shell (staff phone spec, "Phone layout").
 *
 * - **Narrower than 600px**: a phone held upright, in the browser or installed.
 * - **Installed and short** (`display-mode: standalone`, under 500px tall,
 *   a coarse pointer): the same phone turned on its side, launched from the
 *   home screen. A phone on its side is at most ~480px tall.
 *
 * **Not 600px tall.** A 7-inch floor tablet (1024×600dp, the cheap Android
 * ones counters run on) installed and held landscape is 600 less its status
 * and navigation bars, about 530px, and must keep the floor tablet's layout:
 * under a 600px rule it became a phone, and an unenrolled one was sent to
 * phone pairing instead of the tablet's code.
 *
 * At 600px and wider, in a browser, the floor tablet's layout is untouched.
 * `phone.css` reads the first condition verbatim, and `phone.test.tsx`
 * holds the two together.
 */
export const PHONE_QUERY =
  '(max-width: 599.98px), (display-mode: standalone) and (max-height: 499.98px) and (pointer: coarse)';

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const query = window.matchMedia(PHONE_QUERY);
  // `addEventListener` on a MediaQueryList is missing from Safari before 14.
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }
  query.addListener(listener);
  return () => query.removeListener(listener);
}

function snapshot(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(PHONE_QUERY).matches
  );
}

/**
 * Whether the phone shell is on, followed live: a phone turned, a window
 * resized. No `matchMedia` (an old browser, a test that does not stub it) is
 * the tablet, so the floor tablet's own tests see the floor tablet.
 */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
