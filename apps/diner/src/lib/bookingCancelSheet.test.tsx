import type { Booking } from '@yalla/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BookingDetailScreen from '../../app/booking/[bookingId]';
import type { ConfirmSheetProps } from '../components/ConfirmSheet';
import type * as ConfirmSheetModule from '../components/ConfirmSheet';
import type * as I18nModule from '@yalla/i18n';
import type * as ApiReactModule from '@yalla/api/react';

/**
 * Cancelling a booking: the confirmation sheet closes once the server has
 * said yes, and the screen shows the cancelled state. The sheet used to stay
 * open behind the "Cancelled" badge, offering "Yes, cancel" on a booking that
 * was already gone.
 *
 * The sheet's `visible` prop is what is asserted on: react-native-web's Modal
 * unmounts only after a CSS `animationend` that jsdom never sends, so the DOM
 * cannot say whether the sheet was told to close.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const gateway = vi.hoisted(() => ({
  getBooking: vi.fn(),
  cancelBooking: vi.fn(),
}));
const sheets = vi.hoisted(() => [] as ConfirmSheetProps[]);

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
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
  useTranslation: () => ({ t: (key: string) => key }),
  useLocale: () => ({ locale: 'en' }),
}));
vi.mock('@yalla/api/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiReactModule>()),
  useGateway: () => gateway,
}));
vi.mock('../places/hooks', () => ({ usePlace: () => ({ data: undefined }) }));
vi.mock('../components/AtMyTableAction', () => ({ AtMyTableAction: () => null }));
vi.mock('../push/ReservationActions', () => ({ KeepTableAction: () => null }));
vi.mock('../components/ConfirmSheet', async (importOriginal) => {
  const actual = await importOriginal<typeof ConfirmSheetModule>();
  return {
    ConfirmSheet: (props: ConfirmSheetProps) => {
      sheets.push(props);
      return actual.ConfirmSheet(props);
    },
  };
});

const DAY_MS = 86_400_000;
const slot = new Date(Date.now() + DAY_MS).toISOString();

const CONFIRMED = {
  id: 'booking-1',
  code: 'ABC123',
  branchId: 'branch-1',
  venueName: 'Yalla Demo Cafe',
  branchName: 'Yerevan Centre',
  tableLabel: '1',
  partySize: 2,
  slotUtc: slot,
  endUtc: new Date(Date.now() + DAY_MS + 2 * 3_600_000).toISOString(),
  freeCancellationUntilUtc: new Date(Date.now() + DAY_MS / 2).toISOString(),
  timeZoneId: 'Asia/Yerevan',
  status: 'confirmed',
  note: null,
  cancelledAtUtc: null,
} as unknown as Booking;

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <BookingDetailScreen />
    </QueryClientProvider>,
  );
  return { ...rendered, client };
}

/** What the sheet was last told. */
const lastSheet = () => sheets[sheets.length - 1]!;

afterEach(() => {
  cleanup();
  sheets.length = 0;
  gateway.getBooking.mockReset();
  gateway.cancelBooking.mockReset();
});

describe('cancelling a booking from its detail screen', () => {
  it('closes the sheet on Keep without touching the booking', async () => {
    gateway.getBooking.mockResolvedValue(CONFIRMED);
    renderScreen();

    const cancel = await screen.findByRole('button', { name: 'bookings.detail.cancel' });
    // Named by its label outright, not only by its text (QA 20261016T2 B5).
    expect(cancel.getAttribute('aria-label')).toBe('bookings.detail.cancel');
    fireEvent.click(cancel);
    expect(lastSheet().visible).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'bookings.detail.cancelKeep' }));

    expect(lastSheet().visible).toBe(false);
    expect(gateway.cancelBooking).not.toHaveBeenCalled();
  });

  it('closes the sheet and shows the cancelled state once the server agrees', async () => {
    gateway.getBooking.mockResolvedValue(CONFIRMED);
    gateway.cancelBooking.mockResolvedValue({
      ...CONFIRMED,
      status: 'cancelledByDiner',
      cancelledAtUtc: new Date().toISOString(),
    });
    renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'bookings.detail.cancel' }));
    expect(lastSheet().visible).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'bookings.detail.cancelConfirm' }));

    await waitFor(() => expect(screen.getByText('bookings.detail.cancelledOn')).toBeTruthy());
    // QA 20261016T2 B7: a cancelled code is not one to show at the door.
    expect(screen.queryByText('success.codeHint')).toBeNull();
    expect(screen.getByText('bookings.detail.codeCancelled')).toBeTruthy();
    expect(gateway.cancelBooking).toHaveBeenCalledWith('booking-1');
    await waitFor(() => expect(lastSheet().visible).toBe(false));
    expect(lastSheet().busy).toBe(false);
    expect(lastSheet().error).toBeNull();
    expect(screen.queryByRole('button', { name: 'bookings.detail.cancel' })).toBeNull();
  });

  it('is not shown once the booking is cancelled, whichever way that came about', async () => {
    gateway.getBooking.mockResolvedValueOnce(CONFIRMED).mockResolvedValue({
      ...CONFIRMED,
      status: 'cancelledByVenue',
      cancelledAtUtc: new Date().toISOString(),
    });
    const { client } = renderScreen();

    fireEvent.click(await screen.findByRole('button', { name: 'bookings.detail.cancel' }));
    expect(lastSheet().visible).toBe(true);

    // The venue cancelled it meanwhile and the next read says so.
    await client.refetchQueries({ queryKey: ['booking', 'booking-1'] });

    await waitFor(() => expect(screen.getByText('bookings.detail.cancelledOn')).toBeTruthy());
    expect(lastSheet().visible).toBe(false);
    expect(gateway.cancelBooking).not.toHaveBeenCalled();
  });
});
