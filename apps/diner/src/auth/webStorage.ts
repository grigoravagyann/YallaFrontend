/**
 * `localStorage`, if this browser offers it.
 *
 * The accessor itself throws in a private window or under a site-data block,
 * so it is read inside a try. `null` means "nothing is remembered here",
 * which the callers treat as a signed-out, empty-profile launch.
 */
export function webStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
