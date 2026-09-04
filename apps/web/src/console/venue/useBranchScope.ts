import type { ConsoleBranch, ConsoleUser } from '@yalla/api';
import { useMemo, useState } from 'react';

export interface BranchScope {
  /** Only the branches this token actually covers. */
  readonly branches: readonly ConsoleBranch[];
  readonly branchId: string | null;
  readonly setBranchId: (branchId: string) => void;
}

/**
 * Which branch the venue section is looking at.
 *
 * Held in React state and **not** in the URL. That is the whole rule: a branch
 * id in the address bar is a scope claim the user can edit, and a manager who
 * changes one would be asking the server for a branch they do not hold. Keeping
 * it here means the client can only ever name a branch the token already gave
 * it — the server still checks, but the client never even constructs the link.
 */
export function useBranchScope(
  user: ConsoleUser,
  allBranches: readonly ConsoleBranch[],
): BranchScope {
  const branches = useMemo(() => {
    // A platform admin's empty `branchIds` means every branch, not none.
    if (user.role === 'platformAdmin') return allBranches;
    return allBranches.filter((branch) => user.scope.branchIds.includes(branch.id));
  }, [user, allBranches]);

  // What the user last picked, which is a *preference* rather than the answer.
  const [preferred, setPreferred] = useState<string | null>(null);

  // The effective branch is derived, not stored. A stored one would need an
  // effect to repair it whenever the branch list narrows — the role switcher
  // does exactly that — and repairing state from an effect is a cascading
  // render and a frame of showing a branch this token no longer covers.
  const branchId =
    preferred !== null && branches.some((branch) => branch.id === preferred)
      ? preferred
      : (branches[0]?.id ?? null);

  return { branches, branchId, setBranchId: setPreferred };
}
