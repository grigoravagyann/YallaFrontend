import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { queryKeys } from './queryKeys';
import { afterOrderVoid } from './staffFloor';

/**
 * What voiding a whole order reads again (2026-10-26): as a line's void, the
 * tab's lines and its totals; and the kitchen queue, which the order has left.
 * Tested on a real `QueryClient` against the exported keys, so a key that
 * misses a cache entry fails here rather than on a tablet.
 */

const BRANCH = 'b-1';
const TAB = 'tab-1';

const invalidated = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryState(key)?.isInvalidated === true;

describe('after a whole order is voided', () => {
  it("reads the tab's lines, its totals and the kitchen queue again, and nothing else", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(queryKeys.tabLines(TAB), []);
    queryClient.setQueryData(queryKeys.staffTab(TAB), null);
    queryClient.setQueryData(queryKeys.orderQueue(BRANCH), []);
    queryClient.setQueryData(queryKeys.staffTab('tab-2'), null);

    afterOrderVoid(queryClient, { branchId: BRANCH, tabId: TAB });

    expect(invalidated(queryClient, queryKeys.tabLines(TAB))).toBe(true);
    expect(invalidated(queryClient, queryKeys.staffTab(TAB))).toBe(true);
    expect(invalidated(queryClient, queryKeys.orderQueue(BRANCH))).toBe(true);
    expect(invalidated(queryClient, queryKeys.staffTab('tab-2'))).toBe(false);
  });
});
