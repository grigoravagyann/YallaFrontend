import { branchBindingFor, type ConsoleBranch, type StaffRole } from '@yalla/api';

/** The sentinel the branch `<select>` uses for "every branch of the venue". */
export const ALL_BRANCHES = '__all__';

/**
 * The branch the select shows for a role, from what was last chosen.
 *
 * Derived rather than stored: "All branches" is not an answer for a branch
 * manager, so switching the role to one moves the select to a real branch —
 * the one on screen, else the first — without an effect repairing state. The
 * choice itself is kept, so switching back to a waiter restores it.
 */
export function branchChoiceFor(
  role: StaffRole,
  choice: string,
  fallbackBranchId: string | null,
  branches: readonly ConsoleBranch[],
): string {
  if (branchBindingFor(role) !== 'required' || choice !== ALL_BRANCHES) return choice;
  const fallback = branches.find((branch) => branch.id === fallbackBranchId) ?? branches[0];
  return fallback?.id ?? ALL_BRANCHES;
}

/**
 * The `branchId` a save sends for this role: none for a general manager, who
 * runs every branch; otherwise the choice, with "All branches" as null.
 */
export function branchIdFor(role: StaffRole, choice: string): string | null {
  if (branchBindingFor(role) === 'venueWide') return null;
  return choice === ALL_BRANCHES ? null : choice;
}
