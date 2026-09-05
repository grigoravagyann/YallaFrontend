import {
  formatDram,
  formatDramAmount,
  formatRelativeMinutes,
  formatTime,
  minutesBetween,
  type TimeZone,
} from '@yalla/format';
import { useLocale } from '@yalla/i18n';
import { useMemo } from 'react';

/**
 * Times and money, bound to the branch's clock and the reader's language.
 *
 * The rule this exists to enforce structurally rather than by convention: the
 * branch timezone is passed explicitly, always. A tablet that has been carried
 * in from another city, or one whose clock nobody has ever set, must still
 * render 20:00 as the venue's 20:00 — the booking is at the venue's time and the
 * device's opinion is irrelevant. Threading `timeZoneId` through every call site
 * is how that gets forgotten, so it is captured once here.
 *
 * `formatDram` rejects fractional input. If it ever throws on this screen it
 * means a client did arithmetic on money, which is the server's job; the crash
 * is the intended outcome rather than a rounded number nobody can reconcile.
 */
export interface BranchFormat {
  readonly time: (value: string | Date | number) => string;
  readonly dram: (amount: number) => string;
  /** Digits with no currency sign, for a keypad's own display. */
  readonly dramAmount: (amount: number) => string;
  /** "12 minutes ago" from a UTC instant. */
  readonly since: (utc: string | Date | number) => string;
  /** Whole minutes since a UTC instant. Negative means it is still ahead. */
  readonly minutesSince: (utc: string | Date | number) => number;
}

export function useBranchFormat(timeZoneId: TimeZone): BranchFormat {
  const { locale } = useLocale();

  return useMemo(
    () => ({
      time: (value) => formatTime(value, timeZoneId, locale),
      dram: (amount) => formatDram(amount, locale),
      dramAmount: (amount) => formatDramAmount(amount, locale),
      since: (utc) => formatRelativeMinutes(-minutesBetween(utc, new Date()), locale),
      minutesSince: (utc) => minutesBetween(utc, new Date()),
    }),
    [timeZoneId, locale],
  );
}
