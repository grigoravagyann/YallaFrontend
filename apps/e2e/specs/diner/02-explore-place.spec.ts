import { expect, test } from '@playwright/test';

import {
  branchDetail,
  demoBranch,
  newApi,
  publicBranches,
  SEED_BRANCH_SLUG,
  SEED_VENUE_SLUG,
  tableMarkers,
} from '../../support/api';

/**
 * Plan E1 spec 2. Explore shows the seeded branch from the real API and opens it
 * by the API's id; the place page draws the cover markers, the menu tab and the
 * seeded reviews; and the floor plan asks for the public branch page by slug. A
 * build on the mock data source fails at the first step: its places are not the
 * backend's.
 */
test('Explore lists the demo branch with the API id, and its place page is real', async ({
  page,
}) => {
  const api = await newApi();
  const demo = await demoBranch(api);
  const listed = (await publicBranches(api)).find((entry) => entry.branchId === demo.branchId);
  expect(listed, 'GET /api/public/branches lists the demo branch').toBeTruthy();

  await page.goto('/');
  const card = page.getByRole('button', {
    name: new RegExp(`^${demo.venueName} · ${demo.branchName}`),
  });
  await expect(card).toBeVisible();
  await card.click();
  await page.waitForURL(`**/place/${demo.branchId}`);

  // Cover markers: one button per table the API has on the cover.
  const markers = await tableMarkers(api, demo.branchId);
  expect(markers.tables.length, 'the seed pins tables on the cover').toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: /^Table \d+, / })).toHaveCount(
    markers.tables.length,
  );

  // Menu: whatever the branch has, never the load failure.
  await page.getByRole('tab', { name: 'Menu' }).click();
  await expect(page.getByText('We could not load the menu.')).toHaveCount(0);

  // Reviews: the seeded ones, as the public API returns them.
  await page.getByRole('tab', { name: 'Reviews' }).click();
  const withText = (await branchDetail(api, demo.branchId)).recentReviews.find(
    (review) => review.text,
  );
  expect(withText, 'the seed has reviews with text').toBeTruthy();
  await expect(page.getByText(withText!.text!, { exact: true })).toBeVisible();

  // The floor plan asks the public branch page by slug, not by id.
  const slugRequest = page.waitForRequest((request) =>
    request.url().includes(`/api/public/branches/${SEED_VENUE_SLUG}/${SEED_BRANCH_SLUG}`),
  );
  await page.getByRole('button', { name: 'Floor plan' }).click();
  await slugRequest;
  await expect(page.getByRole('heading', { name: demo.branchName })).toBeVisible();

  await api.dispose();
});
