// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { OnboardingChecklist } from './OnboardingChecklist';
import { ReservationPolicyScreen } from './policy/ReservationPolicyScreen';
import { createConsoleHarness, initConsoleTestI18n } from './reports/testHarness';

/**
 * The checklist says what the server says.
 *
 * The line that was wrong: every branch has a reservation policy — the
 * default — so a checklist that ticked "policy reviewed" when a policy loaded
 * ticked it for every branch on day one. The server counts it once somebody
 * has *saved* the policy, and the save invalidates the readiness read, so the
 * line flips on the same screen without a reload.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

const BRANCH = 'b-lumen-north';

function renderOverviewWithPolicy(gateway: ConsoleGateway) {
  const harness = createConsoleHarness({ gateway });
  const context = {
    branchId: BRANCH,
    timeZoneId: 'Asia/Yerevan',
    branchCount: 3,
    canRollUpVenue: true,
    canRelocate: true,
  };
  render(
    harness.wrap(
      <Routes>
        <Route path="/venue" element={<Outlet context={context} />}>
          <Route
            index
            element={
              <>
                <OnboardingChecklist />
                <ReservationPolicyScreen />
              </>
            }
          />
        </Route>
      </Routes>,
      '/venue',
    ),
  );
}

const policyLine = () => document.querySelector('[data-step="policy"]');

describe('the onboarding checklist', () => {
  it('leaves "policy reviewed" open while a policy loads, and ticks it once the form is saved', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const readiness = vi.spyOn(gateway, 'getBranchReadiness');
    const user = userEvent.setup();
    renderOverviewWithPolicy(gateway);

    // The policy is there — the form below shows it — and the line is still open.
    const toggle = await screen.findByLabelText(/confirm bookings automatically/i);
    await waitFor(() => expect(policyLine()).not.toBeNull());
    expect(policyLine()!.classList.contains('is-done')).toBe(false);
    expect(screen.getByText(/nobody has reviewed the reservation policy/i)).toBeTruthy();
    expect(readiness).toHaveBeenCalled();

    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: /save the policy/i }));

    await waitFor(() => expect(policyLine()!.classList.contains('is-done')).toBe(true));
    expect(screen.queryByText(/nobody has reviewed the reservation policy/i)).toBeNull();
  });

  it('renders nothing of its own for a readiness the server failed to answer', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    vi.spyOn(gateway, 'getBranchReadiness').mockRejectedValue(new Error('readiness is down'));
    renderOverviewWithPolicy(gateway);

    await screen.findByRole('button', { name: /try again/i });
    // No locally derived ticks standing in for the answer.
    expect(policyLine()).toBeNull();
  });
});
