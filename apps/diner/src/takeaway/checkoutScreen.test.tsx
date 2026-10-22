import {
  BookingBlockedNoShowsError,
  NEW_GUEST_RECORD,
  PhoneNotVerifiedError,
  TakeawayItemsUnavailableError,
  TakeawaySlotUnavailableError,
  TimeoutError,
  type DinerProfileView,
} from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TakeawayCheckoutScreen from '../../app/takeaway/checkout/[placeId]';
import { useSession } from '../stores/session';
import { useTakeawayCart } from './cart';
import { KHASHLAMA, PORK, TAN, availability, takeawayOrder } from './testFixtures';

/**
 * The takeaway checkout (2026-10-22): ASAP or a quarter hour, the order with
 * Change, a note, "pay at pickup" and the venue's way to call — then Send,
 * which needs a proved number and says every refusal in plain words.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
}));
const gateway = vi.hoisted(() => ({
  getTakeawayAvailability: vi.fn(),
  placeTakeawayOrder: vi.fn(),
  listBookings: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => ({ placeId: 'branch-1' }),
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
vi.mock('../places/hooks', () => ({
  usePlace: () => ({ data: { name: 'Lava', address: 'Abovyan 12' } }),
}));
vi.mock('../lib/haptics', () => ({
  haptics: { select: vi.fn(), success: vi.fn(), tap: vi.fn() },
}));

const PROFILE = {
  phoneE164: '+37491123408',
  phoneVerified: true,
} as DinerProfileView;

function fillCart() {
  const cart = useTakeawayCart.getState();
  cart.add('branch-1', PORK);
  cart.add('branch-1', TAN);
  cart.add('branch-1', TAN);
}

function renderCheckout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TakeawayCheckoutScreen />
    </QueryClientProvider>,
  );
}

async function sendButton() {
  return screen.findByRole('button', { name: /^takeaway\.checkout\.send total=/ });
}

/** Send, once the pickup times have been read and it can be pressed. */
async function readySend() {
  await waitFor(async () =>
    expect((await sendButton()).getAttribute('aria-disabled')).not.toBe('true'),
  );
  return sendButton();
}

beforeEach(() => {
  useSession.setState({ signedIn: true, profile: PROFILE, phoneE164: PROFILE.phoneE164 });
  gateway.getTakeawayAvailability.mockResolvedValue(availability());
  gateway.listBookings.mockResolvedValue({
    upcoming: [],
    past: [],
    guestRecord: NEW_GUEST_RECORD,
  });
});
afterEach(() => {
  cleanup();
  Object.values(gateway).forEach((fn) => fn.mockReset());
  router.push.mockReset();
  router.replace.mockReset();
  useTakeawayCart.getState().clear();
  useSession.setState({ signedIn: false, profile: null, phoneE164: null });
});

describe('the checkout', () => {
  it('with nothing in the cart, sends the guest to the menu', () => {
    renderCheckout();
    expect(screen.getByText('takeaway.checkout.empty.title')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'takeaway.checkout.empty.action' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/takeaway/menu/[placeId]',
      params: { placeId: 'branch-1' },
    });
  });

  it('shows the order, the pay-at-pickup box and the masked number', async () => {
    fillCart();
    renderCheckout();
    expect(
      await screen.findByText(/^takeaway\.checkout\.asapLine time=.* minutes=20$/),
    ).toBeTruthy();
    expect(screen.getByText('takeaway.checkout.line count=1 name=Pork khorovats')).toBeTruthy();
    expect(screen.getByText('takeaway.checkout.line count=2 name=Tan')).toBeTruthy();
    expect(screen.getByText('takeaway.checkout.payAtPickup')).toBeTruthy();
    const phone = screen.getByText(/^takeaway\.checkout\.phoneLine phone=/).textContent ?? '';
    expect(phone).not.toContain('123408');
    fireEvent.click(screen.getByRole('button', { name: 'takeaway.checkout.change' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('sends ASAP with the trimmed note, then opens the order and empties the cart', async () => {
    fillCart();
    gateway.placeTakeawayOrder.mockResolvedValue(takeawayOrder({ id: 'tw-9' }));
    renderCheckout();

    fireEvent.change(screen.getByLabelText('takeaway.checkout.noteLabel'), {
      target: { value: '  no onion ' },
    });
    fireEvent.click(await readySend());
    await waitFor(() => expect(gateway.placeTakeawayOrder).toHaveBeenCalledTimes(1));
    expect(gateway.placeTakeawayOrder.mock.calls[0]?.[0]).toMatchObject({
      branchId: 'branch-1',
      pickup: { asap: true },
      note: 'no onion',
      lines: [
        { menuItemId: 'pork', quantity: 1 },
        { menuItemId: 'tan', quantity: 2 },
      ],
      clientCommandId: expect.any(String),
    });
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/takeaway/[orderId]',
        params: { orderId: 'tw-9' },
      }),
    );
    expect(useTakeawayCart.getState().cart.lines).toHaveLength(0);
  });

  it('picks a quarter hour and sends it', async () => {
    fillCart();
    gateway.placeTakeawayOrder.mockResolvedValue(takeawayOrder());
    renderCheckout();

    fireEvent.click(await screen.findByRole('tab', { name: 'takeaway.checkout.pickTime' }));
    const send = await sendButton();
    // No time picked yet: nothing to send.
    expect(send.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /19:30/ }));
    fireEvent.click(await readySend());
    await waitFor(() =>
      expect(gateway.placeTakeawayOrder.mock.calls[0]?.[0].pickup).toEqual({ at: '19:30' }),
    );
  });

  it('a busy kitchen takes no ASAP', async () => {
    fillCart();
    gateway.getTakeawayAvailability.mockResolvedValue(availability({ busy: true }));
    renderCheckout();
    expect(await screen.findByText('takeaway.checkout.busy')).toBeTruthy();
    expect((await sendButton()).getAttribute('aria-disabled')).toBe('true');
  });

  it('closed: says from when, and sends nothing', async () => {
    fillCart();
    gateway.getTakeawayAvailability.mockResolvedValue(
      availability({ open: false, slots: [], asapReadyAt: null, opensAt: '10:00' }),
    );
    renderCheckout();
    expect(await screen.findByText(/^takeaway\.checkout\.closedFrom time=/)).toBeTruthy();
    expect((await sendButton()).getAttribute('aria-disabled')).toBe('true');
  });

  it('signed out, the button is the way in', () => {
    useSession.setState({ signedIn: false, profile: null });
    fillCart();
    renderCheckout();
    fireEvent.click(screen.getByRole('button', { name: 'takeaway.checkout.signIn' }));
    expect(router.push).toHaveBeenCalledWith('/auth');
    expect(gateway.getTakeawayAvailability).not.toHaveBeenCalled();
  });

  it('an unproved number goes through the verify flow first', async () => {
    useSession.setState({ profile: { ...PROFILE, phoneVerified: false } });
    fillCart();
    renderCheckout();
    expect(screen.getByText('takeaway.checkout.verifyNotice')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'takeaway.checkout.verify' }));
    expect(router.push).toHaveBeenCalledWith('/auth/code');
    expect(gateway.placeTakeawayOrder).not.toHaveBeenCalled();
  });

  it('the server\'s "prove your number" turns Send into Verify', async () => {
    useSession.setState({ profile: { ...PROFILE, phoneVerified: undefined } as never });
    fillCart();
    gateway.placeTakeawayOrder.mockRejectedValue(new PhoneNotVerifiedError({ url: '/x' }));
    renderCheckout();
    fireEvent.click(await readySend());
    expect(await screen.findByRole('button', { name: 'takeaway.checkout.verify' })).toBeTruthy();
  });

  it('takes out the dishes the server names, and says which', async () => {
    const cart = useTakeawayCart.getState();
    cart.add('branch-1', PORK);
    // A dish switched to hall-only after it was picked.
    useTakeawayCart.setState(({ cart: current }) => ({
      cart: {
        ...current,
        lines: [
          ...current.lines,
          { item: { ...KHASHLAMA, availableForTakeaway: true }, quantity: 1 },
        ],
      },
    }));
    gateway.placeTakeawayOrder.mockRejectedValue(
      new TakeawayItemsUnavailableError({
        url: '/x',
        items: [{ menuItemId: 'khashlama', reason: 'notForTakeaway' }],
      }),
    );
    renderCheckout();
    fireEvent.click(await readySend());
    expect(await screen.findByText('takeaway.error.items names=Khashlama')).toBeTruthy();
    expect(useTakeawayCart.getState().cart.lines.map((line) => line.item.id)).toEqual(['pork']);
  });

  it('paused for no-shows: the booking note, and Send waits', async () => {
    const until = new Date(Date.now() + 3 * 24 * 3_600_000).toISOString();
    gateway.listBookings.mockResolvedValue({
      upcoming: [],
      past: [],
      guestRecord: { ...NEW_GUEST_RECORD, takeawayNoShows: 3, blockedUntilUtc: until },
    });
    fillCart();
    renderCheckout();
    expect(await screen.findByText(/^confirm\.error\.blockedNoShows date=.* time=/u)).toBeTruthy();
    await waitFor(async () =>
      expect((await sendButton()).getAttribute('aria-disabled')).toBe('true'),
    );
    expect(gateway.placeTakeawayOrder).not.toHaveBeenCalled();
  });

  it("the server's pause is said in the booking's own sentence", async () => {
    gateway.placeTakeawayOrder.mockRejectedValue(
      new BookingBlockedNoShowsError({ url: 'x', blockedUntilUtc: null }),
    );
    fillCart();
    renderCheckout();
    fireEvent.click(await readySend());
    expect(await screen.findByText('confirm.error.blockedNoShowsPlain')).toBeTruthy();
    expect(gateway.listBookings.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('a gone slot asks for another time', async () => {
    fillCart();
    useTakeawayCart.getState().setPickup({ mode: 'at', at: '19:30' });
    gateway.placeTakeawayOrder.mockRejectedValue(
      new TakeawaySlotUnavailableError({ url: '/x', at: '19:30', slots: ['19:45'] }),
    );
    renderCheckout();
    fireEvent.click(await readySend());
    expect(await screen.findByText('takeaway.error.slot')).toBeTruthy();
    expect(useTakeawayCart.getState().cart.pickup).toEqual({ mode: 'at', at: '' });
  });

  it('a send that timed out is retried under the same command id', async () => {
    fillCart();
    gateway.placeTakeawayOrder
      .mockRejectedValueOnce(new TimeoutError({ url: '/x', timeoutMs: 10 }))
      .mockResolvedValueOnce(takeawayOrder());
    renderCheckout();
    fireEvent.click(await readySend());
    expect(await screen.findByText('takeaway.error.offline')).toBeTruthy();
    fireEvent.click(await readySend());
    await waitFor(() => expect(gateway.placeTakeawayOrder).toHaveBeenCalledTimes(2));
    const [first, second] = gateway.placeTakeawayOrder.mock.calls.map((call) => call[0]);
    expect(second.clientCommandId).toBe(first.clientCommandId);
  });
});
