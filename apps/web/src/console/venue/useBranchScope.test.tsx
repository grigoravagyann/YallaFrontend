// @vitest-environment jsdom
import type { ManagedBranch } from '@yalla/api';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useBranchScope } from './useBranchScope';

/**
 * Which branch the venue section opens on.
 *
 * The list is the server's answer to `getManagedVenue` and is taken as given:
 * the hook no longer intersects it with the token's branch claim, because an
 * owner's token carries none and that intersection is how every venue tab came
 * to say "no branch". What it still decides is the default — the home branch
 * when the list has it, otherwise the first, which the server sorts to be the
 * first *active* one.
 */

function branch(id: string, name: string, isActive = true): ManagedBranch {
  return {
    id,
    venueId: 'v-1',
    name,
    slug: id,
    timeZoneId: 'Asia/Yerevan',
    tableCount: 0,
    subscriptionTier: 'free',
    openTabCount: null,
    isActive,
  };
}

const B1 = branch('b-1', 'Northern Avenue');
const B2 = branch('b-2', 'Cascade');

afterEach(cleanup);

describe('useBranchScope', () => {
  it('opens on the home branch when the list has it', () => {
    const { result } = renderHook(() => useBranchScope([B1, B2], 'b-2'));
    expect(result.current.branchId).toBe('b-2');
  });

  it('opens on the first listed branch when the token names none', () => {
    // An owner, or a manager created with no branch: `branchIds` is empty.
    const { result } = renderHook(() => useBranchScope([B1, B2], null));
    expect(result.current.branchId).toBe('b-1');
  });

  it('falls back to the first branch when the home branch is not listed', () => {
    // A token that names a branch the server no longer returns for this
    // caller must not produce a selection nothing on screen matches.
    const { result } = renderHook(() => useBranchScope([B1, B2], 'b-gone'));
    expect(result.current.branchId).toBe('b-1');
  });

  it('lets a choice win over the default, until the list stops having it', () => {
    const { result, rerender } = renderHook(
      ({ branches }: { branches: readonly ManagedBranch[] }) => useBranchScope(branches, 'b-2'),
      { initialProps: { branches: [B1, B2] } },
    );
    act(() => result.current.setBranchId('b-1'));
    expect(result.current.branchId).toBe('b-1');

    // The list narrows to one the choice is not in: derived, never stored, so
    // there is no frame showing a branch the list does not have.
    rerender({ branches: [B2] });
    expect(result.current.branchId).toBe('b-2');
  });

  it('has nothing selected when the list is empty', () => {
    const { result } = renderHook(() => useBranchScope([], 'b-2'));
    expect(result.current.branchId).toBeNull();
  });
});
