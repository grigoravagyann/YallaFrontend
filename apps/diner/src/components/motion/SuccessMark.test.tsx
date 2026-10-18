import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SuccessMark } from './SuccessMark';
import type * as ReactNativeModule from 'react-native';

/**
 * The mark on the success screen: the circle pops in, and its glyph — the
 * check, the clock, the cross — is drawn a beat later.
 *
 * The glyph is the part that says what happened, and it used to be drawn only
 * once the pop's spring had come to rest. A spring advances at most 64 ms of
 * its own time per frame, so wherever frames are sparse — a hidden or
 * throttled tab, a phone busy reading the booking again — it settled seconds
 * late or never, and the screen showed a plain coloured circle. The glyph now
 * runs on the clock beside the pop rather than after it.
 */

/*
 * Motion on, unless a test says otherwise. Left to the platform, jsdom has no
 * `matchMedia`, react-native-web then reports reduced motion, and every value
 * starts at its end — which would hide exactly the animation under test.
 */
const motion = vi.hoisted(() => ({ reduced: false, springSettles: true }));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }));

/*
 * A small driver with React Native's documented semantics, in place of the
 * no-op one react-native-web uses under a test runner (where everything ends
 * the moment it starts). A timing lands after its delay; a sequence starts
 * each step when the one before ends; a parallel starts every step at once.
 * The spring either settles at once or — `springSettles: false` — never: what
 * a starved frame loop looks like from the outside.
 */
vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactNativeModule>();
  type Done = (result: { finished: boolean }) => void;
  type Step = { start: (done?: Done) => void; stop: () => void };
  type Value = InstanceType<typeof actual.Animated.Value>;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const spring = (value: Value, config: { toValue: number }): Step => ({
    start: (done) => {
      if (!motion.springSettles) return;
      value.setValue(config.toValue);
      done?.({ finished: true });
    },
    stop: () => undefined,
  });
  const timing = (value: Value, config: { toValue: number; delay?: number }): Step => ({
    start: (done) => {
      timers.push(
        setTimeout(() => {
          value.setValue(config.toValue);
          done?.({ finished: true });
        }, config.delay ?? 0),
      );
    },
    stop: () => timers.splice(0).forEach(clearTimeout),
  });
  const sequence = (steps: Step[]): Step => ({
    start: (done) => {
      let index = 0;
      const next: Done = (result) => {
        if (!result.finished) return done?.(result);
        const step = steps[index++];
        if (!step) return done?.({ finished: true });
        step.start(next);
      };
      next({ finished: true });
    },
    stop: () => steps.forEach((step) => step.stop()),
  });
  const parallel = (steps: Step[]): Step => ({
    start: (done) => {
      let left = steps.length;
      steps.forEach((step) =>
        step.start(() => {
          left -= 1;
          if (left === 0) done?.({ finished: true });
        }),
      );
    },
    stop: () => steps.forEach((step) => step.stop()),
  });

  return { ...actual, Animated: { ...actual.Animated, spring, timing, sequence, parallel } };
});

vi.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => <span data-testid="glyph">{name}</span>,
}));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));

afterEach(() => {
  cleanup();
  motion.reduced = false;
  motion.springSettles = true;
});

/** The glyph's own animated wrapper: its opacity is the drawing. */
function glyphOpacity(): string {
  return (screen.getByTestId('glyph').parentElement as HTMLElement).style.opacity;
}

describe('the success mark', () => {
  it.each([
    ['success', 'checkmark'],
    ['pending', 'time-outline'],
    ['declined', 'close'],
  ] as const)('draws the %s glyph', async (tone, glyph) => {
    render(<SuccessMark tone={tone} />);

    expect(screen.getByTestId('glyph').textContent).toBe(glyph);
    await waitFor(() => expect(glyphOpacity()).toBe('1'), { timeout: 3000 });
  });

  it('starts undrawn, so the glyph is drawn rather than simply there', () => {
    render(<SuccessMark tone="success" />);
    expect(glyphOpacity()).toBe('0');
  });

  it('is simply there under reduced motion', () => {
    motion.reduced = true;
    render(<SuccessMark tone="declined" />);
    expect(glyphOpacity()).toBe('1');
  });

  it.each(['success', 'pending', 'declined'] as const)(
    'draws the %s glyph even when the pop never comes to rest',
    async (tone) => {
      motion.springSettles = false;
      render(<SuccessMark tone={tone} />);

      await waitFor(() => expect(glyphOpacity()).toBe('1'), { timeout: 3000 });
    },
  );
});
