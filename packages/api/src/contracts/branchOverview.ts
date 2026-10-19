import type { SpecialDay } from './branchSettings';
import type { ReservationStatusCode } from './push';
import type { TableStatus } from './service';

/**
 * A branch's today, in one read: what the venue console's Overview shows
 * under the approvals (docs/design/venue-console, Main artboard).
 *
 * `GET /api/branches/{branchId}/overview` — an owner or a general manager at
 * any branch of their venue, a branch manager at their own. "Today" is always
 * the branch's own calendar day in its time zone, now; the read takes no
 * parameters. Polled like the approvals list, and read again after every
 * booking action.
 *
 * Every number is the server's. The screen formats them and never adds them
 * up again: the counts by status, the people in the room and the revenue are
 * each defined by one query on the server (the same "a tab counts when it
 * closes" as the revenue report), and a second definition here would drift.
 */
export interface BranchOverview {
  readonly branchId: string;
  readonly timeZoneId: string;
  /** The server's now: "updated 18:42". */
  readonly asOfUtc: string;
  /** The branch's calendar day now, `YYYY-MM-DD`. */
  readonly localDate: string;
  /**
   * The service day the overview is about. The same as `localDate` but after
   * midnight at a branch still open from the evening: then it is still the
   * evening's day, and the bookings after midnight belong to it.
   */
  readonly serviceDate: string;
  /** The branch's wall clock now, `HH:mm:ss`; its hour is the load chart's "now". */
  readonly localTime: string;
  readonly hours: OverviewHours;
  readonly bookings: OverviewBookingCounts;
  readonly inRoom: OverviewInRoom;
  readonly openTabs: OverviewOpenTabs;
  readonly revenue: OverviewRevenue;
  readonly load: OverviewLoad;
  /** Every booking of today, any status, by start time. At most 200. */
  readonly todayBookings: readonly OverviewBooking[];
  /** More than 200 today: the list is the first 200, and the screen says so. */
  readonly todayBookingsTruncated: boolean;
  /**
   * How long past its start the branch holds a late party's table (the
   * policy's grace). "Late" is still any confirmed booking past its start, as
   * the design shows; a no-show is offered once this is up.
   */
  readonly graceMinutes: number;
}

/** The header pill: "Open until 00:00", or "Closed · opens at 12:00". */
export interface OverviewHours {
  readonly isOpen: boolean;
  /** While open: when the current block closes, `HH:mm:ss`. */
  readonly closesAt: string | null;
  /** With `closesAt`: the close is after midnight. */
  readonly closesNextDay: boolean;
  /** While closed: the next opening later today, `HH:mm:ss`; `null` when there is none. */
  readonly opensAt: string | null;
  /**
   * The service date's special day, when it is one — a holiday's hours or a
   * closure, which replace the week's for the date. `null` on an ordinary day.
   */
  readonly specialDay: SpecialDay | null;
}

/** Today's bookings by status. Cancelled ones are counted apart and not in `total`. */
export interface OverviewBookingCounts {
  /** Waiting, confirmed, seated, completed and no-show: what the day actually holds. */
  readonly total: number;
  readonly pendingApproval: number;
  /** Late ones included. */
  readonly confirmed: number;
  /** Confirmed, started, nobody seated yet: a subset of `confirmed`. */
  readonly late: number;
  readonly seated: number;
  readonly completed: number;
  readonly noShow: number;
  /** By the diner or by the venue, declined requests included. */
  readonly cancelled: number;
  /** The party sizes of waiting, confirmed, seated and completed bookings. */
  readonly people: number;
  /** Of `confirmed`: bookings whose guest asked to change them, waiting for an answer. */
  readonly pendingChanges: number;
}

/** "34 people · 9 tables of 22". */
export interface OverviewInRoom {
  /** Party sizes of the sittings open now. */
  readonly people: number;
  readonly occupiedTables: number;
  /** Active tables, out of service included. */
  readonly tables: number;
  readonly outOfServiceTables: number;
}

/** "11 open tabs · ֏ 214 500 still unpaid". */
export interface OverviewOpenTabs {
  readonly count: number;
  /** What those tabs still owe, whole dram, as the server worked it out. */
  readonly unpaidAmd: number;
}

/** "֏ 486 000 · ↑ 8 %", against the same weekday a week ago up to the same time of day. */
export interface OverviewRevenue {
  readonly todayAmd: number;
  readonly lastWeekAmd: number;
  /** That day, `YYYY-MM-DD`. */
  readonly lastWeekDate: string;
  /** One decimal; `null` when last week had nothing to compare with. */
  readonly changePercent: number | null;
  /**
   * Where today's takings are counted from: the service day's first opening
   * (its midnight when it has no hours). Last week is counted from the same
   * opening, for as long on the clock.
   */
  readonly sinceUtc: string;
}

/** Booked people per hour today, and the seats the room has: the dashed line. */
export interface OverviewLoad {
  /** Seats at the active tables in service. */
  readonly capacity: number;
  /**
   * Contiguous hours of the service day, earliest first; empty on a day with
   * nothing booked. Past midnight they run on: 24 is 00:00 of the next day.
   */
  readonly hours: readonly OverviewLoadHour[];
}

export interface OverviewLoadHour {
  /** The hour of the service day: 0–23, then 24, 25… for 00:00, 01:00 of the next day. */
  readonly hour: number;
  /** Confirmed, seated and finished parties whose sitting touches the hour. */
  readonly people: number;
  /** Requests not yet answered whose sitting touches it: not in `people`. */
  readonly pendingPeople: number;
}

/**
 * `ReservationChannel`: where the booking came from. `staff` is one a person
 * entered — a phone call, somebody at the door.
 */
export type ReservationChannel = 'app' | 'web' | 'staff' | 'unknown';

/** One row of today's bookings. */
export interface OverviewBooking {
  readonly id: string;
  readonly code: string;
  readonly status: ReservationStatusCode;
  readonly startUtc: string;
  readonly endUtc: string;
  /** The start's calendar day at the branch: the service day's, or the next after midnight. */
  readonly localDate: string;
  /** Wall clock at the branch, `HH:mm:ss`. */
  readonly localStartTime: string;
  readonly partySize: number;
  readonly guestName: string;
  readonly tableId: string;
  readonly tableLabel: string;
  /** The table's physical status now; `null` for a value this build does not know. */
  readonly tableStatus: TableStatus | null;
  readonly roomName: string | null;
  readonly channel: ReservationChannel;
  /**
   * A confirmed booking whose guest asked to move it, at short notice: until
   * the venue answers in the approvals card it is listed at the slot it keeps,
   * as `pendingApproval`, and counted as confirmed. Nothing can be done to it
   * from its row — seat, no-show and release are refused until it is answered.
   */
  readonly changeRequested: boolean;
  /** While a late booking's table is still held for it (confirmed rows only). */
  readonly holdExpiresAtUtc: string | null;
  /**
   * The app's "still coming?" to the guest (confirmed rows only): when it went
   * out, or when it is due. `null` when none is stored — a guest with no app
   * account is never asked.
   */
  readonly lateNudgeAtUtc: string | null;
  /** With `lateNudgeAtUtc`: whether it went out (true) or is still due (false). */
  readonly lateNudgeSent: boolean | null;
}

/**
 * What a row is, for the screen: its status, with "late" split out of
 * "confirmed" — confirmed, started, and nobody seated — a confirmed booking
 * whose change waits split out of "pending", and every cancellation one
 * state. The server lists no cancelled or declined booking; `cancelled` is a
 * row the venue has just called off, until the next read drops it. A status
 * this build does not know is `unknown`: shown, with nothing offered on it.
 */
export type OverviewRowState =
  | 'pending'
  | 'changeRequested'
  | 'confirmed'
  | 'late'
  | 'seated'
  | 'completed'
  | 'noShow'
  | 'cancelled'
  | 'unknown';

export function overviewRowState(booking: OverviewBooking, now: Date): OverviewRowState {
  switch (booking.status) {
    case 'pendingApproval':
      return booking.changeRequested ? 'changeRequested' : 'pending';
    case 'confirmed':
      return Date.parse(booking.startUtc) <= now.getTime() ? 'late' : 'confirmed';
    case 'seated':
      return 'seated';
    case 'completed':
      return 'completed';
    case 'noShow':
      return 'noShow';
    case 'cancelledByDiner':
    case 'cancelledByVenue':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

/**
 * Whole minutes since a late booking was due; never negative. "Late" is any
 * confirmed booking past its start, as the design shows; a no-show is offered
 * only once the policy's grace is up (see the Overview's row menu).
 */
export function minutesLate(booking: OverviewBooking, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(booking.startUtc)) / 60_000));
}

// ---------------------------------------------------------------------------
// Acting on a booking from the console
// ---------------------------------------------------------------------------

/**
 * The Overview row menu's four actions (venue HANDOFF section 6: the console
 * token may call them, an owner and a general manager at any branch of their
 * venue, a branch manager at their own). Each is an existing route:
 *
 * | action   | route | what it does |
 * |---|---|---|
 * | `seat`   | `POST /api/branches/{b}/tables/{t}/seat-reservation` | the party is here |
 * | `noShow` | `POST /api/reservations/{id}/no-show` | nobody came: counts against the diner, frees a held table |
 * | `cancel` | `POST /api/reservations/{id}/release`, outcome 2 | the venue calls it off: does **not** count as a no-show; the diner is told |
 * | `finish` | `POST /api/branches/{b}/tables/{t}/free`, naming the booking | its sitting is over and the table free |
 *
 * `finish` names the booking, so a row read before somebody else's party sat
 * down never ends theirs: the server refuses with `table-sitting-changed`.
 * There is no "ask whether they are coming": the app asks by itself at
 * `lateNudgeAtUtc`, and the backend has no manual nudge.
 */
export type ConsoleBookingActionKind = 'seat' | 'noShow' | 'cancel' | 'finish';

export interface ConsoleBookingActionCommand {
  readonly kind: ConsoleBookingActionKind;
  readonly branchId: string;
  readonly reservationId: string;
  readonly tableId: string;
  /** One per click, reused on a retry: a repeat is replayed, not applied twice. */
  readonly clientCommandId: string;
}

export interface ConsoleBookingActionResult {
  readonly kind: ConsoleBookingActionKind;
  readonly reservationId: string;
  /**
   * Where the booking stands now, as the server answered: for a release, the
   * booking's own status — on a replay, what it was released as the first
   * time, which need not be what this click asked for.
   */
  readonly status: ReservationStatusCode;
  /** The command had already been applied; this is the first answer again. */
  readonly wasReplay: boolean;
  readonly tableLabel: string;
  /**
   * Whether the table is free now. A no-show or a cancellation frees it only
   * when it was held for this booking; one somebody else sits at is left alone.
   */
  readonly tableFreed: boolean;
  /** Finishing a sitting with money still owed on its tab: how much. */
  readonly outstandingDram: number | null;
}

/** The status a table action leaves the booking in. A release answers its own. */
export const STATUS_AFTER: Readonly<Record<ConsoleBookingActionKind, ReservationStatusCode>> = {
  seat: 'seated',
  noShow: 'noShow',
  cancel: 'cancelledByVenue',
  finish: 'completed',
};
