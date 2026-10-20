// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  ConcurrencyConflictError,
  TabAdmissionDecidedError,
  createQueryClient,
  createStaffMockGateway,
  type EnrolledDevice,
  type FloorChange,
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
import { applyFloorChanges } from './live/sequence';
import { resetCommandStore } from './testCommandStore';
import type * as CurrentUserModule from '../auth/useCurrentUser';

/**
 * Tables that scanned with no verified number (2026-10-20).
 *
 * A photographed QR code can open a tab from anywhere, so a scan whose host
 * proved no number waits for a waiter, who can see whether anybody is sitting
 * there: Admit lets the table order, Reject closes the tab (and frees the
 * table when the scan seated it). Both are on the "Now" rail and on the
 * table's own panel, online only — never queued. Bookings made without a
 * verified number say so wherever the floor shows them.
 *
 * The staff mock's `seedUnverifiedGuests` seats two such scans — table 8 six
 * minutes ago (two phones, the host "Արամ"), table 5 two minutes ago — marks
 * table 6's late booking as made without a verified number, and adds a web
 * booking without one at table 9 to the requests.
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
    identity: { staffMemberId: 's1', fullName: 'Sona Vardanyan', role: 'waiter', branchId: BRANCH },
    lastSignOut: null,
  } satisfies StaffSessionSnapshot);
}

function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

function floorGateway(): StaffGateway {
  return createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, seedUnverifiedGuests: true });
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
  return screen.findByRole('region', { name: /^Waiting to be let in/u }, { timeout: 5000 });
}

async function card(table: string): Promise<HTMLElement> {
  const label = await within(await section()).findByText(new RegExp(`^Table ${table}$`, 'u'));
  return label.closest('li')!;
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

describe('the rail', () => {
  it('lists the waiting tables after the bookings, oldest first, each with its age', async () => {
    signIn();
    renderFloor(floorGateway());

    const waiting = await section();
    const rail = screen.getByRole('complementary', { name: 'Needs attention' });
    const regions = within(rail).getAllByRole('region');
    expect(regions.indexOf(waiting)).toBe(1);
    expect(within(waiting).getByText('2', { selector: '.ft-badge' })).toBeTruthy();

    const cards = within(waiting).getAllByRole('listitem');
    expect(cards.map((entry) => within(entry).getByText(/^Table \d+$/u).textContent)).toEqual([
      'Table 8',
      'Table 5',
    ]);
    const eight = cards[0]!;
    expect(within(eight).getByText('number not verified')).toBeTruthy();
    expect(within(eight).getByText(/scanned 6 min ago/u)).toBeTruthy();
    expect(within(eight).getByText(/Արամ/u)).toBeTruthy();
    expect(within(eight).getByText(/2 phones/u)).toBeTruthy();
    expect(within(eight).getByRole('button', { name: 'Admit' })).toBeTruthy();
    expect(within(eight).getByRole('button', { name: 'Reject' })).toBeTruthy();
  });

  it('admits in one tap, online, under one command id: the card goes and the floor says so', async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    const admit = vi.spyOn(gateway, 'admitTab');
    renderFloor(gateway);

    const five = await card('5');
    await user.click(within(five).getByRole('button', { name: 'Admit' }));

    await waitFor(() => expect(admit).toHaveBeenCalledTimes(1));
    expect(admit.mock.calls[0]![0]).toMatchObject({
      tabId: expect.any(String),
      clientCommandId: expect.any(String),
    });
    expect(await screen.findByText('Table 5 can order now.')).toBeTruthy();
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: /^Waiting to be let in/u })).queryByText(
          'Table 5',
        ),
      ).toBeNull(),
    );
  });

  it('asks before rejecting, says it frees the table, and keeps the card on Cancel', async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    const reject = vi.spyOn(gateway, 'rejectTab');
    renderFloor(gateway);

    const eight = await card('8');
    await user.click(within(eight).getByRole('button', { name: 'Reject' }));
    const question = within(eight).getByRole('group', { name: 'Table 8: nobody there?' });
    expect(within(question).getByText('This closes the tab and frees the table.')).toBeTruthy();
    expect(reject).not.toHaveBeenCalled();

    await user.click(within(question).getByRole('button', { name: 'Cancel' }));
    expect(within(eight).getByRole('button', { name: 'Admit' })).toBeTruthy();

    await user.click(within(eight).getByRole('button', { name: 'Reject' }));
    await user.click(within(eight).getByRole('button', { name: 'Yes, reject' }));
    await waitFor(() => expect(reject).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Table 8: tab closed, table freed.')).toBeTruthy();
  });

  it('is online only: offline, nothing is sent and the card says why', async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    const admit = vi.spyOn(gateway, 'admitTab');
    renderFloor(gateway);

    const five = await card('5');
    act(() => setOnline(false));

    await waitFor(() =>
      expect(
        (within(five).getByRole('button', { name: 'Admit' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    expect(
      (within(five).getByRole('button', { name: 'Reject' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(within(five).getByText('Admitting or rejecting needs a connection.')).toBeTruthy();
    await user.click(within(five).getByRole('button', { name: 'Admit' }));
    expect(admit).not.toHaveBeenCalled();
  });

  it('says somebody else decided, when they did', async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    vi.spyOn(gateway, 'admitTab').mockRejectedValue(
      new TabAdmissionDecidedError({ url: 'x', tabId: 'tab', admission: 'rejected' }),
    );
    renderFloor(gateway);

    const five = await card('5');
    await user.click(within(five).getByRole('button', { name: 'Admit' }));

    expect(
      await within(five).findByText('Someone else already decided about this table.'),
    ).toBeTruthy();
  });
});

describe('a reject the server refuses', () => {
  it('says orders were taken there, so somebody is: admit it instead', async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    vi.spyOn(gateway, 'rejectTab').mockRejectedValue(
      new ConcurrencyConflictError({
        url: 'x',
        problem: {
          type: '',
          title: 'Conflict',
          status: 409,
          detail: 'Orders were taken.',
          code: 'conflicting-state',
          traceId: 't',
        },
      }),
    );
    renderFloor(gateway);

    const eight = await card('8');
    await user.click(within(eight).getByRole('button', { name: 'Reject' }));
    await user.click(within(eight).getByRole('button', { name: 'Yes, reject' }));

    expect(
      await within(eight).findByText(
        'Orders were taken at this table, so somebody is there. Admit it instead.',
      ),
    ).toBeTruthy();
  });
});

describe('the table panel', () => {
  it('offers the same Admit on a waiting table, and says why it waits', async () => {
    const user = setupUser();
    signIn();
    const gateway = floorGateway();
    const admit = vi.spyOn(gateway, 'admitTab');
    renderFloor(gateway);

    await section();
    await user.click(await screen.findByRole('button', { name: /^Table 5, / }));
    const panel = await screen.findByRole('dialog', { name: 'Actions for table 5' });

    expect(within(panel).getByText('Waiting to be let in')).toBeTruthy();
    expect(within(panel).getByText(/Scanned without a verified number/u)).toBeTruthy();
    await user.click(within(panel).getByRole('button', { name: 'Admit' }));
    await waitFor(() => expect(admit).toHaveBeenCalledTimes(1));
  });

  it('says the next booking was made without a verified number', async () => {
    const user = setupUser();
    signIn();
    renderFloor(floorGateway());

    await user.click(await screen.findByRole('button', { name: /^Table 6, / }));
    const panel = await screen.findByRole('dialog', { name: 'Actions for table 6' });
    expect(within(panel).getByText('number not verified')).toBeTruthy();
  });
});

describe('the floor and the requests', () => {
  it('flags the card of a waiting table and of a booking without a verified number', async () => {
    signIn();
    renderFloor(floorGateway());

    const five = await screen.findByRole('button', { name: /^Table 5, / });
    expect(five.getAttribute('aria-label')).toMatch(/waiting to be let in/u);
    const six = screen.getByRole('button', { name: /^Table 6, / });
    expect(six.getAttribute('aria-label')).toMatch(/number not verified/u);
    expect(within(six).getByText('number not verified')).toBeTruthy();
  });

  it('words the new reason on the booking request', async () => {
    signIn();
    renderFloor(floorGateway());

    const requests = await screen.findByRole('region', { name: /bookings to approve/i });
    const nine = (await within(requests).findByText(/^Table 9\b/u)).closest('li')!;
    expect(within(nine).getByText('Number not verified — the venue confirms')).toBeTruthy();
  });
});

describe('the change stream', () => {
  it('reads the floor again on a signal, rather than folding it in', () => {
    const floor = {
      plan: {
        branchId: BRANCH,
        branchName: 'North',
        timeZoneId: 'Asia/Yerevan',
        tables: [],
      },
      details: [
        {
          tableId: 't5',
          label: '5',
          seats: 2,
          physicalStatus: 'occupied',
          currentSessionId: 's',
          seatedAtUtc: '2026-10-20T14:58:00Z',
          partySize: null,
          nextReservationId: null,
          nextReservationStartUtc: null,
          nextReservationPartySize: null,
          freeUntilUtc: null,
          openTabId: 'tab-5',
          rowVersion: 'v',
          openTabAwaitingAdmission: true,
        },
      ],
      lastSequence: 4,
      asOfUtc: '2026-10-20T15:00:00Z',
    } as const;
    const signal: FloorChange = {
      sequence: 5,
      tableId: 't5',
      tableLabel: '5',
      fromStatus: 'occupied',
      toStatus: 'occupied',
      atUtc: '2026-10-20T15:01:00Z',
      tableSessionId: 's',
      reservationId: null,
      actor: 'staff',
      actorId: null,
      reason: '',
      tabId: 'tab-5',
      signal: 'tabAdmitted',
    };

    expect(applyFloorChanges(floor as never, [signal]).kind).toBe('gap');
  });
});
