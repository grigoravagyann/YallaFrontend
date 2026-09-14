import { expect, test } from '@playwright/test';

import { demoBranch, favorites, newApi, registerDiner } from '../../support/api';
import { logIn, logOut, openTab } from '../../support/diner';

/**
 * Addendum K11. A heart tapped while signed in is saved to the account: it is in
 * the API at once, and after logging out and signing in again from a fresh load
 * (nothing left on this "phone"), Favorites lists the place from the server.
 */
test('A favourite saved while signed in is still there after logging out and in again', async ({
  page,
}) => {
  const api = await newApi();
  const demo = await demoBranch(api);
  const diner = await registerDiner(api, { verified: false });

  await logIn(page, diner);
  await openTab(page, 'Explore');
  await page
    .getByRole('button', { name: new RegExp(`^${escapeRegExp(demo.venueName)}`) })
    .first()
    .click();
  await page.waitForURL(`**/place/${demo.branchId}`);

  const saved = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/diner/favorites/${demo.branchId}`) &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save to favorites' }).first().click();
  expect((await saved).status()).toBe(204);
  await expect(page.getByRole('button', { name: 'Remove from favorites' }).first()).toBeVisible();
  expect(await favorites(api, diner)).toContain(demo.branchId);

  await logOut(page);
  await logIn(page, diner);

  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(
    page.getByRole('button', { name: new RegExp(escapeRegExp(demo.venueName)) }).first(),
  ).toBeVisible();

  await api.dispose();
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
