import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TAB_PERMISSIONS,
  isValidTabPermissions,
  normalizeTabPermissions,
  setTabPermission,
  togglePullsAlong,
} from './permissions';
import type { TabPermissions } from './tab';

const OFF: TabPermissions = { canOrder: false, canSeeTableTotal: false, canPay: false };

describe('tab permissions', () => {
  it('pay off by default, because hiding the total is for the host who is treating everyone', () => {
    expect(DEFAULT_TAB_PERMISSIONS.canPay).toBe(false);
    expect(DEFAULT_TAB_PERMISSIONS.canSeeTableTotal).toBe(true);
    expect(isValidTabPermissions(DEFAULT_TAB_PERMISSIONS)).toBe(true);
  });

  it('rejects pay-without-total as invalid rather than tolerating it', () => {
    expect(isValidTabPermissions({ ...OFF, canPay: true })).toBe(false);
  });

  it('normalizing pay-without-total turns the total on, never pay off', () => {
    const fixed = normalizeTabPermissions({ ...OFF, canPay: true });
    expect(fixed).toEqual({ canOrder: false, canSeeTableTotal: true, canPay: true });
  });

  it('turning pay on pulls the total on with it', () => {
    const next = setTabPermission(OFF, 'canPay', true);
    expect(next.canPay).toBe(true);
    expect(next.canSeeTableTotal).toBe(true);
  });

  it('turning the total off pushes pay off with it', () => {
    const both: TabPermissions = { canOrder: true, canSeeTableTotal: true, canPay: true };
    const next = setTabPermission(both, 'canSeeTableTotal', false);
    expect(next.canSeeTableTotal).toBe(false);
    expect(next.canPay).toBe(false);
  });

  it('never produces an invalid pair from any single toggle', () => {
    const all: TabPermissions[] = [];
    for (const canOrder of [false, true]) {
      for (const canSeeTableTotal of [false, true]) {
        for (const canPay of [false, true]) {
          all.push({ canOrder, canSeeTableTotal, canPay });
        }
      }
    }

    for (const start of all) {
      for (const key of ['canOrder', 'canSeeTableTotal', 'canPay'] as const) {
        for (const value of [false, true]) {
          expect(isValidTabPermissions(setTabPermission(start, key, value))).toBe(true);
        }
      }
    }
  });

  it('reports when a toggle will move the other switch, so the UI only explains itself when it must', () => {
    expect(togglePullsAlong(OFF, 'canPay', true)).toBe(true);
    expect(togglePullsAlong(DEFAULT_TAB_PERMISSIONS, 'canPay', true)).toBe(false);
    expect(
      togglePullsAlong(
        { canOrder: true, canSeeTableTotal: true, canPay: true },
        'canSeeTableTotal',
        false,
      ),
    ).toBe(true);
    expect(togglePullsAlong(DEFAULT_TAB_PERMISSIONS, 'canOrder', false)).toBe(false);
  });
});
