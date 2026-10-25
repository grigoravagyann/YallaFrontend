import { useMutation, useQuery } from '@tanstack/react-query';
import type { ConsoleGateway } from '../consoleGateway';
import type { ReportQuery, ReportSection } from '../contracts/reports';
import { ReportRangeTooLongError } from '../contracts/errors';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';

/**
 * How long a report answer stays fresh.
 *
 * Longer than anything else in this file, and deliberately: a report over a
 * closed range — yesterday, last week — cannot change, and re-running a query
 * that scans a month of sittings because somebody switched tabs is expensive
 * for nobody's benefit. Even "this week" moves slowly enough that a minute-old
 * answer is not misleading.
 */
const REPORT_STALE_MS = 5 * 60_000;

/**
 * One report section.
 *
 * Every section on the screen calls this with the same range and its own
 * section name, so each gets its own cache entry, its own loading state and its
 * own error. That is the whole design: reports are slow queries and an owner
 * who wants tonight's covers should not wait on the menu anti-join, nor lose
 * the page when it fails.
 *
 * `enabled` is off without a branch, so a manager whose branch list has not
 * arrived yet issues no request rather than one for the empty string.
 */
function useReport<T>(
  section: ReportSection,
  query: ReportQuery | null,
  run: (gateway: ConsoleGateway, query: ReportQuery) => Promise<T>,
) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.report(section, query ?? EMPTY_REPORT_QUERY),
    queryFn: () => run(gateway, query!),
    enabled: query !== null,
    staleTime: REPORT_STALE_MS,
    refetchOnWindowFocus: false,
    /*
     * A range too long for the server to run will be too long however many
     * times it is asked, and the screen shows the limit rather than spinning.
     * Everything else retries as usual.
     */
    retry: (failureCount, error) =>
      error instanceof ReportRangeTooLongError ? false : failureCount < 2,
  });
}

const EMPTY_REPORT_QUERY: ReportQuery = { branchId: '', from: '', to: '' };

export function useOccupancyReport(query: ReportQuery | null) {
  return useReport('occupancy', query, (gateway, q) => gateway.getOccupancyReport(q));
}

export function useReservationReport(query: ReportQuery | null) {
  return useReport('reservations', query, (gateway, q) => gateway.getReservationReport(q));
}

export function useRevenueReport(query: ReportQuery | null) {
  return useReport('revenue', query, (gateway, q) => gateway.getRevenueReport(q));
}

export function useMenuReport(query: ReportQuery | null) {
  return useReport('menu', query, (gateway, q) => gateway.getMenuReport(q));
}

export function useStaffReport(query: ReportQuery | null) {
  return useReport('staff', query, (gateway, q) => gateway.getStaffReport(q));
}

/**
 * Fetch one section's CSV, as the server wrote it.
 *
 * A mutation rather than a query because it is an action somebody takes, and
 * because its result is a file rather than state: caching it would hold a Blob
 * of a report nobody is looking at any more.
 */
export function useExportReport() {
  const gateway = useConsoleGateway();
  return useMutation({
    mutationFn: (input: ReportQuery & { section: ReportSection }) => gateway.exportReport(input),
  });
}
