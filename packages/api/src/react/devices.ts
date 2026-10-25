import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { staleTime } from '../queryClient';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';

/**
 * The branch's devices: `kind` the tablets or the personal phones, absent
 * both. `pollMs` reads the list again on a clock, while the tab is in front —
 * for a screen that judges how long ago each was last seen, which a list read
 * once would get more wrong by the minute.
 */
export function useDevices(
  branchId: string | undefined,
  { pollMs, kind }: { readonly pollMs?: number; readonly kind?: 'tablet' | 'phone' } = {},
) {
  const gateway = useConsoleGateway();
  return useQuery({
    // Under the branch's key, so one invalidation reaches every kind.
    queryKey: queryKeys.devices(branchId ?? '', kind),
    queryFn: () => gateway.listDevices(branchId!, kind),
    enabled: Boolean(branchId),
    staleTime: pollMs ?? staleTime.reference,
    ...(pollMs ? { refetchInterval: pollMs, refetchIntervalInBackground: false } : {}),
  });
}

/**
 * Mint an enrolment code.
 *
 * A mutation rather than a query, and deliberately uncached: the code is
 * returned once, only its hash is stored, and caching it would put a live
 * credential in a place a later render could read. "Regenerate" is another
 * call, which is what it genuinely is.
 */
export function useCreateEnrolmentCode() {
  const gateway = useConsoleGateway();
  return useMutation({
    mutationFn: (branchId: string) => gateway.createEnrolmentCode(branchId),
  });
}

/**
 * Mint a code that pairs one person's phone. Uncached for the same reason as
 * an enrolment code: it is returned once and is a live credential for ten
 * minutes.
 */
export function useCreatePhonePairing() {
  const gateway = useConsoleGateway();
  return useMutation({
    mutationFn: (input: { branchId: string; staffMemberId: string }) =>
      gateway.createPhonePairing(input),
  });
}

export function useRevokeDevice() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { branchId: string; deviceId: string }) => gateway.revokeDevice(input),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.devices(input.branchId) });
      void queryClient.invalidateQueries({ queryKey: ['console', 'readiness'] });
    },
  });
}
