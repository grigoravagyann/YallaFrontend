import { isEndpointNotWired, type FloorChange, type StaffGateway } from '@yalla/api';
import { createSequenceStream, type LiveStream, type ResyncReason } from '@yalla/realtime';

/**
 * The floor's live updates, bound to the staff gateway.
 *
 * The transport lives in `@yalla/realtime` — the diner's phone polls a tab's
 * events through the same function, and two implementations of it is how the
 * two surfaces end up disagreeing about a bill. What is left here is the one
 * app-specific part: which endpoint a page comes from, and which error means
 * the backend has not shipped the stream.
 *
 * The rule that makes the swap to a hub real still holds: **no polling logic
 * outside the package.** No component knows an interval exists.
 */

export type { LiveStream } from '@yalla/realtime';

export interface LiveStreamHandlers {
  /** A contiguous page of changes. Fold them in. */
  readonly onChanges: (changes: readonly FloorChange[]) => void;
  /**
   * The stream cannot be continued incrementally — a gap, a first load, or a
   * transport that does not exist yet. Refetch everything.
   */
  readonly onResync: (reason: ResyncReason) => void;
  readonly onError: (error: unknown) => void;
}

export interface PollingLiveStreamOptions {
  readonly gateway: StaffGateway;
  readonly branchId: string;
  readonly handlers: LiveStreamHandlers;
  readonly foregroundMs?: number | undefined;
  readonly backgroundMs?: number | undefined;
  /** Injected for tests. */
  readonly setInterval?: typeof globalThis.setInterval | undefined;
  readonly clearInterval?: typeof globalThis.clearInterval | undefined;
}

export function createPollingLiveStream(options: PollingLiveStreamOptions): LiveStream {
  const { gateway, branchId, handlers } = options;

  return createSequenceStream<FloorChange>({
    fetchPage: async (afterSequence) => {
      const page = await gateway.getFloorChanges({ branchId, afterSequence });
      return { lastSequence: page.lastSequence, items: page.changes };
    },
    handlers: {
      onItems: handlers.onChanges,
      onResync: handlers.onResync,
      onError: handlers.onError,
    },
    isUnavailable: isEndpointNotWired,
    foregroundMs: options.foregroundMs,
    backgroundMs: options.backgroundMs,
    setInterval: options.setInterval,
    clearInterval: options.clearInterval,
  });
}
