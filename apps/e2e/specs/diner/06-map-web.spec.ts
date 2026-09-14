import { expect, test } from '@playwright/test';

import { demoBranch, newApi } from '../../support/api';

/**
 * Plan E1 spec 6. On the web target the map screen is a fallback: it says the live
 * map is in the app, and still places the real branches.
 */
test('The /map web fallback renders, with the demo branch on it', async ({ page }) => {
  const api = await newApi();
  const demo = await demoBranch(api);

  await page.goto('/map');
  await expect(page.getByText('The live map opens in the app.')).toBeVisible();
  await expect(page.getByLabel(`${demo.venueName} · ${demo.branchName}`).first()).toBeVisible();

  await api.dispose();
});
