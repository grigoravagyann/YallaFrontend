import type { AdjustmentKind } from './ordering';

/**
 * The five report groups, as the console renders them.
 *
 * These mirror `Yalla.Application.Reports` closely and deliberately. A report
 * screen that reshapes the server's answer on the way in is a screen that can
 * disagree with the CSV the same server exports, and the export is the artefact
 * an owner forwards to an accountant — so where the wire and the screen could
 * differ, the wire wins.
 *
 * ## What is not here
 *
 * **Per-waiter anything.** The backend aggregates `StaffReport` across the
 * branch on purpose: the audit log has the per-person data, and a ranked list
 * of employees that renders itself every morning is a management decision made
 * on a venue's behalf by software. The client must not assemble one either, so
 * there is no shape here that could hold it.
 */

/**
 * One number, beside what it was over the previous equivalent period.
 *
 * `previous` and `changeFraction` are **independently nullable and both come
 * from the server**. Null is not zero: a venue's first week has no previous
 * week, and "down 100%" is a lie about it rather than a rounding of it. The
 * server also returns a null fraction when the previous period was zero,
 * because growth from nothing has no percentage.
 *
 * The client never divides. If `changeFraction` is absent there is no
 * comparison to draw, and the element is omitted rather than rendered at 0%.
 */
export interface Compared {
  readonly value: number;
  readonly previous: number | null;
  readonly changeFraction: number | null;
}

/** Which branches a report covered, and over what. */
export interface ReportScope {
  readonly branchIds: readonly string[];
  /** Inclusive, in the branch's own local dates — `YYYY-MM-DD`. */
  readonly fromLocalDate: string;
  readonly toLocalDate: string;
  /** The zone those local dates were interpreted in. */
  readonly timeZoneId: string;
}

// --- Occupancy ---------------------------------------------------------------

/** @param hour Local hour of day, 0–23. */
export interface HourBucket {
  readonly hour: number;
  /** Sittings in progress during that hour, not sittings that started in it. */
  readonly sessions: number;
}

export interface WeekdayBucket {
  /** 0 = Sunday, matching `DayOfWeek` on the wire and `Date#getDay` here. */
  readonly day: number;
  readonly sessions: number;
}

export interface DurationBucket {
  /** Top of this bucket in minutes; the last one is open-ended. */
  readonly upToMinutes: number;
  readonly sessions: number;
}

/**
 * How long parties actually stay, against what the policy assumes.
 *
 * The most useful block in the whole section, and the only place in the product
 * where a venue can see this at all. A cafe whose policy says 120 minutes and
 * whose real median is 165 is refusing a 20:00 booking because it believes the
 * 18:00 sitting ends at 20:00 — and half the time it does not. It is losing
 * bookings with no other way to find out.
 *
 * A distribution rather than an average, because an average hides exactly that:
 * a fast lunch and a slow dinner average to something plausible and describe
 * neither service.
 */
export interface TurnTimeDistribution {
  /** What the branch's reservation policy assumes. Drawn as a line on the chart. */
  readonly policyTurnTimeMinutes: number;
  /** The middle sitting, nearest-rank. Null when nothing closed in the period. */
  readonly medianMinutes: number | null;
  readonly p90Minutes: number | null;
  readonly buckets: readonly DurationBucket[];
  /** Fraction of sittings that ran past the policy. The number to put beside the chart. */
  readonly overPolicyFraction: number;
  /** How many sittings the distribution was computed from. Thin data shows here first. */
  readonly closedSessions: number;
}

export interface OccupancyReport {
  readonly scope: ReportScope;
  readonly sessions: Compared;
  readonly byHour: readonly HourBucket[];
  readonly byWeekday: readonly WeekdayBucket[];
  readonly turnTime: TurnTimeDistribution;
  /** Seats occupied across every sitting — the number a venue calls "covers". */
  readonly seatsFilled: Compared;
  /** Seats the room has, times the days in the period. */
  readonly seatsAvailable: number;
  readonly walkIns: Compared;
  readonly fromReservations: Compared;
}

// --- Reservations ------------------------------------------------------------

export interface LeadTimeBucket {
  /** Top of this bucket, in hours before the sitting. */
  readonly upToHours: number;
  readonly bookings: number;
}

export interface ReservationReport {
  readonly scope: ReportScope;
  readonly booked: Compared;
  readonly seated: Compared;
  readonly cancelled: Compared;
  readonly noShow: Compared;
  readonly noShowRate: Compared;
  readonly cancellationRate: Compared;
  /**
   * Called off inside the branch's own cancellation deadline. Its own number
   * because a table given up in time is resold and one given up at 19:50 is not.
   */
  readonly lateCancellations: Compared;
  /** What `bookingWindowDays` should actually be set from. */
  readonly leadTime: readonly LeadTimeBucket[];
  /**
   * Booked from the public page by somebody with no registered device.
   *
   * **These people cannot be reminded.** No app means no push channel, so the
   * reminder, the late nudge and one-tap cancel — the entire no-show story —
   * do not reach them. It is the number that decides whether an SMS or Telegram
   * channel is worth paying for, which is why it is labelled as a question
   * rather than left sitting as a curiosity.
   */
  readonly webBookingsWithoutAnApp: Compared;
}

// --- Revenue -----------------------------------------------------------------

export interface DailyRevenue {
  /** The branch's own day, `YYYY-MM-DD`. */
  readonly localDate: string;
  readonly revenueAmd: number;
  readonly tabs: number;
}

export interface HourlyRevenue {
  readonly hour: number;
  readonly revenueAmd: number;
}

export interface AdjustmentLine {
  /** What the manager typed. */
  readonly reason: string;
  readonly kind: AdjustmentKind;
  readonly staffMemberId: string;
  /** Who authorised it. This is why adjustments are manager-only. */
  readonly staffName: string;
  readonly count: number;
  readonly totalAmd: number;
}

export interface RevenueReport {
  readonly scope: ReportScope;
  readonly totalAmd: Compared;
  readonly serviceChargeAmd: Compared;
  readonly averageTabAmd: Compared;
  /** A different question from average tab, and the one a menu is priced against. */
  readonly averagePerHeadAmd: Compared;
  readonly byDay: readonly DailyRevenue[];
  readonly byHour: readonly HourlyRevenue[];
  readonly cashAmd: Compared;
  /** Zero until there is a wallet rail. Shown anyway, because 100% cash is the finding. */
  readonly inAppAmd: Compared;
  readonly adjustments: readonly AdjustmentLine[];
  readonly adjustmentsTotalAmd: Compared;
}

// --- Menu --------------------------------------------------------------------

export interface MenuItemPerformance {
  readonly menuItemId: string;
  /** Its name now, not the snapshot on the line. */
  readonly name: string;
  readonly categoryName: string;
  readonly quantity: number;
  readonly revenueAmd: number;
}

export interface VoidLine {
  readonly menuItemId: string;
  readonly name: string;
  /** Why it was taken off, in the waiter's words. */
  readonly reason: string;
  readonly count: number;
}

export interface MenuReport {
  readonly scope: ReportScope;
  readonly topByCount: readonly MenuItemPerformance[];
  /** Frequently a different list from `topByCount`, which is the point of showing both. */
  readonly topByRevenue: readonly MenuItemPerformance[];
  /**
   * Items with no line in the period at all.
   *
   * The one report that changes what a venue does tomorrow: a dish nobody
   * orders is inventory that spoils and menu space that could sell something
   * else, and no venue knows which those are — they are, by definition, the
   * ones nobody mentions.
   */
  readonly neverOrdered: readonly MenuItemPerformance[];
  readonly voids: readonly VoidLine[];
}

// --- Staff -------------------------------------------------------------------

/** Aggregated across the branch, deliberately never per person. */
export interface StaffReport {
  readonly scope: ReportScope;
  readonly ordersEntered: Compared;
  readonly tablesTurned: Compared;
  readonly activeStaff: number;
}

// --- Requests ----------------------------------------------------------------

/** Which report group a request or an export names. */
export type ReportSection = 'occupancy' | 'reservations' | 'revenue' | 'menu' | 'staff';

export const REPORT_SECTIONS: readonly ReportSection[] = [
  'occupancy',
  'reservations',
  'revenue',
  'menu',
  'staff',
];

export interface ReportQuery {
  readonly branchId: string;
  /** Inclusive local dates, `YYYY-MM-DD`. */
  readonly from: string;
  readonly to: string;
  /** Owner only: every branch of this branch's venue rather than this one alone. */
  readonly rollUpVenue?: boolean;
}

/** The longest range any report will run — `ReportRange.MaxDays` on the server. */
export const REPORT_MAX_DAYS = 366;

/**
 * A CSV exactly as the server produced it.
 *
 * Bytes, not rows. The client must never re-derive an export from the JSON it
 * happens to be rendering: the two would drift, and the file is the artefact
 * that leaves the building. If they ever disagree, the client is wrong by
 * definition — so the client does not get an opinion.
 */
export interface ReportExport {
  readonly fileName: string;
  /** `text/csv; charset=utf-8`, with the UTF-8 BOM Excel needs for Armenian. */
  readonly contentType: string;
  readonly bytes: Blob;
}
