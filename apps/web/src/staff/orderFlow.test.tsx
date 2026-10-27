// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  FULL_FEATURES,
  OrderGuestUnavailableError,
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type StaffGateway,
  type StaffSessionSnapshot,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { resetCommandStore } from './testCommandStore';
import type * as CurrentUserModule from '../auth/useCurrentUser';

/**
 * An order from the table to the kitchen, through the real `StaffRoute`, the
 * command queue and the staff mock (floor-tablet `Order`, gap 3): one send is
 * one order with each line's own guest; offline it is kept and says so; a
 * refusal says what went wrong instead of looking like a race.
 */

const snapshot = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../offline/commandStore', async (importOriginal) =>
  (await import('./testCommandStore')).withMemoryStore(await importOriginal()),
);
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

function signIn(): void {
  snapshot.current = {
    state: 'signedIn',
    device,
    identity: {
      staffMemberId: 's1',
      fullName: 'Sona Vardanyan',
      role: 'waiter',
      branchId: BRANCH,
      features: FULL_FEATURES,
    },
    lastSignOut: null,
  } satisfies StaffSessionSnapshot;
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

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

/** Table 1 has the seeded tab: Anahit (host) and Karen. */
async function openOrder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Table 1, /u }));
  const panel = await screen.findByRole('dialog', { name: 'Actions for table 1' });
  await user.click(await within(panel).findByRole('button', { name: 'Take an order' }));
  const order = await screen.findByRole('dialog', { name: 'Order · table 1' });
  const menu = within(order).getByRole('region', { name: 'Menu' });
  const draft = within(order).getByRole('complementary', { name: 'This order' });
  const tile = async (name: string) =>
    within(menu).findByRole('button', { name: new RegExp(`^${name},`, 'u') });
  const category = (name: RegExp) =>
    within(within(order).getByRole('navigation', { name: 'Categories' })).getByRole('button', {
      name,
    });
  return { order, draft, tile, category };
}

/** A cappuccino for the table and a gata for Karen. */
async function buildRound(user: ReturnType<typeof userEvent.setup>) {
  const opened = await openOrder(user);
  await user.click(await opened.tile('Cappuccino'));
  await user.click(opened.category(/^Pastry,/u));
  await user.click(await opened.tile('Gata'));
  const gata = within(opened.draft).getAllByRole('listitem')[1]!;
  await user.click(
    within(within(gata).getByRole('group', { name: 'Who it is for' })).getByRole('button', {
      name: 'Karen',
    }),
  );
  return opened;
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
  vi.restoreAllMocks();
  resetCommandStore();
});

describe('a round for the table and a guest', () => {
  it('goes as one order, each line with its own guest, and says when the kitchen has it', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const tab = (await gateway.getStaffTab(
      (await gateway.getFloor(BRANCH))!.details.find((detail) => detail.label === '1')!.openTabId!,
    ))!;
    const karen = tab.participants.find((person) => person.displayName === 'Karen')!;
    const place = vi.spyOn(gateway, 'placeOrder');
    const user = userEvent.setup({ delay: null });
    renderFloor(gateway);

    const { order, draft } = await buildRound(user);
    await user.click(within(draft).getByRole('button', { name: 'Send 2 dishes' }));

    await waitFor(() => expect(place).toHaveBeenCalledTimes(1));
    expect(place.mock.calls[0]![0].lines).toEqual([
      { menuItemId: 'cappuccino', quantity: 1, isShared: true, participantId: null },
      { menuItemId: 'gata', quantity: 1, isShared: false, participantId: karen.id },
    ]);
    expect(await within(order).findByRole('dialog', { name: '2 dishes sent' })).toBeTruthy();
  });
});

describe('an order taken offline', () => {
  it('is kept on the tablet, says so, and lands when the connection returns', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const place = vi.spyOn(gateway, 'placeOrder');
    const user = userEvent.setup({ delay: null });
    renderFloor(gateway);

    const { order, draft } = await buildRound(user);
    act(() => setOnline(false));
    expect(await within(order).findByText('Offline · the order will be kept')).toBeTruthy();
    await user.click(within(draft).getByRole('button', { name: 'Send 2 dishes' }));

    expect(await within(order).findByRole('dialog', { name: '2 dishes saved' })).toBeTruthy();
    expect(place).not.toHaveBeenCalled();

    act(() => setOnline(true));
    expect(await within(order).findByRole('dialog', { name: '2 dishes sent' })).toBeTruthy();
    expect(place).toHaveBeenCalledTimes(1);
  });
});

describe('an order the server refuses for a guest', () => {
  it('says the guest cannot be named, not that somebody got to the table first', async () => {
    signIn();
    const gateway = createStaffMockGateway({ latencyMs: 0, branchId: BRANCH });
    const tab = (await gateway.getStaffTab(
      (await gateway.getFloor(BRANCH))!.details.find((detail) => detail.label === '1')!.openTabId!,
    ))!;
    const karen = tab.participants.find((person) => person.displayName === 'Karen')!;
    // The host took Karen off while the order was being keyed in.
    vi.spyOn(gateway, 'placeOrder').mockRejectedValue(
      new OrderGuestUnavailableError({
        url: '/api/tabs/x/staff-orders',
        status: 409,
        participantId: karen.id,
        guestState: 'removed',
        field: 'items[1].participantId',
      }),
    );
    const user = userEvent.setup({ delay: null });
    renderFloor(gateway);

    const { order, draft } = await buildRound(user);
    await user.click(within(draft).getByRole('button', { name: 'Send 2 dishes' }));

    const card = await within(order).findByRole('dialog', { name: 'The order was not taken' });
    expect(within(card).getByText('Karen was taken off the tab. Nothing was sent.')).toBeTruthy();
    // Back to the draft, Karen's line moved back to the table and flagged.
    await user.click(within(card).getByRole('button', { name: 'Back to the order' }));
    const lines = within(draft).getAllByRole('listitem');
    expect(lines).toHaveLength(2);
    expect(within(lines[1]!).getByText('Karen is no longer on the tab.')).toBeTruthy();
    expect(screen.queryByText(/got there first|changed it first/iu)).toBeNull();
  });
});
