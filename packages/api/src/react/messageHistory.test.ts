import { InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import type { MessageHistoryPage, MessageHistoryQuery } from '../contracts/messageHistory';
import type { StaffConversation } from '../contracts/messages';
import { queryKeys } from './index';
import { historyConversationOptions, messageHistoryOptions } from './messages';

/**
 * The console's message history on a real `QueryClient` (2026-10-24): the
 * list pages by the server's cursor, and the thread beside it is read once —
 * never polled, never followed by a read mark — under the console's own key.
 */

const FILTERS = {
  from: '2026-10-18',
  to: '2026-10-24',
  kind: 'all' as const,
  q: '',
  unansweredOnly: false,
};

function page(cursor: string | null, nextCursor: string | null): MessageHistoryPage {
  return {
    items: [
      {
        conversationId: `c-${cursor ?? 'first'}`,
        subject: {
          kind: 'reservation',
          id: `r-${cursor ?? 'first'}`,
          label: '6',
          guestName: 'Ani',
          localDate: '2026-10-24',
          localTime: '19:30',
          partySize: 4,
          itemCount: null,
          totalAmd: null,
          outcome: 'came',
        },
        messageCount: 2,
        firstAtUtc: '2026-10-24T08:00:00Z',
        lastAtUtc: '2026-10-24T09:00:00Z',
        lastLocal: '2026-10-24 13:00',
        staffNames: [],
        unanswered: false,
        open: false,
      },
    ],
    nextCursor,
    from: FILTERS.from,
    to: FILTERS.to,
  };
}

describe('the history list', () => {
  it('asks for the next page with the cursor the last one gave, and stops at the end', async () => {
    const asked: (string | null | undefined)[] = [];
    const gateway = {
      listMessageHistory: vi.fn(async (_branchId: string, query: MessageHistoryQuery) => {
        asked.push(query.cursor);
        return query.cursor ? page(query.cursor, null) : page(null, 'cur-2');
      }),
    } satisfies Pick<ConsoleGateway, 'listMessageHistory'>;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const observer = new InfiniteQueryObserver(
      client,
      messageHistoryOptions(gateway, 'b-1', FILTERS),
    );
    const unsubscribe = observer.subscribe(() => {});
    await vi.waitFor(() => expect(observer.getCurrentResult().isSuccess).toBe(true));
    expect(observer.getCurrentResult().hasNextPage).toBe(true);
    await observer.fetchNextPage();
    const result = observer.getCurrentResult();
    expect(asked).toEqual([null, 'cur-2']);
    expect(result.hasNextPage).toBe(false);
    expect(
      result.data?.pages.flatMap((one) => one.items.map((item) => item.conversationId)),
    ).toEqual(['c-first', 'c-cur-2']);
    expect(gateway.listMessageHistory).toHaveBeenCalledWith('b-1', { ...FILTERS, cursor: null });
    unsubscribe();
  });

  it('keys each set of filters apart, under the console', () => {
    const key = messageHistoryOptions({ listMessageHistory: vi.fn() }, 'b-1', FILTERS).queryKey;
    expect(key[0]).toBe('console');
    expect(key).toEqual(queryKeys.messageHistory('b-1', { ...FILTERS, q: '  ' }));
    expect(key).not.toEqual(queryKeys.messageHistory('b-1', { ...FILTERS, kind: 'takeaway' }));
  });

  it('asks nothing without a branch', () => {
    expect(messageHistoryOptions({ listMessageHistory: vi.fn() }, undefined, FILTERS).enabled).toBe(
      false,
    );
  });
});

describe('the thread beside it', () => {
  const THREAD = { conversationId: 'c-1', messages: [] } as unknown as StaffConversation;

  it('is read once, never polled, under the console’s own key', async () => {
    vi.useFakeTimers();
    try {
      const gateway = { getStaffConversation: vi.fn(async () => THREAD) };
      const subject = { kind: 'reservation' as const, id: 'r-1' };
      const options = historyConversationOptions(gateway, subject);
      expect(options.queryKey).toEqual(queryKeys.historyConversation('reservation', 'r-1'));
      expect(options.queryKey).not.toEqual(queryKeys.staffConversation('reservation', 'r-1'));
      expect(options.refetchInterval).toBe(false);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const observer = new QueryObserver(client, options);
      const unsubscribe = observer.subscribe(() => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(observer.getCurrentResult().data).toBe(THREAD);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(gateway.getStaffConversation).toHaveBeenCalledTimes(1);
      unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });
});
