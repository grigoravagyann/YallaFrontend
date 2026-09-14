import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The web build's device id. `expo-secure-store` has no web implementation, so
 * the phone's version threw there and the web build never sent a table scan.
 */

let stored: Map<string, string>;

beforeEach(() => {
  vi.resetModules();
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => stored.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => stored.set(key, value)),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('installDeviceId on web', () => {
  it('makes one id and keeps it across a reload', async () => {
    const first = await (await import('./deviceId.web')).installDeviceId();
    expect(first).toMatch(/\S{8,}/);
    expect(stored.get('yalla.diner.deviceId')).toBe(first);

    vi.resetModules();
    const again = await (await import('./deviceId.web')).installDeviceId();
    expect(again).toBe(first);
  });

  it('still answers, and the same id, where the browser blocks storage', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const { installDeviceId } = await import('./deviceId.web');

    const first = await installDeviceId();
    expect(first).toMatch(/\S{8,}/);
    expect(await installDeviceId()).toBe(first);
  });
});
