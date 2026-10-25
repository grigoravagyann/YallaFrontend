// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createQueryClient,
  createStaffMockGateway,
  ForbiddenError,
  type EnrolledDevice,
  type StaffFloor,
  type StaffGateway,
  type StaffRosterEntry,
  type StaffSessionSnapshot,
  type StaffToday,
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
import { staffDeviceStore } from '../auth/deviceStore';
import { upcomingBookings } from './nextHour';
import { isPhoneLayout, NARROW_QUERY, PHONE_QUERY, SHORT_TOUCH_QUERY } from './usePhoneLayout';

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
  forgetDevice: vi.fn(async () => undefined),
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
    forgetDevice: staff.forgetDevice,
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
  deviceName: 'Phone',
  branchId: BRANCH,
  branchName: 'Lumen North',
  venueName: 'Lumen',
  enrolledAtUtc: '2026-09-01T00:00:00Z',
  lastSeenAtUtc: null,
  // A paired phone: Aram's own, so More offers to unpair it.
  kind: 'phone',
  boundStaffMember: { id: 's1', fullName: 'Aram Petrosyan', role: 'waiter' },
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
  return queryClient;
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
    // A phone on its side is the phone in a browser tab too, not only installed.
    expect(PHONE_QUERY).not.toContain('display-mode');
    expect(PHONE_QUERY).toContain('(pointer: coarse)');
  });

  /**
   * What a device answers, as `matchMedia` would: its window (CSS px), whether
   * its pointer is coarse, and its screen's shorter side.
   */
  function device(width: number, height: number, coarse: boolean, screenShortSide: number) {
    const matches = (query: string): boolean => {
      const narrow = width < 600;
      const shortTouch = coarse && height <= 500;
      if (query === NARROW_QUERY) return narrow;
      if (query === SHORT_TOUCH_QUERY) return shortTouch;
      if (query === PHONE_QUERY) return narrow || shortTouch;
      return false;
    };
    return isPhoneLayout(matches, screenShortSide);
  }

  it('keeps a phone on the phone layout upright and on its side, in a browser tab or installed', () => {
    // iPhone 14 in Safari: upright, then sideways with the address bar.
    expect(device(390, 664, true, 390)).toBe(true);
    expect(device(844, 340, true, 390)).toBe(true);
    // A large Android phone, sideways and installed.
    expect(device(915, 412, true, 412)).toBe(true);
  });

  it('keeps 7-inch and larger tablets on the tablet layout in either orientation', () => {
    // 1024×600dp held landscape: installed (~530px tall) and in a browser tab (~470px).
    expect(device(1024, 530, true, 600)).toBe(false);
    expect(device(1024, 470, true, 600)).toBe(false);
    // An iPad mini upright and an iPad sideways.
    expect(device(744, 1133, true, 744)).toBe(false);
    expect(device(1180, 800, true, 820)).toBe(false);
    // A short desktop window with a mouse is not a phone either.
    expect(device(1280, 450, false, 1080)).toBe(false);
  });

  it('wears the phone shell in any window under 600px wide, as before', () => {
    expect(device(560, 900, false, 1080)).toBe(true);
    expect(device(500, 600, true, 800)).toBe(true);
  });

  it('keeps the tablet’s full-screen overlays clear of the notch and the home indicator', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'phone.css'), 'utf8');
    const rule = /\[data-layout='phone'\] \.staff-overlay \{([^}]*)\}/u.exec(css)?.[1] ?? '';
    expect(rule).toContain('safe-area-inset-top');
    expect(rule).toContain('safe-area-inset-bottom');
  });

  it('leaves an installed 7-inch tablet held landscape (about 530px tall) on the tablet layout', () => {
    // The landscape clause's height: over a phone on its side (~480px at
    // most), under a 1024×600dp tablet less its status and navigation bars.
    const height = /\(max-height: ([\d.]+)px\)/u.exec(PHONE_QUERY)?.[1];
    expect(Number(height)).toBeGreaterThanOrEqual(480);
    expect(Number(height)).toBeLessThan(520);
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

  it('takes a call with "I’m on it" on the phone too, and names who has it', async () => {
    signIn();
    const staffGateway = gateway();
    const claim = vi.spyOn(staffGateway, 'claimServiceRequest');
    renderAt(staffGateway);
    const rail = await screen.findByRole('complementary', { name: 'Needs attention' });
    const calls = within(rail).getAllByRole('region')[0]!;
    const take = await within(calls).findAllByRole('button', { name: /^I’m on it · table/u });
    await setupUser().click(take[0]!);
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
    expect(claim.mock.calls[0]![0]).toEqual(expect.objectContaining({ branchId: BRANCH }));
    // Who has it, on the call itself, and no second "I’m on it".
    await waitFor(() =>
      expect(calls.querySelector('.ft-item-claim')?.textContent).toMatch(/on it/u),
    );
  });

  it('lists a booking to approve as a row that opens the Approve screen, and approves there', async () => {
    signIn();
    const staffGateway = gateway();
    const approve = vi.spyOn(staffGateway, 'approveReservation');
    renderAt(staffGateway);
    const user = setupUser();

    const section = await screen.findByRole('region', { name: /bookings to approve/i });
    const row = await within(section).findByRole('button', { name: /^Table 7\b/u });
    // Its name says the deadline, never the seconds that tick on screen.
    expect(row.getAttribute('aria-label')).toMatch(/, answer by .*\d:\d\d,/u);
    expect(row.getAttribute('aria-label')).not.toMatch(/left to answer/u);
    await user.click(row);

    // A screen of its own: Back and its heading in the bar, no tabs under it.
    const heading = await screen.findByRole('heading', { level: 1, name: 'Booking to approve' });
    expect(document.activeElement).toBe(heading);
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull();

    expect(screen.getByText('Answer within')).toBeTruthy();
    await user.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Approved\. The guest has been told\./u)).toBeTruthy();
    // Decided: the card no longer counts down while the list catches up.
    expect(screen.queryByText('Answer within')).toBeNull();
    expect(screen.queryByRole('timer', { hidden: true })).toBeNull();

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

describe('transferring a table on the phone', () => {
  it('opens the chooser in the sheet, people on shift first with their tables, and says it worked', async () => {
    signIn();
    // A paired phone's roster is its own person: the chooser asks the server
    // who can take this table, and shows them in the server's order.
    const staffGateway = gateway();
    const targets = vi.spyOn(staffGateway, 'listTransferTargets').mockResolvedValue([
      {
        staffMemberId: 's2',
        name: 'Gor Melkonyan',
        role: 'waiter',
        onShiftNow: true,
        openTables: 2,
      },
      {
        staffMemberId: 's4',
        name: 'Ani Sargsyan',
        role: 'manager',
        onShiftNow: false,
        openTables: 0,
      },
    ]);
    const transfer = vi.spyOn(staffGateway, 'transferTab').mockImplementation(async (command) => ({
      tabId: command.tabId,
      server: { staffMemberId: 's2', name: 'Gor Melkonyan' },
      previousServer: { staffMemberId: 's1', name: 'Aram Petrosyan' },
      transferredAtUtc: new Date().toISOString(),
      tableSessionId: null,
      tableLabel: null,
      wasReplay: false,
    }));
    renderAt(staffGateway);
    const user = setupUser();
    await user.click(tab(await tabs(), /^Floor/u));
    const tiles = await screen.findByRole('list', { name: 'Tables' });
    const occupied = (await within(tiles).findAllByRole('button')).find((one) =>
      /Occupied/u.test(one.getAttribute('aria-label') ?? ''),
    )!;
    await user.click(occupied);

    const sheet = await screen.findByRole('dialog');
    // The table's waiter is in the sheet.
    expect(within(sheet).getByText('Waiter')).toBeTruthy();
    await user.click(await within(sheet).findByRole('button', { name: 'Transfer table' }));
    const people = await within(sheet).findByRole('group', { name: /^To whom/u });
    const radios = within(people).getAllByRole('radio');
    // The server's list, for this table's tab, in its order; the roster is not asked.
    expect(targets).toHaveBeenCalledTimes(1);
    expect(staff.roster).not.toHaveBeenCalled();
    expect(radios.map((radio) => radio.closest('label')?.querySelector('b')?.textContent)).toEqual([
      'Gor Melkonyan',
      'Ani Sargsyan',
    ]);
    expect(within(people).getByText('Waiter · on shift now · 2 tables now')).toBeTruthy();
    expect(within(people).getByText('Manager · not on shift · no tables now')).toBeTruthy();
    await user.click(radios[0]!);
    await user.click(within(sheet).getByRole('button', { name: 'Transfer to Gor' }));

    await waitFor(() => expect(transfer).toHaveBeenCalledTimes(1));
    expect(transfer.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ tabId: targets.mock.calls[0]![0], toStaffMemberId: 's2' }),
    );
    const status = await within(sheet).findByRole('status');
    expect(status.textContent).toMatch(/is now Gor’s/u);
    expect(status.textContent).toMatch(/Aram → Gor/u);
    await user.click(within(sheet).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('says a refused list (403) is not this person’s table, not "try again"', async () => {
    signIn();
    const staffGateway = gateway();
    vi.spyOn(staffGateway, 'listTransferTargets').mockRejectedValue(
      new ForbiddenError({ url: '/api/tabs/t/transfer-targets' }),
    );
    renderAt(staffGateway);
    const user = setupUser();
    await user.click(tab(await tabs(), /^Floor/u));
    const tiles = await screen.findByRole('list', { name: 'Tables' });
    const occupied = (await within(tiles).findAllByRole('button')).find((one) =>
      /Occupied/u.test(one.getAttribute('aria-label') ?? ''),
    )!;
    await user.click(occupied);
    const sheet = await screen.findByRole('dialog');
    await user.click(await within(sheet).findByRole('button', { name: 'Transfer table' }));
    expect((await within(sheet).findByRole('alert')).textContent).toMatch(
      /^Only the table’s waiter or a manager can hand table \S+ over\.$/u,
    );
    expect(
      (within(sheet).getByRole('button', { name: 'Transfer' }) as HTMLButtonElement).disabled,
    ).toBe(true);
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

    const opened = rows[0]!.getAttribute('data-subject');
    await user.click(rows[0]!);
    const back = await screen.findByRole('button', { name: 'All messages' });
    expect(document.querySelector('.msg-thread')).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Conversations' })).toBeNull();
    // The row that opened it went with the list: focus is on the way back,
    // not dropped to the page.
    await waitFor(() => expect(document.activeElement).toBe(back));

    await user.click(back);
    expect(await screen.findByRole('region', { name: 'Conversations' })).toBeTruthy();
    await waitFor(() =>
      expect((document.activeElement as HTMLElement | null)?.getAttribute('data-subject')).toBe(
        opened,
      ),
    );
  });
});

describe('Today', () => {
  const board: StaffToday = {
    branchId: BRANCH,
    branchName: 'Lumen North',
    venueName: 'Lumen',
    timeZoneId: 'Asia/Yerevan',
    asOfUtc: new Date().toISOString(),
    serviceDate: '2026-10-24',
    localTime: '18:34',
    branches: [
      { branchId: BRANCH, name: 'Lumen North' },
      { branchId: 'b2', name: 'Arabkir' },
    ],
    revenue: {
      totalAmd: 412_000,
      hallAmd: 368_000,
      takeawayAmd: 44_000,
      takeawayOrders: 6,
      sinceUtc: new Date().toISOString(),
    },
    guests: { total: 96, withBooking: 78, walkIn: 18 },
    bookings: { total: 34, came: 21, expected: 11, late: 1, noShow: 2, pendingApproval: 1 },
    room: { occupiedTables: 8, tables: 14, people: 31 },
    needsYou: {
      pendingApprovals: 1,
      oldestApprovalRequestedAtUtc: null,
      soonestApprovalDeadlineUtc: new Date(Date.now() + 12 * 60_000).toISOString(),
      unansweredMessages: 1,
      oldestUnansweredMessageAtUtc: new Date(Date.now() - 4 * 60_000).toISOString(),
    },
    shifts: [
      {
        staffMemberId: 's2',
        fullName: 'Lilit Abrahamyan',
        role: 'waiter',
        startsAt: '16:00',
        endsAt: '00:00',
        endsNextDay: true,
        startsAtUtc: new Date(Date.now() - 3_600_000).toISOString(),
        endsAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
        onShiftNow: true,
        signedIn: true,
      },
      {
        staffMemberId: 's3',
        fullName: 'Gor Melkonyan',
        role: 'kitchen',
        startsAt: '20:00',
        endsAt: '02:00',
        endsNextDay: true,
        startsAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
        endsAtUtc: new Date(Date.now() + 7 * 3_600_000).toISOString(),
        onShiftNow: false,
        signedIn: false,
      },
    ],
  };

  it('shows the takings split, the guests with and without a booking, what needs a manager and who is signed in', async () => {
    signIn('manager');
    const staffGateway = gateway();
    const read = vi.spyOn(staffGateway, 'getToday').mockResolvedValue(board);
    renderAt(staffGateway);

    expect(await screen.findByRole('heading', { name: 'Today' })).toBeTruthy();
    await waitFor(() => expect(read).toHaveBeenCalledWith(BRANCH));
    expect(await screen.findByText('34')).toBeTruthy();
    expect(screen.getByText(/^hall .*368.*000.* · takeaway .*44.*000/u)).toBeTruthy();
    expect(screen.getByText('78 with a booking · 18 without')).toBeTruthy();
    expect(screen.getByText('came 21 · expected 11 · no-show 2')).toBeTruthy();
    expect(screen.getByText('8 / 14')).toBeTruthy();
    expect(screen.getByText('1 booking to approve')).toBeTruthy();
    expect(screen.getByText('1 unanswered message')).toBeTruthy();
    expect(screen.getByText('Lilit Abrahamyan · Waiter')).toBeTruthy();
    expect(screen.getByText('signed in')).toBeTruthy();
    expect(screen.getByText('from 20:00')).toBeTruthy();
  });

  it('switches branch for an owner or a general manager, and reads that one', async () => {
    signIn('generalManager');
    const staffGateway = gateway();
    const read = vi
      .spyOn(staffGateway, 'getToday')
      .mockImplementation(async (branchId) =>
        branchId === 'b2' ? { ...board, branchId: 'b2', branchName: 'Arabkir' } : board,
      );
    renderAt(staffGateway);
    const user = setupUser();

    const switcher = await screen.findByRole('combobox', { name: 'Branch' });
    await user.selectOptions(switcher, 'b2');
    await waitFor(() => expect(read).toHaveBeenCalledWith('b2'));
    // Another branch's floor is not this phone's: the rows say, and do not open.
    expect(await screen.findByText('Answered from that branch’s own floor.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /booking to approve/u })).toBeNull();
  });

  it('says so when Today cannot be read, rather than showing zeros', async () => {
    signIn('manager');
    const staffGateway = gateway();
    vi.spyOn(staffGateway, 'getToday').mockRejectedValue(new Error('nope'));
    renderAt(staffGateway);
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

  it('unpairs the phone on the server, forgets it here, and goes back to pairing', async () => {
    signIn('waiter');
    const staffGateway = gateway();
    const unpair = vi.spyOn(staffGateway, 'unpairOwnPhone');
    await staffDeviceStore.rememberStaff({ staffMemberId: 's1', fullName: 'Aram Petrosyan' });
    const queryClient = renderAt(staffGateway);
    const user = setupUser();
    await user.click(tab(await tabs(), /^More/u));
    await waitFor(() => expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0));

    await user.click(await screen.findByRole('button', { name: 'Unpair this phone' }));
    await user.click(screen.getByRole('button', { name: 'Yes, unpair' }));
    await waitFor(() => expect(unpair).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(staff.forgetDevice).toHaveBeenCalledTimes(1));
    // Nothing of the person is left for the next pairing: not their name on
    // the device, not a floor or a switch read under their session.
    await waitFor(async () =>
      expect(
        (await staffDeviceStore.readKnownStaff()).map((known) => known.staffMemberId),
      ).not.toContain('s1'),
    );
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => query.state.data !== undefined),
    ).toEqual([]);
  });

  it('says so when the phone could not be unpaired, and stays paired', async () => {
    signIn('waiter');
    const staffGateway = gateway();
    vi.spyOn(staffGateway, 'unpairOwnPhone').mockRejectedValue(new TypeError('Failed to fetch'));
    renderAt(staffGateway);
    const user = setupUser();
    await user.click(tab(await tabs(), /^More/u));

    await user.click(await screen.findByRole('button', { name: 'Unpair this phone' }));
    await user.click(screen.getByRole('button', { name: 'Yes, unpair' }));
    expect(
      await screen.findByText(
        'The phone could not be unpaired. Check the connection and try again.',
      ),
    ).toBeTruthy();
    expect(staff.forgetDevice).not.toHaveBeenCalled();
  });

  it('offers no unpair on a shared tablet opened narrow: a manager revokes that', async () => {
    session.set({
      state: 'signedIn',
      device: { ...device, kind: 'tablet', boundStaffMember: null },
      identity: {
        staffMemberId: 's1',
        fullName: 'Aram Petrosyan',
        role: 'waiter',
        branchId: BRANCH,
      },
      lastSignOut: null,
    } satisfies StaffSessionSnapshot);
    renderAt(gateway());
    const user = setupUser();
    await user.click(tab(await tabs(), /^More/u));
    expect(await screen.findByRole('button', { name: 'Lock now' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unpair this phone' })).toBeNull();
  });

  it('opens the notification switches as a screen of its own, with Back', async () => {
    signIn('waiter');
    renderAt(gateway());
    const user = setupUser();
    await user.click(tab(await tabs(), /^More/u));
    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Notifications' });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole('heading', { name: 'Add to the Home Screen' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Turn on notifications' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: 'Lock now' })).toBeTruthy();
  });

  it('opens My results: the periods, six tiles, the week’s chart and who sees them', async () => {
    signIn('waiter');
    const staffGateway = gateway();
    const mine = vi.spyOn(staffGateway, 'getMyPerformance').mockImplementation(async (query) => ({
      from: query.from,
      to: query.to,
      staffMemberId: 's1',
      name: 'Aram Petrosyan',
      role: 'waiter',
      isActive: true,
      figures: {
        tables: 9,
        guests: 26,
        salesAmd: 214_600,
        averageCheckAmd: 23_844,
        tipsAmd: 18_000,
        callMedianSeconds: 48,
        callsClaimed: 7,
        replyMedianSeconds: 95,
        messagesAnswered: 4,
        approvals: 2,
        declines: 0,
        cashAmd: 132_000,
        cashPayments: 6,
        discounts: 0,
        comps: 0,
        adjustmentsAmd: 0,
        voids: 0,
      },
      daily: Array.from({ length: 7 }, (_, index) => ({
        date: `2026-10-${String(19 + index).padStart(2, '0')}`,
        salesAmd: (index + 1) * 10_000,
        tables: index,
      })),
      recent: { list: query.list ?? 'orders', items: [], nextCursor: null },
    }));
    renderAt(staffGateway);
    const user = setupUser();
    await user.click(tab(await tabs(), /^More/u));
    await user.click(await screen.findByRole('button', { name: 'My results' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'My results' })).toBeTruthy();
    expect(await screen.findByText('9 tables')).toBeTruthy();
    expect(screen.getByText('48 s')).toBeTruthy();
    expect(screen.getByText('6 bills')).toBeTruthy();
    expect(screen.getByRole('group', { name: /^Sales by day/u })).toBeTruthy();
    expect(
      screen.getByText('Only you and your manager see these numbers. Other waiters do not.'),
    ).toBeTruthy();
    // A waiter reads their own: no branch named, and today first.
    const first = mine.mock.calls[0]![0];
    expect(first.branchId).toBeUndefined();
    expect(first.from).toBe(first.to);

    await user.click(screen.getByRole('button', { name: '7 days' }));
    expect(screen.getByRole('button', { name: '7 days' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    await waitFor(() =>
      expect(mine.mock.calls.some(([query]) => query.from !== query.to)).toBe(true),
    );
  });

  it('names the branch for an owner’s My results', async () => {
    signIn('owner');
    const staffGateway = gateway();
    const mine = vi.spyOn(staffGateway, 'getMyPerformance');
    renderAt(staffGateway);
    const user = setupUser();
    await user.click(tab(await tabs(), /^More/u));
    await user.click(await screen.findByRole('button', { name: 'My results' }));
    await waitFor(() => expect(mine).toHaveBeenCalled());
    expect(mine.mock.calls[0]![0].branchId).toBe(BRANCH);
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

describe('a tapped notification', () => {
  it('opens the booking’s Approve screen from /staff/approve/{id}', async () => {
    signIn();
    const staffGateway = gateway();
    const [request] = await staffGateway.listAwaitingApproval(BRANCH);
    renderAt(staffGateway, `/staff/approve/${request!.id}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Booking to approve' }),
    ).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeTruthy();
  });

  it('says so when that booking no longer waits, and stays on Now', async () => {
    signIn();
    renderAt(gateway(), '/staff/approve/gone');
    expect(await screen.findByText('No longer waiting for an answer.')).toBeTruthy();
    expect(tab(await tabs(), /^Now/u).getAttribute('aria-current')).toBe('page');
  });

  it('opens the table’s sheet from /staff/floor?table=', async () => {
    signIn();
    const staffGateway = gateway();
    const floor = await staffGateway.getFloor(BRANCH);
    const table = floor!.plan.tables[0]!;
    renderAt(staffGateway, `/staff/floor?table=${table.id}`);
    const sheet = await screen.findByRole('dialog');
    expect(sheet.classList.contains('is-sheet')).toBe(true);
  });

  it('opens the thread from /staff/messages/{conversationId}', async () => {
    signIn();
    const staffGateway = createStaffMockGateway({
      latencyMs: 0,
      branchId: BRANCH,
      seedMessages: true,
      staffName: 'Aram Petrosyan',
    });
    const inbox = await staffGateway.listConversations(BRANCH);
    renderAt(staffGateway, `/staff/messages/${inbox.items[0]!.conversationId}`);
    expect(await screen.findByRole('button', { name: 'All messages' })).toBeTruthy();
    expect(document.querySelector('.msg-thread')).not.toBeNull();
  });
});
