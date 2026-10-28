import { expect, test } from '@playwright/test';

import {
  branchDetail,
  branchRooms,
  demoBranch,
  newApi,
  roomPins,
  uniqueTag,
} from '../../support/api';
import { signInConsole } from '../../support/console';
import { env } from '../../support/env';
import { gradientPng } from '../../support/png';

/**
 * Plan E1 console spec, as the platform admin, on the demo branch through the
 * platform routes: listing fields persist; a new cover is uploaded and saved; a
 * new address and pin reach the public details; and in the rooms editor (the
 * floor-plan route) a table's pin moved with the keyboard reaches the rooms a
 * diner reads, on the same photo.
 */
test('Platform admin edits the demo branch: listing, cover, address and a table pin', async ({
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
  const listing = page.getByRole('form', { name: 'In the Time to Eat app' });
  const cuisine = `Armenian and grill ${tag}`;
  await listing.getByLabel('Cuisine').fill(cuisine);
  // Amenities are checkboxes worn as chips since the venue console redesign (phase 4).
  for (const amenity of ['Wi-Fi', 'Parking']) {
    const box = listing.getByRole('checkbox', { name: amenity, exact: true });
    await box.check();
    await expect(box).toBeChecked();
  }
  await listing.getByRole('button', { name: 'Save listing' }).click();
  await expect(listing.getByText('Listing saved', { exact: true })).toBeVisible();

  await page.reload();
  await expect(listing.getByLabel('Cuisine')).toHaveValue(cuisine);
  await expect(listing.getByRole('checkbox', { name: 'Wi-Fi', exact: true })).toBeChecked();
  await expect(listing.getByRole('checkbox', { name: 'Parking', exact: true })).toBeChecked();
  await expect
    .poll(async () => (await branchDetail(api, demo.branchId)).listing.cuisine)
    .toBe(cuisine);

  // --- Cover: a new picture is uploaded and saved ------------------------------------
  // The page-and-booking form, named by its heading since the redesign (phase 4).
  const coverCard = page.getByRole('form', { name: 'Page and booking' });
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
  await expect(coverCard.getByText('Saved', { exact: true })).toBeVisible();

  // --- Address and pin: the public details follow -------------------------------------
  const address = `${tag} Test Street, Yerevan`;
  await listing.getByLabel('Street address').fill(address);
  await listing.getByLabel('Latitude').fill('40.1812');
  await listing.getByLabel('Longitude').fill('44.5136');
  await listing.getByRole('button', { name: 'Save listing' }).click();
  await expect(listing.getByText('Listing saved', { exact: true })).toBeVisible();

  await expect
    .poll(async () => (await branchDetail(api, demo.branchId)).listing.address, { timeout: 30_000 })
    .toBe(address);

  // --- Rooms: table 1's pin, moved down with the keyboard, reaches the rooms read -----
  const before = roomPins(await branchRooms(api, demo.branchId)).find((p) => p.label === '1');
  expect(before, 'the seed pins table 1 on a room photo').toBeTruthy();
  await page.goto(`/platform/venues/${demo.venueId}/branches/${demo.branchId}/floorplan`);
  const tableOne = page.getByRole('button', { name: /^Table 1 · / });
  await tableOne.click();
  // Shift+arrow moves a pin by a twentieth of the photo; up when there is no room below.
  const key = before!.photoY <= 0.9 ? 'Shift+ArrowDown' : 'Shift+ArrowUp';
  await tableOne.press(key);
  await page.getByRole('button', { name: 'Save rooms' }).click();
  // The save is said in the console's toast (venue console phase 3).
  await expect(page.getByRole('status').getByText('Rooms saved', { exact: true })).toBeVisible();

  const expectedY = before!.photoY + (key === 'Shift+ArrowDown' ? 0.05 : -0.05);
  await expect
    .poll(async () => {
      const after = roomPins(await branchRooms(api, demo.branchId)).find((p) => p.label === '1');
      return after && after.photoId === before!.photoId
        ? Math.abs(after.photoY - expectedY) <= 0.002 &&
            Math.abs(after.photoX - before!.photoX) <= 0.002
        : false;
    })
    .toBe(true);

  await api.dispose();
});
