import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The tab this device is on outlives a reload, so Explore can still point back
 * to it — and a tab the server ended is forgotten, not remembered for ever.
 */

const memory = vi.hoisted(() => {
  let value: string | null = null;
  return {
    set: (next: string | null) => {
      value = next;
    },
    get: () => value,
    read: vi.fn(() => Promise.resolve(value)),
    write: vi.fn((next: string | null) => {
      value = next;
      return Promise.resolve();
    }),
  };
});

vi.mock('../lib/tabMemory', () => ({
  activeTabMemory: { read: memory.read, write: memory.write },
}));

beforeEach(() => {
  vi.resetModules();
  memory.set(null);
});

describe('the active tab', () => {
  it('is written down when this device joins one', async () => {
    const { useActiveTab } = await import('./tab');

    useActiveTab.getState().join('tab-1');

    expect(memory.get()).toBe('tab-1');
  });

  it('is read back at launch', async () => {
    memory.set('tab-1');
    const { useActiveTab, activeTabRestored } = await import('./tab');

    await activeTabRestored;

    expect(useActiveTab.getState().activeTabId).toBe('tab-1');
  });

  it('is forgotten everywhere once cleared', async () => {
    memory.set('tab-1');
    const { useActiveTab, activeTabRestored } = await import('./tab');
    await activeTabRestored;

    useActiveTab.getState().clear();

    expect(useActiveTab.getState().activeTabId).toBeNull();
    expect(memory.get()).toBeNull();
  });
});
