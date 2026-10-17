import {
  ApiError,
  isEndpointNotWired,
  isTabAccessEnded,
  type BillRequest,
  type DinerTabView,
  type TabEvent,
  type TabEventPage,
} from '@yalla/api';
import { create } from 'zustand';

/**
 * "The bill is on its way" — remembered per tab, from the pay sheet's answer
 * until the floor has dealt with it.
 *
 * There is no diner-side list of open requests to read back, so the call's own
 * answer is kept here: the server's amounts, which request it was, and where
 * the tab's event sequence stood. It ends when a waiter acknowledges that
 * request (`serviceRequestAcknowledged` naming it) or the tab moves on to being
 * closed — whichever the phone hears of first. In memory only: a reload forgets
 * it, and the Pay button simply offers the sheet again.
 */

export type TabStatus = DinerTabView['status'];

export interface RequestedBill {
  readonly tabId: string;
  /** The service request's id — what the acknowledgement event names. */
  readonly requestId: string;
  /** The server's amounts for the scope asked about. */
  readonly bill: BillRequest | null;
  readonly requestedAtUtc: string;
  /** The tab's status when it was asked: a tab already closing does not end it. */
  readonly statusAtRequest: TabStatus;
  /** The tab's event sequence when it was asked: the acknowledgement comes after. */
  readonly afterSequence: number;
}

interface BillRequestState {
  readonly byTab: Readonly<Record<string, RequestedBill>>;
  /** A bill request went through; the newest one for a tab replaces the last. */
  readonly requested: (entry: RequestedBill) => void;
  /** It is over. Only the request named, so a late answer cannot clear a newer one. */
  readonly settled: (tabId: string, requestId: string) => void;
}

export const useBillRequests = create<BillRequestState>((set) => ({
  byTab: {},
  requested: (entry) => set((state) => ({ byTab: { ...state.byTab, [entry.tabId]: entry } })),
  settled: (tabId, requestId) =>
    set((state) => {
      if (state.byTab[tabId]?.requestId !== requestId) return state;
      const rest = { ...state.byTab };
      delete rest[tabId];
      return { byTab: rest };
    }),
}));

/** The open bill request on this tab, or `null`. */
export function useRequestedBill(tabId: string | undefined): RequestedBill | null {
  return useBillRequests((state) => (tabId ? (state.byTab[tabId] ?? null) : null));
}

/**
 * Whether the tab itself has moved past the request.
 *
 * Closed or abandoned always ends it. Closing — staff bringing the bill —
 * ends it only when the tab was still open at the time of asking; a request
 * made on a tab already closing waits for its own acknowledgement.
 */
export function billRequestEnded(request: RequestedBill, status: TabStatus): boolean {
  if (status === 'closed' || status === 'abandoned') return true;
  return status === 'closing' && request.statusAtRequest !== 'closing';
}

/** Whether a page of tab events says a waiter acknowledged this request. */
export function acknowledges(events: readonly TabEvent[], requestId: string): boolean {
  return events.some(
    (event) =>
      event.type === 'serviceRequestAcknowledged' && event.data?.['serviceRequestId'] === requestId,
  );
}

/**
 * Whether a refused tab read means this phone's hold on the tab is over: a
 * 401, 403 or 404 — taken off, left, the tab gone, or no token for it here.
 * Nothing a later read will answer differently, so a watch stops for good.
 */
export function tabAccessGone(error: unknown): boolean {
  if (isTabAccessEnded(error)) return true;
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  );
}

/**
 * Whether the acknowledgement watch should stop for good on this error: the
 * tab is no longer this phone's to read, or the backend has no event stream.
 * Anything else — offline, a 5xx — is tried again on the next tick.
 */
export function endsAcknowledgementWatch(error: unknown): boolean {
  return tabAccessGone(error) || isEndpointNotWired(error);
}

export interface AcknowledgementWatchDeps {
  readonly tabId: string;
  readonly requestId: string;
  readonly afterSequence: number;
  readonly getTabEvents: (input: { tabId: string; afterSequence: number }) => Promise<TabEventPage>;
  readonly onAcknowledged: () => void;
  /**
   * Stops for good on this error. {@link endsAcknowledgementWatch} unless
   * said otherwise: the tab's access ended, or there is no stream to read.
   */
  readonly isUnavailable?: ((error: unknown) => boolean) | undefined;
  /** Told once, with the error, when the watch stops for good on one. */
  readonly onGaveUp?: ((error: unknown) => void) | undefined;
  readonly intervalMs?: number | undefined;
  readonly setInterval?: typeof globalThis.setInterval | undefined;
  readonly clearInterval?: typeof globalThis.clearInterval | undefined;
}

/** Calm: a waiter walking over takes longer than this. */
export const ACK_POLL_MS = 8_000;
const MAX_PAGES_PER_POLL = 20;

/**
 * Read the tab's events from where it stood at the request until one says a
 * waiter acknowledged it. One read in flight at a time; a failed read is tried
 * again on the next tick. Returns the way to stop.
 */
export function watchAcknowledgement(deps: AcknowledgementWatchDeps): () => void {
  const every = deps.setInterval ?? globalThis.setInterval;
  const cancel = deps.clearInterval ?? globalThis.clearInterval;
  let cursor = deps.afterSequence;
  let busy = false;
  let stopped = false;

  const stop = () => {
    stopped = true;
    cancel(timer);
  };

  const poll = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      for (let page = 0; page < MAX_PAGES_PER_POLL && !stopped; page += 1) {
        const result = await deps.getTabEvents({ tabId: deps.tabId, afterSequence: cursor });
        if (stopped) return;
        if (acknowledges(result.events, deps.requestId)) {
          stop();
          deps.onAcknowledged();
          return;
        }
        const last = result.events[result.events.length - 1]?.sequence;
        if (last !== undefined) cursor = Math.max(cursor, last);
        if (!result.hasMore || result.events.length === 0) break;
      }
    } catch (error) {
      if ((deps.isUnavailable ?? endsAcknowledgementWatch)(error)) {
        stop();
        deps.onGaveUp?.(error);
      }
    } finally {
      busy = false;
    }
  };

  const timer = every(() => void poll(), deps.intervalMs ?? ACK_POLL_MS);
  void poll();
  return stop;
}
