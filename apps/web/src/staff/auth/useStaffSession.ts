import type { StaffSessionSnapshot } from '@yalla/api';
import { useEffect, useSyncExternalStore } from 'react';
import { staffSession } from './staffSession';

/**
 * The session state, as a React value.
 *
 * `useSyncExternalStore` rather than an effect and a piece of state: the
 * session can change between render and commit — a renewal resolving, an idle
 * timer firing — and a screen that read it once and stored it would keep the
 * floor on screen for a person who is no longer signed in.
 */

const SIGNED_OUT: StaffSessionSnapshot = {
  state: 'unenrolled',
  device: null,
  identity: null,
  lastSignOut: null,
};

/** What the mock data source reports: no tablet credential, nothing to lock. */
const MOCK_SNAPSHOT: StaffSessionSnapshot = {
  state: 'signedIn',
  device: null,
  identity: null,
  lastSignOut: null,
};

export function useStaffSessionSnapshot(): StaffSessionSnapshot {
  return useSyncExternalStore(
    (listener) => staffSession?.subscribeToStaffSession(listener) ?? (() => undefined),
    () => staffSession?.getSnapshot() ?? MOCK_SNAPSHOT,
    () => (staffSession ? SIGNED_OUT : MOCK_SNAPSHOT),
  );
}

/**
 * Every tap pushes the idle deadline out.
 *
 * Bound at the document rather than on the floor's root element, because a
 * waiter interacting with an overlay, a keypad or a dialog is a waiter using
 * the tablet, and a lock that fired while somebody was mid-order would be
 * exactly the behaviour that gets screen locking turned off.
 *
 * `pointerdown` and `keydown` only. Not `mousemove`: a tablet propped against a
 * till gets spurious movement events from nothing, and a lock that never fires
 * is not a lock.
 */
export function useTouchOnInteraction(active: boolean): void {
  useEffect(() => {
    const session = staffSession;
    if (!active || !session) return;
    const touch = () => session.touch();
    document.addEventListener('pointerdown', touch, { passive: true });
    document.addEventListener('keydown', touch);
    return () => {
      document.removeEventListener('pointerdown', touch);
      document.removeEventListener('keydown', touch);
    };
  }, [active]);
}
