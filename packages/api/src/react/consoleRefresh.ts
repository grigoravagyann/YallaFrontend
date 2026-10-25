import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

/*
 * Console cache refreshes shared by every console feature file. Internal: not
 * re-exported from the barrel.
 */

/**
 * Home's numbers and its activity feed: every change the platform makes, or a
 * venue makes, shows in one or both. Cheap when nobody has visited Home: an
 * invalidation of an absent query does nothing.
 */
export function refreshPlatformViews(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.platformOverview });
  void queryClient.invalidateQueries({ queryKey: ['console', 'platformActivity'] });
}

/**
 * The venues list and the venue pages: a branch's tables, menu, hours,
 * listing, cover or reviews are in the list's columns and on the venue page.
 * By prefix, because a branch-scoped change does not know its venue's id.
 */
export function refreshVenueViews(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['console', 'venues'] });
  void queryClient.invalidateQueries({ queryKey: ['console', 'venue'] });
}
