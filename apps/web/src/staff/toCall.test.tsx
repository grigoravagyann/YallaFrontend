// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  FULL_FEATURES,
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type StaffBookingSeed,
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
import { initConsoleTestI18n } from '../console/venue/reports/testHarness';
import { PHONE_QUERY } from './phone/usePhoneLayout';
import { resetCommandStore } from './testCommandStore';
import type * as CurrentUserModule from '../auth/useCurrentUser';

/**
 * "Call the guest" (2026-10-31): thirty minutes before a staff-taken booking
 * the rail lists it — mine first, badged — with the number to dial and the
 * two answers. "Coming" is recorded on the booking and the card goes;
 * "Not coming" lets the booking go as the guest having told us. On the table
 * panel the same two buttons stand where "Ask: are you coming?" would, since
 * no app is behind the booking; on the phone the section is on Now, under
 * "+ New booking".
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
      role: 'waiter',
      branchId: BRANCH,
      features: FULL_FEATURES,
    },
    lastSignOut: null,
  } satisfies StaffSessionSnapshot);
}

/** Mine at table 4 in twenty minutes; the manager's, without a table, in ten; one too far ahead. */
const SEEDS: readonly StaffBookingSeed[] = [
  {
    id: 'sb-mine',
    guestName: 'Armine Sargsyan',
    guestPhone: '+37491778899',
    partySize: 4,
    startsInMinutes: 20,
    tableId: 't4',
    note: 'A birthday cake',
  },
  {
    id: 'sb-theirs',
    guestName: 'Hovhannes M.',
    guestPhone: '+37494112233',
    partySize: 2,
    startsInMinutes: 10,
    tableId: null,
    takenBy: { id: 'b1-manager', name: 'Nare Petrosyan' },
  },
  {
    id: 'sb-later',
    guestName: 'Gor H.',
    guestPhone: '+37477000000',
    partySize: 2,
    startsInMinutes: 90,
    tableId: 't9',
  },
];

function gatewayWith(options: StaffMockOptions = {}): StaffGateway {
  return createStaffMockGateway({
    latencyMs: 0,
    branchId: BRANCH,
    staffName: 'Sona Vardanyan',
    staffBookingSeeds: SEEDS,
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

/** `matchMedia`, answering the phone's query as asked. */
function viewport(phone: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === PHONE_QUERY ? phone : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
}

const setupUser = () => userEvent.setup({ delay: null });

/** The section, once its cards are on screen (it shows "Loading…" until the first read). */
async function section(): Promise<HTMLElement> {
  const region = await screen.findByRole('region', { name: /^Call the guest/u }, { timeout: 5000 });
  await within(region).findAllByRole('listitem', undefined, { timeout: 5000 });
  return region;
}

const cardOf = (region: HTMLElement, name: string) =>
  within(region).getByText(new RegExp(name, 'u')).closest('li')!;

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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetCommandStore();
  session.set(null);
});

describe('"Call the guest" on the rail', () => {
  it('lists the staff bookings in their window, mine first and badged, with the number and the taker', async () => {
    signIn();
    renderFloor(gatewayWith());

    const calls = await section();
    const cards = within(calls).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    // Mine first, though the manager's starts sooner.
    expect(within(cards[0]!).getByText(/4 guests · Armine Sargsyan/u)).toBeTruthy();
    expect(within(cards[0]!).getByText('Yours')).toBeTruthy();
    expect(within(cards[0]!).getByText(/Table 4 · Taken by Sona Vardanyan/u)).toBeTruthy();
    expect(within(cards[0]!).getByText('“A birthday cake”')).toBeTruthy();
    const phone = within(cards[0]!).getByRole('link', {
      name: 'Call Armine Sargsyan, +374 91 77 88 99',
    });
    expect(phone.getAttribute('href')).toBe('tel:+37491778899');
    expect(within(cards[1]!).getByText(/No table · Taken by Nare Petrosyan/u)).toBeTruthy();
    expect(within(cards[1]!).queryByText('Yours')).toBeNull();
    // Ninety minutes away: not yet.
    expect(within(calls).queryByText(/Gor H\./u)).toBeNull();
  });

  it('records "Coming", which takes the card off the list and puts "on the way" on the table', async () => {
    const user = setupUser();
    const gateway = gatewayWith();
    const mark = vi.spyOn(gateway, 'markGuestComing');
    signIn();
    renderFloor(gateway);

    const calls = await section();
    await user.click(within(calls).getByRole('button', { name: 'Coming · Armine Sargsyan' }));

    await waitFor(() => expect(mark).toHaveBeenCalledTimes(1));
    expect(mark.mock.calls[0]![0]).toMatchObject({ reservationId: 'sb-mine' });
    await waitFor(() => expect(within(calls).queryByText(/Armine Sargsyan/u)).toBeNull());
    const detail = (await gateway.getFloor(BRANCH))!.details.find(
      (entry) => entry.tableId === 't4',
    );
    expect(detail?.nextReservationGuestConfirmedOnWayAtUtc).toBeTruthy();
  });

  it('lets a booking go on "Not coming", once confirmed, as the guest having told us', async () => {
    const user = setupUser();
    const gateway = gatewayWith();
    const release = vi.spyOn(gateway, 'releaseReservation');
    signIn();
    renderFloor(gateway);

    const calls = await section();
    const theirs = cardOf(calls, 'Hovhannes M\\.');
    await user.click(within(theirs).getByRole('button', { name: 'Not coming · Hovhannes M.' }));
    const confirm = within(theirs).getByRole('group', {
      name: 'The guest said they are not coming',
    });
    expect(release).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Release' }));

    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
    expect(release.mock.calls[0]![0]).toMatchObject({
      reservationId: 'sb-theirs',
      outcome: 'guestCancelled',
    });
    expect(
      await screen.findByText(
        "Hovhannes M.'s booking was released. It does not count against them.",
      ),
    ).toBeTruthy();
    await waitFor(() => expect(within(calls).queryByText(/Hovhannes M\./u)).toBeNull());
  });

  it('is not there while nobody is to be called', async () => {
    signIn();
    const gateway = gatewayWith({ staffBookingSeeds: [] });
    const list = vi.spyOn(gateway, 'listBookingsToCall');
    renderFloor(gateway);
    await screen.findByRole('complementary', { name: 'Needs attention' });
    await waitFor(() => expect(list).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /^Call the guest/u })).toBeNull(),
    );
  });
});

describe('the table panel of a staff-taken booking', () => {
  it('names the taker and offers "Coming" and "Not coming" instead of asking the guest', async () => {
    const user = setupUser();
    const gateway = gatewayWith();
    const mark = vi.spyOn(gateway, 'markGuestComing');
    signIn();
    renderFloor(gateway);

    await section();
    await user.click(await screen.findByRole('button', { name: /^Table 4, /u }));
    const panel = await screen.findByRole('dialog', { name: 'Actions for table 4' });

    expect(within(panel).getByText('Taken by Sona Vardanyan')).toBeTruthy();
    expect(
      within(panel).getByRole('heading', { name: /^Booking at \d\d:\d\d: call the guest$/u }),
    ).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Ask: are you coming?' })).toBeNull();
    expect(
      within(panel)
        .getByRole('link', { name: 'Call Armine Sargsyan, +374 91 77 88 99' })
        .getAttribute('href'),
    ).toBe('tel:+37491778899');

    await user.click(within(panel).getByRole('button', { name: 'Coming · Armine Sargsyan' }));
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(1));
    // Recorded: the call block goes with the card, and the booking says "on their way".
    await waitFor(() =>
      expect(within(panel).queryByRole('button', { name: 'Coming · Armine Sargsyan' })).toBeNull(),
    );
    expect(await within(panel).findByText('The guest confirmed they are on the way')).toBeTruthy();
  });
});

describe('on the phone', () => {
  it('puts "+ New booking" and "Call the guest" on Now, the number a tap away', async () => {
    viewport(true);
    const user = setupUser();
    signIn();
    renderFloor(gatewayWith());

    const calls = await section();
    const mine = cardOf(calls, 'Armine Sargsyan');
    expect(
      within(mine)
        .getByRole('link', { name: /^Call Armine Sargsyan/u })
        .getAttribute('href'),
    ).toBe('tel:+37491778899');
    expect(within(mine).getByRole('button', { name: 'Coming · Armine Sargsyan' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '+ New booking' }));
    expect(await screen.findByRole('dialog', { name: 'New booking' })).toBeTruthy();
  });
});
