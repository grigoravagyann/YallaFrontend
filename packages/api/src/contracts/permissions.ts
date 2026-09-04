import type { TabPermissions } from './tab';

/**
 * The permission invariants, in one place.
 *
 * These live in the API package rather than in a screen because both the UI and
 * the mock backend have to agree about them, and because the real server
 * enforces them and will reject anything else. A toggle in a component that
 * "just" sets a boolean is exactly how a client starts sending states the
 * server rejects.
 */

/** What a guest gets unless the host says otherwise. */
export const DEFAULT_TAB_PERMISSIONS: TabPermissions = {
  canOrder: true,
  // On by default: most tables split, and hiding the total is the exception
  // rather than the rule.
  canSeeTableTotal: true,
  // Off by default. Hiding the total exists for the host who is treating
  // everyone; paying is the host's job until they say otherwise.
  canPay: false,
};

/** The host can always do everything. Not a toggle anywhere in the UI. */
export const HOST_TAB_PERMISSIONS: TabPermissions = {
  canOrder: true,
  canSeeTableTotal: true,
  canPay: true,
};

/**
 * Force a permission set into a state the server will accept.
 *
 * The single rule: **`canPay` implies `canSeeTableTotal`**. Rather than
 * rejecting the impossible combination and making the caller handle an error,
 * this resolves it the only way that is not user-hostile — someone who may pay
 * may see what they are paying.
 *
 * Note the asymmetry: turning `canSeeTableTotal` *off* also turns `canPay` off,
 * which is handled by {@link setTabPermission} rather than here, because here
 * we cannot tell which of the two the host just touched.
 */
export function normalizeTabPermissions(permissions: TabPermissions): TabPermissions {
  if (permissions.canPay && !permissions.canSeeTableTotal) {
    return { ...permissions, canSeeTableTotal: true };
  }
  return permissions;
}

/** True when the pair is one the server will accept as-is. */
export function isValidTabPermissions(permissions: TabPermissions): boolean {
  return !permissions.canPay || permissions.canSeeTableTotal;
}

export type TabPermissionKey = keyof TabPermissions;

/**
 * Apply one toggle and repair the invariant in the direction the host meant.
 *
 * Turning **pay on** pulls the total on with it. Turning the **total off**
 * pushes pay off with it. Either way the host ends up somewhere valid after one
 * tap, and never has to discover that a switch silently refused to move.
 *
 * The UI is expected to say *why* the other switch moved; this function only
 * guarantees that it does.
 */
export function setTabPermission(
  permissions: TabPermissions,
  key: TabPermissionKey,
  value: boolean,
): TabPermissions {
  const next: TabPermissions = { ...permissions, [key]: value };

  if (key === 'canPay' && value) {
    return { ...next, canSeeTableTotal: true };
  }
  if (key === 'canSeeTableTotal' && !value) {
    return { ...next, canPay: false };
  }
  return normalizeTabPermissions(next);
}

/**
 * True when applying this toggle will also move the other switch.
 *
 * The screen uses this to decide whether to show the short explanatory line.
 * Showing it unconditionally would train people to ignore it.
 */
export function togglePullsAlong(
  permissions: TabPermissions,
  key: TabPermissionKey,
  value: boolean,
): boolean {
  // Ordering is independent of the other two; nothing follows it.
  if (key === 'canOrder') return false;

  const other: TabPermissionKey = key === 'canPay' ? 'canSeeTableTotal' : 'canPay';
  return setTabPermission(permissions, key, value)[other] !== permissions[other];
}
