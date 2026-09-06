// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cloneElement, isValidElement, type ReactElement } from 'react';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReportQuery } from '@yalla/api';
import type * as RechartsModule from 'recharts';
import { ReportsScreen } from './ReportsScreen';
import { menuItemHref } from '../menuAnchors';
import { createConsoleHarness, initConsoleTestI18n, instrumentedGateway } from './testHarness';

/**
 * The reports section — the renewal argument.
 *
 * Two things are asserted here more insistently than anything else, because
 * both are ways a report screen states something false with total confidence:
 * a comparison the server did not send is never rendered, and a range with no
 * data says so rather than drawing a chart of zeroes. The first prints "down
 * 100%" about a week that did not exist; the second tells an owner their venue
 * took no money.
 */

/*
 * Recharts measures its container, and jsdom has no layout — every chart would
 * render as an empty 0x0 box and the policy line would be untestable. The
 * container is replaced with a fixed-size one so the *real* chart, including
 * the real `ReferenceLine`, renders and can be asserted on.
 */
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof RechartsModule>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) =>
      isValidElement(children)
        ? cloneElement(children, { width: 800, height: 300 } as never)
        : null,
  };
});

/** A Tuesday, so "last week" is a whole finished Monday-to-Sunday. */
const TODAY = new Date('2026-09-08T09:00:00Z');

/** The mock venue's first trading day — see `MOCK_LIVE_FROM` in `@yalla/api`. */
const LIVE_FROM = '2026-08-20';

const BRANCH = 'b-lumen-north';

beforeAll(async () => {
  await initConsoleTestI18n();
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
  vi.setSystemTime(TODAY);

  // jsdom implements neither, and the export path uses both.
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    configurable: true,
    value: vi.fn(() => 'blob:mock'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function renderReports(
  options: {
    readonly harness?: ReturnType<typeof createConsoleHarness>;
    readonly branchCount?: number;
  } = {},
) {
  const harness = options.harness ?? createConsoleHarness();
  const context = {
    branchId: BRANCH,
    timeZoneId: 'Asia/Yerevan',
    branchCount: options.branchCount ?? 1,
  };

  render(
    harness.wrap(
      <Routes>
        <Route path="/venue" element={<Outlet context={context} />}>
          <Route path="reports" element={<ReportsScreen />} />
          {/* So a never-ordered link has somewhere real to point. */}
          <Route path="menu" element={<div data-testid="menu-editor" />} />
        </Route>
      </Routes>,
    ),
  );

  return harness;
}

/** Waits for the summary block, which is the last thing to settle. */
async function waitForSummary() {
  await waitFor(() => expect(screen.getByText(/^Covers$/u)).toBeTruthy(), { timeout: 5000 });
}

describe('the range control', () => {
  it('opens on last week', async () => {
    renderReports();

    const lastWeek = screen.getByRole('button', { name: 'Last week' });
    expect(lastWeek.getAttribute('aria-pressed')).toBe('true');

    // Monday to Sunday, finished. Not yesterday (one service, too noisy) and
    // not this month (incomplete, and always a fall against a whole one).
    await waitFor(() => expect(screen.getByText(/2026-08-31 – 2026-09-06/u)).toBeTruthy());
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
});

describe('comparisons', () => {
  it('renders one when the server sent it', async () => {
    renderReports();
    await waitForSummary();

    // Last week has a previous week behind it, so every summary tile that
    // carries a comparable measure states the change.
    await waitFor(() =>
      expect(screen.getAllByText(/on the 7 days before/u).length).toBeGreaterThan(0),
    );
  });

  it('omits the element entirely when the server sent none', async () => {
    renderReports();
    await waitForSummary();

    /*
     * The venue's first week. Its previous week is entirely before the venue
     * traded, so the server sends no comparison — and the rule is that a
     * comparison that was not sent is not rendered. Not "0%", not a dash: a
     * venue's first week did not fall 100%, and printing that is a confident
     * falsehood rather than a rounding.
     */
    setRange(LIVE_FROM, '2026-08-26');

    await waitFor(() => expect(screen.getByText(/2026-08-20 – 2026-08-26/u)).toBeTruthy());
    await waitForSummary();

    await waitFor(() => {
      expect(screen.queryByText(/on the 7 days before/u)).toBeNull();
      expect(screen.queryByText(/\b0%\b/u)).toBeNull();
    });

    // The numbers themselves are still there — it is the comparison that is
    // absent, not the report.
    expect(screen.getByText(/^Covers$/u)).toBeTruthy();
  });
});

describe('a range with no data', () => {
  it('says so rather than drawing a chart of zeroes', async () => {
    renderReports();
    await waitForSummary();

    // Well before the venue opened.
    setRange('2026-07-01', '2026-07-07');

    await waitFor(() =>
      expect(screen.getAllByText('No data in this range').length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText(/Try a wider range/u).length).toBeGreaterThan(0);

    // A zeroed chart would say "your venue took no money", which is a claim
    // about the business rather than about the range.
    expect(screen.queryByRole('button', { name: 'Show table' })).toBeNull();
  });

  it('says which day the numbers start when a range straddles the first one', async () => {
    renderReports();
    await waitForSummary();

    // Starts a week before the venue traded and runs past it.
    setRange('2026-08-13', '2026-08-26');

    await waitFor(() =>
      expect(
        screen.getByText(`Nothing was recorded before ${LIVE_FROM} in this range.`),
      ).toBeTruthy(),
    );
  });
});

describe('turn time against policy', () => {
  it('draws the policy line at the branch’s configured value', async () => {
    renderReports();
    await waitForSummary();

    // The fixture's policy is the 120-minute default, and the marker names it
    // rather than leaving an unlabelled line for somebody to interpret.
    await waitFor(() => expect(screen.getByText('Policy: 120 min')).toBeTruthy());
  });

  it('says the policy is out of step only when the middle sitting runs past it', async () => {
    renderReports();
    await waitForSummary();

    /*
     * The mock's median sits past the 120-minute policy deliberately: this is
     * the one finding in the whole section that a venue cannot get anywhere
     * else, and a fixture where policy and reality agreed would render it
     * never. The sentence has to be the over-policy one, not the within-policy
     * one.
     */
    await waitFor(() =>
      expect(
        screen.getByText(/refusing bookings the table could actually have taken/u),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/inside the 120-minute policy/u)).toBeNull();
  });
});

describe('never-ordered items', () => {
  it('link to their own row in the menu editor', async () => {
    const harness = renderReports();
    await waitForSummary();

    const menuReport = await harness.gateway.getMenuReport({
      branchId: BRANCH,
      from: '2026-08-31',
      to: '2026-09-06',
    });
    const first = menuReport.neverOrdered[0];
    expect(first, 'the fixture menu sells everything; nothing to link').toBeDefined();

    await waitFor(() => expect(screen.getByText(/dishes nobody ordered/u)).toBeTruthy());

    const link = screen.getByRole('link', { name: first!.name });
    // The row's own anchor, not just the menu page.
    expect(link.getAttribute('href')).toBe(menuItemHref(first!.menuItemId));
    expect(link.getAttribute('href')).toContain(first!.menuItemId);
  });
});

describe('scope', () => {
  it('gives a manager with one branch no selector at all', async () => {
    renderReports({ branchCount: 1 });
    await waitForSummary();

    // A control with one option invites somebody to go looking for the others.
    expect(screen.queryByLabelText('Covering')).toBeNull();
  });

  it('asks for the rollup when an owner picks all branches', async () => {
    const seen: { section: string; query: ReportQuery }[] = [];
    const harness = createConsoleHarness({
      gateway: instrumentedGateway({ onQuery: (section, query) => seen.push({ section, query }) }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    renderReports({ harness, branchCount: 3 });
    await waitForSummary();

    await user.selectOptions(screen.getByLabelText('Covering'), 'venue');

    await waitFor(() => {
      const latest = seen.filter((entry) => entry.section === 'revenue').at(-1);
      expect(latest?.query.rollUpVenue).toBe(true);
    });
  });
});

describe('the CSV export', () => {
  it('saves exactly the bytes the server produced', async () => {
    const harness = renderReports();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await waitForSummary();

    const saved: Blob[] = [];
    vi.mocked(URL.createObjectURL).mockImplementation((blob: Blob | MediaSource) => {
      saved.push(blob as Blob);
      return 'blob:mock';
    });

    // The revenue section's own export button.
    const revenue = screen.getByRole('button', { name: 'Revenue' }).closest('section')!;
    await user.click(within(revenue).getByRole('button', { name: 'CSV' }));

    await waitFor(() => expect(saved).toHaveLength(1));

    /*
     * Byte for byte against the same request made straight to the gateway.
     *
     * This is what stops the client growing an export of its own. A client that
     * built rows from the JSON it happens to be rendering would eventually
     * round, reorder or localise something differently from the server, and
     * then two documents claiming to be the same report would disagree in front
     * of an accountant.
     */
    const fromServer = await harness.gateway.exportReport({
      branchId: BRANCH,
      from: '2026-08-31',
      to: '2026-09-06',
      section: 'revenue',
    });

    // Compared as **bytes**, not as decoded text. `Blob.prototype.text()` runs
    // the spec's UTF-8 decode, which strips a leading BOM — so a text
    // comparison would pass even if the client had dropped the one thing that
    // makes Excel read Armenian correctly.
    expect(await bytesOf(saved[0]!)).toEqual(await bytesOf(fromServer.bytes));
  });

  it('carries the same numbers as the screen read', async () => {
    const harness = createConsoleHarness();
    const query = { branchId: BRANCH, from: '2026-08-31', to: '2026-09-06' } as const;

    const report = await harness.gateway.getRevenueReport(query);
    const csv = await (
      await harness.gateway.exportReport({ ...query, section: 'revenue' })
    ).bytes.text();

    // The header the server writes, and one row per local day with the same
    // figures the chart plotted.
    expect(csv).toContain('localDate,revenueAmd,tabs');
    for (const day of report.byDay) {
      expect(csv).toContain(`${day.localDate},${day.revenueAmd},${day.tabs}`);
    }

    // The BOM, which is the only reason Excel opens an Armenian venue name as
    // words rather than mojibake. Asserted on the raw bytes: `text()` decodes
    // it away.
    const bytes = await bytesOf(
      (await harness.gateway.exportReport({ ...query, section: 'revenue' })).bytes,
    );
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });
});

describe('a section that fails', () => {
  it('does not blank the ones around it', async () => {
    const harness = createConsoleHarness({ gateway: instrumentedGateway({ failing: ['menu'] }) });
    renderReports({ harness });

    // The menu section says it is broken…
    // Generous, because the section legitimately retries twice before giving
    // up — a report that failed on a blip should not need a page reload.
    await waitFor(() => expect(screen.getByText(/Something went wrong/iu)).toBeTruthy(), {
      timeout: 8000,
    });

    // …and everything else is on screen and readable. Five independent queries
    // is the whole reason this holds: one shared request would have taken the
    // page down with it.
    await waitForSummary();
    // By role, because "Revenue" is both a section heading and a summary tile
    // label — and both being on screen is the point.
    expect(screen.getByRole('button', { name: 'Occupancy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reservations' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revenue' })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Policy: 120 min')).toBeTruthy());
  });
});

/** A Blob's actual bytes, for comparisons `text()` would decode away. */
async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Drive the two date inputs, which also switches the preset to Custom.
 *
 * `fireEvent.change` rather than typing: a `type="date"` input passes through
 * partial and empty values on the way to a complete one, and the screen would
 * be asked for a range that does not exist yet.
 *
 * `to` first, because setting `from` past the current `to` would make the range
 * momentarily backwards and blank every section on the way through.
 */
function setRange(from: string, to: string): void {
  fireEvent.change(screen.getByLabelText('To'), { target: { value: to } });
  fireEvent.change(screen.getByLabelText('From'), { target: { value: from } });
}
