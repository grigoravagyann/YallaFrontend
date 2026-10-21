import { branchDayKey, formatCountdown, type Locale, type TimeZone } from '@yalla/format';
import { ApiError } from '../errors';
import type { CancellationCause, GuestRecord } from './guestRecord';
import type { BookingPreOrderFields } from './preOrder';
import type { ReservationStatusCode } from './push';

/**
 * Bookings that are waiting for a person, and the two decisions.
 *
 * The policy tab lets an owner turn `autoConfirm` off or set a party-size
 * threshold, and a booking the rule stops lands as `PendingApproval` — where,
 * until this contract, it stayed: `POST /api/reservations/{id}/approve` and
 * `/reject` existed on the server and no surface called them.
 *
 * Deliberately not {@link ReservationState}. That is the diner's view from a
 * notification and carries no guest. A manager deciding whether to take a
 * party of ten on a Friday needs the name, the phone to ring, and *why* the
 * booking is waiting — three fields `ReservationView` has and the diner's
 * shape leaves out.
 *
 * With the booking's pre-order and "on my way" answer (2026-10-21), when the
 * list carries them.
 */
export interface ConsoleBooking extends Pick<
  BookingPreOrderFields,
  'preOrder' | 'guestConfirmedOnWayAtUtc'
> {
  readonly id: string;
  /** The short code quoted at the door. */
  readonly code: string;
  readonly branchId: string;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly partySize: number;
  readonly tableLabel: string;
  /** The branch's own day, `YYYY-MM-DD`. */
  readonly localDate: string;
  /** Wall clock at the branch, `HH:mm:ss` as the server writes it. */
  readonly localStartTime: string;
  readonly status: ReservationStatusCode;
  /** Why it is waiting. Null once decided, or when it never waited. */
  readonly awaitingApprovalBecause: ApprovalTrigger | null;
  /**
   * When the answer window closes — a short-notice booking, or one asking the
   * guest before for their table, and only while it waits. Past it the server
   * declines the booking itself and tells the diner sorry. Null for a booking
   * that waits without a clock (a large party a week out), and once it is
   * decided.
   */
  readonly approvalExpiresAtUtc: string | null;
  /**
   * The guest before answers this one themselves, in the app: the venue's
   * approve and reject are refused for it. False — or absent, from a server
   * that does not say — while it is the venue's to decide; see
   * {@link waitsOnEarlierGuestInApp}.
   */
  readonly awaitsEarlierGuestAnswer?: boolean | undefined;
  /** The diner's note for the venue (K9), or `null`. */
  readonly note: string | null;
  /**
   * Made without a proved phone number — "number not verified" beside it.
   * Only bookings from the few hours of 2026-10-20 when such bookings were
   * taken; absent reads as verified.
   */
  readonly phoneUnverified?: boolean | undefined;
  /**
   * How the guest kept their bookings over the last twelve months, at every
   * venue — counts only. Absent when no proved account is behind the booking.
   */
  readonly guestRecord?: GuestRecord | null | undefined;
  /** `noShowBlock`: cancelled automatically, the guest blocked for no-shows. */
  readonly cancelledBecause?: CancellationCause | null | undefined;
}

/**
 * `Yalla.Domain.Enums.ApprovalTrigger`: 1 BranchApprovesEveryBooking,
 * 2 LargeParty, 3 NoShowHistory, 4 ShortNotice, 5 EarlierGuestConsent,
 * 6 UnverifiedPhone. `unknown` for a value a newer server adds.
 *
 * `unverifiedPhone` is a booking made without a proved phone number while
 * such bookings were taken (a few hours of 2026-10-20). None is made any more;
 * the trigger stays for those few rows until they are answered or swept.
 *
 * `shortNotice` is the floor's own: a booking for today, or starting within
 * {@link SHORT_NOTICE_HOURS} hours, is never confirmed blindly for a table
 * somebody may just have sat down at. It is a fixed rule, not a branch setting,
 * and it always comes with an answer window.
 *
 * `earlierGuestConsent` is a booking on another day for a table somebody else
 * booked shortly before it: it starts within {@link REQUESTABLE_WITHIN_MINUTES}
 * minutes of the earlier booking, so the earlier guest is asked whether they
 * will have left by then. Through the app when they booked in it; on the floor
 * tablet, by the staff, when they booked on the web and have no push. Either
 * way its window is {@link EARLIER_GUEST_WINDOW_MINUTES} minutes, not fifteen,
 * and never past either booking's start.
 */
export type ApprovalTrigger =
  | 'branchApprovesEveryBooking'
  | 'largeParty'
  | 'noShowHistory'
  | 'shortNotice'
  | 'earlierGuestConsent'
  | 'unverifiedPhone'
  | 'unknown';

/**
 * Why a booking the venue had to answer ended declined:
 * `Yalla.Domain.Enums.DeclineReason`, 1 StaffDeclined, 2 NoAnswer,
 * 3 EarlierGuestDeclined, 4 EarlierGuestNoAnswer.
 *
 * Two different sentences to the diner, and the difference is the point. A
 * person said no — the table is not free then. Nobody answered in time — that
 * is the venue's failure, not the diner's, and the copy apologises for it.
 * The two earlier-guest reasons are the same pair for a table somebody else
 * booked before: they said they would still be there, or they did not answer
 * in two hours in the app — and either way another table or time is the next
 * step. The floor letting its own two hours to ring them run out is `noAnswer`:
 * the venue did not answer.
 * `unknown` for a value a newer server adds; it reads as the plain "declined".
 */
export type DeclineReason =
  'staffDeclined' | 'noAnswer' | 'earlierGuestDeclined' | 'earlierGuestNoAnswer' | 'unknown';

// ---------------------------------------------------------------------------
// Booking times and table sequencing — the fixed rules, not branch settings
// ---------------------------------------------------------------------------

/** A booking may start this many minutes from now, and no sooner — the default lead time. */
export const MIN_LEAD_MINUTES = 10;

/** The day's times are this far apart: 19:00, 19:15, 19:30. */
export const SLOT_STEP_MINUTES = 15;

/** Clearing time between one party leaving a table and the next sitting down. */
export const TABLE_BUFFER_MINUTES = 5;

/** A table just booked is nobody else's for this long after that booking starts. */
export const TABLE_BLOCK_MINUTES = 90;

/** A booking must start at least this long before the next one on its table. */
export const NEXT_BOOKING_GAP_MINUTES = 45;

/**
 * Up to this long after an earlier booking starts, a table is only requestable:
 * the earlier guest (another day) or the floor (today) says whether it is free.
 */
export const REQUESTABLE_WITHIN_MINUTES = 180;

/** How long the earlier guest — or the floor, for a web guest — has to answer. Never past a start. */
export const EARLIER_GUEST_WINDOW_MINUTES = 120;

/** A booking for today, or for less than this many hours from now, waits for the floor. */
export const SHORT_NOTICE_HOURS = 6;

/**
 * Short notice: the booking is for the branch's today, or starts less than
 * {@link SHORT_NOTICE_HOURS} hours from now. Either alone is enough — a 23:30
 * booking made at 18:00 is both, a 01:00 one made at 22:00 the second only.
 * "Today" is the branch's, never the device's or UTC's. The floor decides such
 * a booking; another day, a requestable one asks the guest before.
 */
export function isShortNotice(input: {
  readonly startUtc: string;
  readonly timeZoneId: string;
  readonly now: Date;
}): boolean {
  const start = new Date(input.startUtc);
  if (start.getTime() - input.now.getTime() < SHORT_NOTICE_HOURS * 3_600_000) return true;
  const zone = input.timeZoneId as TimeZone;
  return branchDayKey(start, zone) === branchDayKey(input.now, zone);
}

/** How long the floor has to answer a short-notice booking, at most. */
export const APPROVAL_WINDOW_MINUTES = 15;

/** Under this many seconds left, a request says so louder. */
export const APPROVAL_URGENT_SECONDS = 120;

/**
 * How often a screen waiting on the venue's answer reads again.
 *
 * Ten seconds against a fifteen-minute window: the floor tablet learns of a
 * new request, and the diner's page of the answer, well inside a minute, for
 * ninety reads at most — and only while something is actually waiting.
 */
export const APPROVAL_POLL_MS = 10_000;

/** Waiting for the venue with a clock on it: the screens that show it poll. */
export function awaitsVenueAnswer(booking: {
  readonly status: string;
  readonly approvalExpiresAtUtc: string | null | undefined;
}): boolean {
  return booking.status === 'pendingApproval' && Boolean(booking.approvalExpiresAtUtc);
}

/**
 * Whether a waiting booking is the guest before's to answer, in the app — not
 * the floor's. Both wait with the same clock (two hours, never past either
 * booking's start): the guest's own answer in the app, and the floor's, for a
 * guest it has to ring (they booked on the web, have no device, or the booking
 * needs the floor anyway). So the clock does not say whose it is; the server's
 * `awaitsEarlierGuestAnswer` does. The floor's approve and reject are refused
 * for the guest's own (409 `reservation-awaiting-earlier-guest`), so no screen
 * offers them — it says whose answer it waits for instead. A server that does
 * not say reads as the floor's: the decision is offered, and that 409 turns the
 * screen round if it was not. Short-notice ones are `shortNotice`.
 */
export function waitsOnEarlierGuestInApp(
  because: ApprovalTrigger | null | undefined,
  awaitsEarlierGuestAnswer: boolean | null | undefined,
): boolean {
  return because === 'earlierGuestConsent' && awaitsEarlierGuestAnswer === true;
}

/**
 * How long is left to answer, for a request with a window.
 *
 * Computed from the server's instant and the device's clock, ticking once a
 * second on screen. Nothing is decided here: the server declines at its own
 * instant, and a screen that reaches zero first only stops offering the
 * decision until the next read agrees.
 */
export interface ApprovalCountdown {
  /** Whole seconds left, rounded up and never negative. */
  readonly secondsLeft: number;
  /** "14:05". */
  readonly label: string;
  /** The window has closed — the server is declining it, or already has. */
  readonly expired: boolean;
  /** Little time left and not yet closed. */
  readonly urgent: boolean;
}

/** `null` when the booking waits without a window, or the instant cannot be read. */
export function approvalCountdown(
  expiresAtUtc: string | null | undefined,
  now: Date,
  /** Given, a window past an hour reads "1 hr 59 min" rather than "119:00". */
  locale?: Locale,
): ApprovalCountdown | null {
  if (!expiresAtUtc) return null;
  const at = Date.parse(expiresAtUtc);
  if (Number.isNaN(at)) return null;
  const secondsLeft = Math.max(0, Math.ceil((at - now.getTime()) / 1000));
  return {
    secondsLeft,
    label: formatCountdown(secondsLeft, locale),
    expired: secondsLeft === 0,
    urgent: secondsLeft > 0 && secondsLeft <= APPROVAL_URGENT_SECONDS,
  };
}

/**
 * The 409 for a decision that came too late: the answer window closed, or the
 * booking's own start passed, before the tap landed. The server has declined
 * it (or is about to), and the screen says so rather than "somebody else
 * decided".
 */
export const APPROVAL_EXPIRED_CODE = 'reservation-approval-expired';

export function isApprovalExpired(error: unknown): boolean {
  return error instanceof ApiError && error.code === APPROVAL_EXPIRED_CODE;
}

/**
 * A booking waiting on the floor tablet, with what the table looks like around it.
 *
 * `GET /api/branches/{branchId}/reservations/awaiting`, soonest expiry first.
 * A waiter deciding in fifteen minutes needs more than the console's row: is
 * somebody sitting at that table right now, who booked it before this one and
 * how do I ring them to ask whether they are leaving, and is there a party
 * after it. The three context fields are that, and the server answers them in
 * the same read so the tablet does not ask table by table.
 */
/** With the booking's pre-order (2026-10-21), when it has one. */
export interface AwaitingApproval extends Pick<
  BookingPreOrderFields,
  'preOrder' | 'guestConfirmedOnWayAtUtc'
> {
  readonly id: string;
  readonly code: string;
  readonly branchId: string;
  /** The guest's name as they booked. */
  readonly guestName: string;
  /** E.164, for a `tel:` link. Staff of the branch may see it; nobody else does. */
  readonly guestPhone: string;
  readonly partySize: number;
  readonly tableId: string;
  readonly tableLabel: string;
  /** "Hall", "Terrace" — `null` for a table in no room. */
  readonly roomName: string | null;
  readonly startUtc: string;
  /** The branch's own day, `YYYY-MM-DD`. */
  readonly localDate: string;
  /** Wall clock at the branch, `HH:mm:ss`. */
  readonly localStartTime: string;
  readonly timeZoneId: string;
  readonly note: string | null;
  /**
   * Made without a proved phone number: the card says "number not verified".
   * Legacy rows only (2026-10-20); absent reads as verified.
   */
  readonly phoneUnverified?: boolean | undefined;
  /**
   * The guest's booking record — came, no-shows, late cancellations over
   * twelve months, and a no-show block — for the floor to decide on. Absent
   * when no proved account is behind the booking.
   */
  readonly guestRecord?: GuestRecord | null | undefined;
  /**
   * When the answer window closes. `null` for a request that waits without one.
   * An `earlierGuestConsent` request the floor decides has two hours, as the
   * guest before would have had in the app.
   */
  readonly approvalExpiresAtUtc: string | null;
  readonly because: ApprovalTrigger | null;
  /**
   * The guest before answers it themselves. The server lists only the floor's
   * own, so this is false there; read to be safe, as on {@link ConsoleBooking}.
   */
  readonly awaitsEarlierGuestAnswer?: boolean | undefined;
  /**
   * The time this booking's guest promised to free the table by, when a later
   * booking on it made the sitting shorter: "must free by 21:25". Absent or
   * `null` when nothing was promised — and from a server before booking times.
   */
  readonly promisedFreeByUtc?: string | null | undefined;
  /**
   * The time to ask the guest before to have left by — an `earlierGuestConsent`
   * booking the floor decides, or a short-notice one within three hours of the
   * booking before. "Ask Anna whether the table will be free by 19:40".
   */
  readonly earlierGuestFreeByUtc?: string | null | undefined;
  /** The booking before this one on the same table that day, if any. */
  readonly previousBooking: PreviousBookingContext | null;
  /** The booking after this one on the same table that day, if any. */
  readonly nextBooking: NextBookingContext | null;
  /** The party at the table right now, when it is occupied. */
  readonly currentSitting: CurrentSittingContext | null;
}

/** "Before: 18:00 · 4 guests · Anna · Call". */
export interface PreviousBookingContext {
  readonly startUtc: string;
  readonly partySize: number;
  readonly guestName: string;
  /** E.164, or `null` when the booking carried none. */
  readonly guestPhone: string | null;
  readonly status: ReservationStatusCode;
  /** When that guest promised to be gone by, if they did. */
  readonly promisedFreeByUtc?: string | null | undefined;
}

/** "Next: 21:30 · 2 guests". */
export interface NextBookingContext {
  readonly startUtc: string;
  readonly partySize: number;
  /** When that booking's guest promised to be gone by, if they did. */
  readonly promisedFreeByUtc?: string | null | undefined;
}

/**
 * The time the earlier guest is asked to be gone by, for a booking waiting on
 * their consent: the later booking's start less the clearing time — "will you
 * have left by 19:40?" for a 19:45 booking.
 */
export function earlierGuestFreeByUtc(startUtc: string): string {
  return new Date(Date.parse(startUtc) - TABLE_BUFFER_MINUTES * 60_000).toISOString();
}

/** "Sitting now: since 18:10". */
export interface CurrentSittingContext {
  readonly sinceUtc: string;
  /** `null` when the waiter who seated them did not say. */
  readonly partySize: number | null;
}

/**
 * `DecideReservationRequest`: the one body both routes take.
 *
 * No `clientCommandId`. The routes are not behind `ClientCommandIdFilter`, and
 * a repeat is refused by state rather than replayed: the second approve of one
 * booking is a 409 naming it as already confirmed, which a screen shows and
 * then refreshes from.
 */
export interface DecideReservationCommand {
  readonly reservationId: string;
  /** Optional free text, recorded when declining. Never shown to the diner. */
  readonly reason?: string | undefined;
}
