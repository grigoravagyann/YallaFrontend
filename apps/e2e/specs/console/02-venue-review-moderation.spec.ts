import { expect, test } from '@playwright/test';

import {
  demoBranch,
  managerSession,
  newApi,
  openTab,
  postReview,
  publicReviews,
  registerDiner,
  reportReview,
  tableByLabel,
  uniqueTag,
  venueReviews,
} from '../../support/api';
import { signInConsole } from '../../support/console';

/**
 * Addendum, review moderation: the venue side. A diner who sat at a table reviews
 * the branch, another diner reports it, and the branch manager hides it from the
 * console's Reviews screen with a reason. The public list stops showing it.
 */
test('The branch manager hides a reported review with a reason, and the public list drops it', async ({
  page,
}) => {
  const api = await newApi();
  const demo = await demoBranch(api);

  const author = await registerDiner(api);
  await openTab(api, author, (await tableByLabel(api, demo.branchId, '4')).qrToken);
  const text = `Moderation check ${uniqueTag()}: came for coffee, left with a leaflet.`;
  const { reviewId } = await postReview(api, author, demo.branchId, { rating: 2, text });

  const reporter = await registerDiner(api, { verified: false });
  await reportReview(api, reporter, reviewId, 'spam');

  const manager = await managerSession(api);
  await signInConsole(page, manager.email, manager.password);

  await page.getByRole('link', { name: 'Reviews', exact: true }).click();
  // The filters carry the branch's counts since the venue console redesign
  // (phase 4): "Reported 1", not "Reported".
  const filters = page.getByRole('group', { name: 'Filter' });
  await filters.getByRole('button', { name: /^Reported/u }).click();

  // Each review is an article since the redesign, no longer a list item.
  const row = page.getByRole('article').filter({ hasText: text });
  await expect(row.getByText('1 report', { exact: true })).toBeVisible();

  await row.getByRole('button', { name: 'Hide', exact: true }).click();
  await row.getByRole('textbox', { name: 'Reason' }).fill('Advertising, reported by a diner');
  await row.getByRole('button', { name: 'Hide the review', exact: true }).click();
  // Hidden, it is no longer "reported" (the server lists only visible reviews
  // with open reports there): it leaves this list…
  await expect(row).toHaveCount(0);
  // …and is under Hidden, with the reason the venue gave and the way back.
  await filters.getByRole('button', { name: /^Hidden/u }).click();
  const hiddenRow = page.getByRole('article').filter({ hasText: text });
  await expect(hiddenRow.getByText(/Advertising, reported by a diner · Hidden by /u)).toBeVisible();
  await expect(hiddenRow.getByRole('button', { name: 'Show again' })).toBeVisible();
  // A hidden review takes no reply (VC4 wire §1).
  await expect(hiddenRow.getByRole('button', { name: 'Reply' })).toHaveCount(0);

  await expect
    .poll(async () =>
      (await venueReviews(api, manager.accessToken, demo.branchId, 'hidden')).map(
        (r) => r.reviewId,
      ),
    )
    .toContain(reviewId);
  await expect
    .poll(async () => (await publicReviews(api, demo.branchId)).map((r) => r.reviewId))
    .not.toContain(reviewId);

  await api.dispose();
});

/**
 * Venue console phase 4: the branch manager answers a review from the
 * console, and the answer is public under it, signed.
 */
test('The branch manager replies to a review, and the public list shows the reply under it', async ({
  page,
}) => {
  const api = await newApi();
  const demo = await demoBranch(api);

  const author = await registerDiner(api);
  await openTab(api, author, (await tableByLabel(api, demo.branchId, '4')).qrToken);
  const text = `Reply check ${uniqueTag()}: the terrace was lovely.`;
  const { reviewId } = await postReview(api, author, demo.branchId, { rating: 5, text });

  const manager = await managerSession(api);
  await signInConsole(page, manager.email, manager.password);
  await page.getByRole('link', { name: 'Reviews', exact: true }).click();

  const row = page.getByRole('article').filter({ hasText: text });
  await row.getByRole('button', { name: 'Reply', exact: true }).click();
  const answer = `Thank you, come again! ${uniqueTag()}`;
  await row.getByRole('textbox', { name: 'Reply to the guest' }).fill(answer);
  await row.getByRole('button', { name: 'Publish the reply' }).click();

  await expect(
    page
      .getByRole('status')
      .getByText('The reply is published · the guest will get a notification'),
  ).toBeVisible();
  await expect(row.getByText(answer, { exact: true })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Change the reply' })).toBeVisible();

  await expect
    .poll(
      async () =>
        (await publicReviews(api, demo.branchId)).find((r) => r.reviewId === reviewId)?.reply?.text,
    )
    .toBe(answer);

  await api.dispose();
});
