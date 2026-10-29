// @vitest-environment jsdom
import {
  ConcurrencyConflictError,
  InvalidTransitionError,
  NoShowUndoWindowClosedError,
  createConsoleMockGateway,
  overviewRowState,
  type BranchReadiness,
  type ConsoleGateway,
  type OverviewBooking,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_UNDO_MS, ToastProvider } from '../../ui/toast';
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

  it('says the special day the service day is, beside the hours (VC3)', async () => {
    const gateway = mockGateway();
    const real = gateway.getBranchOverview.bind(gateway);
    vi.spyOn(gateway, 'getBranchOverview').mockImplementation(async (branchId) => {
      const overview = await real(branchId);
      return {
        ...overview,
        hours: {
          isOpen: false,
          closesAt: null,
          closesNextDay: false,
          opensAt: null,
          specialDay: { date: overview.serviceDate, note: 'New Year', blocks: [] },
        },
      };
    });
    renderOverview(gateway);
    expect(await screen.findByText(/ · New Year$/u)).toBeTruthy();
  });

  it("says how many of today's bookings a guest's no-show block cancelled", async () => {
    const gateway = mockGateway();
    const real = gateway.getBranchOverview.bind(gateway);
    vi.spyOn(gateway, 'getBranchOverview').mockImplementation(async (branchId) => {
      const overview = await real(branchId);
      return {
        ...overview,
        bookings: { ...overview.bookings, cancelled: 3, cancelledBySystem: 2 },
      };
    });
    renderOverview(gateway);
    await bookingsCard();

    const bookings = screen.getByText('Bookings today').closest('.yc-kpi') as HTMLElement;
    expect(
      within(bookings).getByText('2 cancelled: the guests are blocked for no-shows'),
    ).toBeTruthy();
  });

  it('says nothing of the block when it cancelled nothing today', async () => {
    renderOverview(mockGateway());
    await bookingsCard();
    const bookings = screen.getByText('Bookings today').closest('.yc-kpi') as HTMLElement;
    expect(within(bookings).queryByText(/blocked for no-shows/u)).toBeNull();
  });

  it("shows today's four numbers from the overview read", async () => {
    const gateway = mockGateway();
    renderOverview(gateway);
    const overview = await gateway.getBranchOverview(BRANCH);
    await bookingsCard();

    const bookings = screen.getByText('Bookings today').closest('.yc-kpi') as HTMLElement;
    expect(within(bookings).getByText(String(overview.bookings.total))).toBeTruthy();

    const room = screen.getByText('In the room now', { selector: '.yc-kpi-l' }).closest('a')!;
    expect(room.getAttribute('href')).toBe('/venue/floorplan');
    expect(within(room).getByText(`${overview.inRoom.people} people`)).toBeTruthy();

    const tabs = screen.getByText('Open tabs').closest('.yc-kpi') as HTMLElement;
    expect(within(tabs).getByText(/still unpaid$/u)).toBeTruthy();
    // Sunday the mock is shut all day: the takings count from midnight.
    const revenue = screen.getByText('Revenue today').closest('.yc-kpi') as HTMLElement;
    expect(within(revenue).getByText(/^↑ \d/u)).toBeTruthy();
    // The change waiting for an answer is said with the confirmed it is counted in.
    expect(
      within(bookings).getByText(
        `${overview.bookings.confirmed} confirmed (${overview.bookings.pendingChanges} asking to change) · ${overview.bookings.pendingApproval} waiting`,
      ),
    ).toBeTruthy();
  });

  it('draws the load by hour with the seats as its line, every hour said', async () => {
    const gateway = mockGateway();
    renderOverview(gateway);
    const overview = await gateway.getBranchOverview(BRANCH);
    const chart = await screen.findByRole('img', { name: /^Booked people by hour/u });

    expect(chart.getAttribute('aria-label')).toContain(
      `${overview.load.capacity} seats in the room, now 18:00:`,
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

  it('says where the takings are counted from when the day opens after midnight', async () => {
    const base = mockGateway();
    const overview = await base.getBranchOverview(BRANCH);
    renderOverview({
      ...base,
      getBranchOverview: async () => ({
        ...overview,
        revenue: { ...overview.revenue, sinceUtc: '2026-10-18T06:00:00Z' },
      }),
    });
    expect(await screen.findByText('Revenue since 10:00')).toBeTruthy();
  });

  it('draws an hour that only has requests waiting, and says so, rather than "nobody booked"', async () => {
    const base = mockGateway();
    const overview = await base.getBranchOverview(BRANCH);
    renderOverview({
      ...base,
      getBranchOverview: async () => ({
        ...overview,
        load: {
          capacity: 30,
          hours: [
            { hour: 19, people: 0, pendingPeople: 4 },
            { hour: 20, people: 0, pendingPeople: 0 },
          ],
        },
      }),
    });
    const chart = await screen.findByRole('img', { name: /^Booked people by hour/u });
    expect(chart.getAttribute('aria-label')).toContain('19:00: 0, and 4 waiting');
    expect(chart.querySelector('.yc-lb.is-pending')).not.toBeNull();
    expect(
      screen.getByText(/^Only requests waiting for your answer so far\. The light part waits/u),
    ).toBeTruthy();
    expect(screen.queryByText('Nobody is booked in yet today.')).toBeNull();
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
  /** The mock's evening with the grace up, so a late party may be marked a no-show. */
  function graceUp(base: ConsoleGateway): ConsoleGateway {
    return {
      ...base,
      getBranchOverview: async (branchId) => ({
        ...(await base.getBranchOverview(branchId)),
        graceMinutes: 0,
      }),
    };
  }

  async function rowsOf(gateway: ConsoleGateway) {
    return (await gateway.getBranchOverview(BRANCH)).todayBookings;
  }

  const firstIn = (rows: readonly OverviewBooking[], state: string) =>
    rows.find((row) => overviewRowState(row, EVENING) === state)!;

  async function openMenu(
    user: ReturnType<typeof userEvent.setup>,
    card: HTMLElement,
    name: string,
  ) {
    await user.click(within(rowOf(card, name)).getByRole('button', { name: /^Actions for/u }));
    return screen.getByRole('menu');
  }

  it('filters to what is coming up, the room now, or everything', async () => {
    const gateway = mockGateway();
    const { user } = renderOverview(gateway);
    const card = await bookingsCard();
    const rows = await rowsOf(gateway);
    const named = (state: string) => firstIn(rows, state).guestName;

    // Coming up: waiting, confirmed (a change waiting too) and late — not the seated or the finished.
    expect(
      within(card).getByRole('button', { name: 'Coming up' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(within(card).getByText(named('late'))).toBeTruthy();
    expect(within(card).getByText(named('confirmed'))).toBeTruthy();
    expect(within(card).getByText(named('changeRequested'))).toBeTruthy();
    expect(within(card).queryByText(named('seated'))).toBeNull();
    expect(within(card).queryByText(named('completed'))).toBeNull();

    await user.click(within(card).getByRole('button', { name: 'In the room now' }));
    expect(within(card).getByText(named('seated'))).toBeTruthy();
    expect(within(card).getByText(named('late'))).toBeTruthy();
    expect(within(card).queryByText(named('confirmed'))).toBeNull();

    await user.click(within(card).getByRole('button', { name: 'All' }));
    expect(within(card).getByText(named('completed'))).toBeTruthy();
  });

  it('says how late a late party is and when the app asked, and holds the no-show until the grace is up', async () => {
    const base = mockGateway();
    const gateway: ConsoleGateway = {
      ...base,
      getBranchOverview: async (branchId) => ({
        ...(await base.getBranchOverview(branchId)),
        graceMinutes: 30,
      }),
    };
    const { user } = renderOverview(gateway);
    const card = await bookingsCard();
    const late = firstIn(await rowsOf(gateway), 'late');
    const row = rowOf(card, late.guestName);

    expect(within(row).getByText(/^\d+ min late$/u)).toBeTruthy();
    // The mock's nudge went out ten minutes after the start: it asked.
    expect(within(row).getByText(/^The app asked at \d\d:\d\d$/u)).toBeTruthy();
    // Twelve minutes late with thirty of grace: their table is still theirs.
    const menu = await openMenu(user, card, late.guestName);
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Mark seated']);
  });

  it('says the app will ask, rather than that it asked, while the nudge is still due', async () => {
    const base = mockGateway();
    const rows = await rowsOf(base);
    const late = firstIn(rows, 'late');
    renderOverview({
      ...base,
      getBranchOverview: async (branchId) => {
        const overview = await base.getBranchOverview(branchId);
        return {
          ...overview,
          todayBookings: overview.todayBookings.map((row) =>
            row.id === late.id ? { ...row, lateNudgeSent: false } : row,
          ),
        };
      },
    });
    const row = rowOf(await bookingsCard(), late.guestName);
    expect(within(row).getByText(/^The app will ask at \d\d:\d\d$/u)).toBeTruthy();
    expect(within(row).queryByText(/^The app asked/u)).toBeNull();
  });

  it('offers nothing on a booking whose change waits, or whose status this build does not know', async () => {
    const base = mockGateway();
    const rows = await rowsOf(base);
    const changing = firstIn(rows, 'changeRequested');
    const odd = firstIn(rows, 'confirmed');
    renderOverview({
      ...base,
      getBranchOverview: async (branchId) => {
        const overview = await base.getBranchOverview(branchId);
        return {
          ...overview,
          todayBookings: overview.todayBookings.map((row) =>
            row.id === odd.id ? { ...row, status: 'unknown' as const } : row,
          ),
        };
      },
    });
    const card = await bookingsCard();
    const changeRow = rowOf(card, changing.guestName);
    expect(within(changeRow).getByText('Change requested')).toBeTruthy();
    expect(within(changeRow).getByText('Answer it in the card above')).toBeTruthy();
    expect(within(changeRow).queryByRole('button', { name: /^Actions/u })).toBeNull();

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(within(card).getByRole('button', { name: 'All' }));
    const oddRow = rowOf(card, odd.guestName);
    expect(within(oddRow).getByText('Unknown')).toBeTruthy();
    expect(within(oddRow).queryByRole('button', { name: /^Actions/u })).toBeNull();
  });

  it('seats a late party from the menu with the keyboard, says so, and hands the focus back', async () => {
    const gateway = graceUp(mockGateway());
    const act = vi.spyOn(gateway, 'actOnBooking');
    const { user } = renderOverview(gateway);
    const card = await bookingsCard();
    const late = firstIn(await rowsOf(gateway), 'late');
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

  it('offers Seat only when the table is free, and says why not, keeping Cancel', async () => {
    const base = mockGateway();
    const upcoming = firstIn(await rowsOf(base), 'confirmed');
    const act = vi.fn(base.actOnBooking);
    const { user } = renderOverview({
      ...base,
      actOnBooking: act,
      getBranchOverview: async (branchId) => {
        const overview = await base.getBranchOverview(branchId);
        return {
          ...overview,
          todayBookings: overview.todayBookings.map((row) =>
            row.id === upcoming.id ? { ...row, tableStatus: 'occupied' as const } : row,
          ),
        };
      },
    });
    const card = await bookingsCard();

    const menu = await openMenu(user, card, upcoming.guestName);
    const seat = within(menu).getByRole('menuitem', { name: /^Mark seated/u });
    expect(seat.getAttribute('aria-disabled')).toBe('true');
    expect(seat.textContent).toContain(`Table ${upcoming.tableLabel} is taken right now`);
    // Still in the menu's keyboard order, and does nothing when chosen.
    await waitFor(() => expect(document.activeElement).toBe(seat));
    await user.keyboard('{Enter}');
    expect(act).not.toHaveBeenCalled();
    const cancel = within(screen.getByRole('menu')).getByRole('menuitem', {
      name: 'Cancel the booking',
    });
    expect(cancel.getAttribute('aria-disabled')).toBeNull();
  });

  it('says the table is taken when the server refuses a seat as not possible for the table', async () => {
    const base = mockGateway();
    const { user } = renderOverview({
      ...base,
      actOnBooking: () =>
        Promise.reject(
          new InvalidTransitionError({
            url: 'mock://seat',
            problem: {
              type: 'about:blank',
              title: 'Not a legal transition',
              status: 422,
              detail: 'Cannot seatReservation a table that is occupied.',
              code: 'invalid-table-transition',
              traceId: 'mock',
            },
          }),
        ),
    });
    const card = await bookingsCard();
    const upcoming = firstIn(await rowsOf(base), 'confirmed');

    await user.click(
      within(await openMenu(user, card, upcoming.guestName)).getByRole('menuitem', {
        name: 'Mark seated',
      }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      `Table ${upcoming.tableLabel} is taken right now`,
    );
  });

  it('finishes a sitting naming its booking', async () => {
    const gateway = mockGateway();
    const act = vi.spyOn(gateway, 'actOnBooking');
    const { user } = renderOverview(gateway);
    const card = await bookingsCard();
    const seated = firstIn(await rowsOf(gateway), 'seated');

    await user.click(within(card).getByRole('button', { name: 'In the room now' }));
    const menu = await openMenu(user, card, seated.guestName);
    await user.click(within(menu).getByRole('menuitem', { name: 'Finish · free the table' }));

    await waitFor(() =>
      expect(act).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'finish',
          reservationId: seated.id,
          tableId: seated.tableId,
        }),
      ),
    );
    expect(await screen.findByText(`Table ${seated.tableLabel} is free`)).toBeTruthy();
  });

  it('holds a no-show for its undo, sends nothing if undone, and sends it once the undo lapses', async () => {
    const gateway = graceUp(mockGateway());
    const act = vi.spyOn(gateway, 'actOnBooking');
    const { user } = renderOverview(gateway);
    const card = await bookingsCard();
    const late = firstIn(await rowsOf(gateway), 'late');

    await user.click(
      within(await openMenu(user, card, late.guestName)).getByRole('menuitem', {
        name: 'No-show · free the table',
      }),
    );
    expect(await screen.findByText(`Marking ${late.guestName} as a no-show`)).toBeTruthy();
    // Undo takes the focus, and nothing has gone to the server.
    const undo = screen.getByRole('button', { name: 'Undo' });
    await waitFor(() => expect(document.activeElement).toBe(undo));
    expect(act).not.toHaveBeenCalled();
    await user.click(undo);
    expect(await screen.findByText(`Nothing was sent for ${late.guestName}`)).toBeTruthy();
    await vi.advanceTimersByTimeAsync(TOAST_UNDO_MS + 1000);
    expect(act).not.toHaveBeenCalled();
    expect(within(rowOf(card, late.guestName)).getByText(/min late$/u)).toBeTruthy();

    // Again, and let it lapse: it is sent, and said.
    await user.click(
      within(await openMenu(user, card, late.guestName)).getByRole('menuitem', {
        name: 'No-show · free the table',
      }),
    );
    expect(within(rowOf(card, late.guestName)).getByText('No-show')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(TOAST_UNDO_MS + 100);
    await waitFor(() =>
      expect(act).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'noShow', reservationId: late.id }),
      ),
    );
    expect(
      await screen.findByText(new RegExp(`^${late.guestName} marked as a no-show`, 'u')),
    ).toBeTruthy();
  });

  it('sends a held cancellation at once when the page is left, rather than losing it', async () => {
    const gateway = mockGateway();
    const act = vi.spyOn(gateway, 'actOnBooking');
    const { user } = renderOverview(gateway);
    const card = await bookingsCard();
    const upcoming = firstIn(await rowsOf(gateway), 'confirmed');

    await user.click(
      within(await openMenu(user, card, upcoming.guestName)).getByRole('menuitem', {
        name: 'Cancel the booking',
      }),
    );
    expect(act).not.toHaveBeenCalled();
    cleanup();
    // At once, not when the undo would have lapsed: `vi.waitFor` moves no fake timer.
    await vi.waitFor(
      () =>
        expect(act).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'cancel', reservationId: upcoming.id }),
        ),
      { timeout: 1000 },
    );
  });

  it('sends a held no-show at once when the tab is hidden', async () => {
    const gateway = graceUp(mockGateway());
    const act = vi.spyOn(gateway, 'actOnBooking');
    const { user } = renderOverview(gateway);
    const card = await bookingsCard();
    const late = firstIn(await rowsOf(gateway), 'late');

    await user.click(
      within(await openMenu(user, card, late.guestName)).getByRole('menuitem', {
        name: 'No-show · free the table',
      }),
    );
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockRestore();
    await vi.waitFor(() => expect(act).toHaveBeenCalledTimes(1), { timeout: 1000 });
  });

  it('keeps each row busy on its own: a second row acts while the first is in flight', async () => {
    const base = mockGateway();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const act = vi.fn(async (command: Parameters<ConsoleGateway['actOnBooking']>[0]) => {
      if (command.kind === 'seat') await gate;
      return base.actOnBooking(command);
    });
    const { user } = renderOverview({ ...base, actOnBooking: act });
    const card = await bookingsCard();
    const rows = await rowsOf(base);
    const late = firstIn(rows, 'late');
    const seated = firstIn(rows, 'seated');

    await user.click(
      within(await openMenu(user, card, late.guestName)).getByRole('menuitem', {
        name: 'Mark seated',
      }),
    );
    // In flight: that row shows it, and offers nothing more.
    const busyRow = rowOf(card, late.guestName);
    expect(busyRow.getAttribute('aria-busy')).toBe('true');
    expect(within(busyRow).queryByRole('button', { name: /^Actions/u })).toBeNull();

    await user.click(within(card).getByRole('button', { name: 'In the room now' }));
    await user.click(
      within(await openMenu(user, card, seated.guestName)).getByRole('menuitem', {
        name: 'Finish · free the table',
      }),
    );
    await waitFor(() => expect(act).toHaveBeenCalledTimes(2));
    release();
    expect(await screen.findByText(`${late.guestName} is seated`)).toBeTruthy();
  });

  it("says a refusal in the console's words, never the server's", async () => {
    const base = mockGateway();
    const english = "Table 3 is not LUA2's sitting any more.";
    const { user } = renderOverview({
      ...base,
      actOnBooking: () =>
        Promise.reject(
          new ConcurrencyConflictError({
            url: 'mock://free',
            problem: {
              type: 'about:blank',
              title: 'Conflict',
              status: 409,
              detail: english,
              code: 'table-sitting-changed',
              traceId: 'mock',
            },
          }),
        ),
    });
    const card = await bookingsCard();
    const seated = firstIn(await rowsOf(base), 'seated');

    await user.click(within(card).getByRole('button', { name: 'In the room now' }));
    await user.click(
      within(await openMenu(user, card, seated.guestName)).getByRole('menuitem', {
        name: 'Finish · free the table',
      }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'Another party sits at that table now, so nothing was ended.',
    );
    expect(alert.textContent).not.toContain(english);
  });

  it('says a repeat was already done, with what the booking is', async () => {
    const base = mockGateway();
    const { user } = renderOverview({
      ...base,
      actOnBooking: async (command) => ({
        ...(await base.actOnBooking(command)),
        wasReplay: true,
        status: 'cancelledByVenue' as const,
      }),
    });
    const card = await bookingsCard();
    const late = firstIn(await rowsOf(base), 'late');

    await user.click(
      within(await openMenu(user, card, late.guestName)).getByRole('menuitem', {
        name: 'Mark seated',
      }),
    );
    expect(
      await screen.findByText(`Already done before: ${late.guestName} · Cancelled`),
    ).toBeTruthy();
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
      name: 'What is still left to set up',
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

describe("the guest's record and a no-show undone, on today's bookings", () => {
  async function openMenu(
    user: ReturnType<typeof userEvent.setup>,
    card: HTMLElement,
    name: string,
  ) {
    await user.click(within(rowOf(card, name)).getByRole('button', { name: /^Actions for/u }));
    return screen.getByRole('menu');
  }

  const line = (row: HTMLElement) => row.querySelector<HTMLElement>('.guest-record');

  /** The mock's late party, read as marked a no-show. */
  async function withNoShow(base: ConsoleGateway) {
    const late = (await base.getBranchOverview(BRANCH)).todayBookings.find(
      (row) => overviewRowState(row, EVENING) === 'late',
    )!;
    const gateway: ConsoleGateway = {
      ...base,
      getBranchOverview: async (branchId) => {
        const overview = await base.getBranchOverview(branchId);
        return {
          ...overview,
          todayBookings: overview.todayBookings.map((row) =>
            row.id === late.id ? { ...row, status: 'noShow' as const } : row,
          ),
        };
      },
    };
    return { gateway, late };
  }

  it('says how each guest kept their bookings beside the name, and nothing for a booking staff made', async () => {
    const { user } = renderOverview();
    const card = await bookingsCard();
    await user.click(within(card).getByRole('button', { name: 'All' }));

    expect(line(rowOf(card, 'Narine T.'))!.textContent).toBe(
      "Guest's record, last 12 months, all venues: 3 bookings · 2 came · 0 no-shows · 1 late cancellation · 1 takeaway order not collected",
    );
    expect(line(rowOf(card, 'Սոնա Վ.'))!.textContent).toMatch(/: New guest$/u);
    // Booked by phone at the venue: no proved account, nothing said either way.
    expect(line(rowOf(card, 'Gor A.'))).toBeNull();
    // Seated: the record comes on pending and confirmed bookings only.
    expect(line(rowOf(card, 'Hovhannes K.'))).toBeNull();

    // Late, and blocked since: said first, with when it ends.
    const blocked = line(rowOf(card, 'Արմեն Դ.'))!;
    expect(blocked.className).toContain('is-blocked');
    expect(within(blocked).getByText(/^Blocked until .+, \d\d:\d\d$/u)).toBeTruthy();
    expect(blocked.textContent).toMatch(/· 5 bookings · 2 came · 3 no-shows$/u);
  });

  it('offers to undo a no-show from its row, sends it at once, and says so', async () => {
    const { gateway, late } = await withNoShow(mockGateway());
    const act = vi.spyOn(gateway, 'actOnBooking').mockResolvedValue({
      kind: 'undoNoShow',
      reservationId: late.id,
      status: 'confirmed',
      wasReplay: false,
      tableLabel: late.tableLabel,
      tableFreed: false,
      outstandingDram: null,
    });
    const { user } = renderOverview(gateway);
    const card = await bookingsCard();
    await user.click(within(card).getByRole('button', { name: 'All' }));

    const row = rowOf(card, late.guestName);
    expect(within(row).getByText('No-show')).toBeTruthy();
    expect(
      within(row).getByText(/^Marked by mistake\? It can be undone until 05:00$/u),
    ).toBeTruthy();

    await user.click(
      within(await openMenu(user, card, late.guestName)).getByRole('menuitem', {
        name: 'Undo the no-show',
      }),
    );
    // Not held for an undo of its own: it is the undo.
    await waitFor(() =>
      expect(act).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'undoNoShow', reservationId: late.id }),
      ),
    );
    expect(
      await screen.findByText(`${late.guestName}'s no-show is undone · the booking stands again`),
    ).toBeTruthy();
  });

  it('says when it is too late to undo a no-show', async () => {
    const { gateway, late } = await withNoShow(mockGateway());
    vi.spyOn(gateway, 'actOnBooking').mockRejectedValue(
      new NoShowUndoWindowClosedError({
        url: 'mock://undo',
        undoableUntilUtc: '2026-10-19T01:00:00Z',
      }),
    );
    const { user } = renderOverview(gateway);
    const card = await bookingsCard();
    await user.click(within(card).getByRole('button', { name: 'All' }));

    await user.click(
      within(await openMenu(user, card, late.guestName)).getByRole('menuitem', {
        name: 'Undo the no-show',
      }),
    );
    expect(
      await screen.findByText(
        'Too late to undo: a no-show can be undone until 05:00 the next morning.',
      ),
    ).toBeTruthy();
  });
});
