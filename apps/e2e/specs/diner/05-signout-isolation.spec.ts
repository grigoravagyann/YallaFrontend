import { expect, test } from '@playwright/test';

import {
  bookTable,
  demoBranch,
  localDate,
  myReservations,
  newApi,
  registerDiner,
  tableByLabel,
} from '../../support/api';
import { logIn, logInFromProfile, logOut, openTab } from '../../support/diner';

/**
 * Plan E1 spec 5. Logging out leaves Orders and Bookings signed out, and the next
 * diner on the same phone, signed in without a reload, sees nothing of the first
 * diner's bookings: the diner-scoped caches are really reset.
 *
 * "Sees nothing" means never, not "eventually". A cache that is only
 * invalidated draws the first diner's booking until the second diner's refetch
 * lands, and an auto-waiting assertion passes after that switch. So a watcher
 * on the whole document starts before the second sign-in and records whether
 * the booking code ever reaches the page, hidden screens included.
 */
test("Log out signs Orders and Bookings out, and the next diner sees none of the first diner's data", async ({
  page,
}) => {
  const api = await newApi();
  const demo = await demoBranch(api);
  const first = await registerDiner(api);
  const second = await registerDiner(api);

  const table = await tableByLabel(api, demo.branchId, '6');
  const booking = await bookTable(api, first, {
    branchId: demo.branchId,
    tableId: table.id,
    date: localDate(2),
    hours: [12, 13, 14, 15, 16],
  });

  await logIn(page, first);
  await openTab(page, 'Bookings');
  await expect(page.getByRole('button', { name: new RegExp(booking.code) })).toBeVisible();

  await logOut(page);
  await openTab(page, 'Orders');
  await expect(page.getByText('Your orders are kept on your account')).toBeVisible();
  await openTab(page, 'Bookings');
  await expect(page.getByText('Your bookings are kept under your number')).toBeVisible();
  await expect(page.getByText(booking.code)).toHaveCount(0);

  const leakedAtStart = await page.evaluate((code) => {
    const flags = window as unknown as { __firstDinerCodeSeen?: boolean };
    flags.__firstDinerCodeSeen = document.body.textContent?.includes(code) ?? false;
    new MutationObserver((_, observer) => {
      if (document.body.textContent?.includes(code)) {
        flags.__firstDinerCodeSeen = true;
        observer.disconnect();
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    return flags.__firstDinerCodeSeen;
  }, booking.code);
  expect(leakedAtStart, 'the booking code is already on the page after log out').toBe(false);

  const secondDinersBookings = page.waitForResponse(
    (response) =>
      response.url().includes('/api/reservations/mine') &&
      response.request().method() === 'GET' &&
      response.ok(),
  );
  await logInFromProfile(page, second);
  await openTab(page, 'Bookings');
  await secondDinersBookings;
  await expect(page.getByText('No bookings yet')).toBeVisible();
  await expect(page.getByText(booking.code)).toHaveCount(0);

  const seen = await page.evaluate(
    () => (window as unknown as { __firstDinerCodeSeen?: boolean }).__firstDinerCodeSeen,
  );
  expect(seen, "the first diner's booking code was drawn for the second diner").toBe(false);
  expect(await myReservations(api, second)).toHaveLength(0);

  await api.dispose();
});
