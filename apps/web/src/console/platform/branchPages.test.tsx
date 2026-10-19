// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createConsoleMockGateway,
  createMockReviewStore,
  type ConsoleGateway,
  type ConsoleUser,
} from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AppRoutes as AppRoutesComponent } from '../../App';
import { createConsoleHarness, initConsoleTestI18n } from '../venue/reports/testHarness';

/**
 * A branch's three pages for the platform admin (BranchPublic, BranchRooms
 * and Reviews artboards; HANDOFF section 8 step 4): the shared header with
 * breadcrumbs, the branch switcher and the sub-tabs; the public page and the
 * app listing beside a live preview of the app card; the rooms editor with
 * its save bar; and review moderation with reasons, undo and "Dismiss
 * reports".
 */

vi.mock('../venue/floorplan/EditorCanvas', () => ({ EditorCanvas: () => null }));

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let AppRoutes: typeof AppRoutesComponent;

beforeAll(async () => {
  vi.stubEnv('VITE_DATA_SOURCE', 'mock');
  vi.stubGlobal('ResizeObserver', NoopResizeObserver);
  await initConsoleTestI18n();
  ({ AppRoutes } = await import('../../App'));
});

afterEach(cleanup);

const ADMIN: ConsoleUser = {
  id: 'u-platform',
  displayName: 'Grigor Avagyan',
  role: 'platformAdmin',
  scope: { venueId: null, branchIds: [] },
};

function renderAt(path: string, gateway?: ConsoleGateway) {
  const harness = createConsoleHarness({
    gateway: gateway ?? createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' }),
  });
  const view = render(harness.wrap(<AppRoutes user={ADMIN} />, path));
  return { harness, view };
}

const CASCADE = '/platform/venues/v-cascade/branches/b-cascade-center';

describe('the branch header', () => {
  it('names the branch, the way back, and the three pages', async () => {
    renderAt(`${CASCADE}/public`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Կենտրոն' })).toBeTruthy();
    const crumbs = screen.getByRole('navigation', { name: 'You are here' });
    expect(within(crumbs).getByRole('link', { name: 'Venues' }).getAttribute('href')).toBe(
      '/platform/venues',
    );
    expect(within(crumbs).getByRole('link', { name: 'Cascade Cafe' }).getAttribute('href')).toBe(
      '/platform/venues/v-cascade',
    );
    expect(screen.getByText('Cascade Cafe · Թամանյան 10, Կենտրոն')).toBeTruthy();

    const tabs = screen.getByRole('navigation', { name: 'Branch sections' });
    const links = within(tabs).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `${CASCADE}/public`,
      `${CASCADE}/floorplan`,
      `${CASCADE}/reviews`,
    ]);
    expect(
      within(tabs).getByRole('link', { name: 'Public page' }).getAttribute('aria-current'),
    ).toBe('page');
    // The reported reviews waiting, on the tab that has them.
    expect(await within(tabs).findByRole('link', { name: /^Reviews.*2 reports/u })).toBeTruthy();
  });

  it('switches to the same page of another branch', async () => {
    const user = userEvent.setup();
    renderAt('/platform/venues/v-yalla-demo/branches/b-yalla-demo-center/floorplan');
    await screen.findByRole('heading', { level: 1, name: 'Կենտրոն' });
    await user.selectOptions(screen.getByLabelText('Branch'), 'b-yalla-demo-komitas');
    expect(await screen.findByRole('heading', { level: 1, name: 'Կոմիտաս' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Rooms and tables' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('says a branch that is not in the venue is not found', async () => {
    renderAt('/platform/venues/v-cascade/branches/b-nowhere/public');
    expect(
      await screen.findByRole('heading', { name: 'This branch was not found' }, { timeout: 5000 }),
    ).toBeTruthy();
  });
});

describe('the public page', () => {
  it('keeps two forms saved apart, beside a preview that follows the typing', async () => {
    const user = userEvent.setup();
    renderAt(`${CASCADE}/public`);
    const listing = await screen.findByRole(
      'form',
      { name: 'In the Yalla app' },
      { timeout: 5000 },
    );
    expect(within(listing).getByRole('button', { name: 'Save listing' })).toBeTruthy();
    const cover = await screen.findByRole('form', { name: 'Page and booking' });
    expect(within(cover).getByRole('button', { name: 'Save' })).toBeTruthy();
    // The platform admin may move the branch (K5): no owner-only lock here.
    expect((within(listing).getByLabelText(/street address/i) as HTMLInputElement).readOnly).toBe(
      false,
    );

    const preview = screen.getByRole('complementary', { name: 'Preview' });
    expect(within(preview).getByText('Cascade Cafe · Կենտրոն')).toBeTruthy();

    const cuisine = within(listing).getByLabelText(/^Cuisine/u);
    await user.clear(cuisine);
    await user.type(cuisine, 'Grill and coffee');
    expect(within(preview).getByText('Grill and coffee')).toBeTruthy();

    // The booking switch is on the other form, and the preview follows it too.
    const bookings = within(cover).getByRole('switch', { name: /take bookings/i });
    const before = within(preview).getByText(/Book a table|Booking is closed/u).textContent;
    await user.click(bookings);
    expect(within(preview).getByText(/Book a table|Booking is closed/u).textContent).not.toBe(
      before,
    );
  });
});

describe('the rooms page', () => {
  it('saves from a bar that says what is unsaved, and discards on request', async () => {
    const user = userEvent.setup();
    renderAt(`${CASCADE}/floorplan`);
    const bar = await screen.findByRole('region', { name: 'Saving' }, { timeout: 5000 });
    expect(within(bar).getByText('Everything is saved')).toBeTruthy();
    expect(within(bar).queryByRole('button', { name: 'Discard changes' })).toBeNull();

    await user.type(screen.getByLabelText(/new room/iu), 'Rooftop');
    await user.click(screen.getByRole('button', { name: 'Add the room' }));
    expect(within(bar).getByText(/^Unsaved changes/u)).toBeTruthy();

    await user.click(within(bar).getByRole('button', { name: 'Discard changes' }));
    expect(within(bar).getByText('Everything is saved')).toBeTruthy();
    expect(screen.queryByText(/^Rooftop/u)).toBeNull();
    expect(within(bar).getByRole('button', { name: 'Save rooms' })).toBeTruthy();
  });
});

describe('the reviews page', () => {
  async function openReviews(gateway?: ConsoleGateway) {
    const rendered = renderAt(`${CASCADE}/reviews`, gateway);
    await screen.findByText(/Մատուցողը կոպիտ էր/u, undefined, { timeout: 5000 });
    return rendered;
  }

  const reviewOf = (author: string) =>
    screen.getByRole('article', { name: new RegExp(`^${author}`, 'u') });

  it('filters, with counts, and puts the reported ones first', async () => {
    const user = userEvent.setup();
    await openReviews();
    const filters = screen.getByRole('group', { name: 'Filter' });
    expect(
      within(filters)
        .getByRole('button', { name: /^All\s*6/u })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    const articles = screen.getAllByRole('article');
    expect(within(articles[0]!).getByText('3 reports')).toBeTruthy();
    expect(within(articles[1]!).getByText('2 reports')).toBeTruthy();

    await user.click(within(filters).getByRole('button', { name: /^Hidden\s*1/u }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(within(screen.getByRole('article')).getByText(/Գրված է այլ վայրի մասին/u)).toBeTruthy();
  });

  it('says where hidden reviews show up when there are none', async () => {
    const user = userEvent.setup();
    renderAt('/platform/venues/v-yalla-demo/branches/b-yalla-demo-komitas/reviews');
    const filters = await screen.findByRole('group', { name: 'Filter' }, { timeout: 5000 });
    await user.click(within(filters).getByRole('button', { name: /^Hidden/u }));
    expect(await screen.findByText('No hidden reviews')).toBeTruthy();
    expect(screen.getByText('Hidden reviews show up here.')).toBeTruthy();
    expect(screen.queryByText(/Nobody has written/u)).toBeNull();
  });

  it('keeps the focus on the filter when the review shown again leaves the Hidden list', async () => {
    const user = userEvent.setup();
    await openReviews();
    const filters = screen.getByRole('group', { name: 'Filter' });
    const hiddenChip = within(filters).getByRole('button', { name: /^Hidden/u });
    await user.click(hiddenChip);
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    await user.click(within(reviewOf('Մարիամ')).getByRole('button', { name: 'Show again' }));
    await waitFor(() => expect(screen.queryByRole('article')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(hiddenChip));
  });

  it('asks why before hiding, and the toast takes it back', async () => {
    const user = userEvent.setup();
    await openReviews();
    const review = reviewOf('Աննա');
    await user.click(within(review).getByRole('button', { name: 'Hide' }));
    const form = within(review).getByRole('form', { name: 'Hide the review' });
    await user.click(within(form).getByRole('button', { name: 'Hide the review' }));
    const reason = within(form).getByLabelText(/^Reason the restaurant will see/u);
    expect(within(form).getByText('Write why you are hiding the review')).toBeTruthy();
    expect(document.activeElement).toBe(reason);
    expect(reason.getAttribute('aria-invalid')).toBe('true');

    await user.click(within(form).getByRole('radio', { name: 'Personal details' }));
    expect((reason as HTMLTextAreaElement).value).toBe('Personal details');
    await user.click(within(form).getByRole('button', { name: 'Hide the review' }));

    expect(await screen.findByText("Աննա Պ.'s review was hidden")).toBeTruthy();
    await waitFor(() => expect(within(reviewOf('Աննա')).getByText('Hidden')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(within(reviewOf('Աննա')).queryByText('Hidden')).toBeNull());
  });

  it('cancels the hide with Escape, back on the Hide button', async () => {
    const user = userEvent.setup();
    await openReviews();
    const hide = within(reviewOf('Լիլիթ')).getByRole('button', { name: 'Hide' });
    await user.click(hide);
    const form = within(reviewOf('Լիլիթ')).getByRole('form', { name: 'Hide the review' });
    // The first reason has the focus, so the keyboard starts there.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(form).getByRole('radio', { name: 'Offensive words' }),
      ),
    );
    await user.keyboard('{Escape}');
    expect(within(reviewOf('Լիլիթ')).queryByRole('form')).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(reviewOf('Լիլիթ')).getByRole('button', { name: 'Hide' }),
      ),
    );
  });

  it('shows a hidden review again, and the undo hides it with the same reason', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const visibility = vi.spyOn(gateway, 'setReviewVisibility');
    await openReviews(gateway);

    await user.click(within(reviewOf('Մարիամ')).getByRole('button', { name: 'Show again' }));
    expect(await screen.findByText("Մարիամ Ա.'s review is visible again")).toBeTruthy();
    await waitFor(() => expect(within(reviewOf('Մարիամ')).queryByText('Hidden')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(within(reviewOf('Մարիամ')).getByText('Hidden')).toBeTruthy());
    expect(visibility.mock.calls.map((call) => call[1])).toEqual([
      { hidden: false, reason: null },
      { hidden: true, reason: 'Գրված է այլ վայրի մասին' },
    ]);
  });

  it('dismisses the reports at once, and the undo brings them back', async () => {
    const user = userEvent.setup();
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const dismiss = vi.spyOn(gateway, 'dismissReviewReports');
    const restore = vi.spyOn(gateway, 'restoreReviewReports');
    await openReviews(gateway);

    await user.click(within(reviewOf('Karen')).getByRole('button', { name: 'Dismiss reports' }));
    expect(await screen.findByText(/Reports dismissed/u)).toBeTruthy();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss.mock.calls[0]?.[0]).toBe('review-seed-12');
    await waitFor(() => expect(within(reviewOf('Karen')).queryByText('2 reports')).toBeNull());
    // The Reported chip counts what the server says, once: Anna's are left.
    expect(
      within(screen.getByRole('group', { name: 'Filter' })).getByRole('button', {
        name: /^Reported\s*1/u,
      }),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(within(reviewOf('Karen')).getByText('2 reports')).toBeTruthy());
    expect(restore).toHaveBeenCalledWith('review-seed-12');
  });

  it("offers no undo for showing again what the venue hid: the platform's undo would hide it as the platform", async () => {
    const user = userEvent.setup();
    const reviews = createMockReviewStore({ seed: true });
    reviews.setVisibility({
      reviewId: 'review-seed-13',
      hidden: true,
      reason: 'Mentions a staff member by name',
      by: 'venue',
      atUtc: new Date().toISOString(),
    });
    const gateway = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin', reviews });
    const visibility = vi.spyOn(gateway, 'setReviewVisibility');
    await openReviews(gateway);

    await user.click(within(reviewOf('Լիլիթ')).getByRole('button', { name: 'Show again' }));
    expect(await screen.findByText(/review is visible again/u)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(visibility).toHaveBeenCalledTimes(1);
  });
});
