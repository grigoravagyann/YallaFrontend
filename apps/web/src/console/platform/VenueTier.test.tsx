// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VenueDetailRoute } from './VenueDetailRoute';
import { createConsoleHarness, initConsoleTestI18n } from '../venue/reports/testHarness';

/**
 * The tier control on the platform venue page.
 *
 * The gateway, the mock and the contract could all change a branch's tier;
 * the page only ever displayed it. Tabs and ordering are what a branch pays
 * for, so with no control here the only way to switch a venue on was a hand
 * call to the API.
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

function renderVenue(gateway: ConsoleGateway) {
  const harness = createConsoleHarness({ gateway });
  render(
    harness.wrap(
      <Routes>
        <Route path="/platform/venues/:venueId" element={<VenueDetailRoute />} />
      </Routes>,
      '/platform/venues/v-lumen',
    ),
  );
  return harness;
}

const rowOf = (name: string) => screen.getByText(name).closest('li')!;

describe('the tier control', () => {
  it('offers the opposite tier on each branch and flips the pill when it goes through', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const set = vi.spyOn(gateway, 'setBranchTier');
    const user = userEvent.setup();
    renderVenue(gateway);

    await waitFor(() => expect(screen.getByText('Saryan Street')).toBeTruthy());
    const row = rowOf('Saryan Street');
    expect(within(row).getByText('Paid')).toBeTruthy();

    await user.click(within(row).getByRole('button', { name: /switch to free/i }));

    await waitFor(() => expect(set).toHaveBeenCalledTimes(1));
    expect(set.mock.calls[0]?.[0]).toMatchObject({ branchId: 'b-lumen-saryan', tier: 'free' });
    await waitFor(() => expect(within(rowOf('Saryan Street')).getByText('Free')).toBeTruthy());
    expect(
      within(rowOf('Saryan Street')).getByRole('button', { name: /switch to paid/i }),
    ).toBeTruthy();
  });

  it('says how many dishes are unfinished when Paid is refused, on that row', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const user = userEvent.setup();
    renderVenue(gateway);

    await waitFor(() => expect(screen.getByText('Cascade')).toBeTruthy());
    await user.click(within(rowOf('Cascade')).getByRole('button', { name: /switch to paid/i }));

    await waitFor(() =>
      expect(within(rowOf('Cascade')).getByText(/\d+ dish(es)? (is|are) not ready/i)).toBeTruthy(),
    );
    // Still free: nothing changed, and the pill says so.
    expect(within(rowOf('Cascade')).getByText('Free')).toBeTruthy();
  });

  it('shows the server sentence when Free is refused for open tabs', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const user = userEvent.setup();
    renderVenue(gateway);

    await waitFor(() => expect(screen.getByText('Northern Avenue')).toBeTruthy());
    await user.click(
      within(rowOf('Northern Avenue')).getByRole('button', { name: /switch to free/i }),
    );

    await waitFor(() =>
      expect(within(rowOf('Northern Avenue')).getByText(/2 open tab/i)).toBeTruthy(),
    );
    expect(within(rowOf('Northern Avenue')).getByText('Paid')).toBeTruthy();
  });
});
