/**
 * The device's own time zone, kept across the @formatjs `Intl` polyfills.
 *
 * The polyfilled `DateTimeFormat` defaults to UTC: it cannot ask the platform
 * which zone it is in. Every time on the diner's own clock — the notification
 * feed's "13:37", a "Today" boundary — then read UTC; QA on 2026-10-18 saw
 * 13:37 at 17:37 in Yerevan. Branch times are unaffected: they always name the
 * branch's zone.
 *
 * This module is imported before the polyfills, so `platformTimeZone` is the
 * platform `Intl`'s answer, read before anything replaces it; the polyfill
 * files then hand the zone to the polyfill with {@link adoptDefaultTimeZone}.
 */

function readPlatformTimeZone(): string | undefined {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone.length > 0 ? zone : undefined;
  } catch {
    return undefined;
  }
}

/** The platform `Intl`'s own zone, or `undefined` where it cannot say. */
export const platformTimeZone: string | undefined = readPlatformTimeZone();

interface PolyfilledDateTimeFormat {
  __setDefaultTimeZone?: (timeZone: string) => void;
}

/**
 * Make `zone` the default of the polyfilled `DateTimeFormat`. Does nothing on
 * a native `Intl` (it has no setter, and knows its zone), for no zone, or for
 * one the polyfill's zone data does not have — UTC is then the honest default.
 * Whether it was set.
 */
export function adoptDefaultTimeZone(zone: string | null | undefined): boolean {
  const format = Intl.DateTimeFormat as unknown as PolyfilledDateTimeFormat;
  if (!zone || typeof format.__setDefaultTimeZone !== 'function') return false;
  try {
    format.__setDefaultTimeZone(zone);
    return true;
  } catch {
    return false;
  }
}
