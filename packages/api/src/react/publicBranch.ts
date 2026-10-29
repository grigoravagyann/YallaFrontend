import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { awaitsVenueAnswer } from '../contracts/approvals';
import { onYourWayAskedFromUtc } from '../contracts/preOrder';
import type { ManagedBooking, RescheduleManagedBookingCommand } from '../contracts/publicBranch';
import { staleTime } from '../queryClient';
import { useGateway, usePublicGateway } from './gateways';
import { queryKeys } from './queryKeys';

// --- The public branch page ---------------------------------------------------

/**
 * How often the page re-reads the room while somebody is looking at it.
 *
 * Forty-five seconds is a compromise between two real costs. Shorter and a page
 * left open on a table is a request every few seconds from a phone on mobile
 * data, for a number that changes when a party sits down — minutes apart, not
 * seconds. Longer and the count on screen is stale enough to send four people
 * to a venue with two tables.
 */
export const PUBLIC_REFRESH_MS = 45_000;

/**
 * How often a manage link waiting on the venue's answer reads itself again.
 *
 * Slower than `APPROVAL_POLL_MS`, on purpose: the link's budget on the
 * server is 20 requests a minute **per link**, shared by its read, its cancel
 * and its change, and across every tab and person holding it — a link in a
 * group chat open on four phones polling every ten seconds would leave no room
 * for the change somebody is trying to make (PP5 wire, budget note). Fifteen
 * seconds keeps the answer well inside a fifteen-minute window.
 */
export const MANAGE_LINK_POLL_MS = 15_000;

/**
 * How often a manage link reads itself while a request waits with **no** clock
 * — a party grown past the venue's threshold, a branch that approves every
 * booking: the venue may take hours, and the page still promises to show the
 * answer. Once a minute, on a visible tab only, leaves the link's budget for
 * the person actually changing or cancelling it (PP5-FE-REVIEW S2).
 */
export const MANAGE_LINK_SLOW_POLL_MS = 60_000;

/**
 * Past this much time left to answer, the manage link reads slowly: the 15 s
 * cadence is for a fifteen-minute window, and a booking made without a verified
 * number (legacy rows from 2026-10-20) may wait a day (UG review S8).
 */
export const MANAGE_LINK_FAST_POLL_WITHIN_MS = 60 * 60_000;

/**
 * How far ahead of "Are you on your way?" a confirmed link with a pre-order
 * starts reading itself, once a minute, so the question is on the page within
 * a minute of being asked (pre-orders, 2026-10-21).
 */
export const MANAGE_LINK_ON_YOUR_WAY_LEAD_MS = 60 * 60_000;

/** The manage link's poll for a booking as it stands: `false` once nothing waits. */
export function manageLinkPollMs(
  booking:
    | ({ readonly status: string; readonly approvalExpiresAtUtc: string | null } & {
        readonly slotUtc?: string | undefined;
        readonly preOrder?: { readonly state: string } | null | undefined;
        readonly guestConfirmedOnWayAtUtc?: string | null | undefined;
      })
    | null
    | undefined,
  now: number = Date.now(),
): number | false {
  if (booking?.status === 'confirmed') {
    // The "on your way" question, asked of every booking: not answered, the
    // pre-order (if any) not in the kitchen, the start ahead, and the question
    // near or open (45 minutes before with a pre-order, 30 otherwise).
    const start = Date.parse(booking.slotUtc ?? '');
    const from = booking.slotUtc
      ? onYourWayAskedFromUtc({ startUtc: booking.slotUtc, preOrder: booking.preOrder })
      : null;
    const pending = from !== null && !booking.guestConfirmedOnWayAtUtc;
    const askedFrom = from ? Date.parse(from) : Number.NaN;
    return pending &&
      Number.isFinite(start) &&
      now < start &&
      now >= askedFrom - MANAGE_LINK_ON_YOUR_WAY_LEAD_MS
      ? MANAGE_LINK_SLOW_POLL_MS
      : false;
  }
  if (!booking || booking.status !== 'pendingApproval') return false;
  if (!awaitsVenueAnswer(booking)) return MANAGE_LINK_SLOW_POLL_MS;
  const left = Date.parse(booking.approvalExpiresAtUtc ?? '') - now;
  return Number.isFinite(left) && left > MANAGE_LINK_FAST_POLL_WITHIN_MS
    ? MANAGE_LINK_SLOW_POLL_MS
    : MANAGE_LINK_POLL_MS;
}

/**
 * The venue-level chooser.
 *
 * Reference data with a live number attached, so it takes the live cadence: the
 * per-branch free counts are the only reason this screen beats a phone call.
 * The branch page no longer reads it: its "All N branches" is
 * `PublicBranch.venueBranchCount`.
 */
export function usePublicVenue(venueSlug: string | undefined) {
  const gateway = usePublicGateway();
  return useQuery({
    queryKey: queryKeys.publicVenue(venueSlug ?? ''),
    queryFn: () => gateway.resolveVenue(venueSlug!),
    enabled: Boolean(venueSlug),
    staleTime: staleTime.live,
    refetchInterval: PUBLIC_REFRESH_MS,
    // A page in a background tab is a page nobody is reading. Refetching it
    // spends a stranger's mobile data on a number they cannot see.
    refetchIntervalInBackground: false,
  });
}

/**
 * The chooser's branch cards as the listing has them — the cover photo and the
 * district — which the venue list does not carry (`GET /api/public/branches/search`,
 * by the venue's name, kept to this venue's slug). Reference data: read once
 * for the visit. The cards stand without it: a failed or slow read leaves them
 * with no photo and no district, never with no card.
 */
export function usePublicVenueListings(
  venue: {
    readonly slug: string;
    readonly name: string;
  } | null,
) {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.publicVenueListings(venue?.slug ?? ''),
    queryFn: async () => {
      const listings = await gateway.searchBranches({ query: venue!.name });
      return listings.filter((listing) => listing.venueSlug === venue!.slug);
    },
    enabled: Boolean(venue?.slug && venue.name),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  });
}

/**
 * The branch page's own data: the venue header, the counts, the hours.
 *
 * `refetchOnWindowFocus` is on (the client default) and load-bearing here
 * rather than incidental — someone comes back to this tab after ten minutes in
 * a chat, and the first thing they look at is the number that was true when
 * they left.
 */
export function usePublicBranch(input: {
  readonly venueSlug: string | undefined;
  readonly branchSlug: string | undefined;
  /**
   * Refresh on the live cadence — the branch page's free count. Off for a
   * reader that only needs the branch itself (the manage link: its phone, its
   * pin, its hours for changing the booking), so it does not poll.
   */
  readonly live?: boolean;
}) {
  const gateway = usePublicGateway();
  const { venueSlug, branchSlug } = input;
  const live = input.live ?? true;
  return useQuery({
    queryKey: queryKeys.publicBranch(venueSlug ?? '', branchSlug ?? ''),
    queryFn: () => gateway.resolveBranch({ venueSlug: venueSlug!, branchSlug: branchSlug! }),
    enabled: Boolean(venueSlug) && Boolean(branchSlug),
    staleTime: staleTime.live,
    refetchInterval: live ? PUBLIC_REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });
}

/**
 * A day of times at a branch that books by time only, for one party: which
 * times take them, and how many more guests each could still take. Live, like
 * the day of slots it stands in for, and under `['availability', branchId]` so
 * a booking just made reads it again. The caller settles the party size.
 */
export function usePublicTimeSlots(input: {
  readonly branchId: string | undefined;
  /** `YYYY-MM-DD` in the branch's calendar. */
  readonly date: string | undefined;
  readonly partySize: number;
  readonly enabled?: boolean;
}) {
  const gateway = usePublicGateway();
  const { branchId, date, partySize } = input;
  return useQuery({
    queryKey: queryKeys.publicTimeSlots(branchId ?? '', date ?? '', partySize),
    queryFn: () => gateway.getTimeOnlySlots({ branchId: branchId!, date: date!, partySize }),
    enabled: Boolean(branchId) && Boolean(date) && (input.enabled ?? true),
    staleTime: staleTime.live,
    // The day's last answer stays on screen while the party's loads.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === (branchId ?? '') && previousQuery.queryKey[3] === (date ?? '')
        ? previous
        : undefined,
  });
}

/**
 * The menu, with photos.
 *
 * Cached hard and never refetched on focus: a menu is reference data, the
 * photos are the heaviest thing on the page, and re-fetching it when somebody
 * returns to the tab would re-run the image loads for no new information.
 */
export function usePublicMenu(branchId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.publicMenu(branchId ?? ''),
    queryFn: () => gateway.getBranchMenuDetail(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  });
}

/**
 * The branch's listing: cuisine, price level, rating and review count,
 * district, about, website, amenities, the gallery and the newest three
 * reviews with their replies (`GET /api/public/branches/{branchId}`).
 *
 * Reference data, read once: none of it changes while somebody reads the page,
 * and the live half (open now, free tables) comes from `usePublicBranch`.
 */
export function usePublicBranchDetail(branchId: string | undefined) {
  const gateway = useGateway();
  return useQuery({
    queryKey: queryKeys.publicBranchDetail(branchId ?? ''),
    queryFn: () => gateway.getBranchDetail(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  });
}

/**
 * Every published review, newest first, twenty to a page
 * (`GET /api/public/branches/{branchId}/reviews`). Asked only when `enabled`:
 * the page shows the newest three from the detail until somebody wants more.
 */
export function usePublicReviews(branchId: string | undefined, enabled: boolean) {
  const gateway = useGateway();
  return useInfiniteQuery({
    queryKey: queryKeys.publicReviews(branchId ?? ''),
    queryFn: ({ pageParam }) => gateway.getBranchReviews({ branchId: branchId!, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last && last.page * last.pageSize < last.reviewCount ? last.page + 1 : undefined,
    enabled: enabled && Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  });
}

/**
 * One booking, from its manage link.
 *
 * `slugs` come from the long `/{venueSlug}/{branchSlug}/booking/{token}`
 * address, as a stand-in only: the answer names the booking's own branch,
 * which is how the short `/booking/{token}` link the reminders carry finds it.
 */
export function useManagedBooking(
  token: string | undefined,
  slugs?: { readonly venueSlug?: string | undefined; readonly branchSlug?: string | undefined },
) {
  const gateway = usePublicGateway();
  return useQuery({
    queryKey: queryKeys.managedBooking(token ?? ''),
    queryFn: () => gateway.getManagedBooking({ token: token!, ...slugs }),
    enabled: Boolean(token),
    staleTime: staleTime.frequent,
    // While the venue decides — and only then — read again until it has: the
    // page has no push channel, and "answer within 12:40" is a promise to
    // show the answer when it comes. On the link's own budget: every 15 s
    // with a clock, once a minute without one (`manageLinkPollMs`).
    refetchInterval: (query) => manageLinkPollMs(query.state.data),
    refetchIntervalInBackground: false,
  });
}

/**
 * Cancelling from the signed link.
 *
 * Retry is off, as everywhere. Safety on a deliberate retry comes from the
 * domain rather than from a command id — cancelling an already-cancelled
 * booking is not an error and returns it as it stands. The result replaces the
 * cached booking rather than invalidating it, so the page shows the cancelled
 * state without a second round trip on a connection that was already bad enough
 * to make somebody press the button twice.
 */
export function useCancelManagedBooking(
  token: string | undefined,
  slugs?: { readonly venueSlug?: string | undefined; readonly branchSlug?: string | undefined },
) {
  const gateway = usePublicGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) =>
      gateway.cancelManagedBooking({ token: token!, ...slugs, reason }),
    retry: false,
    onSuccess: (booking: ManagedBooking) => {
      queryClient.setQueryData(queryKeys.managedBooking(token ?? ''), booking);
    },
  });
}

/**
 * Changing the booking from its signed link (public page phase 5).
 *
 * Retry is off: the command id makes a *deliberate* retry safe, and the page
 * says what happened in between. The answer replaces the cached booking — its
 * status is the server's fresh decision — and the room and the branch's counts
 * are read again, since a table moved.
 */
export function useRescheduleManagedBooking(token: string | undefined) {
  const gateway = usePublicGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: Omit<RescheduleManagedBookingCommand, 'token'>) =>
      gateway.rescheduleManagedBooking({ ...command, token: token! }),
    retry: false,
    onSuccess: (booking: ManagedBooking) => {
      queryClient.setQueryData(queryKeys.managedBooking(token ?? ''), booking);
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      void queryClient.invalidateQueries({ queryKey: ['public', 'branch'] });
    },
  });
}
