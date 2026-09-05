import { isEndpointNotWired, type FloorChange, type StaffGateway, type TabEvent } from '@yalla/api';

/**
 * Live updates, behind an interface.
 *
 * SignalR is a later task. The sequence columns on the server exist precisely
 * so this can be written once now and have its transport swapped later, so the
 * shape here is the one a hub can satisfy without any screen changing: start,
 * stop, tell me when something happened, tell me when you lost the thread.
 *
 * The rule that makes the swap real: **no polling logic outside this file.**
 * No component knows an interval exists, and none of them will need editing
 * when one stops.
 */

export interface LiveStreamHandlers {
  /** A contiguous page of changes. Fold them in. */
  readonly onChanges: (changes: readonly FloorChange[]) => void;
  /**
   * The stream cannot be continued incrementally — a gap, a first load, or a
   * transport that does not exist yet. Refetch everything.
   */
  readonly onResync: (reason: 'gap' | 'firstLoad' | 'notWired' | 'reconnect') => void;
  readonly onError: (error: unknown) => void;
}

export interface LiveStream {
  /** Idempotent. */
  start(): void;
  stop(): void;
  /** Poll now: the tab became visible, the network came back, a manual refresh. */
  refresh(): void;
  /** Background tabs back off; they do not stop. */
  setForeground(foreground: boolean): void;
  /** Where the caller has read up to. Set after a full refetch. */
  setSequence(sequence: number): void;
}

export interface PollingLiveStreamOptions {
  readonly gateway: StaffGateway;
  readonly branchId: string;
  readonly handlers: LiveStreamHandlers;
  /** Foreground interval. Short enough that a waiter does not out-run it. */
  readonly foregroundMs?: number;
  /** Hidden-tab interval. Long enough not to drain a tablet on a counter. */
  readonly backgroundMs?: number;
  /** Injected for tests. */
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
}

const FOREGROUND_MS = 4_000;
const BACKGROUND_MS = 30_000;

export function createPollingLiveStream(options: PollingLiveStreamOptions): LiveStream {
  const {
    gateway,
    branchId,
    handlers,
    foregroundMs = FOREGROUND_MS,
    backgroundMs = BACKGROUND_MS,
  } = options;

  const schedule = options.setInterval ?? globalThis.setInterval.bind(globalThis);
  const cancel = options.clearInterval ?? globalThis.clearInterval.bind(globalThis);

  let timer: ReturnType<typeof globalThis.setInterval> | null = null;
  let running = false;
  let foreground = true;
  let sequence = 0;
  let inFlight = false;
  /**
   * The stream is missing on the server. Recorded once so the tablet does not
   * ask again every four seconds and fill the log with the same 404; it falls
   * back to a full read, which is correct but expensive, and says so.
   */
  let unwired = false;

  async function poll(): Promise<void> {
    // One request at a time. Overlapping polls on a slow connection would
    // deliver pages out of order and manufacture gaps that are not there.
    if (inFlight) return;
    inFlight = true;
    try {
      if (unwired || sequence === 0) {
        handlers.onResync(unwired ? 'notWired' : 'firstLoad');
        return;
      }
      const page = await gateway.getFloorChanges({ branchId, afterSequence: sequence });
      if (page.changes.length > 0) handlers.onChanges(page.changes);
      sequence = Math.max(sequence, page.lastSequence);
    } catch (error) {
      if (isEndpointNotWired(error)) {
        unwired = true;
        handlers.onResync('notWired');
        return;
      }
      handlers.onError(error);
    } finally {
      inFlight = false;
    }
  }

  function restartTimer(): void {
    if (timer !== null) cancel(timer);
    timer = running ? schedule(() => void poll(), foreground ? foregroundMs : backgroundMs) : null;
  }

  return {
    start() {
      if (running) return;
      running = true;
      restartTimer();
      void poll();
    },

    stop() {
      running = false;
      if (timer !== null) cancel(timer);
      timer = null;
    },

    refresh() {
      void poll();
    },

    setForeground(next) {
      if (foreground === next) return;
      foreground = next;
      restartTimer();
      // Coming back to the foreground polls immediately rather than waiting out
      // an interval. A waiter who picks the tablet up is asking a question.
      if (next) void poll();
    },

    setSequence(next) {
      sequence = next;
    },
  };
}

/**
 * The same shape for one tab's events.
 *
 * Separate because the lifetimes differ: the floor stream lives as long as the
 * screen and a tab's lives as long as its panel is open.
 */
export interface TabStreamHandlers {
  readonly onEvents: (events: readonly TabEvent[]) => void;
  readonly onResync: () => void;
  readonly onError: (error: unknown) => void;
}

export function createPollingTabStream(options: {
  readonly gateway: StaffGateway;
  readonly tabId: string;
  readonly handlers: TabStreamHandlers;
  readonly intervalMs?: number;
  readonly setInterval?: typeof globalThis.setInterval;
  readonly clearInterval?: typeof globalThis.clearInterval;
}): LiveStream {
  const { gateway, tabId, handlers, intervalMs = FOREGROUND_MS } = options;
  const schedule = options.setInterval ?? globalThis.setInterval.bind(globalThis);
  const cancel = options.clearInterval ?? globalThis.clearInterval.bind(globalThis);

  let timer: ReturnType<typeof globalThis.setInterval> | null = null;
  let sequence = 0;
  let inFlight = false;
  let unwired = false;

  async function poll(): Promise<void> {
    if (inFlight || unwired) {
      if (unwired) handlers.onResync();
      return;
    }
    inFlight = true;
    try {
      const page = await gateway.getTabEvents({ tabId, afterSequence: sequence });
      if (page.events.length > 0) handlers.onEvents(page.events);
      sequence = Math.max(sequence, page.lastSequence);
    } catch (error) {
      if (isEndpointNotWired(error)) {
        unwired = true;
        handlers.onResync();
        return;
      }
      handlers.onError(error);
    } finally {
      inFlight = false;
    }
  }

  return {
    start() {
      if (timer !== null) return;
      timer = schedule(() => void poll(), intervalMs);
      void poll();
    },
    stop() {
      if (timer !== null) cancel(timer);
      timer = null;
    },
    refresh() {
      void poll();
    },
    setForeground() {
      /* One interval; a tab panel is only ever open in the foreground. */
    },
    setSequence(next) {
      sequence = next;
    },
  };
}
