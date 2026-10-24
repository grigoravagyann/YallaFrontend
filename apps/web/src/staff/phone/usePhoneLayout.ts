import { useSyncExternalStore } from 'react';

/** Narrower than 600px: a phone held upright, or any narrow window. */
export const NARROW_QUERY = '(max-width: 599.98px)';

/**
 * A touch screen at most 500px tall: a phone on its side — in a browser tab
 * or installed, standalone or not. A phone on its side is at most ~480px tall.
 */
export const SHORT_TOUCH_QUERY = '(pointer: coarse) and (max-height: 500px)';

/**
 * When `/staff` may wear the phone shell (staff phone spec, "Phone layout").
 * Either clause; the short one is then held to a phone-sized screen
 * (`isPhoneLayout`).
 *
 * **Not 600px tall.** A 7-inch floor tablet (1024×600dp, the cheap Android
 * ones counters run on) installed and held landscape is 600 less its status
 * and navigation bars, about 530px, and must keep the floor tablet's layout:
 * under a 600px rule it became a phone, and an unenrolled one was sent to
 * phone pairing instead of the tablet's code. In a browser tab the same
 * tablet is under 500px (the address bar), which is why the short clause also
 * asks the screen itself.
 *
 * `phone.css` reads the first clause verbatim, and `phone.test.tsx` holds the
 * two together.
 */
export const PHONE_QUERY = `${NARROW_QUERY}, ${SHORT_TOUCH_QUERY}`;

/**
 * A screen whose shorter side is under 600 CSS px is a phone's: every phone
 * is (~360–480), and no tablet is — a 7-inch one is 600, an iPad mini 744.
 * The screen does not turn with the device the way the window does (iOS keeps
 * it portrait, Android swaps width and height), so its shorter side is the
 * same upright and on its side: the decision does not flip on rotation.
 */
export const PHONE_SCREEN_SHORT_SIDE = 600;

function screenShortSide(): number {
  if (typeof window === 'undefined') return 0;
  const { screen } = window;
  // No screen reported (jsdom says 0×0): nothing to refuse the query with.
  if (!screen || !screen.width || !screen.height) return 0;
  return Math.min(screen.width, screen.height);
}

/**
 * The decision, given what the browser answers. Narrow is the phone shell
 * whatever the device; short is the phone shell only on a phone-sized touch
 * screen — a phone turned on its side in a normal browser tab stays the phone,
 * a 7-inch tablet in landscape stays the tablet.
 */
export function isPhoneLayout(
  matches: (query: string) => boolean,
  shortSide: number = screenShortSide(),
): boolean {
  if (!matches(PHONE_QUERY)) return false;
  if (matches(NARROW_QUERY)) return true;
  return shortSide < PHONE_SCREEN_SHORT_SIDE;
}

function listen(query: MediaQueryList, listener: () => void): () => void {
  // `addEventListener` on a MediaQueryList is missing from Safari before 14.
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }
  query.addListener(listener);
  return () => query.removeListener(listener);
}

function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  // Both: a short tablet window going narrow (split screen) changes the
  // narrow clause without changing the combined one.
  const stops = [PHONE_QUERY, NARROW_QUERY].map((query) =>
    listen(window.matchMedia(query), listener),
  );
  return () => stops.forEach((stop) => stop());
}

function snapshot(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    isPhoneLayout((query) => window.matchMedia(query).matches)
  );
}

/**
 * Whether the phone shell is on, followed live: a window resized, a tablet
 * split. A phone stays the phone upright and on its side, so turning it never
 * swaps the shell (and `FloorRoute` keeps its state across a swap in any case:
 * one component draws both). No `matchMedia` (an old browser, a test that
 * does not stub it) is the tablet, so the floor tablet's own tests see the
 * floor tablet.
 */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
