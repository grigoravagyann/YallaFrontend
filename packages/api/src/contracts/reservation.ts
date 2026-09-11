import { branchDayKey, formatDate, formatTime, type Locale, type TimeZone } from '@yalla/format';
import { isKnownUnavailableReason } from './booking';
import type { AvailabilityWindowDto, TableAvailability, TableUnavailableReason } from './booking';
import {
  BookingBusyError,
  BookingCommandInUseError,
  BookingRejectedError,
  BranchUnavailableError,
  ExpiredCodeError,
  LeadTimeExceededError,
  RateLimitedError,
  TableTakenError,
  TooManyAttemptsError,
  WrongCodeError,
} from './errors';
import { NetworkError, ServerError, TimeoutError } from '../errors';

/**
 * The reservation flow's rules, in one place, for both surfaces that run it.
 *
 * The phone app and the public web page put the same question to a person —
 * how long is this table yours, when can you still cancel for free, why was
 * that code refused — and until this module existed they answered it twice:
 * the window block was written out in `TableSheet` and again in the confirm
 * screen, and the failure mapping was inline in each. Two copies of a rule
 * about *what someone is promised* is how a diner is told they have the table
 * until 21:45 on one screen and nothing at all on the next.
 *
 * ## Copy descriptors, not strings
 *
 * Nothing here renders text. Each function returns a {@link CopyLine} — a key
 * and its interpolation values — which the caller hands to `t()`. That keeps
 * this package free of `react-i18next` (it has no React dependency and should
 * not gain one), keeps every rule testable without a translation bundle, and
 * means the two surfaces necessarily show the *same sentence*, because they
 * resolve the same key against the same bundle.
 *
 * Every key below lives in the **`diner`** namespace. The web page loads that
 * namespace for exactly this reason: a second, "web" copy of `table.heldForYou`
 * would drift within a release, and it would have to be translated twice.
 */
export interface CopyLine {
  /** Dotted key within the `diner` namespace. */
  readonly key: string;
  /**
   * Interpolation values, always present — empty for a key that takes none.
   *
   * Not optional, and the reason is `exactOptionalPropertyTypes`: with it on,
   * `t(line.key, line.params)` does not typecheck when `params` may be
   * `undefined`, and every caller ends up writing `?? {}`. One default here
   * beats the same fallback repeated at a dozen render sites.
   */
  readonly params: Readonly<Record<string, string | number>>;
}

function line(key: string, params: Readonly<Record<string, string | number>> = {}): CopyLine {
  return { key, params };
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

/**
 * Round an instant up to the next half hour — the sensible default slot.
 *
 * Arithmetic in UTC on purpose. Every zone Yalla serves is offset by a whole
 * number of half-hours, so "the next :00 or :30" is the same instant whichever
 * side you compute it from; doing it with local getters would additionally make
 * the answer depend on the *device's* zone, which is the one zone that must
 * never influence a booking.
 */
export function nextHalfHour(from: Date): Date {
  const next = new Date(from);
  next.setUTCSeconds(0, 0);
  const minutes = next.getUTCMinutes();
  next.setUTCMinutes(minutes < 30 ? 30 : 60);
  return next;
}

// ---------------------------------------------------------------------------
// The availability window
// ---------------------------------------------------------------------------

/**
 * The window block, in the order it must be read.
 *
 * `primary` is never null, and that is the point. A table with nothing booked
 * after it does not get a blank space where the limit would be — it gets
 * "no booking after yours", which is an *advantage* and a reason to choose this
 * table over the one that frees up at 21:45. Rendering the absence as absence
 * throws away the comparison the diner is actually making.
 */
export interface AvailabilityWindowCopy {
  readonly primary: CopyLine;
  /** When the next booking starts. Null when there is not one. */
  readonly nextBooking: CopyLine | null;
  /** Present when the window is shorter than a usual sitting here. */
  readonly shortWindow: CopyLine | null;
  /** True when there is a limit at all — the caller may style the two differently. */
  readonly isBounded: boolean;
}

/**
 * What to say about how long a table is theirs.
 *
 * Shown **before** any confirm button, on every surface, because this product
 * does not ask people how long they intend to stay — the limit is told, so
 * somebody who needs longer can pick a different table instead of negotiating
 * at the door.
 *
 * @param timeZoneId The *branch* zone. Never the device's: a tourist's phone is
 * on Europe/Moscow and their table is not.
 */
export function availabilityWindowCopy(
  window: AvailabilityWindowDto | null,
  timeZoneId: TimeZone,
  locale: Locale,
): AvailabilityWindowCopy {
  if (!window || !window.untilUtc) {
    return {
      primary: line('table.noBookingAfter'),
      nextBooking: null,
      shortWindow: null,
      isBounded: false,
    };
  }

  const range = `${formatTime(window.fromUtc, timeZoneId, locale)} – ${formatTime(
    window.untilUtc,
    timeZoneId,
    locale,
  )}`;

  return {
    primary: line('table.heldForYou', { range }),
    nextBooking: window.nextBookingStartUtc
      ? line('table.nextBooking', {
          time: formatTime(window.nextBookingStartUtc, timeZoneId, locale),
        })
      : null,
    // Computed by the backend, not re-derived here: the client and the venue
    // must not be able to disagree about what counts as a short sitting.
    shortWindow: window.isShorterThanTurnTime ? line('table.shortWindow') : null,
    isBounded: true,
  };
}

/**
 * The free-cancellation deadline, as one line.
 *
 * The other half of the promise, and the reason cancelling stays easier than
 * not turning up. Same key on the sheet, the confirm screen, the confirmation
 * and the manage-booking page, so the deadline a person was quoted is the
 * deadline they are held to.
 *
 * The **server's** deadline — `cancellationDeadlineUtc` — and with the date
 * whenever it is not today in the branch's zone: "until 17:30" for a booking
 * nine days out reads as this afternoon. Once it has passed the line says so,
 * rather than quoting a time that is already behind them.
 */
export function freeCancellationCopy(
  freeCancellationUntilUtc: string,
  timeZoneId: TimeZone,
  locale: Locale,
  now: Date = new Date(),
): CopyLine {
  const deadline = new Date(freeCancellationUntilUtc);
  if (deadline.getTime() <= now.getTime()) return line('table.freeCancellationPassed');

  const time = formatTime(deadline, timeZoneId, locale);
  if (branchDayKey(deadline, timeZoneId) === branchDayKey(now, timeZoneId)) {
    return line('table.freeCancellation', { time });
  }
  return line('table.freeCancellationOn', {
    date: formatDate(deadline, timeZoneId, locale),
    time,
  });
}

/** The "a party this size needs the venue to confirm" line, or nothing. */
export function approvalCopy(requiresApproval: boolean): CopyLine | null {
  return requiresApproval ? line('table.needsApproval') : null;
}

/**
 * Why this table cannot be picked.
 *
 * One key per reason, never a generic refusal, because each has a different
 * next step: "someone is sitting here" means pick another table, "too soon to
 * book" means pick another time, and collapsing them is how a diner retries the
 * thing that cannot work.
 */
export function unavailableCopy(
  reason: TableUnavailableReason | null,
  partySize: number,
): CopyLine {
  if (reason == null) return line('table.unavailable.notBookable', { count: partySize });

  /*
   * A reason this build has no copy for is still the server's answer, and it is
   * shown as such rather than swapped for one we do have words for. The
   * alternative — falling back to a familiar reason — is not a smaller error: a
   * diner asking about Saturday would be told somebody is sitting at the table
   * right now, which sends them to look at an empty table and is worse than an
   * unpolished sentence.
   */
  if (!isKnownUnavailableReason(reason)) {
    return line('table.unavailable.other', { count: partySize, reason });
  }

  return line(`table.unavailable.${reason}`, { count: partySize });
}

/**
 * Everything a surface says about one table, assembled once.
 *
 * The sheet on the phone and the panel on the web page differ in layout and in
 * nothing else, so they take this whole object rather than each calling the
 * four functions above in their own order.
 */
export interface TableCopy {
  readonly title: CopyLine;
  readonly seats: CopyLine;
  /** The action's own label, which names the table: "Reserve table 7". */
  readonly reserve: CopyLine;
  readonly window: AvailabilityWindowCopy | null;
  readonly freeCancellation: CopyLine | null;
  readonly approval: CopyLine | null;
  /** Present exactly when the table is not bookable; then everything above is null. */
  readonly unavailable: CopyLine | null;
}

export function tableCopy(
  availability: TableAvailability,
  input: {
    readonly partySize: number;
    readonly timeZoneId: TimeZone;
    readonly locale: Locale;
    readonly now?: Date | undefined;
  },
): TableCopy {
  const { partySize, timeZoneId, locale } = input;

  const title: CopyLine = availability.floorAreaName
    ? line('table.titleWithArea', {
        label: availability.tableLabel,
        area: availability.floorAreaName,
      })
    : line('table.title', { label: availability.tableLabel });

  const seats: CopyLine = line('table.seats', { count: availability.seats });
  const reserve: CopyLine = line('table.reserve', { label: availability.tableLabel });

  if (!availability.isBookable) {
    return {
      title,
      seats,
      reserve,
      window: null,
      freeCancellation: null,
      approval: null,
      unavailable: unavailableCopy(availability.unavailableReason, partySize),
    };
  }

  return {
    title,
    seats,
    reserve,
    window: availabilityWindowCopy(availability.window, timeZoneId, locale),
    // Nothing is promised when the server stated no deadline.
    freeCancellation: availability.freeCancellationUntilUtc
      ? freeCancellationCopy(availability.freeCancellationUntilUtc, timeZoneId, locale, input.now)
      : null,
    approval: approvalCopy(availability.requiresApproval),
    unavailable: null,
  };
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

/**
 * Which code-entry failure happened, as its own message.
 *
 * Never one generic error. "That code has expired" and "too many tries" lead to
 * the same button and a completely different expectation of whether pressing it
 * will help.
 *
 * `rateLimited` names a wall-clock time, and there is no branch in scope when a
 * code is refused — the person has not chosen a venue's timezone, they have
 * typed a phone number — so it renders in Yerevan, which is where the SMS
 * gateway and every venue are.
 */
export function verificationFailureCopy(error: unknown, locale: Locale): CopyLine {
  if (error instanceof WrongCodeError) {
    // No number the server did not send, and no "0 attempts left": zero means
    // the code is spent and the next step is a new one.
    if (error.attemptsRemaining === null) return line('verify.error.wrongCodeNoCount');
    if (error.attemptsRemaining <= 0) return line('verify.error.codeSpent');
    return line('verify.error.wrongCode', { count: error.attemptsRemaining });
  }
  if (error instanceof ExpiredCodeError) return line('verify.error.expired');
  if (error instanceof TooManyAttemptsError) return line('verify.error.tooManyAttempts');
  if (error instanceof RateLimitedError) {
    // Only a time the server gave. The per-number window is an hour; naming
    // "one minute from now" sent people back into the same refusal.
    return error.retryAtUtc
      ? line('verify.error.rateLimited', {
          time: formatTime(error.retryAtUtc, 'Asia/Yerevan', locale),
        })
      : line('verify.error.rateLimitedNoTime');
  }
  if (error instanceof NetworkError) return line('verify.error.network');
  return line('verify.error.generic');
}

/**
 * What a failed confirm was.
 *
 * A discriminated union rather than a message, because two of these are not
 * error states at all and the caller has to *act* on them differently:
 *
 * - `tableTaken` carries a refreshed floor. The caller pushes it into the cache
 *   and sends the person back to the room; it never retries, because the answer
 *   will not change.
 * - `leadTime` means nothing they chose was wrong — time simply passed — and
 *   the message names the earliest slot that still works.
 * - `rejected` is a rule — shut then, too many people for the table — and says
 *   the table sheet's own sentence for it.
 * - `busy` is the one refusal a retry is for: the table was locked by another
 *   booking in flight. Same command id, tap again.
 * - `unknown` is the one where it matters most **not** to say "nothing was
 *   booked". A timeout, a dropped connection or a server error may have come
 *   after the booking committed; the honest answer is that we cannot tell, and
 *   the next step — checking again with the same command id — cannot book twice.
 */
export type BookingFailure =
  | { readonly kind: 'tableTaken'; readonly line: CopyLine; readonly error: TableTakenError }
  | { readonly kind: 'leadTime'; readonly line: CopyLine }
  | { readonly kind: 'rejected'; readonly line: CopyLine }
  | { readonly kind: 'busy'; readonly line: CopyLine }
  | { readonly kind: 'commandInUse'; readonly line: CopyLine }
  | { readonly kind: 'branchUnavailable'; readonly line: CopyLine }
  | { readonly kind: 'unknown'; readonly line: CopyLine }
  | { readonly kind: 'generic'; readonly line: CopyLine };

export function bookingFailure(
  error: unknown,
  timeZoneId: TimeZone,
  locale: Locale,
): BookingFailure {
  if (error instanceof TableTakenError) {
    return {
      kind: 'tableTaken',
      line: line(
        error.reason === 'occupied' ? 'confirm.error.tableOccupied' : 'confirm.error.tableTaken',
        { label: error.tableLabel },
      ),
      error,
    };
  }
  if (error instanceof LeadTimeExceededError) {
    return {
      kind: 'leadTime',
      line: error.earliestSlotUtc
        ? line('confirm.error.leadTime', {
            time: formatTime(error.earliestSlotUtc, timeZoneId, locale),
          })
        : line('table.unavailable.pastLeadTime'),
    };
  }
  if (error instanceof BookingRejectedError) {
    return { kind: 'rejected', line: unavailableCopy(error.reason, error.partySize) };
  }
  if (error instanceof BookingBusyError) {
    return { kind: 'busy', line: line('confirm.error.busy') };
  }
  if (error instanceof BookingCommandInUseError) {
    return { kind: 'commandInUse', line: line('confirm.error.commandInUse') };
  }
  if (error instanceof BranchUnavailableError) {
    return { kind: 'branchUnavailable', line: line('confirm.error.branchUnavailable') };
  }
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof ServerError
  ) {
    return { kind: 'unknown', line: line('confirm.error.unknownOutcome') };
  }
  return { kind: 'generic', line: line('confirm.error.generic') };
}
