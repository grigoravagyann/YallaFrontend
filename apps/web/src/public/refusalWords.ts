import {
  overlapIsElsewhere,
  overlapPlace,
  type BookingFailure,
  type BookingOverlapsOwnError,
  type BookingPlace,
} from '@yalla/api';
import { branchDayKey, formatTime, type Locale, type TimeZone } from '@yalla/format';
import type { TFunction } from 'i18next';
import { dayWords } from './dayNames';
import { branchToday } from './slots';

/**
 * The guest record's refusals (2026-10-20), in the page's own day words.
 *
 * `bookingFailure` words them too, but with `Intl`'s dates, which a browser
 * without Armenian data writes in English («…մինչև 28 Oct 2026…»). The Book
 * sheet and the manage link's change say the same sentences — the app's copy —
 * with the day as the booking card writes it: "Thu 22 October",
 * «հնգ, 22 հոկտեմբերի».
 */

const BRANCH_DAY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * At most three active bookings per proved number, and the week's block after
 * three no-shows: the sentence, or `null` for any other refusal.
 *
 * - Three held: the caller's next booking named (venue, day, time) so they know
 *   which to cancel; how many alone when the server named none.
 * - Blocked: until when, on the branch's clock; a week when it did not say.
 */
export function numberRuleWords(
  failure: BookingFailure,
  timeZoneId: TimeZone,
  locale: Locale,
  t: TFunction,
): string | null {
  if (failure.kind === 'phoneHasActiveBooking') {
    const { held, maxActiveBookings: max } = failure.error;
    if (!held || !BRANCH_DAY.test(held.localDate)) {
      return t(failure.line.key, { ns: 'diner', ...failure.line.params });
    }
    return t('confirm.error.maxActiveBookingsNext', {
      ns: 'diner',
      max,
      venue: held.venueName || held.branchName,
      date: dayWords(held.localDate, branchToday(timeZoneId), t).inSentence,
      time: held.localStartTime,
    });
  }
  if (failure.kind === 'blockedNoShows') {
    const until = failure.error.blockedUntilUtc;
    if (!until) return t('confirm.error.blockedNoShowsPlain', { ns: 'diner' });
    return t('confirm.error.blockedNoShows', {
      ns: 'diner',
      date: dayWords(branchDayKey(until, timeZoneId), branchToday(timeZoneId), t).inSentence,
      time: formatTime(until, timeZoneId, locale),
    });
  }
  return null;
}

/**
 * An overlap with the visitor's own booking at **another** venue or branch —
 * the two sittings need half an hour between them — named: "…at Café Aram at
 * 19:30, too close to this time", with its day when that is not the day of
 * `slotUtc`. `null` for an overlap here, which each screen says its own way.
 */
export function overlapElsewhereWords(
  error: BookingOverlapsOwnError,
  here: BookingPlace,
  slotUtc: string,
  timeZoneId: TimeZone,
  t: TFunction,
): string | null {
  const time = error.localStartTime;
  if (!time || !overlapIsElsewhere(error, here)) return null;
  const venue = overlapPlace(error, here);
  const date = otherBranchDay(error.localDate, slotUtc, timeZoneId, t);
  return date
    ? t('confirm.error.overlapsOwnElsewhereOn', { ns: 'diner', venue, date, time })
    : t('confirm.error.overlapsOwnElsewhere', { ns: 'diner', venue, time });
}

/**
 * "Tue 20 October" for a branch day (`YYYY-MM-DD`) that is not the day of
 * `slotUtc` on the branch's calendar; `null` for the same day, or none given.
 * Our own words, as the rest of the sheet's dates (`dayNames.ts`).
 */
export function otherBranchDay(
  localDate: string | null,
  slotUtc: string,
  timeZoneId: TimeZone,
  t: TFunction,
): string | null {
  if (!localDate || !BRANCH_DAY.test(localDate)) return null;
  const today = branchToday(timeZoneId);
  if (localDate === branchToday(timeZoneId, new Date(slotUtc))) return null;
  return dayWords(localDate, today, t).inSentence;
}
