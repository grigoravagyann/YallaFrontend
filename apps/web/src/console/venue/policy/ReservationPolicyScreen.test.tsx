// @vitest-environment jsdom
import { createConsoleMockGateway, defaultPolicyFor, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../ui/toast';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { ReservationPolicyScreen } from './ReservationPolicyScreen';

/**
 * The reservation policy (Policy artboard) against the console mock: steppers
 * with the shipped default and a way back, a diner's view per group that
 * follows the typing, the save bar, and the affected-bookings result.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

const BRANCH = 'b-lumen-cascade';

function renderPolicy(gateway?: ConsoleGateway) {
  const harness = createConsoleHarness({
    gateway: gateway ?? createConsoleMockGateway({ latencyMs: 0, role: 'owner' }),
  });
  const context = {
    branchId: BRANCH,
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
            <Route path="policy" element={<ReservationPolicyScreen />} />
          </Route>
        </Routes>
      </ToastProvider>,
      '/venue/policy',
    ),
  );
  return harness;
}

const input = (label: string) => screen.getByRole('textbox', { name: label }) as HTMLInputElement;
const group = (title: string) => screen.getByRole('region', { name: title });
const saveBar = () => screen.getByRole('region', { name: 'Saving' });

async function ready() {
  await screen.findByRole('textbox', { name: 'How long a table is held' }, { timeout: 5000 });
}

describe('a field', () => {
  it('steps within its bounds and shows the default, with a way back once changed', async () => {
    const user = userEvent.setup();
    renderPolicy();
    await ready();
    const turn = input('How long a table is held');
    const shipped = String(defaultPolicyFor('cafe').turnTimeMinutes);
    expect(turn.value).toBe(shipped);
    const holding = group('How long a table is held');
    expect(within(holding).queryByRole('button', { name: 'Reset' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Increase: How long a table is held' }));
    expect(turn.value).toBe(String(Number(shipped) + 5));
    expect(within(holding).getByText('Changed')).toBeTruthy();
    expect(within(saveBar()).getByText('1 unsaved change')).toBeTruthy();

    await user.click(within(holding).getByRole('button', { name: 'Reset' }));
    expect(turn.value).toBe(shipped);
    expect(within(saveBar()).queryByText(/unsaved/u)).toBeNull();
  });

  it("puts the guest's view under the group, as typed", async () => {
    const user = userEvent.setup();
    renderPolicy();
    await ready();
    const turn = input('How long a table is held');
    await user.clear(turn);
    await user.type(turn, '105');
    expect(within(group('How long a table is held')).getByText(/19:00–20:45/u)).toBeTruthy();

    const lead = input('Shortest notice');
    await user.clear(lead);
    await user.type(lead, '45');
    expect(
      screen.getByText(/45 minutes means a 19:00 table cannot be booked after 18:15\./u),
    ).toBeTruthy();
  });

  it('marks a typed number the server would refuse, and the save asks for it to be fixed first', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const replace = vi.spyOn(gateway, 'replaceReservationPolicy');
    renderPolicy(gateway);
    await ready();
    const turn = input('How long a table is held');
    await user.clear(turn);
    await user.type(turn, '5');

    expect(turn.getAttribute('aria-invalid')).toBe('true');
    const error = screen.getByText('Must be between 15 and 360');
    expect(turn.getAttribute('aria-describedby')).toContain(error.id);
    expect(within(saveBar()).getByText('The fields marked in red are out of bounds')).toBeTruthy();

    turn.blur();
    await user.click(screen.getByRole('button', { name: 'Save the policy' }));
    expect(await screen.findByText('First fix the fields that are out of bounds')).toBeTruthy();
    expect(document.activeElement).toBe(turn);
    expect(replace).not.toHaveBeenCalled();
  });

  it('treats an emptied "no limit" field as no limit, not as a mistake', async () => {
    const user = userEvent.setup();
    renderPolicy();
    await ready();
    const threshold = input('Party size that needs approval');
    await user.clear(threshold);
    expect(threshold.getAttribute('aria-invalid')).toBe('false');
    expect(
      within(group('What needs a person')).getByText(/Every booking is confirmed at once/u),
    ).toBeTruthy();
  });
});

describe('saving', () => {
  it('keeps the affected-bookings result on the page until it is closed', async () => {
    const user = userEvent.setup();
    renderPolicy();
    await ready();
    // A longer hold is what the mock reports existing bookings against.
    await user.click(screen.getByRole('button', { name: 'Increase: How long a table is held' }));
    await user.click(screen.getByRole('button', { name: 'Save the policy' }));

    const result = await screen.findByText(/existing bookings? no longer fits? the new rules\./u);
    const banner = result.closest('.yc-banner') as HTMLElement;
    expect(within(banner).getByText(/never rewrites a booking/u)).toBeTruthy();
    expect(await within(saveBar()).findByText('Saved')).toBeTruthy();

    await user.click(within(banner).getByRole('button', { name: 'Close' }));
    expect(banner.isConnected).toBe(false);
  });

  it('confirms an unchanged policy nobody has reviewed yet, and says "no changes" after that', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const replace = vi.spyOn(gateway, 'replaceReservationPolicy');
    renderPolicy(gateway);
    await ready();
    expect(
      await within(saveBar()).findByText('Not confirmed yet: save to confirm these rules'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Save the policy' }));
    expect(
      await screen.findByText('The policy is saved. No existing booking was affected.'),
    ).toBeTruthy();
    expect(replace).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(within(saveBar()).getByText('Saved')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Save the policy' }));
    expect(await screen.findByText('No changes')).toBeTruthy();
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('discards back to what was saved, and says so', async () => {
    const user = userEvent.setup();
    renderPolicy();
    await ready();
    const toggle = screen.getByRole('switch', { name: 'Confirm bookings automatically' });
    const before = toggle.getAttribute('aria-checked');
    await user.click(toggle);
    expect(toggle.getAttribute('aria-checked')).not.toBe(before);

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(toggle.getAttribute('aria-checked')).toBe(before);
    expect(await screen.findByText('Changes discarded')).toBeTruthy();
  });
});

describe('the defaults', () => {
  it("are the server's for this branch, not the client's copy", async () => {
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const gateway: ConsoleGateway = {
      ...base,
      getReservationPolicyDefaults: async (branchId) => {
        const answer = await base.getReservationPolicyDefaults(branchId);
        return { ...answer, defaults: { ...answer.defaults, graceMinutes: 20 } };
      },
    };
    renderPolicy(gateway);
    await ready();
    const lateness = group('When somebody is late');
    expect(within(lateness).getByText('Default: 20 minutes')).toBeTruthy();
    // The seeded 15 now differs from what ships, and can go back to it.
    await userEvent.setup().click(within(lateness).getByRole('button', { name: 'Reset' }));
    expect(input('How long a late party keeps the table').value).toBe('20');
  });

  it("fall back to the client's copy for a server that predates the route", async () => {
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const gateway: ConsoleGateway = {
      ...base,
      getReservationPolicyDefaults: () => Promise.reject(new Error('404')),
    };
    renderPolicy(gateway);
    await ready();
    expect(
      within(group('When somebody is late')).getByText(
        `Default: ${defaultPolicyFor('cafe').graceMinutes} minutes`,
      ),
    ).toBeTruthy();
  });
});
