import { TakeawayStatusConflictError } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';
import { Linking } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TakeawayStatusScreen from '../../app/takeaway/[orderId]';
import { useSession } from '../stores/session';
import { useTakeawayCart } from './cart';
import { MENU, takeawayOrder } from './testFixtures';

/**
 * The takeaway status screen (2026-10-22): every state an order goes
 * through — sent (cancel, asked first), accepted · being prepared, ready,
 * picked up, declined (sorry, and the same dishes for another time),
 * cancelled — with the code, the steps and their times, the lines and the
 * total, and the way to call or find the venue.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
}));
const gateway = vi.hoisted(() => ({
  getTakeawayOrder: vi.fn(),
  cancelTakeawayOrder: vi.fn(),
  getBranchMenuDetail: vi.fn(),
  getTakeawayAvailability: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => ({ orderId: 'order-1' }),
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
vi.mock('@yalla/api/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiReactModule>()),
  useGateway: () => gateway,
}));
vi.mock('../places/hooks', () => ({ usePlace: () => ({ data: undefined }) }));

function renderStatus() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TakeawayStatusScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSession.setState({ signedIn: true });
});
afterEach(() => {
  cleanup();
  Object.values(gateway).forEach((fn) => fn.mockReset());
  router.push.mockReset();
  router.replace.mockReset();
  useTakeawayCart.getState().clear();
  useSession.setState({ signedIn: false });
  vi.restoreAllMocks();
});

describe('a sent order', () => {
  it('shows the code, "ready around", the first step with its time, the lines and the total', async () => {
    gateway.getTakeawayOrder.mockResolvedValue(takeawayOrder());
    renderStatus();

    expect(await screen.findByText('takeaway.status.case.sent.title')).toBeTruthy();
    expect(screen.getByText('T-482')).toBeTruthy();
    expect(screen.getByText(/^takeaway\.status\.readyAround time=/)).toBeTruthy();
    expect(screen.getByLabelText(/^takeaway\.status\.step\.sent, \d{2}:\d{2}$/)).toBeTruthy();
    expect(screen.getByText('takeaway.status.step.accepted')).toBeTruthy();
    expect(screen.getByText('takeaway.checkout.line count=2 name=Tan')).toBeTruthy();
    expect(screen.getByText('takeaway.status.payAtPickup')).toBeTruthy();
    expect(screen.getByText('takeaway.status.cancelHint')).toBeTruthy();
  });

  it('cancels only after asking, and then says so', async () => {
    gateway.getTakeawayOrder.mockResolvedValue(takeawayOrder());
    gateway.cancelTakeawayOrder.mockImplementation(async () => {
      const cancelled = takeawayOrder({
        status: 'cancelled',
        canCancel: false,
        cancelledAtUtc: '2026-10-22T14:47:00Z',
      });
      gateway.getTakeawayOrder.mockResolvedValue(cancelled);
      return cancelled;
    });
    renderStatus();

    fireEvent.click(await screen.findByRole('button', { name: 'takeaway.status.cancel' }));
    expect(screen.getByText('takeaway.status.cancelTitle')).toBeTruthy();
    expect(gateway.cancelTakeawayOrder).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'takeaway.status.cancelKeep' }));
    expect(screen.queryByText('takeaway.status.cancelTitle')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'takeaway.status.cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'takeaway.status.cancelConfirm' }));
    await waitFor(() => expect(gateway.cancelTakeawayOrder).toHaveBeenCalledWith('order-1'));
    expect(await screen.findByText('takeaway.status.case.cancelled.title')).toBeTruthy();
    expect(screen.queryByText('T-482')).toBeNull();
  });

  it('a cancel after the venue answered says to call', async () => {
    gateway.getTakeawayOrder.mockResolvedValue(takeawayOrder());
    gateway.cancelTakeawayOrder.mockRejectedValue(
      new TakeawayStatusConflictError({ url: '/x', orderStatus: 'accepted' }),
    );
    renderStatus();

    fireEvent.click(await screen.findByRole('button', { name: 'takeaway.status.cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'takeaway.status.cancelConfirm' }));
    expect(await screen.findByText('takeaway.status.cancelTooLate')).toBeTruthy();
  });

  it('calls the venue and opens directions', async () => {
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    gateway.getTakeawayOrder.mockResolvedValue(takeawayOrder());
    renderStatus();

    fireEvent.click(await screen.findByRole('button', { name: 'takeaway.status.call' }));
    expect(open).toHaveBeenCalledWith('tel:+37410000000');
    fireEvent.click(screen.getByRole('button', { name: 'takeaway.status.directions' }));
    expect(open).toHaveBeenLastCalledWith(expect.stringContaining('40.18,44.51'));
  });
});

describe('as it moves on', () => {
  it('accepted: being prepared, ready at the promised time, no cancel', async () => {
    gateway.getTakeawayOrder.mockResolvedValue(
      takeawayOrder({
        status: 'accepted',
        canCancel: false,
        acceptedAtUtc: '2026-10-22T14:47:00Z',
        readyAt: '19:10',
        readyAtUtc: '2026-10-22T15:10:00Z',
      }),
    );
    renderStatus();

    expect(await screen.findByText('takeaway.status.case.accepted.title')).toBeTruthy();
    expect(screen.getByText(/^takeaway\.status\.readyAt time=19:10$/)).toBeTruthy();
    expect(screen.getByLabelText(/^takeaway\.status\.step\.accepted, \d{2}:\d{2}$/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'takeaway.status.cancel' })).toBeNull();
  });

  it('ready: waiting for the guest', async () => {
    gateway.getTakeawayOrder.mockResolvedValue(
      takeawayOrder({ status: 'ready', canCancel: false, readyAt: '19:10' }),
    );
    renderStatus();
    expect(await screen.findByText('takeaway.status.case.ready.title')).toBeTruthy();
    expect(screen.getByText(/^takeaway\.status\.waitingSince time=19:10$/)).toBeTruthy();
  });

  it('picked up: paid, no code, and a way to rate the place', async () => {
    gateway.getTakeawayOrder.mockResolvedValue(
      takeawayOrder({ status: 'collected', canCancel: false, paymentMethod: 'card' }),
    );
    renderStatus();

    expect(await screen.findByText('takeaway.status.case.collected.title')).toBeTruthy();
    expect(screen.getByText('takeaway.status.paid')).toBeTruthy();
    expect(screen.queryByText('T-482')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'takeaway.status.rate' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/place/[placeId]',
      params: { placeId: 'branch-1', section: 'reviews' },
    });
  });
});

describe('a declined order', () => {
  it('apologises when nobody answered, and offers the same dishes for another time', async () => {
    gateway.getTakeawayOrder.mockResolvedValue(
      takeawayOrder({ status: 'declined', canCancel: false, declinedBecause: 'noAnswer' }),
    );
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    renderStatus();

    expect(await screen.findByText('takeaway.status.case.declinedNoAnswer.title')).toBeTruthy();
    expect(screen.queryByText('takeaway.status.step.sent')).toBeNull();
    await waitFor(() => expect(gateway.getBranchMenuDetail).toHaveBeenCalledWith('branch-1'));
    // The menu is read before the dishes can be put back.
    await new Promise((resolve) => setTimeout(resolve, 20));
    fireEvent.click(screen.getByRole('button', { name: 'takeaway.status.chooseAnotherTime' }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/takeaway/checkout/[placeId]',
      params: { placeId: 'branch-1' },
    });
    expect(
      useTakeawayCart.getState().cart.lines.map((line) => [line.item.id, line.quantity]),
    ).toEqual([
      ['pork', 1],
      ['tan', 2],
    ]);
  });

  it("gives the venue's reason when it said one", async () => {
    gateway.getTakeawayOrder.mockResolvedValue(
      takeawayOrder({
        status: 'declined',
        canCancel: false,
        declinedBecause: 'venue',
        declineReason: 'Out of lamb',
      }),
    );
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    renderStatus();

    expect(await screen.findByText('takeaway.status.case.declined.title')).toBeTruthy();
    expect(screen.getByText('takeaway.status.reason reason=Out of lamb')).toBeTruthy();
  });
});

describe('no order to show', () => {
  it('an unknown order says so, with the way to the Orders tab', async () => {
    gateway.getTakeawayOrder.mockResolvedValue(null);
    renderStatus();
    expect(await screen.findByText('takeaway.status.notFound.title')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'takeaway.status.orders' }));
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/orders');
  });

  it('signed out, it asks for a log-in', () => {
    useSession.setState({ signedIn: false });
    renderStatus();
    expect(screen.getByText('orders.signedOut.title')).toBeTruthy();
    expect(gateway.getTakeawayOrder).not.toHaveBeenCalled();
  });
});
