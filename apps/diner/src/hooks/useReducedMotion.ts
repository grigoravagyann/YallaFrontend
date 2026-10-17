import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/*
 * One answer for the whole app. Every card on Explore asks, so the platform
 * is asked once and listened to once, however many hearts are on screen.
 */
let reduced = false;
let started = false;
const listeners = new Set<() => void>();

function set(value: boolean): void {
  if (value === reduced) return;
  reduced = value;
  for (const listener of listeners) listener();
}

function start(): void {
  if (started) return;
  started = true;
  void AccessibilityInfo.isReduceMotionEnabled()
    .then(set)
    .catch(() => undefined);
  // React Native Web answers `addEventListener` without a subscription; the
  // app-wide listener lives as long as the app, so nothing is removed.
  AccessibilityInfo.addEventListener('reduceMotionChanged', set);
}

function subscribe(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): boolean {
  return reduced;
}

/**
 * Whether the person has asked their phone for less motion.
 *
 * Every decorative animation in the app — the sliding tab highlight, the
 * heart's pop, the photo parallax — checks this and snaps instead. Starts
 * `false` and settles once the platform answers, so a first render is never
 * blocked on it.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
