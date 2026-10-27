import {
  branchDayKey,
  formatDate,
  formatTime,
  instantFromZonedClock,
  type Locale,
  type TimeZone,
} from '@yalla/format';
import { approvalCountdown, type ApprovalTrigger, type DeclineReason } from './approvals';
import { isKnownUnavailableReason } from './booking';
import type {
  AvailabilityWindowDto,
  IncomingTableRequest,
  TableAvailability,
  TableUnavailableReason,
} from './booking';
import {
  BookingBusyError,
  BookingCommandInUseError,
  BookingOverlapsOwnError,
  BookingBlockedNoShowsError,
  BookingRejectedError,
  BranchUnavailableError,
  ExpiredCodeError,
  FreeByRequiredError,
  LeadTimeExceededError,
  PhoneHasActiveBookingError,
  PhoneNotVerifiedError,
  RateLimitedError,
  TableTakenError,
  SmsUnavailableError,
  TelegramUnavailableError,
  TooManyAttemptsError,
  WrongCodeError,
  isFeatureNotEnabled,
} from './errors';
import { NetworkError, ServerError, TimeoutError, TooManyRequestsError } from '../errors';

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

/** The slice of a booking the venue's answer is read from: the app's and the manage link's. */
export interface VenueAnswerState {
  readonly status: string;
  readonly approvalExpiresAtUtc: string | null | undefined;
  readonly declinedBecause: DeclineReason | null | undefined;
  /**
   * Why it waits, when the surface knows: a booking waiting for the guest
   * before says so ("Asking the guest before you"), every other wait says the
   * venue. Absent on a surface that does not carry it — the venue sentence.
   */
  readonly awaitingApprovalBecause?: ApprovalTrigger | null | undefined;
  /**
   * Waiting for the guest before: whether they answer it themselves in the
   * app (true) or the venue rings them (false). Both run on the same two-hour
   * clock. Absent on a surface that does not say — the sentence true of both.
   */
  readonly awaitsEarlierGuestAnswer?: boolean | null | undefined;
}

/**
 * What a booking says about the venue's answer, or nothing.
 *
 * Waiting with a clock: "Waiting for the venue · answer within 12:41", and once
 * this device's clock reaches the end, only that it is waiting — the server
 * declines at its own instant and the next read says so. Declined: which way,
 * because "the venue said no" and "nobody answered in time" are different
 * sentences, and the second one apologises. A booking that waits with no clock
 * (a large party) has nothing to add to the pending title it already shows.
 */
export function venueAnswerCopy(
  booking: VenueAnswerState,
  now: Date,
  locale?: Locale,
): CopyLine | null {
  if (booking.status === 'pendingApproval') {
    const countdown = approvalCountdown(booking.approvalExpiresAtUtc, now, locale);
    const earlierGuest = booking.awaitingApprovalBecause === 'earlierGuestConsent';
    // A wait for the guest before with no clock — one moved where none runs:
    // the venue's answer is the one to wait for.
    if (!countdown) return earlierGuest ? line('booking.approval.venueWillConfirm') : null;
    // The venue ringing a guest before who cannot answer in the app is named
    // as the venue: "the venue is checking with the guest before you".
    const venueChecks = earlierGuest && booking.awaitsEarlierGuestAnswer === false;
    if (countdown.expired) {
      return line(
        venueChecks
          ? 'booking.approval.checkingVenueEarlierGuest'
          : earlierGuest
            ? 'booking.approval.checkingEarlierGuest'
            : 'booking.approval.checking',
      );
    }
    return line(
      venueChecks
        ? 'booking.approval.waitingVenueEarlierGuest'
        : earlierGuest
          ? 'booking.approval.waitingEarlierGuest'
          : 'booking.approval.waiting',
      { time: countdown.label },
    );
  }
  return declinedCopy(booking.declinedBecause, 'body');
}

/**
 * Why a booking waits for the venue, under its pending title — the one
 * sentence the app's confirmation, the web's and the manage link all say.
 *
 * Made without a verified number (legacy rows from 2026-10-20): the venue
 * confirms those itself. The guest
 * before asked (by the app, or rung by the venue for a guest it has to). A
 * short-notice request on the floor's clock. Anything else: the venue will
 * confirm shortly.
 */
export function pendingReasonCopy(booking: VenueAnswerState): CopyLine {
  if (booking.awaitingApprovalBecause === 'unverifiedPhone') {
    return line('booking.approval.unverifiedWhy');
  }
  if (booking.awaitingApprovalBecause === 'earlierGuestConsent') {
    return line(
      booking.awaitsEarlierGuestAnswer === false
        ? 'booking.approval.venueAsksEarlierGuest'
        : 'table.requestable.earlierGuest',
    );
  }
  return line(booking.approvalExpiresAtUtc ? 'booking.approval.why' : 'success.pendingBody');
}

/** Which sentence pair a decline reason reads as. */
const DECLINED_AS: Readonly<Record<DeclineReason, string>> = {
  staffDeclined: 'byVenue',
  noAnswer: 'noAnswer',
  earlierGuestDeclined: 'earlierGuest',
  earlierGuestNoAnswer: 'earlierGuestNoAnswer',
  unknown: 'byVenue',
};

/**
 * The title or the sentence for a booking the venue declined, by why. `null`
 * for one it did not decline — a cancellation after confirming is not this.
 */
export function declinedCopy(
  reason: DeclineReason | null | undefined,
  part: 'title' | 'body',
): CopyLine | null {
  // Absent as well as null: a booking kept from before the field existed.
  if (!reason) return null;
  const which = DECLINED_AS[reason] ?? 'byVenue';
  return line(part === 'title' ? `booking.declined.${which}Title` : `booking.declined.${which}`);
}

// ---------------------------------------------------------------------------
// Booking times: a sitting cut short, a table asked for, the earlier guest
// ---------------------------------------------------------------------------

/**
 * "You would free the table by 21:25" — for a table the next booking cuts
 * short. Shown with the window, before any button, on every surface.
 */
export function mustFreeByCopy(
  mustFreeByUtc: string | null | undefined,
  timeZoneId: TimeZone,
  locale: Locale,
): CopyLine | null {
  if (!mustFreeByUtc) return null;
  return line('table.mustFreeBy', { time: formatTime(mustFreeByUtc, timeZoneId, locale) });
}

/**
 * The question asked before sending: "There is a booking at 21:30. Will you
 * free the table by 21:25?" The next booking's start, when known, is what makes
 * the time make sense.
 */
export function freeByQuestion(
  input: { readonly nextStartUtc: string | null | undefined; readonly freeByUtc: string },
  timeZoneId: TimeZone,
  locale: Locale,
): CopyLine {
  const time = formatTime(input.freeByUtc, timeZoneId, locale);
  return input.nextStartUtc
    ? line('book.freeBy.question', {
        next: formatTime(input.nextStartUtc, timeZoneId, locale),
        time,
      })
    : line('book.freeBy.questionNoNext', { time });
}

/** "You will free the table by 21:25" — the promise, read back on the booking. */
export function promisedFreeByCopy(
  promisedFreeByUtc: string | null | undefined,
  timeZoneId: TimeZone,
  locale: Locale,
): CopyLine | null {
  if (!promisedFreeByUtc) return null;
  return line('booking.freeBy.promised', {
    time: formatTime(promisedFreeByUtc, timeZoneId, locale),
  });
}

/**
 * "Someone would like your table at 19:45. Will you have left by 19:40?" —
 * the earlier guest's card and push. The later guest stays anonymous.
 */
export function tableRequestCopy(
  request: Pick<IncomingTableRequest, 'requestedStartUtc' | 'freeByUtc'>,
  timeZoneId: TimeZone,
  locale: Locale,
): CopyLine {
  return line('booking.tableRequest.question', {
    time: formatTime(request.requestedStartUtc, timeZoneId, locale),
    freeBy: formatTime(request.freeByUtc, timeZoneId, locale),
  });
}

/**
 * The "the venue confirms this booking first" line, or nothing. Said for every
 * reason the server gives — a large party, a branch that approves by hand, and
 * a slot at short notice, which the floor answers within fifteen minutes — so
 * the sentence names none of them.
 */
export function approvalCopy(
  requiresApproval: boolean,
  requiresEarlierGuestConsent = false,
): CopyLine | null {
  // A table somebody booked shortly before, another day: the guest before is
  // asked, not the venue, and the sentence says who.
  if (requiresEarlierGuestConsent) return line('table.requestable.earlierGuest');
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
  /** "You would free the table by 21:25", when the next booking cuts the sitting short. */
  readonly freeBy: CopyLine | null;
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
      freeBy: null,
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
    approval: approvalCopy(
      availability.requiresApproval,
      availability.requiresEarlierGuestConsent ?? false,
    ),
    freeBy: mustFreeByCopy(availability.mustFreeByUtc, timeZoneId, locale),
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
  if (error instanceof TelegramUnavailableError) return line('verify.telegramUnavailable');
  if (error instanceof SmsUnavailableError) return line('verify.smsUnavailable');
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
 * - `overlapsOwn` is the diner's own booking at the same place and time: the
 *   sentence names it — "You already have a booking at 19:30 (table 2)" — so
 *   they choose between the two rather than hold both.
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
  /**
   * The platform has not enabled bookings (app or web) or pre-orders at the
   * branch (`feature-not-enabled`, 2026-10-27): not here, not now, and nothing
   * the guest can change by trying again.
   */
  | { readonly kind: 'featureOff'; readonly line: CopyLine }
  | { readonly kind: 'phoneNotVerified'; readonly line: CopyLine }
  | {
      readonly kind: 'overlapsOwn';
      readonly line: CopyLine;
      readonly error: BookingOverlapsOwnError;
    }
  /**
   * A booking follows on the table and the promise to free it was missing or
   * no longer right: the screen asks again with `requiredFreeByUtc`, and a yes
   * resends the same command with it.
   */
  | {
      readonly kind: 'freeByRequired';
      readonly line: CopyLine;
      readonly requiredFreeByUtc: string | null;
      readonly nextBookingStartUtc: string | null;
    }
  /*
   * The number rules (guest record, 2026-10-20). A proved number holds at most
   * three active bookings: the line says how many, and names the caller's next
   * one when the server did (`error.held`) so they know which to cancel.
   */
  | {
      readonly kind: 'phoneHasActiveBooking';
      readonly line: CopyLine;
      readonly error: PhoneHasActiveBookingError;
    }
  /**
   * Three no-shows in three days: no booking, and no change, until
   * `error.blockedUntilUtc`. Nothing to retry and nothing to offer.
   */
  | {
      readonly kind: 'blockedNoShows';
      readonly line: CopyLine;
      readonly error: BookingBlockedNoShowsError;
    }
  /** A 429 — the server's request limit; wait a moment. */
  | { readonly kind: 'rateLimited'; readonly line: CopyLine }
  | { readonly kind: 'unknown'; readonly line: CopyLine }
  | { readonly kind: 'generic'; readonly line: CopyLine };

/** The venue and branch being booked, as an overlap's refusal names places. */
export interface BookingPlace {
  readonly venueName?: string | null | undefined;
  readonly branchName?: string | null | undefined;
}

export interface BookingFailureOptions {
  /**
   * The venue and branch being booked. An overlap with the diner's own booking
   * **elsewhere** — another venue, or another branch of this one — names that
   * place ("…at Café Aram at 19:30, too close to this time"); one here says
   * "here". Absent: every overlap is said as one here.
   */
  readonly here?: BookingPlace | undefined;
}

/**
 * Whether the booking an overlap names is at another place than `here` — the
 * venue (or branch) the diner is booking. Compared by name, as the refusal
 * names it; a refusal that names no venue, or no `here`, reads as here.
 */
export function overlapIsElsewhere(
  error: BookingOverlapsOwnError,
  here: BookingPlace | undefined,
): boolean {
  const venue = error.venueName?.trim().toLowerCase();
  const hereVenue = here?.venueName?.trim().toLowerCase();
  if (!venue || !hereVenue) return false;
  if (venue !== hereVenue) return true;
  const branch = error.branchName?.trim().toLowerCase();
  const hereBranch = here?.branchName?.trim().toLowerCase();
  return Boolean(branch && hereBranch && branch !== hereBranch);
}

/**
 * The place an overlap elsewhere names: "Café Aram" — or "Café Aram, North"
 * when it is another branch of the venue being booked.
 */
export function overlapPlace(
  error: BookingOverlapsOwnError,
  here: BookingPlace | undefined,
): string {
  const venue = error.venueName?.trim() ?? '';
  const branch = error.branchName?.trim() ?? '';
  const sameVenue = venue !== '' && venue.toLowerCase() === here?.venueName?.trim().toLowerCase();
  if (sameVenue && branch) return `${venue}, ${branch}`;
  return venue || branch;
}

export function bookingFailure(
  error: unknown,
  timeZoneId: TimeZone,
  locale: Locale,
  options: BookingFailureOptions = {},
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
  if (error instanceof FreeByRequiredError) {
    return {
      kind: 'freeByRequired',
      requiredFreeByUtc: error.requiredFreeByUtc,
      nextBookingStartUtc: error.nextBookingStartUtc,
      line: error.requiredFreeByUtc
        ? line('confirm.error.freeByRequired', {
            time: formatTime(error.requiredFreeByUtc, timeZoneId, locale),
          })
        : line('confirm.error.freeByRequiredNoTime'),
    };
  }
  if (error instanceof BookingOverlapsOwnError) {
    const { localStartTime: time, tableLabel: table } = error;
    return {
      kind: 'overlapsOwn',
      error,
      line: !time
        ? line('confirm.error.generic')
        : overlapIsElsewhere(error, options.here)
          ? // Another venue: the two sittings need half an hour between them.
            line('confirm.error.overlapsOwnElsewhere', {
              venue: overlapPlace(error, options.here),
              time,
            })
          : table
            ? line('confirm.error.overlapsOwn', { time, table })
            : line('confirm.error.overlapsOwnPlain', { time }),
    };
  }
  if (error instanceof PhoneHasActiveBookingError) {
    const held = error.held;
    const max = error.maxActiveBookings;
    return {
      kind: 'phoneHasActiveBooking',
      error,
      line: held
        ? line('confirm.error.maxActiveBookingsNext', {
            max,
            venue: held.venueName || held.branchName,
            date: heldDay(held.localDate, timeZoneId, locale),
            time: held.localStartTime,
          })
        : line('confirm.error.maxActiveBookings', { max }),
    };
  }
  if (error instanceof BookingBlockedNoShowsError) {
    return {
      kind: 'blockedNoShows',
      error,
      line: error.blockedUntilUtc
        ? line('confirm.error.blockedNoShows', {
            date: formatDate(error.blockedUntilUtc, timeZoneId, locale),
            time: formatTime(error.blockedUntilUtc, timeZoneId, locale),
          })
        : line('confirm.error.blockedNoShowsPlain'),
    };
  }
  // A 429: the server's request limit. Nothing about the booking; wait a moment.
  if (error instanceof TooManyRequestsError) {
    return { kind: 'rateLimited', line: line('confirm.error.tooManyRequests') };
  }
  if (error instanceof BookingBusyError) {
    return { kind: 'busy', line: line('confirm.error.busy') };
  }
  if (error instanceof BookingCommandInUseError) {
    return { kind: 'commandInUse', line: line('confirm.error.commandInUse') };
  }
  // Before the generic 4xx reading: the answer is "verify your number", and a
  // screen offers the code flow rather than another tap on Confirm.
  if (error instanceof PhoneNotVerifiedError) {
    return { kind: 'phoneNotVerified', line: line('confirm.error.phoneNotVerified') };
  }
  if (error instanceof BranchUnavailableError) {
    return { kind: 'branchUnavailable', line: line('confirm.error.branchUnavailable') };
  }
  if (isFeatureNotEnabled(error)) {
    return { kind: 'featureOff', line: line('confirm.error.featureOff') };
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

/**
 * "22 October" for a branch day (`YYYY-MM-DD`) as the server names one, read
 * at noon so no zone can tip it into the day before; the bare string when it
 * is not one.
 */
function heldDay(localDate: string, timeZoneId: TimeZone, locale: Locale): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(localDate);
  if (!parts) return localDate;
  const noon = instantFromZonedClock(
    { year: Number(parts[1]), month: Number(parts[2]), day: Number(parts[3]), hour: 12, minute: 0 },
    timeZoneId,
  );
  return formatDate(noon, timeZoneId, locale);
}
