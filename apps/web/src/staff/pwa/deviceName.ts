import type { StaffDeviceBrowser, StaffDevicePlatform } from '@yalla/api';

/** What a phone runs on and in, as the console words it in its reader's language. */
export interface DeviceParts {
  readonly platform: StaffDevicePlatform;
  readonly browser: StaffDeviceBrowser | null;
}

/**
 * What a paired phone says it is: its platform and browser. Nothing more — not
 * the model, not the version: a manager needs to tell two phones apart, not
 * fingerprint them.
 */
export function devicePartsFrom(userAgent: string, touchPoints = 0): DeviceParts {
  const platform: StaffDevicePlatform = /iPhone/u.test(userAgent)
    ? 'iphone'
    : /iPad/u.test(userAgent) || (/Macintosh/u.test(userAgent) && touchPoints > 1)
      ? 'ipad'
      : /Android/u.test(userAgent)
        ? 'android'
        : /Windows/u.test(userAgent)
          ? 'windows'
          : /Macintosh|Mac OS X/u.test(userAgent)
            ? 'mac'
            : /Linux/u.test(userAgent)
              ? 'linux'
              : 'other';

  // Order matters: every Chromium says "Safari", Edge and Opera say "Chrome",
  // and Chrome on iOS says "CriOS".
  const browser: StaffDeviceBrowser | null = /EdgA?\/|EdgiOS\//u.test(userAgent)
    ? 'edge'
    : /OPR\/|OPiOS\//u.test(userAgent)
      ? 'opera'
      : /SamsungBrowser\//u.test(userAgent)
        ? 'samsungInternet'
        : /Firefox\/|FxiOS\//u.test(userAgent)
          ? 'firefox'
          : /Chrome\/|CriOS\//u.test(userAgent)
            ? 'chrome'
            : /Safari\//u.test(userAgent)
              ? 'safari'
              : null;

  return { platform, browser };
}

const PLATFORM_NAMES: Readonly<Record<StaffDevicePlatform, string>> = {
  iphone: 'iPhone',
  ipad: 'iPad',
  android: 'Android',
  windows: 'Windows',
  mac: 'Mac',
  linux: 'Linux',
  other: 'Phone',
};

const BROWSER_NAMES: Readonly<Record<StaffDeviceBrowser, string>> = {
  safari: 'Safari',
  chrome: 'Chrome',
  edge: 'Edge',
  firefox: 'Firefox',
  opera: 'Opera',
  samsungInternet: 'Samsung Internet',
};

/**
 * The same in English, "iPhone · Safari", "Android · Chrome": the `deviceName`
 * the pairing still sends - what History keeps, and what a console from before
 * the parts shows. This console words the parts itself, in its reader's language.
 */
export function deviceNameFrom(userAgent: string, touchPoints = 0): string {
  const { platform, browser } = devicePartsFrom(userAgent, touchPoints);
  const name = PLATFORM_NAMES[platform];
  return browser ? `${name} · ${BROWSER_NAMES[browser]}` : name;
}

/** This browser: its English name and its parts, as the pairing sends them. */
export function thisDevice(): DeviceParts & { readonly name: string } {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const touchPoints = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints;
  return {
    ...devicePartsFrom(userAgent, touchPoints),
    name: deviceNameFrom(userAgent, touchPoints),
  };
}
