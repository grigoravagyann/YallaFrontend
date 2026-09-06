/**
 * The two branch settings screens: when the venue is open, and how it takes
 * bookings.
 *
 * Both are **replace-the-whole-thing** endpoints, and both screens are
 * therefore explicit-save with a dirty indicator rather than per-field
 * autosave. That is the server's shape and not a preference: a PUT that
 * replaces the week cannot be driven from a field's blur without the last blur
 * silently winning over everything typed before it.
 */

// ---------------------------------------------------------------------------
// Opening hours
// ---------------------------------------------------------------------------

/** `System.DayOfWeek`: 0 Sunday … 6 Saturday. The server's numbering, not ours. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The week as Armenia reads it, Monday first.
 *
 * The wire numbers days from Sunday because .NET does. Rendering that order to
 * a venue owner in Yerevan puts the weekend in the wrong place, so the screen
 * walks this and the mapper walks the wire.
 */
export const WEEK_ORDER: readonly WeekdayIndex[] = [1, 2, 3, 4, 5, 6, 0];

/**
 * One span of opening, wall-clock in the branch's own zone.
 *
 * `HH:mm` here, `HH:mm:ss` on the wire. Seconds in an opening time are noise a
 * person would have to skip past on every row.
 */
export interface HoursBlock {
  readonly opensAt: string;
  readonly closesAt: string;
}

/**
 * One day. `closed` and an empty block list are the same fact, held once.
 *
 * A day marked closed emits **no interval at all** — not a zero-length one.
 * `00:00–00:00` is a legal-looking way to say "shut" that reads to the overlap
 * checker as a real span and to the availability query as a venue that is open
 * for an instant at midnight.
 */
export interface HoursDay {
  readonly day: WeekdayIndex;
  readonly blocks: readonly HoursBlock[];
}

export type WeeklyHours = readonly HoursDay[];

/**
 * Does this block cross midnight?
 *
 * **Derived, never asked.** The server computes `closesNextDay` from the two
 * times and refuses to accept it from a client, and a checkbox for it is a
 * checkbox somebody gets wrong on the one row where it matters — the bar that
 * shuts at one in the morning. A closing time at or before the opening time
 * means the next day; the two being equal is twenty-four hours, not zero, which
 * is why the comparison is `<=` and not `<`.
 */
export function closesNextDay(block: HoursBlock): boolean {
  return toMinutes(block.closesAt) <= toMinutes(block.opensAt);
}

/** `HH:mm` or `HH:mm:ss` to minutes since midnight. `-1` for anything unparseable. */
export function toMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time.trim());
  if (!match) return -1;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return -1;
  if (hours > 23 || minutes > 59) return -1;
  return hours * 60 + minutes;
}

/** Minutes back to `HH:mm`, for arithmetic the screen does on a span. */
export function toClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * How long a block runs, in minutes, midnight crossing included.
 *
 * Used for the diner-facing preview and for overlap detection, both of which
 * are wrong by a whole day if a bar that shuts at 01:00 is treated as closing
 * before it opened.
 */
export function blockMinutes(block: HoursBlock): number {
  const opens = toMinutes(block.opensAt);
  const closes = toMinutes(block.closesAt);
  if (opens < 0 || closes < 0) return 0;
  return closes <= opens ? 1440 - opens + closes : closes - opens;
}

// ---------------------------------------------------------------------------
// The reservation policy
// ---------------------------------------------------------------------------

/**
 * Every field of `ReservationPolicy`, in the client's own vocabulary.
 *
 * Names match the wire because renaming them here would mean a mapping table
 * nobody could check against the server's own bounds messages, which name the
 * fields in prose. What the screen adds is a sentence per field explaining what
 * a diner or a waiter actually experiences — see `policyFields.ts` in the app.
 */
export interface ReservationPolicy {
  /** How long a table is held for a booking. Derives the booking's end time. */
  readonly turnTimeMinutes: number;
  /** Turnaround padding around a booking when testing for overlaps. */
  readonly bufferMinutes: number;
  /** How long a late party keeps its table before it may be released. */
  readonly graceMinutes: number;
  /** How long past the start before the diner is nudged to confirm. */
  readonly lateNudgeAfterMinutes: number;
  /** What one "we're on our way" tap buys them. */
  readonly graceExtensionMinutes: number;
  /** How soon before a slot a booking may still be made. */
  readonly minLeadMinutes: number;
  /** How far ahead the calendar goes. */
  readonly bookingWindowDays: number;
  /** How long before the start a diner may cancel without it counting. */
  readonly cancellationDeadlineMinutes: number;
  /** How close to a booking a walk-in may be seated before staff are warned. */
  readonly walkInHoldbackMinutes: number;
  /** False sends every booking to a human. */
  readonly autoConfirm: boolean;
  /** Above this many people a booking waits for approval. Null: never. */
  readonly approvalRequiredAbovePartySize: number | null;
  /** How many over a table's seat count may be seated. Null: no limit. */
  readonly maxSeatOverhang: number | null;
  /** On every bill as its own line, from the first item. */
  readonly serviceChargePercent: number;
  readonly pricesIncludeVat: boolean;
}

/**
 * What saving a policy did.
 *
 * `affectedExistingReservations` is the surprising part and the reason this is
 * not a toast. **A settings edit never rewrites or cancels a booking**: the
 * count is bookings that would not have been allowed under the new rules and
 * that stand anyway. Somebody has to know, and has to be able to look at them.
 */
export interface PolicyChangeResult {
  readonly policy: ReservationPolicy;
  readonly affectedExistingReservations: number;
  readonly affectedReservationIds: readonly string[];
}

/**
 * The bounds `ReservationPolicyLimits` enforces server-side.
 *
 * Mirrored here so a value can be marked before the request rather than only
 * after — but the client is **never stricter**, and never clamps. The server
 * refuses with a sentence naming the field, and that sentence is what the
 * screen shows: a client that silently corrected a number to something the
 * owner did not choose is worse than one that says no.
 */
export const POLICY_BOUNDS = {
  turnTimeMinutes: { min: 15, max: 6 * 60 },
  bufferMinutes: { min: 0, max: 3 * 60 },
  graceMinutes: { min: 0, max: 3 * 60 },
  lateNudgeAfterMinutes: { min: 0, max: 3 * 60 },
  graceExtensionMinutes: { min: 0, max: 3 * 60 },
  minLeadMinutes: { min: 0, max: 7 * 24 * 60 },
  bookingWindowDays: { min: 1, max: 365 },
  cancellationDeadlineMinutes: { min: 0, max: 14 * 24 * 60 },
  walkInHoldbackMinutes: { min: 0, max: 4 * 60 },
  serviceChargePercent: { min: 0, max: 100 },
} as const satisfies Partial<Record<keyof ReservationPolicy, { min: number; max: number }>>;

export type BoundedPolicyField = keyof typeof POLICY_BOUNDS;

/**
 * What ships, so an owner who changed turn time to 45 and watched bookings
 * collapse has a way back.
 *
 * `ReservationPolicy.DefaultFor` differs by venue type in exactly one field: a
 * cafe holds a table for two hours and a restaurant for ninety minutes. Every
 * other default is shared, so the shape is one object with the turn time
 * supplied.
 */
export function defaultPolicyFor(venueType: 'cafe' | 'restaurant'): ReservationPolicy {
  return {
    turnTimeMinutes: venueType === 'cafe' ? 120 : 90,
    bufferMinutes: 15,
    graceMinutes: 15,
    lateNudgeAfterMinutes: 10,
    graceExtensionMinutes: 10,
    minLeadMinutes: 30,
    bookingWindowDays: 14,
    cancellationDeadlineMinutes: 120,
    walkInHoldbackMinutes: 30,
    autoConfirm: true,
    approvalRequiredAbovePartySize: 8,
    maxSeatOverhang: 2,
    serviceChargePercent: 10,
    pricesIncludeVat: true,
  };
}
