// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  FULL_FEATURES,
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type StaffGateway,
  type StaffMockOptions,
  type StaffSessionSnapshot,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../../console/venue/reports/testHarness';
import { resetCommandStore } from '../testCommandStore';
import type * as CurrentUserModule from '../../auth/useCurrentUser';
import { newBookingFailure, normalisePhone } from './bookingFailure';

/**
 * A booking taken by hand (2026-10-31): "+ Booking" in the top bar opens the
 * sheet over the floor; the staff type the guest's name and number, pick the
 * day, the time and a table the room offers for the party, and book. The
 * booking is confirmed at once, named after who took it, and the floor is
 * reminded to call the guest. At a branch that books by time only there is
 * no table to choose; from a free table's panel the table is chosen already.
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

vi.mock('../../offline/commandStore', async (importOriginal) =>
  (await import('../testCommandStore')).withMemoryStore(await importOriginal()),
);
vi.mock('../auth/staffSession', () => ({
  staffAuthAvailable: true,
  staffSession: {
    restore: async () => undefined,
    refreshDevice: async () => undefined,
    roster: async () => [],
    signOut: async () => undefined,
  },
}));
vi.mock('../auth/useStaffSession', () => ({
  useStaffSessionSnapshot: () => useSyncExternalStore(session.subscribe, session.get),
  useTouchOnInteraction: () => undefined,
}));
vi.mock('../../auth/useCurrentUser', async () => {
  const actual = await vi.importActual<typeof CurrentUserModule>('../../auth/useCurrentUser');
  return { ...actual, useCurrentUser: () => ({ user: null }) };
});
vi.mock('../chime', () => ({ primeChime: () => undefined, playChime: async () => true }));

const { StaffRoute } = await import('../StaffRoute');

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
      role: 'waiter',
      branchId: BRANCH,
      features: FULL_FEATURES,
    },
    lastSignOut: null,
  } satisfies StaffSessionSnapshot);
}

function gatewayWith(options: StaffMockOptions = {}): StaffGateway {
  // The mock acts under the signed-in person's name, so "Taken by" agrees.
  return createStaffMockGateway({
    latencyMs: 0,
    branchId: BRANCH,
    staffName: 'Sona Vardanyan',
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

async function openSheet(user: ReturnType<typeof setupUser>): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: '+ Booking' }, { timeout: 5000 }));
  return screen.findByRole('dialog', { name: 'New booking' });
}

/** Name, number, tomorrow at 20:00: the part every booking shares. */
async function fillGuestAndTime(user: ReturnType<typeof setupUser>, sheet: HTMLElement) {
  await user.type(within(sheet).getByLabelText("Guest's name"), 'Armine Sargsyan');
  await user.type(within(sheet).getByLabelText('Phone'), '091 77 88 99');
  await user.click(within(sheet).getByRole('button', { name: 'Tomorrow' }));
  const times = await within(sheet).findByRole('group', { name: 'Time' }, { timeout: 5000 });
  await user.click(within(times).getByRole('button', { name: '20:00' }));
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

describe('the New booking sheet', () => {
  it('takes a booking from the top bar: name, number, tomorrow at 20:00, a table that fits, booked', async () => {
    const user = setupUser();
    const gateway = gatewayWith();
    const create = vi.spyOn(gateway, 'createStaffBooking');
    signIn();
    renderFloor(gateway);

    const sheet = await openSheet(user);
    // Opened on the first field, over the floor.
    expect(document.activeElement).toBe(within(sheet).getByLabelText("Guest's name"));
    await fillGuestAndTime(user, sheet);
    // The number, read back as people write it.
    expect((within(sheet).getByLabelText('Phone') as HTMLInputElement).value).toBe(
      '+374 91 77 88 99',
    );

    // The tables for four at 20:00: the closest fit first, every one big enough.
    await user.click(within(sheet).getByRole('button', { name: 'More' }));
    await user.click(within(sheet).getByRole('button', { name: 'More' }));
    const tables = await within(sheet).findByRole('group', { name: 'Table' });
    expect(within(sheet).getByText('Free tables for 4 guests')).toBeTruthy();
    const offered = within(tables).getAllByRole('button');
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.map((button) => button.getAttribute('aria-label'))).not.toContain(
      'Table 1, 2 seats, Bar',
    );
    await user.click(offered[0]!);
    expect(offered[0]!.getAttribute('aria-pressed')).toBe('true');

    await user.click(within(sheet).getByRole('button', { name: 'Book' }));

    expect(await screen.findByRole('heading', { name: 'Booked' })).toBeTruthy();
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const command = create.mock.calls[0]![0];
    expect(command).toMatchObject({
      branchId: BRANCH,
      guestName: 'Armine Sargsyan',
      guestPhone: '+37491778899',
      partySize: 4,
      time: '20:00',
      tableId: offered[0]!.getAttribute('data-table-id'),
    });
    expect(command.date > new Date().toISOString().slice(0, 10)).toBe(true);
    expect(screen.getByText(/^Tomorrow · \d\d:\d\d$/u)).toBeTruthy();
    expect(screen.getByText(/^Table \d+ · 4 guests$/u)).toBeTruthy();
    expect(screen.getByText(/^Code Y\d{4}$/u)).toBeTruthy();
    expect(screen.getByText('Taken by Sona Vardanyan')).toBeTruthy();
    expect(
      screen.getByText('We will remind you to call the guest 30 minutes before.'),
    ).toBeTruthy();

    // The booking is the table's next one on the floor now.
    const floor = await gateway.getFloor(BRANCH);
    expect(
      floor?.details.find((detail) => detail.tableId === command.tableId)?.nextReservationId,
    ).toBeTruthy();

    // Close: back to the floor, nothing left over.
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'New booking' })).toBeNull();
  });

  it('says what is missing before it sends, and a refusal in the room’s words', async () => {
    const user = setupUser();
    const gateway = gatewayWith();
    const create = vi.spyOn(gateway, 'createStaffBooking');
    signIn();
    renderFloor(gateway);

    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Book' }));
    expect(within(sheet).getByRole('alert').textContent).toBe("Enter the guest's name.");
    expect(create).not.toHaveBeenCalled();

    await fillGuestAndTime(user, sheet);
    await user.click(within(sheet).getByRole('button', { name: 'Book' }));
    expect(within(sheet).getByRole('alert').textContent).toBe('Choose the table.');
    expect(create).not.toHaveBeenCalled();
  });

  it('at a branch that books by time only, offers no table and says how many more fit', async () => {
    const user = setupUser();
    const gateway = gatewayWith({ bookingMode: 'timeOnly' });
    const create = vi.spyOn(gateway, 'createStaffBooking');
    signIn();
    renderFloor(gateway);

    const sheet = await openSheet(user);
    await fillGuestAndTime(user, sheet);

    expect(within(sheet).queryByRole('group', { name: 'Table' })).toBeNull();
    expect(
      within(sheet).getByText('The waiter chooses the table when the guests arrive.'),
    ).toBeTruthy();
    expect(within(sheet).getByText('Room for 20 more guests')).toBeTruthy();

    await user.click(within(sheet).getByRole('button', { name: 'Book' }));

    expect(await screen.findByRole('heading', { name: 'Booked' })).toBeTruthy();
    expect(create.mock.calls[0]![0]).toMatchObject({ tableId: null, partySize: 2 });
    expect(screen.getByText(/^No table · you choose on arrival · 2 guests$/u)).toBeTruthy();
    // On the door's list now, with the taker named.
    const door = await gateway.listBookingsWithoutTable(BRANCH);
    expect(door.some((row) => row.channel === 'staff' && row.guestName === 'Armine Sargsyan')).toBe(
      true,
    );
  });

  it("opens from a free table's panel with that table chosen", async () => {
    const user = setupUser();
    const gateway = gatewayWith();
    const create = vi.spyOn(gateway, 'createStaffBooking');
    signIn();
    renderFloor(gateway);

    // A table that is free and has no booking: its panel offers "Book this table".
    const floor = (await gateway.getFloor(BRANCH))!;
    const free = floor.details.find(
      (detail) => detail.physicalStatus === 'free' && detail.nextReservationStartUtc === null,
    )!;
    await user.click(
      await screen.findByRole(
        'button',
        { name: new RegExp(`^Table ${free.label}, `, 'u') },
        { timeout: 5000 },
      ),
    );
    const panel = await screen.findByRole('dialog', {
      name: `Actions for table ${free.label}`,
    });
    await user.click(within(panel).getByRole('button', { name: 'Book this table' }));

    const sheet = await screen.findByRole('dialog', {
      name: `New booking · table ${free.label}`,
    });
    await fillGuestAndTime(user, sheet);
    const tables = await within(sheet).findByRole('group', { name: 'Table' });
    const chosen = within(tables)
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-pressed') === 'true');
    expect(chosen?.getAttribute('data-table-id')).toBe(free.tableId);

    await user.click(within(sheet).getByRole('button', { name: 'Book' }));
    expect(await screen.findByRole('heading', { name: 'Booked' })).toBeTruthy();
    expect(create.mock.calls[0]![0]).toMatchObject({ tableId: free.tableId });
  });
});

describe('the sheet’s own rules', () => {
  it('reads an Armenian number however it was typed, and leaves a foreign one alone', () => {
    expect(normalisePhone('091 77 88 99')).toBe('+37491778899');
    expect(normalisePhone('+374 91 77 88 99')).toBe('+37491778899');
    expect(normalisePhone('374-91-77-88-99')).toBe('+37491778899');
    expect(normalisePhone('00374 91778899')).toBe('+37491778899');
    expect(normalisePhone('+7 921 000 00 00')).toBe('+79210000000');
    expect(normalisePhone('   ')).toBe('');
  });

  it('words a refusal by what to do next', () => {
    expect(newBookingFailure(new TypeError('Failed to fetch'))).toEqual({ kind: 'offline' });
    expect(newBookingFailure(new Error('?'))).toEqual({ kind: 'generic' });
  });
});
