import { expect, test } from '@playwright/test';

import { branchDetail, demoBranch, newApi, uniqueTag } from '../../support/api';
import { signInConsole } from '../../support/console';
import { env } from '../../support/env';
import { gradientPng } from '../../support/png';

/**
 * Plan E1 console spec, as the platform admin, on the demo branch's public page
 * through the platform route: listing fields persist; a new cover is uploaded
 * and saved; and a new address and pin reach the public details. (Table pins
 * moved to the rooms editor, on room photos.)
 */
test('Platform admin edits the demo branch public page: listing, cover and address', async ({
  page,
}) => {
  const api = await newApi();
  const demo = await demoBranch(api);
  const tag = uniqueTag();

  await signInConsole(page, env.adminEmail(), env.adminPassword());
  await page.goto(`/platform/venues/${demo.venueId}`);
  await page.getByRole('link', { name: 'Public page' }).first().click();
  await page.waitForURL(`**/platform/venues/${demo.venueId}/branches/${demo.branchId}/public`);

  // --- Listing: cuisine and amenities survive a reload --------------------------------
  const listing = page.getByRole('form', { name: 'In the Yalla app' });
  const cuisine = `Armenian and grill ${tag}`;
  await listing.getByLabel('Cuisine').fill(cuisine);
  for (const amenity of ['Wi-Fi', 'Parking']) {
    const chip = listing.getByRole('button', { name: amenity, exact: true });
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  }
  await listing.getByRole('button', { name: 'Save listing' }).click();
  await expect(listing.getByText('Listing saved.')).toBeVisible();

  await page.reload();
  await expect(listing.getByLabel('Cuisine')).toHaveValue(cuisine);
  await expect(listing.getByRole('button', { name: 'Wi-Fi', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(listing.getByRole('button', { name: 'Parking', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(async () => (await branchDetail(api, demo.branchId)).listing.cuisine)
    .toBe(cuisine);

  // --- Cover: a new picture is uploaded and saved ------------------------------------
  const coverCard = page
    .locator('form')
    .filter({ has: page.getByRole('heading', { name: 'Cover photo' }) });
  await coverCard.locator('input[type="file"]').setInputFiles({
    name: `cover-${tag}.png`,
    mimeType: 'image/png',
    buffer: gradientPng(1200, 900, [31, 79, 204]),
  });
  // Choosing a file only previews it; "Use this" is what uploads it.
  const uploaded = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/branches/${demo.branchId}/photos`) &&
      response.request().method() === 'POST',
  );
  await coverCard.getByRole('button', { name: 'Use this' }).click();
  const upload = await uploaded;
  expect(upload.ok(), 'the cover upload is accepted').toBe(true);
  const uploadBody = (await upload.json()) as { photoId?: string; photo?: { photoId: string } };
  const newCoverId = uploadBody.photo?.photoId ?? uploadBody.photoId;
  expect(newCoverId, 'the upload answers with the new photo id').toBeTruthy();

  const savedProfile = page.waitForRequest(
    (request) => request.url().endsWith('/public-profile') && request.method() === 'PUT',
  );
  await coverCard.getByRole('button', { name: 'Save', exact: true }).click();
  expect(
    ((await savedProfile).postDataJSON() as { coverPhotoId?: string }).coverPhotoId,
    'the public-profile save sends the uploaded cover',
  ).toBe(newCoverId);
  await expect(coverCard.getByText('Saved.', { exact: true })).toBeVisible();

  // --- Address and pin: the public details follow -------------------------------------
  const address = `${tag} Test Street, Yerevan`;
  await listing.getByLabel('Street address').fill(address);
  await listing.getByLabel('Latitude').fill('40.1812');
  await listing.getByLabel('Longitude').fill('44.5136');
  await listing.getByRole('button', { name: 'Save listing' }).click();
  await expect(listing.getByText('Listing saved.')).toBeVisible();

  await expect
    .poll(async () => (await branchDetail(api, demo.branchId)).listing.address, { timeout: 30_000 })
    .toBe(address);

  await api.dispose();
});
