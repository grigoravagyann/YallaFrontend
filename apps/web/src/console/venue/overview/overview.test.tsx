// @vitest-environment jsdom
import {
  ConcurrencyConflictError,
  createConsoleMockGateway,
  overviewRowState,
  type BranchReadiness,
  type ConsoleGateway,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../ui/toast';
import { ReservationPolicyScreen } from '../policy/ReservationPolicyScreen';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { VenueOverviewScreen } from '../VenueOverviewScreen';

/**
 * Overview (venue-console Main artboard): today's numbers, the bookings with
 * their row menu, the load by hour, what is worth a look, and the setup card
 * while the branch is not ready — on the console mock, at a fixed evening so
 * every row state is on the table.
 */

/** Sunday 18 October 2026, 18:42 in Yerevan. */
const EVENING = new Date('2026-10-18T14:42:00Z');
const BRANCH = 'b-lumen-north';

beforeAll(async () => {
  await initConsoleTestI18n();
});

beforeEach(() => {
  vi.useFakeTimers({ now: EVENING, shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderOverview(
  gateway: ConsoleGateway = mockGateway(),
  screenElement = <VenueOverviewScreen />,
) {
  const harness = createConsoleHarness({ gateway });
  const context = {
    branchId: BRANCH,
    branchName: 'North',
    timeZoneId: 'Asia/Yerevan',
    branchCount: 3,
    canRollUpVenue: true,
    canRelocate: true,
  };
  render(
    harness.wrap(
      <ToastProvider>
        <Routes>
          <Route path="/venue" element={<Outlet context={context} />}>
            <Route index element={screenElement} />
          </Route>
        </Routes>
      </ToastProvider>,
      '/venue',
    ),
  );
  return { harness, user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime }) };
}

function mockGateway() {
  return createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
}

async function bookingsCard() {
  return screen.findByRole('region', { name: "Today's bookings" }, { timeout: 5000 });
}

const rowOf = (card: HTMLElement, name: string) =>
  within(card).getByText(name).closest('tr') as HTMLElement;

describe('the overview', () => {
  it("greets by the branch's clock and says the day, the branch and the hours", async () => {
    renderOverview();
    expect(
      await screen.findByRole('heading', { level: 1, name: /^Good evening, \S+$/u }),
    ).toBeTruthy();
    expect(screen.getByText(/^Sunday, October 18 · North · updated \d\d:\d\d$/u)).toBeTruthy();
    expect(screen.getByText(/^(Open until \d\d:\d\d|Closed)/u)).toBeTruthy();
  });

  it("shows today's four numbers from the overview read", async () => {
    const gateway = mockGateway();
    renderOverview(gateway);
    const overview = await gateway.getBranchOverview(BRANCH);
    await bookingsCard();

    const bookings = screen.getByText('Bookings today').closest('.yc-kpi') as HTMLElement;
    expect(within(bookings).getByText(String(overview.bookings.total))).toBeTruthy();
    expect(
      within(bookings).getByText(
        `${overview.bookings.confirmed} confirmed · ${overview.bookings.pendingApproval} waiting`,
      ),
    ).toBeTruthy();

    const room = screen.getByText('In the room now', { selector: '.yc-kpi-l' }).closest('a')!;
    expect(room.getAttribute('href')).toBe('/venue/floorplan');
    expect(within(room).getByText(`${overview.inRoom.people} people`)).toBeTruthy();

    const tabs = screen.getByText('Open tabs').closest('.yc-kpi') as HTMLElement;
    expect(within(tabs).getByText(/still unpaid$/u)).toBeTruthy();
    const revenue = screen.getByText('Revenue today').closest('.yc-kpi') as HTMLElement;
    expect(within(revenue).getByText(/^↑ \d/u)).toBeTruthy();
  });

  it('draws the load by hour with the seats as its line, every hour said', async () => {
    const gateway = mockGateway();
    renderOverview(gateway);
    const overview = await gateway.getBranchOverview(BRANCH);
    const chart = await screen.findByRole('img', { name: /^Booked people by hour/u });

    expect(chart.getAttribute('aria-label')).toContain(
      `${overview.load.capacity} seats in the room`,
    );
    expect(
      within(chart).getByText(`${overview.load.capacity} seats · the room is full`),
    ).toBeTruthy();
    expect(screen.getByText(/^The busiest hour is \d\d:00/u)).toBeTruthy();
  });

  it('runs the hours past midnight on a late night, as the clock reads them', async () => {
    const base = mockGateway();
    const overview = await base.getBranchOverview(BRANCH);
    const lateNight: ConsoleGateway = {
      ...base,
      getBranchOverview: async () => ({
        ...overview,
        localDate: '2026-10-19',
        serviceDate: '2026-10-18',
        localTime: '00:40:00',
        load: {
          capacity: 30,
          hours: [
            { hour: 23, people: 12, pendingPeople: 0 },
            { hour: 24, people: 8, pendingPeople: 0 },
            { hour: 25, people: 2, pendingPeople: 0 },
          ],
        },
      }),
    };
    renderOverview(lateNight);
    const chart = await screen.findByRole('img', { name: /^Booked people by hour/u });

    // The service day is still the evening's.
    expect(screen.getByText(/^Sunday, October 18 · North/u)).toBeTruthy();
    expect(chart.getAttribute('aria-label')).toContain(
      '23:00: 12, 00:00 (next day): 8, 01:00 (next day): 2',
    );
    const now = chart.parentElement!.querySelector('.yc-lx .is-now')!;
    expect(now.textContent).toBe('00');
  });

  it('says when the list of today is cut short', async () => {
    const base = mockGateway();
    const overview = await base.getBranchOverview(BRANCH);
    renderOverview({
      ...base,
      getBranchOverview: async () => ({ ...overview, todayBookingsTruncated: true }),
    });
    const card = await bookingsCard();
    expect(within(card).getByText("Showing the first 200 of today's bookings.")).toBeTruthy();
  });

  it('no longer carries the approvals on the policy screen', async () => {
    renderOverview(mockGateway(), <ReservationPolicyScreen />);
    await screen.findByLabelText(/confirm bookings automatically/i, {}, { timeout: 5000 });
    expect(screen.queryByRole('region', { name: /waiting for your decision/i })).toBeNull();
  });
});

describe("today's bookings", () => {
  it('filters to what is coming up, the room now, or everything', async () => {
    const gateway = mockGateway();
    const { user } = renderOverview(gateway);
    const card = await bookingsCard();
    const overview = await gateway.getBranchOverview(BRANCH);
    const named = (state: string) =>
      overview.todayBookings.find((row) => overviewRowState(row, EVENING) === state)!.guestName;

    // Coming up: waiting, confirmed and late, not the seated or the finished.
    expect(
      within(card).getByRole('button', { name: 'Coming up' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(within(card).getByText(named('late'))).toBeTruthy();
    expect(within(card).getByText(named('confirmed'))).toBeTruthy();
    expect(within(card).queryByText(named('seated'))).toBeNull();
    expect(within(card).queryByText(named('completed'))).toBeNull();

    await user.click(within(card).getByRole('button', { name: 'In the room now' }));
    expect(within(card).getByText(named('seated'))).toBeTruthy();
    expect(within(card).getByText(named('late'))).toBeTruthy();
    expect(within(card).queryByText(named('confirmed'))).toBeNull();

    await user.click(within(card).getByRole('button', { name: 'All' }));
    expect(within(card).getByText(named('completed'))).toBeTruthy();
    expect(within(card).getByText(named('cancelled'))).toBeTruthy();
  });

  it('says how late a late party is, and when the app asked them', async () => {
    const gateway = mockGateway();
    renderOverview(gateway);
    const card = await bookingsCard();
    const late = (await gateway.getBranchOverview(BRANCH)).todayBookings.find(
      (row) => overviewRowState(row, EVENING) === 'late',
    )!;
    const row = rowOf(card, late.guestName);
    expect(within(row).getByText(/^\d+ min late$/u)).toBeTruthy();
    expect(within(row).getByText(/^The app (asked|asks) at \d\d:\d\d$/u)).toBeTruthy();
    // No manual nudge: the backend has none.
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(within(row).getByRole('button', { name: /^Actions for/u }));
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Mark seated', 'No-show · free the table']);
  });

  it('seats a late party from the menu with the keyboard, says so, and hands the focus back', async () => {
    const gateway = mockGateway();
    const act = vi.spyOn(gateway, 'actOnBooking');
    const { user } = renderOverview(gateway);
    const card = await bookingsCard();
    const late = (await gateway.getBranchOverview(BRANCH)).todayBookings.find(
      (row) => overviewRowState(row, EVENING) === 'late',
    )!;
    const kebab = within(rowOf(card, late.guestName)).getByRole('button', {
      name: new RegExp(`^Actions for ${late.guestName}`, 'u'),
    });

    await user.click(kebab);
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard('{ArrowUp}{Enter}');

    await waitFor(() =>
      expect(act).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'seat', reservationId: late.id, tableId: late.tableId }),
      ),
    );
    expect(await screen.findByText(`${late.guestName} is seated`)).toBeTruthy();
    // Seated now, it left what is coming up with its button: the card's title takes the focus.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(card).getByRole('heading', { name: "Today's bookings" }),
      ),
    );
    await user.click(within(card).getByRole('button', { name: 'In the room now' }));
    expect(within(rowOf(card, late.guestName)).getByText('Seated')).toBeTruthy();
  });

  it('marks a no-show and calls a booking off, each on its own action', async () => {
    const gateway = mockGateway();
    const act = vi.spyOn(gateway, 'actOnBooking');
    const { user } = renderOverview(gateway);
    const card = await bookingsCard();
    const rows = (await gateway.getBranchOverview(BRANCH)).todayBookings;
    const late = rows.find((row) => overviewRowState(row, EVENING) === 'late')!;
    const upcoming = rows.find((row) => overviewRowState(row, EVENING) === 'confirmed')!;

    await user.click(
      within(rowOf(card, late.guestName)).getByRole('button', { name: /^Actions/u }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'No-show · free the table' }));
    expect(
      await screen.findByText(new RegExp(`^${late.guestName} marked as a no-show`, 'u')),
    ).toBeTruthy();

    await user.click(
      within(rowOf(card, upcoming.guestName)).getByRole('button', { name: /^Actions/u }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Cancel the booking' }));
    expect(
      await screen.findByText(
        `${upcoming.guestName}'s booking is cancelled · the guest will be notified`,
      ),
    ).toBeTruthy();
    expect(act.mock.calls.map(([command]) => command.kind)).toEqual(['noShow', 'cancel']);
  });

  it("says the server's refusal when somebody on the floor acted first", async () => {
    const base = mockGateway();
    const detail = 'Only a confirmed reservation can be seated; LUD3 is Seated.';
    const refusing: ConsoleGateway = {
      ...base,
      actOnBooking: () =>
        Promise.reject(
          new ConcurrencyConflictError({
            url: 'mock://seat',
            problem: {
              type: 'about:blank',
              title: 'Conflict',
              status: 409,
              detail,
              code: 'conflicting-state',
              traceId: 'mock',
            },
          }),
        ),
    };
    const { user } = renderOverview(refusing);
    const card = await bookingsCard();
    const late = (await base.getBranchOverview(BRANCH)).todayBookings.find(
      (row) => overviewRowState(row, EVENING) === 'late',
    )!;

    await user.click(
      within(rowOf(card, late.guestName)).getByRole('button', { name: /^Actions/u }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Mark seated' }));
    expect((await screen.findByRole('alert')).textContent).toContain(detail);
  });
});

describe('worth a look and the setup card', () => {
  const READY: BranchReadiness = {
    branchId: BRANCH,
    isReadyForDiners: true,
    floorPlanDrawn: true,
    tableCount: 12,
    tablesLabelled: true,
    menuCategoriesPresent: true,
    menuCategoryCount: 3,
    menuItemCount: 20,
    menuComplete: true,
    incompleteMenuItemCount: 0,
    incompleteMenuItemIds: [],
    openingHoursSet: true,
    openingHoursDayCount: 6,
    reservationPolicyReviewed: true,
    staffEnrolled: true,
    staffCount: 4,
    deviceEnrolled: true,
    deviceCount: 1,
    acceptsWebBookings: true,
    blockers: [],
  };

  it('lists unfinished dishes and switched-off bookings, each linking to its screen', async () => {
    const gateway = mockGateway();
    vi.spyOn(gateway, 'getBranchReadiness').mockResolvedValue({
      ...READY,
      isReadyForDiners: false,
      menuComplete: false,
      incompleteMenuItemCount: 4,
      acceptsWebBookings: false,
    });
    renderOverview(gateway);
    const card = await screen.findByRole('region', { name: 'Worth a look' });

    const dishes = await within(card).findByText('4 dishes are still unfinished');
    expect(dishes.closest('a')!.getAttribute('href')).toBe('/venue/menu');
    expect(
      within(card).getByText('Online bookings are off').closest('a')!.getAttribute('href'),
    ).toBe('/venue/public');
  });

  it('shows the setup card while something is left, and nothing once the branch is ready', async () => {
    const gateway = mockGateway();
    // A room with a photo and a bookable table pinned on it: the rooms line is done.
    const plan = await gateway.getFloorPlan(BRANCH);
    const photo = {
      photoId: 'p-1',
      thumbnailUrl: '',
      cardUrl: '',
      fullUrl: '',
      width: 4,
      height: 3,
    };
    vi.spyOn(gateway, 'getFloorPlan').mockResolvedValue({
      ...plan,
      areas: plan.areas.map((area, index) => (index === 0 ? { ...area, photos: [photo] } : area)),
      tables: plan.tables.map((table, index) =>
        index === 0 ? { ...table, pin: { photoId: 'p-1', x: 0.5, y: 0.5 } } : table,
      ),
    });
    const readiness = vi.spyOn(gateway, 'getBranchReadiness').mockResolvedValue({
      ...READY,
      deviceEnrolled: false,
      deviceCount: 0,
      isReadyForDiners: false,
    });
    renderOverview(gateway);

    const setup = await screen.findByRole('region', {
      name: 'What is still needed before guests can come',
    });
    expect(within(setup).getByText('7 of 8 done')).toBeTruthy();
    expect(within(setup).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('7');
    expect(setup.querySelector('[data-step="devices"]')!.className).toBe('is-todo');
    cleanup();

    readiness.mockResolvedValue(READY);
    renderOverview(gateway);
    await bookingsCard();
    await waitFor(() => expect(readiness).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('region', { name: /what is still needed/i })).toBeNull();
  });
});
