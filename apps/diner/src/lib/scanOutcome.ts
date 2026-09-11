import {
  BookingEndedError,
  BookingNotActiveError,
  BookingNotFoundError,
  BookingTooEarlyError,
  BranchUnavailableError,
  InviteExpiredError,
  NetworkError,
  TabClosedError,
  TableOutOfServiceError,
  TabsNotEnabledError,
  TimeoutError,
  UnknownTableCodeError,
} from '@yalla/api';
import { formatTime } from '@yalla/format';

/**
 * Turn a failed scan into the one thing the screen needs: a translation key and
 * its parameters.
 *
 * Shared by the scan screen and the deep-link join screen so a code that fails
 * says the same thing whichever door it came through. Returning a key rather
 * than a string keeps the mapping testable and keeps `t` at the render site,
 * which is where the language actually is.
 */
export interface ScanFailure {
  readonly key: string;
  readonly params?: Record<string, string>;
}

/**
 * Where, and in whose language, a refusal's times are read.
 *
 * The types come from `formatTime` itself rather than being re-declared, so a
 * change to what it accepts is a compile error here rather than a wrong time on
 * a screen.
 *
 * Optional throughout, because the two screens differ: the booking screen has
 * the branch in hand, and the scan screen — where somebody types a code with no
 * booking loaded — has nothing. A time is never rendered in the phone's own
 * zone as a fallback; the sentence drops it instead. A diner who flew in this
 * morning must not be told the wrong hour for their own table.
 */
export interface BranchClock {
  readonly timeZoneId: Parameters<typeof formatTime>[1];
  readonly locale: Parameters<typeof formatTime>[2];
}

export function scanFailureFor(error: unknown, at?: BranchClock): ScanFailure {
  // A booking code is not a table code, and none of these may ever come back
  // as "that code does not match a table" — the answer that sent a diner
  // holding a booking for table 5 round in circles.
  if (error instanceof BookingNotFoundError) {
    return { key: 'scan.error.bookingNotFound' };
  }
  if (error instanceof BookingTooEarlyError) {
    if (at && error.earliestUtc) {
      return {
        key: 'scan.error.bookingTooEarly',
        params: { time: formatTime(error.earliestUtc, at.timeZoneId, at.locale) },
      };
    }
    return { key: 'scan.error.bookingTooEarlyNoTime' };
  }
  if (error instanceof BookingEndedError) {
    return { key: 'scan.error.bookingEnded' };
  }
  if (error instanceof BookingNotActiveError) {
    return { key: 'scan.error.bookingNotActive' };
  }
  if (error instanceof TableOutOfServiceError) {
    return { key: 'scan.error.outOfService', params: { label: error.tableLabel } };
  }
  if (error instanceof UnknownTableCodeError) {
    return { key: 'scan.error.unknownCode' };
  }
  if (error instanceof TabClosedError) {
    return { key: 'scan.error.tabClosed' };
  }
  // A branch on a plan without tabs: the answer is a waiter, not another scan.
  if (error instanceof TabsNotEnabledError) {
    return { key: 'scan.error.notEnabled' };
  }
  if (error instanceof BranchUnavailableError) {
    return { key: 'scan.error.branchUnavailable' };
  }
  // The host can make a new invitation in a tap.
  if (error instanceof InviteExpiredError) {
    return { key: 'join.error.expired' };
  }
  if (error instanceof NetworkError) {
    // Worth its own message: nothing reached the server, so scanning again is safe.
    return { key: 'scan.error.network' };
  }
  if (error instanceof TimeoutError) {
    // It may have gone through. Scanning again replays the same command, so it
    // cannot open a second tab — and that is what the copy says.
    return { key: 'scan.error.uncertain' };
  }
  return { key: 'scan.error.generic' };
}

/**
 * Whether a failed scan's command id can be dropped.
 *
 * Only when the server definitely refused it. After a timeout the scan may have
 * opened a tab, and retrying with the same id is what gets that tab back rather
 * than opening a second one.
 */
export function scanWasRefused(error: unknown): boolean {
  return !(error instanceof TimeoutError);
}
