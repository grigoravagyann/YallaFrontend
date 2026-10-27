// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  FULL_FEATURES,
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type Menu,
  type OrderQueueEntry,
  type StaffGateway,
  type StaffSessionSnapshot,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { resetCommandStore } from './testCommandStore';
import type * as CurrentUserModule from '../auth/useCurrentUser';
import type * as MenuCacheModule from '../offline/menuCache';

/**
 * The kitchen board as the redesign draws it (floor-tablet HANDOFF §2, the
 * Kitchen artboard): counts of new, waiting and late over a horizontal board
 * of tickets, sorted by wait or by table, each saying who sent it, with notes
 * and allergen warnings per line and one action — Ready. The same board is the
 * waiter's Kitchen tab.
 *
 * Through the real `StaffRoute`, with the session, the chime and the gateway's
 * order reads as the only doubles.
 */

const snapshot = vi.hoisted(() => ({ current: null as unknown }));
const chime = vi.hoisted(() => ({ played: 0 }));

vi.mock('../offline/commandStore', async (importOriginal) =>
  (await import('./testCommandStore')).withMemoryStore(await importOriginal()),
);
// No menu on disk: each test reads the menu from the gateway, so a re-read is countable.
vi.mock('../offline/menuCache', async (importOriginal) => ({
  ...(await importOriginal<typeof MenuCacheModule>()),
  menuCache: { read: async () => null, write: async () => undefined },
}));
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
vi.mock('./chime', () => ({
  primeChime: () => undefined,
  playChime: async () => {
    chime.played += 1;
    return true;
  },
}));

const { StaffRoute } = await import('./StaffRoute');

const BRANCH = 'b1';

const device: EnrolledDevice = {
  deviceId: 'd1',
  deviceName: 'Pass',
  branchId: BRANCH,
  branchName: 'Lumen North',
  venueName: 'Lumen',
  enrolledAtUtc: '2026-09-01T00:00:00Z',
  lastSeenAtUtc: null,
};

function signIn(role: 'kitchen' | 'waiter'): void {
  snapshot.current = {
    state: 'signedIn',
    device,
    identity: {
      staffMemberId: 's1',
      fullName: 'Sona Vardanyan',
      role,
      branchId: BRANCH,
      features: FULL_FEATURES,
    },
    lastSignOut: null,
  } satisfies StaffSessionSnapshot;
}

/** 14:28 UTC is 18:28 in Yerevan, the time the ticket says it was sent. */
function ticket(orderId: string, overrides: Partial<OrderQueueEntry> = {}): OrderQueueEntry {
  return {
    orderId,
    tabId: `tab-${orderId}`,
    tableLabel: orderId.replace(/\D/gu, '') || '1',
    status: 'inKitchen',
    placedAtUtc: '2026-10-19T14:28:00Z',
    estimatedReadyAtUtc: null,
    waitingMinutes: 3,
    lines: [
      { lineId: `${orderId}-l1`, menuItemId: 'steak', name: 'Steak', quantity: 2, note: null },
    ],
    placedByName: 'Narek Hakobyan',
    ...overrides,
  };
}

const menu: Menu = {
  branchId: BRANCH,
  updatedAtUtc: '2026-10-19T14:00:00Z',
  sections: [
    {
      id: 'mains',
      name: 'Mains',
      items: [
        {
          id: 'steak',
          name: 'Steak',
          description: null,
          priceDram: 9800,
          isAvailable: true,
          allergens: 'none',
        },
        {
          id: 'trout',
          name: 'Trout',
          description: null,
          priceDram: 7200,
          isAvailable: true,
          allergens: 'fish',
        },
      ],
    },
  ],
};

/** The real staff mock, with the order queue a test controls and every move recorded. */
function boardGateway(initial: readonly OrderQueueEntry[]) {
  const base = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
  const state = { orders: [...initial] };
  const moves: Parameters<StaffGateway['setOrderStatus']>[0][] = [];
  const menuReads = { count: 0 };
  const gateway: StaffGateway = {
    ...base,
    getMenu: async () => {
      menuReads.count += 1;
      return menu;
    },
    listOrderQueue: async () => state.orders,
    setOrderStatus: async (command) => {
      moves.push(command);
      const moved = state.orders.find((order) => order.orderId === command.orderId)!;
      state.orders = state.orders.map((order) =>
        order.orderId === command.orderId ? { ...order, status: command.status } : order,
      );
      return { ...moved, status: command.status };
    },
  };
  return { gateway, state, moves, menuReads };
}

function renderStaff(gateway: StaffGateway): QueryClient {
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
  return queryClient;
}

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

const setupUser = () => userEvent.setup({ delay: null });

/** The tickets on the board, left to right, by their accessible names. */
async function tickets(): Promise<HTMLElement[]> {
  const board = await screen.findByRole('list', { name: 'Orders in the kitchen' });
  // The tickets, not the dishes listed inside each one.
  const named = () => within(board).queryAllByRole('listitem', { name: /^Table /u });
  await waitFor(() => expect(named().length).toBeGreaterThan(0));
  return named();
}

function ticketFor(label: string): HTMLElement {
  const board = screen.getByRole('list', { name: 'Orders in the kitchen' });
  return within(board).getByRole('listitem', { name: new RegExp(`^Table ${label},`, 'u') });
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
  act(() => setOnline(true));
  cleanup();
  resetCommandStore();
  chime.played = 0;
});

describe('the counts over the board', () => {
  it('counts new, waiting and late among the tickets still cooking, and says late in words', async () => {
    const { gateway } = boardGateway([
      ticket('o1', { waitingMinutes: 2 }),
      ticket('o2', { waitingMinutes: 8 }),
      ticket('o3', { waitingMinutes: 14 }),
      ticket('o5', { waitingMinutes: 20, status: 'ready' }),
    ]);
    signIn('kitchen');
    renderStaff(gateway);

    await tickets();
    const counts = screen.getByRole('group', { name: 'Orders by wait' });
    expect(within(counts).getByText('1 new')).toBeTruthy();
    expect(within(counts).getByText('1 waiting')).toBeTruthy();
    expect(within(counts).getByText('1 running late')).toBeTruthy();

    // Late is said, not only painted: "14 min · late", and in the ticket's name.
    expect(within(ticketFor('3')).getByRole('timer').textContent).toBe('14 min · late');
    expect(ticketFor('3').getAttribute('aria-label')).toBe(
      'Table 3, 14 minutes, running late, 2 Steak',
    );
    expect(within(ticketFor('2')).getByRole('timer').textContent).toBe('8 min');
  });
});

describe('a ticket its waiter has not sent (live QA 1)', () => {
  it('is never late or red, not counted, and says it waits for its waiter', async () => {
    const { gateway } = boardGateway([
      ticket('o2', { waitingMinutes: 3 }),
      ticket('o7', { waitingMinutes: 114, status: 'new' }),
    ]);
    signIn('kitchen');
    renderStaff(gateway);

    await tickets();
    const counts = screen.getByRole('group', { name: 'Orders by wait' });
    expect(within(counts).getByText('0 running late')).toBeTruthy();
    expect(within(counts).getByText('1 new')).toBeTruthy();
    const unsent = ticketFor('7');
    expect(within(unsent).getByRole('timer').textContent).toBe('114 min');
    expect(unsent.getAttribute('aria-label')).toBe('Table 7, 114 minutes, not sent yet, 2 Steak');
    expect(unsent.className).not.toMatch(/is-late/u);
  });
});

describe('the order of the board', () => {
  it('puts the oldest on the left, ready last, and sorts by table on request', async () => {
    const { gateway } = boardGateway([
      ticket('o12', { waitingMinutes: 1 }),
      ticket('o2', { waitingMinutes: 30, status: 'ready' }),
      ticket('o9', { waitingMinutes: 14 }),
      ticket('o3', { waitingMinutes: 5 }),
    ]);
    signIn('kitchen');
    renderStaff(gateway);
    const user = setupUser();

    const labels = async () =>
      (await tickets()).map((item) => /^Table (\w+),/u.exec(item.getAttribute('aria-label')!)?.[1]);

    expect(await labels()).toEqual(['9', '3', '12', '2']);
    const byWait = screen.getByRole('button', { name: 'By wait' });
    expect(byWait.getAttribute('aria-pressed')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'By table' }));
    expect(await labels()).toEqual(['2', '3', '9', '12']);
    expect(screen.getByRole('button', { name: 'By table' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(byWait.getAttribute('aria-pressed')).toBe('false');
  });

  it('says how many are off to the right when there are more than four', async () => {
    const { gateway } = boardGateway(
      ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'].map((id, index) =>
        ticket(id, { waitingMinutes: 10 - index }),
      ),
    );
    signIn('kitchen');
    renderStaff(gateway);

    await tickets();
    expect(
      screen.getByText('Late after 12 minutes. Oldest on the left, 2 more to the right — swipe.'),
    ).toBeTruthy();
  });

  it('says they are all showing when four or fewer are', async () => {
    const { gateway } = boardGateway([ticket('o1'), ticket('o2')]);
    signIn('kitchen');
    renderStaff(gateway);

    await tickets();
    expect(
      screen.getByText('Late after 12 minutes. Oldest on the left, all of them are showing.'),
    ).toBeTruthy();
  });
});

describe('a ticket', () => {
  it('says when it was sent and by whom, or that it came from the app', async () => {
    const { gateway } = boardGateway([
      ticket('o4', { waitingMinutes: 4 }),
      ticket('o8', { waitingMinutes: 3, placedByName: null }),
    ]);
    signIn('kitchen');
    renderStaff(gateway);

    await tickets();
    expect(within(ticketFor('4')).getByText('18:28 · Narek')).toBeTruthy();
    expect(within(ticketFor('8')).getByText('18:28 · From the app')).toBeTruthy();
  });

  it("carries each line's note, and warns of the dish's allergens", async () => {
    const { gateway } = boardGateway([
      ticket('o4', {
        lines: [
          { lineId: 'a', menuItemId: 'trout', name: 'Trout', quantity: 1, note: 'No lemon' },
          { lineId: 'b', menuItemId: 'steak', name: 'Steak', quantity: 2, note: null },
        ],
      }),
    ]);
    signIn('kitchen');
    renderStaff(gateway);

    await tickets();
    const card = ticketFor('4');
    const [trout, steak] = within(card).getAllByRole('listitem');
    expect(within(trout!).getByText('No lemon')).toBeTruthy();
    // The warning is words: "Allergens: Fish", with the sign for the eye.
    expect(within(trout!).getByText(/Fish/u).textContent).toBe('Allergens: Fish');
    // A dish the venue said has none carries no warning at all.
    expect(within(steak!).queryByText(/Allergens/u)).toBeNull();
  });

  it('says to check, and reads the menu again, for a dish the menu does not have (review S4)', async () => {
    const { gateway, menuReads } = boardGateway([
      ticket('o4', {
        lines: [{ lineId: 'a', menuItemId: 'new-dish', name: 'Harissa', quantity: 1, note: null }],
      }),
    ]);
    signIn('kitchen');
    renderStaff(gateway);

    await tickets();
    const [line] = within(ticketFor('4')).getAllByRole('listitem');
    expect(within(line!).getByText('Allergens: check before plating')).toBeTruthy();
    await waitFor(() => expect(menuReads.count).toBeGreaterThan(1));
  });

  it('offers the kitchen one action, Ready, and only on what is cooking', async () => {
    const { gateway } = boardGateway([
      ticket('o4', { waitingMinutes: 6 }),
      ticket('o5', { waitingMinutes: 3, status: 'new' }),
      ticket('o6', { waitingMinutes: 9, status: 'ready' }),
    ]);
    signIn('kitchen');
    renderStaff(gateway);

    await tickets();
    expect(
      within(ticketFor('4'))
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Ready · table 4']);
    expect(within(ticketFor('5')).queryAllByRole('button')).toEqual([]);
    expect(
      within(ticketFor('5')).getByText('Not sent to the kitchen yet: waiting for its waiter'),
    ).toBeTruthy();
    expect(within(ticketFor('6')).queryAllByRole('button')).toEqual([]);
    expect(within(ticketFor('6')).getByText('Ready · waiting for the waiter')).toBeTruthy();
    expect(within(ticketFor('6')).getByText('The waiter marks it served')).toBeTruthy();
  });

  it('moves a ticket to ready, and says the waiter can see it', async () => {
    const { gateway, moves } = boardGateway([ticket('o4')]);
    signIn('kitchen');
    renderStaff(gateway);
    const user = setupUser();

    await tickets();
    await user.click(within(ticketFor('4')).getByRole('button', { name: 'Ready · table 4' }));

    await waitFor(() =>
      expect(moves).toEqual([expect.objectContaining({ orderId: 'o4', status: 'ready' })]),
    );
    expect(await screen.findByText('Table 4 · ready, the waiter can see it')).toBeTruthy();
  });

  it('offline: the ticket moves and says it is not sent, so it is never tapped twice', async () => {
    const { gateway, moves } = boardGateway([ticket('o4')]);
    signIn('kitchen');
    renderStaff(gateway);
    const user = setupUser();

    await tickets();
    act(() => setOnline(false));
    await user.click(within(ticketFor('4')).getByRole('button', { name: 'Ready · table 4' }));

    expect(
      await screen.findByText('Table 4 · ready · it will be sent when the connection is back'),
    ).toBeTruthy();
    expect(within(ticketFor('4')).queryAllByRole('button')).toEqual([]);
    expect(within(ticketFor('4')).getByText('not sent')).toBeTruthy();
    expect(moves).toEqual([]);

    act(() => setOnline(true));
    await waitFor(() => expect(moves).toHaveLength(1));
  });
});

describe('the sound', () => {
  it('chimes once when new tickets reach the kitchen, never for what was there already', async () => {
    const { gateway, state } = boardGateway([ticket('o4')]);
    signIn('kitchen');
    const queryClient = renderStaff(gateway);

    await tickets();
    expect(chime.played).toBe(0);

    // Two arrive in the same read: one chime, not two. A ticket nobody has
    // sent yet is not the kitchen's to cook.
    state.orders = [...state.orders, ticket('o5'), ticket('o6'), ticket('o7', { status: 'new' })];
    await act(() => queryClient.refetchQueries());
    await waitFor(() => expect(ticketFor('6')).toBeTruthy());
    await waitFor(() => expect(chime.played).toBe(1));

    // Sent on to the kitchen later: that is an arrival too.
    state.orders = state.orders.map((order) =>
      order.orderId === 'o7' ? { ...order, status: 'inKitchen' } : order,
    );
    await act(() => queryClient.refetchQueries());
    await waitFor(() => expect(chime.played).toBe(2));

    // The same board again: nothing new, no sound.
    await act(() => queryClient.refetchQueries());
    expect(chime.played).toBe(2);
  });

  it("is the kitchen tablet's: the waiter's Kitchen tab stays quiet", async () => {
    const { gateway, state } = boardGateway([ticket('o4')]);
    signIn('waiter');
    const queryClient = renderStaff(gateway);
    const user = setupUser();

    await user.click(await screen.findByRole('button', { name: /^Kitchen/u }));
    await tickets();
    state.orders = [...state.orders, ticket('o5')];
    await act(() => queryClient.refetchQueries());
    await waitFor(() => expect(ticketFor('5')).toBeTruthy());
    expect(chime.played).toBe(0);
  });
});

describe("the waiter's Kitchen tab", () => {
  it('is the same board, with Ready, a send for what is still new, and serving left to the floor', async () => {
    const { gateway, moves } = boardGateway([
      ticket('o4', { waitingMinutes: 6 }),
      ticket('o5', { waitingMinutes: 3, status: 'new' }),
      ticket('o6', { waitingMinutes: 9, status: 'ready' }),
    ]);
    signIn('waiter');
    renderStaff(gateway);
    const user = setupUser();

    await user.click(await screen.findByRole('button', { name: /^Kitchen/u }));
    await tickets();

    expect(within(ticketFor('4')).getByRole('button', { name: 'Ready · table 4' })).toBeTruthy();
    expect(within(ticketFor('6')).queryAllByRole('button')).toEqual([]);
    expect(
      within(ticketFor('6')).getByText("Mark it served from the floor's Now list"),
    ).toBeTruthy();

    await user.click(
      within(ticketFor('5')).getByRole('button', { name: 'Send to the kitchen · table 5' }),
    );
    await waitFor(() =>
      expect(moves).toEqual([expect.objectContaining({ orderId: 'o5', status: 'inKitchen' })]),
    );
  });
});
