import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TakeawayMenuScreen from '../../app/takeaway/menu/[placeId]';
import { useSession } from '../stores/session';
import { useTakeawayCart } from './cart';
import { LULA, MENU, PORK, availability } from './testFixtures';

/**
 * The takeaway menu (2026-10-22): the place's dishes adding to the takeaway
 * cart — not a table's tray — with hall-only dishes greyed and never offered,
 * and the bar carrying the count and total on to the checkout.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: () => true,
}));
const gateway = vi.hoisted(() => ({
  getBranchMenuDetail: vi.fn(),
  getTakeawayAvailability: vi.fn(),
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
vi.mock('../places/hooks', () => ({ usePlace: () => ({ data: { name: 'Lava' } }) }));

function renderMenu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TakeawayMenuScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSession.setState({ signedIn: true });
  gateway.getBranchMenuDetail.mockResolvedValue(MENU);
  gateway.getTakeawayAvailability.mockResolvedValue(availability());
});
afterEach(() => {
  cleanup();
  Object.values(gateway).forEach((fn) => fn.mockReset());
  router.push.mockReset();
  useTakeawayCart.getState().clear();
  useSession.setState({ signedIn: false });
});

describe('the takeaway menu', () => {
  it('lists the dishes under the place, with "All" and each category', async () => {
    renderMenu();
    expect(await screen.findByText('Pork khorovats')).toBeTruthy();
    expect(screen.getByText('takeaway.menu.subtitle place=Lava')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'takeaway.menu.all' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Drinks' }));
    expect(screen.queryByText('Pork khorovats')).toBeNull();
    expect(screen.getByText('Tan')).toBeTruthy();
  });

  it('greys a hall-only dish out, says so, and offers no +', async () => {
    renderMenu();
    expect(await screen.findByText('takeaway.menu.hallOnly')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'menu.addItem name=Khashlama' })).toBeNull();
    expect(screen.getByRole('button', { name: 'menu.addItem name=Pork khorovats' })).toBeTruthy();
  });

  it('adds to the takeaway cart, and the bar goes on with the count and the total', async () => {
    renderMenu();
    const choose = await screen.findByRole('button', { name: 'takeaway.menu.choose' });
    expect(choose.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'menu.addItem name=Pork khorovats' }));
    fireEvent.click(screen.getByRole('button', { name: 'menu.addItem name=Lula kebab' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'tray.more' })[0]!);

    const cart = useTakeawayCart.getState().cart;
    expect(cart.branchId).toBe('branch-1');
    expect(cart.lines.map((line) => [line.item.id, line.quantity])).toEqual([
      [PORK.id, 2],
      [LULA.id, 1],
    ]);
    expect(screen.getByText(/^takeaway\.menu\.summary count=3 total=/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'takeaway.menu.continue' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/takeaway/checkout/[placeId]',
      params: { placeId: 'branch-1' },
    });
  });

  it('takes one away with the stepper', async () => {
    renderMenu();
    fireEvent.click(
      await screen.findByRole('button', { name: 'menu.addItem name=Pork khorovats' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'tray.fewer' }));
    expect(useTakeawayCart.getState().cart.lines).toHaveLength(0);
  });

  it('while closed, says from when, and adds nothing', async () => {
    gateway.getTakeawayAvailability.mockResolvedValue(
      availability({ open: false, slots: [], opensAt: '10:00' }),
    );
    renderMenu();
    expect(await screen.findByText(/^takeaway\.menu\.closedFrom time=/)).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'menu.addItem name=Pork khorovats' })).toBeNull(),
    );
  });

  it('says the menu failed, with a retry', async () => {
    gateway.getBranchMenuDetail.mockRejectedValue(new Error('boom'));
    renderMenu();
    expect(await screen.findByText('menu.error')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'common.retry' })).toBeTruthy();
  });
});
