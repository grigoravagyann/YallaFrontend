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

/**
 * The zone the phone's clock reads now, for a time that belongs to no branch
 * — the end of the guest's pause on booking (guest record, 2026-10-20), said
 * on this clock everywhere: the bookings tab, Book, Confirm and the feed.
 * Read when asked, so after the polyfills it is the zone they adopted (the
 * same one the feed's own "13:37" uses); Yerevan where `Intl` cannot say.
 */
export function deviceTimeZone(): string {
  return readPlatformTimeZone() ?? 'Asia/Yerevan';
}

interface PolyfilledDateTimeFormat {
  __setDefaultTimeZone?: (timeZone: string) => void;
}

/**
 * `Etc/GMT-4` as the offset it stands for, `+04:00` (the `Etc` sign is
 * inverted); `null` for any other name.
 */
function etcOffset(zone: string): string | null {
  const match = /^Etc\/GMT([+-])(\d{1,2})$/u.exec(zone);
  if (!match) return null;
  const hours = match[2]!.padStart(2, '0');
  return `${match[1] === '-' ? '+' : '-'}${hours}:00`;
}

/** The device clock's offset right now, as `+04:00`. */
function currentOffset(): string {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * Make `zone` the default of the polyfilled `DateTimeFormat`. Does nothing on
 * a native `Intl` (it has no setter, and knows its zone) or for no zone.
 *
 * The bundled zone data is the "golden" set: no `Etc/` zones, and not every
 * rare name. A browser that names its zone by offset alone (the app's own
 * browser pane said `Etc/GMT-4` in Yerevan) gets that fixed offset; any other
 * name the data lacks gets the device clock's offset now — right until a
 * daylight-saving change, where UTC would be wrong all year. Whether it was set.
 */
export function adoptDefaultTimeZone(zone: string | null | undefined): boolean {
  const format = Intl.DateTimeFormat as unknown as PolyfilledDateTimeFormat;
  if (!zone || typeof format.__setDefaultTimeZone !== 'function') return false;
  const setDefault = format.__setDefaultTimeZone;
  for (const candidate of [zone, etcOffset(zone) ?? currentOffset()]) {
    try {
      setDefault(candidate);
      return true;
    } catch {
      // Not in the bundled data: try the offset.
    }
  }
  return false;
}
