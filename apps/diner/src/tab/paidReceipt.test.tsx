import { ADMITTED, type DinerTabLine, type DinerTabView } from '@yalla/api';
import type * as ApiReactModule from '@yalla/api/react';
import type * as I18nModule from '@yalla/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TabScreen from '../../app/tab/[tabId]/index';
import { TrayProvider } from '../order/TrayProvider';

/**
 * The paid receipt says when each dish went in, as the bill did while the tab
 * was open: "1 × Khorovats · 19:08", small and muted after the dish, on the
 * branch's clock — and the dish alone when the server sent no time.
 */

const current = vi.hoisted(() => ({ gateway: null as unknown }));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  dismissTo: vi.fn(),
  canGoBack: vi.fn(() => true),
}));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => router,
  useLocalSearchParams: () => ({ tabId: 't1' }),
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
// The place, for whether it takes reviews ("Rate your visit"); unknown by default.
const placeHeld = vi.hoisted(() => ({ place: undefined as unknown }));
vi.mock('../places/hooks', () => ({ usePlace: () => ({ data: placeHeld.place }) }));
vi.mock('../lib/haptics', () => ({
  haptics: { select: vi.fn(), success: vi.fn(), tap: vi.fn() },
}));

const ME = 'p-me';

function line(id: string, overrides: Partial<DinerTabLine> = {}): DinerTabLine {
  return {
    id,
    orderId: `o-${id}`,
    menuItemId: 'm1',
    name: 'Khorovats',
    quantity: 1,
    unitPriceDram: 4500,
    lineTotalDram: 4500,
    isShared: false,
    participantId: ME,
    onBehalfOfParticipantId: null,
    isTableAttributed: false,
    orderedByName: 'Ani',
    // 15:08 UTC is 19:08 in Yerevan.
    orderedAtUtc: '2026-10-22T15:08:00Z',
    note: null,
    orderStatus: 'served',
    sharedWithCount: 0,
    isVoided: false,
    voidReason: null,
    voidedAtUtc: null,
    ...overrides,
  };
}

function closedTab(lines: readonly DinerTabLine[], timeZoneId = 'Asia/Yerevan'): DinerTabView {
  return {
    tabId: 't1',
    branchId: 'b1',
    venueName: 'Lumen Coffee',
    branchName: 'Northern Avenue',
    timeZoneId,
    tableLabel: '7',
    status: 'closed',
    admission: ADMITTED,
    settlementMode: 'anyonePaysAnyAmount',
    settlementModeLocked: true,
    hostParticipantId: ME,
    hideTotalFromGuests: false,
    me: {
      participantId: ME,
      displayName: 'Ani',
      role: 'host',
      status: 'approved',
      canOrder: true,
      canOrderNow: false,
      canPay: true,
      canSeeTableTotal: true,
      joinedAtUtc: '2026-10-22T15:00:00Z',
      photo: null,
    },
    participants: [
      { participantId: ME, displayName: 'Ani', role: 'host', status: 'approved', photo: null },
    ],
    myLines: lines,
    tableLines: lines,
    money: {
      kind: 'table',
      bill: {
        subtotalDram: 9000,
        serviceChargeDram: 900,
        totalDram: 9900,
        paidDram: 9900,
        remainingDram: 0,
      },
      tipsDram: 0,
    },
    serviceChargePercent: 10,
    adjustments: [],
    maxSequence: 4,
    openedAtUtc: '2026-10-22T15:00:00Z',
    closedAtUtc: '2026-10-22T16:30:00Z',
    fetchedAtUtc: '2026-10-22T16:31:00Z',
  };
}

function renderReceipt(view: DinerTabView) {
  current.gateway = {
    getDinerTab: vi.fn().mockResolvedValue(view),
    getTabShares: vi.fn().mockResolvedValue(null),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TrayProvider>
        <TabScreen />
      </TrayProvider>
    </QueryClientProvider>,
  );
}

/**
 * A receipt row's dish, read whole: the time is a nested, muted run, so the
 * dish and the time are separate text nodes of one line.
 */
function row(text: string) {
  return (_: string, element: Element | null) => element?.textContent === text;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  placeHeld.place = undefined;
});

describe('the paid receipt', () => {
  it("says when each dish went in, on the branch's clock", async () => {
    renderReceipt(
      closedTab([
        line('l1'),
        line('l2', { name: 'Tan', quantity: 2, orderedAtUtc: '2026-10-22T15:31:00Z' }),
      ]),
    );

    expect(await screen.findByText(row('1 × Khorovats · 19:08'))).toBeDefined();
    expect(screen.getByText(row('2 × Tan · 19:31'))).toBeDefined();
    // The time is its own muted run inside the row, not part of the dish's name.
    expect(screen.getByText('· 19:08')).toBeDefined();
    expect(screen.getByText('1 × Khorovats')).toBeDefined();
  });

  it("reads the branch's zone, not the device's", async () => {
    renderReceipt(closedTab([line('l1')], 'Europe/Moscow'));

    expect(await screen.findByText(row('1 × Khorovats · 18:08'))).toBeDefined();
  });

  it('shows the dish alone when the line carries no time', async () => {
    renderReceipt(closedTab([line('l1', { orderedAtUtc: null })]));

    expect(await screen.findByText(row('1 × Khorovats'))).toBeDefined();
    expect(screen.queryByText(/·\s*\d{2}:\d{2}/)).toBeNull();
  });

  it('still leaves voided lines off the receipt', async () => {
    renderReceipt(
      closedTab([
        line('l1'),
        line('l2', { name: 'Cake', isVoided: true, lineTotalDram: 0, voidReason: 'out' }),
      ]),
    );

    expect(await screen.findByText(row('1 × Khorovats · 19:08'))).toBeDefined();
    expect(screen.queryByText(/Cake/)).toBeNull();
  });
});

describe('rating the visit', () => {
  it('asks for stars where the place takes reviews, or is not read yet', async () => {
    renderReceipt(closedTab([line('l1')]));
    expect(await screen.findByText('tab.paid.rate')).toBeDefined();
  });

  it('does not where the place has reviews off', async () => {
    placeHeld.place = { features: ['appBookings', 'tableService'] };
    renderReceipt(closedTab([line('l1')]));
    await screen.findByText(row('1 × Khorovats · 19:08'));
    expect(screen.queryByText('tab.paid.rate')).toBeNull();
  });
});
