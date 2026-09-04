import { QueryClient } from '@tanstack/react-query';
import { isRetryable } from './errors';

/**
 * How long a cached value is considered fresh.
 *
 * Table state is the reason these numbers are so short. A floor plan that says
 * a table is free when it was taken forty seconds ago causes a real argument at
 * a real door, so live data is treated as stale almost immediately and leans on
 * SignalR for push updates. Reference data that changes when an owner edits it
 * can sit for minutes.
 */
export const staleTime = {
  /** Floor state, open tabs, order queue. Effectively always refetch. */
  live: 5_000,
  /** Bookings for today — changes often, but not second to second. */
  frequent: 30_000,
  /** Menu, opening hours, venue details. */
  reference: 5 * 60_000,
  /** Things that essentially never change within a session. */
  static: 60 * 60_000,
} as const;

const MAX_QUERY_RETRIES = 3;

export interface CreateQueryClientOptions {
  /** Overridden in tests to make failures immediate. */
  readonly retry?: boolean | undefined;
}

/**
 * The shared TanStack Query configuration for all three apps.
 *
 * Two deliberate choices:
 *
 * - **Mutations never retry.** Seating a walk-in, closing a bill and taking an
 *   order are not idempotent. An automatic retry after a timeout can double-add
 *   a round of drinks, and the client cannot tell a lost response from a lost
 *   request. Retrying a write is the staff app's offline queue's job, where it
 *   can be made idempotent with a client-generated id.
 * - **Queries retry only on transport and 5xx failures.** Retrying a 404 or a
 *   409 just delays the error the user needs to see.
 */
export function createQueryClient(options: CreateQueryClientOptions = {}): QueryClient {
  const retryEnabled = options.retry ?? true;

  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: staleTime.live,
        gcTime: 5 * 60_000,
        // The wifi in a Yerevan cafe basement drops; when it comes back, refill.
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (!retryEnabled) return false;
          if (failureCount >= MAX_QUERY_RETRIES) return false;
          return isRetryable(error);
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
      },
      mutations: {
        retry: false,
      },
    },
  });
}
