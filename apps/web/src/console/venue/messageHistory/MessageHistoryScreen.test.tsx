// @vitest-environment jsdom
import {
  ForbiddenError,
  addLocalDays,
  createConsoleMockGateway,
  type ConsoleGateway,
} from '@yalla/api';
import { branchDayKey } from '@yalla/format';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { MessageHistoryScreen } from './MessageHistoryScreen';

/**
 * The console's message history (2026-10-24, the History board): the
 * filters (dates, search, kind, unanswered only) in the address, the table of
 * conversations with "More", and the read-only thread on the right with who
 * wrote what, the system lines and the privacy note. Against the real console
 * mock, which seeds the board's four threads and a year behind them.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

const NORTH = 'b-lumen-north';
const ZONE = 'Asia/Yerevan';
const TODAY = branchDayKey(new Date(), ZONE);

/** Where the router is: the address the filters are written to. */
const seen = { location: '' };
function LocationProbe() {
  const here = useLocation();
  useEffect(() => {
    seen.location = `${here.pathname}${here.search}`;
  });
  return null;
}

function gateway(role: 'owner' | 'manager' = 'owner'): ConsoleGateway {
  return createConsoleMockGateway({ latencyMs: 0, role });
}

function renderHistory(console: ConsoleGateway = gateway(), search = '') {
  const harness = createConsoleHarness({ gateway: console });
  const context = {
    branchId: NORTH,
    branchName: 'Northern Avenue',
    timeZoneId: ZONE,
    branchCount: 3,
    canRollUpVenue: true,
    canRelocate: true,
  };
  render(
    harness.wrap(
      <>
        <LocationProbe />
        <Routes>
          <Route path="/venue" element={<Outlet context={context} />}>
            <Route path="messages" element={<MessageHistoryScreen />} />
          </Route>
        </Routes>
      </>,
      `/venue/messages${search}`,
    ),
  );
  return harness;
}

const table = () => screen.findByRole('table', {}, { timeout: 5000 });
const rows = (within_: HTMLElement) => within(within_).getAllByRole('row').slice(1);
const params = () => new URLSearchParams(seen.location.split('?')[1] ?? '');

describe('the message history page', () => {
  it('has the board’s filters, each with its label, and the table’s five columns', async () => {
    renderHistory();
    expect(screen.getByRole('heading', { level: 1, name: 'Messages' })).toBeTruthy();
    expect(screen.getByText(/Northern Avenue · Every conversation with guests/u)).toBeTruthy();
    const filters = screen.getByRole('search', { name: 'Filter the messages' });
    expect((within(filters).getByLabelText('From') as HTMLInputElement).value).toBe(
      addLocalDays(TODAY, -6),
    );
    expect((within(filters).getByLabelText('To') as HTMLInputElement).value).toBe(TODAY);
    expect(within(filters).getByRole('searchbox', { name: 'Guest, table or T-code' })).toBeTruthy();
    const kinds = within(filters).getByRole('group', { name: 'Kind' });
    expect(
      within(kinds)
        .getAllByRole('button')
        .map((button) => [button.textContent, button.getAttribute('aria-pressed')]),
    ).toEqual([
      ['All', 'true'],
      ['Bookings', 'false'],
      ['Takeaway', 'false'],
    ]);
    expect(within(filters).getByRole('checkbox', { name: 'Unanswered only' })).toBeTruthy();

    const list = await table();
    expect(
      within(list)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['When', 'Guest', 'About', 'Messages', 'Written by']);
    expect(within(list).getByText('Conversations with guests, the newest first')).toBeTruthy();
    // The board's first two: today's, newest first; each guest is the row's header.
    const [ani, karen] = rows(list);
    expect(within(ani!).getByRole('rowheader').textContent).toBe('Անի Մ.');
    const about = (row: HTMLElement) => within(row).getAllByRole('cell')[1]!.textContent;
    expect(about(ani!)).toMatch(/^Table 6 · \d\d:\d\d · 4 guests$/u);
    expect(within(ani!).getByText('Լիլիթ, Արամ')).toBeTruthy();
    expect(about(karen!)).toMatch(/^Takeaway T-485 · 5,400\s֏$/u);
  });

  it('opens the newest conversation on the right, read only, with who wrote what', async () => {
    renderHistory();
    await table();
    const pane = await screen.findByRole('region', { name: 'Անի Մ.' });
    const log = await within(pane).findByRole('region', { name: 'Messages' });
    expect(within(log).getByText('Բարև, Անի։ Աթոռը կդնենք սեղան 6-ի մոտ։')).toBeTruthy();
    expect(within(log).getByText(/^Լիլիթ · \d\d:\d\d$/u)).toBeTruthy();
    expect(within(log).getByText(/^Արամ · \d\d:\d\d · question$/u)).toBeTruthy();
    expect(within(log).getByText('Running 15 minutes late')).toBeTruthy();
    expect(within(log).getByText(/^Booking updated · table held until \d\d:\d\d$/u)).toBeTruthy();
    expect(
      within(pane).getByText(/^Booking · today \d\d:\d\d · table 6 · upcoming$/u),
    ).toBeTruthy();
    expect(within(pane).getByText(/Conversations older than 12 months are deleted/u)).toBeTruthy();
    // Nothing to write with: replies go from the tablet.
    expect(within(pane).queryByRole('textbox')).toBeNull();
    expect(within(pane).queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('opens a guest’s conversation from the list, and keeps it in the address', async () => {
    const user = userEvent.setup();
    renderHistory();
    const list = await table();
    const karen = within(list).getByRole('button', { name: 'Կարեն Ս.' });
    await user.click(karen);
    const pane = await screen.findByRole('region', { name: 'Կարեն Ս.' });
    expect(await within(pane).findByText('Այո, կարող եք')).toBeTruthy();
    expect(within(pane).getByText('Takeaway · T-485 · in progress')).toBeTruthy();
    expect(karen.getAttribute('aria-current')).toBe('true');
    expect(
      within(list).getByRole('button', { name: 'Անի Մ.' }).getAttribute('aria-current'),
    ).toBeNull();
    expect(params().get('thread')).toBe(`takeaway:${NORTH}-hist-t2`);
  });

  it('marks an unanswered conversation in words, and says when nobody from the venue wrote', async () => {
    renderHistory();
    const list = await table();
    const davit = within(list).getByRole('button', { name: 'Դավիթ Հ.' }).closest('tr')!;
    expect(within(davit).getByText('unanswered')).toBeTruthy();
    expect(within(davit).getByText('No one from the venue wrote')).toBeTruthy();
  });

  it('filters by kind and by "unanswered only", each a step Back can undo', async () => {
    const user = userEvent.setup();
    renderHistory();
    await table();
    await user.click(screen.getByRole('button', { name: 'Takeaway' }));
    await waitFor(() => expect(params().get('kind')).toBe('takeaway'));
    await waitFor(async () => {
      const list = await table();
      expect(within(list).queryByRole('button', { name: 'Անի Մ.' })).toBeNull();
      expect(within(list).getByRole('button', { name: 'Կարեն Ս.' })).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Takeaway' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.click(screen.getByRole('checkbox', { name: 'Unanswered only' }));
    await waitFor(() => expect(params().get('unanswered')).toBe('1'));
    await waitFor(async () => {
      const list = await table();
      const shown = rows(list);
      expect(shown.length).toBeGreaterThan(0);
      for (const row of shown) expect(within(row).getByText('unanswered')).toBeTruthy();
    });
  });

  it('searches by the T-code a moment after typing, and keeps the search in the address', async () => {
    const user = userEvent.setup();
    const console = gateway();
    const list = vi.spyOn(console, 'listMessageHistory');
    renderHistory(console);
    await table();
    await user.type(screen.getByRole('searchbox', { name: 'Guest, table or T-code' }), 't485');
    await waitFor(() => expect(params().get('q')).toBe('t485'), { timeout: 3000 });
    await waitFor(async () => {
      const shown = rows(await table());
      expect(shown).toHaveLength(1);
      expect(within(shown[0]!).getByRole('rowheader').textContent).toBe('Կարեն Ս.');
    });
    // Typed in one go: one ask for the whole word, not one per key.
    const searches = list.mock.calls.map(([, query]) => query.q).filter((q) => q !== '');
    expect(searches).toEqual(['t485']);
  });

  it('reads its filters from the address, as after a reload', async () => {
    renderHistory(gateway(), '?kind=takeaway&q=T-485');
    const list = await table();
    expect(rows(list)).toHaveLength(1);
    expect(
      (screen.getByRole('searchbox', { name: 'Guest, table or T-code' }) as HTMLInputElement).value,
    ).toBe('T-485');
    expect(screen.getByRole('button', { name: 'Takeaway' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('says what is wrong with the dates and asks nothing', async () => {
    const console = gateway();
    const list = vi.spyOn(console, 'listMessageHistory');
    renderHistory(console);
    await table();
    const calls = list.mock.calls.length;
    fireEvent.change(screen.getByLabelText('From'), { target: { value: addLocalDays(TODAY, 1) } });
    const from = screen.getByLabelText('From');
    expect(await screen.findByText('The start is after the end.')).toBeTruthy();
    expect(from.getAttribute('aria-invalid')).toBe('true');
    expect(from.getAttribute('aria-describedby')).toBe(
      screen.getByText('The start is after the end.').id,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/could not be filtered that way/u);
    expect(list.mock.calls.length).toBe(calls);

    fireEvent.change(screen.getByLabelText('From'), {
      target: { value: addLocalDays(TODAY, -400) },
    });
    expect(
      await screen.findByText(/History is kept for 12 months: choose .+ or later\./u),
    ).toBeTruthy();
  });

  it('names an end before the kept year as too old, not as too long, and asks nothing', async () => {
    const console = gateway();
    const list = vi.spyOn(console, 'listMessageHistory');
    // Only `to` in the address: `from` follows it (six days before, never before the kept year).
    renderHistory(console, `?to=${addLocalDays(TODAY, -400)}`);
    const to = await screen.findByLabelText('To');
    await waitFor(() => expect(to.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText(/History is kept for 12 months: choose .+ or later\./u).id).toBe(
      to.getAttribute('aria-describedby'),
    );
    expect(screen.queryByText(/At most \d+ days at once/u)).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it('reads the week before `to` when the address has no `from`, as the server would', async () => {
    const console = gateway();
    const list = vi.spyOn(console, 'listMessageHistory');
    const to = addLocalDays(TODAY, -30);
    renderHistory(console, `?to=${to}`);
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(list.mock.calls[0]![1]).toMatchObject({ from: addLocalDays(to, -6), to });
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe(addLocalDays(to, -6));
  });

  it('asks for a date when a date box is emptied, rather than reading a default it does not show', async () => {
    const console = gateway();
    const list = vi.spyOn(console, 'listMessageHistory');
    renderHistory(console);
    await table();
    const calls = list.mock.calls.length;
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } });
    expect(await screen.findByText('Enter a date.')).toBeTruthy();
    expect(list.mock.calls.length).toBe(calls);
  });

  it('says the outcome of a conversation opened from the address that is not on the page', async () => {
    const year = await gateway().listMessageHistory(NORTH, {
      from: addLocalDays(TODAY, -365),
      to: TODAY,
      kind: 'takeaway',
      q: '',
      unansweredOnly: false,
      limit: 100,
    });
    const old = year.items.find(
      (item) =>
        item.subject.outcome === 'collected' &&
        item.lastLocal.slice(0, 10) < addLocalDays(TODAY, -7),
    )!;
    expect(old).toBeTruthy();
    renderHistory(gateway(), `?thread=takeaway:${old.subject.id}`);
    const list = await table();
    // Not a row of this week's list…
    expect(within(list).queryByText(old.subject.label)).toBeNull();
    // …but the thread itself says what became of it.
    expect(
      await screen.findByText(`Takeaway · ${old.subject.label} · collected`, {}, { timeout: 5000 }),
    ).toBeTruthy();
  });

  it('loads older conversations with More, and puts the focus on the first new one', async () => {
    const user = userEvent.setup();
    renderHistory(gateway(), `?from=${addLocalDays(TODAY, -365)}`);
    const list = await table();
    expect(rows(list)).toHaveLength(50);
    expect(screen.getByText('50 conversations')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'More' }));
    await waitFor(() => expect(rows(list).length).toBeGreaterThan(50));
    const fiftyFirst = within(rows(list)[50]!).getByRole('button');
    await waitFor(() => expect(document.activeElement).toBe(fiftyFirst));
  });

  it('says when nothing matches, and clears the filters in one go', async () => {
    const user = userEvent.setup();
    renderHistory(gateway(), '?q=nobody-at-all');
    expect(
      await screen.findByText('No conversations on these dates', {}, { timeout: 5000 }),
    ).toBeTruthy();
    expect(screen.getByText('Nothing matches the search or the filters.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Clear the filters' }));
    expect(await table()).toBeTruthy();
    expect(params().toString()).toBe('');
    expect(
      (screen.getByRole('searchbox', { name: 'Guest, table or T-code' }) as HTMLInputElement).value,
    ).toBe('');
  });

  it('says a refusal as one, not as an empty history', async () => {
    const console = gateway();
    vi.spyOn(console, 'listMessageHistory').mockRejectedValue(
      new ForbiddenError({ url: 'mock://history' }),
    );
    renderHistory(console);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('No conversations on these dates')).toBeNull();
  });

  it('never asks the thread again on its own', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const console = gateway();
      const read = vi.spyOn(console, 'getStaffConversation');
      renderHistory(console);
      await screen.findByRole('region', { name: 'Անի Մ.' }, { timeout: 5000 });
      await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(read).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the message history on a phone', () => {
  /** A phone: under the console's 799px, so under the 1180px stacking too. */
  function asPhone() {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: /max-width: (799|1179)px/u.test(query),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    return () => {
      window.matchMedia = original;
    };
  }

  it('shows the list or the thread, never both, and Back brings the list again', async () => {
    const restore = asPhone();
    try {
      const user = userEvent.setup();
      renderHistory();
      const list = await table();
      const layout = list.closest('.yc-mh-layout') as HTMLElement;
      const filters = screen.getByRole('search', { name: 'Filter the messages' });
      // Nothing opened yet: the list (the CSS hides the thread beside it).
      expect(layout.classList.contains('has-thread')).toBe(false);
      expect(filters.classList.contains('has-thread')).toBe(false);

      await user.click(within(list).getByRole('button', { name: 'Կարեն Ս.' }));
      const pane = await screen.findByRole('region', { name: 'Կարեն Ս.' });
      expect(params().get('thread')).toBe(`takeaway:${NORTH}-hist-t2`);
      // The thread in the list's place, the filters with the list.
      expect(layout.classList.contains('has-thread')).toBe(true);
      expect(filters.classList.contains('has-thread')).toBe(true);
      await waitFor(() =>
        expect(document.activeElement).toBe(within(pane).getByRole('heading', { level: 2 })),
      );

      await user.click(within(pane).getByRole('button', { name: 'Back to the list' }));
      await waitFor(() => expect(params().get('thread')).toBeNull());
      expect(layout.classList.contains('has-thread')).toBe(false);
      expect(filters.classList.contains('has-thread')).toBe(false);
      // The focus is back on the row it came from.
      await waitFor(() =>
        expect(document.activeElement).toBe(within(list).getByRole('button', { name: 'Կարեն Ս.' })),
      );
    } finally {
      restore();
    }
  });

  it('opens on the thread a link names, and Back from it shows the list', async () => {
    const restore = asPhone();
    try {
      const user = userEvent.setup();
      renderHistory(gateway(), `?thread=takeaway:${NORTH}-hist-t2`);
      const pane = await screen.findByRole('region', { name: 'Կարեն Ս.' }, { timeout: 5000 });
      const layout = pane.closest('.yc-mh-layout') as HTMLElement;
      expect(layout.classList.contains('has-thread')).toBe(true);
      await user.click(within(pane).getByRole('button', { name: 'Back to the list' }));
      await waitFor(() => expect(params().get('thread')).toBeNull());
      expect(layout.classList.contains('has-thread')).toBe(false);
      expect(seen.location).toBe('/venue/messages');
    } finally {
      restore();
    }
  });
});
