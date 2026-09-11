import {
  staleTime,
  type Booking,
  type CreateBookingCommand,
  type JoinTabCommand,
  type OpenTabByBookingCommand,
  type ScanTableCommand,
  type TabParticipantChange,
  type TabPermissions,
  type WaiterCallReason,
} from '@yalla/api';
import { queryKeys, useGateway } from '@yalla/api/react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { orderKeys } from './orderQueries';

/**
 * The browse and floor hooks live in `@yalla/api/react`, shared with the web
 * console so the two apps cannot cache the same floor under different keys.
 * Everything below is diner-only.
 */
export { useSlotFloor, useTableAvailability, useVenue, useVenues } from '@yalla/api/react';

/** Query keys in one place, so an invalidation cannot miss a cache entry. */
export const keys = {
  ...queryKeys,
  bookings: ['bookings'] as const,
  booking: (bookingId: string) => ['booking', bookingId] as const,
  /** What a notification screen read about one booking. Invalidated with it. */
  reservationState: (reservationId: string) => ['reservationState', reservationId] as const,
  bookingRules: (venueSlug: string, branchSlug: string) =>
    ['bookingRules', venueSlug, branchSlug] as const,
  /**
   * The nonce is what makes "new link" mean a new token: a new key is a new
   * request, and each request to the server issues a fresh invitation.
   */
  invite: (tabId: string, nonce: number) => ['tabInvite', tabId, nonce] as const,
  /**
   * Each person's three flags, as the server last stated them to this phone.
   *
   * The roster on the tab read carries no flags, so the only place a host ever
   * learns another person's permissions is the answer to a host action. Kept
   * here, never guessed.
   */
  tabPermissions: (tabId: string) => ['tabPermissions', tabId] as const,
};

/**
 * The diner's bookings, split by the server.
 *
 * `enabled` is false for a diner with no session: `/mine` is scoped to the
 * signed-in number, and asking without one is a 401 dressed up as an error.
 */
export function useBookings(enabled = true) {
  const gateway = useGateway();
  return useQuery({
    queryKey: keys.bookings,
    queryFn: () => gateway.listBookings(),
    staleTime: staleTime.frequent,
    enabled,
  });
}

/**
 * How far ahead and how soon a branch takes bookings, from its public page.
 *
 * Only reachable with the slugs the browse card carries; a branch reached by a
 * bare deep link falls back to the defaults, and the server still refuses
 * anything outside the real window with its own reason.
 */
export function useBookingRules(
  branch: { readonly venueSlug: string; readonly branchSlug: string } | null,
) {
  const gateway = useGateway();
  return useQuery({
    queryKey: keys.bookingRules(branch?.venueSlug ?? '', branch?.branchSlug ?? ''),
    queryFn: () => gateway.getBookingRules(branch!),
    enabled: branch !== null,
    staleTime: staleTime.reference,
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
      // The room: every slot-aware read of the branch sits under this prefix.
      void queryClient.invalidateQueries({ queryKey: ['availability', booking.branchId] });
    },
  });
}

export function useCancelBooking() {
  const gateway = useGateway();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) => gateway.cancelBooking(bookingId),
    retry: false,
    onSuccess: (booking: Booking) => {
      // Every read of this booking, so no screen goes on offering an action
      // on a booking that is already cancelled.
      queryClient.setQueryData(keys.booking(booking.id), booking);
      void queryClient.invalidateQueries({ queryKey: keys.bookings });
      void queryClient.invalidateQueries({ queryKey: keys.reservationState(booking.id) });
      void queryClient.invalidateQueries({ queryKey: ['availability', booking.branchId] });
    },
  });
}

/** `localeCode` so the SMS arrives in the diner's language. */
export function useRequestPhoneCode() {
  const gateway = useGateway();
  return useMutation({
    mutationFn: (input: { phoneE164: string; localeCode: string }) =>
      gateway.requestPhoneCode(input.phoneE164, { localeCode: input.localeCode }),
  });
}

export function useVerifyPhoneCode() {
  const gateway = useGateway();
  return useMutation({
    mutationFn: (input: { challengeId: string; code: string; localeCode: string }) =>
      gateway.verifyPhoneCode(input),
  });
}

// ---------------------------------------------------------------------------
// Scanning in and the shared tab
// ---------------------------------------------------------------------------

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
    // Each request to the server mints a fresh invitation and revokes the last,
    // so this is never refetched on its own: only "new link" asks again.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useScanTableCode() {
  const gateway = useGateway();
  return useMutation({
    mutationFn: (command: ScanTableCommand) => gateway.scanTableCode(command),
  });
}

/**
 * "I'm at my table", to `/api/tabs/open-by-booking`.
 *
 * The one way onto a tab that carries the diner's session: the booking has an
 * account behind it, and only the account that made it may open its table.
 */
export function useOpenTabByBooking() {
  const gateway = useGateway();
  return useMutation({
    mutationFn: (command: OpenTabByBookingCommand) => gateway.openTabByBooking(command),
  });
}

/** A host's invitation, to `/api/tabs/join` — never the table scan. */
export function useJoinTab() {
  const gateway = useGateway();
  return useMutation({
    mutationFn: (command: JoinTabCommand) => gateway.joinTab(command),
  });
}

export function useLeaveTab() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tabId: string }) => gateway.leaveTab(input),
    retry: false,
    onSuccess: (_result, input) => {
      // The token is spent; nothing about this tab should be read again.
      queryClient.removeQueries({ queryKey: orderKeys.dinerTab(input.tabId) });
      queryClient.removeQueries({ queryKey: orderKeys.shares(input.tabId) });
    },
  });
}

/**
 * After a host action: remember what the server said about that person, and
 * read the tab again for the roster. Never patched locally.
 */
function afterHostAction(queryClient: QueryClient) {
  return (change: TabParticipantChange, input: { tabId: string }) => {
    queryClient.setQueryData<Readonly<Record<string, TabPermissions>>>(
      keys.tabPermissions(input.tabId),
      (current) => ({ ...current, [change.participantId]: change.permissions }),
    );
    void queryClient.invalidateQueries({ queryKey: orderKeys.dinerTab(input.tabId) });
    void queryClient.invalidateQueries({ queryKey: orderKeys.shares(input.tabId) });
  };
}

/** What this phone has been told about each person's flags. See `keys.tabPermissions`. */
export function useKnownPermissions(tabId: string | undefined) {
  return useQuery({
    queryKey: keys.tabPermissions(tabId ?? ''),
    queryFn: (): Readonly<Record<string, TabPermissions>> => ({}),
    initialData: {},
    staleTime: Infinity,
    enabled: Boolean(tabId),
  });
}

export function useApproveJoin() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tabId: string; participantId: string; commandId: string }) =>
      gateway.approveJoin(input),
    onSuccess: afterHostAction(queryClient),
  });
}

export function useRejectJoin() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tabId: string; participantId: string; commandId: string }) =>
      gateway.rejectJoin(input),
    onSuccess: afterHostAction(queryClient),
  });
}

export function useRemoveParticipant() {
  const gateway = useGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { tabId: string; participantId: string; commandId: string }) =>
      gateway.removeParticipant(input),
    onSuccess: afterHostAction(queryClient),
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
    onSuccess: afterHostAction(queryClient),
  });
}

export function useCallWaiter() {
  const gateway = useGateway();
  return useMutation({
    mutationFn: (input: { tabId: string; reason: WaiterCallReason; commandId: string }) =>
      gateway.callWaiter(input),
  });
}
