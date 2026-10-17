import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the person has asked their phone for less motion.
 *
 * Every decorative animation in the app — the sliding tab highlight, the
 * heart's pop, the photo parallax — checks this and snaps instead. Starts
 * `false` and settles a frame later, so a first render is never blocked on
 * the platform answering.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => undefined);
    // React Native Web answers `addEventListener` without a subscription, so
    // the handle is optional.
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced) as
      { remove?: () => void } | undefined;
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}
