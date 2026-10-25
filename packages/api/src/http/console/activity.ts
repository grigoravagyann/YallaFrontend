import type {
  ActivityPage,
  ActivityTimeline,
  StaffMemberPerformance,
  StaffPerformance,
  StaffRecentPage,
} from '../../contracts/activity';
import {
  activityPageFromWire,
  activityParamsFor,
  activitySubjectSegment,
  activityTimelineFromWire,
  csvFileName,
  performanceParams,
  personPerformanceParams,
  staffMemberPerformanceFromWire,
  staffPerformanceFromWire,
  staffRecentPageFromWire,
  type WireActivityPage,
  type WireActivityTimeline,
  type WirePersonPerformance,
  type WireStaffPerformanceReport,
} from '../activityMapping';
import type { ConsoleGateway } from '../../consoleGateway';
import type { ReportExport } from '../../contracts/reports';
import { NotFoundError } from '../../errors';
import { type ConsoleHttpContext, BRANCHES, REPORT_TIMEOUT_MS } from './context';

/** A CSV as the server wrote it, BOM and all, under the name it gave. */
function csvExport(
  response: { readonly data: unknown; readonly headers: Headers },
  fallbackName: string,
): ReportExport {
  const csv = typeof response.data === 'string' ? response.data : '';
  return {
    fileName: csvFileName(response.headers.get('content-disposition'), fallbackName),
    contentType: response.headers.get('content-type') ?? 'text/csv; charset=utf-8',
    bytes: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  };
}

export function activityMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  | 'listActivity'
  | 'exportActivityCsv'
  | 'getActivityTimeline'
  | 'getStaffPerformance'
  | 'exportStaffPerformanceCsv'
  | 'getStaffMemberPerformance'
  | 'listStaffRecent'
> {
  const { client } = ctx;
  return {
    // --- Activity history and staff results (2026-10-24) -----------------------
    //
    // Yalla `docs/activity.md` §7, read through `activityMapping.ts`. The CSVs
    // are the server's own bytes, as the reports' are; a window over 20,000
    // rows is a `422 activity-export-too-large`.

    async listActivity(branchId, query): Promise<ActivityPage> {
      const { data } = await client.get<WireActivityPage>(`${BRANCHES}/${branchId}/activity`, {
        query: activityParamsFor(query, query),
      });
      return activityPageFromWire(data);
    },

    async exportActivityCsv(branchId, filters) {
      const response = await client.get<string>(`${BRANCHES}/${branchId}/activity.csv`, {
        query: activityParamsFor(filters),
        timeoutMs: REPORT_TIMEOUT_MS,
      });
      return csvExport(response, `activity-${filters.date}-to-${filters.date}.csv`);
    },

    async getActivityTimeline(branchId, subject): Promise<ActivityTimeline | null> {
      const type = encodeURIComponent(activitySubjectSegment(subject.type));
      const id = encodeURIComponent(subject.id);
      try {
        const { data } = await client.get<WireActivityTimeline>(
          `${BRANCHES}/${branchId}/activity/subjects/${type}/${id}`,
        );
        return activityTimelineFromWire(data, subject);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getStaffPerformance(branchId, range): Promise<StaffPerformance> {
      const { data } = await client.get<WireStaffPerformanceReport>(
        `${BRANCHES}/${branchId}/staff-performance`,
        { query: performanceParams(range) },
      );
      return staffPerformanceFromWire(data, range);
    },

    async exportStaffPerformanceCsv(branchId, range) {
      const response = await client.get<string>(`${BRANCHES}/${branchId}/staff-performance.csv`, {
        query: performanceParams(range),
        timeoutMs: REPORT_TIMEOUT_MS,
      });
      return csvExport(response, `staff-results-${range.from}-to-${range.to}.csv`);
    },

    async getStaffMemberPerformance(
      branchId,
      staffMemberId,
      range,
    ): Promise<StaffMemberPerformance | null> {
      const id = encodeURIComponent(staffMemberId);
      try {
        const { data } = await client.get<WirePersonPerformance>(
          `${BRANCHES}/${branchId}/staff/${id}/performance`,
          { query: personPerformanceParams(range) },
        );
        return staffMemberPerformanceFromWire(data, { ...range, staffMemberId });
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async listStaffRecent(branchId, staffMemberId, query): Promise<StaffRecentPage> {
      const id = encodeURIComponent(staffMemberId);
      const { data } = await client.get<WirePersonPerformance>(
        `${BRANCHES}/${branchId}/staff/${id}/performance`,
        { query: personPerformanceParams(query, query) },
      );
      return staffRecentPageFromWire(data?.recent, query.list);
    },
  };
}
