import { expect, test } from '@playwright/test';

import {
  demoBranch,
  newApi,
  publicReviews,
  registerDiner,
  tableByLabel,
  uniqueTag,
} from '../../support/api';
import { goInApp, logIn } from '../../support/diner';

/**
 * Plan E1 spec 4. A signed-in diner follows the seeded table's code link
 * (`/t/<code>`, what the QR sticker encodes), which opens a tab: a visit. Then the
 * place's Reviews tab takes a review, and after a full load (which signs the web
 * build out) the review is on the page for anyone.
 *
 * Two things have to hold in the app for this, and each has its own message:
 * the scan must actually go out from the web build, and it must carry the diner's
 * session, because review eligibility (K8) counts a tab place only when its
 * participant is linked to the account.
 */
test('A table code opens a tab while signed in, and the review written after it survives a reload', async ({
  page,
}) => {
  const api = await newApi();
  const demo = await demoBranch(api);
  const diner = await registerDiner(api);
  const table = await tableByLabel(api, demo.branchId, '2');

  await logIn(page, diner);

  const scan = page
    .waitForRequest(
      (request) => request.url().endsWith('/api/tabs/open') && request.method() === 'POST',
    )
    .catch(() => null);
  const gaveUp = page
    .getByText('That link did not work')
    .waitFor({ state: 'visible' })
    .then(() => true)
    .catch(() => false);
  await goInApp(page, `/t/${encodeURIComponent(table.qrToken)}`);

  const outcome = await Promise.race([
    scan.then((request) => (request ? 'sent' : 'nothing')),
    gaveUp.then((shown) => (shown ? 'gave up before sending' : 'nothing')),
  ]);
  expect(
    outcome,
    'the /t/<code> link sends POST /api/tabs/open. On the web build the scan needs a device id, ' +
      'and apps/diner/src/lib/deviceId.ts keeps it in expo-secure-store, which has no web implementation.',
  ).toBe('sent');

  const request = (await scan)!;
  expect(
    request.headers()['authorization'],
    'the table scan carries the signed-in diner session; without it the tab place is anonymous ' +
      'and the visit does not make the diner eligible to review (K8).',
  ).toMatch(/^Bearer /);
  expect((await request.response())?.ok(), 'POST /api/tabs/open succeeds').toBe(true);

  await page.waitForURL(/\/tab\/[^/]+/);
  await expect(page.getByText(`Table ${table.label}`).first()).toBeVisible();

  await goInApp(page, `/place/${demo.branchId}`);
  await page.getByRole('tab', { name: 'Reviews' }).click();

  const text = `Tab visit ${uniqueTag()}: quick service and a warm welcome.`;
  await page.getByRole('button', { name: '5 of 5 stars' }).click();
  await page.getByLabel('What was it like? (optional)').fill(text);
  const posted = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/diner/branches/${demo.branchId}/review`) &&
      response.request().method() !== 'GET',
  );
  await page.getByRole('button', { name: 'Post review' }).click();
  expect(
    (await posted).status(),
    'the review is accepted: the tab opened from the table code counts as a visit',
  ).toBeLessThan(300);
  await expect(page.getByText('Thanks, your review is posted.')).toBeVisible();

  // A full load: the web build is signed out now, so this is what anybody sees.
  await page.goto(`/place/${demo.branchId}`);
  await page.getByRole('tab', { name: 'Reviews' }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  expect((await publicReviews(api, demo.branchId)).map((review) => review.text)).toContain(text);

  await api.dispose();
});
