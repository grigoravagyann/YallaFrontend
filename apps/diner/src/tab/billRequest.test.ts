import {
  EndpointNotWiredError,
  ForbiddenError,
  NotFoundError,
  ServerError,
  TabAccessEndedError,
  type TabEvent,
  type TabEventPage,
} from '@yalla/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acknowledges,
  billRequestEnded,
  endsAcknowledgementWatch,
  tabAccessGone,
  useBillRequests,
  watchAcknowledgement,
  type RequestedBill,
} from './billRequest';

/**
 * "The bill is on its way" lasts exactly as long as it is true: from the pay
 * sheet's answer until a waiter acknowledges that request, or the tab moves on
 * to being closed.
 */

const url = 'https://api.test/api/tabs/t1/events';

function request(overrides: Partial<RequestedBill> = {}): RequestedBill {
  return {
    tabId: 't1',
    requestId: 'sr-1',
    bill: { scope: 'whole', amountDram: 15400, tipPercent: 5, tipDram: 700 },
    requestedAtUtc: '2026-10-17T19:00:00Z',
    statusAtRequest: 'open',
    afterSequence: 12,
    ...overrides,
  };
}

function event(sequence: number, type: TabEvent['type'], data: TabEvent['data'] = null): TabEvent {
  return {
    sequence,
    tabId: 't1',
    type,
    actor: 'staff',
    actorId: null,
    actorName: null,
    atUtc: '2026-10-17T19:01:00Z',
    data,
  };
}

function page(events: readonly TabEvent[], hasMore = false): TabEventPage {
  return {
    tabId: 't1',
    lastSequence: events[events.length - 1]?.sequence ?? 0,
    events,
    hasMore,
  };
}

beforeEach(() => useBillRequests.setState({ byTab: {} }));

describe('the bill-requested store', () => {
  it('keeps the newest request per tab', () => {
    useBillRequests.getState().requested(request());
    useBillRequests.getState().requested(request({ requestId: 'sr-2' }));
    useBillRequests.getState().requested(request({ tabId: 't2', requestId: 'sr-9' }));

    expect(useBillRequests.getState().byTab['t1']?.requestId).toBe('sr-2');
    expect(useBillRequests.getState().byTab['t2']?.requestId).toBe('sr-9');
  });

  it('settles only the request it is told about, so a late answer cannot clear a newer one', () => {
    useBillRequests.getState().requested(request({ requestId: 'sr-2' }));

    useBillRequests.getState().settled('t1', 'sr-1');
    expect(useBillRequests.getState().byTab['t1']?.requestId).toBe('sr-2');

    useBillRequests.getState().settled('t1', 'sr-2');
    expect(useBillRequests.getState().byTab['t1']).toBeUndefined();
  });
});

describe('when the tab ends it', () => {
  it('ends on a closed or abandoned tab', () => {
    expect(billRequestEnded(request(), 'closed')).toBe(true);
    expect(billRequestEnded(request(), 'abandoned')).toBe(true);
    expect(billRequestEnded(request(), 'open')).toBe(false);
  });

  it('ends when staff start closing a tab that was open when it was asked', () => {
    expect(billRequestEnded(request(), 'closing')).toBe(true);
    // Asked on a tab already closing: that is not news, its own acknowledgement is.
    expect(billRequestEnded(request({ statusAtRequest: 'closing' }), 'closing')).toBe(false);
  });
});

describe('the acknowledgement', () => {
  it('is the acknowledgement event naming this request, not another', () => {
    const other = event(13, 'serviceRequestAcknowledged', { serviceRequestId: 'sr-water' });
    const mine = event(14, 'serviceRequestAcknowledged', { serviceRequestId: 'sr-1' });
    const raised = event(15, 'serviceRequested', { serviceRequestId: 'sr-1' });

    expect(acknowledges([other, raised], 'sr-1')).toBe(false);
    expect(acknowledges([other, mine], 'sr-1')).toBe(true);
  });

  describe('watching for it', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('reads from where the tab stood, keeps its place, and stops once acknowledged', async () => {
      const getTabEvents = vi
        .fn<(input: { tabId: string; afterSequence: number }) => Promise<TabEventPage>>()
        .mockResolvedValueOnce(page([event(13, 'orderPlaced')]))
        .mockResolvedValueOnce(page([]))
        .mockResolvedValueOnce(
          page([event(14, 'serviceRequestAcknowledged', { serviceRequestId: 'sr-1' })]),
        );
      const onAcknowledged = vi.fn();

      watchAcknowledgement({
        tabId: 't1',
        requestId: 'sr-1',
        afterSequence: 12,
        getTabEvents,
        onAcknowledged,
        intervalMs: 1000,
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(getTabEvents).toHaveBeenLastCalledWith({ tabId: 't1', afterSequence: 12 });
      expect(onAcknowledged).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      expect(getTabEvents).toHaveBeenLastCalledWith({ tabId: 't1', afterSequence: 13 });

      await vi.advanceTimersByTimeAsync(1000);
      expect(onAcknowledged).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(5000);
      expect(getTabEvents).toHaveBeenCalledTimes(3);
    });

    it('reads every page the server says there is', async () => {
      const getTabEvents = vi
        .fn<(input: { tabId: string; afterSequence: number }) => Promise<TabEventPage>>()
        .mockResolvedValueOnce(page([event(13, 'orderPlaced')], true))
        .mockResolvedValueOnce(
          page([event(14, 'serviceRequestAcknowledged', { serviceRequestId: 'sr-1' })]),
        );
      const onAcknowledged = vi.fn();

      watchAcknowledgement({
        tabId: 't1',
        requestId: 'sr-1',
        afterSequence: 12,
        getTabEvents,
        onAcknowledged,
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(getTabEvents).toHaveBeenNthCalledWith(2, { tabId: 't1', afterSequence: 13 });
      expect(onAcknowledged).toHaveBeenCalledTimes(1);
    });

    it('tries again after a failed read, gives up when there is no stream, and stops when told', async () => {
      const unwired = new Error('not wired');
      const getTabEvents = vi
        .fn<(input: { tabId: string; afterSequence: number }) => Promise<TabEventPage>>()
        .mockRejectedValueOnce(new Error('offline'))
        .mockRejectedValueOnce(unwired);

      watchAcknowledgement({
        tabId: 't1',
        requestId: 'sr-1',
        afterSequence: 12,
        getTabEvents,
        onAcknowledged: vi.fn(),
        isUnavailable: (error) => error === unwired,
        intervalMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(5000);
      expect(getTabEvents).toHaveBeenCalledTimes(2);

      const quiet = vi
        .fn<(input: { tabId: string; afterSequence: number }) => Promise<TabEventPage>>()
        .mockResolvedValue(page([]));
      const stop = watchAcknowledgement({
        tabId: 't1',
        requestId: 'sr-1',
        afterSequence: 12,
        getTabEvents: quiet,
        onAcknowledged: vi.fn(),
        intervalMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(0);
      stop();
      await vi.advanceTimersByTimeAsync(5000);
      expect(quiet).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['a 401', new TabAccessEndedError({ url, tabId: 't1', status: 401 })],
      ['a 403', new TabAccessEndedError({ url, tabId: 't1', status: 403 })],
      ['no token on this phone', new TabAccessEndedError({ url, tabId: 't1', notOnDevice: true })],
      ['a 404', new NotFoundError({ url })],
    ])('stops for good once the events answer %s, and says why', async (_label, refusal) => {
      const getTabEvents = vi
        .fn<(input: { tabId: string; afterSequence: number }) => Promise<TabEventPage>>()
        .mockRejectedValue(refusal);
      const onGaveUp = vi.fn();

      watchAcknowledgement({
        tabId: 't1',
        requestId: 'sr-1',
        afterSequence: 12,
        getTabEvents,
        onAcknowledged: vi.fn(),
        onGaveUp,
        intervalMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(10_000);

      expect(getTabEvents).toHaveBeenCalledTimes(1);
      expect(onGaveUp).toHaveBeenCalledWith(refusal);
    });

    it('keeps trying through a server error, without giving up', async () => {
      const getTabEvents = vi
        .fn<(input: { tabId: string; afterSequence: number }) => Promise<TabEventPage>>()
        .mockRejectedValueOnce(new ServerError({ url, status: 503 }))
        .mockResolvedValue(page([]));
      const onGaveUp = vi.fn();

      watchAcknowledgement({
        tabId: 't1',
        requestId: 'sr-1',
        afterSequence: 12,
        getTabEvents,
        onAcknowledged: vi.fn(),
        onGaveUp,
        intervalMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2000);

      expect(getTabEvents).toHaveBeenCalledTimes(3);
      expect(onGaveUp).not.toHaveBeenCalled();
    });
  });
});

describe('when a tab is no longer this phone’s to read', () => {
  it('is a 401, 403 or 404, or a tab this phone holds no token for', () => {
    expect(tabAccessGone(new TabAccessEndedError({ url, tabId: 't1', status: 403 }))).toBe(true);
    expect(tabAccessGone(new TabAccessEndedError({ url, tabId: 't1', notOnDevice: true }))).toBe(
      true,
    );
    expect(tabAccessGone(new ForbiddenError({ url }))).toBe(true);
    expect(tabAccessGone(new NotFoundError({ url }))).toBe(true);
    expect(tabAccessGone(new ServerError({ url, status: 500 }))).toBe(false);
    expect(tabAccessGone(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('ends the acknowledgement watch, as an unwired stream does', () => {
    expect(endsAcknowledgementWatch(new NotFoundError({ url }))).toBe(true);
    expect(
      endsAcknowledgementWatch(new EndpointNotWiredError({ url, endpoint: 'getTabEvents' })),
    ).toBe(true);
    expect(endsAcknowledgementWatch(new TypeError('Failed to fetch'))).toBe(false);
  });
});
