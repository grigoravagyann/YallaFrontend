import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConsoleGateway } from '../consoleGateway';
import type { SetReviewVisibilityCommand, VenueReviewQuery } from '../contracts/reviews';
import { staleTime } from '../queryClient';
import { useConsoleGateway } from './gateways';
import { queryKeys } from './queryKeys';
import { refreshPlatformViews, refreshVenueViews } from './consoleRefresh';

// --- Review moderation ----------------------------------------------------------

/** A branch's reviews for the platform team. Platform admin only. */
export function usePlatformBranchReviews(
  branchId: string | undefined,
  query: VenueReviewQuery = {},
) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.platformReviews(branchId ?? '', query),
    queryFn: () => gateway.listPlatformBranchReviews(branchId!, query),
    enabled: Boolean(branchId),
    staleTime: staleTime.frequent,
    placeholderData: keepPreviousData,
  });
}

/** A branch's reviews for its owner or manager, with report counts. */
export function useVenueBranchReviews(branchId: string | undefined, query: VenueReviewQuery = {}) {
  const gateway = useConsoleGateway();
  return useQuery({
    queryKey: queryKeys.venueReviews(branchId ?? '', query),
    queryFn: () => gateway.listVenueBranchReviews(branchId!, query),
    enabled: Boolean(branchId),
    staleTime: staleTime.frequent,
    placeholderData: keepPreviousData,
  });
}

/**
 * Both takedown routes invalidate both lists on settle: a refusal (the
 * platform hid it first, somebody else restored it) means the row on screen
 * is what is stale.
 */
function useReviewVisibility<TInput>(
  run: (gateway: ConsoleGateway, input: TInput) => Promise<unknown>,
) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => run(gateway, input),
    retry: false,
    // Settles once the moderation lists have refetched: a review that leaves
    // the filter on screen is gone when the caller moves the focus.
    onSettled: () => {
      // The published reviews are the rating and the count on the list and the venue page.
      refreshVenueViews(queryClient);
      refreshPlatformViews(queryClient);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['console', 'platformReviews'] }),
        queryClient.invalidateQueries({ queryKey: ['console', 'venueReviews'] }),
      ]);
    },
  });
}

/**
 * The platform sets a review's reports aside and leaves the review as it is.
 * Refreshes both moderation lists, as a hide does, and settles only once they
 * are refreshed: the reviews page shows the reports gone until the lists say
 * so themselves, with no moment in between where they come back.
 */
export function useDismissReviewReports() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => gateway.dismissReviewReports(reviewId),
    retry: false,
    onSettled: () => {
      refreshVenueViews(queryClient);
      refreshPlatformViews(queryClient);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['console', 'platformReviews'] }),
        queryClient.invalidateQueries({ queryKey: ['console', 'venueReviews'] }),
      ]);
    },
  });
}

/**
 * Undo a dismissal: the reports count again. Settles once both moderation
 * lists have refetched, as the dismissal does.
 */
export function useRestoreReviewReports() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => gateway.restoreReviewReports(reviewId),
    retry: false,
    onSettled: () => {
      refreshVenueViews(queryClient);
      refreshPlatformViews(queryClient);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['console', 'platformReviews'] }),
        queryClient.invalidateQueries({ queryKey: ['console', 'venueReviews'] }),
      ]);
    },
  });
}

/** The platform's hide or restore. */
export function useSetReviewVisibility() {
  return useReviewVisibility(
    (gateway, input: { reviewId: string; command: SetReviewVisibilityCommand }) =>
      gateway.setReviewVisibility(input.reviewId, input.command),
  );
}

/** The venue's hide or restore, at one branch. */
export function useSetVenueReviewVisibility(branchId: string | undefined) {
  return useReviewVisibility(
    (gateway, input: { reviewId: string; command: SetReviewVisibilityCommand }) =>
      gateway.setVenueReviewVisibility(branchId!, input.reviewId, input.command),
  );
}

/**
 * The venue's reply under a review: written, changed or taken down. Settles
 * once both moderation lists have refetched, as a hide does, so the row on
 * screen already shows the reply when the focus moves back to it.
 */
export function useReviewReply(branchId: string | undefined) {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { reviewId: string; text: string | null }) =>
      input.text === null
        ? gateway.removeReviewReply(branchId!, input.reviewId)
        : gateway.replyToReview(branchId!, input.reviewId, input.text),
    retry: false,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['console', 'venueReviews'] }),
        queryClient.invalidateQueries({ queryKey: ['console', 'platformReviews'] }),
      ]),
  });
}

/**
 * The platform takes a venue's reply down. Settles once both moderation lists
 * have refetched; the home feed reads the audit line it writes.
 */
export function useRemovePlatformReviewReply() {
  const gateway = useConsoleGateway();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewId: string) => gateway.removePlatformReviewReply(reviewId),
    retry: false,
    onSettled: () => {
      refreshPlatformViews(queryClient);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['console', 'platformReviews'] }),
        queryClient.invalidateQueries({ queryKey: ['console', 'venueReviews'] }),
      ]);
    },
  });
}
