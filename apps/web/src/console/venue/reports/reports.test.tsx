// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportQuery } from '@yalla/api';
import { ToastProvider } from '../../ui/toast';
import { menuItemHref } from '../menuAnchors';
import { revenueCsv } from './csv';
import { ReportsScreen } from './ReportsScreen';
import { createConsoleHarness, initConsoleTestI18n, instrumentedGateway } from './testHarness';

/**
 * The Reports page (venue console Reports artboard).
 *
 * Asserted most insistently: a comparison the server did not send is never
 * rendered, and a range with no data says so rather than drawing zeroes — the
 * two ways a report states something false with total confidence. And the CSV
 * of a section is the numbers the section shows, BOM and all.
 */

/** A Tuesday, so "last week" is a whole finished Monday-to-Sunday. */
const TODAY = new Date('2026-09-08T09:00:00Z');
/** The mock venue's first trading day — `MOCK_LIVE_FROM` in `@yalla/api`. */
const LIVE_FROM = '2026-08-20';
const BRANCH = 'b-lumen-north';

beforeAll(async () => {
  await initConsoleTestI18n();
});

let saved: { name: string; blob: Blob }[] = [];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
  vi.setSystemTime(TODAY);
  saved = [];
  let pending: Blob | null = null;
  // jsdom has no object URLs; the saved file is read off them.
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    configurable: true,
    value: vi.fn((blob: Blob) => {
      pending = blob;
      return 'blob:mock';
    }),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (pending) saved.push({ name: this.download, blob: pending });
    pending = null;
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

function renderReports(
  options: {
    readonly harness?: ReturnType<typeof createConsoleHarness>;
    readonly canRollUpVenue?: boolean;
  } = {},
) {
  const harness = options.harness ?? createConsoleHarness();
  const context = {
    branchId: BRANCH,
    branchName: 'Northern Avenue',
    timeZoneId: 'Asia/Yerevan',
    branchCount: options.canRollUpVenue ? 3 : 1,
    canRollUpVenue: options.canRollUpVenue ?? false,
    canRelocate: false,
  };
  render(
    harness.wrap(
      <ToastProvider>
        <Routes>
          <Route path="/venue" element={<Outlet context={context} />}>
            <Route path="reports" element={<ReportsScreen />} />
            {/* So a never-ordered link has somewhere real to point. */}
            <Route path="menu" element={<div data-testid="menu-editor" />} />
          </Route>
        </Routes>
      </ToastProvider>,
    ),
  );
  return harness;
}

/** The six numbers are the last thing to settle. */
async function waitForSummary() {
  await waitFor(() => expect(screen.getByText('Guests')).toBeTruthy(), { timeout: 5000 });
}

function card(title: string): HTMLElement {
  return screen.getByRole('heading', { level: 2, name: title }).closest('section')!;
}

/** Custom, then the two dates — `to` first, so the range is never backwards on the way. */
async function setRange(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.click(screen.getByRole('button', { name: 'Custom' }));
  fireEvent.change(screen.getByLabelText('To'), { target: { value: to } });
  fireEvent.change(screen.getByLabelText('From'), { target: { value: from } });
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

describe('the range', () => {
  it('opens on last week, and says what it is compared with', async () => {
    renderReports();
    expect(screen.getByRole('button', { name: 'Last week' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByText(/^Aug 31 – Sep 6 · 7 days · Compared with Aug 24 – 30$/u)).toBeTruthy();
    // The dates are asked for only under Custom.
    expect(screen.queryByLabelText('From')).toBeNull();
  });

  it('asks again, once, when the range changes', async () => {
    const seen: { section: string; query: ReportQuery }[] = [];
    const harness = createConsoleHarness({
      gateway: instrumentedGateway({ onQuery: (section, query) => seen.push({ section, query }) }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderReports({ harness });
    await waitForSummary();

    const before = seen.filter((entry) => entry.section === 'revenue').length;
    await user.click(screen.getByRole('button', { name: 'Yesterday' }));
    await waitFor(() => {
      const after = seen.filter((entry) => entry.section === 'revenue');
      expect(after.length).toBe(before + 1);
      expect(after.at(-1)?.query).toMatchObject({ from: '2026-09-07', to: '2026-09-07' });
    });
  });

  it('asks for nothing past 92 days, and says why', async () => {
    const seen: string[] = [];
    const harness = createConsoleHarness({
      gateway: instrumentedGateway({ onQuery: (_section, query) => seen.push(query.from) }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderReports({ harness });
    await waitForSummary();

    await setRange(user, '2026-05-01', '2026-09-01');
    expect(screen.getByRole('alert').textContent).toMatch(/at most 92 days/u);
    expect(screen.getByLabelText('From').getAttribute('aria-invalid')).toBe('true');
    expect(seen).not.toContain('2026-05-01');
  });
});

describe('comparisons', () => {
  it('are said when the server sent them', async () => {
    renderReports();
    await waitForSummary();
    await waitFor(() =>
      expect(screen.getAllByText(/on the previous period/u).length).toBeGreaterThan(0),
    );
  });

  it('are left out entirely when the server sent none', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderReports();
    await waitForSummary();

    // The venue's first week: nothing before it, so nothing to compare with —
    // not "0 %", not "down 100 %".
    await setRange(user, LIVE_FROM, '2026-08-26');
    await waitForSummary();
    await waitFor(() => {
      // No delta, no "level with", no dashed line of zeroes.
      expect(screen.queryByText(/previous period/iu)).toBeNull();
    });
    expect(screen.getByText('Guests')).toBeTruthy();
  });
});

describe('a range with no data', () => {
  it('says so rather than drawing a chart of zeroes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderReports();
    await waitForSummary();

    await setRange(user, '2026-07-01', '2026-07-07');
    await waitFor(() =>
      expect(screen.getAllByText('No data in this range').length).toBeGreaterThan(0),
    );
    expect(screen.queryByRole('button', { name: 'Show table' })).toBeNull();
  });

  it('says which day the numbers start when a range straddles the first one', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderReports();
    await waitForSummary();

    await setRange(user, '2026-08-13', '2026-08-26');
    expect(
      await screen.findByText(`Nothing was recorded before ${LIVE_FROM} in this range.`),
    ).toBeTruthy();
  });
});

describe('revenue', () => {
  it('draws the period against the previous one, with every day as a table one click away', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderReports();
    await waitForSummary();

    const revenue = card('Revenue');
    expect(within(revenue).getByText('Previous period')).toBeTruthy();
    expect(within(revenue).getByRole('group', { name: /^Revenue by day, 7 days/u })).toBeTruthy();
    // Each day's point names its figure and the previous one.
    expect(within(revenue).getByRole('button', { name: /^Mon 31: .*, previous /u })).toBeTruthy();

    const toggle = within(revenue).getByRole('button', { name: 'Show table' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.click(toggle);
    const table = within(revenue).getByRole('table', { name: 'Revenue' });
    expect(within(table).getAllByRole('row')).toHaveLength(8);
    expect(within(table).getByRole('columnheader', { name: 'Previous' })).toBeTruthy();
  });

  it('gives the hours a y-axis and says every bar in words', async () => {
    renderReports();
    await waitForSummary();
    const chart = within(card('Revenue')).getByRole('img', { name: /^Share of revenue by hour:/u });
    expect(chart.getAttribute('aria-label')).toMatch(/19:00 \d+%/u);
  });
});

describe('turn time against policy', () => {
  it('draws the policy line at the branch’s value, and says the policy is out of step', async () => {
    renderReports();
    await waitForSummary();
    const occupancy = card('Occupancy');
    expect(await within(occupancy).findByText('Policy: 120 min')).toBeTruthy();
    expect(
      within(occupancy).getByText(/refusing bookings the table could actually have taken/u),
    ).toBeTruthy();
    expect(within(occupancy).getByText('>240')).toBeTruthy();
  });
});

describe('reservations', () => {
  it('runs the funnel from booked, and buckets the lead time in hours and days', async () => {
    renderReports();
    await waitForSummary();
    const reservations = card('Reservations');
    for (const stage of ['Booked', 'Seated', 'Cancelled', 'Cancelled late', 'No-shows']) {
      expect(within(reservations).getByText(stage)).toBeTruthy();
    }
    for (const bucket of ['<2 h', '<6 h', '<1 day', '<3 days', '<7 days', '≥7 days']) {
      expect(within(reservations).getByText(bucket)).toBeTruthy();
    }
    expect(
      within(reservations).getByRole('link', { name: 'Open the reservation policy' }),
    ).toBeTruthy();
  });
});

describe('never-ordered dishes', () => {
  it('link to their own row in the menu editor', async () => {
    const harness = renderReports();
    await waitForSummary();
    const report = await harness.gateway.getMenuReport({
      branchId: BRANCH,
      from: '2026-08-31',
      to: '2026-09-06',
    });
    const first = report.neverOrdered[0];
    expect(first, 'the fixture menu sells everything; nothing to link').toBeDefined();

    const menu = card('Menu');
    await within(menu).findByText(/dishes nobody ordered/u);
    expect(within(menu).getByRole('link', { name: first!.name }).getAttribute('href')).toBe(
      menuItemHref(first!.menuItemId),
    );
  });
});

describe('scope', () => {
  it('offers no rollup to somebody the server would refuse it', async () => {
    renderReports({ canRollUpVenue: false });
    await waitForSummary();
    expect(screen.queryByRole('group', { name: 'Covering' })).toBeNull();
  });

  it('asks for the rollup when an owner picks all branches, and says so', async () => {
    const seen: ReportQuery[] = [];
    const harness = createConsoleHarness({
      gateway: instrumentedGateway({
        onQuery: (section, query) => {
          if (section === 'revenue') seen.push(query);
        },
      }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderReports({ harness, canRollUpVenue: true });
    await waitForSummary();

    const scope = screen.getByRole('group', { name: 'Covering' });
    await user.click(within(scope).getByRole('button', { name: 'All branches' }));
    await waitFor(() => expect(seen.at(-1)?.rollUpVenue).toBe(true));
    expect(screen.getByText(/^All branches · How the period went/u)).toBeTruthy();
  });
});

describe('the CSV', () => {
  it("is the section's numbers as on screen, with the BOM Excel needs", async () => {
    const harness = renderReports();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await waitForSummary();

    await user.click(within(card('Revenue')).getByRole('button', { name: 'CSV: Revenue' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toBe('revenue-2026-08-31-to-2026-09-06.csv');

    const bytes = await bytesOf(saved[0]!.blob);
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const report = await harness.gateway.getRevenueReport({
      branchId: BRANCH,
      from: '2026-08-31',
      to: '2026-09-06',
    });
    expect(new TextDecoder().decode(bytes.slice(3))).toBe(revenueCsv(report));
    expect(await screen.findByText('Revenue · Last week: the CSV is ready')).toBeTruthy();
  });

  it('writes one file a section for "Export everything"', async () => {
    renderReports();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await waitForSummary();

    const all = screen.getByRole('button', { name: 'Export everything (CSV)' });
    await waitFor(() => expect((all as HTMLButtonElement).disabled).toBe(false));
    await user.click(all);
    await waitFor(() => expect(saved).toHaveLength(5));
    expect(saved.map((file) => file.name.split('-')[0])).toEqual([
      'summary',
      'revenue',
      'reservations',
      'occupancy',
      'menu',
    ]);
    expect(await screen.findByText('5 CSV files are ready for Northern Avenue')).toBeTruthy();
  });
});

describe('a section that fails', () => {
  it('does not blank the ones around it', async () => {
    const harness = createConsoleHarness({ gateway: instrumentedGateway({ failing: ['menu'] }) });
    renderReports({ harness });

    await waitFor(
      () => expect(within(card('Menu')).getByText(/Something went wrong/iu)).toBeTruthy(),
      { timeout: 8000 },
    );
    await waitForSummary();
    expect(within(card('Revenue')).getByRole('button', { name: 'CSV: Revenue' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Policy: 120 min')).toBeTruthy());
    // Its CSV waits for a section that loads.
    expect(
      (within(card('Menu')).getByRole('button', { name: 'CSV: Menu' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
