// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type StaffGateway,
  type StaffSessionIdentity,
  type StaffSessionSnapshot,
  type StaffTableDetail,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import type { FloorTable } from '@yalla/floorplan';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import type * as CurrentUserModule from '../auth/useCurrentUser';
import { OrderEntry } from './OrderEntry';
import { TabPanel } from './TabPanel';
import { TableActionPanel } from './TableActionPanel';

/**
 * The staff tablet, as the QA sweep of 2026-10-16 found it: a header that
 * promised live updates "not connected yet" for a whole shift while polling
 * worked, a "Take an order" that led to a screen saying a waiter cannot take
 * one, dialogs announced by their raw translation keys, and menu tiles that
 * were buttons with no name. Each is pinned here.
 */

const snapshot = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('./auth/staffSession', () => ({
  staffAuthAvailable: true,
  staffSession: {
    restore: async () => undefined,
    refreshDevice: async () => undefined,
    signOut: async () => undefined,
  },
}));
vi.mock('./auth/useStaffSession', () => ({
  useStaffSessionSnapshot: () => snapshot.current,
  useTouchOnInteraction: () => undefined,
}));
vi.mock('../auth/useCurrentUser', async () => {
  const actual = await vi.importActual<typeof CurrentUserModule>('../auth/useCurrentUser');
  return { ...actual, useCurrentUser: () => ({ user: null }) };
});

const { StaffRoute } = await import('./StaffRoute');

const BRANCH = 'b1';
const SIZE = { width: 1024, height: 700 };

const device: EnrolledDevice = {
  deviceId: 'd1',
  deviceName: 'Counter',
  branchId: BRANCH,
  branchName: 'Lumen North',
  venueName: 'Lumen',
  enrolledAtUtc: '2026-09-01T00:00:00Z',
  lastSeenAtUtc: null,
};

function signIn(role: StaffSessionIdentity['role']): void {
  const next: StaffSessionSnapshot = {
    state: 'signedIn',
    device,
    identity: { staffMemberId: 's1', fullName: 'Sona Vardanyan', role, branchId: BRANCH },
    lastSignOut: null,
  };
  snapshot.current = next;
}

function providers(gateway: StaffGateway, children: React.ReactNode) {
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  return (
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider staffGateway={gateway}>
          <MemoryRouter>{children}</MemoryRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

beforeAll(async () => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  await initConsoleTestI18n();
});

beforeEach(() => {
  // The floor measures its pane; jsdom gives it none, and a 0x0 plan draws
  // no tables at all.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: SIZE.width,
    bottom: SIZE.height,
    ...SIZE,
    toJSON: () => ({}),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the connection chip on the staff header', () => {
  it('says "Live" on the floor once the change stream has been polled', async () => {
    signIn('waiter');
    render(providers(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), <StaffRoute />));

    await screen.findByRole('heading', { level: 1, name: 'Floor' });
    await waitFor(() => expect(screen.getByText('Live')).toBeTruthy());
    expect(screen.queryByText('Live updates not connected yet')).toBeNull();
  });

  it('says "Reconnecting…" on the floor only once a poll fails', async () => {
    signIn('waiter');
    const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    let serverDown = false;
    const gateway = new Proxy(base, {
      get(target, key: keyof StaffGateway) {
        if (key === 'getFloor') {
          return async (branchId: string) => {
            if (serverDown) throw new Error('socket hang up');
            return target.getFloor(branchId);
          };
        }
        return target[key];
      },
    });
    render(providers(gateway, <StaffRoute />));

    await screen.findByRole('heading', { level: 1, name: 'Floor' });
    await waitFor(() => expect(screen.getByText('Live')).toBeTruthy());

    // The next poll is the one that fails. Coming back online polls at once
    // rather than waiting out the interval, which is the lever this uses.
    serverDown = true;
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(screen.getByText('Reconnecting…')).toBeTruthy());
    // The room it already had stays drawn under the chip.
    expect(screen.getAllByRole('button', { name: /^Table \d+, /u }).length).toBeGreaterThan(0);
  });

  it('says "Live" in the kitchen while the order queue is being read', async () => {
    signIn('kitchen');
    render(providers(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), <StaffRoute />));

    await screen.findByRole('heading', { level: 1, name: 'Kitchen' });
    await waitFor(() => expect(screen.getByText('Live')).toBeTruthy());
    // The kitchen has no floor to refresh.
    expect(screen.getByRole('button', { name: 'Refresh the orders' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refresh the floor' })).toBeNull();
  });
});

describe('the tab title on the tablet', () => {
  it('names the floor for a waiter and the kitchen for the kitchen', async () => {
    signIn('waiter');
    render(providers(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), <StaffRoute />));
    await screen.findByRole('heading', { level: 1, name: 'Floor' });
    await waitFor(() => expect(document.title).toBe('Floor · Yalla'));
    cleanup();

    signIn('kitchen');
    render(providers(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), <StaffRoute />));
    await screen.findByRole('heading', { level: 1, name: 'Kitchen' });
    await waitFor(() => expect(document.title).toBe('Kitchen · Yalla'));
  });
});

describe('the staff floor, read without a pointer', () => {
  it('names each table as a button', async () => {
    signIn('waiter');
    render(providers(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), <StaffRoute />));

    await screen.findByRole('heading', { level: 1, name: 'Floor' });
    const tables = await screen.findAllByRole('button', { name: /^Table \d+, \d+ seats?, /u });
    expect(tables.length).toBeGreaterThan(0);
  });
});

const occupied: FloorTable = {
  id: 't2',
  label: '2',
  seats: 2,
  x: 100,
  y: 100,
  width: 70,
  height: 70,
  rotationDegrees: 0,
  shape: 'round',
  floorAreaName: null,
  isBookable: true,
  state: 'occupied',
  nextReservationStartUtc: null,
  occupiedSinceUtc: '2026-10-16T12:00:00Z',
};

function detail(openTabId: string | null): StaffTableDetail {
  return {
    tableId: 't2',
    label: '2',
    seats: 2,
    physicalStatus: 'occupied',
    currentSessionId: 'sess',
    seatedAtUtc: '2026-10-16T12:00:00Z',
    partySize: 2,
    nextReservationId: null,
    nextReservationStartUtc: null,
    nextReservationPartySize: null,
    freeUntilUtc: null,
    openTabId,
    rowVersion: 'v1',
  };
}

function showPanel(openTabId: string | null) {
  const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
  render(
    providers(
      gateway,
      <TableActionPanel
        table={occupied}
        detail={detail(openTabId)}
        anchor={{ x: 100, y: 100, width: 70, height: 70 }}
        frame={SIZE}
        timeZoneId="Asia/Yerevan"
        projectedStatus={null}
        tab={null}
        pending={false}
        online
        affectedReservations={[]}
        releasing={false}
        onAct={() => {}}
        onRelease={() => {}}
        onOpenTab={() => {}}
        onOrder={() => {}}
        onClose={() => {}}
      />,
    ),
  );
}

describe('a seated walk-in with no tab', () => {
  it('is not offered "Take an order", and is told how a tab opens', () => {
    showPanel(null);
    expect(screen.queryByRole('button', { name: 'Take an order' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open the tab' })).toBeNull();
    expect(screen.getByText(/scans the code on the table/u)).toBeTruthy();
  });

  it('gets both once a guest has opened one', () => {
    showPanel('tab-1');
    expect(screen.getByRole('button', { name: 'Take an order' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open the tab' })).toBeTruthy();
  });
});

describe('the order and tab dialogs', () => {
  it('are announced with the table number, and each menu tile by its name', async () => {
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const menu = await gateway.getMenu(BRANCH);
    expect(menu).not.toBeNull();
    const first = menu!.sections[0]!.items[0]!;

    render(
      providers(
        gateway,
        <OrderEntry
          menu={menu}
          menuFromCache={false}
          tab={null}
          tableLabel="4"
          timeZoneId="Asia/Yerevan"
          online
          loading={false}
          menuUnavailable={false}
          noTab={false}
          onSubmit={() => {}}
          onClose={() => {}}
        />,
      ),
    );

    expect(screen.getByRole('dialog', { name: 'Order for table 4' })).toBeTruthy();
    expect(screen.queryByText('A tab will be opened for this table.')).toBeNull();
    // "Name, price" — the tile's own label, not its two spans run together
    // ("Lahmajun1,200 ֏"), which is what a tile with no name is read as.
    const name = first.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    expect(screen.getByRole('button', { name: new RegExp(`^${name}, \\S`, 'u') })).toBeTruthy();
  });

  it('name the tab panel by its table too', () => {
    render(
      providers(
        createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }),
        <TabPanel
          tab={null}
          lines={[]}
          linesLoading={false}
          linesKnown
          adjustments={[]}
          tableLabel="4"
          timeZoneId="Asia/Yerevan"
          role="waiter"
          online
          loading={false}
          offlineUnknown={false}
          cashRefusal={null}
          onVoid={() => {}}
          onAdjust={() => {}}
          onCash={() => {}}
          onAskForBill={() => {}}
          onAbandon={() => {}}
          onOrder={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    expect(screen.getByRole('dialog', { name: 'Tab · table 4' })).toBeTruthy();
  });
});
