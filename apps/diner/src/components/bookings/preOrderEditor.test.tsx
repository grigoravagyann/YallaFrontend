import {
  NetworkError,
  PreOrderItemsUnavailableError,
  type BranchMenu,
  type Booking,
  type PreOrder,
} from '@yalla/api';
import { formatDram } from '@yalla/format';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PreOrderScreen from '../../../app/booking/[bookingId]/pre-order';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';

/**
 * The pre-order editor (2026-10-21): the branch's pre-order menu, quantities,
 * notes, the total at locked prices, and every refusal said.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const gateway = vi.hoisted(() => ({
  getBooking: vi.fn(),
  getBranchMenuDetail: vi.fn(),
  replacePreOrder: vi.fn(),
  clearPreOrder: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
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
vi.mock('../../places/hooks', () => ({ usePlace: () => ({ data: undefined }) }));
vi.mock('../../lib/haptics', () => ({
  haptics: { select: vi.fn(), success: vi.fn(), tap: vi.fn() },
}));

const HOUR_MS = 3_600_000;
const START = Date.now() + 26 * HOUR_MS;
const UNTIL = new Date(START - 2 * HOUR_MS).toISOString();

const BOOKING: Booking = {
  id: 'booking-1',
  code: 'ABC123',
  status: 'confirmed',
  venueName: 'Lumen Coffee',
  branchId: 'branch-1',
  branchName: 'Northern Avenue',
  timeZoneId: 'Asia/Yerevan',
  tableId: 't1',
  tableLabel: '1',
  roomId: null,
  roomName: null,
  partySize: 2,
  slotUtc: new Date(START).toISOString(),
  endUtc: new Date(START + 2 * HOUR_MS).toISOString(),
  freeCancellationUntilUtc: UNTIL,
  cancelledAtUtc: null,
  cancelledAfterDeadline: false,
  note: null,
  awaitingApprovalBecause: null,
  approvalExpiresAtUtc: null,
  declinedBecause: null,
  manageToken: null,
  promisedFreeByUtc: null,
  incomingTableRequest: null,
  preOrderEditableUntilUtc: UNTIL,
};

function dish(id: string, name: string, priceDram: number, extra: object = {}) {
  return {
    id,
    categoryId: 'c-1',
    name,
    description: '',
    priceDram,
    photo: { id: null, thumbnailUrl: '', cardUrl: '', fullUrl: '' },
    ingredients: '',
    allergens: '',
    portionSize: '',
    prepMinutes: 10,
    spiceLevel: 'notSpicy',
    isAvailable: true,
    availableForPreOrder: true,
    ...extra,
  };
}

const MENU = {
  branchId: 'branch-1',
  fetchedAtUtc: new Date().toISOString(),
  categories: [
    {
      id: 'c-1',
      name: 'Food',
      items: [
        dish('khachapuri', 'Khachapuri', 3600),
        dish('salad', 'Salad', 2400),
        dish('gata', 'Gata', 900, { availableForPreOrder: false }),
      ],
    },
  ],
} as unknown as BranchMenu;

const SAVED: PreOrder = {
  id: 'po-1',
  reservationId: 'booking-1',
  state: 'editable',
  lines: [
    {
      id: 'l-1',
      menuItemId: 'khachapuri',
      name: 'Khachapuri',
      unitPriceDram: 3200,
      quantity: 2,
      lineTotalDram: 6400,
      note: null,
      availableNow: true,
    },
  ],
  note: null,
  totalDram: 6400,
  editableUntilUtc: UNTIL,
  dueAtUtc: new Date(START - 30 * 60_000).toISOString(),
  sentAtUtc: null,
  kitchenStatus: null,
  onTab: false,
  notComingAtUtc: null,
  updatedAtUtc: new Date().toISOString(),
};

function withQueries(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  Object.values(gateway).forEach((fn) => fn.mockReset());
  router.back.mockReset();
});

function savedResult(preOrder: PreOrder | null) {
  return { reservationId: 'booking-1', preOrder, wasReplay: false };
}

describe('the pre-order editor', () => {
  it('offers only the dishes that may be pre-ordered', async () => {
    gateway.getBooking.mockResolvedValue(BOOKING);
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    render(withQueries(<PreOrderScreen />));

    expect(await screen.findByRole('button', { name: 'preOrder.addDish name=Salad' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'preOrder.addDish name=Gata' })).toBeNull();
    expect(screen.getByText('preOrder.empty')).toBeTruthy();
  });

  it('builds one, totals it and saves the whole list with notes', async () => {
    gateway.getBooking.mockResolvedValue(BOOKING);
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    gateway.replacePreOrder.mockResolvedValue(savedResult(SAVED));
    render(withQueries(<PreOrderScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.addDish name=Salad' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'preOrder.more name=Salad' })[0]!);
    fireEvent.change(screen.getByLabelText('preOrder.lineNoteLabel name=Salad'), {
      target: { value: ' no onion ' },
    });
    fireEvent.change(screen.getByLabelText('preOrder.noteLabel'), {
      target: { value: 'Salad first' },
    });
    expect(document.body.textContent).toContain(`preOrder.total${formatDram(4800, 'en')}`);

    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    await waitFor(() => expect(gateway.replacePreOrder).toHaveBeenCalledTimes(1));
    expect(gateway.replacePreOrder.mock.calls[0]?.[0]).toEqual({
      reservationId: 'booking-1',
      lines: [{ menuItemId: 'salad', quantity: 2, note: 'no onion' }],
      note: 'Salad first',
      clientCommandId: expect.any(String),
    });
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it('keeps the locked price of a dish already ordered', async () => {
    gateway.getBooking.mockResolvedValue({ ...BOOKING, preOrder: SAVED });
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    render(withQueries(<PreOrderScreen />));

    // 2 × 3 200 locked, not 3 600 now.
    await screen.findAllByText('Khachapuri');
    expect(document.body.textContent).toContain(`preOrder.total${formatDram(6400, 'en')}`);
  });

  it('flags a dish sold out since and will not save until it is removed', async () => {
    gateway.getBooking.mockResolvedValue({
      ...BOOKING,
      preOrder: { ...SAVED, lines: [{ ...SAVED.lines[0]!, availableNow: false }] },
    });
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    render(withQueries(<PreOrderScreen />));

    expect(await screen.findByText('preOrder.unavailableSwap name=Khachapuri')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.addDish name=Salad' }));
    const save = screen.getByRole('button', { name: 'preOrder.save' });
    expect(save.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(
      screen.getByRole('button', { name: 'preOrder.removeLineNamed name=Khachapuri' }),
    );
    expect(
      screen.getByRole('button', { name: 'preOrder.save' }).getAttribute('aria-disabled'),
    ).not.toBe('true');
  });

  it('says a refusal for a dish, and marks it', async () => {
    gateway.getBooking.mockResolvedValue(BOOKING);
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    gateway.replacePreOrder.mockRejectedValue(
      new PreOrderItemsUnavailableError({
        url: '/x',
        items: [{ menuItemId: 'salad', reason: 'soldOut' }],
      } as never),
    );
    render(withQueries(<PreOrderScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.addDish name=Salad' }));
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    expect(await screen.findByText('preOrder.error.itemUnavailable name=Salad')).toBeTruthy();
    expect(screen.getByText('preOrder.unavailableNow')).toBeTruthy();
  });

  it('retries a save that may not have arrived with the same command id', async () => {
    gateway.getBooking.mockResolvedValue(BOOKING);
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    gateway.replacePreOrder
      .mockRejectedValueOnce(new NetworkError({ url: '/x' } as never))
      .mockResolvedValueOnce(savedResult(SAVED));
    render(withQueries(<PreOrderScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.addDish name=Salad' }));
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    expect(await screen.findByText('preOrder.error.unknownOutcome')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    await waitFor(() => expect(gateway.replacePreOrder).toHaveBeenCalledTimes(2));
    const [first, second] = gateway.replacePreOrder.mock.calls.map((call) => call[0]);
    expect(second.clientCommandId).toBe(first.clientCommandId);
  });

  it('emptied, it offers to remove the pre-order instead', async () => {
    gateway.getBooking.mockResolvedValue({ ...BOOKING, preOrder: SAVED });
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    gateway.clearPreOrder.mockResolvedValue(savedResult(null));
    render(withQueries(<PreOrderScreen />));

    fireEvent.click(
      await screen.findByRole('button', { name: 'preOrder.removeLineNamed name=Khachapuri' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.remove' }));
    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.removeConfirm' }));
    await waitFor(() => expect(gateway.clearPreOrder).toHaveBeenCalledTimes(1));
  });

  it('says so when the pre-order can no longer be changed', async () => {
    gateway.getBooking.mockResolvedValue({
      ...BOOKING,
      preOrder: { ...SAVED, state: 'locked' },
    });
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    render(withQueries(<PreOrderScreen />));

    expect(await screen.findByText('preOrder.closedTitle')).toBeTruthy();
    expect(screen.getByText('preOrder.state.lockedBody')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'preOrder.save' })).toBeNull();
  });

  it('says the menu failed, with a way to try again', async () => {
    gateway.getBooking.mockResolvedValue(BOOKING);
    gateway.getBranchMenuDetail.mockRejectedValue(new Error('boom'));
    render(withQueries(<PreOrderScreen />));
    expect(await screen.findByText('preOrder.menuError')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'preOrder.retry' })).toBeTruthy();
  });
});
