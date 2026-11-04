import { expect, test } from '@playwright/test';

import {
  SEED_BRANCH_SLUG,
  SEED_VENUE_SLUG,
  newApi,
  publicBooking,
  testPhone,
  uniqueTag,
} from '../../support/api';

/**
 * A stranger books from the venue's public page, with no app and no account:
 * tomorrow, two guests, a table the room chooses, a phone proved by the code
 * (Development returns it in the response, so the spec reads it from there as
 * the diner specs do), a name, and the "All set" screen with a manage link.
 * The link is then read through the public API, which is what the guest's
 * later visit to it does.
 *
 * The page is the console's build at `/{venue}/{branch}`: `main.tsx` picks the
 * public bundle by path, so this also guards that split against the real server.
 */
test('A guest books tomorrow from the public page, proving the phone by code', async ({ page }) => {
  const api = await newApi();
  const guestName = `Guest ${uniqueTag()}`;
  const phone = testPhone();

  await page.goto(`/${SEED_VENUE_SLUG}/${SEED_BRANCH_SLUG}`);
  const booking = page.getByRole('region', { name: 'Book a table' });
  await expect(booking).toBeVisible();

  // Tomorrow, so the day has every time free: tonight may already be past its
  // last bookable slot. Two guests is the stepper's starting value.
  await booking.getByRole('button', { name: /^Tomorrow, /u }).click();
  // The times are shown by part of the day; seven is in the evening's.
  await booking.getByRole('button', { name: 'Evening', exact: true }).click();
  const seven = booking.getByRole('button', { name: '19:00', exact: true });
  await expect(seven).toBeVisible();
  await expect(seven).not.toHaveAttribute('aria-disabled', 'true');
  await seven.click();

  // The room either lets the guest tap a table on the photo and offers to
  // choose instead, or - with tables switched off - books by time alone.
  const chooseForMe = booking.getByRole('button', { name: 'Choose for me', exact: true });
  const byTime = booking.getByRole('button', { name: 'Book for 19:00', exact: true });
  await expect(chooseForMe.or(byTime)).toBeVisible();
  if (await chooseForMe.isVisible()) {
    await chooseForMe.click();
    await booking.getByRole('button', { name: /^Book table /u }).click();
  } else {
    await byTime.click();
  }

  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  // The promise to free the table in time is asked only when the venue has a
  // window; tick it when it is there.
  const promise = sheet.getByRole('checkbox', { name: /^I will free the table by /u });
  if (await promise.isVisible()) await promise.click();
  await sheet.getByRole('button', { name: 'Continue', exact: true }).click();

  // The phone step. The field takes the local part; the prefix is Armenia's.
  await expect(sheet.getByRole('heading', { level: 2, name: 'Your phone' })).toBeVisible();
  await sheet.getByLabel('Phone number').fill(phone.replace(/^\+374/u, ''));
  const issued = page.waitForResponse(
    (response) =>
      response.url().includes('/request-code') && response.request().method() === 'POST',
  );
  await sheet.getByRole('button', { name: 'Get a code by SMS', exact: true }).click();
  const { developmentCode } = (await (await issued).json()) as { developmentCode?: string };
  expect(developmentCode, 'Development returns the code').toBeTruthy();
  await sheet.getByLabel('Code').fill(developmentCode!);

  // The name, and the booking.
  await sheet.getByLabel('Name for the booking').fill(guestName);
  await sheet.getByRole('button', { name: /^(Confirm booking|Request table)/u }).click();

  // Confirmed at once, or sent for the venue to confirm: either way the guest
  // gets a code and a link that works without an account.
  const done = sheet.getByRole('heading', { level: 2, name: 'All set' });
  const requested = sheet.getByRole('heading', { level: 3, name: 'Request sent' });
  await expect(done.or(requested)).toBeVisible();
  const link = sheet.getByRole('link', { name: /\/booking\//u });
  await expect(link).toBeVisible();
  const token = (await link.getAttribute('href'))
    ?.split('/booking/')
    .pop()
    ?.replace(/[/?#].*$/u, '');
  expect(token, 'the manage link carries the booking token').toBeTruthy();

  const stored = await publicBooking(api, token!);
  expect(stored.partySize).toBe(2);
  expect(stored.localStartTime.startsWith('19:00')).toBe(true);
  await expect(sheet.getByText(stored.code, { exact: true })).toBeVisible();

  await api.dispose();
});
