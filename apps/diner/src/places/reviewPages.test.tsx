import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useReviewPages } from './hooks';
import type { Review } from './model';
import { placeRepository } from './repository';

/** "See all 25 reviews": twenty, then five, then nothing more to ask for. */

vi.mock('./repository', () => ({
  placeRepository: { reviewPage: vi.fn() },
}));

const REVIEWS: Review[] = Array.from({ length: 25 }, (_, i) => ({
  id: `r${i + 1}`,
  author: 'Anahit S.',
  rating: 4,
  text: `Visit ${i + 1}`,
  date: '2026-09-01',
}));

describe('useReviewPages', () => {
  it('loads 20, then 5, then stops', async () => {
    vi.mocked(placeRepository.reviewPage).mockImplementation((_placeId, page) =>
      Promise.resolve({
        reviews: REVIEWS.slice((page - 1) * 20, page * 20),
        total: REVIEWS.length,
        page,
        pageSize: 20,
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useReviewPages('b1'), { wrapper });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.data?.pages[0]?.reviews).toHaveLength(20);
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages[1]?.reviews).toHaveLength(5);
    expect(result.current.hasNextPage).toBe(false);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(placeRepository.reviewPage).toHaveBeenCalledTimes(2);
    expect(vi.mocked(placeRepository.reviewPage).mock.calls).toEqual([
      ['b1', 1],
      ['b1', 2],
    ]);
  });
});
