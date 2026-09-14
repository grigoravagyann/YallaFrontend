import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../stores/session';
import { ORDER_REFRESH_MS, refreshWhileActive, useOrder, useOrders } from './hooks';
import type { Order, OrderStatus } from './model';
import { orderRepository } from './repository';

/**
 * A live order keeps itself current while the app is open: the kitchen marks
 * it ready and the screen says so within fifteen seconds, with nobody pulling.
 */

vi.mock('./repository', () => ({
  orderRepository: { list: vi.fn(), getById: vi.fn(), cancel: vi.fn() },
  OrderNotCancellableError: class extends Error {},
}));

const NOW = new Date('2026-09-14T10:00:00Z');

function orderWith(status: OrderStatus, placedAt = '2026-09-14T09:50:00Z'): Order {
  return {
    id: 'o1',
    placeId: 'b1',
    placeName: 'Lumen Coffee',
    placePhoto: '',
    kind: 'dineIn',
    status,
    tableLabel: '5',
    partySize: 2,
    placedAt,
    items: [],
    totalDram: 2400,
    timeline: [{ status: 'confirmed', at: placedAt }],
  } as Order;
}

function OrderStatusLine() {
  const { data } = useOrder('o1');
  return <Text>{data ? `status:${data.status}` : 'loading'}</Text>;
}

function OrdersCount() {
  const { data } = useOrders();
  return <Text>{data ? `orders:${data.map((order) => order.status).join(',')}` : 'loading'}</Text>;
}

function renderWithClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

/**
 * Move the clock, then let what that started settle: the fetch's promise, the
 * query's batched notify tick and React's render, a millisecond at a time.
 */
const advance = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
  }
};

beforeEach(() => {
  vi.useFakeTimers({
    now: NOW,
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  useSession.setState({ signedIn: true });
  // The app drives focus from AppState (`lib/queryManagers`): active is focused.
  focusManager.setFocused(true);
});

afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
  vi.mocked(orderRepository.getById).mockReset();
  vi.mocked(orderRepository.list).mockReset();
  useSession.setState({ signedIn: false });
});

describe('order refresh', () => {
  it('moves from preparing to ready after fifteen seconds, with no pull', async () => {
    vi.mocked(orderRepository.getById)
      .mockResolvedValueOnce(orderWith('preparing'))
      .mockResolvedValue(orderWith('ready'));

    renderWithClient(<OrderStatusLine />);
    await advance(0);
    expect(screen.getByText('status:preparing')).toBeTruthy();

    await advance(ORDER_REFRESH_MS - 1_000);
    expect(screen.getByText('status:preparing')).toBeTruthy();
    expect(orderRepository.getById).toHaveBeenCalledTimes(1);

    await advance(1_000);
    expect(orderRepository.getById).toHaveBeenCalledTimes(2);
    expect(screen.getByText('status:ready')).toBeTruthy();
  });

  it('stops asking once nothing on the list is still moving', async () => {
    vi.mocked(orderRepository.list).mockResolvedValue([orderWith('completed')]);

    renderWithClient(<OrdersCount />);
    await advance(0);
    expect(screen.getByText('orders:completed')).toBeTruthy();

    await advance(ORDER_REFRESH_MS * 4);
    expect(orderRepository.list).toHaveBeenCalledTimes(1);
  });

  it('pauses while the app is in the background, and resumes when it comes back', async () => {
    vi.mocked(orderRepository.getById).mockResolvedValue(orderWith('preparing'));

    renderWithClient(<OrderStatusLine />);
    await advance(0);
    expect(orderRepository.getById).toHaveBeenCalledTimes(1);

    // AppState went to `background`: the focus manager says unfocused.
    act(() => focusManager.setFocused(false));
    await advance(ORDER_REFRESH_MS * 3);
    expect(orderRepository.getById).toHaveBeenCalledTimes(1);

    act(() => focusManager.setFocused(true));
    await advance(ORDER_REFRESH_MS);
    expect(vi.mocked(orderRepository.getById).mock.calls.length).toBeGreaterThan(1);
  });

  it('asks about nothing while signed out', async () => {
    useSession.setState({ signedIn: false });

    renderWithClient(<OrderStatusLine />);
    await advance(ORDER_REFRESH_MS * 2);

    expect(orderRepository.getById).not.toHaveBeenCalled();
  });
});

describe('refreshWhileActive', () => {
  it('polls only for an order the kitchen still owes, placed within the active window', () => {
    expect(refreshWhileActive([orderWith('confirmed')], NOW)).toBe(ORDER_REFRESH_MS);
    expect(refreshWhileActive(orderWith('ready'), NOW)).toBe(ORDER_REFRESH_MS);
    expect(refreshWhileActive([orderWith('cancelled'), orderWith('completed')], NOW)).toBe(false);
    // Still "preparing", but from two days ago: nothing to wait for.
    expect(refreshWhileActive([orderWith('preparing', '2026-09-12T09:00:00Z')], NOW)).toBe(false);
    expect(refreshWhileActive(null, NOW)).toBe(false);
  });
});
