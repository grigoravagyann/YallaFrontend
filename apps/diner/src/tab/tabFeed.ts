import type { TabEvent, TabEventPage } from '@yalla/api';
import { createSequenceStream } from '@yalla/realtime';
import { applyTabEvents, type ChangeMarker } from './events';

/**
 * A tab's event stream, wired so it actually reads events.
 *
 * It did not. The sequence stream starts at zero and treats zero as "nothing to
 * read from yet", and nothing ever moved it: every three-second tick became a
 * blind refetch of the tab and the shares, the header said "Up to date" whether
 * or not anything had been read, and a marker for a staff change could never
 * appear. `GET /events` was never called.
 *
 * Now every successful tab read seeds **both** positions from the tab's own
 * `maxSequence` — the stream's, so it asks for events at all, and the fold's,
 * so the first page is not mistaken for a gap. A page is read to the end while
 * the server says there is more. "Connected" is true only once a page has come
 * back, and false again when a refetch fails.
 */

const MAX_PAGES_PER_POLL = 20;

export interface TabFeedDeps {
  readonly tabId: string;
  readonly getTabEvents: (input: { tabId: string; afterSequence: number }) => Promise<TabEventPage>;
  /** Refetch the bill and the shares. Resolves true when the refetch landed. */
  readonly refetch: () => Promise<boolean>;
  /** The name this device shows for a line, read before the refetch removes it. */
  readonly nameLine: (lineId: string) => string | null;
  readonly onMarkers: (markers: readonly ChangeMarker[]) => void;
  readonly onConnected: (connected: boolean) => void;
  readonly onUnavailable: () => void;
  readonly isUnavailable: (error: unknown) => boolean;
  /** Local clock, for when a marker arrived. */
  readonly now?: (() => number) | undefined;
  readonly foregroundMs?: number | undefined;
  readonly setInterval?: typeof globalThis.setInterval | undefined;
  readonly clearInterval?: typeof globalThis.clearInterval | undefined;
}

export interface TabFeed {
  start(): void;
  stop(): void;
  /**
   * Where the tab stands, from a successful tab read. Only ever moves forward:
   * a stale cached read must not replay events already shown.
   */
  seed(maxSequence: number): void;
}

export function createTabFeed(deps: TabFeedDeps): TabFeed {
  const now = deps.now ?? (() => Date.now());
  /** Where the fold has read up to. */
  let cursor = 0;

  const stream = createSequenceStream<TabEvent>({
    fetchPage: async (afterSequence) => {
      const items: TabEvent[] = [];
      let after = afterSequence;
      // Read to the end. A page is capped server-side, and returning its
      // `maxSequence` as if the page were complete skipped the rest.
      for (let page = 0; page < MAX_PAGES_PER_POLL; page += 1) {
        const result = await deps.getTabEvents({ tabId: deps.tabId, afterSequence: after });
        items.push(...result.events);
        const last = result.events[result.events.length - 1]?.sequence;
        if (last !== undefined) after = last;
        if (!result.hasMore || result.events.length === 0) break;
      }
      // A page came back: the stream is genuinely live.
      deps.onConnected(true);
      return { lastSequence: after, items };
    },
    handlers: {
      onItems: (events) => {
        const update = applyTabEvents(cursor, events, deps.nameLine, now());
        cursor = update.lastSequence;
        if (update.kind !== 'refetch') return;
        // The announcement waits for the data it describes.
        void deps.refetch().then((ok) => {
          if (!ok) {
            deps.onConnected(false);
            return;
          }
          if (update.markers.length > 0) deps.onMarkers(update.markers);
        });
      },
      onResync: (reason) => {
        if (reason === 'notWired') {
          deps.onUnavailable();
          return;
        }
        // Not seeded yet: the tab read is what says where the stream stands.
        void deps.refetch().then((ok) => {
          if (!ok) deps.onConnected(false);
        });
      },
      onError: () => deps.onConnected(false),
    },
    isUnavailable: deps.isUnavailable,
    foregroundMs: deps.foregroundMs ?? 3_000,
    ...(deps.setInterval ? { setInterval: deps.setInterval } : {}),
    ...(deps.clearInterval ? { clearInterval: deps.clearInterval } : {}),
  });

  return {
    start: () => stream.start(),
    stop: () => stream.stop(),
    seed(maxSequence) {
      if (maxSequence <= cursor) return;
      cursor = maxSequence;
      stream.setSequence(maxSequence);
    },
  };
}
