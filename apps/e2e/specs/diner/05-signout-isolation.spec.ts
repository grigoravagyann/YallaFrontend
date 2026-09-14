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

  await logInFromProfile(page, second);
  await openTab(page, 'Bookings');
  await expect(page.getByText('No bookings yet')).toBeVisible();
  await expect(page.getByText(booking.code)).toHaveCount(0);
  expect(await myReservations(api, second)).toHaveLength(0);

  await api.dispose();
});
