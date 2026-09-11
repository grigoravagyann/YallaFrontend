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
  type ReservationStatusCode,
  type ScannedCode,
} from '@yalla/api';
import { branchDayKey, formatDate, formatTime } from '@yalla/format';

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
  /**
   * What counts as "today" when deciding whether a refusal needs a date.
   *
   * Defaults to the moment the refusal is read, which is the only honest
   * reading of it outside a test. Tests pin it, because a sentence that depends
   * on the calendar would otherwise pass in September and fail in October.
   */
  readonly now?: Date | undefined;
}

/**
 * Which sentence a not-live booking gets.
 *
 * `bookingStatus` is carried from the wire for exactly this: "the venue has not
 * confirmed yet", "you cancelled this" and "the venue cancelled this" are three
 * different pieces of news, and one line covering all of them sends a diner to
 * find a member of staff in the one case where there is nothing to find yet.
 *
 * Partial on purpose. `confirmed` and `seated` never arrive here, `completed`
 * arrives as a booking that has ended, and `unknown` is the state an older
 * build gives a state added after it shipped — all of them fall through to the
 * general sentence below.
 */
const NOT_ACTIVE_KEYS: Partial<Record<ReservationStatusCode, string>> = {
  pendingApproval: 'scan.error.bookingPending',
  cancelledByDiner: 'scan.error.bookingCancelledByYou',
  cancelledByVenue: 'scan.error.bookingCancelledByVenue',
  noShow: 'scan.error.bookingNoShow',
};

export function scanFailureFor(error: unknown, at?: BranchClock): ScanFailure {
  // A booking code is not a table code, and none of these may ever come back
  // as "that code does not match a table" — the answer that sent a diner
  // holding a booking for table 5 round in circles.
  if (error instanceof BookingNotFoundError) {
    return { key: 'scan.error.bookingNotFound' };
  }
  if (error instanceof BookingTooEarlyError) {
    if (at && error.earliestUtc) {
      const time = formatTime(error.earliestUtc, at.timeZoneId, at.locale);
      // "From 19:10" can only mean tonight, and the button that produces this
      // refusal is offered on a booking any number of days out — it is not
      // narrowed to a window before the start, because only the server knows
      // when the branch starts holding the table. So a booking that is not
      // today says which day it is. Both days are read on the *branch's*
      // calendar: near midnight the phone's own can be the other one.
      const sameDay =
        branchDayKey(error.earliestUtc, at.timeZoneId) ===
        branchDayKey(at.now ?? new Date(), at.timeZoneId);

      return sameDay
        ? { key: 'scan.error.bookingTooEarly', params: { time } }
        : {
            key: 'scan.error.bookingTooEarlyOnDay',
            params: { date: formatDate(error.earliestUtc, at.timeZoneId, at.locale), time },
          };
    }
    return { key: 'scan.error.bookingTooEarlyNoTime' };
  }
  if (error instanceof BookingEndedError) {
    return { key: 'scan.error.bookingEnded' };
  }
  if (error instanceof BookingNotActiveError) {
    const known = error.bookingStatus ? NOT_ACTIVE_KEYS[error.bookingStatus] : undefined;
    return { key: known ?? 'scan.error.bookingNotActive' };
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

/**
 * Whether a code can be sent as things stand, or needs a session first.
 *
 * A booking is the one code here with an account behind it — only the account
 * that made it may open its table — so it is the single door that asks who you
 * are. Everything else goes through untouched: the scan screen promises "no
 * sign-up and no phone number", and that promise is the flow.
 *
 * Its own function, and returning the answer rather than acting on it, because
 * the wrong response to "this needs a session" is to *take* the diner to an SMS
 * screen. Six characters of the code alphabet is also what a mistyped table
 * code looks like, and a typo must not navigate anybody anywhere. The screen
 * shows the offer and the diner decides.
 */
export type CodeGate =
  { readonly kind: 'send' } | { readonly kind: 'signIn'; readonly failure: ScanFailure };

export function gateFor(code: ScannedCode, signedIn: boolean): CodeGate {
  if (code.kind === 'booking' && !signedIn) {
    return { kind: 'signIn', failure: { key: 'scan.error.signInNeeded' } };
  }
  return { kind: 'send' };
}
