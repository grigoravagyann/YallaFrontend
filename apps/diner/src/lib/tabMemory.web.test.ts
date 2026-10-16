import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What a reload must find on the web build: the tab this browser is on and the
 * participant token that tab issued it. Both lived only in memory, so a reload
 * or a pasted `/tab/<id>` said "the tab was closed, or you were removed" while
 * the server still had the diner on it.
 */

let stored: Map<string, string>;

beforeEach(() => {
  vi.resetModules();
  stored = new Map();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => stored.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => stored.set(key, value)),
    removeItem: vi.fn((key: string) => stored.delete(key)),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the tab memory on web', () => {
  it('gives the tokens back after a reload', async () => {
    await (await import('./tabMemory.web')).tabTokenStorage.write({ 'tab-1': 'token-1' });

    vi.resetModules();
    const again = await (await import('./tabMemory.web')).tabTokenStorage.read();

    expect(again).toEqual({ 'tab-1': 'token-1' });
  });

  it('keeps only the latest few tabs', async () => {
    const { tabTokenStorage } = await import('./tabMemory.web');

    await tabTokenStorage.write({ a: '1', b: '2', c: '3', d: '4' });

    expect(await tabTokenStorage.read()).toEqual({ b: '2', c: '3', d: '4' });
  });

  it('reads something unreadable as no tokens', async () => {
    stored.set('yalla.diner.tabTokens', '{not json');
    const { tabTokenStorage } = await import('./tabMemory.web');

    expect(await tabTokenStorage.read()).toEqual({});
  });

  it('remembers the active tab, and forgets it when cleared', async () => {
    await (await import('./tabMemory.web')).activeTabMemory.write('tab-1');

    vi.resetModules();
    const { activeTabMemory } = await import('./tabMemory.web');
    expect(await activeTabMemory.read()).toBe('tab-1');

    await activeTabMemory.write(null);
    expect(await activeTabMemory.read()).toBeNull();
  });

  it('still answers where the browser blocks storage', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    const { tabTokenStorage, activeTabMemory } = await import('./tabMemory.web');

    await expect(tabTokenStorage.write({ a: '1' })).resolves.toBeUndefined();
    expect(await tabTokenStorage.read()).toEqual({});
    expect(await activeTabMemory.read()).toBeNull();
  });
});
