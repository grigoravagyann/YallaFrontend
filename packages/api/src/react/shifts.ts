import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ShiftInput } from '../contracts/staff';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';

// --- Shifts --------------------------------------------------------------------

/**
 * A branch's shifts from its service day for two weeks, and today's head count.
 *
 * The Staff page's shift line and "on shift today" read this. It turns over
 * at midnight on its own, so it is not reference data: read again when the
 * tab comes back, and kept for a minute.
 */
export function useBranchShifts(branchId: string | null | undefined) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.shifts(branchId ?? ''),
    queryFn: () => gateway.listBranchShifts({ branchId: branchId! }),
    enabled: Boolean(branchId),
    staleTime: 60_000,
  });
}

/** A shift is planned up to this many days after the service day (the server's horizon). */
const SHIFT_AHEAD_DAYS = 92;

/** And a read covers at most this many days. */
const SHIFT_READ_DAYS = 92;

function addDayKey(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Every shift the editor can show: from the day before the service day — a
 * shift from last night may still be running, and still corrected — to the
 * last day one may be planned on. That is 94 days, wider than one read
 * (92), so it is two reads, merged. Its own key, under the branch's prefix,
 * so a write refreshes it with the page's two-week list.
 */
export function useBranchShiftsAhead(
  branchId: string | null | undefined,
  serviceDate: string | null | undefined,
) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: [...queryKeys.shifts(branchId ?? ''), 'ahead', serviceDate ?? ''] as const,
    queryFn: async () => {
      const from = addDayKey(serviceDate!, -1);
      const last = addDayKey(serviceDate!, SHIFT_AHEAD_DAYS);
      const split = addDayKey(from, SHIFT_READ_DAYS - 1);
      const [first, rest] = await Promise.all([
        gateway.listBranchShifts({ branchId: branchId!, from, to: split }),
        gateway.listBranchShifts({ branchId: branchId!, from: addDayKey(split, 1), to: last }),
      ]);
      return { ...first, to: last, shifts: [...first.shifts, ...rest.shifts] };
    },
    enabled: Boolean(branchId && serviceDate),
    staleTime: 60_000,
  });
}

/** Plan, change or remove one shift; each refreshes the branch's lists. */
export function useShiftMutations(branchId: string | null | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.shifts(branchId ?? '') });
  const create = useMutation({
    mutationFn: (input: { staffMemberId: string; shift: ShiftInput }) =>
      gateway.createShift({ branchId: branchId!, ...input }),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: (input: { shiftId: string; shift: ShiftInput }) =>
      gateway.updateShift({ branchId: branchId!, ...input }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (shiftId: string) => gateway.deleteShift({ branchId: branchId!, shiftId }),
    onSuccess: refresh,
  });
  return { create, update, remove };
}
