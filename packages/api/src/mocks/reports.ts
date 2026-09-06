import type {
  AdjustmentLine,
  Compared,
  DurationBucket,
  LeadTimeBucket,
  MenuItemPerformance,
  MenuReport,
  OccupancyReport,
  ReportExport,
  ReportQuery,
  ReportScope,
  ReportSection,
  ReservationReport,
  RevenueReport,
  StaffReport,
  VoidLine,
} from '../contracts/reports';
import { ReportRangeTooLongError } from '../contracts/errors';
import { REPORT_MAX_DAYS } from '../contracts/reports';

/**
 * A venue's trading history, invented deterministically.
 *
 * Every number here is a pure function of the branch id and the local date, so
 * the same range always answers the same way — a report screen whose numbers
 * moved between renders would make every visual check meaningless, and a test
 * asserting on "last week" would be asserting on a dice roll.
 *
 * The shape is chosen to put the screen in the states that are hard to get
 * right rather than the state that is easy:
 *
 * - **The venue goes live mid-history** ({@link MOCK_LIVE_FROM}), so a range
 *   that straddles it shows a ramp, and a range whose *previous* period is
 *   entirely before it has no comparison at all. Both are states a real pilot
 *   spends its first month in and both are where report screens usually look
 *   broken.
 * - **Real sittings run past the policy.** The median is deliberately over the
 *   120-minute default, because the turn-time block is the one finding in this
 *   whole section a venue cannot get anywhere else, and a fixture where policy
 *   and reality agreed would render the interesting case never.
 * - **Top by count and top by revenue are different lists**, which is the
 *   entire argument for showing both.
 */

/**
 * The first local date this mock venue traded on.
 *
 * Exported so a test can straddle it deliberately rather than by picking dates
 * and hoping. Before this date every measure is zero and no sitting exists —
 * not "small numbers", genuinely nothing, which is what a branch that had not
 * opened yet looks like.
 */
export const MOCK_LIVE_FROM = '2026-08-20';

/** The default turn time the reservation policy ships with, in minutes. */
const POLICY_TURN_MINUTES = 120;

// --- Determinism -------------------------------------------------------------

/** FNV-1a. Small, stable, and not trying to be a hash function for anything real. */
function hash(seed: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    value ^= seed.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** A stable pseudo-random integer in `[min, max]` for this seed. */
function pick(seed: string, min: number, max: number): number {
  return min + (hash(seed) % (max - min + 1));
}

// --- Dates -------------------------------------------------------------------

function toDayNumber(isoDate: string): number {
  return Math.round(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
}

function fromDayNumber(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** Every local date in an inclusive range. */
function datesIn(from: string, to: string): string[] {
  const start = toDayNumber(from);
  const end = toDayNumber(to);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, i) => fromDayNumber(start + i));
}

/** 0 = Sunday, matching `Date#getUTCDay` and the wire's `DayOfWeek`. */
function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/**
 * The equivalent range immediately before this one.
 *
 * The same number of days, ending the day before this one starts — exactly
 * `ReportRange.Previous()` on the server. A comparison against a
 * different-length period would be worse than no comparison, because it looks
 * like a like-for-like.
 */
function previousRange(from: string, to: string): { from: string; to: string } {
  const days = toDayNumber(to) - toDayNumber(from) + 1;
  return {
    from: fromDayNumber(toDayNumber(from) - days),
    to: fromDayNumber(toDayNumber(from) - 1),
  };
}

// --- One trading day ---------------------------------------------------------

interface TradingDay {
  readonly date: string;
  readonly sessions: number;
  readonly covers: number;
  readonly revenueAmd: number;
  readonly tabs: number;
  readonly walkIns: number;
  readonly booked: number;
  readonly seated: number;
  readonly cancelled: number;
  readonly noShow: number;
  readonly lateCancellations: number;
  readonly webWithoutApp: number;
  readonly ordersEntered: number;
}

const CLOSED: Omit<TradingDay, 'date'> = {
  sessions: 0,
  covers: 0,
  revenueAmd: 0,
  tabs: 0,
  walkIns: 0,
  booked: 0,
  seated: 0,
  cancelled: 0,
  noShow: 0,
  lateCancellations: 0,
  webWithoutApp: 0,
  ordersEntered: 0,
};

function tradingDay(branchId: string, date: string): TradingDay {
  // Before the venue opened there is nothing — not a quiet day, no day at all.
  if (date < MOCK_LIVE_FROM) return { date, ...CLOSED };

  const seed = `${branchId}|${date}`;
  const weekday = weekdayOf(date);
  // Friday and Saturday are the week. A flat fixture would hide the point of
  // the by-weekday chart, which exists to tell a venue when to staff.
  const busy = weekday === 5 || weekday === 6 ? 1.6 : weekday === 0 ? 1.2 : 1;

  const sessions = Math.round(pick(`${seed}|s`, 14, 30) * busy);
  const covers = Math.round(sessions * (pick(`${seed}|c`, 20, 34) / 10));
  const tabs = Math.max(1, sessions - pick(`${seed}|t`, 0, 3));
  const revenueAmd = covers * pick(`${seed}|r`, 3200, 7400);

  const booked = Math.round(sessions * (pick(`${seed}|b`, 30, 55) / 100));
  const cancelled = Math.round(booked * (pick(`${seed}|x`, 4, 14) / 100));
  const noShow = Math.round(booked * (pick(`${seed}|n`, 2, 9) / 100));

  return {
    date,
    sessions,
    covers,
    revenueAmd,
    tabs,
    walkIns: sessions - booked,
    booked,
    seated: booked - cancelled - noShow,
    cancelled,
    noShow,
    lateCancellations: Math.round(cancelled * (pick(`${seed}|l`, 20, 60) / 100)),
    // Deliberately a meaningful share: this is the number that decides whether
    // an SMS channel is worth paying for, and a fixture that made it 1 would
    // render the block as a curiosity rather than a question.
    webWithoutApp: Math.round(booked * (pick(`${seed}|w`, 25, 55) / 100)),
    ordersEntered: sessions * pick(`${seed}|o`, 2, 5),
  };
}

function daysFor(branchIds: readonly string[], from: string, to: string): TradingDay[] {
  return datesIn(from, to).map((date) => {
    // A rollup is the venue's branches added together, which is what an owner
    // means by "all branches" and what the server does.
    const each = branchIds.map((branchId) => tradingDay(branchId, date));
    return each.reduce<TradingDay>(
      (total, day) => ({
        date,
        sessions: total.sessions + day.sessions,
        covers: total.covers + day.covers,
        revenueAmd: total.revenueAmd + day.revenueAmd,
        tabs: total.tabs + day.tabs,
        walkIns: total.walkIns + day.walkIns,
        booked: total.booked + day.booked,
        seated: total.seated + day.seated,
        cancelled: total.cancelled + day.cancelled,
        noShow: total.noShow + day.noShow,
        lateCancellations: total.lateCancellations + day.lateCancellations,
        webWithoutApp: total.webWithoutApp + day.webWithoutApp,
        ordersEntered: total.ordersEntered + day.ordersEntered,
      }),
      { date, ...CLOSED },
    );
  });
}

const sum = (days: readonly TradingDay[], of: (day: TradingDay) => number): number =>
  days.reduce((total, day) => total + of(day), 0);

// --- Comparisons -------------------------------------------------------------

/**
 * A measure beside the previous equivalent period.
 *
 * `previous` is **null, not zero**, when the prior period has no trading in it
 * at all. That is the rule the whole comparison story rests on: a venue's first
 * week has no previous week, and rendering "down 100%" against a period that
 * did not exist is a lie the screen would state confidently.
 */
function compare(
  current: readonly TradingDay[],
  prior: readonly TradingDay[],
  of: (day: TradingDay) => number,
): Compared {
  const value = sum(current, of);
  const hadTrading = prior.some((day) => day.sessions > 0);
  if (!hadTrading) return { value, previous: null, changeFraction: null };

  const previous = sum(prior, of);
  return {
    value,
    previous,
    // Null rather than infinity: growth from nothing has no percentage.
    changeFraction: previous === 0 ? null : (value - previous) / previous,
  };
}

/** A rate, which averages rather than sums. */
function compareRate(
  current: readonly TradingDay[],
  prior: readonly TradingDay[],
  numerator: (day: TradingDay) => number,
  denominator: (day: TradingDay) => number,
): Compared {
  const rate = (days: readonly TradingDay[]): number => {
    const bottom = sum(days, denominator);
    return bottom === 0 ? 0 : sum(days, numerator) / bottom;
  };

  const value = rate(current);
  if (!prior.some((day) => day.sessions > 0)) {
    return { value, previous: null, changeFraction: null };
  }
  const previous = rate(prior);
  return {
    value,
    previous,
    changeFraction: previous === 0 ? null : (value - previous) / previous,
  };
}

// --- The world -----------------------------------------------------------------

/** One menu item the report generator can talk about. */
export interface MockReportMenuItem {
  readonly id: string;
  readonly name: string;
  readonly categoryName: string;
  readonly priceDram: number;
}

export interface MockReportWorld {
  /** The branch's own menu, so `neverOrdered` names rows the editor actually has. */
  readonly menuOf: (branchId: string) => readonly MockReportMenuItem[];
  /** Every branch a rollup covers, or just this one. */
  readonly branchIdsFor: (branchId: string, rollUpVenue: boolean) => readonly string[];
  readonly timeZoneOf: (branchId: string) => string;
}

export interface MockReports {
  occupancy: (query: ReportQuery) => OccupancyReport;
  reservations: (query: ReportQuery) => ReservationReport;
  revenue: (query: ReportQuery) => RevenueReport;
  menu: (query: ReportQuery) => MenuReport;
  staff: (query: ReportQuery) => StaffReport;
  csv: (input: ReportQuery & { section: ReportSection }) => ReportExport;
}

export function createMockReports(world: MockReportWorld): MockReports {
  /** The range, checked against the same cap the server enforces. */
  function ranged(query: ReportQuery) {
    const days = toDayNumber(query.to) - toDayNumber(query.from) + 1;
    if (days > REPORT_MAX_DAYS) {
      throw new ReportRangeTooLongError({
        url: 'mock://yalla',
        requestedDays: days,
        maxDays: REPORT_MAX_DAYS,
      });
    }

    const branchIds = world.branchIdsFor(query.branchId, query.rollUpVenue ?? false);
    const prior = previousRange(query.from, query.to);

    return {
      branchIds,
      current: daysFor(branchIds, query.from, query.to),
      prior: daysFor(branchIds, prior.from, prior.to),
      scope: {
        branchIds,
        fromLocalDate: query.from,
        toLocalDate: query.to,
        timeZoneId: world.timeZoneOf(query.branchId),
      } satisfies ReportScope,
    };
  }

  /**
   * Where the sittings actually fell, hour by hour.
   *
   * Counted in **every hour a sitting spans**, as the server does. Counting
   * arrivals instead would make a restaurant look empty at exactly its busiest
   * hour, which is the hour the chart exists to find.
   */
  function byHour(days: readonly TradingDay[]): { hour: number; sessions: number }[] {
    const shape = [0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 5, 9, 11, 8, 5, 4, 6, 10, 14, 15, 11, 6, 2];
    const total = shape.reduce((a, b) => a + b, 0);
    const sessions = sum(days, (day) => day.sessions);
    return shape.map((weight, hour) => ({
      hour,
      sessions: Math.round((sessions * weight) / total),
    }));
  }

  /**
   * How long people actually stayed.
   *
   * Weighted past the 120-minute policy on purpose. This is the block that
   * tells a venue it is refusing bookings it could take, and a fixture whose
   * median landed neatly on the policy would render the finding never.
   */
  function turnTimeBuckets(sessions: number): DurationBucket[] {
    const shape: readonly [number, number][] = [
      [30, 2],
      [60, 6],
      [90, 14],
      [120, 21],
      [150, 24],
      [180, 17],
      [240, 11],
      [480, 5],
    ];
    const total = shape.reduce((a, [, weight]) => a + weight, 0);
    return shape.map(([upToMinutes, weight]) => ({
      upToMinutes,
      sessions: Math.round((sessions * weight) / total),
    }));
  }

  /** Nearest-rank, as the server computes it: a real minute somebody sat for. */
  function percentile(buckets: readonly DurationBucket[], fraction: number): number | null {
    const total = buckets.reduce((a, b) => a + b.sessions, 0);
    if (total === 0) return null;
    const target = Math.ceil(total * fraction);
    let seen = 0;
    for (const bucket of buckets) {
      seen += bucket.sessions;
      if (seen >= target) return bucket.upToMinutes;
    }
    return buckets[buckets.length - 1]?.upToMinutes ?? null;
  }

  function leadTimeBuckets(booked: number): LeadTimeBucket[] {
    const shape: readonly [number, number][] = [
      [2, 18],
      [6, 22],
      [12, 16],
      [24, 20],
      [48, 12],
      [72, 7],
      [168, 4],
      [720, 1],
    ];
    const total = shape.reduce((a, [, weight]) => a + weight, 0);
    return shape.map(([upToHours, weight]) => ({
      upToHours,
      bookings: Math.round((booked * weight) / total),
    }));
  }

  return {
    occupancy(query) {
      const { current, prior, scope } = ranged(query);
      const sessions = sum(current, (day) => day.sessions);
      const buckets = turnTimeBuckets(sessions);
      const overPolicy = buckets
        .filter((bucket) => bucket.upToMinutes > POLICY_TURN_MINUTES)
        .reduce((a, b) => a + b.sessions, 0);

      return {
        scope,
        sessions: compare(current, prior, (day) => day.sessions),
        byHour: byHour(current),
        byWeekday: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
          day,
          sessions: sum(
            current.filter((entry) => weekdayOf(entry.date) === day),
            (entry) => entry.sessions,
          ),
        })),
        turnTime: {
          policyTurnTimeMinutes: POLICY_TURN_MINUTES,
          medianMinutes: percentile(buckets, 0.5),
          p90Minutes: percentile(buckets, 0.9),
          buckets,
          overPolicyFraction: sessions === 0 ? 0 : overPolicy / sessions,
          closedSessions: sessions,
        },
        seatsFilled: compare(current, prior, (day) => day.covers),
        seatsAvailable: scope.branchIds.length * 22 * current.length,
        walkIns: compare(current, prior, (day) => day.walkIns),
        fromReservations: compare(current, prior, (day) => day.booked),
      };
    },

    reservations(query) {
      const { current, prior, scope } = ranged(query);
      return {
        scope,
        booked: compare(current, prior, (day) => day.booked),
        seated: compare(current, prior, (day) => day.seated),
        cancelled: compare(current, prior, (day) => day.cancelled),
        noShow: compare(current, prior, (day) => day.noShow),
        noShowRate: compareRate(
          current,
          prior,
          (day) => day.noShow,
          (day) => day.booked,
        ),
        cancellationRate: compareRate(
          current,
          prior,
          (day) => day.cancelled,
          (day) => day.booked,
        ),
        lateCancellations: compare(current, prior, (day) => day.lateCancellations),
        leadTime: leadTimeBuckets(sum(current, (day) => day.booked)),
        webBookingsWithoutAnApp: compare(current, prior, (day) => day.webWithoutApp),
      };
    },

    revenue(query) {
      const { current, prior, scope } = ranged(query);
      const revenue = sum(current, (day) => day.revenueAmd);
      const tabs = sum(current, (day) => day.tabs);
      const covers = sum(current, (day) => day.covers);

      const priorRevenue = sum(prior, (day) => day.revenueAmd);
      const priorTabs = sum(prior, (day) => day.tabs);
      const priorCovers = sum(prior, (day) => day.covers);
      const hadPrior = prior.some((day) => day.sessions > 0);

      /** An average is a ratio of two sums, never a mean of daily averages. */
      const average = (top: number, bottom: number, priorTop: number, priorBottom: number) => {
        const value = bottom === 0 ? 0 : Math.round(top / bottom);
        if (!hadPrior) return { value, previous: null, changeFraction: null };
        const previous = priorBottom === 0 ? 0 : Math.round(priorTop / priorBottom);
        return {
          value,
          previous,
          changeFraction: previous === 0 ? null : (value - previous) / previous,
        };
      };

      const hourShape = [
        0, 0, 0, 0, 0, 0, 0, 1, 3, 3, 4, 6, 11, 13, 7, 4, 4, 7, 12, 16, 17, 12, 6, 2,
      ];
      const hourTotal = hourShape.reduce((a, b) => a + b, 0);

      return {
        scope,
        totalAmd: compare(current, prior, (day) => day.revenueAmd),
        // A tenth, the default service charge, and rounded to whole dram
        // because dram has no minor unit and a fraction of one is not money.
        serviceChargeAmd: compare(current, prior, (day) => Math.round(day.revenueAmd * 0.1)),
        averageTabAmd: average(revenue, tabs, priorRevenue, priorTabs),
        averagePerHeadAmd: average(revenue, covers, priorRevenue, priorCovers),
        /*
         * Sparse, as the server's is.
         *
         * `ByDay` on the backend groups the tabs that actually closed, so a day
         * with no takings produces no row. The mock used to emit a row per day
         * in the range — which made the reports screen's assumption that every
         * day is present look correct, right up until it met a real backend.
         * Same failure mode as the availability bug: the double agreeing with
         * the client instead of with the server.
         */
        byDay: current
          .filter((day) => day.tabs > 0)
          .map((day) => ({
            localDate: day.date,
            revenueAmd: day.revenueAmd,
            tabs: day.tabs,
          })),
        byHour: hourShape.map((weight, hour) => ({
          hour,
          revenueAmd: Math.round((revenue * weight) / hourTotal),
        })),
        // Everything is cash today, and that is the finding rather than a gap:
        // there is no wallet rail yet, so the column reads 100% cash and is
        // correct. It is here so the day one exists nothing has to change.
        cashAmd: compare(current, prior, (day) => day.revenueAmd),
        inAppAmd: compare(current, prior, () => 0),
        adjustments: adjustmentsFor(scope, revenue),
        adjustmentsTotalAmd: compare(current, prior, (day) => Math.round(day.revenueAmd * 0.021)),
      };
    },

    menu(query) {
      const { current, scope } = ranged(query);
      const items = world.menuOf(query.branchId);
      const orders = sum(current, (day) => day.ordersEntered);

      if (items.length === 0 || orders === 0) {
        return { scope, topByCount: [], topByRevenue: [], neverOrdered: [], voids: [] };
      }

      /*
       * Two thirds of the menu sells; the rest is the `neverOrdered` list.
       *
       * Chosen by a hash of the item id rather than by position, so the items
       * that never sell are scattered through the menu the way they are in a
       * real one — and so the list is stable across renders while not being
       * simply "the last four".
       */
      const sold = items.filter((item) => hash(item.id) % 3 !== 0);
      const neverOrdered = items.filter((item) => hash(item.id) % 3 === 0);

      const performance: MenuItemPerformance[] = sold.map((item) => {
        const quantity = Math.max(1, Math.round((orders * (pick(item.id, 2, 40) / 100)) / 4));
        return {
          menuItemId: item.id,
          name: item.name,
          categoryName: item.categoryName,
          quantity,
          revenueAmd: quantity * item.priceDram,
        };
      });

      return {
        scope,
        topByCount: [...performance].sort((a, b) => b.quantity - a.quantity).slice(0, 8),
        // A genuinely different order: the dish everyone orders and the dish
        // that makes the money are rarely the same, which is the whole reason
        // the screen shows two lists rather than one combined score.
        topByRevenue: [...performance].sort((a, b) => b.revenueAmd - a.revenueAmd).slice(0, 8),
        neverOrdered: neverOrdered.map((item) => ({
          menuItemId: item.id,
          name: item.name,
          categoryName: item.categoryName,
          quantity: 0,
          revenueAmd: 0,
        })),
        voids: voidsFor(sold, orders),
      };
    },

    staff(query) {
      const { current, prior, scope } = ranged(query);
      return {
        scope,
        ordersEntered: compare(current, prior, (day) => day.ordersEntered),
        tablesTurned: compare(current, prior, (day) => day.tabs),
        activeStaff: current.some((day) => day.sessions > 0) ? 6 : 0,
      };
    },

    csv(input) {
      const { section } = input;
      const rows = csvRowsFor(this, input);
      return {
        fileName: `${section}-${input.from}-to-${input.to}.csv`,
        contentType: 'text/csv; charset=utf-8',
        // \uFEFF spelled out rather than pasted: a literal BOM in source is
        // invisible, and every editor and formatter that touches this file is
        // entitled to strip it. Excel opens a BOM-less UTF-8 CSV in the system
        // code page, which turns every Armenian venue name into mojibake.
        bytes: new Blob([`\uFEFF${rows}`], { type: 'text/csv;charset=utf-8' }),
      };
    },
  };
}

// --- Fixtures that are not per-day --------------------------------------------

function adjustmentsFor(scope: ReportScope, revenue: number): AdjustmentLine[] {
  if (revenue === 0) return [];

  // Who authorised what. This is why adjustments are manager-only, and it is
  // the line an owner looks at first.
  return [
    {
      reason: 'Wrong order sent out',
      kind: 'comp' as const,
      staffMemberId: 'staff-anahit',
      staffName: 'Anahit G.',
      count: 3 + (hash(scope.fromLocalDate) % 5),
      totalAmd: Math.round(revenue * 0.008),
    },
    {
      reason: 'Regular — long wait',
      kind: 'discount' as const,
      staffMemberId: 'staff-davit',
      staffName: 'Davit M.',
      count: 2 + (hash(scope.toLocalDate) % 4),
      totalAmd: Math.round(revenue * 0.009),
    },
    {
      reason: 'Staff meal',
      kind: 'comp' as const,
      staffMemberId: 'staff-anahit',
      staffName: 'Anahit G.',
      count: 4 + (hash(`${scope.fromLocalDate}|meal`) % 6),
      totalAmd: Math.round(revenue * 0.004),
    },
  ].filter((line) => line.totalAmd > 0);
}

function voidsFor(sold: readonly MockReportMenuItem[], orders: number): VoidLine[] {
  const reasons = ['Sent back — cold', 'Wrong item', 'Guest changed mind', 'Kitchen error'];
  return sold
    .filter((item) => hash(`${item.id}|void`) % 5 === 0)
    .slice(0, 6)
    .map((item, index) => ({
      menuItemId: item.id,
      name: item.name,
      reason: reasons[index % reasons.length] ?? 'Wrong item',
      count: 1 + (hash(`${item.id}|n`) % Math.max(2, Math.round(orders / 120))),
    }));
}

// --- CSV -----------------------------------------------------------------------

/**
 * RFC 4180, and the same columns the server writes.
 *
 * The mock stands in for the server here, so it has to produce what the server
 * produces — same columns, same order, same escaping, same CRLF, same UTF-8 BOM
 * so Excel opens an Armenian venue name as words rather than mojibake. A mock
 * that emitted a friendlier CSV would let a client bug hide behind it.
 */
function escape(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n') + '\r\n';
}

/** A `Compared` as the server writes it: empty, never zero, when there is no prior. */
function comparedRow(measure: string, value: Compared): string[] {
  return [measure, String(value.value), value.previous === null ? '' : String(value.previous)];
}

function csvRowsFor(reports: MockReports, input: ReportQuery & { section: ReportSection }): string {
  switch (input.section) {
    case 'occupancy':
      return table(
        ['localHour', 'sessionsInProgress'],
        reports.occupancy(input).byHour.map((h) => [String(h.hour), String(h.sessions)]),
      );

    case 'reservations': {
      const report = reports.reservations(input);
      return table(
        ['measure', 'value', 'previous'],
        [
          comparedRow('booked', report.booked),
          comparedRow('seated', report.seated),
          comparedRow('cancelled', report.cancelled),
          comparedRow('noShow', report.noShow),
          comparedRow('lateCancellations', report.lateCancellations),
          comparedRow('webBookingsWithoutAnApp', report.webBookingsWithoutAnApp),
        ],
      );
    }

    case 'revenue':
      return table(
        ['localDate', 'revenueAmd', 'tabs'],
        reports
          .revenue(input)
          .byDay.map((day) => [day.localDate, String(day.revenueAmd), String(day.tabs)]),
      );

    case 'menu':
      return table(
        ['menuItemId', 'name', 'category', 'quantity', 'revenueAmd'],
        reports
          .menu(input)
          .topByRevenue.map((item) => [
            item.menuItemId,
            item.name,
            item.categoryName,
            String(item.quantity),
            String(item.revenueAmd),
          ]),
      );

    case 'staff': {
      const report = reports.staff(input);
      return table(
        ['measure', 'value', 'previous'],
        [
          comparedRow('ordersEntered', report.ordersEntered),
          comparedRow('tablesTurned', report.tablesTurned),
        ],
      );
    }
  }
}
