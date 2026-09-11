import type { ManagedBranch } from '@yalla/api';
import { useState } from 'react';

export interface BranchScope {
  readonly branchId: string | null;
  readonly setBranchId: (branchId: string) => void;
}

/**
 * Which branch the venue section is looking at.
 *
 * Held in React state and **not** in the URL. That is the whole rule: a branch
 * id in the address bar is a scope claim the user can edit, and a manager who
 * changes one would be asking the server for a branch they do not hold. Keeping
 * it here means the client can only ever name a branch the server already gave
 * it — the server still checks, but the client never even constructs the link.
 *
 * `branches` is the server's answer to `getManagedVenue`, taken as given. It is
 * not intersected with the token's branch claim: an owner's token carries none
 * and they run every branch, and that intersection is how every venue tab came
 * to say "no branch". The claim only picks the *default*: the home branch when
 * the list has it, otherwise the first — which the server sorts to be the first
 * active one.
 */
export function useBranchScope(
  branches: readonly ManagedBranch[],
  homeBranchId: string | null,
): BranchScope {
  // What the user last picked, which is a *preference* rather than the answer.
  const [preferred, setPreferred] = useState<string | null>(null);

  const listed = (id: string | null) => id !== null && branches.some((branch) => branch.id === id);

  // The effective branch is derived, not stored. A stored one would need an
  // effect to repair it whenever the branch list narrows — the role switcher
  // does exactly that — and repairing state from an effect is a cascading
  // render and a frame of showing a branch this list no longer has.
  const branchId = listed(preferred)
    ? preferred
    : listed(homeBranchId)
      ? homeBranchId
      : (branches[0]?.id ?? null);

  return { branchId, setBranchId: setPreferred };
}
