import { expect, test } from '@playwright/test';

import {
  demoBranch,
  managerSession,
  newApi,
  openTab as openTableTab,
  postReview,
  registerDiner,
  tableByLabel,
  uniqueTag,
  venueReviews,
} from '../../support/api';
import { logIn, openTab } from '../../support/diner';

/**
 * Addendum, review moderation: the diner side. A diner who sat at table 3 reviews
 * the branch. A second diner, signed in, opens the place's reviews, taps Report on
 * that review, picks a reason and sends it. The server takes it (204) and the
 * venue's moderation list counts one report.
 */
test("A diner reports another diner's review, and the venue's list counts the report", async ({
  page,
}) => {
  const api = await newApi();
  const demo = await demoBranch(api);

  const author = await registerDiner(api);
  await openTableTab(api, author, (await tableByLabel(api, demo.branchId, '3')).qrToken);
  const text = `Report check ${uniqueTag()}: call this number for cheap flights.`;
  const { reviewId } = await postReview(api, author, demo.branchId, { rating: 1, text });

  const reporter = await registerDiner(api, { verified: false });
  await logIn(page, reporter);
  await openTab(page, 'Explore');
  await page
    .getByRole('button', { name: new RegExp(`^${demo.venueName}`) })
    .first()
    .click();
  await page.waitForURL(`**/place/${demo.branchId}`);
  await page.getByRole('tab', { name: 'Reviews' }).click();

  const review = page.getByText(text, { exact: true });
  await expect(review).toBeVisible();
  // The innermost block holding both this review's text and a Report button is its card.
  // The button's name starts with its icon glyph, hence the pattern.
  const report = page.getByRole('button', { name: /Report$/ });
  const card = page.locator('div').filter({ has: review }).filter({ has: report }).last();
  await card.getByRole('button', { name: /Report$/ }).click();

  await expect(page.getByText('Report this review')).toBeVisible();
  await page.getByRole('radio', { name: 'Spam or advertising' }).click();
  const sent = page.waitForResponse((response) =>
    response.url().includes(`/api/diner/reviews/${reviewId}/report`),
  );
  await page.getByRole('button', { name: 'Send report' }).click();
  expect((await sent).status()).toBe(204);
  await expect(page.getByText('Thanks. Your report was sent.')).toBeVisible();

  const manager = await managerSession(api);
  await expect
    .poll(
      async () =>
        (await venueReviews(api, manager.accessToken, demo.branchId, 'reported')).find(
          (item) => item.reviewId === reviewId,
        )?.reportCount,
    )
    .toBe(1);

  await api.dispose();
});
