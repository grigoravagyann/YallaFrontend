import { InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type {
  ActivityPage,
  ActivityQuery,
  MyResults,
  MyResultsQuery,
  StaffRecentQuery,
} from '../contracts/activity';
import type { ServiceRequest } from '../contracts/ordering';
import {
  activityOptions,
  claimServiceRequestOptions,
  myResultsOptions,
  staffMemberPerformanceOptions,
  staffRecentOptions,
  transferTabOptions,
  transferTargetsOptions,
} from './activity';
import { queryKeys } from './index';

/** The activity hooks' options on a real `QueryClient` (2026-10-24). */

const FILTERS = {
  date: '2026-10-24',
  who: { kind: 'everyone' as const },
  category: 'all' as const,
  q: '',
};

function page(cursor: string | null, nextCursor: string | null): ActivityPage {
  return {
    items: [
      {
        id: `a-${cursor ?? 'first'}`,
        occurredAtUtc: '2026-10-24T14:00:00Z',
        local: '2026-10-24 18:00',
        actor: { kind: 'system', staffMemberId: null, name: '' },
        device: { id: null, label: '', isConsole: false },
        category: 'booking',
        action: 'booking.auto-declined',
        subject: { type: 'reservation', id: 'r-1' },
        tableSessionId: null,
        tableLabel: null,
        guestName: null,
        itemNames: null,
        amountAmd: null,
        isMoney: false,
        before: null,
        after: null,
        reason: null,
        params: {},
        lines: [],
        seconds: null,
      },
    ],
    nextCursor,
  };
}

describe('the feed', () => {
  it('pages by the cursor the last page gave, and stops at the end', async () => {
    const asked: (string | null | undefined)[] = [];
    const gateway = {
      listActivity: vi.fn(async (_branchId: string, query: ActivityQuery) => {
        asked.push(query.cursor);
        return query.cursor ? page(query.cursor, null) : page(null, 'c-2');
      }),
    };
    const client = new QueryClient();
    const observer = new InfiniteQueryObserver(client, activityOptions(gateway, 'b-1', FILTERS));
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    expect(observer.getCurrentResult().hasNextPage).toBe(true);
    await observer.fetchNextPage();
    expect(asked).toEqual([null, 'c-2']);
    expect(observer.getCurrentResult().hasNextPage).toBe(false);
    unsubscribe();
  });

  it('keys the list by every filter, a person by their id', () => {
    expect(
      queryKeys.activity('b-1', { ...FILTERS, who: { kind: 'staff', staffMemberId: 's-1' } }),
    ).toEqual(['console', 'activity', 'b-1', '2026-10-24', 's-1', 'all', '']);
    expect(queryKeys.activity('b-1', { ...FILTERS, q: ' 4 ' })).toEqual(
      queryKeys.activity('b-1', { ...FILTERS, q: '4' }),
    );
  });

  it('waits for a person before reading their page', () => {
    const gateway = { getStaffMemberPerformance: vi.fn() };
    const client = new QueryClient();
    const observer = new QueryObserver(
      client,
      staffMemberPerformanceOptions(gateway, 'b-1', undefined, { from: 'a', to: 'b' }),
    );
    observer.subscribe(() => {})();
    expect(gateway.getStaffMemberPerformance).not.toHaveBeenCalled();
  });
});

describe('My results', () => {
  function results(query: MyResultsQuery): MyResults {
    const empty = (list: 'orders' | 'messages' | 'bookings' | 'cash' | 'calls') => ({
      list,
      items: [],
      nextCursor: null,
    });
    return {
      from: query.from,
      to: query.to,
      staffMemberId: 's-1',
      name: 'Aram',
      role: 'waiter',
      isActive: true,
      figures: {
        tables: 0,
        guests: 0,
        salesAmd: 0,
        averageCheckAmd: null,
        tipsAmd: 0,
        callMedianSeconds: null,
        callsClaimed: 0,
        replyMedianSeconds: null,
        messagesAnswered: 0,
        approvals: 0,
        declines: 0,
        bookingsTaken: 0,
        bookingsCame: 0,
        bookingsNoShow: 0,
        cashAmd: 0,
        cashPayments: 0,
        discounts: 0,
        comps: 0,
        adjustmentsAmd: 0,
        voids: 0,
      },
      daily: [],
      recent: {
        orders: empty('orders'),
        messages: empty('messages'),
        bookings: empty('bookings'),
        cash: empty('cash'),
        calls: empty('calls'),
      },
    };
  }

  it('reads a period once, keeps it on screen while the next loads, and waits while hidden', async () => {
    const gateway = { getMyResults: vi.fn(async (query: MyResultsQuery) => results(query)) };
    const client = new QueryClient();
    const today = { from: '2026-10-24', to: '2026-10-24', limit: 5 };
    const week = { from: '2026-10-18', to: '2026-10-24', limit: 5 };

    const hidden = new QueryObserver(client, myResultsOptions(gateway, today, false));
    hidden.subscribe(() => {})();
    expect(gateway.getMyResults).not.toHaveBeenCalled();

    const observer = new QueryObserver(client, myResultsOptions(gateway, today));
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    expect(gateway.getMyResults).toHaveBeenCalledTimes(1);

    observer.setOptions(myResultsOptions(gateway, week));
    expect(observer.getCurrentResult().data?.from).toBe('2026-10-24');
    expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
    await vi.waitFor(() => expect(observer.getCurrentResult().data?.from).toBe('2026-10-18'));
    expect(gateway.getMyResults).toHaveBeenCalledTimes(2);
    expect(queryKeys.myResults('', week.from, week.to, 5)).toEqual([
      'staff',
      'myResults',
      '',
      '2026-10-18',
      '2026-10-24',
      5,
    ]);
    unsubscribe();
  });
});

describe('a person’s lists', () => {
  it('opens a list on its first page and follows the server’s cursor', async () => {
    const asked: (string | null)[] = [];
    const gateway = {
      listStaffRecent: vi.fn(
        async (_branchId: string, _staffMemberId: string, query: StaffRecentQuery) => {
          asked.push(query.cursor);
          return { list: query.list, items: [], nextCursor: query.cursor ? null : 'c-2' };
        },
      ),
    };
    const client = new QueryClient();
    const observer = new InfiniteQueryObserver(
      client,
      staffRecentOptions(gateway, 'b-1', 's-1', { from: 'a', to: 'b' }, 'calls'),
    );
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    await observer.fetchNextPage();
    expect(asked).toEqual([null, 'c-2']);
    expect(observer.getCurrentResult().hasNextPage).toBe(false);
    unsubscribe();
  });
});

describe('the floor', () => {
  it('puts the claimer’s name on the call in the list at once, then reads the list again', async () => {
    const client = new QueryClient();
    const call = { id: 'sr-1', tableLabel: '4' } as ServiceRequest;
    client.setQueryData(queryKeys.serviceRequests('b-1'), [call]);
    const claimed = { ...call, claimedByName: 'Արամ' };
    const options = claimServiceRequestOptions(client, {
      claimServiceRequest: vi.fn(async () => claimed),
    });
    const command = { branchId: 'b-1', requestId: 'sr-1' };
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const result = await options.mutationFn(command);
    options.onSuccess(result, command);
    options.onSettled(result, null, command);
    expect(client.getQueryData(queryKeys.serviceRequests('b-1'))).toEqual([claimed]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.serviceRequests('b-1') });
    expect(options.retry).toBe(false);
  });

  it('reads the floor and the tab again after a transfer', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const options = transferTabOptions(client, { transferTab: vi.fn() }, 'b-1');
    options.onSettled({
      tabId: 'tab-4',
      server: { staffMemberId: 's-1', name: 'Արամ' },
      previousServer: null,
      transferredAtUtc: '2026-10-24T13:40:00Z',
      tableSessionId: 'ts-4',
      tableLabel: '4',
      wasReplay: false,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.staffFloor('b-1') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.staffTab('tab-4') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.transferTargets('tab-4') });
  });

  it('reads who can take a table only once there is a tab and somebody asked, and never retries', async () => {
    const listTransferTargets = vi.fn(async () => []);
    const off = transferTargetsOptions({ listTransferTargets }, 'tab-4', false);
    expect(off.enabled).toBe(false);
    expect(transferTargetsOptions({ listTransferTargets }, null).enabled).toBe(false);
    const on = transferTargetsOptions({ listTransferTargets }, 'tab-4');
    expect(on.enabled).toBe(true);
    expect(on.retry).toBe(false);
    expect(on.queryKey).toEqual(queryKeys.transferTargets('tab-4'));
    await on.queryFn();
    expect(listTransferTargets).toHaveBeenCalledWith('tab-4');
  });
});
