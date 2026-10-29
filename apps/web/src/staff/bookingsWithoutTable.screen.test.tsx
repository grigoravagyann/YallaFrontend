// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  FULL_FEATURES,
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type StaffGateway,
  type StaffMockOptions,
  type StaffWithoutTableSeed,
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
 * Booking by time only at the door (2026-10-29).
 *
 * A branch that books by time only takes a time, a party and a wish, and no
 * table. Such a booking is on no table's tile, so the rail lists it — time,
 * party, name and the wish first — until a waiter taps Seat, chooses one of
 * the free tables (those that fit first, with their seats) and the booking is
 * seated there through the queue, as any seat is — or lets it go, a no-show
 * or a cancellation, with no table to free. One made that way and still
 * waiting for the floor's yes says it has no table yet.
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

vi.mock('../offline/commandStore', async (importOriginal) =>
  (await import('./testCommandStore')).withMemoryStore(await importOriginal()),
);
vi.mock('./auth/staffSession', () => ({
  staffAuthAvailable: true,
  staffSession: {
    restore: async () => undefined,
    refreshDevice: async () => undefined,
    roster: async () => [],
    signOut: async () => undefined,
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
vi.mock('./chime', () => ({ primeChime: () => undefined, playChime: async () => true }));

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
  session.set({
    state: 'signedIn',
    device,
    identity: {
      staffMemberId: 's1',
      fullName: 'Sona Vardanyan',
      role: 'manager',
      branchId: BRANCH,
      features: FULL_FEATURES,
    },
    lastSignOut: null,
  } satisfies StaffSessionSnapshot);
}

const SEEDS: readonly StaffWithoutTableSeed[] = [
  { id: 'res-t1', guestName: 'Narek G.', partySize: 2, startsInMinutes: 10, note: 'By the window' },
  { id: 'res-t2', guestName: 'Lilit S.', partySize: 6, startsInMinutes: 40 },
  // Five hours away: not at the door yet.
  { id: 'res-t3', guestName: 'Gor H.', partySize: 2, startsInMinutes: 300 },
];

function gatewayWith(options: StaffMockOptions = {}): StaffGateway {
  return createStaffMockGateway({
    latencyMs: 0,
    branchId: BRANCH,
    bookingsWithoutTable: SEEDS,
    ...options,
  });
}

function renderFloor(gateway: StaffGateway): void {
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

const setupUser = () => userEvent.setup({ delay: null });

async function section(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: /^Arriving · no table yet/u }, { timeout: 5000 });
}

function cardOf(region: HTMLElement, name: string): HTMLElement {
  return within(region).getByText(new RegExp(name, 'u')).closest('li')!;
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
  resetCommandStore();
});

describe('the door', () => {
  it('lists the bookings due soon with no table, right after the requests, the wish first', async () => {
    signIn();
    renderFloor(gatewayWith());

    const door = await section();
    const rail = screen.getByRole('complementary', { name: 'Needs attention' });
    const regions = within(rail).getAllByRole('region');
    // The requests waiting for an answer, then the party at the door.
    expect(regions.indexOf(door)).toBe(1);

    const cards = within(door).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText(/2 guests · Narek G\./u)).toBeTruthy();
    expect(within(cards[0]!).getByText('No table yet')).toBeTruthy();
    expect(within(cards[0]!).getByText('“By the window”')).toBeTruthy();
    expect(within(cards[1]!).getByText(/6 guests · Lilit S\./u)).toBeTruthy();
    expect(within(door).queryByText(/Gor H\./u)).toBeNull();
  });

  it('seats one at the table the waiter chooses: tables that fit first, then off the list', async () => {
    const user = setupUser();
    const gateway = gatewayWith();
    const seat = vi.spyOn(gateway, 'applyTableAction');
    signIn();
    renderFloor(gateway);

    const door = await section();
    await user.click(within(door).getByRole('button', { name: 'Seat Lilit S., 6 guests' }));

    const picker = within(door).getByRole('group', { name: 'Choose a table for 6' });
    const offered = within(picker)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    // Six seats and eight, the closest fit first; then the smaller ones.
    expect(offered[0]).toBe('Table 9, 6 seats, Bar');
    expect(offered[1]).toBe('Table 11, 8 seats, Bar');
    expect(within(picker).getByText('Smaller tables')).toBeTruthy();
    expect(offered).not.toContain('Table 1, 2 seats, Bar');

    await user.click(within(picker).getByRole('button', { name: 'Table 9, 6 seats, Bar' }));

    await waitFor(() => expect(seat).toHaveBeenCalledTimes(1));
    expect(seat.mock.calls[0]![0]).toMatchObject({
      kind: 'seatReservation',
      tableId: 't9',
      reservationId: 'res-t2',
      partySize: 6,
      precondition: { expectedFromStatus: 'free' },
    });
    await waitFor(() => expect(within(door).queryByText(/Lilit S\./u)).toBeNull());
    expect(await screen.findByText('Table 9 · 6 guests seated')).toBeTruthy();
    const floor = await gateway.getFloor(BRANCH);
    expect(floor?.details.find((detail) => detail.tableId === 't9')).toMatchObject({
      physicalStatus: 'occupied',
      partySize: 6,
    });
    expect((await gateway.listBookingsWithoutTable(BRANCH))?.map((entry) => entry.id)).toEqual([
      'res-t1',
      'res-t3',
    ]);
  });

  it('closes the tables again with "Not now", seating nobody', async () => {
    const user = setupUser();
    const gateway = gatewayWith();
    const seat = vi.spyOn(gateway, 'applyTableAction');
    signIn();
    renderFloor(gateway);

    const door = await section();
    const narek = cardOf(door, 'Narek G\\.');
    await user.click(within(narek).getByRole('button', { name: 'Seat Narek G., 2 guests' }));
    await user.click(within(narek).getByRole('button', { name: 'Not now' }));

    expect(within(narek).queryByRole('group')).toBeNull();
    expect(document.activeElement).toBe(
      within(narek).getByRole('button', { name: 'Seat Narek G., 2 guests' }),
    );
    expect(seat).not.toHaveBeenCalled();
  });

  it('lets one go as a no-show, with no table to free, and offers the undo', async () => {
    const user = setupUser();
    const gateway = gatewayWith({
      bookingsWithoutTable: [
        ...SEEDS,
        { id: 'res-t0', guestName: 'Ani H.', partySize: 3, startsInMinutes: -25 },
      ],
    });
    const release = vi.spyOn(gateway, 'releaseReservation');
    signIn();
    renderFloor(gateway);

    const door = await section();
    const ani = cardOf(door, 'Ani H\\.');
    expect(within(ani).getByText('Not here yet')).toBeTruthy();
    await user.click(within(ani).getByRole('button', { name: "Release Ani H.'s booking" }));
    await user.click(within(ani).getByRole('button', { name: /They didn't come/u }));
    await user.click(within(ani).getByRole('button', { name: 'Release' }));

    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
    expect(release.mock.calls[0]![0]).toMatchObject({ reservationId: 'res-t0', outcome: 'noShow' });
    expect(await screen.findByText("Ani H.'s booking was released as a no-show.")).toBeTruthy();
    await waitFor(() => expect(within(door).queryByText(/Ani H\./u)).toBeNull());
    // Undoable from the notice and the rail, by the guest's name: there is no table.
    expect(screen.getAllByRole('button', { name: "Undo Ani H.'s no-show" }).length).toBeGreaterThan(
      0,
    );
    expect(await screen.findByText(/^Ani H\. · can be undone until /u)).toBeTruthy();
  });

  it('lets one go that phoned to cancel, which is not held against them', async () => {
    const user = setupUser();
    signIn();
    renderFloor(gatewayWith());

    const door = await section();
    const narek = cardOf(door, 'Narek G\\.');
    await user.click(within(narek).getByRole('button', { name: "Release Narek G.'s booking" }));
    await user.click(within(narek).getByRole('button', { name: /They let us know/u }));
    await user.click(within(narek).getByRole('button', { name: 'Release' }));

    expect(
      await screen.findByText("Narek G.'s booking was released. It does not count against them."),
    ).toBeTruthy();
    await waitFor(() => expect(within(door).queryByText(/Narek G\./u)).toBeNull());
  });

  it('shows nothing where the list cannot be read', async () => {
    signIn();
    const gateway = gatewayWith({ bookingsWithoutTableRefused: true });
    const list = vi.spyOn(gateway, 'listBookingsWithoutTable');
    renderFloor(gateway);

    await waitFor(() => expect(list).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('region', { name: /^Arriving · no table yet/u })).toBeNull();
  });
});

describe('a booking by time only waiting for a yes', () => {
  it('says it has no table yet, shows the wish, and joins the door once approved', async () => {
    const user = setupUser();
    signIn();
    renderFloor(gatewayWith({ bookingsWithoutTable: [], seedBookingsWithoutTable: true }));

    const requests = await screen.findByRole(
      'region',
      { name: /^Bookings to approve/u },
      { timeout: 5000 },
    );
    const request = (
      await within(requests).findByText('No table yet · you choose on arrival')
    ).closest('li')!;
    expect(within(request).getByText('“Ծխողների սրահում”')).toBeTruthy();

    await user.click(within(request).getByRole('button', { name: 'Approve' }));

    expect(
      await screen.findByText(/^Approved: .+, no table yet\. The guest has been told\.$/u),
    ).toBeTruthy();
    const door = await section();
    await waitFor(() =>
      expect(within(door).getByText(/5 guests · Տաթևիկ Հովսեփյան/u)).toBeTruthy(),
    );
  });
});
