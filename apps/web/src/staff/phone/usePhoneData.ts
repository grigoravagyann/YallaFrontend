import type { BranchOverview, StaffRosterEntry, UserRole } from '@yalla/api';
import { useQuery } from '@tanstack/react-query';
import { staffOverviewGateway } from '../../data/gateway';
import { staffSession } from '../auth/staffSession';

/**
 * Who works at this branch and whose shift is running or next — the PIN
 * gate's own read (`GET /api/auth/staff/roster`), which any signed-in device
 * may make. The phone's More ("My shift") and Today ("On shift") read it.
 *
 * Read again every five minutes while the screen is up: a shift starting is
 * not news that needs a poll a second.
 */
export function useStaffRoster(branchId: string, enabled: boolean) {
  return useQuery<readonly StaffRosterEntry[]>({
    queryKey: ['staffPhone', 'roster', branchId],
    queryFn: async () => (staffSession ? await staffSession.roster() : []),
    enabled: enabled && Boolean(branchId),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });
}

/**
 * Today at the branch, for a manager's phone (the Today artboard): the venue
 * console's own Overview read, made with the phone's PIN session (see
 * `staffOverviewGateway`). Every 30 seconds while in front, as the console's.
 */
export function useStaffOverview(branchId: string, role: UserRole, enabled: boolean) {
  return useQuery<BranchOverview>({
    queryKey: ['staffPhone', 'overview', branchId],
    queryFn: () => staffOverviewGateway(role).getBranchOverview(branchId),
    enabled: enabled && Boolean(branchId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}
