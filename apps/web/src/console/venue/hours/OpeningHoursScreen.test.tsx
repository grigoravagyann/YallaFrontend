// @vitest-environment jsdom
import {
  ConcurrencyConflictError,
  createConsoleMockGateway,
  type ConsoleGateway,
} from '@yalla/api';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../ui/toast';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { OpeningHoursScreen } from './OpeningHoursScreen';

/**
 * The opening hours (Hours artboard) against the console mock: the week saved
 * from the bar at the foot, special days added and removed at once.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

function renderHours(gateway?: ConsoleGateway) {
  const harness = createConsoleHarness({
    gateway: gateway ?? createConsoleMockGateway({ latencyMs: 0, role: 'owner' }),
  });
  const context = {
    branchId: 'b-lumen-cascade',
    branchName: 'Cascade',
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
            <Route path="hours" element={<OpeningHoursScreen />} />
          </Route>
        </Routes>
      </ToastProvider>,
      '/venue/hours',
    ),
  );
  return harness;
}

const dayRow = (name: string) => screen.getByText(name, { selector: '.yc-dname' }).closest('li')!;

async function waitForWeek() {
  await screen.findByRole('switch', { name: 'Monday: open' }, { timeout: 5000 });
}

/** A date `days` from today, as the date field takes it. */
function dateIn(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

describe('the week', () => {
  it('says "(next day)" beside a closing time after midnight', async () => {
    renderHours();
    await waitForWeek();
    // The mock's Friday runs 09:00–01:00.
    expect(within(dayRow('Friday')).getByText('(next day)')).toBeTruthy();
    expect(within(dayRow('Monday')).queryByText('(next day)')).toBeNull();
  });

  it('cuts a break out of a day, and closes a day with its switch', async () => {
    const user = userEvent.setup();
    renderHours();
    await waitForWeek();

    await user.click(within(dayRow('Monday')).getByRole('button', { name: '+ Break' }));
    expect(
      (within(dayRow('Monday')).getByLabelText('Monday, span 1, closes') as HTMLInputElement).value,
    ).toBe('15:00');
    expect(
      (within(dayRow('Monday')).getByLabelText('Monday, span 2, opens') as HTMLInputElement).value,
    ).toBe('17:00');

    await user.click(within(dayRow('Tuesday')).getByRole('switch', { name: 'Tuesday: open' }));
    expect(within(dayRow('Tuesday')).getByText('Closed all day')).toBeTruthy();
    expect(screen.getByText('Unsaved changes', { selector: '.yc-grow' })).toBeTruthy();
  });

  it('marks two overlapping spans and will not save them', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const replace = vi.spyOn(gateway, 'replaceOpeningHours');
    const user = userEvent.setup();
    renderHours(gateway);
    await waitForWeek();

    await user.click(within(dayRow('Monday')).getByRole('button', { name: '+ Break' }));
    fireEvent.change(within(dayRow('Monday')).getByLabelText('Monday, span 2, opens'), {
      target: { value: '14:00' },
    });

    expect(screen.getByRole('alert').textContent).toMatch(/overlap/i);
    expect(
      within(dayRow('Monday')).getByLabelText('Monday, span 1, opens').getAttribute('aria-invalid'),
    ).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Save the week' }));
    expect(await screen.findByText('Fix the overlapping hours first')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('copies one day onto others from its panel, and saves the week from the bar', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const replace = vi.spyOn(gateway, 'replaceOpeningHours');
    const user = userEvent.setup();
    renderHours(gateway);
    await waitForWeek();

    await user.click(within(dayRow('Friday')).getByRole('button', { name: 'Copy…' }));
    const panel = screen.getByRole('dialog', { name: 'Copy Friday onto other days' });
    expect(document.activeElement).toBe(within(panel).getAllByRole('checkbox')[0]);
    await user.click(within(panel).getByLabelText('Monday'));
    await user.click(within(panel).getByRole('button', { name: 'Copy (1)' }));
    expect(await screen.findByText("Friday's hours copied onto 1 day")).toBeTruthy();
    expect(within(dayRow('Monday')).getByText('(next day)')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save the week' }));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Opening hours saved')).toBeTruthy();
    expect(screen.getByText('Saved', { selector: '.yc-grow' })).toBeTruthy();
  });

  it('closes the copy panel on Escape and gives the focus back to its button', async () => {
    const user = userEvent.setup();
    renderHours();
    await waitForWeek();

    const button = within(dayRow('Friday')).getByRole('button', { name: 'Copy…' });
    await user.click(button);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe('special days', () => {
  it('lists the coming New Year, and adds a closed day at once', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const replace = vi.spyOn(gateway, 'replaceSpecialDays');
    const user = userEvent.setup();
    renderHours(gateway);
    await waitForWeek();

    expect(await screen.findByText('New Year')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: dateIn(10) } });
    await user.type(screen.getByLabelText('Name'), 'Inventory');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    const sent = replace.mock.calls[0]![0].days;
    expect(sent.find((day) => day.date === dateIn(10))).toEqual({
      date: dateIn(10),
      note: 'Inventory',
      blocks: [],
    });
    expect(await screen.findByText(/Inventory added/)).toBeTruthy();
    expect(screen.getByText('Inventory', { selector: 'small' })).toBeTruthy();
  });

  it('adds other hours for a day, past midnight', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const replace = vi.spyOn(gateway, 'replaceSpecialDays');
    const user = userEvent.setup();
    renderHours(gateway);
    await waitForWeek();

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: dateIn(5) } });
    await user.selectOptions(screen.getByLabelText('How'), 'hours');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '20:00' } });
    fireEvent.change(screen.getByLabelText('Until'), { target: { value: '02:00' } });
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(replace.mock.calls[0]![0].days.find((day) => day.date === dateIn(5))).toEqual({
      date: dateIn(5),
      note: null,
      blocks: [{ opensAt: '20:00', closesAt: '02:00' }],
    });
    expect(await screen.findByText('20:00–02:00 (next day)')).toBeTruthy();
  });

  it('asks for a date first, and refuses one already on the list, under the form', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const replace = vi.spyOn(gateway, 'replaceSpecialDays');
    const user = userEvent.setup();
    renderHours(gateway);
    await waitForWeek();
    await screen.findByText('New Year');

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Choose the date')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Date'));

    const newYear = (await gateway.getSpecialDays('b-lumen-cascade')).find(
      (day) => day.note === 'New Year',
    )!.date;
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: newYear } });
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('That day is on the list already')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('removes a day at once, with an undo that puts it back', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const replace = vi.spyOn(gateway, 'replaceSpecialDays');
    const user = userEvent.setup();
    renderHours(gateway);
    await waitForWeek();

    await user.click(await screen.findByRole('button', { name: 'Remove Christmas' }));
    expect(await screen.findByText('“Christmas” removed from the special days')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Christmas', { selector: 'small' })).toBeNull());

    await user.click(screen.getByRole('button', { name: /undo/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Christmas', { selector: 'small' })).toBeTruthy();
  });

  it('never overwrites a list somebody else saved meanwhile: says so, and reads theirs', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    vi.spyOn(gateway, 'replaceSpecialDays').mockRejectedValue(
      new ConcurrencyConflictError({
        url: '/opening-hours/exceptions',
        problem: {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'x',
          code: 'concurrent-update',
          traceId: 't',
        },
      }),
    );
    const read = vi.spyOn(gateway, 'getSpecialDays');
    const user = userEvent.setup();
    renderHours(gateway);
    await waitForWeek();
    await screen.findByText('New Year');
    const reads = read.mock.calls.length;

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: dateIn(7) } });
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText(
        'Someone else changed the special days. The newer list is loaded; try again.',
      ),
    ).toBeTruthy();
    await waitFor(() => expect(read.mock.calls.length).toBeGreaterThan(reads));
  });
});
