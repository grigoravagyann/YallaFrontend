/**
 * "Chrome · Windows" for the sign-in that is this browser, from its own user
 * agent — the one row of "Where you're signed in" the console can describe
 * honestly, because it is the one it is running in. The server records no
 * device for any sign-in, so the others are never described.
 *
 * `null` when neither half is recognised; the screen then says "This browser".
 */
export function describeBrowser(userAgent: string): string | null {
  const browser = /\bEdg\//u.test(userAgent)
    ? 'Edge'
    : /\bOPR\//u.test(userAgent)
      ? 'Opera'
      : /\bFirefox\//u.test(userAgent)
        ? 'Firefox'
        : // "HeadlessChrome/" too: no word boundary before its "Chrome".
          /(?:Chrome|CriOS)\//u.test(userAgent)
          ? 'Chrome'
          : /\bSafari\//u.test(userAgent)
            ? 'Safari'
            : null;
  const system = /\b(?:iPhone|iPad|iPod)\b/u.test(userAgent)
    ? 'iOS'
    : /\bAndroid\b/u.test(userAgent)
      ? 'Android'
      : /\bWindows\b/u.test(userAgent)
        ? 'Windows'
        : /\bMac OS X\b/u.test(userAgent)
          ? 'macOS'
          : /\bLinux\b/u.test(userAgent)
            ? 'Linux'
            : null;
  if (!browser && !system) return null;
  return [browser, system].filter(Boolean).join(' · ');
}
