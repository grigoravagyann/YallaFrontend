import type { DinerTakeawaySummary } from '@yalla/api';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type * as I18nModule from '@yalla/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersScreen from '../../../app/(tabs)/orders';
import type { Order } from '../../orders/model';
import { useSession } from '../../stores/session';

/**
 * Takeaway orders on the Orders tab (2026-10-22): one on its way leads the
 * active list as its own card — venue, "Takeaway · T-482 · 4 items", the
 * status pill on its own row, when it will be ready and the total paid at the
 * venue — and a finished one is a quiet row in History. Both open the order's
 * status screen; a table's order still opens its own detail.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
}));
const held = vi.hoisted(() => ({ orders: [] as unknown[] }));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => ({}),
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('@yalla/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nModule>()),
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values && Object.keys(values).length > 0
        ? `${key} ${Object.entries(values)
            .map(([name, value]) => `${name}=${value}`)
            .join(' ')}`
        : key,
  }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('../../orders/hooks', () => ({
  useOrders: () => ({
    data: held.orders,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isRefetching: false,
    isPaused: false,
    fetchStatus: 'idle',
  }),
}));
vi.mock('../../places/hooks', () => ({ usePlace: () => ({ data: undefined }) }));

const MINUTE_MS = 60_000;

function order(id: string, extra: Partial<Order>): Order {
  return {
    id,
    placeId: 'branch-1',
    placeName: 'Lava · Abovyan',
    placePhoto: '',
    kind: 'takeaway',
    status: 'preparing',
    placedAt: new Date(Date.now() - 10 * MINUTE_MS).toISOString(),
    items: [],
    totalDram: 8900,
    timeline: [],
    ...extra,
  };
}

function summary(extra: Partial<DinerTakeawaySummary>): DinerTakeawaySummary {
  return {
    code: 'T-482',
    status: 'accepted',
    pickupAsap: true,
    requestedPickupUtc: new Date(Date.now() + 20 * MINUTE_MS).toISOString(),
    readyAtUtc: new Date(Date.now() + 25 * MINUTE_MS).toISOString(),
    itemCount: 4,
    ...extra,
  };
}

const TABLE: Order = order('table-1', {
  kind: 'dineIn',
  status: 'confirmed',
  placeName: 'Lumen Coffee',
  tableLabel: '4',
  placedAt: new Date(Date.now() - MINUTE_MS).toISOString(),
});
const ON_ITS_WAY = order('tw-1', { takeaway: summary({}) });
const PICKED_UP = order('tw-0', {
  status: 'completed',
  totalDram: 6200,
  placedAt: new Date(Date.now() - 26 * 60 * MINUTE_MS).toISOString(),
  takeaway: summary({ status: 'collected', itemCount: 3 }),
});

beforeEach(() => {
  useSession.setState({ signedIn: true });
  held.orders = [TABLE, ON_ITS_WAY, PICKED_UP];
});
afterEach(() => {
  cleanup();
  router.push.mockReset();
  useSession.setState({ signedIn: false });
});

describe('the Orders tab with takeaway', () => {
  it('leads with the takeaway on its way, its pill on a row of its own', () => {
    render(<OrdersScreen />);

    const cards = screen.getAllByRole('button', { name: /^(Lava|Lumen)/ });
    expect(cards[0]?.getAttribute('aria-label')).toMatch(/^Lava · Abovyan, /);
    expect(screen.getByText('takeaway.orders.kindLine code=T-482 count=4')).toBeTruthy();
    expect(screen.getByText('takeaway.orderStatus.accepted')).toBeTruthy();
    expect(screen.getByText(/^takeaway\.orders\.readyAt time=/)).toBeTruthy();
    expect(screen.getByText(/^takeaway\.orders\.atVenue total=/)).toBeTruthy();

    fireEvent.click(cards[0]!);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/takeaway/[orderId]',
      params: { orderId: 'tw-1' },
    });
  });

  it('says "ready around" the time asked for until the venue promises one', () => {
    held.orders = [order('tw-2', { takeaway: summary({ status: 'sent', readyAtUtc: null }) })];
    render(<OrdersScreen />);
    expect(screen.getByText('takeaway.orderStatus.sent')).toBeTruthy();
    expect(screen.getByText(/^takeaway\.orders\.readyAround time=/)).toBeTruthy();
  });

  it('keeps a table order on its own card and detail', () => {
    render(<OrdersScreen />);
    fireEvent.click(screen.getAllByRole('button', { name: 'orders.viewDetails' })[0]!);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/order/[orderId]',
      params: { orderId: 'table-1' },
    });
  });

  it('lists a finished takeaway in History as a quiet row that opens it', () => {
    render(<OrdersScreen />);
    fireEvent.click(screen.getByRole('tab', { name: 'orders.history' }));

    const row = screen.getByRole('button', { name: /takeaway\.orders\.pastLine/ });
    expect(screen.getByText(/^takeaway\.orders\.pastLine when=.* count=3$/)).toBeTruthy();
    fireEvent.click(row);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/takeaway/[orderId]',
      params: { orderId: 'tw-0' },
    });
  });
});
