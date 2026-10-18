import { formatCountdown } from '@yalla/format';
import { ApiError } from '../errors';
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
 */
export interface ConsoleBooking {
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
   * When the venue's answer window closes — a short-notice booking only, and
   * only while it waits. Past it the server declines the booking itself and
   * tells the diner sorry. Null for a booking that waits without a clock (a
   * large party a week out), and once it is decided.
   */
  readonly approvalExpiresAtUtc: string | null;
  /** The diner's note for the venue (K9), or `null`. */
  readonly note: string | null;
}

/**
 * `Yalla.Application.Reservations.ApprovalTrigger`: 1 BranchApprovesEveryBooking,
 * 2 LargeParty, 3 NoShowHistory, 4 ShortNotice. `unknown` for a value a newer
 * server adds.
 *
 * `shortNotice` is the floor's own: a booking for today, or starting within
 * {@link SHORT_NOTICE_HOURS} hours, is never confirmed blindly for a table
 * somebody may just have sat down at. It is a fixed rule, not a branch setting,
 * and it always comes with an answer window.
 */
export type ApprovalTrigger =
  'branchApprovesEveryBooking' | 'largeParty' | 'noShowHistory' | 'shortNotice' | 'unknown';

/**
 * Why a booking the venue had to answer ended declined:
 * `Yalla.Domain.Enums.DeclineReason`, 1 StaffDeclined, 2 NoAnswer.
 *
 * Two different sentences to the diner, and the difference is the point. A
 * person said no — the table is not free then. Nobody answered in time — that
 * is the venue's failure, not the diner's, and the copy apologises for it.
 * `unknown` for a value a newer server adds; it reads as the plain "declined".
 */
export type DeclineReason = 'staffDeclined' | 'noAnswer' | 'unknown';

/** A booking for today, or for less than this many hours from now, waits for the floor. */
export const SHORT_NOTICE_HOURS = 6;

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
): ApprovalCountdown | null {
  if (!expiresAtUtc) return null;
  const at = Date.parse(expiresAtUtc);
  if (Number.isNaN(at)) return null;
  const secondsLeft = Math.max(0, Math.ceil((at - now.getTime()) / 1000));
  return {
    secondsLeft,
    label: formatCountdown(secondsLeft),
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
export interface AwaitingApproval {
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
  /** When the answer window closes. `null` for a request that waits without one. */
  readonly approvalExpiresAtUtc: string | null;
  readonly because: ApprovalTrigger | null;
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
}

/** "Next: 21:30 · 2 guests". */
export interface NextBookingContext {
  readonly startUtc: string;
  readonly partySize: number;
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
