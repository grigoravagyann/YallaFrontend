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

/**
 * True in a development build only. Metro defines `__DEV__` as a global; it is
 * read through `globalThis` so a test can stub it, and a runtime without it
 * counts as a release build — the safe answer for what may be written to a
 * browser's storage.
 */
export function isDevBuild(): boolean {
  return (globalThis as { __DEV__?: unknown }).__DEV__ === true;
}
