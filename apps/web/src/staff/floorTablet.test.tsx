// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  ReservationNotStartedError,
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type OrderQueueEntry,
  type ServiceRequest,
  type StaffGateway,
  type StaffSessionSnapshot,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { resetCommandStore } from './testCommandStore';
import type * as CurrentUserModule from '../auth/useCurrentUser';

/**
 * The floor tablet's main screen as the redesign draws it (floor-tablet
 * HANDOFF §2, the Main artboard): one top bar with the two views, a room
 * filter over a grid of tables that say their state in words, and the "Now"
 * rail — bookings to approve, calls, ready orders and what needs resolving.
 *
 * Through the real `StaffRoute` and the real staff mock, with the session as
 * the only double: a store, so signing out actually brings the PIN gate up.
 */

const session = vi.hoisted(() => {
  let current: unknown = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (next: unknown) => {
      current = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

// The queue's store in memory: see `testCommandStore.ts`.
vi.mock('../offline/commandStore', async (importOriginal) =>
  (await import('./testCommandStore')).withMemoryStore(await importOriginal()),
);

const refreshDevice = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('./auth/staffSession', () => ({
  staffAuthAvailable: true,
  staffSession: {
    restore: async () => undefined,
    refreshDevice,
    roster: async () => [],
    signOut: async () => {
      const now = session.get() as StaffSessionSnapshot;
      session.set({ ...now, state: 'locked', lastSignOut: 'signedOut' });
    },
  },
}));
vi.mock('./auth/useStaffSession', () => ({
  useStaffSessionSnapshot: () => useSyncExternalStore(session.subscribe, session.get),
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

function signIn(withDevice: EnrolledDevice | null = device): void {
  session.set({
    state: 'signedIn',
    device: withDevice,
    identity: { staffMemberId: 's1', fullName: 'Sona Vardanyan', role: 'waiter', branchId: BRANCH },
    lastSignOut: null,
  } satisfies StaffSessionSnapshot);
}

function order(status: OrderQueueEntry['status'], overrides: Partial<OrderQueueEntry> = {}) {
  return {
    orderId: `o-${status}`,
    tabId: 'tab1',
    tableLabel: '4',
    status,
    placedAtUtc: new Date(Date.now() - 3 * 60_000).toISOString(),
    estimatedReadyAtUtc: null,
    waitingMinutes: 3,
    lines: [
      { lineId: `l-${status}-1`, name: 'Khorovats', quantity: 2, note: null },
      { lineId: `l-${status}-2`, name: 'Tan', quantity: 1, note: null },
    ],
    ...overrides,
  } satisfies OrderQueueEntry;
}

const water: ServiceRequest = {
  id: 'sr-water',
  tabId: 'tab1',
  tableLabel: '5',
  reason: 'water',
  note: null,
  requestedAtUtc: new Date(Date.now() - 60_000).toISOString(),
  waitingMinutes: 1,
  acknowledgedAtUtc: null,
  requestedByParticipantId: null,
  bill: null,
};

function gatewayWith(overrides: Partial<StaffGateway> = {}): StaffGateway {
  return { ...createStaffMockGateway({ latencyMs: 0, branchId: BRANCH }), ...overrides };
}

function renderFloor(gateway: StaffGateway) {
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  render(
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider staffGateway={gateway}>
          <MemoryRouter>
            <StaffRoute />
          </MemoryRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const tableButtons = () =>
  screen
    .getAllByRole('button', { name: /^Table \d+, /u })
    .map((button) => /^Table (\d+),/u.exec(button.getAttribute('aria-label') ?? '')?.[1]);

async function rail(): Promise<HTMLElement> {
  return screen.findByRole('complementary', { name: 'Needs attention' });
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
  // Back online while the query client is still mounted: TanStack's online
  // manager stops listening once nothing subscribes, and would stay offline
  // for every test after this one.
  act(() => setOnline(true));
  cleanup();
  vi.restoreAllMocks();
  refreshDevice.mockClear();
  resetCommandStore();
});

/** What the browser says about the network, and the event that says it changed. */
function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

/** `userEvent` without its per-event timer: the waits it adds are not what is tested. */
const setupUser = () => userEvent.setup({ delay: null });

describe('the top bar on the floor', () => {
  it('names the venue and branch, and counts the orders waiting in the kitchen on its tab', async () => {
    signIn();
    renderFloor(
      gatewayWith({
        listOrderQueue: async () => [
          order('new', { orderId: 'a' }),
          order('inKitchen', { orderId: 'b' }),
          order('inKitchen', { orderId: 'c' }),
          order('ready', { orderId: 'd' }),
        ],
      }),
    );

    await screen.findByRole('heading', { level: 1, name: 'Floor' });
    expect(screen.getByText('Lumen · Lumen North')).toBeTruthy();
    const views = screen.getByRole('navigation', { name: 'Screens' });
    expect(within(views).getByRole('button', { name: 'Floor' }).getAttribute('aria-current')).toBe(
      'page',
    );
    // New and in the kitchen are waiting there; ready has left it.
    expect(
      await within(views).findByRole('button', {
        name: 'Kitchen, 3 orders waiting in the kitchen',
      }),
    ).toBeTruthy();
  });

  it('switches to the kitchen board and back, keeping the floor as it was', async () => {
    signIn();
    const user = setupUser();
    renderFloor(gatewayWith({ listOrderQueue: async () => [order('inKitchen')] }));

    await user.click(await screen.findByRole('button', { name: 'Windows' }));
    expect(tableButtons()).toEqual(['5', '6', '7', '8']);

    await user.click(screen.getByRole('button', { name: /^Kitchen/u }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Kitchen' })).toBeTruthy();
    expect(await screen.findByText('Khorovats')).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /^Table \d+, /u })).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /^Floor/u }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Floor' })).toBeTruthy();
    // The room it was filtered to is still the room it shows.
    expect(tableButtons()).toEqual(['5', '6', '7', '8']);
  });

  it('fetches the enrolled device when a session was restored signed in without it', async () => {
    // A reload restores the session signed in; the device (and with it the
    // venue's name in the bar) used to be fetched only while locked.
    signIn(null);
    renderFloor(gatewayWith());
    await screen.findByRole('heading', { level: 1, name: 'Floor' });
    await waitFor(() => expect(refreshDevice).toHaveBeenCalledTimes(1));
  });

  it('counts the calls and bookings waiting on the floor on its tab while the kitchen shows', async () => {
    signIn();
    const user = setupUser();
    renderFloor(
      gatewayWith({
        listAwaitingApproval: async () => [],
        listServiceRequests: async () => [water],
      }),
    );
    await within(await rail()).findByText('asks for water');

    await user.click(screen.getByRole('button', { name: /^Kitchen/u }));
    expect(
      await screen.findByRole('button', { name: 'Floor, 1 waiting on the floor' }),
    ).toBeTruthy();
  });

  it('keeps a half-typed decline across a trip to the kitchen', async () => {
    signIn();
    const user = setupUser();
    renderFloor(gatewayWith());

    const bookings = await within(await rail()).findByRole('region', {
      name: 'Bookings to approve',
    });
    const card = (await within(bookings).findByText(/^Table 7\b/u)).closest('li')!;
    await user.click(within(card).getByRole('button', { name: 'Decline' }));
    await user.type(within(card).getByLabelText('Reason (optional)'), 'Kitchen closes at 22');

    await user.click(screen.getByRole('button', { name: /^Kitchen/u }));
    await user.click(screen.getByRole('button', { name: /^Floor/u }));

    const again = (await screen.findByText(/^Table 7\b/u)).closest('li')!;
    expect((within(again).getByLabelText('Reason (optional)') as HTMLTextAreaElement).value).toBe(
      'Kitchen closes at 22',
    );
  });

  it('keeps the floor it had behind the PIN gate, with no error under it', async () => {
    signIn();
    const user = setupUser();
    renderFloor(gatewayWith());

    await screen.findByRole('button', { name: /^Table 2, /u });
    await user.click(screen.getByRole('button', { name: /^Sona Vardanyan · /u }));
    expect(await screen.findByText('Tap your PIN')).toBeTruthy();

    const floor = document.querySelector('.ft-floor')!;
    expect(floor.querySelectorAll('.table-row').length).toBeGreaterThan(0);
    expect(floor.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows no notice over the PIN gate', async () => {
    signIn();
    const user = setupUser();
    renderFloor(gatewayWith({ listServiceRequests: async () => [water] }));

    const item = (await within(await rail()).findByText('asks for water')).closest('li')!;
    await user.click(within(item).getByRole('button', { name: 'On my way' }));
    expect(await screen.findByText('Table 5 · the guest can see you are coming')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^Sona Vardanyan · /u }));
    expect(await screen.findByText('Tap your PIN')).toBeTruthy();
    expect(screen.queryByText('Table 5 · the guest can see you are coming')).toBeNull();
  });

  it('brings the PIN gate up from the person button', async () => {
    signIn();
    const user = setupUser();
    renderFloor(gatewayWith());

    await user.click(await screen.findByRole('button', { name: /^Sona Vardanyan · /u }));
    expect(await screen.findByText('Tap your PIN')).toBeTruthy();
  });
});

describe('the table panel (Table artboard)', () => {
  it('takes the rail’s place with the chosen card still marked, and says what it did', async () => {
    signIn();
    const user = setupUser();
    renderFloor(gatewayWith());

    const card = await screen.findByRole('button', { name: /^Table 2, 2 seats, Free/u });
    await rail();
    await user.click(card);
    const panel = await screen.findByRole('dialog', { name: 'Actions for table 2' });
    expect(card.getAttribute('aria-pressed')).toBe('true');
    // Kept mounted under the panel, out of sight and out of the reading order.
    expect(screen.queryByRole('complementary', { name: 'Needs attention' })).toBeNull();

    await user.click(within(panel).getByRole('button', { name: 'Hold for a late party' }));
    expect(await screen.findByText('Table 2 is held for the late party')).toBeTruthy();
    expect(await rail()).toBeTruthy();
  });

  it('starts afresh on another table: no question carried over from the last (review S1)', async () => {
    signIn();
    const user = setupUser();
    renderFloor(gatewayWith());

    await user.click(await screen.findByRole('button', { name: /^Table 1, 2 seats, Occupied/u }));
    const first = await screen.findByRole('dialog', { name: 'Actions for table 1' });
    await user.click(within(first).getByRole('button', { name: 'Free the table' }));
    expect(screen.getByRole('group', { name: 'Free table 1?' })).toBeTruthy();

    // The dimmed floor still takes a tap: another occupied table.
    await user.click(screen.getByRole('button', { name: /^Table 7, 4 seats, Occupied/u }));
    const second = await screen.findByRole('dialog', { name: 'Actions for table 7' });
    expect(within(second).queryByRole('group', { name: /^Free table/u })).toBeNull();
    expect(within(second).getByRole('button', { name: 'Free the table' })).toBeTruthy();
  });

  it('still says a booking answer failed while a table panel hides the rail (review S8)', async () => {
    signIn();
    const user = setupUser();
    let fail: (error: Error) => void = () => undefined;
    renderFloor(
      gatewayWith({
        approveReservation: () =>
          new Promise((_, reject) => {
            fail = reject;
          }),
      }),
    );

    const approvals = await within(await rail()).findByRole('region', {
      name: /bookings to approve/iu,
    });
    await user.click((await within(approvals).findAllByRole('button', { name: 'Approve' }))[0]!);
    await user.click(screen.getByRole('button', { name: /^Table 2, 2 seats, Free/u }));
    await screen.findByRole('dialog', { name: 'Actions for table 2' });

    await act(async () => fail(new Error('socket hang up')));
    expect(await screen.findByText(/That did not go through\. Try again\.$/u)).toBeTruthy();
  });

  it('says when a booking is due if the server refuses a no-show before its start', async () => {
    signIn();
    const user = setupUser();
    renderFloor(
      gatewayWith({
        releaseReservation: async () => {
          throw new ReservationNotStartedError({
            url: '/api/reservations/r/release',
            startUtc: new Date(Date.now() + 40 * 60_000).toISOString(),
          });
        },
      }),
    );

    await user.click(await screen.findByRole('button', { name: /^Table 6, /u }));
    const panel = await screen.findByRole('dialog', { name: 'Actions for table 6' });
    await user.click(within(panel).getByRole('button', { name: 'Release the booking' }));
    await user.click(within(panel).getByRole('button', { name: /They didn't come/u }));
    await user.click(within(panel).getByRole('button', { name: 'Release' }));
    expect(
      await screen.findByText(/^Table 6 · not due until \d\d:\d\d\. Nothing was released\.$/u),
    ).toBeTruthy();
  });

  it('says an action taken offline waits for the connection', async () => {
    signIn();
    const user = setupUser();
    renderFloor(gatewayWith());

    await user.click(await screen.findByRole('button', { name: /^Table 2, 2 seats, Free/u }));
    const panel = await screen.findByRole('dialog', { name: 'Actions for table 2' });
    act(() => setOnline(false));
    await user.click(within(panel).getByRole('button', { name: 'Out of service' }));
    expect(
      await screen.findByText('Table 2 is out of service · sent when the connection returns'),
    ).toBeTruthy();
  });

  it('takes cash from the panel on the tab’s own keypad', async () => {
    signIn();
    const user = setupUser();
    renderFloor(gatewayWith());

    await user.click(await screen.findByRole('button', { name: /^Table 1, 2 seats, Occupied/u }));
    const panel = await screen.findByRole('dialog', { name: 'Actions for table 1' });
    await user.click(await within(panel).findByRole('button', { name: /^Take cash/u }));

    expect(await screen.findByRole('dialog', { name: 'Take cash' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: /tab/iu })).toBeTruthy();
  });
});

describe('the table grid', () => {
  it('says every state in words on the card, with the state on its edge as well', async () => {
    signIn();
    renderFloor(gatewayWith());

    const card = async (name: RegExp) => screen.findByRole('button', { name });
    const free = await card(/^Table 2, 2 seats, Free/u);
    expect(within(free).getByText('Free')).toBeTruthy();
    expect(free.getAttribute('data-tone')).toBe('free');

    const held = await card(/^Table 3, 4 seats, Held/u);
    expect(within(held).getByText('Held · running late')).toBeTruthy();
    expect(held.getAttribute('data-tone')).toBe('held');

    // The mock's table 6 booking is twenty minutes past, with nobody seated:
    // said as late, in words and in amber, not as one still to come.
    const booked = await card(/^Table 6, 4 seats, Reserved, Late · booked \d\d:\d\d/u);
    expect(within(booked).getByText(/^Late · booked \d\d:\d\d$/u)).toBeTruthy();
    expect(booked.getAttribute('data-tone')).toBe('booked');
    expect(booked.getAttribute('data-late')).toBe('true');

    const occupied = await card(/^Table 1, 2 seats, Occupied/u);
    expect(within(occupied).getByText(/^(?:Seated \d+ min(?: · long)?|Occupied)$/u)).toBeTruthy();
    expect(occupied.getAttribute('data-tone')).toBe('occupied');

    const out = await card(/^Table 10, 2 seats, Out of service/u);
    expect(within(out).getByText('Out of service')).toBeTruthy();
    expect(out.getAttribute('data-tone')).toBe('out');

    // Seats in words on the card too, and the room in the name.
    expect(within(free).getByText('2 seats')).toBeTruthy();
    expect(free.getAttribute('aria-label')).toMatch(/, Bar$/u);
  });

  it('filters by room with the chips, in room order and then by label', async () => {
    signIn();
    const user = setupUser();
    renderFloor(gatewayWith());

    const rooms = await screen.findByRole('group', { name: 'Rooms' });
    const all = within(rooms).getByRole('button', { name: 'All · 11' });
    expect(all.getAttribute('aria-pressed')).toBe('true');
    expect(tableButtons()).toEqual(['1', '2', '3', '4', '9', '10', '11', '5', '6', '7', '8']);

    const windows = within(rooms).getByRole('button', { name: 'Windows' });
    await user.click(windows);
    expect(windows.getAttribute('aria-pressed')).toBe('true');
    expect(all.getAttribute('aria-pressed')).toBe('false');
    expect(tableButtons()).toEqual(['5', '6', '7', '8']);

    await user.click(within(rooms).getByRole('button', { name: 'Bar' }));
    expect(tableButtons()).toEqual(['1', '2', '3', '4', '9', '10', '11']);
  });

  it('keys all five states in the legend', async () => {
    signIn();
    renderFloor(gatewayWith());

    const legend = await screen.findByRole('list', { name: 'What the colours mean' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Free', 'Reserved', 'Held', 'Occupied', 'Out of service']);
  });
});

describe('the "Now" rail', () => {
  it('lists bookings to approve, calls and ready orders, in that order, each with its empty state', async () => {
    signIn();
    renderFloor(
      gatewayWith({ listOrderQueue: async () => [], listServiceRequests: async () => [] }),
    );

    const aside = await rail();
    expect(within(aside).getByRole('heading', { name: 'Now' })).toBeTruthy();
    const sections = await waitFor(() => {
      const found = within(aside)
        .getAllByRole('region')
        .map((region) => region.getAttribute('aria-label') ?? labelOf(region));
      expect(found).toEqual(['Bookings to approve', 'Waiting for a waiter', 'Ready to serve']);
      return found;
    });
    expect(sections).toHaveLength(3);
    expect(await within(aside).findByText('Nobody is waiting.')).toBeTruthy();
    expect(await within(aside).findByText('Nothing is ready.')).toBeTruthy();
    // No section for what needs resolving until something does.
    expect(within(aside).queryByRole('region', { name: 'Needs resolving' })).toBeNull();
  });

  it('says when no booking is waiting for an answer', async () => {
    signIn();
    renderFloor(gatewayWith({ listAwaitingApproval: async () => [] }));
    const section = await within(await rail()).findByRole('region', {
      name: 'Bookings to approve',
    });
    expect(await within(section).findByText('No bookings are waiting for an answer.')).toBeTruthy();
  });

  it('acknowledges a call with "On my way", and says so', async () => {
    signIn();
    const user = setupUser();
    const gateway = gatewayWith({ listServiceRequests: async () => [water] });
    const acknowledge = vi.spyOn(gateway, 'acknowledgeServiceRequest');
    renderFloor(gateway);

    const calls = await within(await rail()).findByRole('region', { name: 'Waiting for a waiter' });
    const item = (await within(calls).findByText('asks for water')).closest('li')!;
    expect(within(item).getByText('Table 5')).toBeTruthy();
    expect(within(item).getByText('1 min')).toBeTruthy();
    await user.click(within(item).getByRole('button', { name: 'On my way' }));

    await waitFor(() =>
      expect(acknowledge).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'sr-water' })),
    );
    expect(await screen.findByText('Table 5 · the guest can see you are coming')).toBeTruthy();
  });

  it('does not claim the guest saw "On my way" while it waits for the connection', async () => {
    signIn();
    const user = setupUser();
    renderFloor(gatewayWith({ listServiceRequests: async () => [water] }));

    const item = (await within(await rail()).findByText('asks for water')).closest('li')!;
    act(() => setOnline(false));
    await user.click(within(item).getByRole('button', { name: 'On my way' }));

    expect(
      await screen.findByText('Table 5 · saved; the guest sees it when the connection returns'),
    ).toBeTruthy();
    expect(screen.queryByText('Table 5 · the guest can see you are coming')).toBeNull();
  });

  it('serves a ready order from the rail, and leaves orders still cooking off it', async () => {
    signIn();
    const user = setupUser();
    const gateway = gatewayWith({
      listOrderQueue: async () => [order('ready'), order('inKitchen', { tableLabel: '9' })],
    });
    const setStatus = vi.spyOn(gateway, 'setOrderStatus');
    renderFloor(gateway);

    const ready = await within(await rail()).findByRole('region', { name: 'Ready to serve' });
    const item = (await within(ready).findByText('Table 4')).closest('li')!;
    expect(within(item).getByText('3 dishes')).toBeTruthy();
    expect(within(await rail()).queryByText('Table 9')).toBeNull();

    await user.click(within(item).getByRole('button', { name: 'Mark served' }));
    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'o-ready', status: 'served' }),
      ),
    );
    expect(await screen.findByText('Table 4 · served')).toBeTruthy();
  });

  it('keeps an order nobody has sent to the kitchen on the rail, with the send', async () => {
    signIn();
    const user = setupUser();
    const gateway = gatewayWith({ listOrderQueue: async () => [order('new')] });
    const setStatus = vi.spyOn(gateway, 'setOrderStatus');
    renderFloor(gateway);

    const toSend = await within(await rail()).findByRole('region', {
      name: 'Not sent to the kitchen',
    });
    await user.click(within(toSend).getByRole('button', { name: 'Send to the kitchen' }));
    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'o-new', status: 'inKitchen' }),
      ),
    );
  });

  it('lists a table freed with money owed under "Needs resolving", with the way to take it', async () => {
    signIn();
    const user = setupUser();
    renderFloor(gatewayWith());

    await user.click(await screen.findByRole('button', { name: /^Table 1, 2 seats, Occupied/u }));
    const panel = await screen.findByRole('dialog', { name: 'Actions for table 1' });
    await user.click(within(panel).getByRole('button', { name: 'Free the table' }));
    await user.click(await within(panel).findByRole('button', { name: 'Free it' }));

    const resolve = await within(await rail()).findByRole('region', { name: 'Needs resolving' });
    // Folded at first, as on the artboard, with its count on the heading.
    const toggle = within(resolve).getByRole('button', { name: /^Needs resolving 1$/u });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(resolve).getByText('Table 1')).toBeTruthy();
    expect(within(resolve).getByText(/^freed with .+ owed$/u)).toBeTruthy();
    // The card on the floor says so too.
    expect(
      within(screen.getByRole('button', { name: /^Table 1, 2 seats, Free/u })).getByText(
        /still owed$/u,
      ),
    ).toBeTruthy();

    await user.click(within(resolve).getByRole('button', { name: 'Take payment' }));
    expect(await screen.findByRole('dialog', { name: /tab/iu })).toBeTruthy();
  });
});

/** A region's name from `aria-labelledby`, which `getAttribute` does not resolve. */
function labelOf(region: HTMLElement): string | null {
  const id = region.getAttribute('aria-labelledby');
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
}
