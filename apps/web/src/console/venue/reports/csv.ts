import {
  OPEN_ENDED_BUCKET,
  type Compared,
  type MenuReport,
  type OccupancyReport,
  type ReportQuery,
  type ReservationReport,
  type RevenueReport,
} from '@yalla/api';

/**
 * One section's CSV, built from the JSON already on screen (VC5 wire §3:
 * decided client-side).
 *
 * The rules are the server's own `?format=csv` writer's, so a file made here
 * reads like one made there:
 *
 * - **UTF-8 with a BOM**, so Excel opens an Armenian dish name as words.
 * - **RFC 4180**: commas, CRLF, a field with a comma, a quote, a CR or an LF in
 *   quotes, and inner quotes doubled.
 * - **No formulas.** Text that starts with `=`, `+`, `-`, `@`, a tab or a CR
 *   gets a leading `'`: dish names and void reasons are typed by staff, and a
 *   spreadsheet would run one that starts with `=`. Never a number.
 * - **Locale-neutral numbers**: plain digits, a `.` decimal, no thousands
 *   separator and no currency sign; money in whole dram; a fraction as a
 *   decimal (0.61, never "61 %"); dates `YYYY-MM-DD`. A missing previous value
 *   is an empty cell, never 0.
 *
 * A section with several tables writes them one after another, a blank line
 * between, each under its own header of stable English column keys.
 */

export type CsvSection = 'summary' | 'revenue' | 'reservations' | 'occupancy' | 'menu';

export const CSV_SECTIONS: readonly CsvSection[] = [
  'summary',
  'revenue',
  'reservations',
  'occupancy',
  'menu',
];

type Cell = string | number | null;

const FORMULA_START = /^[=+\-@\t\r]/u;

/** One cell, escaped. Numbers as plain digits; null as an empty cell. */
export function csvCell(value: Cell): string {
  if (value === null) return '';
  if (typeof value === 'number') {
    // Plain digits and a `.`: no exponent, no grouping, at most 4 decimals.
    if (!Number.isFinite(value)) return '';
    return String(Math.round(value * 10_000) / 10_000);
  }
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function table(header: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** Tables one after another, a blank line between, the file ending in CRLF. */
function file(...tables: readonly string[]): string {
  return `${tables.join('\r\n\r\n')}\r\n`;
}

/** A compared measure's row: `measure,value,previous,changeFraction`. */
function measure(name: string, value: Compared | null): Cell[] {
  if (!value) return [name, null, null, null];
  return [name, value.value, value.previous, value.changeFraction];
}

const MEASURE_HEADER = ['measure', 'value', 'previous', 'changeFraction'] as const;

/** A bucket's two ends; the open-ended last one has no top. */
function bucketEnds(tops: readonly number[], index: number): [number, number | null] {
  const top = tops[index] ?? 0;
  return [index === 0 ? 0 : (tops[index - 1] ?? 0), top === OPEN_ENDED_BUCKET ? null : top];
}

export function summaryCsv(occupancy: OccupancyReport, revenue: RevenueReport): string {
  return file(
    table(MEASURE_HEADER, [
      measure('guests', occupancy.seatsFilled),
      measure('revenueAmd', revenue.totalAmd),
      measure('tabsClosed', revenue.tabs),
      measure('averageTabAmd', revenue.averageTabAmd),
      measure('averagePerHeadAmd', revenue.averagePerHeadAmd),
      measure('turnsPerTable', occupancy.turnsPerTable),
    ]),
  );
}

export function revenueCsv(report: RevenueReport): string {
  const previous = report.previousByDay;
  return file(
    table(
      [
        'localDate',
        'revenueAmd',
        'tabs',
        'previousLocalDate',
        'previousRevenueAmd',
        'previousTabs',
      ],
      report.byDay.map((day, index) => {
        const before = previous?.[index];
        return [
          day.localDate,
          Math.round(day.revenueAmd),
          day.tabs,
          before?.localDate ?? null,
          before ? Math.round(before.revenueAmd) : null,
          before?.tabs ?? null,
        ];
      }),
    ),
    table(
      ['localHour', 'revenueAmd'],
      report.byHour.map((hour) => [hour.hour, Math.round(hour.revenueAmd)]),
    ),
    table(MEASURE_HEADER, [
      measure('totalAmd', report.totalAmd),
      measure('tabs', report.tabs),
      measure('serviceChargeAmd', report.serviceChargeAmd),
      measure('cashAmd', report.cashAmd),
      measure('inAppAmd', report.inAppAmd),
    ]),
  );
}

export function reservationsCsv(report: ReservationReport): string {
  const tops = report.leadTime.map((bucket) => bucket.upToHours);
  return file(
    table(MEASURE_HEADER, [
      measure('booked', report.booked),
      measure('seated', report.seated),
      measure('cancelled', report.cancelled),
      measure('lateCancellations', report.lateCancellations),
      measure('noShow', report.noShow),
      measure('cancellationRate', report.cancellationRate),
      measure('noShowRate', report.noShowRate),
      measure('webBookingsWithoutAnApp', report.webBookingsWithoutAnApp),
    ]),
    table(
      ['fromHours', 'toHours', 'bookings'],
      report.leadTime.map((bucket, index) => [...bucketEnds(tops, index), bucket.bookings]),
    ),
  );
}

export function occupancyCsv(report: OccupancyReport): string {
  const turn = report.turnTime;
  const tops = turn.buckets.map((bucket) => bucket.upToMinutes);
  return file(
    table(MEASURE_HEADER, [
      measure('sittings', report.sessions),
      measure('guests', report.seatsFilled),
      measure('walkInGuests', report.walkInGuests),
      measure('reservationGuests', report.reservationGuests),
      measure('turnsPerTable', report.turnsPerTable),
      ['medianMinutes', turn.medianMinutes, null, null],
      ['p90Minutes', turn.p90Minutes, null, null],
      ['policyTurnTimeMinutes', turn.policyTurnTimeMinutes, null, null],
      ['overPolicyFraction', turn.overPolicyFraction, null, null],
    ]),
    table(
      ['fromMinutes', 'toMinutes', 'sittings'],
      turn.buckets.map((bucket, index) => [...bucketEnds(tops, index), bucket.sessions]),
    ),
  );
}

export function menuCsv(report: MenuReport): string {
  const ranked = (list: string, items: MenuReport['topByCount']): Cell[][] =>
    items.map((item, index) => [
      list,
      index + 1,
      item.menuItemId,
      item.name,
      item.categoryName,
      item.quantity,
      Math.round(item.revenueAmd),
    ]);
  return file(
    table(
      ['list', 'rank', 'menuItemId', 'name', 'category', 'quantity', 'revenueAmd'],
      [
        ...ranked('topByCount', report.topByCount),
        ...ranked('topByRevenue', report.topByRevenue),
        ...ranked('neverOrdered', report.neverOrdered),
      ],
    ),
    table(
      ['menuItemId', 'name', 'reason', 'count'],
      report.voids.map((line) => [line.menuItemId, line.name, line.reason, line.count]),
    ),
  );
}

/** `revenue-2026-10-12-to-2026-10-18[-all-branches].csv`, as the server names it. */
export function csvFileName(section: CsvSection, query: ReportQuery): string {
  return `${section}-${query.from}-to-${query.to}${query.rollUpVenue ? '-all-branches' : ''}.csv`;
}

/** The bytes to save: the BOM, then the text. */
export function csvBlob(text: string): Blob {
  // \uFEFF spelled out rather than pasted: a literal BOM in source is
  // invisible, and every editor and formatter is entitled to strip it.
  return new Blob([`\uFEFF${text}`], { type: 'text/csv;charset=utf-8' });
}
