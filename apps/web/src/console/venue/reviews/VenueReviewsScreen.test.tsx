// @vitest-environment jsdom
import { createConsoleMockGateway, type ConsoleGateway } from '@yalla/api';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../ui/toast';
import { createConsoleHarness, initConsoleTestI18n } from '../reports/testHarness';
import { VenueReviewsScreen } from './VenueReviewsScreen';

/**
 * Reviews for an owner, general manager or branch manager (venue console
 * Reviews artboard): filters with the branch's counts, the venue's reply,
 * hiding with a required reason, undo, and Yalla's takedowns locked.
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
    branchName: 'North',
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
            <Route path="reviews" element={<VenueReviewsScreen />} />
          </Route>
        </Routes>
      </ToastProvider>,
      '/venue/reviews',
    ),
  );
}

const owner = () => createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
const reviewOf = (text: RegExp) => screen.getByText(text).closest('article') as HTMLElement;
const filters = () => screen.getByRole('group', { name: 'Filter' });
const filter = (name: RegExp) => within(filters()).getByRole('button', { name });

describe('the list', () => {
  it("filters with the branch's counts, and puts the reported ones first", async () => {
    const user = userEvent.setup();
    renderReviews(owner());

    await screen.findByText(/quick coffee/i);
    expect(filter(/^All\s*3$/u).getAttribute('aria-pressed')).toBe('true');
    expect(filter(/^Reported\s*1$/u)).toBeTruthy();
    expect(filter(/^Hidden\s*1$/u)).toBeTruthy();
    const articles = screen.getAllByRole('article');
    expect(within(articles[0]!).getByText('2 reports')).toBeTruthy();
    expect(within(reviewOf(/quick coffee/i)).queryByText(/report/i)).toBeNull();
    // The stars are read out as one image with its words, not five glyphs.
    expect(
      within(reviewOf(/quick coffee/i)).getByRole('img', { name: '5 stars out of 5' }),
    ).toBeTruthy();

    await user.click(filter(/^Reported/u));
    await waitFor(() => expect(screen.queryByText(/quick coffee/i)).toBeNull());
    expect(screen.getByText(/a long wait/i)).toBeTruthy();

    await user.click(filter(/^Hidden/u));
    await screen.findByText(/hidden by the venue\./i);
    expect(screen.queryByText(/a long wait/i)).toBeNull();
    // Why it was hidden, and by whom.
    const hidden = reviewOf(/hidden by the venue\./i);
    expect(
      within(hidden).getByText(/Not about this venue\. · Hidden by the venue, /u),
    ).toBeTruthy();
  });

  it('sums the visible reviews up beside the list, with the change over thirty days', async () => {
    const gateway = owner();
    const list = gateway.listVenueBranchReviews.bind(gateway);
    vi.spyOn(gateway, 'listVenueBranchReviews').mockImplementation(async (branchId, query) => {
      const page = await list(branchId, query);
      return { ...page, summary: { ...page.summary!, ratingChange30Days: 0.2 } };
    });
    renderReviews(gateway);

    const summary = await screen.findByRole('region', { name: 'Rating' });
    expect(await within(summary).findByText('3.5')).toBeTruthy();
    expect(within(summary).getByText('from 2 visible reviews')).toBeTruthy();
    expect(within(summary).getByText('↑ 0.2 in the last 30 days')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'When to hide' })).toBeTruthy();
  });
});

describe('hiding', () => {
  it('asks why, with the cursor on the reason, sends it, and the toast takes it back', async () => {
    const gateway = owner();
    const visibility = vi.spyOn(gateway, 'setVenueReviewVisibility');
    const user = userEvent.setup();
    renderReviews(gateway);

    await screen.findByText(/quick coffee/i);
    await user.click(within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Hide' }));
    const form = within(reviewOf(/quick coffee/i)).getByRole('form', { name: 'Hide the review' });
    await user.click(within(form).getByRole('button', { name: 'Hide the review' }));

    const reason = within(form).getByLabelText(/^Reason/u);
    expect(within(form).getByText('Write why you are hiding the review')).toBeTruthy();
    expect(document.activeElement).toBe(reason);
    expect(reason.getAttribute('aria-invalid')).toBe('true');
    expect(visibility).not.toHaveBeenCalled();

    await user.click(within(form).getByRole('radio', { name: 'Advertising or spam' }));
    await user.click(within(form).getByRole('button', { name: 'Hide the review' }));

    await waitFor(() =>
      expect(visibility).toHaveBeenCalledWith('b-lumen-north', 'review-seed-1', {
        hidden: true,
        reason: 'Advertising or spam',
      }),
    );
    expect(await screen.findByText(/review was hidden/u)).toBeTruthy();
    await waitFor(() =>
      expect(
        within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Show again' }),
      ).toBeTruthy(),
    );

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Hide' })).toBeTruthy(),
    );
    expect(visibility).toHaveBeenLastCalledWith('b-lumen-north', 'review-seed-1', {
      hidden: false,
      reason: null,
    });
  });

  it('cancels with Escape, back on the Hide button', async () => {
    const user = userEvent.setup();
    renderReviews(owner());

    await screen.findByText(/quick coffee/i);
    await user.click(within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Hide' }));
    const form = within(reviewOf(/quick coffee/i)).getByRole('form', { name: 'Hide the review' });
    // The first reason has the focus, so the keyboard starts there.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(form).getByRole('radio', { name: 'Offensive words' }),
      ),
    );
    await user.keyboard('{Escape}');
    expect(within(reviewOf(/quick coffee/i)).queryByRole('form')).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Hide' }),
      ),
    );
  });

  it('shows again a review the venue hid', async () => {
    const gateway = owner();
    const visibility = vi.spyOn(gateway, 'setVenueReviewVisibility');
    const user = userEvent.setup();
    renderReviews(gateway);

    await screen.findByText(/quick coffee/i);
    await user.click(filter(/^Hidden/u));
    await screen.findByText(/hidden by the venue\./i);
    await user.click(
      within(reviewOf(/hidden by the venue\./i)).getByRole('button', { name: 'Show again' }),
    );

    await waitFor(() =>
      expect(visibility).toHaveBeenCalledWith('b-lumen-north', 'review-seed-3', {
        hidden: false,
        reason: null,
      }),
    );
    expect(await screen.findByText('No review matches the filter.')).toBeTruthy();
  });

  it('shows a review the SHURJ team hid as locked, with no reply and no way back', async () => {
    const gateway = owner();
    const visibility = vi.spyOn(gateway, 'setVenueReviewVisibility');
    const user = userEvent.setup();
    renderReviews(gateway, 'b-lumen-cascade');

    await user.click(
      await within(await screen.findByRole('group', { name: 'Filter' })).findByRole('button', {
        name: /^Hidden/u,
      }),
    );
    await screen.findByText(/hidden by the platform\./i);

    const row = reviewOf(/hidden by the platform\./i);
    expect(
      within(row).getByText('Hidden by the SHURJ team. Only they can bring it back.'),
    ).toBeTruthy();
    expect(within(row).getByText(/· SHURJ team, /u)).toBeTruthy();
    expect(within(row).queryByRole('button', { name: 'Show again' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(visibility).not.toHaveBeenCalled();
  });

  it('locks a row once the server refuses to show it again, when the list was read before Yalla hid it', async () => {
    const gateway = owner();
    const list = gateway.listVenueBranchReviews.bind(gateway);
    // The list as read a moment before the platform's takedown: not yet flagged.
    vi.spyOn(gateway, 'listVenueBranchReviews').mockImplementation(async (branchId, query) => {
      const page = await list(branchId, query);
      return { ...page, items: page.items.map((item) => ({ ...item, hiddenByPlatform: false })) };
    });
    const user = userEvent.setup();
    renderReviews(gateway, 'b-lumen-cascade');

    await user.click(
      await within(await screen.findByRole('group', { name: 'Filter' })).findByRole('button', {
        name: /^Hidden/u,
      }),
    );
    await screen.findByText(/hidden by the platform\./i);
    await user.click(
      within(reviewOf(/hidden by the platform\./i)).getByRole('button', { name: 'Show again' }),
    );

    const row = reviewOf(/hidden by the platform\./i);
    await within(row).findByText('Hidden by the SHURJ team. Only they can bring it back.');
    expect(within(row).queryByRole('button', { name: 'Show again' })).toBeNull();
    // Locked, not failed: no "try again" alert.
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the reply', () => {
  it('is published signed by its writer, and the undo takes a first reply down', async () => {
    const gateway = owner();
    const reply = vi.spyOn(gateway, 'replyToReview');
    const remove = vi.spyOn(gateway, 'removeReviewReply');
    const user = userEvent.setup();
    renderReviews(gateway);

    await screen.findByText(/quick coffee/i);
    await user.click(within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Reply' }));
    const form = within(reviewOf(/quick coffee/i)).getByRole('form', {
      name: 'Reply to the review',
    });
    const field = within(form).getByLabelText(/^Reply to the guest/u);
    expect(document.activeElement).toBe(field);
    // Said before it is published: public, and signed with the name and role.
    expect(
      within(form).getByText(/Public: everyone sees it under the review, signed “.+, Owner”\./u),
    ).toBeTruthy();

    // Required.
    await user.click(within(form).getByRole('button', { name: 'Publish the reply' }));
    expect(within(form).getByText('Write the reply')).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(reply).not.toHaveBeenCalled();

    await user.type(field, '  Thank you, come again!  ');
    await user.click(within(form).getByRole('button', { name: 'Publish the reply' }));
    await waitFor(() =>
      expect(reply).toHaveBeenCalledWith(
        'b-lumen-north',
        'review-seed-1',
        'Thank you, come again!',
      ),
    );
    expect(
      await screen.findByText('The reply is published · the guest will get a notification'),
    ).toBeTruthy();
    const row = reviewOf(/quick coffee/i);
    await within(row).findByText('Thank you, come again!');
    expect(within(row).getByText(/^Reply from .+, Owner$/u)).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Change the reply' }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('b-lumen-north', 'review-seed-1'));
    await waitFor(() =>
      expect(within(reviewOf(/quick coffee/i)).queryByText('Thank you, come again!')).toBeNull(),
    );
  });

  it('is changed in place, and the undo puts the words before back', async () => {
    const gateway = owner();
    await gateway.replyToReview('b-lumen-north', 'review-seed-1', 'Thanks!');
    const reply = vi.spyOn(gateway, 'replyToReview');
    const user = userEvent.setup();
    renderReviews(gateway);

    await screen.findByText('Thanks!');
    await user.click(
      within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Change the reply' }),
    );
    const field = within(reviewOf(/quick coffee/i)).getByLabelText(/^Reply to the guest/u);
    expect((field as HTMLTextAreaElement).value).toBe('Thanks!');
    await user.clear(field);
    await user.type(field, 'Thank you, Test!');
    await user.click(
      within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Publish the reply' }),
    );

    // An edit tells nobody: only a first reply notifies the reviewer.
    expect(await screen.findByText('The reply is changed')).toBeTruthy();
    await within(reviewOf(/quick coffee/i)).findByText('Thank you, Test!');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(reply).toHaveBeenLastCalledWith('b-lumen-north', 'review-seed-1', 'Thanks!'),
    );
    await within(reviewOf(/quick coffee/i)).findByText('Thanks!');
  });

  it("changes, and never takes down, a colleague's reply the list had not shown yet", async () => {
    const gateway = owner();
    const remove = vi.spyOn(gateway, 'removeReviewReply');
    const user = userEvent.setup();
    renderReviews(gateway);

    await screen.findByText(/quick coffee/i);
    // A colleague answers after this list was read: it still offers "Reply".
    await gateway.replyToReview('b-lumen-north', 'review-seed-1', 'Thanks from the floor!');
    await user.click(within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Reply' }));
    await user.type(
      within(reviewOf(/quick coffee/i)).getByLabelText(/^Reply to the guest/u),
      'Thank you!',
    );
    await user.click(
      within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Publish the reply' }),
    );

    // The server says it changed a reply: not "published", no notification
    // promised, and no undo that would delete the colleague's words.
    expect(await screen.findByText('The reply is changed')).toBeTruthy();
    expect(screen.queryByText(/the guest will get a notification/u)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    await within(reviewOf(/quick coffee/i)).findByText('Thank you!');
    expect(remove).not.toHaveBeenCalled();
  });

  it('closes the form when the review was hidden in the meantime, and says so', async () => {
    const gateway = owner();
    const user = userEvent.setup();
    renderReviews(gateway);

    await screen.findByText(/quick coffee/i);
    await user.click(within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Reply' }));
    // Hidden by somebody else while the reply was being written.
    await gateway.setVenueReviewVisibility('b-lumen-north', 'review-seed-1', {
      hidden: true,
      reason: 'Spam',
    });
    await user.type(
      within(reviewOf(/quick coffee/i)).getByLabelText(/^Reply to the guest/u),
      'Thank you!',
    );
    await user.click(
      within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Publish the reply' }),
    );

    expect((await screen.findByRole('alert')).textContent).toMatch(/hidden in the meantime/u);
    await waitFor(() => expect(within(reviewOf(/quick coffee/i)).queryByRole('form')).toBeNull());
    // The fresh list shows it hidden, and its own way back has the focus.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(reviewOf(/quick coffee/i)).getByRole('button', { name: 'Show again' }),
      ),
    );
  });

  it('says when the guest edited the review after it was answered', async () => {
    const gateway = owner();
    await gateway.replyToReview('b-lumen-north', 'review-seed-1', 'Thanks!');
    const list = gateway.listVenueBranchReviews.bind(gateway);
    vi.spyOn(gateway, 'listVenueBranchReviews').mockImplementation(async (branchId, query) => {
      const page = await list(branchId, query);
      return {
        ...page,
        items: page.items.map((item) =>
          item.reply ? { ...item, updatedAtUtc: '2099-01-01T00:00:00Z' } : item,
        ),
      };
    });
    renderReviews(gateway);

    await screen.findByText('Thanks!');
    expect(
      within(reviewOf(/quick coffee/i)).getByText('The guest edited the review after this reply.'),
    ).toBeTruthy();
    expect(within(reviewOf(/a long wait/i)).queryByText(/edited the review/u)).toBeNull();
  });

  it('is not offered on a hidden review', async () => {
    const user = userEvent.setup();
    renderReviews(owner());
    await screen.findByText(/quick coffee/i);
    await user.click(filter(/^Hidden/u));
    await screen.findByText(/hidden by the venue\./i);
    const row = reviewOf(/hidden by the venue\./i);
    expect(within(row).queryByRole('button', { name: 'Reply' })).toBeNull();
    expect(within(row).getByRole('button', { name: 'Show again' })).toBeTruthy();
  });
});
