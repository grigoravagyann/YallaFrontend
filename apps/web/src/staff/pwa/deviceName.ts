/**
 * What a paired phone calls itself on the console's Phones tab: its platform
 * and browser, "iPhone · Safari", "Android · Chrome". Nothing more — not the
 * model, not the version: a manager needs to tell two phones apart, not
 * fingerprint them.
 */
export function deviceNameFrom(userAgent: string, touchPoints = 0): string {
  const platform = /iPhone/u.test(userAgent)
    ? 'iPhone'
    : /iPad/u.test(userAgent) || (/Macintosh/u.test(userAgent) && touchPoints > 1)
      ? 'iPad'
      : /Android/u.test(userAgent)
        ? 'Android'
        : /Windows/u.test(userAgent)
          ? 'Windows'
          : /Macintosh|Mac OS X/u.test(userAgent)
            ? 'Mac'
            : /Linux/u.test(userAgent)
              ? 'Linux'
              : 'Phone';

  // Order matters: every Chromium says "Safari", Edge and Opera say "Chrome",
  // and Chrome on iOS says "CriOS".
  const browser = /EdgA?\/|EdgiOS\//u.test(userAgent)
    ? 'Edge'
    : /OPR\/|OPiOS\//u.test(userAgent)
      ? 'Opera'
      : /SamsungBrowser\//u.test(userAgent)
        ? 'Samsung Internet'
        : /Firefox\/|FxiOS\//u.test(userAgent)
          ? 'Firefox'
          : /Chrome\/|CriOS\//u.test(userAgent)
            ? 'Chrome'
            : /Safari\//u.test(userAgent)
              ? 'Safari'
              : null;

  return browser ? `${platform} · ${browser}` : platform;
}

export function thisDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Phone';
  return deviceNameFrom(navigator.userAgent, navigator.maxTouchPoints);
}
