// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { AccessibilityInfo } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The opening: the logo is drawn over the app's first frames, and lifts only
 * once both the drawing is done and the app is ready — never before the app
 * has something to show, never left covering it afterwards.
 */

const splash = vi.hoisted(() => ({
  preventAutoHideAsync: vi.fn(() => Promise.resolve(true)),
  hideAsync: vi.fn(() => Promise.resolve(true)),
}));
vi.mock('expo-splash-screen', () => splash);

const { LaunchAnimation } = await import('./LaunchAnimation');

async function settle(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('the launch animation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hands over from the native splash as soon as it is on screen', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    render(<LaunchAnimation appReady={false} />);
    await settle(0);
    expect(splash.hideAsync).toHaveBeenCalled();
    expect(screen.getByTestId('launch-animation')).toBeTruthy();
  });

  it('stays over the app until the app is ready, however long that takes', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const { rerender } = render(<LaunchAnimation appReady={false} />);
    await settle(5000);
    expect(screen.getByTestId('launch-animation')).toBeTruthy();

    rerender(<LaunchAnimation appReady />);
    await settle(2000);
    expect(screen.queryByTestId('launch-animation')).toBeNull();
  });

  it('lifts once the logo is drawn when the app was ready first', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    render(<LaunchAnimation appReady />);
    await settle(4000);
    expect(screen.queryByTestId('launch-animation')).toBeNull();
  });

  it('with Reduce Motion on, shows the logo and lifts without drawing it', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    render(<LaunchAnimation appReady />);
    await settle(1000);
    expect(screen.queryByTestId('launch-animation')).toBeNull();
  });
});
