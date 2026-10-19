import {
  useBranchReadiness,
  usePendingReservations,
  useVenueBranchReviews,
} from '@yalla/api/react';

/** The three counts the venue sidebar shows. `null`: not known, so no badge at all. */
export interface VenueNavCounts {
  /** Bookings waiting for the venue's decision. On Overview. */
  readonly pendingApprovals: number | null;
  /** Dishes hidden from diners until they are finished. On Menu. */
  readonly incompleteDishes: number | null;
  /** Reviews diners reported that nobody has answered yet. On Reviews. */
  readonly reportedReviews: number | null;
}

/** The reported filter's first page, one row long: only its `total` is read. */
const REPORTED_COUNT_QUERY = { filter: 'reported', page: 1, pageSize: 1 } as const;

/**
 * The sidebar's live counts for the branch on screen, from reads the console
 * already makes — no endpoint of their own:
 *
 * - **pending approvals**: `GET /api/branches/{id}/reservations?status=1`, the
 *   approvals panel's own query (same key, so the panel and the badge are one
 *   request, read again every 30 seconds and after every decision);
 * - **unfinished dishes**: `incompleteMenuItemCount` of
 *   `GET /api/branches/{id}/readiness`, the onboarding checklist's query, which
 *   every menu save invalidates;
 * - **reported reviews**: the `total` of `GET /api/branches/{id}/reviews
 *   ?filter=reported&pageSize=1` — reported, not hidden, so "waiting for an
 *   answer" (`ReviewModerationService`); every hide or restore invalidates it.
 *
 * A count that failed, is loading, or still belongs to the branch shown before
 * a switch is `null`: no badge rather than a wrong number.
 */
export function useVenueNavCounts(branchId: string | null): VenueNavCounts {
  const id = branchId ?? undefined;
  const pending = usePendingReservations(id);
  const readiness = useBranchReadiness(id);
  const reported = useVenueBranchReviews(id, REPORTED_COUNT_QUERY);

  return {
    pendingApprovals: pending.isSuccess ? pending.data.length : null,
    incompleteDishes: readiness.isSuccess ? readiness.data.incompleteMenuItemCount : null,
    reportedReviews: reported.isSuccess && !reported.isPlaceholderData ? reported.data.total : null,
  };
}
