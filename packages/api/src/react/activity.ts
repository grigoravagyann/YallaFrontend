import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { ConsoleGateway } from '../consoleGateway';
import type {
  ActivityFilters,
  ActivityPage,
  ActivitySubjectType,
  ClaimServiceRequestCommand,
  MyPerformanceQuery,
  PerformanceRange,
  StaffRecentList,
  StaffRecentPage,
  TabTransferResult,
  TransferTabCommand,
} from '../contracts/activity';
import type { ServiceRequest } from '../contracts/ordering';
import { staleTime } from '../queryClient';
import type { StaffGateway } from '../staffGateway';
import { queryKeys, useConsoleGateway, useStaffGateway } from './index';

/**
 * Activity history and staff results (2026-10-24): the console's reads, and
 * the floor's two new writes — "I'm on it" on a call, and handing a table to
 * another waiter. The options are plain functions so they are tested on a
 * real `QueryClient` without rendering anything; the hooks are one line over
 * them.
 */

// --- The History feed -------------------------------------------------------------

/**
 * One day's entries for one set of filters, newest first, a page at a time by
 * the server's cursor ("Earlier"). The previous list stays on screen while new
 * filters load (`isPlaceholderData`).
 */
export function activityOptions(
  gateway: Pick<ConsoleGateway, 'listActivity'>,
  branchId: string | undefined,
  filters: ActivityFilters,
  enabled = true,
) {
  return {
    queryKey: queryKeys.activity(branchId ?? '', filters),
    queryFn: ({ pageParam }: { readonly pageParam: string | null }) =>
      gateway.listActivity(branchId!, { ...filters, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ActivityPage) => last.nextCursor ?? undefined,
    enabled: Boolean(branchId) && enabled,
    staleTime: staleTime.frequent,
    placeholderData: keepPreviousData,
  };
}

/** Pass `enabled: false` while the filters on screen cannot be sent. */
export function useActivity(
  branchId: string | undefined,
  filters: ActivityFilters,
  enabled = true,
) {
  return useInfiniteQuery(activityOptions(useConsoleGateway(), branchId, filters, enabled));
}

/** One bill's, booking's or order's timeline (the Check board). `null` when it is gone. */
export function activityTimelineOptions(
  gateway: Pick<ConsoleGateway, 'getActivityTimeline'>,
  branchId: string | undefined,
  subject: { readonly type: ActivitySubjectType; readonly id: string } | null,
) {
  return {
    queryKey: queryKeys.activityTimeline(branchId ?? '', subject?.type ?? 'tab', subject?.id ?? ''),
    queryFn: () => gateway.getActivityTimeline(branchId!, subject!),
    enabled: Boolean(branchId) && subject !== null,
    staleTime: staleTime.frequent,
  };
}

export function useActivityTimeline(
  branchId: string | undefined,
  subject: { readonly type: ActivitySubjectType; readonly id: string } | null,
) {
  return useQuery(activityTimelineOptions(useConsoleGateway(), branchId, subject));
}

// --- My results (the staff phone) --------------------------------------------------

/**
 * The signed-in person's own page (`GET /api/staff/me/performance`): one
 * range, one recent list. Read from the staff session — a waiter's phone or
 * tablet — never a console token, so nobody else's numbers come back.
 */
export function myPerformanceOptions(
  gateway: Pick<StaffGateway, 'getMyPerformance'>,
  query: MyPerformanceQuery,
  enabled = true,
) {
  return {
    queryKey: queryKeys.myPerformance(
      query.branchId ?? '',
      query.from,
      query.to,
      query.list ?? 'orders',
      query.limit ?? 0,
    ),
    queryFn: () => gateway.getMyPerformance(query),
    enabled,
    staleTime: staleTime.frequent,
    placeholderData: keepPreviousData,
  };
}

export function useMyPerformance(query: MyPerformanceQuery, enabled = true) {
  return useQuery(myPerformanceOptions(useStaffGateway(), query, enabled));
}

// --- Staff results ---------------------------------------------------------------

/** Every person's results over a range (Staff → Results). */
export function staffPerformanceOptions(
  gateway: Pick<ConsoleGateway, 'getStaffPerformance'>,
  branchId: string | undefined,
  range: PerformanceRange,
) {
  return {
    queryKey: queryKeys.staffPerformance(branchId ?? '', range.from, range.to),
    queryFn: () => gateway.getStaffPerformance(branchId!, range),
    enabled: Boolean(branchId),
    staleTime: staleTime.frequent,
    placeholderData: keepPreviousData,
  };
}

export function useStaffPerformance(branchId: string | undefined, range: PerformanceRange) {
  return useQuery(staffPerformanceOptions(useConsoleGateway(), branchId, range));
}

/** One person's page: the figures and sales by day (and the first page of their orders). */
export function staffMemberPerformanceOptions(
  gateway: Pick<ConsoleGateway, 'getStaffMemberPerformance'>,
  branchId: string | undefined,
  staffMemberId: string | undefined,
  range: PerformanceRange,
) {
  return {
    queryKey: queryKeys.staffMemberPerformance(
      branchId ?? '',
      staffMemberId ?? '',
      range.from,
      range.to,
    ),
    queryFn: () => gateway.getStaffMemberPerformance(branchId!, staffMemberId!, range),
    enabled: Boolean(branchId) && Boolean(staffMemberId),
    staleTime: staleTime.frequent,
    placeholderData: keepPreviousData,
  };
}

export function useStaffMemberPerformance(
  branchId: string | undefined,
  staffMemberId: string | undefined,
  range: PerformanceRange,
) {
  return useQuery(
    staffMemberPerformanceOptions(useConsoleGateway(), branchId, staffMemberId, range),
  );
}

/**
 * One of a person's lists, a page at a time by the server's cursor (`list`,
 * `cursor` on the person's route): the first page when the list's tab opens,
 * each "More" `fetchNextPage()`.
 */
export function staffRecentOptions(
  gateway: Pick<ConsoleGateway, 'listStaffRecent'>,
  branchId: string | undefined,
  staffMemberId: string | undefined,
  range: PerformanceRange,
  list: StaffRecentList,
) {
  return {
    queryKey: queryKeys.staffRecent(
      branchId ?? '',
      staffMemberId ?? '',
      range.from,
      range.to,
      list,
    ),
    queryFn: ({ pageParam }: { readonly pageParam: string | null }) =>
      gateway.listStaffRecent(branchId!, staffMemberId!, { ...range, list, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: StaffRecentPage) => last.nextCursor ?? undefined,
    enabled: Boolean(branchId) && Boolean(staffMemberId),
    staleTime: staleTime.frequent,
  };
}

export function useStaffRecent(
  branchId: string | undefined,
  staffMemberId: string | undefined,
  range: PerformanceRange,
  list: StaffRecentList,
) {
  return useInfiniteQuery(
    staffRecentOptions(useConsoleGateway(), branchId, staffMemberId, range, list),
  );
}

// --- The floor: claim a call, transfer a table -------------------------------------

/**
 * "I'm on it". Online only, never retried (the first claim wins, so a retry
 * that lands after somebody else's is just their name back). The floor's
 * calls are read again after, so every tablet's list carries the name.
 */
export function claimServiceRequestOptions(
  queryClient: QueryClient,
  gateway: Pick<StaffGateway, 'claimServiceRequest'>,
) {
  return {
    mutationFn: (command: ClaimServiceRequestCommand) => gateway.claimServiceRequest(command),
    retry: false,
    onSuccess: (request: ServiceRequest, command: ClaimServiceRequestCommand) => {
      queryClient.setQueryData<readonly ServiceRequest[]>(
        queryKeys.serviceRequests(command.branchId),
        (current) =>
          current?.map((candidate) => (candidate.id === request.id ? request : candidate)),
      );
    },
    onSettled: (_data: unknown, _error: unknown, command: ClaimServiceRequestCommand) =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests(command.branchId) }),
  };
}

export function useClaimServiceRequest() {
  return useMutation(claimServiceRequestOptions(useQueryClient(), useStaffGateway()));
}

/**
 * Hand a table to another waiter. Online only, never retried (a second ask to
 * the same waiter answers `wasReplay`). The floor is read again after (its
 * tiles name the waiter), as every other tablet does on the change stream's
 * `TableTransferred` (7).
 */
export function transferTabOptions(
  queryClient: QueryClient,
  gateway: Pick<StaffGateway, 'transferTab'>,
  branchId: string | undefined,
) {
  return {
    mutationFn: (command: TransferTabCommand) => gateway.transferTab(command),
    retry: false,
    onSettled: (result: TabTransferResult | undefined) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId ?? '') });
      if (result) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.staffTab(result.tabId) });
      }
    },
  };
}

export function useTransferTab(branchId: string | undefined) {
  return useMutation(transferTabOptions(useQueryClient(), useStaffGateway(), branchId));
}
