// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type FloorTable,
  type StaffGateway,
  type StaffSessionIdentity,
  type StaffSessionSnapshot,
  type StaffTableDetail,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the connection chip on the staff header', () => {
  it('says "Live" on the floor once the change stream has been polled', async () => {
    signIn('waiter');
    render(providers(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), <StaffRoute />));

    await screen.findByRole('heading', { level: 1, name: 'Floor' });
    // With the time of the last answer, as the top bar's chip says it.
    await waitFor(() => expect(screen.getByText(/^Live · \d\d:\d\d$/u)).toBeTruthy());
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
    await waitFor(() => expect(screen.getByText(/^Live · /u)).toBeTruthy());

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
    await waitFor(() => expect(screen.getByText(/^Live · /u)).toBeTruthy());
    // The chip refreshes, and the kitchen has no floor to refresh.
    expect(screen.getByRole('button', { name: /\. Refresh the orders$/u })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Refresh the floor/u })).toBeNull();
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

  it('lists the tables by room, in room order and then by label, with no drawn plan', async () => {
    const user = userEvent.setup();
    signIn('waiter');
    render(providers(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), <StaffRoute />));

    const grid = await screen.findByRole('list', { name: 'Tables' });
    const labels = () =>
      within(grid)
        .getAllByRole('button')
        .map((button) => /^Table (\d+),/u.exec(button.getAttribute('aria-label') ?? '')?.[1]);
    // Every room: Bar's tables before Windows', each room by label.
    expect(labels()).toEqual(['1', '2', '3', '4', '9', '10', '11', '5', '6', '7', '8']);

    const rooms = screen.getByRole('group', { name: 'Rooms' });
    await user.click(within(rooms).getByRole('button', { name: 'Bar' }));
    expect(labels()).toEqual(['1', '2', '3', '4', '9', '10', '11']);
    await user.click(within(rooms).getByRole('button', { name: 'Windows' }));
    expect(labels()).toEqual(['5', '6', '7', '8']);
    expect(document.querySelector('svg[role="img"], [data-testid="floor-plan"]')).toBeNull();
  });

  it('colours each card by its state: free, booked, held, occupied, out of service', async () => {
    signIn('waiter');
    render(providers(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), <StaffRoute />));

    const tone = async (name: RegExp) =>
      (await screen.findByRole('button', { name })).getAttribute('data-tone');
    expect(await tone(/^Table 2, 2 seats, Free/u)).toBe('free');
    expect(await tone(/^Table 3, 4 seats, Held/u)).toBe('held');
    expect(await tone(/^Table 6, 4 seats, Reserved/u)).toBe('booked');
    expect(await tone(/^Table 1, 2 seats, Occupied/u)).toBe('occupied');
    expect(await tone(/^Table 10, 2 seats, Out of service/u)).toBe('out');
  });

  it('opens the table actions from a row with the keyboard, and closes back to the row', async () => {
    signIn('waiter');
    const user = userEvent.setup();
    render(providers(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), <StaffRoute />));

    const row = await screen.findByRole('button', { name: /^Table 2, 2 seats, Free/u });
    row.focus();
    await user.keyboard('{Enter}');

    const panel = await screen.findByRole('dialog', { name: 'Actions for table 2' });
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(within(panel).getByRole('button', { name: 'Seat a walk-in' })).toBeTruthy();

    await user.click(within(panel).getByRole('button', { name: 'Close and go back to the floor' }));
    expect(screen.queryByRole('dialog', { name: 'Actions for table 2' })).toBeNull();
  });
});

const occupied: FloorTable = {
  id: 't2',
  label: '2',
  seats: 2,
  floorAreaId: null,
  floorAreaName: null,
  floorAreaDisplayOrder: 0,
  pin: null,
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

function showPanel(
  openTabId: string | null,
  options: { online?: boolean; pending?: boolean; onStartTab?: () => void } = {},
) {
  const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
  render(
    providers(
      gateway,
      <TableActionPanel
        table={occupied}
        detail={detail(openTabId)}
        timeZoneId="Asia/Yerevan"
        projectedStatus={null}
        tab={null}
        pending={options.pending ?? false}
        online={options.online ?? true}
        affectedReservations={[]}
        releasing={false}
        onAct={() => {}}
        onRelease={() => {}}
        onOpenTab={() => {}}
        onCash={() => {}}
        onStartTab={options.onStartTab ?? (() => {})}
        startingTab={false}
        onOrder={() => {}}
        onClose={() => {}}
      />,
    ),
  );
}

describe('a seated walk-in with no tab', () => {
  it('is not offered "Take an order", and is offered a tab of its own', () => {
    const onStartTab = vi.fn();
    showPanel(null, { onStartTab });
    expect(screen.queryByRole('button', { name: 'Take an order' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'View the tab' })).toBeNull();
    expect(screen.getByText(/scanning the code on the table/u)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start a tab' }));
    expect(onStartTab).toHaveBeenCalledTimes(1);
  });

  it('cannot start one offline, and says why', () => {
    showPanel(null, { online: false });
    expect(screen.getByRole('button', { name: 'Start a tab' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Starting a tab needs a connection.')).toBeTruthy();
  });

  it('cannot start one while its own seating is still waiting to sync', () => {
    showPanel(null, { pending: true });
    expect(screen.getByRole('button', { name: 'Start a tab' })).toHaveProperty('disabled', true);
  });

  it('gets both once a tab is open', () => {
    showPanel('tab-1');
    expect(screen.getByRole('button', { name: 'Take an order' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View the tab' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start a tab' })).toBeNull();
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
          sent={null}
          onSubmit={() => {}}
          onSentDismiss={() => {}}
          onClose={() => {}}
        />,
      ),
    );

    expect(screen.getByRole('dialog', { name: 'Order · table 4' })).toBeTruthy();
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
          tableLabel="4"
          timeZoneId="Asia/Yerevan"
          role="waiter"
          online
          loading={false}
          offlineUnknown={false}
          cashRefusal={null}
          onVoid={() => {}}
          onAdjust={() => {}}
          onCash={async () => ({ kind: 'failed' as const })}
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

describe('the next booking on the table panel (QA 2026-10-16, P-B2)', () => {
  const free: FloorTable = {
    ...occupied,
    id: 't1',
    label: '1',
    state: 'free',
    occupiedSinceUtc: null,
  };

  function showFreeWith(nextReservationStartUtc: string) {
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    render(
      providers(
        gateway,
        <TableActionPanel
          table={{ ...free, nextReservationStartUtc }}
          detail={{
            ...detail(null),
            tableId: 't1',
            label: '1',
            physicalStatus: 'free',
            currentSessionId: null,
            seatedAtUtc: null,
            partySize: null,
            nextReservationId: 'r1',
            nextReservationStartUtc,
            nextReservationPartySize: 2,
          }}
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
          onCash={() => {}}
          onStartTab={() => {}}
          startingTab={false}
          onOrder={() => {}}
          onClose={() => {}}
        />,
      ),
    );
    return screen.getByText('Next booking').nextElementSibling?.textContent;
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('says the day when the booking is not tonight', () => {
    // Friday 16 Oct, 22:45 in Yerevan.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-16T18:45:00Z') });

    expect(showFreeWith('2026-10-16T19:30:00Z')).toBe('23:30');
    cleanup();
    expect(showFreeWith('2026-10-17T15:00:00Z')).toBe('Tomorrow 19:00');
    cleanup();
    expect(showFreeWith('2026-10-18T16:00:00Z')).toBe('Sun 18 Oct, 20:00');
  });
});

describe('the staff floor, from QA 2026-10-16', () => {
  it('moves focus into the panel, closes it on Escape, and gives focus back to the row', async () => {
    signIn('waiter');
    const user = userEvent.setup();
    render(providers(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), <StaffRoute />));

    const row = await screen.findByRole('button', { name: /^Table 2, 2 seats, Free/u });
    await user.click(row);
    const panel = await screen.findByRole('dialog', { name: 'Actions for table 2' });
    expect(panel.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Actions for table 2' })).toBeNull();
    expect(document.activeElement).toBe(row);
  });

  it("names each room: a chip to narrow the floor to it, and the end of each table's name", async () => {
    signIn('waiter');
    render(providers(createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), <StaffRoute />));

    const rooms = await screen.findByRole('group', { name: 'Rooms' });
    expect(within(rooms).getByRole('button', { name: 'Bar' })).toBeTruthy();
    expect(within(rooms).getByRole('button', { name: 'Windows' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Table 5, /u }).getAttribute('aria-label')).toMatch(
      /, Windows$/u,
    );
  });
});
