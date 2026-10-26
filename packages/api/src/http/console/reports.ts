import type { ConsoleGateway } from '../../consoleGateway';
import { REPORT_MAX_DAYS, type ReportExport, type ReportQuery } from '../../contracts/reports';
import { ReportRangeTooLongError } from '../../contracts/errors';
import { ApiError } from '../../errors';
import type { components } from '../../generated/schema';
import { parseProblem } from '../../problem';
import {
  fileNameFrom,
  menuReport,
  occupancyReport,
  reservationReport,
  revenueReport,
  staffReport,
} from '../reportMapping';
import { type ConsoleHttpContext, BRANCHES, REPORT_TIMEOUT_MS } from './context';

type WireOccupancy = components['schemas']['Yalla.Application.Reports.OccupancyReport'];
type WireReservations = components['schemas']['Yalla.Application.Reports.ReservationReport'];
type WireRevenue = components['schemas']['Yalla.Application.Reports.RevenueReport'];
type WireMenu = components['schemas']['Yalla.Application.Reports.MenuReport'];
type WireStaff = components['schemas']['Yalla.Application.Reports.StaffReport'];

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Inclusive of both ends, matching `ReportRange.Days` on the server. */
function daysBetween({ from, to }: { from: string; to: string }): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

export function reportsMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  | 'getOccupancyReport'
  | 'getReservationReport'
  | 'getRevenueReport'
  | 'getMenuReport'
  | 'getStaffReport'
  | 'exportReport'
> {
  const { client } = ctx;
  /**
   * The query string every report and every export shares.
   *
   * One place, because the five reports and their five exports must ask the
   * *same* question — an export whose range differed from the screen's by a day
   * would be a file that quietly disagreed with the report it came from.
   */
  function reportQuery(query: ReportQuery, format?: 'csv') {
    return {
      from: query.from,
      to: query.to,
      // Only sent when true: an owner's rollup is the exception, and a `false`
      // on every ordinary request is noise in a log somebody will read.
      ...(query.rollUpVenue ? { rollUpVenue: true } : {}),
      ...(format ? { format } : {}),
    };
  }

  /**
   * One report group.
   *
   * The 400 the server raises for an over-long range is translated here rather
   * than at each of the five call sites, and it carries the server's own limit:
   * a screen that named a different number from the one actually enforced would
   * be telling an owner to narrow a range that was already narrow enough.
   */
  async function report<T>(section: string, query: ReportQuery): Promise<T> {
    try {
      const { data } = await client.get<T>(`${BRANCHES}/${query.branchId}/reports/${section}`, {
        query: reportQuery(query),
        timeoutMs: REPORT_TIMEOUT_MS,
      });
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        const problem = parseProblem(error.body);
        throw new ReportRangeTooLongError({
          url: error.url,
          requestedDays: numberFrom(problem?.context?.['requestedDays']) ?? daysBetween(query),
          maxDays: numberFrom(problem?.context?.['maxDays']) ?? REPORT_MAX_DAYS,
        });
      }
      throw error;
    }
  }

  return {
    // --- Reports ------------------------------------------------------------

    async getOccupancyReport(query) {
      return occupancyReport(await report<WireOccupancy>('occupancy', query));
    },

    async getReservationReport(query) {
      return reservationReport(await report<WireReservations>('reservations', query));
    },

    async getRevenueReport(query) {
      return revenueReport(await report<WireRevenue>('revenue', query));
    },

    async getMenuReport(query) {
      return menuReport(await report<WireMenu>('menu', query));
    },

    async getStaffReport(query) {
      return staffReport(await report<WireStaff>('staff', query));
    },

    async exportReport({ section, ...query }): Promise<ReportExport> {
      /*
       * The server's own CSV, carried through as bytes.
       *
       * `format=csv` on the very same route the screen read, so the file and
       * the screen are two renderings of one query rather than two queries that
       * ought to agree. The client does not build rows, order them, round
       * anything or localise a date: if the file and the screen ever disagree
       * the client is wrong by definition, so it is given no opportunity.
       *
       * The body arrives as text because it is not JSON, and goes into a Blob
       * unchanged — the server's UTF-8 BOM included, which is the only reason
       * Excel opens an Armenian venue name as words rather than mojibake.
       */
      const response = await client.get<string>(
        `${BRANCHES}/${query.branchId}/reports/${section}`,
        { query: reportQuery(query, 'csv'), timeoutMs: REPORT_TIMEOUT_MS },
      );

      const csv = typeof response.data === 'string' ? response.data : '';

      return {
        fileName: fileNameFrom(
          response.headers.get('content-disposition'),
          `${section}-${query.from}-to-${query.to}.csv`,
        ),
        contentType: response.headers.get('content-type') ?? 'text/csv; charset=utf-8',
        bytes: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      };
    },
  };
}
