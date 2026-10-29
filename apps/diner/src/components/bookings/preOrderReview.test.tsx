import {
  ConcurrencyConflictError,
  NetworkError,
  OnMyWayNotOpenError,
  PreOrderItemsUnavailableError,
  type BranchMenu,
  type Booking,
  type PreOrder,
} from '@yalla/api';
import { formatTime } from '@yalla/format';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BookingDetailScreen from '../../../app/booking/[bookingId]';
import PreOrderScreen from '../../../app/booking/[bookingId]/pre-order';
import { bookingKeys } from '../../data/bookingKeys';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';
import type * as ReactNativeModule from 'react-native';

/**
 * Pre-orders in the app, after review (PO-FE-GUEST-REVIEW): a removal never
 * reuses a failed save's id (S1), a sold-out refusal reads the menu again
 * (S2) and its sentence goes with the dish, the removal says its own failure
 * (S3), the editor stays clear of the keyboard (S5), the push's "Yes" waits
 * for a fresh read (S7), and the nits (N3, N4, N6, N9).
 *
 * Copy is checked by key and its values, as the other screen tests do.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const params = vi.hoisted(() => ({ value: { bookingId: 'booking-1' } as Record<string, string> }));
const gateway = vi.hoisted(() => ({
  getBooking: vi.fn(),
  getBranchMenuDetail: vi.fn(),
  replacePreOrder: vi.fn(),
  clearPreOrder: vi.fn(),
  confirmOnMyWay: vi.fn(),
  cancelBooking: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => params.value,
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: unknown }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
// The keyboard's room, made visible: what sits inside it moves with the keyboard.
vi.mock('react-native', async (importOriginal) => {
  const native = await importOriginal<typeof ReactNativeModule>();
  return {
    ...native,
    KeyboardAvoidingView: (props: ReactNativeModule.ViewProps) => (
      <native.View {...props} testID="keyboard-room" />
    ),
  };
});
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
vi.mock('../AtMyTableAction', () => ({ AtMyTableAction: () => null }));
vi.mock('../../push/ReservationActions', () => ({ KeepTableAction: () => null }));
vi.mock('../../push/ReminderOptIn', () => ({ ReminderOptIn: () => null }));
vi.mock('../../lib/haptics', () => ({
  haptics: { select: vi.fn(), success: vi.fn(), tap: vi.fn() },
}));

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const START = Date.now() + 26 * HOUR_MS;
const UNTIL = new Date(START - 2 * HOUR_MS).toISOString();

function bookingAt(startMs: number, extra: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    code: 'ABC123',
    status: 'confirmed',
    venueName: 'Lumen Coffee',
    branchId: 'branch-1',
    branchName: 'Northern Avenue',
    timeZoneId: 'Asia/Yerevan',
    tableId: 't1',
    tableLabel: '1',
    bookedWithoutTable: false,
    roomId: null,
    roomName: null,
    partySize: 2,
    slotUtc: new Date(startMs).toISOString(),
    endUtc: new Date(startMs + 2 * HOUR_MS).toISOString(),
    freeCancellationUntilUtc: new Date(startMs - 2 * HOUR_MS).toISOString(),
    cancelledAtUtc: null,
    cancelledAfterDeadline: false,
    note: null,
    awaitingApprovalBecause: null,
    approvalExpiresAtUtc: null,
    declinedBecause: null,
    manageToken: null,
    promisedFreeByUtc: null,
    incomingTableRequest: null,
    ...extra,
  };
}

const BOOKING = bookingAt(START, { preOrderEditableUntilUtc: UNTIL });

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

function menuOf(...items: ReturnType<typeof dish>[]): BranchMenu {
  return {
    branchId: 'branch-1',
    fetchedAtUtc: new Date().toISOString(),
    categories: [{ id: 'c-1', name: 'Food', items }],
  } as unknown as BranchMenu;
}

const MENU = menuOf(dish('khachapuri', 'Khachapuri', 3600), dish('salad', 'Salad', 2400));

function line(menuItemId: string, name: string, quantity: number, note: string | null = null) {
  return {
    id: `l-${menuItemId}-${quantity}`,
    menuItemId,
    name,
    unitPriceDram: 3200,
    quantity,
    lineTotalDram: 3200 * quantity,
    note,
    availableNow: true,
  };
}

function preOrderWith(lines: PreOrder['lines'], extra: Partial<PreOrder> = {}): PreOrder {
  return {
    id: 'po-1',
    reservationId: 'booking-1',
    state: 'editable',
    lines,
    note: null,
    totalDram: lines.reduce((sum, entry) => sum + entry.lineTotalDram, 0),
    editableUntilUtc: UNTIL,
    dueAtUtc: new Date(START - 30 * MINUTE_MS).toISOString(),
    sentAtUtc: null,
    kitchenStatus: null,
    onTab: false,
    notComingAtUtc: null,
    updatedAtUtc: new Date().toISOString(),
    ...extra,
  };
}

const SAVED = preOrderWith([line('khachapuri', 'Khachapuri', 2)]);

function savedResult(preOrder: PreOrder | null) {
  return { reservationId: 'booking-1', preOrder, wasReplay: false };
}

function soldOut(menuItemId: string) {
  return new PreOrderItemsUnavailableError({
    url: '/x',
    items: [{ menuItemId, reason: 'soldOut' }],
  } as never);
}

function withQueries(node: ReactNode, client = newClient()) {
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

/** Lets every pending read and render land, so "exactly once" means once. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

afterEach(() => {
  cleanup();
  params.value = { bookingId: 'booking-1' };
  Object.values(gateway).forEach((fn) => fn.mockReset());
  router.back.mockReset();
  router.push.mockReset();
});

describe('the editor', () => {
  it('S1: a removal after a save whose answer was lost gets its own command id', async () => {
    gateway.getBooking.mockResolvedValue({ ...BOOKING, preOrder: SAVED });
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    gateway.replacePreOrder.mockRejectedValue(new NetworkError({ url: '/x' }));
    gateway.clearPreOrder.mockResolvedValue(savedResult(null));
    render(withQueries(<PreOrderScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.addDish name=Salad' }));
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    expect(await screen.findByText('preOrder.error.unknownOutcome')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'preOrder.removeLineNamed name=Salad' }));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'preOrder.removeLineNamed name=Khachapuri' })[0]!,
    );
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.remove' }));
    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.removeConfirm' }));

    await waitFor(() => expect(gateway.clearPreOrder).toHaveBeenCalledTimes(1));
    const saveId = gateway.replacePreOrder.mock.calls[0]?.[0].clientCommandId;
    expect(gateway.clearPreOrder.mock.calls[0]?.[0].clientCommandId).not.toBe(saveId);
  });

  it('S2: a sold-out refusal reads the menu again', async () => {
    gateway.getBooking.mockResolvedValue(BOOKING);
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    gateway.replacePreOrder.mockRejectedValue(soldOut('salad'));
    render(withQueries(<PreOrderScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.addDish name=Salad' }));
    const reads = gateway.getBranchMenuDetail.mock.calls.length;
    // The salad sold out after the menu was read.
    gateway.getBranchMenuDetail.mockResolvedValue(menuOf(dish('khachapuri', 'Khachapuri', 3600)));
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    expect(await screen.findByText('preOrder.error.itemUnavailable name=Salad')).toBeTruthy();

    await waitFor(() =>
      expect(gateway.getBranchMenuDetail.mock.calls.length).toBeGreaterThan(reads),
    );
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.removeLineNamed name=Salad' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'preOrder.addDish name=Salad' })).toBeNull(),
    );
  });

  it('S3: the refusal goes once the dish does', async () => {
    gateway.getBooking.mockResolvedValue({ ...BOOKING, preOrder: SAVED });
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    gateway.replacePreOrder.mockRejectedValue(soldOut('salad'));
    render(withQueries(<PreOrderScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.addDish name=Salad' }));
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    await screen.findByText('preOrder.error.itemUnavailable name=Salad');
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.removeLineNamed name=Salad' }));
    expect(
      screen.queryByText(/^preOrder\.error\.itemsUnavailable|^preOrder\.error\.itemUnavailable/u),
    ).toBeNull();
  });

  it("S3: the removal's question says the removal's own failure", async () => {
    gateway.getBooking.mockResolvedValue({ ...BOOKING, preOrder: SAVED });
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    gateway.replacePreOrder.mockRejectedValue(soldOut('salad'));
    gateway.clearPreOrder.mockRejectedValue(new NetworkError({ url: '/x' }));
    render(withQueries(<PreOrderScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.addDish name=Salad' }));
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    await screen.findByText('preOrder.error.itemUnavailable name=Salad');
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.removeLineNamed name=Salad' }));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'preOrder.removeLineNamed name=Khachapuri' })[0]!,
    );
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.remove' }));
    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.removeConfirm' }));

    expect(await screen.findByText('preOrder.error.unknownOutcome')).toBeTruthy();
    expect(screen.queryByText('preOrder.error.itemUnavailable name=Salad')).toBeNull();
  });

  it('S5: the notes and the save sit in the room the keyboard leaves', async () => {
    gateway.getBooking.mockResolvedValue({ ...BOOKING, preOrder: SAVED });
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    render(withQueries(<PreOrderScreen />));

    const room = await screen.findByTestId('keyboard-room');
    expect(within(room).getByLabelText('preOrder.noteLabel')).toBeTruthy();
    expect(within(room).getByLabelText('preOrder.lineNoteLabel name=Khachapuri')).toBeTruthy();
    expect(within(room).getByRole('button', { name: 'preOrder.save' })).toBeTruthy();
  });

  it('N3: "can\'t be changed" still offers to remove it while it may be', async () => {
    // The branch stopped taking pre-orders: read-only, still removable.
    gateway.getBooking.mockResolvedValue({ ...bookingAt(START), preOrder: SAVED });
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    gateway.clearPreOrder.mockResolvedValue(savedResult(null));
    render(withQueries(<PreOrderScreen />));

    expect(await screen.findByText('preOrder.state.notAcceptedBody')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.remove' }));
    expect(gateway.clearPreOrder).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.removeConfirm' }));
    await waitFor(() => expect(gateway.clearPreOrder).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  it("N4: a dish listed twice: each line's + changes that line", async () => {
    const twice = preOrderWith([
      line('khachapuri', 'Khachapuri', 1, 'no egg'),
      line('khachapuri', 'Khachapuri', 2, 'extra egg'),
    ]);
    gateway.getBooking.mockResolvedValue({ ...BOOKING, preOrder: twice });
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    gateway.replacePreOrder.mockResolvedValue(savedResult(twice));
    render(withQueries(<PreOrderScreen />));

    const more = await screen.findAllByRole('button', { name: 'preOrder.more name=Khachapuri' });
    // The two lines' steppers come first; the picker's is last.
    fireEvent.click(more[1]!);
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    await waitFor(() => expect(gateway.replacePreOrder).toHaveBeenCalledTimes(1));
    expect(gateway.replacePreOrder.mock.calls[0]?.[0].lines).toEqual([
      { menuItemId: 'khachapuri', quantity: 1, note: 'no egg' },
      { menuItemId: 'khachapuri', quantity: 3, note: 'extra egg' },
    ]);
  });

  it('N9: an edit after a failed save is a new command; the same draft again is not', async () => {
    gateway.getBooking.mockResolvedValue(BOOKING);
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    gateway.replacePreOrder.mockRejectedValue(new NetworkError({ url: '/x' }));
    render(withQueries(<PreOrderScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.addDish name=Salad' }));
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    await screen.findByText('preOrder.error.unknownOutcome');
    fireEvent.click(screen.getAllByRole('button', { name: 'preOrder.more name=Salad' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    await waitFor(() => expect(gateway.replacePreOrder).toHaveBeenCalledTimes(2));
    await screen.findByText('preOrder.error.unknownOutcome');
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    await waitFor(() => expect(gateway.replacePreOrder).toHaveBeenCalledTimes(3));

    const ids = gateway.replacePreOrder.mock.calls.map((call) => call[0].clientCommandId);
    expect(ids[1]).not.toBe(ids[0]);
    expect(ids[2]).toBe(ids[1]);
  });

  it('N9: two saves at once: the editor takes the pre-order as it now reads', async () => {
    const theirs = preOrderWith([line('khachapuri', 'Khachapuri', 1, 'from the other phone')]);
    gateway.getBooking.mockResolvedValue({ ...BOOKING, preOrder: SAVED });
    gateway.getBranchMenuDetail.mockResolvedValue(MENU);
    gateway.replacePreOrder.mockImplementation(async () => {
      // Saved from another phone meanwhile; this save loses.
      gateway.getBooking.mockResolvedValue({ ...BOOKING, preOrder: theirs });
      throw new ConcurrencyConflictError({ url: '/x' });
    });
    render(withQueries(<PreOrderScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'preOrder.addDish name=Salad' }));
    fireEvent.click(screen.getByRole('button', { name: 'preOrder.save' }));
    expect(await screen.findByText('preOrder.error.conflict')).toBeTruthy();
    expect(await screen.findByDisplayValue('from the other phone')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'preOrder.removeLineNamed name=Salad' }),
    ).toBeNull();
  });
});

describe('the booking screen', () => {
  it('N2: a ticket the venue took off is said plainly, never in the green of good news', async () => {
    gateway.getBooking.mockResolvedValue({
      ...BOOKING,
      preOrder: preOrderWith([line('khachapuri', 'Khachapuri', 1)], {
        state: 'sent',
        kitchenStatus: 'voided',
      }),
    });
    render(withQueries(<BookingDetailScreen />));

    expect(await screen.findByText('preOrder.kitchen.voided')).toBeTruthy();
    expect(screen.getByTestId('pre-order-state-neutral')).toBeTruthy();
    expect(screen.queryByTestId('pre-order-state-ok')).toBeNull();
  });
});

describe('are you on your way?', () => {
  const SOON = Date.now() + 30 * MINUTE_MS;
  const ASKED = bookingAt(SOON, {
    preOrder: preOrderWith([line('khachapuri', 'Khachapuri', 1)], { state: 'locked' }),
  });

  it('S7: the push\'s "yes" is not sent from a stale copy of a booking that has moved', async () => {
    params.value = { bookingId: 'booking-1', onMyWay: 'yes' };
    const client = newClient();
    // The app still holds the 19:00 booking the push was about…
    client.setQueryData(bookingKeys.booking('booking-1'), ASKED);
    // …which was moved on the web to an hour later: not asked yet.
    const moved = { ...ASKED, slotUtc: new Date(SOON + HOUR_MS).toISOString() };
    gateway.getBooking.mockResolvedValue(moved);
    gateway.confirmOnMyWay.mockResolvedValue({
      reservationId: 'booking-1',
      guestConfirmedOnWayAtUtc: new Date().toISOString(),
      wasReplay: false,
    });
    render(withQueries(<BookingDetailScreen />, client));

    await waitFor(() => expect(gateway.getBooking).toHaveBeenCalled());
    await settle();
    expect(gateway.confirmOnMyWay).not.toHaveBeenCalled();
  });

  it('N9: the push\'s "yes" is sent exactly once, after a fresh read', async () => {
    params.value = { bookingId: 'booking-1', onMyWay: 'yes' };
    gateway.getBooking.mockResolvedValue(ASKED);
    gateway.confirmOnMyWay.mockResolvedValue({
      reservationId: 'booking-1',
      guestConfirmedOnWayAtUtc: new Date().toISOString(),
      wasReplay: false,
    });
    render(withQueries(<BookingDetailScreen />));

    await waitFor(() => expect(gateway.confirmOnMyWay).toHaveBeenCalledTimes(1));
    // The answer reads the booking again; still asked there, it is not resent.
    await waitFor(() => expect(gateway.getBooking.mock.calls.length).toBeGreaterThan(1));
    await settle();
    expect(gateway.confirmOnMyWay).toHaveBeenCalledTimes(1);
  });

  it('N9: the push\'s "yes" sends nothing when the question is not asked', async () => {
    params.value = { bookingId: 'booking-1', onMyWay: 'yes' };
    gateway.getBooking.mockResolvedValue({
      ...ASKED,
      slotUtc: new Date(Date.now() + 60 * MINUTE_MS).toISOString(),
    });
    render(withQueries(<BookingDetailScreen />));

    await screen.findByText('preOrder.state.lockedTitle');
    await settle();
    expect(gateway.confirmOnMyWay).not.toHaveBeenCalled();
  });

  it('N6: an early "yes" says from when it can be confirmed', async () => {
    const opensAtUtc = new Date(Date.now() + HOUR_MS).toISOString();
    gateway.getBooking.mockResolvedValue(ASKED);
    gateway.confirmOnMyWay.mockRejectedValue(new OnMyWayNotOpenError({ url: '/x', opensAtUtc }));
    render(withQueries(<BookingDetailScreen />));

    fireEvent.click(await screen.findByRole('button', { name: 'coming.imComing' }));
    expect(
      await screen.findByText(
        `preOrder.error.onMyWayOpensAt time=${formatTime(opensAtUtc, 'Asia/Yerevan', 'en')}`,
      ),
    ).toBeTruthy();
  });
});
