import type { TabEvent, TabEventPage } from '@yalla/api';
import { describe, expect, it, vi } from 'vitest';
import { createTabFeed, type TabFeedDeps } from './tabFeed';

/**
 * The live bill's event stream, driven with a hand-cranked clock.
 */

function event(sequence: number, overrides: Partial<TabEvent> = {}): TabEvent {
  return {
    sequence,
    tabId: 't1',
    type: 'orderPlaced',
    actor: 'staff',
    actorId: 's1',
    actorName: null,
    atUtc: '2026-09-06T10:00:00Z',
    data: null,
    ...overrides,
  };
}

function page(events: TabEvent[], hasMore = false): TabEventPage {
  return {
    tabId: 't1',
    lastSequence: events[events.length - 1]?.sequence ?? 0,
    events,
    hasMore,
  };
}

/** A feed whose timer we fire by hand. */
function feedWith(pages: Array<TabEventPage | Error>, overrides: Partial<TabFeedDeps> = {}) {
  const asked: number[] = [];
  let tick: (() => void) | null = null;
  const connected: boolean[] = [];
  const refetch = vi.fn(() => Promise.resolve(true));

  const feed = createTabFeed({
    tabId: 't1',
    getTabEvents: ({ afterSequence }) => {
      asked.push(afterSequence);
      const next = pages.shift() ?? page([]);
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    refetch,
    nameLine: () => null,
    onMarkers: vi.fn(),
    onConnected: (value) => connected.push(value),
    onUnavailable: vi.fn(),
    isUnavailable: () => false,
    setInterval: ((fn: () => void) => {
      tick = fn;
      return 1;
    }) as unknown as typeof globalThis.setInterval,
    clearInterval: (() => undefined) as unknown as typeof globalThis.clearInterval,
    ...overrides,
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { feed, asked, connected, refetch, fire: () => tick?.(), settle };
}

describe('the live bill stream', () => {
  it('reads events from where the tab read says the stream stands', async () => {
    const { feed, asked, connected, settle } = feedWith([page([])]);

    feed.seed(12);
    feed.start();
    await settle();

    // It asks /events at all — which it never used to.
    expect(asked).toEqual([12]);
    expect(connected).toEqual([true]);
  });

  it('keeps reading while the server says there is more', async () => {
    const { feed, asked, refetch, settle } = feedWith([
      page([event(6), event(7)], true),
      page([event(8)], false),
    ]);

    feed.seed(5);
    feed.start();
    await settle();

    expect(asked).toEqual([5, 7]);
    // Contiguous with the seed, so it is a change and not a gap: one refetch.
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('is not "up to date" when nothing came back', async () => {
    const { feed, connected, settle } = feedWith([new Error('offline')]);

    feed.seed(3);
    feed.start();
    await settle();

    expect(connected).toEqual([false]);
  });

  it('stops saying "up to date" when the refetch after a page fails', async () => {
    const refetch = vi.fn(() => Promise.resolve(false));
    const { feed, connected, settle } = feedWith([page([event(6)])], { refetch });

    feed.seed(5);
    feed.start();
    await settle();
    await settle();

    // A page came back, then the bill it announced could not be read.
    expect(connected).toEqual([true, false]);
  });

  it('never moves the position backwards on a stale read', async () => {
    const { feed, asked, fire, settle } = feedWith([page([]), page([])]);

    feed.seed(12);
    feed.start();
    await settle();
    feed.seed(4);
    fire();
    await settle();

    expect(asked).toEqual([12, 12]);
  });
});
