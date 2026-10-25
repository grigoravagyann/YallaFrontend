import type {
  ActivityPage,
  ActivityTimeline,
  StaffPerformance,
  StaffMemberPerformance,
  StaffRecentPage,
} from '../../contracts/activity';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';

/** Activity history and staff results. */
export function activityMethods(
  ctx: ConsoleMockContext,
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
  const { branchActivity, requireManagerAtBranch, wait } = ctx;
  return {
    // --- Activity history and staff results (2026-10-24) -------------------------

    async listActivity(branchId, query): Promise<ActivityPage> {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/activity`;
      requireManagerAtBranch(branchId, url);
      return branchActivity.list(url, branchId, query);
    },

    async exportActivityCsv(branchId, filters) {
      await wait();
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/activity.csv`);
      return branchActivity.csv(branchId, filters);
    },

    async getActivityTimeline(branchId, subject): Promise<ActivityTimeline | null> {
      await wait();
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/activity/subjects`);
      return branchActivity.timeline(branchId, subject);
    },

    async getStaffPerformance(branchId, range): Promise<StaffPerformance> {
      await wait();
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/staff-performance`);
      return branchActivity.performance(branchId, range);
    },

    async exportStaffPerformanceCsv(branchId, range) {
      await wait();
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/staff-performance.csv`);
      return branchActivity.performanceCsv(branchId, range);
    },

    async getStaffMemberPerformance(
      branchId,
      staffMemberId,
      range,
    ): Promise<StaffMemberPerformance | null> {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/staff/${staffMemberId}/performance`;
      requireManagerAtBranch(branchId, url);
      return branchActivity.member(url, branchId, staffMemberId, range);
    },

    async listStaffRecent(branchId, staffMemberId, query): Promise<StaffRecentPage> {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/staff/${staffMemberId}/performance`;
      requireManagerAtBranch(branchId, url);
      return branchActivity.recent(url, branchId, staffMemberId, query, query.list, query.cursor);
    },
  };
}
