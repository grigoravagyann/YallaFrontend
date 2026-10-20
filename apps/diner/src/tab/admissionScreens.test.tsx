import {
  ScanTurnedAwayError,
  createMockGateway,
  mockTableCode,
  type Booking,
  type MockGateway,
  type YallaGateway,
} from '@yalla/api';
import type * as ApiReactModule from '@yalla/api/react';
import type * as I18nModule from '@yalla/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SuccessScreen from '../../app/reserve/success';
import TabScreen from '../../app/tab/[tabId]/index';
import { JoinByLink } from '../components/JoinByLink';
import { useToast } from '../components/motion/Toast';
import { TrayProvider } from '../order/TrayProvider';
import { useSession } from '../stores/session';

/**
 * The unverified-guests screens on the phone (2026-10-20): a scanned tab that
 * waits for a waiter, is let in (a word of welcome, ordering opens) or turned
 * away (a plain screen and the way home, never a receipt); and a legacy
 * booking made without a proved number (possible only on 2026-10-20), said as
 * such — booking without proof, and its nudge, are gone (guest record).
 *
 * Copy is checked by key and its values, as the other screen tests do.
 */

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  dismissTo: vi.fn(),
  canGoBack: vi.fn(() => true),
}));
const params = vi.hoisted(() => ({ current: {} as Record<string, string> }));
const current = vi.hoisted(() => ({ gateway: null as unknown }));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => params.current,
  useFocusEffect: () => undefined,
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
  useGateway: () => current.gateway,
}));
vi.mock('../places/hooks', () => ({ usePlace: () => ({ data: undefined }) }));
vi.mock('../push/ReminderOptIn', () => ({ ReminderOptIn: () => null }));
vi.mock('../lib/haptics', () => ({
  haptics: { select: vi.fn(), success: vi.fn(), tap: vi.fn() },
}));

function renderWith(gateway: unknown, node: React.ReactNode) {
  current.gateway = gateway;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TrayProvider>{node}</TrayProvider>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  useToast.setState({ text: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useSession.setState({ signedIn: false, phoneE164: null, guestName: null, profile: null });
});

async function scannedTab(gateway: MockGateway): Promise<string> {
  const scan = await gateway.scanTableCode({
    tableCode: mockTableCode('b-lumen-north-t1'),
    commandId: '9a1f6a4e-5b1d-4c62-9c55-7a0c5d1e2f30',
  });
  params.current = { tabId: scan.tab.tabId };
  return scan.tab.tabId;
}

describe('a scanned tab waiting for a waiter', () => {
  it('says a waiter is coming, keeps the menu and a call, and holds the bill', async () => {
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
    await scannedTab(gateway);
    renderWith(gateway, <TabScreen />);

    expect(await screen.findByText('tab.admission.waitingTitle')).toBeDefined();
    expect(screen.getByText('order.blocked.awaitingAdmission')).toBeDefined();
    // The menu is readable, a waiter callable; the bill waits.
    expect(screen.getByRole('button', { name: 'menu.title' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'waiter.call' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'tab.settle' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
  });

  it('says so once when a waiter lets the table in, and ordering opens', async () => {
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
    const tabId = await scannedTab(gateway);
    const client = renderWith(gateway, <TabScreen />);
    await screen.findByText('tab.admission.waitingTitle');

    gateway.admitTabAsWaiter(tabId);
    await act(() => client.invalidateQueries({ queryKey: ['dinerTab', tabId] }));

    await waitFor(() => expect(useToast.getState().text).toBe('tab.admission.admitted'));
    expect(screen.queryByText('tab.admission.waitingTitle')).toBeNull();
    expect(screen.getByRole('button', { name: 'tab.order' })).toBeDefined();
  });

  it('says the venue closed it when turned away — never a receipt — and goes home', async () => {
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
    const tabId = await scannedTab(gateway);
    const client = renderWith(gateway, <TabScreen />);
    await screen.findByText('tab.admission.waitingTitle');

    gateway.rejectTabAsWaiter(tabId);
    await act(() => client.invalidateQueries({ queryKey: ['dinerTab', tabId] }));

    expect(await screen.findByText('tab.admission.rejectedTitle')).toBeDefined();
    expect(screen.getByText('tab.admission.rejectedBody')).toBeDefined();
    expect(screen.queryByText('tab.paid.title')).toBeNull();
    expect(useToast.getState().text).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'tab.admission.home' }));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});

const SLOT = new Date(Date.now() + 26 * 3_600_000).toISOString();

const UNVERIFIED: Booking = {
  id: 'booking-1',
  code: 'ABC123',
  status: 'pendingApproval',
  venueName: 'Yalla Demo Cafe',
  branchId: 'branch-1',
  branchName: 'Yerevan Centre',
  timeZoneId: 'Asia/Yerevan',
  tableId: 't1',
  tableLabel: '1',
  roomName: null,
  slotUtc: SLOT,
  partySize: 2,
  guestName: 'Ani',
  freeCancellationUntilUtc: SLOT,
  awaitingApprovalBecause: 'unverifiedPhone',
  approvalExpiresAtUtc: new Date(Date.now() + 23 * 3_600_000).toISOString(),
  declinedBecause: null,
  phoneUnverified: true,
  manageToken: null,
} as unknown as Booking;

describe('a legacy booking made without a proved number', () => {
  it('says the venue confirms it, and no longer nudges to prove the number', async () => {
    params.current = { bookingId: UNVERIFIED.id };
    renderWith(
      { getBooking: vi.fn().mockResolvedValue(UNVERIFIED), listBookings: vi.fn() } as unknown,
      <SuccessScreen />,
    );

    expect(await screen.findByText('success.pendingTitle')).toBeDefined();
    expect(screen.getByText('booking.approval.unverifiedWhy')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'confirm.verifyMyNumber' })).toBeNull();
  });
});

describe('a scan right after a waiter turned this phone away', () => {
  it('says the venue closed a tab here, to ask a waiter, and goes home — not “scan again”', async () => {
    const gateway = {
      scanTableCode: vi
        .fn()
        .mockRejectedValue(new ScanTurnedAwayError({ url: '/api/tabs/open', retryAfterUtc: null })),
    } as Partial<YallaGateway>;
    renderWith(
      gateway,
      <JoinByLink code={{ kind: 'table', code: '0123456789abcdef0123456789abcdef' }} />,
    );

    expect(await screen.findByText('tab.admission.rejectedTitle')).toBeDefined();
    expect(screen.getByText('scan.error.turnedAway')).toBeDefined();
    expect(screen.queryByText('join.failedBody')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'tab.admission.home' }));
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
