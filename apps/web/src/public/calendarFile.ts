import type { Booking } from '@yalla/api';
import { formatTime, icsEvent, icsFileName, type Locale } from '@yalla/format';

/**
 * Turn a booking into a calendar file and hand it to the browser.
 *
 * This is the first thing offered on the confirmation screen, ahead of the app
 * and ahead of the manage link, and the ordering is the argument. A web visitor
 * has **no push channel**: no reminder before their table, no "still coming?"
 * nudge, no one-tap cancel. Everything Yalla does about no-shows reaches them
 * through nothing. An `.ics` reaches every one of them, needs no account, no
 * permission prompt and no install, and puts the reminder in the place they
 * already look — their own calendar.
 *
 * The file's times are written in the *branch's* zone by `icsEvent`; see that
 * module for why that is not the same as being correct in UTC.
 */

export interface CalendarInput {
  readonly booking: Booking;
  readonly addressLine: string;
  /** The signed manage-booking URL, so the event carries its own way out. */
  readonly manageUrl: string;
  readonly locale: Locale;
  /** Already-translated copy; this module holds no strings. */
  readonly summary: string;
  readonly descriptionLines: readonly string[];
}

export function bookingIcs(input: CalendarInput): string {
  const { booking, addressLine, manageUrl, summary, descriptionLines } = input;

  const start = new Date(booking.slotUtc);
  /*
   * The end is the window the diner was actually promised, falling back to the
   * branch's turn time. Not an arbitrary hour: a calendar entry that ends at
   * 21:00 when the table is theirs until 21:45 quietly tells them to leave
   * early, and one that runs to midnight blocks their evening.
   */
  const end = booking.window.untilUtc
    ? new Date(booking.window.untilUtc)
    : new Date(start.getTime() + 105 * 60_000);

  return icsEvent({
    // Stable per booking, so downloading twice replaces rather than duplicates.
    uid: `yalla-${booking.id}@yalla.am`,
    startUtc: start,
    endUtc: end,
    timeZoneId: booking.timeZoneId,
    summary,
    location: `${booking.venueName}, ${addressLine}`,
    description: descriptionLines.join('\n'),
    url: manageUrl,
  });
}

/**
 * The lines that go in the event body.
 *
 * Assembled by the caller from translated copy and handed in, so this module
 * stays free of i18n — but the *shape* is fixed here because it is the same on
 * every language: what was booked, the code staff will ask for, when it can
 * still be cancelled for free, and the link that does it.
 */
export function icsDescription(input: {
  readonly booking: Booking;
  readonly locale: Locale;
  readonly codeLabel: string;
  readonly cancellationLine: string;
  readonly manageLabel: string;
  readonly manageUrl: string;
}): readonly string[] {
  const { booking, locale, codeLabel, cancellationLine, manageLabel, manageUrl } = input;
  return [
    `${codeLabel}: ${booking.code}`,
    `${booking.tableLabel} · ${formatTime(booking.slotUtc, booking.timeZoneId, locale)}`,
    cancellationLine,
    `${manageLabel}: ${manageUrl}`,
  ];
}

/**
 * Save the file.
 *
 * An object URL rather than a `data:` URI: Safari on iOS truncates long
 * `data:` links and a description with a URL in it gets long quickly. The URL
 * is revoked on the next frame — immediately after `click()` is too early for
 * Firefox, which has not started reading it yet.
 */
export function downloadIcs(content: string, venueName: string, locale: Locale): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = icsFileName(venueName, locale);
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}
