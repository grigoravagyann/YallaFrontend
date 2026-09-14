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
  await page.getByRole('button', { name: 'Reported', exact: true }).click();

  const row = page.getByRole('listitem').filter({ hasText: text });
  await expect(row.getByText('1 report', { exact: true })).toBeVisible();

  await row.getByRole('button', { name: 'Hide', exact: true }).click();
  await row.getByLabel('Reason').fill('Advertising, reported by a diner');
  await row.getByRole('button', { name: 'Hide', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Show again' })).toBeVisible();

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
