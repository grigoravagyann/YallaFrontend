import type { BranchDetail } from '@yalla/api';
import { usePublicBranchDetail } from '@yalla/api/react';

/**
 * The branch's listing (`GET /api/public/branches/{branchId}`), as the
 * sections below the name read it.
 *
 * Secondary to the page: the name, the open state, the room and the booking
 * column come from `PublicBranch` and never wait for this. Each section that
 * reads it says what it does while it loads and when it fails, rather than one
 * page-wide state — a review list that did not load is no reason to hide the
 * free tables.
 */
export interface BranchDetailRead {
  /** `undefined` while it loads; `null` when the server has no listing for the branch. */
  readonly detail: BranchDetail | null | undefined;
  /** It failed and there is nothing to show from an earlier read. */
  readonly failed: boolean;
  readonly retry: () => void;
}

export function useBranchDetail(branchId: string): BranchDetailRead {
  const query = usePublicBranchDetail(branchId);
  const failed = query.isError && query.data === undefined;
  return {
    detail: failed ? null : query.data,
    failed,
    retry: () => void query.refetch(),
  };
}
