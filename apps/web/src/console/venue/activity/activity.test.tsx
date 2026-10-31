// @vitest-environment jsdom
import { ApiError, createConsoleMockGateway, parseProblem, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../ui/toast';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { PersonScreen } from '../staff/PersonScreen';
import { StaffScreen } from '../staff/StaffScreen';
import { ActivityScreen } from './ActivityScreen';
import { TimelineScreen } from './TimelineScreen';

/**
 * Activity history and staff results in the console (2026-10-24, the Main,
 * Team, Person and Check boards), against the real console mock with the
 * boards' day seeded at Northern Avenue: the feed and its filters in the
 * address, the detail pane, a bill's timeline, the Results table and one
 * person's page.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
  // jsdom has no object URLs: the CSV download is watched instead.
  URL.createObjectURL = vi.fn(() => 'blob:csv');
  URL.revokeObjectURL = vi.fn();
});

// The boards' day ends two minutes before the mock's clock, so in the small
// hours most of it falls on yesterday and today's feed runs short. Hold the
// clock at an evening in Yerevan: only Date, the timers stay real for waitFor.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-25T20:30:00+04:00') });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const NORTH = 'b-lumen-north';
const ARAM = `${NORTH}-act-aram`;

const seen = { location: '' };
function LocationProbe() {
  const here = useLocation();
  useEffect(() => {
    seen.location = `${here.pathname}${here.search}`;
  });
  return null;
}
const params = () => new URLSearchParams(seen.location.split('?')[1] ?? '');

function gateway(): ConsoleGateway {
  return createConsoleMockGateway({ latencyMs: 0, role: 'owner', seedActivity: true });
}

function renderAt(path: string, console: ConsoleGateway = gateway()) {
  const harness = createConsoleHarness({ gateway: console });
  const context = {
    branchId: NORTH,
    branchName: 'Northern Avenue',
    timeZoneId: 'Asia/Yerevan',
    branchCount: 3,
    canRollUpVenue: true,
    canRelocate: true,
  };
  render(
    harness.wrap(
      <ToastProvider>
        <LocationProbe />
        <Routes>
          <Route path="/venue" element={<Outlet context={context} />}>
            <Route path="history" element={<ActivityScreen />} />
            <Route path="history/:subjectType/:subjectId" element={<TimelineScreen />} />
            <Route path="staff" element={<StaffScreen />} />
            <Route path="staff/:staffMemberId" element={<PersonScreen />} />
          </Route>
        </Routes>
      </ToastProvider>,
      path,
    ),
  );
  return console;
}

const feed = () =>
  screen.findByRole('table', { name: 'Who did what, newest first' }, { timeout: 8000 });
const rows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1);

describe('History', () => {
  it('has the board’s filters and columns, and opens on the newest action with its detail', async () => {
    renderAt('/venue/history');
    expect(screen.getByRole('heading', { level: 1, name: 'History' })).toBeTruthy();
    const filters = screen.getByRole('search', { name: 'Filter the history' });
    expect(within(filters).getByLabelText('Day')).toBeTruthy();
    expect(within(filters).getByLabelText('Who')).toBeTruthy();
    expect(
      within(filters).getByRole('searchbox', { name: 'Table, guest, T-code or dish' }),
    ).toBeTruthy();
    const kinds = screen.getByRole('group', { name: 'Kind' });
    expect(within(kinds).getAllByRole('button')[0]!.getAttribute('aria-pressed')).toBe('true');

    const table = await feed();
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Time', 'Who', 'What they did', 'From where']);
    const [first] = rows(table);
    expect(within(first!).getByText('Aram P.')).toBeTruthy();
    const what = within(first!).getByRole('rowheader');
    expect(what.textContent).toContain('Replied to Անի Մ.');
    expect(within(what).getByRole('button').getAttribute('aria-current')).toBe('true');

    const detail = screen.getByRole('complementary', { name: /Replied to Անի Մ\./u });
    expect(within(detail).getByText('Aram P.')).toBeTruthy();
    expect(within(detail).getByRole('link', { name: 'Open the booking' })).toBeTruthy();
  });

  it('shows what a discount changed and why, and keeps the open entry in the address', async () => {
    const user = userEvent.setup();
    renderAt('/venue/history');
    const table = await feed();
    const discount = within(table).getByRole('button', { name: /Discount 10%/u });
    await user.click(discount);
    const detail = screen.getByRole('complementary', { name: 'Discount 10%' });
    expect(within(detail).getByText('What changed')).toBeTruthy();
    expect(within(detail).getByText(/18,400/u)).toBeTruthy();
    expect(within(detail).getByText(/16,560/u)).toBeTruthy();
    expect(within(detail).getByText('Reason: “Մշտական հյուր”')).toBeTruthy();
    expect(params().get('entry')).toBeTruthy();
    expect(within(detail).getByRole('link', { name: 'Open the bill' })).toBeTruthy();
  });

  it('filters by kind, by Time to Eat and by search, each in the address', async () => {
    const user = userEvent.setup();
    renderAt('/venue/history');
    await feed();
    await user.click(screen.getByRole('button', { name: 'Payment & discount' }));
    await waitFor(() => expect(params().get('kind')).toBe('payment'));
    await waitFor(() =>
      expect(
        rows(screen.getByRole('table')).every((row) =>
          row.textContent!.includes('Payment & discount'),
        ),
      ).toBe(true),
    );

    await user.selectOptions(screen.getByLabelText('Who'), 'system');
    await waitFor(() => expect(params().get('who')).toBe('system'));
    // Time to Eat took no payment today: the empty state offers to clear the filters.
    expect(await screen.findByText('Nothing matches the search or the filters.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear the filters' }));
    await waitFor(() => expect(seen.location).toBe('/venue/history'));

    await user.type(screen.getByRole('searchbox'), 'T-482{Enter}');
    await waitFor(() => expect(params().get('q')).toBe('T-482'));
    // Placed by the guest, accepted by Lilit: the code's two entries.
    await waitFor(() => expect(rows(screen.getByRole('table'))).toHaveLength(2));
  });

  it('reads the filters from the address', async () => {
    renderAt('/venue/history?who=system');
    const table = await feed();
    // Time to Eat's own: an automatic decline, and a tablet connected with a code.
    await waitFor(() => expect(rows(table)).toHaveLength(2));
    expect(within(table).getAllByText('Time to Eat')).toHaveLength(2);
    const what = within(table)
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent);
    expect(
      what.some((text) => text?.includes('Declined automatically · nobody answered in time')),
    ).toBe(true);
    expect(what.some((text) => text?.includes('Սրահի պլանշետ connected · code by Nare P.'))).toBe(
      true,
    );
  });

  it('says a link with a bad day cannot be read, and offers the way back to today', async () => {
    const user = userEvent.setup();
    renderAt('/venue/history?date=2026-13-45&kind=payment');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The history could not be filtered like that.',
    );
    // The bad day is not pushed into the input as text it refuses.
    expect((screen.getByLabelText('Day') as HTMLInputElement).value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Clear the filters' }));
    await feed();
    expect(params().toString()).toBe('');
  });

  it('says who paired and unpaired phones, from whose phone, in the reader’s words', async () => {
    renderAt('/venue/history?kind=device');
    const table = await feed();
    await waitFor(() => expect(rows(table).length).toBeGreaterThanOrEqual(3));
    const paired = rows(table).find((row) => row.textContent?.includes('Paired their phone'))!;
    expect(paired).toBeTruthy();
    expect(within(paired).getByText('Lilit A.')).toBeTruthy();
    expect(within(paired).getByText(/^Lilit’s phone$/u)).toBeTruthy();
    const unpaired = rows(table).find((row) => row.textContent?.includes('Unpaired Gor'))!;
    expect(within(unpaired).getByText('Console')).toBeTruthy();
  });

  it('downloads the server’s CSV for the filters on screen', async () => {
    const user = userEvent.setup();
    const console = gateway();
    const exportCsv = vi.spyOn(console, 'exportActivityCsv');
    renderAt('/venue/history?kind=payment', console);
    await feed();
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() =>
      expect(exportCsv).toHaveBeenCalledWith(
        NORTH,
        expect.objectContaining({ category: 'payment' }),
      ),
    );
    expect(await screen.findByText('The file is downloading.')).toBeTruthy();
  });

  it('says a day too large for one file with the server’s limit, not "try again"', async () => {
    const user = userEvent.setup();
    const console = gateway();
    vi.spyOn(console, 'exportActivityCsv').mockRejectedValue(
      new ApiError('Export too large', {
        status: 422,
        url: '/api/branches/b/activity.csv',
        problem: parseProblem({
          status: 422,
          code: 'activity-export-too-large',
          context: { rows: 20_412, maxRows: 20_000 },
        }),
      }),
    );
    renderAt('/venue/history', console);
    await feed();
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(
      await screen.findByText(
        'That day has more than 20,000 entries for one file. Narrow it by a person, a kind or a search.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('The file could not be made. Try again.')).toBeNull();
  });
});

describe('a bill’s timeline', () => {
  it('tells table 4’s story with who did what, and its dishes with who took and voided each', async () => {
    const user = userEvent.setup();
    const console = gateway();
    const today = new Date();
    const page = await console.listActivity(NORTH, {
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yerevan' }).format(today),
      who: { kind: 'everyone' },
      category: 'all',
      q: '4',
    });
    const opened = page.items.find((entry) => entry.action === 'table.tab-opened')!;
    renderAt(`/venue/history/tab/${opened.subject.id}`, console);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Table 4 · bill' }, { timeout: 8000 }),
    ).toBeTruthy();
    expect(screen.getByText(/waiter: Aram P\. \(from Lilit A\. at/u)).toBeTruthy();
    const steps = screen.getByRole('list');
    // The sitting's every entry: the seat came before the bill.
    expect(within(steps).getAllByRole('listitem')).toHaveLength(10);
    expect(within(steps).getByText('Reason: “Հյուրը փոխեց պատվերը”')).toBeTruthy();

    const people = screen.getByRole('group', { name: 'Filter by person' });
    await user.click(within(people).getByRole('button', { name: 'Nare' }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);

    const dishes = screen.getByRole('table', {
      name: 'The bill’s dishes, who took each and who voided it',
    });
    const pork = within(dishes).getByText('voided: Nare P.').closest('tr')!;
    expect(within(pork).getByText('Aram P.', { exact: false })).toBeTruthy();
    expect(within(dishes).getByText('21,300 ֏', { exact: false })).toBeTruthy();
    expect(screen.getByText('Paid 22,300 ֏ (1,000 ֏ service).')).toBeTruthy();
  });

  it('marks a booking by its table, or — with none yet — by an icon that says so', async () => {
    const booking = {
      reservationId: 'res-1',
      code: 'B-1',
      guestName: 'Տիգրան Հովհաննիսյան',
      partySize: 4,
      localDate: '2026-10-25',
      localTime: '20:00',
      status: 1,
      tableLabel: '',
      tabId: null,
    };
    const timeline = {
      subject: { type: 'reservation' as const, id: 'res-1' },
      tab: null,
      booking,
      takeaway: null,
      lines: [],
      entries: [],
      people: [],
    };
    const console = gateway();
    vi.spyOn(console, 'getActivityTimeline').mockResolvedValue(timeline);
    renderAt('/venue/history/reservation/res-1', console);
    await screen.findByRole('heading', { level: 1 }, { timeout: 8000 });
    const head = document.querySelector<HTMLElement>('.yc-tl-head')!;
    const mark = within(head).getByRole('img', { name: 'No table yet' });
    expect(mark.textContent).toBe('');
    expect(head.querySelector('.yc-tl-mark')!.textContent?.trim()).not.toBe('·');
    cleanup();

    vi.spyOn(console, 'getActivityTimeline').mockResolvedValue({
      ...timeline,
      booking: { ...booking, tableLabel: '9' },
    });
    renderAt('/venue/history/reservation/res-1', console);
    await screen.findByRole('heading', { level: 1 }, { timeout: 8000 });
    const withTable = document.querySelector<HTMLElement>('.yc-tl-mark')!;
    expect(withTable.textContent).toBe('9');
    expect(screen.queryByRole('img', { name: 'No table yet' })).toBeNull();
  });

  it('says "still open" only for a bill that is, never one closed unpaid', async () => {
    const tab = {
      tabId: 'tab-x',
      tableSessionId: 'ts-x',
      tableLabel: '3',
      partySize: 2,
      openedAtUtc: '2026-10-24T14:00:00Z',
      seatedAtUtc: '2026-10-24T14:00:00Z',
      closedAtUtc: '2026-10-24T15:00:00Z',
      status: 'closed' as const,
      subtotalAmd: 9_000,
      serviceChargeAmd: 0,
      totalAmd: 9_000,
      paidAmd: 0,
      tipsAmd: 0,
      servers: [],
    };
    const timeline = {
      subject: { type: 'tab' as const, id: 'tab-x' },
      tab,
      booking: null,
      takeaway: null,
      lines: [],
      entries: [],
      people: [],
    };
    const console = gateway();
    const read = vi.spyOn(console, 'getActivityTimeline').mockResolvedValue(timeline);
    renderAt('/venue/history/tab/tab-x', console);
    await screen.findByRole('heading', { level: 1, name: 'Table 3 · bill' }, { timeout: 8000 });
    expect(screen.queryByText('still open')).toBeNull();
    cleanup();

    read.mockResolvedValue({ ...timeline, tab: { ...tab, status: 'open', closedAtUtc: null } });
    renderAt('/venue/history/tab/tab-x', console);
    expect(await screen.findByText('still open', undefined, { timeout: 8000 })).toBeTruthy();
  });

  it('says so when the subject is not there', async () => {
    renderAt('/venue/history/tab/nope');
    expect(
      await screen.findByText('This bill or booking is not in the history.', undefined, {
        timeout: 8000,
      }),
    ).toBeTruthy();
  });
});

describe('Staff → Results', () => {
  it('lists each person’s results with totals, sorted by sales, sortable by any column', async () => {
    const user = userEvent.setup();
    renderAt('/venue/staff?tab=results');
    expect(
      (await screen.findByRole('tab', { name: 'Results' }, { timeout: 8000 })).getAttribute(
        'aria-selected',
      ),
    ).toBe('true');
    const table = await screen.findByRole('table', { name: /^Today, / }, { timeout: 8000 });
    const salesHeader = within(table).getByRole('columnheader', { name: 'Sales' });
    expect(salesHeader.getAttribute('aria-sort')).toBe('descending');
    const names = () =>
      within(table)
        .getAllByRole('rowheader')
        .map((header) => header.querySelector('a')?.textContent ?? header.textContent);
    // Lilit: table 3 and her 12 000 of table 4 before she handed it to Aram.
    expect(names()[0]).toBe('Lilit Avetisyan');
    expect(names().at(-1)).toBe('Total');
    expect(within(table).getByRole('columnheader', { name: 'Declined' })).toBeTruthy();

    await user.click(within(salesHeader).getByRole('button'));
    expect(salesHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(params().get('dir')).toBe('asc');

    const calls = within(table).getByRole('columnheader', { name: 'To a call' });
    await user.click(within(calls).getByRole('button'));
    expect(calls.getAttribute('aria-sort')).toBe('descending');
    expect(salesHeader.hasAttribute('aria-sort')).toBe(false);
    expect(params().get('sort')).toBe('callMedianSeconds');

    await user.click(screen.getByRole('button', { name: '7 days' }));
    expect(params().get('period')).toBe('week');
    expect(await screen.findByRole('table', { name: / – / })).toBeTruthy();
    expect(screen.getByText(/Waiters see only their own results\./u)).toBeTruthy();
    expect(screen.getByText(/matches the revenue report/u)).toBeTruthy();
  });

  it('keeps the People tab as it was', async () => {
    renderAt('/venue/staff');
    expect(
      (await screen.findByRole('tab', { name: 'People' }, { timeout: 8000 })).getAttribute(
        'aria-selected',
      ),
    ).toBe('true');
    expect(await screen.findByRole('tabpanel', { name: 'People' })).toBeTruthy();
  });
});

describe('one person’s page', () => {
  it('shows the figures, sales by day with its numbers, and the lists a page at a time', async () => {
    const user = userEvent.setup();
    renderAt(`/venue/staff/${ARAM}?period=month`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Aram Petrosyan' }, { timeout: 8000 }),
    ).toBeTruthy();
    const figures = screen.getByRole('region', { name: /^Results · / });
    expect(within(figures).getByText('Response to a call')).toBeTruthy();

    const chart = await screen.findByRole('group', { name: /^Sales by day/u });
    const bars = within(chart).getAllByRole('button');
    expect(bars).toHaveLength(30);
    expect(bars.filter((bar) => bar.tabIndex === 0)).toHaveLength(1);
    expect(bars.at(-1)!.getAttribute('aria-label')).toMatch(/: [\d,]+\s֏$/u);
    await user.click(screen.getByRole('button', { name: 'Show the numbers' }));
    expect(screen.getByRole('table', { name: 'Sales by day' })).toBeTruthy();

    const orders = screen.getByRole('tabpanel', { name: /^Orders/u });
    const before = (await within(orders).findAllByRole('row', undefined, { timeout: 8000 })).length;
    await user.click(within(orders).getByRole('button', { name: 'More' }));
    await waitFor(() => expect(within(orders).getAllByRole('row').length).toBeGreaterThan(before));

    await user.click(screen.getByRole('tab', { name: /^Calls/u }));
    const calls = screen.getByRole('tabpanel', { name: /^Calls/u });
    expect(
      (await within(calls).findAllByRole('columnheader', undefined, { timeout: 8000 })).at(-1)!
        .textContent,
    ).toBe('Response');
  });

  it('keeps one bar of the chart tabbable when thirty days narrow to seven', async () => {
    const user = userEvent.setup();
    renderAt(`/venue/staff/${ARAM}?period=month`);
    const chart = await screen.findByRole('group', { name: /^Sales by day/u }, { timeout: 8000 });
    // Walk the roving stop back to day 26 of 30.
    within(chart).getAllByRole('button').at(-1)!.focus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    await user.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() =>
      expect(
        within(screen.getByRole('group', { name: /^Sales by day/u })).getAllByRole('button'),
      ).toHaveLength(7),
    );
    const bars = within(screen.getByRole('group', { name: /^Sales by day/u })).getAllByRole(
      'button',
    );
    // Exactly one stop, on the last day (today).
    expect(bars.filter((bar) => bar.tabIndex === 0)).toEqual([bars.at(-1)]);
  });

  it('says so for somebody who is not on the branch', async () => {
    renderAt('/venue/staff/nobody');
    expect(
      await screen.findByText('This person is not on the staff of this branch.', undefined, {
        timeout: 8000,
      }),
    ).toBeTruthy();
  });
});
