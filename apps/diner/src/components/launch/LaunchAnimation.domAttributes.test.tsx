// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/**
 * `Animated.createAnimatedComponent` forces `collapsable={false}` on whatever it
 * wraps, and react-native-svg's web shapes spread every prop onto the DOM node.
 * React DOM then warned about the boolean on every launch, and Expo showed
 * that warning as the dev error toast over every screen of the web build.
 *
 * Its own file: React DOM reports an unknown attribute once per process, so
 * only the first render of the strokes can be the one under test.
 */

const splash = vi.hoisted(() => ({
  preventAutoHideAsync: vi.fn(() => Promise.resolve(true)),
  hideAsync: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('expo-splash-screen', () => splash);

const { LaunchAnimation } = await import('./LaunchAnimation');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('draws the logo strokes without React DOM warning about an attribute', async () => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  const { container } = render(<LaunchAnimation appReady={false} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

  expect(container.querySelectorAll('path, circle').length).toBeGreaterThan(0);
  const warnings = error.mock.calls.map((call) => call.map(String).join(' '));
  expect(warnings.filter((text) => text.includes('non-boolean attribute'))).toEqual([]);
  expect(warnings.filter((text) => text.includes('collapsable'))).toEqual([]);
});
