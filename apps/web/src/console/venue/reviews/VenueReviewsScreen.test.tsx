// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { VenueReviewsScreen } from './VenueReviewsScreen';

/**
 * Branch > Reviews for an owner or manager.
 *
 * The mock's review store is seeded with one review in each state this screen
 * has to tell apart: plain, reported twice, hidden by the venue, and hidden by
 * the platform (at the other branch).
 */

beforeAll(async () => {
  await initConsoleTestI18n();
});

afterEach(cleanup);

function renderReviews(gateway: ConsoleGateway, branchId = 'b-lumen-north') {
  const harness = createConsoleHarness({ gateway });
  const context = {
    branchId,
    timeZoneId: 'Asia/Yerevan',
    branchCount: 3,
    canRollUpVenue: true,
    canRelocate: true,
  };
  render(
    harness.wrap(
      <Routes>
        <Route path="/venue" element={<Outlet context={context} />}>
          <Route path="reviews" element={<VenueReviewsScreen />} />
        </Route>
      </Routes>,
      '/venue/reviews',
    ),
  );
}

const rowOf = (text: RegExp) => screen.getByText(text).closest('li') as HTMLElement;
const filter = (name: RegExp) => screen.getByRole('button', { name });

describe('the venue reviews screen', () => {
  it('lists every review with its report count, and narrows to reported and hidden', async () => {
    const user = userEvent.setup();
    renderReviews(createConsoleMockGateway({ latencyMs: 0, role: 'owner' }));

    await screen.findByText(/quick coffee/i);
    expect(within(rowOf(/a long wait/i)).getByText(/^2 reports$/i)).toBeTruthy();
    expect(within(rowOf(/quick coffee/i)).queryByText(/report/i)).toBeNull();

    await user.click(filter(/^reported$/i));
    await waitFor(() => expect(screen.queryByText(/quick coffee/i)).toBeNull());
    expect(screen.getByText(/a long wait/i)).toBeTruthy();

    await user.click(filter(/^hidden$/i));
    await screen.findByText(/hidden by the venue/i);
    expect(screen.queryByText(/a long wait/i)).toBeNull();
    // Why it was hidden is on the row, as one translated line.
    expect(
      within(rowOf(/hidden by the venue/i)).getByText('Reason: Not about this venue.'),
    ).toBeTruthy();
    // Tinted, not faded: nothing on a hidden row drops below readable contrast.
    expect(rowOf(/hidden by the venue/i).className).not.toMatch(/is-inactive/u);
  });

  it('asks for a reason before hiding, and sends it', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const visibility = vi.spyOn(gateway, 'setVenueReviewVisibility');
    const user = userEvent.setup();
    renderReviews(gateway);

    await screen.findByText(/quick coffee/i);
    await user.click(within(rowOf(/quick coffee/i)).getByRole('button', { name: /^hide$/i }));
    await user.click(within(rowOf(/quick coffee/i)).getByRole('button', { name: /^hide$/i }));

    expect((await within(rowOf(/quick coffee/i)).findByRole('alert')).textContent).toMatch(
      /give a reason/i,
    );
    expect(visibility).not.toHaveBeenCalled();

    await user.type(within(rowOf(/quick coffee/i)).getByLabelText(/reason/i), 'Spam');
    await user.click(within(rowOf(/quick coffee/i)).getByRole('button', { name: /^hide$/i }));

    await waitFor(() =>
      expect(visibility).toHaveBeenCalledWith('b-lumen-north', 'review-seed-1', {
        hidden: true,
        reason: 'Spam',
      }),
    );
    await waitFor(() =>
      expect(
        within(rowOf(/quick coffee/i)).getByRole('button', { name: /show again/i }),
      ).toBeTruthy(),
    );
  });

  it('keeps keyboard focus in the row as each action replaces its button', async () => {
    const user = userEvent.setup();
    renderReviews(createConsoleMockGateway({ latencyMs: 0, role: 'owner' }));

    await screen.findByText(/quick coffee/i);
    await user.click(within(rowOf(/quick coffee/i)).getByRole('button', { name: /^hide$/i }));
    // The reason box, not the page.
    expect(document.activeElement).toBe(within(rowOf(/quick coffee/i)).getByLabelText(/reason/i));

    // Cancel puts it back on Hide.
    await user.click(within(rowOf(/quick coffee/i)).getByRole('button', { name: /cancel/i }));
    expect(document.activeElement).toBe(
      within(rowOf(/quick coffee/i)).getByRole('button', { name: /^hide$/i }),
    );

    await user.keyboard('{Enter}');
    await user.keyboard('Spam');
    await user.click(within(rowOf(/quick coffee/i)).getByRole('button', { name: /^hide$/i }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(rowOf(/quick coffee/i)).getByRole('button', { name: /show again/i }),
      ),
    );

    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(rowOf(/quick coffee/i)).getByRole('button', { name: /^hide$/i }),
      ),
    );
  });

  it('restores a review the venue hid', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const visibility = vi.spyOn(gateway, 'setVenueReviewVisibility');
    const user = userEvent.setup();
    renderReviews(gateway);

    await screen.findByText(/quick coffee/i);
    await user.click(filter(/^hidden$/i));
    await screen.findByText(/hidden by the venue/i);
    await user.click(
      within(rowOf(/hidden by the venue/i)).getByRole('button', { name: /show again/i }),
    );

    await waitFor(() =>
      expect(visibility).toHaveBeenCalledWith('b-lumen-north', 'review-seed-3', {
        hidden: false,
        reason: null,
      }),
    );
    await screen.findByText(/no reviews match this filter/i);
  });

  it('shows a review the platform hid as locked straight from the list', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const visibility = vi.spyOn(gateway, 'setVenueReviewVisibility');
    const user = userEvent.setup();
    renderReviews(gateway, 'b-lumen-cascade');

    await user.click(await screen.findByRole('button', { name: /^hidden$/i }));
    await screen.findByText(/hidden by the platform/i);

    const row = rowOf(/hidden by the platform/i);
    expect(within(row).getByText(/hidden by the yalla team/i)).toBeTruthy();
    expect(within(row).queryByRole('button', { name: /show again/i })).toBeNull();
    expect(visibility).not.toHaveBeenCalled();
  });

  it('locks a row once the server refuses to restore it, when the list was read before the platform hid it', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const list = gateway.listVenueBranchReviews.bind(gateway);
    // The list as read a moment before the platform's takedown: not yet flagged.
    vi.spyOn(gateway, 'listVenueBranchReviews').mockImplementation(async (branchId, query) => {
      const page = await list(branchId, query);
      return { ...page, items: page.items.map((item) => ({ ...item, hiddenByPlatform: false })) };
    });
    const user = userEvent.setup();
    renderReviews(gateway, 'b-lumen-cascade');

    await user.click(await screen.findByRole('button', { name: /^hidden$/i }));
    await screen.findByText(/hidden by the platform/i);
    await user.click(
      within(rowOf(/hidden by the platform/i)).getByRole('button', { name: /show again/i }),
    );

    const row = rowOf(/hidden by the platform/i);
    await within(row).findByText(/hidden by the yalla team/i);
    expect(within(row).queryByRole('button', { name: /show again/i })).toBeNull();
    // Locked, not failed: no "try again" alert beside it.
    expect(within(row).queryByRole('alert')).toBeNull();
  });
});
