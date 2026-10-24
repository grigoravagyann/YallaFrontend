import type { StaffRosterEntry } from '@yalla/api';
import { useQuery } from '@tanstack/react-query';
import { staffSession } from '../auth/staffSession';

/**
 * Who works at this branch and whose shift is running or next — the PIN
 * gate's own read (`GET /api/auth/staff/roster`), which any signed-in device
 * may make. The phone's More ("My shift") reads it; on a phone it is its own person.
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
