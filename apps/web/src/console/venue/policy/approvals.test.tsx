// @vitest-environment jsdom
import { ForbiddenError, createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ReservationPolicyScreen } from './ReservationPolicyScreen';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';

/**
 * The bookings waiting for a person.
 *
 * The policy tab is where an owner turns approval on, so it is where the
 * consequence lives: every booking the rule stopped, with the two decisions
 * beside it. What matters is that a decision leaves the list at once, that a
 * rejection carries the reason typed, and that a refusal from the server is
 * shown in the server's own words rather than as a generic failure.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

function renderPolicy(options: { readonly gateway?: ConsoleGateway } = {}) {
  const harness = createConsoleHarness({
    gateway: options.gateway ?? createConsoleMockGateway({ latencyMs: 0, role: 'owner' }),
  });
  const context = {
    branchId: 'b-lumen-north',
    timeZoneId: 'Asia/Yerevan',
    branchCount: 3,
    canRollUpVenue: true,
  };

  render(
    harness.wrap(
      <Routes>
        <Route path="/venue" element={<Outlet context={context} />}>
          <Route path="policy" element={<ReservationPolicyScreen />} />
        </Route>
      </Routes>,
      '/venue/policy',
    ),
  );
  return harness;
}

async function waitForPanel() {
  const panel = await screen.findByRole(
    'region',
    { name: /awaiting approval/i },
    { timeout: 5000 },
  );
  await waitFor(() => expect(within(panel).getAllByRole('listitem').length).toBeGreaterThan(0), {
    timeout: 5000,
  });
  return panel;
}

describe('the awaiting-approval panel', () => {
  it('approves a booking and it leaves the list', async () => {
    const user = userEvent.setup();
    const harness = renderPolicy();
    const panel = await waitForPanel();

    const before = await harness.gateway.listPendingReservations('b-lumen-north');
    const first = before[0]!;
    const row = within(panel).getByText(first.code).closest('li')!;

    await user.click(within(row).getByRole('button', { name: /^approve$/i }));

    await waitFor(() => expect(within(panel).queryByText(first.code)).toBeNull());
    const after = await harness.gateway.listPendingReservations('b-lumen-north');
    expect(after.map((booking) => booking.id)).not.toContain(first.id);
    expect(within(panel).getAllByRole('listitem').length).toBe(before.length - 1);
  });

  it('rejects with the reason typed, after asking', async () => {
    const user = userEvent.setup();
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const reject = vi.spyOn(base, 'rejectReservation');
    renderPolicy({ gateway: base });
    const panel = await waitForPanel();

    const [first] = await base.listPendingReservations('b-lumen-north');
    const row = within(panel).getByText(first!.code).closest('li')!;

    await user.click(within(row).getByRole('button', { name: /^decline$/i }));
    // Nothing is sent until the confirmation.
    expect(reject).not.toHaveBeenCalled();

    await user.type(within(row).getByLabelText(/reason/i), 'Private event that evening');
    await user.click(within(row).getByRole('button', { name: /decline the booking/i }));

    await waitFor(() =>
      expect(reject).toHaveBeenCalledWith({
        reservationId: first!.id,
        reason: 'Private event that evening',
      }),
    );
    await waitFor(() => expect(within(panel).queryByText(first!.code)).toBeNull());
  });

  it('shows the server sentence when the branch refuses the decision', async () => {
    const user = userEvent.setup();
    const detail = 'Approve a booking requires the Manager role; the caller is a Manager.';
    const base = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const refusing: ConsoleGateway = {
      ...base,
      approveReservation: () =>
        Promise.reject(
          new ForbiddenError({
            url: 'mock://approve',
            problem: {
              type: 'about:blank',
              title: 'Forbidden',
              status: 403,
              detail,
              code: 'forbidden',
              traceId: 'mock',
            },
          }),
        ),
    };
    renderPolicy({ gateway: refusing });
    const panel = await waitForPanel();

    const [first] = await base.listPendingReservations('b-lumen-north');
    const row = within(panel).getByText(first!.code).closest('li')!;
    await user.click(within(row).getByRole('button', { name: /^approve$/i }));

    const alert = await within(row).findByRole('alert');
    expect(alert.textContent).toContain(detail);
    // Still listed: nothing was decided.
    expect(within(panel).getByText(first!.code)).toBeTruthy();
  });
});
