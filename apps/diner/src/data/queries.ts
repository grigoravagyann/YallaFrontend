import {
  staleTime,
  type Booking,
  type CreateBookingCommand,
  type ScanTableCommand,
  type TabPermissions,
  type TableTab,
  type WaiterCallReason,
} from '@yalla/api';
import { queryKeys, useGateway } from '@yalla/api/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * The browse and floor hooks live in `@yalla/api/react`, shared with the web
 * console so the two apps cannot cache the same floor under different keys.
 * Everything below is diner-only and follows on to the shared hooks once the
 * booking and tab endpoints are wired.
 */
export { useFloorPlan, useTableAvailability, useVenue, useVenues } from '@yalla/api/react';

/** Query keys in one place, so an invalidation cannot miss a cache entry. */
export const keys = {
  ...queryKeys,
  bookings: ['bookings'] as const,
  booking: (bookingId: string) => ['booking', bookingId] as const,
  tab: (tabId: string) => ['tab', tabId] as const,
  menu: (branchId: string) => ['menu', branchId] as const,
  /**
   * The nonce is what makes "new link" mean a new token. A refetch of the same
   * nonce replays the same command id and so returns the same invite, which is
   * what you want on a retry; bumping it mints a fresh one.
   */
  invite: (tabId: string, nonce: number) => ['tabInvite', tabId, nonce] as const,
};

export function useBookings() {
  const gateway = useGateway();
  return useQuery({
    queryKey: keys.bookings,
    queryFn: () => gateway.listBookings(),
    staleTime: staleTime.frequent,
  });
}

export function useBooking(bookingId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: keys.booking(bookingId ?? ''),
    queryFn: () => gateway.getBooking(bookingId!),
    enabled: Boolean(bookingId),
    staleTime: staleTime.frequent,
  });
}

/**
 * Create a booking.
 *
 * Retry is off (the shared query-client default): seating is not idempotent
 * from the user's point of view, and an automatic retry after a timeout is
 * exactly how a diner ends up with two tables. The `commandId` in the command
 * makes a *deliberate* retry safe; an automatic one is still the wrong call
 * because the UI must show what happened between attempts.
 */
export function useCreateBooking() {
  const gateway = useGateway();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (command: CreateBookingCommand) => gateway.createBooking(command),
    onSuccess: (booking: Booking) => {
      queryClient.setQueryData(keys.booking(booking.id), booking);
      void queryClient.invalidateQueries({ queryKey: keys.bookings });
      void queryClient.invalidateQueries({ queryKey: keys.floor(booking.branchId) });
      void queryClient.invalidateQueries({ queryKey: ['availability', booking.branchId] });
    },
  });
}

export function useCancelBooking() {
  const gateway = useGateway();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) => gateway.cancelBooking(bookingId),
    onSuccess: (booking: Booking) => {
      queryClient.setQueryData(keys.booking(booking.id), booking);
      void queryClient.invalidateQueries({ queryKey: keys.bookings });
      void queryClient.invalidateQueries({ queryKey: keys.floor(booking.branchId) });
      void queryClient.invalidateQueries({ queryKey: ['availability', booking.branchId] });
    },
  });
}

export function useRequestPhoneCode() {
  const gateway = useGateway();
  return useMutation({
    mutationFn: (phoneE164: string) => gateway.requestPhoneCode(phoneE164),
  });
}

export function useVerifyPhoneCode() {
  const gateway = useGateway();
  return useMutation({
    mutationFn: (input: { challengeId: string; code: string }) => gateway.verifyPhoneCode(input),
  });
}

// ---------------------------------------------------------------------------
// Scanning in and the shared tab
// ---------------------------------------------------------------------------

/**
 * One tab, polled while there is a reason to.
 *
 * Live updates arrive over a socket in a later task. Until then a pending
 * joiner needs to find out they were approved without tapping anything, so the
 * caller passes `pollMs` while that is true and omits it otherwise. Keeping the
 * decision at the call site — rather than always polling — means the socket can
 * replace it by deleting one argument.
 */
export function useTab(tabId: string | undefined, options: { pollMs?: number } = {}) {
  const gateway = useGateway();
  return useQuery({
    queryKey: keys.tab(tabId ?? ''),
    queryFn: () => gateway.getTab(tabId!),
    enabled: Boolean(tabId),
    staleTime: staleTime.live,
    ...(options.pollMs ? { refetchInterval: options.pollMs } : {}),
  });
}

export function useBranchMenu(branchId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: keys.menu(branchId ?? ''),
    queryFn: () => gateway.getBranchMenu(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
  });
}

/**
 * The invite for a tab.
 *
 * A query rather than a mutation because the invite screen wants one on arrival
 * and the result is cacheable; the `nonce` in the key is how "new link" is
 * expressed without reaching for imperative state.
 */
export function useTabInvite(tabId: string | undefined, nonce: number) {
  const gateway = useGateway();
  return useQuery({
    queryKey: keys.invite(tabId ?? '', nonce),
    queryFn: () => gateway.createTabInvite({ tabId: tabId!, commandId: `inv_${tabId}_${nonce}` }),
    enabled: Boolean(tabId),
    // A link that expires in 30 minutes should not be re-minted on every focus.
    staleTime: staleTime.frequent,
  });
}

export function useScanTableCode() {
  const gateway = useGateway();
  return useMutation({
    mutationFn: (command: ScanTableCommand) => gateway.scanTableCode(command),
  });
}

export function useLeaveTab() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tabId: string; commandId: string }) => gateway.leaveTab(input),
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: keys.tab(input.tabId) });
    },
  });
}

/**
 * Every host action returns the whole refreshed tab, so they all cache the same
 * way: replace the tab, do not patch it. A locally patched participants list is
 * exactly how a screen ends up showing a state the server does not agree with.
 */
function cacheTab(queryClient: ReturnType<typeof useQueryClient>) {
  return (tab: TableTab) => {
    queryClient.setQueryData(keys.tab(tab.id), tab);
  };
}

export function useApproveJoin() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tabId: string; participantId: string; commandId: string }) =>
      gateway.approveJoin(input),
    onSuccess: cacheTab(queryClient),
  });
}

export function useRejectJoin() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tabId: string; participantId: string; commandId: string }) =>
      gateway.rejectJoin(input),
    onSuccess: cacheTab(queryClient),
  });
}

export function useRemoveParticipant() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tabId: string; participantId: string; commandId: string }) =>
      gateway.removeParticipant(input),
    onSuccess: cacheTab(queryClient),
  });
}

export function useSetParticipantPermissions() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      tabId: string;
      participantId: string;
      permissions: TabPermissions;
      commandId: string;
    }) => gateway.setParticipantPermissions(input),
    onSuccess: cacheTab(queryClient),
  });
}

export function useSetTabDefaultPermissions() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tabId: string; permissions: TabPermissions; commandId: string }) =>
      gateway.setTabDefaultPermissions(input),
    onSuccess: cacheTab(queryClient),
  });
}

export function useCallWaiter() {
  const gateway = useGateway();
  return useMutation({
    mutationFn: (input: { tabId: string; reason: WaiterCallReason; commandId: string }) =>
      gateway.callWaiter(input),
  });
}
