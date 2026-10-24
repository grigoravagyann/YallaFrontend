// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createQueryClient,
  createStaffMockGateway,
  type BranchOverview,
  type EnrolledDevice,
  type StaffFloor,
  type StaffGateway,
  type StaffRosterEntry,
  type StaffSessionSnapshot,
  type UserRole,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next } from '@yalla/i18n';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useSyncExternalStore } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initConsoleTestI18n } from '../../console/venue/reports/testHarness';
import type * as CurrentUserModule from '../../auth/useCurrentUser';
import type * as GatewayModule from '../../data/gateway';
import { upcomingBookings } from './nextHour';
import { PHONE_QUERY } from './usePhoneLayout';

/**
 * The staff phone (staff phone spec, "Phone layout for /staff"): below 600px
 * `/staff` wears the phone shell — the cherry bar, the screens, the bottom
 * tabs — over the floor tablet's own state and commands. At 600px and wider
 * the tablet is untouched, which every other test in `staff/` holds.
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

const staff = vi.hoisted(() => ({
  signOut: vi.fn(async () => undefined),
  roster: vi.fn(async (): Promise<readonly unknown[]> => []),
}));

const overview = vi.hoisted(() => ({
  get: vi.fn(async (_branchId: string): Promise<unknown> => null),
}));

vi.mock('../../offline/commandStore', async (importOriginal) =>
  (await import('../testCommandStore')).withMemoryStore(await importOriginal()),
);
vi.mock('../auth/staffSession', () => ({
  staffAuthAvailable: true,
  staffSession: {
    restore: async () => undefined,
    refreshDevice: async () => undefined,
    roster: staff.roster,
    signOut: staff.signOut,
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
vi.mock('../../data/gateway', async (importOriginal) => ({
  ...(await importOriginal<typeof GatewayModule>()),
  staffOverviewGateway: () => ({ getBranchOverview: overview.get }),
}));
vi.mock('../chime', () => ({ primeChime: () => undefined, playChime: async () => true }));

const { StaffRoute } = await import('../StaffRoute');

const BRANCH = 'b1';

const device: EnrolledDevice = {
  deviceId: 'd1',
  deviceName: 'Phone',
  branchId: BRANCH,
  branchName: 'Lumen North',
  venueName: 'Lumen',
  enrolledAtUtc: '2026-09-01T00:00:00Z',
  lastSeenAtUtc: null,
};

function signIn(role: UserRole = 'waiter'): void {
  session.set({
    state: 'signedIn',
    device,
    identity: { staffMemberId: 's1', fullName: 'Aram Petrosyan', role, branchId: BRANCH },
    lastSignOut: null,
  } satisfies StaffSessionSnapshot);
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

function gateway(): StaffGateway {
  return createStaffMockGateway({ latencyMs: 0, branchId: BRANCH, staffName: 'Aram Petrosyan' });
}

function renderAt(staffGateway: StaffGateway, path = '/staff') {
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });
  render(
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider staffGateway={staffGateway}>
          <MemoryRouter initialEntries={[path]}>
            <StaffRoute />
          </MemoryRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

const setupUser = () => userEvent.setup({ delay: null });

async function tabs(): Promise<HTMLElement> {
  return screen.findByRole('navigation', { name: 'Main' });
}

function tab(nav: HTMLElement, name: RegExp): HTMLElement {
  return within(nav).getByRole('button', { name });
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
  viewport(true);
  staff.roster.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  session.set(null);
});

describe('which layout /staff wears', () => {
  it('reads the same breakpoint in the hook and in the stylesheet', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'phone.css'), 'utf8');
    expect(PHONE_QUERY.startsWith('(max-width: 599.98px)')).toBe(true);
    expect(css).toContain("[data-layout='phone']");
    expect(PHONE_QUERY).toContain('(display-mode: standalone)');
  });

  it('keeps the floor tablet at 600px and wider: its bar, its Kitchen tab, no phone tabs', async () => {
    viewport(false);
    signIn();
    renderAt(gateway());
    const views = await screen.findByRole('navigation', { name: 'Screens' });
    expect(within(views).getByRole('button', { name: /^Kitchen/u })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();
    expect(document.querySelector('[data-layout="phone"]')).toBeNull();
  });

  it('gives a waiter Now, Floor, Messages and More — and never the kitchen', async () => {
    signIn('waiter');
    renderAt(gateway());
    const nav = await tabs();
    const names = within(nav)
      .getAllByRole('button')
      .map((button) => button.querySelector('span')?.textContent);
    expect(names.slice(0, 3)).toEqual(['Now', 'Floor', 'Messages']);
    expect(names.at(-1)).toBe('More');
    expect(names).not.toContain('Today');
    expect(screen.queryByRole('button', { name: /^Kitchen/u })).toBeNull();
    expect(tab(nav, /^Now/u).getAttribute('aria-current')).toBe('page');
    // The cherry bar: where, whether it is live, and whose phone.
    expect(await screen.findByText('Lumen · Lumen North')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aram Petrosyan, my page' })).toBeTruthy();
  });

  it('opens on Today for a manager, with Today first', async () => {
    signIn('manager');
    renderAt(gateway());
    const nav = await tabs();
    const first = within(nav).getAllByRole('button')[0]!;
    expect(first.textContent).toContain('Today');
    expect(first.getAttribute('aria-current')).toBe('page');
  });
});

describe('Now', () => {
  it('puts the people calling first, with "On my way" one tap away', async () => {
    signIn();
    const staffGateway = gateway();
    const acknowledge = vi.spyOn(staffGateway, 'acknowledgeServiceRequest');
    renderAt(staffGateway);
    const rail = await screen.findByRole('complementary', { name: 'Needs attention' });
    const sections = within(rail).getAllByRole('region');
    expect(sections[0]!.getAttribute('aria-labelledby')).toBeTruthy();
    expect(within(sections[0]!).getByText('Waiting for a waiter')).toBeTruthy();

    const onMyWay = await within(sections[0]!).findAllByRole('button', { name: 'On my way' });
    await setupUser().click(onMyWay[0]!);
    await waitFor(() => expect(acknowledge).toHaveBeenCalledTimes(1));
  });

  it('lists a booking to approve as a row that opens the Approve screen, and approves there', async () => {
    signIn();
    const staffGateway = gateway();
    const approve = vi.spyOn(staffGateway, 'approveReservation');
    renderAt(staffGateway);
    const user = setupUser();

    const section = await screen.findByRole('region', { name: /bookings to approve/i });
    const row = await within(section).findByRole('button', { name: /^Table 7\b/u });
    await user.click(row);

    // A screen of its own: Back and its heading in the bar, no tabs under it.
    const heading = await screen.findByRole('heading', { level: 1, name: 'Booking to approve' });
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();

    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Approved\. The guest has been told\./u)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back to Now' }));
    expect(await tabs()).toBeTruthy();
  });

  it('reads "In the next hour" off the floor, with whether the guest is coming', () => {
    const now = new Date('2026-10-24T14:30:00Z');
    const floor = {
      plan: {
        tables: [
          { id: 't1', label: '1' },
          { id: 't2', label: '2' },
          { id: 't3', label: '3' },
        ],
      },
      details: [
        {
          tableId: 't2',
          label: '2',
          nextReservationId: 'r2',
          nextReservationStartUtc: '2026-10-24T15:00:00Z',
          nextReservationPartySize: 4,
          nextReservationGuestConfirmedOnWayAtUtc: '2026-10-24T14:20:00Z',
        },
        {
          tableId: 't1',
          label: '1',
          nextReservationId: 'r1',
          nextReservationStartUtc: '2026-10-24T14:40:00Z',
          nextReservationPartySize: 2,
          nextReservationGuestRunningLateMinutes: 15,
        },
        {
          // Two hours off: not this hour's.
          tableId: 't3',
          label: '3',
          nextReservationId: 'r3',
          nextReservationStartUtc: '2026-10-24T16:30:00Z',
          nextReservationPartySize: 6,
        },
      ],
    } as unknown as StaffFloor;
    const rows = upcomingBookings(floor, now);
    expect(rows.map((row) => row.tableLabel)).toEqual(['1', '2']);
    expect(rows[0]!.arrival).toEqual({ kind: 'late', minutes: 15 });
    expect(rows[1]!.arrival).toEqual({ kind: 'coming' });
    expect(upcomingBookings(null, now)).toEqual([]);
  });
});

describe('the floor', () => {
  it('opens a table as a modal bottom sheet, the screen under it inert, and closes back to the tile', async () => {
    signIn();
    renderAt(gateway());
    const user = setupUser();
    const nav = await tabs();
    await user.click(tab(nav, /^Floor/u));

    const tiles = await screen.findByRole('list', { name: 'Tables' });
    const tile = (await within(tiles).findAllByRole('button'))[0]!;
    await user.click(tile);

    const sheet = await screen.findByRole('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(sheet.classList.contains('is-sheet')).toBe(true);
    expect(document.querySelector('.ph-frame')!.hasAttribute('inert')).toBe(true);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.querySelector('.ph-frame')!.hasAttribute('inert')).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(tile));
  });
});

describe('Messages', () => {
  it('shows the list, then one conversation with a way back — never both', async () => {
    signIn();
    const staffGateway = createStaffMockGateway({
      latencyMs: 0,
      branchId: BRANCH,
      seedMessages: true,
      staffName: 'Aram Petrosyan',
    });
    renderAt(staffGateway);
    const user = setupUser();
    await user.click(tab(await tabs(), /^Messages/u));

    const list = await screen.findByRole('region', { name: 'Conversations' });
    const rows = await within(list).findAllByRole('button', { name: /,/u });
    expect(document.querySelector('.msg-thread')).toBeNull();

    await user.click(rows[0]!);
    const back = await screen.findByRole('button', { name: 'All messages' });
    expect(document.querySelector('.msg-thread')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Conversations' })).toBeNull();

    await user.click(back);
    expect(await screen.findByRole('region', { name: 'Conversations' })).toBeTruthy();
  });
});

describe('Today', () => {
  it('shows the branch overview, what needs a manager, and who is on shift', async () => {
    signIn('manager');
    overview.get.mockResolvedValue({
      revenue: { todayAmd: 412_000, changePercent: 8.5 },
      bookings: { people: 96, total: 34, seated: 15, completed: 6, confirmed: 11, noShow: 2 },
      inRoom: { occupiedTables: 8, tables: 14 },
    } as unknown as BranchOverview);
    staff.roster.mockResolvedValue([
      {
        staffMemberId: 's2',
        fullName: 'Lilit Abrahamyan',
        role: 'waiter',
        onShiftNow: true,
        shift: null,
      },
    ] satisfies StaffRosterEntry[]);
    renderAt(gateway());

    expect(await screen.findByRole('heading', { name: 'Today' })).toBeTruthy();
    await waitFor(() => expect(overview.get).toHaveBeenCalledWith(BRANCH));
    expect(await screen.findByText('34')).toBeTruthy();
    expect(screen.getByText('came 21 · expected 11 · no-show 2')).toBeTruthy();
    expect(screen.getByText('8 / 14')).toBeTruthy();
    expect(screen.getByText('+8.5% on the same day last week')).toBeTruthy();
    expect(await screen.findByText(/bookings? to approve$/u)).toBeTruthy();
    expect(await screen.findByText('Lilit Abrahamyan · Waiter')).toBeTruthy();
    expect(screen.getByText('on shift')).toBeTruthy();
  });

  it('says so when the overview cannot be read, rather than showing zeros', async () => {
    signIn('manager');
    overview.get.mockRejectedValue(new Error('nope'));
    renderAt(gateway());
    expect(await screen.findByText('Today’s numbers could not be read.')).toBeTruthy();
  });
});

describe('More', () => {
  it('shows who this is and their shift, locks with the tablet’s sign-out, and asks before unpairing', async () => {
    signIn('waiter');
    staff.roster.mockResolvedValue([
      {
        staffMemberId: 's1',
        fullName: 'Aram Petrosyan',
        role: 'waiter',
        onShiftNow: false,
        shift: {
          startsAt: '16:00',
          endsAt: '00:00',
          endsNextDay: true,
          startsAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
          endsAtUtc: new Date(Date.now() + 9 * 3_600_000).toISOString(),
        },
      },
    ] satisfies StaffRosterEntry[]);
    renderAt(gateway());
    const user = setupUser();
    await user.click(tab(await tabs(), /^More/u));

    expect(await screen.findByText('Aram Petrosyan')).toBeTruthy();
    expect(await screen.findByText('16:00–00:00')).toBeTruthy();
    // Managers' links are a manager's.
    expect(screen.queryByRole('navigation', { name: 'Manage' })).toBeNull();
    // The language is the app's own switch, as radios.
    const language = screen.getByRole('radiogroup', { name: 'Language' });
    expect(within(language).getAllByRole('radio')).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Unpair this phone' }));
    const keep = screen.getByRole('button', { name: 'No' });
    expect(document.activeElement).toBe(keep);
    await user.click(keep);
    expect(screen.getByRole('button', { name: 'Unpair this phone' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Lock now' }));
    expect(staff.signOut).toHaveBeenCalledTimes(1);
  });

  it('gives a manager Today, the message history and the console', async () => {
    signIn('manager');
    renderAt(gateway());
    const user = setupUser();
    await user.click(tab(await tabs(), /^More/u));
    const manage = await screen.findByRole('navigation', { name: 'Manage' });
    expect(
      within(manage)
        .getByRole('link', { name: /Message history/u })
        .getAttribute('href'),
    ).toBe('/venue/messages');
    await user.click(within(manage).getByRole('button', { name: /Today’s summary/u }));
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeTruthy();
  });
});
