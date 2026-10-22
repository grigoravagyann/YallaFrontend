import { ADMITTED, type DinerTabLine, type DinerTabView } from '@yalla/api';
import type * as ApiReactModule from '@yalla/api/react';
import type * as I18nModule from '@yalla/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveBill } from './LiveBill';

/**
 * The bill's rows say who and when: "Աննա · 19:08", the time in the branch's
 * zone, and who alone when the server sent no time.
 *
 * Copy is checked by key, as the other screen tests do; the translated
 * sentences are `lineMeta.test.ts`'s.
 */

const current = vi.hoisted(() => ({ gateway: null as unknown }));

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
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

const ME = 'p-me';
const YEREVAN = 'Asia/Yerevan';

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
    orderedAtUtc: '2026-10-22T15:08:00Z',
    note: null,
    orderStatus: 'inKitchen',
    sharedWithCount: 0,
    isVoided: false,
    voidReason: null,
    voidedAtUtc: null,
    ...overrides,
  };
}

function tab(lines: readonly DinerTabLine[]): DinerTabView {
  return {
    tabId: 't1',
    branchId: 'b1',
    venueName: 'Lumen Coffee',
    branchName: 'Northern Avenue',
    timeZoneId: YEREVAN,
    tableLabel: '7',
    status: 'open',
    admission: ADMITTED,
    settlementMode: 'anyonePaysAnyAmount',
    settlementModeLocked: false,
    hostParticipantId: ME,
    hideTotalFromGuests: false,
    me: {
      participantId: ME,
      displayName: 'Ani',
      role: 'host',
      status: 'approved',
      canOrder: true,
      canOrderNow: true,
      canPay: true,
      canSeeTableTotal: true,
      joinedAtUtc: '2026-10-22T15:00:00Z',
      photo: null,
    },
    participants: [
      { participantId: ME, displayName: 'Ani', role: 'host', status: 'approved', photo: null },
    ],
    myLines: lines.filter((entry) => entry.participantId === ME),
    tableLines: lines,
    money: {
      kind: 'table',
      bill: {
        subtotalDram: 9000,
        serviceChargeDram: 900,
        totalDram: 9900,
        paidDram: 0,
        remainingDram: 9900,
      },
      tipsDram: 0,
    },
    serviceChargePercent: 10,
    adjustments: [],
    maxSequence: 2,
    openedAtUtc: '2026-10-22T15:00:00Z',
    closedAtUtc: null,
    fetchedAtUtc: '2026-10-22T15:20:00Z',
  };
}

function renderBill(view: DinerTabView, timeZoneId = YEREVAN) {
  current.gateway = {
    getDinerTab: vi.fn().mockResolvedValue(view),
    getTabShares: vi.fn().mockResolvedValue(null),
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LiveBill tabId="t1" timeZoneId={timeZoneId} active={false} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('who and when on each row of the bill', () => {
  it("says who and the time each line's order went in, on the branch's clock", async () => {
    renderBill(
      tab([
        line('l1'),
        line('l2', {
          name: 'Tan',
          participantId: 'p-anna',
          orderedByName: 'Աննա',
          orderedAtUtc: '2026-10-22T15:21:00Z',
        }),
      ]),
    );

    expect(await screen.findByText('bill.yours · 19:08')).toBeDefined();
    expect(screen.getByText('bill.orderedBy name=Աննա · 19:21')).toBeDefined();
  });

  it("reads the zone it is given, not the device's", async () => {
    renderBill(tab([line('l1')]), 'Europe/Moscow');

    expect(await screen.findByText('bill.yours · 18:08')).toBeDefined();
  });

  it('says who alone when the line carries no time', async () => {
    renderBill(
      tab([
        line('l1', { orderedAtUtc: null }),
        line('l2', {
          participantId: null,
          orderedByName: null,
          isTableAttributed: true,
          sharedWithCount: 2,
          orderedAtUtc: null,
        }),
      ]),
    );

    expect(await screen.findByText('bill.yours')).toBeDefined();
    expect(screen.getByText('bill.forTheTable · bill.sharedWays count=2')).toBeDefined();
  });
});
