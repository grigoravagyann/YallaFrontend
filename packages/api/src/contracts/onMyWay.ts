import type { ReservationStatusCode } from './push';

/**
 * "I'm coming" on a booking (2026-10-22): the guest's three answers — on my
 * way, running late 10 / 15 / 30, not coming (the ordinary cancel) — and the
 * venue's "Ask: are you coming?" from the tablet.
 *
 * The window: from two hours before the start (`onMyWayOpensAtUtc`) until the
 * booking ends, for a confirmed booking (on my way also takes a seated one).
 * On my way and running late are both **"the guest answered"**: a later answer
 * overwrites an earlier one ("on my way" after "late" clears the lateness).
 * The venue may ask from two hours before the start until the start, while the
 * guest has not answered, at most once every fifteen minutes.
 *
 * Every shape is the wire's (`docs/reservations.md` §3h in the backend). The
 * rules are mirrored here for the screens and the mocks; the server's answer
 * always wins.
 */

/** "On my way" and "running late" are taken from this many hours before the start. */
export const ON_MY_WAY_WINDOW_HOURS = 2;
/** The venue may ask again this long after its last ask (`PreOrderRules.StaffAskIntervalMinutes`). */
export const STAFF_ASK_INTERVAL_MINUTES = 15;
/** What "running late" may say. */
export const RUNNING_LATE_MINUTES = [10, 15, 30] as const;
export type RunningLateMinutes = (typeof RUNNING_LATE_MINUTES)[number];

export function isRunningLateMinutes(value: unknown): value is RunningLateMinutes {
  return (RUNNING_LATE_MINUTES as readonly unknown[]).includes(value);
}

/**
 * The answer fields every booking read carries beside the pre-order's (see
 * `BookingPreOrderFields`) — the diner's `/mine`, every staff list, the manage
 * link, the rail's cards. Optional so a fixture or a server from before them
 * reads as "nobody asked, nobody answered".
 */
export interface BookingAnswerFields {
  /** When the guest answered "Yes, on my way"; absent or `null` until then. */
  readonly guestConfirmedOnWayAtUtc?: string | null | undefined;
  /** "I'm running late": 10, 15 or 30, the guest's latest answer; absent or `null` when none. */
  readonly guestRunningLateMinutes?: number | null | undefined;
  /** When they said it. Not on the manage link's read. */
  readonly guestRunningLateAtUtc?: string | null | undefined;
  /** When somebody at the venue last asked "are you coming?" from the tablet. */
  readonly staffAskedOnMyWayAtUtc?: string | null | undefined;
  /** From when the app shows "I'm coming": two hours before the start. The guest's reads only. */
  readonly onMyWayOpensAtUtc?: string | null | undefined;
}

/** "I'm running late" — `POST /api/reservations/{id}/running-late`. */
export interface ReportRunningLateCommand {
  readonly reservationId: string;
  readonly minutes: RunningLateMinutes;
}

/** The same from a manage link — `POST /api/public/bookings/{token}/running-late`. */
export interface ReportManagedRunningLateCommand {
  readonly token: string;
  readonly minutes: RunningLateMinutes;
}

/** The answer to "I'm running late". `RunningLateResult`. */
export interface RunningLateResult {
  readonly reservationId: string;
  /** 10, 15 or 30 — the answer as it now stands. */
  readonly guestRunningLateMinutes: number;
  readonly guestRunningLateAtUtc: string;
  /** The start plus the minutes: when the venue may expect them. */
  readonly expectedArrivalUtc: string;
}

/** The answer to the venue's "Ask: are you coming?". `AskOnMyWayResult`. */
export interface AskOnMyWayResult {
  readonly reservationId: string;
  /** When it was asked — now. */
  readonly staffAskedOnMyWayAtUtc: string;
  /** When the venue may ask again, fifteen minutes on, if the guest has not answered. */
  readonly nextAskAllowedAtUtc: string;
  /**
   * The guest was sent the push and the feed entry. False for a booking with
   * no live account behind it (made on the web without one, or deleted):
   * call the number instead.
   */
  readonly notified: boolean;
}

// ---------------------------------------------------------------------------
// The rules, as the screens and the mocks read them
// ---------------------------------------------------------------------------

function shift(instant: string, minutes: number): string {
  return new Date(Date.parse(instant) + minutes * 60_000).toISOString();
}

/** When "on my way" and "running late" open for a booking starting at `startUtc`. */
export function onMyWayOpensAtUtc(startUtc: string): string {
  return shift(startUtc, -ON_MY_WAY_WINDOW_HOURS * 60);
}

/** The guest said "on my way" or "running late": the venue's ask is refused, nobody asks again. */
export function guestAnswered(fields: BookingAnswerFields): boolean {
  return Boolean(fields.guestConfirmedOnWayAtUtc) || fields.guestRunningLateMinutes != null;
}

/** When the guest answered, whichever answer stands; `null` when they have not. */
export function guestAnsweredAtUtc(fields: BookingAnswerFields): string | null {
  const times = [fields.guestConfirmedOnWayAtUtc, fields.guestRunningLateAtUtc].filter(
    (value): value is string => Boolean(value),
  );
  if (times.length === 0) return null;
  return times.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest));
}

/** The slice of a booking the guest's buttons are decided from. */
export interface OnMyWayAnswerInput extends BookingAnswerFields {
  readonly status: ReservationStatusCode;
  readonly startUtc: string;
  readonly endUtc: string;
}

/**
 * Whether the booking screen shows "I'm coming", "Late 10 / 15 / 30" and "Not
 * coming": a confirmed booking, from `onMyWayOpensAtUtc` (start − 2 h when the
 * read did not say) until it ends. The buttons stay after an answer — a later
 * one overwrites it.
 */
export function canAnswerOnMyWay(booking: OnMyWayAnswerInput, now: Date): boolean {
  if (booking.status !== 'confirmed') return false;
  const opens = Date.parse(booking.onMyWayOpensAtUtc ?? onMyWayOpensAtUtc(booking.startUtc));
  const t = now.getTime();
  return t >= opens && t < Date.parse(booking.endUtc);
}

/** Why the venue may not ask now — each the server's own refusal. */
export type AskOnMyWayBlock =
  | { readonly kind: 'notConfirmed' }
  | { readonly kind: 'started' }
  | { readonly kind: 'tooEarly'; readonly opensAtUtc: string }
  | { readonly kind: 'answered'; readonly answeredAtUtc: string | null }
  | { readonly kind: 'askedRecently'; readonly nextAllowedAtUtc: string };

/** The slice of a booking the tablet's "Ask: are you coming?" is decided from. */
export interface AskOnMyWayInput extends BookingAnswerFields {
  readonly status: ReservationStatusCode;
  readonly startUtc: string;
}

/**
 * Whether "Ask: are you coming?" is enabled, or why not — the reason the
 * disabled button says. The server's order: not confirmed or started, too
 * early, answered, asked within fifteen minutes. `null` when it may ask.
 */
export function askOnMyWayBlock(booking: AskOnMyWayInput, now: Date): AskOnMyWayBlock | null {
  const t = now.getTime();
  if (booking.status !== 'confirmed') return { kind: 'notConfirmed' };
  if (t >= Date.parse(booking.startUtc)) return { kind: 'started' };
  const opensAtUtc = onMyWayOpensAtUtc(booking.startUtc);
  if (t < Date.parse(opensAtUtc)) return { kind: 'tooEarly', opensAtUtc };
  if (guestAnswered(booking))
    return { kind: 'answered', answeredAtUtc: guestAnsweredAtUtc(booking) };
  if (booking.staffAskedOnMyWayAtUtc) {
    const nextAllowedAtUtc = shift(booking.staffAskedOnMyWayAtUtc, STAFF_ASK_INTERVAL_MINUTES);
    if (t < Date.parse(nextAllowedAtUtc)) return { kind: 'askedRecently', nextAllowedAtUtc };
  }
  return null;
}

/**
 * The venue asked and the guest has not answered: the diner's banner "{venue}
 * is asking: are you coming?".
 */
export function venueIsAsking(fields: BookingAnswerFields): boolean {
  return Boolean(fields.staffAskedOnMyWayAtUtc) && !guestAnswered(fields);
}
