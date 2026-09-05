import { describeFailure, type ConsoleUser, type FailureKind, type UserRole } from '@yalla/api';
import { useConsoleGateway } from '@yalla/api/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useDevRole } from './session';

export interface CurrentUserResult {
  readonly user: ConsoleUser | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  /** Why there is no user, when there is none. `unauthorized` means "show sign-in". */
  readonly failure: FailureKind | null;
}

/**
 * Who is signed in, and what their token lets them reach.
 *
 * The one place any component asks about role or scope. There are no inline
 * `user.role === 'owner'` checks scattered through screens: a screen either
 * exists in this person's router or it does not, and where a decision is
 * genuinely conditional it goes through `<RequireRole>`.
 *
 * Note what is *not* here: no setter, and no way for a component to widen its
 * own scope. Scope arrives from the server and travels one way. Against the
 * real backend it is read from the access token's claims; against the mock
 * from the dev role switcher.
 */
export function useCurrentUser(): CurrentUserResult {
  const gateway = useConsoleGateway();
  const role = useDevRole((state) => state.role);

  const query = useQuery({
    queryKey: ['currentUser', role],
    queryFn: () => gateway.getCurrentUser(),
    // The signed-in identity does not change under you mid-session; refetching
    // it on every window focus would restart the whole role-built router.
    staleTime: Infinity,
  });

  return {
    user: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    failure: query.error ? describeFailure(query.error) : null,
  };
}

/**
 * The branches this person may act on, resolved against a venue they can see.
 *
 * A platform admin has an empty `branchIds` meaning "all", which is why this
 * cannot be a plain array read: the empty case means the opposite thing for
 * them than it does for a manager.
 */
export function useScopedBranchIds(
  user: ConsoleUser | undefined,
  allBranchIds: readonly string[],
): readonly string[] {
  return useMemo(() => {
    if (!user) return [];
    if (user.role === 'platformAdmin') return allBranchIds;
    return allBranchIds.filter((id) => user.scope.branchIds.includes(id));
  }, [user, allBranchIds]);
}

/** Roles that reach the console's venue section. */
export const VENUE_ROLES: readonly UserRole[] = ['owner', 'manager'];

/** Roles that reach the staff floor screen. */
export const FLOOR_ROLES: readonly UserRole[] = ['manager', 'waiter', 'kitchen'];

/** Roles that reach the platform section. */
export const PLATFORM_ROLES: readonly UserRole[] = ['platformAdmin'];

/** Where a role lands when it opens the app at `/`. */
export function landingPathFor(role: UserRole): string {
  if (PLATFORM_ROLES.includes(role)) return '/platform/venues';
  if (VENUE_ROLES.includes(role)) return '/venue/floorplan';
  return '/staff';
}
