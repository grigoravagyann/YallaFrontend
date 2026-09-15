import { expect, test } from '@playwright/test';

import { dinerMe, newApi, registerDiner } from '../../support/api';
import { logIn, logOut } from '../../support/diner';
import { gradientPng } from '../../support/png';

/**
 * Plan E1 spec 7. The avatar goes up through the browser's file input (what
 * expo-image-picker opens on web). After logging out and signing in again from a
 * fresh load, Profile shows the stored photo, and its <img> really decodes.
 */
test('An avatar uploaded through the file input shows, and decodes, after signing in again', async ({
  page,
}) => {
  const api = await newApi();
  const diner = await registerDiner(api);

  await logIn(page, diner);
  await page.getByRole('button', { name: 'Edit profile' }).click();
  await page.getByRole('button', { name: 'Change photo' }).click();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose from library' }).click();
  const uploaded = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/diner/me/photo') && response.request().method() === 'POST',
  );
  await (
    await chooser
  ).setFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: gradientPng(640, 640) });
  expect((await uploaded).status(), 'the photo upload is accepted').toBeLessThan(300);

  const me = await dinerMe(api, diner);
  expect(me.photo?.thumbnailUrl, 'the account has a photo').toBeTruthy();
  const photoPath = new URL(me.photo!.thumbnailUrl, 'http://placeholder').pathname.replace(
    /\/[^/]+$/,
    '',
  );

  await logOut(page);
  await logIn(page, diner);

  await expect
    .poll(
      () =>
        page.evaluate(
          (path) =>
            Array.from(document.images).some(
              (image) => image.src.includes(path) && image.complete && image.naturalWidth > 0,
            ),
          photoPath,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);

  await api.dispose();
});
